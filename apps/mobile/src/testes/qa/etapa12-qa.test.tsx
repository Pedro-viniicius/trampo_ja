/**
 * QA da etapa 12 (V2, rodada 1). F1: o destaque "SUAS CANDIDATURAS" do Início
 * do freela (D63) diz "Você ainda não se candidatou" sempre que não há
 * candidatura pendente, mesmo com candidaturas aceitas ou encerradas.
 */
import { act, screen, waitFor } from 'expo-router/testing-library';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { textos } from '../../textos/pt-BR';
import type { FetchFalso } from '../fetch-falso';
import { renderizarRotas, TOKEN_DE_TESTE } from '../rotas/apoio';
import { fakeComCategorias, ROTAS_REAIS, vigiarConsole } from './apoio-qa';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
}));

vigiarConsole();

const MEU_PERFIL = {
  nome: 'Bruno Alves',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

function candidatura(id: string, status: 'pendente' | 'aceita' | 'recusada') {
  return {
    id,
    trampoId: `t-${id}`,
    freelancerId: 'eu',
    mensagem: 'Posso ir amanhã.',
    valorPropostoCentavos: 12000,
    status,
    criadaEm: '2026-10-20T12:00:00.000Z',
  };
}

function fake(minhas: unknown[]): FetchFalso {
  return fakeComCategorias()
    .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
    .responder('GET /trampos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', { corpo: minhas })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('GET /conversas', { corpo: [] });
}

async function abrirInicioDoFreela(fetch: FetchFalso) {
  await renderizarRotas(ROTAS_REAIS, {
    initialUrl: '/',
    fetch,
    modo: 'freela',
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
  await screen.findByRole('button', { name: textos.inicio.minhasCandidaturas });
  await waitFor(() =>
    expect(
      fetch.requisicoes.some((r) => r.caminho === '/candidaturas/minhas'),
    ).toBe(true),
  );
  // Deixa a resposta chegar e a tela redesenhar (o renderRouter usa timers
  // falsos), sem depender do texto novo que o dev e o designer escolherem.
  await act(async () => {
    await jest.advanceTimersByTimeAsync(100);
  });
}

describe('F1 — destaque "Suas candidaturas" no Início do freela', () => {
  it('com 3 candidaturas aceitas e nenhuma pendente, não diz que a pessoa nunca se candidatou', async () => {
    const fetch = fake([
      candidatura('a1', 'aceita'),
      candidatura('a2', 'aceita'),
      candidatura('a3', 'aceita'),
    ]);
    await abrirInicioDoFreela(fetch);

    expect(
      await screen.findByText(textos.inicioFreela.destaque),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.inicioFreela.semCandidaturas)).toBeNull();
  });

  it('com candidaturas aceita e recusada (trampos encerrados) e nenhuma pendente, também não diz isso', async () => {
    const fetch = fake([
      candidatura('a1', 'aceita'),
      candidatura('r1', 'recusada'),
    ]);
    await abrirInicioDoFreela(fetch);

    expect(screen.queryByText(textos.inicioFreela.semCandidaturas)).toBeNull();
  });

  it('controle: sem nenhuma candidatura, diz "Você ainda não se candidatou"', async () => {
    await abrirInicioDoFreela(fake([]));

    expect(
      await screen.findByText(textos.inicioFreela.semCandidaturas),
    ).toBeOnTheScreen();
  });
});
