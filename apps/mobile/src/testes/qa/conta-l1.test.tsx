// QA da L1 (CA17, CA18, CA19, CA24): a exclusão e a exportação de conta pelas
// rotas reais, com servidor em memória de três contas (`apoio-conversas-2c`) e
// a folha de compartilhamento real sobre um disco falso.
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { ligarGerenciadores } from '../../estado/cliente-de-consultas';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import {
  AUTOR,
  avancar,
  CONVERSA,
  criarFetchDoMundo,
  criarMundo,
  ESTRANHO,
  entrarComo,
  FREELA,
  GETS_DAS_MENSAGENS,
  irPara,
  linhaDaListaCom,
  POSTS_DAS_MENSAGENS,
  requisicoesDe,
  restaurarConexao,
  textoDe,
} from './apoio-conversas-2c';
import { abrirApp, textosEPropriedades, vigiarConsole } from './apoio-qa';

// Disco falso: uri -> conteúdo. `mock*` pode ser lido dentro do `jest.mock`.
const mockDisco = new Map<string, string>();
const mockGravacoes: string[] = [];
const mockFalhas: { apagar?: Error } = {};

jest.mock('expo-file-system', () => {
  class File {
    readonly uri: string;
    constructor(diretorio: { readonly uri: string }, nome: string) {
      this.uri = `${diretorio.uri}${nome}`;
    }
    get exists(): boolean {
      return mockDisco.has(this.uri);
    }
    write(conteudo: string): void {
      mockGravacoes.push(this.uri);
      mockDisco.set(this.uri, conteudo);
    }
    delete(): void {
      if (mockFalhas.apagar !== undefined) {
        throw mockFalhas.apagar;
      }
      mockDisco.delete(this.uri);
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache/' } } };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 99,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// eslint-disable-next-line import/first
import * as Sharing from 'expo-sharing';

vigiarConsole();

const disponivel = jest.mocked(Sharing.isAvailableAsync);
const folha = jest.mocked(Sharing.shareAsync);

const SENHA = 'SENHA-SENTINELA-L1-9d41';
const SENTINELA_DO_JSON = 'JSON-SENTINELA-L1-6b2c';
const EXCLUSAO = 'POST /contas/eu/exclusao';
const EXPORTACAO = 'POST /contas/eu/exportacao';
const DADOS = {
  formato: 'trampo-ja.exportacao.v1',
  conta: { email: 'qa@exemplo.test' },
  conversas: [{ minhasMensagens: [{ texto: SENTINELA_DO_JSON }] }],
};
const tExcluir = textos.excluirConta;
const tExportar = textos.exportarDados;

/**
 * Textos e valores de propriedade da árvore, menos o `value` do próprio campo
 * de senha (é onde a senha vive, protegida por `secureTextEntry`).
 */
function valoresForaDoCampoSecreto(arvore: unknown): string[] {
  const achados: string[] = [];
  const visitar = (no: unknown) => {
    if (typeof no === 'string') {
      achados.push(no);
      return;
    }
    if (Array.isArray(no)) {
      for (const filho of no) visitar(filho);
      return;
    }
    if (typeof no !== 'object' || no === null) return;
    const { props, children } = no as {
      props?: Record<string, unknown>;
      children?: unknown;
    };
    const secreto = props?.secureTextEntry === true;
    for (const [nome, valor] of Object.entries(props ?? {})) {
      if (typeof valor !== 'string') continue;
      if (secreto && (nome === 'value' || nome === 'defaultValue')) continue;
      achados.push(valor);
    }
    visitar(children ?? []);
  };
  visitar(arvore);
  return achados;
}

/** O que a folha viu no arquivo no instante em que abriu. */
let visto: string[] = [];

beforeEach(() => {
  mockDisco.clear();
  mockGravacoes.length = 0;
  delete mockFalhas.apagar;
  visto = [];
  disponivel.mockReset().mockResolvedValue(true);
  folha.mockReset().mockImplementation(async (uri: string) => {
    visto.push(mockDisco.get(uri) ?? '<<sem arquivo>>');
  });
});

afterEach(async () => {
  await restaurarConexao();
});

const pedidos = (fetch: FetchFalso, rota: string) => {
  const [metodo = '', caminho = ''] = rota.split(' ');
  return requisicoesDe(fetch, metodo, caminho);
};

async function digitarSenha(rotulo: string, valor = SENHA) {
  await fireEvent.changeText(await screen.findByLabelText(rotulo), valor);
}

async function excluirComSenha() {
  await digitarSenha(tExcluir.senha);
  await fireEvent.press(screen.getByRole('button', { name: tExcluir.excluir }));
  await fireEvent.press(
    screen.getByRole('button', { name: tExcluir.dialogoConfirmar }),
  );
  await avancar(50);
}

/** Mundo + fetch que também responde a exclusão e a exportação. */
function mundoComConta(opcoes: Parameters<typeof criarMundo>[0] = {}) {
  const mundo = criarMundo(opcoes);
  const fetch = criarFetchDoMundo(mundo)
    .responder(EXCLUSAO, { status: 204 })
    .responder(EXPORTACAO, { corpo: DADOS });
  return { mundo, fetch };
}

describe('CA17/CA18 — a outra pessoa com a conversa aberta quando a conta some', () => {
  it('o polling recebe 404: "Conversa indisponível", sem campo, sem POST, sem novas buscas, e a conversa some da lista', async () => {
    const { mundo, fetch } = mundoComConta({
      mensagens: [
        { autor: FREELA, texto: textoDe(1) },
        { autor: AUTOR, texto: textoDe(2) },
      ],
    });
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: AUTOR.token });
    await screen.findByLabelText(new RegExp(`${textoDe(2)}$`));

    // A FREELA exclui a conta: a conversa e as mensagens somem, o perfil dá 404.
    mundo.conversas.length = 0;
    mundo.mensagens.length = 0;
    fetch.responder(`GET /perfis/${FREELA.id}`, {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await avancar(5_300);

    expect(
      await screen.findByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.conversas.campo)).toBeNull();
    expect(screen.queryAllByLabelText(/TEXTO-SENTINELA-/)).toHaveLength(0);
    expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);
    const gets = GETS_DAS_MENSAGENS(fetch).length;
    await avancar(180_000);
    expect(GETS_DAS_MENSAGENS(fetch)).toHaveLength(gets);
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(0);

    // Na lista (aba Conversas) a conversa não existe mais.
    await irPara('/conversas');
    expect(await screen.findByText(textos.conversas.vazio)).toBeOnTheScreen();
    expect(
      screen.queryAllByLabelText(linhaDaListaCom(null, null)),
    ).toHaveLength(0);
  });

  it('a lista de conversas aberta perde a linha no próximo ciclo de 30 s', async () => {
    const { mundo, fetch } = mundoComConta({
      mensagens: [{ autor: FREELA, texto: textoDe(1) }],
    });
    await abrirApp('/conversas', { fetch, token: AUTOR.token });
    expect(
      await screen.findByLabelText(linhaDaListaCom(FREELA.nome, textoDe(1))),
    ).toBeOnTheScreen();

    mundo.conversas.length = 0;
    mundo.mensagens.length = 0;
    await avancar(31_000);

    expect(await screen.findByText(textos.conversas.vazio)).toBeOnTheScreen();
    expect(screen.queryByText(FREELA.nome)).toBeNull();
  });
});

describe('CA18/D25 — trampo em andamento cuja candidatura aceita foi apagada', () => {
  const TRAMPO_EM_ANDAMENTO = {
    id: 't1',
    autorId: 'conta-autor',
    titulo: 'Pintar a sala',
    descricao: 'Duas demãos de tinta branca.',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 150000,
    prazo: null,
    status: 'em_andamento',
    criadoEm: '2026-10-01T12:00:00.000Z',
  };

  function fakeDoAutor(recebidas: readonly object[]): FetchFalso {
    return criarFetchDoMundo(criarMundo({ conversaAberta: false }))
      .responder('GET /trampos/t1', { corpo: TRAMPO_EM_ANDAMENTO })
      .responder('GET /trampos/meus', { corpo: [TRAMPO_EM_ANDAMENTO] })
      .responder('GET /trampos/t1/candidaturas', { corpo: recebidas });
  }

  it.each([
    ['sem nenhuma candidatura', []],
    [
      'só com uma recusada',
      [
        {
          id: 'k2',
          freelancerId: 'conta-estranha',
          mensagem: 'Mensagem de k2',
          valorPropostoCentavos: 15000,
          status: 'recusada',
          criadaEm: '2026-10-02T12:00:00.000Z',
        },
      ],
    ],
  ])(
    'o autor abre o detalhe, as recebidas e Meus anúncios %s, sem erro, sem código cru e sem botão de aceitar',
    async (_nome, recebidas) => {
      const fetch = fakeDoAutor(recebidas);
      await abrirApp('/trampos/t1', { fetch, token: AUTOR.token });

      expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
      expect(screen.getByText(textos.selos.emAndamento)).toBeOnTheScreen();
      expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);

      await irPara('/candidaturas/t1');
      expect(
        await screen.findByText(textos.candidaturasRecebidas.trampoEmAndamento),
      ).toBeOnTheScreen();
      expect(
        screen.queryAllByRole('button', { name: /^Aceitar candidatura/ }),
      ).toHaveLength(0);
      expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);

      await irPara('/meus-anuncios');
      expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
      expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);
    },
  );
});

describe('CA17 — sessão e navegação depois de excluir', () => {
  it('controle: sem exclusão, o mesmo 401 atrasado do polling expira a sessão', async () => {
    const { mundo, fetch } = mundoComConta({
      mensagens: [{ autor: FREELA, texto: textoDe(1) }],
    });
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: AUTOR.token });
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));
    mundo.demoraDoGetMs = 3_000;
    mundo.falhaDoGet = { status: 401, corpo: { erro: 'sessao_invalida' } };

    await avancar(5_100);
    await avancar(4_000);

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
  });

  it('um 401 atrasado do polling não troca "Sua conta foi excluída." por "sessão expirada"', async () => {
    const { mundo, fetch } = mundoComConta({
      mensagens: [{ autor: FREELA, texto: textoDe(1) }],
    });
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: AUTOR.token });
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));
    // O próximo GET do polling fica no ar e volta 401 (token já apagado no servidor).
    mundo.demoraDoGetMs = 3_000;
    mundo.falhaDoGet = { status: 401, corpo: { erro: 'sessao_invalida' } };
    await avancar(5_100);

    await irPara('/perfil/excluir');
    await excluirComSenha();
    await avancar(4_000);

    expect(
      await screen.findByText(textos.erros.conta_excluida),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.sessao_expirada)).toBeNull();
    expect(screen).toHavePathname('/entrar');
    expect(pedidos(fetch, 'DELETE /sessoes')).toHaveLength(0);
  });

  it('depois de excluir, uma rota logada não abre: o app fica na entrada e o aviso continua', async () => {
    const { fetch } = mundoComConta();
    const rotas = await abrirApp('/perfil/excluir', {
      fetch,
      token: AUTOR.token,
    });
    await excluirComSenha();
    expect(
      await screen.findByText(textos.erros.conta_excluida),
    ).toBeOnTheScreen();

    await act(async () => router.push('/perfil'));
    await act(async () => router.push('/conversas'));
    await avancar(50);

    expect(rotas.armazenamento.atual()).toBeNull();
    expect(screen.queryByText(textos.perfil.sair)).toBeNull();
    expect(screen).not.toHavePathname('/perfil');
    expect(screen).not.toHavePathname('/conversas');
  });

  it('outra conta que entra depois da exclusão cai no Início, não na tela da conta apagada, sem dados da anterior', async () => {
    const { fetch } = mundoComConta({
      mensagens: [{ autor: FREELA, texto: textoDe(1) }],
    });
    const rotas = await abrirApp('/perfil/excluir', {
      fetch,
      token: FREELA.token,
    });
    await excluirComSenha();
    await screen.findByText(textos.erros.conta_excluida);

    await entrarComo(ESTRANHO);

    expect(screen).toHavePathname('/');
    expect(screen.queryByText(textos.erros.conta_excluida)).toBeNull();
    expect(
      textosEPropriedades(screen.toJSON()).some((t) =>
        t.includes('SENTINELA-FREELA'),
      ),
    ).toBe(false);
    expect(rotas.armazenamento.atual()).toBe(ESTRANHO.token);
  });

  it('o aviso de conta excluída aparece uma vez só: depois de um novo cadastro e de sair, o login volta limpo', async () => {
    const { fetch } = mundoComConta();
    fetch.responder('POST /contas', {
      status: 201,
      corpo: { token: ESTRANHO.token },
    });
    await abrirApp('/perfil/excluir', { fetch, token: FREELA.token });
    await excluirComSenha();
    await screen.findByText(textos.erros.conta_excluida);

    // Cria uma conta nova com o mesmo e-mail (a exclusão liberou o e-mail).
    await act(async () => router.navigate('/cadastro'));
    await fireEvent.changeText(
      await screen.findByLabelText(textos.cadastro.email),
      FREELA.email,
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.cadastro.senha),
      'outra-senha-qa-123',
    );
    const criar = screen.getAllByRole('button', {
      name: textos.cadastro.criarConta,
    });
    await fireEvent.press(criar[criar.length - 1] as never);
    await screen.findByText(textos.editarPerfil.tituloCompletar);

    await act(async () => router.push('/perfil'));
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.sair }),
    );
    const confirmar = screen.getAllByRole('button', {
      name: textos.perfil.sairConfirmar,
    });
    await fireEvent.press(confirmar[confirmar.length - 1] as never);
    await avancar(100);

    await waitFor(() => expect(screen).toHavePathname('/entrar'));
    expect(screen.queryByText(textos.erros.conta_excluida)).toBeNull();
    expect(screen.queryByText(textos.erros.sessao_expirada)).toBeNull();
  });

  it('com a sessão já expirada (401 na exclusão), o login mostra "sessão expirada" e não "conta excluída"', async () => {
    const { fetch } = mundoComConta();
    fetch.responder(EXCLUSAO, {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });
    const rotas = await abrirApp('/perfil/excluir', {
      fetch,
      token: FREELA.token,
    });

    await excluirComSenha();

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.conta_excluida)).toBeNull();
    expect(rotas.armazenamento.atual()).toBeNull();
  });

  it.each([
    ['excluir', '/perfil/excluir', tExcluir.senha],
    ['exportar', '/perfil/exportar', tExportar.senha],
  ])(
    'o campo de senha de %s é protegido (secureTextEntry) e nunca leva a senha em rótulo',
    async (_nome, url, rotulo) => {
      const { fetch } = mundoComConta();
      await abrirApp(url, { fetch, token: FREELA.token });
      await digitarSenha(rotulo);

      const campo = screen.getByLabelText(rotulo);

      expect(campo.props.secureTextEntry).toBe(true);
      expect(
        valoresForaDoCampoSecreto(screen.toJSON()).filter((t) =>
          t.includes(SENHA),
        ),
      ).toEqual([]);
    },
  );
});

describe('CA19/CA24 — exportação com a folha de compartilhamento real', () => {
  async function gerar(fetch: FetchFalso) {
    const rotas = await abrirApp('/perfil/exportar', {
      fetch,
      token: FREELA.token,
    });
    await digitarSenha(tExportar.senha);
    await fireEvent.press(
      screen.getByRole('button', { name: tExportar.gerar }),
    );
    await avancar(100);
    return rotas;
  }

  function semRastroDoConteudo(rotas: {
    queryClient: import('@tanstack/react-query').QueryClient;
  }) {
    const caches = JSON.stringify([
      rotas.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state),
      rotas.queryClient
        .getMutationCache()
        .getAll()
        .map((m) => m.state),
    ]);
    expect(caches).not.toContain(SENHA);
    expect(caches).not.toContain(SENTINELA_DO_JSON);
    const arvore = valoresForaDoCampoSecreto(screen.toJSON());
    expect(arvore.filter((t) => t.includes(SENHA))).toEqual([]);
    expect(arvore.filter((t) => t.includes(SENTINELA_DO_JSON))).toEqual([]);
  }

  it('grava o JSON, a folha o vê, o arquivo é apagado e nada fica na tela nem no cache', async () => {
    const { fetch } = mundoComConta();

    const rotas = await gerar(fetch);

    expect(await screen.findByText(tExportar.gerado)).toBeOnTheScreen();
    expect(pedidos(fetch, EXPORTACAO)).toHaveLength(1);
    expect(pedidos(fetch, EXPORTACAO)[0]?.corpo).toEqual({ senha: SENHA });
    expect(folha).toHaveBeenCalledTimes(1);
    expect(visto).toHaveLength(1);
    expect(JSON.parse(visto[0] ?? '')).toEqual(DADOS);
    expect(folha.mock.calls[0]?.[1]).toMatchObject({
      mimeType: 'application/json',
    });
    expect([...mockDisco.keys()]).toEqual([]);
    expect(mockGravacoes).toHaveLength(1);
    expect(mockGravacoes[0]).toMatch(
      /^file:\/\/\/cache\/trampo-ja-meus-dados-\d{4}-\d{2}-\d{2}\.json$/,
    );
    expect(rotas.getPathnameWithParams()).not.toContain(SENHA);
    semRastroDoConteudo(rotas);
  });

  it('quando a folha falha: o arquivo é apagado, o aviso é o de indisponível e não sobra rastro', async () => {
    folha.mockImplementation(async (uri: string) => {
      visto.push(mockDisco.get(uri) ?? '<<sem arquivo>>');
      throw new Error(`falha da folha em ${SENTINELA_DO_JSON}`);
    });
    const { fetch } = mundoComConta();

    const rotas = await gerar(fetch);

    expect(
      await screen.findByText(textos.erros.compartilhamento_indisponivel),
    ).toBeOnTheScreen();
    expect(screen.queryByText(tExportar.gerado)).toBeNull();
    expect(visto).toHaveLength(1);
    expect([...mockDisco.keys()]).toEqual([]);
    semRastroDoConteudo(rotas);
  });

  it('sem folha no aparelho: nenhum arquivo é gravado', async () => {
    disponivel.mockResolvedValue(false);
    const { fetch } = mundoComConta();

    const rotas = await gerar(fetch);

    expect(
      await screen.findByText(textos.erros.compartilhamento_indisponivel),
    ).toBeOnTheScreen();
    expect(mockGravacoes).toHaveLength(0);
    expect(folha).not.toHaveBeenCalled();
    semRastroDoConteudo(rotas);
  });

  it('falha ao apagar o arquivo não vira erro na tela nem escreve no console', async () => {
    mockFalhas.apagar = new Error(`sem permissão para ${SENTINELA_DO_JSON}`);
    const { fetch } = mundoComConta();

    await gerar(fetch);

    expect(await screen.findByText(tExportar.gerado)).toBeOnTheScreen();
    expect(
      screen.queryByText(textos.erros.compartilhamento_indisponivel),
    ).toBeNull();
  });

  it('toque duplo com 50 ms de intervalo (como no aparelho): um POST, uma folha, um arquivo', async () => {
    const { fetch } = mundoComConta();
    fetch.responder(EXPORTACAO, { corpo: DADOS, demoraMs: 300 });
    await abrirApp('/perfil/exportar', { fetch, token: FREELA.token });
    await digitarSenha(tExportar.senha);
    const gerarBotao = screen.getByRole('button', { name: tExportar.gerar });

    await fireEvent.press(gerarBotao);
    await avancar(50);
    await fireEvent.press(gerarBotao);
    await avancar(500);

    expect(await screen.findByText(tExportar.gerado)).toBeOnTheScreen();
    expect(pedidos(fetch, EXPORTACAO)).toHaveLength(1);
    expect(folha).toHaveBeenCalledTimes(1);
    expect(mockGravacoes).toHaveLength(1);
    expect([...mockDisco.keys()]).toEqual([]);
  });

  it('"Gerar de novo" repete o ciclo inteiro e o disco continua vazio', async () => {
    const { fetch } = mundoComConta();
    await gerar(fetch);
    await screen.findByText(tExportar.gerado);

    // Depois de compartilhar, a senha sai do campo (S7): digita de novo.
    await digitarSenha(tExportar.senha);
    await fireEvent.press(
      screen.getByRole('button', { name: tExportar.gerarDeNovo }),
    );
    await avancar(100);

    expect(pedidos(fetch, EXPORTACAO)).toHaveLength(2);
    expect(folha).toHaveBeenCalledTimes(2);
    expect(mockGravacoes).toHaveLength(2);
    expect([...mockDisco.keys()]).toEqual([]);
  });

  it('senha errada e depois certa: nada é gravado no erro e o aviso some ao digitar de novo', async () => {
    const { fetch } = mundoComConta();
    fetch.responder(EXPORTACAO, [
      { status: 403, corpo: { erro: 'senha_incorreta' } },
      { corpo: DADOS },
    ]);
    await gerar(fetch);
    expect(
      await screen.findByText(textos.erros.senha_incorreta),
    ).toBeOnTheScreen();
    expect(mockGravacoes).toHaveLength(0);

    await digitarSenha(tExportar.senha, 'outra-senha-certa-1');
    expect(screen.queryByText(textos.erros.senha_incorreta)).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: tExportar.gerar }),
    );
    await avancar(100);

    expect(await screen.findByText(tExportar.gerado)).toBeOnTheScreen();
    expect(pedidos(fetch, EXPORTACAO)).toHaveLength(2);
    expect([...mockDisco.keys()]).toEqual([]);
  });

  it('com a folha aberta, a conta é excluída por outro caminho (sessão cai): o arquivo é apagado quando a folha fecha e não há aviso de erro', async () => {
    let fecharFolha: () => void = () => undefined;
    folha.mockImplementation(async (uri: string) => {
      visto.push(mockDisco.get(uri) ?? '<<sem arquivo>>');
      await new Promise<void>((resolver) => {
        fecharFolha = resolver;
      });
    });
    const { fetch } = mundoComConta();
    await abrirApp('/perfil/exportar', { fetch, token: FREELA.token });
    await digitarSenha(tExportar.senha);
    await fireEvent.press(
      screen.getByRole('button', { name: tExportar.gerar }),
    );
    await avancar(100);
    expect(visto).toHaveLength(1);
    expect([...mockDisco.keys()]).toHaveLength(1);

    // Outro pedido recebe 401: a sessão expira enquanto a folha está aberta.
    fetch.responder('GET /conversas', {
      status: 401,
      corpo: { erro: 'sessao_invalida' },
    });
    await act(async () => router.push('/conversas'));
    await avancar(100);
    await act(async () => fecharFolha());
    await avancar(100);

    expect([...mockDisco.keys()]).toEqual([]);
    expect(
      screen.queryByText(textos.erros.compartilhamento_indisponivel),
    ).toBeNull();
  });
});

describe('CA24 — os gerenciadores globais não deixam a senha em lugar nenhum', () => {
  it('depois de exportar e excluir na mesma sessão, nenhum cache, URL ou texto tem a senha ou o JSON', async () => {
    const desligar = ligarGerenciadores();
    try {
      const { fetch } = mundoComConta();
      const rotas = await abrirApp('/perfil/conta', {
        fetch,
        token: FREELA.token,
      });
      await fireEvent.press(
        await screen.findByRole('button', {
          name: new RegExp(`^${textos.contaEPrivacidade.exportar}`),
        }),
      );
      await digitarSenha(tExportar.senha);
      await fireEvent.press(
        screen.getByRole('button', { name: tExportar.gerar }),
      );
      await avancar(100);
      await screen.findByText(tExportar.gerado);
      await act(async () => router.back());
      await irPara('/perfil/excluir');

      await excluirComSenha();

      await screen.findByText(textos.erros.conta_excluida);
      const tudo = JSON.stringify([
        rotas.queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state),
        rotas.queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state),
        rotas.getPathnameWithParams(),
        textosEPropriedades(screen.toJSON()),
      ]);
      expect(tudo).not.toContain(SENHA);
      expect(tudo).not.toContain(SENTINELA_DO_JSON);
      expect([...mockDisco.keys()]).toEqual([]);
      expect(rotas.armazenamento.atual()).toBeNull();
    } finally {
      desligar();
    }
  });
});

// `criarFetchFalso` só é usado nos tipos; mantém o import explícito.
void criarFetchFalso;
