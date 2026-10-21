// Fundação do app (plano, etapas 1 e 3): configuração do Expo e assets da marca.
const { readFileSync } = require('node:fs') as {
  readFileSync: (arquivo: string) => {
    readUInt32BE: (posicao: number) => number;
    subarray: (
      inicio: number,
      fim: number,
    ) => { toString: (cod: 'hex') => string };
  };
};

interface AppJson {
  expo: {
    name: string;
    slug: string;
    scheme: string;
    orientation: string;
    userInterfaceStyle: string;
    icon: string;
    android?: Record<string, unknown> & {
      adaptiveIcon?: { foregroundImage: string; backgroundColor: string };
    };
    plugins: Array<string | [string, Record<string, unknown>]>;
    experiments?: { typedRoutes?: boolean };
  };
}

const app = require('../../../app.json') as AppJson;

const nomesDosPlugins = app.expo.plugins.map((p) =>
  typeof p === 'string' ? p : p[0],
);

/** Largura e altura do PNG lidas do cabeçalho IHDR. */
function dimensoesDoPng(caminhoRelativoAoApp: string): {
  assinatura: string;
  largura: number;
  altura: number;
} {
  const raizDoApp = (expect.getState().testPath ?? '').replace(
    /\/src\/testes\/qa\/[^/]+$/,
    '',
  );
  const arquivo = readFileSync(`${raizDoApp}/${caminhoRelativoAoApp}`);
  return {
    assinatura: arquivo.subarray(0, 8).toString('hex'),
    largura: arquivo.readUInt32BE(16),
    altura: arquivo.readUInt32BE(20),
  };
}

describe('app.json', () => {
  it('tem nome, slug, scheme de deep link e tema claro do plano', () => {
    expect(app.expo).toMatchObject({
      name: 'Trampo Já',
      slug: 'trampo-ja',
      scheme: 'trampoja',
      userInterfaceStyle: 'light',
      orientation: 'default',
    });
    expect(app.expo.experiments?.typedRoutes).toBe(true);
  });

  it('liga os plugins do expo-router, do secure-store e da splash', () => {
    expect(nomesDosPlugins).toEqual(
      expect.arrayContaining([
        'expo-router',
        'expo-secure-store',
        'expo-splash-screen',
      ]),
    );
  });

  it('não libera tráfego em texto claro no Android nem traz segredo embutido', () => {
    const texto = JSON.stringify(app);
    expect(texto).not.toMatch(/usesCleartextTraffic|NSAllowsArbitraryLoads/);
    expect(texto).not.toMatch(/token|senha|secret|api[_-]?key/i);
  });

  it('o ícone adaptativo tem fundo branco', () => {
    expect(app.expo.android?.adaptiveIcon?.backgroundColor).toBe('#FFFFFF');
  });
});

describe('assets da marca (etapa 3)', () => {
  const PNG = '89504e470d0a1a0a';

  it.each([
    ['assets/icon.png', 1024],
    ['assets/adaptive-icon.png', 1024],
    ['assets/splash-icon.png', 1024],
    ['assets/logo.png', 512],
  ])('%s é um PNG quadrado de %i px', (arquivo, lado) => {
    expect(dimensoesDoPng(arquivo)).toEqual({
      assinatura: PNG,
      largura: lado,
      altura: lado,
    });
  });

  it('o app.json aponta para arquivos que existem', () => {
    const referencias = [
      app.expo.icon,
      app.expo.android?.adaptiveIcon?.foregroundImage,
    ].filter((r): r is string => typeof r === 'string');

    for (const ref of referencias) {
      expect(() => dimensoesDoPng(ref.replace(/^\.\//, ''))).not.toThrow();
    }
  });
});
