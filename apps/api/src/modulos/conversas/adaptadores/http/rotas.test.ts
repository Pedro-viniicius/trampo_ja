import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarLogger } from '../../../../compartilhado/http/logger.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import { criarCasosDeUsoDeConversas } from '../../aplicacao/casos-de-uso.js';
import type { RepositorioDeConversas } from '../../dominio/portas.js';
import { RepositorioDeConversasEmMemoria } from '../memoria/repositorio-memoria.js';
import { VerificadorDeVinculoEmMemoria } from '../memoria/verificador-vinculo-memoria.js';
import { criarRotasDeConversas } from './rotas.js';

const EMPREGADOR = 'conta-empregador';
const FREELANCER = 'conta-freelancer';
const ESTRANHO = 'conta-estranho';

/** Token → conta, como a fachada de `contas` responderia. */
const SESSOES: Readonly<Record<string, string>> = {
  'token-empregador': EMPREGADOR,
  'token-freelancer': FREELANCER,
  'token-estranho': ESTRANHO,
};

let app: FastifyInstance;
let repositorio: RepositorioDeConversasEmMemoria;
let relogio: RelogioFixo;
let contador: number;
/** Linhas JSON escritas pelo logger (nível trace). */
let linhasDoLog: string[];
const validarSessao = vi.fn(
  async (token: string): Promise<string | null> => SESSOES[token] ?? null,
);

function montar(repositorioUsado?: RepositorioDeConversas): FastifyInstance {
  const casos = criarCasosDeUsoDeConversas({
    repositorio: repositorioUsado ?? repositorio,
    verificadorDeVinculo: new VerificadorDeVinculoEmMemoria([
      [EMPREGADOR, FREELANCER],
    ]),
    relogio,
    gerarId: () => {
      contador += 1;
      return `id-${String(contador).padStart(3, '0')}`;
    },
  });
  const servidor = criarServidor({
    logger: criarLogger({
      nivel: 'trace',
      destino: { write: (linha) => void linhasDoLog.push(linha) },
    }),
  });
  servidor.register(criarRotasDeConversas(casos), { validarSessao });
  return servidor;
}

beforeEach(() => {
  validarSessao.mockClear();
  repositorio = new RepositorioDeConversasEmMemoria();
  relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
  contador = 0;
  linhasDoLog = [];
  app = montar();
});

afterEach(async () => {
  await app.close();
});

function comToken(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function abrir(outroUsuarioId: unknown, token = 'token-empregador') {
  return app.inject({
    method: 'POST',
    url: '/conversas',
    headers: comToken(token),
    payload: { outroUsuarioId } as Record<string, unknown>,
  });
}

async function enviar(
  conversaId: string,
  corpo: unknown,
  token = 'token-empregador',
) {
  const resposta = await app.inject({
    method: 'POST',
    url: `/conversas/${conversaId}/mensagens`,
    headers: comToken(token),
    payload: corpo as Record<string, unknown>,
  });
  relogio.avancar(60_000);
  return resposta;
}

async function listar(conversaId: string, token: string, consulta = '') {
  return app.inject({
    method: 'GET',
    url: `/conversas/${conversaId}/mensagens${consulta}`,
    headers: comToken(token),
  });
}

/** Abre a conversa empregador–freelancer e devolve o id. */
async function conversaAberta(): Promise<string> {
  const resposta = await abrir(FREELANCER);
  expect(resposta.statusCode).toBe(201);
  return resposta.json().conversaId;
}

describe('CA14 — rotas de conversas exigem token', () => {
  const ROTAS = [
    { method: 'POST', url: '/conversas', payload: { outroUsuarioId: 'x' } },
    { method: 'GET', url: '/conversas' },
    { method: 'GET', url: '/conversas/id-001/mensagens' },
    {
      method: 'POST',
      url: '/conversas/id-001/mensagens',
      payload: { texto: 'oi' },
    },
  ] as const;

  it.each(ROTAS)(
    'CA14 — $method $url sem token responde 401 sem dados',
    async (rota) => {
      await conversaAberta();
      await enviar('id-001', { texto: 'mensagem que não pode vazar' });
      const resposta = await app.inject({ ...rota });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
    },
  );

  it.each(ROTAS)(
    'CA14 — $method $url com token desconhecido responde 401 sem dados',
    async (rota) => {
      await conversaAberta();
      const resposta = await app.inject({
        ...rota,
        headers: comToken('token-que-nao-existe'),
      });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
    },
  );

  it('CA14 — POST sem token é recusado antes de validar o corpo e nada é salvo', async () => {
    const conversaId = await conversaAberta();
    const resposta = await app.inject({
      method: 'POST',
      url: `/conversas/${conversaId}/mensagens`,
      payload: { texto: 1, extra: true },
    });

    expect(resposta.statusCode).toBe(401);
    expect(
      await repositorio.listarMensagens(conversaId, { limite: 50 }),
    ).toEqual([]);
  });
});

describe('POST /conversas', () => {
  it('CA12 — com vínculo, a primeira abertura responde 201 e a segunda 200, com o mesmo conversaId', async () => {
    const primeira = await abrir(FREELANCER);
    const segunda = await abrir(EMPREGADOR, 'token-freelancer');

    expect(primeira.statusCode).toBe(201);
    expect(primeira.json()).toEqual({ conversaId: 'id-001' });
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json()).toEqual({ conversaId: 'id-001' });
  });

  it('CA13 — sem vínculo responde 403 sem_vinculo e nenhuma conversa é criada', async () => {
    const resposta = await abrir(EMPREGADOR, 'token-estranho');

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: 'sem_vinculo' });
    expect(await repositorio.listarConversasDoUsuario(ESTRANHO)).toEqual([]);
    expect(await repositorio.listarConversasDoUsuario(EMPREGADOR)).toEqual([]);
  });

  it('consigo mesmo responde 409 conversa_consigo_mesmo', async () => {
    const resposta = await abrir(EMPREGADOR);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toEqual({ erro: 'conversa_consigo_mesmo' });
  });

  it.each([
    ['ausente', {}, 'obrigatorio'],
    ['nulo', { outroUsuarioId: null }, 'obrigatorio'],
    ['vazio', { outroUsuarioId: '' }, 'obrigatorio'],
  ])(
    'outroUsuarioId %s responde 400 apontando o campo',
    async (_caso, corpo, motivo) => {
      const resposta = await app.inject({
        method: 'POST',
        url: '/conversas',
        headers: comToken('token-empregador'),
        payload: corpo,
      });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'outroUsuarioId', motivo }],
      });
    },
  );

  it('chave extra no corpo responde 400 e nada é criado', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/conversas',
      headers: comToken('token-empregador'),
      payload: { outroUsuarioId: FREELANCER, usuarioAId: ESTRANHO },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe('dados_invalidos');
    expect(await repositorio.listarConversasDoUsuario(EMPREGADOR)).toEqual([]);
  });

  it('corpo que não é objeto responde 400', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/conversas',
      headers: {
        ...comToken('token-empregador'),
        'content-type': 'application/json',
      },
      payload: '[1,2]',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe('dados_invalidos');
  });
});

describe('GET /conversas', () => {
  it('CA12 — lista as conversas de quem pede, com o outro usuário e a última mensagem', async () => {
    const conversaId = await conversaAberta();
    await enviar(conversaId, { texto: 'Bom dia!' }, 'token-freelancer');

    const doEmpregador = await app.inject({
      method: 'GET',
      url: '/conversas',
      headers: comToken('token-empregador'),
    });
    expect(doEmpregador.statusCode).toBe(200);
    expect(doEmpregador.json()).toEqual([
      {
        conversaId,
        outroUsuarioId: FREELANCER,
        criadaEm: '2026-10-20T12:00:00.000Z',
        ultimaMensagem: {
          texto: 'Bom dia!',
          enviadaEm: '2026-10-20T12:00:00.000Z',
        },
      },
    ]);

    const doEstranho = await app.inject({
      method: 'GET',
      url: '/conversas',
      headers: comToken('token-estranho'),
    });
    expect(doEstranho.statusCode).toBe(200);
    expect(doEstranho.json()).toEqual([]);
  });

  it('conversa sem mensagens sai com ultimaMensagem null', async () => {
    const conversaId = await conversaAberta();

    const resposta = await app.inject({
      method: 'GET',
      url: '/conversas',
      headers: comToken('token-freelancer'),
    });
    expect(resposta.json()).toEqual([
      {
        conversaId,
        outroUsuarioId: EMPREGADOR,
        criadaEm: '2026-10-20T12:00:00.000Z',
        ultimaMensagem: null,
      },
    ]);
  });
});

describe('mensagens', () => {
  it('CA12 — mensagem não vazia responde 201 {id,enviadaEm} e aparece para os dois em ordem cronológica', async () => {
    const conversaId = await conversaAberta();

    const primeira = await enviar(conversaId, {
      texto: 'Olá! Vi sua proposta.',
    });
    await enviar(
      conversaId,
      { texto: '  Posso começar amanhã.  ' },
      'token-freelancer',
    );
    await enviar(conversaId, { texto: 'Combinado.' });

    expect(primeira.statusCode).toBe(201);
    expect(primeira.json()).toEqual({
      id: 'id-002',
      enviadaEm: '2026-10-20T12:00:00.000Z',
    });
    const esperado = [
      {
        id: 'id-002',
        autorId: EMPREGADOR,
        texto: 'Olá! Vi sua proposta.',
        enviadaEm: '2026-10-20T12:00:00.000Z',
      },
      {
        id: 'id-003',
        autorId: FREELANCER,
        texto: 'Posso começar amanhã.',
        enviadaEm: '2026-10-20T12:01:00.000Z',
      },
      {
        id: 'id-004',
        autorId: EMPREGADOR,
        texto: 'Combinado.',
        enviadaEm: '2026-10-20T12:02:00.000Z',
      },
    ];
    for (const token of ['token-empregador', 'token-freelancer']) {
      const resposta = await listar(conversaId, token);
      expect(resposta.statusCode).toBe(200);
      expect(resposta.json()).toEqual(esperado);
    }
  });

  it('?depoisDe=<id> traz só as mensagens seguintes', async () => {
    const conversaId = await conversaAberta();
    const primeira = (await enviar(conversaId, { texto: 'um' })).json().id;
    await enviar(conversaId, { texto: 'dois' });

    const resposta = await listar(
      conversaId,
      'token-freelancer',
      `?depoisDe=${primeira}`,
    );
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().map((m: { texto: string }) => m.texto)).toEqual([
      'dois',
    ]);
  });

  it('?depoisDe que não é mensagem da conversa responde 400; parâmetro desconhecido também', async () => {
    const conversaId = await conversaAberta();

    const cursorRuim = await listar(
      conversaId,
      'token-freelancer',
      '?depoisDe=nao-existe',
    );
    expect(cursorRuim.statusCode).toBe(400);
    expect(cursorRuim.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'depoisDe', motivo: 'invalido' }],
    });

    const extra = await listar(conversaId, 'token-freelancer', '?limite=500');
    expect(extra.statusCode).toBe(400);
    expect(extra.json().erro).toBe('dados_invalidos');
  });

  it.each([
    ['vazio', { texto: '' }, 'obrigatorio'],
    ['só espaços', { texto: '   \n\t ' }, 'obrigatorio'],
    ['nulo', { texto: null }, 'obrigatorio'],
    ['ausente', {}, 'obrigatorio'],
    ['longo demais', { texto: 'a'.repeat(2001) }, 'tamanho'],
  ])(
    'CA12 — texto %s responde 400 apontando o campo e nada é salvo',
    async (_caso, corpo, motivo) => {
      const conversaId = await conversaAberta();
      const resposta = await enviar(conversaId, corpo);

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'texto', motivo }],
      });
      expect((await listar(conversaId, 'token-empregador')).json()).toEqual([]);
    },
  );

  it('chave extra no corpo da mensagem (ex.: autorId) responde 400 e nada é salvo', async () => {
    const conversaId = await conversaAberta();
    const resposta = await enviar(conversaId, {
      texto: 'oi',
      autorId: FREELANCER,
    });

    expect(resposta.statusCode).toBe(400);
    expect((await listar(conversaId, 'token-empregador')).json()).toEqual([]);
  });

  it('CA12 — um terceiro recebe 404 ao ler e ao escrever, igual a uma conversa inexistente', async () => {
    const conversaId = await conversaAberta();
    await enviar(conversaId, { texto: 'só para nós dois' });

    const respostas = [
      await listar(conversaId, 'token-estranho'),
      await enviar(conversaId, { texto: 'intruso' }, 'token-estranho'),
      await enviar(conversaId, { texto: '' }, 'token-estranho'),
      await listar('nao-existe', 'token-estranho'),
      await enviar('nao-existe', { texto: 'oi' }),
    ];
    for (const resposta of respostas) {
      expect(resposta.statusCode).toBe(404);
      expect(resposta.json()).toEqual({ erro: 'nao_encontrado' });
    }
    expect(
      (await listar(conversaId, 'token-freelancer'))
        .json()
        .map((m: { texto: string }) => m.texto),
    ).toEqual(['só para nós dois']);
  });
});

describe('CA15 — o texto da mensagem nunca vai para o log', () => {
  const SEGREDO = 'segredo-da-mensagem-7f3a';

  function logTodo(): string {
    return linhasDoLog.join('\n');
  }

  it('CA15 — envio aceito, recusado (400, 404, 401) e listagem não registram o texto', async () => {
    const conversaId = await conversaAberta();

    await enviar(conversaId, { texto: `Oi ${SEGREDO}` });
    await enviar(conversaId, { texto: `${SEGREDO}${'a'.repeat(2001)}` });
    await enviar(conversaId, { texto: SEGREDO, extra: SEGREDO });
    await enviar(conversaId, { texto: `${SEGREDO}\u0000` });
    await enviar(conversaId, { texto: SEGREDO }, 'token-estranho');
    await app.inject({
      method: 'POST',
      url: `/conversas/${conversaId}/mensagens`,
      payload: { texto: SEGREDO },
    });
    await listar(conversaId, 'token-freelancer');
    await app.inject({
      method: 'GET',
      url: '/conversas',
      headers: comToken('token-freelancer'),
    });

    // O logger estava ativo: houve requisições e recusas registradas.
    expect(linhasDoLog.length).toBeGreaterThan(10);
    expect(logTodo()).toContain('requisição recusada');
    expect(logTodo()).not.toContain(SEGREDO);
  });

  it('CA15 — falha do banco ao gravar (500) não registra o texto, nem pelo detail do driver', async () => {
    await app.close();
    const falho = new RepositorioDeConversasEmMemoria();
    falho.salvarMensagem = async (mensagem) => {
      // Imita o `DatabaseError` do `pg`, que pode citar o valor no `detail`.
      throw Object.assign(new Error(`falhou: ${mensagem.texto}`), {
        code: '23514',
        severity: 'ERROR',
        detail: `Failing row contains (${mensagem.texto}).`,
      });
    };
    app = montar(falho);

    const aberta = await abrir(FREELANCER);
    const resposta = await enviar(aberta.json().conversaId, {
      texto: `Oi ${SEGREDO}`,
    });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: 'interno' });
    expect(logTodo()).toContain('erro interno não tratado');
    expect(logTodo()).not.toContain(SEGREDO);
  });
});
