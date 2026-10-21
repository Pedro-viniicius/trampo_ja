import * as SecureStore from 'expo-secure-store';
import {
  CHAVE_DO_TOKEN,
  criarArmazenamentoEmMemoria,
  criarArmazenamentoSeguro,
  ErroDoArmazenamento,
} from './armazenamento-token';

// Constantes com valores distintos: o teste só passa com a opção certa.
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED: 1,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 99,
  AFTER_FIRST_UNLOCK: 2,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);
const deleteItemAsync = jest.mocked(SecureStore.deleteItemAsync);

const TOKEN = 'token-secreto-123';
const OPCOES_ESPERADAS = { keychainAccessible: 99 };

beforeEach(() => {
  jest.resetAllMocks();
});

async function capturar(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('a promessa deveria ter falhado');
}

describe('criarArmazenamentoSeguro', () => {
  it('usa uma chave fixa aceita pelo expo-secure-store', () => {
    expect(CHAVE_DO_TOKEN).toBe('trampoja.token');
    expect(CHAVE_DO_TOKEN).toMatch(/^[\w.-]+$/);
  });

  it('grava na chave fixa com WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
    setItemAsync.mockResolvedValue(undefined);

    await criarArmazenamentoSeguro().gravar(TOKEN);

    expect(setItemAsync).toHaveBeenCalledTimes(1);
    expect(setItemAsync).toHaveBeenCalledWith(
      'trampoja.token',
      TOKEN,
      OPCOES_ESPERADAS,
    );
  });

  it('lê da chave fixa e devolve o token guardado', async () => {
    getItemAsync.mockResolvedValue(TOKEN);

    await expect(criarArmazenamentoSeguro().ler()).resolves.toBe(TOKEN);
    expect(getItemAsync).toHaveBeenCalledWith(
      'trampoja.token',
      OPCOES_ESPERADAS,
    );
  });

  it('devolve null quando não há token', async () => {
    getItemAsync.mockResolvedValue(null);

    await expect(criarArmazenamentoSeguro().ler()).resolves.toBeNull();
  });

  it('devolve null quando o valor guardado é vazio', async () => {
    getItemAsync.mockResolvedValue('');

    await expect(criarArmazenamentoSeguro().ler()).resolves.toBeNull();
  });

  it('apaga a chave fixa', async () => {
    deleteItemAsync.mockResolvedValue(undefined);

    await criarArmazenamentoSeguro().apagar();

    expect(deleteItemAsync).toHaveBeenCalledWith(
      'trampoja.token',
      OPCOES_ESPERADAS,
    );
  });

  it.each([
    ['ler', () => criarArmazenamentoSeguro().ler(), getItemAsync],
    ['gravar', () => criarArmazenamentoSeguro().gravar(TOKEN), setItemAsync],
    ['apagar', () => criarArmazenamentoSeguro().apagar(), deleteItemAsync],
  ] as const)(
    'falha ao %s vira ErroDoArmazenamento sem o erro nativo',
    async (operacao, executar, nativo) => {
      const nativoComDetalhe = new Error(`keychain recusou ${TOKEN}`);
      (nativo as jest.Mock).mockRejectedValue(nativoComDetalhe);

      const erro = await capturar(executar());

      expect(erro).toBeInstanceOf(ErroDoArmazenamento);
      expect(erro).toMatchObject({ operacao });
      expect((erro as Error).cause).toBeUndefined();
      const tudo = [
        (erro as Error).message,
        String(erro),
        JSON.stringify(erro),
        (erro as Error).stack ?? '',
      ].join('\n');
      expect(tudo).not.toContain(TOKEN);
      expect(tudo).not.toContain('keychain recusou');
    },
  );
});

describe('criarArmazenamentoEmMemoria', () => {
  it('começa vazio, grava, lê e apaga', async () => {
    const armazenamento = criarArmazenamentoEmMemoria();

    await expect(armazenamento.ler()).resolves.toBeNull();
    await armazenamento.gravar(TOKEN);
    await expect(armazenamento.ler()).resolves.toBe(TOKEN);
    expect(armazenamento.atual()).toBe(TOKEN);
    await armazenamento.apagar();
    await expect(armazenamento.ler()).resolves.toBeNull();
    await armazenamento.apagar();
    expect(armazenamento.atual()).toBeNull();
  });

  it('aceita um token inicial e trata vazio como sem token', async () => {
    await expect(criarArmazenamentoEmMemoria(TOKEN).ler()).resolves.toBe(TOKEN);
    await expect(criarArmazenamentoEmMemoria('').ler()).resolves.toBeNull();
  });

  it('não toca no expo-secure-store', async () => {
    const armazenamento = criarArmazenamentoEmMemoria();
    await armazenamento.gravar(TOKEN);
    await armazenamento.ler();
    await armazenamento.apagar();

    expect(setItemAsync).not.toHaveBeenCalled();
    expect(getItemAsync).not.toHaveBeenCalled();
    expect(deleteItemAsync).not.toHaveBeenCalled();
  });
});
