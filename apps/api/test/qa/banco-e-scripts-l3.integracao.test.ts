/**
 * QA da L3 — banco e scripts (CA40, CA41, CA54): quando um banco é "local",
 * a URL recusada sem repetir o valor, os tempos do pool de verdade no
 * Postgres, os scripts `semear` e `migrar` e o entrypoint `servidor.ts` rodando
 * como processo (partida, recusa e encerramento por SIGTERM).
 *
 * Nenhum teste aqui aponta um script para um banco que não seja o de teste:
 * os hosts remotos usam o domínio `.invalid`, que nunca resolve, e os scripts
 * recusam antes de abrir qualquer conexão.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import {
  criarConexao,
  opcoesDoPool,
} from '../../src/compartilhado/banco/conexao.js';
import {
  ErroDeConfiguracao,
  ehBancoLocal,
  lerUrlDoBanco,
} from '../../src/config.js';
import { bancoDeTeste } from '../banco-teste.js';

const RAIZ_DA_API = fileURLToPath(new URL('../..', import.meta.url));
const TSX = `${RAIZ_DA_API}node_modules/.bin/tsx`;

// O `pg` é quem lê a URL de verdade: comparamos com o `pg-connection-string`
// dele, para a regra de "local" nunca divergir do host que o driver usa.
const requirePg = createRequire(
  createRequire(`${RAIZ_DA_API}package.json`).resolve('pg'),
);
const { parse: lerComoOPg } = requirePg('pg-connection-string') as {
  parse(url: string): { host?: string | null; ssl?: unknown };
};

describe('CA40/CA44 (D44) — o que é "banco local"', () => {
  const locais = [
    'postgres://u:p@localhost/db',
    'postgres://u:p@LOCALHOST:5433/db',
    'postgres://u:p@127.0.0.1/db',
    'postgres://u:p@127.9.9.9/db',
    'postgres://u:p@[::1]/db',
    'postgres://u:p@[0:0:0:0:0:0:0:1]/db',
    'postgres:///db?host=/var/run/postgresql',
    'postgres://u:p@%2Fvar%2Frun%2Fpostgresql/db',
    'postgres://u:p@evil.example.com/db?host=localhost',
    'postgresql://u:p@localhost/db',
  ];
  const remotos = [
    'postgres://u:p@localhost.exemplo.com/db',
    'postgres://u:p@127.0.0.1.exemplo.com/db',
    'postgres://u:p@localhost./db',
    'postgres://u:p@128.0.0.1/db',
    'postgres://u:p@0.0.0.0/db',
    'postgres://u:p@127.1/db',
    'postgres://u:p@2130706433/db',
    'postgres://u:p@[::ffff:127.0.0.1]/db',
    'postgres://u:p@[::2]/db',
    'postgres://u:p@localhost/db?host=db.exemplo.com',
    'postgres://u:p@localhost/db?host=localhost&host=db.exemplo.com',
    'postgres://u:p@localhost,db.exemplo.com/db',
    'postgres://u:p@localhost:5432@db.exemplo.com/db',
    'postgres://u:p@db.exemplo.com#@localhost/db',
    'postgres://u:p@db.exemplo.com?@localhost/db',
    'postgres://u:p@localhost%00.exemplo.com/db',
    'postgres://u:p@/db', // host vazio: o pg cairia no PGHOST
    'não é url',
    '',
  ];

  it.each(locais)('%s é local', (url) => {
    expect(ehBancoLocal(url)).toBe(true);
  });

  it.each(remotos)('%s não é local', (url) => {
    expect(ehBancoLocal(url)).toBe(false);
  });

  it('o host que o pg usa para as URLs "locais" é mesmo local, e o das "remotas" que ele entende nunca é', () => {
    const hostsLocais = new Set(['localhost', '127.0.0.1', '127.9.9.9', '::1']);
    for (const url of locais) {
      const host = lerComoOPg(url).host ?? '';
      expect(
        hostsLocais.has(host.toLowerCase()) || host.startsWith('/'),
        `${host}`,
      ).toBe(true);
    }
    for (const url of remotos) {
      if (url === '' || url === 'não é url') {
        continue;
      }
      let host = '';
      try {
        host = lerComoOPg(url).host ?? '';
      } catch {
        continue; // o pg nem entende a URL
      }
      expect(
        hostsLocais.has(host.toLowerCase()) || host.startsWith('/'),
        `${url} -> ${host}`,
      ).toBe(false);
    }
  });
});

describe('CA41 (D44) — a URL do banco', () => {
  const SEGREDO = 'SenhaSecretaDoBanco987';

  function erroDe(url: string): ErroDeConfiguracao {
    try {
      lerUrlDoBanco({ DATABASE_URL: url }, 'DATABASE_URL');
    } catch (erro) {
      if (erro instanceof ErroDeConfiguracao) {
        return erro;
      }
      throw erro;
    }
    throw new Error('deveria ter recusado');
  }

  it.each([
    `postgres://u:${SEGREDO}@db.exemplo.com:5432/trampoja`,
    `postgres://u:${SEGREDO}@db.exemplo.com/trampoja?sslmode=require`,
    `postgres://u:${SEGREDO}@db.exemplo.com/trampoja?sslmode=verify-ca`,
    `postgres://u:${SEGREDO}@db.exemplo.com/trampoja?sslmode=no-verify`,
    `postgres://u:${SEGREDO}@db.exemplo.com/trampoja?sslmode=VERIFY-FULL`,
    `postgres://u:${SEGREDO}@db.exemplo.com/trampoja?sslmode=verify-full&sslmode=disable`,
    `postgres://u:${SEGREDO}@db.exemplo.com/trampoja?sslmode=verify-full&sslmode`,
    `postgres://u:${SEGREDO}@db.exemplo.com/trampoja?ssl=true`,
    `postgres://u:${SEGREDO}@localhost/trampoja?host=db.exemplo.com`,
  ])(
    'host remoto sem verify-full é recusado, citando só a variável: %s',
    (url) => {
      const erro = erroDe(url);

      expect(erro.variavel).toBe('DATABASE_URL');
      expect(erro.message).toContain('DATABASE_URL');
      expect(erro.message).not.toContain(SEGREDO);
      expect(erro.message).not.toContain('db.exemplo.com');
      expect(String(erro.stack)).not.toContain(SEGREDO);
    },
  );

  it.each([
    `postgres://u:${SEGREDO}@db.exemplo.com/trampoja?sslmode=verify-full`,
    `postgres://u:${SEGREDO}@db.exemplo.com:5432/trampoja?sslmode=verify-full&sslrootcert=/etc/ca.pem`,
    `postgres://u:${SEGREDO}@localhost/trampoja`,
    `postgres://u:${SEGREDO}@127.0.0.1:5432/trampoja?sslmode=disable`,
  ])('é aceita: %s', (url) => {
    expect(lerUrlDoBanco({ DATABASE_URL: url }, 'DATABASE_URL')).toBe(url);
  });

  it.each([
    'statement_timeout=0',
    'idle_in_transaction_session_timeout=0',
    'connectionTimeoutMillis=999999',
  ])(
    'a URL não pode sobrescrever os tempos fixos do pool (%s), nem em banco local',
    (parametro) => {
      const erro = erroDe(
        `postgres://u:${SEGREDO}@localhost/trampoja?${parametro}`,
      );

      expect(erro.message).not.toContain(SEGREDO);
    },
  );

  it('o pool de verdade no Postgres tem 5 s de conexão, 10 s de consulta e 30 s de transação ociosa; o do migrar não tem limite de consulta', async () => {
    const url = process.env.DATABASE_URL_TESTE ?? '';
    expect(url).not.toBe('');
    const opcoes = opcoesDoPool(url);
    expect(opcoes).toMatchObject({
      connectionTimeoutMillis: 5000,
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 30_000,
    });
    expect(
      'statement_timeout' in opcoesDoPool(url, { tempoMaximoDeConsultaMs: 0 }),
    ).toBe(false);

    const api = criarConexao(url, { maximoDeConexoes: 1 });
    const migrar = criarConexao(url, {
      maximoDeConexoes: 1,
      tempoMaximoDeConsultaMs: 0,
    });
    try {
      const lido = async (db: typeof api) =>
        (
          await sql<{
            consulta: string;
            ociosa: string;
          }>`select current_setting('statement_timeout') as consulta,
              current_setting('idle_in_transaction_session_timeout') as ociosa`.execute(
            db,
          )
        ).rows[0];
      expect(await lido(api)).toEqual({ consulta: '10s', ociosa: '30s' });
      expect(await lido(migrar)).toEqual({ consulta: '0', ociosa: '30s' });
    } finally {
      await api.destroy();
      await migrar.destroy();
    }
  });

  it('uma consulta que passa de 10 s é cancelada pelo banco (57014) em cerca de 10 s, e a conexão continua servindo', async () => {
    const api = criarConexao(process.env.DATABASE_URL_TESTE ?? '', {
      maximoDeConexoes: 1,
    });
    try {
      const inicio = Date.now();
      const erro = await sql`select pg_sleep(15)`
        .execute(api)
        .then(() => null)
        .catch((e: unknown) => e as { code?: string });

      expect(erro?.code).toBe('57014');
      expect(Date.now() - inicio).toBeGreaterThan(9000);
      expect(Date.now() - inicio).toBeLessThan(13_000);
      const { rows } = await sql<{ um: number }>`select 1 as um`.execute(api);
      expect(rows[0]?.um).toBe(1);
    } finally {
      await api.destroy();
    }
  }, 30_000);

  it('o banco de teste da suíte é local (e a suíte continua a usar a conexão tipada)', () => {
    expect(ehBancoLocal(process.env.DATABASE_URL_TESTE ?? '')).toBe(true);
    expect(bancoDeTeste()).toBeDefined();
  });
});

describe('CA40/CA54 — scripts como processo', () => {
  const SEGREDO = 'SenhaSecretaDoScript456';
  const HOST = 'host-secreto-qa.invalid';
  const URL_REMOTA = `postgres://usuario:${SEGREDO}@${HOST}:5432/trampoja`;

  /** Roda o script com o ambiente mínimo e nunca vaza a saída do ambiente. */
  function rodar(script: string, args: string[], env: Record<string, string>) {
    const resultado = spawnSync(TSX, [script, ...args], {
      cwd: RAIZ_DA_API,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        ...env,
      },
      timeout: 60_000,
    });
    return {
      codigo: resultado.status,
      saida: `${resultado.stdout.toString()}${resultado.stderr.toString()}`,
    };
  }

  function semVazar(saida: string): void {
    expect(saida).not.toContain(SEGREDO);
    expect(saida).not.toContain(HOST);
    expect(saida).not.toContain('usuario');
    expect(saida).not.toContain('postgres://');
  }

  it('semear recusa banco remoto com código 2, antes de conectar, sem a URL na saída (também com verify-full)', () => {
    for (const url of [URL_REMOTA, `${URL_REMOTA}?sslmode=verify-full`]) {
      const inicio = Date.now();
      const r = rodar('scripts/semear.ts', [], { DATABASE_URL: url });

      expect(r.codigo).toBe(2);
      expect(r.saida).toContain('--permitir-banco-remoto');
      expect(r.saida).not.toContain('semeando');
      semVazar(r.saida);
      // Sem tentar conectar: um host `.invalid` demoraria os 5 s do pool.
      expect(Date.now() - inicio).toBeLessThan(15_000);
    }
  });

  it('semear --teste também recusa um DATABASE_URL_TESTE remoto, citando a variável certa', () => {
    const r = rodar('scripts/semear.ts', ['--teste'], {
      DATABASE_URL_TESTE: `${URL_REMOTA}_teste?sslmode=verify-full`,
    });

    expect(r.codigo).toBe(2);
    expect(r.saida).toContain('DATABASE_URL_TESTE');
    semVazar(r.saida);
  });

  it('semear com a flag mas sem verify-full cai na recusa da URL (código 1), sem o valor', () => {
    const r = rodar('scripts/semear.ts', ['--permitir-banco-remoto'], {
      DATABASE_URL: URL_REMOTA,
    });

    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('sslmode=verify-full');
    semVazar(r.saida);
  });

  it('semear com opção desconhecida sai com 2 e não lê a URL', () => {
    const r = rodar('scripts/semear.ts', ['--remoto'], {
      DATABASE_URL: URL_REMOTA,
    });

    expect(r.codigo).toBe(2);
    semVazar(r.saida);
  });

  it('migrar com banco remoto sem verify-full recusa com código 1, sem o valor', () => {
    const r = rodar('scripts/migrar.ts', [], { DATABASE_URL: URL_REMOTA });

    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('DATABASE_URL');
    semVazar(r.saida);
  });
});

describe('CA41 (S2 da revisão) — NODE_TLS_REJECT_UNAUTHORIZED=0 com banco remoto', () => {
  const SEGREDO = 'SenhaSecretaDoTls654';
  const HOST = 'host-secreto-tls.invalid';
  const URL_REMOTA = `postgres://usuario:${SEGREDO}@${HOST}:5432/trampoja?sslmode=verify-full`;

  function rodar(script: string, args: string[], env: Record<string, string>) {
    const resultado = spawnSync(TSX, [script, ...args], {
      cwd: RAIZ_DA_API,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        ...env,
      },
      timeout: 60_000,
    });
    return {
      codigo: resultado.status,
      saida: `${resultado.stdout.toString()}${resultado.stderr.toString()}`,
    };
  }

  function semVazar(saida: string): void {
    expect(saida).not.toContain(SEGREDO);
    expect(saida).not.toContain(HOST);
    expect(saida).not.toContain('postgres://');
  }

  it('o servidor recusa a partida, com código 1 e só o nome da variável', () => {
    const r = rodar('src/servidor.ts', [], {
      DATABASE_URL: URL_REMOTA,
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      PORT: '0',
    });

    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('NODE_TLS_REJECT_UNAUTHORIZED');
    semVazar(r.saida);
  });

  it('o migrar também recusa, antes de abrir conexão (ele leva a senha do banco ao mesmo host remoto)', () => {
    const r = rodar('scripts/migrar.ts', [], {
      DATABASE_URL: URL_REMOTA,
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
    });

    expect(r.saida).toContain('NODE_TLS_REJECT_UNAUTHORIZED');
    expect(r.codigo).toBe(1);
    semVazar(r.saida);
  });

  it('o semear com --permitir-banco-remoto também recusa, antes de abrir conexão', () => {
    const r = rodar('scripts/semear.ts', ['--permitir-banco-remoto'], {
      DATABASE_URL: URL_REMOTA,
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
    });

    expect(r.saida).toContain('NODE_TLS_REJECT_UNAUTHORIZED');
    expect(r.codigo).toBe(1);
    semVazar(r.saida);
  });
});

describe('CA54/ADR-007 — o entrypoint servidor.ts como processo', () => {
  let filho: ChildProcess | undefined;

  afterEach(async () => {
    if (filho && filho.exitCode === null) {
      filho.kill('SIGKILL');
      await once(filho, 'exit');
    }
    filho = undefined;
  });

  async function portaLivre(): Promise<number> {
    const servidor = createServer();
    servidor.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    const porta = (servidor.address() as { port: number }).port;
    servidor.close();
    await once(servidor, 'close');
    return porta;
  }

  it('sobe no banco de teste, atende, e no SIGTERM encerra com código 0 registrando o encerramento, sem a URL do banco nem a senha dela', async () => {
    const urlDoBanco = process.env.DATABASE_URL_TESTE ?? '';
    const senhaDoBanco = decodeURIComponent(new URL(urlDoBanco).password);
    const porta = await portaLivre();
    let saida = '';
    filho = spawn(TSX, ['src/servidor.ts'], {
      cwd: RAIZ_DA_API,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        DATABASE_URL: urlDoBanco,
        PORT: String(porta),
      },
    });
    filho.stdout?.on('data', (d: Buffer) => {
      saida += d.toString();
    });
    filho.stderr?.on('data', (d: Buffer) => {
      saida += d.toString();
    });

    // Espera o servidor responder.
    let resposta: Response | undefined;
    for (let i = 0; i < 100 && resposta === undefined; i += 1) {
      try {
        resposta = await fetch(`http://127.0.0.1:${porta}/sessoes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    expect(resposta?.status).toBe(400);

    filho.kill('SIGTERM');
    const [codigo] = (await once(filho, 'exit')) as [number | null];

    expect(codigo).toBe(0);
    expect(saida).toContain('encerrando o servidor');
    expect(saida).toContain('servidor encerrado');
    expect(saida).not.toContain(urlDoBanco);
    if (senhaDoBanco !== '') {
      expect(saida).not.toContain(senhaDoBanco);
    }
  }, 60_000);

  it('com banco remoto sem verify-full, a partida falha com código 1 e a mensagem cita só a variável', async () => {
    const SEGREDO = 'SenhaSecretaDoServidor321';
    const porta = await portaLivre();
    filho = spawn(TSX, ['src/servidor.ts'], {
      cwd: RAIZ_DA_API,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        DATABASE_URL: `postgres://usuario:${SEGREDO}@host-secreto-qa.invalid/trampoja`,
        PORT: String(porta),
      },
    });
    let saida = '';
    filho.stdout?.on('data', (d: Buffer) => {
      saida += d.toString();
    });
    filho.stderr?.on('data', (d: Buffer) => {
      saida += d.toString();
    });

    const [codigo] = (await once(filho, 'exit')) as [number | null];

    expect(codigo).toBe(1);
    expect(saida).toContain('DATABASE_URL');
    expect(saida).not.toContain(SEGREDO);
    expect(saida).not.toContain('host-secreto-qa');
  }, 60_000);
});
