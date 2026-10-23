/**
 * Migração `0006_anuncios` (CA30, pré-lançamento L2): `encerrado` nos
 * trampos, `servicos.versao` e o `down` que nunca apaga nem converte dado.
 *
 * Todo `down`/`up` roda numa transação desfeita no fim (DDL é transacional no
 * Postgres), para o banco de teste compartilhado continuar migrado até a 0006.
 */
import { randomUUID } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { down, up } from '../migracoes/0006_anuncios.js';
import {
  criarModuloDeServicos,
  type OpcoesDoModuloDeServicos,
} from '../src/modulos/servicos/index.js';
import {
  criarModuloDeTrampos,
  type DependenciasDoModuloDeTrampos,
} from '../src/modulos/trampos/index.js';
import { bancoDeTeste, truncarTabelas } from './banco-teste.js';

const CONTA = '6a1f3c2e-9d4b-4e8a-b7c5-0f2e1d3c4b5a';
const OUTRA = '2b8e4d6f-1a3c-4b5d-9e7f-8a0c2e4f6b1d';
const CHECK_ANTIGA =
  "CHECK ((status = ANY (ARRAY['aberto'::text, 'em_andamento'::text])))";
const CHECK_NOVA =
  "CHECK ((status = ANY (ARRAY['aberto'::text, 'em_andamento'::text, 'encerrado'::text])))";
const MENSAGEM_DO_DOWN =
  '0006: há trampos encerrados; o down não apaga nem converte dados';

const db = () => bancoDeTeste<unknown>();

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

function inserirTrampo(
  conexao: Kysely<unknown>,
  dados: { id?: string; autorId?: string; status: string },
) {
  return sql`insert into trampos (id, autor_id, titulo, descricao, categoria,
      cidade, cidade_normalizada, texto_busca, valor_centavos, status,
      versao, criado_em)
    values (${dados.id ?? randomUUID()}, ${dados.autorId ?? CONTA},
      'Pintura da sala', 'Pintar duas paredes', 'reformas', 'Lavras',
      'lavras', 'pintura da sala pintar duas paredes', 15000, ${dados.status},
      1, now())`.execute(conexao);
}

/** Serviço como a 0003 grava (sem `versao`) ou com uma `versao` dada. */
function inserirServico(
  conexao: Kysely<unknown>,
  dados: { id?: string; autorId?: string; versao?: number } = {},
) {
  const colunas = sql`id, autor_id, titulo, descricao, categoria, cidade,
    cidade_normalizada, texto_busca, preco_base_centavos, status, criado_em`;
  const valores = sql`${dados.id ?? randomUUID()}, ${dados.autorId ?? CONTA},
    'Eletricista', 'Tomadas e chuveiros', 'reformas', null, null,
    'eletricista tomadas e chuveiros', 9000, 'ativo', now()`;
  return dados.versao === undefined
    ? sql`insert into servicos (${colunas}) values (${valores})`.execute(
        conexao,
      )
    : sql`insert into servicos (${colunas}, versao)
        values (${valores}, ${dados.versao})`.execute(conexao);
}

function inserirCandidatura(
  conexao: Kysely<unknown>,
  dados: { trampoId: string; freelancerId: string },
) {
  return sql`insert into candidaturas (id, trampo_id, freelancer_id, mensagem,
      valor_proposto_centavos, status, criada_em)
    values (${randomUUID()}, ${dados.trampoId}, ${dados.freelancerId},
      'Posso começar amanhã', 14000, 'pendente', now())`.execute(conexao);
}

async function checkDoStatus(conexao: Kysely<unknown>): Promise<string> {
  const { rows } = await sql<{ definicao: string }>`
    select pg_get_constraintdef(oid) as definicao from pg_constraint
    where conname = 'trampos_status_valido'`.execute(conexao);
  expect(rows).toHaveLength(1);
  return rows[0]?.definicao ?? '';
}

async function temColunaVersao(conexao: Kysely<unknown>): Promise<boolean> {
  const { rows } = await sql<{ existe: boolean }>`select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'servicos'
        and column_name = 'versao'
    ) as existe`.execute(conexao);
  return rows[0]?.existe === true;
}

async function versoesDosServicos(
  conexao: Kysely<unknown>,
): Promise<Record<string, number>> {
  const { rows } = await sql<{ id: string; versao: number }>`
    select id, versao from servicos order by id`.execute(conexao);
  return Object.fromEntries(rows.map((r) => [r.id, r.versao]));
}

async function statusDosTrampos(
  conexao: Kysely<unknown>,
): Promise<Record<string, string>> {
  const { rows } = await sql<{ id: string; status: string }>`
    select id, status from trampos order by id`.execute(conexao);
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

beforeEach(async () => {
  await truncarTabelas(['candidaturas', 'trampos']);
  await truncarTabelas(['servicos']);
});

describe('migração 0006_anuncios — up', () => {
  it('o migrador carrega a 0006 da pasta de migrações e a aplica', async () => {
    const { rows } = await sql<{ nome: string }>`
      select name as nome from kysely_migration
      where name = '0006_anuncios'`.execute(db());
    expect(rows).toEqual([{ nome: '0006_anuncios' }]);
    expect(await checkDoStatus(db())).toBe(CHECK_NOVA);
    expect(await temColunaVersao(db())).toBe(true);
  });

  it('trampos: aceita aberto, em_andamento e encerrado; recusa fechado', async () => {
    await inserirTrampo(db(), { status: 'aberto' });
    await inserirTrampo(db(), { status: 'em_andamento' });
    await inserirTrampo(db(), { status: 'encerrado' });

    expect(
      await rejeicao(inserirTrampo(db(), { status: 'fechado' })),
    ).toMatchObject({ code: '23514', constraint: 'trampos_status_valido' });
    expect(Object.values(await statusDosTrampos(db())).sort()).toEqual([
      'aberto',
      'em_andamento',
      'encerrado',
    ]);
  });

  it('servicos.versao: a linha que já existia antes do up fica com 1', async () => {
    const antigo = randomUUID();
    await emTransacaoDesfeita(async (trx) => {
      await down(trx);
      expect(await temColunaVersao(trx)).toBe(false);
      await inserirServico(trx, { id: antigo });

      await up(trx);

      expect(await versoesDosServicos(trx)).toEqual({ [antigo]: 1 });
    });
  });

  it('servicos.versao: nova linha sem versao ganha 1; zero, negativo e null são recusados', async () => {
    const id = randomUUID();
    await inserirServico(db(), { id });
    expect(await versoesDosServicos(db())).toEqual({ [id]: 1 });

    for (const versao of [0, -1]) {
      expect(await rejeicao(inserirServico(db(), { versao }))).toMatchObject({
        code: '23514',
        constraint: 'servicos_versao_positiva',
      });
    }
    expect(
      await rejeicao(
        sql`update servicos set versao = null where id = ${id}`.execute(db()),
      ),
    ).toMatchObject({ code: '23502', column: 'versao' });
  });
});

describe('migração 0006_anuncios — down', () => {
  it('com trampo encerrado, aborta antes de mudar qualquer coisa, com mensagem sem valor de dado', async () => {
    const encerrado = randomUUID();
    const aberto = randomUUID();
    const editado = randomUUID();
    await inserirTrampo(db(), { id: encerrado, status: 'encerrado' });
    await inserirTrampo(db(), { id: aberto, status: 'aberto' });
    await inserirServico(db(), { id: editado, versao: 3 });

    await emTransacaoDesfeita(async (trx) => {
      const erro = await rejeicao(down(trx));
      expect(erro).toMatchObject({
        name: 'ErroDownComTramposEncerrados',
        code: 'trampos_encerrados',
        message: MENSAGEM_DO_DOWN,
      });
      // Ainda dentro da transação (o erro é do `down`, não do banco): nada
      // mudou, nem antes do rollback.
      expect(await checkDoStatus(trx)).toBe(CHECK_NOVA);
      expect(await versoesDosServicos(trx)).toEqual({ [editado]: 3 });
      expect(await statusDosTrampos(trx)).toEqual({
        [encerrado]: 'encerrado',
        [aberto]: 'aberto',
      });
    });

    expect(await checkDoStatus(db())).toBe(CHECK_NOVA);
    expect(await versoesDosServicos(db())).toEqual({ [editado]: 3 });
    expect(await statusDosTrampos(db())).toEqual({
      [encerrado]: 'encerrado',
      [aberto]: 'aberto',
    });
  });

  it('fora de transação, abre a própria e também aborta com trampo encerrado', async () => {
    const encerrado = randomUUID();
    const editado = randomUUID();
    await inserirTrampo(db(), { id: encerrado, status: 'encerrado' });
    await inserirServico(db(), { id: editado, versao: 2 });

    expect(await rejeicao(down(db()))).toMatchObject({
      code: 'trampos_encerrados',
      message: MENSAGEM_DO_DOWN,
    });

    expect(await checkDoStatus(db())).toBe(CHECK_NOVA);
    expect(await versoesDosServicos(db())).toEqual({ [editado]: 2 });
    expect(await statusDosTrampos(db())).toEqual({ [encerrado]: 'encerrado' });
  });

  it('sem trampo encerrado, desce sem apagar linha e sobe de novo', async () => {
    const aberto = randomUUID();
    const emAndamento = randomUUID();
    const editado = randomUUID();
    await inserirTrampo(db(), { id: aberto, status: 'aberto' });
    await inserirTrampo(db(), { id: emAndamento, status: 'em_andamento' });
    await inserirServico(db(), { id: editado, versao: 4 });
    const trampos = { [aberto]: 'aberto', [emAndamento]: 'em_andamento' };

    await emTransacaoDesfeita(async (trx) => {
      await down(trx);
      expect(await checkDoStatus(trx)).toBe(CHECK_ANTIGA);
      expect(await temColunaVersao(trx)).toBe(false);
      expect(await statusDosTrampos(trx)).toEqual(trampos);
      const { rows } = await sql<{ id: string }>`
        select id from servicos`.execute(trx);
      expect(rows).toEqual([{ id: editado }]);

      await up(trx);
      expect(await checkDoStatus(trx)).toBe(CHECK_NOVA);
      // O down só derruba o contador: a versão recomeça em 1 (ver "Riscos").
      expect(await versoesDosServicos(trx)).toEqual({ [editado]: 1 });
      expect(await statusDosTrampos(trx)).toEqual(trampos);
    });

    expect(await checkDoStatus(db())).toBe(CHECK_NOVA);
    expect(await versoesDosServicos(db())).toEqual({ [editado]: 4 });
  });
});

describe('ADR-005 com a 0006 aplicada (CA30)', () => {
  const dbDeTrampos = (): DependenciasDoModuloDeTrampos['db'] => bancoDeTeste();
  const dbDeServicos = (): OpcoesDoModuloDeServicos['db'] => bancoDeTeste();
  const perfilCompleto = { perfilEstaCompleto: async () => true };
  const trampos = () =>
    criarModuloDeTrampos({
      db: dbDeTrampos(),
      verificadorDePerfil: perfilCompleto,
    });
  const servicos = () =>
    criarModuloDeServicos({
      db: dbDeServicos(),
      verificadorDePerfil: perfilCompleto,
    });

  it('exportação e exclusão de conta seguem completas com trampo encerrado e serviço editado', async () => {
    const encerrado = randomUUID();
    const daOutra = randomUUID();
    const editado = randomUUID();
    await inserirTrampo(db(), { id: encerrado, status: 'encerrado' });
    await inserirCandidatura(db(), {
      trampoId: encerrado,
      freelancerId: OUTRA,
    });
    await inserirTrampo(db(), {
      id: daOutra,
      autorId: OUTRA,
      status: 'aberto',
    });
    await inserirCandidatura(db(), { trampoId: daOutra, freelancerId: CONTA });
    await inserirServico(db(), { id: editado, versao: 2 });

    const parteDeTrampos = await trampos().exportarDadosDaConta(CONTA);
    expect(parteDeTrampos.trampos).toEqual([
      expect.objectContaining({
        id: encerrado,
        status: 'encerrado',
        candidaturasRecebidas: 1,
      }),
    ]);
    expect(parteDeTrampos.candidaturas).toEqual([
      expect.objectContaining({ trampoId: daOutra }),
    ]);
    // A exportação v1 não leva a versão (é só um contador).
    const parteDeServicos = await servicos().exportarDadosDaConta(CONTA);
    expect(parteDeServicos.servicos).toEqual([
      expect.objectContaining({ id: editado }),
    ]);
    expect(parteDeServicos.servicos[0]).not.toHaveProperty('versao');

    await dbDeTrampos()
      .transaction()
      .execute((trx) => trampos().excluirDadosDaConta(trx, CONTA));
    await dbDeServicos()
      .transaction()
      .execute((trx) => servicos().excluirDadosDaConta(trx, CONTA));

    expect(await statusDosTrampos(db())).toEqual({ [daOutra]: 'aberto' });
    const { rows } = await sql<{ total: number }>`
      select count(*)::int as total from candidaturas`.execute(db());
    expect(rows[0]?.total).toBe(0);
    expect(await versoesDosServicos(db())).toEqual({});
  });
});
