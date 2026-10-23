import { type Kysely, sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { down } from '../../../../../migracoes/0004_perfis.js';
import {
  bancoDeTeste,
  truncarTabelas,
} from '../../../../../test/banco-teste.js';
import { ErroTabelaNaoVazia } from '../../../../compartilhado/banco/migrador.js';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarCasosDeUsoDePerfis } from '../../aplicacao/casos-de-uso.js';
import { type EntradaDePerfil, Perfil } from '../../dominio/perfil.js';
import { criarModuloDePerfis } from '../../index.js';
import {
  excluirDadosDaConta,
  RepositorioDePerfisPostgres,
} from './repositorio-postgres.js';
import type { TabelasDePerfis } from './tabelas.js';

const MARIA = '7d3c2f0e-0b4f-4a57-9f7a-2a4c1d9e8b10';
const JOAO = '1f9e8d7c-6b5a-4c3d-8e2f-0a1b2c3d4e5f';
const INICIO = new Date('2026-10-20T12:00:00.000Z');

const ENTRADA: EntradaDePerfil = {
  nome: 'Conceição Araújo Müller',
  cidade: 'São João del-Rei',
  descricao: 'Pedreira e azulejista; faço reboco, contrapiso e acabamento.',
  habilidades: ['Alvenaria', 'Azulejo e piso', 'Elétrica básica'],
};

function perfil(
  dados: Partial<Record<keyof EntradaDePerfil, unknown>> = {},
  opcoes: { contaId?: string; minutos?: number } = {},
): Perfil {
  return Perfil.criar(
    { ...ENTRADA, ...dados },
    {
      contaId: opcoes.contaId ?? MARIA,
      agora: new Date(INICIO.getTime() + (opcoes.minutos ?? 0) * 60_000),
    },
  );
}

/** Campos do perfil como objeto simples (inclui o getter `atualizadoEm`). */
function dadosDe(p: Perfil | null) {
  return p === null
    ? null
    : {
        contaId: p.contaId,
        nome: p.nome,
        cidade: p.cidade,
        cidadeNormalizada: p.cidadeNormalizada,
        descricao: p.descricao,
        habilidades: [...p.habilidades],
        atualizadoEm: p.atualizadoEm.toISOString(),
        completo: p.completo,
      };
}

const db = () => bancoDeTeste<TabelasDePerfis>();
let repositorio: RepositorioDePerfisPostgres;

async function contarLinhas(): Promise<number> {
  const { rows } = await sql<{
    total: number;
  }>`select count(*)::int as total from perfis`.execute(db());
  return rows[0]?.total ?? -1;
}

beforeEach(async () => {
  await truncarTabelas(['perfis']);
  repositorio = new RepositorioDePerfisPostgres(db());
});

describe('RepositorioDePerfisPostgres — ida e volta', () => {
  it('CA3 — salva e lê de volta o perfil com acentos e cedilha, igual ao do domínio', async () => {
    const original = perfil();
    await repositorio.salvar(original);

    const lido = await repositorio.buscarPorConta(MARIA);

    expect(lido).toBeInstanceOf(Perfil);
    expect(dadosDe(lido)).toEqual(dadosDe(original));
    expect(lido?.cidadeNormalizada).toBe('sao joao del-rei');
    expect(lido?.completo).toBe(true);
  });

  it('perfil sem descrição grava null e volta sem a propriedade', async () => {
    await repositorio.salvar(perfil({ descricao: undefined }));

    const lido = await repositorio.buscarPorConta(MARIA);

    expect(lido).not.toHaveProperty('descricao');
    const { rows } = await sql<{
      descricao: string | null;
    }>`select descricao from perfis`.execute(db());
    expect(rows).toEqual([{ descricao: null }]);
  });

  it('habilidades com aspas, vírgula e chaves voltam iguais (text[] parametrizado)', async () => {
    const habilidades = [
      'Pintura "fina"',
      'Gesso, drywall',
      '{chaves}',
      'a\\b',
    ];
    await repositorio.salvar(perfil({ habilidades }));

    expect((await repositorio.buscarPorConta(MARIA))?.habilidades).toEqual(
      habilidades,
    );
  });

  it('buscarPorConta devolve null para conta sem perfil e para id fora do formato uuid', async () => {
    await repositorio.salvar(perfil());

    expect(await repositorio.buscarPorConta(JOAO)).toBeNull();
    expect(await repositorio.buscarPorConta('conta-qualquer')).toBeNull();
    expect(await repositorio.buscarPorConta("' or 1=1 --")).toBeNull();
    expect(await repositorio.buscarPorConta('')).toBeNull();
  });
});

describe('RepositorioDePerfisPostgres — upsert', () => {
  it('CA3 — salvar de novo substitui a linha da conta, sem duplicar', async () => {
    await repositorio.salvar(perfil());
    await repositorio.salvar(perfil({}, { contaId: JOAO }));

    const novo = perfil(
      {
        nome: 'Conceição A. Müller',
        cidade: 'Recife',
        descricao: null,
        habilidades: ['Gesso'],
      },
      { minutos: 5 },
    );
    await repositorio.salvar(novo);

    expect(await contarLinhas()).toBe(2);
    expect(dadosDe(await repositorio.buscarPorConta(MARIA))).toEqual(
      dadosDe(novo),
    );
    expect(
      (await repositorio.buscarPorConta(MARIA))?.descricao,
    ).toBeUndefined();
    // A outra conta não muda.
    expect((await repositorio.buscarPorConta(JOAO))?.nome).toBe(
      'Conceição Araújo Müller',
    );
  });

  it('duas gravações simultâneas da mesma conta terminam numa linha só', async () => {
    await Promise.all([
      repositorio.salvar(perfil({ nome: 'Versão A' })),
      repositorio.salvar(perfil({ nome: 'Versão B' })),
    ]);

    expect(await contarLinhas()).toBe(1);
    expect(['Versão A', 'Versão B']).toContain(
      (await repositorio.buscarPorConta(MARIA))?.nome,
    );
  });
});

describe('D9 — perfilEstaCompleto com o repositório Postgres', () => {
  const casos = () =>
    criarCasosDeUsoDePerfis({
      repositorio,
      relogio: new RelogioFixo(INICIO),
    });

  it('D9 — falso sem linha, verdadeiro depois de salvar o perfil completo', async () => {
    expect(await casos().perfilEstaCompleto(MARIA)).toBe(false);

    await casos().salvarMeuPerfil(MARIA, ENTRADA);

    expect(await casos().perfilEstaCompleto(MARIA)).toBe(true);
    expect(await casos().perfilEstaCompleto(JOAO)).toBe(false);
  });

  it('D9 — falso para id fora do formato uuid, sem erro do banco', async () => {
    expect(await casos().perfilEstaCompleto('nao-e-uuid')).toBe(false);
  });
});

describe('migração 0004_perfis', () => {
  async function inserirLinha(
    alteracao: Record<string, unknown>,
  ): Promise<unknown> {
    const linha = {
      conta_id: MARIA,
      nome: 'Ana',
      cidade: 'Recife',
      cidade_normalizada: 'recife',
      descricao: null,
      habilidades: ['Gesso'],
      atualizado_em: INICIO,
      ...alteracao,
    };
    try {
      await (db() as unknown as Kysely<Record<string, Record<string, unknown>>>)
        .insertInto('perfis')
        .values(linha)
        .execute();
    } catch (erro) {
      return erro;
    }
    return undefined;
  }

  it.each([
    ['nome curto', { nome: 'A' }, 'perfis_nome_check'],
    ['nome longo', { nome: 'a'.repeat(81) }, 'perfis_nome_check'],
    ['cidade curta', { cidade: 'R' }, 'perfis_cidade_check'],
    [
      'cidade normalizada vazia',
      { cidade_normalizada: '' },
      'perfis_cidade_check',
    ],
    ['descrição vazia', { descricao: '' }, 'perfis_descricao_check'],
    [
      'descrição longa',
      { descricao: 'a'.repeat(301) },
      'perfis_descricao_check',
    ],
    ['sem habilidades', { habilidades: [] }, 'perfis_habilidades_check'],
    [
      'onze habilidades',
      { habilidades: Array.from({ length: 11 }, (_, i) => `h${i}`) },
      'perfis_habilidades_check',
    ],
    [
      'habilidade nula',
      { habilidades: ['Gesso', null] },
      'perfis_habilidades_check',
    ],
  ])('o banco recusa %s', async (_nome, alteracao, restricao) => {
    const erro = await inserirLinha(alteracao);
    expect(erro).toMatchObject({ code: '23514', constraint: restricao });
  });

  it('o banco aceita a linha válida, com e sem descrição, e recusa conta repetida', async () => {
    expect(await inserirLinha({})).toBeUndefined();
    expect(
      await inserirLinha({ conta_id: JOAO, descricao: 'a'.repeat(300) }),
    ).toBeUndefined();
    expect(await inserirLinha({})).toMatchObject({
      code: '23505',
      constraint: 'perfis_pkey',
    });
  });

  it('o down aborta com a tabela cheia e não apaga nada', async () => {
    await repositorio.salvar(perfil());

    await expect(
      db()
        .transaction()
        .execute((trx) => down(trx as unknown as Kysely<unknown>)),
    ).rejects.toBeInstanceOf(ErroTabelaNaoVazia);
    expect(await repositorio.buscarPorConta(MARIA)).not.toBeNull();
  });

  it('o down remove a tabela vazia (dentro de uma transação desfeita)', async () => {
    class Desfazer extends Error {}
    let existiaDepoisDoDown: unknown;

    await expect(
      db()
        .transaction()
        .execute(async (trx) => {
          await down(trx as unknown as Kysely<unknown>);
          const { rows } = await sql<{
            existe: string | null;
          }>`select to_regclass('perfis')::text as existe`.execute(trx);
          existiaDepoisDoDown = rows[0]?.existe;
          throw new Desfazer();
        }),
    ).rejects.toBeInstanceOf(Desfazer);

    expect(existiaDepoisDoDown).toBeNull();
    expect(await contarLinhas()).toBe(0);
  });
});

describe('exclusão e exportação da conta (D25, D26, ADR-005)', () => {
  const modulo = () => criarModuloDePerfis({ db: db() });

  /** Captura o erro lançado pela promessa (falha se ela resolver). */
  async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
    try {
      await promessa;
    } catch (erro) {
      return erro;
    }
    throw new Error('era esperada uma recusa');
  }

  it('CA17/CA18 — apaga só o perfil da conta-alvo, na transação recebida; o da outra conta fica intacto', async () => {
    await repositorio.salvar(perfil());
    await repositorio.salvar(
      perfil({ nome: 'João Batista' }, { contaId: JOAO }),
    );

    await db()
      .transaction()
      .execute((trx) => modulo().excluirDadosDaConta(trx, MARIA));

    expect(await repositorio.buscarPorConta(MARIA)).toBeNull();
    expect((await repositorio.buscarPorConta(JOAO))?.nome).toBe('João Batista');
    expect(await contarLinhas()).toBe(1);
  });

  it('não abre transação própria: se a transação da composição desfaz, o perfil continua', async () => {
    await repositorio.salvar(perfil());
    class Desfazer extends Error {}

    await expect(
      db()
        .transaction()
        .execute(async (trx) => {
          await excluirDadosDaConta(trx, MARIA);
          throw new Desfazer();
        }),
    ).rejects.toBeInstanceOf(Desfazer);

    expect(await repositorio.buscarPorConta(MARIA)).not.toBeNull();
  });

  it('recusa conexão fora de transação e contaId fora do formato uuid, sem apagar nada', async () => {
    await repositorio.salvar(perfil());
    await repositorio.salvar(perfil({}, { contaId: JOAO }));

    expect(await erroDe(excluirDadosDaConta(db(), MARIA))).toBeInstanceOf(
      TypeError,
    );
    for (const invalido of ['', 'nao-e-uuid', "' or 1=1 --"]) {
      const erro = await erroDe(
        db()
          .transaction()
          .execute((trx) => excluirDadosDaConta(trx, invalido)),
      );
      expect(erro).toBeInstanceOf(TypeError);
    }
    expect(await contarLinhas()).toBe(2);
  });

  it('conta sem perfil (ou segundo pedido): resolve sem erro e não mexe na outra', async () => {
    await repositorio.salvar(perfil({}, { contaId: JOAO }));

    await db()
      .transaction()
      .execute((trx) => excluirDadosDaConta(trx, MARIA));

    expect(await contarLinhas()).toBe(1);
  });

  it('CA19 — exporta só o perfil da conta, sem a coluna derivada cidade_normalizada', async () => {
    await repositorio.salvar(perfil());
    await repositorio.salvar(
      perfil(
        { nome: 'João Batista', descricao: 'TEXTO-DE-TERCEIRO' },
        { contaId: JOAO },
      ),
    );

    const exportado = await modulo().exportarDadosDaConta(MARIA);

    expect(exportado).toEqual({
      perfil: {
        nome: 'Conceição Araújo Müller',
        cidade: 'São João del-Rei',
        descricao:
          'Pedreira e azulejista; faço reboco, contrapiso e acabamento.',
        habilidades: ['Alvenaria', 'Azulejo e piso', 'Elétrica básica'],
        atualizadoEm: '2026-10-20T12:00:00.000Z',
      },
    });
    expect(JSON.stringify(exportado)).not.toContain('TEXTO-DE-TERCEIRO');
    expect(JSON.stringify(exportado)).not.toContain('sao joao');
  });

  it('CA19 — perfil sem descrição sai com descricao null; conta sem perfil e id fora do formato saem com perfil null', async () => {
    await repositorio.salvar(perfil({ descricao: undefined }));

    expect(
      (await modulo().exportarDadosDaConta(MARIA)).perfil?.descricao,
    ).toBeNull();
    expect(await modulo().exportarDadosDaConta(JOAO)).toEqual({ perfil: null });
    expect(await modulo().exportarDadosDaConta('nao-e-uuid')).toEqual({
      perfil: null,
    });
  });
});
