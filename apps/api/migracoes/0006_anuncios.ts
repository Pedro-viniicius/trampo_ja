/**
 * Pré-lançamento L2 (anúncios): o trampo ganha o status final `encerrado`
 * (CA27, D30) e o serviço ganha a trava otimista `versao` (CA26).
 *
 * - `up`: troca a check `trampos_status_valido` para aceitar `encerrado` e
 *   cria `servicos.versao integer not null default 1` (check
 *   `servicos_versao_positiva`). As linhas que já existem ficam com 1.
 * - `down`: nunca apaga nem converte dado. Com algum trampo `encerrado`,
 *   aborta com `ErroDownComTramposEncerrados` antes de mudar qualquer coisa
 *   (converter o status seria decisão do dono). Sem nenhum, restaura a check
 *   antiga e remove `servicos.versao`, que é só um contador, sem dado de
 *   pessoa.
 */
import { type Kysely, sql } from 'kysely';

/**
 * Erro do `down` com trampo encerrado. A mensagem é fixa, sem nenhum valor de
 * linha; o `code` aparece na saída do `migrar` (via `ErroDeMigracao`).
 */
class ErroDownComTramposEncerrados extends Error {
  readonly code = 'trampos_encerrados';

  constructor() {
    super('0006: há trampos encerrados; o down não apaga nem converte dados');
    this.name = 'ErroDownComTramposEncerrados';
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table trampos
    drop constraint trampos_status_valido,
    add constraint trampos_status_valido
      check (status in ('aberto', 'em_andamento', 'encerrado'))`.execute(db);

  await db.schema
    .alterTable('servicos')
    .addColumn('versao', 'integer', (c) => c.notNull().defaultTo(1))
    .execute();
  await db.schema
    .alterTable('servicos')
    .addCheckConstraint('servicos_versao_positiva', sql`versao >= 1`)
    .execute();
}

/**
 * Trava `trampos` (o `lock` exige transação; fora de uma, abre a própria),
 * confere que não há trampo encerrado e só então desfaz o `up`.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  if (!db.isTransaction) {
    await db.transaction().execute((trx) => down(trx));
    return;
  }
  await sql`lock table trampos in access exclusive mode`.execute(db);
  const { rows } = await sql<{ tem_encerrado: boolean }>`select exists (
      select 1 from trampos where status = 'encerrado'
    ) as tem_encerrado`.execute(db);
  if (rows[0]?.tem_encerrado !== false) {
    throw new ErroDownComTramposEncerrados();
  }

  await sql`alter table trampos
    drop constraint trampos_status_valido,
    add constraint trampos_status_valido
      check (status in ('aberto', 'em_andamento'))`.execute(db);
  // Remove junto a check `servicos_versao_positiva`, que só usa esta coluna.
  await db.schema.alterTable('servicos').dropColumn('versao').execute();
}
