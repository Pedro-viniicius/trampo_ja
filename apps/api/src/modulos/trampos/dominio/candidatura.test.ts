import { describe, expect, it } from 'vitest';
import { ErroDeValidacao } from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import {
  copiarCandidatura,
  criarCandidatura,
  lerTexto,
  lerValorEmCentavos,
  VALOR_MAXIMO_CENTAVOS,
} from './candidatura.js';

const relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');

function camposDoErro(fn: () => unknown) {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      return erro.campos;
    }
    throw erro;
  }
  throw new Error('não lançou');
}

describe('criarCandidatura', () => {
  it('cria pendente com a mensagem aparada', () => {
    const c = criarCandidatura(
      't1',
      'f1',
      { mensagem: '  Posso fazer.  ', valorPropostoCentavos: 5000 },
      relogio,
    );
    expect(c).toMatchObject({
      trampoId: 't1',
      freelancerId: 'f1',
      mensagem: 'Posso fazer.',
      valorPropostoCentavos: 5000,
      status: 'pendente',
    });
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.criadaEm.toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('junta os campos inválidos num só erro, sem o valor informado', () => {
    const campos = camposDoErro(() =>
      criarCandidatura(
        't1',
        'f1',
        { mensagem: '   ', valorPropostoCentavos: 0 },
        relogio,
      ),
    );
    expect(campos).toEqual([
      { campo: 'mensagem', motivo: 'obrigatorio' },
      { campo: 'valorPropostoCentavos', motivo: 'invalido' },
    ]);
  });

  it('recusa mensagem acima de 2000 caracteres', () => {
    const campos = camposDoErro(() =>
      criarCandidatura(
        't1',
        'f1',
        { mensagem: 'a'.repeat(2001), valorPropostoCentavos: 1 },
        relogio,
      ),
    );
    expect(campos).toEqual([{ campo: 'mensagem', motivo: 'tamanho' }]);
  });
});

describe('lerTexto', () => {
  it('trata ausente, vazio, tipo errado e tamanho', () => {
    expect(lerTexto(undefined, 1, 5)).toEqual({
      ok: false,
      motivo: 'obrigatorio',
    });
    expect(lerTexto(null, 1, 5)).toEqual({ ok: false, motivo: 'obrigatorio' });
    expect(lerTexto('  ', 1, 5)).toEqual({ ok: false, motivo: 'obrigatorio' });
    expect(lerTexto(42, 1, 5)).toEqual({ ok: false, motivo: 'invalido' });
    expect(lerTexto('abcdef', 1, 5)).toEqual({ ok: false, motivo: 'tamanho' });
    expect(lerTexto('a', 2, 5)).toEqual({ ok: false, motivo: 'tamanho' });
    expect(lerTexto(' abcde ', 2, 5)).toEqual({ ok: true, valor: 'abcde' });
  });

  it('conta pontos de código, não unidades UTF-16', () => {
    expect(lerTexto('😀😀', 2, 2)).toEqual({ ok: true, valor: '😀😀' });
  });

  it('recusa caractere nulo, em qualquer posição, com invalido', () => {
    for (const texto of ['oi\u0000oi', '\u0000abc', 'abc\u0000', '\u0000']) {
      expect(lerTexto(texto, 1, 50)).toEqual({ ok: false, motivo: 'invalido' });
    }
  });
});

describe('lerValorEmCentavos', () => {
  it('aceita só inteiro entre 1 e o teto do banco', () => {
    expect(lerValorEmCentavos(1)).toEqual({ ok: true, valor: 1 });
    expect(lerValorEmCentavos(VALOR_MAXIMO_CENTAVOS)).toMatchObject({
      ok: true,
    });
    for (const ruim of [
      0,
      -5,
      1.5,
      '100',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      VALOR_MAXIMO_CENTAVOS + 1,
    ]) {
      expect(lerValorEmCentavos(ruim)).toEqual({
        ok: false,
        motivo: 'invalido',
      });
    }
    expect(lerValorEmCentavos(undefined)).toEqual({
      ok: false,
      motivo: 'obrigatorio',
    });
  });
});

describe('copiarCandidatura', () => {
  it('devolve cópia com a data independente', () => {
    const original = criarCandidatura(
      't1',
      'f1',
      { mensagem: 'oi', valorPropostoCentavos: 10 },
      relogio,
    );
    const copia = copiarCandidatura(original);
    copia.criadaEm.setUTCFullYear(2000);
    expect(original.criadaEm.getUTCFullYear()).toBe(2026);
  });
});
