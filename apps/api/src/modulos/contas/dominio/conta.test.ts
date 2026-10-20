import { describe, expect, it } from 'vitest';
import { Conta } from './conta.js';
import { Email } from './email.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function novaConta(): Conta {
  return Conta.criar({
    email: Email.criar('maria@exemplo.com'),
    senhaHash: 'scrypt$16$8$1$c2FsdA==$aGFzaA==',
    criadaEm: new Date('2026-10-20T12:00:00.000Z'),
  });
}

describe('Conta', () => {
  it('nasce com id uuid, e-mail, hash e data de criação', () => {
    const conta = novaConta();

    expect(conta.id).toMatch(UUID);
    expect(conta.email.valor).toBe('maria@exemplo.com');
    expect(conta.senhaHash).toBe('scrypt$16$8$1$c2FsdA==$aGFzaA==');
    expect(conta.criadaEm.toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('cada conta nova tem um id diferente', () => {
    expect(novaConta().id).not.toBe(novaConta().id);
  });

  it('reconstitui uma conta gravada com o mesmo id', () => {
    const conta = Conta.reconstituir({
      id: '0b0e8c1e-4a8f-4e4c-9a55-1f5f0d6d2b11',
      email: Email.criar('maria@exemplo.com'),
      senhaHash: 'scrypt$x',
      criadaEm: new Date('2026-10-20T12:00:00.000Z'),
    });
    expect(conta.id).toBe('0b0e8c1e-4a8f-4e4c-9a55-1f5f0d6d2b11');
  });

  it('não deixa alterar a data de criação por fora', () => {
    const criadaEm = new Date('2026-10-20T12:00:00.000Z');
    const conta = Conta.criar({
      email: Email.criar('maria@exemplo.com'),
      senhaHash: 'scrypt$x',
      criadaEm,
    });
    criadaEm.setUTCFullYear(2000);
    conta.criadaEm.setUTCFullYear(2000);
    expect(conta.criadaEm.toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('recusa hash vazio e data inválida', () => {
    const email = Email.criar('maria@exemplo.com');
    expect(() =>
      Conta.criar({ email, senhaHash: '', criadaEm: new Date() }),
    ).toThrow(TypeError);
    expect(() =>
      Conta.criar({ email, senhaHash: 'h', criadaEm: new Date('x') }),
    ).toThrow(TypeError);
  });

  it('CA15 — JSON da conta omite o e-mail e o hash da senha', () => {
    const conta = novaConta();
    const json = JSON.stringify({ conta });

    expect(json).toContain(conta.id);
    expect(json).not.toContain('maria');
    expect(json).not.toContain('scrypt');
  });
});
