import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  carregarArquivoEnv,
  carregarConfig,
  ErroDeConfiguracao,
  lerPorta,
  lerTrustProxy,
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
