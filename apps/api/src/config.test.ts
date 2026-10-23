import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  carregarArquivoEnv,
  carregarConfig,
  ErroDeConfiguracao,
  ehBancoLocal,
  lerPorta,
  lerTrustProxy,
  lerUrlDoBanco,
  lerUrlDoBancoDeTeste,
} from './config.js';

const URL_DEV = 'postgres://usuario:s3nh4-secreta@localhost:5432/trampoja';
const URL_TESTE =
  'postgres://usuario:s3nh4-secreta@localhost:5432/trampoja_teste';

function capturar(fn: () => unknown): ErroDeConfiguracao {
  try {
    fn();
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroDeConfiguracao);
    return erro as ErroDeConfiguracao;
  }
  throw new Error('era esperado um ErroDeConfiguracao');
}

describe('carregarConfig', () => {
  it('lê DATABASE_URL e PORT', () => {
    expect(carregarConfig({ DATABASE_URL: URL_DEV, PORT: '8080' })).toEqual({
      databaseUrl: URL_DEV,
      porta: 8080,
      trustProxy: false,
    });
  });

  it('aceita o protocolo postgresql://', () => {
    const url = 'postgresql://u:p@localhost/trampoja';
    expect(carregarConfig({ DATABASE_URL: url }).databaseUrl).toBe(url);
  });

  it('usa a porta 3000 quando PORT não está definida', () => {
    expect(carregarConfig({ DATABASE_URL: URL_DEV }).porta).toBe(3000);
  });

  it('recusa DATABASE_URL ausente ou vazia citando só o nome da variável', () => {
    for (const env of [{}, { DATABASE_URL: '' }, { DATABASE_URL: '   ' }]) {
      const erro = capturar(() => carregarConfig(env));
      expect(erro.variavel).toBe('DATABASE_URL');
      expect(erro.message).toMatch(/^DATABASE_URL ausente/);
    }
  });

  it.each([
    ['sem protocolo', 'usuario:s3nh4-secreta@localhost/trampoja'],
    ['protocolo errado', 'mysql://usuario:s3nh4-secreta@localhost/trampoja'],
    ['sem nome do banco', 'postgres://usuario:s3nh4-secreta@localhost:5432/'],
  ])(
    'recusa DATABASE_URL %s sem ecoar o valor (nem a senha)',
    (_caso, valor) => {
      const erro = capturar(() => carregarConfig({ DATABASE_URL: valor }));
      expect(erro.variavel).toBe('DATABASE_URL');
      expect(erro.message).not.toContain('s3nh4');
      expect(erro.stack ?? '').not.toContain('s3nh4');
      expect(erro.cause).toBeUndefined();
      expect(JSON.stringify(erro)).not.toContain('s3nh4');
    },
  );
});

describe('lerPorta', () => {
  it.each(['0', '65536', '-1', '3000.5', 'abc', '80a'])(
    'recusa PORT=%j',
    (valor) => {
      const erro = capturar(() => lerPorta({ PORT: valor }));
      expect(erro.variavel).toBe('PORT');
      expect(erro.message).not.toContain(valor);
    },
  );

  it('aceita os limites 1 e 65535', () => {
    expect(lerPorta({ PORT: '1' })).toBe(1);
    expect(lerPorta({ PORT: '65535' })).toBe(65535);
  });
});

describe('lerUrlDoBancoDeTeste', () => {
  it('lê DATABASE_URL_TESTE', () => {
    expect(lerUrlDoBancoDeTeste({ DATABASE_URL_TESTE: URL_TESTE })).toBe(
      URL_TESTE,
    );
  });

  it('recusa banco cujo nome não termina em _teste, para não truncar o banco de desenvolvimento', () => {
    const erro = capturar(() =>
      lerUrlDoBancoDeTeste({ DATABASE_URL_TESTE: URL_DEV }),
    );
    expect(erro.variavel).toBe('DATABASE_URL_TESTE');
    expect(erro.message).toContain('_teste');
    expect(erro.message).not.toContain('s3nh4');
  });

  it('não cai para DATABASE_URL quando DATABASE_URL_TESTE falta', () => {
    const erro = capturar(() =>
      lerUrlDoBancoDeTeste({ DATABASE_URL: URL_TESTE }),
    );
    expect(erro.variavel).toBe('DATABASE_URL_TESTE');
  });
});

describe('carregarArquivoEnv', () => {
  const nomeA = 'TRAMPOJA_TESTE_CONFIG_A';
  const nomeB = 'TRAMPOJA_TESTE_CONFIG_B';
  let pasta = '';

  afterEach(() => {
    delete process.env[nomeA];
    delete process.env[nomeB];
    if (pasta) rmSync(pasta, { recursive: true, force: true });
  });

  it('não falha quando o arquivo não existe', () => {
    expect(() =>
      carregarArquivoEnv('/caminho/que/nao/existe/.env'),
    ).not.toThrow();
  });

  it('carrega o arquivo sem sobrescrever variáveis já definidas no ambiente', () => {
    pasta = mkdtempSync(join(tmpdir(), 'trampoja-config-'));
    const arquivo = join(pasta, '.env');
    writeFileSync(arquivo, `${nomeA}=do-arquivo\n${nomeB}=do-arquivo\n`);
    process.env[nomeA] = 'do-ambiente';

    carregarArquivoEnv(arquivo);

    expect(process.env[nomeA]).toBe('do-ambiente');
    expect(process.env[nomeB]).toBe('do-arquivo');
  });
});

describe('lerTrustProxy (S1)', () => {
  it.each([undefined, '', '   ', 'false'])(
    'desligado com %j: o IP é o da conexão',
    (valor) => {
      expect(lerTrustProxy({ TRUST_PROXY: valor })).toBe(false);
    },
  );

  it('true só quando o operador escreve true', () => {
    expect(lerTrustProxy({ TRUST_PROXY: 'true' })).toBe(true);
    expect(lerTrustProxy({ TRUST_PROXY: ' true ' })).toBe(true);
  });

  it('aceita lista de IPs e CIDRs (IPv4 e IPv6) e faixas nomeadas, aparando os itens', () => {
    expect(
      lerTrustProxy({
        TRUST_PROXY: ' 10.0.0.1 , 10.0.1.0/24,::1, fd00::/8,loopback',
      }),
    ).toBe('10.0.0.1,10.0.1.0/24,::1,fd00::/8,loopback');
  });

  it.each([
    'TRUE',
    'yes',
    '1',
    '2',
    '10.0.0.256',
    '10.0.0.0/33',
    '::1/129',
    '10.0.0.0/8/1',
    '10.0.0.1,',
    'proxy.interno',
    '10.0.0.0/-1',
  ])('recusa %j citando só o nome da variável', (valor) => {
    const erro = capturar(() => lerTrustProxy({ TRUST_PROXY: valor }));
    expect(erro.variavel).toBe('TRUST_PROXY');
    expect(erro.message).not.toContain(valor);
  });

  it('carregarConfig repassa o valor lido', () => {
    expect(
      carregarConfig({ DATABASE_URL: URL_DEV, TRUST_PROXY: '127.0.0.1' })
        .trustProxy,
    ).toBe('127.0.0.1');
  });
});

describe('ehBancoLocal (D44)', () => {
  it.each([
    'postgres://u:s3nh4@localhost:5432/trampoja',
    'postgres://u:s3nh4@LOCALHOST/trampoja',
    'postgresql://u:s3nh4@127.0.0.1/trampoja',
    'postgres://u:s3nh4@127.255.0.9:5433/trampoja',
    'postgres://u:s3nh4@[::1]:5432/trampoja',
    'postgres://u:s3nh4@[0:0:0:0:0:0:0:1]/trampoja',
    'postgres://u:s3nh4@%2Fvar%2Frun%2Fpostgresql/trampoja',
    'postgres://u:s3nh4@localhost/trampoja?host=/var/run/postgresql',
  ])('local: %s', (url) => {
    expect(ehBancoLocal(url)).toBe(true);
  });

  it.each([
    ['nome remoto', 'postgres://u:s3nh4@db.exemplo.com/trampoja'],
    ['parece localhost', 'postgres://u:s3nh4@localhost.exemplo.com/trampoja'],
    ['IP da rede', 'postgres://u:s3nh4@10.0.0.5/trampoja'],
    ['IPv4 abreviado', 'postgres://u:s3nh4@127.1/trampoja'],
    ['IPv6 fora do loopback', 'postgres://u:s3nh4@[fd00::1]/trampoja'],
    ['IPv6 todo zero', 'postgres://u:s3nh4@[::]/trampoja'],
    ['IPv4 mapeado em IPv6', 'postgres://u:s3nh4@[::ffff:127.0.0.1]/trampoja'],
    // O `pg` usa o parâmetro `host` no lugar do host da URL.
    [
      'host da query remoto',
      'postgres://u:s3nh4@localhost/trampoja?host=db.exemplo.com',
    ],
    [
      'um dos hosts da query remoto',
      'postgres://u:s3nh4@localhost/trampoja?host=localhost&host=db.exemplo.com',
    ],
    ['host da query vazio', 'postgres://u:s3nh4@localhost/trampoja?host='],
    // Sem host, o `pg` cairia no `PGHOST` do ambiente.
    ['sem host', 'postgres:///trampoja'],
    ['ilegível', 'nada disso'],
  ])('não local (%s)', (_caso, url) => {
    expect(ehBancoLocal(url)).toBe(false);
  });
});

describe('lerUrlDoBanco: banco remoto só com verify-full (S10, CA41)', () => {
  const REMOTA =
    'postgres://usuario:s3nh4-secreta@db.exemplo.com:5432/trampoja';

  it('aceita host local sem TLS', () => {
    expect(lerUrlDoBanco({ DATABASE_URL: URL_DEV }, 'DATABASE_URL')).toBe(
      URL_DEV,
    );
  });

  it('aceita host remoto com sslmode=verify-full, com ou sem sslrootcert', () => {
    for (const url of [
      `${REMOTA}?sslmode=verify-full`,
      `${REMOTA}?sslrootcert=/etc/ca.pem&sslmode=verify-full`,
    ]) {
      expect(lerUrlDoBanco({ DATABASE_URL: url }, 'DATABASE_URL')).toBe(url);
    }
  });

  it.each([
    ['sem sslmode', REMOTA],
    ['sslmode=require', `${REMOTA}?sslmode=require`],
    ['sslmode=verify-ca', `${REMOTA}?sslmode=verify-ca`],
    ['sslmode=prefer', `${REMOTA}?sslmode=prefer`],
    ['sslmode=disable', `${REMOTA}?sslmode=disable`],
    ['sslmode=no-verify', `${REMOTA}?sslmode=no-verify`],
    ['ssl=true sem sslmode', `${REMOTA}?ssl=true`],
    ['sslmode em maiúsculas', `${REMOTA}?sslmode=VERIFY-FULL`],
    // O `pg` usaria o último valor repetido.
    ['sslmode repetido', `${REMOTA}?sslmode=verify-full&sslmode=disable`],
    [
      'host local na URL mas remoto na query',
      'postgres://usuario:s3nh4-secreta@localhost/trampoja?host=db.exemplo.com',
    ],
  ])(
    'recusa host remoto %s, citando a variável e nunca o valor',
    (_caso, url) => {
      const erro = capturar(() => carregarConfig({ DATABASE_URL: url }));
      expect(erro.variavel).toBe('DATABASE_URL');
      expect(erro.message).toContain('sslmode=verify-full');
      for (const trecho of ['s3nh4', 'db.exemplo.com', 'usuario']) {
        expect(erro.message).not.toContain(trecho);
        expect(erro.stack ?? '').not.toContain(trecho);
        expect(JSON.stringify(erro)).not.toContain(trecho);
      }
      expect(erro.cause).toBeUndefined();
    },
  );

  it('vale também para DATABASE_URL_TESTE', () => {
    const erro = capturar(() =>
      lerUrlDoBancoDeTeste({
        DATABASE_URL_TESTE:
          'postgres://u:s3nh4-secreta@db.exemplo.com/trampoja_teste',
      }),
    );
    expect(erro.variavel).toBe('DATABASE_URL_TESTE');
    expect(erro.message).not.toContain('s3nh4');
  });

  it.each([
    'statement_timeout=0',
    'idle_in_transaction_session_timeout=0',
    'connectionTimeoutMillis=0',
  ])(
    'recusa %s na URL, porque o pg deixaria a URL sobrescrever os tempos do pool (D42)',
    (parametro) => {
      const erro = capturar(() =>
        carregarConfig({ DATABASE_URL: `${URL_DEV}?${parametro}` }),
      );
      expect(erro.variavel).toBe('DATABASE_URL');
      expect(erro.message).not.toContain('s3nh4');
    },
  );
});

describe('carregarConfig: NODE_TLS_REJECT_UNAUTHORIZED=0 com banco remoto (S2, CA41)', () => {
  const REMOTA =
    'postgres://usuario:s3nh4-secreta@db.exemplo.com:5432/trampoja?sslmode=verify-full';

  it('recusa citando só o nome da variável, nunca a URL', () => {
    const erro = capturar(() =>
      carregarConfig({
        DATABASE_URL: REMOTA,
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      }),
    );
    expect(erro.variavel).toBe('NODE_TLS_REJECT_UNAUTHORIZED');
    expect(erro.message).toMatch(/^NODE_TLS_REJECT_UNAUTHORIZED /);
    for (const trecho of ['s3nh4', 'db.exemplo.com', 'usuario', '=0']) {
      expect(erro.message).not.toContain(trecho);
      expect(erro.stack ?? '').not.toContain(trecho);
      expect(JSON.stringify(erro)).not.toContain(trecho);
    }
    expect(erro.cause).toBeUndefined();
  });

  it('aceita o banco local com a conferência desligada (não há TLS em jogo)', () => {
    for (const url of [
      URL_DEV,
      'postgres://u:s3nh4@[::1]/trampoja',
      'postgres://u:s3nh4@%2Fvar%2Frun%2Fpostgresql/trampoja',
    ]) {
      expect(
        carregarConfig({ DATABASE_URL: url, NODE_TLS_REJECT_UNAUTHORIZED: '0' })
          .databaseUrl,
      ).toBe(url);
    }
  });

  it('recusa quando a URL é local no host mas remota no parâmetro host', () => {
    const url =
      'postgres://u:s3nh4@localhost/trampoja?host=db.exemplo.com&sslmode=verify-full';
    const erro = capturar(() =>
      carregarConfig({ DATABASE_URL: url, NODE_TLS_REJECT_UNAUTHORIZED: '0' }),
    );
    expect(erro.variavel).toBe('NODE_TLS_REJECT_UNAUTHORIZED');
  });

  // O Node só desliga a conferência com `0` exato; os demais valores a mantêm.
  it.each([undefined, '', '1', ' 0', 'false'])(
    'aceita o banco remoto com NODE_TLS_REJECT_UNAUTHORIZED=%j',
    (valor) => {
      expect(
        carregarConfig({
          DATABASE_URL: REMOTA,
          NODE_TLS_REJECT_UNAUTHORIZED: valor,
        }).databaseUrl,
      ).toBe(REMOTA);
    },
  );

  it('a URL inválida continua falhando pela DATABASE_URL, antes da conferência do TLS', () => {
    const erro = capturar(() =>
      carregarConfig({
        DATABASE_URL: 'postgres://u:s3nh4-secreta@db.exemplo.com/trampoja',
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      }),
    );
    expect(erro.variavel).toBe('DATABASE_URL');
  });

  // Q2: `migrar` e `semear` leem a URL por `lerUrlDoBanco` e
  // `lerUrlDoBancoDeTeste`, sem passar por `carregarConfig`.
  it.each([
    [
      'lerUrlDoBanco',
      () =>
        lerUrlDoBanco(
          { DATABASE_URL: REMOTA, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
          'DATABASE_URL',
        ),
    ],
    [
      'lerUrlDoBancoDeTeste',
      () =>
        lerUrlDoBancoDeTeste({
          DATABASE_URL_TESTE:
            'postgres://usuario:s3nh4-secreta@db.exemplo.com/trampoja_teste?sslmode=verify-full',
          NODE_TLS_REJECT_UNAUTHORIZED: '0',
        }),
    ],
  ])('a mesma recusa vale na leitura direta por %s (scripts)', (_caso, ler) => {
    const erro = capturar(ler);
    expect(erro.variavel).toBe('NODE_TLS_REJECT_UNAUTHORIZED');
    for (const trecho of ['s3nh4', 'db.exemplo.com', 'usuario']) {
      expect(erro.message).not.toContain(trecho);
      expect(JSON.stringify(erro)).not.toContain(trecho);
    }
  });

  it('a leitura direta aceita banco local com a conferência desligada', () => {
    expect(
      lerUrlDoBanco(
        { DATABASE_URL: URL_DEV, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
        'DATABASE_URL',
      ),
    ).toBe(URL_DEV);
  });
});
