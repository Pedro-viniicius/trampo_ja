import { type Kysely, sql } from 'kysely';
import { removerTabelaSeVazia } from '../src/compartilhado/banco/migrador.js';

/**
 * Módulo `contas`: contas de acesso e sessões.
 *
 * - `contas.email` chega aparado e em minúsculas (objeto de valor `Email`). A
 *   unicidade é a constraint `contas_email_key`: o repositório reconhece a
 *   violação (23505) por esse nome e a converte em `email_em_uso`.
 * - `sessoes` guarda só o SHA-256 (hex) do token; o check recusa qualquer
 *   outra coisa, para que um token em texto puro nunca seja gravado.
 * - Sem FK para tabela de outro módulo.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('contas')
    .addColumn('id', 'uuid', (coluna) => coluna.primaryKey())
    .addColumn('email', 'text', (coluna) => coluna.notNull())
    .addColumn('senha_hash', 'text', (coluna) => coluna.notNull())
    .addColumn('criada_em', 'timestamptz', (coluna) => coluna.notNull())
    .addUniqueConstraint('contas_email_key', ['email'])
    .execute();

  await db.schema
    .createTable('sessoes')
    .addColumn('token_hash', 'text', (coluna) => coluna.primaryKey())
    .addColumn('conta_id', 'uuid', (coluna) =>
      coluna.notNull().references('contas.id').onDelete('cascade'),
    )
    .addColumn('expira_em', 'timestamptz', (coluna) => coluna.notNull())
    .addColumn('criada_em', 'timestamptz', (coluna) =>
      coluna.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      'sessoes_token_hash_sha256',
      sql`token_hash ~ '^[0-9a-f]{64}$'`,
    )
    .execute();

  await db.schema
    .createIndex('sessoes_conta_id_idx')
    .on('sessoes')
    .column('conta_id')
    .execute();
}

/** Só remove tabela vazia; `sessoes` antes, porque referencia `contas`. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await removerTabelaSeVazia(db, 'sessoes');
  await removerTabelaSeVazia(db, 'contas');
}
