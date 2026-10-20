/**
 * Banco de teste compartilhado pelos testes de integração (`*.integracao.test.ts`).
 *
 * O `test/setup-integracao.ts` conecta e migra antes de cada arquivo de teste;
 * os testes pegam a conexão com `bancoDeTeste()` e limpam só as tabelas do
 * próprio módulo com `truncarTabelas`, porque todos usam o mesmo banco.
 */
import { type Kysely, sql } from 'kysely';
import type { BancoBase } from '../src/compartilhado/banco/conexao.js';

let conexao: Kysely<BancoBase> | undefined;

/** Uso exclusivo do setup de integração. */
export function definirBancoDeTeste(db: Kysely<BancoBase> | undefined): void {
  conexao = db;
}

/** Conexão com o banco de teste, tipada com as tabelas do módulo que testa. */
export function bancoDeTeste<T = BancoBase>(): Kysely<T> {
  if (!conexao) {
    throw new Error(
      'Banco de teste indisponível: rode com `pnpm test:integracao` (que carrega test/setup-integracao.ts).',
    );
  }
  return conexao as unknown as Kysely<T>;
}

/**
 * Esvazia as tabelas indicadas (`truncate … restart identity`, sem cascade).
 * Liste todas as tabelas do módulo ligadas por FK. Lista vazia não faz nada.
 * Recusa rodar fora de um banco cujo nome termina em `_teste`.
 */
export async function truncarTabelas(
  tabelas: readonly string[],
): Promise<void> {
  if (tabelas.length === 0) {
    return;
  }
  const db = bancoDeTeste();
  const { rows } = await sql<{
    banco: string;
  }>`select current_database() as banco`.execute(db);
  if (!rows[0]?.banco.endsWith('_teste')) {
    throw new Error(
      'truncarTabelas só roda no banco de teste (nome terminado em _teste)',
    );
  }
  await sql`truncate table ${sql.join(tabelas.map((t) => sql.table(t)))} restart identity`.execute(
    db,
  );
}
