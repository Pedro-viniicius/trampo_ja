import { type Kysely, sql } from 'kysely';

/**
 * Módulo `contas`, pré-lançamento L3 (D31, achado S1 da rodada 1): teto de
 * tentativas de entrada por conta, guardado no banco.
 *
 * - `tentativas_de_entrada` tem uma linha por conta que tentou entrar: o
 *   início da janela fixa (1 h) e quantas tentativas caíram nela. Não guarda
 *   e-mail nem IP. O caso de uso `entrar` soma uma tentativa depois de achar
 *   a conta e antes do scrypt (`insert … on conflict … returning`, que
 *   reinicia a janela vencida); acima do teto, 429. E-mail inexistente não
 *   grava nada.
 * - No banco, e não num LRU em memória, para que pedidos com e-mails de lixo
 *   não consigam despejar o contador da vítima.
 * - FK para `contas` com `on delete cascade` (mesmo módulo, como `sessoes`):
 *   a exclusão da conta (D25) apaga a linha junto.
 * - Sem índice em `inicio_da_janela`: a limpeza periódica (de hora em hora)
 *   apaga as janelas vencidas, e a tabela fica com no máximo uma linha por
 *   conta que tentou entrar na última hora ou pouco mais.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('tentativas_de_entrada')
    .addColumn('conta_id', 'uuid', (coluna) =>
      coluna.primaryKey().references('contas.id').onDelete('cascade'),
    )
    .addColumn('inicio_da_janela', 'timestamptz', (coluna) => coluna.notNull())
    .addColumn('tentativas', 'integer', (coluna) => coluna.notNull())
    .addCheckConstraint(
      'tentativas_de_entrada_tentativas_positivas',
      sql`tentativas >= 1`,
    )
    .execute();
}

/**
 * Remove a tabela mesmo com linhas, sem o `removerTabelaSeVazia`: ela só
 * guarda contadores de segurança que vencem em 1 h, nada que a pessoa
 * forneceu (é o caso da coluna-contador `servicos.versao` no README de
 * `migracoes/`). Com o `removerTabelaSeVazia`, qualquer login de uma conta
 * existente na última hora travaria a reversão, e depois da volta ao código
 * anterior ninguém mais apagaria essas linhas. Perder os contadores só
 * reinicia a janela do teto.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tentativas_de_entrada').execute();
}
