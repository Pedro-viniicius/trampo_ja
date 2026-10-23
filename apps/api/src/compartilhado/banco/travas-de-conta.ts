/**
 * Travas consultivas (advisory locks) do Postgres por conta (Q1, S2, R2).
 *
 * A exclusão da conta (D25) apaga numa transação o que cada módulo guarda
 * dela. Uma escrita de outro módulo que grava o id da conta sem FK para
 * `contas` (hoje, `POST /conversas`) pode passar pela conferência antes da
 * exclusão e gravar depois dela, deixando uma linha com o id da conta
 * excluída. As travas fecham essa janela sem um módulo conhecer as tabelas do
 * outro:
 *
 * - a exclusão pega a trava **exclusiva** da conta no início da transação;
 * - a escrita pega a trava **compartilhada** das contas envolvidas na mesma
 *   transação do insert e só depois confere o que a exclusão apagaria. Ou a
 *   exclusão já terminou (e a conferência vê tudo apagado), ou ela espera o
 *   commit da escrita (e apaga a linha nova junto com o resto).
 *
 * As compartilhadas não se bloqueiam entre si. São travas de transação
 * (`pg_advisory_xact_lock*`): caem sozinhas no commit ou no rollback.
 */
import { createHash } from 'node:crypto';
import { type QueryExecutorProvider, sql } from 'kysely';

/** Conexão em que a trava é pedida: tem de ser uma transação aberta. */
export type TransacaoParaTrava = QueryExecutorProvider & {
  readonly isTransaction: boolean;
};

// Prefixo do texto que vira a chave: separa estas travas de qualquer outro
// uso futuro de advisory lock com chave derivada do mesmo uuid.
const ESPACO_DA_CHAVE = 'trampo-ja:conta:';

/**
 * Chave `bigint` da trava da conta, como texto (o `pg` não manda `BigInt`):
 * os 64 primeiros bits do SHA-256 do id em minúsculas, com sinal. O mesmo id,
 * em qualquer caixa, dá a mesma chave. Duas contas com a mesma chave (chance
 * desprezível) só esperariam uma pela outra, sem erro.
 */
export function chaveDaTravaDaConta(contaId: string): string {
  return createHash('sha256')
    .update(`${ESPACO_DA_CHAVE}${contaId.toLowerCase()}`, 'utf8')
    .digest()
    .readBigInt64BE(0)
    .toString();
}

function exigirTransacao(trx: TransacaoParaTrava, quem: string): void {
  if (!trx.isTransaction) {
    // Fora de transação, a trava `xact` cairia no fim do próprio comando.
    throw new TypeError(`${quem}: exige uma transação`);
  }
}

/**
 * Trava exclusiva da conta até o fim da transação. Espera as escritas que já
 * seguram a trava compartilhada dela terminarem; as que chegam depois esperam
 * esta transação terminar.
 */
export async function travarContaComExclusividade(
  trx: TransacaoParaTrava,
  contaId: string,
): Promise<void> {
  exigirTransacao(trx, 'travarContaComExclusividade');
  await sql`select pg_advisory_xact_lock(${chaveDaTravaDaConta(contaId)}::bigint)`.execute(
    trx,
  );
}

/**
 * Trava compartilhada de cada conta até o fim da transação, em ordem
 * crescente de chave e sem repetir: duas escritas com as mesmas contas em
 * ordem trocada não se travam uma à outra (sem deadlock).
 */
export async function travarContasEmModoCompartilhado(
  trx: TransacaoParaTrava,
  contaIds: readonly string[],
): Promise<void> {
  exigirTransacao(trx, 'travarContasEmModoCompartilhado');
  const chaves = [...new Set(contaIds.map(chaveDaTravaDaConta))]
    .map((chave) => BigInt(chave))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const chave of chaves) {
    await sql`select pg_advisory_xact_lock_shared(${chave.toString()}::bigint)`.execute(
      trx,
    );
  }
}
