// SDK 58 (plano `docs/produto/planos/sdk-58.md`): versões do `package.json`
// do app (CA3, CA6). Equivale, sem rede, ao `expo install --check`: cada
// pacote que o Expo 58 indica fica dentro da faixa dele e gravado exato.
const pacote = require('../../../package.json') as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const indicadas = require('expo/bundledNativeModules.json') as Record<
  string,
  string
>;

type Versao = readonly [number, number, number];

function versao(texto: string): Versao {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(texto);
  if (m === null) throw new Error(`versão não exata: ${texto}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function naoMenor(a: Versao, b: Versao): boolean {
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

/** Só as formas que o `bundledNativeModules.json` usa: exata, `~` e `^`. */
function satisfaz(exata: string, faixa: string): boolean {
  const v = versao(exata);
  const prefixo = faixa[0];
  if (prefixo !== '~' && prefixo !== '^') return exata === faixa;
  const base = versao(faixa.slice(1));
  if (!naoMenor(v, base)) return false;
  if (prefixo === '~') return v[0] === base[0] && v[1] === base[1];
  return base[0] === 0 ? v[1] === base[1] : v[0] === base[0];
}

describe('SDK 58: versões do app (CA3, CA6)', () => {
  it('o validador de faixa aceita só o que a faixa permite', () => {
    expect(satisfaz('58.0.12', '~58.0.12')).toBe(true);
    expect(satisfaz('58.0.13', '~58.0.12')).toBe(true);
    expect(satisfaz('58.0.11', '~58.0.12')).toBe(false);
    expect(satisfaz('58.1.0', '~58.0.12')).toBe(false);
    expect(satisfaz('57.0.4', '~58.0.12')).toBe(false);
    expect(satisfaz('15.1.1', '^15.0.2')).toBe(true);
    expect(satisfaz('16.0.0', '^15.0.2')).toBe(false);
    expect(satisfaz('0.88.1', '0.88.1')).toBe(true);
    expect(satisfaz('0.86.3', '0.88.1')).toBe(false);
  });

  it('as devDependencies também são exatas (sem ^ nem ~)', () => {
    const soltas = Object.entries(pacote.devDependencies).filter(
      ([, v]) => !/^\d+\.\d+\.\d+$/.test(v),
    );

    expect(soltas).toEqual([]);
  });

  it('as dependencies são exatas no formato x.y.z', () => {
    const soltas = Object.entries(pacote.dependencies).filter(
      ([, v]) => !/^\d+\.\d+\.\d+$/.test(v),
    );

    expect(soltas).toEqual([]);
  });

  it('o Expo instalado é o 58', () => {
    expect(versao(pacote.dependencies.expo ?? '')[0]).toBe(58);
  });

  it('todo pacote que o Expo 58 indica está na faixa indicada (expo install --check)', () => {
    const todas = { ...pacote.dependencies, ...pacote.devDependencies };
    const fora = Object.entries(todas)
      .filter(([nome]) => indicadas[nome] !== undefined)
      .filter(([nome, v]) => !satisfaz(v, indicadas[nome] as string))
      .map(([nome, v]) => `${nome}@${v} (indicado ${indicadas[nome]})`);

    expect(fora).toEqual([]);
  });

  it('expo-font, react e react-native nas versões do SDK 58 (CA3)', () => {
    expect(satisfaz(pacote.dependencies['expo-font'] ?? '', '~58.0.12')).toBe(
      true,
    );
    expect(pacote.dependencies.react).toBe('19.3.0');
    expect(pacote.dependencies['react-native']).toBe('0.88.1');
  });

  it('Jest 30 com os tipos do Jest 30, como o jest-expo 58 exige', () => {
    expect(versao(pacote.devDependencies.jest ?? '')[0]).toBe(30);
    expect(versao(pacote.devDependencies['@types/jest'] ?? '')[0]).toBe(30);
  });
});
