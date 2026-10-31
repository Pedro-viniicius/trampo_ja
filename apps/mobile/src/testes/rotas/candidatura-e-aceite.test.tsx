// Etapa 8 da 2b: rodapé do detalhe do trampo (situações, folha Candidatar-se,
// D9) e Candidaturas recebidas com o aceite (CA8 a CA11, CA14, CA15).
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text, TextInput } from 'react-native';
import type {
  CandidaturaRecebida,
  MinhaCandidatura,
  StatusDaCandidatura,
} from '../../api/tipos';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import RotaDasCandidaturasRecebidas from '../../app/(app)/candidaturas/[trampoId]';
import RotaDoTrampo from '../../app/(app)/trampos/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import {
  ACEITAR_QUALQUER,
  type MapaDeRotas,
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

// --- Dados ---

const CATEGORIAS = [{ id: 'pintura', rotulo: 'Pintura e reparos' }];

const TRAMPO = {
  id: 't1',
  autorId: 'c-autor',
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'pintura',
  cidade: 'Lavras',
  valorCentavos: 150000,
  prazo: null,
  status: 'aberto',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

const EM_ANDAMENTO = { ...TRAMPO, status: 'em_andamento' };
const ENCERRADO = { ...TRAMPO, status: 'encerrado' };

/** O que `GET /trampos/:id` devolve ao autor (D46): a visão do autor traz `versao`. */
const VISAO_DO_AUTOR = { versao: 1 };
const TRAMPO_DO_AUTOR = { ...TRAMPO, ...VISAO_DO_AUTOR };
const EM_ANDAMENTO_DO_AUTOR = { ...EM_ANDAMENTO, ...VISAO_DO_AUTOR };

const AUTOR = {
  contaId: 'c-autor',
  nome: 'Carla Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
};

const MEU_PERFIL = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

const MARIA = {
  contaId: 'f1',
  nome: 'Maria Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
};

const JOAO = { ...MARIA, contaId: 'f2', nome: 'João Pereira' };

function candidatura(
  id: string,
  freelancerId: string,
  status: StatusDaCandidatura = 'pendente',
): CandidaturaRecebida {
  return {
    id,
    freelancerId,
    mensagem: `Mensagem de ${id}`,
    valorPropostoCentavos: 15000,
    status,
    criadaEm: '2026-10-02T12:00:00.000Z',
  };
}

function minha(status: StatusDaCandidatura): MinhaCandidatura {
  return { ...candidatura('m1', 'eu', status), trampoId: 't1' };
}

// --- Rotas e apoio ---

function stub(texto: string) {
  return function Stub() {
    return <Text>{texto}</Text>;
  };
}

const ROTAS: MapaDeRotas = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/index': stub('stub: início'),
  '(app)/trampos/[id]': RotaDoTrampo,
  '(app)/candidaturas/[trampoId]': RotaDasCandidaturasRecebidas,
  '(app)/perfis/[contaId]': stub('stub: perfil público'),
  '(app)/perfil/editar': stub('stub: editar perfil'),
};

/** Visitante comum: trampo aberto, sem trampos nem candidaturas, perfil salvo. */
function criarFake(): FetchFalso {
  return criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
    .responder('GET /perfis/c-autor', { corpo: AUTOR })
    .responder('GET /trampos/t1', { corpo: TRAMPO })
    .responder('GET /candidaturas/minhas', { corpo: [] });
}

async function abrir(url: string, fetch: FetchFalso) {
  return renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
}

function requisicoes(fetch: FetchFalso, metodo: string, caminho: string) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

/** O TanStack avisa os componentes num `setTimeout(0)` (timers falsos). */
async function avancar(ms = 20) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

interface Fibra {
  readonly memoizedProps?: { readonly onPress?: unknown } | null;
  readonly return: Fibra | null;
}

/**
 * Dois toques antes de a tela redesenhar: o `onPress` do botão (o mesmo
 * fechamento, como no aparelho) é chamado duas vezes num só `act`. O
 * `fireEvent` não serve: dois `act` sobrepostos geram aviso do React.
 */
async function tocarDuasVezes(elemento: object) {
  let fibra = (elemento as { unstable_fiber?: Fibra }).unstable_fiber ?? null;
  while (fibra !== null && typeof fibra.memoizedProps?.onPress !== 'function') {
    fibra = fibra.return;
  }
  const onPress = fibra?.memoizedProps?.onPress;
  if (typeof onPress !== 'function') {
    throw new Error('botão sem onPress');
  }
  await act(async () => {
    onPress();
    onPress();
  });
}

/** Nada de código cru da API (`candidatura_duplicada`) nem `erro.message`. */
function semTextoCruDeErro() {
  expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);
  expect(screen.queryAllByText(/erro da API/i)).toHaveLength(0);
}

async function abrirFolha() {
  await fireEvent.press(
    await screen.findByRole('button', {
      name: textos.detalheTrampo.candidatar,
    }),
  );
  return screen.findByLabelText(textos.candidatar.mensagem);
}

async function preencherFolha(mensagem: string, valor: string) {
  await fireEvent.changeText(
    screen.getByLabelText(textos.candidatar.mensagem),
    mensagem,
  );
  await fireEvent.changeText(
    screen.getByLabelText(textos.candidatar.valor),
    valor,
  );
}

function botaoEnviar() {
  return screen.getByRole('button', { name: textos.candidatar.enviar });
}

// --- CA15: nada no `console` ---

const METODOS_DO_CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;
let chamadasDoConsole: unknown[][] = [];

beforeEach(() => {
  chamadasDoConsole = [];
  for (const metodo of METODOS_DO_CONSOLE) {
    jest.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      chamadasDoConsole.push(args);
    });
  }
});

afterEach(() => {
  const chamadas = chamadasDoConsole;
  jest.restoreAllMocks();
  expect(chamadas).toEqual([]);
});

// --- Rodapé ---

describe('rodapé do detalhe do trampo', () => {
  it('autor: "Ver candidaturas (n)" e o toque abre as recebidas', async () => {
    const fetch = criarFake()
      .responder('GET /trampos/t1', { corpo: TRAMPO_DO_AUTOR })
      .responder('GET /trampos/t1/candidaturas', {
        corpo: [candidatura('k1', 'f1'), candidatura('k2', 'f2')],
      })
      .responder('GET /perfis/f1', { corpo: MARIA })
      .responder('GET /perfis/f2', { corpo: JOAO });
    await abrir('/trampos/t1', fetch);

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Ver candidaturas (2)' }),
    );
    await waitFor(() => expect(screen).toHavePathname('/candidaturas/t1'));
    expect(await screen.findByText('Maria Souza')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.detalheTrampo.candidatar }),
    ).toBeNull();
    // D46: o autor vem do próprio trampo, sem a lista "meus".
    expect(requisicoes(fetch, 'GET', '/trampos/meus')).toEqual([]);
  });

  it('autor: "Ver candidaturas" sem número enquanto as recebidas não chegam', async () => {
    const fetch = criarFake()
      .responder('GET /trampos/t1', { corpo: TRAMPO_DO_AUTOR })
      .responder('GET /trampos/t1/candidaturas', {
        corpo: [candidatura('k1', 'f1')],
        demoraMs: 60_000,
      });
    await abrir('/trampos/t1', fetch);

    expect(
      await screen.findByRole('button', { name: 'Ver candidaturas' }),
    ).toBeOnTheScreen();
    expect(requisicoes(fetch, 'GET', '/trampos/t1/candidaturas')).toHaveLength(
      1,
    );
  });

  it.each([
    ['pendente', textos.detalheTrampo.jaCandidatou],
    ['aceita', textos.selos.aceita],
    ['recusada', textos.selos.recusada],
  ] as const)(
    'candidatado (%s): selo "%s" no lugar do botão',
    async (status, selo) => {
      const fetch = criarFake().responder('GET /candidaturas/minhas', {
        corpo: [minha(status)],
      });
      await abrir('/trampos/t1', fetch);

      expect(await screen.findByText(selo)).toBeOnTheScreen();
      expect(
        screen.queryByRole('button', { name: textos.detalheTrampo.candidatar }),
      ).toBeNull();
      // Só o autor pede as recebidas.
      expect(requisicoes(fetch, 'GET', '/trampos/t1/candidaturas')).toEqual([]);
    },
  );

  it('fechado (CA11): botão desabilitado com o motivo e a folha não abre', async () => {
    const fetch = criarFake().responder('GET /trampos/t1', {
      corpo: EM_ANDAMENTO,
    });
    await abrir('/trampos/t1', fetch);

    const botao = await screen.findByRole('button', {
      name: textos.detalheTrampo.candidatar,
    });
    expect(botao).toBeDisabled();
    expect(screen.getByText(textos.detalheTrampo.fechado)).toBeOnTheScreen();
    await fireEvent.press(botao);
    expect(screen.queryByLabelText(textos.candidatar.mensagem)).toBeNull();
  });

  it('candidatar: botão habilitado, sem pedir as recebidas', async () => {
    const fetch = criarFake();
    await abrir('/trampos/t1', fetch);

    const botao = await screen.findByRole('button', {
      name: textos.detalheTrampo.candidatar,
    });
    expect(botao).toBeEnabled();
    expect(requisicoes(fetch, 'GET', '/trampos/t1/candidaturas')).toEqual([]);
  });

  it('lista "minha" que falhou conta como vazia: a API decide', async () => {
    const fetch = criarFake().responder('GET /candidaturas/minhas', {
      status: 500,
      corpo: { erro: 'interno' },
    });
    await abrir('/trampos/t1', fetch);

    expect(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    ).toBeEnabled();
  });
});

// --- Folha Candidatar-se ---

describe('folha Candidatar-se', () => {
  it('CA8: envia o corpo exato, fecha a folha, mostra o toast e o selo', async () => {
    let enviada = false;
    const fetch = criarFake()
      .responder('GET /candidaturas/minhas', () => ({
        corpo: enviada ? [minha('pendente')] : [],
      }))
      .responder('POST /trampos/t1/candidaturas', () => {
        enviada = true;
        return { status: 201, corpo: { id: 'm1', status: 'pendente' } };
      });
    await abrir('/trampos/t1', fetch);
    await abrirFolha();

    await preencherFolha('  Posso começar amanhã.  ', '1500');
    // O valor é reformatado ao sair do campo.
    await fireEvent(screen.getByLabelText(textos.candidatar.valor), 'blur');
    expect(screen.getByDisplayValue('1.500,00')).toBeOnTheScreen();
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.candidatar.enviada),
    ).toBeOnTheScreen();
    const posts = requisicoes(fetch, 'POST', '/trampos/t1/candidaturas');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.corpo).toEqual({
      mensagem: 'Posso começar amanhã.',
      valorPropostoCentavos: 150000,
    });
    expect(
      screen.getByText(textos.detalheTrampo.jaCandidatou),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.candidatar.mensagem)).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.detalheTrampo.candidatar }),
    ).toBeNull();
  });

  it('validação local: campos vazios e valor zero não chamam a API', async () => {
    const fetch = criarFake();
    await abrir('/trampos/t1', fetch);
    await abrirFolha();

    await fireEvent.press(botaoEnviar());
    expect(
      screen.getByText(textos.erros.mensagem_obrigatoria),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.erros.valor_proposto_invalido),
    ).toBeOnTheScreen();

    await preencherFolha('Posso ir hoje.', '0');
    await fireEvent(screen.getByLabelText(textos.candidatar.valor), 'blur');
    expect(
      screen.getByText(textos.erros.valor_proposto_invalido),
    ).toBeOnTheScreen();
    // Valor inválido não é reformatado.
    expect(screen.getByDisplayValue('0')).toBeOnTheScreen();
    await fireEvent.press(botaoEnviar());
    expect(requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')).toEqual([]);
  });

  it('toque duplo em "Enviar" manda um só POST', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      status: 201,
      corpo: { id: 'm1', status: 'pendente' },
      demoraMs: 1000,
    });
    await abrir('/trampos/t1', fetch);
    await abrirFolha();
    await preencherFolha('Posso ir hoje.', '150');

    const botao = botaoEnviar();
    await tocarDuasVezes(botao);
    await avancar(1100);

    expect(
      await screen.findByText(textos.candidatar.enviada),
    ).toBeOnTheScreen();
    expect(requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')).toHaveLength(
      1,
    );
  });

  it.each([
    'candidatura_duplicada',
    'autor_nao_pode_candidatar',
    'trampo_nao_aberto',
  ] as const)('CA9/CA11: 409 %s vira o texto da spec', async (codigo) => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      status: 409,
      corpo: { erro: codigo },
    });
    await abrir('/trampos/t1', fetch);
    await abrirFolha();
    await preencherFolha('Posso ir hoje.', '150');
    await fireEvent.press(botaoEnviar());

    expect(await screen.findByText(textos.erros[codigo])).toBeOnTheScreen();
    // A folha continua aberta com o rascunho.
    expect(screen.getByDisplayValue('Posso ir hoje.')).toBeOnTheScreen();
    semTextoCruDeErro();
  });

  it('409 candidatura_duplicada e autor_nao_pode_candidatar recarregam Minhas candidaturas e o trampo (Q4)', async () => {
    for (const codigo of [
      'candidatura_duplicada',
      'autor_nao_pode_candidatar',
    ] as const) {
      const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
        status: 409,
        corpo: { erro: codigo },
      });
      const { unmount } = await abrir('/trampos/t1', fetch);
      await abrirFolha();
      await preencherFolha('Posso ir hoje.', '150');
      expect(requisicoes(fetch, 'GET', '/candidaturas/minhas')).toHaveLength(1);
      expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(1);

      await fireEvent.press(botaoEnviar());
      await screen.findByText(textos.erros[codigo]);

      await waitFor(() =>
        expect(requisicoes(fetch, 'GET', '/candidaturas/minhas')).toHaveLength(
          2,
        ),
      );
      // Todo 409 do rodapé relê o trampo (selo e papel de autor, CA64).
      await waitFor(() =>
        expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2),
      );
      expect(requisicoes(fetch, 'GET', '/trampos/meus')).toEqual([]);
      await unmount();
    }
  });

  it('409 trampo_nao_aberto recarrega o trampo e o rodapé passa a "fechado" (Q4)', async () => {
    let fechado = false;
    const fetch = criarFake()
      .responder('GET /trampos/t1', () => ({
        corpo: { ...TRAMPO, status: fechado ? 'em_andamento' : 'aberto' },
      }))
      .responder('POST /trampos/t1/candidaturas', () => {
        fechado = true;
        return { status: 409, corpo: { erro: 'trampo_nao_aberto' } };
      });
    await abrir('/trampos/t1', fetch);
    await abrirFolha();
    await preencherFolha('Posso ir hoje.', '150');
    await fireEvent.press(botaoEnviar());

    await waitFor(() =>
      expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2),
    );
    expect(
      await screen.findByText(textos.detalheTrampo.seloEmAndamento),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.detalheTrampo.candidatar }),
    ).toBeDisabled();
    expect(
      screen.getAllByText(textos.detalheTrampo.fechado).length,
    ).toBeGreaterThan(0);
    expect(requisicoes(fetch, 'GET', '/candidaturas/minhas')).toHaveLength(1);
  });

  it('409 conflito_de_versao na folha vira "erro do servidor", sem "Atualizamos a lista" (Q4)', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      status: 409,
      corpo: { erro: 'conflito_de_versao' },
    });
    await abrir('/trampos/t1', fetch);
    await abrirFolha();
    await preencherFolha('Posso ir hoje.', '150');
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.conflito_de_versao)).toBeNull();
    expect(screen.getByDisplayValue('Posso ir hoje.')).toBeOnTheScreen();
  });

  it('o segundo envio recusado com o mesmo erro leva o foco de novo à mensagem (D2)', async () => {
    const fetch = criarFake();
    await abrir('/trampos/t1', fetch);
    await abrirFolha();
    await preencherFolha('   ', '150');
    await fireEvent.press(botaoEnviar());
    await screen.findByText(textos.erros.mensagem_obrigatoria);
    const foco = jest.spyOn(TextInput.prototype, 'focus');
    foco.mockClear();

    await fireEvent.press(botaoEnviar());
    await avancar();

    expect(foco).toHaveBeenCalledTimes(1);
    expect(foco.mock.contexts[0]).toHaveProperty(
      'props.accessibilityLabel',
      textos.candidatar.mensagem,
    );
    expect(requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')).toEqual([]);
    foco.mockRestore();
  });

  it('400 com campo vira erro no campo', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      status: 400,
      corpo: {
        erro: 'validacao',
        campos: [{ campo: 'mensagem', motivo: 'tamanho' }],
      },
    });
    await abrir('/trampos/t1', fetch);
    await abrirFolha();
    await preencherFolha('Posso ir hoje.', '150');
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.erros.mensagem_tamanho),
    ).toBeOnTheScreen();
    semTextoCruDeErro();
  });

  it('falha de rede: "sem conexão" e o rascunho fica', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      falhaDeRede: true,
    });
    await abrir('/trampos/t1', fetch);
    await abrirFolha();
    await preencherFolha('Posso ir hoje.', '150');
    await fireEvent.press(botaoEnviar());

    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Posso ir hoje.')).toBeOnTheScreen();
    semTextoCruDeErro();
  });

  it('D9: sem perfil, a folha mostra o aviso no lugar do envio', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir('/trampos/t1', fetch);
    await abrirFolha();

    expect(
      await screen.findByText(
        textos.avisoPerfil.mensagem([
          textos.perfil.camposNome,
          textos.perfil.camposCidade,
          textos.perfil.camposHabilidades,
        ]),
      ),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.candidatar.enviar }),
    ).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.avisoPerfil.completar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfil/editar'));
    expect(requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')).toEqual([]);
  });

  it('D9: 409 perfil_incompleto mostra o aviso e "Agora não" fecha a folha', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      status: 409,
      corpo: { erro: 'perfil_incompleto' },
    });
    await abrir('/trampos/t1', fetch);
    await abrirFolha();
    await preencherFolha('Posso ir hoje.', '150');
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.avisoPerfil.mensagem([])),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.candidatar.enviar }),
    ).toBeNull();
    semTextoCruDeErro();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.avisoPerfil.agoraNao }),
    );
    expect(screen.queryByLabelText(textos.candidatar.mensagem)).toBeNull();
  });

  it('CA14: 401 no envio leva ao login', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      status: 401,
      corpo: { erro: 'sessao_expirada' },
    });
    const { armazenamento } = await abrir('/trampos/t1', fetch);
    await abrirFolha();
    await preencherFolha('Posso ir hoje.', '150');
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    await waitFor(() => expect(screen).toHavePathname('/entrar'));
    expect(armazenamento.atual()).toBeNull();
  });
});

// --- Candidaturas recebidas e aceite ---

/**
 * Autor com duas candidaturas pendentes (Maria e João). `vencedora` muda o
 * que a API devolve depois de um aceite (o da pessoa ou o de outra aba).
 */
function criarFakeDoAutor() {
  const estado = { vencedora: null as string | null };
  const fetch = criarFake()
    .responder('GET /trampos/t1', () => ({
      corpo:
        estado.vencedora === null ? TRAMPO_DO_AUTOR : EM_ANDAMENTO_DO_AUTOR,
    }))
    .responder('GET /trampos/t1/candidaturas', () => ({
      corpo: [
        ['k1', 'f1'],
        ['k2', 'f2'],
      ].map(([id = '', conta = '']) =>
        candidatura(
          id,
          conta,
          estado.vencedora === null
            ? 'pendente'
            : estado.vencedora === id
              ? 'aceita'
              : 'recusada',
        ),
      ),
    }))
    .responder('GET /perfis/f1', { corpo: MARIA })
    .responder('GET /perfis/f2', { corpo: JOAO });
  return { fetch, estado };
}

function botoesAceitar() {
  return screen.queryAllByRole('button', { name: ACEITAR_QUALQUER });
}

/** Toca "Aceitar candidatura" na primeira (Maria) e confirma o diálogo. */
async function aceitarAPrimeira() {
  await screen.findByText('Maria Souza');
  // O nome acessível diz de quem é a candidatura.
  await fireEvent.press(
    screen.getByRole('button', {
      name: textos.candidaturasRecebidas.aceitarDe('Maria Souza'),
    }),
  );
  expect(await screen.findByText('Aceitar Maria Souza?')).toBeOnTheScreen();
  await fireEvent.press(
    screen.getByRole('button', {
      name: textos.candidaturasRecebidas.confirmar,
    }),
  );
}

describe('candidaturas recebidas', () => {
  it('CA10: confirma, aceita sem corpo e mostra aceita, recusada e em andamento', async () => {
    const { fetch, estado } = criarFakeDoAutor();
    fetch.responder('POST /trampos/t1/candidaturas/k1/aceitar', () => {
      estado.vencedora = 'k1';
      return { corpo: { status: 'aceita' } };
    });
    await abrir('/candidaturas/t1', fetch);

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(await screen.findByText('João Pereira')).toBeOnTheScreen();
    expect(screen.getAllByText(textos.selos.pendente)).toHaveLength(2);
    expect(botoesAceitar()).toHaveLength(2);

    await aceitarAPrimeira();

    expect(
      await screen.findByText(textos.candidaturasRecebidas.aceitaToast),
    ).toBeOnTheScreen();
    const posts = requisicoes(
      fetch,
      'POST',
      '/trampos/t1/candidaturas/k1/aceitar',
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]?.corpo).toBeUndefined();
    expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.recusada)).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.emAndamento)).toBeOnTheScreen();
    expect(
      screen.getByText(textos.candidaturasRecebidas.trampoEmAndamento),
    ).toBeOnTheScreen();
    expect(botoesAceitar()).toHaveLength(0);
  });

  it('cancelar o diálogo não chama a API', async () => {
    const { fetch } = criarFakeDoAutor();
    await abrir('/candidaturas/t1', fetch);
    await screen.findByText('Maria Souza');
    const [primeiro] = botoesAceitar();
    if (primeiro === undefined) throw new Error('sem botão Aceitar');
    await fireEvent.press(primeiro);
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.cancelar,
      }),
    );
    expect(fetch.requisicoes.filter((r) => r.metodo === 'POST')).toEqual([]);
  });

  it.each([
    'trampo_nao_aberto',
    'candidatura_nao_pendente',
    'conflito_de_versao',
  ] as const)(
    'aceite perdido (409 %s): mostra o erro e recarrega, sem nova tentativa',
    async (codigo) => {
      const { fetch, estado } = criarFakeDoAutor();
      fetch.responder('POST /trampos/t1/candidaturas/k1/aceitar', () => {
        // Outra pessoa (outra aba) aceitou o João antes.
        estado.vencedora = 'k2';
        return { status: 409, corpo: { erro: codigo } };
      });
      await abrir('/candidaturas/t1', fetch);
      await aceitarAPrimeira();

      // No aceite, `trampo_nao_aberto` é o aceite perdido para outra pessoa.
      const texto =
        codigo === 'trampo_nao_aberto'
          ? textos.erros.aceite_perdido
          : textos.erros[codigo];
      expect(await screen.findByText(texto)).toBeOnTheScreen();
      await waitFor(() =>
        expect(screen.getByText(textos.selos.emAndamento)).toBeOnTheScreen(),
      );
      expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2);
      expect(
        requisicoes(fetch, 'GET', '/trampos/t1/candidaturas'),
      ).toHaveLength(2);
      expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
      expect(screen.getByText(textos.selos.recusada)).toBeOnTheScreen();
      expect(botoesAceitar()).toHaveLength(0);
      expect(fetch.requisicoes.filter((r) => r.metodo === 'POST')).toHaveLength(
        1,
      );
      expect(
        screen.queryByText(textos.candidaturasRecebidas.aceitaToast),
      ).toBeNull();
      semTextoCruDeErro();
    },
  );

  it('R3: 409 trampo_nao_aberto com o trampo relido como encerrado não diz "aceite perdido"', async () => {
    const { fetch, estado } = criarFakeDoAutor();
    fetch
      .responder('GET /trampos/t1', () => ({
        corpo: estado.vencedora === 'encerrado' ? ENCERRADO : TRAMPO,
      }))
      .responder('POST /trampos/t1/candidaturas/k1/aceitar', () => {
        // O autor encerrou o trampo (em outro aparelho) antes do aceite.
        estado.vencedora = 'encerrado';
        return { status: 409, corpo: { erro: 'trampo_nao_aberto' } };
      });
    await abrir('/candidaturas/t1', fetch);
    await aceitarAPrimeira();

    // O aviso informativo da tela diz que o trampo está encerrado.
    expect(
      await screen.findByText(textos.candidaturasRecebidas.trampoEncerrado),
    ).toBeOnTheScreen();
    await avancar();
    expect(screen.queryByText(textos.erros.aceite_perdido)).toBeNull();
    expect(screen.queryByText(textos.erros.trampo_nao_aberto)).toBeNull();
    expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2);
    expect(botoesAceitar()).toHaveLength(0);
    semTextoCruDeErro();
  });

  it('R3: o texto de um aceite que espera a releitura do trampo não cobre o de outro aceite', async () => {
    const { fetch } = criarFakeDoAutor();
    fetch
      .responder('GET /trampos/t1', [
        { corpo: TRAMPO },
        { corpo: TRAMPO, demoraMs: 1000 },
      ])
      .responder('POST /trampos/t1/candidaturas/k1/aceitar', {
        status: 409,
        corpo: { erro: 'trampo_nao_aberto' },
      })
      .responder('POST /trampos/t1/candidaturas/k2/aceitar', {
        status: 500,
        corpo: { erro: 'interno' },
      });
    await abrir('/candidaturas/t1', fetch);
    await aceitarAPrimeira();
    // A releitura do trampo ainda está no ar; começa o aceite da outra.
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.candidaturasRecebidas.aceitarDe('João Pereira'),
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.confirmar,
      }),
    );
    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    await avancar(1100);
    expect(screen.queryByText(textos.erros.aceite_perdido)).toBeNull();
    expect(screen.getByText(textos.erros.erro_servidor)).toBeOnTheScreen();
  });

  it('erro sem conflito (500) mostra o texto e não recarrega', async () => {
    const { fetch } = criarFakeDoAutor();
    fetch.responder('POST /trampos/t1/candidaturas/k1/aceitar', {
      status: 500,
      corpo: { erro: 'interno' },
    });
    await abrir('/candidaturas/t1', fetch);
    await aceitarAPrimeira();

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    await avancar();
    expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(1);
    // O aceite terminou: os botões voltam.
    expect(botoesAceitar()).toHaveLength(2);
    semTextoCruDeErro();
  });

  it('toque duplo em "Aceitar" do diálogo manda uma só requisição', async () => {
    const { fetch, estado } = criarFakeDoAutor();
    fetch.responder('POST /trampos/t1/candidaturas/k1/aceitar', () => {
      estado.vencedora = 'k1';
      return { corpo: { status: 'aceita' }, demoraMs: 1000 };
    });
    await abrir('/candidaturas/t1', fetch);
    await screen.findByText('Maria Souza');
    const [primeiro] = botoesAceitar();
    if (primeiro === undefined) throw new Error('sem botão Aceitar');
    await fireEvent.press(primeiro);

    const confirmar = screen.getByRole('button', {
      name: textos.candidaturasRecebidas.confirmar,
    });
    await tocarDuasVezes(confirmar);
    // Enquanto o aceite está no ar, o botão mostra "Aceitando…" e o outro fica desabilitado.
    expect(
      await screen.findByRole('button', {
        name: textos.candidaturasRecebidas.aceitando,
      }),
    ).toBeOnTheScreen();
    const outros = botoesAceitar();
    expect(outros).toHaveLength(1);
    expect(outros[0]).toBeDisabled();
    await avancar(1100);

    expect(
      await screen.findByText(textos.candidaturasRecebidas.aceitaToast),
    ).toBeOnTheScreen();
    expect(fetch.requisicoes.filter((r) => r.metodo === 'POST')).toHaveLength(
      1,
    );
  });

  it('perfil 404 vira "Perfil indisponível"; "Ver perfil" abre o perfil', async () => {
    const { fetch } = criarFakeDoAutor();
    fetch.responder('GET /perfis/f2', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir('/candidaturas/t1', fetch);

    expect(await screen.findByText('Maria Souza')).toBeOnTheScreen();
    expect(
      await screen.findByText(textos.candidaturasRecebidas.perfilIndisponivel),
    ).toBeOnTheScreen();
    expect(screen.queryByText('João Pereira')).toBeNull();
    // O nome não vai no erro do diálogo: sem nome, "esta candidatura".
    const [, segundo] = botoesAceitar();
    if (segundo === undefined) throw new Error('sem botão Aceitar');
    await fireEvent.press(segundo);
    expect(
      screen.getByText(textos.candidaturasRecebidas.confirmarTitulo(null)),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.cancelar,
      }),
    );

    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.verPerfil('Maria Souza'),
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfis/f1'));
  });

  it('trampo já em andamento: nenhuma candidatura pode ser aceita', async () => {
    const { fetch, estado } = criarFakeDoAutor();
    estado.vencedora = 'k1';
    await abrir('/candidaturas/t1', fetch);

    expect(await screen.findByText('Maria Souza')).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
    expect(botoesAceitar()).toHaveLength(0);
  });

  it('trampo fechado com candidatura ainda pendente: não mostra "Aceitar"', async () => {
    // Trampo já recarregado e lista ainda antiga: quem decide é o trampo.
    const { fetch } = criarFakeDoAutor();
    fetch.responder('GET /trampos/t1', { corpo: EM_ANDAMENTO });
    await abrir('/candidaturas/t1', fetch);

    expect(await screen.findByText('Maria Souza')).toBeOnTheScreen();
    expect(await screen.findByText(textos.selos.emAndamento)).toBeOnTheScreen();
    expect(screen.getAllByText(textos.selos.pendente)).toHaveLength(2);
    expect(botoesAceitar()).toHaveLength(0);
  });

  it('lista 404 (não é o autor): erro "não encontrado", não "nenhuma candidatura"', async () => {
    const fetch = criarFake().responder('GET /trampos/t1/candidaturas', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir('/candidaturas/t1', fetch);

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.candidaturasRecebidas.vazio)).toBeNull();
    // Nenhum perfil de terceiro é pedido.
    expect(
      fetch.requisicoes.filter(
        (r) => r.caminho.startsWith('/perfis/') && r.caminho !== '/perfis/eu',
      ),
    ).toEqual([]);

    const voltar = screen.getAllByRole('button', {
      name: textos.gerais.voltar,
    });
    await fireEvent.press(voltar[0] as (typeof voltar)[number]);
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(await screen.findByText('stub: início')).toBeOnTheScreen();
  });

  it('sem candidaturas: estado vazio', async () => {
    const fetch = criarFake().responder('GET /trampos/t1/candidaturas', {
      corpo: [],
    });
    await abrir('/candidaturas/t1', fetch);

    expect(
      await screen.findByText(textos.candidaturasRecebidas.vazio),
    ).toBeOnTheScreen();
  });

  it('CA14: 401 no aceite leva ao login', async () => {
    const { fetch } = criarFakeDoAutor();
    fetch.responder('POST /trampos/t1/candidaturas/k1/aceitar', {
      status: 401,
      corpo: { erro: 'sessao_expirada' },
    });
    const { armazenamento } = await abrir('/candidaturas/t1', fetch);
    await aceitarAPrimeira();

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    await waitFor(() => expect(screen).toHavePathname('/entrar'));
    expect(armazenamento.atual()).toBeNull();
  });
});
