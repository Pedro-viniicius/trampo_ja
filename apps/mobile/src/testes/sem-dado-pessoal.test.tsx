// CA15 no cliente: varredura do `console` durante os fluxos reais do app (2a:
// conta, perfil e busca; 2b: publicação, candidaturas e aceite) e barreira
// contra dependências de telemetria ou de armazenamento inseguro.
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { ItemDaBusca } from '../api/tipos';
import LayoutDaAreaAutenticada from '../app/(app)/_layout';
import LayoutDasAbas from '../app/(app)/(abas)/_layout';
import BuscarRota from '../app/(app)/(abas)/buscar';
import InicioRota from '../app/(app)/(abas)/index';
import RotaDoMeuPerfil from '../app/(app)/(abas)/perfil';
import RotaDeEditarPerfil from '../app/(app)/perfil/editar';
import RotaDoTrampo from '../app/(app)/trampos/[id]';
import { criarArmazenamentoEmMemoria } from '../estado/armazenamento-token';
import { textos } from '../textos/pt-BR';
import { criarFetchFalso, type RequisicaoFeita } from './fetch-falso';
import { ROTAS_REAIS } from './qa/apoio-qa';
import { ACEITAR_QUALQUER, renderizarRotas } from './rotas/apoio';

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

// Entrega 2b: texto livre dos anúncios e da candidatura, valores digitados,
// nomes de terceiros e a segunda conta da jornada.
const TITULO = 'Reforma Sentinela do Telhado';
const DESCRICAO = 'Descricao sentinela: trocar as telhas quebradas';
const CIDADE_DO_TRAMPO = 'Vila Sentinela do Sul';
const VALOR_DO_TRAMPO = '9.876,54';
const CENTAVOS_DO_TRAMPO = 987654;
const TITULO_DO_SERVICO = 'Servico Sentinela de Pintura';
const DESCRICAO_DO_SERVICO = 'Descricao sentinela do servico ofertado';
const PRECO_DO_SERVICO = '7.654,32';
const CENTAVOS_DO_SERVICO = 765432;
const MENSAGEM = 'Mensagem sentinela: posso comecar amanha cedo';
const VALOR_DA_CANDIDATURA = '8.765,43';
const CENTAVOS_DA_CANDIDATURA = 876543;
const NOME_DO_FREELANCER = 'Freelancer Sentinela Prado';
const NOME_DO_OUTRO = 'Candidato Sentinela Lopes';
const MENSAGEM_DO_OUTRO = 'Recado sentinela do outro candidato';
const EMAIL_DO_FREELANCER = 'freela.sentinela@exemplo.test';
const SENHA_DO_FREELANCER = 'FreelaSentinela#2026';
const TOKEN_DA_AUTORA = 'token-sentinela-autora';
const TOKEN_DO_FREELANCER = 'token-sentinela-freela';

const SENTINELAS: Readonly<Record<string, string>> = {
  'e-mail': EMAIL,
  senha: SENHA,
  'senha errada': SENHA_ERRADA,
  nome: NOME,
  cidade: CIDADE,
  habilidade: HABILIDADE,
  'texto da busca': TEXTO_DA_BUSCA,
  token: TOKEN,
  'título do trampo': TITULO,
  'descrição do trampo': DESCRICAO,
  'cidade do trampo': CIDADE_DO_TRAMPO,
  'valor do trampo': VALOR_DO_TRAMPO,
  'valor do trampo em centavos': String(CENTAVOS_DO_TRAMPO),
  'título do serviço': TITULO_DO_SERVICO,
  'descrição do serviço': DESCRICAO_DO_SERVICO,
  'preço do serviço': PRECO_DO_SERVICO,
  'preço do serviço em centavos': String(CENTAVOS_DO_SERVICO),
  'mensagem da candidatura': MENSAGEM,
  'valor da candidatura': VALOR_DA_CANDIDATURA,
  'valor da candidatura em centavos': String(CENTAVOS_DA_CANDIDATURA),
  'nome do freelancer': NOME_DO_FREELANCER,
  'nome do outro candidato': NOME_DO_OUTRO,
  'mensagem do outro candidato': MENSAGEM_DO_OUTRO,
  'e-mail do freelancer': EMAIL_DO_FREELANCER,
  'senha do freelancer': SENHA_DO_FREELANCER,
  'token da autora': TOKEN_DA_AUTORA,
  'token do freelancer': TOKEN_DO_FREELANCER,
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

function primeiroBotao(nome: string) {
  const botoes = screen.getAllByRole('button', { name: nome });
  return botoes[0] as (typeof botoes)[number];
}

async function preencherAcesso(email: string, senha: string) {
  await fireEvent.changeText(screen.getByLabelText(textos.entrar.email), email);
  await fireEvent.changeText(screen.getByLabelText(textos.entrar.senha), senha);
}

// --- Jornada da 2b: dados e API falsa ---

const T = textos.formularioDeAnuncio;

const PERFIL_DO_FREELANCER = {
  nome: NOME_DO_FREELANCER,
  cidade: CIDADE_DO_TRAMPO,
  descricao: null,
  habilidades: [HABILIDADE],
  completo: true,
};

function perfilPublico(contaId: string, nome: string) {
  return {
    contaId,
    nome,
    cidade: CIDADE_DO_TRAMPO,
    descricao: null,
    habilidades: [HABILIDADE],
  };
}

type FaseDoAceite = 'pendentes' | 'replica_atrasada' | 'em_andamento';

function trampoNovo(fase: FaseDoAceite) {
  return {
    id: 't-novo',
    autorId: 'c-autora',
    titulo: TITULO,
    descricao: DESCRICAO,
    categoria: 'reformas',
    cidade: CIDADE_DO_TRAMPO,
    valorCentavos: CENTAVOS_DO_TRAMPO,
    prazo: null,
    status: fase === 'em_andamento' ? 'em_andamento' : 'aberto',
    criadoEm: '2026-10-21T12:00:00.000Z',
  };
}

const SERVICO_NOVO = {
  id: 's-novo',
  autorId: 'c-autora',
  titulo: TITULO_DO_SERVICO,
  descricao: DESCRICAO_DO_SERVICO,
  categoria: 'reformas',
  cidade: CIDADE,
  precoBaseCentavos: CENTAVOS_DO_SERVICO,
  status: 'ativo',
  criadoEm: '2026-10-21T12:00:00.000Z',
};

/** Recebidas pela autora: a do freelancer (k1) e a de outra pessoa (k2). */
function recebidas(fase: FaseDoAceite) {
  const base = {
    criadaEm: '2026-10-21T13:00:00.000Z',
  };
  return [
    {
      ...base,
      id: 'k1',
      freelancerId: 'f-freela',
      mensagem: MENSAGEM,
      valorPropostoCentavos: CENTAVOS_DA_CANDIDATURA,
      status: fase === 'pendentes' ? 'pendente' : 'aceita',
    },
    {
      ...base,
      id: 'k2',
      freelancerId: 'f-outro',
      mensagem: MENSAGEM_DO_OUTRO,
      valorPropostoCentavos: 50000,
      status: fase === 'em_andamento' ? 'recusada' : 'pendente',
    },
  ];
}

const MINHA_CANDIDATURA = {
  id: 'k1',
  trampoId: 't-novo',
  freelancerId: 'f-freela',
  mensagem: MENSAGEM,
  valorPropostoCentavos: CENTAVOS_DA_CANDIDATURA,
  status: 'pendente',
  criadaEm: '2026-10-21T13:00:00.000Z',
};

function itemDoTrampoNovo(): ItemDaBusca {
  return {
    tipo: 'trampo',
    id: 't-novo',
    autorId: 'c-autora',
    titulo: TITULO,
    categoria: 'reformas',
    cidade: CIDADE_DO_TRAMPO,
    criadoEm: '2026-10-21T12:00:00.000Z',
    valorCentavos: CENTAVOS_DO_TRAMPO,
  };
}

function itemDoServicoNovo(): ItemDaBusca {
  return {
    tipo: 'servico',
    id: 's-novo',
    autorId: 'c-autora',
    titulo: TITULO_DO_SERVICO,
    categoria: 'reformas',
    cidade: CIDADE,
    criadoEm: '2026-10-21T12:00:00.000Z',
    precoBaseCentavos: CENTAVOS_DO_SERVICO,
  };
}

const SESSAO_EXPIRADA = { status: 401, corpo: { erro: 'sessao_expirada' } };

function conflito(erro: string) {
  return { status: 409, corpo: { erro } };
}

/**
 * API falsa da jornada da 2b, com duas contas: a autora (`TOKEN_DA_AUTORA`)
 * e o freelancer (`TOKEN_DO_FREELANCER`); a resposta depende do Bearer. As
 * sequências de resposta não guardam estado da regra: cada uma passa por um
 * caminho de erro com os rascunhos sentinela na tela.
 */
function criarApiDa2b() {
  const estado = {
    publicado: false,
    ofertado: false,
    candidatou: false,
    /** Fase A: `GET /trampos/meus` da autora falha e a API decide (409). */
    meusTramposFalham: true,
    fase: 'pendentes' as FaseDoAceite,
  };
  let envios = { trampo: 0, servico: 0, candidatura: 0, aceiteK2: 0 };
  const daAutora = (r: RequisicaoFeita) =>
    r.cabecalhos.authorization === `Bearer ${TOKEN_DA_AUTORA}`;
  const doFreelancer = (r: RequisicaoFeita) =>
    r.cabecalhos.authorization === `Bearer ${TOKEN_DO_FREELANCER}`;

  const api = criarFetchFalso()
    .responder('POST /sessoes', (r) => {
      const { email } = r.corpo as { email?: string };
      if (email === EMAIL_DO_FREELANCER) {
        return { corpo: { token: TOKEN_DO_FREELANCER } };
      }
      if (email === EMAIL) {
        return { corpo: { token: TOKEN_DA_AUTORA } };
      }
      return { status: 401, corpo: { erro: 'credenciais_invalidas' } };
    })
    .responder('DELETE /sessoes', { status: 204 })
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', (r) => {
      if (daAutora(r)) return { corpo: PERFIL_SALVO };
      if (doFreelancer(r)) return { corpo: PERFIL_DO_FREELANCER };
      return SESSAO_EXPIRADA;
    })
    .responder('GET /perfis/c-autora', {
      corpo: perfilPublico('c-autora', NOME),
    })
    .responder('GET /perfis/f-freela', {
      corpo: perfilPublico('f-freela', NOME_DO_FREELANCER),
    })
    .responder('GET /perfis/f-outro', {
      corpo: perfilPublico('f-outro', NOME_DO_OUTRO),
    })
    .responder('GET /busca', (r) => {
      if (r.query.tipo === 'servicos') {
        return pagina(estado.ofertado ? [itemDoServicoNovo()] : []);
      }
      return pagina(estado.publicado ? [itemDoTrampoNovo()] : []);
    })
    .responder('POST /trampos', () => {
      envios = { ...envios, trampo: envios.trampo + 1 };
      if (envios.trampo === 1) {
        return {
          status: 400,
          corpo: {
            erro: 'dados_invalidos',
            campos: [
              { campo: 'titulo', motivo: 'tamanho' },
              { campo: 'valorCentavos', motivo: 'invalido' },
            ],
          },
        };
      }
      estado.publicado = true;
      return { status: 201, corpo: { id: 't-novo', status: 'aberto' } };
    })
    .responder('POST /servicos', () => {
      envios = { ...envios, servico: envios.servico + 1 };
      if (envios.servico === 1) return { falhaDeRede: true };
      estado.ofertado = true;
      return { status: 201, corpo: { id: 's-novo', status: 'ativo' } };
    })
    .responder('GET /trampos/meus', (r) => {
      if (!daAutora(r)) return { corpo: [] };
      if (estado.meusTramposFalham) {
        return { status: 500, corpo: { erro: 'erro_interno' } };
      }
      return { corpo: estado.publicado ? [trampoNovo(estado.fase)] : [] };
    })
    .responder('GET /servicos/meus', (r) => {
      // O freelancer tem a sessão expirada aqui (CA14).
      if (doFreelancer(r)) return SESSAO_EXPIRADA;
      return { corpo: estado.ofertado ? [SERVICO_NOVO] : [] };
    })
    .responder('GET /trampos/t-novo', () => ({
      corpo: trampoNovo(estado.fase),
    }))
    .responder('GET /candidaturas/minhas', (r) => ({
      corpo: doFreelancer(r) && estado.candidatou ? [MINHA_CANDIDATURA] : [],
    }))
    .responder('POST /trampos/t-novo/candidaturas', (r) => {
      if (daAutora(r)) return conflito('autor_nao_pode_candidatar');
      envios = { ...envios, candidatura: envios.candidatura + 1 };
      switch (envios.candidatura) {
        case 1:
          return conflito('perfil_incompleto');
        case 2:
          return { falhaDeRede: true };
        case 3:
          return conflito('candidatura_duplicada');
        default:
          estado.candidatou = true;
          return { status: 201, corpo: { id: 'k1', status: 'pendente' } };
      }
    })
    .responder('GET /trampos/t-novo/candidaturas', (r) =>
      daAutora(r)
        ? { corpo: recebidas(estado.fase) }
        : { status: 404, corpo: { erro: 'nao_encontrado' } },
    )
    .responder('POST /trampos/t-novo/candidaturas/k1/aceitar', () => {
      // A réplica lida em seguida ainda mostra o trampo aberto e a k2
      // pendente: o segundo aceite chega à API e perde.
      estado.fase = 'replica_atrasada';
      return { corpo: { status: 'aceita' } };
    })
    .responder('POST /trampos/t-novo/candidaturas/k2/aceitar', () => {
      envios = { ...envios, aceiteK2: envios.aceiteK2 + 1 };
      if (envios.aceiteK2 === 1) return conflito('trampo_nao_aberto');
      estado.fase = 'em_andamento';
      return conflito('conflito_de_versao');
    });
  return { api, estado };
}

async function escolherCategoria(rotulo: string) {
  await fireEvent.press(
    screen.getByRole('button', {
      name: `${T.categoria}: ${T.escolherCategoria}`,
    }),
  );
  await fireEvent.press(await screen.findByRole('button', { name: rotulo }));
}

async function digitar(rotulo: string, texto: string) {
  await fireEvent.changeText(screen.getByLabelText(rotulo), texto);
}

/** Preenche a folha Candidatar-se com as sentinelas e sai do campo de valor. */
async function preencherFolha() {
  await digitar(textos.candidatar.mensagem, MENSAGEM);
  await digitar(textos.candidatar.valor, VALOR_DA_CANDIDATURA);
  await fireEvent(screen.getByLabelText(textos.candidatar.valor), 'blur');
}

function enviarCandidatura() {
  return fireEvent.press(
    screen.getByRole('button', { name: textos.candidatar.enviar }),
  );
}

function corpos(
  api: { requisicoes: readonly RequisicaoFeita[] },
  rota: string,
) {
  return api.requisicoes
    .filter((r) => `${r.metodo} ${r.caminho}` === rota)
    .map((r) => r.corpo);
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

  it('2b: publicar, ofertar, candidatar, recebidas com nome, aceite, os 409, queda de rede e 401', async () => {
    const { api, estado } = criarApiDa2b();
    const { armazenamento, getPathname } = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/',
      fetch: api,
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DA_AUTORA),
    });

    // A1. Autora: aba Publicar -> Publicar trampo.
    expect(await screen.findByText(`Olá, ${NOME}`)).toBeOnTheScreen();
    await fireEvent.press(ultimoBotao(textos.abas.publicar));
    await waitFor(() => expect(getPathname()).toBe('/publicar'));
    await fireEvent.press(
      await screen.findByRole('button', {
        name: `${textos.escolhaDePublicacao.trampo}. ${textos.escolhaDePublicacao.trampoAjuda}`,
      }),
    );
    await waitFor(() => expect(getPathname()).toBe('/trampos/novo'));

    // A2. Rascunho com as sentinelas: 400 por campo, depois 201.
    await screen.findByDisplayValue(CIDADE);
    await digitar(T.titulo, TITULO);
    await digitar(T.descricao, DESCRICAO);
    await escolherCategoria('Reformas');
    await digitar(T.cidade, CIDADE_DO_TRAMPO);
    await digitar(T.valor, VALOR_DO_TRAMPO);
    await fireEvent(screen.getByLabelText(T.valor), 'blur');
    expect(screen.getByDisplayValue(VALOR_DO_TRAMPO)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: T.publicarTrampo }),
    );
    expect(
      await screen.findByText(textos.erros.titulo_tamanho),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.valor_invalido)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: T.publicarTrampo }),
    );
    expect(await screen.findByText(T.publicadoTrampo)).toBeOnTheScreen();
    const trampoEsperado = {
      titulo: TITULO,
      descricao: DESCRICAO,
      categoria: 'reformas',
      cidade: CIDADE_DO_TRAMPO,
      valorCentavos: CENTAVOS_DO_TRAMPO,
    };
    expect(corpos(api, 'POST /trampos')).toEqual([
      trampoEsperado,
      trampoEsperado,
    ]);

    // A3. "Ver trampo": a lista Meus trampos falha, então o rodapé oferece
    // "Candidatar-se" e a API recusa (409 autor_nao_pode_candidatar).
    await fireEvent.press(screen.getByRole('button', { name: T.verTrampo }));
    await waitFor(() => expect(getPathname()).toBe('/trampos/t-novo'));
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    );
    await screen.findByLabelText(textos.candidatar.mensagem);
    await preencherFolha();
    await enviarCandidatura();
    expect(
      await screen.findByText(textos.erros.autor_nao_pode_candidatar),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatar.fecharFolha }),
    );
    estado.meusTramposFalham = false;
    await fireEvent.press(ultimoBotao(textos.gerais.voltar));
    await waitFor(() => expect(getPathname()).toBe('/publicar'));

    // A4. Ofertar serviço: queda de rede no envio, depois 201.
    await fireEvent.press(
      screen.getByRole('button', {
        name: `${textos.escolhaDePublicacao.servico}. ${textos.escolhaDePublicacao.servicoAjuda}`,
      }),
    );
    await waitFor(() => expect(getPathname()).toBe('/servicos/novo'));
    await screen.findByDisplayValue(CIDADE);
    await digitar(T.titulo, TITULO_DO_SERVICO);
    await digitar(T.descricao, DESCRICAO_DO_SERVICO);
    await escolherCategoria('Reformas');
    await digitar(T.precoBase, PRECO_DO_SERVICO);
    await fireEvent.press(
      screen.getByRole('button', { name: T.ofertarServico }),
    );
    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    expect(screen.getByDisplayValue(TITULO_DO_SERVICO)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: T.ofertarServico }),
    );
    expect(await screen.findByText(T.publicadoServico)).toBeOnTheScreen();
    expect(corpos(api, 'POST /servicos').at(-1)).toEqual({
      titulo: TITULO_DO_SERVICO,
      descricao: DESCRICAO_DO_SERVICO,
      categoria: 'reformas',
      cidade: CIDADE,
      precoBaseCentavos: CENTAVOS_DO_SERVICO,
    });
    await fireEvent.press(ultimoBotao(textos.gerais.voltar));
    await waitFor(() => expect(getPathname()).toBe('/publicar'));

    // A5. Perfil -> Meus trampos e Meus serviços.
    await fireEvent.press(ultimoBotao(textos.abas.perfil));
    await waitFor(() => expect(getPathname()).toBe('/perfil'));
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.meusTrampos }),
    );
    await waitFor(() => expect(getPathname()).toBe('/meus-anuncios'));
    expect((await screen.findAllByText(TITULO)).length).toBeGreaterThan(0);
    await fireEvent.press(ultimoBotao(textos.gerais.voltar));
    await waitFor(() => expect(getPathname()).toBe('/perfil'));
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.meusServicos }),
    );
    await waitFor(() => expect(getPathname()).toBe('/meus-anuncios'));
    expect(
      (await screen.findAllByText(TITULO_DO_SERVICO)).length,
    ).toBeGreaterThan(0);
    await fireEvent.press(ultimoBotao(textos.gerais.voltar));
    await waitFor(() => expect(getPathname()).toBe('/perfil'));

    // A6. Sair e entrar como o freelancer.
    await fireEvent.press(ultimoBotao(textos.perfil.sair));
    await fireEvent.press(ultimoBotao(textos.perfil.sairConfirmar));
    await waitFor(() => expect(getPathname()).toBe('/entrar'));
    expect(armazenamento.atual()).toBeNull();
    await preencherAcesso(EMAIL_DO_FREELANCER, SENHA_DO_FREELANCER);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );
    await waitFor(() => expect(getPathname()).toBe('/'));
    expect(armazenamento.atual()).toBe(TOKEN_DO_FREELANCER);

    // B1. Freelancer: o trampo novo nos recentes abre o detalhe.
    expect(
      await screen.findByText(`Olá, ${NOME_DO_FREELANCER}`),
    ).toBeOnTheScreen();
    const [recente] = await screen.findAllByText(TITULO);
    await fireEvent.press(recente as NonNullable<typeof recente>);
    await waitFor(() => expect(getPathname()).toBe('/trampos/t-novo'));

    // B2. Candidatar-se: 409 perfil_incompleto, queda de rede, 409
    // candidatura_duplicada e, por fim, 201.
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    );
    await screen.findByLabelText(textos.candidatar.mensagem);
    await preencherFolha();
    await enviarCandidatura();
    expect(
      await screen.findByText(textos.avisoPerfil.mensagem([])),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avisoPerfil.agoraNao }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.detalheTrampo.candidatar }),
    );
    expect(await screen.findByDisplayValue(MENSAGEM)).toBeOnTheScreen();
    await enviarCandidatura();
    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    await enviarCandidatura();
    expect(
      await screen.findByText(textos.erros.candidatura_duplicada),
    ).toBeOnTheScreen();
    await enviarCandidatura();
    expect(
      await screen.findByText(textos.candidatar.enviada),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.detalheTrampo.jaCandidatou),
    ).toBeOnTheScreen();
    const candidaturaEsperada = {
      mensagem: MENSAGEM,
      valorPropostoCentavos: CENTAVOS_DA_CANDIDATURA,
    };
    expect(corpos(api, 'POST /trampos/t-novo/candidaturas')).toEqual(
      Array.from({ length: 5 }, () => candidaturaEsperada),
    );

    // B3. Minhas candidaturas pelo atalho do Início.
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.toastFechar }),
    );
    await fireEvent.press(ultimoBotao(textos.gerais.voltar));
    await waitFor(() => expect(getPathname()).toBe('/'));
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.inicio.minhasCandidaturas,
      }),
    );
    await waitFor(() => expect(getPathname()).toBe('/candidaturas'));
    expect(await screen.findByText(TITULO)).toBeOnTheScreen();
    await fireEvent.press(ultimoBotao(textos.gerais.voltar));
    await waitFor(() => expect(getPathname()).toBe('/'));

    // B4. Sessão do freelancer expira em Meus serviços: volta ao login (CA14).
    await fireEvent.press(ultimoBotao(textos.abas.perfil));
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.meusServicos }),
    );
    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    await waitFor(() => expect(getPathname()).toBe('/entrar'));
    expect(armazenamento.atual()).toBeNull();

    // C1. A autora entra de novo.
    await preencherAcesso(EMAIL, SENHA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );
    // O retorno guarda só o caminho de onde a sessão expirou, sem a query.
    await waitFor(() => expect(getPathname()).toBe('/meus-anuncios'));
    expect(armazenamento.atual()).toBe(TOKEN_DA_AUTORA);

    // C2. Meus trampos -> detalhe -> Candidaturas recebidas com os nomes.
    await fireEvent.press(ultimoBotao(textos.gerais.voltar));
    await waitFor(() => expect(getPathname()).toBe('/'));
    await fireEvent.press(ultimoBotao(textos.abas.perfil));
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.meusTrampos }),
    );
    await waitFor(() => expect(getPathname()).toBe('/meus-anuncios'));
    const [meuTrampo] = await screen.findAllByText(TITULO);
    await fireEvent.press(meuTrampo as NonNullable<typeof meuTrampo>);
    await waitFor(() => expect(getPathname()).toBe('/trampos/t-novo'));
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Ver candidaturas (2)' }),
    );
    await waitFor(() => expect(getPathname()).toBe('/candidaturas/t-novo'));
    expect(await screen.findByText(NOME_DO_FREELANCER)).toBeOnTheScreen();
    expect(await screen.findByText(NOME_DO_OUTRO)).toBeOnTheScreen();

    // C3. Aceita o freelancer (200).
    const aceitar = () =>
      screen.getAllByRole('button', { name: ACEITAR_QUALQUER });
    await fireEvent.press(
      primeiroBotao(textos.candidaturasRecebidas.aceitarDe(NOME_DO_FREELANCER)),
    );
    expect(
      await screen.findByText(`Aceitar ${NOME_DO_FREELANCER}?`),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.confirmar,
      }),
    );
    expect(
      await screen.findByText(textos.candidaturasRecebidas.aceitaToast),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.toastFechar }),
    );

    // C4. A réplica atrasada ainda mostra a outra pendente: o aceite dela
    // perde com 409 trampo_nao_aberto e, na nova tentativa da pessoa, com
    // 409 conflito_de_versao.
    await waitFor(() => expect(aceitar()).toHaveLength(1));
    // No aceite, `trampo_nao_aberto` aparece como o aceite perdido.
    const textoDoConflito = {
      trampo_nao_aberto: textos.erros.aceite_perdido,
      conflito_de_versao: textos.erros.conflito_de_versao,
    } as const;
    for (const codigo of ['trampo_nao_aberto', 'conflito_de_versao'] as const) {
      await fireEvent.press(
        primeiroBotao(textos.candidaturasRecebidas.aceitarDe(NOME_DO_OUTRO)),
      );
      expect(
        await screen.findByText(`Aceitar ${NOME_DO_OUTRO}?`),
      ).toBeOnTheScreen();
      await fireEvent.press(
        screen.getByRole('button', {
          name: textos.candidaturasRecebidas.confirmar,
        }),
      );
      expect(
        await screen.findByText(textoDoConflito[codigo]),
      ).toBeOnTheScreen();
    }
    await waitFor(() =>
      expect(screen.getByText(textos.selos.recusada)).toBeOnTheScreen(),
    );
    expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.emAndamento)).toBeOnTheScreen();
    expect(
      screen.queryAllByRole('button', { name: ACEITAR_QUALQUER }),
    ).toHaveLength(0);

    // Todo pedido autenticado levou o Bearer da conta da vez (CA14).
    const rotas = api.requisicoes.map((r) => `${r.metodo} ${r.caminho}`);
    const [entradaDoFreelancer, entradaDaAutora] = rotas
      .map((rota, indice) => (rota === 'POST /sessoes' ? indice : -1))
      .filter((indice) => indice >= 0);
    const saida = rotas.indexOf('DELETE /sessoes');
    if (entradaDoFreelancer === undefined || entradaDaAutora === undefined) {
      throw new Error('a jornada devia ter entrado duas vezes');
    }
    expect(saida).toBeGreaterThanOrEqual(0);
    expect(saida).toBeLessThan(entradaDoFreelancer);
    api.requisicoes.forEach((requisicao, indice) => {
      if (ehRotaPublica(requisicao)) return;
      const esperado =
        indice < saida || indice > entradaDaAutora
          ? TOKEN_DA_AUTORA
          : TOKEN_DO_FREELANCER;
      expect([indice, requisicao.cabecalhos.authorization]).toEqual([
        indice,
        `Bearer ${esperado}`,
      ]);
    });

    // A jornada passou por todas as respostas previstas.
    expect(rotas.filter((r) => r === 'POST /trampos')).toHaveLength(2);
    expect(rotas.filter((r) => r === 'POST /servicos')).toHaveLength(2);
    expect(
      rotas.filter((r) => r === 'POST /trampos/t-novo/candidaturas/k1/aceitar'),
    ).toHaveLength(1);
    expect(
      rotas.filter((r) => r === 'POST /trampos/t-novo/candidaturas/k2/aceitar'),
    ).toHaveLength(2);
    expect(rotas).toContain('GET /perfis/f-freela');
    expect(rotas).toContain('GET /perfis/f-outro');
  }, 60_000);
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

  it('pega as sentinelas da 2b: mensagem, valor digitado codificado e nome em maiúsculas', () => {
    const chamadas = espionarConsole();

    // biome-ignore lint/suspicious/noConsole: controle de propósito; o espião engole a chamada.
    console.info({ candidatura: { mensagem: MENSAGEM } });
    // biome-ignore lint/suspicious/noConsole: idem.
    console.warn(`valor=${encodeURIComponent(VALOR_DO_TRAMPO)}`);
    // biome-ignore lint/suspicious/noConsole: idem.
    console.error(new Error(`Aceitar ${NOME_DO_FREELANCER.toUpperCase()}?`));

    expect(sentinelasEncontradas(chamadas).sort()).toEqual(
      [
        'mensagem da candidatura',
        'valor do trampo',
        'nome do freelancer',
      ].sort(),
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
