// QA da L1 (CA21, CA22): política e termos pelas rotas reais, com e sem login,
// sem rede; "Voltar" do cabeçalho e do rodapé com e sem histórico; toque
// duplo; sessão que cai com o documento aberto; "Voltar" de Conta e privacidade.
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { politicaDePrivacidade, termosDeUso } from '../../textos/legal';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import {
  avancar,
  restaurarConexao,
  tocarNoMesmoTick,
} from './apoio-conversas-2c';
import {
  abrirApp,
  CATEGORIAS,
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

afterEach(async () => {
  await restaurarConexao();
});

const tConta = textos.contaEPrivacidade;
const tDoc = textos.documentoLegal;

const DOCUMENTOS = [
  {
    nome: 'política de privacidade',
    caminho: '/politica-de-privacidade',
    link: textos.cadastro.aceitePolitica,
    documento: politicaDePrivacidade,
  },
  {
    nome: 'termos de uso',
    caminho: '/termos-de-uso',
    link: textos.cadastro.aceiteTermos,
    documento: termosDeUso,
  },
] as const;

function criarFake(): FetchFalso {
  return criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('GET /trampos/meus', { corpo: [] })
    .responder('GET /servicos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', { corpo: [] });
}

/** "Voltar" do cabeçalho (o primeiro) e do rodapé (o último). */
function botoesVoltar() {
  const botoes = screen.getAllByRole('button', { name: tDoc.voltar });
  return {
    cabecalho: botoes[0] as never,
    rodape: botoes[botoes.length - 1] as never,
    quantos: botoes.length,
  };
}

describe.each(DOCUMENTOS)(
  '$nome — o que a tela mostra',
  ({ caminho, documento }) => {
    it('mostra o aviso de rascunho, a versão e todas as seções, em qualquer ordem de rolagem, sem pedir nada à rede', async () => {
      const fetch = criarFake();
      await abrirApp(caminho, { fetch, token: null });

      expect(await screen.findByText(tDoc.rascunho)).toBeOnTheScreen();
      expect(
        screen.getByText(
          tDoc.versao(documento.versao.split('-').reverse().join('/')),
        ),
      ).toBeOnTheScreen();
      for (const secao of documento.secoes) {
        expect(screen.getByText(secao.titulo)).toBeOnTheScreen();
      }
      const ultima = documento.secoes[documento.secoes.length - 1];
      const ultimoParagrafo =
        ultima?.paragrafos[ultima.paragrafos.length - 1] ?? '';
      expect(screen.getByText(ultimoParagrafo)).toBeOnTheScreen();
      expect(fetch.requisicoes).toHaveLength(0);
    });

    it('abre offline (anônimo) e continua sem nenhum pedido ao tocar em Voltar', async () => {
      const fetch = criarFake();
      await abrirApp('/entrada', { fetch, token: null });
      await act(async () => {
        onlineManager.setOnline(false);
      });
      const link =
        documento === politicaDePrivacidade
          ? textos.cadastro.aceitePolitica
          : textos.cadastro.aceiteTermos;

      await fireEvent.press(await screen.findByRole('button', { name: link }));
      expect(await screen.findByText(tDoc.rascunho)).toBeOnTheScreen();
      await fireEvent.press(botoesVoltar().cabecalho);

      expect(
        await screen.findByText(textos.entrada.criarConta),
      ).toBeOnTheScreen();
      expect(fetch.requisicoes).toHaveLength(0);
    });
  },
);

describe.each(DOCUMENTOS)('$nome — voltar', ({ caminho, link }) => {
  it('o "Voltar" do cabeçalho faz o mesmo que o do rodapé: da Entrada à Entrada, do Cadastro ao Cadastro com o rascunho', async () => {
    await abrirApp('/cadastro', { token: null });
    await fireEvent.changeText(
      await screen.findByLabelText(textos.cadastro.email),
      'rascunho@exemplo.test',
    );

    await fireEvent.press(screen.getByRole('button', { name: link }));
    await screen.findByText(tDoc.rascunho);
    expect(botoesVoltar().quantos).toBe(2);
    await fireEvent.press(botoesVoltar().cabecalho);

    expect(await screen.findByLabelText(textos.cadastro.email)).toHaveProp(
      'value',
      'rascunho@exemplo.test',
    );
    expect(screen).toHavePathname('/cadastro');
  });

  it('com login, a partir de Conta e privacidade, Voltar (cabeçalho ou rodapé) leva de volta a Conta e privacidade', async () => {
    await abrirApp('/perfil/conta', { fetch: criarFake() });
    await screen.findByText(tConta.secaoDados);

    for (const qual of ['cabecalho', 'rodape'] as const) {
      await fireEvent.press(
        screen.getByRole('button', {
          name: caminho === '/termos-de-uso' ? tConta.termos : tConta.politica,
        }),
      );
      await screen.findByText(tDoc.rascunho);
      expect(screen).toHavePathname(caminho);

      await fireEvent.press(botoesVoltar()[qual]);

      expect(await screen.findByText(tConta.secaoDados)).toBeOnTheScreen();
      expect(screen).toHavePathname('/perfil/conta');
    }
  });
});

describe('toque duplo no link do documento', () => {
  it('toque duplo no link empilha um documento só: um Voltar basta', async () => {
    await abrirApp('/entrada', { token: null });
    const botao = await screen.findByRole('button', {
      name: textos.cadastro.aceitePolitica,
    });

    await tocarNoMesmoTick(botao);
    await avancar(100);
    await screen.findByText(tDoc.rascunho);
    await fireEvent.press(botoesVoltar().cabecalho);
    await avancar(100);

    expect(screen).toHavePathname('/entrada');
    expect(
      await screen.findByText(textos.entrada.criarConta),
    ).toBeOnTheScreen();
  });
});

describe('o documento aberto quando a sessão cai', () => {
  it('com a política aberta, um 401 em andamento leva ao login com o aviso de sessão expirada, sem sobrar o documento', async () => {
    const fetch = criarFake().responder('GET /busca', {
      status: 401,
      corpo: { erro: 'sessao_invalida' },
      demoraMs: 2_000,
    });
    await abrirApp('/', { fetch });
    await act(async () => router.push('/politica-de-privacidade'));
    await screen.findByText(tDoc.rascunho);

    await avancar(2_500);

    await waitFor(() => expect(screen).toHavePathname('/entrar'));
    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    expect(screen.queryByText(tDoc.rascunho)).toBeNull();
  });
});

describe('Conta e privacidade — "Voltar" do cabeçalho', () => {
  it('com histórico (veio do Perfil), volta ao Perfil', async () => {
    await abrirApp('/perfil', { fetch: criarFake() });
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.perfil.contaEPrivacidade,
      }),
    );
    await screen.findByText(tConta.secaoDados);

    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Voltar' })[0] as never,
    );

    expect(await screen.findByText(textos.perfil.sair)).toBeOnTheScreen();
    expect(screen).toHavePathname('/perfil');
  });

  it('sem histórico (aberta pela URL), volta ao Perfil e não a uma tela em branco', async () => {
    await abrirApp('/perfil/conta', { fetch: criarFake() });
    await screen.findByText(tConta.secaoDados);

    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Voltar' })[0] as never,
    );

    expect(await screen.findByText(textos.perfil.sair)).toBeOnTheScreen();
    expect(screen).toHavePathname('/perfil');
  });
});

describe('Cadastro (CA22)', () => {
  it('mostra o texto de aceite com os dois links e o aviso de perfil público com e-mail nunca exibido', async () => {
    await abrirApp('/cadastro', { token: null });

    expect(
      await screen.findByText(textos.cadastro.privacidade),
    ).toBeOnTheScreen();
    expect(textos.cadastro.privacidade).toMatch(/nunca aparece/);
    expect(
      screen.getByRole('button', { name: textos.cadastro.aceiteTermos }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.cadastro.aceitePolitica }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(/Ao criar a conta, você concorda com os/),
    ).toBeOnTheScreen();
  });
});
