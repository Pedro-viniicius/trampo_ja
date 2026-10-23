import { randomUUID } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { bancoDeTeste } from '../../../test/banco-teste.js';
import {
  chaveDaTravaDaConta,
  travarContaComExclusividade,
  travarContasEmModoCompartilhado,
} from './travas-de-conta.js';

const CONTA = '7d3c2f0e-0b4f-4a57-9f7a-2a4c1d9e8b10';
const OUTRA = '0f1e2d3c-4b5a-4968-8776-655443322110';

/** Tenta, sem esperar, a trava da conta noutra conexão (outra transação). */
async function outraTransacaoConsegue(
  modo: 'exclusiva' | 'compartilhada',
  contaId: string,
): Promise<boolean> {
  const chave = chaveDaTravaDaConta(contaId);
  return bancoDeTeste()
    .transaction()
    .execute(async (trx) => {
      const { rows } =
        modo === 'exclusiva'
          ? await sql<{
              ok: boolean;
            }>`select pg_try_advisory_xact_lock(${chave}::bigint) as ok`.execute(
              trx,
            )
          : await sql<{
              ok: boolean;
            }>`select pg_try_advisory_xact_lock_shared(${chave}::bigint) as ok`.execute(
              trx,
            );
      return rows[0]?.ok ?? false;
    });
}

/** Chaves das travas consultivas que esta conexão segura, com o modo. */
async function travasDaConexao(
  trx: Kysely<unknown>,
): Promise<{ chave: string; modo: string }[]> {
  const { rows } = await sql<{ chave: string; modo: string }>`
    -- Chave bigint: 32 bits altos em classid e baixos em objid (o shift
    -- de int8 não lança no estouro, então o sinal volta como era).
    select ((classid::bigint << 32) | objid::bigint)::text as chave,
           mode as modo
    from pg_locks
    where locktype = 'advisory' and granted and pid = pg_backend_pid()
  `.execute(trx);
  return rows.sort((a, b) => (a.chave < b.chave ? -1 : 1));
}

describe('chaveDaTravaDaConta', () => {
  it('é um bigint com sinal, estável e sem diferença de caixa', () => {
    const chave = chaveDaTravaDaConta(CONTA);

    expect(chave).toMatch(/^-?\d+$/);
    expect(BigInt.asIntN(64, BigInt(chave))).toBe(BigInt(chave));
    expect(chaveDaTravaDaConta(CONTA)).toBe(chave);
    expect(chaveDaTravaDaConta(CONTA.toUpperCase())).toBe(chave);
    expect(chaveDaTravaDaConta(OUTRA)).not.toBe(chave);
  });

  it('contas diferentes dão chaves diferentes (amostra de 2000)', () => {
    const chaves = new Set(
      Array.from({ length: 2000 }, () => chaveDaTravaDaConta(randomUUID())),
    );
    expect(chaves.size).toBe(2000);
  });
});

describe('travas consultivas por conta (Q1)', () => {
  it('a exclusiva barra a compartilhada e a exclusiva de outra transação, só na mesma conta, e cai no commit', async () => {
    await bancoDeTeste()
      .transaction()
      .execute(async (trx) => {
        await travarContaComExclusividade(trx, CONTA);

        expect(await outraTransacaoConsegue('compartilhada', CONTA)).toBe(
          false,
        );
        expect(await outraTransacaoConsegue('exclusiva', CONTA)).toBe(false);
        expect(await outraTransacaoConsegue('exclusiva', OUTRA)).toBe(true);
      });

    expect(await outraTransacaoConsegue('exclusiva', CONTA)).toBe(true);
  });

  it('a compartilhada barra a exclusiva, mas não outra compartilhada; vale para cada conta da lista', async () => {
    await bancoDeTeste()
      .transaction()
      .execute(async (trx) => {
        await travarContasEmModoCompartilhado(trx, [CONTA, OUTRA]);

        for (const conta of [CONTA, OUTRA]) {
          expect(await outraTransacaoConsegue('exclusiva', conta)).toBe(false);
          expect(await outraTransacaoConsegue('compartilhada', conta)).toBe(
            true,
          );
        }
      });

    expect(await outraTransacaoConsegue('exclusiva', CONTA)).toBe(true);
    expect(await outraTransacaoConsegue('exclusiva', OUTRA)).toBe(true);
  });

  it('a compartilhada pega cada conta uma vez só (id repetido, em qualquer caixa), com a chave de chaveDaTravaDaConta', async () => {
    const vistas = await bancoDeTeste<unknown>()
      .transaction()
      .execute(async (trx) => {
        await travarContasEmModoCompartilhado(trx, [
          OUTRA,
          CONTA,
          CONTA.toUpperCase(),
        ]);
        return travasDaConexao(trx);
      });

    expect(vistas).toEqual(
      [CONTA, OUTRA]
        .map((conta) => ({
          chave: chaveDaTravaDaConta(conta),
          modo: 'ShareLock',
        }))
        .sort((a, b) => (a.chave < b.chave ? -1 : 1)),
    );
  });

  it('a exclusiva usa a mesma chave da compartilhada', async () => {
    const vistas = await bancoDeTeste<unknown>()
      .transaction()
      .execute(async (trx) => {
        await travarContaComExclusividade(trx, CONTA.toUpperCase());
        return travasDaConexao(trx);
      });

    expect(vistas).toEqual([
      {
        chave: chaveDaTravaDaConta(CONTA),
        modo: 'ExclusiveLock',
      },
    ]);
  });

  it('fora de transação, recusa com TypeError sem travar nada', async () => {
    await expect(
      travarContaComExclusividade(bancoDeTeste(), CONTA),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      travarContasEmModoCompartilhado(bancoDeTeste(), [CONTA]),
    ).rejects.toBeInstanceOf(TypeError);
    expect(await outraTransacaoConsegue('exclusiva', CONTA)).toBe(true);
  });
});
