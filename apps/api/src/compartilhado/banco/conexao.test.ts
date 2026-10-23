import pg from 'pg';
import { describe, expect, it } from 'vitest';
import {
  opcoesDoPool,
  TEMPO_DE_CONEXAO_MS,
  TEMPO_DE_TRANSACAO_OCIOSA_MS,
  TEMPO_MAXIMO_DE_CONSULTA_MS,
} from './conexao.js';

const URL = 'postgres://usuario:s3nh4@localhost:5432/trampoja';

// O que o `pg` de fato envia na abertura da conexão (`connectionParameters`
// é interno; não está nos tipos). Construir o `Client` não conecta.
interface ParametrosDoPg {
  readonly statement_timeout: number | false | undefined;
  readonly idle_in_transaction_session_timeout: number | false | undefined;
  readonly connect_timeout: number;
}

function parametrosEfetivos(config: pg.PoolConfig): ParametrosDoPg {
  const cliente = new pg.Client(config) as unknown as {
    connectionParameters: ParametrosDoPg;
  };
  return cliente.connectionParameters;
}

describe('opcoesDoPool (S10, CA41, D42)', () => {
  it('usa conexão em 5 s, consulta em 10 s e transação ociosa em 30 s', () => {
    expect(TEMPO_DE_CONEXAO_MS).toBe(5_000);
    expect(TEMPO_MAXIMO_DE_CONSULTA_MS).toBe(10_000);
    expect(TEMPO_DE_TRANSACAO_OCIOSA_MS).toBe(30_000);
    expect(opcoesDoPool(URL)).toEqual({
      connectionString: URL,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 30_000,
    });
  });

  it('o pg lê os tempos como parâmetros da sessão', () => {
    expect(parametrosEfetivos(opcoesDoPool(URL))).toMatchObject({
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 30_000,
      connect_timeout: 5,
    });
  });

  it('repassa o máximo de conexões', () => {
    expect(opcoesDoPool(URL, { maximoDeConexoes: 2 }).max).toBe(2);
    expect(opcoesDoPool(URL)).not.toHaveProperty('max');
  });

  it('com tempoMaximoDeConsultaMs 0 (o `migrar`), não envia statement_timeout e mantém os outros tempos', () => {
    const opcoes = opcoesDoPool(URL, {
      maximoDeConexoes: 1,
      tempoMaximoDeConsultaMs: 0,
    });
    expect(opcoes).not.toHaveProperty('statement_timeout');
    expect(opcoes).toMatchObject({
      max: 1,
      connectionTimeoutMillis: 5_000,
      idle_in_transaction_session_timeout: 30_000,
    });
    expect(parametrosEfetivos(opcoes).statement_timeout).toBe(false);
  });

  it('aceita outro tempo de consulta', () => {
    expect(
      opcoesDoPool(URL, { tempoMaximoDeConsultaMs: 2_500 }).statement_timeout,
    ).toBe(2_500);
  });

  it('é pura: não altera as opções recebidas e devolve objeto novo', () => {
    const opcoes = Object.freeze({ maximoDeConexoes: 3 });
    const a = opcoesDoPool(URL, opcoes);
    const b = opcoesDoPool(URL, opcoes);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(opcoes).toEqual({ maximoDeConexoes: 3 });
  });
});
