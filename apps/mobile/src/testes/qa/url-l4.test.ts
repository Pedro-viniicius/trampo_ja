// QA da L4 (CA68): URL da API sem userinfo e sem host vazio, no comando real
// `build:producao` e nas duas regras (`urlDaApi` e `conferirUrlDeProducao`),
// com formas que o teste de unidade não lista.
import { conferirUrlDeProducao } from '../../../app.config';
import { urlDaApi } from '../../api/config';

declare const __dirname: string;
const { spawnSync } = require('node:child_process') as {
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
const { mkdtempSync, readdirSync, rmSync } = require('node:fs') as {
  mkdtempSync(prefixo: string): string;
  readdirSync(caminho: string): string[];
  rmSync(caminho: string, opcoes: { recursive: true; force: true }): void;
};
const { tmpdir } = require('node:os') as { tmpdir(): string };
const { join } = require('node:path') as { join(...partes: string[]): string };

const RAIZ_DO_REPOSITORIO = join(__dirname, '../../../../..');

function aceita(url: string, dev: boolean): boolean {
  try {
    urlDaApi({ EXPO_PUBLIC_API_URL: url }, dev);
    return true;
  } catch {
    return false;
  }
}

function conferida(url: string): boolean {
  try {
    conferirUrlDeProducao(url);
    return true;
  } catch {
    return false;
  }
}

describe('build:producao de verdade, com userinfo na URL (CA68)', () => {
  it('recusa https://usuario:senha@host sem repetir usuário, senha nem host e sem gerar bundle', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'url-l4-qa-'));
    try {
      const resultado = spawnSync(
        'pnpm',
        [
          '--filter',
          'mobile',
          'build:producao',
          '--no-bytecode',
          '--output-dir',
          join(pasta, 'saida'),
        ],
        {
          cwd: RAIZ_DO_REPOSITORIO,
          env: {
            ...process.env,
            EXPO_PUBLIC_API_URL:
              'https://usuario-qa-l4:senha-qa-l4@host-qa-l4.exemplo.com',
            CI: '1',
            EXPO_NO_TELEMETRY: '1',
          },
          timeout: 60_000,
        },
      );
      const saida = `${resultado.stdout.toString()}${resultado.stderr.toString()}`;

      expect(resultado.status).not.toBe(0);
      expect(saida).toContain('EXPO_PUBLIC_API_URL inválida');
      for (const parte of ['usuario-qa-l4', 'senha-qa-l4', 'host-qa-l4']) {
        expect(saida.includes(parte)).toBe(false);
      }
      expect(() => readdirSync(join(pasta, 'saida'))).toThrow();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  }, 90_000);
});

describe('formas de userinfo e de host vazio nas duas regras (CA68)', () => {
  const RECUSADAS = [
    'https://@api.exemplo.com',
    'https://:@api.exemplo.com',
    'https://usuario@api.exemplo.com:8443/v1',
    'https://api.exemplo.com@evil.exemplo.com',
    'https://api.exemplo.com\\@evil.exemplo.com',
    'https://%75suario:s%65nha@api.exemplo.com',
    'https://',
    'https:///v1',
    'https://:',
    'https://:443/v1',
  ];

  it.each(RECUSADAS)(
    '%j é recusada em produção e em desenvolvimento, nas duas regras',
    (url) => {
      expect(aceita(url, false)).toBe(false);
      expect(aceita(url, true)).toBe(false);
      expect(conferida(url)).toBe(false);
    },
  );

  it('as duas regras concordam em tudo o que aceitam ou recusam', () => {
    const candidatas = [
      ...RECUSADAS,
      'https://api.exemplo.com',
      'https://api.exemplo.com:8443/v1',
      'https://api.exemplo.com/v1/@algo',
      'https://api.exemplo.com:0',
      'https://api.exemplo.com:65536',
      'https://[::1]:3000',
      'https://api.exemplo.com\\evil',
      '  https://api.exemplo.com  ',
    ];
    for (const url of candidatas) {
      expect([url, aceita(url, false)]).toEqual([url, conferida(url)]);
    }
  });

  it('um @ no caminho, depois do host, não é userinfo e segue aceito', () => {
    expect(aceita('https://api.exemplo.com/v1/@algo', false)).toBe(true);
    expect(conferida('https://api.exemplo.com/v1/@algo')).toBe(true);
  });
});
