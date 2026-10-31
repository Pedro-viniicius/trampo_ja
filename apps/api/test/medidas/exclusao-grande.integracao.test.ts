/**
 * Medida da exclusão de uma conta grande (CA69, pré-lançamento L4, etapa 12).
 *
 * Só roda com `TRAMPOJA_MEDIR=1`; sem a variável, o arquivo é pulado e a
 * suíte de integração não paga a geração do volume. Usa só dado fictício, no
 * banco de teste, e trunca as tabelas no começo e no fim. O Vitest esconde o
 * console de teste que passa: para ver os números, acrescente `--silent=false`
 * ao comando.
 *
 * Volume de referência (plano, "Esquema e contratos"), gerado com
 * `generate_series` para uma conta só:
 * - 200 conversas com 500 mensagens cada (100 000), dos dois lados;
 * - 5 000 trampos dela, com 4 candidaturas recebidas cada (20 000);
 * - 2 000 candidaturas feitas por ela, em trampos de outras contas;
 * - 1 000 serviços e o perfil.
 * Os instantes são gerados em milissegundos inteiros (`date_trunc`), como o
 * app grava: o cursor de `/trampos/meus` supõe essa precisão.
 *
 * Mede, em `RODADAS` rodadas com o volume recriado do zero:
 * - o tempo total do `POST /contas/eu/exclusao` (inclui o scrypt da senha);
 * - o tempo da transação da exclusão, da trava da conta até a resposta (o
 *   `commit` está dentro);
 * - o tempo de cada `excluirDadosDaConta` (soma das consultas do módulo) e a
 *   consulta mais lenta, que é o que o `statement_timeout` de 10 s (D42)
 *   limita.
 * Por último, recria o volume e roda `explain (analyze, buffers)` de cada
 * consulta da transação, na mesma ordem, numa transação desfeita no fim.
 *
 * Os tempos são cronometrados por um plugin do Kysely na conexão passada à
 * composição: a transação aberta por `excluirTudo` herda o plugin, então nada
 * do código de produção muda para medir.
 */
import { performance } from 'node:perf_hooks';
import {
  CompiledQuery,
  type Kysely,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryId,
  type QueryResult,
  type RootOperationNode,
  sql,
  type UnknownRow,
} from 'kysely';
import { describe, expect, it } from 'vitest';
import type { BancoBase } from '../../src/compartilhado/banco/conexao.js';
import { type Aplicacao, montarAplicacao } from '../../src/composicao.js';
import { bancoDeTeste, truncarTabelas } from '../banco-teste.js';

const MEDIR = Boolean(process.env.TRAMPOJA_MEDIR);

const TABELAS = [
  'mensagens',
  'conversas',
  'candidaturas',
  'trampos',
  'servicos',
  'perfis',
  'tentativas_de_entrada',
  'sessoes',
  'contas',
  'contas_excluidas',
];

/** Volume de referência (plano da L4, "Esquema e contratos"). */
const VOLUME = {
  conversas: 200,
  mensagensPorConversa: 500,
  trampos: 5_000,
  candidaturasPorTrampo: 4,
  candidaturasFeitas: 2_000,
  servicos: 1_000,
} as const;

const RODADAS = 3;
const SENHA = 'senha-da-medida-123';
const TEMPO_LIMITE = 600_000;

/** Uma consulta vista pelo cronômetro. */
interface Consulta {
  readonly queryId: QueryId;
  readonly node: RootOperationNode;
  readonly descricao: string;
  readonly tabelas: readonly string[];
  readonly inicio: number;
  fim?: number;
}

/** Coleta os nomes de tabela (`TableNode`) de um nó do Kysely. */
function tabelasDoNo(no: unknown, achadas = new Set<string>()): Set<string> {
  if (Array.isArray(no)) {
    for (const item of no) {
      tabelasDoNo(item, achadas);
    }
  } else if (no !== null && typeof no === 'object') {
    const registro = no as Record<string, unknown>;
    if (registro.kind === 'TableNode') {
      const tabela = registro.table as { identifier: { name: string } };
      achadas.add(tabela.identifier.name);
    }
    for (const valor of Object.values(registro)) {
      tabelasDoNo(valor, achadas);
    }
  }
  return achadas;
}

function descrever(
  node: RootOperationNode,
  tabelas: readonly string[],
): string {
  const json = JSON.stringify(node);
  if (node.kind === 'RawNode' && json.includes('pg_advisory_xact_lock')) {
    return 'trava exclusiva da conta';
  }
  const tipo =
    {
      SelectQueryNode: 'select',
      DeleteQueryNode: 'delete',
      InsertQueryNode: 'insert',
      UpdateQueryNode: 'update',
      RawNode: 'sql',
    }[node.kind as string] ?? node.kind;
  const trava = json.includes('"ForUpdate"') ? ' for update' : '';
  return `${tipo}${trava} ${tabelas.join(', ')}`.trim();
}

/**
 * Plugin que só observa: devolve o nó e o resultado intactos. A subconsulta
 * (`where … in (select …)`) também passa pelo `transformQuery`, mas nunca
 * pelo `transformResult`: por isso a consulta só entra na lista quando o
 * resultado chega.
 */
class Cronometro implements KyselyPlugin {
  readonly consultas: Consulta[] = [];
  readonly #porId = new WeakMap<QueryId, Consulta>();

  transformQuery({
    node,
    queryId,
  }: PluginTransformQueryArgs): RootOperationNode {
    const tabelas = [...tabelasDoNo(node)];
    const consulta: Consulta = {
      queryId,
      node,
      tabelas,
      descricao: descrever(node, tabelas),
      inicio: performance.now(),
    };
    this.#porId.set(queryId, consulta);
    return node;
  }

  async transformResult({
    queryId,
    result,
  }: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    const consulta = this.#porId.get(queryId);
    if (consulta) {
      consulta.fim = performance.now();
      this.consultas.push(consulta);
    }
    return result;
  }

  limpar(): void {
    this.consultas.length = 0;
  }
}

/** Módulo dono de cada tabela, na ordem do `excluirTudo` (ADR-005). */
const MODULO_DA_TABELA: Record<string, string> = {
  conversas: 'conversas',
  mensagens: 'conversas',
  trampos: 'trampos',
  candidaturas: 'trampos',
  servicos: 'servicos',
  perfis: 'perfis',
  sessoes: 'contas',
  contas: 'contas',
  contas_excluidas: 'contas',
};

function moduloDa(consulta: Consulta): string {
  if (consulta.descricao === 'trava exclusiva da conta') {
    return 'trava';
  }
  return MODULO_DA_TABELA[consulta.tabelas[0] ?? ''] ?? 'outro';
}

function duracao(consulta: Consulta): number {
  if (consulta.fim === undefined) {
    throw new Error(`consulta sem fim: ${consulta.descricao}`);
  }
  return consulta.fim - consulta.inicio;
}

const ms = (valor: number): string => `${valor.toFixed(1)} ms`;

function mediana(valores: readonly number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? (ordenados[meio] as number)
    : ((ordenados[meio - 1] as number) + (ordenados[meio] as number)) / 2;
}

async function pedir(
  aplicacao: Aplicacao,
  url: string,
  corpo: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; corpo: unknown; texto: string }> {
  const resposta = await aplicacao.app.inject({
    method: 'POST',
    url,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    payload: corpo,
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? undefined : resposta.json(),
    texto: resposta.body,
  };
}

/**
 * Gera o volume de referência da conta `contaId` numa transação. Os
 * candidatos e os parceiros de conversa são contas fictícias sem linha em
 * `contas` (os módulos guardam o id sem FK); os parceiros são candidatos dos
 * primeiros trampos, como exige o vínculo da conversa (CA13).
 */
async function gerarVolume(
  db: Kysely<BancoBase>,
  contaId: string,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const base = sql`date_trunc('milliseconds', now() - interval '400 days')`;
    await sql`insert into perfis
        (conta_id, nome, cidade, cidade_normalizada, descricao, habilidades, atualizado_em)
      values (${contaId}, 'Pessoa Fictícia da Medida', 'Lavras', 'lavras',
        'Perfil fictício para a medida da exclusão.',
        array['pintura', 'elétrica', 'hidráulica'], ${base})`.execute(trx);

    // Trampos da conta: um a cada 1 min 23,457 s, 10% em andamento.
    await sql`insert into trampos
        (id, autor_id, titulo, descricao, categoria, cidade, cidade_normalizada,
         texto_busca, valor_centavos, prazo, status, versao, criado_em)
      select gen_random_uuid(), ${contaId},
        'Trampo fictício ' || n,
        'Descrição fictícia do trampo ' || n || ' para a medida da exclusão.',
        (array['reformas','design','aulas','entregas','ti','eventos','limpeza',
               'beleza','fotografia','outros'])[1 + n % 10],
        'Lavras', 'lavras',
        'trampo ficticio ' || n || ' descricao ficticia do trampo ' || n,
        10000 + n, null,
        case when n % 10 = 0 then 'em_andamento' else 'aberto' end,
        1,
        date_trunc('milliseconds',
          ${base} + n * interval '1 minute 23.457 seconds')
      from generate_series(1, ${sql.lit(VOLUME.trampos)}) as n`.execute(trx);

    await sql`create temp table trampos_da_medida on commit drop as
      select id, status, criado_em,
        row_number() over (order by criado_em, id) as n
      from trampos where autor_id = ${contaId}`.execute(trx);
    await sql`create temp table candidatos_da_medida on commit drop as
      select n, gen_random_uuid() as id
      from generate_series(1, ${sql.lit(VOLUME.trampos * VOLUME.candidaturasPorTrampo)}) as n`.execute(
      trx,
    );

    // Candidaturas recebidas: 4 por trampo, de candidatos distintos. No
    // trampo em andamento, a primeira foi aceita e as outras recusadas.
    await sql`insert into candidaturas
        (id, trampo_id, freelancer_id, mensagem, valor_proposto_centavos, status, criada_em)
      select gen_random_uuid(), t.id, c.id,
        'Candidatura fictícia ' || j || ' no trampo ' || t.n || '.',
        9000 + j,
        case when t.status = 'aberto' then 'pendente'
             when j = 1 then 'aceita' else 'recusada' end,
        date_trunc('milliseconds', t.criado_em + j * interval '17.5 seconds')
      from trampos_da_medida as t
      cross join generate_series(1, ${sql.lit(VOLUME.candidaturasPorTrampo)}) as j
      join candidatos_da_medida as c
        on c.n = (t.n - 1) * ${sql.lit(VOLUME.candidaturasPorTrampo)} + j`.execute(
      trx,
    );

    // Candidaturas feitas: um trampo de outra conta para cada uma.
    await sql`create temp table trampos_de_outros on commit drop as
      select gen_random_uuid() as id, gen_random_uuid() as autor_id, n,
        date_trunc('milliseconds',
          ${base} + n * interval '3 minutes 1.25 seconds') as criado_em
      from generate_series(1, ${sql.lit(VOLUME.candidaturasFeitas)}) as n`.execute(
      trx,
    );
    await sql`insert into trampos
        (id, autor_id, titulo, descricao, categoria, cidade, cidade_normalizada,
         texto_busca, valor_centavos, prazo, status, versao, criado_em)
      select id, autor_id, 'Trampo de outra conta ' || n,
        'Descrição fictícia de outra conta ' || n || '.',
        'outros', 'Lavras', 'lavras',
        'trampo de outra conta ' || n || ' descricao ficticia de outra conta ' || n,
        20000 + n, null, 'aberto', 1, criado_em
      from trampos_de_outros`.execute(trx);
    await sql`insert into candidaturas
        (id, trampo_id, freelancer_id, mensagem, valor_proposto_centavos, status, criada_em)
      select gen_random_uuid(), id, ${contaId},
        'Candidatura fictícia da conta medida ' || n || '.', 19000 + n,
        'pendente', date_trunc('milliseconds', criado_em + interval '42.125 seconds')
      from trampos_de_outros`.execute(trx);

    await sql`insert into servicos
        (id, autor_id, titulo, descricao, categoria, cidade, cidade_normalizada,
         texto_busca, preco_base_centavos, status, criado_em)
      select gen_random_uuid(), ${contaId}, 'Serviço fictício ' || n,
        'Descrição fictícia do serviço ' || n || '.',
        (array['reformas','design','aulas','entregas','ti','eventos','limpeza',
               'beleza','fotografia','outros'])[1 + n % 10],
        case when n % 3 = 0 then null else 'Lavras' end,
        case when n % 3 = 0 then null else 'lavras' end,
        'servico ficticio ' || n || ' descricao ficticia do servico ' || n,
        5000 + n, 'ativo',
        date_trunc('milliseconds', ${base} + n * interval '7 minutes 3.5 seconds')
      from generate_series(1, ${sql.lit(VOLUME.servicos)}) as n`.execute(trx);

    // Conversas com os primeiros candidatos dos primeiros 200 trampos.
    await sql`create temp table conversas_da_medida on commit drop as
      select gen_random_uuid() as id, c.id as outro,
        date_trunc('milliseconds', t.criado_em + interval '1 hour') as criada_em
      from trampos_da_medida as t
      join candidatos_da_medida as c
        on c.n = (t.n - 1) * ${sql.lit(VOLUME.candidaturasPorTrampo)} + 1
      where t.n <= ${sql.lit(VOLUME.conversas)}`.execute(trx);
    await sql`insert into conversas (id, usuario_a_id, usuario_b_id, criada_em)
      select id, least(outro, ${contaId}::uuid), greatest(outro, ${contaId}::uuid),
        criada_em
      from conversas_da_medida`.execute(trx);
    await sql`insert into mensagens (id, conversa_id, autor_id, texto, enviada_em)
      select gen_random_uuid(), cv.id,
        case when m % 2 = 0 then ${contaId}::uuid else cv.outro end,
        'Mensagem fictícia ' || m || ' da medida da exclusão, com um texto de '
          || 'tamanho comum numa conversa sobre o trampo combinado.',
        date_trunc('milliseconds', cv.criada_em + m * interval '1 minute 0.5 seconds')
      from conversas_da_medida as cv
      cross join generate_series(1, ${sql.lit(VOLUME.mensagensPorConversa)}) as m`.execute(
      trx,
    );
  });
  // Estatísticas e mapa de visibilidade em dia, como numa base em uso.
  await sql`vacuum (analyze) mensagens, conversas, candidaturas, trampos, servicos, perfis, sessoes, contas`.execute(
    db,
  );
}

interface Contagem {
  readonly conversas: number;
  readonly mensagens: number;
  readonly tramposDaConta: number;
  readonly candidaturasRecebidas: number;
  readonly candidaturasFeitas: number;
  readonly servicos: number;
  readonly perfis: number;
  readonly sessoes: number;
  readonly contas: number;
}

async function contar(
  db: Kysely<BancoBase>,
  contaId: string,
): Promise<Contagem> {
  const { rows } = await sql<Record<keyof Contagem, string>>`select
      (select count(*) from conversas
        where usuario_a_id = ${contaId} or usuario_b_id = ${contaId}) as conversas,
      (select count(*) from mensagens) as mensagens,
      (select count(*) from trampos where autor_id = ${contaId}) as "tramposDaConta",
      (select count(*) from candidaturas c join trampos t on t.id = c.trampo_id
        where t.autor_id = ${contaId}) as "candidaturasRecebidas",
      (select count(*) from candidaturas where freelancer_id = ${contaId}) as "candidaturasFeitas",
      (select count(*) from servicos where autor_id = ${contaId}) as servicos,
      (select count(*) from perfis where conta_id = ${contaId}) as perfis,
      (select count(*) from sessoes where conta_id = ${contaId}) as sessoes,
      (select count(*) from contas where id = ${contaId}) as contas`.execute(
    db,
  );
  const linha = rows[0];
  if (!linha) {
    throw new Error('contagem sem linha');
  }
  return Object.fromEntries(
    Object.entries(linha).map(([chave, valor]) => [chave, Number(valor)]),
  ) as unknown as Contagem;
}

interface Rodada {
  readonly totalDoPedido: number;
  readonly antesDaTransacao: number;
  readonly transacao: number;
  readonly porModulo: ReadonlyMap<string, number>;
  readonly consultas: readonly Consulta[];
}

/** Separa as consultas do pedido em "antes da trava" e "na transação". */
function resumirRodada(
  consultas: readonly Consulta[],
  inicio: number,
  fim: number,
): Rodada {
  const indiceDaTrava = consultas.findIndex(
    (c) => c.descricao === 'trava exclusiva da conta',
  );
  expect(
    indiceDaTrava,
    'a exclusão começa pela trava da conta',
  ).toBeGreaterThanOrEqual(0);
  const daTransacao = consultas.slice(indiceDaTrava);
  const trava = daTransacao[0] as Consulta;
  const porModulo = new Map<string, number>();
  for (const consulta of daTransacao) {
    const modulo = moduloDa(consulta);
    porModulo.set(modulo, (porModulo.get(modulo) ?? 0) + duracao(consulta));
  }
  return {
    totalDoPedido: fim - inicio,
    antesDaTransacao: trava.inicio - inicio,
    transacao: fim - trava.inicio,
    porModulo,
    consultas: daTransacao,
  };
}

/**
 * `explain (analyze, buffers)` de cada consulta da transação, na ordem em
 * que a exclusão as rodou, numa transação desfeita no fim (o `delete` do
 * `explain analyze` apaga de verdade).
 */
async function explicar(
  db: Kysely<BancoBase>,
  consultas: readonly Consulta[],
): Promise<string[]> {
  const planos: string[] = [];
  const desfazer = new Error('desfazer o explain');
  await db
    .transaction()
    .execute(async (trx) => {
      for (const consulta of consultas) {
        const compilada = trx
          .getExecutor()
          .compileQuery(consulta.node, consulta.queryId);
        const { rows } = await trx.executeQuery<{ 'QUERY PLAN': string }>(
          CompiledQuery.raw(`explain (analyze, buffers) ${compilada.sql}`, [
            ...compilada.parameters,
          ]),
        );
        planos.push(
          [
            `-- ${consulta.descricao}`,
            ...rows.map((r) => r['QUERY PLAN']),
          ].join('\n'),
        );
      }
      throw desfazer;
    })
    .catch((erro: unknown) => {
      if (erro !== desfazer) {
        throw erro;
      }
    });
  return planos;
}

describe('medida da exclusão de conta grande (CA69)', () => {
  it.skipIf(!MEDIR)(
    'exclui o volume de referência e registra os tempos',
    async () => {
      const cronometro = new Cronometro();
      const db = bancoDeTeste();
      let aplicacao: Aplicacao | undefined;
      try {
        // O limite de consulta é o de produção (D42), não o do servidor.
        const { rows: limite } = await sql<{
          statement_timeout: string;
        }>`show statement_timeout`.execute(db);
        expect(limite[0]?.statement_timeout).toBe('10s');

        // Rate limit e limite por conta não entram na medida.
        aplicacao = await montarAplicacao({
          db: db.withPlugin(cronometro),
          rateLimit: false,
        });

        const rodadas: Rodada[] = [];
        let ultimaConta: Record<string, unknown> | undefined;
        for (let rodada = 1; rodada <= RODADAS; rodada += 1) {
          await truncarTabelas(TABELAS);
          const email = `medida.exclusao.${rodada}@exemplo.com`;
          const cadastro = await pedir(aplicacao, '/contas', {
            email,
            senha: SENHA,
          });
          expect(cadastro.status, cadastro.texto).toBe(201);
          const token = (cadastro.corpo as { token: string }).token;
          const conta = await db
            .selectFrom('contas' as never)
            .selectAll()
            .where('email' as never, '=', email as never)
            .executeTakeFirstOrThrow();
          const contaId = (conta as { id: string }).id;
          ultimaConta = conta as Record<string, unknown>;

          const inicioDaGeracao = performance.now();
          await gerarVolume(db, contaId);
          const geracao = performance.now() - inicioDaGeracao;
          expect(await contar(db, contaId)).toEqual({
            conversas: VOLUME.conversas,
            mensagens: VOLUME.conversas * VOLUME.mensagensPorConversa,
            tramposDaConta: VOLUME.trampos,
            candidaturasRecebidas:
              VOLUME.trampos * VOLUME.candidaturasPorTrampo,
            candidaturasFeitas: VOLUME.candidaturasFeitas,
            servicos: VOLUME.servicos,
            perfis: 1,
            sessoes: 1,
            contas: 1,
          });

          cronometro.limpar();
          const inicio = performance.now();
          const exclusao = await pedir(
            aplicacao,
            '/contas/eu/exclusao',
            { senha: SENHA },
            token,
          );
          const fim = performance.now();
          expect(exclusao.status, exclusao.texto).toBe(204);

          expect(await contar(db, contaId)).toEqual({
            conversas: 0,
            mensagens: 0,
            tramposDaConta: 0,
            candidaturasRecebidas: 0,
            candidaturasFeitas: 0,
            servicos: 0,
            perfis: 0,
            sessoes: 0,
            contas: 0,
          });
          // Os trampos das outras contas ficam; só a candidatura dela sai.
          const { rows: restantes } = await sql<{
            trampos: string;
            candidaturas: string;
            lapides: string;
          }>`select (select count(*) from trampos) as trampos,
              (select count(*) from candidaturas) as candidaturas,
              (select count(*) from contas_excluidas where id = ${contaId}) as lapides`.execute(
            db,
          );
          expect(restantes[0]).toEqual({
            trampos: String(VOLUME.candidaturasFeitas),
            candidaturas: '0',
            lapides: '1',
          });

          const resumo = resumirRodada(cronometro.consultas, inicio, fim);
          rodadas.push(resumo);
          console.info(
            [
              `\n[medida] rodada ${rodada}: geração ${ms(geracao)}`,
              `  POST /contas/eu/exclusao: ${ms(resumo.totalDoPedido)}`,
              `  antes da transação (sessão, conta, scrypt): ${ms(resumo.antesDaTransacao)}`,
              `  transação (da trava à resposta, com commit): ${ms(resumo.transacao)}`,
              ...[...resumo.porModulo].map(
                ([modulo, tempo]) => `  ${modulo}: ${ms(tempo)}`,
              ),
              '  consultas da transação:',
              ...resumo.consultas.map(
                (c) => `    ${ms(duracao(c)).padStart(10)}  ${c.descricao}`,
              ),
            ].join('\n'),
          );
        }

        const maisLenta = Math.max(
          ...rodadas.flatMap((r) => r.consultas.map(duracao)),
        );
        const modulos = [...(rodadas[0]?.porModulo.keys() ?? [])];
        console.info(
          [
            `\n[medida] mediana de ${RODADAS} rodadas`,
            `  POST /contas/eu/exclusao: ${ms(mediana(rodadas.map((r) => r.totalDoPedido)))}`,
            `  antes da transação: ${ms(mediana(rodadas.map((r) => r.antesDaTransacao)))}`,
            `  transação: ${ms(mediana(rodadas.map((r) => r.transacao)))}`,
            ...modulos.map(
              (modulo) =>
                `  ${modulo}: ${ms(mediana(rodadas.map((r) => r.porModulo.get(modulo) ?? 0)))}`,
            ),
            `  consulta mais lenta (todas as rodadas): ${ms(maisLenta)}`,
          ].join('\n'),
        );

        // Planos: o mesmo volume, para a mesma conta, desfeito no fim.
        await truncarTabelas(TABELAS);
        const ultimaRodada = rodadas.at(-1) as Rodada;
        await db
          .insertInto('contas' as never)
          .values(ultimaConta as never)
          .execute();
        await gerarVolume(db, (ultimaConta as { id: string }).id);
        const planos = await explicar(db, ultimaRodada.consultas);
        console.info(`\n[medida] planos\n${planos.join('\n\n')}`);
        expect(planos).toHaveLength(ultimaRodada.consultas.length);
      } finally {
        await aplicacao?.fechar();
        await truncarTabelas(TABELAS);
      }
    },
    TEMPO_LIMITE,
  );
});
