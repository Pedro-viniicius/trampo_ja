// Etapa 7b da V2a (quadro 09): a rota da conversa com o contexto do trampo
// (cabeçalho e faixa), as respostas rápidas do freela com candidatura aceita
// e o separador de dia. O vínculo com o trampo sai só do cache (a conversa da
// API é do par, sem trampo): nenhum teste aqui deixa a rota pedir candidaturas
// nem trampos.
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import type {
  CandidaturaRecebida,
  Mensagem,
  MinhaCandidatura,
  StatusDaCandidatura,
  Trampo,
} from '../../api/tipos';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import RotaDaConversa from '../../app/(app)/conversas/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { chaves } from '../../estado/consultas/chaves';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { type MapaDeRotas, renderizarRotas, TOKEN_DE_TESTE } from './apoio';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
}));

// --- Dados (sentinelas genéricas, CA15) ---

const EU = 'conta-eu';
const OUTRO = 'conta-outra';
const NOME_DO_OUTRO = 'NOME-SENTINELA';
const TITULO = 'TITULO-SENTINELA';
const CAMINHO = '/conversas/c1/mensagens';

const RESUMO = {
  conversaId: 'c1',
  outroUsuarioId: OUTRO,
  criadaEm: '2026-10-01T09:00:00.000Z',
  ultimaMensagem: null,
};

function trampo(autorId: string, parcial: Partial<Trampo> = {}): Trampo {
  return {
    id: 't1',
    autorId,
    titulo: TITULO,
    descricao: 'DESCRICAO-SENTINELA',
    categoria: 'outros',
    cidade: 'CIDADE-SENTINELA',
    valorCentavos: 12000,
    prazo: null,
    status: 'aberto',
    criadoEm: '2026-10-01T10:00:00.000Z',
    ...parcial,
  };
}

function minha(status: StatusDaCandidatura): MinhaCandidatura {
  return {
    id: 'cand1',
    trampoId: 't1',
    freelancerId: EU,
    mensagem: 'MENSAGEM-SENTINELA',
    valorPropostoCentavos: 10000,
    status,
    criadaEm: '2026-10-10T10:00:00.000Z',
  };
}

function recebida(status: StatusDaCandidatura): CandidaturaRecebida {
  return {
    id: 'cand2',
    freelancerId: OUTRO,
    mensagem: 'MENSAGEM-SENTINELA',
    valorPropostoCentavos: 10000,
    status,
    criadaEm: '2026-10-10T10:00:00.000Z',
  };
}

function mensagem(n: number, autorId: string, enviadaEm: Date): Mensagem {
  return {
    id: `m${n}`,
    autorId,
    texto: `TEXTO-SENTINELA-${n}`,
    enviadaEm: enviadaEm.toISOString(),
  };
}

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
  '(app)/trampos/[id]': stub('stub: trampo'),
};

/** Mensagens fixas; com `depoisDe`, o que vem depois do cursor. */
function criarFake(mensagens: readonly Mensagem[]): FetchFalso {
  return criarFetchFalso()
    .responder('GET /conversas', { corpo: [RESUMO] })
    .responder(`GET /perfis/${OUTRO}`, {
      corpo: {
        contaId: OUTRO,
        nome: NOME_DO_OUTRO,
        cidade: 'Lavras',
        descricao: null,
        habilidades: [],
      },
    })
    .responder(`GET ${CAMINHO}`, (requisicao) => {
      const { depoisDe } = requisicao.query;
      const inicio =
        depoisDe === undefined
          ? 0
          : mensagens.findIndex((m) => m.id === depoisDe) + 1;
      return { corpo: mensagens.slice(inicio) };
    });
}

/** Abre a conversa e espera a última mensagem aparecer. */
async function abrirCarregada(
  mensagens: readonly Mensagem[] = [
    mensagem(1, OUTRO, new Date(Date.now() - 60_000)),
  ],
) {
  const aberto = await renderizarRotas(ROTAS, {
    initialUrl: '/conversas/c1',
    fetch: criarFake(mensagens),
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
  const ultima = mensagens.at(-1);
  if (ultima !== undefined) {
    await screen.findByLabelText(new RegExp(ultima.texto));
  }
  return aberto;
}

/** Pedidos de candidaturas ou de trampos: a rota não deve fazer nenhum. */
function pedidosDeVinculo(fetch: FetchFalso) {
  return fetch.requisicoes.filter((r) =>
    /^\/(candidaturas|trampos)(\/|$)/.test(r.caminho),
  );
}

function contexto() {
  return screen.queryByText(textos.conversas.contexto(TITULO));
}

function opcoesDaFaixa(status: StatusDaCandidatura) {
  return {
    name: textos.conversas.abrirTrampoDaFaixa(
      TITULO,
      textos.selos[status],
      'R$ 120,00',
    ),
  };
}

function faixa(status: StatusDaCandidatura) {
  return screen.queryByRole('button', opcoesDaFaixa(status));
}

/**
 * Com a faixa de contexto, o título do trampo aparece nela e o cabeçalho não
 * repete a linha "Sobre: {título}": a faixa chega e o "Sobre:" não.
 */
async function esperarFaixaSemSobre(status: StatusDaCandidatura) {
  expect(
    await screen.findByRole('button', opcoesDaFaixa(status)),
  ).toBeOnTheScreen();
  expect(screen.getByText(TITULO)).toBeOnTheScreen();
  expect(contexto()).toBeNull();
}

function chips() {
  return textos.conversas.respostasRapidas.flatMap((resposta) =>
    screen.queryAllByText(resposta),
  );
}

// --- Nada no `console` (CA15) ---

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

afterEach(() => {
  const chamadas = chamadasDoConsole;
  jest.restoreAllMocks();
  jest.useRealTimers();
  expect(chamadas).toEqual([]);
});

// --- Testes ---

describe('conversa: contexto do trampo (quadro 09)', () => {
  it('freela com a candidatura aceita: contexto, faixa e respostas rápidas que só preenchem o campo', async () => {
    const { fetch, queryClient } = await abrirCarregada();
    expect(contexto()).toBeNull();
    expect(chips()).toHaveLength(0);

    // O cache chega depois (ex.: Meus trampos aberto por baixo): a tela
    // acompanha sem pedir nada.
    await act(async () => {
      queryClient.setQueryData(chaves.minhasCandidaturas(), [minha('aceita')]);
      queryClient.setQueryData(chaves.trampo('t1'), trampo(OUTRO));
    });

    await esperarFaixaSemSobre('aceita');
    expect(chips()).toHaveLength(textos.conversas.respostasRapidas.length);

    const [primeira] = textos.conversas.respostasRapidas;
    await fireEvent.press(screen.getByText(primeira as string));
    expect(screen.getByLabelText(textos.conversas.campo).props.value).toBe(
      primeira,
    );
    // Preencher não envia: nenhum POST de mensagem.
    expect(
      fetch.requisicoes.filter(
        (r) => r.metodo === 'POST' && r.caminho === CAMINHO,
      ),
    ).toHaveLength(0);
    expect(pedidosDeVinculo(fetch)).toHaveLength(0);

    await fireEvent.press(screen.getByRole('button', opcoesDaFaixa('aceita')));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
  });

  it('freela em análise: contexto e faixa, sem respostas rápidas', async () => {
    const { fetch, queryClient } = await abrirCarregada();
    await act(async () => {
      queryClient.setQueryData(chaves.minhasCandidaturas(), [
        minha('pendente'),
      ]);
      queryClient.setQueryData(chaves.trampo('t1'), trampo(OUTRO));
    });

    await esperarFaixaSemSobre('pendente');
    expect(chips()).toHaveLength(0);
    expect(pedidosDeVinculo(fetch)).toHaveLength(0);
  });

  it('freela aceita em trampo encerrado: sem respostas rápidas', async () => {
    const { queryClient } = await abrirCarregada();
    await act(async () => {
      queryClient.setQueryData(chaves.minhasCandidaturas(), [minha('aceita')]);
      queryClient.setQueryData(
        chaves.trampo('t1'),
        trampo(OUTRO, { status: 'encerrado' }),
      );
    });

    await esperarFaixaSemSobre('aceita');
    expect(chips()).toHaveLength(0);
  });

  it('contratante: o outro se candidatou a um trampo meu; contexto e faixa, sem respostas rápidas', async () => {
    const { fetch, queryClient } = await abrirCarregada();
    await act(async () => {
      queryClient.setQueryData(chaves.candidaturasRecebidas('t1'), [
        recebida('aceita'),
      ]);
      queryClient.setQueryData(chaves.trampo('t1'), trampo(EU));
    });

    await esperarFaixaSemSobre('aceita');
    expect(chips()).toHaveLength(0);
    expect(pedidosDeVinculo(fetch)).toHaveLength(0);
  });

  it('candidatura de outro trampo (de uma terceira conta) não liga a conversa', async () => {
    const { queryClient } = await abrirCarregada();
    await act(async () => {
      queryClient.setQueryData(chaves.minhasCandidaturas(), [minha('aceita')]);
      queryClient.setQueryData(chaves.trampo('t1'), trampo('conta-terceira'));
    });

    expect(contexto()).toBeNull();
    expect(faixa('aceita')).toBeNull();
    expect(chips()).toHaveLength(0);
  });

  it('sem dado no cache: sem contexto, faixa nem respostas rápidas, e nenhuma requisição nova', async () => {
    const { fetch } = await abrirCarregada();

    expect(contexto()).toBeNull();
    // O rótulo da faixa começa por "Abrir {título}": nenhum botão assim.
    expect(
      screen.queryByRole('button', { name: new RegExp(`^Abrir ${TITULO}`) }),
    ).toBeNull();
    expect(chips()).toHaveLength(0);
    expect(pedidosDeVinculo(fetch)).toHaveLength(0);
  });
});

describe('conversa: separador de dia (fuso do aparelho)', () => {
  it('data antiga, "Ontem" e "Hoje", com a virada da meia-noite', async () => {
    // Relógio fixo no fuso local; o `renderRouter` mantém o `Date.now()`.
    jest.useFakeTimers({ now: new Date(2026, 9, 21, 15, 0) });
    await abrirCarregada([
      mensagem(1, OUTRO, new Date(2026, 9, 19, 10, 0)),
      mensagem(2, EU, new Date(2026, 9, 20, 9, 0)),
      mensagem(3, OUTRO, new Date(2026, 9, 20, 23, 59)),
      mensagem(4, EU, new Date(2026, 9, 21, 0, 0)),
      mensagem(5, OUTRO, new Date(2026, 9, 21, 14, 0)),
    ]);

    const cabecalhos = screen
      .getAllByRole('header')
      .map((el) => String(el.props.children));
    expect(cabecalhos).toEqual([
      NOME_DO_OUTRO,
      '19/10/2026',
      textos.conversas.diaOntem,
      textos.conversas.diaHoje,
    ]);
  });

  it('a bolha de um dia anterior mostra só a hora (o dia está no separador), no texto e no rótulo falado', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 21, 15, 0) });
    await abrirCarregada([
      mensagem(1, OUTRO, new Date(2026, 9, 19, 10, 5)),
      mensagem(2, EU, new Date(2026, 9, 20, 9, 7)),
      mensagem(3, OUTRO, new Date(2026, 9, 21, 14, 2)),
    ]);

    // Só a hora, sem "19/10" nem "20/10" junto dela.
    expect(await screen.findByText('10:05')).toBeOnTheScreen();
    expect(screen.getByText('09:07')).toBeOnTheScreen();
    expect(screen.getByText('14:02')).toBeOnTheScreen();
    expect(screen.queryByText(/\d\d\/\d\d \d\d:\d\d/)).toBeNull();
    // O rótulo falado leva o nome e a hora; o dia o leitor de tela ouve no
    // separador (cabeçalho) logo antes.
    expect(
      screen.getByLabelText(
        `${textos.conversas.deNome(NOME_DO_OUTRO, '10:05')}. TEXTO-SENTINELA-1`,
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        `${textos.conversas.minha('09:07')}. TEXTO-SENTINELA-2`,
      ),
    ).toBeOnTheScreen();
  });
});
