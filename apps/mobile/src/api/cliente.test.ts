import { criarFetchFalso, type FetchFalso } from '../testes/fetch-falso';
import {
  type ClienteHttp,
  criarCliente,
  type FuncaoFetch,
  segmentoDaUrl,
  TIMEOUT_PADRAO_MS,
} from './cliente';
import { urlDaApi } from './config';
import { ErroDaApi, ErroDeRede, ehErroDaApi, ehErroDeRede } from './erros';

// Garantia de tipo: o `fetch` global do React Native serve como `FuncaoFetch`.
type FetchGlobalServe = typeof fetch extends FuncaoFetch ? true : false;
const fetchGlobalServe: FetchGlobalServe = true;

const URL_BASE = 'https://api.teste';
const TOKEN = 'token-secreto-123';
const EMAIL = 'maria.silva@exemplo.com';
const SENHA = 'senha-da-maria';

interface Montagem {
  readonly cliente: ClienteHttp;
  readonly falso: FetchFalso;
  readonly aoExpirar: jest.Mock;
}

function montar({
  token = TOKEN as string | null,
  timeoutMs,
}: {
  token?: string | null;
  timeoutMs?: number;
} = {}): Montagem {
  const falso = criarFetchFalso();
  const aoExpirar = jest.fn();
  const cliente = criarCliente({
    fetch: falso.fetch,
    urlBase: URL_BASE,
    obterToken: async () => token,
    aoExpirar,
    ...(timeoutMs !== undefined && { timeoutMs }),
  });
  return { cliente, falso, aoExpirar };
}

async function capturar(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('a promessa deveria ter falhado');
}

/** Tudo o que um erro expõe: mensagem, JSON, chaves, texto e pilha. */
function tudoQueOErroMostra(erro: unknown): string {
  const objeto = erro as Error & Record<string, unknown>;
  return [
    objeto.message,
    String(objeto),
    objeto.stack ?? '',
    JSON.stringify(objeto),
    Object.keys(objeto).join(','),
    JSON.stringify(Object.getOwnPropertyNames(objeto)),
    String(objeto.cause ?? ''),
  ].join('\n');
}

describe('criarCliente: cabeçalhos e corpo', () => {
  it('manda Authorization: Bearer com o token quando a requisição é autenticada', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /perfis/eu', { corpo: { nome: 'x' } });

    await cliente.get('/perfis/eu');

    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(falso.ultima().cabecalhos.accept).toBe('application/json');
  });

  it('não manda Authorization com autenticar: false, mesmo havendo token', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /sessoes', { corpo: { token: 'novo' } });

    await cliente.post('/sessoes', { email: EMAIL }, { autenticar: false });

    expect(falso.ultima().cabecalhos).not.toHaveProperty('authorization');
  });

  it('não manda Authorization quando não há token', async () => {
    const { cliente, falso } = montar({ token: null });
    falso.responder('GET /categorias', { corpo: [] });

    await cliente.get('/categorias');

    expect(falso.ultima().cabecalhos).not.toHaveProperty('authorization');
  });

  it('aceita obterToken síncrono', async () => {
    const falso = criarFetchFalso().responder('GET /categorias', {
      corpo: [],
    });
    const cliente = criarCliente({
      fetch: falso.fetch,
      urlBase: URL_BASE,
      obterToken: () => TOKEN,
      aoExpirar: jest.fn(),
    });

    await cliente.get('/categorias');

    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('o token da requisição tem prioridade sobre obterToken (S6)', async () => {
    const falso = criarFetchFalso().responder('DELETE /sessoes', {
      status: 204,
    });
    const obterToken = jest.fn(async () => 'token-da-porta');
    const cliente = criarCliente({
      fetch: falso.fetch,
      urlBase: URL_BASE,
      obterToken,
      aoExpirar: jest.fn(),
    });

    await cliente.delete('/sessoes', { token: TOKEN });

    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(obterToken).not.toHaveBeenCalled();
  });

  it('com a porta já vazia, o token da requisição ainda vai no cabeçalho', async () => {
    const { cliente, falso } = montar({ token: null });
    falso.responder('DELETE /sessoes', { status: 204 });

    await cliente.delete('/sessoes', { token: TOKEN });

    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('token da requisição vazio vai sem Authorization e sem ler a porta', async () => {
    const falso = criarFetchFalso().responder('DELETE /sessoes', {
      status: 204,
    });
    const obterToken = jest.fn(async () => TOKEN);
    const cliente = criarCliente({
      fetch: falso.fetch,
      urlBase: URL_BASE,
      obterToken,
      aoExpirar: jest.fn(),
    });

    await cliente.delete('/sessoes', { token: '' });

    expect(falso.ultima().cabecalhos).not.toHaveProperty('authorization');
    expect(obterToken).not.toHaveBeenCalled();
  });

  it('com autenticar: false, nem o token da requisição vai', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /sessoes', { corpo: { token: 'novo' } });

    await cliente.post(
      '/sessoes',
      { email: EMAIL },
      { autenticar: false, token: TOKEN },
    );

    expect(falso.ultima().cabecalhos).not.toHaveProperty('authorization');
  });

  it('manda o corpo como JSON e Content-Type só quando há corpo', async () => {
    const { cliente, falso } = montar();
    falso
      .responder('PUT /perfis/eu', { corpo: {} })
      .responder('DELETE /sessoes', { status: 204 });

    await cliente.put('/perfis/eu', { nome: 'Maria' });
    expect(falso.ultima().metodo).toBe('PUT');
    expect(falso.ultima().corpo).toEqual({ nome: 'Maria' });
    expect(falso.ultima().cabecalhos['content-type']).toBe('application/json');

    await cliente.delete('/sessoes');
    expect(falso.ultima().corpo).toBeUndefined();
    expect(falso.ultima().cabecalhos).not.toHaveProperty('content-type');
  });

  it('devolve o JSON da resposta e undefined em 204 ou corpo vazio', async () => {
    const { cliente, falso } = montar();
    falso
      .responder('GET /categorias', {
        corpo: [{ id: 'reformas', rotulo: 'Reformas' }],
      })
      .responder('DELETE /sessoes', { status: 204 })
      .responder('GET /vazio', { status: 200 });

    await expect(cliente.get('/categorias')).resolves.toEqual([
      { id: 'reformas', rotulo: 'Reformas' },
    ]);
    await expect(cliente.delete('/sessoes')).resolves.toBeUndefined();
    await expect(cliente.get('/vazio')).resolves.toBeUndefined();
  });

  it('resposta 2xx com JSON malformado vira ErroDaApi interno', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /categorias', { corpoBruto: '[{"id":' });

    const erro = await capturar(cliente.get('/categorias'));

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect((erro as ErroDaApi).codigo).toBe('interno');
  });
});

describe('criarCliente: URL e query', () => {
  it('monta a URL com a base e omite campos indefinidos, nulos e em branco', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /busca', { corpo: {} });

    await cliente.get('/busca', {
      query: {
        texto: '',
        categoria: undefined,
        cidade: null,
        antesDe: '   ',
        tipo: 'trampos',
        limite: 20,
      },
    });

    expect(falso.ultima().url).toBe(`${URL_BASE}/busca?tipo=trampos&limite=20`);
  });

  it('sem query (ou com todos os campos vazios) não põe "?" na URL', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /busca', { corpo: {} });

    await cliente.get('/busca', { query: { texto: '' } });

    expect(falso.ultima().url).toBe(`${URL_BASE}/busca`);
  });

  it('codifica os valores da query', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /busca', { corpo: {} });

    await cliente.get('/busca', { query: { texto: 'pintor & cia/ç?#=' } });

    expect(falso.ultima().url).toBe(
      `${URL_BASE}/busca?texto=pintor%20%26%20cia%2F%C3%A7%3F%23%3D`,
    );
    expect(falso.ultima().query).toEqual({ texto: 'pintor & cia/ç?#=' });
  });

  it('segmentoDaUrl codifica o id e recusa ids que mudariam o caminho', () => {
    expect(segmentoDaUrl('a/b?c=d#e f')).toBe('a%2Fb%3Fc%3Dd%23e%20f');
    expect(segmentoDaUrl('../busca')).toBe('..%2Fbusca');
    for (const id of ['', '.', '..']) {
      expect(() => segmentoDaUrl(id)).toThrow(ErroDaApi);
    }
  });
});

describe('criarCliente: 401 e sessão expirada (CA14)', () => {
  it('401 de requisição com token chama aoExpirar uma vez e lança sessao_expirada', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('GET /perfis/eu', {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });

    const erro = await capturar(cliente.get('/perfis/eu'));

    expect(aoExpirar).toHaveBeenCalledTimes(1);
    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro).toMatchObject({ status: 401, codigo: 'sessao_expirada' });
  });

  it('aoExpirar recebe o token que a requisição levou, não o lido depois (Q4)', async () => {
    const falso = criarFetchFalso().responder('GET /perfis/eu', {
      status: 401,
    });
    const tokens = ['token-antigo', 'token-novo'];
    const aoExpirar = jest.fn();
    const cliente = criarCliente({
      fetch: falso.fetch,
      urlBase: URL_BASE,
      // A cada leitura a porta já tem outro token (login no meio do caminho).
      obterToken: async () => tokens.shift() ?? null,
      aoExpirar,
    });

    await capturar(cliente.get('/perfis/eu'));

    expect(aoExpirar).toHaveBeenCalledWith('token-antigo');
  });

  it('401 de requisição com o token da requisição chama aoExpirar com ele (S6)', async () => {
    const falso = criarFetchFalso().responder('GET /perfis/eu', {
      status: 401,
    });
    const aoExpirar = jest.fn();
    const cliente = criarCliente({
      fetch: falso.fetch,
      urlBase: URL_BASE,
      obterToken: async () => 'token-da-porta',
      aoExpirar,
    });

    const erro = await capturar(
      cliente.get('/perfis/eu', { token: 'token-capturado' }),
    );

    expect(aoExpirar).toHaveBeenCalledTimes(1);
    expect(aoExpirar).toHaveBeenCalledWith('token-capturado');
    expect(erro).toMatchObject({ status: 401, codigo: 'sessao_expirada' });
    expect(tudoQueOErroMostra(erro)).not.toContain('token-capturado');
  });

  it('401 do login (POST /sessoes) não chama aoExpirar e vira credenciais_invalidas', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /sessoes', {
      status: 401,
      corpo: { erro: 'credenciais_invalidas' },
    });

    const erro = await capturar(
      cliente.post(
        '/sessoes',
        { email: EMAIL, senha: SENHA },
        { autenticar: false },
      ),
    );

    expect(aoExpirar).not.toHaveBeenCalled();
    expect(erro).toMatchObject({
      status: 401,
      codigo: 'credenciais_invalidas',
    });
  });

  it('401 do login com corpo malformado continua credenciais_invalidas', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /sessoes', { status: 401, corpoBruto: '<html>' });

    const erro = await capturar(
      cliente.post('/sessoes', { email: EMAIL }, { autenticar: false }),
    );

    expect(aoExpirar).not.toHaveBeenCalled();
    expect(erro).toMatchObject({ codigo: 'credenciais_invalidas' });
  });

  it('401 de POST /contas não chama aoExpirar', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /contas', {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });

    const erro = await capturar(
      cliente.post('/contas', { email: EMAIL }, { autenticar: false }),
    );

    expect(aoExpirar).not.toHaveBeenCalled();
    expect(erro).toMatchObject({ status: 401, codigo: 'nao_autenticado' });
  });

  it('401 de DELETE /sessoes (saída) não chama aoExpirar', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('DELETE /sessoes', {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });

    const erro = await capturar(cliente.delete('/sessoes'));

    expect(aoExpirar).not.toHaveBeenCalled();
    expect(erro).toMatchObject({ status: 401, codigo: 'nao_autenticado' });
  });

  it('401 de requisição que não levou token não chama aoExpirar', async () => {
    const { cliente, falso, aoExpirar } = montar({ token: null });
    falso.responder('GET /perfis/eu', {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });

    const erro = await capturar(cliente.get('/perfis/eu'));

    expect(aoExpirar).not.toHaveBeenCalled();
    expect(erro).toMatchObject({ status: 401, codigo: 'nao_autenticado' });
  });

  it('respostas que não são 401 não chamam aoExpirar', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('GET /perfis/eu', [
      { status: 403, corpo: { erro: 'sem_vinculo' } },
      { status: 500, corpo: { erro: 'interno' } },
    ]);

    await capturar(cliente.get('/perfis/eu'));
    await capturar(cliente.get('/perfis/eu'));

    expect(aoExpirar).not.toHaveBeenCalled();
  });
});

describe('criarCliente: corpo de erro', () => {
  it('lê o código e os campos de dados_invalidos', async () => {
    const { cliente, falso } = montar();
    falso.responder('PUT /perfis/eu', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [
          { campo: 'nome', motivo: 'tamanho' },
          { campo: 'habilidades.2', motivo: 'invalido' },
        ],
      },
    });

    const erro = await capturar(cliente.put('/perfis/eu', {}));

    expect(erro).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
      campos: [
        { campo: 'nome', motivo: 'tamanho' },
        { campo: 'habilidades.2', motivo: 'invalido' },
      ],
    });
  });

  it('descarta campos fora do formato e chaves extras de cada campo', async () => {
    const { cliente, falso } = montar();
    falso.responder('PUT /perfis/eu', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [
          { campo: 'nome', motivo: 'obrigatorio', valor: EMAIL },
          { campo: EMAIL, motivo: 'invalido' },
          { campo: 'cidade', motivo: 'qualquer' },
          'texto solto',
          null,
        ],
      },
    });

    const erro = (await capturar(cliente.put('/perfis/eu', {}))) as ErroDaApi;

    expect(erro.campos).toEqual([{ campo: 'nome', motivo: 'obrigatorio' }]);
    expect(Object.keys(erro.campos[0] ?? {})).toEqual(['campo', 'motivo']);
  });

  it.each([
    ['malformado', { corpoBruto: '{"erro":' }],
    ['vazio', {}],
    ['HTML', { corpoBruto: '<html>502 Bad Gateway</html>' }],
    ['lista', { corpo: ['erro'] }],
    ['sem erro', { corpo: { mensagem: 'falhou' } }],
    ['código fora do formato', { corpo: { erro: `Falhou para ${EMAIL}` } }],
  ])('corpo de erro %s vira interno', async (_nome, resposta) => {
    const { cliente, falso } = montar();
    falso.responder('GET /trampos/1', { status: 502, ...resposta });

    const erro = await capturar(cliente.get('/trampos/1'));

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro).toMatchObject({ status: 502, codigo: 'interno', campos: [] });
  });

  it('429 vira muitas_requisicoes, com ou sem corpo legível', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /contas', [
      { status: 429, corpo: { erro: 'muitas_requisicoes' } },
      { status: 429, corpoBruto: 'Too Many Requests' },
    ]);

    for (let vez = 0; vez < 2; vez += 1) {
      const erro = await capturar(
        cliente.post('/contas', { email: EMAIL }, { autenticar: false }),
      );
      expect(erro).toMatchObject({ status: 429, codigo: 'muitas_requisicoes' });
    }
  });
});

describe('criarCliente: rede e timeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('falha de rede vira ErroDeRede', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /categorias', { falhaDeRede: true });

    const erro = await capturar(cliente.get('/categorias'));

    expect(erro).toBeInstanceOf(ErroDeRede);
    expect(erro).toMatchObject({ motivo: 'falha' });
    expect(ehErroDeRede(erro)).toBe(true);
    expect(ehErroDaApi(erro)).toBe(false);
  });

  it('resposta que demora mais que o timeout vira ErroDeRede tempo_esgotado', async () => {
    const { cliente, falso } = montar({ timeoutMs: 20 });
    falso.responder('GET /busca', { demoraMs: 5_000, corpo: {} });

    const inicio = Date.now();
    const erro = await capturar(cliente.get('/busca'));

    expect(erro).toBeInstanceOf(ErroDeRede);
    expect(erro).toMatchObject({ motivo: 'tempo_esgotado' });
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it('o timeout padrão é de 15 s', async () => {
    jest.useFakeTimers();
    const { cliente, falso } = montar();
    falso.responder('GET /busca', { demoraMs: 60_000, corpo: {} });

    const resultado = capturar(cliente.get('/busca'));
    await jest.advanceTimersByTimeAsync(TIMEOUT_PADRAO_MS - 1);
    expect(falso.requisicoes).toHaveLength(1);
    let terminou = false;
    void resultado.then(() => {
      terminou = true;
    });
    await Promise.resolve();
    expect(terminou).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await expect(resultado).resolves.toMatchObject({
      motivo: 'tempo_esgotado',
    });
    expect(TIMEOUT_PADRAO_MS).toBe(15_000);
  });

  it('limpa o temporizador do timeout depois da resposta', async () => {
    jest.useFakeTimers();
    const { cliente, falso } = montar();
    falso
      .responder('GET /categorias', { corpo: [] })
      .responder('GET /trampos/x', { status: 500 })
      .responder('GET /servicos/x', { falhaDeRede: true });

    await cliente.get('/categorias');
    await capturar(cliente.get('/trampos/x'));
    await capturar(cliente.get('/servicos/x'));

    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('erros sem dado pessoal (CA15)', () => {
  it('ErroDaApi não guarda corpo, URL, query, token nem o que foi digitado', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /contas', {
      status: 409,
      corpo: {
        erro: 'email_em_uso',
        detalhe: `o e-mail ${EMAIL} já existe`,
      },
    });

    const erro = await capturar(
      cliente.post(
        '/contas',
        { email: EMAIL, senha: SENHA },
        { autenticar: false, query: { origem: EMAIL } },
      ),
    );

    expect(erro).toMatchObject({ status: 409, codigo: 'email_em_uso' });
    const exposto = tudoQueOErroMostra(erro);
    for (const proibido of [
      EMAIL,
      encodeURIComponent(EMAIL),
      SENHA,
      'já existe',
      'detalhe',
      URL_BASE,
      '/contas',
      TOKEN,
    ]) {
      expect(exposto).not.toContain(proibido);
    }
    expect(Object.keys(erro as object).sort()).toEqual(
      ['campos', 'codigo', 'name', 'status'].sort(),
    );
    expect((erro as Error).message).toBe('erro da API: email_em_uso');
  });

  it('ErroDaApi de sessão expirada não guarda o token', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /perfis/eu', {
      status: 401,
      corpo: { erro: 'nao_autenticado', token: TOKEN },
    });

    const erro = await capturar(cliente.get('/perfis/eu'));

    expect(tudoQueOErroMostra(erro)).not.toContain(TOKEN);
  });

  it('ErroDeRede não guarda o erro original (que pode trazer URL e token)', async () => {
    const vazador: FuncaoFetch = async (url, init) => {
      throw new Error(`falhou ${url} ${init.headers.Authorization ?? ''}`);
    };
    const cliente = criarCliente({
      fetch: vazador,
      urlBase: URL_BASE,
      obterToken: () => TOKEN,
      aoExpirar: jest.fn(),
    });

    const erro = await capturar(
      cliente.get('/busca', { query: { texto: EMAIL } }),
    );

    expect(erro).toBeInstanceOf(ErroDeRede);
    const exposto = tudoQueOErroMostra(erro);
    for (const proibido of [EMAIL, TOKEN, URL_BASE, '/busca', 'falhou']) {
      expect(exposto).not.toContain(proibido);
    }
    expect((erro as Error).message).toBe('falha de rede');
  });
});

describe('urlDaApi', () => {
  it('lê EXPO_PUBLIC_API_URL e remove a barra final', () => {
    expect(
      urlDaApi({ EXPO_PUBLIC_API_URL: 'http://192.168.0.10:3000/' }, true),
    ).toBe('http://192.168.0.10:3000');
    expect(
      urlDaApi({ EXPO_PUBLIC_API_URL: ' https://api.trampoja.app// ' }, false),
    ).toBe('https://api.trampoja.app');
  });

  it('sem valor, lança erro claro', () => {
    expect(() => urlDaApi({}, true)).toThrow(
      /EXPO_PUBLIC_API_URL não definida/,
    );
    expect(() => urlDaApi({ EXPO_PUBLIC_API_URL: '  ' }, true)).toThrow(
      /não definida/,
    );
  });

  it('fora de __DEV__, exige https://', () => {
    expect(() =>
      urlDaApi({ EXPO_PUBLIC_API_URL: 'http://api.trampoja.app' }, false),
    ).toThrow(/https:\/\//);
    expect(urlDaApi({ EXPO_PUBLIC_API_URL: 'HTTPS://api.x.app' }, false)).toBe(
      'HTTPS://api.x.app',
    );
  });

  it('recusa valor que não é URL http(s) ou que tem query, sem repetir o valor', () => {
    for (const valor of [
      'api.trampoja.app',
      'ftp://api.trampoja.app',
      'http://api.trampoja.app/?token=abc',
      'http://api trampoja.app',
    ]) {
      let mensagem = '';
      try {
        urlDaApi({ EXPO_PUBLIC_API_URL: valor }, true);
      } catch (erro) {
        mensagem = (erro as Error).message;
      }
      expect(mensagem).toMatch(/EXPO_PUBLIC_API_URL inválida/);
      expect(mensagem).not.toContain(valor);
    }
  });

  it('usa process.env.EXPO_PUBLIC_API_URL por padrão', () => {
    const anterior = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = 'http://10.0.0.5:3000';
    try {
      expect(urlDaApi()).toBe('http://10.0.0.5:3000');
    } finally {
      if (anterior === undefined) {
        delete process.env.EXPO_PUBLIC_API_URL;
      } else {
        process.env.EXPO_PUBLIC_API_URL = anterior;
      }
    }
  });
});

it('o fetch global do React Native é compatível com FuncaoFetch', () => {
  expect(fetchGlobalServe).toBe(true);
});
