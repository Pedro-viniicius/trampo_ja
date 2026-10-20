import { describe, expect, it } from 'vitest';
import { contemCaractereNulo, normalizarTexto } from './texto.js';

describe('normalizarTexto', () => {
  it.each([
    ['  São   PAULO ', 'sao paulo'],
    ['Içara', 'icara'],
    ['Coração\tde\nJesus', 'coracao de jesus'],
    ['ÁÉÍÓÚ âêô ãõ à ü ñ', 'aeiou aeo ao a u n'],
    ['Belo Horizonte', 'belo horizonte'],
    ['pedreiro', 'pedreiro'],
    ['', ''],
    ['   ', ''],
  ])('normaliza %j para %j', (entrada, esperado) => {
    expect(normalizarTexto(entrada)).toBe(esperado);
  });

  it('trata da mesma forma o acento composto e o decomposto', () => {
    const composto = 'São';
    const decomposto = 'São';
    expect(normalizarTexto(composto)).toBe(normalizarTexto(decomposto));
  });

  it('é idempotente', () => {
    const uma = normalizarTexto('  Florianópolis  -  SC ');
    expect(normalizarTexto(uma)).toBe(uma);
  });
});

describe('contemCaractereNulo', () => {
  it.each([
    ['\u0000', true],
    ['abc\u0000', true],
    ['\u0000abc', true],
    ['pin\u0000tura', true],
  ])('acha o caractere nulo em %j', (entrada, esperado) => {
    expect(contemCaractereNulo(entrada)).toBe(esperado);
  });

  it.each([
    [''],
    ['   '],
    ['pintura'],
    ['São Paulo 😀'],
    ['\\0'],
    ['0'],
    ['\u0001\u001f'],
  ])('não acusa %j', (entrada) => {
    expect(contemCaractereNulo(entrada)).toBe(false);
  });
});
