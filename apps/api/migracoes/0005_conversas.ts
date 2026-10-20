/**
 * Módulo `conversas`: tabelas `conversas` e `mensagens` (CA12, CA13).
 *
 * - `usuario_a_id`, `usuario_b_id` e `autor_id` apontam para contas só pelo id
 *   (sem FK entre módulos); a única FK é `mensagens.conversa_id`, dentro do
 *   módulo.
 * - O par é guardado em ordem (`usuario_a_id < usuario_b_id`) e é único: "A
 *   com B" e "B com A" são a mesma conversa, mesmo com duas aberturas
 *   simultâneas (a segunda recebe 23505 em `conversas_par_unico`).
 * - `mensagens.texto` é dado pessoal (LGPD).
 * - `mensagens.ordem` é a ordem de gravação (identity): desempata as mensagens
 *   do mesmo `enviada_em`, que o uuid aleatório do `id` não ordena.
 */
import { type Kysely, sql } from 'kysely';
import { removerTabelaSeVazia } from '../src/compartilhado/banco/migrador.js';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('conversas')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('usuario_a_id', 'uuid', (c) => c.notNull())
    .addColumn('usuario_b_id', 'uuid', (c) => c.notNull())
    .addColumn('criada_em', 'timestamptz', (c) => c.notNull())
    .addUniqueConstraint('conversas_par_unico', [
      'usuario_a_id',
      'usuario_b_id',
    ])
    .addCheckConstraint(
      'conversas_par_ordenado',
      sql`usuario_a_id < usuario_b_id`,
    )
    .execute();

  // "Minhas conversas" pelo lado B do par; o lado A usa o índice do `unique`.
  await db.schema
    .createIndex('conversas_usuario_b_idx')
    .on('conversas')
    .column('usuario_b_id')
    .execute();

  await db.schema
    .createTable('mensagens')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('conversa_id', 'uuid', (c) =>
      c.notNull().references('conversas.id'),
    )
    .addColumn('autor_id', 'uuid', (c) => c.notNull())
    .addColumn('texto', 'text', (c) => c.notNull())
    .addColumn('enviada_em', 'timestamptz', (c) => c.notNull())
    .addColumn('ordem', 'bigint', (c) =>
      c.notNull().generatedAlwaysAsIdentity(),
    )
    // Mesmo limite do domínio, em pontos de código (texto já aparado).
    .addCheckConstraint(
      'mensagens_texto_tamanho',
      sql`char_length(texto) between 1 and 2000`,
    )
    .execute();

  // Listagem cronológica com cursor `(enviada_em, ordem)` e última mensagem.
  await db.schema
    .createIndex('mensagens_conversa_enviada_em_idx')
    .on('mensagens')
    .columns(['conversa_id', 'enviada_em', 'ordem'])
    .execute();
}

/** Só remove tabela vazia; `mensagens` antes, por causa da FK. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await removerTabelaSeVazia(db, 'mensagens');
  await removerTabelaSeVazia(db, 'conversas');
}
