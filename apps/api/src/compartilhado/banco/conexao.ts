import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

/**
 * Tipo-base do banco: vazio. Cada módulo declara as próprias tabelas
 * (ex.: `interface TabelasDeContas { contas: …; sessoes: … }`) e recebe uma
 * conexão `Kysely<TabelasDoModulo>`, sem enxergar tabela de outro módulo.
 */
export type BancoBase = Record<never, never>;

export interface OpcoesDaConexao {
  /** Máximo de conexões no pool (padrão do `pg`: 10). */
  readonly maximoDeConexoes?: number;
}

/**
 * Cria a conexão Kysely sobre um `pg.Pool`. Feche com `db.destroy()`.
 *
 * Nunca registre a `url`: ela traz a senha do banco.
 */
export function criarConexao<T = BancoBase>(
  url: string,
  opcoes: OpcoesDaConexao = {},
): Kysely<T> {
  const pool = new pg.Pool({
    connectionString: url,
    ...(opcoes.maximoDeConexoes ? { max: opcoes.maximoDeConexoes } : {}),
  });
  // Sem este ouvinte, a queda de uma conexão ociosa derruba o processo.
  // Registra só o código: a mensagem do driver pode trazer dados da query.
  pool.on('error', (erro: Error & { code?: string }) => {
    console.error(
      `[banco] erro em conexão ociosa do pool (código: ${erro.code ?? 'desconhecido'})`,
    );
  });
  return new Kysely<T>({ dialect: new PostgresDialect({ pool }) });
}
