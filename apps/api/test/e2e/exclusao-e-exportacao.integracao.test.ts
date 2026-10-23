/**
 * CA17, CA18 e CA19 de ponta a ponta, com a API montada pela composição e o
 * Postgres de teste: a porta `DadosDaConta` ligada às fachadas de todos os
 * módulos (D25, D26).
 *
 * Duas contas que interagem em tudo (perfil, trampo, serviço, candidaturas
 * cruzadas e conversa): a "Ana" exporta e depois exclui a conta; o "Bruno" é o
 * outro participante e precisa ficar intacto, vendo 404 onde antes via a Ana.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarConexao } from '../../src/compartilhado/banco/conexao.js';
import type { Relogio } from '../../src/compartilhado/dominio/relogio.js';
import {
  type Aplicacao,
  montarAplicacao,
  type OpcoesDaAplicacao,
} from '../../src/composicao.js';
import { lerUrlDoBancoDeTeste } from '../../src/config.js';
import { bancoDeTeste, truncarTabelas } from '../banco-teste.js';

const TABELAS = [
  'mensagens',
  'conversas',
  'candidaturas',
  'trampos',
  'servicos',
  'perfis',
  'sessoes',
  'contas',
];

// O hash de produção (scrypt N=2^17) leva ~0,6 s por cadastro, entrada,
// exportação ou exclusão.
const TEMPO_LIMITE = 60_000;

const SENHA_DA_ANA = 'senha-da-ana-123';
const SENHA_DO_BRUNO = 'senha-do-bruno-456';
const EMAIL_DA_ANA = 'ana.exclusao@exemplo.com';
const EMAIL_DO_BRUNO = 'bruno.outro@exemplo.com';

// Textos do Bruno que nunca podem sair na exportação da Ana.
const MENSAGEM_DO_BRUNO = 'Mensagem do Bruno para a Ana';
const CANDIDATURA_DO_BRUNO = 'Candidatura do Bruno no trampo da Ana';

let aplicacao: Aplicacao | undefined;

beforeEach(async () => {
  await truncarTabelas(TABELAS);
});

afterEach(async () => {
  await aplicacao?.fechar();
  aplicacao = undefined;
});

async function montar(
  opcoes: Omit<OpcoesDaAplicacao, 'db'> = {},
): Promise<Aplicacao> {
  aplicacao = await montarAplicacao({ db: bancoDeTeste(), ...opcoes });
  return aplicacao;
}

interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
  readonly texto: string;
  readonly cabecalhos: Record<string, unknown>;
}

async function pedir(
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  token?: string,
  corpo?: Record<string, unknown>,
): Promise<Resposta> {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  const resposta = await aplicacao.app.inject({
    method: metodo,
    url,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    ...(corpo ? { payload: corpo } : {}),
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? undefined : resposta.json(),
    texto: resposta.body,
    cabecalhos: resposta.headers,
  };
}

function esperarStatus(resposta: Resposta, status: number): void {
  expect(resposta.status, resposta.texto).toBe(status);
}

async function cadastrar(email: string, senha: string): Promise<string> {
  const resposta = await pedir('POST', '/contas', undefined, { email, senha });
  esperarStatus(resposta, 201);
  return (resposta.corpo as { token: string }).token;
}

/** O id da conta é o `autorId` do trampo que ela publicou. */
async function autorDo(trampoId: string, token: string): Promise<string> {
  const resposta = await pedir('GET', `/trampos/${trampoId}`, token);
  esperarStatus(resposta, 200);
  return (resposta.corpo as { autorId: string }).autorId;
}

function idDe(resposta: Resposta, campo = 'id'): string {
  expect(resposta.status, resposta.texto).toBeLessThan(300);
  const id = (resposta.corpo as Record<string, unknown>)[campo];
  expect(typeof id, resposta.texto).toBe('string');
  return id as string;
}

interface Cenario {
  readonly tokenDaAna: string;
  readonly outroAparelhoDaAna: string;
  readonly tokenDoBruno: string;
  readonly contaDaAna: string;
  readonly contaDoBruno: string;
  readonly trampoDaAna: string;
  readonly servicoDaAna: string;
  readonly trampoDoBruno: string;
  readonly candidaturaDaAna: string;
  readonly conversaId: string;
  readonly mensagemDaAna: string;
  readonly ultimaMensagem: string;
}

/**
 * Ana e Bruno com perfis completos, um trampo de cada, um serviço da Ana,
 * candidaturas cruzadas (Bruno no trampo da Ana e Ana no do Bruno) e uma
 * conversa com uma mensagem de cada. A Ana tem duas sessões (dois aparelhos).
 */
async function montarCenario(): Promise<Cenario> {
  const tokenDaAna = await cadastrar(EMAIL_DA_ANA, SENHA_DA_ANA);
  const tokenDoBruno = await cadastrar(EMAIL_DO_BRUNO, SENHA_DO_BRUNO);
  const entrada = await pedir('POST', '/sessoes', undefined, {
    email: EMAIL_DA_ANA,
    senha: SENHA_DA_ANA,
  });
  esperarStatus(entrada, 200);
  const outroAparelhoDaAna = (entrada.corpo as { token: string }).token;

  esperarStatus(
    await pedir('PUT', '/perfis/eu', tokenDaAna, {
      nome: 'Ana Exclusão',
      cidade: 'Lavras',
      descricao: 'Pinto paredes e muros.',
      habilidades: ['pintura', 'reparos'],
    }),
    200,
  );
  esperarStatus(
    await pedir('PUT', '/perfis/eu', tokenDoBruno, {
      nome: 'Bruno Outro',
      cidade: 'Lavras',
      habilidades: ['eletrica'],
    }),
    200,
  );

  const trampoDaAna = idDe(
    await pedir('POST', '/trampos', tokenDaAna, {
      titulo: 'Pintura do muro da Ana',
      descricao: 'Muro de 10 metros, tinta inclusa.',
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 35_000,
      prazo: '2026-12-31',
    }),
  );
  const servicoDaAna = idDe(
    await pedir('POST', '/servicos', tokenDaAna, {
      titulo: 'Pintura residencial da Ana',
      descricao: 'Paredes internas e externas.',
      categoria: 'reformas',
      cidade: 'Lavras',
      precoBaseCentavos: 20_000,
    }),
  );
  const trampoDoBruno = idDe(
    await pedir('POST', '/trampos', tokenDoBruno, {
      titulo: 'Instalação elétrica do Bruno',
      descricao: 'Trocar a fiação da cozinha.',
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 50_000,
    }),
  );

  const contaDaAna = await autorDo(trampoDaAna, tokenDaAna);
  const contaDoBruno = await autorDo(trampoDoBruno, tokenDoBruno);

  esperarStatus(
    await pedir('POST', `/trampos/${trampoDaAna}/candidaturas`, tokenDoBruno, {
      mensagem: CANDIDATURA_DO_BRUNO,
      valorPropostoCentavos: 30_000,
    }),
    201,
  );
  const candidaturaDaAna = idDe(
    await pedir('POST', `/trampos/${trampoDoBruno}/candidaturas`, tokenDaAna, {
      mensagem: 'Candidatura da Ana no trampo do Bruno',
      valorPropostoCentavos: 45_000,
    }),
  );

  const aberta = await pedir('POST', '/conversas', tokenDoBruno, {
    outroUsuarioId: contaDaAna,
  });
  esperarStatus(aberta, 201);
  const conversaId = idDe(aberta, 'conversaId');
  const daAna = await pedir(
    'POST',
    `/conversas/${conversaId}/mensagens`,
    tokenDaAna,
    { texto: 'Mensagem da Ana para o Bruno' },
  );
  esperarStatus(daAna, 201);
  const doBruno = await pedir(
    'POST',
    `/conversas/${conversaId}/mensagens`,
    tokenDoBruno,
    { texto: MENSAGEM_DO_BRUNO },
  );
  esperarStatus(doBruno, 201);

  return {
    tokenDaAna,
    outroAparelhoDaAna,
    tokenDoBruno,
    contaDaAna,
    contaDoBruno,
    trampoDaAna,
    servicoDaAna,
    trampoDoBruno,
    candidaturaDaAna,
    conversaId,
    mensagemDaAna: idDe(daAna),
    ultimaMensagem: idDe(doBruno),
  };
}

/**
 * Coluna que diz de quem é cada linha, por tabela. Tem de bater com o que o
 * schema tem (`colunasDeDonoNoSchema`): tabela nova com coluna de dono e sem
 * entrada aqui faz o teste falhar (ADR-005), em vez de passar sem olhá-la.
 */
const DONO_DA_LINHA: Readonly<Record<string, readonly string[]>> = {
  contas: ['id'],
  sessoes: ['conta_id'],
  perfis: ['conta_id'],
  trampos: ['autor_id'],
  servicos: ['autor_id'],
  candidaturas: ['freelancer_id'],
  conversas: ['usuario_a_id', 'usuario_b_id'],
  mensagens: ['autor_id'],
};

/** Nomes de coluna que guardam o id de uma conta (ADR-005), mais `contas.id`. */
const COLUNAS_DE_DONO = [
  'conta_id',
  'autor_id',
  'freelancer_id',
  'usuario_a_id',
  'usuario_b_id',
];

/**
 * Tabelas do schema atual com coluna de dono e as colunas de cada uma, lidas
 * de `information_schema.columns` (tabelas comuns, fora as de controle das
 * migrações). `contas` entra pelo `id`.
 */
async function colunasDeDonoNoSchema(): Promise<Record<string, string[]>> {
  const { rows } = await sql<{ tabela: string; coluna: string }>`
    select c.table_name as tabela, c.column_name as coluna
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = current_schema()
      and t.table_type = 'BASE TABLE'
      and t.table_name not like 'kysely_%'
      and (
        c.column_name in (${sql.join(COLUNAS_DE_DONO)})
        or (c.table_name = 'contas' and c.column_name = 'id')
      )
    order by c.table_name, c.column_name
  `.execute(bancoDeTeste());
  const porTabela: Record<string, string[]> = {};
  for (const { tabela, coluna } of rows) {
    porTabela[tabela] = [...(porTabela[tabela] ?? []), coluna];
  }
  return porTabela;
}

/** `DONO_DA_LINHA` com as colunas em ordem, para comparar com o schema. */
function donosDeclarados(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(DONO_DA_LINHA).map(([tabela, colunas]) => [
      tabela,
      [...colunas].sort(),
    ]),
  );
}

/**
 * Quantas linhas de cada tabela pertencem à conta, contando pelas colunas
 * descobertas no schema. Falha se o schema tiver tabela (ou coluna) de dono
 * fora de `DONO_DA_LINHA`, ou o contrário.
 */
async function linhasDaConta(contaId: string): Promise<Record<string, number>> {
  const noSchema = await colunasDeDonoNoSchema();
  expect(noSchema, 'tabelas com coluna de dono x DONO_DA_LINHA').toEqual(
    donosDeclarados(),
  );
  const contagem: Record<string, number> = {};
  for (const [tabela, colunas] of Object.entries(noSchema)) {
    const { rows } = await sql<{ n: number }>`select count(*)::int as n
      from ${sql.table(tabela)}
      where ${contaId}::uuid in (${sql.join(colunas.map((c) => sql.ref(c)))})`.execute(
      bancoDeTeste(),
    );
    contagem[tabela] = rows[0]?.n ?? -1;
  }
  return contagem;
}

const NADA = {
  contas: 0,
  sessoes: 0,
  perfis: 0,
  trampos: 0,
  servicos: 0,
  candidaturas: 0,
  conversas: 0,
  mensagens: 0,
};

/** Relógio parado: toda data do JSON exportado é conhecida de antemão. */
const INSTANTE = '2026-06-01T12:00:00.000Z';
const relogioParado: Relogio = { agora: () => new Date(INSTANTE) };
const DATA_ISO = expect.stringMatching(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
);

describe('ADR-005 — a contagem de linhas da conta cobre todo o schema', () => {
  it('as tabelas com coluna de dono no schema são exatamente as de DONO_DA_LINHA', async () => {
    expect(await colunasDeDonoNoSchema()).toEqual(donosDeclarados());
  });

  it('Dado uma tabela nova com conta_id e sem dono declarado, então linhasDaConta falha', async () => {
    // Tabela de verdade no schema (uma `temp` iria para `pg_temp` e não
    // contaria), apagada no fim; os arquivos de integração rodam em série.
    const conexao = bancoDeTeste();
    // Sobra de uma execução interrompida entre o create e o drop (R5).
    await sql`drop table if exists tabela_sem_dono_declarado`.execute(conexao);
    await sql`create table tabela_sem_dono_declarado (conta_id uuid)`.execute(
      conexao,
    );
    let falha: unknown;
    try {
      falha = await linhasDaConta(randomUUID()).then(
        () => undefined,
        (erro: unknown) => erro,
      );
    } finally {
      await sql`drop table tabela_sem_dono_declarado`.execute(conexao);
    }

    expect(falha, 'a tabela nova devia derrubar a contagem').toBeInstanceOf(
      Error,
    );
    expect((falha as Error).message).toContain(
      'tabelas com coluna de dono x DONO_DA_LINHA',
    );
    // O que o schema tinha: a tabela nova, com a coluna de dono dela.
    expect((falha as { actual?: unknown }).actual).toMatchObject({
      tabela_sem_dono_declarado: ['conta_id'],
    });
    expect(await colunasDeDonoNoSchema()).toEqual(donosDeclarados());
  });
});

describe('CA19 — exportação pela rota real (D26)', () => {
  it(
    'Dado a senha certa, então 200 com o JSON trampo-ja.exportacao.v1 exato, sem dado do outro participante e com no-store; senha errada dá 403',
    async () => {
      await montar({ relogio: relogioParado });
      const c = await montarCenario();

      const errada = await pedir(
        'POST',
        '/contas/eu/exportacao',
        c.tokenDaAna,
        { senha: SENHA_DO_BRUNO },
      );
      expect(errada.status).toBe(403);
      expect(errada.texto).toBe('{"erro":"senha_incorreta"}');
      expect(errada.cabecalhos['cache-control']).toBe('no-store');

      const exportada = await pedir(
        'POST',
        '/contas/eu/exportacao',
        c.tokenDaAna,
        { senha: SENHA_DA_ANA },
      );

      expect(exportada.status).toBe(200);
      expect(exportada.cabecalhos['cache-control']).toBe('no-store');
      // Igualdade estrita: chave a mais ou a menos em qualquer nível falha.
      expect(exportada.corpo).toStrictEqual({
        formato: 'trampo-ja.exportacao.v1',
        geradoEm: INSTANTE,
        conta: {
          id: c.contaDaAna,
          email: EMAIL_DA_ANA,
          criadaEm: INSTANTE,
        },
        // `sessoes.criada_em` vem do `default now()` do banco, não do relógio.
        sessoes: [
          { criadaEm: DATA_ISO, expiraEm: '2026-07-01T12:00:00.000Z' },
          { criadaEm: DATA_ISO, expiraEm: '2026-07-01T12:00:00.000Z' },
        ],
        perfil: {
          nome: 'Ana Exclusão',
          cidade: 'Lavras',
          descricao: 'Pinto paredes e muros.',
          habilidades: ['pintura', 'reparos'],
          atualizadoEm: INSTANTE,
        },
        trampos: [
          {
            id: c.trampoDaAna,
            titulo: 'Pintura do muro da Ana',
            descricao: 'Muro de 10 metros, tinta inclusa.',
            categoria: 'reformas',
            cidade: 'Lavras',
            valorCentavos: 35_000,
            prazo: '2026-12-31',
            status: 'aberto',
            criadoEm: INSTANTE,
            candidaturasRecebidas: 1,
          },
        ],
        servicos: [
          {
            id: c.servicoDaAna,
            titulo: 'Pintura residencial da Ana',
            descricao: 'Paredes internas e externas.',
            categoria: 'reformas',
            cidade: 'Lavras',
            precoBaseCentavos: 20_000,
            status: 'ativo',
            criadoEm: INSTANTE,
          },
        ],
        candidaturas: [
          {
            id: c.candidaturaDaAna,
            trampoId: c.trampoDoBruno,
            mensagem: 'Candidatura da Ana no trampo do Bruno',
            valorPropostoCentavos: 45_000,
            status: 'pendente',
            criadaEm: INSTANTE,
          },
        ],
        conversas: [
          {
            id: c.conversaId,
            outroUsuarioId: c.contaDoBruno,
            criadaEm: INSTANTE,
            minhasMensagens: [
              {
                id: c.mensagemDaAna,
                texto: 'Mensagem da Ana para o Bruno',
                enviadaEm: INSTANTE,
              },
            ],
          },
        ],
      });
      for (const doOutro of [
        EMAIL_DO_BRUNO,
        MENSAGEM_DO_BRUNO,
        CANDIDATURA_DO_BRUNO,
        'Bruno Outro',
        'senha',
        'hash',
        'token',
        'normalizad',
        'texto_busca',
      ]) {
        expect(exportada.texto, doOutro).not.toContain(doOutro);
      }
    },
    TEMPO_LIMITE,
  );
});

describe('Q1 — travas da exclusão e da abertura de conversa com o pool real', () => {
  it(
    'Dado um pool de uma conexão só, então abrir conversa (trava + vínculo + insert) e excluir a conta terminam: a conferência do vínculo roda na transação do insert, sem pedir outra conexão ao pool',
    async () => {
      const umaConexao = criarConexao(lerUrlDoBancoDeTeste(), {
        maximoDeConexoes: 1,
      });
      try {
        aplicacao = await montarAplicacao({ db: umaConexao });
        // Se a conferência pedisse outra conexão, o `POST /conversas` do
        // cenário esperaria para sempre: o relógio abaixo derruba o teste.
        let relogioDeGuarda: NodeJS.Timeout | undefined;
        const travou = new Promise<never>((_, rejeitar) => {
          relogioDeGuarda = setTimeout(
            () => rejeitar(new Error('o pool de uma conexão travou')),
            20_000,
          );
        });
        try {
          const c = await Promise.race([montarCenario(), travou]);
          const excluida = await Promise.race([
            pedir('POST', '/contas/eu/exclusao', c.tokenDaAna, {
              senha: SENHA_DA_ANA,
            }),
            travou,
          ]);
          expect(excluida.status).toBe(204);
          expect(await linhasDaConta(c.contaDaAna)).toEqual(NADA);
        } finally {
          clearTimeout(relogioDeGuarda);
          travou.catch(() => undefined);
        }
      } finally {
        await aplicacao?.fechar();
        aplicacao = undefined;
        await umaConexao.destroy();
      }
    },
    TEMPO_LIMITE,
  );
});

describe('CA17/CA18 — exclusão da conta pela rota real (D25)', () => {
  it(
    'Dado a senha errada ou ausente, então 403 senha_incorreta e nada muda',
    async () => {
      await montar();
      const c = await montarCenario();
      const antes = await linhasDaConta(c.contaDaAna);

      for (const corpo of [{ senha: SENHA_DO_BRUNO }, {}]) {
        const recusada = await pedir(
          'POST',
          '/contas/eu/exclusao',
          c.tokenDaAna,
          corpo,
        );
        expect(recusada.status).toBe(403);
        expect(recusada.texto).toBe('{"erro":"senha_incorreta"}');
        expect(recusada.cabecalhos['cache-control']).toBe('no-store');
      }

      expect(await linhasDaConta(c.contaDaAna)).toEqual(antes);
      expect(antes).toEqual({
        contas: 1,
        sessoes: 2,
        perfis: 1,
        trampos: 1,
        servicos: 1,
        candidaturas: 1,
        conversas: 1,
        mensagens: 1,
      });
      esperarStatus(
        await pedir('GET', '/perfis/eu', c.outroAparelhoDaAna),
        200,
      );
    },
    TEMPO_LIMITE,
  );

  it(
    'Dado a senha certa, então 204, tudo da conta some numa vez, as duas sessões caem e o outro participante vê 404 onde via a conta',
    async () => {
      await montar();
      const c = await montarCenario();
      const doBrunoAntes = await linhasDaConta(c.contaDoBruno);

      // Antes: o Bruno vê a conversa, o trampo e o serviço da Ana na busca.
      const buscaAntes = await pedir('GET', '/busca', c.tokenDoBruno);
      esperarStatus(buscaAntes, 200);
      const idsAntes = (buscaAntes.corpo as { itens: { id: string }[] }).itens
        .map((item) => item.id)
        .sort();
      expect(idsAntes).toEqual(
        [c.trampoDaAna, c.servicoDaAna, c.trampoDoBruno].sort(),
      );

      const excluida = await pedir(
        'POST',
        '/contas/eu/exclusao',
        c.tokenDaAna,
        { senha: SENHA_DA_ANA },
      );
      expect(excluida.status).toBe(204);
      expect(excluida.texto).toBe('');
      expect(excluida.cabecalhos['cache-control']).toBe('no-store');

      // CA17: nada da Ana sobra no banco; nada do Bruno além do que era
      // ligado à Ana (a candidatura dele estava no trampo dela; a conversa e
      // a mensagem dele estavam na conversa com ela).
      expect(await linhasDaConta(c.contaDaAna)).toEqual(NADA);
      expect(await linhasDaConta(c.contaDoBruno)).toEqual({
        ...doBrunoAntes,
        candidaturas: 0,
        conversas: 0,
        mensagens: 0,
      });

      // CA17: as duas sessões (os dois aparelhos) caem; a senha não entra mais.
      for (const token of [c.tokenDaAna, c.outroAparelhoDaAna]) {
        const depois = await pedir('GET', '/perfis/eu', token);
        expect(depois.status).toBe(401);
        expect(depois.texto).toBe('{"erro":"nao_autenticado"}');
      }
      const entrada = await pedir('POST', '/sessoes', undefined, {
        email: EMAIL_DA_ANA,
        senha: SENHA_DA_ANA,
      });
      expect(entrada.status).toBe(401);

      // CA18: o perfil dá 404.
      const perfil = await pedir(
        'GET',
        `/perfis/${c.contaDaAna}`,
        c.tokenDoBruno,
      );
      expect(perfil.status).toBe(404);

      // CA18: a conversa some da lista e, aberta (com ou sem cursor), dá 404,
      // nunca o 400 do cursor; enviar também dá 404.
      const lista = await pedir('GET', '/conversas', c.tokenDoBruno);
      esperarStatus(lista, 200);
      expect(lista.corpo).toEqual([]);
      for (const url of [
        `/conversas/${c.conversaId}/mensagens?depoisDe=${c.ultimaMensagem}`,
        `/conversas/${c.conversaId}/mensagens?depoisDe=${c.mensagemDaAna}`,
        `/conversas/${c.conversaId}/mensagens`,
      ]) {
        const aberta = await pedir('GET', url, c.tokenDoBruno);
        expect(aberta.status, url).toBe(404);
        expect(aberta.texto, url).toBe('{"erro":"nao_encontrado"}');
      }
      const envio = await pedir(
        'POST',
        `/conversas/${c.conversaId}/mensagens`,
        c.tokenDoBruno,
        { texto: 'Ainda está aí?' },
      );
      expect(envio.status).toBe(404);

      // CA18: os anúncios saem da busca e o detalhe dá 404.
      const buscaDepois = await pedir('GET', '/busca', c.tokenDoBruno);
      esperarStatus(buscaDepois, 200);
      expect(
        (buscaDepois.corpo as { itens: { id: string }[] }).itens.map(
          (item) => item.id,
        ),
      ).toEqual([c.trampoDoBruno]);
      expect(
        (await pedir('GET', `/trampos/${c.trampoDaAna}`, c.tokenDoBruno))
          .status,
      ).toBe(404);
      expect(
        (await pedir('GET', `/servicos/${c.servicoDaAna}`, c.tokenDoBruno))
          .status,
      ).toBe(404);
      const candidatarNoApagado = await pedir(
        'POST',
        `/trampos/${c.trampoDaAna}/candidaturas`,
        c.tokenDoBruno,
        { mensagem: 'De novo', valorPropostoCentavos: 10_000 },
      );
      expect(candidatarNoApagado.status).toBe(404);

      // CA18: a candidatura da Ana sai das recebidas do Bruno; a do Bruno no
      // trampo apagado sai das dele.
      const recebidas = await pedir(
        'GET',
        `/trampos/${c.trampoDoBruno}/candidaturas`,
        c.tokenDoBruno,
      );
      esperarStatus(recebidas, 200);
      expect(recebidas.corpo).toEqual([]);
      const minhas = await pedir('GET', '/candidaturas/minhas', c.tokenDoBruno);
      esperarStatus(minhas, 200);
      expect(minhas.corpo).toEqual([]);

      // O Bruno segue intacto: sessão, perfil e o próprio trampo.
      esperarStatus(await pedir('GET', '/perfis/eu', c.tokenDoBruno), 200);
      esperarStatus(
        await pedir('GET', `/trampos/${c.trampoDoBruno}`, c.tokenDoBruno),
        200,
      );
    },
    TEMPO_LIMITE,
  );

  it(
    'o mesmo e-mail pode se cadastrar de novo depois da exclusão, como conta nova e vazia',
    async () => {
      await montar();
      const c = await montarCenario();
      esperarStatus(
        await pedir('POST', '/contas/eu/exclusao', c.tokenDaAna, {
          senha: SENHA_DA_ANA,
        }),
        204,
      );

      const nova = await cadastrar(EMAIL_DA_ANA, SENHA_DA_ANA);
      const exportada = await pedir('POST', '/contas/eu/exportacao', nova, {
        senha: SENHA_DA_ANA,
      });
      esperarStatus(exportada, 200);
      const corpo = exportada.corpo as {
        conta: { id: string };
        perfil: unknown;
        trampos: unknown[];
        servicos: unknown[];
        candidaturas: unknown[];
        conversas: unknown[];
        sessoes: unknown[];
      };
      expect(corpo.conta.id).not.toBe(c.contaDaAna);
      expect(corpo).toMatchObject({
        perfil: null,
        trampos: [],
        servicos: [],
        candidaturas: [],
        conversas: [],
      });
      expect(corpo.sessoes).toHaveLength(1);
    },
    TEMPO_LIMITE,
  );
});
