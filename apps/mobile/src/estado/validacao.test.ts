import type { EntradaDePerfil } from '../api/tipos';
import { textos } from '../textos/pt-BR';
import {
  LIMITES,
  normalizarHabilidade,
  validarEmail,
  validarPerfil,
  validarSenha,
} from './validacao';

describe('validarEmail', () => {
  it.each([
    ['maria@exemplo.com'],
    ['Maria.Silva+trampo@Exemplo.COM'],
    ['  maria@exemplo.com  '],
    ['a@b.co'],
    ['maria@mail.exemplo.com.br'],
  ])('aceita %j', (valor) => {
    expect(validarEmail(valor)).toBeNull();
  });

  it.each([
    [''],
    ['   '],
    ['maria'],
    ['maria@'],
    ['@exemplo.com'],
    ['maria@exemplo'],
    ['maria@@exemplo.com'],
    ['maria@exe@mplo.com'],
    ['maria@.com'],
    ['maria@exemplo..com'],
    ['maria@exemplo.com.'],
    ['ma ria@exemplo.com'],
    ['maria@exem plo.com'],
    ['maria@exemplo.com\u0007'],
  ])('recusa %j', (valor) => {
    expect(validarEmail(valor)).toBe('email_invalido');
  });

  it('limita o e-mail a 254 caracteres, já aparado e em minúsculas', () => {
    const dominio = '@exemplo.com';
    const noLimite = `${'a'.repeat(254 - dominio.length)}${dominio}`;
    expect(noLimite).toHaveLength(254);
    expect(validarEmail(noLimite)).toBeNull();
    expect(validarEmail(` ${noLimite.toUpperCase()} `)).toBeNull();
    expect(validarEmail(`a${noLimite}`)).toBe('email_invalido');
  });

  it('devolve só chave de textos.erros, sem o valor digitado', () => {
    const digitado = 'segredo-sem-arroba';
    const resultado = validarEmail(digitado);
    expect(resultado).toBe('email_invalido');
    expect(JSON.stringify(resultado)).not.toContain(digitado);
    expect(Object.keys(textos.erros)).toContain(resultado);
  });
});

describe('validarSenha', () => {
  it.each([
    ['7 caracteres', 'a'.repeat(7), 'senha_curta'],
    ['8 caracteres', 'a'.repeat(8), null],
    ['128 caracteres', 'a'.repeat(128), null],
    ['129 caracteres', 'a'.repeat(129), 'senha_curta'],
    ['vazia', '', 'senha_curta'],
    ['7 pontos de código com emoji', `${'😀'.repeat(3)}abcd`, 'senha_curta'],
    ['8 pontos de código com emoji', `${'😀'.repeat(4)}abcd`, null],
    ['128 emojis (256 unidades)', '😀'.repeat(128), null],
    ['129 emojis', '😀'.repeat(129), 'senha_curta'],
    ['texto enorme', 'a'.repeat(100_000), 'senha_curta'],
    ['espaços contam (8 espaços)', ' '.repeat(8), null],
  ])('%s', (_nome, valor, esperado) => {
    expect(validarSenha(valor)).toBe(esperado);
  });

  it('não apara a senha', () => {
    expect(validarSenha(`  ${'a'.repeat(6)}  `)).toBeNull();
  });
});

describe('normalizarHabilidade', () => {
  it.each([
    ['Pintura', 'pintura'],
    ['  Pintura   de   Parede ', 'pintura de parede'],
    ['Eletricista Residêncial', 'eletricista residencial'],
    ['AÇÃO', 'acao'],
    ['São\tPaulo\nCapital', 'sao paulo capital'],
    ['', ''],
    ['   ', ''],
    ['́', ''],
  ])('%j vira %j', (entrada, esperado) => {
    expect(normalizarHabilidade(entrada)).toBe(esperado);
  });
});

describe('validarPerfil', () => {
  const valido: EntradaDePerfil = {
    nome: 'Maria da Silva',
    cidade: 'Lavras',
    descricao: 'Faço reparos em geral.',
    habilidades: ['Pintura', 'Elétrica'],
  };
  const com = (parte: Partial<EntradaDePerfil>): EntradaDePerfil => ({
    ...valido,
    ...parte,
  });

  it('aceita o perfil válido e a descrição ausente, nula ou em branco', () => {
    expect(validarPerfil(valido)).toEqual({});
    expect(validarPerfil(com({ descricao: undefined }))).toEqual({});
    expect(validarPerfil(com({ descricao: null }))).toEqual({});
    expect(validarPerfil(com({ descricao: '   ' }))).toEqual({});
  });

  it('expõe os limites da API', () => {
    expect(LIMITES.nome).toEqual({ min: 2, max: 80 });
    expect(LIMITES.cidade).toEqual({ min: 2, max: 80 });
    expect(LIMITES.descricao.max).toBe(300);
    expect(LIMITES.habilidades).toEqual({ min: 1, max: 10 });
    expect(LIMITES.habilidade).toEqual({ min: 2, max: 30 });
    expect(LIMITES.senha).toEqual({ min: 8, max: 128 });
    expect(LIMITES.email.max).toBe(254);
  });

  describe.each([
    ['nome', 'nome_obrigatorio', 'nome_tamanho'],
    ['cidade', 'cidade_obrigatoria', 'cidade_tamanho'],
  ] as const)('%s', (campo, obrigatorio, tamanho) => {
    it.each([
      ['vazio', '', obrigatorio],
      ['só espaços', '    ', obrigatorio],
      ['1 caractere', 'a', tamanho],
      ['1 caractere com espaços', '  a  ', tamanho],
      ['2 caracteres', 'ab', undefined],
      ['2 pontos de código com emoji', '😀😀', undefined],
      ['80 caracteres', 'a'.repeat(80), undefined],
      [
        '80 caracteres com espaços nas pontas',
        ` ${'a'.repeat(80)} `,
        undefined,
      ],
      ['81 caracteres', 'a'.repeat(81), tamanho],
      ['80 emojis', '😀'.repeat(80), undefined],
      ['81 emojis', '😀'.repeat(81), tamanho],
      ['caractere nulo', 'ab\u0000cd', tamanho],
    ])('%s', (_nome, valor, esperado) => {
      const erros = validarPerfil(com({ [campo]: valor }));
      expect(erros[campo]).toBe(esperado);
      expect(Object.keys(erros)).toEqual(esperado ? [campo] : []);
    });
  });

  it('recusa cidade que some ao normalizar (só marcas combinantes)', () => {
    expect(validarPerfil(com({ cidade: '́́' })).cidade).toBe('cidade_tamanho');
  });

  describe('descricao', () => {
    it.each([
      ['300 caracteres', 'a'.repeat(300), undefined],
      ['301 caracteres', 'a'.repeat(301), 'descricao_tamanho'],
      ['300 emojis', '😀'.repeat(300), undefined],
      ['301 emojis', '😀'.repeat(301), 'descricao_tamanho'],
      [
        '301 com espaços nas pontas e 300 úteis',
        ` ${'a'.repeat(300)}`,
        undefined,
      ],
      ['caractere nulo', 'a\u0000b', 'descricao_tamanho'],
    ])('%s', (_nome, valor, esperado) => {
      expect(validarPerfil(com({ descricao: valor })).descricao).toBe(esperado);
    });
  });

  describe('habilidades', () => {
    const lista = (n: number): string[] =>
      Array.from({ length: n }, (_, i) => `Habilidade ${i}`);

    it.each([
      ['lista vazia', [], 'habilidade_obrigatoria'],
      ['1 habilidade', ['Pintura'], undefined],
      ['10 habilidades', lista(10), undefined],
      ['11 habilidades', lista(11), 'habilidades_demais'],
      ['item de 1 caractere', ['a'], 'habilidade_tamanho'],
      ['item em branco', ['Pintura', '   '], 'habilidade_tamanho'],
      ['item de 2 caracteres', ['ab'], undefined],
      ['item de 30 caracteres', ['a'.repeat(30)], undefined],
      ['item de 31 caracteres', ['a'.repeat(31)], 'habilidade_tamanho'],
      ['item de 30 emojis', ['😀'.repeat(30)], undefined],
      ['item de 31 emojis', ['😀'.repeat(31)], 'habilidade_tamanho'],
      ['item com caractere nulo', ['ab\u0000'], 'habilidade_tamanho'],
      ['repetida igual', ['Pintura', 'Pintura'], 'habilidade_invalida'],
      [
        'repetida com acento, caixa e espaços diferentes',
        ['Elétrica Predial', '  eletrica   PREDIAL '],
        'habilidade_invalida',
      ],
      ['só marcas combinantes', ['́́'], 'habilidade_invalida'],
      ['distintas depois de normalizar', ['Pintura', 'Pinturas'], undefined],
    ])('%s', (_nome, habilidades, esperado) => {
      expect(validarPerfil(com({ habilidades })).habilidades).toBe(esperado);
    });

    it('a lista grande demais vale mais que os itens', () => {
      expect(
        validarPerfil(com({ habilidades: [...lista(10), 'a'] })).habilidades,
      ).toBe('habilidades_demais');
    });
  });

  it('junta os erros de vários campos, só com chaves de textos.erros', () => {
    const digitado = 'valor-digitado-que-nao-pode-vazar';
    const erros = validarPerfil({
      nome: '',
      cidade: 'a',
      descricao: 'x'.repeat(301),
      habilidades: [digitado.slice(0, 1)],
    });
    expect(erros).toEqual({
      nome: 'nome_obrigatorio',
      cidade: 'cidade_tamanho',
      descricao: 'descricao_tamanho',
      habilidades: 'habilidade_tamanho',
    });
    for (const chave of Object.values(erros)) {
      expect(Object.keys(textos.erros)).toContain(chave);
    }
  });
});
