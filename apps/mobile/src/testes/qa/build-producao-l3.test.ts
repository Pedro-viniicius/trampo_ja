// QA da L3 (CA53, app S8): o comando real `pnpm --filter mobile build:producao`.
//
// O teste `app-config.test.ts` prova a regra de https na função. Aqui roda o
// script de verdade, com o Expo CLI, e olha o bundle gerado: a URL que sai
// embutida no código tem de ser a do ambiente do comando, e não uma sobra do
// cache do Metro de um build anterior (que poderia levar `http://` ou o host
// de outro ambiente para o app de produção, passando pela conferência).
//
// Cada exportação leva ~10 s a ~40 s. A saída vai para uma pasta temporária
// (os argumentos extras vão ao fim do script) e o Hermes fica desligado para o
// texto da URL aparecer no bundle.
//
// Pesado demais para `pnpm --filter mobile test` (~4 min com os 3 testes): na
// suíte normal só roda o teste de recusa (URL http, ~1 s, sem bundle). Os dois
// testes que geram bundle só rodam com a variável `TRAMPOJA_QA_BUILD=1`:
//
//   TRAMPOJA_QA_BUILD=1 pnpm --filter mobile exec jest --maxWorkers=2 \
//     src/testes/qa/build-producao-l3.test.ts
//
// Rode esse comando antes de um release e sempre que mexer em `app.config.ts`,
// no script `build:producao` ou na configuração do Metro.

declare const __dirname: string;
const { execFileSync, spawnSync } = require('node:child_process') as {
  execFileSync(
    comando: string,
    argumentos: string[],
    opcoes: {
      cwd: string;
      env: Record<string, string | undefined>;
      timeout: number;
    },
  ): unknown;
  spawnSync(
    comando: string,
    argumentos: string[],
    opcoes: {
      cwd: string;
      env: Record<string, string | undefined>;
      timeout: number;
    },
  ): {
    status: number | null;
    stdout: { toString(): string };
    stderr: { toString(): string };
  };
};
const { mkdtempSync, readdirSync, readFileSync, rmSync } =
  require('node:fs') as {
    mkdtempSync(prefixo: string): string;
    readdirSync(caminho: string): string[];
    readFileSync(caminho: string, codificacao: 'utf8'): string;
    rmSync(caminho: string, opcoes: { recursive: true; force: true }): void;
  };
const { tmpdir } = require('node:os') as { tmpdir(): string };
const { join } = require('node:path') as { join(...partes: string[]): string };

const RAIZ_DO_REPOSITORIO = join(__dirname, '../../../../..');
const ESPERA_MAXIMA_MS = 150_000;

const ambiente = (url: string): Record<string, string | undefined> => ({
  ...process.env,
  EXPO_PUBLIC_API_URL: url,
  CI: '1',
  EXPO_NO_TELEMETRY: '1',
});

function rodarBuildDeProducao(url: string, saida: string) {
  return spawnSync(
    'pnpm',
    [
      '--filter',
      'mobile',
      'build:producao',
      '--no-bytecode',
      '--output-dir',
      saida,
    ],
    { cwd: RAIZ_DO_REPOSITORIO, env: ambiente(url), timeout: ESPERA_MAXIMA_MS },
  );
}

/** Falha com o fim da saída do comando (o `expect` do jest não aceita mensagem). */
function exigirSucesso(resultado: {
  status: number | null;
  stderr: { toString(): string };
}): void {
  if (resultado.status !== 0) {
    throw new Error(
      `o comando saiu com ${String(resultado.status)}: ${resultado.stderr.toString().slice(-600)}`,
    );
  }
}

/** Código JS do bundle Android exportado em `saida`. */
function bundleDe(saida: string): string {
  const pasta = join(saida, '_expo/static/js/android');
  return readdirSync(pasta)
    .filter((nome) => nome.endsWith('.js'))
    .map((nome) => readFileSync(join(pasta, nome), 'utf8'))
    .join('\n');
}

// Sem a variável, os testes que geram bundle aparecem como "skipped" na saída.
const itComBuild = process.env.TRAMPOJA_QA_BUILD === '1' ? it : it.skip;

describe('pnpm --filter mobile build:producao (CA53)', () => {
  let temporaria = '';

  beforeEach(() => {
    temporaria = mkdtempSync(join(tmpdir(), 'build-producao-qa-'));
  });

  afterEach(() => {
    rmSync(temporaria, { recursive: true, force: true });
  });

  it(
    'com URL http, falha sem repetir o host na saída e não gera bundle',
    () => {
      const resultado = rodarBuildDeProducao(
        'http://host-sentinela-qa.exemplo.com:3000',
        join(temporaria, 'saida'),
      );

      const saida = `${resultado.stdout.toString()}${resultado.stderr.toString()}`;
      expect(resultado.status).not.toBe(0);
      expect(saida).toContain('precisa usar https://');
      expect(saida).not.toContain('host-sentinela-qa');
      expect(() => readdirSync(join(temporaria, 'saida'))).toThrow();
    },
    ESPERA_MAXIMA_MS,
  );

  itComBuild(
    'duas exportações seguidas com URLs https diferentes: cada bundle leva a URL do seu comando, nunca a do build anterior',
    () => {
      const primeira = 'https://api-primeira-qa.exemplo.com';
      const segunda = 'https://api-segunda-qa.exemplo.com';

      const a = rodarBuildDeProducao(primeira, join(temporaria, 'a'));
      const b = rodarBuildDeProducao(segunda, join(temporaria, 'b'));

      exigirSucesso(a);
      exigirSucesso(b);
      // `includes` (e não `toContain`) para a falha não imprimir o bundle inteiro.
      expect(bundleDe(join(temporaria, 'a')).includes(primeira)).toBe(true);
      const bundleB = bundleDe(join(temporaria, 'b'));
      expect(bundleB.includes(segunda)).toBe(true);
      expect(bundleB.includes(primeira)).toBe(false);
    },
    ESPERA_MAXIMA_MS * 2,
  );

  itComBuild(
    'depois de um build comum com URL http (verificação local), o de produção com https não herda a http',
    () => {
      // O `build` comum não confere o https e roda com o `.env` de desenvolvimento.
      const local = join(temporaria, 'local');
      execFileSync(
        'pnpm',
        [
          'exec',
          'expo',
          'export',
          '--platform',
          'android',
          '--no-bytecode',
          '--clear',
          '--output-dir',
          local,
        ],
        {
          cwd: join(RAIZ_DO_REPOSITORIO, 'apps/mobile'),
          env: ambiente('http://10.255.255.1:3000'),
          timeout: ESPERA_MAXIMA_MS,
        },
      );
      expect(bundleDe(local).includes('http://10.255.255.1:3000')).toBe(true);

      const producao = rodarBuildDeProducao(
        'https://api-producao-qa.exemplo.com',
        join(temporaria, 'producao'),
      );

      exigirSucesso(producao);
      const bundle = bundleDe(join(temporaria, 'producao'));
      expect(bundle.includes('https://api-producao-qa.exemplo.com')).toBe(true);
      expect(bundle.includes('10.255.255.1')).toBe(false);
    },
    ESPERA_MAXIMA_MS * 2,
  );
});
