// QA da L2 (CA34): retirar candidatura pelas rotas reais, com um servidor que
// aplica as regras da API e nunca repete id de candidatura. Foco nas jornadas
// que cruzam telas e nos desencontros entre o app e o servidor.
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { esquecerAvisoDeRetorno } from '../../estado/aviso-de-retorno';
import { textos } from '../../textos/pt-BR';
import {
  BIA,
  botaoDoDialogo,
  criarServidorL2,
  EU,
  novaCandidatura,
  novoTrampo,
  passar,
  requisicoesDe,
} from './apoio-anuncios-l2';
import { abrirApp, vigiarConsole } from './apoio-qa';

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

vigiarConsole();

afterEach(() => {
  esquecerAvisoDeRetorno();
});

const c = textos.candidatura;

/** Trampo da Bia, aberto, com uma candidatura pendente da conta da sessão. */
function servidorComCandidatura() {
  return criarServidorL2({
    trampos: [
      novoTrampo('t9', 'Pintar a casa do vizinho', {
        autorId: BIA,
        prazo: null,
      }),
    ],
    candidaturas: [novaCandidatura('k1', 't9', EU)],
  });
}

const botaoRetirar = () => screen.findByRole('button', { name: c.retirar });

async function retirarPeloRodape() {
  await fireEvent.press(await botaoRetirar());
  await fireEvent.press(botaoDoDialogo(c.retirar));
}

async function candidatarPelaFolha() {
  await fireEvent.press(
    await screen.findByRole('button', {
      name: textos.detalheTrampo.candidatar,
    }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText(textos.candidatar.mensagem),
    'Posso começar amanhã.',
  );
  await fireEvent.changeText(
    screen.getByLabelText(textos.candidatar.valor),
    '1.400,00',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: textos.candidatar.enviar }),
  );
}

describe('CA34 — retirar e se candidatar de novo', () => {
  it('retirar, candidatar de novo e retirar outra vez no rodapé: cada DELETE leva o id da candidatura vigente', async () => {
    const servidor = servidorComCandidatura();
    await abrirApp('/trampos/t9', { fetch: servidor.fetch });

    await retirarPeloRodape();
    expect(await screen.findByText(c.retirada)).toBeOnTheScreen();
    expect(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    ).toBeOnTheScreen();
    expect(servidor.candidaturas).toHaveLength(0);

    await candidatarPelaFolha();
    await screen.findByText(textos.candidatar.enviada);
    expect(servidor.candidaturas).toHaveLength(1);
    const segunda = servidor.candidaturas[0]?.id;
    expect(segunda).toBeDefined();
    expect(segunda).not.toBe('k1');
    await passar();

    await retirarPeloRodape();
    expect(await screen.findByText(c.retirada)).toBeOnTheScreen();
    expect(
      requisicoesDe(servidor.fetch, 'DELETE', '/candidaturas/k1'),
    ).toHaveLength(1);
    expect(
      requisicoesDe(servidor.fetch, 'DELETE', `/candidaturas/${segunda}`),
    ).toHaveLength(1);
    expect(servidor.candidaturas).toHaveLength(0);
  });

  it('retirar em Minhas candidaturas e abrir o trampo em seguida: o rodapé já mostra "Candidatar-se"', async () => {
    const servidor = servidorComCandidatura();
    await abrirApp('/candidaturas', { fetch: servidor.fetch });
    await fireEvent.press(
      await screen.findByRole('button', {
        name: c.retirarDe('Pintar a casa do vizinho'),
      }),
    );
    await fireEvent.press(botaoDoDialogo(c.retirar));
    expect(await screen.findByText(c.retirada)).toBeOnTheScreen();

    await act(async () => router.push('/trampos/t9'));
    expect(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: c.retirar })).toBeNull();
  });

  it('retirar no rodapé e abrir Minhas candidaturas em seguida: a lista já não traz a candidatura', async () => {
    const servidor = servidorComCandidatura();
    await abrirApp('/candidaturas', { fetch: servidor.fetch });
    await screen.findByText('Pintar a casa do vizinho');
    await act(async () => router.push('/trampos/t9'));
    await retirarPeloRodape();
    await screen.findByText(c.retirada);

    await act(async () => router.back());
    await passar(100);
    expect(screen.queryByText('Pintar a casa do vizinho')).toBeNull();
  });
});

describe('CA34 — o autor mexeu no trampo enquanto a pessoa olhava', () => {
  it('o autor encerrou: retirar leva 409, avisa que já foi respondida e o rodapé mostra a candidatura como recusada', async () => {
    const servidor = servidorComCandidatura();
    await abrirApp('/trampos/t9', { fetch: servidor.fetch });
    await botaoRetirar();

    // O autor (outra conta) encerra: a pendente vira recusada no servidor.
    const trampo = servidor.trampos[0];
    if (trampo === undefined || servidor.candidaturas[0] === undefined) {
      throw new Error('servidor sem dados');
    }
    trampo.status = 'encerrado';
    servidor.candidaturas[0].status = 'recusada';

    await fireEvent.press(await botaoRetirar());
    await fireEvent.press(botaoDoDialogo(c.retirar));

    expect(await screen.findByText(c.respondida)).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: c.retirar })).toBeNull(),
    );
    expect(servidor.candidaturas).toHaveLength(1);
    expect(screen.getAllByText(textos.selos.recusada).length).toBeGreaterThan(
      0,
    );
    expect(
      requisicoesDe(servidor.fetch, 'DELETE', '/candidaturas/k1'),
    ).toHaveLength(1);
  });

  it('o autor excluiu o trampo: retirar leva 404 e a candidatura sai de Minhas candidaturas, sem texto de erro', async () => {
    const servidor = servidorComCandidatura();
    await abrirApp('/candidaturas', { fetch: servidor.fetch });
    await fireEvent.press(
      await screen.findByRole('button', {
        name: c.retirarDe('Pintar a casa do vizinho'),
      }),
    );
    // Some do servidor (exclusão do trampo apaga a candidatura junto).
    servidor.trampos.length = 0;
    servidor.candidaturas.length = 0;
    await fireEvent.press(botaoDoDialogo(c.retirar));
    await passar(100);

    expect(screen.queryByText(c.erroAoRetirar)).toBeNull();
    expect(screen.queryByText(c.respondida)).toBeNull();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Retirar/ })).toBeNull(),
    );
  });
});
