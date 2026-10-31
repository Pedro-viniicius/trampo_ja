// Etapa 9 da 2c: "Conversar" nos três contêineres (detalhe do trampo para o
// candidatado, candidaturas recebidas e detalhe do serviço) com
// `useAbrirConversa` (CA12, CA13, CA15, D22, D23) contra o fetch falso.
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import type {
  CandidaturaRecebida,
  MinhaCandidatura,
  StatusDaCandidatura,
} from '../../api/tipos';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import RotaDasCandidaturasRecebidas from '../../app/(app)/candidaturas/[trampoId]';
import RotaDoServico from '../../app/(app)/servicos/[id]';
import RotaDoTrampo from '../../app/(app)/trampos/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { textos } from '../../textos/pt-BR';
import {
  criarFetchFalso,
  type FetchFalso,
  type RespostaFalsa,
} from '../fetch-falso';
import {
  type MapaDeRotas,
  renderizarRotas,
  rotuloComQualquerNome,
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

// --- Dados (sentinelas genéricas no lugar de nome e id, CA15) ---

const AUTOR_ID = 'ID-SENTINELA-AUTOR';
const FREELANCER_A = 'ID-SENTINELA-FREELA-A';
const FREELANCER_B = 'ID-SENTINELA-FREELA-B';
const FREELANCER_C = 'ID-SENTINELA-FREELA-C';
const NOME_DO_AUTOR = 'NOME-SENTINELA-AUTOR';

/** Texto literal do CA13 (D4), escrito aqui para não depender do arquivo de textos. */
const TEXTO_DO_CA13 =
  'Você só pode conversar com quem tem uma candidatura ou contratação com você.';

const CATEGORIAS = [{ id: 'pintura', rotulo: 'Pintura e reparos' }];

const TRAMPO = {
  id: 't1',
  autorId: AUTOR_ID,
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'pintura',
  cidade: 'Lavras',
  valorCentavos: 150000,
  prazo: null,
  status: 'aberto',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

const SERVICO = {
  id: 's1',
  autorId: AUTOR_ID,
  titulo: 'Faço pintura de parede',
  descricao: 'Equipe própria.',
  categoria: 'pintura',
  cidade: null,
  precoBaseCentavos: 8000,
  status: 'ativo',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

function perfil(contaId: string, nome: string) {
  return {
    contaId,
    nome,
    cidade: 'Lavras',
    descricao: null,
    habilidades: ['pintura'],
  };
}

const MEU_PERFIL = {
  nome: 'NOME-SENTINELA-EU',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

function candidatura(
  id: string,
  freelancerId: string,
  status: StatusDaCandidatura = 'pendente',
): CandidaturaRecebida {
  return {
    id,
    freelancerId,
    mensagem: `Mensagem de ${id}`,
    valorPropostoCentavos: 15000,
    status,
    criadaEm: '2026-10-02T12:00:00.000Z',
  };
}

function minha(status: StatusDaCandidatura = 'pendente'): MinhaCandidatura {
  return { ...candidatura('m1', 'conta-eu', status), trampoId: 't1' };
}

const ABERTA: RespostaFalsa = { status: 201, corpo: { conversaId: 'c1' } };
const SEM_VINCULO: RespostaFalsa = {
  status: 403,
  corpo: { erro: 'sem_vinculo' },
};
const CONSIGO_MESMO: RespostaFalsa = {
  status: 409,
  corpo: { erro: 'conversa_consigo_mesmo' },
};

// --- Rotas e apoio ---

function stub(texto: string) {
  return function Stub() {
    return <Text>{texto}</Text>;
  };
}

const ROTAS: MapaDeRotas = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/index': stub('stub: início'),
  '(app)/trampos/[id]': RotaDoTrampo,
  '(app)/servicos/[id]': RotaDoServico,
  '(app)/candidaturas/[trampoId]': RotaDasCandidaturasRecebidas,
  '(app)/conversas/[id]': stub('stub: conversa'),
  '(app)/perfis/[contaId]': stub('stub: perfil público'),
  '(app)/perfil/editar': stub('stub: editar perfil'),
};

/**
 * Visitante candidatado ao trampo `t1`, sem serviços próprios. A lista de
 * conversas responde (a abertura espera a recarga dela).
 */
function criarFake(): FetchFalso {
  return criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
    .responder(`GET /perfis/${AUTOR_ID}`, {
      corpo: perfil(AUTOR_ID, NOME_DO_AUTOR),
    })
    .responder('GET /trampos/t1', { corpo: TRAMPO })
    .responder('GET /trampos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', { corpo: [minha()] })
    .responder('GET /servicos/s1', { corpo: SERVICO })
    .responder('GET /servicos/meus', { corpo: [] })
    .responder('GET /conversas', { corpo: [] })
    .responder('POST /conversas', ABERTA);
}

/** Autor do trampo `t1` com três candidaturas (pendente, aceita e recusada). */
function criarFakeDoAutor(): FetchFalso {
  return criarFake()
    .responder('GET /trampos/t1', { corpo: { ...TRAMPO, versao: 1 } })
    .responder('GET /trampos/meus', { corpo: [TRAMPO] })
    .responder('GET /candidaturas/minhas', { corpo: [] })
    .responder('GET /trampos/t1/candidaturas', {
      corpo: [
        candidatura('k1', FREELANCER_A),
        candidatura('k2', FREELANCER_B, 'aceita'),
        candidatura('k3', FREELANCER_C, 'recusada'),
      ],
    })
    .responder(`GET /perfis/${FREELANCER_A}`, {
      corpo: perfil(FREELANCER_A, 'NOME-SENTINELA-A'),
    })
    .responder(`GET /perfis/${FREELANCER_B}`, {
      corpo: perfil(FREELANCER_B, 'NOME-SENTINELA-B'),
    })
    .responder(`GET /perfis/${FREELANCER_C}`, {
      corpo: perfil(FREELANCER_C, 'NOME-SENTINELA-C'),
    });
}

async function abrir(url: string, fetch: FetchFalso) {
  return renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
}

function aberturas(fetch: FetchFalso) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === 'POST' && r.caminho === '/conversas',
  );
}

/** O TanStack avisa os componentes num `setTimeout(0)` (timers falsos). */
async function avancar(ms = 20) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function ficarOffline() {
  await act(async () => {
    onlineManager.setOnline(false);
  });
}

interface Fibra {
  readonly memoizedProps?: { readonly onPress?: unknown } | null;
  readonly return: Fibra | null;
}

/**
 * Dois toques antes de a tela redesenhar: o `onPress` do botão (o mesmo
 * fechamento, como no aparelho) é chamado duas vezes num só `act`. O
 * `fireEvent` não serve: dois `act` sobrepostos geram aviso do React.
 */
async function tocarDuasVezes(elemento: object) {
  let fibra = (elemento as { unstable_fiber?: Fibra }).unstable_fiber ?? null;
  while (fibra !== null && typeof fibra.memoizedProps?.onPress !== 'function') {
    fibra = fibra.return;
  }
  const onPress = fibra?.memoizedProps?.onPress;
  if (typeof onPress !== 'function') {
    throw new Error('botão sem onPress');
  }
  await act(async () => {
    onPress();
    onPress();
  });
}

const CONVERSAR = textos.detalheServico.conversar;
const CONVERSAR_COM_QUALQUER = rotuloComQualquerNome(
  textos.candidaturasRecebidas.conversarCom,
);

function botaoConversar() {
  return screen.findByRole('button', { name: CONVERSAR });
}

/** Os "Conversar" das recebidas, na ordem da lista. */
async function botoesConversarDasRecebidas() {
  return screen.findAllByRole('button', { name: CONVERSAR_COM_QUALQUER });
}

function botaoNaPosicao<T>(botoes: readonly T[], posicao: number): T {
  const botao = botoes[posicao];
  if (botao === undefined) {
    throw new Error(`sem botão na posição ${posicao}`);
  }
  return botao;
}

/** CA15: nem código cru da API, nem id de conta em texto ou `testID`. */
function semDadoCruNaTela() {
  expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);
  expect(screen.queryAllByText(/ID-SENTINELA/)).toHaveLength(0);
  expect(screen.queryAllByTestId(/SENTINELA/)).toHaveLength(0);
  expect(JSON.stringify(screen.toJSON())).not.toMatch(/ID-SENTINELA/);
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

// --- Detalhe do trampo (candidatado) ---

describe('detalhe do trampo: "Conversar" do candidatado', () => {
  it('CA12: manda o `autorId` do trampo e abre /conversas/c1', async () => {
    const fetch = criarFake();
    await abrir('/trampos/t1', fetch);

    await fireEvent.press(await botaoConversar());

    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(await screen.findByText('stub: conversa')).toBeOnTheScreen();
    expect(aberturas(fetch).map((r) => r.corpo)).toEqual([
      { outroUsuarioId: AUTOR_ID },
    ]);
  });

  it.each(['aceita', 'recusada'] as const)(
    'candidatura %s também tem "Conversar"',
    async (status) => {
      const fetch = criarFake().responder('GET /candidaturas/minhas', {
        corpo: [minha(status)],
      });
      await abrir('/trampos/t1', fetch);

      expect(await botaoConversar()).toBeEnabled();
    },
  );

  it('quem não se candidatou não vê "Conversar"', async () => {
    const fetch = criarFake().responder('GET /candidaturas/minhas', {
      corpo: [],
    });
    await abrir('/trampos/t1', fetch);

    expect(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: CONVERSAR })).toBeNull();
    expect(aberturas(fetch)).toEqual([]);
  });

  it('o autor do trampo não vê "Conversar"', async () => {
    const fetch = criarFakeDoAutor();
    await abrir('/trampos/t1', fetch);

    expect(
      await screen.findByRole('button', { name: 'Ver candidaturas (3)' }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: CONVERSAR })).toBeNull();
  });

  it('CA13: 403 sem_vinculo mostra o texto literal, desabilita e não manda um segundo POST', async () => {
    const fetch = criarFake().responder('POST /conversas', SEM_VINCULO);
    await abrir('/trampos/t1', fetch);

    await fireEvent.press(await botaoConversar());

    expect(await screen.findByText(TEXTO_DO_CA13)).toBeOnTheScreen();
    const botao = screen.getByRole('button', { name: CONVERSAR });
    expect(botao).toBeDisabled();
    await fireEvent.press(botao);
    await avancar();
    expect(aberturas(fetch)).toHaveLength(1);
    expect(screen).toHavePathname('/trampos/t1');
    semDadoCruNaTela();
  });

  it('CA13: 409 conversa_consigo_mesmo mostra o texto e desabilita', async () => {
    const fetch = criarFake().responder('POST /conversas', CONSIGO_MESMO);
    await abrir('/trampos/t1', fetch);

    await fireEvent.press(await botaoConversar());

    expect(
      await screen.findByText(textos.erros.conversa_consigo_mesmo),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: CONVERSAR })).toBeDisabled();
    semDadoCruNaTela();
  });

  it('sem conexão: motivo, botão desabilitado e nenhum POST', async () => {
    const fetch = criarFake();
    await abrir('/trampos/t1', fetch);
    await botaoConversar();

    await ficarOffline();

    expect(
      await screen.findByText(textos.conversas.semConexaoParaConversar),
    ).toBeOnTheScreen();
    const botao = screen.getByRole('button', { name: CONVERSAR });
    expect(botao).toBeDisabled();
    await fireEvent.press(botao);
    await avancar();
    expect(aberturas(fetch)).toEqual([]);
  });

  it('toque duplo manda um só POST e mostra "Abrindo…" enquanto espera', async () => {
    const fetch = criarFake().responder('POST /conversas', {
      ...ABERTA,
      demoraMs: 1_000,
    });
    await abrir('/trampos/t1', fetch);

    await tocarDuasVezes(await botaoConversar());

    const abrindo = await screen.findByRole('button', {
      name: textos.conversas.abrindo,
    });
    expect(abrindo).toBeDisabled();
    expect(aberturas(fetch)).toHaveLength(1);
    await avancar(1_000);
    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch)).toHaveLength(1);
  });

  it('falha de rede: mostra o texto e deixa tentar de novo', async () => {
    const fetch = criarFake().responder('POST /conversas', [
      { falhaDeRede: true },
      { ...ABERTA, demoraMs: 1_000 },
    ]);
    await abrir('/trampos/t1', fetch);

    await fireEvent.press(await botaoConversar());

    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    const botao = screen.getByRole('button', { name: CONVERSAR });
    expect(botao).toBeEnabled();
    semDadoCruNaTela();

    // A nova tentativa tira o aviso antigo enquanto espera.
    await fireEvent.press(botao);
    expect(
      await screen.findByRole('button', { name: textos.conversas.abrindo }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.sem_conexao)).toBeNull();
    await avancar(1_000);
    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch)).toHaveLength(2);
  });

  it('CA14: 401 na abertura leva ao login', async () => {
    const fetch = criarFake().responder('POST /conversas', {
      status: 401,
      corpo: { erro: 'sessao_invalida' },
    });
    await abrir('/trampos/t1', fetch);

    await fireEvent.press(await botaoConversar());

    await waitFor(() => expect(screen).toHavePathname('/entrar'));
    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
  });
});

// --- Candidaturas recebidas ---

describe('candidaturas recebidas: "Conversar"', () => {
  it('CA12: candidatura pendente manda o `freelancerId` e abre /conversas/c1', async () => {
    const fetch = criarFakeDoAutor();
    await abrir('/candidaturas/t1', fetch);

    const botoes = await botoesConversarDasRecebidas();
    await fireEvent.press(botaoNaPosicao(botoes, 0));

    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch).map((r) => r.corpo)).toEqual([
      { outroUsuarioId: FREELANCER_A },
    ]);
  });

  it('D23: aceita e recusada também têm "Conversar", cada uma com a sua conta', async () => {
    const fetch = criarFakeDoAutor();
    await abrir('/candidaturas/t1', fetch);

    const botoes = await botoesConversarDasRecebidas();
    expect(botoes).toHaveLength(3);
    await fireEvent.press(botaoNaPosicao(botoes, 2));

    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch).map((r) => r.corpo)).toEqual([
      { outroUsuarioId: FREELANCER_C },
    ]);

    await act(async () => router.back());
    const deNovo = await botoesConversarDasRecebidas();
    await fireEvent.press(botaoNaPosicao(deNovo, 1));
    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch).map((r) => r.corpo)).toEqual([
      { outroUsuarioId: FREELANCER_C },
      { outroUsuarioId: FREELANCER_B },
    ]);
  });

  it('toque duplo manda um só POST, "Abrindo…" no cartão e nenhuma outra abertura no meio', async () => {
    const fetch = criarFakeDoAutor().responder('POST /conversas', {
      ...ABERTA,
      demoraMs: 1_000,
    });
    await abrir('/candidaturas/t1', fetch);

    const botoes = await botoesConversarDasRecebidas();
    await tocarDuasVezes(botaoNaPosicao(botoes, 0));

    expect(
      await screen.findByRole('button', { name: textos.conversas.abrindo }),
    ).toBeOnTheScreen();
    // Outra candidatura no meio da abertura: ignorada.
    const outros = screen.getAllByRole('button', {
      name: CONVERSAR_COM_QUALQUER,
    });
    expect(outros).toHaveLength(2);
    await fireEvent.press(botaoNaPosicao(outros, 0));
    expect(aberturas(fetch)).toHaveLength(1);

    await avancar(1_000);
    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch).map((r) => r.corpo)).toEqual([
      { outroUsuarioId: FREELANCER_A },
    ]);
  });

  it.each([
    ['CA13: 403 sem_vinculo', SEM_VINCULO, TEXTO_DO_CA13],
    [
      '409 conversa_consigo_mesmo',
      CONSIGO_MESMO,
      textos.erros.conversa_consigo_mesmo,
    ],
  ] as const)(
    '%s desabilita o "Conversar" daquela conta, com o motivo; o de outra conta segue habilitado',
    async (_caso, resposta, motivo) => {
      const fetch = criarFakeDoAutor().responder('POST /conversas', [
        resposta,
        ABERTA,
      ]);
      await abrir('/candidaturas/t1', fetch);

      const botoes = await botoesConversarDasRecebidas();
      await fireEvent.press(botaoNaPosicao(botoes, 0));

      expect(await screen.findByText(motivo)).toBeOnTheScreen();
      // O motivo fica no cartão, não repetido num aviso da tela.
      expect(screen.getAllByText(motivo)).toHaveLength(1);
      const depois = await botoesConversarDasRecebidas();
      expect(botaoNaPosicao(depois, 0)).toBeDisabled();
      expect(botaoNaPosicao(depois, 0).props.accessibilityHint).toBe(motivo);
      expect(botaoNaPosicao(depois, 1)).toBeEnabled();
      expect(botaoNaPosicao(depois, 2)).toBeEnabled();

      // Nem chamando o `onPress` direto sai um segundo POST para a mesma conta.
      await tocarDuasVezes(botaoNaPosicao(depois, 0));
      await avancar();
      expect(aberturas(fetch)).toHaveLength(1);
      expect(screen).toHavePathname('/candidaturas/t1');
      semDadoCruNaTela();

      // A outra conta abre normalmente.
      await fireEvent.press(botaoNaPosicao(depois, 1));
      await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
      expect(aberturas(fetch).map((r) => r.corpo)).toEqual([
        { outroUsuarioId: FREELANCER_A },
        { outroUsuarioId: FREELANCER_B },
      ]);
    },
  );

  it('falha de rede: mostra o texto num aviso e deixa tentar de novo', async () => {
    const fetch = criarFakeDoAutor().responder('POST /conversas', [
      { falhaDeRede: true },
      ABERTA,
    ]);
    await abrir('/candidaturas/t1', fetch);

    await fireEvent.press(
      botaoNaPosicao(await botoesConversarDasRecebidas(), 0),
    );
    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    const depois = await botoesConversarDasRecebidas();
    expect(botaoNaPosicao(depois, 0)).toBeEnabled();

    await fireEvent.press(botaoNaPosicao(depois, 0));
    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch)).toHaveLength(2);
  });

  it('sem conexão: todo "Conversar" desabilitado com o motivo e nenhum POST', async () => {
    const fetch = criarFakeDoAutor();
    await abrir('/candidaturas/t1', fetch);
    await botoesConversarDasRecebidas();

    await ficarOffline();

    const motivos = await screen.findAllByText(
      textos.conversas.semConexaoParaConversar,
    );
    expect(motivos).toHaveLength(3);
    const botoes = await botoesConversarDasRecebidas();
    for (const botao of botoes) {
      expect(botao).toBeDisabled();
    }
    await tocarDuasVezes(botaoNaPosicao(botoes, 0));
    await avancar();
    expect(aberturas(fetch)).toEqual([]);

    // A conexão volta: os botões voltam a funcionar.
    await act(async () => {
      onlineManager.setOnline(true);
    });
    const deNovo = await botoesConversarDasRecebidas();
    expect(botaoNaPosicao(deNovo, 0)).toBeEnabled();
    expect(
      screen.queryByText(textos.conversas.semConexaoParaConversar),
    ).toBeNull();
  });
});

// --- Detalhe do serviço ---

describe('detalhe do serviço: "Conversar" (D22)', () => {
  it('CA12: quem não é o autor vê o botão; o toque manda o `autorId` e abre /conversas/c1', async () => {
    const fetch = criarFake();
    await abrir('/servicos/s1', fetch);

    await fireEvent.press(await botaoConversar());

    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch).map((r) => r.corpo)).toEqual([
      { outroUsuarioId: AUTOR_ID },
    ]);
  });

  it('o autor (o serviço está em "meus serviços") não vê o botão', async () => {
    const fetch = criarFake().responder('GET /servicos/meus', {
      corpo: [SERVICO],
    });
    await abrir('/servicos/s1', fetch);

    expect(await screen.findByText(NOME_DO_AUTOR)).toBeOnTheScreen();
    await waitFor(() =>
      expect(
        fetch.requisicoes.some((r) => r.caminho === '/servicos/meus'),
      ).toBe(true),
    );
    await avancar();
    expect(screen.queryByRole('button', { name: CONVERSAR })).toBeNull();
    expect(aberturas(fetch)).toEqual([]);
  });

  it('"meus serviços" que falhou conta como "não é meu": a API decide', async () => {
    const fetch = criarFake().responder('GET /servicos/meus', {
      status: 500,
      corpo: { erro: 'interno' },
    });
    await abrir('/servicos/s1', fetch);

    expect(await botaoConversar()).toBeEnabled();
  });

  it('CA13: 403 sem_vinculo mostra o texto literal, desabilita e não manda um segundo POST', async () => {
    const fetch = criarFake().responder('POST /conversas', SEM_VINCULO);
    await abrir('/servicos/s1', fetch);

    await fireEvent.press(await botaoConversar());

    expect(await screen.findByText(TEXTO_DO_CA13)).toBeOnTheScreen();
    const botao = screen.getByRole('button', { name: CONVERSAR });
    expect(botao).toBeDisabled();
    await fireEvent.press(botao);
    await avancar();
    expect(aberturas(fetch)).toHaveLength(1);
    expect(screen).toHavePathname('/servicos/s1');
    semDadoCruNaTela();
  });

  it('CA13: reabrir a tela depois do 403 deixa tentar de novo (a API decide)', async () => {
    const fetch = criarFake().responder('POST /conversas', [
      SEM_VINCULO,
      ABERTA,
    ]);
    await abrir('/servicos/s1', fetch);
    await fireEvent.press(await botaoConversar());
    expect(await screen.findByText(TEXTO_DO_CA13)).toBeOnTheScreen();

    await act(async () => router.replace('/'));
    await screen.findByText('stub: início');
    await act(async () =>
      router.push({ pathname: '/servicos/[id]', params: { id: 's1' } }),
    );

    const botao = await botaoConversar();
    expect(botao).toBeEnabled();
    expect(screen.queryByText(TEXTO_DO_CA13)).toBeNull();
    await fireEvent.press(botao);
    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch)).toHaveLength(2);
  });

  it('CA13: 409 conversa_consigo_mesmo mostra o texto e desabilita', async () => {
    const fetch = criarFake().responder('POST /conversas', CONSIGO_MESMO);
    await abrir('/servicos/s1', fetch);

    await fireEvent.press(await botaoConversar());

    expect(
      await screen.findByText(textos.erros.conversa_consigo_mesmo),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: CONVERSAR })).toBeDisabled();
    semDadoCruNaTela();
  });

  it('sem conexão: motivo, botão desabilitado e nenhum POST', async () => {
    const fetch = criarFake();
    await abrir('/servicos/s1', fetch);
    await botaoConversar();

    await ficarOffline();

    expect(
      await screen.findByText(textos.conversas.semConexaoParaConversar),
    ).toBeOnTheScreen();
    const botao = screen.getByRole('button', { name: CONVERSAR });
    expect(botao).toBeDisabled();
    await fireEvent.press(botao);
    await avancar();
    expect(aberturas(fetch)).toEqual([]);
  });

  it('toque duplo manda um só POST e mostra "Abrindo…" enquanto espera', async () => {
    const fetch = criarFake().responder('POST /conversas', {
      ...ABERTA,
      demoraMs: 1_000,
    });
    await abrir('/servicos/s1', fetch);

    await tocarDuasVezes(await botaoConversar());

    expect(
      await screen.findByRole('button', { name: textos.conversas.abrindo }),
    ).toBeDisabled();
    expect(aberturas(fetch)).toHaveLength(1);
    await avancar(1_000);
    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch)).toHaveLength(1);
  });

  it('erro do servidor: mostra o texto e deixa tentar de novo', async () => {
    const fetch = criarFake().responder('POST /conversas', [
      { status: 500, corpo: { erro: 'interno' } },
      { ...ABERTA, demoraMs: 1_000 },
    ]);
    await abrir('/servicos/s1', fetch);

    await fireEvent.press(await botaoConversar());

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    const botao = screen.getByRole('button', { name: CONVERSAR });
    expect(botao).toBeEnabled();
    semDadoCruNaTela();

    // A nova tentativa tira o aviso antigo enquanto espera.
    await fireEvent.press(botao);
    expect(
      await screen.findByRole('button', { name: textos.conversas.abrindo }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.erro_servidor)).toBeNull();
    await avancar(1_000);
    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(aberturas(fetch)).toHaveLength(2);
  });

  it('saiu da tela durante a abertura: não navega para a conversa', async () => {
    const fetch = criarFake().responder('POST /conversas', {
      ...ABERTA,
      demoraMs: 1_000,
    });
    await abrir('/servicos/s1', fetch);
    await fireEvent.press(await botaoConversar());
    await screen.findByRole('button', { name: textos.conversas.abrindo });

    await act(async () => router.replace('/'));
    await screen.findByText('stub: início');
    await avancar(1_000);
    await avancar(5_000);

    expect(aberturas(fetch)).toHaveLength(1);
    expect(screen).toHavePathname('/');
  });
});
