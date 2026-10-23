import { createHash } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  criarLimiteDeEntrada,
  LIMITE_PADRAO_POR_EMAIL_E_IP,
  type LimitesDeEntrada,
} from './limite-de-entrada.js';
import { criarLogger } from './logger.js';
import { criarServidor } from './servidor.js';

const MINUTO_MS = 60_000;
const EMAIL = 'maria@exemplo.com';
const SENHA = 'senha-de-teste-123';
const IP_A = '203.0.113.10';
const IP_B = '198.51.100.20';

const PADRAO: LimitesDeEntrada = {
  porEmailEIp: LIMITE_PADRAO_POR_EMAIL_E_IP,
};

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.useRealTimers();
});

interface OpcoesDoTeste {
  readonly limites?: LimitesDeEntrada;
  readonly logger?: Parameters<typeof criarServidor>[0]['logger'];
}

/**
 * Fastify mínimo como a composição vai ligar (etapa 18): o
 * `@fastify/rate-limit` registrado e o hook no `preValidation` de
 * `POST /sessoes`, cujo schema exige e-mail e senha em texto.
 */
async function montar({
  limites = PADRAO,
  logger = false,
}: OpcoesDoTeste = {}): Promise<FastifyInstance> {
  const servidor = criarServidor({ logger });
  app = servidor;
  await servidor.register(rateLimit, { global: false });
  const limitar = criarLimiteDeEntrada(servidor, limites);
  servidor.post(
    '/sessoes',
    {
      preValidation: limitar,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'senha'],
          properties: {
            email: { type: 'string' },
            senha: { type: 'string' },
          },
        },
      },
    },
    async () => ({ ok: true }),
  );
  await servidor.ready();
  return servidor;
}

/** Marca o pedido sem corpo nenhum (nem `Content-Type`). */
const SEM_CORPO = Symbol('sem corpo');

/** `POST /sessoes` com o corpo dado (padrão: e-mail e senha) vindo de `ip`. */
function entrar(
  servidor: FastifyInstance,
  ip: string,
  corpo: unknown = { email: EMAIL, senha: SENHA },
) {
  return servidor.inject({
    method: 'POST',
    url: '/sessoes',
    remoteAddress: ip,
    ...(corpo === SEM_CORPO ? {} : { payload: corpo as object }),
  });
}

async function repetir(
  vezes: number,
  pedido: (i: number) => Promise<{ statusCode: number }>,
): Promise<number[]> {
  const status: number[] = [];
  for (let i = 0; i < vezes; i++) {
    status.push((await pedido(i)).statusCode);
  }
  return status;
}

/** IPv4 distinto para cada `i` (até 65 536), fora das faixas usadas acima. */
function ipVariado(i: number): string {
  return `10.20.${Math.floor(i / 256)}.${i % 256}`;
}

describe('limite padrão (D31)', () => {
  it('é 10 por e-mail+IP a cada 15 min (o teto por conta fica no banco, em `contas`)', () => {
    expect(LIMITE_PADRAO_POR_EMAIL_E_IP).toEqual({
      max: 10,
      janelaMs: 15 * MINUTO_MS,
    });
  });
});

describe('CA42 — criarLimiteDeEntrada', () => {
  it('Dado 10 tentativas do mesmo e-mail e IP, quando vem a 11ª, então 429 muitas_requisicoes com retry-after de 15 min', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const servidor = await montar();

    const status = await repetir(10, () => entrar(servidor, IP_A));
    const bloqueada = await entrar(servidor, IP_A);

    expect(status).toEqual(Array(10).fill(200));
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json()).toEqual({ erro: 'muitas_requisicoes' });
    expect(bloqueada.headers['retry-after']).toBe('900');
  });

  it('Dado o e-mail bloqueado num IP, então o mesmo e-mail de outro IP ainda entra', async () => {
    const servidor = await montar();

    await repetir(11, () => entrar(servidor, IP_A));

    expect((await entrar(servidor, IP_A)).statusCode).toBe(429);
    expect((await entrar(servidor, IP_B)).statusCode).toBe(200);
  });

  it('o e-mail é contado aparado e em minúsculas, como no cadastro', async () => {
    const servidor = await montar();
    const formas = [EMAIL, ' Maria@Exemplo.COM ', 'MARIA@EXEMPLO.COM'];

    await repetir(10, (i) =>
      entrar(servidor, IP_A, {
        email: formas[i % formas.length],
        senha: SENHA,
      }),
    );

    expect(
      (
        await entrar(servidor, IP_A, {
          email: ' maria@EXEMPLO.com',
          senha: SENHA,
        })
      ).statusCode,
    ).toBe(429);
    expect(
      (
        await entrar(servidor, IP_A, {
          email: 'jose@exemplo.com',
          senha: SENHA,
        })
      ).statusCode,
    ).toBe(200);
  });

  it('a janela de 15 min passa e o e-mail+IP volta a entrar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const servidor = await montar();

    await repetir(10, () => entrar(servidor, IP_A));
    vi.advanceTimersByTime(14 * MINUTO_MS);
    const bloqueada = await entrar(servidor, IP_A);
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.headers['retry-after']).toBe('60');

    vi.advanceTimersByTime(MINUTO_MS);
    expect((await entrar(servidor, IP_A)).statusCode).toBe(200);
  });

  it('S1 — não há teto só por e-mail em memória: 150 tentativas do e-mail, 10 de cada IP, passam todas aqui (o teto por conta é do caso de uso, no banco)', async () => {
    const servidor = await montar();

    const status = await repetir(150, (i) =>
      entrar(servidor, ipVariado(Math.floor(i / 10))),
    );

    expect(status).toEqual(Array(150).fill(200));
    // O limite por e-mail+IP continua valendo em cada IP.
    expect((await entrar(servidor, ipVariado(0))).statusCode).toBe(429);
  });

  it('no IPv6, endereços do mesmo /64 contam juntos e outro /64 não', async () => {
    const servidor = await montar();
    const mesmoPrefixo = [
      '2001:db8:1:2::a',
      '2001:db8:1:2:ffff:ffff:ffff:ffff',
      '2001:DB8:1:2:abcd::1',
    ];

    const status = await repetir(10, (i) =>
      entrar(servidor, mesmoPrefixo[i % mesmoPrefixo.length] as string),
    );

    expect(status).toEqual(Array(10).fill(200));
    expect((await entrar(servidor, '2001:db8:1:2:1234::99')).statusCode).toBe(
      429,
    );
    expect((await entrar(servidor, '2001:db8:1:3::a')).statusCode).toBe(200);
  });

  it('o IPv4 mapeado em IPv6 conta junto com o IPv4', async () => {
    const servidor = await montar();

    await repetir(10, () => entrar(servidor, '::ffff:203.0.113.10'));

    expect((await entrar(servidor, IP_A)).statusCode).toBe(429);
  });

  it('corpo sem e-mail utilizável cai na chave do IP normalizado, e corpo inválido também conta', async () => {
    const servidor = await montar();
    const semEmail: unknown[] = [
      SEM_CORPO,
      {},
      { senha: SENHA },
      { email: 123, senha: SENHA },
      { email: null, senha: SENHA },
      { email: '   ', senha: SENHA },
      { email: `${'a'.repeat(310)}@exemplo.com`, senha: SENHA },
      [EMAIL],
      { email: [EMAIL], senha: SENHA },
    ];
    // 10 tentativas sem e-mail útil, de endereços do mesmo /64.
    const status = await repetir(10, (i) =>
      entrar(servidor, `2001:db8:9:9::${i + 1}`, semEmail[i % semEmail.length]),
    );

    // O schema recusa (400) só depois de o limite contar; a de e-mail longo
    // passa no schema e no limite.
    expect(status.filter((s) => s === 429)).toHaveLength(0);
    expect(
      (await entrar(servidor, '2001:db8:9:9:ffff::1', {})).statusCode,
    ).toBe(429);
    expect(
      (
        await entrar(servidor, '2001:db8:9:9:ffff::1', {
          email: 7,
          senha: SENHA,
        })
      ).statusCode,
    ).toBe(429);
    // Outro /64 tem contador próprio; e um e-mail válido do mesmo /64 também,
    // porque a chave dele é e-mail+IP.
    expect((await entrar(servidor, '2001:db8:9:a::1', {})).statusCode).toBe(
      400,
    );
    expect((await entrar(servidor, '2001:db8:9:9::1')).statusCode).toBe(200);
  });

  it('Dado 15 tentativas simultâneas do mesmo e-mail e IP, então nunca passam mais de 10', async () => {
    const servidor = await montar();

    const respostas = await Promise.all(
      Array.from({ length: 15 }, () => entrar(servidor, IP_A)),
    );
    const status = respostas.map((r) => r.statusCode);

    // O store do plugin pode recusar a mais em pedidos no mesmo tick (ver
    // `limite-por-conta.test.ts`); o que se garante é o teto.
    expect(status.filter((s) => s === 200).length).toBeLessThanOrEqual(10);
    expect(status.every((s) => s === 200 || s === 429)).toBe(true);
    expect((await entrar(servidor, IP_A)).statusCode).toBe(429);
  });

  it('o 429 não traz o e-mail nem o hash dele na resposta nem no log', async () => {
    const linhas: string[] = [];
    const servidor = await montar({
      limites: { porEmailEIp: { max: 1, janelaMs: MINUTO_MS } },
      logger: criarLogger({
        nivel: 'trace',
        destino: { write: (linha) => void linhas.push(linha) },
      }),
    });
    const digitado = ' Maria@Exemplo.COM ';
    const corpo = { email: digitado, senha: SENHA };
    const proibidos = [
      EMAIL,
      digitado.trim(),
      'Maria',
      'maria',
      SENHA,
      createHash('sha256').update(EMAIL, 'utf8').digest('hex'),
      createHash('sha256').update(digitado, 'utf8').digest('hex'),
      'email-ip:',
      'email:',
    ];

    await entrar(servidor, IP_A, corpo);
    const bloqueada = await entrar(servidor, IP_A, corpo);

    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json()).toEqual({ erro: 'muitas_requisicoes' });
    const saida = bloqueada.body + JSON.stringify(bloqueada.headers);
    for (const texto of proibidos) {
      expect(saida).not.toContain(texto);
    }
    const log = linhas.join('');
    expect(log).toContain('muitas_requisicoes');
    for (const texto of proibidos) {
      expect(log).not.toContain(texto);
    }
  });

  it('o contador de e-mail+IP guarda mais de 5000 chaves (o padrão do LRU do plugin)', async () => {
    const servidor = await montar({
      limites: { porEmailEIp: { max: 1, janelaMs: MINUTO_MS } },
    });
    const tentar = (i: number) =>
      entrar(servidor, IP_A, {
        email: `pessoa${i}@exemplo.com`,
        senha: SENHA,
      });

    expect((await tentar(0)).statusCode).toBe(200);
    for (let i = 1; i <= 5001; i++) {
      await tentar(i);
    }

    // Com o LRU de 5000, o e-mail 0 teria sido esquecido e passaria de novo.
    expect((await tentar(0)).statusCode).toBe(429);
  }, 30_000);

  it('recusa na criação limite que não é inteiro positivo, em vez de cair no padrão do plugin', async () => {
    const servidor = criarServidor({ logger: false });
    app = servidor;
    await servidor.register(rateLimit, { global: false });

    for (const invalido of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        criarLimiteDeEntrada(servidor, {
          porEmailEIp: { max: invalido, janelaMs: MINUTO_MS },
        }),
      ).toThrow('max de porEmailEIp');
      expect(() =>
        criarLimiteDeEntrada(servidor, {
          porEmailEIp: { max: 1, janelaMs: invalido },
        }),
      ).toThrow('janelaMs de porEmailEIp');
    }
    expect(() =>
      criarLimiteDeEntrada(servidor, {} as unknown as LimitesDeEntrada),
    ).toThrow('falta porEmailEIp');
  });

  it('recusa na criação se o @fastify/rate-limit não foi registrado', () => {
    const servidor = criarServidor({ logger: false });
    app = servidor;

    expect(() => criarLimiteDeEntrada(servidor, PADRAO)).toThrow(
      'registre o @fastify/rate-limit',
    );
  });
});
