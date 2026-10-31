// QA da L4 (CA62): nas seis telas com formulário, o primeiro campo com erro
// recebe o foco e a tela rola até ele. Rotas reais; o foco é observado no
// `focus()` do mock de `TextInput`, e a rolagem no `scrollTo` do `ScrollView`.
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { ScrollView, TextInput } from 'react-native';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso } from '../fetch-falso';
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

type Proto = {
  focus: (...args: unknown[]) => void;
  measureLayout: (...args: unknown[]) => void;
};

/** Rótulos dos campos que receberam `focus()`, na ordem. */
let focados: string[];
/** Posições (y) pedidas ao `scrollTo`. */
let rolagens: number[];

beforeEach(() => {
  focados = [];
  rolagens = [];
  const proto = TextInput.prototype as unknown as Proto;
  jest.spyOn(proto, 'focus').mockImplementation(function (this: {
    props?: { accessibilityLabel?: string };
  }) {
    focados.push(String(this.props?.accessibilityLabel));
  });
  jest
    .spyOn(proto, 'measureLayout')
    .mockImplementation((_relativo, aoMedir) =>
      (aoMedir as (x: number, y: number) => void)(0, 700),
    );
  jest
    .spyOn(ScrollView.prototype as never, 'getInnerViewRef' as never)
    .mockReturnValue({} as never);
  jest
    .spyOn(ScrollView.prototype as never, 'scrollTo' as never)
    .mockImplementation(((opcoes: { y: number }) => {
      rolagens.push(opcoes.y);
    }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const botao = (nome: string) => screen.getByRole('button', { name: nome });

async function esperarFoco(rotulo: string) {
  await waitFor(() => expect(focados.at(-1)).toBe(rotulo));
  expect(rolagens.length).toBeGreaterThan(0);
  expect(rolagens.at(-1)).toBeGreaterThan(0);
}

describe('primeiro campo com erro recebe o foco e a tela rola (CA62)', () => {
  it('entrar: e-mail vazio e senha vazia focam o e-mail', async () => {
    await abrirApp('/entrar', { token: null });
    await screen.findByLabelText(textos.entrar.email);
    await fireEvent.press(botao(textos.entrar.entrar));
    await esperarFoco(textos.entrar.email);
  });

  it('entrar: só a senha com erro foca a senha, e não o e-mail', async () => {
    await abrirApp('/entrar', { token: null });
    await fireEvent.changeText(
      await screen.findByLabelText(textos.entrar.email),
      'ana@exemplo.test',
    );
    await fireEvent.press(botao(textos.entrar.entrar));
    await esperarFoco(textos.entrar.senha);
    expect(focados).not.toContain(textos.entrar.email);
  });

  it('cadastro: e-mail inválido foca o e-mail; com e-mail certo e senha curta foca a senha', async () => {
    await abrirApp('/cadastro', { token: null });
    await screen.findByLabelText(textos.cadastro.email);
    await fireEvent.press(botao(textos.cadastro.criarConta));
    await esperarFoco(textos.cadastro.email);

    focados.length = 0;
    await fireEvent.changeText(
      screen.getByLabelText(textos.cadastro.email),
      'ana@exemplo.test',
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.cadastro.senha),
      'curta',
    );
    await fireEvent.press(botao(textos.cadastro.criarConta));
    await esperarFoco(textos.cadastro.senha);
    expect(focados).not.toContain(textos.cadastro.email);
  });

  it('editar perfil: perfil novo (404) enviado vazio foca o nome', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByLabelText(textos.editarPerfil.nome);
    await fireEvent.press(botao(textos.editarPerfil.salvar));
    await esperarFoco(textos.editarPerfil.nome);
  });

  it('editar perfil: só a cidade vazia foca a cidade', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      corpo: PERFIL_COMPLETO,
    });
    await abrirApp('/perfil/editar', { fetch });
    const cidade = await screen.findByLabelText(textos.editarPerfil.cidade);
    await waitFor(() => expect(cidade.props.value).toBe('Lavras'));
    await fireEvent.changeText(cidade, '');
    await fireEvent.press(botao(textos.editarPerfil.salvar));
    await esperarFoco(textos.editarPerfil.cidade);
    expect(focados).not.toContain(textos.editarPerfil.nome);
  });

  it('formulário de anúncio: vazio foca o título; com título certo, foca a descrição', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      corpo: PERFIL_COMPLETO,
    });
    await abrirApp('/trampos/novo', { fetch });
    await screen.findByLabelText(textos.formularioDeAnuncio.titulo);
    await fireEvent.press(botao(textos.formularioDeAnuncio.publicarTrampo));
    await esperarFoco(textos.formularioDeAnuncio.titulo);

    focados.length = 0;
    await fireEvent.changeText(
      screen.getByLabelText(textos.formularioDeAnuncio.titulo),
      'Pintar a sala de estar',
    );
    await fireEvent.press(botao(textos.formularioDeAnuncio.publicarTrampo));
    await esperarFoco(textos.formularioDeAnuncio.descricao);
    expect(focados).not.toContain(textos.formularioDeAnuncio.titulo);
  });

  it.each([
    {
      nome: 'excluir conta',
      url: '/perfil/excluir',
      rota: 'POST /contas/eu/exclusao',
      botao: textos.excluirConta.excluir,
      rotulo: textos.excluirConta.senha,
    },
    {
      nome: 'exportar dados',
      url: '/perfil/exportar',
      rota: 'POST /contas/eu/exportacao',
      botao: textos.exportarDados.gerar,
      rotulo: textos.exportarDados.senha,
    },
  ])(
    '$nome: senha errada devolvida pela API foca a senha',
    async ({ url, rota, botao: nomeDoBotao, rotulo }) => {
      const fetch = criarFetchFalso()
        .responder('GET /categorias', { corpo: [] })
        .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
        .responder(rota, {
          status: 403,
          corpo: { erro: 'senha_incorreta' },
        });
      await abrirApp(url, { fetch });
      await fireEvent.changeText(
        await screen.findByLabelText(rotulo),
        'senha-errada-123',
      );
      await fireEvent.press(botao(nomeDoBotao));
      // A exclusão pede confirmação antes de chamar a API.
      if (url === '/perfil/excluir') {
        await fireEvent.press(botao(textos.excluirConta.dialogoConfirmar));
      }
      await screen.findByText(textos.erros.senha_incorreta);
      await esperarFoco(rotulo);
    },
  );
});
