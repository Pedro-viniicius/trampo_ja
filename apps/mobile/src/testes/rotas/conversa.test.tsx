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
import {
  INTERVALO_DO_POLLING_MS,
  TETO_DE_MENSAGENS_NO_CACHE,
} from '../../estado/consultas/conversas';
import type { MensagemParaExibir } from '../../telas/tipos';
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
/** Instante da mensagem `m0`; cada mensagem seguinte vem 2 min depois. */
const INICIO_DAS_MENSAGENS = Date.parse('2026-10-21T10:00:00.000Z');
/** Maior que a janela de releitura (60 s, D48): o cursor é a penúltima. */
const ENTRE_MENSAGENS_MS = 2 * 60_000;

function enviadaEm(n: number): string {
  return new Date(INICIO_DAS_MENSAGENS + n * ENTRE_MENSAGENS_MS).toISOString();
}

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
  return { id: `m${n}`, autorId, texto: texto(n), enviadaEm: enviadaEm(n) };
}

/** Do outro, minha, do outro: a ordem de envio que a API devolve. */
const INICIAIS: readonly Mensagem[] = [
  mensagem(1, OUTRO),
  mensagem(2, EU),
  mensagem(3, OUTRO),
];

type ModoDoPost =
  | 'ok'
  | 'perdida'
  | 'falha'
  | 'nao_encontrada'
  | 'expirada'
  | 'limite';

/**
 * Imita as mensagens da API: `GET` com `depoisDe` (400 com cursor
 * desconhecido) e `POST` que grava e devolve `{id, enviadaEm}`. O `modo` do
 * POST simula a resposta perdida (grava e falha a rede), a falha antes de
 * chegar, o 404, o 401 e o 429 do limite por conta (D29).
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
        case 'limite':
          return {
            status: 429,
            corpo: { erro: 'muitas_requisicoes' },
            ...demora,
          };
        default:
          break;
      }
      const { texto: recebido } = requisicao.corpo as { texto: string };
      const ultima = servidor.mensagens.at(-1);
      const nova: Mensagem = {
        id: `m${servidor.proximo}`,
        autorId: EU,
        texto: recebido,
        // O relógio da API: 2 min depois da última gravada.
        enviadaEm: new Date(
          (ultima === undefined
            ? INICIO_DAS_MENSAGENS
            : Date.parse(ultima.enviadaEm)) + ENTRE_MENSAGENS_MS,
        ).toISOString(),
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
    // O ciclo relê os últimos 60 s antes de `m3` (D48): o cursor é `m2`, a
    // última com 60 s ou mais de diferença, e `m3` volta sem duplicar.
    expect(requisicoes(fetch, 'GET').at(-1)?.query).toEqual({
      depoisDe: 'm2',
    });
    expect(bolhasCom(3)).toHaveLength(1);
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

  it('429 no polling (CA20): o ciclo segue com backoff, o aviso vem na 3ª falha e some no sucesso', async () => {
    const { servidor, fetch } = await abrirCarregada();
    servidor.falhaDoGet = {
      status: 429,
      corpo: { erro: 'muitas_requisicoes' },
    };
    fetch.limparRequisicoes();

    // Backoff: 5 s, depois 10 s e 20 s; o 429 não para o ciclo.
    await avancar(5_000);
    await avancar(10_000);
    expect(requisicoes(fetch, 'GET')).toHaveLength(2);
    expect(screen.queryByText(textos.conversas.atualizacaoFalhando)).toBeNull();
    await avancar(20_000);
    expect(requisicoes(fetch, 'GET')).toHaveLength(3);

    expect(
      screen.getByText(textos.conversas.atualizacaoFalhando),
    ).toBeOnTheScreen();
    expect(rotulosDasBolhas()).toHaveLength(3);
    expect(screen.queryByText(textos.conversas.indisponivelTitulo)).toBeNull();
    semTextoCruDeErro();

    servidor.falhaDoGet = null;
    servidor.mensagens.push(mensagem(4, OUTRO));
    await avancar(40_000);
    expect(requisicoes(fetch, 'GET')).toHaveLength(4);
    expect(screen.queryByText(textos.conversas.atualizacaoFalhando)).toBeNull();
    expect(bolhasCom(4)).toHaveLength(1);
  });

  it('429 na carga inicial: aviso de ação com "Tentar de novo", e o ciclo carrega sozinho depois', async () => {
    const servidor = criarServidor();
    servidor.falhaDoGet = {
      status: 429,
      corpo: { erro: 'muitas_requisicoes' },
    };
    await abrir(servidor);

    expect(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.conversas.indisponivelTitulo)).toBeNull();
    expect(screen.queryByText(textos.conversas.semMensagens)).toBeNull();
    semTextoCruDeErro();

    // Sem tocar em nada: o backoff (10 s depois da 1ª falha) busca de novo.
    servidor.falhaDoGet = null;
    await avancar(10_000);
    expect(await screen.findByLabelText(new RegExp(texto(3)))).toBeTruthy();
    expect(screen.queryByText(textos.erros.muitas_tentativas_acao)).toBeNull();
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

describe('conversa: 429 no envio e na lista (CA20)', () => {
  it('fica "Não enviada" com a pendente mantida; o toque faz o GET e reenvia', async () => {
    const { servidor, fetch } = await abrirCarregada();
    servidor.modo = 'limite';
    await escrever(texto('limite'));
    await fireEvent.press(botaoEnviar());

    const bolha = await screen.findByRole('button', {
      name: new RegExp(
        `${textos.conversas.rotuloNaoEnviada}\\. ${texto('limite')}$`,
      ),
    });
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
    expect(bolhasCom('limite')).toHaveLength(1);
    expect(requisicoes(fetch, 'POST')).toHaveLength(1);
    // Não é "indisponível" nem sessão expirada: a conversa segue aberta.
    expect(screen.queryByText(textos.conversas.indisponivelTitulo)).toBeNull();
    expect(screen).toHavePathname('/conversas/c1');
    semTextoCruDeErro();

    // Nada é reenviado sozinho, nem nos ciclos do polling.
    await avancar(INTERVALO_DO_POLLING_MS * 2);
    expect(requisicoes(fetch, 'POST')).toHaveLength(1);
    expect(bolhasCom('limite')).toHaveLength(1);
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();

    servidor.modo = 'ok';
    fetch.limparRequisicoes();
    await fireEvent.press(bolha);
    await avancar(100);

    const metodos = fetch.requisicoes
      .filter((r) => r.caminho === CAMINHO)
      .map((r) => r.metodo);
    expect(metodos.slice(0, 2)).toEqual(['GET', 'POST']);
    expect(requisicoes(fetch, 'POST')[0]?.corpo).toEqual({
      texto: texto('limite'),
    });
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(bolhasCom('limite')).toHaveLength(1);
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
  });

  it('GET /conversas em 429 ao abrir: aviso de ação com "Tentar de novo", não "indisponível"; o toque carrega', async () => {
    const servidor = criarServidor();
    const fetch = criarFake(servidor).responder('GET /conversas', [
      { status: 429, corpo: { erro: 'muitas_requisicoes' } },
      { corpo: [RESUMO] },
    ]);
    await abrir(servidor, { fetch });

    expect(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.conversas.indisponivelTitulo)).toBeNull();
    semTextoCruDeErro();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(await screen.findByLabelText(new RegExp(texto(3)))).toBeTruthy();
    expect(screen.getByText(NOME_DO_OUTRO)).toBeOnTheScreen();
  });

  it('429 no envio mostra o aviso de ação acima do campo; o reenvio com sucesso o tira', async () => {
    const { servidor } = await abrirCarregada();
    expect(screen.queryByText(textos.erros.muitas_tentativas_acao)).toBeNull();
    servidor.modo = 'limite';
    await escrever(texto('limite'));
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    ).toBeOnTheScreen();
    semTextoCruDeErro();

    // O polling seguinte não tira o aviso: só um envio que dá certo.
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(
      screen.getByText(textos.erros.muitas_tentativas_acao),
    ).toBeOnTheScreen();

    servidor.modo = 'ok';
    await fireEvent.press(
      screen.getByRole('button', {
        name: new RegExp(
          `${textos.conversas.rotuloNaoEnviada}\\. ${texto('limite')}$`,
        ),
      }),
    );
    await avancar(100);

    expect(screen.queryByText(textos.erros.muitas_tentativas_acao)).toBeNull();
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
  });

  it('429 no reenvio também mostra o aviso; o próximo envio com sucesso o tira', async () => {
    const { servidor } = await abrirCarregada();
    servidor.modo = 'falha';
    await escrever(texto('rede'));
    await fireEvent.press(botaoEnviar());
    const bolha = await screen.findByRole('button', {
      name: new RegExp(
        `${textos.conversas.rotuloNaoEnviada}\\. ${texto('rede')}$`,
      ),
    });
    // Falha de rede não é limite: sem o aviso de ação.
    expect(screen.queryByText(textos.erros.muitas_tentativas_acao)).toBeNull();

    servidor.modo = 'limite';
    await fireEvent.press(bolha);
    expect(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    ).toBeOnTheScreen();

    servidor.modo = 'ok';
    // Escrever já tira o aviso; para provar que o sucesso também tira, o
    // aviso volta com outro 429 antes do envio que dá certo.
    await escrever(texto('nova'));
    expect(screen.queryByText(textos.erros.muitas_tentativas_acao)).toBeNull();
    servidor.modo = 'limite';
    await fireEvent.press(botaoEnviar());
    expect(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    ).toBeOnTheScreen();

    servidor.modo = 'ok';
    await fireEvent.press(
      screen.getByRole('button', {
        name: new RegExp(
          `${textos.conversas.rotuloNaoEnviada}\\. ${texto('nova')}$`,
        ),
      }),
    );
    await avancar(100);
    expect(screen.queryByText(textos.erros.muitas_tentativas_acao)).toBeNull();
  });

  it('o aviso do 429 some quando o rascunho muda', async () => {
    const { servidor } = await abrirCarregada();
    servidor.modo = 'limite';
    await escrever(texto('limite'));
    await fireEvent.press(botaoEnviar());
    expect(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    ).toBeOnTheScreen();

    await escrever(texto('outra'));

    expect(screen.queryByText(textos.erros.muitas_tentativas_acao)).toBeNull();
    // A pendente continua "Não enviada": só o aviso sai.
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
  });

  it('o rascunho escrito depois do 429 fica no campo', async () => {
    const { servidor } = await abrirCarregada();
    servidor.modo = 'limite';
    await escrever(texto('primeira'));
    await fireEvent.press(botaoEnviar());
    await screen.findByText(textos.conversas.naoEnviada);

    await escrever(texto('segunda'));
    await avancar(INTERVALO_DO_POLLING_MS);

    expect(campo()).toHaveDisplayValue(texto('segunda'));
    expect(botaoEnviar()).toBeEnabled();
  });
});

// --- CA60: "Tentar de novo" com a âncora fora do teto do cache ---

/** `n` mensagens do outro a partir de `m<desde>` (instantes depois de m100). */
function doOutro(n: number, desde: number): Mensagem[] {
  return Array.from({ length: n }, (_, i) => mensagem(desde + i, OUTRO));
}

interface FibraDaLista {
  readonly memoizedProps?: Record<string, unknown> | null;
  readonly child: FibraDaLista | null;
  readonly sibling: FibraDaLista | null;
}

/** Elemento que o `renderItem` devolve: a bolha ou, com separador de dia, um `View` com o separador e a bolha. */
interface ElementoDoItem {
  readonly props: {
    readonly onTentarDeNovo?: () => void;
    readonly children?: unknown;
  };
}

interface PropsDaLista {
  readonly data: readonly MensagemParaExibir[];
  readonly renderItem: (info: {
    item: MensagemParaExibir;
    index: number;
  }) => ElementoDoItem;
}

/** O `onTentarDeNovo` da bolha do item, com ou sem o separador de dia antes. */
function tentarDeNovoDoItem(elemento: ElementoDoItem): () => void {
  if (typeof elemento.props.onTentarDeNovo === 'function') {
    return elemento.props.onTentarDeNovo;
  }
  const filhos = Array.isArray(elemento.props.children)
    ? (elemento.props.children as ElementoDoItem[])
    : [];
  const bolha = filhos.find(
    (filho) => typeof filho?.props?.onTentarDeNovo === 'function',
  );
  if (bolha?.props.onTentarDeNovo === undefined) {
    throw new Error('bolha sem onTentarDeNovo');
  }
  return bolha.props.onTentarDeNovo;
}

/**
 * Props da `FlatList` das mensagens: com 500 bolhas, ela só desenha as
 * primeiras sem layout, e a pendente fica no fim.
 */
function propsDaLista(): PropsDaLista {
  const visitar = (fibra: FibraDaLista | null): PropsDaLista | null => {
    for (let atual = fibra; atual !== null; atual = atual.sibling) {
      const props = atual.memoizedProps;
      if (
        props != null &&
        Array.isArray(props.data) &&
        typeof props.renderItem === 'function' &&
        typeof props.keyExtractor === 'function'
      ) {
        return props as unknown as PropsDaLista;
      }
      const dentro = visitar(atual.child);
      if (dentro !== null) {
        return dentro;
      }
    }
    return null;
  };
  const raiz = (screen.root as unknown as { unstable_fiber?: FibraDaLista })
    .unstable_fiber;
  const props = visitar(raiz ?? null);
  if (props === null) {
    throw new Error('lista de mensagens não encontrada');
  }
  return props;
}

/** "Tentar de novo" da pendente com o texto `n`, pelo `renderItem`. */
async function tentarDeNovoDaPendente(n: number | string) {
  const { data, renderItem } = propsDaLista();
  const indice = data.findIndex(
    (item) => item.texto === texto(n) && item.situacao === 'falhou',
  );
  const item = data[indice];
  if (item === undefined) {
    throw new Error('pendente "Não enviada" não encontrada');
  }
  await act(async () => {
    tentarDeNovoDoItem(renderItem({ item, index: indice }))();
  });
}

/** Itens da lista com o texto `n` e a situação de cada um. */
function situacoesDe(n: number | string) {
  return propsDaLista()
    .data.filter((item) => item.texto === texto(n))
    .map((item) => item.situacao);
}

async function enviarTexto(valor: string) {
  await escrever(valor);
  await fireEvent.press(botaoEnviar());
  await avancar(100);
}

describe('conversa: "Tentar de novo" com a âncora fora do cache (CA60)', () => {
  /**
   * A minha sai do aparelho e o 201 se perde (`perdida`) ou nunca chega
   * (`falha`); depois chegam 600 do outro e um ciclo do polling corta o
   * cache em 500: a âncora (`m3`) e a minha ficam de fora.
   */
  async function minhaCortadaPeloPolling(modo: ModoDoPost) {
    const aberto = await abrirCarregada();
    const { servidor } = aberto;
    servidor.modo = modo;
    await enviarTexto(texto('minha'));
    expect(situacoesDe('minha')).toEqual(['falhou']);

    servidor.mensagens.push(...doOutro(600, 1000));
    await avancar(INTERVALO_DO_POLLING_MS);
    const dados = propsDaLista().data;
    expect(dados).toHaveLength(TETO_DE_MENSAGENS_NO_CACHE + 1);
    expect(dados[0]?.chave).toBe('m1100');
    // Só a pendente: a confirmada (se chegou) foi cortada com a âncora.
    expect(situacoesDe('minha')).toEqual(['falhou']);
    servidor.modo = 'ok';
    aberto.fetch.limparRequisicoes();
    return aberto;
  }

  it('600 mensagens do outro e a minha no meio: confere a partir da âncora, acha a minha e nenhum POST sai', async () => {
    const { servidor, fetch } = await minhaCortadaPeloPolling('perdida');

    await tentarDeNovoDaPendente('minha');
    await avancar(1_000);

    expect(requisicoes(fetch, 'POST')).toHaveLength(0);
    // A conferência leu a partir da âncora, página a página (601 depois de m3).
    const conferencia = requisicoes(fetch, 'GET').filter(
      (r) => r.query.depoisDe === 'm3',
    );
    expect(conferencia).toHaveLength(1);
    expect(situacoesDe('minha')).toEqual([]);
    expect(propsDaLista().data).toHaveLength(TETO_DE_MENSAGENS_NO_CACHE);
    expect(
      servidor.mensagens.filter((m) => m.texto === texto('minha')),
    ).toHaveLength(1);
    // Nada do que a conferência leu entrou no cache das mensagens.
    expect(propsDaLista().data[0]?.chave).toBe('m1100');
    semTextoCruDeErro();
  });

  it('sem a minha no servidor: confere e reenvia uma vez só', async () => {
    const { servidor, fetch } = await minhaCortadaPeloPolling('falha');

    await tentarDeNovoDaPendente('minha');
    await avancar(1_000);

    const daConversa = fetch.requisicoes.filter((r) => r.caminho === CAMINHO);
    const indiceDaConferencia = daConversa.findIndex(
      (r) => r.metodo === 'GET' && r.query.depoisDe === 'm3',
    );
    const indiceDoPost = daConversa.findIndex((r) => r.metodo === 'POST');
    expect(indiceDaConferencia).toBeGreaterThanOrEqual(0);
    expect(indiceDoPost).toBeGreaterThan(indiceDaConferencia);
    expect(requisicoes(fetch, 'POST')).toHaveLength(1);
    expect(requisicoes(fetch, 'POST')[0]?.corpo).toEqual({
      texto: texto('minha'),
    });
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(
      servidor.mensagens.filter((m) => m.texto === texto('minha')),
    ).toHaveLength(1);
    expect(situacoesDe('minha')).toEqual(['enviada']);
  });

  it('mais de 1000 mensagens depois da âncora: a conferência para no teto, continua "Não enviada" e nenhum POST sai (S2, D21)', async () => {
    const { servidor, fetch } = await minhaCortadaPeloPolling('falha');
    // 600 + 401 = 1001 depois de m3: a conferência lê 20 páginas cheias e
    // não chega ao fim, então não pode afirmar que a minha não chegou.
    servidor.mensagens.push(...doOutro(401, 1600));

    await tentarDeNovoDaPendente('minha');
    await avancar(1_000);

    expect(
      requisicoes(fetch, 'GET').filter((r) => r.query.depoisDe === 'm3'),
    ).toHaveLength(1);
    expect(requisicoes(fetch, 'POST')).toHaveLength(0);
    expect(situacoesDe('minha')).toEqual(['falhou']);
    semTextoCruDeErro();
  });

  it.each([
    ['500', { status: 500, corpo: { erro: 'erro_interno' } }],
    [
      '400 (âncora que não vale mais)',
      { status: 400, corpo: { erro: 'dados_invalidos' } },
    ],
    ['queda de rede', { falhaDeRede: true }],
  ] as const)(
    'conferência com %s: continua "Não enviada", nenhum POST sai, e o toque seguinte confere de novo',
    async (_nome, falha: RespostaFalsa) => {
      const { servidor, fetch } = await minhaCortadaPeloPolling('perdida');
      fetch.responder(`GET ${CAMINHO}?depoisDe=m3`, falha);

      await tentarDeNovoDaPendente('minha');
      await avancar(1_000);

      expect(
        requisicoes(fetch, 'GET').filter((r) => r.query.depoisDe === 'm3'),
      ).toHaveLength(1);
      expect(requisicoes(fetch, 'POST')).toHaveLength(0);
      // A pendente fica "Não enviada" (a bolha está no fim da lista, que a
      // `FlatList` não desenha sem layout).
      expect(situacoesDe('minha')).toEqual(['falhou']);
      semTextoCruDeErro();

      // A API volta: o toque seguinte confere de novo e acha a minha.
      fetch.responder(`GET ${CAMINHO}?depoisDe=m3`, (r) => servidor.get(r));
      await tentarDeNovoDaPendente('minha');
      await avancar(1_000);

      expect(requisicoes(fetch, 'POST')).toHaveLength(0);
      expect(situacoesDe('minha')).toEqual([]);
    },
  );

  it('o corte acontece no GET do próprio toque: confere a partir da âncora e não reenvia', async () => {
    const { servidor, fetch } = await abrirCarregada();
    servidor.modo = 'perdida';
    await enviarTexto(texto('minha'));
    expect(situacoesDe('minha')).toEqual(['falhou']);
    // Chegam antes do próximo ciclo: só o GET do toque as vê.
    servidor.mensagens.push(...doOutro(600, 1000));
    servidor.modo = 'ok';
    fetch.limparRequisicoes();

    await tentarDeNovoDaPendente('minha');
    await avancar(1_000);

    expect(
      requisicoes(fetch, 'GET').filter((r) => r.query.depoisDe === 'm3'),
    ).toHaveLength(1);
    expect(requisicoes(fetch, 'POST')).toHaveLength(0);
    expect(situacoesDe('minha')).toEqual([]);
  });

  it('âncora nula (conversa vazia ao enviar) e a lista no teto: confere desde o começo e não reenvia', async () => {
    const servidor = criarServidor([]);
    const { fetch } = await abrir(servidor);
    await screen.findByText(textos.conversas.semMensagens);
    servidor.modo = 'perdida';
    await enviarTexto(texto('minha'));
    expect(situacoesDe('minha')).toEqual(['falhou']);
    servidor.mensagens.push(...doOutro(600, 1000));
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(propsDaLista().data).toHaveLength(TETO_DE_MENSAGENS_NO_CACHE + 1);
    servidor.modo = 'ok';
    fetch.limparRequisicoes();

    await tentarDeNovoDaPendente('minha');
    await avancar(1_000);

    // O GET do toque leva cursor; a conferência, nenhum (desde o começo).
    const gets = requisicoes(fetch, 'GET');
    expect(gets[0]?.query.depoisDe).toBeDefined();
    expect(gets.filter((r) => r.query.depoisDe === undefined)).toHaveLength(1);
    expect(requisicoes(fetch, 'POST')).toHaveLength(0);
    expect(situacoesDe('minha')).toEqual([]);
  });

  it('a minha ainda no cache: casa pelo GET do toque, sem conferência', async () => {
    const { servidor, fetch } = await abrirCarregada();
    servidor.modo = 'perdida';
    await enviarTexto(texto('minha'));
    // A minha (m100) e só 10 do outro: tudo cabe no cache.
    servidor.mensagens.push(...doOutro(10, 1000));
    servidor.modo = 'ok';
    fetch.limparRequisicoes();

    await tentarDeNovoDaPendente('minha');
    await avancar(1_000);

    expect(requisicoes(fetch, 'GET')).toHaveLength(1);
    expect(requisicoes(fetch, 'POST')).toHaveLength(0);
    expect(situacoesDe('minha')).toEqual(['enviada']);
    expect(bolhasCom('minha')).toHaveLength(1);
  });

  it('mesmo texto que outra pendente já casou pelo texto (ainda no cache) não conta como a minha: reenvia', async () => {
    const { servidor, fetch } = await abrirCarregada();
    servidor.mensagens.push(...doOutro(499, 1000));
    // A primeira "ok" chega, mas o 201 se perde; a segunda não chega.
    servidor.modo = 'perdida';
    await enviarTexto(texto('ok'));
    servidor.modo = 'falha';
    await enviarTexto(texto('ok'));
    expect(situacoesDe('ok')).toEqual(['falhou', 'falhou']);

    // O ciclo traz m100 e corta m3: a primeira casa m100 pelo texto e sai; a
    // âncora da segunda (m3) fica de fora.
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(situacoesDe('ok')).toEqual(['enviada', 'falhou']);
    expect(propsDaLista().data.at(-2)?.chave).toBe('m100');
    servidor.modo = 'ok';
    fetch.limparRequisicoes();

    await tentarDeNovoDaPendente('ok');
    await avancar(1_000);

    // A conferência lê m100 de novo, mas ela já está no cache e é da
    // primeira: a segunda reenvia.
    expect(
      requisicoes(fetch, 'GET').filter((r) => r.query.depoisDe === 'm3'),
    ).toHaveLength(1);
    expect(requisicoes(fetch, 'POST')).toHaveLength(1);
    expect(
      servidor.mensagens.filter((m) => m.texto === texto('ok')),
    ).toHaveLength(2);
  });

  it('mesmo texto já entregue por outra pendente (id do 201) não conta como a minha: reenvia', async () => {
    const { servidor, fetch } = await abrirCarregada();
    // A primeira "ok" é gravada (m100), e 499 do outro chegam depois dela
    // antes de o 201 voltar. O GET que a invalidação puxa demora, e a segunda
    // "ok" sai com a mesma âncora (m3) e não chega.
    servidor.demoraDoPostMs = 1_000;
    servidor.demoraDoGetMs = 3_000;
    await escrever(texto('ok'));
    await fireEvent.press(botaoEnviar());
    servidor.mensagens.push(...doOutro(499, 1000));
    await avancar(1_000);
    servidor.demoraDoPostMs = 0;
    servidor.demoraDoGetMs = 0;
    servidor.modo = 'falha';
    await escrever(texto('ok'));
    await fireEvent.press(botaoEnviar());
    await avancar(100);
    expect(situacoesDe('ok')).toEqual(['enviada', 'falhou']);

    // O GET traz m100 e as 499 e corta m3: a primeira sai pelo id.
    await avancar(3_000);
    expect(situacoesDe('ok')).toEqual(['enviada', 'falhou']);
    expect(propsDaLista().data[0]?.chave).toBe('m100');
    // Mais uma e outro ciclo: m100 também sai do cache. Depois de m3 ficam
    // 501, menos que o teto da conferência (S2), que chega ao fim.
    servidor.mensagens.push(...doOutro(1, 2000));
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(situacoesDe('ok')).toEqual(['falhou']);
    servidor.modo = 'ok';
    fetch.limparRequisicoes();

    await tentarDeNovoDaPendente('ok');
    await avancar(1_000);

    // A conferência acha m100, mas ela é da primeira: a segunda reenvia.
    expect(
      requisicoes(fetch, 'GET').filter((r) => r.query.depoisDe === 'm3'),
    ).toHaveLength(1);
    expect(requisicoes(fetch, 'POST')).toHaveLength(1);
    expect(
      servidor.mensagens.filter((m) => m.texto === texto('ok')),
    ).toHaveLength(2);
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
