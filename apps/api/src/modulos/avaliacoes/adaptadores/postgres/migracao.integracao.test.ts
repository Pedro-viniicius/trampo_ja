/**
 * Migração `0009_avaliacoes` (CA95, Visual V2b): as tabelas `avaliacoes` e
 * `favoritos`, as checks que sustentam CA87, CA88 e CA92 e o `down` que só
 * remove tabela vazia.
 *
 * Todo `down`/`up` roda numa transação desfeita no fim (DDL é transacional no
 * Postgres), para o banco de teste compartilhado continuar migrado até a 0009.
 */
import { randomUUID } from 'node:crypto';
import { type Kysely, type RawBuilder, sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { down, up } from '../../../../../migracoes/0009_avaliacoes.js';
import {
  bancoDeTeste,
  truncarTabelas,
} from '../../../../../test/banco-teste.js';
import { ErroTabelaNaoVazia } from '../../../../compartilhado/banco/migrador.js';
import type { TabelasDeAvaliacoes } from './tabelas.js';

const AUTOR = '6a1f3c2e-9d4b-4e8a-b7c5-0f2e1d3c4b5a';
const FREELA = '2b8e4d6f-1a3c-4b5d-9e7f-8a0c2e4f6b1d';
const TERCEIRO = '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const AGORA = new Date('2026-11-13T12:00:00.000Z');

const db = () => bancoDeTeste<unknown>();
const dbTipado = () => bancoDeTeste<TabelasDeAvaliacoes>();

/** Sentinela para desfazer a transação de um teste de `down`/`up`. */
class Desfazer extends Error {}

/** Roda `corpo` numa transação e a desfaz no fim, mesmo sem erro. */
async function emTransacaoDesfeita(
  corpo: (trx: Kysely<unknown>) => Promise<void>,
): Promise<void> {
  await expect(
    db()
      .transaction()
      .execute(async (trx) => {
        await corpo(trx);
        throw new Desfazer();
      }),
  ).rejects.toBeInstanceOf(Desfazer);
}

async function rejeicao(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava uma rejeição');
}

interface DadosDaAvaliacao {
  id?: string;
  trampoId?: string;
  avaliadorId?: string;
  avaliadoId?: string;
  papel?: string;
  nota?: number;
  /** Lista vira parâmetro `text[]`; `RawBuilder` entra como SQL literal. */
  destaques?: readonly string[] | RawBuilder<unknown>;
  comentario?: string | null;
}

/**
 * Insere uma avaliação crua (sem passar pelo tipo da tabela), para poder
 * mandar o que o domínio nunca mandaria. Sem `destaques`, usa o padrão.
 */
function inserirAvaliacao(
  conexao: Kysely<unknown>,
  dados: DadosDaAvaliacao = {},
) {
  const comuns = sql`${dados.id ?? randomUUID()}, ${dados.trampoId ?? randomUUID()},
    ${dados.avaliadorId ?? AUTOR}, ${dados.avaliadoId ?? FREELA},
    ${dados.papel ?? 'freela'}, ${dados.nota ?? 5},
    ${dados.comentario ?? null}, ${AGORA}`;
  const colunas = sql`id, trampo_id, avaliador_id, avaliado_id,
    papel_do_avaliado, nota, comentario, criada_em`;
  if (dados.destaques === undefined) {
    return sql`insert into avaliacoes (${colunas})
      values (${comuns})`.execute(conexao);
  }
  const destaques = Array.isArray(dados.destaques)
    ? sql`${dados.destaques}::text[]`
    : dados.destaques;
  return sql`insert into avaliacoes (${colunas}, destaques)
    values (${comuns}, ${destaques})`.execute(conexao);
}

function inserirFavorito(
  conexao: Kysely<unknown>,
  donoId: string,
  favoritoId: string,
) {
  return sql`insert into favoritos (dono_id, favorito_id, criado_em)
    values (${donoId}, ${favoritoId}, ${AGORA})`.execute(conexao);
}

async function tabelasExistem(conexao: Kysely<unknown>): Promise<string[]> {
  const { rows } = await sql<{ nome: string }>`
    select table_name as nome from information_schema.tables
    where table_schema = current_schema()
      and table_name in ('avaliacoes', 'favoritos')
    order by table_name`.execute(conexao);
  return rows.map((r) => r.nome);
}

async function contagens(
  conexao: Kysely<unknown>,
): Promise<{ avaliacoes: number; favoritos: number }> {
  const { rows } = await sql<{ avaliacoes: number; favoritos: number }>`
    select (select count(*)::int from avaliacoes) as avaliacoes,
      (select count(*)::int from favoritos) as favoritos`.execute(conexao);
  return rows[0] ?? { avaliacoes: -1, favoritos: -1 };
}

beforeEach(async () => {
  await truncarTabelas(['avaliacoes', 'favoritos']);
});

describe('migração 0009_avaliacoes — up', () => {
  it('o migrador carrega a 0009 da pasta de migrações e cria as duas tabelas e os índices', async () => {
    const { rows } = await sql<{ nome: string }>`
      select name as nome from kysely_migration
      where name = '0009_avaliacoes'`.execute(db());
    expect(rows).toEqual([{ nome: '0009_avaliacoes' }]);
    expect(await tabelasExistem(db())).toEqual(['avaliacoes', 'favoritos']);

    const { rows: indices } = await sql<{ nome: string; definicao: string }>`
      select indexname as nome, indexdef as definicao from pg_indexes
      where schemaname = current_schema()
        and tablename in ('avaliacoes', 'favoritos')
      order by indexname`.execute(db());
    expect(indices.map((i) => i.nome)).toEqual([
      'avaliacoes_avaliado_idx',
      'avaliacoes_avaliador_idx',
      'avaliacoes_pkey',
      'avaliacoes_trampo_avaliador_unico',
      'favoritos_favorito_idx',
      'favoritos_pkey',
    ]);
    const definicao = (nome: string) =>
      indices.find((i) => i.nome === nome)?.definicao;
    expect(definicao('avaliacoes_avaliado_idx')).toContain(
      '(avaliado_id, papel_do_avaliado, criada_em DESC, id DESC)',
    );
    expect(definicao('avaliacoes_trampo_avaliador_unico')).toContain(
      'UNIQUE INDEX avaliacoes_trampo_avaliador_unico ON public.avaliacoes USING btree (trampo_id, avaliador_id)',
    );
    expect(definicao('favoritos_pkey')).toContain('(dono_id, favorito_id)');
  });

  it('avaliação completa grava e volta com os tipos de TabelasDeAvaliacoes; sem destaques nem comentário, fica {} e null', async () => {
    const completa = randomUUID();
    const minima = randomUUID();
    const trampoId = randomUUID();
    await dbTipado()
      .insertInto('avaliacoes')
      .values([
        {
          id: completa,
          trampo_id: trampoId,
          avaliador_id: AUTOR,
          avaliado_id: FREELA,
          papel_do_avaliado: 'freela',
          nota: 4,
          destaques: ['pontual', 'educado'],
          comentario: 'Chegou cedo 👍',
          criada_em: AGORA,
        },
        {
          id: minima,
          trampo_id: trampoId,
          avaliador_id: FREELA,
          avaliado_id: AUTOR,
          papel_do_avaliado: 'contratante',
          nota: 1,
          comentario: null,
          criada_em: AGORA,
        },
      ])
      .execute();

    const linhas = await dbTipado()
      .selectFrom('avaliacoes')
      .selectAll()
      .orderBy('nota', 'desc')
      .execute();
    expect(linhas).toEqual([
      {
        id: completa,
        trampo_id: trampoId,
        avaliador_id: AUTOR,
        avaliado_id: FREELA,
        papel_do_avaliado: 'freela',
        nota: 4,
        destaques: ['pontual', 'educado'],
        comentario: 'Chegou cedo 👍',
        criada_em: AGORA,
      },
      {
        id: minima,
        trampo_id: trampoId,
        avaliador_id: FREELA,
        avaliado_id: AUTOR,
        papel_do_avaliado: 'contratante',
        nota: 1,
        destaques: [],
        comentario: null,
        criada_em: AGORA,
      },
    ]);
  });

  it('CA87 — uma avaliação por (trampo, avaliador): a segunda recebe 23505; outro avaliador ou outro trampo passam', async () => {
    const trampoId = randomUUID();
    await inserirAvaliacao(db(), { trampoId, avaliadorId: AUTOR });

    expect(
      await rejeicao(
        inserirAvaliacao(db(), {
          trampoId,
          avaliadorId: AUTOR,
          avaliadoId: TERCEIRO,
          nota: 2,
        }),
      ),
    ).toMatchObject({
      code: '23505',
      constraint: 'avaliacoes_trampo_avaliador_unico',
    });

    await inserirAvaliacao(db(), {
      trampoId,
      avaliadorId: FREELA,
      avaliadoId: AUTOR,
      papel: 'contratante',
    });
    await inserirAvaliacao(db(), { avaliadorId: AUTOR });
    expect(await contagens(db())).toEqual({ avaliacoes: 3, favoritos: 0 });
  });

  it('ninguém avalia a si mesmo (23514)', async () => {
    expect(
      await rejeicao(
        inserirAvaliacao(db(), { avaliadorId: AUTOR, avaliadoId: AUTOR }),
      ),
    ).toMatchObject({
      code: '23514',
      constraint: 'avaliacoes_avaliador_diferente_do_avaliado',
    });
  });

  it('papel do avaliado: só freela ou contratante', async () => {
    await inserirAvaliacao(db(), { papel: 'freela' });
    await inserirAvaliacao(db(), { papel: 'contratante' });
    for (const papel of ['empresa', 'Freela', '']) {
      expect(await rejeicao(inserirAvaliacao(db(), { papel }))).toMatchObject({
        code: '23514',
        constraint: 'avaliacoes_papel_do_avaliado_valido',
      });
    }
    expect(await contagens(db())).toEqual({ avaliacoes: 2, favoritos: 0 });
  });

  it('CA88 — nota: inteira de 1 a 5; 0, 6 e -1 são recusadas pela check e 2.5 nem vira smallint', async () => {
    for (const nota of [1, 2, 3, 4, 5]) {
      await inserirAvaliacao(db(), { nota });
    }
    for (const nota of [0, 6, -1]) {
      expect(await rejeicao(inserirAvaliacao(db(), { nota }))).toMatchObject({
        code: '23514',
        constraint: 'avaliacoes_nota_valida',
      });
    }
    expect(await rejeicao(inserirAvaliacao(db(), { nota: 2.5 }))).toMatchObject(
      { code: '22P02' },
    );
    expect(await contagens(db())).toEqual({ avaliacoes: 5, favoritos: 0 });
  });

  it('CA88 — destaques: vazio a 5 itens numa dimensão; 6 itens ou duas dimensões são recusados', async () => {
    const cinco = ['pontual', 'organizado', 'rapido', 'educado', 'proativo'];
    await inserirAvaliacao(db(), { destaques: [] });
    await inserirAvaliacao(db(), { destaques: ['pontual'] });
    await inserirAvaliacao(db(), { destaques: cinco });

    expect(
      await rejeicao(
        inserirAvaliacao(db(), { destaques: [...cinco, 'pontual'] }),
      ),
    ).toMatchObject({
      code: '23514',
      constraint: 'avaliacoes_destaques_validos',
    });
    expect(
      await rejeicao(
        inserirAvaliacao(db(), {
          destaques: sql`array[array['pontual'], array['rapido']]`,
        }),
      ),
    ).toMatchObject({
      code: '23514',
      constraint: 'avaliacoes_destaques_validos',
    });
    expect(
      await rejeicao(inserirAvaliacao(db(), { destaques: sql`null::text[]` })),
    ).toMatchObject({ code: '23502', column: 'destaques' });
    expect(await contagens(db())).toEqual({ avaliacoes: 3, favoritos: 0 });
  });

  it('CA88 — comentário: null ou de 1 a 500 pontos de código; vazio e 501 são recusados', async () => {
    // 500 emojis são 500 pontos de código, mas 1000 unidades UTF-16.
    await inserirAvaliacao(db(), { comentario: '😀'.repeat(500) });
    await inserirAvaliacao(db(), { comentario: 'a' });
    await inserirAvaliacao(db(), { comentario: null });

    for (const comentario of ['', '😀'.repeat(501), 'a'.repeat(501)]) {
      expect(
        await rejeicao(inserirAvaliacao(db(), { comentario })),
      ).toMatchObject({
        code: '23514',
        constraint: 'avaliacoes_comentario_tamanho',
      });
    }
    expect(await contagens(db())).toEqual({ avaliacoes: 3, favoritos: 0 });
  });

  it('colunas obrigatórias recusam null', async () => {
    const semNota = sql`insert into avaliacoes (id, trampo_id, avaliador_id,
        avaliado_id, papel_do_avaliado, nota, criada_em)
      values (${randomUUID()}, ${randomUUID()}, ${AUTOR}, ${FREELA}, 'freela',
        null, ${AGORA})`.execute(db());
    expect(await rejeicao(semNota)).toMatchObject({
      code: '23502',
      column: 'nota',
    });
    const semTrampo = sql`insert into avaliacoes (id, trampo_id, avaliador_id,
        avaliado_id, papel_do_avaliado, nota, criada_em)
      values (${randomUUID()}, null, ${AUTOR}, ${FREELA}, 'freela', 3,
        ${AGORA})`.execute(db());
    expect(await rejeicao(semTrampo)).toMatchObject({
      code: '23502',
      column: 'trampo_id',
    });
    const semData = sql`insert into favoritos (dono_id, favorito_id, criado_em)
      values (${AUTOR}, ${FREELA}, null)`.execute(db());
    expect(await rejeicao(semData)).toMatchObject({
      code: '23502',
      column: 'criado_em',
    });
  });

  it('CA92 — favorito: um por par (23505 na chave), o par inverso é outro favorito e ninguém favorita a si mesmo', async () => {
    await inserirFavorito(db(), AUTOR, FREELA);
    await inserirFavorito(db(), FREELA, AUTOR);
    await inserirFavorito(db(), AUTOR, TERCEIRO);

    expect(await rejeicao(inserirFavorito(db(), AUTOR, FREELA))).toMatchObject({
      code: '23505',
      constraint: 'favoritos_pkey',
    });
    expect(await rejeicao(inserirFavorito(db(), AUTOR, AUTOR))).toMatchObject({
      code: '23514',
      constraint: 'favoritos_dono_diferente_do_favorito',
    });

    const favoritos = await dbTipado()
      .selectFrom('favoritos')
      .selectAll()
      .execute();
    expect(favoritos).toHaveLength(3);
    expect(favoritos).toEqual(
      expect.arrayContaining([
        { dono_id: AUTOR, favorito_id: FREELA, criado_em: AGORA },
        { dono_id: FREELA, favorito_id: AUTOR, criado_em: AGORA },
        { dono_id: AUTOR, favorito_id: TERCEIRO, criado_em: AGORA },
      ]),
    );
  });
});

describe('migração 0009_avaliacoes — down (CA95)', () => {
  it('com linha em avaliacoes, aborta com ErroTabelaNaoVazia e nada se perde', async () => {
    await inserirAvaliacao(db(), { comentario: 'Ótimo trabalho' });

    const erro = await rejeicao(
      db()
        .transaction()
        .execute((trx) => down(trx)),
    );

    expect(erro).toBeInstanceOf(ErroTabelaNaoVazia);
    expect(erro).toMatchObject({
      code: 'tabela_nao_vazia',
      message: 'a tabela avaliacoes tem linhas; o down só remove tabela vazia',
    });
    expect(await tabelasExistem(db())).toEqual(['avaliacoes', 'favoritos']);
    expect(await contagens(db())).toEqual({ avaliacoes: 1, favoritos: 0 });
  });

  it('com linha só em favoritos, aborta e nada se perde', async () => {
    await inserirFavorito(db(), AUTOR, FREELA);

    const erro = await rejeicao(
      db()
        .transaction()
        .execute((trx) => down(trx)),
    );

    expect(erro).toBeInstanceOf(ErroTabelaNaoVazia);
    expect(erro).toMatchObject({
      message: 'a tabela favoritos tem linhas; o down só remove tabela vazia',
    });
    expect(await tabelasExistem(db())).toEqual(['avaliacoes', 'favoritos']);
    expect(await contagens(db())).toEqual({ avaliacoes: 0, favoritos: 1 });
  });

  it('fora de transação, abre a própria: com linha em avaliacoes, favoritos (vazia) não cai', async () => {
    await inserirAvaliacao(db());

    expect(await rejeicao(down(db()))).toBeInstanceOf(ErroTabelaNaoVazia);

    expect(await tabelasExistem(db())).toEqual(['avaliacoes', 'favoritos']);
    expect(await contagens(db())).toEqual({ avaliacoes: 1, favoritos: 0 });
  });

  it('com as duas vazias, remove as duas e o up recria (desfeito no fim)', async () => {
    await emTransacaoDesfeita(async (trx) => {
      await down(trx);
      expect(await tabelasExistem(trx)).toEqual([]);

      await up(trx);
      expect(await tabelasExistem(trx)).toEqual(['avaliacoes', 'favoritos']);
      await inserirAvaliacao(trx);
      await inserirFavorito(trx, AUTOR, FREELA);
    });

    expect(await tabelasExistem(db())).toEqual(['avaliacoes', 'favoritos']);
    expect(await contagens(db())).toEqual({ avaliacoes: 0, favoritos: 0 });
  });
});
