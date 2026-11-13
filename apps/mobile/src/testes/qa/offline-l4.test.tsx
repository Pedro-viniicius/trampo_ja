// QA da L4 (CA58): entrar, cadastrar e salvar perfil sem conexão falham na
// hora com `sem_conexao`, mantêm o digitado e nada é enviado sozinho quando a
// rede volta. Rotas reais com o fake de `fetch`.
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { textos } from '../../textos/pt-BR';
import type { criarFetchFalso } from '../fetch-falso';
import {
  abrirApp,
  fakeComCategorias,
  PERFIL_COMPLETO,
  vigiarConsole,
} from './apoio-qa';

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

const EMAIL = 'ana.qa@exemplo.test';
const SENHA = 'senha-qa-muito-secreta-9';
const SEM_CONEXAO = textos.erros.sem_conexao;

async function ficarOffline() {
  await act(async () => onlineManager.setOnline(false));
}
async function ficarOnline() {
  await act(async () => onlineManager.setOnline(true));
}
async function passar(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

afterEach(async () => {
  await ficarOnline();
});

/**
 * Fake que se comporta como o aparelho: com `rede.ligada` falso, toda chamada
 * às rotas de escrita falha como o `fetch` real sem conexão (`ErroDeRede`);
 * com rede, responde com sucesso.
 */
const rede = { ligada: true };
function comRede<T extends object>(corpo: T, status = 200) {
  return () =>
    rede.ligada ? { status, corpo } : { falhaDeRede: true as const };
}
beforeEach(() => {
  rede.ligada = true;
});
async function ficarSemRede() {
  rede.ligada = false;
  await ficarOffline();
}
async function voltarARede() {
  rede.ligada = true;
  await ficarOnline();
}

const posts = (fetch: ReturnType<typeof criarFetchFalso>, caminho: string) =>
  fetch.requisicoes.filter((r) => r.metodo === 'POST' && r.caminho === caminho);

function fakeDaConta() {
  return fakeComCategorias()
    .responder('POST /sessoes', comRede({ token: 'tk-novo' }))
    .responder('POST /contas', comRede({ token: 'tk-novo' }, 201))
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO });
}

describe.each([
  {
    nome: 'entrar',
    url: '/entrar',
    caminho: '/sessoes',
    rotuloEmail: textos.entrar.email,
    rotuloSenha: textos.entrar.senha,
    botao: textos.entrar.entrar,
  },
  {
    nome: 'cadastrar',
    url: '/cadastro',
    caminho: '/contas',
    rotuloEmail: textos.cadastro.email,
    rotuloSenha: textos.cadastro.senha,
    botao: textos.cadastro.criarConta,
  },
])(
  '$nome sem conexão (CA58)',
  ({ url, caminho, rotuloEmail, rotuloSenha, botao }) => {
    async function preencher() {
      await fireEvent.changeText(
        await screen.findByLabelText(rotuloEmail),
        EMAIL,
      );
      await fireEvent.changeText(screen.getByLabelText(rotuloSenha), SENHA);
      // CA75: o Cadastro só envia depois da escolha do objetivo.
      if (url === '/cadastro') {
        await fireEvent.press(
          screen.getByRole('radio', { name: textos.cadastro.querTrampar }),
        );
      }
    }

    it('falha na hora com a mensagem de conexão, mantém o e-mail e o botão volta ao normal', async () => {
      const fetch = fakeDaConta();
      await abrirApp(url, { fetch, token: null });
      await preencher();
      await ficarSemRede();

      await fireEvent.press(screen.getByRole('button', { name: botao }));
      expect(await screen.findByText(SEM_CONEXAO)).toBeTruthy();

      expect(posts(fetch, caminho)).toHaveLength(1);
      expect(screen.getByLabelText(rotuloEmail).props.value).toBe(EMAIL);
      expect(screen.getByRole('button', { name: botao })).toBeTruthy();
    });

    it('ao voltar a rede nada é reenviado sozinho, nem depois de muito tempo', async () => {
      const fetch = fakeDaConta();
      await abrirApp(url, { fetch, token: null });
      await preencher();
      await ficarSemRede();
      await fireEvent.press(screen.getByRole('button', { name: botao }));
      await screen.findByText(SEM_CONEXAO);
      expect(posts(fetch, caminho)).toHaveLength(1);

      await voltarARede();
      await passar(60_000);

      expect(posts(fetch, caminho)).toHaveLength(1);
      expect(screen.queryByText(textos.entrar.entrando)).toBeNull();
      expect(screen.queryByText(textos.cadastro.criando)).toBeNull();
    });

    it('tentar de novo com rede envia uma vez só, com o e-mail e a senha digitados', async () => {
      const fetch = fakeDaConta();
      await abrirApp(url, { fetch, token: null });
      await preencher();
      await ficarSemRede();
      await fireEvent.press(screen.getByRole('button', { name: botao }));
      await screen.findByText(SEM_CONEXAO);
      await voltarARede();
      await passar(50);

      // O formulário limpa a senha depois do erro: a pessoa digita de novo.
      await fireEvent.changeText(screen.getByLabelText(rotuloSenha), SENHA);
      await fireEvent.press(screen.getByRole('button', { name: botao }));
      await waitFor(() => expect(posts(fetch, caminho)).toHaveLength(2));
      await passar(5_000);

      expect(posts(fetch, caminho)).toHaveLength(2);
      expect(posts(fetch, caminho)[1]?.corpo).toMatchObject({
        email: EMAIL,
        senha: SENHA,
      });
    });

    it('a senha não fica no cache de mutações depois da falha offline', async () => {
      const fetch = fakeDaConta();
      const app = await abrirApp(url, { fetch, token: null });
      await preencher();
      await ficarSemRede();
      await fireEvent.press(screen.getByRole('button', { name: botao }));
      await screen.findByText(SEM_CONEXAO);
      await passar(1_000);

      const guardadas = app.queryClient
        .getMutationCache()
        .getAll()
        .map((m) => JSON.stringify(m.state.variables ?? null));
      expect(guardadas.filter((v) => v.includes(SENHA))).toEqual([]);
    });
  },
);

describe('salvar perfil sem conexão (CA58)', () => {
  const NOME_NOVO = 'Maria Souza Editada';

  it('falha na hora, mantém o digitado, não reenvia ao voltar a rede e salva quando a pessoa toca de novo', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder(
        'PUT /perfis/eu',
        comRede({ ...PERFIL_COMPLETO, nome: NOME_NOVO }),
      );
    const puts = () => fetch.requisicoes.filter((r) => r.metodo === 'PUT');
    await abrirApp('/perfil/editar', { fetch });
    const campo = await screen.findByLabelText(textos.editarPerfil.nome);
    await waitFor(() => expect(campo.props.value).toBe('Maria Souza'));
    await fireEvent.changeText(campo, NOME_NOVO);
    await ficarSemRede();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.salvar }),
    );
    expect(await screen.findByText(SEM_CONEXAO)).toBeTruthy();
    expect(puts()).toHaveLength(1);
    expect(screen.getByLabelText(textos.editarPerfil.nome).props.value).toBe(
      NOME_NOVO,
    );

    await voltarARede();
    await passar(60_000);
    expect(puts()).toHaveLength(1);
    expect(screen.getByLabelText(textos.editarPerfil.nome).props.value).toBe(
      NOME_NOVO,
    );

    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.salvar }),
    );
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[1]?.corpo).toMatchObject({ nome: NOME_NOVO });
  });
});
