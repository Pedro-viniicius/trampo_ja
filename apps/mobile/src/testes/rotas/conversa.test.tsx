// Etapa 7 da 2c: rota da conversa (CA12, CA15, CA16) contra o fetch falso:
// ordem e autoria das bolhas, envio com pendente, reconciliação sem
// duplicata, reenvio depois de um GET, polling só com a tela focada, 404,
// sem conexão e 401.
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import type { Mensagem } from '../../api/tipos';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import RotaDaConversa from '../../app/(app)/conversas/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { chaves } from '../../estado/consultas/chaves';
import { INTERVALO_DO_POLLING_MS } from '../../estado/consultas/conversas';
import { textos } from '../../textos/pt-BR';
import {
  criarFetchFalso,
  type FetchFalso,
  type RequisicaoFeita,
  type RespostaFalsa,
} from '../fetch-falso';
import { criarQueryClientDeTeste } from '../renderizar';
import {
  type MapaDeRotas,
  type RotasRenderizadas,
  renderizarRotas,
  TOKEN_DE_TESTE,
} from './apoio';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
}));

// --- Dados (sentinelas genéricas no lugar de nome e texto, CA15) ---

const EU = 'conta-eu';
const OUTRO = 'conta-outra';
const CAMINHO = '/conversas/c1/mensagens';
const NOME_DO_OUTRO = 'NOME-SENTINELA';
const ENVIADA_EM = '2026-10-21T10:00:00.000Z';

const PERFIL_DO_OUTRO = {
  contaId: OUTRO,
  nome: NOME_DO_OUTRO,
  cidade: 'Lavras',
  descricao: null,
  habilidades: [],
};

const RESUMO = {
  conversaId: 'c1',
  outroUsuarioId: OUTRO,
  criadaEm: '2026-10-21T09:00:00.000Z',
  ultimaMensagem: null,
};

function texto(n: number | string): string {
  return `TEXTO-SENTINELA-${n}`;
}

function mensagem(n: number, autorId: string): Mensagem {
  return { id: `m${n}`, autorId, texto: texto(n), enviadaEm: ENVIADA_EM };
}

/** Do outro, minha, do outro: a ordem de envio que a API devolve. */
const INICIAIS: readonly Mensagem[] = [
  mensagem(1, OUTRO),
  mensagem(2, EU),
  mensagem(3, OUTRO),
];

type ModoDoPost = 'ok' | 'perdida' | 'falha' | 'nao_encontrada' | 'expirada';

/**
 * Imita as mensagens da API: `GET` com `depoisDe` (400 com cursor
 * desconhecido) e `POST` que grava e devolve `{id, enviadaEm}`. O `modo` do
 * POST simula a resposta perdida (grava e falha a rede), a falha antes de
 * chegar, o 404 e o 401.
 */
function criarServidor(iniciais: readonly Mensagem[] = INICIAIS) {
  const servidor = {
    mensagens: [...iniciais],
    falhaDoGet: null as RespostaFalsa | null,
    modo: 'ok' as ModoDoPost,
    demoraDoPostMs: 0,
    demoraDoGetMs: 0,
    proximo: 100,
    get(requisicao: RequisicaoFeita): RespostaFalsa {
      const demora =
        servidor.demoraDoGetMs > 0 ? { demoraMs: servidor.demoraDoGetMs } : {};
      if (servidor.falhaDoGet !== null) {
        return { ...servidor.falhaDoGet, ...demora };
      }
      const { depoisDe } = requisicao.query;
      let inicio = 0;
      if (depoisDe !== undefined) {
        const indice = servidor.mensagens.findIndex((m) => m.id === depoisDe);
        if (indice < 0) {
          return { status: 400, corpo: { erro: 'dados_invalidos' } };
        }
        inicio = indice + 1;
      }
      return {
        corpo: servidor.mensagens.slice(inicio, inicio + 50),
        ...demora,
      };
    },
    post(requisicao: RequisicaoFeita): RespostaFalsa {
      const demora =
        servidor.demoraDoPostMs > 0
          ? { demoraMs: servidor.demoraDoPostMs }
          : {};
      switch (servidor.modo) {
        case 'falha':
          return { falhaDeRede: true, ...demora };
        case 'nao_encontrada':
          return { status: 404, corpo: { erro: 'nao_encontrado' }, ...demora };
        case 'expirada':
          return { status: 401, corpo: { erro: 'sessao_expirada' }, ...demora };
        default:
          break;
      }
      const { texto: recebido } = requisicao.corpo as { texto: string };
      const nova: Mensagem = {
        id: `m${servidor.proximo}`,
        autorId: EU,
        texto: recebido,
        enviadaEm: ENVIADA_EM,
      };
      servidor.proximo += 1;
      servidor.mensagens.push(nova);
      return servidor.modo === 'perdida'
        ? { falhaDeRede: true, ...demora }
        : {
            status: 201,
            corpo: { id: nova.id, enviadaEm: nova.enviadaEm },
            ...demora,
          };
    },
  };
  return servidor;
}

type Servidor = ReturnType<typeof criarServidor>;

// --- Rotas e apoio ---

function stub(rotulo: string) {
  return function Stub() {
    return <Text>{rotulo}</Text>;
  };
}

const ROTAS: MapaDeRotas = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/index': stub('stub: início'),
  '(app)/(abas)/conversas': stub('stub: conversas'),
  '(app)/conversas/[id]': RotaDaConversa,
  '(app)/perfis/[contaId]': stub('stub: perfil público'),
};

function criarFake(servidor: Servidor): FetchFalso {
  return criarFetchFalso()
    .responder('GET /conversas', { corpo: [RESUMO] })
    .responder(`GET /perfis/${OUTRO}`, { corpo: PERFIL_DO_OUTRO })
    .responder(`GET ${CAMINHO}`, (r) => servidor.get(r))
    .responder(`POST ${CAMINHO}`, (r) => servidor.post(r));
}

/** As rotas do teste em curso (para ler a URL com os parâmetros). */
let rotasAbertas: RotasRenderizadas | null = null;

async function abrir(
  servidor: Servidor = criarServidor(),
  { url = '/conversas/c1', fetch = criarFake(servidor) } = {},
) {
  const resultado = await renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
  rotasAbertas = resultado;
  return { ...resultado, servidor };
}

/** Abre e espera a carga inicial (as três mensagens). */
async function abrirCarregada(servidor: Servidor = criarServidor()) {
  const aberto = await abrir(servidor);
  await screen.findByLabelText(new RegExp(texto(3)));
  return aberto;
}

function requisicoes(fetch: FetchFalso, metodo: string) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === CAMINHO,
  );
}

/** Avança os timers falsos e deixa terminar o que a última volta disparou. */
async function avancar(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(20);
  });
}

/** Rótulos acessíveis das bolhas, na ordem da tela. */
function rotulosDasBolhas(): string[] {
  return screen
    .queryAllByLabelText(/TEXTO-SENTINELA-/)
    .map((el) => String(el.props.accessibilityLabel));
}

/** Bolhas que mostram o texto `n` (deve ser no máximo uma). */
function bolhasCom(n: number | string) {
  return screen.queryAllByLabelText(new RegExp(`${texto(n)}$`));
}

function campo() {
  return screen.getByLabelText(textos.conversas.campo);
}

function botaoEnviar() {
  return screen.getByRole('button', { name: textos.conversas.enviar });
}

async function escrever(valor: string) {
  await fireEvent.changeText(campo(), valor);
}

interface Fibra {
  readonly memoizedProps?: { readonly onPress?: unknown } | null;
  readonly return: Fibra | null;
}

/**
 * Chama o `onPress` do botão (o mesmo fechamento, como no aparelho) `vezes`
 * vezes num só `act`, antes de a tela redesenhar. Também prova a guarda da
 * rota com o botão desabilitado, que o `fireEvent` ignoraria.
 */
async function tocarNoMesmoTick(elemento: object, vezes = 2) {
  let fibra = (elemento as { unstable_fiber?: Fibra }).unstable_fiber ?? null;
  while (fibra !== null && typeof fibra.memoizedProps?.onPress !== 'function') {
    fibra = fibra.return;
  }
  const onPress = fibra?.memoizedProps?.onPress;
  if (typeof onPress !== 'function') {
    throw new Error('botão sem onPress');
  }
  await act(async () => {
    for (let i = 0; i < vezes; i += 1) {
      onPress();
    }
  });
}

/** Nada de código cru da API nem `erro.message` na tela. */
function semTextoCruDeErro() {
  expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);
  expect(screen.queryAllByText(/Network request failed|Aborted/i)).toHaveLength(
    0,
  );
}

/** CA15: nome e texto nunca em `testID` nem na URL. */
function semDadoPessoalForaDaTela() {
  expect(screen.queryAllByTestId(/SENTINELA/)).toHaveLength(0);
  expect(screen).toHavePathname('/conversas/c1');
  expect(rotasAbertas?.getPathnameWithParams()).toBe('/conversas/c1');
}

// --- CA15: nada no `console` ---

const METODOS_DO_CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;
let chamadasDoConsole: unknown[][] = [];

beforeEach(() => {
  chamadasDoConsole = [];
  for (const metodo of METODOS_DO_CONSOLE) {
    jest.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      chamadasDoConsole.push(args);
    });
  }
});

afterEach(async () => {
  await act(async () => {
    onlineManager.setOnline(true);
  });
  const chamadas = chamadasDoConsole;
  jest.restoreAllMocks();
  expect(chamadas).toEqual([]);
});

// --- Testes ---

describe('conversa: leitura (CA12, CA16)', () => {
  it('mostra as mensagens em ordem, com as minhas e as do outro, e o nome no título', async () => {
    await abrirCarregada();

    expect(await screen.findByText(NOME_DO_OUTRO)).toBeOnTheScreen();
    const rotulos = rotulosDasBolhas();
    expect(rotulos).toHaveLength(3);
    expect(rotulos[0]).toMatch(
      new RegExp(`^${NOME_DO_OUTRO}, .+\\. ${texto(1)}$`),
    );
    expect(rotulos[1]).toMatch(new RegExp(`^Você, .+\\. ${texto(2)}$`));
    expect(rotulos[2]).toMatch(
      new RegExp(`^${NOME_DO_OUTRO}, .+\\. ${texto(3)}$`),
    );
    expect(botaoEnviar()).toBeDisabled();
    semDadoPessoalForaDaTela();
  });

  it('conversa sem mensagens mostra o vazio da tela', async () => {
    await abrir(criarServidor([]));

    expect(
      await screen.findByText(textos.conversas.semMensagens),
    ).toBeOnTheScreen();
  });

  it('perfil do outro em 404: título "Perfil indisponível" e "Outra pessoa" nas bolhas dele (R4)', async () => {
    const servidor = criarServidor();
    const fetch = criarFake(servidor).responder(`GET /perfis/${OUTRO}`, {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir(servidor, { fetch });
    await screen.findByLabelText(new RegExp(texto(3)));

    expect(
      screen.getByText(textos.conversas.perfilIndisponivel),
    ).toBeOnTheScreen();
    expect(screen.queryByText(NOME_DO_OUTRO)).toBeNull();
    // A bolha do outro não leva o título ("Perfil indisponível") como nome.
    const semNome = textos.conversas.deNome(null, null);
    const rotulos = rotulosDasBolhas();
    expect(rotulos[0]).toMatch(new RegExp(`^${semNome}, .+\\. ${texto(1)}$`));
    expect(rotulos[2]).toMatch(new RegExp(`^${semNome}, .+\\. ${texto(3)}$`));
  });

  it('a nova mensagem do outro aparece no ciclo seguinte do polling', async () => {
    const { servidor, fetch } = await abrirCarregada();
    servidor.mensagens.push(mensagem(4, OUTRO));

    await avancar(INTERVALO_DO_POLLING_MS);

    expect(bolhasCom(4)).toHaveLength(1);
    expect(requisicoes(fetch, 'GET').at(-1)?.query).toEqual({
      depoisDe: 'm3',
    });
  });

  it('três falhas seguidas do polling mostram o aviso, sem esconder as mensagens', async () => {
    const { servidor } = await abrirCarregada();
    servidor.falhaDoGet = { status: 500, corpo: { erro: 'erro_interno' } };

    // Backoff: 5 s, depois 10 s e 20 s.
    await avancar(5_000);
    await avancar(10_000);
    expect(screen.queryByText(textos.conversas.atualizacaoFalhando)).toBeNull();
    await avancar(20_000);

    expect(
      screen.getByText(textos.conversas.atualizacaoFalhando),
    ).toBeOnTheScreen();
    expect(rotulosDasBolhas()).toHaveLength(3);
    semTextoCruDeErro();

    servidor.falhaDoGet = null;
    await avancar(40_000);
    expect(screen.queryByText(textos.conversas.atualizacaoFalhando)).toBeNull();
  });

  it('erro na carga inicial: mensagem traduzida e "Tentar de novo"', async () => {
    const servidor = criarServidor();
    servidor.falhaDoGet = { status: 500, corpo: { erro: 'erro_interno' } };
    const { fetch } = await abrir(servidor);

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.conversas.semMensagens)).toBeNull();
    semTextoCruDeErro();

    servidor.falhaDoGet = null;
    fetch.limparRequisicoes();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(await screen.findByLabelText(new RegExp(texto(3)))).toBeTruthy();
  });
});

describe('conversa: envio (CA12)', () => {
  it('relógio, depois enviada, e a pendente some quando o GET traz o id, sem duplicata', async () => {
    const servidor = criarServidor();
    const { fetch } = await abrirCarregada(servidor);
    servidor.demoraDoPostMs = 1_000;

    await escrever(`  ${texto('nova')}  `);
    expect(botaoEnviar()).toBeEnabled();
    await fireEvent.press(botaoEnviar());

    // Campo limpo na hora e a bolha com o relógio.
    expect(campo()).toHaveDisplayValue('');
    expect(bolhasCom('nova')).toHaveLength(1);
    expect(bolhasCom('nova')[0]?.props.accessibilityLabel).toBe(
      `Você. ${textos.conversas.rotuloEnviando}. ${texto('nova')}`,
    );
    expect(screen.getByText(textos.conversas.rotuloEnviando)).toBeOnTheScreen();

    // O 201 chega; o GET que a invalidação puxa demora: a pendente fica
    // "enviada" (com hora) e não duplica.
    servidor.demoraDoGetMs = 1_000;
    await avancar(1_000);
    expect(bolhasCom('nova')).toHaveLength(1);
    expect(bolhasCom('nova')[0]?.props.accessibilityLabel).toMatch(
      new RegExp(`^Você, .+\\. ${texto('nova')}$`),
    );
    expect(screen.queryByText(textos.conversas.rotuloEnviando)).toBeNull();

    // O GET traz o id: uma bolha só, também nos ciclos seguintes.
    await avancar(1_000);
    servidor.demoraDoGetMs = 0;
    await avancar(INTERVALO_DO_POLLING_MS * 2);
    expect(bolhasCom('nova')).toHaveLength(1);
    expect(rotulosDasBolhas()).toHaveLength(4);

    const posts = requisicoes(fetch, 'POST');
    expect(posts).toHaveLength(1);
    // O texto vai aparado e o corpo leva só `{texto}`.
    expect(posts[0]?.corpo).toEqual({ texto: texto('nova') });
    semDadoPessoalForaDaTela();
  });

  it('duplo toque no "Enviar" gera um POST só', async () => {
    const { fetch } = await abrirCarregada();
    await escrever(texto('dupla'));

    await tocarNoMesmoTick(botaoEnviar());
    await avancar(100);

    expect(requisicoes(fetch, 'POST')).toHaveLength(1);
    expect(bolhasCom('dupla')).toHaveLength(1);
  });

  it('"Enviar" só com espaços fica desabilitado e não gera POST', async () => {
    const { fetch } = await abrirCarregada();
    await escrever('   \n  ');

    expect(botaoEnviar()).toBeDisabled();
    await tocarNoMesmoTick(botaoEnviar(), 1);
    await avancar(100);

    expect(requisicoes(fetch, 'POST')).toHaveLength(0);
    expect(campo()).toHaveDisplayValue('   \n  ');
  });

  it('antes da carga inicial terminar, "Enviar" fica desabilitado', async () => {
    const servidor = criarServidor();
    servidor.demoraDoGetMs = 60_000;
    const { fetch } = await abrir(servidor);
    await screen.findByLabelText(textos.conversas.campo);
    await escrever(texto('cedo'));

    expect(botaoEnviar()).toBeDisabled();
    await tocarNoMesmoTick(botaoEnviar(), 1);
    expect(requisicoes(fetch, 'POST')).toHaveLength(0);
  });

  describe('queda de rede no envio', () => {
    async function enviarComFalha(modo: ModoDoPost) {
      const aberto = await abrirCarregada();
      aberto.servidor.modo = modo;
      await escrever(texto('caiu'));
      await fireEvent.press(botaoEnviar());
      const bolha = await screen.findByRole('button', {
        name: new RegExp(
          `${textos.conversas.rotuloNaoEnviada}\\. ${texto('caiu')}$`,
        ),
      });
      expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
      semTextoCruDeErro();
      aberto.servidor.modo = 'ok';
      aberto.fetch.limparRequisicoes();
      return { ...aberto, bolha };
    }

    it('a mensagem já tinha chegado: o toque faz o GET e nenhum POST', async () => {
      const { fetch, bolha } = await enviarComFalha('perdida');

      await fireEvent.press(bolha);
      await avancar(100);

      expect(requisicoes(fetch, 'GET')).toHaveLength(1);
      expect(requisicoes(fetch, 'POST')).toHaveLength(0);
      expect(bolhasCom('caiu')).toHaveLength(1);
      expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
      expect(screen.queryByText(textos.conversas.rotuloEnviando)).toBeNull();

      // E não volta a aparecer como pendente nos ciclos seguintes.
      await avancar(INTERVALO_DO_POLLING_MS * 2);
      expect(bolhasCom('caiu')).toHaveLength(1);
      expect(requisicoes(fetch, 'POST')).toHaveLength(0);
    });

    it('a mensagem não tinha chegado: o toque faz o GET e depois um POST', async () => {
      const { fetch, bolha } = await enviarComFalha('falha');

      await fireEvent.press(bolha);
      await avancar(100);

      const metodos = fetch.requisicoes
        .filter((r) => r.caminho === CAMINHO)
        .map((r) => r.metodo);
      expect(metodos.slice(0, 2)).toEqual(['GET', 'POST']);
      expect(requisicoes(fetch, 'POST')).toHaveLength(1);
      expect(requisicoes(fetch, 'POST')[0]?.corpo).toEqual({
        texto: texto('caiu'),
      });
      await avancar(INTERVALO_DO_POLLING_MS);
      expect(bolhasCom('caiu')).toHaveLength(1);
      expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    });

    it('texto igual a uma mensagem minha antiga: a falha não é dada como entregue', async () => {
      const { servidor, fetch } = await abrirCarregada();
      servidor.modo = 'falha';
      await escrever(texto(2));
      await fireEvent.press(botaoEnviar());

      expect(
        await screen.findByText(textos.conversas.naoEnviada),
      ).toBeOnTheScreen();
      expect(bolhasCom(2)).toHaveLength(2);

      servidor.modo = 'ok';
      fetch.limparRequisicoes();
      await fireEvent.press(
        screen.getByRole('button', { name: new RegExp(`${texto(2)}$`) }),
      );
      await avancar(INTERVALO_DO_POLLING_MS);
      expect(requisicoes(fetch, 'POST')).toHaveLength(1);
      expect(bolhasCom(2)).toHaveLength(2);
      expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    });

    it('duplo toque na bolha que falhou: um GET e um POST', async () => {
      const { fetch, bolha } = await enviarComFalha('falha');

      await tocarNoMesmoTick(bolha);
      await avancar(100);

      expect(requisicoes(fetch, 'POST')).toHaveLength(1);
      expect(bolhasCom('caiu')).toHaveLength(1);
    });

    it('o GET antes do reenvio também falha: continua "Não enviada" e nenhum POST', async () => {
      const { fetch, bolha, servidor } = await enviarComFalha('falha');
      servidor.falhaDoGet = { falhaDeRede: true };

      await fireEvent.press(bolha);
      await avancar(100);

      expect(requisicoes(fetch, 'GET')).toHaveLength(1);
      expect(requisicoes(fetch, 'POST')).toHaveLength(0);
      expect(
        screen.getByRole('button', {
          name: new RegExp(`${texto('caiu')}$`),
        }),
      ).toBeOnTheScreen();
      expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
    });
  });
});

describe('conversa: polling e foco (CA12)', () => {
  it('com a conversa aberta, `GET /conversas` não se repete em 60 s', async () => {
    const { fetch } = await abrirCarregada();
    fetch.limparRequisicoes();

    // O ciclo de 30 s da lista é da aba Conversas; aqui só as mensagens.
    await avancar(60_000);

    expect(
      fetch.requisicoes.filter(
        (r) => r.metodo === 'GET' && r.caminho === '/conversas',
      ),
    ).toHaveLength(0);
    expect(requisicoes(fetch, 'GET').length).toBeGreaterThan(0);
  });

  it('para ao abrir outra rota por cima e volta ao retornar', async () => {
    const { fetch } = await abrirCarregada();

    await act(async () => {
      router.push({
        pathname: '/perfis/[contaId]',
        params: { contaId: OUTRO },
      });
    });
    await waitFor(() => expect(screen).toHavePathname(`/perfis/${OUTRO}`));
    fetch.limparRequisicoes();

    await avancar(INTERVALO_DO_POLLING_MS * 4);
    expect(requisicoes(fetch, 'GET')).toHaveLength(0);

    await act(async () => {
      router.back();
    });
    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(requisicoes(fetch, 'GET').length).toBeGreaterThanOrEqual(1);
  });
});

describe('conversa: indisponível (CA12)', () => {
  it('404 nas mensagens: aviso e "Voltar"', async () => {
    const servidor = criarServidor();
    servidor.falhaDoGet = { status: 404, corpo: { erro: 'nao_encontrado' } };
    const { fetch } = await abrir(servidor);

    expect(
      await screen.findByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();
    semTextoCruDeErro();

    // O polling para no 404.
    fetch.limparRequisicoes();
    await avancar(INTERVALO_DO_POLLING_MS * 3);
    expect(requisicoes(fetch, 'GET')).toHaveLength(0);

    const voltar = screen.getAllByRole('button', {
      name: textos.gerais.voltar,
    });
    // O do cabeçalho e o da tela de aviso.
    expect(voltar).toHaveLength(2);
    const acao = voltar.at(-1);
    if (acao === undefined) {
      throw new Error('sem "Voltar" na tela de aviso');
    }
    // Sem histórico (aberta direto), "Voltar" cai na aba Conversas.
    await fireEvent.press(acao);
    await waitFor(() => expect(screen).toHavePathname('/conversas'));
    expect(await screen.findByText('stub: conversas')).toBeOnTheScreen();
  });

  it('conversa fora da lista: aviso, sem campo de mensagem', async () => {
    const servidor = criarServidor();
    const fetch = criarFake(servidor).responder('GET /conversas', {
      corpo: [],
    });
    await abrir(servidor, { fetch });

    expect(
      await screen.findByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.conversas.campo)).toBeNull();
  });

  describe('lista em cache sem a conversa (Q1/R1)', () => {
    /** Cache com a lista sem `c1`, respondida há `idadeMs`. */
    function clienteComListaSemAConversa(idadeMs: number) {
      const queryClient = criarQueryClientDeTeste();
      queryClient.setQueryData(chaves.conversas(), [], {
        updatedAt: Date.now() - idadeMs,
      });
      return queryClient;
    }

    async function abrirComCache(
      servidor: Servidor,
      fetch: FetchFalso,
      queryClient: ReturnType<typeof criarQueryClientDeTeste>,
    ) {
      rotasAbertas = await renderizarRotas(ROTAS, {
        initialUrl: '/conversas/c1',
        fetch,
        armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
        queryClient,
      });
      return { servidor, fetch };
    }

    it('GET /conversas em 500: erro com "Tentar de novo", não "indisponível"; o toque recarrega lista e mensagens', async () => {
      const servidor = criarServidor();
      let listaFalha = true;
      const fetch = criarFake(servidor).responder('GET /conversas', () =>
        listaFalha
          ? { status: 500, corpo: { erro: 'erro_interno' } }
          : { corpo: [RESUMO] },
      );
      await abrirComCache(servidor, fetch, clienteComListaSemAConversa(60_000));

      expect(
        await screen.findByText(textos.erros.erro_servidor),
      ).toBeOnTheScreen();
      expect(
        screen.queryByText(textos.conversas.indisponivelTitulo),
      ).toBeNull();
      semTextoCruDeErro();
      // O erro não vira "indisponível" com o tempo.
      await avancar(INTERVALO_DO_POLLING_MS * 3);
      expect(
        screen.queryByText(textos.conversas.indisponivelTitulo),
      ).toBeNull();
      expect(screen.getByText(textos.erros.erro_servidor)).toBeOnTheScreen();

      listaFalha = false;
      fetch.limparRequisicoes();
      await fireEvent.press(
        screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
      );

      expect(await screen.findByLabelText(new RegExp(texto(3)))).toBeTruthy();
      expect(
        fetch.requisicoes.filter(
          (r) => r.metodo === 'GET' && r.caminho === '/conversas',
        ),
      ).toHaveLength(1);
      expect(requisicoes(fetch, 'GET').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(NOME_DO_OUTRO)).toBeOnTheScreen();
    });

    it('lista fresca sem a conversa: pede a lista de novo e não mostra "indisponível" enquanto ela não chega', async () => {
      const servidor = criarServidor();
      const fetch = criarFake(servidor).responder('GET /conversas', {
        corpo: [RESUMO],
        demoraMs: 3_000,
      });
      await abrirComCache(servidor, fetch, clienteComListaSemAConversa(0));

      for (let i = 0; i < 5; i += 1) {
        await avancar(500);
        expect(
          screen.queryByText(textos.conversas.indisponivelTitulo),
        ).toBeNull();
      }
      expect(await screen.findByLabelText(new RegExp(texto(3)))).toBeTruthy();
      expect(
        fetch.requisicoes.filter(
          (r) => r.metodo === 'GET' && r.caminho === '/conversas',
        ),
      ).toHaveLength(1);
    });

    it('lista recarregada depois da abertura sem a conversa: "indisponível"', async () => {
      const servidor = criarServidor();
      const fetch = criarFake(servidor).responder('GET /conversas', {
        corpo: [],
      });
      await abrirComCache(servidor, fetch, clienteComListaSemAConversa(0));

      expect(
        await screen.findByText(textos.conversas.indisponivelTitulo),
      ).toBeOnTheScreen();
      expect(screen.queryByLabelText(textos.conversas.campo)).toBeNull();
    });
  });

  it('404 no envio: aviso', async () => {
    const { servidor } = await abrirCarregada();
    servidor.modo = 'nao_encontrada';
    await escrever(texto('alheia'));
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();
    semTextoCruDeErro();
  });
});

describe('conversa: sem conexão (CA12)', () => {
  it('na abertura: motivo no campo e nada de "vazio"', async () => {
    onlineManager.setOnline(false);
    const { fetch } = await abrir();

    expect(
      await screen.findByText(textos.conversas.semConexaoNoCampo),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.conversas.semMensagens)).toBeNull();
    expect(requisicoes(fetch, 'GET')).toHaveLength(0);
  });

  it('a conexão cai: motivo, rascunho mantido e "Enviar" desabilitado; volta e envia', async () => {
    const { fetch } = await abrirCarregada();
    await act(async () => {
      onlineManager.setOnline(false);
    });
    await escrever(texto('offline'));

    expect(
      screen.getByText(textos.conversas.semConexaoNoCampo),
    ).toBeOnTheScreen();
    expect(botaoEnviar()).toBeDisabled();
    await tocarNoMesmoTick(botaoEnviar(), 1);
    expect(requisicoes(fetch, 'POST')).toHaveLength(0);
    expect(campo()).toHaveDisplayValue(texto('offline'));
    // As mensagens já carregadas continuam na tela.
    expect(rotulosDasBolhas()).toHaveLength(3);

    await act(async () => {
      onlineManager.setOnline(true);
    });
    expect(screen.queryByText(textos.conversas.semConexaoNoCampo)).toBeNull();
    await fireEvent.press(botaoEnviar());
    await avancar(100);
    expect(requisicoes(fetch, 'POST')).toHaveLength(1);
  });
});

describe('conversa: sessão expirada (CA12)', () => {
  it('401 no polling leva ao login', async () => {
    const { servidor, armazenamento } = await abrirCarregada();
    servidor.falhaDoGet = { status: 401, corpo: { erro: 'sessao_expirada' } };

    await avancar(INTERVALO_DO_POLLING_MS);

    await waitFor(() => expect(screen).toHavePathname('/entrar'));
    expect(armazenamento.atual()).toBeNull();
    expect(screen.queryByText(/SENTINELA/)).toBeNull();
  });

  it('401 no envio leva ao login', async () => {
    const { servidor, armazenamento, fetch } = await abrirCarregada();
    servidor.modo = 'expirada';
    await escrever(texto('expirada'));
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    await waitFor(() => expect(screen).toHavePathname('/entrar'));
    expect(armazenamento.atual()).toBeNull();
    expect(requisicoes(fetch, 'POST')).toHaveLength(1);
  });
});
