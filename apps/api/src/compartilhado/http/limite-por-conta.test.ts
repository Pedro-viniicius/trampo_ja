import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exigirAutenticacao, type ValidarSessao } from './autenticacao.js';
import {
  criarLimitePorConta,
  type GrupoDeLimite,
  grupoDaRota,
  gruposDaRota,
  LIMITES_PADRAO_POR_CONTA,
  type LimitesPorConta,
} from './limite-por-conta.js';
import { criarLogger } from './logger.js';
import { criarServidor } from './servidor.js';

const CONTA_A = '7d3c2f0e-0b4f-4a57-9f7a-2a4c1d9e8b10';
const CONTA_B = '0f1e2d3c-4b5a-4968-8776-655443322110';
const TOKEN_A = 'tokenDaContaA_0123456789';
const TOKEN_B = 'tokenDaContaB_0123456789';
const MINUTO_MS = 60_000;
const DIA_MS = 24 * 60 * MINUTO_MS;

// Rotas autenticadas do servidor mínimo; o handler só responde 200.
const ROTAS_PROTEGIDAS = [
  { metodo: 'GET', url: '/perfis/eu' },
  { metodo: 'PUT', url: '/perfis/eu' },
  { metodo: 'GET', url: '/conversas/:id/mensagens' },
  { metodo: 'POST', url: '/conversas/:id/mensagens' },
  { metodo: 'POST', url: '/conversas' },
  { metodo: 'POST', url: '/trampos' },
  { metodo: 'POST', url: '/servicos' },
  { metodo: 'POST', url: '/trampos/:id/candidaturas' },
  { metodo: 'POST', url: '/contas/eu/exclusao' },
  { metodo: 'POST', url: '/contas/eu/exportacao' },
  { metodo: 'DELETE', url: '/sessoes' },
] as const;

type Metodo = (typeof ROTAS_PROTEGIDAS)[number]['metodo'];

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.useRealTimers();
});

/** Troca só o grupo pedido; os demais ficam com o padrão (D29). */
function limitesCom(
  parcial: Partial<Record<GrupoDeLimite, number>>,
): LimitesPorConta {
  const limites = { ...LIMITES_PADRAO_POR_CONTA };
  for (const [grupo, max] of Object.entries(parcial)) {
    limites[grupo as GrupoDeLimite] = { max, janelaMs: MINUTO_MS };
  }
  return limites;
}

/**
 * Fastify mínimo na ordem da composição: o `@fastify/rate-limit` registrado,
 * o hook `preHandler` em todas as rotas, a autenticação real no `onRequest`
 * das protegidas e uma rota pública (`POST /contas`) sem `contaId`.
 */
interface OpcoesDoTeste {
  readonly limites?: LimitesPorConta;
  readonly logger?: Parameters<typeof criarServidor>[0]['logger'];
  readonly validarSessao?: ValidarSessao;
}

async function sessaoDasContasAeB(token: string): Promise<string | null> {
  if (token === TOKEN_A) return CONTA_A;
  if (token === TOKEN_B) return CONTA_B;
  return null;
}

async function montar({
  limites = LIMITES_PADRAO_POR_CONTA,
  logger = false,
  validarSessao = sessaoDasContasAeB,
}: OpcoesDoTeste = {}): Promise<FastifyInstance> {
  const servidor = criarServidor({ logger });
  app = servidor;
  await servidor.register(rateLimit, { global: false });
  servidor.addHook('preHandler', criarLimitePorConta(servidor, limites));
  servidor.post('/contas', async () => ({ ok: true }));
  await servidor.register(async (protegido) => {
    protegido.addHook('onRequest', exigirAutenticacao(validarSessao));
    for (const { metodo, url } of ROTAS_PROTEGIDAS) {
      protegido.route({ method: metodo, url, handler: async () => ({}) });
    }
  });
  await servidor.ready();
  return servidor;
}

function pedir(
  servidor: FastifyInstance,
  metodo: Metodo | 'HEAD',
  url: string,
  token?: string,
) {
  return servidor.inject({
    method: metodo,
    url,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

async function repetir(
  vezes: number,
  pedido: () => Promise<{ statusCode: number }>,
): Promise<number[]> {
  const status: number[] = [];
  for (let i = 0; i < vezes; i++) {
    status.push((await pedido()).statusCode);
  }
  return status;
}

describe('grupoDaRota (D29)', () => {
  // Todas as rotas do README (seção "Endpoints") e as duas novas da L1.
  const TODAS_AS_ROTAS: ReadonlyArray<[string, string, GrupoDeLimite | null]> =
    [
      ['POST', '/contas', 'escrita'],
      ['POST', '/sessoes', 'escrita'],
      // S8: sair nunca recebe 429.
      ['DELETE', '/sessoes', null],
      ['POST', '/contas/eu/exclusao', 'senha'],
      ['POST', '/contas/eu/exportacao', 'senha'],
      ['GET', '/perfis/eu', 'leitura'],
      ['PUT', '/perfis/eu', 'escrita'],
      ['GET', '/perfis/:contaId', 'leitura'],
      ['POST', '/trampos', 'publicacao'],
      ['GET', '/trampos/meus', 'leitura'],
      ['GET', '/trampos/:id', 'leitura'],
      ['POST', '/trampos/:id/candidaturas', 'publicacao'],
      ['GET', '/trampos/:id/candidaturas', 'leitura'],
      ['POST', '/trampos/:id/candidaturas/:cid/aceitar', 'escrita'],
      ['GET', '/candidaturas/minhas', 'leitura'],
      ['POST', '/servicos', 'publicacao'],
      ['GET', '/servicos/meus', 'leitura'],
      ['GET', '/servicos/:id', 'leitura'],
      ['GET', '/busca', 'leitura'],
      ['GET', '/categorias', 'leitura'],
      ['POST', '/conversas', 'escrita'],
      ['GET', '/conversas', 'leitura'],
      ['GET', '/conversas/:id/mensagens', 'leitura'],
      ['POST', '/conversas/:id/mensagens', 'mensagens'],
    ];

  it.each(TODAS_AS_ROTAS)('%s %s → %s', (metodo, url, grupo) => {
    expect(grupoDaRota(metodo, url)).toBe(grupo);
  });

  it('cobre as 24 rotas (22 do MVP e as 2 da L1), sem repetição', () => {
    const chaves = new Set(TODAS_AS_ROTAS.map(([m, u]) => `${m} ${u}`));
    expect(chaves.size).toBe(24);
  });

  it('HEAD é leitura e o método não diferencia maiúsculas', () => {
    expect(grupoDaRota('HEAD', '/trampos/:id')).toBe('leitura');
    expect(grupoDaRota('get', '/busca')).toBe('leitura');
    expect(grupoDaRota('post', '/conversas/:id/mensagens')).toBe('mensagens');
  });

  it('rota ou método que ninguém previu cai em escrita, nunca em leitura', () => {
    expect(grupoDaRota('POST', '/rota/nova')).toBe('escrita');
    expect(grupoDaRota('PATCH', '/perfis/eu')).toBe('escrita');
    expect(grupoDaRota('DELETE', '/trampos/:id')).toBe('escrita');
    expect(grupoDaRota('OPTIONS', '/trampos')).toBe('escrita');
    // O grupo próprio é só do POST: outro método na mesma URL é escrita.
    expect(grupoDaRota('PUT', '/trampos')).toBe('escrita');
  });

  it('S8 — só DELETE /sessoes fica sem grupo; outro método em /sessoes e outro DELETE seguem limitados', () => {
    expect(grupoDaRota('DELETE', '/sessoes')).toBeNull();
    expect(grupoDaRota('delete', '/sessoes')).toBeNull();
    expect(grupoDaRota('PUT', '/sessoes')).toBe('escrita');
    expect(grupoDaRota('DELETE', '/sessoes/:id')).toBe('escrita');
    expect(grupoDaRota('DELETE', '/sessoes/')).toBe('escrita');
  });
});

describe('gruposDaRota (D29, S1 da L1)', () => {
  it('o envio de mensagem soma o teto diário ao grupo mensagens, nessa ordem', () => {
    expect(gruposDaRota('POST', '/conversas/:id/mensagens')).toEqual([
      'mensagens',
      'mensagens_dia',
    ]);
    expect(gruposDaRota('post', '/conversas/:id/mensagens')).toEqual([
      'mensagens',
      'mensagens_dia',
    ]);
  });

  it('o teto diário não vale para ler a conversa, abrir conversa nem outra escrita', () => {
    expect(gruposDaRota('GET', '/conversas/:id/mensagens')).toEqual([
      'leitura',
    ]);
    expect(gruposDaRota('HEAD', '/conversas/:id/mensagens')).toEqual([
      'leitura',
    ]);
    expect(gruposDaRota('PUT', '/conversas/:id/mensagens')).toEqual([
      'escrita',
    ]);
    expect(gruposDaRota('POST', '/conversas')).toEqual(['escrita']);
    expect(gruposDaRota('POST', '/conversas/:id/mensagens/')).toEqual([
      'escrita',
    ]);
  });

  it('as demais rotas têm só o grupo de grupoDaRota, e sair não tem nenhum (S8)', () => {
    expect(gruposDaRota('DELETE', '/sessoes')).toEqual([]);
    expect(gruposDaRota('POST', '/trampos')).toEqual(['publicacao']);
    expect(gruposDaRota('POST', '/contas/eu/exportacao')).toEqual(['senha']);
    expect(gruposDaRota('GET', '/busca')).toEqual(['leitura']);
    expect(gruposDaRota('POST', '/rota/nova')).toEqual(['escrita']);
  });

  it('grupoDaRota nunca devolve o teto diário como grupo principal', () => {
    expect(grupoDaRota('POST', '/conversas/:id/mensagens')).toBe('mensagens');
  });
});

describe('LIMITES_PADRAO_POR_CONTA (D29)', () => {
  it('tem os números da decisão', () => {
    expect(LIMITES_PADRAO_POR_CONTA).toEqual({
      leitura: { max: 600, janelaMs: MINUTO_MS },
      mensagens: { max: 30, janelaMs: MINUTO_MS },
      mensagens_dia: { max: 1000, janelaMs: DIA_MS },
      publicacao: { max: 30, janelaMs: 60 * MINUTO_MS },
      senha: { max: 5, janelaMs: 15 * MINUTO_MS },
      escrita: { max: 60, janelaMs: MINUTO_MS },
    });
  });
});

describe('CA20 — criarLimitePorConta', () => {
  it('Dado 30 mensagens no minuto, quando a conta envia a 31ª, então 429 muitas_requisicoes com retry-after', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const servidor = await montar();
    const enviar = () =>
      pedir(servidor, 'POST', '/conversas/c1/mensagens', TOKEN_A);

    expect(await repetir(30, enviar)).toEqual(Array(30).fill(200));
    const bloqueada = await enviar();

    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.body).toBe('{"erro":"muitas_requisicoes"}');
    expect(bloqueada.headers['retry-after']).toBe('60');
  });

  it('Dado a conta A bloqueada, então a conta B, no mesmo IP, ainda envia (a chave é o contaId)', async () => {
    const servidor = await montar({ limites: limitesCom({ mensagens: 2 }) });
    const enviar = (token: string) =>
      pedir(servidor, 'POST', '/conversas/c1/mensagens', token);

    await repetir(2, () => enviar(TOKEN_A));
    expect((await enviar(TOKEN_A)).statusCode).toBe(429);

    expect(await repetir(2, () => enviar(TOKEN_B))).toEqual([200, 200]);
    expect((await enviar(TOKEN_B)).statusCode).toBe(429);
    expect((await enviar(TOKEN_A)).statusCode).toBe(429);
  });

  it('GET não consome escrita: muitas leituras e as escritas seguem até o limite delas', async () => {
    const servidor = await montar({ limites: limitesCom({ escrita: 2 }) });

    expect(
      await repetir(10, () => pedir(servidor, 'GET', '/perfis/eu', TOKEN_A)),
    ).toEqual(Array(10).fill(200));
    expect(
      await repetir(3, () => pedir(servidor, 'PUT', '/perfis/eu', TOKEN_A)),
    ).toEqual([200, 200, 429]);
    // Escrita esgotada não afeta leitura nem os grupos próprios.
    expect(
      (await pedir(servidor, 'GET', '/perfis/eu', TOKEN_A)).statusCode,
    ).toBe(200);
    expect(
      (await pedir(servidor, 'POST', '/conversas/c1/mensagens', TOKEN_A))
        .statusCode,
    ).toBe(200);
    expect(
      (await pedir(servidor, 'POST', '/trampos', TOKEN_A)).statusCode,
    ).toBe(200);
  });

  it('HEAD conta como leitura, não como escrita', async () => {
    const servidor = await montar({
      limites: limitesCom({ leitura: 2, escrita: 1 }),
    });

    expect(
      await repetir(3, () => pedir(servidor, 'HEAD', '/perfis/eu', TOKEN_A)),
    ).toEqual([200, 200, 429]);
    expect(
      (await pedir(servidor, 'PUT', '/perfis/eu', TOKEN_A)).statusCode,
    ).toBe(200);
  });

  it('o contador é do grupo, não da rota: trampo, serviço e candidatura somam em publicacao', async () => {
    const servidor = await montar({ limites: limitesCom({ publicacao: 3 }) });

    expect(
      (await pedir(servidor, 'POST', '/trampos', TOKEN_A)).statusCode,
    ).toBe(200);
    expect(
      (await pedir(servidor, 'POST', '/servicos', TOKEN_A)).statusCode,
    ).toBe(200);
    expect(
      (await pedir(servidor, 'POST', '/trampos/t1/candidaturas', TOKEN_A))
        .statusCode,
    ).toBe(200);
    expect(
      (await pedir(servidor, 'POST', '/trampos', TOKEN_A)).statusCode,
    ).toBe(429);
  });

  it('sem contaId (rota pública), não limita', async () => {
    const servidor = await montar({ limites: limitesCom({ escrita: 1 }) });

    const respostas = await Promise.all(
      Array.from({ length: 5 }, () => pedir(servidor, 'POST', '/contas')),
    );

    for (const resposta of respostas) {
      expect(resposta.statusCode).toBe(200);
      expect(resposta.headers).not.toHaveProperty('retry-after');
    }
  });

  it('sem token na rota protegida, a resposta é 401 e não gasta o limite da conta', async () => {
    const servidor = await montar({ limites: limitesCom({ escrita: 1 }) });

    expect(
      await repetir(3, () => pedir(servidor, 'PUT', '/perfis/eu')),
    ).toEqual([401, 401, 401]);
    expect(
      (await pedir(servidor, 'PUT', '/perfis/eu', TOKEN_A)).statusCode,
    ).toBe(200);
  });

  it.each([
    ['leitura', 'GET', '/perfis/eu', 600, '60'],
    ['mensagens', 'POST', '/conversas/c1/mensagens', 30, '60'],
    ['publicacao', 'POST', '/trampos/t1/candidaturas', 30, '3600'],
    ['senha', 'POST', '/contas/eu/exportacao', 5, '900'],
    ['escrita', 'PUT', '/perfis/eu', 60, '60'],
  ] as const)(
    'com o padrão, %s aceita %s %s até %i e recusa a seguinte com retry-after %s',
    async (_grupo, metodo, url, max, retryAfter) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const servidor = await montar();
      const fazer = () => pedir(servidor, metodo, url, TOKEN_A);

      const status = await repetir(max, fazer);
      expect(status.every((s) => s === 200)).toBe(true);
      const bloqueada = await fazer();

      expect(bloqueada.statusCode).toBe(429);
      expect(bloqueada.json()).toEqual({ erro: 'muitas_requisicoes' });
      expect(bloqueada.headers['retry-after']).toBe(retryAfter);
    },
  );

  it('S8 — Dado todos os grupos esgotados, quando a conta sai (DELETE /sessoes), então nunca recebe 429 nem retry-after', async () => {
    const servidor = await montar({
      limites: limitesCom({
        leitura: 1,
        mensagens: 1,
        publicacao: 1,
        senha: 1,
        escrita: 1,
      }),
    });
    for (const [metodo, url] of [
      ['GET', '/perfis/eu'],
      ['POST', '/conversas/c1/mensagens'],
      ['POST', '/trampos'],
      ['POST', '/contas/eu/exclusao'],
      ['PUT', '/perfis/eu'],
    ] as const) {
      expect(
        await repetir(2, () => pedir(servidor, metodo, url, TOKEN_A)),
        url,
      ).toEqual([200, 429]);
    }

    const saidas = await repetir(100, () =>
      pedir(servidor, 'DELETE', '/sessoes', TOKEN_A),
    );

    expect(saidas).toEqual(Array(100).fill(200));
    const ultima = await pedir(servidor, 'DELETE', '/sessoes', TOKEN_A);
    expect(ultima.headers).not.toHaveProperty('retry-after');
    expect(ultima.headers).not.toHaveProperty('x-ratelimit-limit');
  });

  it('S8 — sair não gasta o contador de escrita da conta', async () => {
    const servidor = await montar({ limites: limitesCom({ escrita: 1 }) });

    await repetir(5, () => pedir(servidor, 'DELETE', '/sessoes', TOKEN_A));

    expect(
      await repetir(2, () => pedir(servidor, 'PUT', '/perfis/eu', TOKEN_A)),
    ).toEqual([200, 429]);
  });

  it('senha: a 6ª tentativa em 15 minutos dá 429, e passada a janela volta a passar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const servidor = await montar();
    const excluir = () =>
      pedir(servidor, 'POST', '/contas/eu/exclusao', TOKEN_A);

    await repetir(5, excluir);
    vi.advanceTimersByTime(14 * MINUTO_MS);
    const bloqueada = await excluir();
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.headers['retry-after']).toBe('60');

    vi.advanceTimersByTime(MINUTO_MS);
    expect((await excluir()).statusCode).toBe(200);
  });

  it('exclusão e exportação dividem o mesmo contador do grupo senha', async () => {
    const servidor = await montar();

    await repetir(3, () =>
      pedir(servidor, 'POST', '/contas/eu/exclusao', TOKEN_A),
    );
    await repetir(2, () =>
      pedir(servidor, 'POST', '/contas/eu/exportacao', TOKEN_A),
    );

    expect(
      (await pedir(servidor, 'POST', '/contas/eu/exportacao', TOKEN_A))
        .statusCode,
    ).toBe(429);
  });

  it('Dado 40 mensagens simultâneas da mesma conta, então nunca passam mais de 30', async () => {
    const servidor = await montar();

    const respostas = await Promise.all(
      Array.from({ length: 40 }, () =>
        pedir(servidor, 'POST', '/conversas/c1/mensagens', TOKEN_A),
      ),
    );
    const status = respostas.map((r) => r.statusCode);

    // O `LocalStore` do plugin devolve o próprio objeto do contador e o
    // `createRateLimit` só o lê depois de um `await`: pedidos no mesmo tick
    // veem o total final e todos são recusados. Erra para o lado seguro
    // (recusa a mais, nunca deixa passar a mais); o que se garante é o teto.
    expect(status.filter((s) => s === 200).length).toBeLessThanOrEqual(30);
    expect(status.every((s) => s === 200 || s === 429)).toBe(true);
    expect(
      (await pedir(servidor, 'POST', '/conversas/c1/mensagens', TOKEN_A))
        .statusCode,
    ).toBe(429);
  });

  it('o 429 é registrado no log sem o contaId nem a chave do contador', async () => {
    const linhas: string[] = [];
    const servidor = await montar({
      limites: limitesCom({ escrita: 1 }),
      logger: criarLogger({
        nivel: 'trace',
        destino: { write: (linha) => void linhas.push(linha) },
      }),
    });

    await pedir(servidor, 'PUT', '/perfis/eu', TOKEN_A);
    const bloqueada = await pedir(servidor, 'PUT', '/perfis/eu', TOKEN_A);

    expect(bloqueada.statusCode).toBe(429);
    const log = linhas.join('');
    expect(log).toContain('muitas_requisicoes');
    expect(log).not.toContain(CONTA_A);
    expect(log).not.toContain('conta:escrita');
  });

  it('guarda o contador de mais de 5000 contas por grupo (o padrão do LRU do plugin)', async () => {
    // Sessão de mentira: o token é o próprio contaId, só neste teste.
    const servidor = await montar({
      limites: limitesCom({ escrita: 1 }),
      validarSessao: async (token) => token,
    });
    const editar = (conta: string) =>
      pedir(servidor, 'PUT', '/perfis/eu', conta);

    expect((await editar('conta0')).statusCode).toBe(200);
    for (let i = 1; i <= 5001; i++) {
      await editar(`conta${i}`);
    }

    // Com o LRU de 5000, a conta0 teria sido esquecida e passaria de novo.
    expect((await editar('conta0')).statusCode).toBe(429);
  }, 30_000);

  it('recusa na criação limite que não é inteiro positivo, em vez de cair no padrão do plugin', async () => {
    const servidor = criarServidor({ logger: false });
    app = servidor;
    await servidor.register(rateLimit, { global: false });

    for (const invalido of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        criarLimitePorConta(servidor, {
          ...LIMITES_PADRAO_POR_CONTA,
          senha: { max: invalido, janelaMs: MINUTO_MS },
        }),
      ).toThrow('max do grupo senha');
      expect(() =>
        criarLimitePorConta(servidor, {
          ...LIMITES_PADRAO_POR_CONTA,
          leitura: { max: 1, janelaMs: invalido },
        }),
      ).toThrow('janelaMs do grupo leitura');
      expect(() =>
        criarLimitePorConta(servidor, {
          ...LIMITES_PADRAO_POR_CONTA,
          mensagens_dia: { max: invalido, janelaMs: DIA_MS },
        }),
      ).toThrow('max do grupo mensagens_dia');
      expect(() =>
        criarLimitePorConta(servidor, {
          ...LIMITES_PADRAO_POR_CONTA,
          mensagens_dia: { max: 1000, janelaMs: invalido },
        }),
      ).toThrow('janelaMs do grupo mensagens_dia');
    }
    const { escrita: _, ...semEscrita } = LIMITES_PADRAO_POR_CONTA;
    expect(() =>
      criarLimitePorConta(servidor, semEscrita as LimitesPorConta),
    ).toThrow('falta o grupo escrita');
    const { mensagens_dia: __, ...semTetoDiario } = LIMITES_PADRAO_POR_CONTA;
    expect(() =>
      criarLimitePorConta(servidor, semTetoDiario as LimitesPorConta),
    ).toThrow('falta o grupo mensagens_dia');
  });

  it('recusa na criação se o @fastify/rate-limit não foi registrado', () => {
    const servidor = criarServidor({ logger: false });
    app = servidor;

    expect(() =>
      criarLimitePorConta(servidor, LIMITES_PADRAO_POR_CONTA),
    ).toThrow('registre o @fastify/rate-limit');
  });
});

describe('S1 (L1) — teto diário de mensagens por conta (D29)', () => {
  /** Padrão, com o teto diário trocado (a janela continua de 24 h). */
  function comTetoDiario(max: number): LimitesPorConta {
    return {
      ...LIMITES_PADRAO_POR_CONTA,
      mensagens_dia: { max, janelaMs: DIA_MS },
    };
  }

  it('Dado 1000 mensagens espaçadas (nunca 30 no minuto), quando a conta envia a 1001ª, então 429 com retry-after até fechar 24 h; a outra conta segue e, passadas as 24 h, volta a enviar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'));
    const servidor = await montar();
    const enviar = (token: string) =>
      pedir(servidor, 'POST', '/conversas/c1/mensagens', token);

    // 20 por minuto: o limite de 30/min nunca é atingido.
    const status: number[] = [];
    for (let i = 0; i < 1000; i++) {
      status.push((await enviar(TOKEN_A)).statusCode);
      vi.advanceTimersByTime(3000);
    }
    expect(status).toEqual(Array(1000).fill(200));

    // 1000 x 3 s depois da 1ª: faltam 86 400 - 3 000 = 83 400 s.
    const bloqueada = await enviar(TOKEN_A);
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.body).toBe('{"erro":"muitas_requisicoes"}');
    expect(bloqueada.headers['retry-after']).toBe('83400');
    expect((await enviar(TOKEN_B)).statusCode).toBe(200);

    // Um milissegundo antes de fechar as 24 h da 1ª mensagem, ainda recusa.
    vi.setSystemTime(new Date('2026-03-02T11:59:59.999Z'));
    const noLimiar = await enviar(TOKEN_A);
    expect(noLimiar.statusCode).toBe(429);
    expect(noLimiar.headers['retry-after']).toBe('1');

    vi.setSystemTime(new Date('2026-03-02T12:00:00.000Z'));
    expect((await enviar(TOKEN_A)).statusCode).toBe(200);
  }, 30_000);

  it('Dado o teto diário esgotado, então ler e abrir conversa, publicar e editar o perfil seguem livres', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const servidor = await montar({ limites: comTetoDiario(2) });
    const enviar = () =>
      pedir(servidor, 'POST', '/conversas/c1/mensagens', TOKEN_A);

    expect(await repetir(3, enviar)).toEqual([200, 200, 429]);
    // Retry-after da janela de 24 h, não da de 1 minuto.
    expect((await enviar()).headers['retry-after']).toBe('86400');

    for (const [metodo, url] of [
      ['GET', '/conversas/:id/mensagens'],
      ['POST', '/conversas'],
      ['POST', '/trampos'],
      ['PUT', '/perfis/eu'],
      ['GET', '/perfis/eu'],
    ] as const) {
      expect(
        await repetir(3, () => pedir(servidor, metodo, url, TOKEN_A)),
        `${metodo} ${url}`,
      ).toEqual([200, 200, 200]);
    }
  });

  it('a mensagem recusada pelo limite por minuto não gasta o teto diário; a recusada pelo teto diário gasta o do minuto', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'));
    const servidor = await montar({
      limites: {
        ...comTetoDiario(3),
        mensagens: { max: 2, janelaMs: MINUTO_MS },
      },
    });
    const enviar = () =>
      pedir(servidor, 'POST', '/conversas/c1/mensagens', TOKEN_A);

    // 2 passam; as 5 seguintes param no limite por minuto.
    expect(await repetir(7, enviar)).toEqual([
      200, 200, 429, 429, 429, 429, 429,
    ]);
    vi.advanceTimersByTime(MINUTO_MS);

    // O teto diário viu só 2: a 3ª do dia passa e a 4ª para nele.
    expect((await enviar()).statusCode).toBe(200);
    const doDia = await enviar();
    expect(doDia.statusCode).toBe(429);
    expect(doDia.headers['retry-after']).toBe(String(DIA_MS / 1000 - 60));
    // Essa 4ª gastou o 2º pedido do minuto: a seguinte para no minuto.
    const doMinuto = await enviar();
    expect(doMinuto.statusCode).toBe(429);
    expect(doMinuto.headers['retry-after']).toBe('60');
  });

  it('os dois contadores são por conta: o teto diário da conta A não afeta a conta B, no mesmo IP', async () => {
    const servidor = await montar({ limites: comTetoDiario(2) });
    const enviar = (token: string) =>
      pedir(servidor, 'POST', '/conversas/c1/mensagens', token);

    expect(await repetir(3, () => enviar(TOKEN_A))).toEqual([200, 200, 429]);
    expect(await repetir(3, () => enviar(TOKEN_B))).toEqual([200, 200, 429]);
  });

  it('sem token, a mensagem dá 401 e não gasta nenhum dos dois contadores', async () => {
    const servidor = await montar({
      limites: {
        ...comTetoDiario(1),
        mensagens: { max: 1, janelaMs: MINUTO_MS },
      },
    });

    expect(
      await repetir(5, () =>
        pedir(servidor, 'POST', '/conversas/c1/mensagens'),
      ),
    ).toEqual([401, 401, 401, 401, 401]);
    expect(
      await repetir(2, () =>
        pedir(servidor, 'POST', '/conversas/c1/mensagens', TOKEN_A),
      ),
    ).toEqual([200, 429]);
  });
});
