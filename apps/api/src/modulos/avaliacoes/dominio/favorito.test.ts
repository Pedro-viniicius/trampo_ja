import { describe, expect, it } from 'vitest';
import { ErroDeRegra } from '../../../compartilhado/dominio/erros.js';
import { criarFavorito, LIMITE_DE_FAVORITOS } from './favorito.js';

const DONO = '1a2b3c4d-0000-4000-8000-000000000001';
const OUTRO = '1a2b3c4d-0000-4000-8000-000000000002';
const AGORA = new Date('2026-11-13T12:00:00.000Z');

describe('criarFavorito', () => {
  it('cria o favorito em minúsculas, com cópia da data', () => {
    const favorito = criarFavorito(DONO.toUpperCase(), OUTRO, AGORA);
    expect(favorito).toEqual({
      donoId: DONO,
      favoritoId: OUTRO,
      criadoEm: AGORA,
    });
    expect(favorito.criadoEm).not.toBe(AGORA);
    expect(Object.isFrozen(favorito)).toBe(true);
  });

  it('favoritar a si mesmo (em qualquer caixa) → favorito_invalido', () => {
    expect(() => criarFavorito(DONO, DONO.toUpperCase(), AGORA)).toThrow(
      new ErroDeRegra('favorito_invalido'),
    );
  });

  it('o teto é 200', () => {
    expect(LIMITE_DE_FAVORITOS).toBe(200);
  });
});
