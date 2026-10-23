/**
 * QA da L3 no app completo (raiz real + rotas reais):
 * - CA49 (S2): o armazenamento seguro de verdade, sobre um keychain falso e um
 *   marcador de instalação falso, ligado à sessão e às telas;
 * - CA51 (S6): "Sair" sem rede e um login logo em seguida;
 * - CA45 (app): o 503 `servico_ocupado` aparece como erro genérico, sem o
 *   código, e a pessoa pode tentar de novo;
 * - CA48 (app): o 409 `exportacao_grande` não compartilha nada nem derruba a
 *   sessão.
 */

import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import {
  type ArmazenamentoEmMemoria,
  CHAVE_DA_CONTA,
  CHAVE_DO_TOKEN,
  criarArmazenamentoSeguro,
  type MarcadorDeInstalacao,
} from '../../estado/armazenamento-token';
import { impressaoDaConta } from '../../estado/sessao';
import { textos } from '../../textos/pt-BR';
import type { FetchFalso } from '../fetch-falso';
import { renderizarRotas, TOKEN_DE_TESTE } from '../rotas/apoio';
import {
  fakeComCategorias,
  PERFIL_COMPLETO,
  ROTAS_REAIS,
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
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  File: class {},
  Paths: { document: { uri: 'file:///mock/document/' } },
}));

// A folha de compartilhamento fica de fora: o teste só confere que não abriu.
jest.mock('../../estado/exportacao', () => ({
  ...jest.requireActual('../../estado/exportacao'),
  compartilharExportacao: jest.fn(),
}));

import { compartilharExportacao } from '../../estado/exportacao';

vigiarConsole();

const compartilhar = jest.mocked(compartilharExportacao);
const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);
const deleteItemAsync = jest.mocked(SecureStore.deleteItemAsync);

const EMAIL = 'qa.l3@exemplo.com';
const SENHA = 'senha-qa-l3-123';
const TOKEN_ANTIGO = 'token-da-instalacao-anterior';
const TOKEN_NOVO = 'token-novo-do-login';
const CONTA_ANTIGA = 'impressao-antiga';

const cofre = new Map<string, string>();

beforeEach(() => {
  jest.clearAllMocks();
  cofre.clear();
  getItemAsync.mockImplementation(async (chave) => cofre.get(chave) ?? null);
  setItemAsync.mockImplementation(async (chave, valor) => {
    cofre.set(chave, valor);
  });
  deleteItemAsync.mockImplementation(async (chave) => {
    cofre.delete(chave);
  });
});

/** Marcador falso: `existe` diz se a instalação já foi marcada. */
function marcadorFalso(existe: boolean): MarcadorDeInstalacao & {
  criado: () => boolean;
} {
  let criado = existe;
  return {
    existe: () => criado,
    criar: () => {
      criado = true;
    },
    criado: () => criado,
  };
}

/** O adaptador real, visto como o fake de testes que a raiz pede. */
function armazenamentoReal(
  marcador: MarcadorDeInstalacao,
): ArmazenamentoEmMemoria {
  const real = criarArmazenamentoSeguro(marcador);
  return {
    ler: () => real.ler(),
    lerConta: async () => (await real.lerConta?.()) ?? null,
    gravar: (token, conta) => real.gravar(token, conta),
    apagar: () => real.apagar(),
    atual: () => cofre.get(CHAVE_DO_TOKEN) ?? null,
    contaAtual: () => cofre.get(CHAVE_DA_CONTA) ?? null,
  };
}

const pagina = { corpo: { itens: [], proximoCursor: null } };

function fakeDoApp(): FetchFalso {
  return fakeComCategorias()
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /busca', pagina)
    .responder('POST /sessoes', { corpo: { token: TOKEN_NOVO } });
}

function cabecalhosDeAutorizacao(fetch: FetchFalso): (string | undefined)[] {
  return fetch.requisicoes.map((r) => r.cabecalhos.authorization);
}

async function preencherEEntrar(email = EMAIL, senha = SENHA) {
  await fireEvent.changeText(screen.getByLabelText(textos.entrar.email), email);
  await fireEvent.changeText(screen.getByLabelText(textos.entrar.senha), senha);
  await fireEvent.press(
    screen.getByRole('button', { name: textos.entrar.entrar }),
  );
}

describe('CA49 (S2) — marcador de instalação, no app completo', () => {
  it('Dado o keychain com token e conta de outra instalação e sem marcador, então o app abre anônimo na Entrada, apaga os dois, cria o marcador e nenhuma requisição leva o token velho', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN_ANTIGO);
    cofre.set(CHAVE_DA_CONTA, CONTA_ANTIGA);
    const marcador = marcadorFalso(false);
    const fetch = fakeDoApp();

    const { getPathname } = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/',
      fetch,
      armazenamento: armazenamentoReal(marcador),
    });

    expect(await screen.findByText(textos.entrada.frase)).toBeTruthy();
    expect(getPathname()).toBe('/entrada');
    expect(cofre.size).toBe(0);
    expect(marcador.criado()).toBe(true);
    expect(cabecalhosDeAutorizacao(fetch)).not.toContain(
      `Bearer ${TOKEN_ANTIGO}`,
    );
    expect(fetch.requisicoes.some((r) => r.caminho === '/perfis/eu')).toBe(
      false,
    );
  });

  it('Dado o marcador presente, então a sessão continua: o app abre o Início já autenticado com o Bearer guardado', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN_ANTIGO);
    cofre.set(CHAVE_DA_CONTA, impressaoDaConta(EMAIL));
    const fetch = fakeDoApp();

    const { getPathname } = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/',
      fetch,
      armazenamento: armazenamentoReal(marcadorFalso(true)),
    });

    await waitFor(() =>
      expect(fetch.requisicoes.some((r) => r.caminho === '/busca')).toBe(true),
    );
    expect(getPathname()).toBe('/');
    expect(cabecalhosDeAutorizacao(fetch)).toContain(`Bearer ${TOKEN_ANTIGO}`);
    expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_ANTIGO);
  });

  it('Dada a instalação nova, então o primeiro login grava o token e a impressão do e-mail (sem o e-mail) e deixa o marcador', async () => {
    const marcador = marcadorFalso(false);
    const fetch = fakeDoApp();
    const { getPathname } = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/entrar',
      fetch,
      armazenamento: armazenamentoReal(marcador),
    });
    await screen.findByLabelText(textos.entrar.senha);

    await preencherEEntrar(`  ${EMAIL.toUpperCase()} `);

    await waitFor(() => expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_NOVO));
    expect(cofre.get(CHAVE_DA_CONTA)).toBe(impressaoDaConta(EMAIL));
    expect([...cofre.values()].join('|')).not.toContain(EMAIL);
    expect([...cofre.values()].join('|')).not.toContain(SENHA);
    expect(marcador.criado()).toBe(true);
    await waitFor(() => expect(getPathname()).toBe('/'));
  });

  it('Dado o keychain que não deixa apagar o resíduo da instalação anterior, então o app abre anônimo sem usar o token velho, o login falha com erro genérico sem gravar e, quando o keychain volta, o login seguinte funciona', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN_ANTIGO);
    cofre.set(CHAVE_DA_CONTA, CONTA_ANTIGA);
    deleteItemAsync.mockRejectedValue(new Error('keychain indisponível'));
    const marcador = marcadorFalso(false);
    const fetch = fakeDoApp();
    const { getPathname } = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/entrar',
      fetch,
      armazenamento: armazenamentoReal(marcador),
    });
    await screen.findByLabelText(textos.entrar.senha);
    expect(getPathname()).toBe('/entrar');

    await preencherEEntrar();

    expect(await screen.findByText(textos.erros.erro_servidor)).toBeTruthy();
    expect(marcador.criado()).toBe(false);
    expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_ANTIGO);
    expect(setItemAsync).not.toHaveBeenCalled();
    expect(cabecalhosDeAutorizacao(fetch)).not.toContain(
      `Bearer ${TOKEN_ANTIGO}`,
    );
    expect(getPathname()).toBe('/entrar');

    // O keychain volta: a próxima tentativa apaga o resíduo e grava o novo.
    deleteItemAsync.mockImplementation(async (chave) => {
      cofre.delete(chave);
    });
    await preencherEEntrar();

    await waitFor(() => expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_NOVO));
    expect(cofre.get(CHAVE_DA_CONTA)).toBe(impressaoDaConta(EMAIL));
    expect(marcador.criado()).toBe(true);
    await waitFor(() => expect(getPathname()).toBe('/'));
  });
});

describe('CA50 e R4 — a rota de retorno só vale para a mesma conta, com o keychain de verdade', () => {
  const OUTRO_EMAIL = 'outra.pessoa@exemplo.com';

  /** App em `/perfil` com o token guardado; o primeiro GET do perfil dá 401. */
  async function abrirComSessaoQueExpira() {
    const fetch = fakeDoApp().responder('GET /perfis/eu', [
      { status: 401, corpo: { erro: 'sessao_expirada' } },
      { corpo: PERFIL_COMPLETO },
    ]);
    const rotas = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/perfil',
      fetch,
      armazenamento: armazenamentoReal(marcadorFalso(true)),
    });
    expect(await screen.findByText(textos.erros.sessao_expirada)).toBeTruthy();
    await screen.findByLabelText(textos.entrar.senha);
    expect(rotas.getPathname()).toBe('/entrar');
    // O 401 apagou o token e a impressão do keychain.
    expect(cofre.has(CHAVE_DO_TOKEN)).toBe(false);
    expect(cofre.has(CHAVE_DA_CONTA)).toBe(false);
    return { ...rotas, fetch };
  }

  it.each([
    [
      'o mesmo e-mail, com maiúsculas e espaços, volta ao /perfil',
      `  ${EMAIL.toUpperCase()} `,
      '/perfil',
    ],
    ['outro e-mail vai ao Início', OUTRO_EMAIL, '/'],
  ])(
    'Dada a impressão da conta guardada no keychain, então depois do 401 %s',
    async (_nome, emailDigitado, destino) => {
      cofre.set(CHAVE_DO_TOKEN, TOKEN_ANTIGO);
      cofre.set(CHAVE_DA_CONTA, impressaoDaConta(EMAIL));
      const { getPathname } = await abrirComSessaoQueExpira();

      await preencherEEntrar(emailDigitado);

      await waitFor(() => expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_NOVO));
      await waitFor(() => expect(getPathname()).toBe(destino));
      expect(cofre.get(CHAVE_DA_CONTA)).toBe(impressaoDaConta(emailDigitado));
    },
  );

  it('Dado o token restaurado sem impressão no keychain (R4), então o 401 não devolve à rota nem para quem digita o mesmo e-mail: vai ao Início', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN_ANTIGO);
    const { getPathname } = await abrirComSessaoQueExpira();

    await preencherEEntrar(EMAIL);

    await waitFor(() => expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_NOVO));
    await waitFor(() => expect(getPathname()).toBe('/'));
    expect(cofre.get(CHAVE_DA_CONTA)).toBe(impressaoDaConta(EMAIL));
  });

  it('Dada a impressão que o keychain não consegue ler, então a sessão continua e, ao expirar, o login do mesmo e-mail também vai ao Início', async () => {
    cofre.set(CHAVE_DO_TOKEN, TOKEN_ANTIGO);
    cofre.set(CHAVE_DA_CONTA, impressaoDaConta(EMAIL));
    getItemAsync.mockImplementation(async (chave) => {
      if (chave === CHAVE_DA_CONTA) {
        throw new Error('keychain ilegível');
      }
      return cofre.get(chave) ?? null;
    });
    const fetch = fakeDoApp().responder('GET /perfis/eu', [
      { status: 401, corpo: { erro: 'sessao_expirada' } },
      { corpo: PERFIL_COMPLETO },
    ]);
    const { getPathname } = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/perfil',
      fetch,
      armazenamento: armazenamentoReal(marcadorFalso(true)),
    });
    expect(await screen.findByText(textos.erros.sessao_expirada)).toBeTruthy();
    await screen.findByLabelText(textos.entrar.senha);
    // A sessão foi restaurada mesmo sem ler a impressão: a requisição levou o token.
    expect(cabecalhosDeAutorizacao(fetch)).toContain(`Bearer ${TOKEN_ANTIGO}`);
    expect(getPathname()).toBe('/entrar');
    getItemAsync.mockImplementation(async (chave) => cofre.get(chave) ?? null);

    await preencherEEntrar(EMAIL);

    await waitFor(() => expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_NOVO));
    await waitFor(() => expect(getPathname()).toBe('/'));
  });
});

describe('CA51 (S6) — sair sem rede e entrar logo em seguida', () => {
  /** Dados do app autenticado em `/perfil`, com o DELETE preso. */
  async function abrirEPrenderODelete(demoraMs: number, status = 204) {
    const fetch = fakeDoApp()
      .responder('DELETE /sessoes', {
        status,
        demoraMs,
        ...(status === 401 && { corpo: { erro: 'nao_autenticado' } }),
      })
      .responder('POST /sessoes', { corpo: { token: TOKEN_NOVO } });
    cofre.set(CHAVE_DO_TOKEN, TOKEN_DE_TESTE);
    cofre.set(CHAVE_DA_CONTA, impressaoDaConta(EMAIL));
    const rotas = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/perfil',
      fetch,
      armazenamento: armazenamentoReal(marcadorFalso(true)),
    });
    return { ...rotas, fetch };
  }

  async function sairDaConta() {
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.sair }),
    );
    const botoes = screen.getAllByRole('button', {
      name: textos.perfil.sairConfirmar,
    });
    await fireEvent.press(botoes[botoes.length - 1] as (typeof botoes)[number]);
  }

  it.each([
    ['o DELETE nunca responde (rede pendurada)', 60_000, 204],
    ['o DELETE responde 401 tarde, depois do login', 5_000, 401],
    ['o DELETE responde 204 tarde, depois do login', 5_000, 204],
  ])(
    'Dado que %s, então o login logo depois fica de pé e nada derruba a sessão nova',
    async (_nome, demoraMs, status) => {
      const { fetch, getPathname } = await abrirEPrenderODelete(
        demoraMs,
        status,
      );
      await screen.findByText('Maria Souza');

      await sairDaConta();
      await waitFor(() => expect(cofre.has(CHAVE_DO_TOKEN)).toBe(false));
      await act(async () => router.push('/entrar'));
      await screen.findByLabelText(textos.entrar.senha);
      await preencherEEntrar();
      await waitFor(() => expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_NOVO));
      await waitFor(() => expect(getPathname()).toBe('/'));

      // A resposta (ou o tempo esgotado) do DELETE chega só agora.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(70_000);
      });

      const apagados = fetch.requisicoes.filter((r) => r.metodo === 'DELETE');
      expect(apagados).toHaveLength(1);
      expect(apagados[0]?.cabecalhos.authorization).toBe(
        `Bearer ${TOKEN_DE_TESTE}`,
      );
      expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_NOVO);
      expect(cofre.get(CHAVE_DA_CONTA)).toBe(impressaoDaConta(EMAIL));
      expect(getPathname()).toBe('/');
      expect(screen.queryByText(textos.erros.sessao_expirada)).toBeNull();
      // Tudo o que veio depois do login leva o token novo, nunca o antigo.
      const depoisDoLogin = fetch.requisicoes
        .slice(
          fetch.requisicoes.findIndex(
            (r) => r.caminho === '/sessoes' && r.metodo === 'POST',
          ) + 1,
        )
        .filter((r) => r.metodo !== 'DELETE')
        .map((r) => r.cabecalhos.authorization);
      expect(depoisDoLogin).not.toContain(`Bearer ${TOKEN_DE_TESTE}`);
    },
  );
});

describe('CA45 (app) — 503 servico_ocupado', () => {
  it('Dado 503 no login, então o erro é genérico (sem o código nem o e-mail), a pessoa continua na tela e a nova tentativa entra', async () => {
    const fetch = fakeDoApp().responder('POST /sessoes', [
      {
        status: 503,
        corpo: { erro: 'servico_ocupado' },
      },
      { corpo: { token: TOKEN_NOVO } },
    ]);
    const { getPathname } = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/entrar',
      fetch,
      armazenamento: armazenamentoReal(marcadorFalso(true)),
    });
    await screen.findByLabelText(textos.entrar.senha);

    await preencherEEntrar();

    expect(await screen.findByText(textos.erros.erro_servidor)).toBeTruthy();
    expect(screen.queryByText(/servico_ocupado/)).toBeNull();
    expect(getPathname()).toBe('/entrar');
    expect(cofre.size).toBe(0);
    expect(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    ).toBeEnabled();

    // A falha limpa a senha: a pessoa digita de novo e tenta outra vez.
    expect(screen.getByLabelText(textos.entrar.senha).props.value).toBe('');
    await preencherEEntrar();

    await waitFor(() => expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_NOVO));
    await waitFor(() => expect(getPathname()).toBe('/'));
  });

  it.each([
    ['exclusão', '/perfil/excluir', 'POST /contas/eu/exclusao'],
    ['exportação', '/perfil/exportar', 'POST /contas/eu/exportacao'],
  ])(
    'Dado 503 na %s, então o erro é genérico, a conta continua aberta e nada é compartilhado',
    async (_nome, url, rota) => {
      const fetch = fakeDoApp().responder(rota, {
        status: 503,
        corpo: { erro: 'servico_ocupado' },
      });
      cofre.set(CHAVE_DO_TOKEN, TOKEN_DE_TESTE);
      const { getPathname } = await renderizarRotas(ROTAS_REAIS, {
        initialUrl: url,
        fetch,
        armazenamento: armazenamentoReal(marcadorFalso(true)),
      });
      const exclusao = url.endsWith('excluir');
      const campo = exclusao
        ? textos.excluirConta.senha
        : textos.exportarDados.senha;
      await fireEvent.changeText(await screen.findByLabelText(campo), SENHA);
      await fireEvent.press(
        screen.getByRole('button', {
          name: exclusao
            ? textos.excluirConta.excluir
            : textos.exportarDados.gerar,
        }),
      );
      if (exclusao) {
        await fireEvent.press(
          screen.getByRole('button', {
            name: textos.excluirConta.dialogoConfirmar,
          }),
        );
      }
      await act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });

      // A exclusão tem o texto próprio "Sua conta não foi excluída".
      expect(
        await screen.findByText(
          exclusao ? /Sua conta não foi excluída/ : textos.erros.erro_servidor,
        ),
      ).toBeTruthy();
      expect(screen.queryByText(/servico_ocupado/)).toBeNull();
      expect(getPathname()).toBe(url);
      expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_DE_TESTE);
      expect(compartilhar).not.toHaveBeenCalled();
    },
  );
});

describe('CA48 (app) — 409 exportacao_grande', () => {
  it('Dado o 409, então o texto manda pedir pelo e-mail de contato, a sessão e o token seguem, nada é compartilhado e dá para tentar de novo', async () => {
    const fetch = fakeDoApp().responder('POST /contas/eu/exportacao', {
      status: 409,
      corpo: { erro: 'exportacao_grande' },
    });
    cofre.set(CHAVE_DO_TOKEN, TOKEN_DE_TESTE);
    await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/perfil/exportar',
      fetch,
      armazenamento: armazenamentoReal(marcadorFalso(true)),
    });
    await fireEvent.changeText(
      await screen.findByLabelText(textos.exportarDados.senha),
      SENHA,
    );

    await fireEvent.press(
      screen.getByRole('button', { name: textos.exportarDados.gerar }),
    );

    expect(
      await screen.findByText(textos.erros.exportacao_grande),
    ).toBeTruthy();
    expect(textos.erros.exportacao_grande).toMatch(/e-mail de contato/);
    expect(textos.erros.exportacao_grande).toMatch(
      /Pol[ií]tica de privacidade/,
    );
    expect(screen.queryByText(/exportacao_grande/)).toBeNull();
    expect(compartilhar).not.toHaveBeenCalled();
    expect(cofre.get(CHAVE_DO_TOKEN)).toBe(TOKEN_DE_TESTE);
    expect(
      screen.getByRole('button', { name: textos.exportarDados.gerar }),
    ).toBeEnabled();
  });
});
