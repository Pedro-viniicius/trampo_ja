import type { EntradaDePerfil } from '../api/tipos';
import { textos } from '../textos/pt-BR';
import {
  LIMITES,
  normalizarHabilidade,
  validarCandidatura,
  validarEmail,
  validarPerfil,
  validarSenha,
  validarServico,
  validarTrampo,
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
    expect(LIMITES.titulo).toEqual({ min: 5, max: 80 });
    expect(LIMITES.descricaoDoAnuncio).toEqual({ min: 1, max: 2000 });
    expect(LIMITES.mensagem).toEqual({ min: 1, max: 2000 });
    expect(LIMITES.centavos).toEqual({ min: 1, max: 2147483647 });
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

const TRAMPO_VALIDO = {
  titulo: 'Pintar a sala',
  descricao: 'Pintar paredes e teto.',
  categoria: 'reformas' as string | null,
  cidade: 'Lavras',
  valor: '1.500,00',
  prazo: '31/12/2026',
};

const SERVICO_VALIDO = {
  titulo: 'Aulas de violão',
  descricao: 'Aulas para iniciantes.',
  categoria: 'aulas' as string | null,
  cidade: 'Lavras',
  valor: '80',
};

const CANDIDATURA_VALIDA = { mensagem: 'Posso começar amanhã.', valor: '900' };

const TETO = '21.474.836,47';
const ACIMA_DO_TETO = '21.474.836,48';

describe('validarTrampo', () => {
  it('formulário válido não devolve erro', () => {
    expect(validarTrampo(TRAMPO_VALIDO)).toEqual({});
  });

  it('prazo em branco vale (sem prazo)', () => {
    expect(validarTrampo({ ...TRAMPO_VALIDO, prazo: '  ' })).toEqual({});
  });

  it('prazo digitado sem barra também vale', () => {
    expect(validarTrampo({ ...TRAMPO_VALIDO, prazo: '31122026' })).toEqual({});
  });

  it('formulário vazio aponta todos os campos obrigatórios', () => {
    expect(
      validarTrampo({
        titulo: '',
        descricao: '',
        categoria: null,
        cidade: '',
        valor: '',
        prazo: '',
      }),
    ).toEqual({
      titulo: 'titulo_tamanho',
      descricao: 'descricao_trampo_obrigatoria',
      categoria: 'categoria_obrigatoria',
      cidade: 'cidade_anuncio_obrigatoria',
      valorCentavos: 'valor_invalido',
    });
  });

  it.each([
    [4, 'titulo_tamanho'],
    [5, undefined],
    [80, undefined],
    [81, 'titulo_tamanho'],
  ])('título com %i caracteres', (tamanho, esperado) => {
    const titulo = 'a'.repeat(tamanho);
    expect(validarTrampo({ ...TRAMPO_VALIDO, titulo }).titulo).toBe(esperado);
  });

  it.each([
    [4, 'titulo_tamanho'],
    [5, undefined],
    [80, undefined],
    [81, 'titulo_tamanho'],
  ])('título de %i emojis conta pontos de código', (tamanho, esperado) => {
    const titulo = '😀'.repeat(tamanho);
    expect(validarTrampo({ ...TRAMPO_VALIDO, titulo }).titulo).toBe(esperado);
  });

  it('título só de espaços e com caractere nulo é recusado', () => {
    expect(validarTrampo({ ...TRAMPO_VALIDO, titulo: '      ' }).titulo).toBe(
      'titulo_tamanho',
    );
    expect(
      validarTrampo({ ...TRAMPO_VALIDO, titulo: 'Pintar\u0000sala' }).titulo,
    ).toBe('titulo_tamanho');
  });

  it('o título é aparado antes de contar', () => {
    expect(validarTrampo({ ...TRAMPO_VALIDO, titulo: '  abcd  ' }).titulo).toBe(
      'titulo_tamanho',
    );
    expect(
      validarTrampo({ ...TRAMPO_VALIDO, titulo: '  abcde  ' }).titulo,
    ).toBeUndefined();
  });

  it.each([
    ['', 'descricao_trampo_obrigatoria'],
    ['   ', 'descricao_trampo_obrigatoria'],
    ['x', undefined],
    ['x'.repeat(2000), undefined],
    ['x'.repeat(2001), 'descricao_anuncio_tamanho'],
    ['x\u0000y', 'descricao_anuncio_tamanho'],
  ])('descrição %#', (descricao, esperado) => {
    expect(validarTrampo({ ...TRAMPO_VALIDO, descricao }).descricao).toBe(
      esperado,
    );
  });

  it.each([
    [null, 'categoria_obrigatoria'],
    ['', 'categoria_obrigatoria'],
    ['  ', 'categoria_obrigatoria'],
    ['reformas', undefined],
  ])('categoria %j', (categoria, esperado) => {
    expect(validarTrampo({ ...TRAMPO_VALIDO, categoria }).categoria).toBe(
      esperado,
    );
  });

  it.each([
    ['', 'cidade_anuncio_obrigatoria'],
    ['  ', 'cidade_anuncio_obrigatoria'],
    ['A', 'cidade_tamanho'],
    ['Ab', undefined],
    ['c'.repeat(80), undefined],
    ['c'.repeat(81), 'cidade_tamanho'],
  ])('cidade %#', (cidade, esperado) => {
    expect(validarTrampo({ ...TRAMPO_VALIDO, cidade }).cidade).toBe(esperado);
  });

  it.each([
    ['0', 'valor_invalido'],
    ['0,00', 'valor_invalido'],
    ['0,01', undefined],
    ['0,5', undefined],
    ['1', undefined],
    ['', 'valor_invalido'],
    ['abc', 'valor_invalido'],
    ['-5', 'valor_invalido'],
    ['1,234', 'valor_invalido'],
    [TETO, undefined],
    [ACIMA_DO_TETO, 'valor_alto'],
    ['R$ 99.999.999.999,00', 'valor_alto'],
    [`${'9'.repeat(40)},99`, 'valor_alto'],
  ])('valor %j', (valor, esperado) => {
    expect(validarTrampo({ ...TRAMPO_VALIDO, valor }).valorCentavos).toBe(
      esperado,
    );
  });

  it.each([
    ['31/02/2026', 'prazo_invalido'],
    ['31/12/1899', 'prazo_invalido'],
    ['amanhã', 'prazo_invalido'],
    ['2026-12-31', 'prazo_invalido'],
    ['31/12/9999', undefined],
    ['01/01/1900', undefined],
  ])('prazo %j', (prazo, esperado) => {
    expect(validarTrampo({ ...TRAMPO_VALIDO, prazo }).prazo).toBe(esperado);
  });

  it('CA15: nenhum valor de resposta é o texto digitado', () => {
    const SEGREDO = 'SEGREDO-do-cliente-123';
    const erros = validarTrampo({
      titulo: SEGREDO.repeat(4),
      descricao: `${SEGREDO}${'x'.repeat(2000)}`,
      categoria: SEGREDO,
      cidade: SEGREDO.repeat(5),
      valor: SEGREDO,
      prazo: SEGREDO,
    });
    expect(Object.keys(erros).sort()).toEqual([
      'cidade',
      'descricao',
      'prazo',
      'titulo',
      'valorCentavos',
    ]);
    expect(JSON.stringify(erros)).not.toContain('SEGREDO');
    for (const chave of Object.values(erros)) {
      expect(textos.erros).toHaveProperty(chave);
    }
  });
});

describe('validarServico', () => {
  it('formulário válido não devolve erro', () => {
    expect(validarServico(SERVICO_VALIDO)).toEqual({});
  });

  it('cidade em branco vale: serviço sem cidade (D7)', () => {
    expect(validarServico({ ...SERVICO_VALIDO, cidade: '   ' })).toEqual({});
  });

  it('formulário vazio aponta os obrigatórios, sem cobrar cidade', () => {
    expect(
      validarServico({
        titulo: '',
        descricao: '',
        categoria: null,
        cidade: '',
        valor: '',
      }),
    ).toEqual({
      titulo: 'titulo_tamanho',
      descricao: 'descricao_servico_obrigatoria',
      categoria: 'categoria_obrigatoria',
      precoBaseCentavos: 'valor_invalido',
    });
  });

  it.each([
    ['A', 'cidade_tamanho'],
    ['Ab', undefined],
    ['c'.repeat(81), 'cidade_tamanho'],
    ['\u0301\u0301', 'cidade_tamanho'],
    ['La\u0000', 'cidade_tamanho'],
  ])('cidade preenchida %#', (cidade, esperado) => {
    expect(validarServico({ ...SERVICO_VALIDO, cidade }).cidade).toBe(esperado);
  });

  it.each([
    [4, 'titulo_tamanho'],
    [5, undefined],
    [80, undefined],
    [81, 'titulo_tamanho'],
  ])('título com %i caracteres', (tamanho, esperado) => {
    const titulo = 'a'.repeat(tamanho);
    expect(validarServico({ ...SERVICO_VALIDO, titulo }).titulo).toBe(esperado);
  });

  it.each([
    ['0', 'valor_invalido'],
    ['1', undefined],
    [TETO, undefined],
    [ACIMA_DO_TETO, 'valor_alto'],
  ])('preço base %j', (valor, esperado) => {
    expect(validarServico({ ...SERVICO_VALIDO, valor }).precoBaseCentavos).toBe(
      esperado,
    );
  });

  it('descrição acima de 2000 e categoria ausente', () => {
    expect(
      validarServico({
        ...SERVICO_VALIDO,
        descricao: 'x'.repeat(2001),
        categoria: null,
      }),
    ).toEqual({
      descricao: 'descricao_anuncio_tamanho',
      categoria: 'categoria_obrigatoria',
    });
  });
});

describe('validarCandidatura', () => {
  it('formulário válido não devolve erro', () => {
    expect(validarCandidatura(CANDIDATURA_VALIDA)).toEqual({});
  });

  it('vazio aponta mensagem e valor proposto', () => {
    expect(validarCandidatura({ mensagem: '  ', valor: '' })).toEqual({
      mensagem: 'mensagem_obrigatoria',
      valorPropostoCentavos: 'valor_proposto_invalido',
    });
  });

  it.each([
    ['', 'mensagem_obrigatoria'],
    ['x', undefined],
    ['x'.repeat(2000), undefined],
    ['x'.repeat(2001), 'mensagem_tamanho'],
    ['oi\u0000', 'mensagem_tamanho'],
  ])('mensagem %#', (mensagem, esperado) => {
    expect(
      validarCandidatura({ ...CANDIDATURA_VALIDA, mensagem }).mensagem,
    ).toBe(esperado);
  });

  it.each([
    ['0', 'valor_proposto_invalido'],
    ['abc', 'valor_proposto_invalido'],
    ['0,01', undefined],
    [TETO, undefined],
    [ACIMA_DO_TETO, 'valor_alto'],
  ])('valor proposto %j', (valor, esperado) => {
    expect(
      validarCandidatura({ ...CANDIDATURA_VALIDA, valor })
        .valorPropostoCentavos,
    ).toBe(esperado);
  });

  it('CA15: não devolve o texto digitado', () => {
    const erros = validarCandidatura({
      mensagem: `SEGREDO${'x'.repeat(2001)}`,
      valor: 'SEGREDO',
    });
    expect(JSON.stringify(erros)).not.toContain('SEGREDO');
    expect(Object.keys(erros).sort()).toEqual([
      'mensagem',
      'valorPropostoCentavos',
    ]);
  });
});
