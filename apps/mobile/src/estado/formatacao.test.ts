import type { Categoria } from '../api/tipos';
import {
  centavosParaCampo,
  dataParaCampo,
  formatarCentavos,
  formatarData,
  formatarDataHora,
  lerData,
  lerValorEmCentavos,
  mascararData,
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

describe('lerValorEmCentavos', () => {
  it.each([
    ['150', 15000],
    ['1.500', 150000],
    ['1,5', 150],
    ['1.5', 150],
    ['1,50', 150],
    ['1.50', 150],
    ['150,00', 15000],
    ['1.500,00', 150000],
    ['1.234,5', 123450],
    ['R$ 1.234,56', 123456],
    ['R$1.234,56', 123456],
    ['r$ 10', 1000],
    ['  R$  1 500,00  ', 150000],
    ['1.234.567', 123456700],
    ['12.345.678,90', 1234567890],
    ['0', 0],
    ['0,01', 1],
    ['0,50', 50],
    ['0.5', 50],
    ['007', 700],
    ['21474836,47', 2147483647],
    ['21.474.836,48', 2147483648],
  ])('%j vira %j', (texto, centavos) => {
    expect(lerValorEmCentavos(texto)).toBe(centavos);
  });

  it.each([
    [''],
    ['   '],
    ['R$'],
    ['abc'],
    ['10 reais'],
    ['-5'],
    ['+5'],
    ['1,234'],
    ['0,001'],
    ['0.001'],
    ['1.5000'],
    ['1,2,3'],
    ['1,'],
    [',50'],
    ['.5'],
    ['1..5'],
    ['1.5.0'],
    ['1.23,45'],
    ['1.500.5'],
    ['12.34.567'],
    ['1e3'],
    ['１２３'],
  ])('%j é inválido', (texto) => {
    expect(lerValorEmCentavos(texto)).toBeNull();
  });

  it('limita número gigante a Number.MAX_SAFE_INTEGER (o validador aponta valor_alto)', () => {
    const gigante = `${'9'.repeat(40)},99`;
    expect(lerValorEmCentavos(gigante)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('centavosParaCampo', () => {
  it.each([
    [150000, '1.500,00'],
    [15000, '150,00'],
    [123456, '1.234,56'],
    [5, '0,05'],
    [0, '0,00'],
    [2147483647, '21.474.836,47'],
  ])('%j vira %j', (centavos, campo) => {
    expect(centavosParaCampo(centavos)).toBe(campo);
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [-1]])(
    '%j vira texto vazio',
    (centavos) => {
      expect(centavosParaCampo(centavos)).toBe('');
    },
  );

  it('ida e volta: o texto reformatado lê o mesmo valor', () => {
    for (const centavos of [1, 99, 100, 150000, 123456789, 2147483647]) {
      expect(lerValorEmCentavos(centavosParaCampo(centavos))).toBe(centavos);
    }
  });
});

describe('lerData', () => {
  it.each([
    ['31/12/2026', '2026-12-31'],
    ['31122026', '2026-12-31'],
    ['  01/01/2027  ', '2027-01-01'],
    ['29/02/2028', '2028-02-29'],
    ['01/01/1900', '1900-01-01'],
    ['31/12/9999', '9999-12-31'],
    // Não exige data futura (a API também não).
    ['01/01/2020', '2020-01-01'],
  ])('%j vira %j', (texto, iso) => {
    expect(lerData(texto)).toBe(iso);
  });

  it.each([
    ['31/02/2026', 'dia que não existe'],
    ['29/02/2027', 'ano não bissexto'],
    ['32/01/2026', 'dia 32'],
    ['00/01/2026', 'dia 0'],
    ['10/13/2026', 'mês 13'],
    ['10/00/2026', 'mês 0'],
    ['31/12/1899', 'ano antes de 1900'],
    ['31/12/0000', 'ano 0'],
    ['', 'vazio'],
    ['   ', 'só espaços'],
    ['1/1/2026', 'sem zero à esquerda'],
    ['31/12/26', 'ano com 2 dígitos'],
    ['2026-12-31', 'formato ISO'],
    ['31-12-2026', 'hífen'],
    ['31/122026', 'barra só numa posição'],
    ['311220260', '9 dígitos'],
    ['3112202', '7 dígitos'],
    ['dd/mm/aaaa', 'letras'],
  ])('%j é inválida (%s)', (texto) => {
    expect(lerData(texto)).toBeNull();
  });
});

describe('dataParaCampo', () => {
  it.each([
    ['2026-12-31', '31/12/2026'],
    ['1900-01-01', '01/01/1900'],
  ])('%j vira %j', (iso, campo) => {
    expect(dataParaCampo(iso)).toBe(campo);
  });

  it.each([[''], ['2026-02-31'], ['31/12/2026'], ['abc']])(
    '%j inválida vira texto vazio',
    (iso) => {
      expect(dataParaCampo(iso)).toBe('');
    },
  );

  it('ida e volta com lerData', () => {
    expect(lerData(dataParaCampo('2026-12-31'))).toBe('2026-12-31');
  });
});

describe('mascararData (D3)', () => {
  it.each([
    ['', ''],
    ['3', '3'],
    ['31', '31'],
    ['311', '31/1'],
    ['3112', '31/12'],
    ['31122', '31/12/2'],
    ['31122026', '31/12/2026'],
    ['31/12/2026', '31/12/2026'],
    ['31/', '31'],
    ['31/1', '31/1'],
  ])('%j vira %j', (digitado, mascarado) => {
    expect(mascararData(digitado)).toBe(mascarado);
  });

  it('descarta o que não é dígito e o que passa de 8 dígitos', () => {
    expect(mascararData(' 3a1-1 2.2026 ')).toBe('31/12/2026');
    expect(mascararData('311220261')).toBe('31/12/2026');
    expect(mascararData('amanhã')).toBe('');
  });

  it('o mascarado continua sendo lido por lerData', () => {
    expect(lerData(mascararData('29022028'))).toBe('2028-02-29');
    expect(lerData(mascararData('3102'))).toBeNull();
  });
});
