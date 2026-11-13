import type { QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { Stack, useLocalSearchParams } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';
import LayoutRaiz from '../../app/_layout';
import {
  type ArmazenamentoEmMemoria,
  criarArmazenamentoEmMemoria,
} from '../../estado/armazenamento-token';
import { useMeuPerfil } from '../../estado/consultas/perfil';
import { limparExportacoesAntigas } from '../../estado/exportacao';
import { impressaoDaConta, type Sessao, useSessao } from '../../estado/sessao';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso } from '../fetch-falso';
import { renderRouter } from '../render-router';
import {
  type MapaDeRotas,
  ROTAS_PUBLICAS,
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

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 99,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// A limpeza do cache é provada em `estado/exportacao.test.ts`; aqui, só que a
// raiz a chama ao iniciar.
jest.mock('../../estado/exportacao', () => ({
  ...jest.requireActual('../../estado/exportacao'),
  limparExportacoesAntigas: jest.fn(),
}));

const EMAIL = 'maria.silva@exemplo.com';
const SENHA = 'senha-secreta-123';
const TOKEN_NOVO = 'token-recem-emitido';
const OUTRO_EMAIL = 'joao.souza@exemplo.com';

// --- Rotas stub da área autenticada (as reais são das etapas 11 e 12) ---

let sessaoVista: Sessao | undefined;

function StubInicio() {
  sessaoVista = useSessao();
  return <Text>stub: início</Text>;
}

function StubEditarPerfil() {
  const { completar } = useLocalSearchParams<{ completar?: string }>();
  return <Text>{`stub: editar perfil, completar=${completar ?? ''}`}</Text>;
}

/** Rota autenticada que pede `GET /perfis/eu` ao montar. */
function StubTrampo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { carregando, erro, perfil } = useMeuPerfil();
  const situacao = carregando
    ? 'carregando'
    : erro
      ? 'erro'
      : perfil === null
        ? 'ausente'
        : 'ok';
  return <Text>{`stub: trampo ${id}, perfil ${situacao}`}</Text>;
}

const ROTAS_DA_AREA: MapaDeRotas = {
  '(app)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(app)/index': StubInicio,
  '(app)/perfil/editar': StubEditarPerfil,
  '(app)/trampos/[id]': StubTrampo,
};

// --- Apoio ---

let chamadasDoConsole: unknown[][] = [];
const METODOS_DO_CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;

beforeEach(() => {
  sessaoVista = undefined;
  chamadasDoConsole = [];
  for (const metodo of METODOS_DO_CONSOLE) {
    jest.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      chamadasDoConsole.push(args);
    });
  }
  jest.mocked(SplashScreen.hideAsync).mockClear();
});

afterEach(() => {
  // CA15: nada de e-mail, senha ou token em `console` (nem em aviso do React).
  const texto = chamadasDoConsole.map((args) => args.map(String).join(' '));
  for (const segredo of [EMAIL, SENHA, TOKEN_NOVO, TOKEN_DE_TESTE]) {
    expect(texto.join('\n')).not.toContain(segredo);
  }
  jest.restoreAllMocks();
});

async function preencher(email: string, senha: string) {
  await fireEvent.changeText(screen.getByLabelText(textos.entrar.email), email);
  await fireEvent.changeText(screen.getByLabelText(textos.entrar.senha), senha);
}

function campoDeSenha() {
  return screen.getByLabelText(textos.entrar.senha);
}

/** CA75: o Cadastro só envia depois da escolha do objetivo (aqui, freela). */
async function escolherObjetivo() {
  await fireEvent.press(
    screen.getByRole('radio', { name: textos.cadastro.querTrampar }),
  );
}

/** Estado guardado pelo TanStack (consultas e mutações), como texto. */
function cacheComoTexto(queryClient: QueryClient): string {
  return JSON.stringify({
    consultas: queryClient
      .getQueryCache()
      .getAll()
      .map((consulta) => consulta.state),
    mutacoes: queryClient
      .getMutationCache()
      .getAll()
      .map((mutacao) => mutacao.state),
  });
}

async function renderizarConta(
  initialUrl: string,
  opcoes: {
    armazenamento?: ArmazenamentoEmMemoria;
    fetch?: ReturnType<typeof criarFetchFalso>;
  } = {},
) {
  return renderizarRotas(ROTAS_DA_AREA, { initialUrl, ...opcoes });
}

// --- Testes ---

describe('Entrada', () => {
  it('anônimo em / cai na Entrada, com logo e as duas portas (CA16)', async () => {
    const { getPathname } = await renderizarConta('/');

    expect(await screen.findByText(textos.entrada.frase)).toBeTruthy();
    expect(screen.getByLabelText(textos.entrada.logo)).toBeTruthy();
    expect(getPathname()).toBe('/entrada');
  });

  it('"Criar conta" abre o Cadastro e "Voltar" retorna à Entrada', async () => {
    const { getPathname } = await renderizarConta('/entrada');
    await screen.findByText(textos.entrada.frase);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrada.criarConta }),
    );
    expect(await screen.findByText(textos.cadastro.privacidade)).toBeTruthy();
    expect(getPathname()).toBe('/cadastro');

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    await waitFor(() => expect(getPathname()).toBe('/entrada'));
  });

  it('"Já tenho conta" abre o Entrar', async () => {
    const { getPathname } = await renderizarConta('/entrada');
    await screen.findByText(textos.entrada.frase);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrada.jaTenhoConta }),
    );
    await waitFor(() => expect(getPathname()).toBe('/entrar'));
    expect(screen.getByLabelText(textos.entrar.senha)).toBeTruthy();
  });
});

describe('Cadastro (CA1, CA2)', () => {
  it('cria a conta, guarda o token só na porta e abre o completar perfil', async () => {
    const fetch = criarFetchFalso().responder('POST /contas', {
      status: 201,
      corpo: { token: TOKEN_NOVO },
    });
    const { armazenamento, queryClient, getPathname } = await renderizarConta(
      '/cadastro',
      { fetch },
    );
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(`  ${EMAIL} `, SENHA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.criarConta }),
    );

    expect(
      await screen.findByText('stub: editar perfil, completar=1'),
    ).toBeTruthy();
    expect(getPathname()).toBe('/perfil/editar');
    const pedido = fetch.requisicoes.find((r) => r.caminho === '/contas');
    expect(pedido?.metodo).toBe('POST');
    expect(pedido?.corpo).toEqual({ email: EMAIL, senha: SENHA });
    expect(armazenamento.atual()).toBe(TOKEN_NOVO);
    // A impressão da conta (D43) vai junto do token, e o e-mail não.
    expect(armazenamento.contaAtual()).toBe(impressaoDaConta(EMAIL));
    await waitFor(() => {
      const cache = cacheComoTexto(queryClient);
      expect(cache).not.toContain(SENHA);
      expect(cache).not.toContain(TOKEN_NOVO);
    });
  });

  it('409 email_em_uso mostra o texto genérico, sem o e-mail, e limpa a senha', async () => {
    const fetch = criarFetchFalso().responder('POST /contas', {
      status: 409,
      corpo: { erro: 'email_em_uso' },
    });
    const { armazenamento, queryClient } = await renderizarConta('/cadastro', {
      fetch,
    });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, SENHA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.criarConta }),
    );

    const aviso = await screen.findByText(textos.erros.email_em_uso);
    expect(String(aviso.props.children)).not.toContain(EMAIL);
    expect(screen.queryByText(new RegExp(EMAIL))).toBeNull();
    // O e-mail digitado fica no campo; a senha, não.
    expect(screen.getByDisplayValue(EMAIL)).toBeTruthy();
    expect(campoDeSenha().props.value).toBe('');
    expect(armazenamento.atual()).toBeNull();
    // A mutação que falhou não guarda as credenciais.
    await waitFor(() =>
      expect(cacheComoTexto(queryClient)).not.toContain(SENHA),
    );
  });

  it('valida no aparelho antes de enviar: senha de 7 caracteres', async () => {
    const fetch = criarFetchFalso();
    await renderizarConta('/cadastro', { fetch });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, '1234567');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.criarConta }),
    );

    expect(await screen.findByText(textos.erros.senha_curta)).toBeTruthy();
    expect(screen.queryByText(textos.erros.email_invalido)).toBeNull();
    expect(fetch.requisicoes).toHaveLength(0);
  });

  it('valida no aparelho antes de enviar: e-mail inválido', async () => {
    const fetch = criarFetchFalso();
    await renderizarConta('/cadastro', { fetch });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher('maria@', SENHA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.criarConta }),
    );

    expect(await screen.findByText(textos.erros.email_invalido)).toBeTruthy();
    expect(screen.queryByText(textos.erros.senha_curta)).toBeNull();
    expect(fetch.requisicoes).toHaveLength(0);
    // Sem envio, a senha fica para a pessoa corrigir o e-mail.
    expect(campoDeSenha().props.value).toBe(SENHA);
  });

  it('o campo de senha permite gerenciador de senhas e colar (CA15)', async () => {
    await renderizarConta('/cadastro');
    await screen.findByText(textos.cadastro.privacidade);

    // No cadastro a senha é nova: o gerenciador oferece gerar uma.
    const campo = campoDeSenha();
    expect(campo.props.secureTextEntry).toBe(true);
    expect(campo.props.autoComplete).toBe('new-password');
    expect(campo.props.textContentType).toBe('newPassword');
    expect(campo.props.contextMenuHidden).not.toBe(true);
  });
});

describe('Entrar (CA1, CA14)', () => {
  it('entra com POST /sessoes e o guarda leva ao Início', async () => {
    const fetch = criarFetchFalso().responder('POST /sessoes', {
      corpo: { token: TOKEN_NOVO },
    });
    const { armazenamento, getPathname } = await renderizarConta('/entrar', {
      fetch,
    });
    await screen.findByLabelText(textos.entrar.senha);

    await preencher(EMAIL, SENHA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );

    expect(await screen.findByText('stub: início')).toBeTruthy();
    expect(getPathname()).toBe('/');
    expect(fetch.ultima()).toMatchObject({
      metodo: 'POST',
      caminho: '/sessoes',
      corpo: { email: EMAIL, senha: SENHA },
    });
    expect(armazenamento.atual()).toBe(TOKEN_NOVO);
    // O que a sessão expõe não carrega o token (CA15).
    expect(sessaoVista?.status).toBe('autenticado');
    expect(JSON.stringify(sessaoVista)).not.toContain(TOKEN_NOVO);
  });

  it.each([
    [
      '401 credenciais_invalidas',
      { status: 401, corpo: { erro: 'credenciais_invalidas' } },
      textos.erros.credenciais_invalidas,
    ],
    [
      '429',
      { status: 429, corpo: { erro: 'muitas_requisicoes' } },
      textos.erros.muitas_tentativas,
    ],
    ['ErroDeRede', { falhaDeRede: true }, textos.erros.sem_conexao],
  ])(
    '%s mostra o erro geral e limpa a senha',
    async (_nome, resposta, texto) => {
      const fetch = criarFetchFalso().responder('POST /sessoes', resposta);
      const { armazenamento, getPathname } = await renderizarConta('/entrar', {
        fetch,
      });
      await screen.findByLabelText(textos.entrar.senha);

      await preencher(EMAIL, SENHA);
      await fireEvent.press(
        screen.getByRole('button', { name: textos.entrar.entrar }),
      );

      expect(await screen.findByText(texto)).toBeTruthy();
      expect(campoDeSenha().props.value).toBe('');
      expect(screen.getByDisplayValue(EMAIL)).toBeTruthy();
      expect(armazenamento.atual()).toBeNull();
      expect(getPathname()).toBe('/entrar');
    },
  );

  it('401 numa rota autenticada volta ao login com o aviso e, depois de entrar, à rota de antes', async () => {
    const fetch = criarFetchFalso()
      .responder('GET /perfis/eu', [
        { status: 401, corpo: { erro: 'sessao_expirada' } },
        { status: 404, corpo: { erro: 'nao_encontrado' } },
      ])
      .responder('POST /sessoes', { corpo: { token: TOKEN_NOVO } });
    // Sessão restaurada da mesma conta que entra de novo (CA50).
    const { armazenamento, queryClient, getPathname } = await renderizarConta(
      '/trampos/t-42',
      {
        fetch,
        armazenamento: criarArmazenamentoEmMemoria(
          TOKEN_DE_TESTE,
          impressaoDaConta(EMAIL),
        ),
      },
    );

    expect(await screen.findByText(textos.erros.sessao_expirada)).toBeTruthy();
    expect(getPathname()).toBe('/entrar');
    expect(armazenamento.atual()).toBeNull();
    // Nada do que a sessão anterior carregou fica no cache.
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

    await preencher(EMAIL, SENHA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );

    expect(
      await screen.findByText('stub: trampo t-42, perfil ausente'),
    ).toBeTruthy();
    expect(getPathname()).toBe('/trampos/t-42');
    expect(armazenamento.atual()).toBe(TOKEN_NOVO);
  });

  it.each([
    ['da mesma conta volta à rota de antes', EMAIL, '/trampos/t-42'],
    [
      'da mesma conta, com maiúsculas e espaços, volta à rota de antes',
      `  ${EMAIL.toUpperCase()} `,
      '/trampos/t-42',
    ],
    ['de outra conta vai ao Início', OUTRO_EMAIL, '/'],
  ])(
    'depois de um 401, o login %s (CA50)',
    async (_nome, emailDigitado, destino) => {
      const fetch = criarFetchFalso()
        .responder('GET /perfis/eu', [
          { status: 401, corpo: { erro: 'sessao_expirada' } },
          { status: 404, corpo: { erro: 'nao_encontrado' } },
        ])
        .responder('POST /sessoes', { corpo: { token: TOKEN_NOVO } });
      const { armazenamento, getPathname } = await renderizarConta(
        '/trampos/t-42',
        {
          fetch,
          armazenamento: criarArmazenamentoEmMemoria(
            TOKEN_DE_TESTE,
            impressaoDaConta(EMAIL),
          ),
        },
      );
      expect(
        await screen.findByText(textos.erros.sessao_expirada),
      ).toBeTruthy();
      expect(armazenamento.contaAtual()).toBeNull();

      await preencher(emailDigitado, SENHA);
      await fireEvent.press(
        screen.getByRole('button', { name: textos.entrar.entrar }),
      );

      await waitFor(() => expect(getPathname()).toBe(destino));
      if (destino === '/') {
        expect(await screen.findByText('stub: início')).toBeTruthy();
      } else {
        expect(
          await screen.findByText('stub: trampo t-42, perfil ausente'),
        ).toBeTruthy();
      }
      expect(armazenamento.atual()).toBe(TOKEN_NOVO);
      expect(armazenamento.contaAtual()).toBe(impressaoDaConta(emailDigitado));
    },
  );

  it('o aviso de sessão expirada aparece uma vez só: "Voltar" e Entrar de novo não o mostram', async () => {
    const fetch = criarFetchFalso().responder('GET /perfis/eu', {
      status: 401,
      corpo: { erro: 'sessao_expirada' },
    });
    const { getPathname } = await renderizarConta('/trampos/t-1', {
      fetch,
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
    });
    await screen.findByText(textos.erros.sessao_expirada);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    await waitFor(() => expect(getPathname()).toBe('/entrada'));
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrada.jaTenhoConta }),
    );
    await waitFor(() => expect(getPathname()).toBe('/entrar'));
    expect(screen.queryByText(textos.erros.sessao_expirada)).toBeNull();
  });

  it('com sessão salva, /entrar leva direto ao Início', async () => {
    const { getPathname } = await renderizarConta('/entrar', {
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
    });

    expect(await screen.findByText('stub: início')).toBeTruthy();
    expect(getPathname()).toBe('/');
  });
});

describe('raiz do app', () => {
  it('segura a splash até a sessão carregar', async () => {
    let liberar: (token: string | null) => void = () => undefined;
    const armazenamento = criarArmazenamentoEmMemoria();
    const lento: ArmazenamentoEmMemoria = {
      ...armazenamento,
      ler: () =>
        new Promise<string | null>((resolver) => {
          liberar = resolver;
        }),
    };
    await renderizarRotas(ROTAS_DA_AREA, {
      initialUrl: '/',
      armazenamento: lento,
    });

    expect(screen.queryByText(textos.entrada.frase)).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

    await act(async () => liberar(null));

    expect(await screen.findByText(textos.entrada.frase)).toBeTruthy();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it('a raiz real lê o token do keychain, liga a rede e mostra a faixa sem conexão', async () => {
    let avisarRede: (estado: Network.NetworkState) => void = () => undefined;
    const remover = jest.fn();
    jest
      .mocked(Network.addNetworkStateListener)
      .mockImplementation((ouvinte) => {
        avisarRede = ouvinte;
        return { remove: remover } as unknown as ReturnType<
          typeof Network.addNetworkStateListener
        >;
      });
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    jest.mocked(limparExportacoesAntigas).mockClear();
    const urlOriginal = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = 'https://api.teste';
    try {
      const { unmount } = await renderRouter(
        { _layout: LayoutRaiz, ...ROTAS_PUBLICAS, ...ROTAS_DA_AREA },
        { initialUrl: '/entrar' },
      );
      await screen.findByLabelText(textos.entrar.senha);

      // Ao iniciar, apaga a exportação que sobrou no cache (S4), uma vez.
      expect(limparExportacoesAntigas).toHaveBeenCalledTimes(1);
      expect(SecureStore.getItemAsync).toHaveBeenCalled();
      expect(Network.addNetworkStateListener).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(textos.gerais.semConexaoFaixa)).toBeNull();

      await act(async () => avisarRede({ isConnected: false }));
      expect(
        await screen.findByText(textos.gerais.semConexaoFaixa),
      ).toBeTruthy();

      await act(async () => avisarRede({ isConnected: true }));
      await waitFor(() =>
        expect(screen.queryByText(textos.gerais.semConexaoFaixa)).toBeNull(),
      );

      await unmount();
      expect(remover).toHaveBeenCalled();
    } finally {
      if (urlOriginal === undefined) {
        delete process.env.EXPO_PUBLIC_API_URL;
      } else {
        process.env.EXPO_PUBLIC_API_URL = urlOriginal;
      }
    }
  });
});
