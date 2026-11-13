import { describe, expect, it } from 'vitest';
import {
  type CampoInvalido,
  ErroDeValidacao,
} from '../../../compartilhado/dominio/erros.js';
import {
  type ContextoDaAvaliacao,
  criarAvaliacao,
  DESTAQUES_POR_PAPEL,
  type EntradaDeAvaliacao,
  ehUuid,
  LIMITES_DA_AVALIACAO,
  lerEntradaDeAvaliacao,
} from './avaliacao.js';

const TRAMPO = '0b3c7d2e-1f4a-4b5c-8d6e-7f8a9b0c1d2e';

const CONTEXTO: ContextoDaAvaliacao = {
  id: 'avaliacao-1',
  avaliadorId: 'conta-autor',
  avaliadoId: 'conta-freela',
  papelDoAvaliado: 'freela',
  agora: new Date('2026-11-13T12:00:00.000Z'),
};

function camposDoErro(entrada: EntradaDeAvaliacao): readonly CampoInvalido[] {
  try {
    lerEntradaDeAvaliacao(entrada);
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroDeValidacao);
    return (erro as ErroDeValidacao).campos;
  }
  throw new Error('esperava ErroDeValidacao');
}

describe('ehUuid', () => {
  it.each([
    [TRAMPO, true],
    [TRAMPO.toUpperCase(), true],
    ['', false],
    ['nao-e-uuid', false],
    [`${TRAMPO}x`, false],
    [` ${TRAMPO}`, false],
    [42, false],
    [null, false],
  ])('%s → %s', (valor, esperado) => {
    expect(ehUuid(valor)).toBe(esperado);
  });
});

describe('lerEntradaDeAvaliacao', () => {
  it('aceita o corpo mínimo: destaques vazios e comentário nulo', () => {
    expect(lerEntradaDeAvaliacao({ trampoId: TRAMPO, nota: 5 })).toEqual({
      trampoId: TRAMPO,
      nota: 5,
      destaques: [],
      comentario: null,
    });
  });

  it('põe o trampoId em minúsculas e apara o comentário', () => {
    const pedida = lerEntradaDeAvaliacao({
      trampoId: TRAMPO.toUpperCase(),
      nota: 4,
      destaques: ['pontual', 'educado'],
      comentario: '  Muito bom!\n',
    });
    expect(pedida).toEqual({
      trampoId: TRAMPO,
      nota: 4,
      destaques: ['pontual', 'educado'],
      comentario: 'Muito bom!',
    });
    expect(Object.isFrozen(pedida)).toBe(true);
    expect(Object.isFrozen(pedida.destaques)).toBe(true);
  });

  it.each([
    ['ausente', undefined, 'obrigatorio'],
    ['vazio', '', 'obrigatorio'],
    ['fora do formato', 'abc', 'invalido'],
    ['número', 7, 'invalido'],
  ])('trampoId %s → %s', (_caso, trampoId, motivo) => {
    expect(camposDoErro({ trampoId, nota: 3 })).toEqual([
      { campo: 'trampoId', motivo },
    ]);
  });

  it.each([
    ['ausente', undefined, 'obrigatorio'],
    ['nula', null, 'obrigatorio'],
    ['zero', 0, 'invalido'],
    ['seis', 6, 'invalido'],
    ['fracionária', 4.5, 'invalido'],
    ['texto', '5', 'invalido'],
    ['NaN', Number.NaN, 'invalido'],
  ])('nota %s → %s', (_caso, nota, motivo) => {
    expect(camposDoErro({ trampoId: TRAMPO, nota })).toEqual([
      { campo: 'nota', motivo },
    ]);
  });

  it.each([1, 2, 3, 4, 5])('nota %i é aceita', (nota) => {
    expect(lerEntradaDeAvaliacao({ trampoId: TRAMPO, nota }).nota).toBe(nota);
  });

  it.each([
    ['não é lista', 'pontual', 'invalido'],
    ['código desconhecido', ['legal'], 'invalido'],
    ['item que não é texto', [1], 'invalido'],
    ['repetido', ['pontual', 'pontual'], 'invalido'],
    [
      'mais de 5',
      ['pontual', 'organizado', 'rapido', 'educado', 'proativo', 'respeitoso'],
      'tamanho',
    ],
  ])('destaques %s → %s', (_caso, destaques, motivo) => {
    expect(camposDoErro({ trampoId: TRAMPO, nota: 3, destaques })).toEqual([
      { campo: 'destaques', motivo },
    ]);
  });

  it('destaques nulos valem lista vazia', () => {
    expect(
      lerEntradaDeAvaliacao({ trampoId: TRAMPO, nota: 3, destaques: null })
        .destaques,
    ).toEqual([]);
  });

  it.each([
    ['nulo', null],
    ['vazio', ''],
    ['só espaços', ' \n\t '],
  ])('comentário %s vale null', (_caso, comentario) => {
    expect(
      lerEntradaDeAvaliacao({ trampoId: TRAMPO, nota: 3, comentario })
        .comentario,
    ).toBeNull();
  });

  it('comentário conta pontos de código: 500 emojis passam, 501 não', () => {
    const max = LIMITES_DA_AVALIACAO.comentario.max;
    expect(
      lerEntradaDeAvaliacao({
        trampoId: TRAMPO,
        nota: 3,
        comentario: '😀'.repeat(max),
      }).comentario,
    ).toBe('😀'.repeat(max));
    expect(
      camposDoErro({ trampoId: TRAMPO, nota: 3, comentario: 'a'.repeat(501) }),
    ).toEqual([{ campo: 'comentario', motivo: 'tamanho' }]);
  });

  it.each([
    ['com caractere nulo', 'oi\u0000'],
    ['número', 12],
  ])('comentário %s → invalido', (_caso, comentario) => {
    expect(camposDoErro({ trampoId: TRAMPO, nota: 3, comentario })).toEqual([
      { campo: 'comentario', motivo: 'invalido' },
    ]);
  });

  it('lista todos os campos inválidos juntos, sem o valor recebido', () => {
    const comentario = `segredo-${'x'.repeat(600)}`;
    let erro: unknown;
    try {
      lerEntradaDeAvaliacao({
        trampoId: 'abc',
        nota: 9,
        destaques: ['legal'],
        comentario,
      });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroDeValidacao);
    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'trampoId', motivo: 'invalido' },
      { campo: 'nota', motivo: 'invalido' },
      { campo: 'destaques', motivo: 'invalido' },
      { campo: 'comentario', motivo: 'tamanho' },
    ]);
    const serializado = `${(erro as Error).message} ${JSON.stringify(erro)}`;
    expect(serializado).not.toContain('segredo');
    expect(serializado).not.toContain('legal');
  });
});

describe('criarAvaliacao', () => {
  const pedida = lerEntradaDeAvaliacao({
    trampoId: TRAMPO,
    nota: 5,
    destaques: ['pontual', 'proativo'],
    comentario: 'Ótimo',
  });

  it('cria a avaliação congelada, com cópia da data', () => {
    const avaliacao = criarAvaliacao(pedida, CONTEXTO);
    expect(avaliacao).toEqual({
      id: 'avaliacao-1',
      trampoId: TRAMPO,
      avaliadorId: 'conta-autor',
      avaliadoId: 'conta-freela',
      papelDoAvaliado: 'freela',
      nota: 5,
      destaques: ['pontual', 'proativo'],
      comentario: 'Ótimo',
      criadaEm: CONTEXTO.agora,
    });
    expect(avaliacao.criadaEm).not.toBe(CONTEXTO.agora);
    expect(Object.isFrozen(avaliacao)).toBe(true);
  });

  it('recusa destaque que não é da lista do papel do avaliado', () => {
    const doContratante = lerEntradaDeAvaliacao({
      trampoId: TRAMPO,
      nota: 4,
      destaques: ['pagamento_em_dia'],
    });
    expect(() => criarAvaliacao(doContratante, CONTEXTO)).toThrow(
      ErroDeValidacao,
    );
    expect(
      criarAvaliacao(doContratante, {
        ...CONTEXTO,
        papelDoAvaliado: 'contratante',
      }).destaques,
    ).toEqual(['pagamento_em_dia']);
  });

  it('as listas fechadas têm 5 códigos cada, sem repetição', () => {
    for (const lista of Object.values(DESTAQUES_POR_PAPEL)) {
      expect(lista).toHaveLength(5);
      expect(new Set(lista).size).toBe(5);
    }
  });
});
