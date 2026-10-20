/**
 * Módulo `perfis`: tabela `perfis`, um perfil por conta (CA3, D9).
 *
 * - Sem FK para `contas`: `conta_id` é referência só por id (plano, "Banco").
 * - Toda a linha é dado pessoal (LGPD): os checks citam só nomes de coluna,
 *   nunca valores.
 * - Os limites por habilidade (2 a 30 caracteres, sem duplicadas) ficam no
 *   domínio; aqui só os tamanhos básicos.
 */
import { type Kysely, sql } from 'kysely';
import { removerTabelaSeVazia } from '../src/compartilhado/banco/migrador.js';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('perfis')
    .addColumn('conta_id', 'uuid', (c) => c.primaryKey())
    .addColumn('nome', 'text', (c) => c.notNull())
    .addColumn('cidade', 'text', (c) => c.notNull())
    .addColumn('cidade_normalizada', 'text', (c) => c.notNull())
    .addColumn('descricao', 'text')
    .addColumn('habilidades', sql`text[]`, (c) => c.notNull())
    .addColumn('atualizado_em', 'timestamptz', (c) => c.notNull())
    .addCheckConstraint(
      'perfis_nome_check',
      sql`char_length(nome) between 2 and 80`,
    )
    .addCheckConstraint(
      'perfis_cidade_check',
      sql`char_length(cidade) between 2 and 80 and cidade_normalizada <> ''`,
    )
    .addCheckConstraint(
      'perfis_descricao_check',
      sql`descricao is null or char_length(descricao) between 1 and 300`,
    )
    .addCheckConstraint(
      'perfis_habilidades_check',
      sql`array_ndims(habilidades) = 1 and cardinality(habilidades) between 1 and 10 and array_position(habilidades, null) is null`,
    )
    .execute();
}

/** Só remove a tabela vazia; com linhas, aborta e nada é desfeito. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await removerTabelaSeVazia(db, 'perfis');
}
