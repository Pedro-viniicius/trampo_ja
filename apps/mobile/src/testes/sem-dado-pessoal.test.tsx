// CA15 no cliente: varredura do `console` durante os fluxos reais do app (2a:
// conta, perfil e busca; 2b: publicação, candidaturas e aceite; 2c:
// conversas, também fora do `console`; L1: exportação e exclusão da conta com
// a senha, CA24; L2: o rascunho da edição de trampo e de serviço, CA35) e
// barreira contra dependências de telemetria ou de armazenamento inseguro.
import type { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { FlatList, Text, View } from 'react-native';
import type { ItemDaBusca, Mensagem } from '../api/tipos';
import LayoutDaAreaAutenticada from '../app/(app)/_layout';
import LayoutDasAbas from '../app/(app)/(abas)/_layout';
import BuscarRota from '../app/(app)/(abas)/buscar';
import RotaDasConversas from '../app/(app)/(abas)/conversas';
import InicioRota from '../app/(app)/(abas)/index';
import RotaDoMeuPerfil from '../app/(app)/(abas)/perfil';
import RotaDePublicar from '../app/(app)/(abas)/publicar';
import RotaDeEditarPerfil from '../app/(app)/perfil/editar';
import RotaDoTrampo from '../app/(app)/trampos/[id]';
import { criarArmazenamentoEmMemoria } from '../estado/armazenamento-token';
import {
  avisarAoVoltar,
  esquecerAvisoDeRetorno,
} from '../estado/aviso-de-retorno';
import { INTERVALO_DO_POLLING_MS } from '../estado/consultas/conversas';
import { compartilharExportacao } from '../estado/exportacao';
import { formatarHoraDaMensagem } from '../estado/formatacao';
import { textos } from '../textos/pt-BR';
import {
  criarFetchFalso,
  type RequisicaoFeita,
  type RespostaFalsa,
} from './fetch-falso';
import { ROTAS_REAIS, textosDaArvore } from './qa/apoio-qa';
import { criarQueryClientDeTeste } from './renderizar';
import { ACEITAR_QUALQUER, renderizarRotas } from './rotas/apoio';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
}));

// L1: a folha de compartilhamento fica de fora; a jornada guarda o que iria
// para o arquivo (o resto de `estado/exportacao` é o real).
jest.mock('../estado/exportacao', () => ({
  ...jest.requireActual('../estado/exportacao'),
  compartilharExportacao: jest.fn(),
}));

const compartilhar = jest.mocked(compartilharExportacao);

// L2: o aviso de retorno é o real; o espião só guarda o que cada tela deixou
// nele (CA35: só a chave do texto).
jest.mock('../estado/aviso-de-retorno', () => {
  const real = jest.requireActual<typeof import('../estado/aviso-de-retorno')>(
    '../estado/aviso-de-retorno',
  );
  return { ...real, avisarAoVoltar: jest.fn(real.avisarAoVoltar) };
});

const avisar = jest.mocked(avisarAoVoltar);

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

// Entrega 2c: o texto que a autora envia (no 201 e no que cai a rede e é
// reenviado), o que ela recebe do freelancer, a prévia e o nome de um
// terceiro e o texto da conversa que sumiu (404 no envio).
const TEXTO_ENVIADO = 'Texto sentinela enviado pela autora';
const TEXTO_QUE_CAIU = 'Texto sentinela que caiu na rede';
const TEXTO_RECEBIDO = 'Texto sentinela recebido do freelancer';
const PREVIA_DO_TERCEIRO = 'Previa sentinela da conversa com o terceiro';
const NOME_DO_TERCEIRO = 'Terceiro Sentinela Duarte';
const TEXTO_DA_CONVERSA_SUMIDA = 'Texto sentinela para a conversa sumida';

// Pré-lançamento L1 (CA24): a conta que exporta os dados e se exclui, com a
// senha certa e a errada.
const EMAIL_DA_CONTA = 'conta.excluida.sentinela@exemplo.test';
const SENHA_DA_CONTA = 'SentinelaDaExclusao#2026';
const SENHA_ERRADA_DA_CONTA = 'SentinelaSenhaErradaL1#2026';
const TOKEN_DA_CONTA = 'token-sentinela-excluida';

// Valores que só existem no JSON exportado (diferentes dos da tela e do
// login): o conteúdo vai para o arquivo e qualquer cópia fora dele aparece.
const EMAIL_EXPORTADO = 'exportado.sentinela@exemplo.test';
const NOME_EXPORTADO = 'Exportada Sentinela Moura';
const TITULO_EXPORTADO = 'Anuncio Sentinela Exportado';
const DESCRICAO_EXPORTADA = 'Descricao sentinela do anuncio exportado';
const TEXTO_EXPORTADO = 'Mensagem sentinela que so existe na exportacao';

// Pré-lançamento L2 (CA35): o que a autora digita ao editar o trampo e o
// serviço. Título e descrição vão no `PUT` que salva; o rascunho da
// descrição vai num `PUT` recusado e é trocado antes de salvar, então nunca
// chega à API como texto salvo.
const TITULO_EDITADO = 'Titulo Sentinela Editado no Trampo';
const DESCRICAO_EDITADA = 'Descricao sentinela editada do trampo';
const RASCUNHO_DO_TRAMPO = 'Rascunho sentinela do trampo que nao foi salvo';
const TITULO_DO_SERVICO_EDITADO = 'Titulo Sentinela Editado no Servico';
const DESCRICAO_DO_SERVICO_EDITADA = 'Descricao sentinela editada do servico';
const RASCUNHO_DO_SERVICO = 'Rascunho sentinela do servico que nao foi salvo';

/** O rascunho que nunca foi salvo: não pode ficar em lugar nenhum. */
const SENTINELAS_NAO_SALVAS_DA_L2: Readonly<Record<string, string>> = {
  'rascunho do trampo': RASCUNHO_DO_TRAMPO,
  'rascunho do serviço': RASCUNHO_DO_SERVICO,
};

/**
 * Tudo o que passa pelo rascunho da edição. O que foi salvo volta na leitura
 * do anúncio (cache de consultas e tela) de propósito; o resto não.
 */
const SENTINELAS_DA_EDICAO: Readonly<Record<string, string>> = {
  'título editado do trampo': TITULO_EDITADO,
  'descrição editada do trampo': DESCRICAO_EDITADA,
  'título editado do serviço': TITULO_DO_SERVICO_EDITADO,
  'descrição editada do serviço': DESCRICAO_DO_SERVICO_EDITADA,
  ...SENTINELAS_NAO_SALVAS_DA_L2,
};

/** As senhas digitadas na jornada do L1. */
const SENHAS_DO_L1: Readonly<Record<string, string>> = {
  'senha da conta excluída': SENHA_DA_CONTA,
  'senha errada da conta excluída': SENHA_ERRADA_DA_CONTA,
};

/** O que só pode existir na resposta da exportação e no arquivo. */
const SENTINELAS_DO_JSON: Readonly<Record<string, string>> = {
  'e-mail exportado': EMAIL_EXPORTADO,
  'nome exportado': NOME_EXPORTADO,
  'título exportado': TITULO_EXPORTADO,
  'descrição exportada': DESCRICAO_EXPORTADA,
  'mensagem exportada': TEXTO_EXPORTADO,
};

/**
 * O que não pode ficar em cache do TanStack, URL, `testID` nem erro (CA24):
 * as senhas, o e-mail do login, o token e o JSON. O perfil da tela (nome,
 * cidade) fica de fora: a consulta do perfil o guarda de propósito.
 */
const SENTINELAS_RESTRITAS_DO_L1: Readonly<Record<string, string>> = {
  ...SENHAS_DO_L1,
  'e-mail da conta excluída': EMAIL_DA_CONTA,
  'token da conta excluída': TOKEN_DA_CONTA,
  ...SENTINELAS_DO_JSON,
};

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
  'texto enviado': TEXTO_ENVIADO,
  'texto que caiu na rede': TEXTO_QUE_CAIU,
  'texto recebido': TEXTO_RECEBIDO,
  'prévia do terceiro': PREVIA_DO_TERCEIRO,
  'nome do terceiro': NOME_DO_TERCEIRO,
  'texto da conversa sumida': TEXTO_DA_CONVERSA_SUMIDA,
  ...SENTINELAS_RESTRITAS_DO_L1,
  ...SENTINELAS_DA_EDICAO,
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
 * Nomes das sentinelas que aparecem em `texto`: puras ou codificadas para URL
 * (`encodeURIComponent` e a query de formulário, com `+` no lugar do
 * espaço, como o Expo Router monta a URL), sem diferenciar maiúsculas de
 * minúsculas. `sentinelas` restringe a procura (padrão: todas).
 */
function sentinelasNoTexto(
  texto: string,
  sentinelas: Readonly<Record<string, string>> = SENTINELAS,
): string[] {
  const minusculo = texto.toLowerCase();
  return Object.entries(sentinelas)
    .filter(([, valor]) =>
      [
        valor,
        encodeURIComponent(valor),
        encodeURIComponent(valor).replace(/%20/g, '+'),
      ].some((forma) => minusculo.includes(forma.toLowerCase())),
    )
    .map(([nome]) => nome);
}

/** Nomes das sentinelas que aparecem nas chamadas do `console`. */
function sentinelasEncontradas(
  chamadas: readonly ChamadaDoConsole[],
): string[] {
  return sentinelasNoTexto(textoDasChamadas(chamadas));
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
  '(app)/(abas)/publicar': RotaDePublicar,
  '(app)/(abas)/conversas': RotaDasConversas,
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

// --- Jornada da 2c: dados, API falsa e varredura fora do `console` ---

const AUTORA = 'c-autora';
const FREELANCER = 'f-freela';
const TERCEIRO = 'c-terceiro';
const ESTRANHO = 'c-estranho';
const ENVIADA_EM = '2026-10-21T14:00:00.000Z';

/**
 * Rótulo da linha da lista de conversas (D2). Toda mensagem do cenário tem a
 * hora `ENVIADA_EM`, formatada como a tela a formata agora.
 */
function linhaDaListaDa2c(nome: string, previa: string): string {
  return textos.conversas.linhaDaLista(
    nome,
    previa,
    formatarHoraDaMensagem(ENVIADA_EM, new Date()),
  );
}

function servicoDe(id: string, autorId: string) {
  return { ...SERVICO_NOVO, id, autorId };
}

function resumoDaConversa(
  conversaId: string,
  outroUsuarioId: string,
  mensagens: readonly Mensagem[],
) {
  const ultima = mensagens[mensagens.length - 1];
  return {
    conversaId,
    outroUsuarioId,
    criadaEm: '2026-10-21T12:00:00.000Z',
    ultimaMensagem:
      ultima === undefined
        ? null
        : { texto: ultima.texto, enviadaEm: ultima.enviadaEm },
  };
}

/** `GET /conversas/:id/mensagens` com `depoisDe` (400 com id desconhecido). */
function paginaDeMensagens(
  mensagens: readonly Mensagem[],
  requisicao: RequisicaoFeita,
) {
  const { depoisDe } = requisicao.query;
  if (depoisDe === undefined) {
    return { corpo: mensagens.slice(0, 50) };
  }
  const indice = mensagens.findIndex((m) => m.id === depoisDe);
  return indice < 0
    ? { status: 400, corpo: { erro: 'dados_invalidos' } }
    : { corpo: mensagens.slice(indice + 1, indice + 51) };
}

/**
 * API falsa da jornada da 2c com as mesmas duas contas da 2b (a resposta
 * depende do Bearer). A conversa `c1` é entre a autora e o freelancer e
 * guarda o que chega no `POST`; a `c2` é da autora com um terceiro e some
 * no envio (404). A abertura responde pelo `outroUsuarioId` do corpo: 200
 * com quem tem vínculo, 409 com a própria conta e 403 com o resto.
 */
function criarApiDa2c() {
  const estado = {
    mensagensC1: [
      {
        id: 'm1',
        autorId: FREELANCER,
        texto: TEXTO_RECEBIDO,
        enviadaEm: ENVIADA_EM,
      },
    ] as Mensagem[],
    mensagensC2: [
      {
        id: 't1',
        autorId: TERCEIRO,
        texto: PREVIA_DO_TERCEIRO,
        enviadaEm: ENVIADA_EM,
      },
    ] as readonly Mensagem[],
    /** O próximo `POST` em `c1` cai a rede antes de chegar. */
    envioCai: false,
    /** Resposta de todo `GET` de `c1` enquanto não for `null`. */
    falhaDoPolling: null as RespostaFalsa | null,
    proximo: 2,
  };
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
      return { status: 401, corpo: { erro: 'credenciais_invalidas' } };
    })
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /busca', pagina([]))
    .responder('GET /perfis/eu', (r) => {
      if (daAutora(r)) return { corpo: PERFIL_SALVO };
      if (doFreelancer(r)) return { corpo: PERFIL_DO_FREELANCER };
      return SESSAO_EXPIRADA;
    })
    .responder(`GET /perfis/${AUTORA}`, {
      corpo: perfilPublico(AUTORA, NOME),
    })
    .responder(`GET /perfis/${FREELANCER}`, {
      corpo: perfilPublico(FREELANCER, NOME_DO_FREELANCER),
    })
    .responder(`GET /perfis/${TERCEIRO}`, {
      corpo: perfilPublico(TERCEIRO, NOME_DO_TERCEIRO),
    })
    .responder('GET /conversas', (r) => {
      if (daAutora(r)) {
        return {
          corpo: [
            resumoDaConversa('c1', FREELANCER, estado.mensagensC1),
            resumoDaConversa('c2', TERCEIRO, estado.mensagensC2),
          ],
        };
      }
      if (doFreelancer(r)) {
        return { corpo: [resumoDaConversa('c1', AUTORA, estado.mensagensC1)] };
      }
      return SESSAO_EXPIRADA;
    })
    .responder('POST /conversas', (r) => {
      const { outroUsuarioId } = r.corpo as { outroUsuarioId?: string };
      if (daAutora(r) && outroUsuarioId === AUTORA) {
        return conflito('conversa_consigo_mesmo');
      }
      if (
        (daAutora(r) && outroUsuarioId === FREELANCER) ||
        (doFreelancer(r) && outroUsuarioId === AUTORA)
      ) {
        return { corpo: { conversaId: 'c1' } };
      }
      return { status: 403, corpo: { erro: 'sem_vinculo' } };
    })
    .responder('GET /conversas/c1/mensagens', (r) =>
      estado.falhaDoPolling === null
        ? paginaDeMensagens(estado.mensagensC1, r)
        : estado.falhaDoPolling,
    )
    .responder('POST /conversas/c1/mensagens', (r) => {
      if (estado.envioCai) {
        estado.envioCai = false;
        return { falhaDeRede: true };
      }
      const nova: Mensagem = {
        id: `m${estado.proximo}`,
        autorId: daAutora(r) ? AUTORA : FREELANCER,
        texto: (r.corpo as { texto: string }).texto,
        enviadaEm: ENVIADA_EM,
      };
      estado.proximo += 1;
      estado.mensagensC1.push(nova);
      return {
        status: 201,
        corpo: { id: nova.id, enviadaEm: nova.enviadaEm },
      };
    })
    .responder('GET /conversas/c2/mensagens', (r) =>
      paginaDeMensagens(estado.mensagensC2, r),
    )
    .responder('POST /conversas/c2/mensagens', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    })
    // A lista "meus serviços" falha: o botão aparece até no serviço da
    // própria autora, e a API decide (409).
    .responder('GET /servicos/meus', {
      status: 500,
      corpo: { erro: 'erro_interno' },
    })
    .responder('GET /servicos/s-estranho', {
      corpo: servicoDe('s-estranho', ESTRANHO),
    })
    .responder('GET /servicos/s-meu', { corpo: servicoDe('s-meu', AUTORA) })
    .responder('GET /servicos/s-freela', {
      corpo: servicoDe('s-freela', FREELANCER),
    });
  return { api, estado };
}

/** Avança os timers falsos (polling) e deixa terminar o que a volta disparou. */
async function avancar(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(20);
  });
}

interface Fibra {
  readonly key: string | null;
  readonly child: Fibra | null;
  readonly sibling: Fibra | null;
  readonly return: Fibra | null;
}

/** Todas as chaves (`key`) da árvore do React, a partir de um elemento. */
function chavesDaArvore(elemento: object): string[] {
  let raiz = (elemento as { unstable_fiber?: Fibra }).unstable_fiber ?? null;
  while (raiz?.return) {
    raiz = raiz.return;
  }
  const chaves: string[] = [];
  const pilha: Fibra[] = raiz === null ? [] : [raiz];
  while (pilha.length > 0) {
    const fibra = pilha.pop();
    if (fibra === undefined) break;
    if (typeof fibra.key === 'string') chaves.push(fibra.key);
    if (fibra.child !== null) pilha.push(fibra.child);
    if (fibra.sibling !== null) pilha.push(fibra.sibling);
  }
  return chaves;
}

/** Propriedades que levam os textos da própria tela (lidos pela pessoa). */
const PROPRIEDADES_DE_TEXTO: ReadonlySet<string> = new Set([
  'accessibilityLabel',
  'accessibilityHint',
  'value',
]);

/**
 * Cada propriedade da árvore (`toJSON()`) que não é texto da tela, como
 * `tipo.propriedade=valor`: `testID`, `nativeID`, estilos, estados etc.
 */
function propriedadesForaDosTextos(arvore: unknown): string[] {
  const achados: string[] = [];
  const visitar = (no: unknown) => {
    if (Array.isArray(no)) {
      for (const filho of no) visitar(filho);
      return;
    }
    if (typeof no !== 'object' || no === null) return;
    const { type, props, children } = no as {
      type?: string;
      props?: Record<string, unknown>;
      children?: unknown;
    };
    for (const [chave, valor] of Object.entries(props ?? {})) {
      if (!PROPRIEDADES_DE_TEXTO.has(chave)) {
        achados.push(`${type}.${chave}=${emJson(valor)}`);
      }
    }
    visitar(children ?? []);
  };
  visitar(arvore);
  return achados;
}

const NADA_FORA_DA_TELA = {
  testID: [],
  propriedades: [],
  dadosDaLista: [],
  chaves: [],
  url: [],
};

/** A propriedade `data` que a `FlatList` repassa ao `ScrollView` da árvore. */
const DADOS_DA_LISTA = /^\w+\.data=/;

/**
 * CA15 fora do `console`: nenhuma sentinela em `testID`, em outra
 * propriedade da árvore (`toJSON()`) que não seja texto da tela, em chave de
 * lista ou na `url` (a rota com os parâmetros). `elemento` é qualquer um da
 * tela (as chaves são lidas da árvore inteira a partir dele).
 *
 * A `FlatList` repassa os itens (`data`) ao `ScrollView`, e eles aparecem no
 * `toJSON()`: lá, só vale sentinela que a própria tela mostra em texto.
 * `sentinelas` restringe a procura (padrão: todas).
 */
function sentinelasForaDaTela(
  url: string,
  elemento: object,
  sentinelas: Readonly<Record<string, string>> = SENTINELAS,
) {
  const procurar = (texto: string) => sentinelasNoTexto(texto, sentinelas);
  const arvore = screen.toJSON();
  const propriedades = propriedadesForaDosTextos(arvore);
  const naTela = new Set(procurar(textosDaArvore(arvore).join('\n')));
  const dados = propriedades.filter((p) => DADOS_DA_LISTA.test(p));
  return {
    testID: procurar(
      propriedades.filter((p) => /\.(testID|nativeID)=/.test(p)).join('\n'),
    ),
    propriedades: procurar(
      propriedades.filter((p) => !DADOS_DA_LISTA.test(p)).join('\n'),
    ),
    dadosDaLista: procurar(dados.join('\n')).filter(
      (nome) => !naTela.has(nome),
    ),
    chaves: procurar(chavesDaArvore(elemento).join('\n')),
    url: procurar(url),
  };
}

/**
 * Guarda todo erro que passa pelos caches de consultas e de mutações (o que
 * a tela traduz e o que o TanStack guarda), para procurar sentinelas nele.
 */
function vigiarErros(queryClient: QueryClient) {
  const erros = new Set<unknown>();
  const pararConsultas = queryClient.getQueryCache().subscribe((evento) => {
    if (evento.query.state.error) erros.add(evento.query.state.error);
  });
  const pararMutacoes = queryClient.getMutationCache().subscribe((evento) => {
    const erro = evento.mutation?.state.error;
    if (erro) erros.add(erro);
  });
  return {
    erros,
    parar: () => {
      pararConsultas();
      pararMutacoes();
    },
  };
}

/** Escapa o texto para usar dentro de uma `RegExp`. */
function literal(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bolha com o texto, de quem for (`quem` no começo do rótulo). */
function rotuloDaBolha(quem: string, texto: string): RegExp {
  return new RegExp(`^${literal(quem)}, .+\\. ${literal(texto)}$`);
}

// --- Jornada do L1: exportação e exclusão da conta (CA24) ---

const EXCLUSAO = 'POST /contas/eu/exclusao';
const EXPORTACAO = 'POST /contas/eu/exportacao';

/** Únicos pedidos que podem levar uma senha, e só no corpo. */
const PEDIDOS_COM_SENHA: ReadonlySet<string> = new Set([
  'POST /sessoes',
  EXCLUSAO,
  EXPORTACAO,
]);

/** Resposta da exportação no formato `trampo-ja.exportacao.v1` (D26). */
const DADOS_EXPORTADOS = {
  formato: 'trampo-ja.exportacao.v1',
  geradoEm: '2026-10-22T12:00:00.000Z',
  conta: {
    id: 'c-excluida',
    email: EMAIL_EXPORTADO,
    criadaEm: '2026-10-01T12:00:00.000Z',
  },
  sessoes: [
    {
      criadaEm: '2026-10-22T11:00:00.000Z',
      expiraEm: '2026-11-21T11:00:00.000Z',
    },
  ],
  perfil: {
    nome: NOME_EXPORTADO,
    cidade: 'Lavras',
    descricao: null,
    habilidades: [],
    atualizadoEm: '2026-10-02T12:00:00.000Z',
  },
  trampos: [
    {
      id: 't-exportado',
      titulo: TITULO_EXPORTADO,
      descricao: DESCRICAO_EXPORTADA,
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 15000,
      prazo: null,
      status: 'aberto',
      criadoEm: '2026-10-03T12:00:00.000Z',
      candidaturasRecebidas: 0,
    },
  ],
  servicos: [],
  candidaturas: [],
  conversas: [
    {
      id: 'v-exportada',
      outroUsuarioId: FREELANCER,
      criadaEm: '2026-10-04T12:00:00.000Z',
      minhasMensagens: [
        {
          id: 'm-exportada',
          texto: TEXTO_EXPORTADO,
          enviadaEm: '2026-10-04T12:05:00.000Z',
        },
      ],
    },
  ],
};

/**
 * API falsa da jornada do L1, com duas contas: a que exporta e se exclui
 * (`TOKEN_DA_CONTA`) e o freelancer, que entra no mesmo aparelho depois. A
 * resposta depende do Bearer e da senha do corpo: a errada dá 403; a certa
 * exporta (200) e, na exclusão, primeiro bate no limite (429) e depois
 * exclui (204). Excluída a conta, o token dela dá 401 em tudo.
 */
function criarApiDoL1() {
  const estado = { excluida: false, exclusoesCertas: 0 };
  const daConta = (r: RequisicaoFeita) =>
    !estado.excluida &&
    r.cabecalhos.authorization === `Bearer ${TOKEN_DA_CONTA}`;
  const doFreelancer = (r: RequisicaoFeita) =>
    r.cabecalhos.authorization === `Bearer ${TOKEN_DO_FREELANCER}`;
  const senhaCerta = (r: RequisicaoFeita) =>
    (r.corpo as { senha?: string }).senha === SENHA_DA_CONTA;
  const SENHA_INCORRETA = { status: 403, corpo: { erro: 'senha_incorreta' } };

  const api = criarFetchFalso()
    .responder('POST /sessoes', (r) => {
      const { email } = r.corpo as { email?: string };
      if (email === EMAIL_DA_CONTA && !estado.excluida) {
        return { corpo: { token: TOKEN_DA_CONTA } };
      }
      if (email === EMAIL_DO_FREELANCER) {
        return { corpo: { token: TOKEN_DO_FREELANCER } };
      }
      return { status: 401, corpo: { erro: 'credenciais_invalidas' } };
    })
    .responder('DELETE /sessoes', { status: 204 })
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /busca', pagina([]))
    .responder('GET /perfis/eu', (r) => {
      if (daConta(r)) return { corpo: PERFIL_SALVO };
      if (doFreelancer(r)) return { corpo: PERFIL_DO_FREELANCER };
      return SESSAO_EXPIRADA;
    })
    .responder(EXPORTACAO, (r) => {
      if (!daConta(r)) return SESSAO_EXPIRADA;
      return senhaCerta(r) ? { corpo: DADOS_EXPORTADOS } : SENHA_INCORRETA;
    })
    .responder(EXCLUSAO, (r) => {
      if (!daConta(r)) return SESSAO_EXPIRADA;
      if (!senhaCerta(r)) return SENHA_INCORRETA;
      estado.exclusoesCertas += 1;
      if (estado.exclusoesCertas === 1) {
        return { status: 429, corpo: { erro: 'muitas_requisicoes' } };
      }
      estado.excluida = true;
      return { status: 204 };
    });
  return { api, estado };
}

/**
 * `sentinelas` no estado guardado pelos caches do TanStack: chave e estado
 * de cada consulta (`consultas`) e `variables`, `data`, `error` e o contexto
 * de cada mutação (`mutacoes`).
 */
function sentinelasNosCaches(
  queryClient: QueryClient,
  sentinelas: Readonly<Record<string, string>>,
): { consultas: string[]; mutacoes: string[] } {
  return {
    consultas: sentinelasNoTexto(
      emJson(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => [q.queryKey, q.state]),
      ),
      sentinelas,
    ),
    mutacoes: sentinelasNoTexto(
      emJson(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state),
      ),
      sentinelas,
    ),
  };
}

/** Sentinelas restritas do L1 em qualquer um dos caches do TanStack. */
function restritasNosCaches(queryClient: QueryClient): string[] {
  const { consultas, mutacoes } = sentinelasNosCaches(
    queryClient,
    SENTINELAS_RESTRITAS_DO_L1,
  );
  return [...new Set([...consultas, ...mutacoes])];
}

// --- Jornada da L2: editar trampo e serviço (CA35) ---

const TRAMPO_DA_EDICAO = 't-edicao';
const SERVICO_DA_EDICAO = 's-edicao';
const TITULO_BASE_DO_TRAMPO = 'Consertar o portao da garagem';
const TITULO_BASE_DO_SERVICO = 'Aulas de violao em casa';

/** O que o `PUT` faz em cada tentativa, na ordem. */
type PassoDoPut = 'limite' | 'conflito' | 'salva';

interface AnuncioDoServidor {
  titulo: string;
  descricao: string;
  versao: number;
}

/**
 * `PUT` do anúncio guardado no servidor falso, seguindo o `roteiro`. O
 * conflito simula a edição feita em outro aparelho (a versão sobe); o
 * "salva" confere a versão, grava o corpo e sobe a versão, como a API.
 */
function responderAoPut(
  anuncio: AnuncioDoServidor,
  roteiro: PassoDoPut[],
): (requisicao: RequisicaoFeita) => RespostaFalsa {
  return (requisicao) => {
    const passo = roteiro.shift() ?? 'salva';
    const corpo = requisicao.corpo as AnuncioDoServidor;
    if (passo === 'limite') {
      return { status: 429, corpo: { erro: 'muitas_tentativas' } };
    }
    if (passo === 'conflito') {
      // Outra edição, salva em outro aparelho.
      anuncio.versao += 1;
    }
    if (passo === 'conflito' || corpo.versao !== anuncio.versao) {
      return { status: 409, corpo: { erro: 'conflito_de_versao' } };
    }
    anuncio.titulo = corpo.titulo;
    anuncio.descricao = corpo.descricao;
    anuncio.versao += 1;
    return { status: 204 };
  };
}

/**
 * API falsa da edição: um trampo e um serviço da autora, lidos na visão do
 * autor (com `versao` e a contagem). O trampo leva 429, 409 e salva; o
 * serviço, 409, 429 e salva.
 */
function criarApiDaEdicao() {
  const trampo = {
    id: TRAMPO_DA_EDICAO,
    autorId: AUTORA,
    titulo: TITULO_BASE_DO_TRAMPO,
    descricao: 'Trocar a dobradica e pintar o portao.',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 20000,
    prazo: null,
    status: 'aberto',
    criadoEm: '2026-10-22T12:00:00.000Z',
    versao: 5,
    candidaturasRecebidas: 0,
  };
  const servico = {
    id: SERVICO_DA_EDICAO,
    autorId: AUTORA,
    titulo: TITULO_BASE_DO_SERVICO,
    descricao: 'Aulas para iniciantes, com o violao da casa.',
    categoria: 'reformas',
    cidade: null,
    precoBaseCentavos: 9000,
    status: 'ativo',
    criadoEm: '2026-10-22T12:00:00.000Z',
    versao: 2,
  };
  const api = criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_SALVO })
    .responder('GET /trampos/meus', () => ({ corpo: [{ ...trampo }] }))
    .responder('GET /servicos/meus', () => ({ corpo: [{ ...servico }] }))
    .responder('GET /candidaturas/minhas', { corpo: [] })
    .responder(`GET /perfis/${AUTORA}`, {
      corpo: perfilPublico(AUTORA, NOME),
    })
    .responder(`GET /trampos/${TRAMPO_DA_EDICAO}`, () => ({
      corpo: { ...trampo },
    }))
    .responder(`GET /trampos/${TRAMPO_DA_EDICAO}/candidaturas`, { corpo: [] })
    .responder(`GET /servicos/${SERVICO_DA_EDICAO}`, () => ({
      corpo: { ...servico },
    }))
    .responder(
      `PUT /trampos/${TRAMPO_DA_EDICAO}`,
      responderAoPut(trampo, ['limite', 'conflito', 'salva']),
    )
    .responder(
      `PUT /servicos/${SERVICO_DA_EDICAO}`,
      responderAoPut(servico, ['conflito', 'limite', 'salva']),
    );
  return { api, trampo, servico };
}

/** Únicos pedidos que podem levar o rascunho da edição, e só no corpo. */
const PEDIDOS_COM_RASCUNHO: ReadonlySet<string> = new Set([
  `PUT /trampos/${TRAMPO_DA_EDICAO}`,
  `PUT /servicos/${SERVICO_DA_EDICAO}`,
]);

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
    // A sessão que expirou era do freelancer: a rota de retorno não vale
    // para outra conta, e a autora cai no Início (CA50).
    await waitFor(() => expect(getPathname()).toBe('/'));
    expect(armazenamento.atual()).toBe(TOKEN_DA_AUTORA);

    // C2. Meus trampos -> detalhe -> Candidaturas recebidas com os nomes.
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

  it('2c: lista, abrir (200, 403 e 409), enviar (201, queda de rede e 404) e polling com 500 e 401, com duas contas', async () => {
    const { api, estado } = criarApiDa2c();
    const queryClient = criarQueryClientDeTeste();
    const vigia = vigiarErros(queryClient);
    const rotas = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/',
      fetch: api,
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DA_AUTORA),
      queryClient,
    });
    const { armazenamento, getPathname } = rotas;
    const nadaForaDaTela = (elemento: object) =>
      expect(
        sentinelasForaDaTela(rotas.getPathnameWithParams(), elemento),
      ).toEqual(NADA_FORA_DA_TELA);
    const enviar = () =>
      fireEvent.press(
        screen.getByRole('button', { name: textos.conversas.enviar }),
      );

    // A1. Autora: aba Conversas com o nome e a prévia de cada conversa.
    expect(await screen.findByText(`Olá, ${NOME}`)).toBeOnTheScreen();
    await fireEvent.press(ultimoBotao(textos.abas.conversas));
    await waitFor(() => expect(getPathname()).toBe('/conversas'));
    const comFreelancer = await screen.findByRole('button', {
      name: linhaDaListaDa2c(NOME_DO_FREELANCER, TEXTO_RECEBIDO),
    });
    await screen.findByRole('button', {
      name: linhaDaListaDa2c(NOME_DO_TERCEIRO, PREVIA_DO_TERCEIRO),
    });
    expect(screen.getByText(TEXTO_RECEBIDO)).toBeOnTheScreen();
    expect(screen.getByText(PREVIA_DO_TERCEIRO)).toBeOnTheScreen();
    nadaForaDaTela(comFreelancer);

    // A2. Abre a conversa (200): a mensagem recebida com o nome do outro.
    await fireEvent.press(comFreelancer);
    await waitFor(() => expect(getPathname()).toBe('/conversas/c1'));
    nadaForaDaTela(
      await screen.findByLabelText(
        rotuloDaBolha(NOME_DO_FREELANCER, TEXTO_RECEBIDO),
      ),
    );

    // A3. Envia (201): o GET seguinte traz a mensagem, numa bolha só.
    await digitar(textos.conversas.campo, TEXTO_ENVIADO);
    await enviar();
    await waitFor(() => expect(estado.mensagensC1).toHaveLength(2));
    await avancar(INTERVALO_DO_POLLING_MS);
    const enviada = screen.getAllByLabelText(
      rotuloDaBolha('Você', TEXTO_ENVIADO),
    );
    expect(enviada).toHaveLength(1);
    nadaForaDaTela(enviada[0] as object);

    // A4. Queda de rede no envio: "Não enviada"; o toque faz o GET e o POST.
    estado.envioCai = true;
    await digitar(textos.conversas.campo, TEXTO_QUE_CAIU);
    await enviar();
    const naoEnviada = await screen.findByRole('button', {
      name: new RegExp(
        `${textos.conversas.rotuloNaoEnviada}\\. ${literal(TEXTO_QUE_CAIU)}$`,
      ),
    });
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
    nadaForaDaTela(naoEnviada);
    await fireEvent.press(naoEnviada);
    await waitFor(() => expect(estado.mensagensC1).toHaveLength(3));
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    expect(
      screen.getAllByLabelText(rotuloDaBolha('Você', TEXTO_QUE_CAIU)),
    ).toHaveLength(1);

    // A5. Polling com 500: o aviso na 3ª falha seguida (5 s, 10 s e 20 s),
    // sem esconder as mensagens; some quando a API volta.
    estado.falhaDoPolling = { status: 500, corpo: { erro: 'erro_interno' } };
    await avancar(5_000);
    await avancar(10_000);
    await avancar(20_000);
    const avisoDoPolling = screen.getByText(
      textos.conversas.atualizacaoFalhando,
    );
    expect(
      screen.getAllByLabelText(rotuloDaBolha('Você', TEXTO_ENVIADO)),
    ).toHaveLength(1);
    nadaForaDaTela(avisoDoPolling);
    estado.falhaDoPolling = null;
    await avancar(60_000);
    expect(screen.queryByText(textos.conversas.atualizacaoFalhando)).toBeNull();

    // A6. Conversa com o terceiro: o envio dá 404 e a tela vira aviso.
    await fireEvent.press(ultimoBotao(textos.gerais.voltar));
    await waitFor(() => expect(getPathname()).toBe('/conversas'));
    await fireEvent.press(
      await screen.findByRole('button', {
        name: linhaDaListaDa2c(NOME_DO_TERCEIRO, PREVIA_DO_TERCEIRO),
      }),
    );
    await waitFor(() => expect(getPathname()).toBe('/conversas/c2'));
    await screen.findByLabelText(
      rotuloDaBolha(NOME_DO_TERCEIRO, PREVIA_DO_TERCEIRO),
    );
    await digitar(textos.conversas.campo, TEXTO_DA_CONVERSA_SUMIDA);
    await enviar();
    nadaForaDaTela(
      await screen.findByText(textos.conversas.indisponivelTitulo),
    );
    await fireEvent.press(ultimoBotao(textos.gerais.voltar));
    await waitFor(() => expect(getPathname()).toBe('/conversas'));

    // A7. "Conversar" no detalhe do serviço: 403 sem vínculo e 409 consigo
    // mesma desabilitam o botão com o texto; com o freelancer, 200.
    const recusas = [
      ['s-estranho', textos.erros.sem_vinculo],
      ['s-meu', textos.erros.conversa_consigo_mesmo],
    ] as const;
    for (const [servico, texto] of recusas) {
      await act(async () => {
        router.push({ pathname: '/servicos/[id]', params: { id: servico } });
      });
      await waitFor(() => expect(getPathname()).toBe(`/servicos/${servico}`));
      await fireEvent.press(
        await screen.findByRole('button', {
          name: textos.detalheServico.conversar,
        }),
      );
      const recusa = await screen.findByText(texto);
      expect(
        screen.getByRole('button', { name: textos.detalheServico.conversar }),
      ).toBeDisabled();
      nadaForaDaTela(recusa);
      await fireEvent.press(ultimoBotao(textos.gerais.voltar));
      await waitFor(() => expect(getPathname()).toBe('/conversas'));
    }
    await act(async () => {
      router.push({ pathname: '/servicos/[id]', params: { id: 's-freela' } });
    });
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheServico.conversar,
      }),
    );
    await waitFor(() => expect(getPathname()).toBe('/conversas/c1'));
    nadaForaDaTela(
      await screen.findByLabelText(rotuloDaBolha('Você', TEXTO_QUE_CAIU)),
    );

    // A8. Polling com 401: a sessão sai e a tela vai ao login (CA14).
    estado.falhaDoPolling = SESSAO_EXPIRADA;
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    await waitFor(() => expect(getPathname()).toBe('/entrar'));
    expect(armazenamento.atual()).toBeNull();
    estado.falhaDoPolling = null;
    nadaForaDaTela(screen.getByText(textos.erros.sessao_expirada));

    // B1. O freelancer entra no mesmo aparelho. A rota de antes era da
    // autora, então ele cai no Início (CA50) e abre a conversa pela aba: do
    // lado dele, as mensagens da autora com o nome dela.
    await preencherAcesso(EMAIL_DO_FREELANCER, SENHA_DO_FREELANCER);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );
    await waitFor(() => expect(getPathname()).toBe('/'));
    expect(armazenamento.atual()).toBe(TOKEN_DO_FREELANCER);
    await fireEvent.press(ultimoBotao(textos.abas.conversas));
    await waitFor(() => expect(getPathname()).toBe('/conversas'));
    await fireEvent.press(
      await screen.findByRole('button', {
        name: linhaDaListaDa2c(NOME, TEXTO_QUE_CAIU),
      }),
    );
    await waitFor(() => expect(getPathname()).toBe('/conversas/c1'));
    const daAutora = await screen.findByLabelText(
      rotuloDaBolha(NOME, TEXTO_ENVIADO),
    );
    expect(
      screen.getByLabelText(rotuloDaBolha(NOME, TEXTO_QUE_CAIU)),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(rotuloDaBolha('Você', TEXTO_RECEBIDO)),
    ).toBeOnTheScreen();
    nadaForaDaTela(daAutora);

    // B2. A lista do freelancer: o nome da autora e a prévia da última.
    await fireEvent.press(ultimoBotao(textos.gerais.voltar));
    await waitFor(() => expect(getPathname()).toBe('/conversas'));
    const comAutora = await screen.findByRole('button', {
      name: linhaDaListaDa2c(NOME, TEXTO_QUE_CAIU),
    });
    expect(await screen.findByText(TEXTO_QUE_CAIU)).toBeOnTheScreen();
    nadaForaDaTela(comAutora);

    // O texto vai só no corpo do POST; o `outroUsuarioId`, só no da abertura.
    expect(corpos(api, 'POST /conversas/c1/mensagens')).toEqual([
      { texto: TEXTO_ENVIADO },
      { texto: TEXTO_QUE_CAIU },
      { texto: TEXTO_QUE_CAIU },
    ]);
    expect(corpos(api, 'POST /conversas/c2/mensagens')).toEqual([
      { texto: TEXTO_DA_CONVERSA_SUMIDA },
    ]);
    expect(corpos(api, 'POST /conversas')).toEqual([
      { outroUsuarioId: ESTRANHO },
      { outroUsuarioId: AUTORA },
      { outroUsuarioId: FREELANCER },
    ]);
    expect(
      sentinelasNoTexto(api.requisicoes.map((r) => r.url).join('\n')),
    ).toEqual([]);

    // Nenhum erro guardado pelas consultas e mutações traz sentinela.
    vigia.parar();
    const erros = [...vigia.erros];
    expect(erros.length).toBeGreaterThan(0);
    expect(
      sentinelasNoTexto(
        erros.flatMap((erro) => [emTexto(erro), emJson(erro)]).join('\n'),
      ),
    ).toEqual([]);

    // Todo pedido autenticado levou o Bearer da conta da vez (CA14).
    const entradaDoFreelancer = api.requisicoes.findIndex(
      (r) => `${r.metodo} ${r.caminho}` === 'POST /sessoes',
    );
    expect(entradaDoFreelancer).toBeGreaterThan(0);
    api.requisicoes.forEach((requisicao, indice) => {
      if (ehRotaPublica(requisicao)) return;
      const esperado =
        indice < entradaDoFreelancer ? TOKEN_DA_AUTORA : TOKEN_DO_FREELANCER;
      expect([indice, requisicao.cabecalhos.authorization]).toEqual([
        indice,
        `Bearer ${esperado}`,
      ]);
    });
  }, 60_000);

  it('L1: exportar (403 e 200) e excluir a conta (403, 429 e 204) com a senha, o JSON só no arquivo e outra conta depois (CA24)', async () => {
    const { api, estado } = criarApiDoL1();
    const arquivos: string[] = [];
    compartilhar.mockImplementation(async (dados) => {
      // O que `compartilharExportacao` gravaria no arquivo temporário.
      arquivos.push(JSON.stringify(dados));
      return 'compartilhado';
    });
    const queryClient = criarQueryClientDeTeste();
    const vigia = vigiarErros(queryClient);
    const rotas = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/entrar',
      fetch: api,
      queryClient,
    });
    const { armazenamento, getPathname } = rotas;
    const tConta = textos.contaEPrivacidade;
    const tExcluir = textos.excluirConta;
    const tExportar = textos.exportarDados;
    /**
     * CA24 a cada passo: nada restrito (senhas, e-mail do login, token e
     * JSON) fora do texto da tela (`testID`, outras propriedades, chaves,
     * URL); o JSON em nenhum lugar da árvore, nem no texto; e nada restrito
     * nos caches de consultas e de mutações. O perfil da conta (nome,
     * habilidade) aparece na tela e nas chaves da aba Perfil de propósito.
     */
    const conferir = (elemento: object) =>
      expect({
        foraDaTela: sentinelasForaDaTela(
          rotas.getPathnameWithParams(),
          elemento,
          SENTINELAS_RESTRITAS_DO_L1,
        ),
        jsonNaArvore: sentinelasNoTexto(
          emJson(screen.toJSON()),
          SENTINELAS_DO_JSON,
        ),
        caches: restritasNosCaches(queryClient),
      }).toEqual({
        foraDaTela: NADA_FORA_DA_TELA,
        jsonNaArvore: [],
        caches: [],
      });
    const linhaDaConta = (titulo: string) =>
      screen.findByRole('button', { name: new RegExp(`^${literal(titulo)}`) });
    const digitarSenha = async (rotulo: string, senha: string) =>
      fireEvent.changeText(await screen.findByLabelText(rotulo), senha);
    const gerar = async () => {
      await fireEvent.press(
        screen.getByRole('button', { name: tExportar.gerar }),
      );
      await avancar(50);
    };
    const excluir = async () => {
      await fireEvent.press(
        screen.getByRole('button', { name: tExcluir.excluir }),
      );
      await fireEvent.press(
        screen.getByRole('button', { name: tExcluir.dialogoConfirmar }),
      );
      await avancar(50);
    };

    // A1. A conta entra (a senha vai no corpo do login) e abre Conta e
    // privacidade pelo Perfil.
    await preencherAcesso(EMAIL_DA_CONTA, SENHA_DA_CONTA);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );
    await waitFor(() => expect(getPathname()).toBe('/'));
    expect(armazenamento.atual()).toBe(TOKEN_DA_CONTA);
    conferir(await screen.findByText(`Olá, ${NOME}`));
    await fireEvent.press(ultimoBotao(textos.abas.perfil));
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.perfil.contaEPrivacidade,
      }),
    );
    await waitFor(() => expect(getPathname()).toBe('/perfil/conta'));

    // A2. Exportar com a senha errada (403): o aviso, nada compartilhado.
    await fireEvent.press(await linhaDaConta(tConta.exportar));
    await waitFor(() => expect(getPathname()).toBe('/perfil/exportar'));
    await digitarSenha(tExportar.senha, SENHA_ERRADA_DA_CONTA);
    await gerar();
    conferir(await screen.findByText(textos.erros.senha_incorreta));
    expect(compartilhar).not.toHaveBeenCalled();

    // A3. Exportar com a senha certa (200): o JSON vai inteiro para o
    // arquivo e a tela só diz que gerou.
    await digitarSenha(tExportar.senha, SENHA_DA_CONTA);
    await gerar();
    conferir(await screen.findByText(tExportar.gerado));
    expect(compartilhar).toHaveBeenCalledTimes(1);
    expect(arquivos).toEqual([JSON.stringify(DADOS_EXPORTADOS)]);
    expect(
      sentinelasNoTexto(arquivos.join('\n'), SENTINELAS_DO_JSON).sort(),
    ).toEqual(Object.keys(SENTINELAS_DO_JSON).sort());

    // A4. Excluir com a senha errada (403): o aviso, a sessão continua.
    await fireEvent.press(ultimoBotao(tExportar.voltar));
    await waitFor(() => expect(getPathname()).toBe('/perfil/conta'));
    await fireEvent.press(await linhaDaConta(tConta.excluir));
    await waitFor(() => expect(getPathname()).toBe('/perfil/excluir'));
    await digitarSenha(tExcluir.senha, SENHA_ERRADA_DA_CONTA);
    await excluir();
    conferir(await screen.findByText(textos.erros.senha_incorreta));
    expect(armazenamento.atual()).toBe(TOKEN_DA_CONTA);

    // A5. Senha certa, mas no limite (429): o aviso de ações; a senha fica
    // só no campo.
    await digitarSenha(tExcluir.senha, SENHA_DA_CONTA);
    await excluir();
    conferir(await screen.findByText(textos.erros.muitas_tentativas_acao));
    expect(screen.getByLabelText(tExcluir.senha)).toHaveDisplayValue(
      SENHA_DA_CONTA,
    );
    expect(armazenamento.atual()).toBe(TOKEN_DA_CONTA);

    // A6. De novo (204): login com "Sua conta foi excluída.", token e
    // caches vazios, sem `DELETE /sessoes`.
    await excluir();
    const avisoDeExcluida = await screen.findByText(
      textos.erros.conta_excluida,
    );
    await waitFor(() => expect(getPathname()).toBe('/entrar'));
    expect(estado.excluida).toBe(true);
    expect(armazenamento.atual()).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    conferir(avisoDeExcluida);
    const indiceDaExclusao = api.requisicoes.length - 1;

    // B1. Outra conta entra no mesmo aparelho: só os dados dela.
    await preencherAcesso(EMAIL_DO_FREELANCER, SENHA_DO_FREELANCER);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.entrar }),
    );
    await waitFor(() => expect(getPathname()).toBe('/'));
    expect(armazenamento.atual()).toBe(TOKEN_DO_FREELANCER);
    conferir(await screen.findByText(`Olá, ${NOME_DO_FREELANCER}`));

    // A senha vai só no corpo do login e dos POST de `/contas/eu/*`; o JSON
    // e o e-mail exportado não vão em pedido nenhum.
    const rotasFeitas = api.requisicoes.map((r) => `${r.metodo} ${r.caminho}`);
    expect(corpos(api, EXPORTACAO)).toEqual([
      { senha: SENHA_ERRADA_DA_CONTA },
      { senha: SENHA_DA_CONTA },
    ]);
    expect(corpos(api, EXCLUSAO)).toEqual([
      { senha: SENHA_ERRADA_DA_CONTA },
      { senha: SENHA_DA_CONTA },
      { senha: SENHA_DA_CONTA },
    ]);
    expect(corpos(api, 'POST /sessoes')).toEqual([
      { email: EMAIL_DA_CONTA, senha: SENHA_DA_CONTA },
      { email: EMAIL_DO_FREELANCER, senha: SENHA_DO_FREELANCER },
    ]);
    expect(rotasFeitas).not.toContain('DELETE /sessoes');
    expect(rotasFeitas[indiceDaExclusao]).toBe(EXCLUSAO);
    api.requisicoes.forEach((requisicao, indice) => {
      const rota = `${requisicao.metodo} ${requisicao.caminho}`;
      expect({
        indice,
        rota,
        senhaNoCorpo: PEDIDOS_COM_SENHA.has(rota)
          ? []
          : sentinelasNoTexto(emJson(requisicao.corpo), SENHAS_DO_L1),
        jsonNoCorpo: sentinelasNoTexto(
          emJson(requisicao.corpo),
          SENTINELAS_DO_JSON,
        ),
        naUrl: sentinelasNoTexto(requisicao.url, SENTINELAS_RESTRITAS_DO_L1),
        nosCabecalhos: sentinelasNoTexto(emJson(requisicao.cabecalhos), {
          ...SENHAS_DO_L1,
          ...SENTINELAS_DO_JSON,
        }),
      }).toEqual({
        indice,
        rota,
        senhaNoCorpo: [],
        jsonNoCorpo: [],
        naUrl: [],
        nosCabecalhos: [],
      });
    });

    // Nenhum erro guardado pelas consultas e mutações traz sentinela.
    vigia.parar();
    const erros = [...vigia.erros];
    expect(erros.length).toBeGreaterThanOrEqual(3);
    expect(
      sentinelasNoTexto(
        erros.flatMap((erro) => [emTexto(erro), emJson(erro)]).join('\n'),
      ),
    ).toEqual([]);

    // Todo pedido autenticado levou o Bearer da conta da vez (CA14); entre
    // a exclusão e o novo login, nenhum.
    const entradaDoFreelancer = rotasFeitas.lastIndexOf('POST /sessoes');
    expect(entradaDoFreelancer).toBeGreaterThan(indiceDaExclusao);
    api.requisicoes.forEach((requisicao, indice) => {
      if (ehRotaPublica(requisicao)) return;
      expect(indice > indiceDaExclusao && indice < entradaDoFreelancer).toBe(
        false,
      );
      const esperado =
        indice <= indiceDaExclusao ? TOKEN_DA_CONTA : TOKEN_DO_FREELANCER;
      expect([indice, requisicao.cabecalhos.authorization]).toEqual([
        indice,
        `Bearer ${esperado}`,
      ]);
    });
  }, 60_000);
  it('L2: editar trampo e serviço (429, 409 com "Ver versão atual" e 204) com o rascunho sentinela, e o aviso de retorno só com a chave (CA35)', async () => {
    const { api, trampo, servico } = criarApiDaEdicao();
    const queryClient = criarQueryClientDeTeste();
    const vigia = vigiarErros(queryClient);
    esquecerAvisoDeRetorno();
    avisar.mockClear();
    const rotas = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: `/trampos/${TRAMPO_DA_EDICAO}`,
      fetch: api,
      queryClient,
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DA_AUTORA),
    });
    const { getPathname } = rotas;
    const a = textos.anuncio;
    /** A URL, os parâmetros e o estado inteiro do navegador. */
    const naRota = () =>
      sentinelasNoTexto(
        emJson([
          rotas.getPathnameWithParams(),
          rotas.getSearchParams(),
          rotas.getRouterState(),
        ]),
        SENTINELAS_DA_EDICAO,
      );
    /** Sentinelas que já foram salvas: o anúncio lido as traz de volta. */
    const salvas = new Set<string>();
    /**
     * Na edição, a cada resposta: o rascunho só no `value` dos campos (texto
     * da tela), nada na rota nem no cache de consultas (só o que já foi
     * salvo, que é o anúncio lido).
     */
    const conferirNaEdicao = (elemento: object) =>
      expect({
        foraDaTela: sentinelasForaDaTela(
          rotas.getPathnameWithParams(),
          elemento,
          SENTINELAS_DA_EDICAO,
        ),
        rota: naRota(),
        consultas: sentinelasNosCaches(
          queryClient,
          SENTINELAS_DA_EDICAO,
        ).consultas.filter((nome) => !salvas.has(nome)),
      }).toEqual({ foraDaTela: NADA_FORA_DA_TELA, rota: [], consultas: [] });
    /**
     * Fora da edição (CA35): nada do que passou pelo rascunho no cache de
     * mutações, na rota ou fora do texto da tela. O que foi salvo é o
     * anúncio, que o detalhe lê e mostra; o rascunho que não foi salvo não
     * fica em lugar nenhum, nem na árvore, nem nas consultas.
     */
    const conferirForaDaEdicao = (elemento: object) => {
      const caches = sentinelasNosCaches(queryClient, SENTINELAS_DA_EDICAO);
      expect({
        foraDaTela: sentinelasForaDaTela(
          rotas.getPathnameWithParams(),
          elemento,
          SENTINELAS_DA_EDICAO,
        ),
        rota: naRota(),
        mutacoes: caches.mutacoes,
        rascunhoNasConsultas: caches.consultas.filter(
          (nome) => nome in SENTINELAS_NAO_SALVAS_DA_L2,
        ),
        rascunhoNaArvore: sentinelasNoTexto(
          emJson(screen.toJSON()),
          SENTINELAS_NAO_SALVAS_DA_L2,
        ),
      }).toEqual({
        foraDaTela: NADA_FORA_DA_TELA,
        rota: [],
        mutacoes: [],
        rascunhoNasConsultas: [],
        rascunhoNaArvore: [],
      });
    };
    const editarPeloDetalhe = async (titulo: string, caminho: string) => {
      await fireEvent.press(
        await screen.findByRole('button', { name: a.maisOpcoes(titulo) }),
      );
      await fireEvent.press(
        await screen.findByRole('button', { name: a.editar }),
      );
      await waitFor(() => expect(getPathname()).toBe(caminho));
      await screen.findByDisplayValue(titulo);
    };
    const salvarAlteracoes = async () => {
      await fireEvent.press(
        screen.getByRole('button', { name: a.salvarAlteracoes }),
      );
      await avancar(50);
    };
    /** Volta ao detalhe com "Alterações salvas." e deixa a edição sair. */
    const voltarSalvo = async (caminho: string) => {
      await waitFor(() => expect(getPathname()).toBe(caminho));
      expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();
      await fireEvent.press(
        screen.getByRole('button', { name: textos.gerais.toastFechar }),
      );
      await avancar(50);
    };

    // A1. Detalhe do trampo da autora -> "Mais opções" -> Editar.
    await editarPeloDetalhe(
      TITULO_BASE_DO_TRAMPO,
      `/trampos/editar/${TRAMPO_DA_EDICAO}`,
    );

    // A2. Título e o rascunho da descrição; 429: o aviso de limite, e o
    // rascunho fica nos campos.
    await digitar(T.titulo, TITULO_EDITADO);
    await digitar(T.descricao, RASCUNHO_DO_TRAMPO);
    await salvarAlteracoes();
    conferirNaEdicao(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    );
    expect(screen.getByLabelText(T.descricao)).toHaveDisplayValue(
      RASCUNHO_DO_TRAMPO,
    );

    // A3. Outra descrição; 409 (salvo em outro aparelho): o aviso de
    // conflito.
    await digitar(T.descricao, DESCRICAO_EDITADA);
    await salvarAlteracoes();
    conferirNaEdicao(await screen.findByText(a.conflito));

    // A4. "Ver versão atual": a base nova, e o que a autora mexeu fica.
    await fireEvent.press(
      screen.getByRole('button', { name: a.verVersaoAtual }),
    );
    await waitFor(() => expect(screen.queryByText(a.conflito)).toBeNull());
    expect(screen.getByLabelText(T.titulo)).toHaveDisplayValue(TITULO_EDITADO);
    conferirNaEdicao(screen.getByLabelText(T.descricao));

    // A5. Salva (204): o detalhe mostra o trampo novo e "Alterações salvas.".
    await salvarAlteracoes();
    await voltarSalvo(`/trampos/${TRAMPO_DA_EDICAO}`);
    conferirForaDaEdicao(await screen.findByText(TITULO_EDITADO));
    salvas.add('título editado do trampo').add('descrição editada do trampo');

    // B1. Serviço da autora: detalhe -> "Mais opções" -> Editar.
    await act(async () => {
      router.push(`/servicos/${SERVICO_DA_EDICAO}`);
    });
    await editarPeloDetalhe(
      TITULO_BASE_DO_SERVICO,
      `/servicos/editar/${SERVICO_DA_EDICAO}`,
    );

    // B2. Título e o rascunho da descrição; 409 e "Ver versão atual".
    await digitar(T.titulo, TITULO_DO_SERVICO_EDITADO);
    await digitar(T.descricao, RASCUNHO_DO_SERVICO);
    await salvarAlteracoes();
    conferirNaEdicao(await screen.findByText(a.conflito));
    await fireEvent.press(
      screen.getByRole('button', { name: a.verVersaoAtual }),
    );
    await waitFor(() => expect(screen.queryByText(a.conflito)).toBeNull());
    conferirNaEdicao(screen.getByLabelText(T.descricao));

    // B3. Outra descrição; 429.
    await digitar(T.descricao, DESCRICAO_DO_SERVICO_EDITADA);
    await salvarAlteracoes();
    conferirNaEdicao(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    );

    // B4. Salva (204): o detalhe do serviço com "Alterações salvas.".
    await salvarAlteracoes();
    await voltarSalvo(`/servicos/${SERVICO_DA_EDICAO}`);
    conferirForaDaEdicao(await screen.findByText(TITULO_DO_SERVICO_EDITADO));

    // O servidor guardou o que foi salvo, com a versão de cada tentativa.
    const textosDoPut = (rota: string) =>
      corpos(api, rota).map((corpo) => {
        const { titulo, descricao, versao } = corpo as AnuncioDoServidor;
        return { titulo, descricao, versao };
      });
    expect(textosDoPut(`PUT /trampos/${TRAMPO_DA_EDICAO}`)).toEqual([
      { titulo: TITULO_EDITADO, descricao: RASCUNHO_DO_TRAMPO, versao: 5 },
      { titulo: TITULO_EDITADO, descricao: DESCRICAO_EDITADA, versao: 5 },
      { titulo: TITULO_EDITADO, descricao: DESCRICAO_EDITADA, versao: 6 },
    ]);
    expect(textosDoPut(`PUT /servicos/${SERVICO_DA_EDICAO}`)).toEqual([
      {
        titulo: TITULO_DO_SERVICO_EDITADO,
        descricao: RASCUNHO_DO_SERVICO,
        versao: 2,
      },
      {
        titulo: TITULO_DO_SERVICO_EDITADO,
        descricao: DESCRICAO_DO_SERVICO_EDITADA,
        versao: 3,
      },
      {
        titulo: TITULO_DO_SERVICO_EDITADO,
        descricao: DESCRICAO_DO_SERVICO_EDITADA,
        versao: 3,
      },
    ]);
    expect([trampo.titulo, trampo.descricao, trampo.versao]).toEqual([
      TITULO_EDITADO,
      DESCRICAO_EDITADA,
      7,
    ]);
    expect([servico.titulo, servico.descricao, servico.versao]).toEqual([
      TITULO_DO_SERVICO_EDITADO,
      DESCRICAO_DO_SERVICO_EDITADA,
      4,
    ]);

    // O rascunho vai só no corpo dos `PUT`: nunca na URL nem nos
    // cabeçalhos, nem no corpo de outro pedido.
    api.requisicoes.forEach((requisicao, indice) => {
      const rota = `${requisicao.metodo} ${requisicao.caminho}`;
      expect({
        indice,
        rota,
        noCorpo: PEDIDOS_COM_RASCUNHO.has(rota)
          ? []
          : sentinelasNoTexto(emJson(requisicao.corpo), SENTINELAS_DA_EDICAO),
        naUrl: sentinelasNoTexto(requisicao.url, SENTINELAS_DA_EDICAO),
        nosCabecalhos: sentinelasNoTexto(
          emJson(requisicao.cabecalhos),
          SENTINELAS_DA_EDICAO,
        ),
      }).toEqual({ indice, rota, noCorpo: [], naUrl: [], nosCabecalhos: [] });
    });

    // Nenhum erro guardado (os dois 429 e os dois 409) traz sentinela.
    vigia.parar();
    const erros = [...vigia.erros];
    expect(erros.length).toBeGreaterThanOrEqual(4);
    expect(
      sentinelasNoTexto(
        erros.flatMap((erro) => [emTexto(erro), emJson(erro)]).join('\n'),
      ),
    ).toEqual([]);

    // O aviso de retorno guardou só a chave (e a geração da sessão).
    expect(avisar.mock.calls).toEqual([
      ['alteracoes_salvas', expect.any(Number)],
      ['alteracoes_salvas', expect.any(Number)],
    ]);
    expect(sentinelasNoTexto(emJson(avisar.mock.calls))).toEqual([]);
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

  it('fora do console: pega a sentinela em testID, em propriedade, em chave, na URL e em `data` que a tela não mostra', async () => {
    const itens = [{ chave: TEXTO_RECEBIDO }, { chave: PREVIA_DO_TERCEIRO }];
    await render(
      <View testID={`bolha-${NOME_DO_TERCEIRO}`}>
        <Text accessibilityLabel={TEXTO_ENVIADO}>{PREVIA_DO_TERCEIRO}</Text>
        <FlatList
          data={itens}
          keyExtractor={(item) => item.chave}
          renderItem={() => null}
        />
      </View>,
    );

    expect(
      sentinelasForaDaTela(
        `/conversas/c1?t=${encodeURIComponent(TEXTO_DA_CONVERSA_SUMIDA).replace(/%20/g, '+')}`,
        screen.getByText(PREVIA_DO_TERCEIRO),
      ),
    ).toEqual({
      testID: ['nome do terceiro'],
      propriedades: ['nome do terceiro'],
      // A prévia está na tela em texto; o texto recebido, não.
      dadosDaLista: ['texto recebido'],
      chaves: ['texto recebido', 'prévia do terceiro'],
      url: ['texto da conversa sumida'],
    });
  });

  it('L1: pega a senha em `variables` e o JSON no cache de consultas, e ignora o perfil, que não é restrito', async () => {
    const queryClient = criarQueryClientDeTeste();
    queryClient.setQueryData(['perfil'], PERFIL_SALVO);
    expect(restritasNosCaches(queryClient)).toEqual([]);

    queryClient.setQueryData(['exportacao'], DADOS_EXPORTADOS);
    await queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: () => Promise.reject(new Error('recusada')),
      })
      .execute(SENHA_ERRADA_DA_CONTA)
      .catch(() => undefined);

    expect(restritasNosCaches(queryClient).sort()).toEqual(
      [
        ...Object.keys(SENTINELAS_DO_JSON),
        'senha errada da conta excluída',
      ].sort(),
    );
    queryClient.clear();
  });

  it('L2: separa o que está no cache de consultas do que está no de mutações', async () => {
    const queryClient = criarQueryClientDeTeste();
    queryClient.setQueryData(['trampo', 't-edicao'], {
      titulo: TITULO_EDITADO,
    });
    await queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: () => Promise.reject(new Error('recusada')),
      })
      .execute({ descricao: RASCUNHO_DO_TRAMPO })
      .catch(() => undefined);

    expect(sentinelasNosCaches(queryClient, SENTINELAS_DA_EDICAO)).toEqual({
      consultas: ['título editado do trampo'],
      mutacoes: ['rascunho do trampo'],
    });
    queryClient.clear();
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
