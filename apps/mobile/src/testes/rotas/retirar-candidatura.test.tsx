// Etapa 14 da L2: "Retirar candidatura" em Minhas candidaturas e no rodapé do
// detalhe do trampo (CA34), e o trampo encerrado no rodapé e na folha.
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import type { MinhaCandidatura, StatusDaCandidatura } from '../../api/tipos';
import LayoutDaArea from '../../app/(app)/_layout';
import RotaDasMinhasCandidaturas from '../../app/(app)/candidaturas/index';
import RotaDoTrampo from '../../app/(app)/trampos/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
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

// --- Dados ---

function stub(texto: string) {
  return function Stub() {
    return <Text>{texto}</Text>;
  };
}

const ROTAS_DA_LISTA: MapaDeRotas = {
  '(app)/_layout': LayoutDaArea,
  '(app)/index': stub('stub: início'),
  '(app)/buscar': stub('stub: busca'),
  '(app)/trampos/[id]': stub('stub: detalhe'),
  '(app)/candidaturas/index': RotaDasMinhasCandidaturas,
};

const ROTAS_DO_DETALHE: MapaDeRotas = {
  '(app)/_layout': LayoutDaArea,
  '(app)/index': stub('stub: início'),
  '(app)/trampos/[id]': RotaDoTrampo,
  '(app)/candidaturas/[trampoId]': stub('stub: recebidas'),
  '(app)/perfis/[contaId]': stub('stub: perfil público'),
  '(app)/perfil/editar': stub('stub: editar perfil'),
};

function minha(
  id: string,
  trampoId: string,
  status: StatusDaCandidatura = 'pendente',
  criadaEm = '2026-10-18T12:00:00.000Z',
): MinhaCandidatura {
  return {
    id,
    trampoId,
    freelancerId: 'eu',
    mensagem: `Mensagem sigilosa de ${id}`,
    valorPropostoCentavos: 150000,
    status,
    criadaEm,
  };
}

function trampo(id: string, titulo: string, status = 'aberto') {
  return {
    id,
    autorId: 'c-autor',
    titulo,
    descricao: 'Duas demãos de tinta branca.',
    categoria: 'pintura',
    cidade: 'Lavras',
    valorCentavos: 150000,
    prazo: null,
    status,
    criadoEm: '2026-10-01T12:00:00.000Z',
  };
}

const AUTOR = {
  contaId: 'c-autor',
  nome: 'Carla Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
};

const MEU_PERFIL = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

// --- Apoio ---

function requisicoes(fetch: FetchFalso, metodo: string, caminho: string) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

/** O TanStack avisa os componentes num `setTimeout(0)` (timers falsos). */
async function avancar(ms = 20) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
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

/** O botão de confirmar do diálogo é o último com o nome "Retirar candidatura". */
function botaoConfirmar() {
  const botoes = screen.getAllByRole('button', {
    name: textos.candidatura.retirar,
  });
  const ultimo = botoes.at(-1);
  if (ultimo === undefined) {
    throw new Error('sem botão de confirmar');
  }
  return ultimo;
}

/** Nada de código cru da API (`candidatura_nao_pendente`) nem `erro.message`. */
function semTextoCruDeErro() {
  expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);
  expect(screen.queryAllByText(/erro da API/i)).toHaveLength(0);
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
  await act(async () => onlineManager.setOnline(true));
  const chamadas = chamadasDoConsole;
  jest.restoreAllMocks();
  expect(chamadas).toEqual([]);
});

// --- Minhas candidaturas ---

describe('Minhas candidaturas: retirar (CA34)', () => {
  /** `lista` é o que o `GET` devolve; a rota `DELETE` é do teste. */
  function criarFakeDaLista(lista: () => readonly MinhaCandidatura[]) {
    return criarFetchFalso()
      .responder('GET /candidaturas/minhas', () => ({ corpo: lista() }))
      .responder('GET /trampos/t1', {
        corpo: trampo('t1', 'Pintar a sala'),
      })
      .responder('GET /trampos/t2', {
        corpo: trampo('t2', 'Limpar o quintal'),
      })
      .responder('GET /trampos/t3', {
        corpo: trampo('t3', 'Montar estante'),
      });
  }

  async function abrirLista(fetch: FetchFalso) {
    return renderizarRotas(ROTAS_DA_LISTA, {
      initialUrl: '/candidaturas',
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
      fetch,
    });
  }

  const retirarDe = (titulo: string) => textos.candidatura.retirarDe(titulo);

  function botaoDe(titulo: string) {
    return screen.getByRole('button', { name: retirarDe(titulo) });
  }

  async function retirar(titulo: string) {
    await fireEvent.press(botaoDe(titulo));
    await fireEvent.press(botaoConfirmar());
  }

  const TODAS = [
    minha('k1', 't1', 'pendente', '2026-10-18T12:00:00.000Z'),
    minha('k2', 't2', 'aceita', '2026-10-19T12:00:00.000Z'),
    minha('k3', 't3', 'recusada', '2026-10-17T12:00:00.000Z'),
  ];

  it('só a candidatura pendente tem "Retirar candidatura"', async () => {
    await abrirLista(criarFakeDaLista(() => TODAS));
    await screen.findByText('Montar estante');

    expect(botaoDe('Pintar a sala')).toBeOnTheScreen();
    expect(
      screen.getAllByRole('button', { name: /^Retirar candidatura/ }),
    ).toHaveLength(1);
  });

  it('abre o diálogo e "Manter candidatura" não retira nada', async () => {
    const fetch = criarFakeDaLista(() => TODAS);
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');

    await fireEvent.press(botaoDe('Pintar a sala'));
    expect(
      screen.getByText(textos.candidatura.retirarTitulo),
    ).toBeOnTheScreen();
    expect(requisicoes(fetch, 'DELETE', '/candidaturas/k1')).toHaveLength(0);

    await fireEvent.press(screen.getByText(textos.candidatura.manter));
    await avancar();

    expect(requisicoes(fetch, 'DELETE', '/candidaturas/k1')).toHaveLength(0);
    expect(screen.getByText('Pintar a sala')).toBeOnTheScreen();
    expect(screen.queryByText(textos.candidatura.retirada)).toBeNull();
  });

  it('sucesso: um DELETE com o Bearer, a candidatura sai da lista e aparece o toast', async () => {
    let retiradas = false;
    const fetch = criarFakeDaLista(() =>
      retiradas ? TODAS.filter((c) => c.id !== 'k1') : TODAS,
    ).responder('DELETE /candidaturas/k1', () => {
      retiradas = true;
      return { status: 204 };
    });
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');

    await retirar('Pintar a sala');

    expect(
      await screen.findByText(textos.candidatura.retirada),
    ).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText('Pintar a sala')).toBeNull());
    const delecoes = requisicoes(fetch, 'DELETE', '/candidaturas/k1');
    expect(delecoes).toHaveLength(1);
    expect(delecoes[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN_DE_TESTE}`,
    );
    // As outras seguem na lista, sem botão de retirar.
    expect(screen.getByText('Limpar o quintal')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Retirar/ })).toBeNull();
    // A lista foi recarregada depois do DELETE.
    expect(requisicoes(fetch, 'GET', '/candidaturas/minhas')).toHaveLength(2);

    // "Fechar" dispensa o toast.
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.toastFechar }),
    );
    await waitFor(() =>
      expect(screen.queryByText(textos.candidatura.retirada)).toBeNull(),
    );
    semTextoCruDeErro();
  });

  it('a candidatura sai da lista mesmo que a recarga ainda a traga', async () => {
    const fetch = criarFakeDaLista(() => TODAS).responder(
      'DELETE /candidaturas/k1',
      { status: 204 },
    );
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');

    await retirar('Pintar a sala');

    expect(
      await screen.findByText(textos.candidatura.retirada),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Pintar a sala')).toBeNull();
  });

  it('com a retirada no ar: "Retirando…" e os outros "Retirar" desabilitados', async () => {
    const fetch = criarFakeDaLista(() => [
      TODAS[0] as MinhaCandidatura,
      minha('k4', 't2', 'pendente', '2026-10-19T12:00:00.000Z'),
    ]).responder('DELETE /candidaturas/k1', {
      status: 204,
      demoraMs: 1000,
    });
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');

    await retirar('Pintar a sala');

    expect(
      await screen.findByRole('button', { name: textos.candidatura.retirando }),
    ).toBeOnTheScreen();
    expect(botaoDe('Limpar o quintal')).toBeDisabled();
    await avancar(1100);
    await screen.findByText(textos.candidatura.retirada);
  });

  it('toque duplo em "Retirar candidatura" do diálogo manda um DELETE só', async () => {
    const fetch = criarFakeDaLista(() => TODAS).responder(
      'DELETE /candidaturas/k1',
      { status: 204, demoraMs: 1000 },
    );
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');
    await fireEvent.press(botaoDe('Pintar a sala'));

    await tocarDuasVezes(botaoConfirmar());
    await avancar(1100);
    await screen.findByText(textos.candidatura.retirada);

    expect(requisicoes(fetch, 'DELETE', '/candidaturas/k1')).toHaveLength(1);
  });

  it('409 candidatura_nao_pendente: avisa "já respondida", recarrega e mostra o status novo', async () => {
    let respondida = false;
    const fetch = criarFakeDaLista(() =>
      respondida
        ? [{ ...(TODAS[0] as MinhaCandidatura), status: 'aceita' }]
        : [TODAS[0] as MinhaCandidatura],
    ).responder('DELETE /candidaturas/k1', () => {
      respondida = true;
      return { status: 409, corpo: { erro: 'candidatura_nao_pendente' } };
    });
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');

    await retirar('Pintar a sala');

    expect(
      await screen.findByText(textos.candidatura.respondida),
    ).toBeOnTheScreen();
    expect(await screen.findByText(textos.selos.aceita)).toBeOnTheScreen();
    expect(screen.getByText('Pintar a sala')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Retirar/ })).toBeNull();
    expect(screen.queryByText(textos.candidatura.retirada)).toBeNull();
    expect(requisicoes(fetch, 'GET', '/candidaturas/minhas')).toHaveLength(2);
    semTextoCruDeErro();
  });

  it('404: a candidatura sai da lista, sem aviso nem toast', async () => {
    const fetch = criarFakeDaLista(() => TODAS).responder(
      'DELETE /candidaturas/k1',
      { status: 404, corpo: { erro: 'nao_encontrado' } },
    );
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');

    await retirar('Pintar a sala');

    await waitFor(() => expect(screen.queryByText('Pintar a sala')).toBeNull());
    expect(screen.getByText('Limpar o quintal')).toBeOnTheScreen();
    expect(screen.queryByText(textos.candidatura.retirada)).toBeNull();
    expect(screen.queryByText(textos.candidatura.erroAoRetirar)).toBeNull();
    expect(screen.queryByText(textos.erros.nao_encontrado)).toBeNull();
    await waitFor(() =>
      expect(requisicoes(fetch, 'GET', '/candidaturas/minhas')).toHaveLength(2),
    );
  });

  it('falha do servidor: avisa, mantém a candidatura e o botão volta', async () => {
    const fetch = criarFakeDaLista(() => TODAS).responder(
      'DELETE /candidaturas/k1',
      [{ status: 500, corpo: { erro: 'interno' } }, { status: 204 }],
    );
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');

    await retirar('Pintar a sala');

    expect(
      await screen.findByText(textos.candidatura.erroAoRetirar),
    ).toBeOnTheScreen();
    expect(screen.getByText('Pintar a sala')).toBeOnTheScreen();
    expect(botaoDe('Pintar a sala')).toBeEnabled();
    expect(screen.queryByText(textos.candidatura.retirada)).toBeNull();
    semTextoCruDeErro();

    // A trava de toque duplo foi solta: dá para tentar de novo.
    await retirar('Pintar a sala');
    expect(
      await screen.findByText(textos.candidatura.retirada),
    ).toBeOnTheScreen();
    expect(requisicoes(fetch, 'DELETE', '/candidaturas/k1')).toHaveLength(2);
    expect(screen.queryByText(textos.candidatura.erroAoRetirar)).toBeNull();
  });

  it('o aviso tem "Fechar" e some ao fechar; o próximo "Retirar" também o limpa (D2)', async () => {
    const fetch = criarFakeDaLista(() => [
      minha('k1', 't1', 'pendente', '2026-10-18T12:00:00.000Z'),
      minha('k3', 't3', 'pendente', '2026-10-17T12:00:00.000Z'),
    ]).responder('DELETE /candidaturas/k1', [
      { status: 500, corpo: { erro: 'interno' } },
      { status: 500, corpo: { erro: 'interno' } },
    ]);
    fetch.responder('DELETE /candidaturas/k3', { status: 204, demoraMs: 500 });
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');

    await retirar('Pintar a sala');
    expect(
      await screen.findByText(textos.candidatura.erroAoRetirar),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatura.fecharAviso }),
    );
    expect(screen.queryByText(textos.candidatura.erroAoRetirar)).toBeNull();

    await retirar('Pintar a sala');
    expect(
      await screen.findByText(textos.candidatura.erroAoRetirar),
    ).toBeOnTheScreen();
    // Retirar outra limpa o aviso na hora, antes da resposta.
    await retirar('Montar estante');
    expect(screen.queryByText(textos.candidatura.erroAoRetirar)).toBeNull();
    await avancar(600);
  });

  it.each([
    ['429', { status: 429, corpo: { erro: 'muitas_requisicoes' } }, 'acao'],
    ['falta de rede', { falhaDeRede: true }, 'rede'],
  ] as const)(
    '%s ao retirar: texto próprio, não "Não foi possível retirar" (D5)',
    async (_nome, resposta, tipo) => {
      const texto =
        tipo === 'acao'
          ? textos.erros.muitas_tentativas_acao
          : textos.erros.sem_conexao;
      const fetch = criarFakeDaLista(() => TODAS).responder(
        'DELETE /candidaturas/k1',
        resposta,
      );
      await abrirLista(fetch);
      await screen.findByText('Pintar a sala');

      await retirar('Pintar a sala');

      expect(await screen.findByText(texto)).toBeOnTheScreen();
      expect(screen.queryByText(textos.candidatura.erroAoRetirar)).toBeNull();
      expect(botaoDe('Pintar a sala')).toBeEnabled();
    },
  );

  it('sem conexão: o botão fica desabilitado com o motivo e não manda DELETE', async () => {
    const fetch = criarFakeDaLista(() => TODAS);
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');

    await act(async () => onlineManager.setOnline(false));

    expect(botaoDe('Pintar a sala')).toBeDisabled();
    expect(
      screen.getByText(textos.candidatura.semConexaoMotivo),
    ).toBeOnTheScreen();
    await fireEvent.press(botaoDe('Pintar a sala'));
    expect(
      screen.queryByText(textos.candidatura.retirarTitulo),
    ).not.toBeOnTheScreen();
    expect(requisicoes(fetch, 'DELETE', '/candidaturas/k1')).toHaveLength(0);
  });

  it('diálogo aberto antes de a conexão cair: confirmar não manda o DELETE', async () => {
    const fetch = criarFakeDaLista(() => TODAS);
    await abrirLista(fetch);
    await screen.findByText('Pintar a sala');
    await fireEvent.press(botaoDe('Pintar a sala'));

    await act(async () => onlineManager.setOnline(false));
    await fireEvent.press(botaoConfirmar());
    await avancar();

    expect(requisicoes(fetch, 'DELETE', '/candidaturas/k1')).toHaveLength(0);
    expect(screen.queryByText(textos.candidatura.retirada)).toBeNull();
  });

  it('o texto da candidatura não aparece na tela nem no nome dos botões', async () => {
    await abrirLista(criarFakeDaLista(() => TODAS));
    await screen.findByText('Pintar a sala');

    expect(screen.queryByText(/Mensagem sigilosa/)).toBeNull();
    expect(screen.queryByLabelText(/Mensagem sigilosa/)).toBeNull();
  });
});

// --- Rodapé do detalhe do trampo ---

describe('rodapé do trampo: retirar (CA34)', () => {
  function criarFakeDoDetalhe(
    minhas: () => readonly MinhaCandidatura[],
    status: () => string = () => 'aberto',
  ) {
    return criarFetchFalso()
      .responder('GET /categorias', {
        corpo: [{ id: 'pintura', rotulo: 'Pintura e reparos' }],
      })
      .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
      .responder('GET /perfis/c-autor', { corpo: AUTOR })
      .responder('GET /trampos/t1', () => ({
        corpo: trampo('t1', 'Pintar a sala', status()),
      }))
      .responder('GET /candidaturas/minhas', () => ({ corpo: minhas() }));
  }

  async function abrirDetalhe(fetch: FetchFalso) {
    return renderizarRotas(ROTAS_DO_DETALHE, {
      initialUrl: '/trampos/t1',
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
      fetch,
    });
  }

  const PENDENTE = [minha('m1', 't1', 'pendente')];

  async function botaoRetirar() {
    return screen.findByRole('button', { name: textos.candidatura.retirar });
  }

  async function retirar() {
    await fireEvent.press(await botaoRetirar());
    await fireEvent.press(botaoConfirmar());
  }

  const botaoCandidatar = () =>
    screen.findByRole('button', { name: textos.detalheTrampo.candidatar });

  it.each([['aceita'], ['recusada']] as const)(
    'candidatura %s: sem "Retirar candidatura"',
    async (status) => {
      await abrirDetalhe(criarFakeDoDetalhe(() => [minha('m1', 't1', status)]));

      expect(await screen.findByText(textos.selos[status])).toBeOnTheScreen();
      expect(
        screen.queryByRole('button', { name: textos.candidatura.retirar }),
      ).toBeNull();
    },
  );

  it('pendente: o botão aparece ao lado do selo e "Manter candidatura" não retira', async () => {
    const fetch = criarFakeDoDetalhe(() => PENDENTE);
    await abrirDetalhe(fetch);

    expect(
      await screen.findByText(textos.detalheTrampo.jaCandidatou),
    ).toBeOnTheScreen();
    await fireEvent.press(await botaoRetirar());
    expect(
      screen.getByText(textos.candidatura.retirarTitulo),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(textos.candidatura.manter));
    await avancar();

    expect(requisicoes(fetch, 'DELETE', '/candidaturas/m1')).toHaveLength(0);
    expect(
      screen.getByText(textos.detalheTrampo.jaCandidatou),
    ).toBeOnTheScreen();
  });

  it('sucesso: um DELETE com o Bearer, o rodapé volta a "Candidatar-se" e aparece o toast', async () => {
    let retirada = false;
    const fetch = criarFakeDoDetalhe(() =>
      retirada ? [] : PENDENTE,
    ).responder('DELETE /candidaturas/m1', () => {
      retirada = true;
      return { status: 204 };
    });
    await abrirDetalhe(fetch);

    await retirar();

    expect(
      await screen.findByText(textos.candidatura.retirada),
    ).toBeOnTheScreen();
    expect(await botaoCandidatar()).toBeEnabled();
    expect(screen.queryByText(textos.detalheTrampo.jaCandidatou)).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.candidatura.retirar }),
    ).toBeNull();
    const delecoes = requisicoes(fetch, 'DELETE', '/candidaturas/m1');
    expect(delecoes).toHaveLength(1);
    expect(delecoes[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN_DE_TESTE}`,
    );
    semTextoCruDeErro();
  });

  it('com a retirada no ar: "Retirando…" e toque duplo manda um DELETE só', async () => {
    let retirada = false;
    const fetch = criarFakeDoDetalhe(() =>
      retirada ? [] : PENDENTE,
    ).responder('DELETE /candidaturas/m1', () => {
      retirada = true;
      return { status: 204, demoraMs: 1000 };
    });
    await abrirDetalhe(fetch);
    await fireEvent.press(await botaoRetirar());

    await tocarDuasVezes(botaoConfirmar());
    expect(
      await screen.findByRole('button', { name: textos.candidatura.retirando }),
    ).toBeOnTheScreen();
    await avancar(1100);
    await screen.findByText(textos.candidatura.retirada);

    expect(requisicoes(fetch, 'DELETE', '/candidaturas/m1')).toHaveLength(1);
  });

  it('409 candidatura_nao_pendente: avisa "já respondida", recarrega e troca pelo selo novo', async () => {
    let respondida = false;
    const fetch = criarFakeDoDetalhe(() =>
      respondida ? [minha('m1', 't1', 'aceita')] : PENDENTE,
    ).responder('DELETE /candidaturas/m1', () => {
      respondida = true;
      return { status: 409, corpo: { erro: 'candidatura_nao_pendente' } };
    });
    await abrirDetalhe(fetch);

    await retirar();

    expect(
      await screen.findByText(textos.candidatura.respondida),
    ).toBeOnTheScreen();
    expect(await screen.findByText(textos.selos.aceita)).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.candidatura.retirar }),
    ).toBeNull();
    expect(screen.queryByText(textos.candidatura.retirada)).toBeNull();
    expect(requisicoes(fetch, 'GET', '/candidaturas/minhas')).toHaveLength(2);
    semTextoCruDeErro();
  });

  it('409 candidatura_nao_pendente relê o trampo e o selo do cabeçalho mostra o status novo (CA64)', async () => {
    // A aceitação da candidatura tirou o trampo de "Aberto".
    let respondida = false;
    const fetch = criarFakeDoDetalhe(
      () => (respondida ? [minha('m1', 't1', 'aceita')] : PENDENTE),
      () => (respondida ? 'em_andamento' : 'aberto'),
    ).responder('DELETE /candidaturas/m1', () => {
      respondida = true;
      return { status: 409, corpo: { erro: 'candidatura_nao_pendente' } };
    });
    await abrirDetalhe(fetch);
    expect(
      await screen.findByText(textos.detalheTrampo.seloAberto),
    ).toBeOnTheScreen();

    await retirar();

    expect(
      await screen.findByText(textos.detalheTrampo.seloEmAndamento),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.detalheTrampo.seloAberto)).toBeNull();
    expect(await screen.findByText(textos.selos.aceita)).toBeOnTheScreen();
    expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2);
  });

  it('retirada com sucesso não relê o trampo', async () => {
    let retirada = false;
    const fetch = criarFakeDoDetalhe(() =>
      retirada ? [] : PENDENTE,
    ).responder('DELETE /candidaturas/m1', () => {
      retirada = true;
      return { status: 204 };
    });
    await abrirDetalhe(fetch);
    await retirar();
    await screen.findByText(textos.candidatura.retirada);
    await avancar();

    expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(1);
  });

  it('404: recarrega e o rodapé volta a "Candidatar-se", sem aviso', async () => {
    let apagada = false;
    const fetch = criarFakeDoDetalhe(() => (apagada ? [] : PENDENTE)).responder(
      'DELETE /candidaturas/m1',
      () => {
        apagada = true;
        return { status: 404, corpo: { erro: 'nao_encontrado' } };
      },
    );
    await abrirDetalhe(fetch);

    await retirar();

    expect(await botaoCandidatar()).toBeEnabled();
    expect(screen.queryByText(textos.candidatura.retirada)).toBeNull();
    expect(screen.queryByText(textos.candidatura.erroAoRetirar)).toBeNull();
    expect(screen.queryByText(textos.erros.nao_encontrado)).toBeNull();
  });

  it('falha do servidor: avisa e mantém "Retirar candidatura" habilitado', async () => {
    let retirada = false;
    const fetch = criarFakeDoDetalhe(() =>
      retirada ? [] : PENDENTE,
    ).responder('DELETE /candidaturas/m1', [
      { status: 500, corpo: { erro: 'interno' } },
      () => {
        retirada = true;
        return { status: 204 };
      },
    ]);
    await abrirDetalhe(fetch);

    await retirar();

    expect(
      await screen.findByText(textos.candidatura.erroAoRetirar),
    ).toBeOnTheScreen();
    expect(await botaoRetirar()).toBeEnabled();
    expect(
      screen.getByText(textos.detalheTrampo.jaCandidatou),
    ).toBeOnTheScreen();
    semTextoCruDeErro();

    // A trava de toque duplo foi solta: dá para tentar de novo.
    await retirar();
    expect(
      await screen.findByText(textos.candidatura.retirada),
    ).toBeOnTheScreen();
    expect(await botaoCandidatar()).toBeEnabled();
    expect(requisicoes(fetch, 'DELETE', '/candidaturas/m1')).toHaveLength(2);
    expect(screen.queryByText(textos.candidatura.erroAoRetirar)).toBeNull();
  });

  it.each([
    ['429', { status: 429, corpo: { erro: 'muitas_requisicoes' } }, 'acao'],
    ['falta de rede', { falhaDeRede: true }, 'rede'],
  ] as const)(
    '%s ao retirar: texto próprio, não "Não foi possível retirar" (D5)',
    async (_nome, resposta, tipo) => {
      const texto =
        tipo === 'acao'
          ? textos.erros.muitas_tentativas_acao
          : textos.erros.sem_conexao;
      const fetch = criarFakeDoDetalhe(() => PENDENTE).responder(
        'DELETE /candidaturas/m1',
        resposta,
      );
      await abrirDetalhe(fetch);

      await retirar();

      expect(await screen.findByText(texto)).toBeOnTheScreen();
      expect(screen.queryByText(textos.candidatura.erroAoRetirar)).toBeNull();
      expect(await botaoRetirar()).toBeEnabled();
    },
  );

  it('sem conexão: o botão fica desabilitado com o motivo', async () => {
    const fetch = criarFakeDoDetalhe(() => PENDENTE);
    await abrirDetalhe(fetch);
    await botaoRetirar();

    await act(async () => onlineManager.setOnline(false));

    expect(await botaoRetirar()).toBeDisabled();
    expect(
      screen.getByText(textos.candidatura.semConexaoMotivo),
    ).toBeOnTheScreen();
    expect(requisicoes(fetch, 'DELETE', '/candidaturas/m1')).toHaveLength(0);
  });

  it('diálogo aberto antes de a conexão cair: confirmar não manda o DELETE', async () => {
    const fetch = criarFakeDoDetalhe(() => PENDENTE);
    await abrirDetalhe(fetch);
    await fireEvent.press(await botaoRetirar());

    await act(async () => onlineManager.setOnline(false));
    await fireEvent.press(botaoConfirmar());
    await avancar();

    expect(requisicoes(fetch, 'DELETE', '/candidaturas/m1')).toHaveLength(0);
    expect(screen.queryByText(textos.candidatura.retirada)).toBeNull();
  });
});

// --- Trampo encerrado ---

describe('trampo encerrado no rodapé', () => {
  function criarFake(status: () => string) {
    return criarFetchFalso()
      .responder('GET /categorias', {
        corpo: [{ id: 'pintura', rotulo: 'Pintura e reparos' }],
      })
      .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
      .responder('GET /perfis/c-autor', { corpo: AUTOR })
      .responder('GET /trampos/t1', () => ({
        corpo: trampo('t1', 'Pintar a sala', status()),
      }))
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('GET /candidaturas/minhas', { corpo: [] });
  }

  async function abrirDetalhe(fetch: FetchFalso) {
    return renderizarRotas(ROTAS_DO_DETALHE, {
      initialUrl: '/trampos/t1',
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
      fetch,
    });
  }

  it('encerrado: selo "Encerrado", "Candidatar-se" desabilitado com o motivo e a folha não abre', async () => {
    await abrirDetalhe(criarFake(() => 'encerrado'));

    const botao = await screen.findByRole('button', {
      name: textos.detalheTrampo.candidatar,
    });
    expect(botao).toBeDisabled();
    expect(screen.getByText(textos.detalheTrampo.fechado)).toBeOnTheScreen();
    expect(
      screen.getByText(textos.detalheTrampo.seloEncerrado),
    ).toBeOnTheScreen();
    await fireEvent.press(botao);
    expect(screen.queryByLabelText(textos.candidatar.mensagem)).toBeNull();
  });

  it('409 trampo_nao_aberto: a folha traduz o código e o rodapé passa a "fechado" com o trampo encerrado', async () => {
    let encerrado = false;
    const fetch = criarFake(() =>
      encerrado ? 'encerrado' : 'aberto',
    ).responder('POST /trampos/t1/candidaturas', () => {
      encerrado = true;
      return { status: 409, corpo: { erro: 'trampo_nao_aberto' } };
    });
    await abrirDetalhe(fetch);
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText(textos.candidatar.mensagem),
      'Posso ir hoje.',
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.candidatar.valor),
      '150',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatar.enviar }),
    );

    // O trampo foi recarregado e o rodapé mostra "fechado".
    expect(
      await screen.findByText(textos.detalheTrampo.seloEncerrado),
    ).toBeOnTheScreen();
    expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: textos.detalheTrampo.candidatar }),
    ).toBeDisabled();
    // O texto do erro é o mesmo do motivo "fechado": um é o motivo do
    // rodapé e o outro, o erro da folha, que continua aberta com o rascunho.
    expect(textos.erros.trampo_nao_aberto).toBe(textos.detalheTrampo.fechado);
    expect(screen.getAllByText(textos.erros.trampo_nao_aberto)).toHaveLength(2);
    expect(screen.getByDisplayValue('Posso ir hoje.')).toBeOnTheScreen();
    semTextoCruDeErro();
  });
});
