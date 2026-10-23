/**
 * QA da L1 — CA23 pelas rotas reais: com contas de custo scrypt médio (N=2^15,
 * ~100 ms, vários threads do libuv livres), 12 pedidos simultâneos que pedem
 * derivação (exportação, exclusão com senha errada e login) nunca passam de 2
 * derivações ao mesmo tempo no processo, e todos terminam.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import { limparBanco, montar, pedir } from './apoio.js';
import { criarUsuarioComSenhaSemPerfil } from './apoio-l1.js';

const medidas = vi.hoisted(() => ({ ativas: 0, maximo: 0, total: 0 }));

vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  const scryptOriginal = original.scrypt as (...args: unknown[]) => void;
  const scrypt = (...args: unknown[]): void => {
    const callback = args[args.length - 1] as (...r: unknown[]) => void;
    medidas.ativas += 1;
    medidas.total += 1;
    medidas.maximo = Math.max(medidas.maximo, medidas.ativas);
    scryptOriginal(...args.slice(0, -1), (...resultado: unknown[]) => {
      medidas.ativas -= 1;
      callback(...resultado);
    });
  };
  return { ...original, default: { ...original, scrypt }, scrypt };
});

let app: Aplicacao;

beforeAll(async () => {
  await limparBanco();
  app = await montar();
});

afterAll(async () => {
  await app?.fechar();
  await limparBanco();
});

describe('CA23 — no máximo 2 derivações scrypt ao mesmo tempo, pelas rotas', () => {
  it('Dado 12 pedidos simultâneos com derivação (3 rotas), então o pico medido é 2 e todos respondem', async () => {
    const usuarios = await Promise.all(
      Array.from({ length: 12 }, () =>
        criarUsuarioComSenhaSemPerfil('senha-media-l1-123', undefined, 2 ** 15),
      ),
    );
    // O hash fictício do login (N=2^17) ocupa uma vaga logo depois de montar a
    // aplicação; esperar por ele (um login com e-mail desconhecido o usa)
    // deixa as 2 vagas livres para a medição.
    await pedir(app, 'POST', '/sessoes', {
      corpo: { email: 'ninguem@exemplo.test', senha: 'senha-qualquer-123' },
    });
    medidas.ativas = 0;
    medidas.maximo = 0;
    medidas.total = 0;

    const respostas = await Promise.all(
      usuarios.map((u, i) => {
        if (i % 3 === 0) {
          return pedir(app, 'POST', '/contas/eu/exportacao', {
            token: u.token,
            corpo: { senha: u.senha },
          });
        }
        if (i % 3 === 1) {
          return pedir(app, 'POST', '/contas/eu/exclusao', {
            token: u.token,
            corpo: { senha: 'senha-errada-0000' },
          });
        }
        return pedir(app, 'POST', '/sessoes', {
          corpo: { email: u.email, senha: u.senha },
        });
      }),
    );

    expect(respostas.map((r) => r.status)).toEqual(
      usuarios.map((_, i) => [200, 403, 200][i % 3]),
    );
    expect(medidas.total).toBe(12);
    expect(medidas.maximo).toBe(2);
    expect(medidas.ativas).toBe(0);
  }, 30_000);
});
