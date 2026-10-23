// Barreira contra telemetria na árvore transitiva de produção do app (CA52).
// A barreira de `sem-dado-pessoal.test.tsx` (CA15) olha só as dependências
// diretas; esta percorre `dependencies` e `optionalDependencies` de cada pacote,
// resolvendo-os como o Node faz, pelo `node_modules` real (o pnpm isola cada
// pacote em `node_modules/.pnpm/<pacote>@<versão>/node_modules`).

// O app não tem @types/node: tipa só o que este teste usa (roda em Node no jest).
declare const __dirname: string;
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs') as {
  existsSync(caminho: string): boolean;
  mkdirSync(caminho: string, opcoes: { recursive: true }): void;
  mkdtempSync(prefixo: string): string;
  readFileSync(caminho: string, codificacao: 'utf8'): string;
  realpathSync(caminho: string): string;
  rmSync(caminho: string, opcoes: { recursive: true; force: true }): void;
  symlinkSync(alvo: string, caminho: string, tipo: 'dir'): void;
  writeFileSync(caminho: string, conteudo: string): void;
};
const { tmpdir } = require('node:os') as { tmpdir(): string };
const { dirname, join } = require('node:path') as {
  dirname(caminho: string): string;
  join(...partes: string[]): string;
};

/**
 * Trechos de nome proibidos. Os 8 primeiros repetem a lista da barreira das
 * dependências diretas (`sem-dado-pessoal.test.tsx`, "dependências do app").
 */
const PROIBIDAS = [
  'async-storage',
  'sentry',
  'bugsnag',
  'firebase',
  'analytics',
  'segment',
  'amplitude',
  'mixpanel',
  'crashlytics',
  'datadog',
  'newrelic',
  'appcenter',
  'posthog',
  'rudder',
  'telemetry',
];

/**
 * Exceções: só ferramenta de build (roda na máquina de quem gera o bundle e
 * não entra no app), cada uma com o motivo. Hoje nenhuma é necessária.
 */
const EXCECOES: Readonly<Record<string, string>> = {};

interface PacoteJson {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

interface Pacote {
  /** Nome do `package.json` do pacote. */
  readonly nome: string;
  /** Nome pelo qual quem depende o pede (difere do `nome` num alias). */
  readonly pedidoComo: string;
  /** Cadeia de nomes desde o app, para achar quem trouxe o pacote. */
  readonly caminho: readonly string[];
}

const RAIZ_DO_APP = join(__dirname, '../..');

function lerPacote(pasta: string): PacoteJson {
  return JSON.parse(
    readFileSync(join(pasta, 'package.json'), 'utf8'),
  ) as PacoteJson;
}

/** Resolve `nome` a partir de `pasta` subindo os diretórios, como o Node. */
function resolverPasta(pasta: string, nome: string): string | undefined {
  let atual = pasta;
  for (;;) {
    const candidato = join(atual, 'node_modules', nome, 'package.json');
    if (existsSync(candidato)) {
      return dirname(realpathSync(candidato));
    }
    const acima = dirname(atual);
    if (acima === atual) {
      return undefined;
    }
    atual = acima;
  }
}

/**
 * Percorre a árvore de produção a partir de `raiz`. Devolve cada pasta real de
 * pacote uma vez e as dependências obrigatórias que não resolveram (opcionais
 * de outra plataforma podem faltar).
 */
function percorrerArvore(raiz: string): {
  pacotes: Map<string, Pacote>;
  naoResolvidas: string[];
} {
  const pacotes = new Map<string, Pacote>();
  const naoResolvidas: string[] = [];
  const pendentes = [{ pasta: realpathSync(raiz), caminho: [] as string[] }];

  for (let item = pendentes.pop(); item; item = pendentes.pop()) {
    const json = lerPacote(item.pasta);
    const opcionais = json.optionalDependencies ?? {};
    const nomes = new Set([
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(opcionais),
    ]);
    for (const pedidoComo of nomes) {
      const pasta = resolverPasta(item.pasta, pedidoComo);
      if (pasta === undefined) {
        if (!Object.hasOwn(opcionais, pedidoComo)) {
          naoResolvidas.push([...item.caminho, pedidoComo].join(' > '));
        }
        continue;
      }
      if (pacotes.has(pasta)) {
        continue;
      }
      const caminho = [...item.caminho, pedidoComo];
      pacotes.set(pasta, {
        nome: lerPacote(pasta).name ?? pedidoComo,
        pedidoComo,
        caminho,
      });
      pendentes.push({ pasta, caminho });
    }
  }
  return { pacotes, naoResolvidas };
}

/** Nomes (e aliases) que contêm um trecho proibido e não são exceção. */
function pacotesProibidos(
  pacotes: Iterable<Pick<Pacote, 'nome' | 'pedidoComo' | 'caminho'>>,
  excecoes: Readonly<Record<string, string>> = EXCECOES,
): string[] {
  const achados = new Set<string>();
  for (const pacote of pacotes) {
    for (const nome of new Set([pacote.nome, pacote.pedidoComo])) {
      const minusculo = nome.toLowerCase();
      if (
        !Object.hasOwn(excecoes, nome) &&
        PROIBIDAS.some((proibida) => minusculo.includes(proibida))
      ) {
        achados.add(`${nome} (via ${pacote.caminho.join(' > ')})`);
      }
    }
  }
  return [...achados].sort();
}

describe('árvore de produção do app (CA52)', () => {
  const { pacotes, naoResolvidas } = percorrerArvore(RAIZ_DO_APP);
  const nomes = new Set([...pacotes.values()].map((p) => p.nome));

  it('nenhum pacote da árvore transitiva tem nome de telemetria', () => {
    expect(pacotesProibidos(pacotes.values())).toEqual([]);
  });

  it('percorre a árvore inteira, não só as dependências diretas', () => {
    const diretas = Object.keys(lerPacote(RAIZ_DO_APP).dependencies ?? {});

    expect(pacotes.size).toBeGreaterThan(100);
    expect(naoResolvidas).toEqual([]);
    // O `expo` traz o `@expo/cli` como dependência de produção.
    expect(diretas).not.toContain('@expo/cli');
    expect(nomes).toContain('@expo/cli');
    // devDependencies do app não entram.
    expect(nomes).not.toContain('jest-expo');
    expect(nomes).not.toContain('@biomejs/biome');
  });

  it('toda exceção tem motivo e ainda está na árvore', () => {
    for (const [nome, motivo] of Object.entries(EXCECOES)) {
      expect({ nome, motivo: motivo.trim().length > 0 }).toEqual({
        nome,
        motivo: true,
      });
      expect(nomes).toContain(nome);
    }
  });
});

describe('percorrerArvore numa árvore no formato do pnpm', () => {
  let raiz = '';

  /**
   * Grava o pacote em `store/<nome>/node_modules/<nome>` (a pasta real, como
   * no pnpm) e devolve `store/<nome>`, onde ficam os links das dependências.
   */
  function gravar(nome: string, json: PacoteJson): string {
    const loja = join(raiz, 'store', nome.replace('/', '+'));
    const real = join(loja, 'node_modules', nome);
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, 'package.json'), JSON.stringify(json));
    return loja;
  }

  /** Liga `<de>/node_modules/<nome>` à pasta real gravada por `gravar`. */
  function ligar(de: string, nome: string): void {
    const link = join(de, 'node_modules', nome);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(
      join(raiz, 'store', nome.replace('/', '+'), 'node_modules', nome),
      link,
      'dir',
    );
  }

  beforeEach(() => {
    raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arvore-')));
  });

  afterEach(() => {
    rmSync(raiz, { recursive: true, force: true });
  });

  it('acha a telemetria em dependência de dependência e ignora as de desenvolvimento', () => {
    const app = join(raiz, 'app');
    mkdirSync(app, { recursive: true });
    writeFileSync(
      join(app, 'package.json'),
      JSON.stringify({
        dependencies: { a: '1' },
        optionalDependencies: { 'so-no-mac': '1' },
        devDependencies: { 'posthog-node': '1' },
      }),
    );
    const lojaDeA = gravar('a', {
      name: 'a',
      dependencies: { b: '1' },
      // Opcional de outra plataforma (não instalada) e opcional instalada.
      optionalDependencies: { 'outra-plataforma': '1', 'rudder-opcional': '1' },
    });
    // Ciclo a > b > a, comum na árvore real.
    const lojaDeB = gravar('b', {
      name: 'b',
      dependencies: { '@sentry/core': '1', a: '1' },
    });
    gravar('@sentry/core', { name: '@sentry/core' });
    gravar('posthog-node', { name: 'posthog-node' });
    gravar('rudder-opcional', { name: 'rudder-opcional' });
    ligar(app, 'a');
    ligar(app, 'posthog-node');
    // As dependências de `a` ficam ao lado dele no store, como no pnpm: só
    // resolvem subindo a partir da pasta real.
    ligar(lojaDeA, 'b');
    ligar(lojaDeA, 'rudder-opcional');
    ligar(lojaDeB, '@sentry/core');
    ligar(lojaDeB, 'a');

    const { pacotes, naoResolvidas } = percorrerArvore(app);

    expect([...pacotes.values()].map((p) => p.nome).sort()).toEqual([
      '@sentry/core',
      'a',
      'b',
      'rudder-opcional',
    ]);
    expect(naoResolvidas).toEqual([]);
    expect(pacotesProibidos(pacotes.values())).toEqual([
      '@sentry/core (via a > b > @sentry/core)',
      'rudder-opcional (via a > rudder-opcional)',
    ]);
  });

  it('relata a dependência obrigatória que não resolve', () => {
    const app = join(raiz, 'app');
    mkdirSync(app, { recursive: true });
    writeFileSync(
      join(app, 'package.json'),
      JSON.stringify({ dependencies: { a: '1' } }),
    );
    gravar('a', { name: 'a', dependencies: { sumida: '1' } });
    ligar(app, 'a');

    expect(percorrerArvore(app).naoResolvidas).toEqual(['a > sumida']);
  });
});

describe('pacotesProibidos', () => {
  const pacote = (nome: string, pedidoComo = nome) => ({
    nome,
    pedidoComo,
    caminho: ['expo', pedidoComo],
  });

  it.each([
    '@sentry/react-native',
    '@react-native-firebase/analytics',
    '@segment/analytics-react-native',
    '@react-native-async-storage/async-storage',
    'posthog-react-native',
    '@datadog/mobile-react-native',
    'newrelic-react-native-agent',
    'appcenter-crashes',
    '@expo/rudder-sdk-node',
    '@opentelemetry/api',
    'Mixpanel-React-Native',
  ])('acusa %s', (nome) => {
    expect(pacotesProibidos([pacote(nome)])).toEqual([
      `${nome} (via expo > ${nome})`,
    ]);
  });

  it('acusa também o nome por alias', () => {
    expect(
      pacotesProibidos([pacote('@sentry/react-native', 'monitor')]),
    ).toEqual(['@sentry/react-native (via expo > monitor)']);
    expect(pacotesProibidos([pacote('monitor', 'bugsnag-js')])).toEqual([
      'bugsnag-js (via expo > bugsnag-js)',
    ]);
  });

  it('não acusa nome comum nem a exceção listada', () => {
    expect(
      pacotesProibidos([pacote('expo'), pacote('react-native-screens')]),
    ).toEqual([]);
    expect(
      pacotesProibidos([pacote('@expo/rudder-sdk-node')], {
        '@expo/rudder-sdk-node': 'motivo de teste',
      }),
    ).toEqual([]);
  });
});
