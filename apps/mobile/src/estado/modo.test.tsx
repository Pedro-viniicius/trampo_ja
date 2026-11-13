// CA75 (parte de estado) e P3: o modo de navegação abre em freela sem nada
// gravado, troca na hora sem chamar a API, persiste no secure-store e não sai
// ao sair da conta.
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Text } from 'react-native';
import { criarProvedores } from '../testes/renderizar';
import {
  CHAVE_DA_CONTA,
  CHAVE_DO_TOKEN,
  criarArmazenamentoEmMemoria,
  criarArmazenamentoSeguro,
} from './armazenamento-token';
import {
  type ArmazenamentoDoModo,
  CHAVE_DO_MODO,
  criarArmazenamentoDoModoEmMemoria,
  criarArmazenamentoDoModoSeguro,
  ErroDoArmazenamentoDoModo,
  MODO_PADRAO,
  type Modo,
  ModoProvider,
  useModo,
} from './modo';
import { useSessao } from './sessao';

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
const OPCOES_ESPERADAS = { keychainAccessible: 99 };

/** Keychain falso: as funções simuladas leem e gravam neste mapa. */
const cofre = new Map<string, string>();

const METODOS_DO_CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;

beforeEach(() => {
  jest.resetAllMocks();
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

/** Promessa controlada pelo teste. */
function adiada<T>() {
  let resolver!: (valor: T) => void;
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<T>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

/** `useModo` dentro só do `ModoProvider`, com o armazenamento dado. */
function renderizarModo(armazenamento: ArmazenamentoDoModo) {
  return renderHook(useModo, {
    wrapper: ({ children }) => (
      <ModoProvider armazenamento={armazenamento}>{children}</ModoProvider>
    ),
  });
}

describe('adaptador real (secure-store)', () => {
  it('usa a chave trampoja.modo', () => {
    expect(CHAVE_DO_MODO).toBe('trampoja.modo');
  });

  it.each<Modo>(['freela', 'contratante'])(
    'lê o modo gravado (%s) com as opções do aparelho',
    async (modo) => {
      cofre.set(CHAVE_DO_MODO, modo);

      await expect(criarArmazenamentoDoModoSeguro().ler()).resolves.toBe(modo);
      expect(getItemAsync).toHaveBeenCalledWith(
        CHAVE_DO_MODO,
        OPCOES_ESPERADAS,
      );
    },
  );

  it('sem nada gravado, lê null', async () => {
    await expect(criarArmazenamentoDoModoSeguro().ler()).resolves.toBeNull();
  });

  it.each(['', 'admin', 'FREELA', ' contratante', '{"modo":"freela"}'])(
    'valor inválido (%j) é lido como null',
    async (valor) => {
      cofre.set(CHAVE_DO_MODO, valor);

      await expect(criarArmazenamentoDoModoSeguro().ler()).resolves.toBeNull();
    },
  );

  it('grava o modo na chave, com as opções do aparelho', async () => {
    await criarArmazenamentoDoModoSeguro().gravar('contratante');

    expect(setItemAsync).toHaveBeenCalledWith(
      CHAVE_DO_MODO,
      'contratante',
      OPCOES_ESPERADAS,
    );
    expect(cofre.get(CHAVE_DO_MODO)).toBe('contratante');
  });

  it('não toca nas chaves do token nem da conta', async () => {
    cofre.set(CHAVE_DO_TOKEN, 'token');
    cofre.set(CHAVE_DA_CONTA, 'conta');
    const armazenamento = criarArmazenamentoDoModoSeguro();

    await armazenamento.gravar('contratante');
    await armazenamento.ler();

    expect(cofre.get(CHAVE_DO_TOKEN)).toBe('token');
    expect(cofre.get(CHAVE_DA_CONTA)).toBe('conta');
    expect(deleteItemAsync).not.toHaveBeenCalled();
  });

  it('falha ao ler: erro de mensagem fixa, sem o erro nativo', async () => {
    getItemAsync.mockRejectedValue(new Error('detalhe-nativo-do-keychain'));

    const erro = await capturar(criarArmazenamentoDoModoSeguro().ler());

    expect(erro).toBeInstanceOf(ErroDoArmazenamentoDoModo);
    expect((erro as ErroDoArmazenamentoDoModo).operacao).toBe('ler');
    expect((erro as Error).message).toBe('falha ao ler o modo');
    expect((erro as Error).cause).toBeUndefined();
  });

  it('falha ao gravar: erro de mensagem fixa, sem o erro nativo', async () => {
    setItemAsync.mockRejectedValue(new Error('detalhe-nativo-do-keystore'));

    const erro = await capturar(
      criarArmazenamentoDoModoSeguro().gravar('freela'),
    );

    expect(erro).toBeInstanceOf(ErroDoArmazenamentoDoModo);
    expect((erro as ErroDoArmazenamentoDoModo).operacao).toBe('gravar');
    expect((erro as Error).message).toBe('falha ao gravar o modo');
    expect((erro as Error).cause).toBeUndefined();
  });

  it('P3: apagar o token (sair da conta) não apaga o modo', async () => {
    cofre.set(CHAVE_DO_TOKEN, 'token');
    cofre.set(CHAVE_DO_MODO, 'contratante');
    const token = criarArmazenamentoSeguro({
      existe: () => true,
      criar: () => undefined,
    });

    await token.apagar();

    expect(cofre.has(CHAVE_DO_TOKEN)).toBe(false);
    expect(cofre.get(CHAVE_DO_MODO)).toBe('contratante');
    expect(deleteItemAsync).not.toHaveBeenCalledWith(
      CHAVE_DO_MODO,
      expect.anything(),
    );
  });
});

describe('fake em memória', () => {
  it('começa vazio por padrão e guarda o que foi gravado', async () => {
    const fake = criarArmazenamentoDoModoEmMemoria();
    await expect(fake.ler()).resolves.toBeNull();

    await fake.gravar('contratante');

    await expect(fake.ler()).resolves.toBe('contratante');
    expect(fake.atual()).toBe('contratante');
  });

  it('aceita o modo inicial', async () => {
    await expect(
      criarArmazenamentoDoModoEmMemoria('contratante').ler(),
    ).resolves.toBe('contratante');
  });
});

describe('ModoProvider e useModo (CA75)', () => {
  it('sem modo gravado, abre no modo freela e não grava nada', async () => {
    const armazenamento = criarArmazenamentoDoModoEmMemoria();

    const { result } = await renderizarModo(armazenamento);

    expect(MODO_PADRAO).toBe('freela');
    expect(result.current.modo).toBe('freela');
    expect(armazenamento.atual()).toBeNull();
  });

  it('abre no modo gravado', async () => {
    const { result } = await renderizarModo(
      criarArmazenamentoDoModoEmMemoria('contratante'),
    );

    expect(result.current.modo).toBe('contratante');
  });

  it('valor inválido vindo da porta: abre em freela', async () => {
    const { result } = await renderizarModo({
      ler: async () => 'admin' as Modo,
      gravar: async () => undefined,
    });

    expect(result.current.modo).toBe('freela');
  });

  it('leitura que falha: abre em freela, sem escrever no console', async () => {
    const espioes = METODOS_DO_CONSOLE.map((m) => jest.spyOn(console, m));

    const { result } = await renderizarModo({
      ler: () => Promise.reject(new ErroDoArmazenamentoDoModo('ler')),
      gravar: async () => undefined,
    });

    expect(result.current.modo).toBe('freela');
    for (const espiao of espioes) expect(espiao).not.toHaveBeenCalled();
  });

  it('não desenha os filhos antes de ler o modo (nada de piscar o padrão)', async () => {
    const leitura = adiada<Modo | null>();
    await render(
      <ModoProvider
        armazenamento={{
          ler: () => leitura.promessa,
          gravar: async () => undefined,
        }}
      >
        <Text>conteúdo</Text>
      </ModoProvider>,
    );

    expect(screen.queryByText('conteúdo')).toBeNull();

    await act(async () => {
      leitura.resolver('contratante');
    });

    expect(screen.getByText('conteúdo')).toBeTruthy();
  });

  it('a troca vale na hora e fica gravada', async () => {
    const armazenamento = criarArmazenamentoDoModoEmMemoria();
    const { result } = await renderizarModo(armazenamento);

    await act(async () => {
      await result.current.definirModo('contratante');
    });

    expect(result.current.modo).toBe('contratante');
    expect(armazenamento.atual()).toBe('contratante');
  });

  it('a troca muda o modo antes de a gravação terminar', async () => {
    const gravacao = adiada<void>();
    const { result } = await renderizarModo({
      ler: async () => null,
      gravar: () => gravacao.promessa,
    });

    let terminou = false;
    await act(async () => {
      result.current.definirModo('contratante').then(() => {
        terminou = true;
      });
    });

    expect(result.current.modo).toBe('contratante');
    expect(terminou).toBe(false);

    await act(async () => {
      gravacao.resolver();
    });
    expect(terminou).toBe(true);
  });

  it('persiste depois de reabrir o app (mesmo armazenamento, provider novo)', async () => {
    const armazenamento = criarArmazenamentoDoModoEmMemoria();
    const primeira = await renderizarModo(armazenamento);
    await act(async () => {
      await primeira.result.current.definirModo('contratante');
    });
    await primeira.unmount();

    const segunda = await renderizarModo(armazenamento);

    expect(segunda.result.current.modo).toBe('contratante');
  });

  it('persiste no secure-store real depois de reabrir', async () => {
    const primeira = await renderizarModo(criarArmazenamentoDoModoSeguro());
    await act(async () => {
      await primeira.result.current.definirModo('contratante');
    });
    await primeira.unmount();

    const segunda = await renderizarModo(criarArmazenamentoDoModoSeguro());

    expect(cofre.get(CHAVE_DO_MODO)).toBe('contratante');
    expect(segunda.result.current.modo).toBe('contratante');
  });

  it('gravação que falha: o modo novo vale, a promessa resolve e nada vai para o console', async () => {
    const espioes = METODOS_DO_CONSOLE.map((m) => jest.spyOn(console, m));
    const { result } = await renderizarModo({
      ler: async () => null,
      gravar: () => Promise.reject(new ErroDoArmazenamentoDoModo('gravar')),
    });

    await act(async () => {
      await expect(
        result.current.definirModo('contratante'),
      ).resolves.toBeUndefined();
    });

    expect(result.current.modo).toBe('contratante');
    for (const espiao of espioes) expect(espiao).not.toHaveBeenCalled();
  });

  it('trocas seguidas gravam em ordem: o último modo escolhido é o que fica', async () => {
    const gravados: Modo[] = [];
    const primeira = adiada<void>();
    let chamadas = 0;
    const { result } = await renderizarModo({
      ler: async () => null,
      gravar: async (modo) => {
        chamadas += 1;
        // A primeira gravação demora: a segunda tem de esperar por ela.
        if (chamadas === 1) await primeira.promessa;
        gravados.push(modo);
      },
    });

    let ultima: Promise<void> = Promise.resolve();
    await act(async () => {
      void result.current.definirModo('contratante');
      ultima = result.current.definirModo('freela');
    });
    expect(chamadas).toBe(1);

    await act(async () => {
      primeira.resolver();
      await ultima;
    });

    expect(gravados).toEqual(['contratante', 'freela']);
    expect(result.current.modo).toBe('freela');
  });

  it('uma gravação que falha não trava as próximas', async () => {
    const gravados: Modo[] = [];
    let chamadas = 0;
    const { result } = await renderizarModo({
      ler: async () => null,
      gravar: async (modo) => {
        chamadas += 1;
        if (chamadas === 1) throw new ErroDoArmazenamentoDoModo('gravar');
        gravados.push(modo);
      },
    });

    await act(async () => {
      await result.current.definirModo('contratante');
      await result.current.definirModo('freela');
    });

    expect(gravados).toEqual(['freela']);
  });

  it('fora do ModoProvider, useModo lança', async () => {
    await expect(renderHook(useModo)).rejects.toThrow(
      'useModo precisa estar dentro de <ModoProvider>',
    );
  });
});

describe('modo nos provedores de teste', () => {
  function useModoESessao() {
    return { ...useModo(), sessao: useSessao() };
  }

  it('o padrão é nada gravado: abre em freela', async () => {
    const { wrapper, armazenamentoDoModo } = criarProvedores();

    const { result } = await renderHook(useModoESessao, { wrapper });

    expect(result.current.modo).toBe('freela');
    await expect(armazenamentoDoModo.ler()).resolves.toBeNull();
  });

  it('aceita o modo gravado', async () => {
    const { wrapper } = criarProvedores({ modo: 'contratante' });

    const { result } = await renderHook(useModoESessao, { wrapper });

    expect(result.current.modo).toBe('contratante');
  });

  it('nenhuma troca chama a API', async () => {
    const { wrapper, fetch } = criarProvedores({
      armazenamento: criarArmazenamentoEmMemoria('token'),
    });
    const { result } = await renderHook(useModoESessao, { wrapper });
    await waitFor(() =>
      expect(result.current.sessao.status).toBe('autenticado'),
    );
    const antes = fetch.requisicoes.length;

    await act(async () => {
      await result.current.definirModo('contratante');
      await result.current.definirModo('freela');
      await result.current.definirModo('contratante');
    });

    expect(fetch.requisicoes.length).toBe(antes);
    expect(result.current.modo).toBe('contratante');
  });

  it('P3: sair da conta não muda nem apaga o modo', async () => {
    const armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria();
    const { wrapper, armazenamento } = criarProvedores({
      armazenamento: criarArmazenamentoEmMemoria('token'),
      armazenamentoDoModo,
    });
    const { result } = await renderHook(useModoESessao, { wrapper });
    await waitFor(() =>
      expect(result.current.sessao.status).toBe('autenticado'),
    );
    await act(async () => {
      await result.current.definirModo('contratante');
    });

    await act(async () => {
      await result.current.sessao.sair();
    });

    expect(result.current.sessao.status).toBe('anonimo');
    await expect(armazenamento.ler()).resolves.toBeNull();
    expect(result.current.modo).toBe('contratante');
    expect(armazenamentoDoModo.atual()).toBe('contratante');
  });
});
