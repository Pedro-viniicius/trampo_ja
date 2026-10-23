import type { ConfigContext } from 'expo/config';
import configDoApp, {
  type AmbienteDoBuild,
  BUILD_DE_PRODUCAO,
  conferirUrlDeProducao,
} from '../../app.config';
import { urlDaApi } from '../api/config';

// O app não tem @types/node: tipa só o que este teste usa (roda em Node no jest).
declare const __dirname: string;
const { join } = require('node:path') as {
  join(...partes: string[]): string;
};

const RAIZ_DO_APP = join(__dirname, '../..');
const appJson = require('../../app.json') as {
  expo: ConfigContext['config'];
};
const pacote = require('../../package.json') as {
  scripts: Record<string, string>;
};

const contexto = (): ConfigContext => ({
  projectRoot: RAIZ_DO_APP,
  staticConfigPath: join(RAIZ_DO_APP, 'app.json'),
  packageJsonPath: join(RAIZ_DO_APP, 'package.json'),
  config: { ...appJson.expo },
});

const producao = (url?: string): AmbienteDoBuild => ({
  TRAMPOJA_BUILD: BUILD_DE_PRODUCAO,
  EXPO_PUBLIC_API_URL: url,
});

/** Mensagem do erro lançado por `executar`, ou `undefined` se não lançou. */
function erroDe(executar: () => unknown): string | undefined {
  try {
    executar();
    return undefined;
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}

// Valores fictícios. Cada um traz um host reconhecível, para provar que a
// mensagem de erro não o repete.
const RECUSADAS = [
  'http://10.0.0.2:3000',
  'http://192.168.0.10:3000/api',
  'HTTP://servidor-http.exemplo.com',
  'ftp://servidor-ftp.exemplo.com',
  'https://api.exemplo.com?segredo=1',
  'https://api.exemplo.com#frag',
  'https://api exemplo.com',
  'api.exemplo.com',
];

const ACEITAS = [
  'https://api.exemplo.com',
  'https://api.exemplo.com/',
  'https://api.exemplo.com:8443/v1',
  'HTTPS://API.EXEMPLO.COM',
  '  https://api.exemplo.com  ',
];

describe('app.config.ts (CA53)', () => {
  it('sem TRAMPOJA_BUILD, devolve o app.json como veio e não confere a URL', () => {
    for (const env of [
      {},
      { EXPO_PUBLIC_API_URL: 'http://10.0.0.2:3000' },
      { EXPO_PUBLIC_API_URL: '' },
      { TRAMPOJA_BUILD: '', EXPO_PUBLIC_API_URL: 'http://10.0.0.2:3000' },
      { TRAMPOJA_BUILD: 'dev', EXPO_PUBLIC_API_URL: 'http://10.0.0.2:3000' },
    ] satisfies AmbienteDoBuild[]) {
      const ctx = contexto();
      expect(configDoApp(ctx, env)).toBe(ctx.config);
    }
    expect(configDoApp(contexto(), {})).toEqual(appJson.expo);
  });

  it('no build de produção, URL em http lança e em https devolve o app.json', () => {
    expect(() =>
      configDoApp(contexto(), producao('http://10.0.0.2:3000')),
    ).toThrow('EXPO_PUBLIC_API_URL precisa usar https://');

    const ctx = contexto();
    expect(configDoApp(ctx, producao('https://api.exemplo.com'))).toBe(
      ctx.config,
    );
  });

  it('no build de produção, URL ausente ou vazia lança', () => {
    for (const url of [undefined, '', '   ']) {
      expect(() => configDoApp(contexto(), producao(url))).toThrow(
        'defina EXPO_PUBLIC_API_URL',
      );
    }
  });

  it.each(RECUSADAS)('%j é recusada sem o valor na mensagem', (url) => {
    const mensagem = erroDe(() => configDoApp(contexto(), producao(url)));

    expect(mensagem).toMatch(/^build:producao: .*EXPO_PUBLIC_API_URL/);
    const host = url.replace(/^\w+:\/\//, '').replace(/[:/?#].*$/, '');
    expect(mensagem).not.toContain(url.trim());
    if (host !== '') {
      expect(mensagem?.toLowerCase()).not.toContain(host.toLowerCase());
    }
  });

  it.each(ACEITAS)('%j é aceita', (url) => {
    expect(erroDe(() => conferirUrlDeProducao(url))).toBeUndefined();
  });

  it('a regra repetida concorda com urlDaApi(env, false) de src/api/config.ts', () => {
    for (const url of [...RECUSADAS, ...ACEITAS, '', '   ']) {
      const doBuild = erroDe(() => conferirUrlDeProducao(url));
      const doApp = erroDe(() => urlDaApi({ EXPO_PUBLIC_API_URL: url }, false));
      expect({ url, recusadaNoBuild: doBuild !== undefined }).toEqual({
        url,
        recusadaNoBuild: doApp !== undefined,
      });
    }
  });

  describe('com o ambiente do processo', () => {
    const antes = {
      TRAMPOJA_BUILD: process.env.TRAMPOJA_BUILD,
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    };
    afterEach(() => {
      for (const [chave, valor] of Object.entries(antes)) {
        if (valor === undefined) {
          delete process.env[chave];
        } else {
          process.env[chave] = valor;
        }
      }
    });

    it('sem env explícito, lê process.env', () => {
      process.env.TRAMPOJA_BUILD = BUILD_DE_PRODUCAO;
      process.env.EXPO_PUBLIC_API_URL = 'http://10.0.0.2:3000';
      expect(() => configDoApp(contexto())).toThrow('https://');

      process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.com';
      expect(configDoApp(contexto())).toEqual(appJson.expo);
    });

    // O mesmo caminho do `expo export`: o getConfig do Expo acha o
    // app.config.ts, transpila e o chama com o app.json em `config`.
    it('o getConfig do Expo usa este arquivo sobre o app.json', () => {
      const { getConfig } = require('expo/config') as {
        getConfig(
          raiz: string,
          opcoes: { skipSDKVersionRequirement: boolean },
        ): { exp: Record<string, unknown>; dynamicConfigPath: string | null };
      };
      const ler = () =>
        getConfig(RAIZ_DO_APP, { skipSDKVersionRequirement: true });

      delete process.env.TRAMPOJA_BUILD;
      process.env.EXPO_PUBLIC_API_URL = 'http://10.0.0.2:3000';
      const lido = ler();
      expect(lido.dynamicConfigPath).toBe(join(RAIZ_DO_APP, 'app.config.ts'));
      expect(lido.exp).toMatchObject(appJson.expo as Record<string, unknown>);

      process.env.TRAMPOJA_BUILD = BUILD_DE_PRODUCAO;
      const mensagem = erroDe(ler);
      expect(mensagem).toContain('EXPO_PUBLIC_API_URL precisa usar https://');
      expect(mensagem).not.toContain('10.0.0.2');

      process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.com';
      expect(ler().exp).toMatchObject(appJson.expo as Record<string, unknown>);
    });
  });

  it('build:producao é o build comum com TRAMPOJA_BUILD=producao', () => {
    expect(pacote.scripts.build).toMatch(/^expo export /);
    // Sem limpar o cache, o Metro reaproveita a URL embutida no build anterior.
    expect(pacote.scripts.build).toMatch(/\s--clear(\s|$)/);
    expect(pacote.scripts['build:producao']).toBe(
      `TRAMPOJA_BUILD=${BUILD_DE_PRODUCAO} ${pacote.scripts.build}`,
    );
  });
});
