// CA15 no cliente: varredura do `console` durante os fluxos reais do app e
// barreira contra dependências de telemetria ou de armazenamento inseguro.
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { ItemDaBusca } from '../api/tipos';
import LayoutDaAreaAutenticada from '../app/(app)/_layout';
import LayoutDasAbas from '../app/(app)/(abas)/_layout';
import BuscarRota from '../app/(app)/(abas)/buscar';
import InicioRota from '../app/(app)/(abas)/index';
import RotaDoMeuPerfil from '../app/(app)/(abas)/perfil';
import RotaDeEditarPerfil from '../app/(app)/perfil/editar';
import RotaDoTrampo from '../app/(app)/trampos/[id]';
import { textos } from '../textos/pt-BR';
import { criarFetchFalso, type RequisicaoFeita } from './fetch-falso';
import { renderizarRotas } from './rotas/apoio';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
}));

// --- Sentinelas: valores únicos que não podem aparecer em `console` ---

const EMAIL = 'sentinela.app@exemplo.test';
const SENHA = 'SentinelaApp#2026';
const SENHA_ERRADA = 'SentinelaErrada#2026';
const NOME = 'Sentinela Aplicativo';
const CIDADE = 'Cidadela Sentinela';
const HABILIDADE = 'sentinela-habilidade';
const TEXTO_DA_BUSCA = 'SENTINELA-BUSCA';
const TOKEN = 'token-sentinela-xyz';

const SENTINELAS: Readonly<Record<string, string>> = {
  'e-mail': EMAIL,
  senha: SENHA,
  'senha errada': SENHA_ERRADA,
  nome: NOME,
  cidade: CIDADE,
  habilidade: HABILIDADE,
  'texto da busca': TEXTO_DA_BUSCA,
  token: TOKEN,
};

// --- Varredura ---

const METODOS_DO_CONSOLE = [
  'log',
  'info',
  'warn',
  'error',
  'debug',
  'trace',
] as const;

type MetodoDoConsole = (typeof METODOS_DO_CONSOLE)[number];

interface ChamadaDoConsole {
  readonly metodo: MetodoDoConsole;
  readonly args: readonly unknown[];
}

/** Liga um espião em cada método do `console`; as chamadas vão para a lista. */
function espionarConsole(): ChamadaDoConsole[] {
  const chamadas: ChamadaDoConsole[] = [];
  for (const metodo of METODOS_DO_CONSOLE) {
    jest.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      chamadas.push({ metodo, args });
    });
  }
  return chamadas;
}

/**
 * `JSON.stringify` que não para em referência circular e abre os `Error`
 * (`message`, `stack`, `cause` e campos próprios), que viram `{}` no padrão.
 */
function emJson(valor: unknown): string {
  const vistos = new WeakSet<object>();
  try {
    return (
      JSON.stringify(valor, (_chave, atual: unknown) => {
        if (typeof atual === 'bigint' || typeof atual === 'symbol') {
          return String(atual);
        }
        if (typeof atual === 'function') {
          return `[function ${atual.name}]`;
        }
        if (typeof atual !== 'object' || atual === null) {
          return atual;
        }
        if (vistos.has(atual)) {
          return '[circular]';
        }
        vistos.add(atual);
        if (atual instanceof Error) {
          const aberto: Record<string, unknown> = {
            name: atual.name,
            message: atual.message,
            stack: atual.stack,
            cause: atual.cause,
          };
          for (const chave of Object.getOwnPropertyNames(atual)) {
            aberto[chave] = (atual as unknown as Record<string, unknown>)[
              chave
            ];
          }
          return aberto;
        }
        return atual;
      }) ?? ''
    );
  } catch {
    return '';
  }
}

function emTexto(valor: unknown): string {
  try {
    return String(valor);
  } catch {
    // `Object.create(null)` não tem `toString`.
    return '';
  }
}

/** Todos os argumentos de todas as chamadas, como `String` e como JSON. */
function textoDasChamadas(chamadas: readonly ChamadaDoConsole[]): string {
  return chamadas
    .flatMap(({ args }) => args.flatMap((arg) => [emTexto(arg), emJson(arg)]))
    .join('\n');
}

/**
 * Nomes das sentinelas que aparecem nas chamadas: texto puro ou codificado
 * para URL (`encodeURIComponent`), sem diferenciar maiúsculas de minúsculas.
 */
function sentinelasEncontradas(
  chamadas: readonly ChamadaDoConsole[],
): string[] {
  const texto = textoDasChamadas(chamadas).toLowerCase();
  return Object.entries(SENTINELAS)
    .filter(([, valor]) =>
      [valor, encodeURIComponent(valor)].some((forma) =>
        texto.includes(forma.toLowerCase()),
      ),
    )
    .map(([nome]) => nome);
}

/** Primeira linha de cada chamada, sem os argumentos (para ver os avisos). */
function resumoDasChamadas(chamadas: readonly ChamadaDoConsole[]): string[] {
  return chamadas.map(
    ({ metodo, args }) =>
      `${metodo}: ${emTexto(args[0]).split('\n', 1)[0]?.slice(0, 120) ?? ''}`,
  );
}

// --- Dados das respostas falsas (carregam as sentinelas de propósito) ---

const CATEGORIAS = [{ id: 'reformas', rotulo: 'Reformas' }];

const PERFIL_SALVO = {
  nome: NOME,
  cidade: CIDADE,
  descricao: null,
  habilidades: [HABILIDADE],
  completo: true,
};

function itemDaBusca(id: string, titulo: string): ItemDaBusca {
  return {
    tipo: 'trampo',
    id,
    autorId: 'conta-autor',
    titulo,
    categoria: 'reformas',
    cidade: CIDADE,
    criadoEm: '2026-10-20T12:00:00.000Z',
    valorCentavos: 15000,
  };
}

function pagina(itens: readonly ItemDaBusca[]) {
  return { corpo: { itens, proximoCursor: null } };
}

const ROTAS = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/(abas)/_layout': LayoutDasAbas,
  '(app)/(abas)/index': InicioRota,
  '(app)/(abas)/buscar': BuscarRota,
  '(app)/(abas)/perfil': RotaDoMeuPerfil,
  '(app)/perfil/editar': RotaDeEditarPerfil,
  '(app)/trampos/[id]': RotaDoTrampo,
};

/** Rotas que não exigem sessão (o cliente não manda Bearer nelas). */
function ehRotaPublica(requisicao: RequisicaoFeita): boolean {
  return requisicao.caminho === '/contas' || requisicao.caminho === '/sessoes';
}

/**
 * API falsa da jornada inteira. A busca com texto responde 200, depois cai a
 * rede e, no "Tentar de novo", responde 200 de novo; o detalhe responde 500 e
 * depois 401 (sessão expirada).
 */
function criarApiDaJornada() {
  let buscasComTexto = 0;
  return criarFetchFalso()
    .responder('POST /contas', [
      { status: 201, corpo: { token: TOKEN } },
      { status: 409, corpo: { erro: 'email_em_uso' } },
      { status: 429, corpo: { erro: 'muitas_requisicoes' } },
    ])
    .responder('POST /sessoes', {
      status: 401,
      corpo: { erro: 'credenciais_invalidas' },
    })
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', [
      { status: 404, corpo: { erro: 'nao_encontrado' } },
      { corpo: PERFIL_SALVO },
    ])
    .responder('PUT /perfis/eu', [
      {
        status: 400,
        corpo: {
          erro: 'dados_invalidos',
          campos: [{ campo: 'habilidades.0', motivo: 'invalido' }],
        },
      },
      { corpo: PERFIL_SALVO },
    ])
    .responder('GET /busca', (requisicao) => {
      if (requisicao.query.texto === undefined) {
        return pagina([itemDaBusca('t-recente', 'Recente da varredura')]);
      }
      buscasComTexto += 1;
      return buscasComTexto === 2
        ? { falhaDeRede: true }
        : pagina([itemDaBusca('t-sentinela', 'Resultado da varredura')]);
    })
    .responder('GET /trampos/t-sentinela', [
      { status: 500, corpo: { erro: 'erro_interno' } },
      { status: 401, corpo: { erro: 'sessao_expirada' } },
    ]);
}

function ultimoBotao(nome: string) {
  const botoes = screen.getAllByRole('button', { name: nome });
  return botoes[botoes.length - 1] as (typeof botoes)[number];
}

async function preencherAcesso(email: string, senha: string) {
  await fireEvent.changeText(screen.getByLabelText(textos.entrar.email), email);
  await fireEvent.changeText(screen.getByLabelText(textos.entrar.senha), senha);
}

// --- Testes ---

describe('varredura do console nos fluxos do app (CA15)', () => {
  let chamadas: ChamadaDoConsole[] = [];

  beforeEach(() => {
    chamadas = espionarConsole();
  });

  afterEach(() => {
    // O teste não exige zero chamadas (o React e o RN avisam de `act` e de
    // deprecações), só que nenhuma traga dado pessoal ou token.
    const encontradas = sentinelasEncontradas(chamadas);
    const resumo = resumoDasChamadas(chamadas);
    jest.restoreAllMocks();
    // O resumo entra no `expect` só para aparecer na mensagem de falha.
    expect({ encontradas, chamadas: resumo }).toEqual({
      encontradas: [],
      chamadas: resumo,
    });
  });

  it('cadastro, perfil, início, busca, detalhe, 401, login e cadastro recusados', async () => {
    const api = criarApiDaJornada();
    const { armazenamento, getPathname } = await renderizarRotas(ROTAS, {
      initialUrl: '/cadastro',
      fetch: api,
    });

    // 1. Cadastro ok: token só na porta e modo completar perfil.
    await screen.findByText(textos.cadastro.privacidade);
    await preencherAcesso(EMAIL, SENHA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.criarConta }),
    );
    expect(
      await screen.findByText(textos.editarPerfil.tituloCompletar),
    ).toBeOnTheScreen();
    expect(armazenamento.atual()).toBe(TOKEN);

    // 2. Completar perfil com as sentinelas: 400 em `habilidades.0`, depois 200.
    await fireEvent.changeText(
      await screen.findByLabelText(textos.editarPerfil.nome),
      NOME,
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.cidade),
      CIDADE,
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.adicionarHabilidade),
      HABILIDADE,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.adicionar }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.salvar }),
    );
    expect(
      await screen.findByText(textos.erros.habilidade_invalida),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.salvar }),
    );
    expect(
      await screen.findByText(textos.editarPerfil.sucesso),
    ).toBeOnTheScreen();
    expect(api.requisicoes.find((r) => r.metodo === 'PUT')?.corpo).toEqual({
      nome: NOME,
      cidade: CIDADE,
      habilidades: [HABILIDADE],
    });
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.fechar }),
    );

    // 3. Início com a saudação e os recentes.
    await waitFor(() => expect(getPathname()).toBe('/'));
    expect(await screen.findByText(`Olá, ${NOME}`)).toBeOnTheScreen();
    expect(
      (await screen.findAllByText('Recente da varredura')).length,
    ).toBeGreaterThan(0);

    // 3b. Aba Perfil com os dados salvos.
    // As abas da barra têm papel `button`.
    await fireEvent.press(ultimoBotao(textos.perfil.titulo));
    await waitFor(() => expect(getPathname()).toBe('/perfil'));
    expect(await screen.findByText(HABILIDADE)).toBeOnTheScreen();
    await fireEvent.press(ultimoBotao('Início'));
    await waitFor(() => expect(getPathname()).toBe('/'));

    // 4. Busca com o texto sentinela: 200, depois queda de rede, depois 200.
    await fireEvent.press(
      screen.getAllByRole('button', {
        name: textos.gerais.verTodos,
      })[0] as never,
    );
    await waitFor(() => expect(getPathname()).toBe('/buscar'));
    const campo = await screen.findByLabelText(textos.buscar.campo);
    await fireEvent.changeText(campo, TEXTO_DA_BUSCA);
    await fireEvent(campo, 'submitEditing');
    expect(await screen.findByText('Resultado da varredura')).toBeOnTheScreen();
    await fireEvent.changeText(campo, `${TEXTO_DA_BUSCA} de novo`);
    await fireEvent(campo, 'submitEditing');
    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    await fireEvent.press(ultimoBotao(textos.gerais.tentarDeNovo));
    expect(await screen.findByText('Resultado da varredura')).toBeOnTheScreen();

    // 5. Detalhe com 500.
    await fireEvent.press(screen.getByText('Resultado da varredura'));
    await waitFor(() => expect(getPathname()).toBe('/trampos/t-sentinela'));
    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();

    // 6. 401 numa rota autenticada: volta ao login com o aviso (CA14).
    await fireEvent.press(ultimoBotao(textos.gerais.tentarDeNovo));
    expect(await screen.findByText(textos.erros.sessao_expirada)).toBeTruthy();
    await waitFor(() => expect(getPathname()).toBe('/entrar'));
    expect(armazenamento.atual()).toBeNull();
    const indiceDo401 = api.requisicoes
      .map((r) => r.caminho)
      .lastIndexOf('/trampos/t-sentinela');
    const autenticadas = api.requisicoes
      .slice(0, indiceDo401 + 1)
      .filter((r) => !ehRotaPublica(r));
    expect(autenticadas.length).toBeGreaterThan(0);
    for (const requisicao of autenticadas) {
      expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    }

    // 7. Login com a senha errada (401 credenciais_invalidas).
    await preencherAcesso(EMAIL, SENHA_ERRADA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );
    expect(
      await screen.findByText(textos.erros.credenciais_invalidas),
    ).toBeOnTheScreen();

    // 8. Cadastro duplicado (409), depois 429.
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    await waitFor(() => expect(getPathname()).toBe('/entrada'));
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrada.criarConta }),
    );
    await screen.findByText(textos.cadastro.privacidade);
    await preencherAcesso(EMAIL, SENHA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.criarConta }),
    );
    expect(
      await screen.findByText(textos.erros.email_em_uso),
    ).toBeOnTheScreen();
    await preencherAcesso(EMAIL, SENHA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.criarConta }),
    );
    expect(
      await screen.findByText(textos.erros.muitas_tentativas),
    ).toBeOnTheScreen();

    // A jornada passou por todas as respostas previstas.
    const status = api.requisicoes.map((r) => `${r.metodo} ${r.caminho}`);
    expect(status.filter((s) => s === 'POST /contas')).toHaveLength(3);
    expect(status.filter((s) => s === 'PUT /perfis/eu')).toHaveLength(2);
    expect(status.filter((s) => s === 'POST /sessoes')).toHaveLength(1);
    expect(
      api.requisicoes.filter((r) => r.query.texto !== undefined),
    ).toHaveLength(3);
  }, 30_000);
});

describe('controle da varredura', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('pega a sentinela em texto, em objeto, em Error e codificada para URL', () => {
    const chamadas = espionarConsole();

    // biome-ignore lint/suspicious/noConsole: controle de propósito; o espião engole a chamada.
    console.warn(`aviso com ${EMAIL.toUpperCase()}`);
    // biome-ignore lint/suspicious/noConsole: idem.
    console.error(new Error('falhou'), { corpo: { senha: SENHA } });
    const comToken = new Error('sessão') as Error & { cabecalho?: string };
    comToken.cabecalho = `Bearer ${TOKEN}`;
    // biome-ignore lint/suspicious/noConsole: idem.
    console.trace(comToken);
    // biome-ignore lint/suspicious/noConsole: idem.
    console.log(`/busca?texto=${encodeURIComponent(`${TEXTO_DA_BUSCA} x`)}`);
    const circular: Record<string, unknown> = { nome: NOME };
    circular.eu = circular;
    // biome-ignore lint/suspicious/noConsole: idem.
    console.debug(circular);

    expect(chamadas).toHaveLength(5);
    expect(sentinelasEncontradas(chamadas).sort()).toEqual(
      ['e-mail', 'senha', 'token', 'texto da busca', 'nome'].sort(),
    );
  });

  it('sem sentinela nas chamadas, não acusa nada', () => {
    const chamadas = espionarConsole();

    // biome-ignore lint/suspicious/noConsole: controle de propósito; o espião engole a chamada.
    console.error('Warning: An update was not wrapped in act(...)');

    expect(sentinelasEncontradas(chamadas)).toEqual([]);
  });
});

describe('dependências do app (CA15)', () => {
  const PROIBIDAS = [
    'async-storage',
    'sentry',
    'bugsnag',
    'firebase',
    'analytics',
    'segment',
    'amplitude',
    'mixpanel',
  ];

  it('nem dependencies nem devDependencies trazem telemetria ou AsyncStorage', () => {
    const pacote = require('../../package.json') as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const nomes = [
      ...Object.keys(pacote.dependencies ?? {}),
      ...Object.keys(pacote.devDependencies ?? {}),
    ];

    expect(nomes.length).toBeGreaterThan(0);
    expect(
      nomes.filter((nome) =>
        PROIBIDAS.some((proibida) => nome.toLowerCase().includes(proibida)),
      ),
    ).toEqual([]);
  });
});
