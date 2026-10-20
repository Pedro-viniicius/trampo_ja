import { describe, expect, it } from 'vitest';
import {
  type CampoInvalido,
  ErroDeValidacao,
} from '../../../compartilhado/dominio/erros.js';
import {
  type ContextoDeCriacao,
  criarServico,
  type EntradaDeServico,
  LIMITES_DO_SERVICO,
} from './servico.js';

const CONTEXTO: ContextoDeCriacao = {
  id: '11111111-1111-4111-8111-111111111111',
  autorId: 'autor-1',
  agora: new Date('2026-10-20T12:00:00.000Z'),
};

const VALIDA: EntradaDeServico = {
  titulo: 'Eletricista residencial',
  descricao: 'Instalação e conserto de tomadas, chuveiros e quadros.',
  categoria: 'reformas',
  cidade: 'São Paulo',
  precoBaseCentavos: 15000,
};

function camposDoErro(entrada: EntradaDeServico | null | undefined) {
  try {
    criarServico(entrada, CONTEXTO);
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroDeValidacao);
    return (erro as ErroDeValidacao).campos;
  }
  throw new Error('esperava ErroDeValidacao');
}

describe('criarServico', () => {
  it('cria um serviço ativo com texto de busca e cidade normalizados', () => {
    const servico = criarServico(VALIDA, CONTEXTO);
    expect(servico).toEqual({
      id: CONTEXTO.id,
      autorId: 'autor-1',
      titulo: 'Eletricista residencial',
      descricao: 'Instalação e conserto de tomadas, chuveiros e quadros.',
      categoria: 'reformas',
      cidade: 'São Paulo',
      cidadeNormalizada: 'sao paulo',
      textoBusca:
        'eletricista residencial instalacao e conserto de tomadas, chuveiros e quadros.',
      precoBaseCentavos: 15000,
      status: 'ativo',
      criadoEm: CONTEXTO.agora,
    });
  });

  it('apara espaços nas pontas e não compartilha a data do contexto', () => {
    const servico = criarServico(
      { ...VALIDA, titulo: '  Eletricista  ', cidade: ' Recife ' },
      CONTEXTO,
    );
    expect(servico.titulo).toBe('Eletricista');
    expect(servico.cidade).toBe('Recife');
    expect(servico.criadoEm).not.toBe(CONTEXTO.agora);
  });

  it.each([undefined, null, '', '   '])(
    'D7: cidade %j significa serviço sem cidade',
    (cidade) => {
      const servico = criarServico({ ...VALIDA, cidade }, CONTEXTO);
      expect(servico).not.toHaveProperty('cidade');
      expect(servico).not.toHaveProperty('cidadeNormalizada');
    },
  );

  it('aceita os limites exatos de tamanho', () => {
    expect(() =>
      criarServico(
        {
          ...VALIDA,
          titulo: 'a'.repeat(LIMITES_DO_SERVICO.titulo.min),
          descricao: 'd'.repeat(LIMITES_DO_SERVICO.descricao.max),
          cidade: 'c'.repeat(LIMITES_DO_SERVICO.cidade.max),
        },
        CONTEXTO,
      ),
    ).not.toThrow();
    expect(() =>
      criarServico(
        {
          ...VALIDA,
          titulo: 'a'.repeat(LIMITES_DO_SERVICO.titulo.max),
          descricao: 'd',
          cidade: 'cc',
        },
        CONTEXTO,
      ),
    ).not.toThrow();
  });

  it.each<[string, EntradaDeServico, CampoInvalido]>([
    [
      'título ausente',
      { ...VALIDA, titulo: undefined },
      { campo: 'titulo', motivo: 'obrigatorio' },
    ],
    [
      'título em branco',
      { ...VALIDA, titulo: '   ' },
      { campo: 'titulo', motivo: 'obrigatorio' },
    ],
    [
      'título curto',
      { ...VALIDA, titulo: 'abcd' },
      { campo: 'titulo', motivo: 'tamanho' },
    ],
    [
      'título longo',
      { ...VALIDA, titulo: 'a'.repeat(81) },
      { campo: 'titulo', motivo: 'tamanho' },
    ],
    [
      'título que não é texto',
      { ...VALIDA, titulo: 12345 },
      { campo: 'titulo', motivo: 'invalido' },
    ],
    [
      'descrição ausente',
      { ...VALIDA, descricao: null },
      { campo: 'descricao', motivo: 'obrigatorio' },
    ],
    [
      'descrição longa',
      { ...VALIDA, descricao: 'd'.repeat(2001) },
      { campo: 'descricao', motivo: 'tamanho' },
    ],
    [
      'categoria ausente',
      { ...VALIDA, categoria: undefined },
      { campo: 'categoria', motivo: 'obrigatorio' },
    ],
    [
      'categoria desconhecida',
      { ...VALIDA, categoria: 'jardinagem' },
      { campo: 'categoria', motivo: 'invalido' },
    ],
    [
      'categoria com caixa errada',
      { ...VALIDA, categoria: 'TI' },
      { campo: 'categoria', motivo: 'invalido' },
    ],
    [
      'cidade curta',
      { ...VALIDA, cidade: 'A' },
      { campo: 'cidade', motivo: 'tamanho' },
    ],
    [
      'cidade longa',
      { ...VALIDA, cidade: 'c'.repeat(81) },
      { campo: 'cidade', motivo: 'tamanho' },
    ],
    [
      'cidade que não é texto',
      { ...VALIDA, cidade: 10 },
      { campo: 'cidade', motivo: 'invalido' },
    ],
    [
      'preço ausente',
      { ...VALIDA, precoBaseCentavos: undefined },
      { campo: 'precoBaseCentavos', motivo: 'obrigatorio' },
    ],
    [
      'preço zero',
      { ...VALIDA, precoBaseCentavos: 0 },
      { campo: 'precoBaseCentavos', motivo: 'invalido' },
    ],
    [
      'preço negativo',
      { ...VALIDA, precoBaseCentavos: -1 },
      { campo: 'precoBaseCentavos', motivo: 'invalido' },
    ],
    [
      'preço fracionado',
      { ...VALIDA, precoBaseCentavos: 10.5 },
      { campo: 'precoBaseCentavos', motivo: 'invalido' },
    ],
    [
      'preço em texto',
      { ...VALIDA, precoBaseCentavos: '100' },
      { campo: 'precoBaseCentavos', motivo: 'invalido' },
    ],
    [
      'preço NaN',
      { ...VALIDA, precoBaseCentavos: Number.NaN },
      { campo: 'precoBaseCentavos', motivo: 'invalido' },
    ],
    [
      'título com caractere nulo',
      { ...VALIDA, titulo: 'Pintura\u0000casa' },
      { campo: 'titulo', motivo: 'invalido' },
    ],
    [
      'descrição com caractere nulo',
      { ...VALIDA, descricao: 'x\u0000y' },
      { campo: 'descricao', motivo: 'invalido' },
    ],
    [
      'cidade com caractere nulo',
      { ...VALIDA, cidade: 'La\u0000vras' },
      { campo: 'cidade', motivo: 'invalido' },
    ],
    [
      'preço acima do integer do banco',
      { ...VALIDA, precoBaseCentavos: 2_147_483_648 },
      { campo: 'precoBaseCentavos', motivo: 'invalido' },
    ],
  ])('recusa %s', (_nome, entrada, esperado) => {
    expect(camposDoErro(entrada)).toEqual([esperado]);
  });

  it('junta todos os campos inválidos num único erro', () => {
    expect(
      camposDoErro({
        titulo: 'ab',
        categoria: 'x',
        cidade: 'A',
        precoBaseCentavos: 0,
      }),
    ).toEqual([
      { campo: 'titulo', motivo: 'tamanho' },
      { campo: 'descricao', motivo: 'obrigatorio' },
      { campo: 'categoria', motivo: 'invalido' },
      { campo: 'precoBaseCentavos', motivo: 'invalido' },
      { campo: 'cidade', motivo: 'tamanho' },
    ]);
  });

  it('trata entrada nula como todos os obrigatórios ausentes', () => {
    expect(camposDoErro(null).map((c) => c.campo)).toEqual([
      'titulo',
      'descricao',
      'categoria',
      'precoBaseCentavos',
    ]);
  });

  it('não coloca o valor informado no erro (CA15)', () => {
    const segredo = 'texto-pessoal-que-nao-pode-vazar';
    try {
      criarServico(
        { ...VALIDA, titulo: 'ab', descricao: segredo, cidade: 'x' },
        CONTEXTO,
      );
      throw new Error('esperava ErroDeValidacao');
    } catch (erro) {
      const serializado = JSON.stringify(erro) + String(erro);
      expect(serializado).not.toContain('ab"');
      expect(serializado).not.toContain(segredo);
      expect((erro as Error).message).not.toContain('Eletricista');
    }
  });
});
