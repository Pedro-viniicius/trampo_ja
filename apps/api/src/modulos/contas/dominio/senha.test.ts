import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ErroDeValidacao } from '../../../compartilhado/dominio/erros.js';
import { Senha } from './senha.js';

function camposDe(entrada: unknown): unknown {
  try {
    Senha.criar(entrada);
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      return erro.campos;
    }
    throw erro;
  }
  throw new Error('era esperado ErroDeValidacao');
}

describe('Senha', () => {
  it('aceita de 8 a 128 caracteres', () => {
    expect(Senha.criar('a'.repeat(8)).revelar()).toBe('aaaaaaaa');
    expect(Senha.criar('a'.repeat(128)).revelar()).toHaveLength(128);
    expect(Senha.validar('segredo123')).toBeNull();
  });

  it('recusa 7 e 129 caracteres com motivo tamanho', () => {
    expect(camposDe('1234567')).toEqual([
      { campo: 'senha', motivo: 'tamanho' },
    ]);
    expect(camposDe('a'.repeat(129))).toEqual([
      { campo: 'senha', motivo: 'tamanho' },
    ]);
  });

  it('conta pontos de código, não unidades UTF-16: emoji vale 1 caractere', () => {
    expect(camposDe('😀😀😀😀')).toEqual([
      { campo: 'senha', motivo: 'tamanho' },
    ]);
    expect(Senha.validar('😀'.repeat(8))).toBeNull();
    expect(Senha.validar('😀'.repeat(128))).toBeNull();
    expect(camposDe('😀'.repeat(129))).toEqual([
      { campo: 'senha', motivo: 'tamanho' },
    ]);
    expect(camposDe('a'.repeat(100_000))).toEqual([
      { campo: 'senha', motivo: 'tamanho' },
    ]);
  });

  it.each([undefined, null, ''])('ausente vira obrigatorio: %j', (entrada) => {
    expect(camposDe(entrada)).toEqual([
      { campo: 'senha', motivo: 'obrigatorio' },
    ]);
  });

  it.each([12345678, {}, ['segredo123']])(
    'tipo que não é texto vira invalido: %j',
    (entrada) => {
      expect(Senha.validar(entrada)).toBe('invalido');
    },
  );

  it('não apara: espaços fazem parte da senha', () => {
    expect(Senha.criar('  segredo  ').revelar()).toBe('  segredo  ');
    expect(Senha.validar('       a')).toBeNull();
  });

  it('CA15 — não expõe o valor em toString, JSON, inspect nem no erro', () => {
    const senha = Senha.criar('segredo-super-123');

    expect(String(senha)).not.toContain('segredo');
    expect(`${senha}`).not.toContain('segredo');
    expect(JSON.stringify({ senha })).not.toContain('segredo');
    expect(inspect(senha)).not.toContain('segredo');
    expect(inspect({ dados: { senha } }, { depth: 5 })).not.toContain(
      'segredo',
    );

    let mensagem = '';
    try {
      Senha.criar('curta');
    } catch (erro) {
      mensagem = `${(erro as Error).message} ${JSON.stringify(erro)}`;
    }
    expect(mensagem).toContain('senha(tamanho)');
    expect(mensagem).not.toContain('curta');
  });
});
