import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ErroDeDominio,
  ErroDeRegra,
  ErroDeValidacao,
  ErroIndisponivel,
  ErroLimiteExcedido,
  ErroNaoEncontrado,
  ErroProibido,
} from '../dominio/erros.js';
import { respostaDeValidacaoDoSchema, respostaParaErro } from './erros.js';
import { criarLogger } from './logger.js';
import { criarServidor } from './servidor.js';

const EMAIL = 'maria.silva@exemplo.com';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Servidor sem log com uma rota que lança o erro dado. */
function servidorQueLanca(erro: unknown): FastifyInstance {
  app = criarServidor({ logger: false });
  app.get('/falha', async () => {
    throw erro;
  });
  return app;
}

async function respostaDe(erro: unknown) {
  const resposta = await servidorQueLanca(erro).inject({
    method: 'GET',
    url: '/falha',
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.json(),
    texto: resposta.body,
    tipo: resposta.headers['content-type'],
    tentarDeNovo: resposta.headers['retry-after'],
  };
}

const esquemaDeTrampo = {
  body: {
    type: 'object',
    required: ['titulo', 'valorCentavos'],
    properties: {
      titulo: { type: 'string', minLength: 5, maxLength: 80 },
      email: { type: 'string', pattern: '^[^@]+@[^@]+$' },
      valorCentavos: { type: 'integer', minimum: 1 },
      categoria: { type: 'string', enum: ['reformas', 'design'] },
      habilidades: {
        type: 'array',
        maxItems: 2,
        items: { type: 'string', minLength: 2 },
      },
      endereco: {
        type: 'object',
        required: ['cidade'],
        properties: { cidade: { type: 'string' } },
      },
    },
  },
} as const;

function servidorComEsquema(): FastifyInstance {
  app = criarServidor({ logger: false });
  app.post('/trampos', { schema: esquemaDeTrampo }, async () => ({ ok: true }));
  app.get(
    '/busca',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { texto: { type: 'string', maxLength: 5 } },
        },
      },
    },
    async () => ({ itens: [] }),
  );
  return app;
}

describe('tratador de erros: domínio → HTTP', () => {
  it('CA5 — ErroDeValidacao vira 400 dados_invalidos com a lista de campos', async () => {
    const r = await respostaDe(
      new ErroDeValidacao([
        { campo: 'titulo', motivo: 'tamanho' },
        { campo: 'cidade', motivo: 'obrigatorio' },
      ]),
    );

    expect(r.status).toBe(400);
    expect(r.corpo).toEqual({
      erro: 'dados_invalidos',
      campos: [
        { campo: 'titulo', motivo: 'tamanho' },
        { campo: 'cidade', motivo: 'obrigatorio' },
      ],
    });
    expect(r.tipo).toMatch(/^application\/json/);
  });

  it('D9 — ErroDeRegra vira 409 com o código (ex.: perfil_incompleto)', async () => {
    const r = await respostaDe(new ErroDeRegra('perfil_incompleto'));

    expect(r.status).toBe(409);
    expect(r.corpo).toEqual({ erro: 'perfil_incompleto' });
  });

  it('ErroProibido vira 403 com o código', async () => {
    const r = await respostaDe(new ErroProibido('sem_vinculo'));

    expect(r.status).toBe(403);
    expect(r.corpo).toEqual({ erro: 'sem_vinculo' });
  });

  it('ErroNaoEncontrado vira 404 nao_encontrado', async () => {
    const r = await respostaDe(new ErroNaoEncontrado());

    expect(r.status).toBe(404);
    expect(r.corpo).toEqual({ erro: 'nao_encontrado' });
  });

  it('subclasse desconhecida de ErroDeDominio vira 500 interno, sem o código dela', async () => {
    class ErroEstranho extends ErroDeDominio {
      readonly codigo = `vazou ${EMAIL}`;
    }

    const r = await respostaDe(new ErroEstranho());

    expect(r.status).toBe(500);
    expect(r.corpo).toEqual({ erro: 'interno' });
  });
});

describe('CA15 — erro desconhecido responde 500 sem detalhes', () => {
  it('Error comum vira 500 {"erro":"interno"} sem mensagem nem pilha', async () => {
    const r = await respostaDe(new Error(`falha ao gravar ${EMAIL}`));

    expect(r.status).toBe(500);
    expect(r.corpo).toEqual({ erro: 'interno' });
    expect(r.texto).not.toContain('maria');
  });

  it('erro com statusCode 5xx também vira interno', async () => {
    const r = await respostaDe(
      Object.assign(new Error('banco caiu'), { statusCode: 503 }),
    );

    expect(r.status).toBe(500);
    expect(r.corpo).toEqual({ erro: 'interno' });
    expect(r.tentarDeNovo).toBeUndefined();
  });

  it('valor lançado que não é Error vira 500 interno', async () => {
    const r = await respostaDe({ email: EMAIL });

    expect(r.status).toBe(500);
    expect(r.corpo).toEqual({ erro: 'interno' });
  });
});

describe('erros 4xx do Fastify e de plugins', () => {
  it('rota inexistente responde 404 {"erro":"nao_encontrado"} sem ecoar o caminho', async () => {
    app = criarServidor({ logger: false });

    const resposta = await app.inject({
      method: 'GET',
      url: `/nao-existe/${EMAIL}`,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: 'nao_encontrado' });
  });

  it('JSON malformado responde 400 requisicao_invalida sem trecho do corpo', async () => {
    const resposta = await servidorComEsquema().inject({
      method: 'POST',
      url: '/trampos',
      headers: { 'content-type': 'application/json' },
      payload: `{"email":"${EMAIL}"`,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({ erro: 'requisicao_invalida' });
  });

  it('tipo de conteúdo não suportado responde 415 tipo_nao_suportado', async () => {
    const resposta = await servidorComEsquema().inject({
      method: 'POST',
      url: '/trampos',
      headers: { 'content-type': 'application/xml' },
      payload: '<x/>',
    });

    expect(resposta.statusCode).toBe(415);
    expect(resposta.json()).toEqual({ erro: 'tipo_nao_suportado' });
  });

  it('erro 429 de plugin (rate limit) responde muitas_requisicoes', async () => {
    const r = await respostaDe(
      Object.assign(new Error('Rate limit exceeded, retry in 1 minute'), {
        statusCode: 429,
      }),
    );

    expect(r.status).toBe(429);
    expect(r.corpo).toEqual({ erro: 'muitas_requisicoes' });
  });

  it('4xx sem código conhecido responde requisicao_invalida', () => {
    expect(
      respostaParaErro(Object.assign(new Error('x'), { statusCode: 418 })),
    ).toEqual({ status: 418, corpo: { erro: 'requisicao_invalida' } });
  });
});

describe('CA5 — erro de JSON schema no formato da API', () => {
  it('campo obrigatório ausente vira motivo obrigatorio', async () => {
    const resposta = await servidorComEsquema().inject({
      method: 'POST',
      url: '/trampos',
      payload: { valorCentavos: 100 },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'titulo', motivo: 'obrigatorio' }],
    });
  });

  it('título curto vira motivo tamanho', async () => {
    const resposta = await servidorComEsquema().inject({
      method: 'POST',
      url: '/trampos',
      payload: { titulo: 'abc', valorCentavos: 100 },
    });

    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'titulo', motivo: 'tamanho' }],
    });
  });

  it('valor abaixo do mínimo vira motivo tamanho', async () => {
    const resposta = await servidorComEsquema().inject({
      method: 'POST',
      url: '/trampos',
      payload: { titulo: 'Pintar muro', valorCentavos: 0 },
    });

    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'valorCentavos', motivo: 'tamanho' }],
    });
  });

  it('CA15 — formato inválido vira motivo invalido, sem copiar a mensagem do Ajv nem o valor', async () => {
    const resposta = await servidorComEsquema().inject({
      method: 'POST',
      url: '/trampos',
      payload: {
        titulo: 'Pintar muro',
        valorCentavos: 100,
        email: `${EMAIL}@duplo`,
      },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'email', motivo: 'invalido' }],
    });
    expect(resposta.body).not.toContain('maria');
    expect(resposta.body).not.toContain('pattern');
  });

  it('caminho aninhado e índice de lista viram nome com ponto', async () => {
    const servidor = servidorComEsquema();
    const semCidade = await servidor.inject({
      method: 'POST',
      url: '/trampos',
      payload: { titulo: 'Pintar muro', valorCentavos: 100, endereco: {} },
    });
    const habilidadeCurta = await servidor.inject({
      method: 'POST',
      url: '/trampos',
      payload: {
        titulo: 'Pintar muro',
        valorCentavos: 100,
        habilidades: ['ok', 'x'],
      },
    });

    expect(semCidade.json().campos).toEqual([
      { campo: 'endereco.cidade', motivo: 'obrigatorio' },
    ]);
    expect(habilidadeCurta.json().campos).toEqual([
      { campo: 'habilidades.1', motivo: 'tamanho' },
    ]);
  });

  it('erro na query string usa o nome do parâmetro', async () => {
    const resposta = await servidorComEsquema().inject({
      method: 'GET',
      url: '/busca?texto=muito-longo',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'texto', motivo: 'tamanho' }],
    });
  });

  it('corpo que não é objeto usa a parte da requisição como campo', async () => {
    const resposta = await servidorComEsquema().inject({
      method: 'POST',
      url: '/trampos',
      headers: { 'content-type': 'application/json' },
      payload: '"texto solto"',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'body', motivo: 'invalido' }],
    });
  });

  it('mapeia cada palavra-chave do Ajv, junta repetidos e descarta campo fora do formato', () => {
    const erro = (
      keyword: string,
      instancePath: string,
      params: Record<string, unknown> = {},
    ) => ({ keyword, instancePath, schemaPath: '#', params, message: EMAIL });

    expect(
      respostaDeValidacaoDoSchema(
        [
          erro('required', '', { missingProperty: 'nome' }),
          erro('maxLength', '/descricao'),
          erro('maxLength', '/descricao'),
          erro('minItems', '/habilidades'),
          erro('maximum', '/valorCentavos'),
          erro('enum', '/categoria'),
          erro('type', '/prazo'),
          // Chave escolhida pelo cliente: não vira nome de campo.
          erro('type', `/${EMAIL}`),
        ],
        'body',
      ),
    ).toEqual({
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [
          { campo: 'nome', motivo: 'obrigatorio' },
          { campo: 'descricao', motivo: 'tamanho' },
          { campo: 'habilidades', motivo: 'tamanho' },
          { campo: 'valorCentavos', motivo: 'tamanho' },
          { campo: 'categoria', motivo: 'invalido' },
          { campo: 'prazo', motivo: 'invalido' },
        ],
      },
    });
  });

  it('sem nenhum campo aproveitável, responde só dados_invalidos', () => {
    expect(
      respostaDeValidacaoDoSchema([
        {
          keyword: 'type',
          instancePath: `/${EMAIL}`,
          schemaPath: '#',
          params: {},
        },
      ]),
    ).toEqual({ status: 400, corpo: { erro: 'dados_invalidos' } });
  });
});

describe('ErroNaoEncontrado e ErroProibido', () => {
  it('são erros de domínio com código padrão', () => {
    const naoEncontrado = new ErroNaoEncontrado();
    const proibido = new ErroProibido();

    expect(naoEncontrado).toBeInstanceOf(ErroDeDominio);
    expect(naoEncontrado.name).toBe('ErroNaoEncontrado');
    expect(naoEncontrado.codigo).toBe('nao_encontrado');
    expect(proibido).toBeInstanceOf(ErroDeDominio);
    expect(proibido.name).toBe('ErroProibido');
    expect(proibido.codigo).toBe('proibido');
  });

  it('CA15 — recusam código que não é snake_case, sem ecoar o texto', () => {
    for (const Classe of [ErroNaoEncontrado, ErroProibido]) {
      try {
        new Classe(`sem_vinculo: ${EMAIL}`);
        expect.unreachable();
      } catch (erro) {
        expect(erro).toBeInstanceOf(TypeError);
        expect(String(erro)).not.toContain('maria');
      }
    }
  });
});

describe('CA45 — ErroIndisponivel vira 503 com retry-after', () => {
  it('responde 503 só com o código e o cabeçalho retry-after', async () => {
    const r = await respostaDe(new ErroIndisponivel('servico_ocupado', 10));

    expect(r.status).toBe(503);
    expect(r.texto).toBe('{"erro":"servico_ocupado"}');
    expect(r.tentarDeNovo).toBe('10');
    expect(r.tipo).toMatch(/^application\/json/);
  });

  it('o retry-after é o tempo que o erro traz', async () => {
    const r = await respostaDe(new ErroIndisponivel('servico_ocupado', 30));

    expect(r.tentarDeNovo).toBe('30');
  });

  it('respostaParaErro devolve o tempo junto do 503', () => {
    expect(
      respostaParaErro(new ErroIndisponivel('servico_ocupado', 10)),
    ).toStrictEqual({
      status: 503,
      corpo: { erro: 'servico_ocupado' },
      tentarDeNovoEmS: 10,
    });
  });

  it('os demais erros não levam retry-after', async () => {
    for (const erro of [
      new ErroDeRegra('perfil_incompleto'),
      new ErroNaoEncontrado(),
      new Error('falhou'),
    ]) {
      const r = await respostaDe(erro);
      await app?.close();
      app = undefined;

      expect(r.tentarDeNovo).toBeUndefined();
      expect(respostaParaErro(erro)).not.toHaveProperty('tentarDeNovoEmS');
    }
  });

  it('o 503 vai para o log como warn, sem cair no "erro interno"', async () => {
    const linhas: string[] = [];
    app = criarServidor({
      logger: criarLogger({
        nivel: 'trace',
        destino: { write: (linha) => void linhas.push(linha) },
      }),
    });
    app.get('/ocupado', async () => {
      throw new ErroIndisponivel('servico_ocupado', 10);
    });

    const resposta = await app.inject({ method: 'GET', url: '/ocupado' });

    expect(resposta.statusCode).toBe(503);
    const registros = linhas.map(
      (linha) => JSON.parse(linha) as Record<string, unknown>,
    );
    const ocupado = registros.filter((r) => r.msg === 'serviço ocupado');
    expect(ocupado).toHaveLength(1);
    expect(ocupado[0]).toMatchObject({ level: 40, erro: 'servico_ocupado' });
    expect(registros.some((r) => (r.level as number) >= 50)).toBe(false);
    expect(linhas.join('')).not.toContain('erro interno');
  });
});

describe('CA42 (D31) — ErroLimiteExcedido vira 429 com retry-after', () => {
  it('responde 429 com o corpo genérico do rate limit e o retry-after do erro', async () => {
    const r = await respostaDe(new ErroLimiteExcedido(1800));

    expect(r.status).toBe(429);
    expect(r.texto).toBe('{"erro":"muitas_requisicoes"}');
    expect(r.tentarDeNovo).toBe('1800');
    expect(r.tipo).toMatch(/^application\/json/);
  });

  it('respostaParaErro devolve o tempo junto do 429', () => {
    expect(respostaParaErro(new ErroLimiteExcedido(60))).toStrictEqual({
      status: 429,
      corpo: { erro: 'muitas_requisicoes' },
      tentarDeNovoEmS: 60,
    });
  });

  it('vai para o log como recusa (info), sem cair no "erro interno"', async () => {
    const linhas: string[] = [];
    app = criarServidor({
      logger: criarLogger({
        nivel: 'trace',
        destino: { write: (linha) => void linhas.push(linha) },
      }),
    });
    app.get('/teto', async () => {
      throw new ErroLimiteExcedido(60);
    });

    const resposta = await app.inject({ method: 'GET', url: '/teto' });

    expect(resposta.statusCode).toBe(429);
    const registros = linhas.map(
      (linha) => JSON.parse(linha) as Record<string, unknown>,
    );
    const recusas = registros.filter((r) => r.msg === 'requisição recusada');
    expect(recusas).toHaveLength(1);
    expect(recusas[0]).toMatchObject({
      level: 30,
      erro: 'muitas_requisicoes',
    });
    expect(registros.some((r) => (r.level as number) >= 50)).toBe(false);
  });
});
