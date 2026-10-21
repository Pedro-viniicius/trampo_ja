import { focusManager, onlineManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import * as Network from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';
import { ErroDaApi, ErroDeRede } from '../api/erros';
import {
  criarQueryClient,
  deveTentarDeNovo,
  estaConectado,
  ligarGerenciadores,
  TEMPO_FRESCO_MS,
  TEMPO_NO_CACHE_MS,
} from './cliente-de-consultas';
import { useConexao } from './conexao';

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(),
  getNetworkStateAsync: jest.fn(),
}));

const addNetworkStateListener = jest.mocked(Network.addNetworkStateListener);
const getNetworkStateAsync = jest.mocked(Network.getNetworkStateAsync);

type OuvinteDeRede = (estado: Network.NetworkState) => void;
type OuvinteDeApp = (estado: AppStateStatus) => void;

let ouvinteDeRede: OuvinteDeRede | undefined;
let ouvinteDeApp: OuvinteDeApp | undefined;
const removerRede = jest.fn();
const removerApp = jest.fn();
let desligar: (() => void) | undefined;

/** Deixa as promessas pendentes (ex.: `getNetworkStateAsync`) resolverem. */
async function esvaziar(): Promise<void> {
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  ouvinteDeRede = undefined;
  ouvinteDeApp = undefined;
  addNetworkStateListener.mockImplementation((ouvinte) => {
    ouvinteDeRede = ouvinte;
    return { remove: removerRede } as unknown as ReturnType<
      typeof Network.addNetworkStateListener
    >;
  });
  getNetworkStateAsync.mockResolvedValue({ isConnected: true });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_tipo, ouvinte) => {
      ouvinteDeApp = ouvinte as OuvinteDeApp;
      return { remove: removerApp } as unknown as ReturnType<
        typeof AppState.addEventListener
      >;
    });
});

afterEach(() => {
  desligar?.();
  desligar = undefined;
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
  jest.restoreAllMocks();
});

describe('criarQueryClient', () => {
  it('usa os padrões do app', () => {
    const { queries, mutations } = criarQueryClient().getDefaultOptions();

    expect(queries?.staleTime).toBe(TEMPO_FRESCO_MS);
    expect(TEMPO_FRESCO_MS).toBe(30_000);
    expect(queries?.gcTime).toBe(TEMPO_NO_CACHE_MS);
    expect(TEMPO_NO_CACHE_MS).toBe(300_000);
    expect(queries?.retry).toBe(deveTentarDeNovo);
    expect(mutations?.retry).toBe(0);
  });
});

describe('deveTentarDeNovo', () => {
  it.each([
    ['queda de rede', new ErroDeRede('falha'), true],
    ['tempo esgotado', new ErroDeRede('tempo_esgotado'), true],
    ['500', new ErroDaApi(500, 'interno'), true],
    ['erro desconhecido', new Error('x'), true],
    ['404', new ErroDaApi(404, 'nao_encontrado'), false],
    ['401', new ErroDaApi(401, 'sessao_expirada'), false],
    ['429', new ErroDaApi(429, 'muitas_requisicoes'), false],
  ])('na 1ª falha por %s: %s', (_nome, erro, esperado) => {
    expect(deveTentarDeNovo(0, erro)).toBe(esperado);
  });

  it('nunca tenta uma segunda vez', () => {
    expect(deveTentarDeNovo(1, new ErroDeRede('falha'))).toBe(false);
    expect(deveTentarDeNovo(2, new ErroDaApi(503, 'interno'))).toBe(false);
  });
});

describe('estaConectado', () => {
  it.each([
    [{ isConnected: true }, true],
    [{ isConnected: true, isInternetReachable: false }, true],
    [{}, true],
    [{ isConnected: false }, false],
  ])('%j → %s', (estado, esperado) => {
    expect(estaConectado(estado)).toBe(esperado);
  });
});

describe('ligarGerenciadores', () => {
  it('liga o onlineManager ao expo-network', async () => {
    desligar = ligarGerenciadores();
    await esvaziar();

    expect(addNetworkStateListener).toHaveBeenCalledTimes(1);
    await act(async () => ouvinteDeRede?.({ isConnected: false }));
    expect(onlineManager.isOnline()).toBe(false);
    await act(async () => ouvinteDeRede?.({ isConnected: true }));
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('usa o estado inicial lido do expo-network', async () => {
    getNetworkStateAsync.mockResolvedValue({ isConnected: false });

    desligar = ligarGerenciadores();
    await esvaziar();

    expect(onlineManager.isOnline()).toBe(false);
  });

  it('ignora a leitura inicial que chega depois de um evento', async () => {
    let entregar: (estado: Network.NetworkState) => void = () => undefined;
    getNetworkStateAsync.mockReturnValue(
      new Promise((resolver) => {
        entregar = resolver;
      }),
    );

    desligar = ligarGerenciadores();
    await act(async () => ouvinteDeRede?.({ isConnected: false }));
    entregar({ isConnected: true });
    await esvaziar();

    expect(onlineManager.isOnline()).toBe(false);
  });

  it('falha na leitura inicial mantém o estado atual', async () => {
    getNetworkStateAsync.mockRejectedValue(new Error('indisponível'));

    desligar = ligarGerenciadores();
    await esvaziar();

    expect(onlineManager.isOnline()).toBe(true);
  });

  it('liga o focusManager ao AppState', async () => {
    desligar = ligarGerenciadores();

    await act(async () => ouvinteDeApp?.('background'));
    expect(focusManager.isFocused()).toBe(false);
    await act(async () => ouvinteDeApp?.('active'));
    expect(focusManager.isFocused()).toBe(true);
  });

  it('a função devolvida remove os dois ouvintes', async () => {
    const desligarAgora = ligarGerenciadores();
    await esvaziar();

    desligarAgora();

    expect(removerRede).toHaveBeenCalledTimes(1);
    expect(removerApp).toHaveBeenCalledTimes(1);
  });

  it('a leitura inicial que chega depois de desligar é ignorada', async () => {
    let entregar: (estado: Network.NetworkState) => void = () => undefined;
    getNetworkStateAsync.mockReturnValue(
      new Promise((resolver) => {
        entregar = resolver;
      }),
    );

    const desligarAgora = ligarGerenciadores();
    desligarAgora();
    entregar({ isConnected: false });
    await esvaziar();

    expect(onlineManager.isOnline()).toBe(true);
  });
});

describe('useConexao', () => {
  it('acompanha o onlineManager', async () => {
    const { result } = await renderHook(useConexao);

    expect(result.current).toEqual({ online: true });
    await act(async () => onlineManager.setOnline(false));
    expect(result.current).toEqual({ online: false });
    await act(async () => onlineManager.setOnline(true));
    expect(result.current).toEqual({ online: true });
  });

  it('segue o expo-network quando os gerenciadores estão ligados', async () => {
    desligar = ligarGerenciadores();
    const { result } = await renderHook(useConexao);
    await esvaziar();

    await act(async () => ouvinteDeRede?.({ isConnected: false }));

    expect(result.current.online).toBe(false);
  });
});
