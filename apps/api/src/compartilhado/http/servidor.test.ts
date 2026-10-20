import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { criarServidor, OPCOES_DO_AJV } from './servidor.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Servidor com uma rota que devolve o que o handler recebeu após o schema. */
function servidorQueEcoa(): FastifyInstance {
  app = criarServidor({ logger: false });
  app.post(
    '/eco',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            titulo: { type: 'string' },
            valorCentavos: { type: 'integer' },
            habilidades: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (requisicao) => ({ recebido: requisicao.body }),
  );
  app.get(
    '/eco',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { texto: { type: 'string' }, limite: { type: 'string' } },
        },
      },
    },
    async (requisicao) => ({ recebido: requisicao.query }),
  );
  return app;
}

async function enviar(corpo: unknown) {
  const resposta = await servidorQueEcoa().inject({
    method: 'POST',
    url: '/eco',
    payload: corpo as Record<string, unknown>,
  });
  return { status: resposta.statusCode, corpo: resposta.json() };
}

describe('criarServidor — validação dos schemas (Ajv)', () => {
  it('não converte tipos e mantém allErrors desligado', () => {
    expect(OPCOES_DO_AJV).toEqual({
      coerceTypes: false,
      removeAdditional: true,
      allErrors: false,
    });
  });

  it.each([
    ['número', 123],
    ['booleano', true],
    ['null', null],
    ['lista', ['um título']],
    ['objeto', { a: 1 }],
  ])(
    'Dado %s num campo string, então responde 400 sem converter',
    async (_nome, valor) => {
      expect(await enviar({ titulo: valor })).toEqual({
        status: 400,
        corpo: {
          erro: 'dados_invalidos',
          campos: [{ campo: 'titulo', motivo: 'invalido' }],
        },
      });
    },
  );

  it('Dado texto numérico num campo inteiro, então responde 400 sem converter', async () => {
    expect(await enviar({ valorCentavos: '1500' })).toEqual({
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'valorCentavos', motivo: 'invalido' }],
      },
    });
  });

  it('Dado um texto solto num campo lista, então responde 400 sem embrulhar em lista', async () => {
    expect(await enviar({ habilidades: 'solda' })).toEqual({
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'habilidades', motivo: 'invalido' }],
      },
    });
  });

  it('Dado tipos certos, então o handler recebe os valores como vieram', async () => {
    expect(
      await enviar({
        titulo: 'Pintar muro',
        valorCentavos: 1500,
        habilidades: ['pintura'],
      }),
    ).toEqual({
      status: 200,
      corpo: {
        recebido: {
          titulo: 'Pintar muro',
          valorCentavos: 1500,
          habilidades: ['pintura'],
        },
      },
    });
  });

  it('Dado chave fora do schema com additionalProperties false, então ela é descartada antes do handler', async () => {
    expect(
      await enviar({ titulo: 'Pintar muro', autor: 'outra', status: 'x' }),
    ).toEqual({ status: 200, corpo: { recebido: { titulo: 'Pintar muro' } } });
  });

  it('Dado a querystring, então os valores chegam como texto (ex.: limite=5)', async () => {
    const resposta = await servidorQueEcoa().inject({
      method: 'GET',
      url: '/eco?texto=pintor&limite=5',
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      recebido: { texto: 'pintor', limite: '5' },
    });
  });

  it('Dado um parâmetro repetido na querystring de um campo string, então responde 400', async () => {
    const resposta = await servidorQueEcoa().inject({
      method: 'GET',
      url: '/eco?texto=a&texto=b',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'texto', motivo: 'invalido' }],
    });
  });
});

describe('criarServidor — trustProxy (S1)', () => {
  async function ipVisto(
    trustProxy: string | boolean | undefined,
    remoteAddress: string,
  ): Promise<string> {
    app = criarServidor({
      logger: false,
      ...(trustProxy !== undefined ? { trustProxy } : {}),
    });
    app.get('/ip', async (requisicao) => ({ ip: requisicao.ip }));
    const resposta = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress,
      headers: { 'x-forwarded-for': '198.51.100.7' },
    });
    await app.close();
    app = undefined;
    return resposta.json().ip;
  }

  it('desligado por padrão: ignora X-Forwarded-For e usa o IP da conexão', async () => {
    expect(await ipVisto(undefined, '203.0.113.10')).toBe('203.0.113.10');
    expect(await ipVisto(false, '203.0.113.10')).toBe('203.0.113.10');
  });

  it('com a lista de proxies, só confia no X-Forwarded-For vindo deles', async () => {
    const proxies = '10.0.0.1,10.0.1.0/24';
    expect(await ipVisto(proxies, '10.0.1.5')).toBe('198.51.100.7');
    expect(await ipVisto(proxies, '203.0.113.10')).toBe('203.0.113.10');
  });

  it('com true, confia em qualquer origem', async () => {
    expect(await ipVisto(true, '203.0.113.10')).toBe('198.51.100.7');
  });
});
