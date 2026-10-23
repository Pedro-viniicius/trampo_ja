import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { impressaoDaConta } from '../../estado/sessao';
import { textos } from '../../textos/pt-BR';
import { renderizarRotas } from '../rotas/apoio';
import {
  abrirApp,
  fakeComCategorias,
  PERFIL_COMPLETO,
  ROTAS_REAIS,
  textosEPropriedades,
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

const { readdirSync, readFileSync, statSync } = require('node:fs') as {
  readdirSync: (pasta: string) => string[];
  readFileSync: (arquivo: string, codificacao: 'utf8') => string;
  statSync: (caminho: string) => { isDirectory: () => boolean };
};

const EMAIL = 'qa.seguranca@exemplo.com';
const SENHA = 'senha-qa-segura-1';
const TOKEN = 'token-secreto-do-qa-0001';

const pagina = { corpo: { itens: [], proximoCursor: null } };

describe('CA15: token, senha e rascunho no app completo', () => {
  it('o token novo não aparece na tela, na rota, nos parâmetros nem no cache depois de entrar e navegar', async () => {
    const fetch = fakeComCategorias()
      .responder('POST /sessoes', { corpo: { token: TOKEN } })
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('GET /busca', pagina);
    const { queryClient, getPathname, getSearchParams } = await abrirApp(
      '/entrar',
      { fetch, token: null },
    );
    await screen.findByLabelText(textos.entrar.senha);

    await fireEvent.changeText(
      screen.getByLabelText(textos.entrar.email),
      EMAIL,
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.entrar.senha),
      SENHA,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );
    await screen.findByText('Olá, Maria Souza');
    await fireEvent.press(
      screen.getByRole('button', { name: /^Buscar(, tab|$)/ }),
    );
    await waitFor(() => expect(getPathname()).toBe('/buscar'));

    const tudo = JSON.stringify({
      arvore: textosEPropriedades(screen.toJSON()),
      rota: getPathname(),
      parametros: getSearchParams(),
      consultas: queryClient
        .getQueryCache()
        .getAll()
        .map((c) => [c.queryKey, c.state.data]),
      mutacoes: queryClient
        .getMutationCache()
        .getAll()
        .map((m) => m.state),
    });
    expect(tudo).not.toContain(TOKEN);
    expect(tudo).not.toContain(SENHA);
    expect(tudo).not.toContain(EMAIL);
  });

  it('a senha digitada some do campo assim que o envio começa, antes da resposta', async () => {
    const fetch = fakeComCategorias().responder('POST /sessoes', {
      corpo: { token: TOKEN },
      demoraMs: 500,
    });
    await abrirApp('/entrar', { fetch, token: null });
    await screen.findByLabelText(textos.entrar.senha);

    await fireEvent.changeText(
      screen.getByLabelText(textos.entrar.email),
      EMAIL,
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.entrar.senha),
      SENHA,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );

    expect(screen.getByLabelText(textos.entrar.senha).props.value).toBe('');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
  });

  it('a única escrita no armazenamento do app é o token do login; editar perfil e buscar não gravam nada', async () => {
    const armazenamento = criarArmazenamentoEmMemoria();
    const gravar = jest.spyOn(armazenamento, 'gravar');
    const fetch = fakeComCategorias()
      .responder('POST /sessoes', { corpo: { token: TOKEN } })
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('PUT /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('GET /busca', pagina);
    const { getPathname } = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/entrar',
      armazenamento,
      fetch,
    });
    await screen.findByLabelText(textos.entrar.senha);
    await fireEvent.changeText(
      screen.getByLabelText(textos.entrar.email),
      EMAIL,
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.entrar.senha),
      SENHA,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );
    await screen.findByText('Olá, Maria Souza');

    // Digita uma busca e um rascunho de perfil sem salvar.
    await fireEvent.press(
      screen.getByRole('button', { name: /^Buscar(, tab|$)/ }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText(textos.buscar.campo),
      'rascunho de busca com dado pessoal',
    );
    await fireEvent(
      screen.getByLabelText(textos.buscar.campo),
      'submitEditing',
    );
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(gravar).toHaveBeenCalledTimes(1);
    // Com o token vai só a impressão do e-mail (D43), nunca o e-mail.
    expect(gravar).toHaveBeenCalledWith(TOKEN, impressaoDaConta(EMAIL));
    expect(getPathname()).toBe('/buscar');
  });

  it('rascunho do perfil não sobrevive à saída da tela: ao reabrir, vem o perfil salvo', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      corpo: PERFIL_COMPLETO,
    });
    const { getPathname } = await abrirApp('/perfil', { fetch });
    await screen.findByText('Maria Souza');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.editar }),
    );
    await waitFor(() => expect(getPathname()).toBe('/perfil/editar'));

    await fireEvent.changeText(
      await screen.findByDisplayValue('Maria Souza'),
      'Rascunho sem salvar',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    await waitFor(() => expect(getPathname()).toBe('/perfil'));
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.editar }),
    );

    expect(await screen.findByDisplayValue('Maria Souza')).toBeOnTheScreen();
    expect(screen.queryByDisplayValue('Rascunho sem salvar')).toBeNull();
  });

  it('sair apaga o cache: o perfil de quem saiu não fica disponível para a próxima conta', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('DELETE /sessoes', { status: 204 });
    const { queryClient, armazenamento } = await abrirApp('/perfil', { fetch });
    await screen.findByText('Maria Souza');
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.sair }),
    );
    const botoes = screen.getAllByRole('button', {
      name: textos.perfil.sairConfirmar,
    });
    await fireEvent.press(botoes[botoes.length - 1] as (typeof botoes)[number]);

    await waitFor(() => expect(armazenamento.atual()).toBeNull());
    await waitFor(() =>
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0),
    );
  });
});

describe('CA15: o código do app só persiste pela porta do armazenamento seguro', () => {
  function arquivos(pasta: string): string[] {
    return readdirSync(pasta).flatMap((nome: string) => {
      const caminho = `${pasta}/${nome}`;
      if (statSync(caminho).isDirectory()) return arquivos(caminho);
      return /\.tsx?$/.test(nome) &&
        !/\.test\./.test(nome) &&
        !/testes\//.test(caminho)
        ? [caminho]
        : [];
    });
  }

  const semComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const raiz = (expect.getState().testPath ?? '').replace(
    /\/testes\/qa\/[^/]+$/,
    '',
  );

  it('só `estado/armazenamento-token.ts` importa o expo-secure-store', () => {
    const importam = arquivos(raiz)
      .filter((a) => readFileSync(a, 'utf8').includes('expo-secure-store'))
      .map((a) => a.slice(raiz.length + 1));

    expect(importam).toEqual(['estado/armazenamento-token.ts']);
  });

  it('nenhum código do app usa outro meio de persistência (disco, localStorage, SQLite, MMKV)', () => {
    const proibidos =
      /async-storage|AsyncStorage|localStorage|sessionStorage|expo-sqlite|react-native-mmkv|MMKV|expo-clipboard|Clipboard\.|document\.cookie/;
    const achados = arquivos(raiz).filter((a) =>
      proibidos.test(semComentarios(readFileSync(a, 'utf8'))),
    );

    expect(achados.map((a) => a.slice(raiz.length + 1))).toEqual([]);
  });

  it('só `estado/exportacao.ts` (arquivo temporário da exportação, D26) e `estado/armazenamento-token.ts` (marcador de instalação sem dado, S2/CA49) usam o expo-file-system', () => {
    const importam = arquivos(raiz)
      .filter((a) =>
        semComentarios(readFileSync(a, 'utf8')).includes('expo-file-system'),
      )
      .map((a) => a.slice(raiz.length + 1))
      .filter((a) => !/\.test\.tsx?$/.test(a));

    expect(importam.sort()).toEqual([
      'estado/armazenamento-token.ts',
      'estado/exportacao.ts',
    ]);
  });

  it('nenhum código do app escreve em console nem usa `debugger`', () => {
    const achados = arquivos(raiz).filter((a) =>
      /\bconsole\s*\.|\bdebugger\b/.test(
        semComentarios(readFileSync(a, 'utf8')),
      ),
    );

    expect(achados.map((a) => a.slice(raiz.length + 1))).toEqual([]);
  });
});
