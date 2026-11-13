import { randomUUID } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bancoDeTeste,
  truncarTabelas,
} from '../../../../../test/banco-teste.js';
import { travarContaComExclusividade } from '../../../../compartilhado/banco/travas-de-conta.js';
import {
  ErroDeRegra,
  ErroNaoEncontrado,
} from '../../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import {
  criarModuloDeTrampos,
  type ModuloDeTrampos,
} from '../../../trampos/index.js';
import { criarCasosDeUsoDeAvaliacoes } from '../../aplicacao/casos-de-uso.js';
import {
  type Avaliacao,
  criarAvaliacao,
  type PapelDoAvaliado,
} from '../../dominio/avaliacao.js';
import { criarFavorito } from '../../dominio/favorito.js';
import type {
  ConferirVinculo,
  OpcoesDeInsercaoDeFavorito,
  VinculoDeAvaliacao,
} from '../../dominio/portas.js';
import {
  criarModuloDeAvaliacoes,
  type ParteDeAvaliacoesNaExportacao,
} from '../../index.js';
import {
  VerificadorDeVinculoEmMemoria,
  VinculoDeAvaliacaoEmMemoria,
} from '../memoria/vinculos-memoria.js';
import { RepositorioDeAvaliacoesPostgres } from './repositorio-postgres.js';
import type { TabelasDeAvaliacoes } from './tabelas.js';

// Ids ordenáveis à mão: A < B < C < D.
const A = '10000000-0000-4000-8000-00000000000a';
const B = '20000000-0000-4000-8000-00000000000b';
const C = '30000000-0000-4000-8000-00000000000c';
const D = '40000000-0000-4000-8000-00000000000d';
const INICIO = new Date('2026-11-13T12:00:00.000Z');

/** Id previsível e ordenável: `…0001`, `…0002`… */
function idDe(numero: number): string {
  return `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`;
}

function trampoDe(numero: number): string {
  return `50000000-0000-4000-8000-${String(numero).padStart(12, '0')}`;
}

function minutos(n: number): Date {
  return new Date(INICIO.getTime() + n * 60_000);
}

const db = () => bancoDeTeste<TabelasDeAvaliacoes>();
let repositorio: RepositorioDeAvaliacoesPostgres;

/** Conferência do vínculo que sempre confirma (testes que não são sobre ela). */
const COM_VINCULO: ConferirVinculo = async () => true;

async function rejeicao(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava uma rejeição');
}

interface DadosDaAvaliacao {
  readonly trampoId?: string;
  readonly avaliadorId?: string;
  readonly avaliadoId?: string;
  readonly papel?: PapelDoAvaliado;
  readonly nota?: number;
  readonly destaques?: readonly string[];
  readonly comentario?: string | null;
  readonly quando?: Date;
  readonly id?: string;
}

function avaliacaoCom(dados: DadosDaAvaliacao = {}): Avaliacao {
  return criarAvaliacao(
    {
      trampoId: dados.trampoId ?? trampoDe(1),
      nota: dados.nota ?? 5,
      destaques: dados.destaques ?? [],
      comentario: dados.comentario === undefined ? null : dados.comentario,
    },
    {
      id: dados.id ?? randomUUID(),
      avaliadorId: dados.avaliadorId ?? A,
      avaliadoId: dados.avaliadoId ?? B,
      papelDoAvaliado: dados.papel ?? 'freela',
      agora: dados.quando ?? INICIO,
    },
  );
}

async function gravar(dados: DadosDaAvaliacao = {}): Promise<Avaliacao> {
  const avaliacao = avaliacaoCom(dados);
  expect(await repositorio.inserirAvaliacao(avaliacao, COM_VINCULO)).toBe(
    'inserida',
  );
  return avaliacao;
}

const opcoesDoFavorito = (
  limite = 200,
  conferirVinculo: ConferirVinculo = COM_VINCULO,
): OpcoesDeInsercaoDeFavorito => ({ limite, conferirVinculo });

async function contar(tabela: 'avaliacoes' | 'favoritos'): Promise<number> {
  const { rows } = await sql<{
    n: number;
  }>`select count(*)::int as n from ${sql.table(tabela)}`.execute(db());
  return rows[0]?.n ?? -1;
}

/** Travas consultivas presas no banco de teste (devem ser 0 fora de transação). */
async function travasConsultivas(): Promise<number> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from pg_locks
    where locktype = 'advisory'
      and database = (select oid from pg_database where datname = current_database())
  `.execute(db());
  return rows[0]?.n ?? -1;
}

type Desfecho = { ok: true; valor: unknown } | { ok: false; erro: unknown };

/** Resultado de uma promessa sem deixar rejeição solta enquanto se espera. */
function acompanhar(promessa: Promise<unknown>): Promise<Desfecho> {
  return promessa.then(
    (valor) => ({ ok: true as const, valor }),
    (erro: unknown) => ({ ok: false as const, erro }),
  );
}

/** Espera até alguma conexão do banco de teste ficar parada numa trava. */
async function esperarAlguemNaTrava(): Promise<void> {
  for (let tentativa = 0; tentativa < 120; tentativa += 1) {
    const { rows } = await sql<{ total: number }>`
      select count(*)::int as total from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
    `.execute(db());
    if ((rows[0]?.total ?? 0) > 0) {
      return;
    }
    await new Promise((resolver) => setTimeout(resolver, 25));
  }
  throw new Error('nenhuma consulta ficou esperando a trava');
}

beforeEach(async () => {
  await truncarTabelas(['avaliacoes', 'favoritos']);
  repositorio = new RepositorioDeAvaliacoesPostgres(db());
});

describe('inserirAvaliacao', () => {
  it('grava todos os campos e lê de volta na lista de recebidas', async () => {
    const avaliacao = await gravar({
      destaques: ['pontual', 'educado'],
      comentario: 'Mandou bem 😀',
    });

    expect(
      await repositorio.listarRecebidas(B, 'freela', { limite: 10 }),
    ).toEqual([
      {
        id: avaliacao.id,
        nota: 5,
        destaques: ['pontual', 'educado'],
        comentario: 'Mandou bem 😀',
        avaliadorId: A,
        criadaEm: INICIO,
      },
    ]);
    expect(
      await repositorio.listarRecebidas(B, 'contratante', { limite: 10 }),
    ).toEqual([]);
  });

  it('CA87 — o mesmo avaliador no mesmo trampo devolve ja_feita, sem lançar, e a primeira fica', async () => {
    const primeira = await gravar({ nota: 5 });

    expect(
      await repositorio.inserirAvaliacao(
        avaliacaoCom({ nota: 1 }),
        COM_VINCULO,
      ),
    ).toBe('ja_feita');
    const lidas = await repositorio.listarRecebidas(B, 'freela', {
      limite: 10,
    });
    expect(lidas.map((l) => [l.id, l.nota])).toEqual([[primeira.id, 5]]);
    // O outro lado do mesmo trampo avalia à parte.
    await gravar({ avaliadorId: B, avaliadoId: A, papel: 'contratante' });
    expect(await contar('avaliacoes')).toBe(2);
  });

  it('CA87 — rajada de 20 gravações iguais direto no repositório: só 1 inserida, 19 ja_feita', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 20 }, () =>
        repositorio.inserirAvaliacao(avaliacaoCom(), COM_VINCULO),
      ),
    );

    expect(resultados.filter((r) => r === 'inserida')).toHaveLength(1);
    expect(resultados.filter((r) => r === 'ja_feita')).toHaveLength(19);
    expect(await contar('avaliacoes')).toBe(1);
    expect(await travasConsultivas()).toBe(0);
  });

  it('id repetido (outra constraint) não vira ja_feita: sobe o erro do banco', async () => {
    const primeira = await gravar();

    const erro = await rejeicao(
      repositorio.inserirAvaliacao(
        avaliacaoCom({ id: primeira.id, trampoId: trampoDe(2) }),
        COM_VINCULO,
      ),
    );

    expect(erro).toMatchObject({
      code: '23505',
      constraint: 'avaliacoes_pkey',
    });
  });

  it('a conferência do vínculo recebe a transação do insert, já com a trava compartilhada das duas contas', async () => {
    const vistas: { transacao: boolean; travas: number }[] = [];

    const resultado = await repositorio.inserirAvaliacao(
      avaliacaoCom(),
      async (transacao) => {
        const trx = transacao as Kysely<TabelasDeAvaliacoes>;
        const { rows } = await sql<{ n: number }>`
          select count(*)::int as n from pg_locks
          where locktype = 'advisory' and mode = 'ShareLock' and granted
            and pid = pg_backend_pid()
        `.execute(trx);
        vistas.push({ transacao: trx.isTransaction, travas: rows[0]?.n ?? -1 });
        return true;
      },
    );

    expect(resultado).toBe('inserida');
    expect(vistas).toEqual([{ transacao: true, travas: 2 }]);
    expect(await travasConsultivas()).toBe(0);
  });

  it('conferência negativa: sem_vinculo, nada gravado; falha na conferência: desfaz e sobe o erro', async () => {
    expect(
      await repositorio.inserirAvaliacao(avaliacaoCom(), async () => false),
    ).toBe('sem_vinculo');

    const erro = await rejeicao(
      repositorio.inserirAvaliacao(avaliacaoCom(), async () => {
        throw new Error('trampos fora');
      }),
    );

    expect((erro as Error).message).toBe('trampos fora');
    expect(await contar('avaliacoes')).toBe(0);
    expect(await travasConsultivas()).toBe(0);
  });
});

describe('CA87 — rajada de 20 pedidos iguais pela rota, com o vínculo real de trampos', () => {
  const TRAMPO = trampoDe(1);
  const TRAMPO_EM_ANDAMENTO = trampoDe(2);

  /** Como a composição liga a porta: a transação vira a visão de `trampos`. */
  function vinculoDeTrampos(trampos: ModuloDeTrampos): VinculoDeAvaliacao {
    return {
      obter: (trampoId, contaId, transacao) =>
        trampos.vinculoParaAvaliacao(
          trampoId,
          contaId,
          transacao as Parameters<ModuloDeTrampos['vinculoParaAvaliacao']>[2],
        ),
    };
  }

  /** Trampo de A com a candidatura de B aceita, no `status` pedido. */
  async function trampoComAceita(
    id: string,
    status: 'em_andamento' | 'encerrado',
  ): Promise<void> {
    await sql`insert into trampos (id, autor_id, titulo, descricao, categoria,
        cidade, cidade_normalizada, texto_busca, valor_centavos, prazo, status,
        versao, criado_em)
      values (${id}, ${A}, 'Pintura', 'Pintar a sala', 'reformas', 'Lavras',
        'lavras', 'pintura', 10000, null, ${status}, 1, ${INICIO})`.execute(
      db(),
    );
    await sql`insert into candidaturas (id, trampo_id, freelancer_id, mensagem,
        valor_proposto_centavos, status, criada_em)
      values (${randomUUID()}, ${id}, ${B}, 'Topo', 10000, 'aceita',
        ${INICIO})`.execute(db());
  }

  beforeEach(async () => {
    await truncarTabelas(['candidaturas', 'trampos']);
    await trampoComAceita(TRAMPO, 'encerrado');
    await trampoComAceita(TRAMPO_EM_ANDAMENTO, 'em_andamento');
  });

  async function servidorReal() {
    const trampos = criarModuloDeTrampos({
      db: bancoDeTeste(),
      verificadorDePerfil: { perfilEstaCompleto: async () => true },
    });
    const avaliacoes = criarModuloDeAvaliacoes({
      db: db(),
      vinculoDeAvaliacao: vinculoDeTrampos(trampos),
      verificadorDeVinculo: {
        existeVinculoEntre: (a, b, transacao) =>
          trampos.existeVinculoEntre(
            a,
            b,
            transacao as Parameters<ModuloDeTrampos['existeVinculoEntre']>[2],
          ),
      },
      relogio: new RelogioFixo(INICIO),
    });
    const servidor = criarServidor({ logger: false });
    servidor.register(
      avaliacoes.rotas({
        validarSessao: async (token) =>
          ({ 'token-a': A, 'token-b': B, 'token-c': C })[token] ?? null,
      }),
    );
    await servidor.ready();
    return servidor;
  }

  it('CA87 — Dado um trampo encerrado, quando o autor manda 20 POST iguais ao mesmo tempo, então só 1 grava (201) e 19 recebem 409 avaliacao_ja_feita', async () => {
    const servidor = await servidorReal();
    try {
      const respostas = await Promise.all(
        Array.from({ length: 20 }, () =>
          servidor.inject({
            method: 'POST',
            url: '/avaliacoes',
            headers: { authorization: 'Bearer token-a' },
            payload: { trampoId: TRAMPO, nota: 5, comentario: 'Ótimo' },
          }),
        ),
      );

      const status = respostas.map((r) => r.statusCode);
      expect(status.filter((s) => s === 201)).toHaveLength(1);
      expect(status.filter((s) => s === 409)).toHaveLength(19);
      for (const resposta of respostas.filter((r) => r.statusCode === 409)) {
        expect(resposta.json()).toEqual({ erro: 'avaliacao_ja_feita' });
      }
      const linhas = await db()
        .selectFrom('avaliacoes')
        .select(['avaliador_id', 'avaliado_id', 'papel_do_avaliado'])
        .execute();
      expect(linhas).toEqual([
        { avaliador_id: A, avaliado_id: B, papel_do_avaliado: 'freela' },
      ]);
      expect(await travasConsultivas()).toBe(0);
    } finally {
      await servidor.close();
    }
  });

  it('CA87 — pelo vínculo real: o freela avalia o autor; terceiro, 404; em andamento, 409; o freela favorita o autor e um terceiro não', async () => {
    const servidor = await servidorReal();
    try {
      const pedir = (token: string, payload: Record<string, unknown>) =>
        servidor.inject({
          method: 'POST',
          url: '/avaliacoes',
          headers: { authorization: `Bearer ${token}` },
          payload,
        });

      expect(
        (await pedir('token-b', { trampoId: TRAMPO, nota: 4 })).statusCode,
      ).toBe(201);
      const terceiro = await pedir('token-c', { trampoId: TRAMPO, nota: 1 });
      expect(terceiro.statusCode).toBe(404);
      const emAndamento = await pedir('token-a', {
        trampoId: TRAMPO_EM_ANDAMENTO,
        nota: 5,
      });
      expect(emAndamento.json()).toEqual({ erro: 'trampo_nao_encerrado' });

      const favoritar = (token: string, contaId: string) =>
        servidor.inject({
          method: 'PUT',
          url: `/favoritos/${contaId}`,
          headers: { authorization: `Bearer ${token}` },
        });
      expect((await favoritar('token-b', A)).statusCode).toBe(204);
      expect((await favoritar('token-c', A)).statusCode).toBe(404);
      expect(await repositorio.listarFavoritos(B)).toHaveLength(1);
      expect(await repositorio.listarFavoritos(C)).toEqual([]);
    } finally {
      await servidor.close();
    }
  });
});

describe('listarRecebidas (CA90)', () => {
  it('CA90 — ordem (criada_em, id) decrescente; o cursor não pula nem repete no empate de instante', async () => {
    // Três no mesmo instante (ids 1, 2 e 3) e duas em instantes diferentes.
    const ids = [
      await gravar({ trampoId: trampoDe(1), id: idDe(2), quando: minutos(1) }),
      await gravar({ trampoId: trampoDe(2), id: idDe(1), quando: minutos(1) }),
      await gravar({ trampoId: trampoDe(3), id: idDe(3), quando: minutos(1) }),
      await gravar({ trampoId: trampoDe(4), id: idDe(9), quando: minutos(0) }),
      await gravar({ trampoId: trampoDe(5), id: idDe(4), quando: minutos(2) }),
    ];
    expect(ids).toHaveLength(5);

    const pagina1 = await repositorio.listarRecebidas(B, 'freela', {
      limite: 2,
    });
    const ultima1 = pagina1.at(-1);
    if (!ultima1) {
      throw new Error('página vazia');
    }
    const pagina2 = await repositorio.listarRecebidas(B, 'freela', {
      limite: 2,
      antesDe: { criadaEm: ultima1.criadaEm, id: ultima1.id },
    });
    const ultima2 = pagina2.at(-1);
    if (!ultima2) {
      throw new Error('página vazia');
    }
    const pagina3 = await repositorio.listarRecebidas(B, 'freela', {
      limite: 2,
      antesDe: { criadaEm: ultima2.criadaEm, id: ultima2.id },
    });

    expect([...pagina1, ...pagina2, ...pagina3].map((l) => l.id)).toEqual([
      idDe(4),
      idDe(3),
      idDe(2),
      idDe(1),
      idDe(9),
    ]);
  });

  it('só as do avaliado no papel pedido; ids fora do formato dão lista vazia sem erro de banco', async () => {
    await gravar();
    await gravar({ avaliadorId: C, avaliadoId: D });
    await gravar({
      avaliadorId: A,
      avaliadoId: B,
      papel: 'contratante',
      trampoId: trampoDe(2),
    });

    expect(
      (await repositorio.listarRecebidas(B, 'freela', { limite: 50 })).map(
        (l) => l.avaliadorId,
      ),
    ).toEqual([A]);
    expect(
      await repositorio.listarRecebidas('nao-e-uuid', 'freela', { limite: 50 }),
    ).toEqual([]);
    expect(
      await repositorio.listarRecebidas(B, 'freela', {
        limite: 50,
        antesDe: { criadaEm: INICIO, id: 'nao-e-uuid' },
      }),
    ).toEqual([]);
  });

  it('CA90 — pelo caso de uso no Postgres: 20 por página e cursor opaco até a última página', async () => {
    for (let i = 1; i <= 23; i += 1) {
      await gravar({ trampoId: trampoDe(i), quando: minutos(i) });
    }
    const casos = criarCasosDeUsoDeAvaliacoes({
      repositorio,
      vinculoDeAvaliacao: new VinculoDeAvaliacaoEmMemoria(),
      verificadorDeVinculo: new VerificadorDeVinculoEmMemoria(),
      relogio: new RelogioFixo(INICIO),
    });

    const primeira = await casos.listarRecebidas({
      contaId: B,
      papel: 'freela',
    });
    const segunda = await casos.listarRecebidas({
      contaId: B,
      papel: 'freela',
      antesDe: primeira.proximoCursor,
    });

    expect(primeira.itens).toHaveLength(20);
    expect(primeira.itens[0]?.criadaEm).toEqual(minutos(23));
    expect(segunda.itens.map((i) => i.criadaEm)).toEqual([
      minutos(3),
      minutos(2),
      minutos(1),
    ]);
    expect(segunda.proximoCursor).toBeNull();
  });
});

describe('listarFeitasNosTrampos (CA91)', () => {
  it('CA91 — só as do avaliador nos trampos pedidos; ids fora do formato são ignorados', async () => {
    await gravar({ trampoId: trampoDe(1), nota: 5 });
    await gravar({ trampoId: trampoDe(2), nota: 3, quando: minutos(1) });
    await gravar({ trampoId: trampoDe(3), nota: 4 });
    // Outro avaliador no mesmo trampo.
    await gravar({
      trampoId: trampoDe(1),
      avaliadorId: B,
      avaliadoId: A,
      papel: 'contratante',
      nota: 1,
    });

    const feitas = await repositorio.listarFeitasNosTrampos(A, [
      trampoDe(1),
      trampoDe(2),
      trampoDe(9),
      'nao-e-uuid',
    ]);

    expect(
      [...feitas].sort((x, y) => x.trampoId.localeCompare(y.trampoId)),
    ).toEqual([
      { trampoId: trampoDe(1), nota: 5, criadaEm: INICIO },
      { trampoId: trampoDe(2), nota: 3, criadaEm: minutos(1) },
    ]);
    expect(await repositorio.listarFeitasNosTrampos(A, ['nao-e-uuid'])).toEqual(
      [],
    );
    expect(
      await repositorio.listarFeitasNosTrampos('nao-e-uuid', [trampoDe(1)]),
    ).toEqual([]);
  });
});

describe('contarRecebidas (CA89)', () => {
  it('CA89 — total, soma e contagem de cada destaque por conta e papel, só das contas pedidas', async () => {
    await gravar({
      trampoId: trampoDe(1),
      nota: 5,
      destaques: ['pontual', 'educado'],
    });
    await gravar({
      trampoId: trampoDe(2),
      nota: 4,
      destaques: ['pontual'],
    });
    await gravar({
      trampoId: trampoDe(3),
      avaliadorId: C,
      avaliadoId: B,
      papel: 'contratante',
      nota: 3,
    });
    await gravar({ trampoId: trampoDe(4), avaliadorId: A, avaliadoId: D });

    const contagens = await repositorio.contarRecebidas([B, C, 'nao-e-uuid']);

    const ordenar = <T extends { codigo: string }>(lista: readonly T[]) =>
      [...lista].sort((x, y) => x.codigo.localeCompare(y.codigo));
    expect(
      [...contagens]
        .sort((x, y) => x.papel.localeCompare(y.papel))
        .map((c) => ({ ...c, destaques: ordenar(c.destaques) })),
    ).toEqual([
      {
        contaId: B,
        papel: 'contratante',
        total: 1,
        somaDasNotas: 3,
        destaques: [],
      },
      {
        contaId: B,
        papel: 'freela',
        total: 2,
        somaDasNotas: 9,
        destaques: [
          { codigo: 'educado', quantidade: 1 },
          { codigo: 'pontual', quantidade: 2 },
        ],
      },
    ]);
    expect(await repositorio.contarRecebidas([])).toEqual([]);
    expect(await repositorio.contarRecebidas(['nao-e-uuid'])).toEqual([]);
  });

  it('CA89 — pelo caso de uso no Postgres: média com 1 casa e até 3 destaques mais frequentes', async () => {
    const notas = [5, 4, 4, 4];
    const destaques = [
      ['pontual', 'rapido', 'educado', 'proativo'],
      ['pontual', 'rapido', 'educado'],
      ['pontual', 'rapido'],
      ['organizado'],
    ];
    for (let i = 0; i < notas.length; i += 1) {
      await gravar({
        trampoId: trampoDe(i + 1),
        nota: notas[i],
        destaques: destaques[i],
      });
    }
    const casos = criarCasosDeUsoDeAvaliacoes({
      repositorio,
      vinculoDeAvaliacao: new VinculoDeAvaliacaoEmMemoria(),
      verificadorDeVinculo: new VerificadorDeVinculoEmMemoria(),
      relogio: new RelogioFixo(INICIO),
    });

    expect(await casos.resumir(`${B},${D}`)).toEqual([
      {
        contaId: B,
        // 17 / 4 = 4,25 → 4,3.
        comoFreela: {
          media: 4.3,
          total: 4,
          destaques: ['pontual', 'rapido', 'educado'],
        },
        comoContratante: { media: null, total: 0, destaques: [] },
      },
      {
        contaId: D,
        comoFreela: { media: null, total: 0, destaques: [] },
        comoContratante: { media: null, total: 0, destaques: [] },
      },
    ]);
  });
});

describe('favoritos (CA92)', () => {
  const favorito = (dono: string, outro: string, quando = INICIO) =>
    criarFavorito(dono, outro, quando);

  it('CA92 — insere, repete sem mudar o criadoEm e lista do mais recente ao mais antigo', async () => {
    expect(
      await repositorio.inserirFavorito(favorito(A, B), opcoesDoFavorito()),
    ).toBe('inserido');
    expect(
      await repositorio.inserirFavorito(
        favorito(A, C, minutos(1)),
        opcoesDoFavorito(),
      ),
    ).toBe('inserido');
    expect(
      await repositorio.inserirFavorito(
        favorito(A, B, minutos(5)),
        opcoesDoFavorito(),
      ),
    ).toBe('ja_existe');
    // Mesmo instante: desempate por favorito_id decrescente.
    await repositorio.inserirFavorito(
      favorito(A, D, minutos(1)),
      opcoesDoFavorito(),
    );

    expect(await repositorio.listarFavoritos(A)).toEqual([
      { donoId: A, favoritoId: D, criadoEm: minutos(1) },
      { donoId: A, favoritoId: C, criadoEm: minutos(1) },
      { donoId: A, favoritoId: B, criadoEm: INICIO },
    ]);
    expect(await repositorio.listarFavoritos(B)).toEqual([]);
    expect(await repositorio.listarFavoritos('nao-e-uuid')).toEqual([]);
  });

  it('CA92 — no teto, o seguinte é limite_atingido; o repetido continua ja_existe', async () => {
    await repositorio.inserirFavorito(favorito(A, B), opcoesDoFavorito(2));
    await repositorio.inserirFavorito(favorito(A, C), opcoesDoFavorito(2));

    expect(
      await repositorio.inserirFavorito(favorito(A, D), opcoesDoFavorito(2)),
    ).toBe('limite_atingido');
    expect(
      await repositorio.inserirFavorito(favorito(A, B), opcoesDoFavorito(2)),
    ).toBe('ja_existe');
    // O teto é por dono.
    expect(
      await repositorio.inserirFavorito(favorito(B, A), opcoesDoFavorito(2)),
    ).toBe('inserido');
    expect(await contar('favoritos')).toBe(3);
  });

  it('CA92 — rajada: com o dono a 1 do teto, 20 favoritos diferentes ao mesmo tempo gravam só 1', async () => {
    const LIMITE = 5;
    for (let i = 1; i < LIMITE; i += 1) {
      await repositorio.inserirFavorito(
        favorito(A, idDe(i)),
        opcoesDoFavorito(LIMITE),
      );
    }

    const resultados = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        repositorio.inserirFavorito(
          favorito(A, idDe(100 + i)),
          opcoesDoFavorito(LIMITE),
        ),
      ),
    );

    expect(resultados.filter((r) => r === 'inserido')).toHaveLength(1);
    expect(resultados.filter((r) => r === 'limite_atingido')).toHaveLength(19);
    expect(await repositorio.listarFavoritos(A)).toHaveLength(LIMITE);
    expect(await travasConsultivas()).toBe(0);
  });

  it('CA92 — rajada: 20 PUT do mesmo par ao mesmo tempo gravam 1 e os outros são ja_existe', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 20 }, () =>
        repositorio.inserirFavorito(favorito(A, B), opcoesDoFavorito()),
      ),
    );

    expect(resultados.filter((r) => r === 'inserido')).toHaveLength(1);
    expect(resultados.filter((r) => r === 'ja_existe')).toHaveLength(19);
    expect(await contar('favoritos')).toBe(1);
  });

  it('CA92 — a conferência do vínculo recebe a transação com a trava compartilhada das duas contas; negativa: sem_vinculo, nada gravado', async () => {
    const vistas: number[] = [];
    await repositorio.inserirFavorito(
      favorito(A, B),
      opcoesDoFavorito(200, async (transacao) => {
        const { rows } = await sql<{ n: number }>`
          select count(*)::int as n from pg_locks
          where locktype = 'advisory' and mode = 'ShareLock' and granted
            and pid = pg_backend_pid()
        `.execute(transacao as Kysely<TabelasDeAvaliacoes>);
        vistas.push(rows[0]?.n ?? -1);
        return true;
      }),
    );

    expect(vistas).toEqual([2]);
    expect(
      await repositorio.inserirFavorito(
        favorito(A, C),
        opcoesDoFavorito(200, async () => false),
      ),
    ).toBe('sem_vinculo');
    expect(
      (await repositorio.listarFavoritos(A)).map((f) => f.favoritoId),
    ).toEqual([B]);
    expect(await travasConsultivas()).toBe(0);
  });

  it('D61 — par já gravado e vínculo perdido: ja_existe sem conferir o vínculo, a lista não muda; par novo sem vínculo no teto: sem_vinculo antes de limite_atingido', async () => {
    await repositorio.inserirFavorito(favorito(A, B), opcoesDoFavorito(1));
    const conferir = vi.fn(async () => false);

    expect(
      await repositorio.inserirFavorito(
        favorito(A, B, minutos(5)),
        opcoesDoFavorito(1, conferir),
      ),
    ).toBe('ja_existe');
    expect(conferir).not.toHaveBeenCalled();
    expect(
      await repositorio.inserirFavorito(
        favorito(A, C),
        opcoesDoFavorito(1, conferir),
      ),
    ).toBe('sem_vinculo');
    expect(conferir).toHaveBeenCalledTimes(1);

    expect(await repositorio.listarFavoritos(A)).toEqual([
      { donoId: A, favoritoId: B, criadoEm: INICIO },
    ]);
    expect(await travasConsultivas()).toBe(0);
  });

  it('CA92 — remover é idempotente e só tira o par pedido; ids fora do formato não vão ao banco', async () => {
    await repositorio.inserirFavorito(favorito(A, B), opcoesDoFavorito());
    await repositorio.inserirFavorito(favorito(A, C), opcoesDoFavorito());
    await repositorio.inserirFavorito(favorito(B, A), opcoesDoFavorito());

    await repositorio.removerFavorito(A, B);
    await repositorio.removerFavorito(A, B);
    await repositorio.removerFavorito('nao-e-uuid', B);

    expect(
      (await repositorio.listarFavoritos(A)).map((f) => f.favoritoId),
    ).toEqual([C]);
    expect(
      (await repositorio.listarFavoritos(B)).map((f) => f.favoritoId),
    ).toEqual([A]);
  });

  it('CA92 — pelo caso de uso no Postgres: sem vínculo, 404; a si mesmo, 409; no teto de 200, 409 limite_de_favoritos', async () => {
    const verificador = new VerificadorDeVinculoEmMemoria([[A, B]]);
    const casos = criarCasosDeUsoDeAvaliacoes({
      repositorio,
      vinculoDeAvaliacao: new VinculoDeAvaliacaoEmMemoria(),
      verificadorDeVinculo: verificador,
      relogio: new RelogioFixo(INICIO),
    });
    await db()
      .insertInto('favoritos')
      .values(
        Array.from({ length: 199 }, (_, i) => ({
          dono_id: A,
          favorito_id: idDe(i + 1),
          criado_em: INICIO,
        })),
      )
      .execute();

    expect(await rejeicao(casos.favoritar(A, C))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect(await rejeicao(casos.favoritar(A, A))).toMatchObject({
      codigo: 'favorito_invalido',
    });
    await casos.favoritar(A, B);
    verificador.vincular(A, C);
    const erro = await rejeicao(casos.favoritar(A, C));
    expect(erro).toBeInstanceOf(ErroDeRegra);
    expect(erro).toMatchObject({ codigo: 'limite_de_favoritos' });
    expect(await repositorio.listarFavoritos(A)).toHaveLength(200);
  });
});

describe('exclusão e exportação da conta (D25, D26, CA93, ADR-005)', () => {
  const modulo = () =>
    criarModuloDeAvaliacoes({
      db: db(),
      vinculoDeAvaliacao: new VinculoDeAvaliacaoEmMemoria(),
      verificadorDeVinculo: new VerificadorDeVinculoEmMemoria(),
      relogio: new RelogioFixo(INICIO),
    });

  const excluir = (contaId: string) =>
    db()
      .transaction()
      .execute(async (trx) => {
        // Como a composição: a trava exclusiva da conta antes de tudo.
        await travarContaComExclusividade(trx, contaId);
        await modulo().excluirDadosDaConta(trx, contaId);
      });

  /**
   * B (a conta-alvo) avaliou A e C, foi avaliada por A e D, favoritou A e C
   * e foi favoritada por D. Entre A, C e D há linhas que não envolvem B.
   */
  async function cenario() {
    await gravar({
      trampoId: trampoDe(1),
      avaliadorId: B,
      avaliadoId: A,
      papel: 'contratante',
      nota: 4,
      destaques: ['pagamento_em_dia'],
      comentario: 'B sobre A',
      quando: minutos(1),
    });
    await gravar({
      trampoId: trampoDe(2),
      avaliadorId: B,
      avaliadoId: C,
      papel: 'freela',
      nota: 5,
      comentario: null,
      quando: minutos(2),
    });
    await gravar({
      trampoId: trampoDe(1),
      avaliadorId: A,
      avaliadoId: B,
      papel: 'freela',
      nota: 3,
      destaques: ['pontual', 'rapido'],
      comentario: 'TEXTO-DE-A-SOBRE-B',
      quando: minutos(3),
    });
    await gravar({
      trampoId: trampoDe(3),
      avaliadorId: D,
      avaliadoId: B,
      papel: 'contratante',
      nota: 2,
      comentario: 'TEXTO-DE-D-SOBRE-B',
      quando: minutos(4),
    });
    await gravar({
      trampoId: trampoDe(4),
      avaliadorId: A,
      avaliadoId: C,
      papel: 'freela',
      comentario: 'A sobre C',
      quando: minutos(5),
    });
    await repositorio.inserirFavorito(
      criarFavorito(B, A, minutos(6)),
      opcoesDoFavorito(),
    );
    await repositorio.inserirFavorito(
      criarFavorito(B, C, minutos(7)),
      opcoesDoFavorito(),
    );
    await repositorio.inserirFavorito(
      criarFavorito(D, B, minutos(8)),
      opcoesDoFavorito(),
    );
    await repositorio.inserirFavorito(
      criarFavorito(A, C, minutos(9)),
      opcoesDoFavorito(),
    );
  }

  async function linhas() {
    const avaliacoes = await db()
      .selectFrom('avaliacoes')
      .select(['avaliador_id', 'avaliado_id'])
      .orderBy('avaliador_id')
      .orderBy('avaliado_id')
      .execute();
    const favoritos = await db()
      .selectFrom('favoritos')
      .select(['dono_id', 'favorito_id'])
      .orderBy('dono_id')
      .orderBy('favorito_id')
      .execute();
    return { avaliacoes, favoritos };
  }

  it('CA93 — apaga as avaliações feitas e recebidas e os favoritos dos dois lados; o que não envolve a conta fica', async () => {
    await cenario();

    await excluir(B);

    expect(await linhas()).toEqual({
      avaliacoes: [{ avaliador_id: A, avaliado_id: C }],
      favoritos: [{ dono_id: A, favorito_id: C }],
    });
    // Repetir (a limpeza pela lápide, ADR-007) resolve sem erro.
    await excluir(B);
    expect((await linhas()).avaliacoes).toHaveLength(1);
  });

  it('CA93 — não abre transação própria: se a transação da composição desfaz, nada é apagado', async () => {
    await cenario();
    class Desfazer extends Error {}

    const erro = await rejeicao(
      db()
        .transaction()
        .execute(async (trx) => {
          await modulo().excluirDadosDaConta(trx, B);
          throw new Desfazer();
        }),
    );

    expect(erro).toBeInstanceOf(Desfazer);
    expect((await linhas()).avaliacoes).toHaveLength(5);
    expect((await linhas()).favoritos).toHaveLength(4);
  });

  it('CA93 — recusa conexão fora de transação e contaId fora do formato uuid, sem apagar nada', async () => {
    await cenario();

    expect(
      await rejeicao(modulo().excluirDadosDaConta(db(), B)),
    ).toBeInstanceOf(TypeError);
    expect(
      await rejeicao(
        db()
          .transaction()
          .execute((trx) => modulo().excluirDadosDaConta(trx, 'nao-e-uuid')),
      ),
    ).toBeInstanceOf(TypeError);
    expect((await linhas()).avaliacoes).toHaveLength(5);
  });

  it('CA93 — pega a trava exclusiva da conta mesmo se a composição não a pegou antes', async () => {
    const vistas: number[] = [];

    await db()
      .transaction()
      .execute(async (trx) => {
        await modulo().excluirDadosDaConta(trx, B);
        const { rows } = await sql<{ n: number }>`
          select count(*)::int as n from pg_locks
          where locktype = 'advisory' and mode = 'ExclusiveLock' and granted
            and pid = pg_backend_pid()
        `.execute(trx);
        vistas.push(rows[0]?.n ?? -1);
      });

    expect(vistas).toEqual([1]);
    expect(await travasConsultivas()).toBe(0);
  });

  it('D25 — Dado a exclusão de B com a trava exclusiva da conta, quando A avalia B ao mesmo tempo, então a gravação espera o commit, confere o vínculo depois dele e não grava nada (sem_vinculo)', async () => {
    let vinculo = true;
    let avaliacao: Promise<Desfecho> | undefined;

    await db()
      .transaction()
      .execute(async (trx) => {
        await travarContaComExclusividade(trx, B);
        avaliacao = acompanhar(
          repositorio.inserirAvaliacao(avaliacaoCom(), async () => vinculo),
        );
        await esperarAlguemNaTrava();
        await modulo().excluirDadosDaConta(trx, B);
        // A exclusão também apaga o vínculo (o trampo ou a candidatura).
        vinculo = false;
      });

    expect(await avaliacao).toEqual({ ok: true, valor: 'sem_vinculo' });
    expect(await contar('avaliacoes')).toBe(0);
  });

  it('D25 — Dado A avaliando B e já na conferência do vínculo, quando B se exclui, então a exclusão espera o commit e apaga a avaliação nova', async () => {
    let exclusao: Promise<Desfecho> | undefined;

    const resultado = await repositorio.inserirAvaliacao(
      avaliacaoCom(),
      async () => {
        exclusao = acompanhar(excluir(B));
        await esperarAlguemNaTrava();
        return true;
      },
    );

    expect(resultado).toBe('inserida');
    expect(await exclusao).toEqual({ ok: true, valor: undefined });
    expect(await contar('avaliacoes')).toBe(0);
  });

  it('D25 — Dado A favoritando B e já na conferência do vínculo, quando B se exclui, então a exclusão espera o commit e apaga o favorito novo', async () => {
    let exclusao: Promise<Desfecho> | undefined;

    const resultado = await repositorio.inserirFavorito(
      criarFavorito(A, B, INICIO),
      opcoesDoFavorito(200, async () => {
        exclusao = acompanhar(excluir(B));
        await esperarAlguemNaTrava();
        return true;
      }),
    );

    expect(resultado).toBe('inserido');
    expect(await exclusao).toEqual({ ok: true, valor: undefined });
    expect(await contar('favoritos')).toBe(0);
  });

  it('CA93 — exporta as feitas com comentário, as recebidas sem comentário e sem avaliador, e os favoritos, da mais antiga à mais nova', async () => {
    await cenario();

    const parte = await modulo().exportarDadosDaConta(B);

    expect(parte).toEqual({
      avaliacoesFeitas: [
        {
          trampoId: trampoDe(1),
          nota: 4,
          destaques: ['pagamento_em_dia'],
          comentario: 'B sobre A',
          criadaEm: minutos(1).toISOString(),
        },
        {
          trampoId: trampoDe(2),
          nota: 5,
          destaques: [],
          comentario: null,
          criadaEm: minutos(2).toISOString(),
        },
      ],
      avaliacoesRecebidas: [
        {
          nota: 3,
          destaques: ['pontual', 'rapido'],
          criadaEm: minutos(3).toISOString(),
        },
        { nota: 2, destaques: [], criadaEm: minutos(4).toISOString() },
      ],
      favoritos: [
        { contaId: A, criadoEm: minutos(6).toISOString() },
        { contaId: C, criadoEm: minutos(7).toISOString() },
      ],
    } satisfies ParteDeAvaliacoesNaExportacao);
    const json = JSON.stringify(parte);
    expect(json).not.toContain('TEXTO-DE-A-SOBRE-B');
    expect(json).not.toContain('TEXTO-DE-D-SOBRE-B');
    // Quem favoritou B (D) não aparece na exportação de B.
    expect(json).not.toContain(D);
  });

  it('CA93 — conta sem dados e id fora do formato exportam listas vazias', async () => {
    await cenario();
    const vazia = {
      avaliacoesFeitas: [],
      avaliacoesRecebidas: [],
      favoritos: [],
    };

    expect(await modulo().exportarDadosDaConta(randomUUID())).toEqual(vazia);
    expect(await modulo().exportarDadosDaConta('nao-e-uuid')).toEqual(vazia);
  });

  /** Bytes do JSON da parte exportada, sem o envelope. */
  function bytesDoJson(parte: ParteDeAvaliacoesNaExportacao): number {
    return Buffer.byteLength(JSON.stringify(parte));
  }

  it('CA93 — a medida soma as três partes, nunca fica abaixo do JSON exportado e cresce com o comentário feito', async () => {
    await cenario();

    const medida = await modulo().medirExportacao(B);
    const parte = await modulo().exportarDadosDaConta(B);

    // 2 feitas + 2 recebidas + 2 favoritos, 256 cada, mais os textos.
    const textos =
      Buffer.byteLength(JSON.stringify('B sobre A')) +
      Buffer.byteLength('pagamento_em_dia') +
      Buffer.byteLength('pontualrapido');
    expect(medida).toBe(6 * 256 + textos);
    expect(medida).toBeGreaterThanOrEqual(bytesDoJson(parte));

    await gravar({
      trampoId: trampoDe(9),
      avaliadorId: B,
      avaliadoId: D,
      comentario: '"\\\n'.repeat(160),
    });
    const depois = await modulo().medirExportacao(B);
    const parteDepois = await modulo().exportarDadosDaConta(B);
    expect(depois).toBeGreaterThan(medida);
    // Comentário cheio de escapes: a medida conta o texto já como JSON.
    expect(depois).toBeGreaterThanOrEqual(bytesDoJson(parteDepois));
  });

  it('CA93 — o comentário recebido (de terceiro) não entra na medida', async () => {
    await gravar({ avaliadorId: A, avaliadoId: B, comentario: null });
    const semComentario = await modulo().medirExportacao(B);
    await truncarTabelas(['avaliacoes']);
    await gravar({
      avaliadorId: A,
      avaliadoId: B,
      comentario: 'x'.repeat(500),
    });

    expect(await modulo().medirExportacao(B)).toBe(semComentario);
  });

  it('CA93 — conta sem dados mede 0, e id fora do formato uuid também', async () => {
    await cenario();

    expect(await modulo().medirExportacao(randomUUID())).toBe(0);
    expect(await modulo().medirExportacao('nao-e-uuid')).toBe(0);
  });
});
