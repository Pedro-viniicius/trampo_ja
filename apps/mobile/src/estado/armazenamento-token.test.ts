import * as SecureStore from 'expo-secure-store';
import {
  CHAVE_DA_CONTA,
  CHAVE_DO_TOKEN,
  criarArmazenamentoEmMemoria,
  criarArmazenamentoSeguro,
  ErroDoArmazenamento,
  type MarcadorDeInstalacao,
  marcadorEmDocumentos,
  NOME_DO_MARCADOR,
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

// Disco falso: uri -> conteúdo. `mock*` pode ser lido dentro do `jest.mock`.
const mockDisco = new Map<string, string>();
/** Quando definido, o `writeSync` do disco falso lança este erro. */
const mockFalhas: { gravar?: Error } = {};

jest.mock('expo-file-system', () => {
  class File {
    readonly uri: string;
    constructor(diretorio: { readonly uri: string }, nome: string) {
      this.uri = `${diretorio.uri}${nome}`;
    }
    get exists(): boolean {
      return mockDisco.has(this.uri);
    }
    writeSync(conteudo: string): void {
      if (mockFalhas.gravar !== undefined) {
        throw mockFalhas.gravar;
      }
      mockDisco.set(this.uri, conteudo);
    }
    /** No SDK 58 `write` é assíncrono: o código usa `writeSync` (CA7). */
    write(): never {
      throw new Error('write assíncrono: use writeSync');
    }
  }
  return {
    File,
    Paths: {
      document: { uri: 'file:///mock/document/' },
      cache: { uri: 'file:///mock/cache/' },
    },
  };
});

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);
const deleteItemAsync = jest.mocked(SecureStore.deleteItemAsync);

const TOKEN = 'token-secreto-123';
const TOKEN_NOVO = 'token-secreto-novo-456';
const CONTA = 'impressao-da-conta-789';
const OPCOES_ESPERADAS = { keychainAccessible: 99 };
const URI_DO_MARCADOR = 'file:///mock/document/trampoja.instalacao';

/** Keychain falso: as funções simuladas leem e gravam neste mapa. */
const cofre = new Map<string, string>();

beforeEach(() => {
  jest.resetAllMocks();
  mockDisco.clear();
  delete mockFalhas.gravar;
  cofre.clear();
  getItemAsync.mockImplementation(async (chave) => cofre.get(chave) ?? null);
  setItemAsync.mockImplementation(async (chave, valor) => {
    cofre.set(chave, valor);
  });
  deleteItemAsync.mockImplementation(async (chave) => {
    cofre.delete(chave);
  });
});

async function capturar(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('a promessa deveria ter falhado');
}

/** Tudo o que um erro expõe: mensagem, texto, JSON e pilha. */
function tudoQueOErroMostra(erro: unknown): string {
  return [
    (erro as Error).message,
    String(erro),
    JSON.stringify(erro),
    (erro as Error).stack ?? '',
  ].join('\n');
}

/** Marcador falso, com contagem de chamadas e falhas opcionais. */
function marcadorFalso({
  existe = false,
  falhaAoConferir = false,
  falhaAoCriar = false,
}: {
  existe?: boolean;
  falhaAoConferir?: boolean;
  falhaAoCriar?: boolean;
} = {}): MarcadorDeInstalacao & {
  readonly existeMock: jest.Mock;
  readonly criarMock: jest.Mock;
  readonly criado: () => boolean;
} {
  let criado = existe;
  const existeMock = jest.fn(() => {
    if (falhaAoConferir) {
      throw new Error('disco ilegível');
    }
    return criado;
  });
  const criarMock = jest.fn(() => {
    if (falhaAoCriar) {
      throw new Error('disco cheio');
    }
    criado = true;
  });
  return {
    existe: existeMock,
    criar: criarMock,
    existeMock,
    criarMock,
    criado: () => criado,
  };
}

/** Adaptador de uma instalação já marcada (o caso comum). */
function criarSeguro() {
  return criarArmazenamentoSeguro(marcadorFalso({ existe: true }));
}

describe('criarArmazenamentoSeguro', () => {
  it('usa chaves fixas aceitas pelo expo-secure-store', () => {
    expect(CHAVE_DO_TOKEN).toBe('trampoja.token');
    expect(CHAVE_DA_CONTA).toBe('trampoja.conta');
    expect(CHAVE_DO_TOKEN).toMatch(/^[\w.-]+$/);
    expect(CHAVE_DA_CONTA).toMatch(/^[\w.-]+$/);
  });

  it('grava na chave fixa com WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
    await criarSeguro().gravar(TOKEN);

    expect(setItemAsync).toHaveBeenCalledTimes(1);
    expect(setItemAsync).toHaveBeenCalledWith(
      'trampoja.token',
      TOKEN,
      OPCOES_ESPERADAS,
    );
  });

  it('lê da chave fixa e devolve o token guardado', async () => {
    getItemAsync.mockResolvedValue(TOKEN);

    await expect(criarSeguro().ler()).resolves.toBe(TOKEN);
    expect(getItemAsync).toHaveBeenCalledWith(
      'trampoja.token',
      OPCOES_ESPERADAS,
    );
  });

  it('devolve null quando não há token', async () => {
    getItemAsync.mockResolvedValue(null);

    await expect(criarSeguro().ler()).resolves.toBeNull();
  });

  it('devolve null quando o valor guardado é vazio', async () => {
    getItemAsync.mockResolvedValue('');

    await expect(criarSeguro().ler()).resolves.toBeNull();
  });

  it('apaga a chave do token e a da conta', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    cofre.set(CHAVE_DA_CONTA, CONTA);

    await criarSeguro().apagar();

    expect(deleteItemAsync).toHaveBeenCalledWith(
      'trampoja.token',
      OPCOES_ESPERADAS,
    );
    expect(deleteItemAsync).toHaveBeenCalledWith(
      'trampoja.conta',
      OPCOES_ESPERADAS,
    );
    expect(cofre.size).toBe(0);
  });

  it('se apagar uma chave falha, ainda apaga a outra e falha com apagar', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    cofre.set(CHAVE_DA_CONTA, CONTA);
    deleteItemAsync.mockImplementation(async (chave) => {
      if (chave === CHAVE_DO_TOKEN) {
        throw new Error(`keychain recusou ${TOKEN}`);
      }
      cofre.delete(chave);
    });

    const erro = await capturar(criarSeguro().apagar());

    expect(erro).toBeInstanceOf(ErroDoArmazenamento);
    expect(erro).toMatchObject({ operacao: 'apagar' });
    expect(cofre.has(CHAVE_DA_CONTA)).toBe(false);
    expect(tudoQueOErroMostra(erro)).not.toContain(TOKEN);
  });

  it.each([
    ['ler', () => criarSeguro().ler(), getItemAsync],
    ['ler', () => criarSeguro().lerConta?.(), getItemAsync],
    ['gravar', () => criarSeguro().gravar(TOKEN), setItemAsync],
    ['apagar', () => criarSeguro().apagar(), deleteItemAsync],
  ] as const)(
    'falha ao %s vira ErroDoArmazenamento sem o erro nativo',
    async (operacao, executar, nativo) => {
      const nativoComDetalhe = new Error(`keychain recusou ${TOKEN}`);
      (nativo as jest.Mock).mockRejectedValue(nativoComDetalhe);

      const erro = await capturar((async () => executar())());

      expect(erro).toBeInstanceOf(ErroDoArmazenamento);
      expect(erro).toMatchObject({ operacao });
      expect((erro as Error).cause).toBeUndefined();
      const tudo = tudoQueOErroMostra(erro);
      expect(tudo).not.toContain(TOKEN);
      expect(tudo).not.toContain('keychain recusou');
    },
  );
});

describe('criarArmazenamentoSeguro: impressão da conta (D43)', () => {
  it('grava a conta junto com o token, na chave fixa e com a mesma opção', async () => {
    const armazenamento = criarSeguro();

    await armazenamento.gravar(TOKEN, CONTA);

    expect(setItemAsync).toHaveBeenCalledWith(
      'trampoja.token',
      TOKEN,
      OPCOES_ESPERADAS,
    );
    expect(setItemAsync).toHaveBeenCalledWith(
      'trampoja.conta',
      CONTA,
      OPCOES_ESPERADAS,
    );
    await expect(armazenamento.ler()).resolves.toBe(TOKEN);
    await expect(armazenamento.lerConta?.()).resolves.toBe(CONTA);
    expect(getItemAsync).toHaveBeenCalledWith(
      'trampoja.conta',
      OPCOES_ESPERADAS,
    );
  });

  it('gravar sem conta (ou com conta vazia) apaga a impressão anterior', async () => {
    const armazenamento = criarSeguro();
    await armazenamento.gravar(TOKEN, CONTA);

    await armazenamento.gravar(TOKEN_NOVO);
    await expect(armazenamento.lerConta?.()).resolves.toBeNull();

    await armazenamento.gravar(TOKEN, CONTA);
    await armazenamento.gravar(TOKEN_NOVO, '');
    await expect(armazenamento.lerConta?.()).resolves.toBeNull();
    await expect(armazenamento.ler()).resolves.toBe(TOKEN_NOVO);
  });

  it('lerConta devolve null sem impressão ou com valor vazio', async () => {
    const armazenamento = criarSeguro();

    await expect(armazenamento.lerConta?.()).resolves.toBeNull();
    cofre.set(CHAVE_DA_CONTA, '');
    await expect(armazenamento.lerConta?.()).resolves.toBeNull();
  });

  it('se gravar a conta falha, o token novo não fica e o gravar falha', async () => {
    setItemAsync.mockImplementation(async (chave, valor) => {
      if (chave === CHAVE_DA_CONTA) {
        throw new Error(`keychain recusou ${valor}`);
      }
      cofre.set(chave, valor);
    });

    const erro = await capturar(criarSeguro().gravar(TOKEN, CONTA));

    expect(erro).toBeInstanceOf(ErroDoArmazenamento);
    expect(erro).toMatchObject({ operacao: 'gravar' });
    expect(cofre.has(CHAVE_DO_TOKEN)).toBe(false);
    const tudo = tudoQueOErroMostra(erro);
    expect(tudo).not.toContain(TOKEN);
    expect(tudo).not.toContain(CONTA);
  });
});

describe('criarArmazenamentoSeguro: marcador de instalação (CA49)', () => {
  it('sem o marcador, apaga o token e a conta, cria o marcador e devolve null', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    cofre.set(CHAVE_DA_CONTA, CONTA);
    const marcador = marcadorFalso();
    const armazenamento = criarArmazenamentoSeguro(marcador);

    await expect(armazenamento.ler()).resolves.toBeNull();

    expect(deleteItemAsync).toHaveBeenCalledWith(
      'trampoja.token',
      OPCOES_ESPERADAS,
    );
    expect(deleteItemAsync).toHaveBeenCalledWith(
      'trampoja.conta',
      OPCOES_ESPERADAS,
    );
    expect(cofre.size).toBe(0);
    expect(marcador.criado()).toBe(true);
    // O marcador só é criado depois de apagar as duas chaves.
    const ultimoApagar = Math.max(...deleteItemAsync.mock.invocationCallOrder);
    expect(marcador.criarMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      ultimoApagar,
    );
    await expect(armazenamento.lerConta?.()).resolves.toBeNull();
  });

  it('com o marcador, a sessão continua: lê o token e a conta sem apagar nada', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    cofre.set(CHAVE_DA_CONTA, CONTA);
    const marcador = marcadorFalso({ existe: true });
    const armazenamento = criarArmazenamentoSeguro(marcador);

    await expect(armazenamento.ler()).resolves.toBe(TOKEN);
    await expect(armazenamento.lerConta?.()).resolves.toBe(CONTA);

    expect(deleteItemAsync).not.toHaveBeenCalled();
    expect(marcador.criarMock).not.toHaveBeenCalled();
  });

  it('se apagar falha, dá ErroDoArmazenamento(ler), não cria o marcador e tenta de novo depois', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    deleteItemAsync.mockRejectedValueOnce(
      new Error(`keychain recusou ${TOKEN}`),
    );
    const marcador = marcadorFalso();
    const armazenamento = criarArmazenamentoSeguro(marcador);

    const erro = await capturar(armazenamento.ler());

    expect(erro).toBeInstanceOf(ErroDoArmazenamento);
    expect(erro).toMatchObject({ operacao: 'ler' });
    expect((erro as Error).cause).toBeUndefined();
    expect(tudoQueOErroMostra(erro)).not.toContain(TOKEN);
    expect(marcador.criarMock).not.toHaveBeenCalled();
    expect(getItemAsync).not.toHaveBeenCalled();

    // A próxima operação confere de novo; agora apagar funciona.
    await expect(armazenamento.ler()).resolves.toBeNull();
    expect(marcador.existeMock).toHaveBeenCalledTimes(2);
    expect(marcador.criado()).toBe(true);
    expect(cofre.size).toBe(0);
  });

  it('se apagar falha antes de um gravar, o gravar falha e o token novo não é gravado', async () => {
    deleteItemAsync.mockRejectedValue(new Error('keychain recusou'));
    const marcador = marcadorFalso();

    const erro = await capturar(
      criarArmazenamentoSeguro(marcador).gravar(TOKEN_NOVO, CONTA),
    );

    expect(erro).toBeInstanceOf(ErroDoArmazenamento);
    expect(erro).toMatchObject({ operacao: 'gravar' });
    expect(setItemAsync).not.toHaveBeenCalled();
    expect(marcador.criarMock).not.toHaveBeenCalled();
  });

  it('a conferência roda uma vez por instância, mesmo com chamadas simultâneas', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    const marcador = marcadorFalso();
    const armazenamento = criarArmazenamentoSeguro(marcador);

    await expect(
      Promise.all([armazenamento.ler(), armazenamento.lerConta?.()]),
    ).resolves.toEqual([null, null]);
    await armazenamento.gravar(TOKEN_NOVO, CONTA);
    // Um apagar da conferência agora levaria o token recém-gravado.
    await expect(armazenamento.ler()).resolves.toBe(TOKEN_NOVO);
    await expect(armazenamento.lerConta?.()).resolves.toBe(CONTA);

    expect(marcador.existeMock).toHaveBeenCalledTimes(1);
    expect(marcador.criarMock).toHaveBeenCalledTimes(1);
    expect(deleteItemAsync).toHaveBeenCalledTimes(2);
  });

  it('gravar como primeira operação também confere: apaga o antigo antes de gravar o novo', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    cofre.set(CHAVE_DA_CONTA, 'impressao-de-outra-conta');
    const marcador = marcadorFalso();
    const armazenamento = criarArmazenamentoSeguro(marcador);

    await armazenamento.gravar(TOKEN_NOVO);

    expect(marcador.criado()).toBe(true);
    expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_NOVO);
    expect(cofre.has(CHAVE_DA_CONTA)).toBe(false);
    expect(deleteItemAsync.mock.invocationCallOrder[0]).toBeLessThan(
      setItemAsync.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('apagar não depende do marcador', async () => {
    const marcador = marcadorFalso();

    await criarArmazenamentoSeguro(marcador).apagar();

    expect(marcador.existeMock).not.toHaveBeenCalled();
    expect(marcador.criarMock).not.toHaveBeenCalled();
  });

  it('sem conseguir conferir o marcador, trata como instalação nova (falha fechada)', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    const marcador = marcadorFalso({ falhaAoConferir: true });

    await expect(criarArmazenamentoSeguro(marcador).ler()).resolves.toBeNull();

    expect(cofre.size).toBe(0);
    expect(marcador.criarMock).toHaveBeenCalledTimes(1);
  });

  it('se só criar o marcador falha, segue anônimo e não apaga de novo nesta execução', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    const marcador = marcadorFalso({ falhaAoCriar: true });
    const armazenamento = criarArmazenamentoSeguro(marcador);

    await expect(armazenamento.ler()).resolves.toBeNull();
    await armazenamento.gravar(TOKEN_NOVO, CONTA);

    await expect(armazenamento.ler()).resolves.toBe(TOKEN_NOVO);
    expect(marcador.existeMock).toHaveBeenCalledTimes(1);
    expect(deleteItemAsync).toHaveBeenCalledTimes(2);
  });

  it('cada instância (execução do app) confere de novo', async () => {
    const marcador = marcadorFalso();

    await criarArmazenamentoSeguro(marcador).ler();
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    await expect(criarArmazenamentoSeguro(marcador).ler()).resolves.toBe(TOKEN);

    expect(marcador.existeMock).toHaveBeenCalledTimes(2);
    expect(marcador.criarMock).toHaveBeenCalledTimes(1);
  });
});

describe('marcadorEmDocumentos', () => {
  it('usa um arquivo de nome fixo em Paths.document, com conteúdo fixo', () => {
    const marcador = marcadorEmDocumentos();

    expect(NOME_DO_MARCADOR).toBe('trampoja.instalacao');
    expect(marcador.existe()).toBe(false);
    marcador.criar();
    expect(marcador.existe()).toBe(true);
    expect([...mockDisco.keys()]).toEqual([URI_DO_MARCADOR]);
    expect(mockDisco.get(URI_DO_MARCADOR)).toBe('1');
  });

  it('é o marcador padrão do adaptador real', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN);

    await expect(criarArmazenamentoSeguro().ler()).resolves.toBeNull();
    expect(mockDisco.has(URI_DO_MARCADOR)).toBe(true);

    cofre.set(CHAVE_DO_TOKEN, TOKEN_NOVO);
    await expect(criarArmazenamentoSeguro().ler()).resolves.toBe(TOKEN_NOVO);
  });

  it('grava com writeSync: o marcador existe quando criar volta (CA7)', () => {
    const { File } =
      jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
    const writeSync = jest.spyOn(File.prototype, 'writeSync');
    const write = jest.spyOn(File.prototype, 'write');
    try {
      marcadorEmDocumentos().criar();

      expect(mockDisco.get(URI_DO_MARCADOR)).toBe('1');
      expect(writeSync).toHaveBeenCalledTimes(1);
      expect(write).not.toHaveBeenCalled();
    } finally {
      writeSync.mockRestore();
      write.mockRestore();
    }
  });

  it('a falha da gravação sai de criar e o adaptador a trata como hoje (CA7)', async () => {
    const falha = new Error('disco cheio');
    mockFalhas.gravar = falha;
    cofre.set(CHAVE_DO_TOKEN, TOKEN);
    cofre.set(CHAVE_DA_CONTA, CONTA);

    expect(() => marcadorEmDocumentos().criar()).toThrow(falha);
    // O secure-store fica limpo e a operação segue, sem marcador.
    await expect(criarArmazenamentoSeguro().ler()).resolves.toBeNull();
    expect(cofre.size).toBe(0);
    expect(mockDisco.has(URI_DO_MARCADOR)).toBe(false);

    // Na próxima execução, sem o marcador, o token gravado é descartado.
    cofre.set(CHAVE_DO_TOKEN, TOKEN_NOVO);
    await expect(criarArmazenamentoSeguro().ler()).resolves.toBeNull();
  });

  it('o marcador está gravado antes de o token novo ser gravado (CA7)', async () => {
    let marcadorAoGravarOToken: boolean | undefined;
    setItemAsync.mockImplementation(async (chave, valor) => {
      if (chave === CHAVE_DO_TOKEN) {
        marcadorAoGravarOToken = mockDisco.has(URI_DO_MARCADOR);
      }
      cofre.set(chave, valor);
    });

    await criarArmazenamentoSeguro().gravar(TOKEN, CONTA);

    expect(marcadorAoGravarOToken).toBe(true);
    expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN);
  });
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

  it('guarda a conta com o mesmo contrato do adaptador real', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN, CONTA);

    await expect(armazenamento.lerConta()).resolves.toBe(CONTA);
    expect(armazenamento.contaAtual()).toBe(CONTA);
    await armazenamento.gravar(TOKEN_NOVO);
    expect(armazenamento.contaAtual()).toBeNull();
    await armazenamento.gravar(TOKEN, CONTA);
    expect(armazenamento.contaAtual()).toBe(CONTA);
    await armazenamento.gravar(TOKEN, '');
    expect(armazenamento.contaAtual()).toBeNull();
    await armazenamento.gravar(TOKEN, CONTA);
    await armazenamento.apagar();
    expect(armazenamento.contaAtual()).toBeNull();
    expect(criarArmazenamentoEmMemoria(TOKEN, '').contaAtual()).toBeNull();
    expect(criarArmazenamentoEmMemoria(TOKEN).contaAtual()).toBeNull();
  });

  it('não toca no expo-secure-store', async () => {
    const armazenamento = criarArmazenamentoEmMemoria();
    await armazenamento.gravar(TOKEN, CONTA);
    await armazenamento.ler();
    await armazenamento.lerConta();
    await armazenamento.apagar();

    expect(setItemAsync).not.toHaveBeenCalled();
    expect(getItemAsync).not.toHaveBeenCalled();
    expect(deleteItemAsync).not.toHaveBeenCalled();
  });
});
