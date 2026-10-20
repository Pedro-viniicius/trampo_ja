import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exigirAutenticacao,
  extrairToken,
  type ValidarSessao,
} from './autenticacao.js';
import { criarLogger } from './logger.js';
import { criarServidor } from './servidor.js';

const TOKEN_VALIDO = 'tokenValidoDaSessao_0123456789-abc';
const CONTA_ID = '7d3c2f0e-0b4f-4a57-9f7a-2a4c1d9e8b10';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function montar(
  validarSessao: ValidarSessao = async (token) =>
    token === TOKEN_VALIDO ? CONTA_ID : null,
  logger: Parameters<typeof criarServidor>[0]['logger'] = false,
) {
  const validar = vi.fn(validarSessao);
  const handler = vi.fn(async (requisicao: { contaId: string }) => ({
    contaId: requisicao.contaId,
  }));
  app = criarServidor({ logger });
  app.register(async (protegido) => {
    protegido.addHook('onRequest', exigirAutenticacao(validar));
    protegido.get('/privado', handler);
    protegido.post(
      '/privado',
      {
        schema: {
          body: {
            type: 'object',
            required: ['titulo'],
            properties: { titulo: { type: 'string' } },
          },
        },
      },
      handler,
    );
  });
  app.get('/publico', async (requisicao) => ({ contaId: requisicao.contaId }));
  return { app, validar, handler };
}

async function getPrivado(authorization?: string) {
  const montado = montar();
  const resposta = await montado.app.inject({
    method: 'GET',
    url: '/privado',
    headers: authorization === undefined ? {} : { authorization },
  });
  return { ...montado, resposta };
}

function esperar401(resposta: {
  statusCode: number;
  body: string;
  headers: Record<string, unknown>;
}): void {
  expect(resposta.statusCode).toBe(401);
  expect(resposta.body).toBe('{"erro":"nao_autenticado"}');
  expect(resposta.headers['www-authenticate']).toBe('Bearer');
}

describe('CA14 — exigirAutenticacao', () => {
  it('Dado uma requisição sem Authorization, então 401 nao_autenticado e nenhum dado', async () => {
    const { resposta, validar, handler } = await getPrivado();

    esperar401(resposta);
    expect(validar).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ['esquema Basic', `Basic ${TOKEN_VALIDO}`],
    ['Bearer sem token', 'Bearer'],
    ['Bearer com token vazio', 'Bearer '],
    ['token com espaço', `Bearer ${TOKEN_VALIDO} extra`],
    ['dois espaços', `Bearer  ${TOKEN_VALIDO}`],
    ['token sem esquema', TOKEN_VALIDO],
    ['caractere fora do b64token', 'Bearer abc"def'],
    ['token grande demais', `Bearer ${'a'.repeat(257)}`],
  ])(
    'Dado Authorization malformado (%s), então 401 sem consultar a sessão',
    async (_caso, authorization) => {
      const { resposta, validar, handler } = await getPrivado(authorization);

      esperar401(resposta);
      expect(validar).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('Dado um token que a sessão não reconhece, então 401 nao_autenticado', async () => {
    const { resposta, validar, handler } = await getPrivado(
      'Bearer tokenDesconhecido',
    );

    esperar401(resposta);
    expect(validar).toHaveBeenCalledWith('tokenDesconhecido');
    expect(handler).not.toHaveBeenCalled();
  });

  it('Dado que validarSessao devolve texto vazio, então 401', async () => {
    const { app, handler } = montar(async () => '');

    const resposta = await app.inject({
      method: 'GET',
      url: '/privado',
      headers: { authorization: `Bearer ${TOKEN_VALIDO}` },
    });

    esperar401(resposta);
    expect(handler).not.toHaveBeenCalled();
  });

  it('Dado um token válido, então a rota roda com o contaId da sessão', async () => {
    const { resposta, validar } = await getPrivado(`Bearer ${TOKEN_VALIDO}`);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ contaId: CONTA_ID });
    expect(validar).toHaveBeenCalledExactlyOnceWith(TOKEN_VALIDO);
  });

  it('aceita o esquema em minúsculas (RFC 9110)', async () => {
    const { resposta } = await getPrivado(`bearer ${TOKEN_VALIDO}`);

    expect(resposta.statusCode).toBe(200);
  });

  it('recusa com 401 antes de validar o corpo (o hook roda no onRequest)', async () => {
    const { app, handler } = montar();

    const resposta = await app.inject({
      method: 'POST',
      url: '/privado',
      payload: { outro: 'campo' },
    });

    esperar401(resposta);
    expect(handler).not.toHaveBeenCalled();
  });

  it('com token válido, o corpo inválido segue para a validação (400)', async () => {
    const { app } = montar();

    const resposta = await app.inject({
      method: 'POST',
      url: '/privado',
      headers: { authorization: `Bearer ${TOKEN_VALIDO}` },
      payload: { outro: 'campo' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('rota fora do plugin protegido não exige token e tem contaId vazio', async () => {
    const { app, validar } = montar();

    const resposta = await app.inject({ method: 'GET', url: '/publico' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ contaId: '' });
    expect(validar).not.toHaveBeenCalled();
  });

  it('CA15 — se validarSessao falha, responde 500 interno e não loga o token', async () => {
    const linhas: string[] = [];
    const { app, handler } = montar(
      async () => {
        throw new Error('banco fora do ar');
      },
      criarLogger({
        nivel: 'trace',
        destino: { write: (linha) => void linhas.push(linha) },
      }),
    );

    const resposta = await app.inject({
      method: 'GET',
      url: '/privado',
      headers: { authorization: `Bearer ${TOKEN_VALIDO}` },
    });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: 'interno' });
    expect(handler).not.toHaveBeenCalled();
    expect(linhas.join('')).toContain('banco fora do ar');
    expect(linhas.join('')).not.toContain(TOKEN_VALIDO);
  });
});

describe('extrairToken', () => {
  it('devolve o token de um cabeçalho Bearer bem formado', () => {
    expect(extrairToken('Bearer abc.DEF_123-~+/==')).toBe('abc.DEF_123-~+/==');
  });

  it('devolve null para ausente, lista ou fora do formato', () => {
    for (const cabecalho of [undefined, null, ['Bearer a'], 'Bearer', '']) {
      expect(extrairToken(cabecalho)).toBeNull();
    }
  });

  it('aceita até 256 caracteres de token', () => {
    expect(extrairToken(`Bearer ${'a'.repeat(256)}`)).toHaveLength(256);
    expect(extrairToken(`Bearer ${'a'.repeat(257)}`)).toBeNull();
  });
});
