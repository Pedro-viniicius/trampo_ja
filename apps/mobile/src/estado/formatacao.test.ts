import type { Categoria } from '../api/tipos';
import {
  formatarCentavos,
  formatarData,
  formatarDataHora,
  rotuloDaCategoria,
} from './formatacao';

describe('formatarCentavos', () => {
  it.each([
    [0, 'R$ 0,00'],
    [5, 'R$ 0,05'],
    [50, 'R$ 0,50'],
    [99, 'R$ 0,99'],
    [100, 'R$ 1,00'],
    [12345, 'R$ 123,45'],
    [99999, 'R$ 999,99'],
    [100000, 'R$ 1.000,00'],
    [123456, 'R$ 1.234,56'],
    [123456789, 'R$ 1.234.567,89'],
    [100000000, 'R$ 1.000.000,00'],
    [Number.MAX_SAFE_INTEGER, 'R$ 90.071.992.547.409,91'],
    [-5, '-R$ 0,05'],
    [-123456, '-R$ 1.234,56'],
    [-0, 'R$ 0,00'],
    [1234.5, 'R$ 12,35'],
    [0.4, 'R$ 0,00'],
    [-0.4, 'R$ 0,00'],
    [Number.NaN, '—'],
    [Number.POSITIVE_INFINITY, '—'],
  ])('%p vira %j', (entrada, esperado) => {
    expect(formatarCentavos(entrada)).toBe(esperado);
  });
});

describe('formatarData', () => {
  it.each([
    ['2026-10-20', '20/10/2026'],
    ['2026-01-01', '01/01/2026'],
    ['2028-02-29', '29/02/2028'],
    ['2026-12-31', '31/12/2026'],
    ['2026-02-29', '2026-02-29'],
    ['2026-13-01', '2026-13-01'],
    ['2026-00-10', '2026-00-10'],
    ['2026-04-31', '2026-04-31'],
    ['20/10/2026', '20/10/2026'],
    ['2026-1-2', '2026-1-2'],
    ['2026-10-20T10:00:00Z', '2026-10-20T10:00:00Z'],
    ['', ''],
    ['abc', 'abc'],
  ])('%j vira %j', (entrada, esperado) => {
    expect(formatarData(entrada)).toBe(esperado);
  });
});

describe('formatarDataHora', () => {
  // 10h UTC cai no mesmo dia em fusos de -10 a +13 (testes independem do fuso).
  it.each([
    ['2026-10-20T10:00:00.000Z', '20/10/2026'],
    ['2026-01-05T10:30:00Z', '05/01/2026'],
    ['2028-02-29T10:00:00.000Z', '29/02/2028'],
  ])('%j vira %j', (entrada, esperado) => {
    expect(formatarDataHora(entrada)).toBe(esperado);
  });

  it('aceita data pura', () => {
    expect(formatarDataHora('2026-10-20')).toBe('20/10/2026');
  });

  it('usa o dia local do aparelho, sem hora', () => {
    const instante = new Date(2026, 9, 5, 23, 30);
    const resultado = formatarDataHora(instante.toISOString());
    expect(resultado).toBe('05/10/2026');
    expect(resultado).not.toMatch(/:/);
  });

  it.each([
    [''],
    ['ontem'],
    ['5'],
    ['2026-13-40T12:00:00Z'],
    ['2026-10-20Tabc'],
  ])('devolve %j como veio', (entrada) => {
    expect(formatarDataHora(entrada)).toBe(entrada);
  });
});

describe('rotuloDaCategoria', () => {
  const categorias: readonly Categoria[] = [
    { id: 'reformas', rotulo: 'Reformas e reparos' },
    { id: 'aulas', rotulo: 'Aulas' },
  ];

  it('devolve o rótulo da categoria', () => {
    expect(rotuloDaCategoria(categorias, 'reformas')).toBe(
      'Reformas e reparos',
    );
    expect(rotuloDaCategoria(categorias, 'aulas')).toBe('Aulas');
  });

  it('devolve o id quando a categoria não está na lista', () => {
    expect(rotuloDaCategoria(categorias, 'jardinagem')).toBe('jardinagem');
    expect(rotuloDaCategoria([], 'aulas')).toBe('aulas');
  });

  it('devolve o id enquanto a lista não chegou', () => {
    expect(rotuloDaCategoria(undefined, 'aulas')).toBe('aulas');
  });

  it('o id é comparado por igualdade exata', () => {
    expect(rotuloDaCategoria(categorias, 'Aulas')).toBe('Aulas');
  });
});
