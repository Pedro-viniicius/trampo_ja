// Etapa 8 da 2c: aba Conversas e a lista (CA12, CA15, CA16) contra o fetch
// falso: vazio, nome, prévia e hora, perfil 404, toque que abre a conversa,
// recarga de 30 s só com a aba focada, erro com "Tentar de novo" e o
// "Voltar" da conversa, que sem histórico cai nesta aba.
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import LayoutDasAbas from '../../app/(app)/(abas)/_layout';
import RotaDasConversas from '../../app/(app)/(abas)/conversas';
import RotaDaConversa from '../../app/(app)/conversas/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import {
  FRESCOR_DA_LISTA_MS,
  INTERVALO_DA_LISTA_MS,
} from '../../estado/consultas/conversas';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
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

// --- Dados (sentinelas genéricas no lugar de nome e prévia, CA15) ---

const OUTRO = 'conta-outra';
const SEM_PERFIL = 'conta-sem-perfil';
const NOME_DO_OUTRO = 'NOME-SENTINELA';
const PREVIA = 'PREVIA-SENTINELA';

/** Meio-dia UTC de outro ano: a data local é a mesma em qualquer fuso do Brasil. */
const RESUMOS = [
  {
    conversaId: 'c1',
    outroUsuarioId: OUTRO,
    criadaEm: '2025-03-10T12:00:00.000Z',
    ultimaMensagem: { texto: PREVIA, enviadaEm: '2025-03-14T12:00:00.000Z' },
  },
  {
    conversaId: 'c2',
    outroUsuarioId: SEM_PERFIL,
    criadaEm: '2025-03-12T12:00:00.000Z',
    ultimaMensagem: null,
  },
];

const PERFIL_DO_OUTRO = {
  contaId: OUTRO,
  nome: NOME_DO_OUTRO,
  cidade: 'Lavras',
  descricao: null,
  habilidades: [],
};

// Rótulo da linha (D2): nome, prévia e hora. As datas são de outro ano, então
// a hora aparece como data completa (a mesma que a linha mostra).
const ABRIR_C1 = textos.conversas.linhaDaLista(
  NOME_DO_OUTRO,
  PREVIA,
  '14/03/2025',
);
const ABRIR_C2 = textos.conversas.linhaDaLista(null, null, '12/03/2025');

// --- Rotas e apoio ---

function stub(rotulo: string) {
  return function Stub() {
    return <Text>{rotulo}</Text>;
  };
}

const ROTAS: MapaDeRotas = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/(abas)/_layout': LayoutDasAbas,
  '(app)/(abas)/index': stub('stub: início'),
  '(app)/(abas)/buscar': stub('stub: buscar'),
  '(app)/(abas)/publicar': stub('stub: publicar'),
  '(app)/(abas)/conversas': RotaDasConversas,
  '(app)/(abas)/perfil': stub('stub: perfil'),
  '(app)/conversas/[id]': RotaDaConversa,
};

function criarFake(): FetchFalso {
  return criarFetchFalso()
    .responder('GET /conversas', { corpo: RESUMOS })
    .responder(`GET /perfis/${OUTRO}`, { corpo: PERFIL_DO_OUTRO })
    .responder(`GET /perfis/${SEM_PERFIL}`, {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    })
    .responder('GET /conversas/c1/mensagens', { corpo: [] });
}

async function abrir(
  url = '/conversas',
  fetch = criarFake(),
): Promise<RotasRenderizadas> {
  return renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
}

/** Abre a aba e espera a lista com as duas conversas. */
async function abrirCarregada(fetch = criarFake()) {
  const aberto = await abrir('/conversas', fetch);
  await screen.findByRole('button', { name: ABRIR_C1 });
  await screen.findByRole('button', { name: ABRIR_C2 });
  return aberto;
}

function buscasDaLista(fetch: FetchFalso) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === 'GET' && r.caminho === '/conversas',
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

async function tocarNaAba(nome: string, caminho: string) {
  await fireEvent.press(screen.getByRole('button', { name: nome }));
  await waitFor(() => expect(screen).toHavePathname(caminho));
}

/** O "Voltar" do cabeçalho da conversa. */
async function tocarEmVoltar() {
  const [voltar] = screen.getAllByRole('button', {
    name: textos.gerais.voltar,
  });
  if (voltar === undefined) {
    throw new Error('sem "Voltar" na tela');
  }
  await fireEvent.press(voltar);
}

interface Fibra {
  readonly key: string | null;
  readonly child: Fibra | null;
  readonly sibling: Fibra | null;
  readonly return: Fibra | null;
}

/** Todas as chaves (`key`) da árvore do React, a partir de um elemento. */
function chavesDaArvore(elemento: object): string[] {
  let raiz = (elemento as { unstable_fiber?: Fibra }).unstable_fiber ?? null;
  while (raiz?.return) {
    raiz = raiz.return;
  }
  const chaves: string[] = [];
  const pilha: Fibra[] = raiz === null ? [] : [raiz];
  while (pilha.length > 0) {
    const fibra = pilha.pop();
    if (fibra === undefined) break;
    if (typeof fibra.key === 'string') chaves.push(fibra.key);
    if (fibra.child !== null) pilha.push(fibra.child);
    if (fibra.sibling !== null) pilha.push(fibra.sibling);
  }
  return chaves;
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

describe('aba Conversas (CA16)', () => {
  it('fica entre Publicar e Perfil, e abrir o app não busca as conversas', async () => {
    const fetch = criarFake();
    await abrir('/', fetch);
    await screen.findByText('stub: início');

    const nomes: string[] = [
      textos.abas.inicio,
      textos.abas.buscar,
      textos.abas.publicar,
      textos.abas.conversas,
      textos.abas.perfil,
    ];
    const naBarra = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string)
      .filter((nome) => nomes.includes(nome));
    expect(naBarra).toEqual(nomes);

    // As abas montam sob demanda: nada de `GET /conversas` antes do toque.
    await avancar(INTERVALO_DA_LISTA_MS * 2);
    expect(buscasDaLista(fetch)).toHaveLength(0);

    await tocarNaAba(textos.abas.conversas, '/conversas');
    expect(
      await screen.findByRole('button', { name: ABRIR_C1 }),
    ).toBeOnTheScreen();
    expect(buscasDaLista(fetch)).toHaveLength(1);
    expect(buscasDaLista(fetch)[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN_DE_TESTE}`,
    );
  });
});

describe('lista de conversas (CA12)', () => {
  it('sem conversas mostra o vazio com o texto da spec', async () => {
    const fetch = criarFake().responder('GET /conversas', { corpo: [] });
    await abrir('/conversas', fetch);

    expect(await screen.findByText(textos.conversas.vazio)).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Suas conversas aparecem aqui depois de uma candidatura ou contratação.',
      ),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.gerais.tentarDeNovo }),
    ).toBeNull();
  });

  it('mostra nome, prévia e hora na ordem da API; perfil 404 vira "Perfil indisponível"', async () => {
    await abrirCarregada();

    expect(await screen.findByText(NOME_DO_OUTRO)).toBeOnTheScreen();
    expect(screen.getByText(PREVIA)).toBeOnTheScreen();
    expect(screen.getByText('14/03/2025')).toBeOnTheScreen();

    // Sem mensagem: a prévia vazia e a hora da criação da conversa.
    expect(
      await screen.findByText(textos.conversas.perfilIndisponivel),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.conversas.previaVazia)).toBeOnTheScreen();
    expect(screen.getByText('12/03/2025')).toBeOnTheScreen();

    const rotulos = screen
      .getAllByRole('button', { name: /^Abrir conversa com/ })
      .map((b) => b.props.accessibilityLabel as string);
    expect(rotulos).toEqual([ABRIR_C1, ABRIR_C2]);

    // O 404 de um perfil não vira erro da tela.
    expect(
      screen.queryByRole('button', { name: textos.gerais.tentarDeNovo }),
    ).toBeNull();
  });

  it('nome e prévia ficam fora de testID, chave de lista e URL (CA15)', async () => {
    const { getPathnameWithParams } = await abrirCarregada();
    await screen.findByText(NOME_DO_OUTRO);

    expect(screen.queryAllByTestId(/SENTINELA/)).toHaveLength(0);
    const chaves = chavesDaArvore(
      screen.getByRole('button', { name: ABRIR_C1 }),
    );
    // A chave de cada item é o id da conversa.
    expect(chaves).toEqual(expect.arrayContaining(['c1', 'c2']));
    expect(chaves.filter((chave) => /SENTINELA/.test(chave))).toEqual([]);
    expect(getPathnameWithParams()).toBe('/conversas');
  });

  it('o toque abre /conversas/<id>, só com o id; "Voltar" volta à lista', async () => {
    const { fetch, getPathnameWithParams } = await abrirCarregada();

    await fireEvent.press(screen.getByRole('button', { name: ABRIR_C1 }));
    await waitFor(() => expect(screen).toHavePathname('/conversas/c1'));
    expect(getPathnameWithParams()).toBe('/conversas/c1');
    // A rota real da conversa abriu (as mensagens foram pedidas).
    await waitFor(() =>
      expect(
        fetch.requisicoes.some((r) => r.caminho === '/conversas/c1/mensagens'),
      ).toBe(true),
    );
    expect(
      await screen.findByText(textos.conversas.semMensagens),
    ).toBeOnTheScreen();

    await tocarEmVoltar();
    await waitFor(() => expect(screen).toHavePathname('/conversas'));
    expect(
      await screen.findByRole('button', { name: ABRIR_C1 }),
    ).toBeOnTheScreen();
  });

  it('a conversa aberta direto, sem histórico: "Voltar" cai na aba Conversas', async () => {
    await abrir('/conversas/c1');
    expect(
      await screen.findByText(textos.conversas.semMensagens),
    ).toBeOnTheScreen();

    await tocarEmVoltar();
    await waitFor(() => expect(screen).toHavePathname('/conversas'));
    expect(
      await screen.findByRole('button', { name: ABRIR_C1 }),
    ).toBeOnTheScreen();
    // A barra de abas aparece de novo.
    expect(
      screen.getByRole('button', { name: textos.abas.conversas }),
    ).toBeOnTheScreen();
  });

  it('falha do servidor mostra o erro traduzido e "Tentar de novo" recarrega', async () => {
    const fetch = criarFake().responder('GET /conversas', [
      { status: 500, corpo: { erro: 'interno' } },
      { corpo: RESUMOS },
    ]);
    await abrir('/conversas', fetch);

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.conversas.vazio)).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(
      await screen.findByRole('button', { name: ABRIR_C1 }),
    ).toBeOnTheScreen();
    expect(buscasDaLista(fetch)).toHaveLength(2);
  });

  it('sem conexão mostra a faixa, não busca e não mostra o vazio', async () => {
    onlineManager.setOnline(false);
    const fetch = criarFake();
    await abrir('/conversas', fetch);

    expect(
      await screen.findByText(textos.gerais.semConexaoFaixa),
    ).toBeOnTheScreen();
    await avancar(INTERVALO_DA_LISTA_MS);
    expect(screen.queryByText(textos.conversas.vazio)).toBeNull();
    expect(buscasDaLista(fetch)).toHaveLength(0);
  });
});

describe('lista de conversas: recarga (CA12, D20)', () => {
  it(`com a aba focada, recarrega a cada ${INTERVALO_DA_LISTA_MS / 1000} s`, async () => {
    const fetch = criarFake();
    await abrirCarregada(fetch);
    fetch.limparRequisicoes();

    await avancar(INTERVALO_DA_LISTA_MS - 1_000);
    expect(buscasDaLista(fetch)).toHaveLength(0);
    await avancar(1_000);
    expect(buscasDaLista(fetch)).toHaveLength(1);
    await avancar(INTERVALO_DA_LISTA_MS);
    expect(buscasDaLista(fetch)).toHaveLength(2);
  });

  it('fora da aba não recarrega; ao voltar a ela com dado velho, recarrega na hora', async () => {
    const fetch = criarFake();
    await abrirCarregada(fetch);

    await tocarNaAba(textos.abas.inicio, '/');
    fetch.limparRequisicoes();
    await avancar(INTERVALO_DA_LISTA_MS * 3);
    expect(buscasDaLista(fetch)).toHaveLength(0);

    await tocarNaAba(textos.abas.conversas, '/conversas');
    await avancar(0);
    expect(buscasDaLista(fetch)).toHaveLength(1);

    // E o ciclo volta com a aba focada.
    await avancar(INTERVALO_DA_LISTA_MS);
    expect(buscasDaLista(fetch)).toHaveLength(2);
  });

  it(`ao voltar à aba com dado de menos de ${FRESCOR_DA_LISTA_MS / 1000} s, não recarrega`, async () => {
    const fetch = criarFake();
    await abrirCarregada(fetch);
    fetch.limparRequisicoes();

    await tocarNaAba(textos.abas.inicio, '/');
    await tocarNaAba(textos.abas.conversas, '/conversas');
    await avancar(0);
    expect(buscasDaLista(fetch)).toHaveLength(0);
  });
});
