import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bancoDeTeste, truncarTabelas } from './banco-teste.js';

const ESQUEMA = 'teste_truncar';

async function contar(tabela: string): Promise<number> {
  const { rows } = await sql<{ total: number }>`
    select count(*)::int as total from ${sql.table(tabela)}`.execute(
    bancoDeTeste(),
  );
  return rows[0]?.total ?? -1;
}

describe('truncarTabelas', () => {
  beforeAll(async () => {
    const db = bancoDeTeste();
    await sql`drop schema if exists ${sql.id(ESQUEMA)} cascade`.execute(db);
    await sql`create schema ${sql.id(ESQUEMA)}`.execute(db);
    await sql`create table ${sql.table(`${ESQUEMA}.pai`)} (id integer primary key)`.execute(
      db,
    );
    await sql`create table ${sql.table(`${ESQUEMA}.filho`)} (
      id integer, pai_id integer references ${sql.table(`${ESQUEMA}.pai`)} (id))`.execute(
      db,
    );
    await sql`create table ${sql.table(`${ESQUEMA}.outro_modulo`)} (id integer)`.execute(
      db,
    );
  });

  afterAll(async () => {
    await sql`drop schema if exists ${sql.id(ESQUEMA)} cascade`.execute(
      bancoDeTeste(),
    );
  });

  it('lista vazia não faz nada', async () => {
    await expect(truncarTabelas([])).resolves.toBeUndefined();
  });

  it('esvazia só as tabelas indicadas', async () => {
    const db = bancoDeTeste();
    await sql`insert into ${sql.table(`${ESQUEMA}.pai`)} values (1)`.execute(
      db,
    );
    await sql`insert into ${sql.table(`${ESQUEMA}.filho`)} values (1, 1)`.execute(
      db,
    );
    await sql`insert into ${sql.table(`${ESQUEMA}.outro_modulo`)} values (1)`.execute(
      db,
    );

    await truncarTabelas([`${ESQUEMA}.filho`, `${ESQUEMA}.pai`]);

    expect(await contar(`${ESQUEMA}.pai`)).toBe(0);
    expect(await contar(`${ESQUEMA}.filho`)).toBe(0);
    expect(await contar(`${ESQUEMA}.outro_modulo`)).toBe(1);
  });

  it('não usa cascade: tabela referenciada por FK de tabela não listada falha', async () => {
    await expect(truncarTabelas([`${ESQUEMA}.pai`])).rejects.toThrow();
  });
});
