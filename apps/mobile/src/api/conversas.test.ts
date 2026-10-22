import { criarFetchFalso, type FetchFalso } from '../testes/fetch-falso';
import { type ClienteHttp, criarCliente } from './cliente';
import {
  abrirConversa,
  enviarMensagem,
  listarConversas,
  listarMensagens,
} from './conversas';
import { ErroDaApi } from './erros';
import type { Mensagem, ResumoDeConversa } from './tipos';

const URL_BASE = 'http://192.168.0.10:3000';
const TOKEN = 'token-da-sessao';

/** Id com caracteres que mudariam o caminho ou a query se fossem crus. */
const ID_ESPECIAL = 'a b/c?d#e';
const ID_ESPECIAL_CODIFICADO = 'a%20b%2Fc%3Fd%23e';
/** Cursor com `&` e `=`, que quebrariam a query se fossem crus. */
const CURSOR_ESPECIAL = 'm1&depoisDe=m9';

/** Sentinela do texto da mensagem: nunca pode aparecer num erro (CA15). */
const TEXTO = 'Sentinela-texto-da-mensagem';
const OUTRO_USUARIO = 'conta-sentinela-2';

interface Montagem {
  readonly cliente: ClienteHttp;
  readonly falso: FetchFalso;
  readonly aoExpirar: jest.Mock;
}

function montar(): Montagem {
  const falso = criarFetchFalso();
  const aoExpirar = jest.fn();
  const cliente = criarCliente({
    fetch: falso.fetch,
    urlBase: URL_BASE,
    obterToken: async () => TOKEN,
    aoExpirar,
  });
  return { cliente, falso, aoExpirar };
}

async function capturar(promessa: Promise<unknown>): Promise<ErroDaApi> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof ErroDaApi) {
      return erro;
    }
    throw erro;
  }
  throw new Error('a promessa deveria ter falhado');
}

/** O erro não pode carregar nada do que a pessoa digitou (CA15). */
function esperarSemDadoDigitado(
  erro: ErroDaApi,
  sentinelas: readonly string[],
): void {
  for (const sentinela of sentinelas) {
    expect(erro.message).not.toContain(sentinela);
    expect(JSON.stringify(erro)).not.toContain(sentinela);
    expect(String(erro)).not.toContain(sentinela);
  }
}

const RESUMO_COM_MENSAGEM: ResumoDeConversa = {
  conversaId: 'cv1',
  outroUsuarioId: OUTRO_USUARIO,
  criadaEm: '2026-10-20T12:00:00.000Z',
  ultimaMensagem: {
    texto: 'Sentinela-ultima-mensagem',
    enviadaEm: '2026-10-21T09:00:00.000Z',
  },
};

const RESUMO_SEM_MENSAGEM: ResumoDeConversa = {
  conversaId: 'cv2',
  outroUsuarioId: 'conta-sentinela-3',
  criadaEm: '2026-10-19T12:00:00.000Z',
  ultimaMensagem: null,
};

const MENSAGENS: readonly Mensagem[] = [
  {
    id: 'm1',
    autorId: 'conta-sentinela-1',
    texto: 'Sentinela-mensagem-1',
    enviadaEm: '2026-10-21T09:00:00.000Z',
  },
  {
    id: 'm2',
    autorId: OUTRO_USUARIO,
    texto: 'Sentinela-mensagem-2',
    enviadaEm: '2026-10-21T09:01:00.000Z',
  },
];

describe('abrirConversa (CA13)', () => {
  it.each([
    [201, 'nova'],
    [200, 'já existente'],
  ])(
    '%s (%s) faz POST /conversas com token, só {outroUsuarioId}, e devolve {conversaId}',
    async (status) => {
      const { cliente, falso } = montar();
      falso.responder('POST /conversas', {
        status,
        corpo: { conversaId: 'cv1' },
      });

      const aberta = await abrirConversa(cliente, OUTRO_USUARIO);

      expect(aberta).toEqual({ conversaId: 'cv1' });
      const requisicao = falso.ultima();
      expect(requisicao.metodo).toBe('POST');
      expect(requisicao.url).toBe(`${URL_BASE}/conversas`);
      expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
      expect(requisicao.cabecalhos['content-type']).toBe('application/json');
      expect(requisicao.corpo).toEqual({ outroUsuarioId: OUTRO_USUARIO });
    },
  );

  it('o id do outro vai no corpo como veio, sem codificação', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /conversas', {
      status: 201,
      corpo: { conversaId: 'cv1' },
    });

    await abrirConversa(cliente, ID_ESPECIAL);

    expect(falso.ultima().corpo).toEqual({ outroUsuarioId: ID_ESPECIAL });
  });

  it.each([
    [403, 'sem_vinculo'],
    [409, 'conversa_consigo_mesmo'],
    [404, 'nao_encontrado'],
  ])('%s %s sobe como ErroDaApi com o código', async (status, codigo) => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /conversas', { status, corpo: { erro: codigo } });

    const erro = await capturar(abrirConversa(cliente, OUTRO_USUARIO));

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro).toMatchObject({ status, codigo, campos: [] });
    expect(aoExpirar).not.toHaveBeenCalled();
  });

  it('400 dados_invalidos sobe com os campos', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /conversas', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'outroUsuarioId', motivo: 'obrigatorio' }],
      },
    });

    const erro = await capturar(abrirConversa(cliente, ''));

    expect(falso.ultima().corpo).toEqual({ outroUsuarioId: '' });
    expect(erro).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
      campos: [{ campo: 'outroUsuarioId', motivo: 'obrigatorio' }],
    });
  });
});

describe('listarConversas', () => {
  it('faz GET /conversas com token e devolve os resumos, com e sem última mensagem', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /conversas', {
      corpo: [RESUMO_COM_MENSAGEM, RESUMO_SEM_MENSAGEM],
    });

    await expect(listarConversas(cliente)).resolves.toEqual([
      RESUMO_COM_MENSAGEM,
      RESUMO_SEM_MENSAGEM,
    ]);
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('GET');
    expect(requisicao.url).toBe(`${URL_BASE}/conversas`);
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.corpo).toBeUndefined();
  });

  it('lista vazia chega vazia', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /conversas', { corpo: [] });

    await expect(listarConversas(cliente)).resolves.toEqual([]);
  });
});

describe('listarMensagens (CA12)', () => {
  it.each([
    ['ausente', undefined],
    ['null', null],
    ['vazio', ''],
    ['em branco', '   '],
  ])(
    'com depoisDe %s faz GET /conversas/:id/mensagens sem a consulta',
    async (_nome, depoisDe) => {
      const { cliente, falso } = montar();
      falso.responder('GET /conversas/cv1/mensagens', { corpo: MENSAGENS });

      await expect(listarMensagens(cliente, 'cv1', depoisDe)).resolves.toEqual(
        MENSAGENS,
      );
      const requisicao = falso.ultima();
      expect(requisicao.metodo).toBe('GET');
      expect(requisicao.url).toBe(`${URL_BASE}/conversas/cv1/mensagens`);
      expect(requisicao.query).toEqual({});
      expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    },
  );

  it('sem o terceiro argumento, a URL não leva consulta', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /conversas/cv1/mensagens', { corpo: [] });

    await expect(listarMensagens(cliente, 'cv1')).resolves.toEqual([]);
    expect(falso.ultima().url).toBe(`${URL_BASE}/conversas/cv1/mensagens`);
  });

  it('com depoisDe, manda só ele na consulta, codificado', async () => {
    const { cliente, falso } = montar();
    falso
      .responder('GET /conversas/cv1/mensagens', { corpo: [] })
      .responder('GET /conversas/cv1/mensagens?depoisDe=m1', {
        corpo: [MENSAGENS[1]],
      });

    await expect(listarMensagens(cliente, 'cv1', 'm1')).resolves.toEqual([
      MENSAGENS[1],
    ]);
    expect(falso.ultima().url).toBe(
      `${URL_BASE}/conversas/cv1/mensagens?depoisDe=m1`,
    );

    await expect(
      listarMensagens(cliente, 'cv1', CURSOR_ESPECIAL),
    ).resolves.toEqual([]);
    expect(falso.ultima().url).toBe(
      `${URL_BASE}/conversas/cv1/mensagens?depoisDe=m1%26depoisDe%3Dm9`,
    );
    expect(falso.ultima().query).toEqual({ depoisDe: CURSOR_ESPECIAL });
  });

  it('codifica o id da conversa no caminho', async () => {
    const { cliente, falso } = montar();
    falso.responder(`GET /conversas/${ID_ESPECIAL_CODIFICADO}/mensagens`, {
      corpo: MENSAGENS,
    });

    await expect(listarMensagens(cliente, ID_ESPECIAL)).resolves.toEqual(
      MENSAGENS,
    );
    expect(falso.ultima().url).toBe(
      `${URL_BASE}/conversas/${ID_ESPECIAL_CODIFICADO}/mensagens`,
    );
  });

  it('quem não participa recebe nao_encontrado', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /conversas/cv1/mensagens', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    const erro = await capturar(listarMensagens(cliente, 'cv1'));

    expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });

  it('400 de cursor inválido sobe com o campo', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /conversas/cv1/mensagens?depoisDe=m-velha', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'depoisDe', motivo: 'invalido' }],
      },
    });

    const erro = await capturar(listarMensagens(cliente, 'cv1', 'm-velha'));

    expect(erro).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
      campos: [{ campo: 'depoisDe', motivo: 'invalido' }],
    });
  });

  it.each(['..', '.', ''])(
    'id "%s" lança nao_encontrado sem requisição',
    async (id) => {
      const { cliente, falso } = montar();

      const erro = await capturar(listarMensagens(cliente, id));

      expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
      expect(falso.requisicoes).toHaveLength(0);
    },
  );
});

describe('enviarMensagem (CA12, CA15)', () => {
  it('faz POST /conversas/:id/mensagens com o id codificado, só {texto}, e devolve {id, enviadaEm}', async () => {
    const { cliente, falso } = montar();
    falso.responder(`POST /conversas/${ID_ESPECIAL_CODIFICADO}/mensagens`, {
      status: 201,
      corpo: { id: 'm9', enviadaEm: '2026-10-21T10:00:00.000Z' },
    });

    const enviada = await enviarMensagem(cliente, ID_ESPECIAL, TEXTO);

    expect(enviada).toEqual({
      id: 'm9',
      enviadaEm: '2026-10-21T10:00:00.000Z',
    });
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('POST');
    expect(requisicao.url).toBe(
      `${URL_BASE}/conversas/${ID_ESPECIAL_CODIFICADO}/mensagens`,
    );
    expect(requisicao.query).toEqual({});
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.cabecalhos['content-type']).toBe('application/json');
    expect(requisicao.corpo).toEqual({ texto: TEXTO });
  });

  it('manda o texto como veio, sem aparar (aparar é do estado)', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /conversas/cv1/mensagens', {
      status: 201,
      corpo: { id: 'm9', enviadaEm: '2026-10-21T10:00:00.000Z' },
    });

    await enviarMensagem(cliente, 'cv1', `  ${TEXTO}\n`);

    expect(falso.ultima().corpo).toEqual({ texto: `  ${TEXTO}\n` });
  });

  it('400 traz o campo, sem o texto, mesmo que a resposta o ecoasse', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /conversas/cv1/mensagens', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'texto', motivo: 'tamanho' }],
        texto: TEXTO,
      },
    });

    const erro = await capturar(enviarMensagem(cliente, 'cv1', TEXTO));

    expect(erro).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
      campos: [{ campo: 'texto', motivo: 'tamanho' }],
    });
    esperarSemDadoDigitado(erro, [TEXTO]);
  });

  it('quem não participa recebe nao_encontrado, sem o texto', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /conversas/cv1/mensagens', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    const erro = await capturar(enviarMensagem(cliente, 'cv1', TEXTO));

    expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
    esperarSemDadoDigitado(erro, [TEXTO]);
    expect(aoExpirar).not.toHaveBeenCalled();
  });

  it('sem resposta, o erro de rede não leva o texto', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /conversas/cv1/mensagens', { falhaDeRede: true });

    const erro: unknown = await enviarMensagem(cliente, 'cv1', TEXTO).then(
      () => {
        throw new Error('a promessa deveria ter falhado');
      },
      (e: unknown) => e,
    );

    expect(erro).toMatchObject({ name: 'ErroDeRede', motivo: 'falha' });
    expect(String(erro)).not.toContain(TEXTO);
    expect(JSON.stringify(erro)).not.toContain(TEXTO);
  });

  it.each(['..', '.', ''])(
    'id "%s" lança nao_encontrado sem requisição',
    async (id) => {
      const { cliente, falso } = montar();

      const erro = await capturar(enviarMensagem(cliente, id, TEXTO));

      expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
      esperarSemDadoDigitado(erro, [TEXTO]);
      expect(falso.requisicoes).toHaveLength(0);
    },
  );
});

describe('autenticação (CA14)', () => {
  type Chamada = readonly [
    rota: string,
    chamar: (cliente: ClienteHttp) => Promise<unknown>,
  ];

  const CHAMADAS: readonly Chamada[] = [
    ['POST /conversas', (c) => abrirConversa(c, OUTRO_USUARIO)],
    ['GET /conversas', (c) => listarConversas(c)],
    ['GET /conversas/cv1/mensagens', (c) => listarMensagens(c, 'cv1')],
    ['POST /conversas/cv1/mensagens', (c) => enviarMensagem(c, 'cv1', TEXTO)],
  ];

  it.each(CHAMADAS)('%s leva o Bearer', async (rota, chamar) => {
    const { cliente, falso } = montar();
    falso.responder(rota, { corpo: {} });

    await chamar(cliente);

    expect(falso.requisicoes).toHaveLength(1);
    expect(`${falso.ultima().metodo} ${falso.ultima().caminho}`).toBe(rota);
    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it.each(CHAMADAS)(
    '%s com 401 vira sessao_expirada e chama aoExpirar',
    async (rota, chamar) => {
      const { cliente, falso, aoExpirar } = montar();
      falso.responder(rota, {
        status: 401,
        corpo: { erro: 'nao_autenticado' },
      });

      const erro = await capturar(chamar(cliente));

      expect(erro).toMatchObject({ status: 401, codigo: 'sessao_expirada' });
      expect(aoExpirar).toHaveBeenCalledWith(TOKEN);
    },
  );
});
