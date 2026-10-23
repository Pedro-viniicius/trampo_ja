/**
 * Rotas de Conta e privacidade, Excluir conta e Exportar dados (CA17, CA19,
 * CA20, CA24): navegação a partir do Perfil, exclusão com senha e exportação
 * pela folha de compartilhamento.
 */
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import RotaDoMeuPerfil from '../../app/(app)/(abas)/perfil';
import RotaDeContaEPrivacidade from '../../app/(app)/perfil/conta';
import RotaDeExcluirConta from '../../app/(app)/perfil/excluir';
import RotaDeExportarDados from '../../app/(app)/perfil/exportar';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { compartilharExportacao } from '../../estado/exportacao';
import { type Sessao, useSessao } from '../../estado/sessao';
import { politicaDePrivacidade, termosDeUso } from '../../textos/legal';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import {
  type MapaDeRotas,
  type RotasRenderizadas,
  renderizarRotas,
  TOKEN_DE_TESTE,
} from './apoio';

// A folha de compartilhamento fica de fora: o teste decide o que ela devolve.
jest.mock('../../estado/exportacao', () => ({
  ...jest.requireActual('../../estado/exportacao'),
  compartilharExportacao: jest.fn(),
}));

const compartilhar = jest.mocked(compartilharExportacao);

const SENHA = 'SENHA-SENTINELA-7f3a';
const SENTINELA_DO_JSON = 'JSON-SENTINELA-2c9e';
const EXCLUSAO = 'POST /contas/eu/exclusao';
const EXPORTACAO = 'POST /contas/eu/exportacao';
const DADOS_EXPORTADOS = {
  formato: 'trampo-ja.exportacao.v1',
  conta: { email: 'maria@exemplo.com' },
  mensagens: [{ texto: SENTINELA_DO_JSON }],
};
const MEU_PERFIL = {
  nome: 'Maria Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

const tConta = textos.contaEPrivacidade;
const tExcluir = textos.excluirConta;
const tExportar = textos.exportarDados;

// --- Rotas e apoio ---

/** Sessão vista pela área logada (para sair no meio da exportação). */
let sessaoVista: Sessao | undefined;

function LayoutComSonda() {
  sessaoVista = useSessao();
  return <LayoutDaAreaAutenticada />;
}

const ROTAS: MapaDeRotas = {
  '(app)/_layout': LayoutComSonda,
  '(app)/(abas)/perfil': RotaDoMeuPerfil,
  '(app)/perfil/conta': RotaDeContaEPrivacidade,
  '(app)/perfil/excluir': RotaDeExcluirConta,
  '(app)/perfil/exportar': RotaDeExportarDados,
};

function criarFake(): FetchFalso {
  return criarFetchFalso()
    .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
    .responder('DELETE /sessoes', { status: 204 });
}

let rotasAbertas: RotasRenderizadas | null = null;

async function abrir(url: string, fetch: FetchFalso = criarFake()) {
  rotasAbertas = await renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
  return rotasAbertas;
}

/** Avança os timers falsos e deixa terminar o que a última volta disparou. */
async function avancar(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(20);
  });
}

function pedidos(fetch: FetchFalso, rota: string) {
  const [metodo, caminho] = rota.split(' ');
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

/** Último botão com o nome (o do diálogo, ou o "Voltar" do rodapé). */
function ultimoBotao(nome: string) {
  const ultimo = screen.getAllByRole('button', { name: nome }).at(-1);
  if (ultimo === undefined) {
    throw new Error(`botão ${nome} não encontrado`);
  }
  return ultimo;
}

function linha(titulo: string) {
  return screen.getByRole('button', { name: new RegExp(`^${titulo}`) });
}

async function digitarSenha(rotulo: string, valor = SENHA) {
  await fireEvent.changeText(await screen.findByLabelText(rotulo), valor);
}

/** Botão "Excluir minha conta" da tela (não o título nem o diálogo). */
function botaoExcluir() {
  return screen.getByRole('button', { name: tExcluir.excluir });
}

function confirmarNoDialogo() {
  return screen.getByRole('button', { name: tExcluir.dialogoConfirmar });
}

async function excluirComSenha() {
  await digitarSenha(tExcluir.senha);
  await fireEvent.press(botaoExcluir());
  await fireEvent.press(confirmarNoDialogo());
  await avancar(50);
}

interface Fibra {
  readonly memoizedProps?: { readonly onPress?: unknown } | null;
  readonly return: Fibra | null;
}

/** Chama o mesmo `onPress` `vezes` vezes num só `act` (toque duplo). */
async function tocarNoMesmoTick(elemento: object, vezes = 2) {
  let fibra = (elemento as { unstable_fiber?: Fibra }).unstable_fiber ?? null;
  while (fibra !== null && typeof fibra.memoizedProps?.onPress !== 'function') {
    fibra = fibra.return;
  }
  const onPress = fibra?.memoizedProps?.onPress;
  if (typeof onPress !== 'function') {
    throw new Error('botão sem onPress');
  }
  await act(async () => {
    for (let i = 0; i < vezes; i += 1) {
      onPress();
    }
  });
}

/** CA24: a senha e o JSON fora de URL, `testID` e caches do TanStack. */
function semSenhaForaDoCampo(rotas: RotasRenderizadas) {
  expect(rotas.getPathnameWithParams()).not.toContain(SENHA);
  expect(screen.queryAllByTestId(new RegExp(SENHA))).toHaveLength(0);
  const caches = JSON.stringify([
    rotas.queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.state),
    rotas.queryClient
      .getMutationCache()
      .getAll()
      .map((m) => m.state),
  ]);
  expect(caches).not.toContain(SENHA);
  expect(caches).not.toContain(SENTINELA_DO_JSON);
}

// --- CA24: nada no `console` ---

const METODOS_DO_CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;
let chamadasDoConsole: unknown[][] = [];

beforeEach(() => {
  sessaoVista = undefined;
  rotasAbertas = null;
  compartilhar.mockReset();
  compartilhar.mockResolvedValue('compartilhado');
  chamadasDoConsole = [];
  for (const metodo of METODOS_DO_CONSOLE) {
    jest.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      chamadasDoConsole.push(args);
    });
  }
});

afterEach(async () => {
  await act(async () => {
    onlineManager.setOnline(true);
  });
  const chamadas = chamadasDoConsole;
  jest.restoreAllMocks();
  expect(chamadas).toEqual([]);
});

// --- Testes ---

describe('Conta e privacidade', () => {
  it('o Perfil abre Conta e privacidade, e as linhas levam a exportar e excluir', async () => {
    await abrir('/perfil');

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.perfil.contaEPrivacidade,
      }),
    );
    expect(await screen.findByText(tConta.secaoDados)).toBeOnTheScreen();
    expect(screen).toHavePathname('/perfil/conta');

    await fireEvent.press(linha(tConta.exportar));
    expect(await screen.findByText(tExportar.intro)).toBeOnTheScreen();
    expect(screen).toHavePathname('/perfil/exportar');

    await fireEvent.press(ultimoBotao(tExportar.voltar));
    expect(await screen.findByText(tConta.secaoDados)).toBeOnTheScreen();

    await fireEvent.press(linha(tConta.excluir));
    expect(await screen.findByText(tExcluir.alerta)).toBeOnTheScreen();
    expect(screen).toHavePathname('/perfil/excluir');
  });

  it.each([
    [
      'a política de privacidade',
      tConta.politica,
      '/politica-de-privacidade',
      politicaDePrivacidade,
    ],
    ['os termos de uso', tConta.termos, '/termos-de-uso', termosDeUso],
  ])('abre %s, sem rede', async (_nome, titulo, caminho, documento) => {
    const { fetch } = await abrir('/perfil/conta');
    await screen.findByText(tConta.secaoDados);
    fetch.limparRequisicoes();

    await fireEvent.press(linha(titulo));

    expect(
      await screen.findByText(documento.secoes[0]?.titulo ?? ''),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname(caminho);
    expect(fetch.requisicoes).toHaveLength(0);
  });

  it.each([
    [
      'a política de privacidade',
      tConta.politica,
      '/politica-de-privacidade',
      politicaDePrivacidade,
    ],
    ['os termos de uso', tConta.termos, '/termos-de-uso', termosDeUso],
  ])(
    'toque duplo abre %s uma vez só; de volta, a linha abre de novo (Q3)',
    async (_nome, titulo, caminho, documento) => {
      await abrir('/perfil/conta');
      await screen.findByText(tConta.secaoDados);

      await tocarNoMesmoTick(linha(titulo));
      expect(
        await screen.findByText(documento.secoes[0]?.titulo ?? ''),
      ).toBeOnTheScreen();
      expect(screen).toHavePathname(caminho);

      // Um "Voltar" basta: não havia uma segunda cópia na pilha.
      await fireEvent.press(ultimoBotao(textos.documentoLegal.voltar));
      expect(await screen.findByText(tConta.secaoDados)).toBeOnTheScreen();
      expect(screen).toHavePathname('/perfil/conta');

      // A trava sai quando Conta e privacidade recupera o foco.
      await fireEvent.press(linha(titulo));
      expect(
        await screen.findByText(documento.secoes[0]?.titulo ?? ''),
      ).toBeOnTheScreen();
      expect(screen).toHavePathname(caminho);
    },
  );

  it('"Sair" confirmado encerra a sessão e leva ao login', async () => {
    const { fetch, armazenamento } = await abrir('/perfil/conta');

    await fireEvent.press(
      await screen.findByRole('button', { name: tConta.sair }),
    );
    expect(pedidos(fetch, 'DELETE /sessoes')).toHaveLength(0);
    await fireEvent.press(ultimoBotao(textos.perfil.sairConfirmar));
    await avancar(50);

    expect(screen).toHavePathname('/entrar');
    expect(pedidos(fetch, 'DELETE /sessoes')).toHaveLength(1);
    expect(armazenamento.atual()).toBeNull();
  });

  it('sem conexão, exportar e excluir ficam desabilitados com o motivo', async () => {
    await abrir('/perfil/conta');
    await screen.findByText(tConta.secaoDados);

    await act(async () => {
      onlineManager.setOnline(false);
    });

    expect(screen.getByText(tConta.semConexaoMotivo)).toBeOnTheScreen();
    expect(linha(tConta.exportar)).toBeDisabled();
    expect(linha(tConta.excluir)).toBeDisabled();
    expect(linha(tConta.politica)).toBeEnabled();
  });
});

describe('Excluir conta (CA17)', () => {
  it('senha certa: diálogo, POST com a senha e login com "Sua conta foi excluída.", sem DELETE /sessoes', async () => {
    const fetch = criarFake().responder(EXCLUSAO, { status: 204 });
    const rotas = await abrir('/perfil', fetch);
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.perfil.contaEPrivacidade,
      }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: new RegExp(`^${tConta.excluir}`),
      }),
    );
    expect(rotas.queryClient.getQueryCache().getAll()).not.toHaveLength(0);

    await digitarSenha(tExcluir.senha);
    await fireEvent.press(botaoExcluir());
    // O POST só sai depois da confirmação no diálogo.
    expect(screen.getByText(tExcluir.dialogoTitulo)).toBeOnTheScreen();
    expect(pedidos(fetch, EXCLUSAO)).toHaveLength(0);
    await fireEvent.press(confirmarNoDialogo());
    await avancar(50);

    expect(
      await screen.findByText(textos.erros.conta_excluida),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/entrar');
    expect(pedidos(fetch, EXCLUSAO)).toHaveLength(1);
    expect(pedidos(fetch, EXCLUSAO)[0]?.corpo).toEqual({ senha: SENHA });
    expect(pedidos(fetch, 'DELETE /sessoes')).toHaveLength(0);
    expect(rotas.armazenamento.atual()).toBeNull();
    expect(rotas.queryClient.getQueryCache().getAll()).toHaveLength(0);
    semSenhaForaDoCampo(rotas);
  });

  it('senha errada (403): aviso no campo, sessão mantida e a senha fora do cache de mutações', async () => {
    const fetch = criarFake().responder(EXCLUSAO, {
      status: 403,
      corpo: { erro: 'senha_incorreta' },
    });
    const rotas = await abrir('/perfil/excluir', fetch);

    await excluirComSenha();

    expect(
      await screen.findByText(textos.erros.senha_incorreta),
    ).toBeOnTheScreen();
    // No campo de senha (`erroDaSenha`), não no aviso geral.
    expect(screen.getByLabelText(tExcluir.senha)).toHaveProp(
      'accessibilityHint',
      textos.erros.senha_incorreta,
    );
    expect(screen).toHavePathname('/perfil/excluir');
    expect(screen.queryByText(tExcluir.dialogoTitulo)).toBeNull();
    expect(screen.getByLabelText(tExcluir.senha)).toHaveDisplayValue(SENHA);
    expect(rotas.armazenamento.atual()).toBe(TOKEN_DE_TESTE);
    semSenhaForaDoCampo(rotas);

    // Digitar de novo tira o aviso.
    await digitarSenha(tExcluir.senha, 'outra-senha');
    expect(screen.queryByText(textos.erros.senha_incorreta)).toBeNull();
  });

  it('duplo toque na confirmação faz um POST só', async () => {
    const fetch = criarFake().responder(EXCLUSAO, {
      status: 204,
      demoraMs: 100,
    });
    await abrir('/perfil/excluir', fetch);
    await digitarSenha(tExcluir.senha);
    await fireEvent.press(botaoExcluir());

    await tocarNoMesmoTick(confirmarNoDialogo());
    await avancar(200);

    expect(pedidos(fetch, EXCLUSAO)).toHaveLength(1);
    expect(screen).toHavePathname('/entrar');
  });

  it('sem conexão: motivo, botão desabilitado e nenhum POST', async () => {
    const fetch = criarFake().responder(EXCLUSAO, { status: 204 });
    await abrir('/perfil/excluir', fetch);
    await digitarSenha(tExcluir.senha);

    await act(async () => {
      onlineManager.setOnline(false);
    });

    expect(screen.getByText(tExcluir.semConexaoMotivo)).toBeOnTheScreen();
    expect(botaoExcluir()).toBeDisabled();
    expect(pedidos(fetch, EXCLUSAO)).toHaveLength(0);
  });

  it.each([
    ['queda de rede no POST', { falhaDeRede: true }, tExcluir.semConexaoMotivo],
    [
      '429 (limite de ações)',
      { status: 429, corpo: { erro: 'muitas_requisicoes' } },
      textos.erros.muitas_tentativas_acao,
    ],
    ['500', { status: 500, corpo: { erro: 'interno' } }, tExcluir.erroServidor],
  ])(
    '%s: aviso traduzido e a conta continua',
    async (_nome, resposta, texto) => {
      const fetch = criarFake().responder(EXCLUSAO, resposta);
      const rotas = await abrir('/perfil/excluir', fetch);

      await excluirComSenha();

      expect(await screen.findByText(texto)).toBeOnTheScreen();
      expect(screen.queryByText(textos.erros.senha_incorreta)).toBeNull();
      // Aviso geral: o campo de senha fica sem erro.
      expect(screen.getByLabelText(tExcluir.senha)).toHaveProp(
        'accessibilityHint',
        tExcluir.ajudaSenha,
      );
      expect(screen).toHavePathname('/perfil/excluir');
      expect(rotas.armazenamento.atual()).toBe(TOKEN_DE_TESTE);
      expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);
      semSenhaForaDoCampo(rotas);
    },
  );

  it('"Exporte uma cópia." leva à exportação e "Cancelar" volta', async () => {
    await abrir('/perfil/conta');
    await fireEvent.press(
      await screen.findByRole('button', {
        name: new RegExp(`^${tConta.excluir}`),
      }),
    );

    await fireEvent.press(
      await screen.findByRole('button', { name: tExcluir.dicaLink }),
    );
    expect(await screen.findByText(tExportar.intro)).toBeOnTheScreen();
    expect(screen).toHavePathname('/perfil/exportar');

    await fireEvent.press(ultimoBotao(tExportar.voltar));
    await fireEvent.press(
      await screen.findByRole('button', { name: tExcluir.cancelar }),
    );
    expect(await screen.findByText(tConta.secaoDados)).toBeOnTheScreen();
    expect(screen).toHavePathname('/perfil/conta');
  });
});

describe('Exportar dados (CA19)', () => {
  it('"Gerando" durante o pedido, compartilha o JSON e mostra "gerado"', async () => {
    const fetch = criarFake().responder(EXPORTACAO, {
      corpo: DADOS_EXPORTADOS,
      demoraMs: 100,
    });
    const rotas = await abrir('/perfil/exportar', fetch);
    await digitarSenha(tExportar.senha);

    await fireEvent.press(
      screen.getByRole('button', { name: tExportar.gerar }),
    );
    await avancar(10);
    expect(
      screen.getByRole('button', { name: tExportar.gerando }),
    ).toBeDisabled();

    await avancar(200);

    expect(await screen.findByText(tExportar.gerado)).toBeOnTheScreen();
    // A senha sai do estado depois de compartilhar (S7): "Gerar de novo" pede
    // a senha outra vez.
    expect(screen.getByLabelText(tExportar.senha)).toHaveDisplayValue('');
    expect(
      screen.getByRole('button', { name: tExportar.gerarDeNovo }),
    ).toBeDisabled();
    expect(screen.getByText(tExportar.motivoSenha)).toBeOnTheScreen();
    await digitarSenha(tExportar.senha);
    expect(
      screen.getByRole('button', { name: tExportar.gerarDeNovo }),
    ).toBeEnabled();
    expect(pedidos(fetch, EXPORTACAO)).toHaveLength(1);
    expect(pedidos(fetch, EXPORTACAO)[0]?.corpo).toEqual({ senha: SENHA });
    expect(compartilhar).toHaveBeenCalledTimes(1);
    expect(compartilhar.mock.calls[0]?.[0]).toEqual(DADOS_EXPORTADOS);
    expect(screen.queryByText(new RegExp(SENTINELA_DO_JSON))).toBeNull();
    semSenhaForaDoCampo(rotas);
  });

  it('duplo toque em "Gerar" faz um POST e um compartilhamento só', async () => {
    const fetch = criarFake().responder(EXPORTACAO, {
      corpo: DADOS_EXPORTADOS,
      demoraMs: 100,
    });
    await abrir('/perfil/exportar', fetch);
    await digitarSenha(tExportar.senha);

    await tocarNoMesmoTick(
      screen.getByRole('button', { name: tExportar.gerar }),
    );
    await avancar(200);

    expect(pedidos(fetch, EXPORTACAO)).toHaveLength(1);
    expect(compartilhar).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(tExportar.gerado)).toBeOnTheScreen();
  });

  it('sem folha de compartilhamento: aviso de indisponível', async () => {
    compartilhar.mockResolvedValue('indisponivel');
    const fetch = criarFake().responder(EXPORTACAO, {
      corpo: DADOS_EXPORTADOS,
    });
    await abrir('/perfil/exportar', fetch);
    await digitarSenha(tExportar.senha);

    await fireEvent.press(
      screen.getByRole('button', { name: tExportar.gerar }),
    );
    await avancar(50);

    expect(
      await screen.findByText(textos.erros.compartilhamento_indisponivel),
    ).toBeOnTheScreen();
    expect(screen.queryByText(tExportar.gerado)).toBeNull();
  });

  it.each([
    [
      '403 senha incorreta',
      { status: 403, corpo: { erro: 'senha_incorreta' } },
      textos.erros.senha_incorreta,
    ],
    [
      '429 (limite de ações)',
      { status: 429, corpo: { erro: 'muitas_requisicoes' } },
      textos.erros.muitas_tentativas_acao,
    ],
    [
      '409 exportação grande demais (CA48)',
      { status: 409, corpo: { erro: 'exportacao_grande' } },
      textos.erros.exportacao_grande,
    ],
    ['queda de rede', { falhaDeRede: true }, textos.erros.sem_conexao],
    [
      '500',
      { status: 500, corpo: { erro: 'interno' } },
      textos.erros.erro_servidor,
    ],
  ])(
    '%s: erro traduzido e nada compartilhado',
    async (_nome, resposta, texto) => {
      const fetch = criarFake().responder(EXPORTACAO, resposta);
      const rotas = await abrir('/perfil/exportar', fetch);
      await digitarSenha(tExportar.senha);

      await fireEvent.press(
        screen.getByRole('button', { name: tExportar.gerar }),
      );
      await avancar(50);

      expect(await screen.findByText(texto)).toBeOnTheScreen();
      // Só a senha incorreta vai ao campo; o resto é aviso geral.
      expect(screen.getByLabelText(tExportar.senha)).toHaveProp(
        'accessibilityHint',
        texto === textos.erros.senha_incorreta ? texto : tExportar.ajudaSenha,
      );
      expect(compartilhar).not.toHaveBeenCalled();
      expect(screen.queryByText(tExportar.gerado)).toBeNull();
      expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);
      semSenhaForaDoCampo(rotas);
    },
  );

  it('sem conexão: motivo e "Gerar" desabilitado', async () => {
    const fetch = criarFake().responder(EXPORTACAO, {
      corpo: DADOS_EXPORTADOS,
    });
    await abrir('/perfil/exportar', fetch);
    await digitarSenha(tExportar.senha);

    await act(async () => {
      onlineManager.setOnline(false);
    });

    expect(screen.getByText(tExportar.semConexaoMotivo)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: tExportar.gerar }),
    ).toBeDisabled();
    expect(pedidos(fetch, EXPORTACAO)).toHaveLength(0);
  });

  it('sair da conta durante a exportação não compartilha', async () => {
    const fetch = criarFake().responder(EXPORTACAO, {
      corpo: DADOS_EXPORTADOS,
      demoraMs: 100,
    });
    const rotas = await abrir('/perfil/exportar', fetch);
    await digitarSenha(tExportar.senha);
    await fireEvent.press(
      screen.getByRole('button', { name: tExportar.gerar }),
    );
    await avancar(10);
    expect(pedidos(fetch, EXPORTACAO)).toHaveLength(1);

    await act(async () => {
      await sessaoVista?.sair();
    });
    await avancar(200);

    expect(compartilhar).not.toHaveBeenCalled();
    expect(screen).toHavePathname('/entrar');
    semSenhaForaDoCampo(rotas);
  });
});
