import { validarSenha } from '../../estado/validacao';

// Paridade com a API (`Senha.validar`): teto na forma crua, mínimo em NFC.
const E_NFD = 'é';
const A_NFD = 'à';

describe('validarSenha: NFC e forma crua, como a API (S3 da L3)', () => {
  it.each([
    ['7 caracteres ASCII', 'abcdefg', 'senha_curta'],
    ['8 caracteres ASCII', 'abcdefgh', null],
    ['8 acentuadas já compostas (NFC)', 'éééééééé', null],
    ['7 compostas', 'ééééééé', 'senha_curta'],
    ['7 compostas mais uma NFD (8 em NFC)', `ééééééé${E_NFD}`, null],
    ['6 compostas mais uma NFD (7 em NFC)', `éééééé${E_NFD}`, 'senha_curta'],
    [
      'mistura NFD de 2 letras: 7 em NFC',
      `${E_NFD}${A_NFD}abcde`,
      'senha_curta',
    ],
    ['mistura NFD de 2 letras: 8 em NFC', `${E_NFD}${A_NFD}abcdef`, null],
    [
      'marca combinante solta não compõe: 8 pontos',
      `abcdefx${String.fromCodePoint(0x301)}`,
      null,
    ],
    ['8 emojis (1 ponto de código cada)', '😀'.repeat(8), null],
    ['7 emojis', '😀'.repeat(7), 'senha_curta'],
  ])('mínimo: %s', (_nome, senha, esperado) => {
    expect(validarSenha(senha)).toBe(esperado);
  });

  it.each([
    ['128 ASCII', 'a'.repeat(128), null],
    ['129 ASCII', 'a'.repeat(129), 'senha_curta'],
    ['128 emojis (256 unidades)', '😀'.repeat(128), null],
    ['129 emojis (258 unidades)', '😀'.repeat(129), 'senha_curta'],
    ['64 NFD = 128 pontos crus', E_NFD.repeat(64), null],
    [
      '64 NFD mais 1 = 129 pontos crus (65 em NFC)',
      `${E_NFD.repeat(64)}a`,
      'senha_curta',
    ],
    ['texto enorme', 'a'.repeat(100_000), 'senha_curta'],
  ])('teto: %s', (_nome, senha, esperado) => {
    expect(validarSenha(senha)).toBe(esperado);
  });

  it('não apara nem normaliza espaços: 8 espaços é senha válida', () => {
    expect(validarSenha(' '.repeat(8))).toBeNull();
  });
});
