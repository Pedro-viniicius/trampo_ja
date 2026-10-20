import { describe, expect, it } from 'vitest';
import { ErroDeDominio, ErroDeRegra, ErroDeValidacao } from './erros.js';

describe('ErroDeValidacao', () => {
  it('CA5 — carrega os campos recusados com o motivo de cada um', () => {
    const erro = new ErroDeValidacao([
      { campo: 'titulo', motivo: 'obrigatorio' },
      { campo: 'valorCentavos', motivo: 'invalido' },
      { campo: 'descricao', motivo: 'tamanho' },
    ]);

    expect(erro).toBeInstanceOf(ErroDeDominio);
    expect(erro).toBeInstanceOf(Error);
    expect(erro.name).toBe('ErroDeValidacao');
    expect(erro.codigo).toBe('dados_invalidos');
    expect(erro.campos).toEqual([
      { campo: 'titulo', motivo: 'obrigatorio' },
      { campo: 'valorCentavos', motivo: 'invalido' },
      { campo: 'descricao', motivo: 'tamanho' },
    ]);
    expect(erro.message).toBe(
      'dados_invalidos: titulo(obrigatorio), valorCentavos(invalido), descricao(tamanho)',
    );
  });

  it('atalho doCampo cria o erro de um campo só', () => {
    expect(ErroDeValidacao.doCampo('cidade', 'obrigatorio').campos).toEqual([
      { campo: 'cidade', motivo: 'obrigatorio' },
    ]);
  });

  it('aceita nome de campo com subcampo ou índice', () => {
    expect(
      ErroDeValidacao.doCampo('habilidades.0', 'tamanho').campos[0]?.campo,
    ).toBe('habilidades.0');
  });

  it('CA15 — descarta qualquer propriedade além de campo e motivo, como o valor digitado', () => {
    const comValor = {
      campo: 'email',
      motivo: 'invalido' as const,
      valor: 'maria.silva@exemplo.com',
    };
    const erro = new ErroDeValidacao([comValor]);

    expect(erro.campos).toEqual([{ campo: 'email', motivo: 'invalido' }]);
    expect(JSON.stringify(erro.campos)).not.toContain('maria.silva');
    expect(erro.message).not.toContain('maria.silva');
    expect(erro.stack ?? '').not.toContain('maria.silva');
  });

  it('CA15 — recusa nome de campo que não é identificador (ex.: um e-mail ou um nome)', () => {
    for (const campo of [
      'maria.silva@exemplo.com',
      'Maria Silva',
      '(11) 98888-7777',
      '',
    ]) {
      expect(() => ErroDeValidacao.doCampo(campo, 'invalido')).toThrow(
        TypeError,
      );
    }
  });

  it('CA15 — a mensagem do erro de construção não ecoa o texto recusado', () => {
    try {
      ErroDeValidacao.doCampo('maria.silva@exemplo.com', 'invalido');
      expect.unreachable();
    } catch (erro) {
      expect(String(erro)).not.toContain('maria');
    }
  });

  it('recusa motivo fora de obrigatorio|tamanho|invalido', () => {
    expect(
      () =>
        new ErroDeValidacao([
          { campo: 'titulo', motivo: 'feio' as 'invalido' },
        ]),
    ).toThrow(TypeError);
  });

  it('recusa lista vazia de campos', () => {
    expect(() => new ErroDeValidacao([])).toThrow(TypeError);
  });

  it('a lista de campos é imutável e não depende do array recebido', () => {
    const campos = [{ campo: 'titulo', motivo: 'obrigatorio' as const }];
    const erro = new ErroDeValidacao(campos);
    campos.push({ campo: 'cidade', motivo: 'obrigatorio' });

    expect(erro.campos).toHaveLength(1);
    expect(Object.isFrozen(erro.campos)).toBe(true);
    expect(Object.isFrozen(erro.campos[0])).toBe(true);
  });
});

describe('ErroDeRegra', () => {
  it('carrega só o código, que também é a mensagem', () => {
    const erro = new ErroDeRegra('perfil_incompleto');

    expect(erro).toBeInstanceOf(ErroDeDominio);
    expect(erro.name).toBe('ErroDeRegra');
    expect(erro.codigo).toBe('perfil_incompleto');
    expect(erro.message).toBe('perfil_incompleto');
  });

  it('CA15 — recusa código que não é snake_case, para não carregar texto do usuário', () => {
    for (const codigo of [
      'email_em_uso: maria.silva@exemplo.com',
      'Maria Silva',
      'senha123!',
      'PerfilIncompleto',
      '',
      'a'.repeat(65),
    ]) {
      expect(() => new ErroDeRegra(codigo)).toThrow(TypeError);
    }
  });

  it('CA15 — a mensagem do erro de construção não ecoa o código recusado', () => {
    try {
      new ErroDeRegra('email_em_uso: maria.silva@exemplo.com');
      expect.unreachable();
    } catch (erro) {
      expect(String(erro)).not.toContain('maria');
    }
  });
});
