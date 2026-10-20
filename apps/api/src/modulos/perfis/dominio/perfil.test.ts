import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  type CampoInvalido,
  ErroDeValidacao,
} from '../../../compartilhado/dominio/erros.js';
import {
  type ContextoDoPerfil,
  type EntradaDePerfil,
  LIMITES_DO_PERFIL,
  Perfil,
} from './perfil.js';

const CONTEXTO: ContextoDoPerfil = {
  contaId: '11111111-1111-4111-8111-111111111111',
  agora: new Date('2026-10-20T12:00:00.000Z'),
};

const NOME = 'Maria Aparecida Souza';
const CIDADE = 'São José dos Campos';
const DESCRICAO = 'Pintora com dez anos de experiência em obras residenciais.';

const VALIDA: EntradaDePerfil = {
  nome: NOME,
  cidade: CIDADE,
  descricao: DESCRICAO,
  habilidades: ['Pintura', 'Gesso'],
};

function camposDoErro(
  entrada: EntradaDePerfil | null | undefined,
): readonly CampoInvalido[] {
  try {
    Perfil.criar(entrada, CONTEXTO);
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroDeValidacao);
    return (erro as ErroDeValidacao).campos;
  }
  throw new Error('esperava ErroDeValidacao');
}

function erroDe(entrada: EntradaDePerfil): ErroDeValidacao {
  try {
    Perfil.criar(entrada, CONTEXTO);
  } catch (erro) {
    return erro as ErroDeValidacao;
  }
  throw new Error('esperava ErroDeValidacao');
}

const letras = (n: number) => 'a'.repeat(n);

describe('Perfil.criar', () => {
  it('cria o perfil com os textos aparados, a cidade normalizada e completo', () => {
    const perfil = Perfil.criar(
      {
        nome: `  ${NOME} `,
        cidade: `  ${CIDADE}  `,
        descricao: ` ${DESCRICAO} `,
        habilidades: [' Pintura ', 'Gesso'],
      },
      CONTEXTO,
    );

    expect(perfil.contaId).toBe(CONTEXTO.contaId);
    expect(perfil.nome).toBe(NOME);
    expect(perfil.cidade).toBe(CIDADE);
    expect(perfil.cidadeNormalizada).toBe('sao jose dos campos');
    expect(perfil.descricao).toBe(DESCRICAO);
    expect(perfil.habilidades).toEqual(['Pintura', 'Gesso']);
    expect(perfil.atualizadoEm).toEqual(CONTEXTO.agora);
    expect(perfil.completo).toBe(true);
  });

  it('é imutável: lista de habilidades congelada e data devolvida em cópia', () => {
    const habilidades = ['Pintura'];
    const perfil = Perfil.criar({ ...VALIDA, habilidades }, CONTEXTO);
    habilidades.push('Gesso');

    expect(perfil.habilidades).toEqual(['Pintura']);
    expect(Object.isFrozen(perfil)).toBe(true);
    expect(Object.isFrozen(perfil.habilidades)).toBe(true);
    perfil.atualizadoEm.setFullYear(2000);
    expect(perfil.atualizadoEm).toEqual(CONTEXTO.agora);
  });

  it('entrada nula ou vazia aponta nome, cidade e habilidades como obrigatórios', () => {
    const esperado = [
      { campo: 'nome', motivo: 'obrigatorio' },
      { campo: 'cidade', motivo: 'obrigatorio' },
      { campo: 'habilidades', motivo: 'obrigatorio' },
    ];
    expect(camposDoErro(null)).toEqual(esperado);
    expect(camposDoErro(undefined)).toEqual(esperado);
    expect(camposDoErro({})).toEqual(esperado);
    expect(
      camposDoErro({ nome: '   ', cidade: null, habilidades: [] }),
    ).toEqual(esperado);
  });

  it('aponta todos os campos inválidos de uma vez', () => {
    expect(
      camposDoErro({
        nome: 'A',
        cidade: 42,
        descricao: letras(301),
        habilidades: ['Pintura', 'x'],
      }),
    ).toEqual([
      { campo: 'nome', motivo: 'tamanho' },
      { campo: 'cidade', motivo: 'invalido' },
      { campo: 'descricao', motivo: 'tamanho' },
      { campo: 'habilidades.1', motivo: 'tamanho' },
    ]);
  });

  describe('nome', () => {
    it.each([
      ['mínimo', LIMITES_DO_PERFIL.nome.min],
      ['máximo', LIMITES_DO_PERFIL.nome.max],
    ])('aceita o tamanho %s (%i)', (_rotulo, tamanho) => {
      expect(
        Perfil.criar({ ...VALIDA, nome: letras(tamanho) }, CONTEXTO).nome,
      ).toHaveLength(tamanho);
    });

    it.each([
      ['curto', letras(1)],
      ['longo', letras(81)],
      ['curto depois de aparado', ' a '],
    ])('recusa nome %s com tamanho', (_rotulo, nome) => {
      expect(camposDoErro({ ...VALIDA, nome })).toEqual([
        { campo: 'nome', motivo: 'tamanho' },
      ]);
    });

    it('conta emoji como um caractere', () => {
      expect(Perfil.criar({ ...VALIDA, nome: 'Zé🙂' }, CONTEXTO).nome).toBe(
        'Zé🙂',
      );
      expect(camposDoErro({ ...VALIDA, nome: '🙂' })).toEqual([
        { campo: 'nome', motivo: 'tamanho' },
      ]);
    });

    it('recusa tipo que não é texto como inválido', () => {
      expect(camposDoErro({ ...VALIDA, nome: ['Maria'] })).toEqual([
        { campo: 'nome', motivo: 'invalido' },
      ]);
    });
  });

  describe('cidade', () => {
    it.each([
      ['curta', 'R'],
      ['longa', letras(81)],
    ])('recusa cidade %s com tamanho', (_rotulo, cidade) => {
      expect(camposDoErro({ ...VALIDA, cidade })).toEqual([
        { campo: 'cidade', motivo: 'tamanho' },
      ]);
    });

    it('aceita os limites de 2 e 80 caracteres', () => {
      expect(Perfil.criar({ ...VALIDA, cidade: 'Ré' }, CONTEXTO).cidade).toBe(
        'Ré',
      );
      expect(
        Perfil.criar({ ...VALIDA, cidade: letras(80) }, CONTEXTO).cidade,
      ).toHaveLength(80);
    });

    it('normaliza minúsculas, acentos e espaços', () => {
      const perfil = Perfil.criar(
        { ...VALIDA, cidade: 'SÃO   Paulo' },
        CONTEXTO,
      );
      expect(perfil.cidade).toBe('SÃO   Paulo');
      expect(perfil.cidadeNormalizada).toBe('sao paulo');
    });

    it('recusa cidade que normaliza para vazio', () => {
      expect(camposDoErro({ ...VALIDA, cidade: '́́' })).toEqual([
        { campo: 'cidade', motivo: 'invalido' },
      ]);
    });

    it('recusa tipo que não é texto como inválido', () => {
      expect(camposDoErro({ ...VALIDA, cidade: { nome: 'Recife' } })).toEqual([
        { campo: 'cidade', motivo: 'invalido' },
      ]);
    });
  });

  describe('descrição (opcional)', () => {
    it.each([
      ['ausente', undefined],
      ['nula', null],
      ['vazia', ''],
      ['em branco', '   '],
    ])('descrição %s fica ausente', (_rotulo, descricao) => {
      const perfil = Perfil.criar({ ...VALIDA, descricao }, CONTEXTO);
      expect(perfil.descricao).toBeUndefined();
      expect(perfil).not.toHaveProperty('descricao');
    });

    it('aceita até 300 caracteres, contados depois de aparar', () => {
      const perfil = Perfil.criar(
        { ...VALIDA, descricao: ` ${letras(300)} ` },
        CONTEXTO,
      );
      expect(perfil.descricao).toHaveLength(300);
    });

    it('recusa mais de 300 caracteres com tamanho', () => {
      expect(camposDoErro({ ...VALIDA, descricao: letras(301) })).toEqual([
        { campo: 'descricao', motivo: 'tamanho' },
      ]);
    });

    it('recusa tipo que não é texto como inválido', () => {
      expect(camposDoErro({ ...VALIDA, descricao: 300 })).toEqual([
        { campo: 'descricao', motivo: 'invalido' },
      ]);
    });
  });

  describe('habilidades', () => {
    it('aceita de 1 a 10 itens', () => {
      expect(
        Perfil.criar({ ...VALIDA, habilidades: ['Gesso'] }, CONTEXTO)
          .habilidades,
      ).toEqual(['Gesso']);
      const dez = Array.from({ length: 10 }, (_, i) => `Habilidade ${i}`);
      expect(
        Perfil.criar({ ...VALIDA, habilidades: dez }, CONTEXTO).habilidades,
      ).toEqual(dez);
    });

    it('lista vazia, nula ou ausente é obrigatória', () => {
      for (const habilidades of [[], null, undefined]) {
        expect(camposDoErro({ ...VALIDA, habilidades })).toEqual([
          { campo: 'habilidades', motivo: 'obrigatorio' },
        ]);
      }
    });

    it('mais de 10 itens é tamanho', () => {
      const onze = Array.from({ length: 11 }, (_, i) => `Habilidade ${i}`);
      expect(camposDoErro({ ...VALIDA, habilidades: onze })).toEqual([
        { campo: 'habilidades', motivo: 'tamanho' },
      ]);
    });

    it('valor que não é lista é inválido', () => {
      expect(camposDoErro({ ...VALIDA, habilidades: 'Pintura' })).toEqual([
        { campo: 'habilidades', motivo: 'invalido' },
      ]);
    });

    it('aponta cada item fora do limite pelo índice', () => {
      expect(
        camposDoErro({
          ...VALIDA,
          habilidades: ['Pintura', 'a', letras(31), '  ', 7],
        }),
      ).toEqual([
        { campo: 'habilidades.1', motivo: 'tamanho' },
        { campo: 'habilidades.2', motivo: 'tamanho' },
        { campo: 'habilidades.3', motivo: 'tamanho' },
        { campo: 'habilidades.4', motivo: 'invalido' },
      ]);
    });

    it('aceita item com 2 e com 30 caracteres depois de aparado', () => {
      expect(
        Perfil.criar({ ...VALIDA, habilidades: [' TI ', letras(30)] }, CONTEXTO)
          .habilidades,
      ).toEqual(['TI', letras(30)]);
    });

    it('recusa duplicada depois de normalizar, apontando a repetida', () => {
      expect(
        camposDoErro({
          ...VALIDA,
          habilidades: ['Pintura', 'Gesso', ' PINTURA ', 'gêsso'],
        }),
      ).toEqual([
        { campo: 'habilidades.2', motivo: 'invalido' },
        { campo: 'habilidades.3', motivo: 'invalido' },
      ]);
    });
  });
});

describe('Perfil.criar — caractere nulo (o Postgres não o guarda em text)', () => {
  it.each([
    ['nome', { nome: 'Maria\u0000Souza' }, 'nome'],
    ['cidade', { cidade: 'Lav\u0000ras' }, 'cidade'],
    ['descrição', { descricao: 'texto\u0000' }, 'descricao'],
    [
      'habilidade',
      { habilidades: ['Pintura', 'Ges\u0000so'] },
      'habilidades.1',
    ],
  ] as const)('recusa %s com invalido', (_rotulo, alteracao, campo) => {
    expect(camposDoErro({ ...VALIDA, ...alteracao })).toEqual([
      { campo, motivo: 'invalido' },
    ]);
  });
});

describe('Perfil — CA15, sem dado pessoal em erro nem em log', () => {
  it('o erro de validação não carrega nome, cidade, descrição nem habilidade', () => {
    const erro = erroDe({
      nome: `${NOME} ${letras(80)}`,
      cidade: `${CIDADE} ${letras(80)}`,
      descricao: `${DESCRICAO} ${letras(300)}`,
      habilidades: ['Pintura artística avançada demais', 'ok', 'ok'],
    });
    const textos = [
      erro.message,
      String(erro.stack),
      JSON.stringify(erro),
      JSON.stringify(erro.campos),
      inspect(erro),
    ].join('\n');

    for (const valor of [NOME, CIDADE, DESCRICAO, 'Pintura artística']) {
      expect(textos).not.toContain(valor);
    }
  });

  it('toJSON e inspect mostram só conta, completude e data', () => {
    const perfil = Perfil.criar(VALIDA, CONTEXTO);

    expect(JSON.parse(JSON.stringify(perfil))).toEqual({
      contaId: CONTEXTO.contaId,
      completo: true,
      atualizadoEm: '2026-10-20T12:00:00.000Z',
    });
    const inspecionado = inspect({ perfil });
    for (const valor of [NOME, CIDADE, DESCRICAO, 'Pintura', 'Gesso']) {
      expect(JSON.stringify(perfil)).not.toContain(valor);
      expect(inspecionado).not.toContain(valor);
    }
  });
});

describe('Perfil.reconstituir', () => {
  it('reconstrói o perfil gravado, com e sem descrição', () => {
    const dados = {
      contaId: CONTEXTO.contaId,
      nome: NOME,
      cidade: CIDADE,
      cidadeNormalizada: 'sao jose dos campos',
      habilidades: ['Pintura'],
      atualizadoEm: CONTEXTO.agora,
    };
    const semDescricao = Perfil.reconstituir(dados);
    const comDescricao = Perfil.reconstituir({
      ...dados,
      descricao: DESCRICAO,
    });

    expect(semDescricao).not.toHaveProperty('descricao');
    expect(comDescricao.descricao).toBe(DESCRICAO);
    expect(semDescricao.completo).toBe(true);
  });

  it('D9 — sem habilidade, o perfil reconstituído não é completo', () => {
    const perfil = Perfil.reconstituir({
      contaId: CONTEXTO.contaId,
      nome: NOME,
      cidade: CIDADE,
      cidadeNormalizada: 'sao jose dos campos',
      habilidades: [],
      atualizadoEm: CONTEXTO.agora,
    });
    expect(perfil.completo).toBe(false);
  });

  it('recusa id de conta vazio e data inválida', () => {
    const base = {
      contaId: CONTEXTO.contaId,
      nome: NOME,
      cidade: CIDADE,
      cidadeNormalizada: 'x',
      habilidades: ['Pintura'],
      atualizadoEm: CONTEXTO.agora,
    };
    expect(() => Perfil.reconstituir({ ...base, contaId: '' })).toThrow(
      TypeError,
    );
    expect(() =>
      Perfil.reconstituir({ ...base, atualizadoEm: new Date('x') }),
    ).toThrow(TypeError);
  });
});
