import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ErroDeValidacao } from '../../../compartilhado/dominio/erros.js';
import { formasDaSenha, Senha, tamanhoDaSenha } from './senha.js';

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

// "é" pré-composto (NFC) e "e" + acento agudo combinante (NFD).
const E_NFC = 'é';
const E_NFD = 'é';
const CAFE_NFC = `${E_NFC}caf${E_NFC}-secreto`;
const CAFE_NFD = `${E_NFD}caf${E_NFD}-secreto`;

describe('Senha em NFC (CA43)', () => {
  it('as duas grafias do "é" são textos diferentes antes de normalizar', () => {
    expect(CAFE_NFD).not.toBe(CAFE_NFC);
    expect(CAFE_NFD.normalize('NFC')).toBe(CAFE_NFC);
  });

  it('guarda a forma NFC, venha a senha em NFD ou em NFC', () => {
    expect(Senha.criar(CAFE_NFD).revelar()).toBe(CAFE_NFC);
    expect(Senha.criar(CAFE_NFC).revelar()).toBe(CAFE_NFC);
  });

  it('texto já em NFC (ex.: ASCII) sai igual', () => {
    expect(Senha.criar('segredo123').revelar()).toBe('segredo123');
  });

  it('o teto de 128 é conferido na forma crua, antes de normalizar', () => {
    // 129 pontos de código crus, que em NFC seriam 65: recusa.
    const nfdAcimaDoTeto = `${E_NFD.repeat(64)}a`;
    expect(tamanhoDaSenha(nfdAcimaDoTeto)).toBe(129);
    expect(tamanhoDaSenha(nfdAcimaDoTeto.normalize('NFC'))).toBe(65);
    expect(camposDe(nfdAcimaDoTeto)).toEqual([
      { campo: 'senha', motivo: 'tamanho' },
    ]);

    // 128 crus: aceita, e guarda os 64 da forma NFC.
    const nfdNoTeto = E_NFD.repeat(64);
    expect(Senha.validar(nfdNoTeto)).toBeNull();
    expect(Senha.criar(nfdNoTeto).revelar()).toBe(E_NFC.repeat(64));
  });

  it('o mínimo de 8 é conferido na forma NFC (S3): "éééé" em NFD é recusada', () => {
    // 8 pontos de código crus, mas só 4 em NFC, que é a forma que vira hash.
    const nfdAbaixoDoMinimo = E_NFD.repeat(4);
    expect(tamanhoDaSenha(nfdAbaixoDoMinimo)).toBe(8);
    expect(tamanhoDaSenha(nfdAbaixoDoMinimo.normalize('NFC'))).toBe(4);
    expect(Senha.validar(nfdAbaixoDoMinimo)).toBe('tamanho');
    expect(camposDe(nfdAbaixoDoMinimo)).toEqual([
      { campo: 'senha', motivo: 'tamanho' },
    ]);

    // 7 em NFC continua abaixo do mínimo, mesmo com 14 crus.
    expect(Senha.validar(E_NFD.repeat(7))).toBe('tamanho');
  });

  it('8 pontos de código em NFC bastam, venham em NFD ou em NFC', () => {
    expect(Senha.validar(E_NFD.repeat(8))).toBeNull();
    expect(Senha.criar(E_NFD.repeat(8)).revelar()).toBe(E_NFC.repeat(8));
    expect(Senha.validar(E_NFC.repeat(8))).toBeNull();
    // Mistura: 4 "é" em NFD (8 crus) + 4 ASCII = 8 em NFC.
    expect(Senha.validar(`${E_NFD.repeat(4)}abcd`)).toBeNull();
  });

  it('caractere que cresce em NFC conta pela forma crua', () => {
    // U+0958 vira U+0915 U+093C em NFC: 128 crus, 256 normalizados.
    const cresce = 'क़'.repeat(128);
    expect(Senha.validar(cresce)).toBeNull();
    expect(tamanhoDaSenha(Senha.criar(cresce).revelar())).toBe(256);
  });

  it('CA15 — a forma NFC também não aparece em toString, JSON nem inspect', () => {
    const senha = Senha.criar(CAFE_NFD);

    for (const texto of [
      String(senha),
      JSON.stringify({ senha }),
      inspect(senha),
    ]) {
      expect(texto).not.toContain('caf');
    }
  });
});

describe('formasDaSenha (CA43)', () => {
  it('texto já em NFC tem uma forma só: ele mesmo', () => {
    expect(formasDaSenha('segredo123')).toEqual(['segredo123']);
    expect(formasDaSenha(CAFE_NFC)).toEqual([CAFE_NFC]);
  });

  it('texto fora de NFC tem duas formas: a NFC primeiro, depois a crua', () => {
    expect(formasDaSenha(CAFE_NFD)).toEqual([CAFE_NFC, CAFE_NFD]);
  });

  it('mistura de grafias também normaliza tudo na primeira forma', () => {
    const misto = `${E_NFC}caf${E_NFD}-secreto`;

    expect(formasDaSenha(misto)).toEqual([CAFE_NFC, misto]);
  });

  it('a primeira forma é a mesma que Senha.criar guarda', () => {
    for (const texto of [CAFE_NFD, CAFE_NFC, 'segredo123']) {
      expect(formasDaSenha(texto)[0]).toBe(Senha.criar(texto).revelar());
    }
  });

  it('não lança com surrogate solto, que não muda em NFC', () => {
    const solto = '\ud800segredo';

    expect(formasDaSenha(solto)).toEqual([solto]);
  });

  it('é NFC, não NFKC: ligadura e letra de largura cheia ficam como vieram', () => {
    // "ﬁ" (U+FB01) e "Ａ" (U+FF21) só mudariam na normalização de compatibilidade.
    const compatibilidade = 'ﬁsegredoＡ';

    expect(formasDaSenha(compatibilidade)).toEqual([compatibilidade]);
    expect(Senha.criar(compatibilidade).revelar()).toBe(compatibilidade);
  });

  it('a lista devolvida não pode ser alterada', () => {
    const formas = formasDaSenha(CAFE_NFD);

    expect(Object.isFrozen(formas)).toBe(true);
  });
});
