import { type Kysely, sql } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely/migration';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bancoDeTeste } from '../../../test/banco-teste.js';
import {
  ErroDeMigracao,
  ErroTabelaNaoVazia,
  migrarParaOFim,
  removerTabelaSeVazia,
  reverterUma,
} from './migrador.js';

// Tudo neste arquivo roda num esquema próprio, com a tabela de controle das
// migrações também nele, para não tocar nas migrações reais do banco de teste.
const ESQUEMA = 'teste_migrador';

function provedor(migracoes: Record<string, Migration>): MigrationProvider {
  return { getMigrations: async () => migracoes };
}

const criarTabela = (nome: string): Migration => ({
  up: async (db: Kysely<unknown>) => {
    await db.schema
      .withSchema(ESQUEMA)
      .createTable(nome)
      .addColumn('id', 'integer')
      .execute();
  },
  down: async (db: Kysely<unknown>) => {
    await removerTabelaSeVazia(db, `${ESQUEMA}.${nome}`);
  },
});

const MIGRACOES = {
  '0001_alfa': criarTabela('alfa'),
  '0002_beta': criarTabela('beta'),
};

async function tabelasDoEsquema(): Promise<string[]> {
  const { rows } = await sql<{ nome: string }>`
    select table_name as nome from information_schema.tables
    where table_schema = ${ESQUEMA} and table_name not like 'kysely_%'
    order by table_name`.execute(bancoDeTeste());
  return rows.map((r) => r.nome);
}

describe('migrador', () => {
  const db = () => bancoDeTeste();
  const opcoes = { provedor: provedor(MIGRACOES), esquema: ESQUEMA };

  beforeEach(async () => {
    await sql`drop schema if exists ${sql.id(ESQUEMA)} cascade`.execute(db());
    await sql`create schema ${sql.id(ESQUEMA)}`.execute(db());
  });

  afterAll(async () => {
    await sql`drop schema if exists ${sql.id(ESQUEMA)} cascade`.execute(db());
  });

  it('migrarParaOFim aplica as pendentes em ordem e, sem pendentes, não faz nada', async () => {
    expect(await migrarParaOFim(db(), opcoes)).toEqual([
      { nome: '0001_alfa', direcao: 'subiu' },
      { nome: '0002_beta', direcao: 'subiu' },
    ]);
    expect(await tabelasDoEsquema()).toEqual(['alfa', 'beta']);

    expect(await migrarParaOFim(db(), opcoes)).toEqual([]);
  });

  it('reverterUma desfaz só a última e, sem nada aplicado, não faz nada', async () => {
    await migrarParaOFim(db(), opcoes);

    expect(await reverterUma(db(), opcoes)).toEqual([
      { nome: '0002_beta', direcao: 'desceu' },
    ]);
    expect(await tabelasDoEsquema()).toEqual(['alfa']);

    await reverterUma(db(), opcoes);
    expect(await reverterUma(db(), opcoes)).toEqual([]);
    expect(await tabelasDoEsquema()).toEqual([]);
  });

  it('o down aborta se a tabela tem linhas e mantém tabela e dados', async () => {
    await migrarParaOFim(db(), opcoes);
    await sql`insert into ${sql.table(`${ESQUEMA}.beta`)} (id) values (1)`.execute(
      db(),
    );

    const erro = await reverterUma(db(), opcoes).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeMigracao);
    expect((erro as ErroDeMigracao).migracao).toBe('0002_beta');
    expect((erro as ErroDeMigracao).codigo).toBe('tabela_nao_vazia');
    expect(await tabelasDoEsquema()).toEqual(['alfa', 'beta']);
  });

  it('removerTabelaSeVazia remove tabela vazia e recusa tabela com linhas', async () => {
    const tabela = `${ESQUEMA}.gama`;
    await sql`create table ${sql.table(tabela)} (id integer)`.execute(db());
    await sql`insert into ${sql.table(tabela)} (id) values (1)`.execute(db());

    await expect(removerTabelaSeVazia(db(), tabela)).rejects.toBeInstanceOf(
      ErroTabelaNaoVazia,
    );
    expect(await tabelasDoEsquema()).toEqual(['gama']);

    await sql`delete from ${sql.table(tabela)}`.execute(db());
    await removerTabelaSeVazia(db(), tabela);
    expect(await tabelasDoEsquema()).toEqual([]);
  });

  it('CA15 — a falha de migração não carrega a mensagem do driver, que pode ter valores', async () => {
    const quebrada = provedor({
      '0001_quebrada': {
        up: async (banco: Kysely<unknown>) => {
          await sql`select ${'maria.silva@exemplo.com'}::integer`.execute(
            banco,
          );
        },
      },
    });

    const erro = await migrarParaOFim(db(), {
      provedor: quebrada,
      esquema: ESQUEMA,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeMigracao);
    expect((erro as ErroDeMigracao).migracao).toBe('0001_quebrada');
    expect((erro as ErroDeMigracao).codigo).toBe('22P02');
    expect(String(erro)).not.toContain('maria');
    expect(JSON.stringify(erro)).not.toContain('maria');
    expect((erro as Error).cause).toBeUndefined();
  });
});
