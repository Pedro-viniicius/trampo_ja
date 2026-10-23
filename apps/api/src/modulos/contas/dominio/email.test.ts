import { describe, expect, it } from 'vitest';
import { ErroDeValidacao } from '../../../compartilhado/dominio/erros.js';
import { EMAIL_TAMANHO_MAXIMO, Email } from './email.js';

function erroDe(entrada: unknown): ErroDeValidacao {
  try {
    Email.criar(entrada);
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      return erro;
    }
    throw erro;
  }
  throw new Error('era esperado ErroDeValidacao');
}

describe('Email', () => {
  it('aceita local@dominio.tld', () => {
    expect(Email.criar('maria@exemplo.com').valor).toBe('maria@exemplo.com');
    expect(Email.criar('a.b+c_d-e@sub.exemplo.com.br').valor).toBe(
      'a.b+c_d-e@sub.exemplo.com.br',
    );
    expect(Email.validar('maria@exemplo.com')).toBeNull();
  });

  it('apara e põe em minúsculas: maiúsculas e espaços viram o mesmo e-mail', () => {
    const digitado = Email.criar('  Maria@Exemplo.COM \n');
    expect(digitado.valor).toBe('maria@exemplo.com');
    expect(digitado.igual(Email.criar('maria@exemplo.com'))).toBe(true);
    expect(digitado.igual(Email.criar('joao@exemplo.com'))).toBe(false);
  });

  it.each([
    'maria',
    'maria@',
    '@exemplo.com',
    'maria@exemplo',
    'maria@exemplo.',
    'maria@.com',
    'maria@exemplo..com',
    'maria@@exemplo.com',
    'ma ria@exemplo.com',
    'maria@exem plo.com',
    'maria@exemplo.com\u0000',
    'maria silva@exemplo.com',
  ])('recusa formato inválido: %j', (entrada) => {
    expect(erroDe(entrada).campos).toEqual([
      { campo: 'email', motivo: 'invalido' },
    ]);
  });

  it.each([undefined, null, '', '   '])(
    'ausente vira obrigatorio: %j',
    (entrada) => {
      expect(erroDe(entrada).campos).toEqual([
        { campo: 'email', motivo: 'obrigatorio' },
      ]);
    },
  );

  it.each([42, {}, ['maria@exemplo.com'], true])(
    'tipo que não é texto vira invalido: %j',
    (entrada) => {
      expect(Email.validar(entrada)).toBe('invalido');
    },
  );

  it('aceita até 254 caracteres e recusa 255 com motivo tamanho', () => {
    const dominio = '@exemplo.com';
    const noLimite = `${'a'.repeat(EMAIL_TAMANHO_MAXIMO - dominio.length)}${dominio}`;
    expect(noLimite).toHaveLength(254);
    expect(Email.criar(noLimite).valor).toBe(noLimite);

    expect(erroDe(`a${noLimite}`).campos).toEqual([
      { campo: 'email', motivo: 'tamanho' },
    ]);
  });

  it('conta o tamanho depois de aparar', () => {
    const noLimite = `${'a'.repeat(242)}@exemplo.com`;
    expect(Email.validar(`   ${noLimite}   `)).toBeNull();
  });

  it('entrada longa e maliciosa é recusada rápido (sem ReDoS)', () => {
    const inicio = performance.now();
    for (let i = 0; i < 1000; i += 1) {
      Email.validar(`a@${'a.'.repeat(126)}`);
      Email.validar(`${'a'.repeat(250)}@a`);
    }
    expect(performance.now() - inicio).toBeLessThan(500);
  });

  it('S6 — reconstituir aceita o valor gravado como está, sem validar nem normalizar', () => {
    // Dado lido do banco: validar de novo travaria uma conta antiga.
    for (const recusado of ['maria silva@exemplo', 'a@b']) {
      expect(Email.validar(recusado)).not.toBeNull();
      expect(Email.reconstituir(recusado).valor).toBe(recusado);
    }
    // Nem normaliza: o valor gravado é o que volta.
    expect(Email.reconstituir('Maria@Exemplo.com').valor).toBe(
      'Maria@Exemplo.com',
    );
    expect(
      Email.reconstituir('maria@exemplo.com').igual(
        Email.criar('Maria@Exemplo.com '),
      ),
    ).toBe(true);
  });

  it('CA15 — o erro não carrega o e-mail digitado', () => {
    const erro = erroDe('Maria.Silva@exemplo');
    expect(erro.message).not.toMatch(/maria/i);
    expect(JSON.stringify(erro)).not.toMatch(/maria/i);
    expect(erro.stack ?? '').not.toMatch(/maria/i);
  });
});
