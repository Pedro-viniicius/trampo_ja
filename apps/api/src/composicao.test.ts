import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import type { BancoBase } from './compartilhado/banco/conexao.js';
import { criarLogger } from './compartilhado/http/logger.js';
import {
  type Aplicacao,
  LIMITE_PADRAO_DAS_ROTAS_PUBLICAS,
  LIMITE_PADRAO_DE_ENTRADAS_POR_EMAIL,
  montarAplicacao,
  type OpcoesDaAplicacao,
  ROTAS_PUBLICAS,
} from './composicao.js';

/*
 * Composição sem banco: o `DummyDriver` do Kysely responde a toda consulta com
 * zero linhas, então nenhuma sessão é válida (401). Os testes daqui só usam
 * requisições que param antes do banco (rate limit, schema, autenticação); o
 * fluxo com Postgres real fica em `test/e2e/`.
 */
function bancoFicticio(): Kysely<BancoBase> {
  return new Kysely<BancoBase>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

const EMAIL = 'maria.silva@exemplo.com';
const IP_A = '203.0.113.10';
const IP_B = '203.0.113.20';

let aplicacao: Aplicacao | undefined;

afterEach(async () => {
  await aplicacao?.fechar();
  aplicacao = undefined;
});

async function montar(
  opcoes: Omit<OpcoesDaAplicacao, 'db'> = {},
): Promise<Aplicacao> {
  aplicacao = await montarAplicacao({ db: bancoFicticio(), ...opcoes });
  return aplicacao;
}

async function pedir(
  metodo: 'POST' | 'GET' | 'DELETE',
  url: string,
  opcoes: {
    corpo?: Record<string, unknown>;
    ip?: string;
    cabecalhos?: Record<string, string>;
  } = {},
) {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao.app.inject({
    method: metodo,
    url,
    remoteAddress: opcoes.ip ?? IP_A,
    ...(opcoes.cabecalhos ? { headers: opcoes.cabecalhos } : {}),
    ...(opcoes.corpo ? { payload: opcoes.corpo } : {}),
  });
}

/** Corpo recusado pelo schema (400): nada chega ao hash nem ao banco. */
const CORPO_VAZIO = {};

describe('montarAplicacao — rotas', () => {
  it('registra exatamente os endpoints do plano (sem contar os HEAD automáticos)', async () => {
    const { rotas } = await montar({ rateLimit: false });

    const registradas = rotas
      .filter((rota) => rota.metodo !== 'HEAD')
      .map((rota) => `${rota.metodo} ${rota.url}`)
      .sort();

    expect(registradas).toEqual(
      [
        'POST /contas',
        'POST /sessoes',
        'DELETE /sessoes',
        'GET /perfis/eu',
        'PUT /perfis/eu',
        'GET /perfis/:contaId',
        'POST /trampos',
        'GET /trampos/meus',
        'GET /trampos/:id',
        'POST /trampos/:id/candidaturas',
        'GET /trampos/:id/candidaturas',
        'POST /trampos/:id/candidaturas/:cid/aceitar',
        'GET /candidaturas/minhas',
        'POST /servicos',
        'GET /servicos/meus',
        'GET /servicos/:id',
        'GET /busca',
        'GET /categorias',
        'POST /conversas',
        'GET /conversas',
        'GET /conversas/:id/mensagens',
        'POST /conversas/:id/mensagens',
      ].sort(),
    );
  });

  it('as rotas públicas são só POST /contas e POST /sessoes', () => {
    expect(ROTAS_PUBLICAS).toEqual([
      { metodo: 'POST', url: '/contas' },
      { metodo: 'POST', url: '/sessoes' },
    ]);
  });
});

describe('D2 — rate limit no cadastro e no login', () => {
  it('o limite padrão é 10 por minuto', () => {
    expect(LIMITE_PADRAO_DAS_ROTAS_PUBLICAS).toEqual({
      max: 10,
      janelaMs: 60_000,
    });
  });

  it('Dado o limite de 3, quando o mesmo IP faz a 4ª requisição a POST /contas, então recebe 429 {"erro":"muitas_requisicoes"} sem o e-mail', async () => {
    await montar({ rateLimit: { max: 3, janelaMs: 60_000 } });

    for (let i = 1; i <= 3; i++) {
      const resposta = await pedir('POST', '/contas', { corpo: CORPO_VAZIO });
      expect(resposta.statusCode).toBe(400);
      expect(resposta.headers['x-ratelimit-remaining']).toBe(String(3 - i));
    }
    const bloqueada = await pedir('POST', '/contas', {
      corpo: { email: EMAIL, senha: 'senha-forte-123' },
    });

    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.body).toBe('{"erro":"muitas_requisicoes"}');
    expect(bloqueada.headers['retry-after']).toBe('60');
    expect(bloqueada.headers['x-ratelimit-limit']).toBe('3');
    expect(bloqueada.headers['x-ratelimit-remaining']).toBe('0');
    expect(JSON.stringify(bloqueada.headers)).not.toContain(EMAIL);
    expect(JSON.stringify(bloqueada.headers)).not.toContain('maria');
  });

  it('Dado o limite de 3, quando o mesmo IP faz a 4ª requisição a POST /sessoes, então recebe 429', async () => {
    await montar({ rateLimit: { max: 3, janelaMs: 60_000 } });

    for (let i = 0; i < 3; i++) {
      expect(
        (await pedir('POST', '/sessoes', { corpo: CORPO_VAZIO })).statusCode,
      ).toBe(400);
    }
    const bloqueada = await pedir('POST', '/sessoes', {
      corpo: { email: EMAIL, senha: 'senha-forte-123' },
    });

    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json()).toEqual({ erro: 'muitas_requisicoes' });
  });

  it('o contador é por IP e por rota: outro IP e a outra rota pública seguem livres', async () => {
    await montar({ rateLimit: { max: 3, janelaMs: 60_000 } });
    for (let i = 0; i < 4; i++) {
      await pedir('POST', '/contas', { corpo: CORPO_VAZIO });
    }
    expect(
      (await pedir('POST', '/contas', { corpo: CORPO_VAZIO })).statusCode,
    ).toBe(429);

    expect(
      (await pedir('POST', '/contas', { corpo: CORPO_VAZIO, ip: IP_B }))
        .statusCode,
    ).toBe(400);
    expect(
      (await pedir('POST', '/sessoes', { corpo: CORPO_VAZIO })).statusCode,
    ).toBe(400);
  });

  // Com token válido (o caso que importa), em test/e2e/autenticacao.integracao.test.ts.
  it('Dado o limite de 3, as rotas autenticadas chamadas sem token respondem sempre 401, nunca 429', async () => {
    await montar({ rateLimit: { max: 3, janelaMs: 60_000 } });

    for (const [metodo, url] of [
      ['GET', '/categorias'],
      ['DELETE', '/sessoes'],
      ['GET', '/busca'],
    ] as const) {
      for (let i = 0; i < 6; i++) {
        const resposta = await pedir(metodo, url);
        expect(resposta.statusCode).toBe(401);
        expect(resposta.headers).not.toHaveProperty('x-ratelimit-limit');
      }
    }
  });

  it('sem a opção, vale o limite padrão: a 11ª requisição dá 429', async () => {
    await montar();

    for (let i = 0; i < 10; i++) {
      expect(
        (await pedir('POST', '/contas', { corpo: CORPO_VAZIO })).statusCode,
      ).toBe(400);
    }
    expect(
      (await pedir('POST', '/contas', { corpo: CORPO_VAZIO })).statusCode,
    ).toBe(429);
  });

  it('com rateLimit: false, nenhuma requisição é limitada', async () => {
    await montar({ rateLimit: false });

    for (let i = 0; i < 15; i++) {
      const resposta = await pedir('POST', '/contas', { corpo: CORPO_VAZIO });
      expect(resposta.statusCode).toBe(400);
      expect(resposta.headers).not.toHaveProperty('x-ratelimit-limit');
    }
  });

  it('CA15 — o 429 é registrado no log sem o e-mail nem a senha', async () => {
    const linhas: string[] = [];
    await montar({
      rateLimit: { max: 1, janelaMs: 60_000 },
      logger: criarLogger({
        nivel: 'trace',
        destino: { write: (linha) => void linhas.push(linha) },
      }),
    });

    await pedir('POST', '/contas', { corpo: CORPO_VAZIO });
    const bloqueada = await pedir('POST', '/contas', {
      corpo: { email: EMAIL, senha: 'senha-forte-123' },
    });

    expect(bloqueada.statusCode).toBe(429);
    const log = linhas.join('');
    expect(log).toContain('muitas_requisicoes');
    expect(log).not.toContain(EMAIL);
    expect(log).not.toContain('senha-forte-123');
  });
});

describe('S1 — limite de entradas por e-mail em POST /sessoes', () => {
  // Corpo recusado pelo schema (chave extra): conta para o limite, sem banco.
  function tentativa(email: unknown) {
    return { email, senha: 'senha-errada-123', extra: true };
  }

  /** IP diferente a cada tentativa: o limite por IP nunca é atingido. */
  function ipDaVez(i: number): string {
    return `198.51.100.${i + 1}`;
  }

  it('o padrão é 10 tentativas por 15 minutos', () => {
    expect(LIMITE_PADRAO_DE_ENTRADAS_POR_EMAIL).toEqual({
      max: 10,
      janelaMs: 15 * 60_000,
    });
  });

  it('Dado N tentativas no mesmo e-mail vindas de IPs diferentes, então a seguinte dá 429 genérico, sem o e-mail', async () => {
    await montar({
      rateLimit: { max: 100, janelaMs: 60_000 },
      limitePorEmail: { max: 3, janelaMs: 60_000 },
    });

    for (let i = 0; i < 3; i++) {
      const resposta = await pedir('POST', '/sessoes', {
        corpo: tentativa(EMAIL),
        ip: ipDaVez(i),
      });
      expect(resposta.statusCode).toBe(400);
    }
    const bloqueada = await pedir('POST', '/sessoes', {
      corpo: tentativa(EMAIL),
      ip: ipDaVez(3),
    });

    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.body).toBe('{"erro":"muitas_requisicoes"}');
    expect(bloqueada.headers['retry-after']).toBe('60');
    expect(JSON.stringify(bloqueada.headers)).not.toContain(EMAIL);
  });

  it('o e-mail com caixa e espaços diferentes conta junto', async () => {
    await montar({
      rateLimit: { max: 100, janelaMs: 60_000 },
      limitePorEmail: { max: 3, janelaMs: 60_000 },
    });

    const variantes = [EMAIL, EMAIL.toUpperCase(), `  ${EMAIL}  `];
    for (const [i, email] of variantes.entries()) {
      expect(
        (
          await pedir('POST', '/sessoes', {
            corpo: tentativa(email),
            ip: ipDaVez(i),
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await pedir('POST', '/sessoes', {
          corpo: tentativa('Maria.Silva@Exemplo.com'),
          ip: ipDaVez(9),
        })
      ).statusCode,
    ).toBe(429);
  });

  it('outro e-mail do mesmo IP segue passando até o limite por IP', async () => {
    await montar({
      rateLimit: { max: 5, janelaMs: 60_000 },
      limitePorEmail: { max: 2, janelaMs: 60_000 },
    });

    for (let i = 0; i < 2; i++) {
      await pedir('POST', '/sessoes', { corpo: tentativa(EMAIL) });
    }
    expect(
      (await pedir('POST', '/sessoes', { corpo: tentativa(EMAIL) })).statusCode,
    ).toBe(429);

    // 4ª e 5ª do mesmo IP, com outros e-mails: dentro do limite por IP.
    for (const outro of ['joao@exemplo.com', 'ana@exemplo.com']) {
      expect(
        (await pedir('POST', '/sessoes', { corpo: tentativa(outro) }))
          .statusCode,
      ).toBe(400);
    }
    // 6ª do mesmo IP: o limite por IP (5) barra.
    const porIp = await pedir('POST', '/sessoes', {
      corpo: tentativa('carla@exemplo.com'),
    });
    expect(porIp.statusCode).toBe(429);
    expect(porIp.headers['x-ratelimit-limit']).toBe('5');
  });

  it('corpo sem e-mail utilizável cai na chave do IP: trocar o lixo não contorna o limite', async () => {
    await montar({
      rateLimit: { max: 100, janelaMs: 60_000 },
      limitePorEmail: { max: 3, janelaMs: 60_000 },
    });

    for (const email of [undefined, 42, '   ']) {
      expect(
        (await pedir('POST', '/sessoes', { corpo: tentativa(email) }))
          .statusCode,
      ).toBe(400);
    }
    expect(
      (await pedir('POST', '/sessoes', { corpo: tentativa('x'.repeat(400)) }))
        .statusCode,
    ).toBe(429);
    // Outro IP, sem e-mail: contador próprio.
    expect(
      (await pedir('POST', '/sessoes', { corpo: CORPO_VAZIO, ip: IP_B }))
        .statusCode,
    ).toBe(400);
  });

  it('não vale para POST /contas e é desligado com rateLimit: false', async () => {
    await montar({
      rateLimit: { max: 100, janelaMs: 60_000 },
      limitePorEmail: { max: 1, janelaMs: 60_000 },
    });
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await pedir('POST', '/contas', {
            corpo: tentativa(EMAIL),
            ip: ipDaVez(i),
          })
        ).statusCode,
      ).toBe(400);
    }
    await aplicacao?.fechar();

    await montar({ rateLimit: false });
    for (let i = 0; i < 12; i++) {
      expect(
        (
          await pedir('POST', '/sessoes', {
            corpo: tentativa(EMAIL),
            ip: ipDaVez(i),
          })
        ).statusCode,
      ).toBe(400);
    }
  });

  it('CA15 — o 429 por e-mail é registrado no log sem o e-mail nem o hash dele', async () => {
    const linhas: string[] = [];
    await montar({
      rateLimit: { max: 100, janelaMs: 60_000 },
      limitePorEmail: { max: 1, janelaMs: 60_000 },
      logger: criarLogger({
        nivel: 'trace',
        destino: { write: (linha) => void linhas.push(linha) },
      }),
    });

    await pedir('POST', '/sessoes', { corpo: tentativa(EMAIL), ip: IP_A });
    const bloqueada = await pedir('POST', '/sessoes', {
      corpo: tentativa(EMAIL),
      ip: IP_B,
    });

    expect(bloqueada.statusCode).toBe(429);
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(EMAIL).digest('hex');
    const log = linhas.join('');
    expect(log).toContain('muitas_requisicoes');
    expect(log).not.toContain(EMAIL);
    expect(log).not.toContain(hash);
    expect(log).not.toContain('senha-errada-123');
  });
});

describe('S1 — trustProxy na composição', () => {
  it('com o proxy confiável, o limite por IP usa o cliente do X-Forwarded-For', async () => {
    await montar({
      rateLimit: { max: 2, janelaMs: 60_000 },
      trustProxy: '10.0.0.1',
    });
    const viaProxy = (cliente: string) =>
      pedir('POST', '/contas', {
        corpo: CORPO_VAZIO,
        ip: '10.0.0.1',
        cabecalhos: { 'x-forwarded-for': cliente },
      });

    expect((await viaProxy(IP_A)).statusCode).toBe(400);
    expect((await viaProxy(IP_A)).statusCode).toBe(400);
    expect((await viaProxy(IP_A)).statusCode).toBe(429);
    expect((await viaProxy(IP_B)).statusCode).toBe(400);
  });

  it('sem trustProxy (padrão), o X-Forwarded-For é ignorado', async () => {
    await montar({ rateLimit: { max: 2, janelaMs: 60_000 } });
    for (const cliente of ['198.51.100.1', '198.51.100.2']) {
      await pedir('POST', '/contas', {
        corpo: CORPO_VAZIO,
        cabecalhos: { 'x-forwarded-for': cliente },
      });
    }
    const forjada = await pedir('POST', '/contas', {
      corpo: CORPO_VAZIO,
      cabecalhos: { 'x-forwarded-for': '198.51.100.3' },
    });
    expect(forjada.statusCode).toBe(429);
  });
});
