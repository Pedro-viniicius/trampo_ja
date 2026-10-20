import { describe, expect, it } from 'vitest';
import { ErroDeEmailDuplicado, geradorDeTokenPadrao } from './portas.js';

describe('geradorDeTokenPadrao', () => {
  it('gera 32 bytes aleatórios em base64url (43 caracteres)', () => {
    const token = geradorDeTokenPadrao.gerar();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('não repete tokens', () => {
    const tokens = new Set(
      Array.from({ length: 1000 }, () => geradorDeTokenPadrao.gerar()),
    );
    expect(tokens.size).toBe(1000);
  });
});

describe('ErroDeEmailDuplicado', () => {
  it('não carrega dado da conta', () => {
    const erro = new ErroDeEmailDuplicado();

    expect(erro).toBeInstanceOf(Error);
    expect(erro.message).toBe('email_duplicado');
    expect(Object.keys(erro)).toEqual(['name']);
  });
});
