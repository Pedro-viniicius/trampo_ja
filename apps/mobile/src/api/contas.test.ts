import { criarFetchFalso, type FetchFalso } from '../testes/fetch-falso';
import { type ClienteHttp, criarCliente } from './cliente';
import { excluirConta, exportarDados, sair } from './contas';
import { ErroDaApi, ErroDeRede } from './erros';
import type { DadosExportados } from './tipos';

const URL_BASE = 'http://192.168.0.10:3000';
const TOKEN = 'token-da-sessao';

/** Sentinela da senha digitada: nunca pode sair do corpo do POST (CA24). */
const SENHA = 'Sentinela-senha-digitada';
/** Senha com caracteres que mudariam a URL ou o JSON se fossem crus. */
const SENHA_ESPECIAL = 'Sentinela "aspas" & ?x=1 #frag ção/..';
/** Sentinelas do conteúdo exportado: nunca podem ir para um erro (CA24). */
const EMAIL_EXPORTADO = 'sentinela-email@exemplo.test';
const TEXTO_EXPORTADO = 'Sentinela-texto-exportado';

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

async function capturar(promessa: Promise<unknown>): Promise<Error> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof Error) {
      return erro;
    }
    throw erro;
  }
  throw new Error('a promessa deveria ter falhado');
}

/** O erro não pode carregar a senha nem o conteúdo exportado (CA24). */
function esperarSemSentinela(erro: Error, sentinelas: readonly string[]): void {
  for (const sentinela of sentinelas) {
    expect(erro.message).not.toContain(sentinela);
    expect(JSON.stringify(erro)).not.toContain(sentinela);
    expect(String(erro)).not.toContain(sentinela);
    expect(erro.stack ?? '').not.toContain(sentinela);
  }
}

/** Exportação no formato do contrato `trampo-ja.exportacao.v1` (D26). */
const EXPORTACAO: DadosExportados = {
  formato: 'trampo-ja.exportacao.v1',
  geradoEm: '2026-10-22T12:00:00.000Z',
  conta: {
    id: 'c1',
    email: EMAIL_EXPORTADO,
    criadaEm: '2026-10-01T12:00:00.000Z',
  },
  sessoes: [
    {
      criadaEm: '2026-10-20T12:00:00.000Z',
      expiraEm: '2026-11-19T12:00:00.000Z',
    },
  ],
  perfil: {
    nome: 'Sentinela Nome',
    cidade: 'Lavras',
    descricao: null,
    habilidades: ['pintura'],
    atualizadoEm: '2026-10-02T12:00:00.000Z',
  },
  trampos: [
    {
      id: 't1',
      titulo: 'Pintar muro',
      descricao: TEXTO_EXPORTADO,
      categoria: 'pintura',
      cidade: 'Lavras',
      valorCentavos: 15000,
      prazo: '2026-11-01',
      status: 'aberto',
      criadoEm: '2026-10-03T12:00:00.000Z',
      candidaturasRecebidas: 2,
    },
  ],
  servicos: [],
  candidaturas: [
    {
      id: 'cd1',
      trampoId: 't9',
      mensagem: null,
      valorPropostoCentavos: null,
      status: 'pendente',
      criadaEm: '2026-10-04T12:00:00.000Z',
    },
  ],
  conversas: [
    {
      id: 'cv1',
      outroUsuarioId: 'c2',
      criadaEm: '2026-10-05T12:00:00.000Z',
      minhasMensagens: [
        { id: 'm1', texto: 'Oi', enviadaEm: '2026-10-05T12:01:00.000Z' },
      ],
    },
  ],
};

describe('sair (S6)', () => {
  const TOKEN_CAPTURADO = 'token-capturado-antes-de-limpar';

  /** Cliente cuja porta já não tem token (o local foi limpo antes). */
  function montarComPortaVazia() {
    const falso = criarFetchFalso();
    const aoExpirar = jest.fn();
    const obterToken = jest.fn(async () => null);
    const cliente = criarCliente({
      fetch: falso.fetch,
      urlBase: URL_BASE,
      obterToken,
      aoExpirar,
    });
    return { cliente, falso, aoExpirar, obterToken };
  }

  it('faz DELETE /sessoes com o token dado, sem corpo, mesmo com a porta vazia', async () => {
    const { cliente, falso, obterToken } = montarComPortaVazia();
    falso.responder('DELETE /sessoes', { status: 204 });

    await expect(sair(cliente, TOKEN_CAPTURADO)).resolves.toBeUndefined();

    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('DELETE');
    expect(requisicao.url).toBe(`${URL_BASE}/sessoes`);
    expect(requisicao.corpo).toBeUndefined();
    expect(requisicao.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN_CAPTURADO}`,
    );
    expect(falso.requisicoes).toHaveLength(1);
    expect(obterToken).not.toHaveBeenCalled();
  });

  it('leva o token dado, não o que a porta guarda agora (login feito depois)', async () => {
    const { cliente, falso } = montar();
    falso.responder('DELETE /sessoes', { status: 204 });

    await sair(cliente, TOKEN_CAPTURADO);

    expect(falso.ultima().cabecalhos.authorization).toBe(
      `Bearer ${TOKEN_CAPTURADO}`,
    );
    expect(JSON.stringify(falso.ultima())).not.toContain(TOKEN);
  });

  it('401 (sessão já revogada) não chama aoExpirar e o erro não leva o token', async () => {
    const { cliente, falso, aoExpirar } = montarComPortaVazia();
    falso.responder('DELETE /sessoes', {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });

    const erro = await capturar(sair(cliente, TOKEN_CAPTURADO));

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(aoExpirar).not.toHaveBeenCalled();
    esperarSemSentinela(erro, [TOKEN_CAPTURADO]);
  });

  it('falha de rede sobe como ErroDeRede, sem o token', async () => {
    const { cliente, falso } = montarComPortaVazia();
    falso.responder('DELETE /sessoes', { falhaDeRede: true });

    const erro = await capturar(sair(cliente, TOKEN_CAPTURADO));

    expect(erro).toBeInstanceOf(ErroDeRede);
    esperarSemSentinela(erro, [TOKEN_CAPTURADO]);
  });
});

describe('excluirConta (CA17)', () => {
  it('faz POST /contas/eu/exclusao com token, só com {senha}, e resolve com o 204', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /contas/eu/exclusao', { status: 204 });

    await expect(excluirConta(cliente, SENHA)).resolves.toBeUndefined();

    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('POST');
    expect(requisicao.url).toBe(`${URL_BASE}/contas/eu/exclusao`);
    expect(requisicao.corpo).toEqual({ senha: SENHA });
    expect(Object.keys(requisicao.corpo as object)).toEqual(['senha']);
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.cabecalhos['content-type']).toBe('application/json');
    expect(falso.requisicoes).toHaveLength(1);
    expect(aoExpirar).not.toHaveBeenCalled();
  });
});

describe('exportarDados (CA19)', () => {
  it('faz POST /contas/eu/exportacao com token, só com {senha}, e devolve o JSON como veio', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /contas/eu/exportacao', { corpo: EXPORTACAO });

    const dados = await exportarDados(cliente, SENHA);

    expect(dados).toEqual(EXPORTACAO);
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('POST');
    expect(requisicao.url).toBe(`${URL_BASE}/contas/eu/exportacao`);
    expect(requisicao.corpo).toEqual({ senha: SENHA });
    expect(Object.keys(requisicao.corpo as object)).toEqual(['senha']);
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.cabecalhos['content-type']).toBe('application/json');
    expect(falso.requisicoes).toHaveLength(1);
    expect(aoExpirar).not.toHaveBeenCalled();
  });

  it.each([
    ['204 sem corpo', { status: 204 }],
    ['200 com corpo vazio', { status: 200 }],
    ['corpo que não é JSON', { status: 200, corpoBruto: TEXTO_EXPORTADO }],
    ['lista', { status: 200, corpo: [EXPORTACAO] }],
    ['null', { status: 200, corpo: null }],
    [
      'objeto sem formato',
      { status: 200, corpo: { conta: { email: EMAIL_EXPORTADO } } },
    ],
    [
      'formato que não é texto',
      { status: 200, corpo: { formato: 1, conta: { email: EMAIL_EXPORTADO } } },
    ],
  ])(
    'resposta fora do contrato (%s) vira interno, sem o conteúdo no erro',
    async (_caso, resposta) => {
      const { cliente, falso, aoExpirar } = montar();
      falso.responder('POST /contas/eu/exportacao', resposta);

      const erro = await capturar(exportarDados(cliente, SENHA));

      expect(erro).toBeInstanceOf(ErroDaApi);
      expect(erro).toMatchObject({ status: 200, codigo: 'interno' });
      esperarSemSentinela(erro, [SENHA, EMAIL_EXPORTADO, TEXTO_EXPORTADO]);
      expect(aoExpirar).not.toHaveBeenCalled();
    },
  );
});

describe.each([
  ['excluirConta', '/contas/eu/exclusao', excluirConta],
  ['exportarDados', '/contas/eu/exportacao', exportarDados],
] as const)('%s: erros (CA17, CA19, CA24)', (_nome, caminho, chamar) => {
  const rota = `POST ${caminho}`;

  it('403 senha_incorreta sobe como ErroDaApi, sem expirar a sessão e sem a senha', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder(rota, { status: 403, corpo: { erro: 'senha_incorreta' } });

    const erro = await capturar(chamar(cliente, SENHA));

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro).toMatchObject({ status: 403, codigo: 'senha_incorreta' });
    expect(aoExpirar).not.toHaveBeenCalled();
    esperarSemSentinela(erro, [SENHA]);
  });

  it('429 sobe como muitas_requisicoes, sem expirar a sessão e sem a senha', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder(rota, {
      status: 429,
      corpo: { erro: 'muitas_requisicoes' },
    });

    const erro = await capturar(chamar(cliente, SENHA));

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro).toMatchObject({ status: 429, codigo: 'muitas_requisicoes' });
    expect(aoExpirar).not.toHaveBeenCalled();
    esperarSemSentinela(erro, [SENHA]);
  });

  it('401 expira a sessão: chama aoExpirar com o token usado e lança sessao_expirada', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder(rota, { status: 401, corpo: { erro: 'nao_autenticado' } });

    const erro = await capturar(chamar(cliente, SENHA));

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro).toMatchObject({ status: 401, codigo: 'sessao_expirada' });
    expect(aoExpirar).toHaveBeenCalledTimes(1);
    expect(aoExpirar).toHaveBeenCalledWith(TOKEN);
    esperarSemSentinela(erro, [SENHA]);
  });

  it('400 dados_invalidos sobe com os campos, sem a senha', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder(rota, {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'senha', motivo: 'obrigatorio' }],
        senha: SENHA,
      },
    });

    const erro = await capturar(chamar(cliente, SENHA));

    expect(erro).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
      campos: [{ campo: 'senha', motivo: 'obrigatorio' }],
    });
    expect(aoExpirar).not.toHaveBeenCalled();
    esperarSemSentinela(erro, [SENHA]);
  });

  it('falha de rede sobe como ErroDeRede, sem a senha', async () => {
    const { cliente, falso } = montar();
    falso.responder(rota, { falhaDeRede: true });

    const erro = await capturar(chamar(cliente, SENHA));

    expect(erro).toBeInstanceOf(ErroDeRede);
    esperarSemSentinela(erro, [SENHA]);
  });

  it('senha com caracteres especiais vai intacta no corpo e nunca na URL', async () => {
    const { cliente, falso } = montar();
    falso.responder(rota, {
      status: 403,
      corpo: { erro: 'senha_incorreta' },
    });

    const erro = await capturar(chamar(cliente, SENHA_ESPECIAL));

    const requisicao = falso.ultima();
    expect(requisicao.corpo).toEqual({ senha: SENHA_ESPECIAL });
    expect(requisicao.url).toBe(`${URL_BASE}${caminho}`);
    expect(requisicao.query).toEqual({});
    expect(requisicao.url).not.toContain('Sentinela');
    expect(JSON.stringify(requisicao.cabecalhos)).not.toContain('Sentinela');
    esperarSemSentinela(erro, [SENHA_ESPECIAL, 'Sentinela']);
  });
});
