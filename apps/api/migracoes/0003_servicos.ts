/**
 * Módulo `servicos`: tabela `servicos` (CA6, CA7, D7).
 *
 * Sem FK para `contas`: `autor_id` é referência só por id (plano, "Banco").
 * `cidade` e `cidade_normalizada` são opcionais (D7), mas sempre juntas.
 */
import { type Kysely, sql } from 'kysely';
import { removerTabelaSeVazia } from '../src/compartilhado/banco/migrador.js';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('servicos')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('autor_id', 'uuid', (c) => c.notNull())
    .addColumn('titulo', 'text', (c) => c.notNull())
    .addColumn('descricao', 'text', (c) => c.notNull())
    .addColumn('categoria', 'text', (c) => c.notNull())
    .addColumn('cidade', 'text')
    .addColumn('cidade_normalizada', 'text')
    .addColumn('texto_busca', 'text', (c) => c.notNull())
    .addColumn('preco_base_centavos', 'integer', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('criado_em', 'timestamptz', (c) => c.notNull())
    .addCheckConstraint(
      'servicos_preco_base_centavos_check',
      sql`preco_base_centavos > 0`,
    )
    .addCheckConstraint('servicos_status_check', sql`status in ('ativo')`)
    .addCheckConstraint(
      'servicos_cidade_check',
      sql`(cidade is null) = (cidade_normalizada is null)`,
    )
    .execute();

  // Busca (CA7): ativos, mais recentes primeiro, com cursor `(criado_em, id)`.
  await db.schema
    .createIndex('servicos_busca_idx')
    .on('servicos')
    .columns(['status', 'criado_em desc', 'id desc'])
    .execute();

  // "Meus serviços": os do autor, mais recentes primeiro.
  await db.schema
    .createIndex('servicos_autor_idx')
    .on('servicos')
    .columns(['autor_id', 'criado_em desc', 'id desc'])
    .execute();
}

/** Só remove a tabela vazia; com linhas, aborta e nada é desfeito. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await removerTabelaSeVazia(db, 'servicos');
}
