import type { Kysely } from 'kysely';
import { removerTabelaSeVazia } from '../src/compartilhado/banco/migrador.js';

/**
 * Módulo `contas`, pré-lançamento L3 (D40, ADR-007): lápide da conta
 * excluída.
 *
 * - `contas_excluidas` guarda só o id da conta e a data da exclusão, nada de
 *   dado pessoal. A transação da exclusão (ADR-005) grava a lápide; a limpeza
 *   periódica refaz a exclusão de cada lápide com 10 min ou mais (para apagar
 *   o que uma escrita em voo gravou depois) e a apaga. Uma lápide vive de 10
 *   a cerca de 70 min.
 * - Sem FK: a conta já não existe quando a lápide é lida.
 * - Sem índice em `excluida_em`: a tabela só tem as exclusões da última hora.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('contas_excluidas')
    .addColumn('id', 'uuid', (coluna) => coluna.primaryKey())
    .addColumn('excluida_em', 'timestamptz', (coluna) => coluna.notNull())
    .execute();
}

/**
 * Só remove a tabela vazia: com lápide, a exclusão daquela conta ainda não foi
 * refeita. Rode a limpeza (ou espere a lápide mais nova passar dos 10 min) e
 * tente de novo.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await removerTabelaSeVazia(db, 'contas_excluidas');
}
