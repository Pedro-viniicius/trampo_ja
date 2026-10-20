import { type Kysely, sql } from 'kysely';
import { removerTabelaSeVazia } from '../src/compartilhado/banco/migrador.js';

/**
 * Módulo `trampos`: o agregado `Trampo` (tabela `trampos`) e as suas
 * candidaturas. `autor_id` e `freelancer_id` apontam para contas só pelo id
 * (sem FK entre módulos); a única FK é `candidaturas.trampo_id`, dentro do módulo.
 *
 * Concorrência: `versao` é a trava otimista do agregado (o repositório grava com
 * `where versao = <lida>`), e `candidaturas_trampo_freelancer_unico` barra a
 * segunda candidatura do mesmo freelancer mesmo fora do agregado.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('trampos')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('autor_id', 'uuid', (c) => c.notNull())
    .addColumn('titulo', 'text', (c) => c.notNull())
    .addColumn('descricao', 'text', (c) => c.notNull())
    .addColumn('categoria', 'text', (c) => c.notNull())
    .addColumn('cidade', 'text', (c) => c.notNull())
    .addColumn('cidade_normalizada', 'text', (c) => c.notNull())
    .addColumn('texto_busca', 'text', (c) => c.notNull())
    .addColumn('valor_centavos', 'integer', (c) => c.notNull())
    .addColumn('prazo', 'date')
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('versao', 'integer', (c) => c.notNull())
    .addColumn('criado_em', 'timestamptz', (c) => c.notNull())
    .addCheckConstraint(
      'trampos_valor_centavos_positivo',
      sql`valor_centavos > 0`,
    )
    .addCheckConstraint(
      'trampos_status_valido',
      sql`status in ('aberto', 'em_andamento')`,
    )
    .execute();

  // Busca (CA7): só trampos abertos, mais recentes primeiro.
  await sql`create index trampos_status_criado_em_idx
    on trampos (status, criado_em desc)`.execute(db);

  await db.schema
    .createTable('candidaturas')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('trampo_id', 'uuid', (c) => c.notNull().references('trampos.id'))
    .addColumn('freelancer_id', 'uuid', (c) => c.notNull())
    .addColumn('mensagem', 'text', (c) => c.notNull())
    .addColumn('valor_proposto_centavos', 'integer', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('criada_em', 'timestamptz', (c) => c.notNull())
    .addCheckConstraint(
      'candidaturas_valor_proposto_centavos_positivo',
      sql`valor_proposto_centavos > 0`,
    )
    .addCheckConstraint(
      'candidaturas_status_valido',
      sql`status in ('pendente', 'aceita', 'recusada')`,
    )
    .addUniqueConstraint('candidaturas_trampo_freelancer_unico', [
      'trampo_id',
      'freelancer_id',
    ])
    .execute();
}

/** Só remove tabela vazia; `candidaturas` antes, por causa da FK. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await removerTabelaSeVazia(db, 'candidaturas');
  await removerTabelaSeVazia(db, 'trampos');
}
