import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import type { BancoBase } from './compartilhado/banco/conexao.js';
import { LIMITE_PADRAO_POR_EMAIL_E_IP } from './compartilhado/http/limite-de-entrada.js';
import {
  type GrupoDeLimite,
  grupoDaRota,
  gruposDaRota,
} from './compartilhado/http/limite-por-conta.js';
import { criarLogger } from './compartilhado/http/logger.js';
import {
  type Aplicacao,
  CHAVES_DO_LIMITE_POR_IP_NA_ENTRADA,
  LIMITE_PADRAO_DAS_ROTAS_PUBLICAS,
  montarAplicacao,
  type OpcoesDaAplicacao,
  ROTAS_PUBLICAS,
} from './composicao.js';
import { TETO_PADRAO_POR_EMAIL } from './modulos/contas/index.js';

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
        'POST /contas/eu/exclusao',
        'POST /contas/eu/exportacao',
        'GET /perfis/eu',
        'PUT /perfis/eu',
        'GET /perfis/:contaId',
        'POST /trampos',
        'GET /trampos/meus',
        'GET /trampos/:id',
        'PUT /trampos/:id',
        'POST /trampos/:id/encerrar',
        'DELETE /trampos/:id',
        'POST /trampos/:id/candidaturas',
        'GET /trampos/:id/candidaturas',
        'POST /trampos/:id/candidaturas/:cid/aceitar',
        'GET /candidaturas/minhas',
        'DELETE /candidaturas/:id',
        'POST /servicos',
        'GET /servicos/meus',
        'GET /servicos/:id',
        'PUT /servicos/:id',
        'DELETE /servicos/:id',
        'GET /busca',
        'GET /categorias',
        'POST /conversas',
        'GET /conversas',
        'GET /conversas/:id/mensagens',
        'POST /conversas/:id/mensagens',
      ].sort(),
    );
  });

  it('CA20 (D29) — cada rota autenticada registrada cai nos grupos de limite previstos (HEAD automático é leitura; o teto diário é só do envio de mensagem)', async () => {
    const { rotas } = await montar({ rateLimit: false });
    // Tabela explícita: `grupoDaRota` cai em `escrita` para rota que não
    // conhece, então só "tem grupo" não pegaria um erro de grupo.
    const esperado: Readonly<Record<string, readonly GrupoDeLimite[]>> = {
      // S8: sair fica fora do limite por conta.
      'DELETE /sessoes': [],
      'POST /contas/eu/exclusao': ['senha'],
      'POST /contas/eu/exportacao': ['senha'],
      'GET /perfis/eu': ['leitura'],
      'PUT /perfis/eu': ['escrita'],
      'GET /perfis/:contaId': ['leitura'],
      'POST /trampos': ['publicacao'],
      'GET /trampos/meus': ['leitura'],
      'GET /trampos/:id': ['leitura'],
      // D36: editar conta junto com publicar; encerrar e excluir são escrita.
      'PUT /trampos/:id': ['publicacao'],
      'POST /trampos/:id/encerrar': ['escrita'],
      'DELETE /trampos/:id': ['escrita'],
      'POST /trampos/:id/candidaturas': ['publicacao'],
      'GET /trampos/:id/candidaturas': ['leitura'],
      'POST /trampos/:id/candidaturas/:cid/aceitar': ['escrita'],
      'GET /candidaturas/minhas': ['leitura'],
      // D36: retirar é escrita (candidatar de novo gasta `publicacao`).
      'DELETE /candidaturas/:id': ['escrita'],
      'POST /servicos': ['publicacao'],
      'GET /servicos/meus': ['leitura'],
      'GET /servicos/:id': ['leitura'],
      // D36: editar conta junto com publicar; excluir é escrita.
      'PUT /servicos/:id': ['publicacao'],
      'DELETE /servicos/:id': ['escrita'],
      'GET /busca': ['leitura'],
      'GET /categorias': ['leitura'],
      'POST /conversas': ['escrita'],
      'GET /conversas': ['leitura'],
      'GET /conversas/:id/mensagens': ['leitura'],
      // S1 da L1: 30/min e, somado, o teto de 1000 a cada 24 h.
      'POST /conversas/:id/mensagens': ['mensagens', 'mensagens_dia'],
    };

    const autenticadas = rotas.filter(
      (rota) =>
        !ROTAS_PUBLICAS.some(
          (p) => p.metodo === rota.metodo && p.url === rota.url,
        ),
    );
    const semHead = autenticadas.filter((rota) => rota.metodo !== 'HEAD');
    expect(semHead.map((r) => `${r.metodo} ${r.url}`).sort()).toEqual(
      Object.keys(esperado).sort(),
    );
    for (const rota of autenticadas) {
      const chave = `${rota.metodo} ${rota.url}`;
      const grupos = rota.metodo === 'HEAD' ? ['leitura'] : esperado[chave];
      expect(gruposDaRota(rota.metodo, rota.url), chave).toEqual(grupos);
      expect(grupoDaRota(rota.metodo, rota.url), chave).toBe(
        grupos?.[0] ?? null,
      );
    }
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

describe('S1 (D31, CA42) — limite de entrada em POST /sessoes', () => {
  /*
   * Aqui só o contador por e-mail+IP, que fica na borda HTTP. O teto por
   * conta é contado no banco pelo caso de uso `entrar`, depois de achar a
   * conta: com o `DummyDriver` nenhuma conta existe, e os cenários dele
   * ficam no BDD de `contas` e em `test/e2e/endurecimento-l3`.
   */

  // Corpo recusado pelo schema (chave extra): conta para o limite, sem banco.
  function tentativa(email: unknown) {
    return { email, senha: 'senha-errada-123', extra: true };
  }

  /** IP diferente a cada tentativa: o limite por IP nunca é atingido. */
  function ipDaVez(i: number): string {
    return `198.51.${Math.floor(i / 250)}.${(i % 250) + 1}`;
  }

  /** Status de cada tentativa, em sequência. */
  async function tentar(
    quantas: number,
    email: unknown,
    ip: (i: number) => string,
  ): Promise<number[]> {
    const status: number[] = [];
    for (let i = 0; i < quantas; i++) {
      const resposta = await pedir('POST', '/sessoes', {
        corpo: tentativa(email),
        ip: ip(i),
      });
      status.push(resposta.statusCode);
    }
    return status;
  }

  // Limite por IP (D2) alto: estes testes são sobre os contadores da D31.
  const SEM_LIMITE_POR_IP = { max: 10_000, janelaMs: 60_000 };

  it('os padrões ligados são os da D31: 10 por e-mail+IP a cada 15 min e, no caso de uso, 100 por conta a cada hora', async () => {
    expect(LIMITE_PADRAO_POR_EMAIL_E_IP).toEqual({
      max: 10,
      janelaMs: 15 * 60_000,
    });
    expect(TETO_PADRAO_POR_EMAIL).toEqual({ max: 100, janelaMs: 60 * 60_000 });
    await montar({ rateLimit: SEM_LIMITE_POR_IP });

    // 10 do mesmo e-mail+IP passam; a 11ª dá 429 com a janela de 15 min.
    expect(await tentar(10, EMAIL, () => IP_A)).toEqual(Array(10).fill(400));
    const bloqueada = await pedir('POST', '/sessoes', {
      corpo: tentativa(EMAIL),
      ip: IP_A,
    });
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.headers['retry-after']).toBe('900');
    expect(bloqueada.body).toBe('{"erro":"muitas_requisicoes"}');
  });

  it('S1 — a borda HTTP não tem teto só por e-mail: 150 tentativas do e-mail vindas de IPs variados passam por ela (o teto é por conta, no banco)', async () => {
    await montar({ rateLimit: SEM_LIMITE_POR_IP });

    expect(await tentar(150, EMAIL, ipDaVez)).toEqual(Array(150).fill(400));
  });

  it('Dado N tentativas do mesmo e-mail+IP, então a seguinte dá 429 genérico, sem o e-mail, e outro IP segue passando', async () => {
    await montar({
      rateLimit: SEM_LIMITE_POR_IP,
      limitePorEmailEIp: { max: 3, janelaMs: 60_000 },
    });

    expect(await tentar(3, EMAIL, () => IP_A)).toEqual([400, 400, 400]);
    const bloqueada = await pedir('POST', '/sessoes', {
      corpo: tentativa(EMAIL),
      ip: IP_A,
    });

    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.body).toBe('{"erro":"muitas_requisicoes"}');
    expect(bloqueada.headers['retry-after']).toBe('60');
    expect(JSON.stringify(bloqueada.headers)).not.toContain(EMAIL);
    expect(
      (await pedir('POST', '/sessoes', { corpo: tentativa(EMAIL), ip: IP_B }))
        .statusCode,
    ).toBe(400);
  });

  it('o e-mail com caixa e espaços diferentes conta junto', async () => {
    await montar({
      rateLimit: SEM_LIMITE_POR_IP,
      limitePorEmailEIp: { max: 3, janelaMs: 60_000 },
    });

    const variantes = [EMAIL, EMAIL.toUpperCase(), `  ${EMAIL}  `];
    for (const email of variantes) {
      expect(
        (await pedir('POST', '/sessoes', { corpo: tentativa(email) }))
          .statusCode,
      ).toBe(400);
    }
    expect(
      (
        await pedir('POST', '/sessoes', {
          corpo: tentativa('Maria.Silva@Exemplo.com'),
        })
      ).statusCode,
    ).toBe(429);
  });

  it('no IPv6, o mesmo /64 conta junto e outro /64 tem contador próprio', async () => {
    await montar({
      rateLimit: SEM_LIMITE_POR_IP,
      limitePorEmailEIp: { max: 3, janelaMs: 60_000 },
    });

    const noMesmo64 = (i: number) => `2001:db8:a:b::${(i + 1).toString(16)}`;
    expect(await tentar(3, EMAIL, noMesmo64)).toEqual([400, 400, 400]);
    expect(
      (
        await pedir('POST', '/sessoes', {
          corpo: tentativa(EMAIL),
          ip: '2001:db8:a:b:ffff:ffff:ffff:ffff',
        })
      ).statusCode,
    ).toBe(429);
    expect(
      (
        await pedir('POST', '/sessoes', {
          corpo: tentativa(EMAIL),
          ip: '2001:db8:a:c::1',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('corpo sem e-mail utilizável cai na chave do IP: trocar o lixo não contorna o limite', async () => {
    await montar({
      rateLimit: SEM_LIMITE_POR_IP,
      limitePorEmailEIp: { max: 3, janelaMs: 60_000 },
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

  it('outro e-mail do mesmo IP segue passando até o limite por IP (D2)', async () => {
    await montar({
      rateLimit: { max: 5, janelaMs: 60_000 },
      limitePorEmailEIp: { max: 2, janelaMs: 60_000 },
    });

    expect(await tentar(3, EMAIL, () => IP_A)).toEqual([400, 400, 429]);
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

  it('S1 — o limite por IP de POST /sessoes guarda mais chaves que um /48 tem de /64 (o padrão do plugin, 5000, seria despejado trocando de prefixo)', async () => {
    expect(CHAVES_DO_LIMITE_POR_IP_NA_ENTRADA).toBeGreaterThan(2 ** 16);
    await montar({ rateLimit: { max: 1, janelaMs: 60_000 } });
    // Cada pedido de um /64 diferente do mesmo /48.
    const do48 = (i: number) => `2001:db8:77:${i.toString(16)}::1`;

    expect(
      (await pedir('POST', '/sessoes', { corpo: CORPO_VAZIO, ip: do48(0) }))
        .statusCode,
    ).toBe(400);
    for (let i = 1; i <= 5001; i++) {
      await pedir('POST', '/sessoes', { corpo: CORPO_VAZIO, ip: do48(i) });
    }

    // Com o LRU de 5000, o /64 do primeiro teria sido esquecido.
    expect(
      (await pedir('POST', '/sessoes', { corpo: CORPO_VAZIO, ip: do48(0) }))
        .statusCode,
    ).toBe(429);
  }, 30_000);

  it('não vale para POST /contas e é desligado com rateLimit: false', async () => {
    await montar({
      rateLimit: SEM_LIMITE_POR_IP,
      limitePorEmailEIp: { max: 1, janelaMs: 60_000 },
    });
    for (let i = 0; i < 3; i++) {
      expect(
        (await pedir('POST', '/contas', { corpo: tentativa(EMAIL) }))
          .statusCode,
      ).toBe(400);
    }
    await aplicacao?.fechar();

    await montar({ rateLimit: false });
    expect(await tentar(12, EMAIL, () => IP_A)).toEqual(Array(12).fill(400));
  });

  it('limite de entrada ou teto inválido recusa a montagem, em vez de cair num padrão', async () => {
    await expect(
      montarAplicacao({
        db: bancoFicticio(),
        limitePorEmailEIp: { max: 0, janelaMs: 60_000 },
      }),
    ).rejects.toThrow('limite de entrada inválido: max de porEmailEIp');
    await expect(
      montarAplicacao({
        db: bancoFicticio(),
        limitePorEmail: { max: 10, janelaMs: 1.5 },
      }),
    ).rejects.toThrow('teto de tentativas de entrada inválido: janelaMs');
    // O teto é do caso de uso: `rateLimit: false` não o desliga.
    await expect(
      montarAplicacao({
        db: bancoFicticio(),
        rateLimit: false,
        limitePorEmail: { max: 0, janelaMs: 60_000 },
      }),
    ).rejects.toThrow('teto de tentativas de entrada inválido: max');
  });

  it('CA42 — o 429 do limite por e-mail+IP é registrado no log sem o e-mail, o hash dele nem a senha', async () => {
    const linhas: string[] = [];
    await montar({
      rateLimit: SEM_LIMITE_POR_IP,
      limitePorEmailEIp: { max: 1, janelaMs: 60_000 },
      logger: criarLogger({
        nivel: 'trace',
        destino: { write: (linha) => void linhas.push(linha) },
      }),
    });

    // 2ª do IP_A: recusada por e-mail+IP; a do IP_B passa.
    expect(await tentar(2, EMAIL, () => IP_A)).toEqual([400, 429]);
    expect(await tentar(1, EMAIL, () => IP_B)).toEqual([400]);

    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(EMAIL).digest('hex');
    const log = linhas.join('');
    expect(log.match(/muitas_requisicoes/g)).toHaveLength(1);
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

describe('D29 — limite por conta na composição', () => {
  it('limite por conta inválido recusa a montagem, em vez de cair no padrão do plugin', async () => {
    await expect(
      montarAplicacao({
        db: bancoFicticio(),
        limitesPorConta: {
          leitura: { max: 0, janelaMs: 60_000 },
          mensagens: { max: 30, janelaMs: 60_000 },
          mensagens_dia: { max: 1000, janelaMs: 86_400_000 },
          publicacao: { max: 30, janelaMs: 60_000 },
          senha: { max: 5, janelaMs: 60_000 },
          escrita: { max: 60, janelaMs: 60_000 },
        },
      }),
    ).rejects.toThrow('limite por conta inválido: max do grupo leitura');
  });
});
