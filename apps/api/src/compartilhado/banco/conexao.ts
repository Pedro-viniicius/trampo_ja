import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

/**
 * Tipo-base do banco: vazio. Cada módulo declara as próprias tabelas
 * (ex.: `interface TabelasDeContas { contas: …; sessoes: … }`) e recebe uma
 * conexão `Kysely<TabelasDoModulo>`, sem enxergar tabela de outro módulo.
 */
export type BancoBase = Record<never, never>;

/** Tempo máximo para abrir uma conexão ou esperar uma livre no pool (D42). */
export const TEMPO_DE_CONEXAO_MS = 5_000;
/** `statement_timeout` padrão de cada consulta (D42). */
export const TEMPO_MAXIMO_DE_CONSULTA_MS = 10_000;
/** `idle_in_transaction_session_timeout`: transação parada é encerrada (D42). */
export const TEMPO_DE_TRANSACAO_OCIOSA_MS = 30_000;

export interface OpcoesDaConexao {
  /** Máximo de conexões no pool (padrão do `pg`: 10). */
  readonly maximoDeConexoes?: number;
  /**
   * `statement_timeout` em ms (padrão: `TEMPO_MAXIMO_DE_CONSULTA_MS`).
   * `0` não envia o parâmetro e vale o padrão do servidor (sem limite no
   * Postgres local): é o que o `migrar` usa.
   */
  readonly tempoMaximoDeConsultaMs?: number;
}

/**
 * Configuração do `pg.Pool`, sem efeito colateral. Os tempos são fixos
 * (D42); a `lerUrlDoBanco` recusa URL que tente sobrescrevê-los.
 */
export function opcoesDoPool(
  url: string,
  opcoes: OpcoesDaConexao = {},
): pg.PoolConfig {
  const tempoDeConsulta =
    opcoes.tempoMaximoDeConsultaMs ?? TEMPO_MAXIMO_DE_CONSULTA_MS;
  return {
    connectionString: url,
    ...(opcoes.maximoDeConexoes ? { max: opcoes.maximoDeConexoes } : {}),
    connectionTimeoutMillis: TEMPO_DE_CONEXAO_MS,
    ...(tempoDeConsulta > 0 ? { statement_timeout: tempoDeConsulta } : {}),
    idle_in_transaction_session_timeout: TEMPO_DE_TRANSACAO_OCIOSA_MS,
  };
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
  const pool = new pg.Pool(opcoesDoPool(url, opcoes));
  // Sem este ouvinte, a queda de uma conexão ociosa derruba o processo.
  // Registra só o código: a mensagem do driver pode trazer dados da query.
  pool.on('error', (erro: Error & { code?: string }) => {
    console.error(
      `[banco] erro em conexão ociosa do pool (código: ${erro.code ?? 'desconhecido'})`,
    );
  });
  return new Kysely<T>({ dialect: new PostgresDialect({ pool }) });
}
