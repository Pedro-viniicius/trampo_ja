// Apoio dos testes de QA da entrega 2c (conversas): um "servidor" em memória
// com duas contas (o fetch falso decide por `Authorization: Bearer`), as
// sentinelas de dado pessoal e os gestos comuns das telas. Nenhum dado real.
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { Mensagem } from '../../api/tipos';
import { textos } from '../../textos/pt-BR';
import {
  criarFetchFalso,
  type FetchFalso,
  type RequisicaoFeita,
  type RespostaFalsa,
} from '../fetch-falso';
import { CATEGORIAS } from './apoio-qa';

export interface ContaFalsa {
  readonly id: string;
  readonly token: string;
  readonly email: string;
  readonly senha: string;
  readonly nome: string;
}

/** Quem se candidata (dona da mensagem "A"). */
export const FREELA: ContaFalsa = {
  id: 'conta-freela',
  token: 'token-freela',
  email: 'freela.qa@exemplo.test',
  senha: 'senha-freela-qa-1',
  nome: 'NOME-SENTINELA-FREELA',
};

/** Autor do trampo `t1` (aceita a candidatura). */
export const AUTOR: ContaFalsa = {
  id: 'conta-autor',
  token: 'token-autor',
  email: 'autor.qa@exemplo.test',
  senha: 'senha-autor-qa-1',
  nome: 'NOME-SENTINELA-AUTOR',
};

/** Terceiro, sem candidatura nem contratação com ninguém. */
export const ESTRANHO: ContaFalsa = {
  id: 'conta-estranha',
  token: 'token-estranho',
  email: 'estranho.qa@exemplo.test',
  senha: 'senha-estranho-qa-1',
  nome: 'NOME-SENTINELA-ESTRANHO',
};

export const CONTAS = [FREELA, AUTOR, ESTRANHO] as const;

export const CONVERSA = 'c1';
const CAMINHO_DAS_MENSAGENS = `/conversas/${CONVERSA}/mensagens`;

/** Texto literal do CA13 (D4), escrito aqui para não depender do arquivo de textos. */
export const TEXTO_DO_CA13 =
  'Você só pode conversar com quem tem uma candidatura ou contratação com você.';

export const TRAMPO = {
  id: 't1',
  autorId: AUTOR.id,
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 150000,
  prazo: null,
  status: 'aberto',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

export function textoDe(n: number | string): string {
  return `TEXTO-SENTINELA-${n}`;
}

export type ModoDoPost =
  | 'ok'
  /** O servidor grava e a resposta se perde (a rede cai depois). */
  | 'perdida'
  /** A rede cai antes de chegar: nada é gravado. */
  | 'falha'
  | 'nao_encontrada';

interface CandidaturaFalsa {
  id: string;
  freelancerId: string;
  mensagem: string;
  valorPropostoCentavos: number;
  status: 'pendente' | 'aceita' | 'recusada';
}

interface ConversaFalsa {
  id: string;
  participantes: readonly [string, string];
  criadaEm: string;
}

export interface MensagemDoServidor extends Mensagem {
  readonly conversaId: string;
}

export interface Mundo {
  candidaturas: CandidaturaFalsa[];
  conversas: ConversaFalsa[];
  mensagens: MensagemDoServidor[];
  /** Instante (ms) da próxima mensagem; cada uma anda 1 minuto. */
  relogio: number;
  proximoId: number;
  modoDoPost: ModoDoPost;
  demoraDoPostMs: number;
  demoraDoGetMs: number;
  /** Resposta fixa para `GET /conversas/c1/mensagens` (ex.: 500). */
  falhaDoGet: RespostaFalsa | null;
  /** Demora de `GET /conversas`. */
  demoraDaListaMs: number;
  /** Resposta fixa para `GET /conversas` (ex.: 500). */
  falhaDaLista: RespostaFalsa | null;
  /** Resposta fixa para `POST /conversas` (ex.: 500). */
  falhaDaAbertura: RespostaFalsa | null;
  /** Grava uma mensagem na conversa `c1` (o relógio anda 1 minuto). */
  gravarMensagem(autorId: string, texto: string): MensagemDoServidor;
  conversaEntre(a: string, b: string): ConversaFalsa | undefined;
}

/** Candidatura da `FREELA` ao `t1` e, se pedido, a conversa `c1` já aberta. */
export function criarMundo({
  conversaAberta = true,
  candidatura = true,
  mensagens = [],
}: {
  conversaAberta?: boolean;
  candidatura?: boolean;
  mensagens?: readonly { autor: ContaFalsa; texto: string }[];
} = {}): Mundo {
  const inicio = Date.now() - 3_600_000;
  const mundo: Mundo = {
    candidaturas: candidatura
      ? [
          {
            id: 'k1',
            freelancerId: FREELA.id,
            mensagem: 'Posso fazer.',
            valorPropostoCentavos: 15000,
            status: 'pendente' as const,
          },
        ]
      : [],
    conversas: conversaAberta
      ? [
          {
            id: CONVERSA,
            participantes: [FREELA.id, AUTOR.id],
            criadaEm: new Date(inicio).toISOString(),
          },
        ]
      : [],
    mensagens: [],
    relogio: inicio + 60_000,
    proximoId: 1,
    modoDoPost: 'ok',
    demoraDoPostMs: 0,
    demoraDoGetMs: 0,
    falhaDoGet: null,
    demoraDaListaMs: 0,
    falhaDaLista: null,
    falhaDaAbertura: null,
    gravarMensagem(autorId, texto) {
      const nova: MensagemDoServidor = {
        id: `m${mundo.proximoId}`,
        conversaId: CONVERSA,
        autorId,
        texto,
        enviadaEm: new Date(mundo.relogio).toISOString(),
      };
      mundo.proximoId += 1;
      mundo.relogio += 60_000;
      mundo.mensagens.push(nova);
      return nova;
    },
    conversaEntre(a, b) {
      return mundo.conversas.find(
        (c) => c.participantes.includes(a) && c.participantes.includes(b),
      );
    },
  };
  for (const { autor, texto } of mensagens) {
    mundo.gravarMensagem(autor.id, texto);
  }
  return mundo;
}

function quem(req: RequisicaoFeita): ContaFalsa | undefined {
  const token = req.cabecalhos.authorization?.replace(/^Bearer /, '');
  return CONTAS.find((c) => c.token === token);
}

function naoAutorizada(): RespostaFalsa {
  return { status: 401, corpo: { erro: 'sessao_invalida' } };
}

const NAO_ENCONTRADO: RespostaFalsa = {
  status: 404,
  corpo: { erro: 'nao_encontrado' },
};

function perfilDe(conta: ContaFalsa) {
  return {
    contaId: conta.id,
    nome: conta.nome,
    cidade: 'Lavras',
    descricao: null,
    habilidades: ['pintura'],
  };
}

function ultimaDaConversa(mundo: Mundo, conversaId: string) {
  return [...mundo.mensagens]
    .reverse()
    .find((m) => m.conversaId === conversaId);
}

/**
 * Fetch falso que se comporta como a API para o que as telas da 2c usam:
 * sessão por Bearer, candidatura e aceite, abertura de conversa com a regra
 * de vínculo (403) e mensagens com `depoisDe` (400 com cursor desconhecido,
 * 404 para quem não participa).
 */
export function criarFetchDoMundo(mundo: Mundo): FetchFalso {
  const fetch = criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('POST /sessoes', (req) => {
      const corpo = req.corpo as { email: string; senha: string };
      const conta = CONTAS.find(
        (c) => c.email === corpo.email && c.senha === corpo.senha,
      );
      return conta === undefined
        ? { status: 401, corpo: { erro: 'credenciais_invalidas' } }
        : { corpo: { token: conta.token } };
    })
    .responder('DELETE /sessoes', { status: 204 })
    .responder('GET /perfis/eu', (req) => {
      const eu = quem(req);
      return eu === undefined
        ? naoAutorizada()
        : {
            corpo: {
              nome: eu.nome,
              cidade: 'Lavras',
              descricao: null,
              habilidades: ['pintura'],
              completo: true,
            },
          };
    })
    .responder('GET /trampos/t1', { corpo: TRAMPO })
    .responder('GET /trampos/meus', (req) => ({
      corpo: quem(req)?.id === AUTOR.id ? [TRAMPO] : [],
    }))
    .responder('GET /servicos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', (req) => {
      const eu = quem(req);
      return {
        corpo: mundo.candidaturas
          .filter((c) => c.freelancerId === eu?.id)
          .map((c) => ({
            ...c,
            trampoId: 't1',
            criadaEm: '2026-10-02T12:00:00.000Z',
          })),
      };
    })
    .responder('POST /trampos/t1/candidaturas', (req) => {
      const eu = quem(req);
      if (eu === undefined) {
        return naoAutorizada();
      }
      const corpo = req.corpo as {
        mensagem: string;
        valorPropostoCentavos: number;
      };
      mundo.candidaturas.push({
        id: `k${mundo.candidaturas.length + 1}`,
        freelancerId: eu.id,
        mensagem: corpo.mensagem,
        valorPropostoCentavos: corpo.valorPropostoCentavos,
        status: 'pendente',
      });
      return {
        status: 201,
        corpo: { id: `k${mundo.candidaturas.length}`, status: 'pendente' },
      };
    })
    .responder('GET /trampos/t1/candidaturas', (req) => {
      if (quem(req)?.id !== AUTOR.id) {
        return { status: 403, corpo: { erro: 'sem_permissao' } };
      }
      return {
        corpo: mundo.candidaturas.map((c) => ({
          ...c,
          criadaEm: '2026-10-02T12:00:00.000Z',
        })),
      };
    })
    .responder('POST /trampos/t1/candidaturas/k1/aceitar', (req) => {
      if (quem(req)?.id !== AUTOR.id) {
        return { status: 403, corpo: { erro: 'sem_permissao' } };
      }
      for (const c of mundo.candidaturas) {
        c.status = c.id === 'k1' ? 'aceita' : 'recusada';
      }
      return { corpo: { status: 'aceita' } };
    })
    .responder('GET /conversas', (req) => {
      const eu = quem(req);
      if (eu === undefined) {
        return naoAutorizada();
      }
      const demora =
        mundo.demoraDaListaMs > 0 ? { demoraMs: mundo.demoraDaListaMs } : {};
      if (mundo.falhaDaLista !== null) {
        return { ...mundo.falhaDaLista, ...demora };
      }
      const minhas = mundo.conversas
        .filter((c) => c.participantes.includes(eu.id))
        .map((c) => {
          const ultima = ultimaDaConversa(mundo, c.id);
          return {
            conversaId: c.id,
            outroUsuarioId:
              c.participantes[0] === eu.id
                ? c.participantes[1]
                : c.participantes[0],
            criadaEm: c.criadaEm,
            ultimaMensagem:
              ultima === undefined
                ? null
                : { texto: ultima.texto, enviadaEm: ultima.enviadaEm },
          };
        })
        .sort((a, b) =>
          (b.ultimaMensagem?.enviadaEm ?? b.criadaEm).localeCompare(
            a.ultimaMensagem?.enviadaEm ?? a.criadaEm,
          ),
        );
      return { corpo: minhas, ...demora };
    })
    .responder('POST /conversas', (req) => {
      const eu = quem(req);
      if (eu === undefined) {
        return naoAutorizada();
      }
      if (mundo.falhaDaAbertura !== null) {
        return mundo.falhaDaAbertura;
      }
      const { outroUsuarioId } = req.corpo as { outroUsuarioId: string };
      if (outroUsuarioId === eu.id) {
        return { status: 409, corpo: { erro: 'conversa_consigo_mesmo' } };
      }
      const existente = mundo.conversaEntre(eu.id, outroUsuarioId);
      if (existente !== undefined) {
        return { status: 200, corpo: { conversaId: existente.id } };
      }
      const autorDoTrampo = [eu.id, outroUsuarioId].includes(AUTOR.id);
      const outraPonta = eu.id === AUTOR.id ? outroUsuarioId : eu.id;
      const vinculo =
        autorDoTrampo &&
        mundo.candidaturas.some((c) => c.freelancerId === outraPonta);
      if (!vinculo) {
        return { status: 403, corpo: { erro: 'sem_vinculo' } };
      }
      mundo.conversas.push({
        id: CONVERSA,
        participantes: [eu.id, outroUsuarioId],
        criadaEm: new Date(mundo.relogio).toISOString(),
      });
      return { status: 201, corpo: { conversaId: CONVERSA } };
    })
    .responder(`GET ${CAMINHO_DAS_MENSAGENS}`, (req) => {
      const eu = quem(req);
      if (eu === undefined) {
        return naoAutorizada();
      }
      const demora =
        mundo.demoraDoGetMs > 0 ? { demoraMs: mundo.demoraDoGetMs } : {};
      if (mundo.falhaDoGet !== null) {
        return { ...mundo.falhaDoGet, ...demora };
      }
      const conversa = mundo.conversas.find((c) => c.id === CONVERSA);
      if (conversa === undefined || !conversa.participantes.includes(eu.id)) {
        return NAO_ENCONTRADO;
      }
      const daConversa = mundo.mensagens.filter(
        (m) => m.conversaId === CONVERSA,
      );
      const { depoisDe } = req.query;
      let inicio = 0;
      if (depoisDe !== undefined) {
        const indice = daConversa.findIndex((m) => m.id === depoisDe);
        if (indice < 0) {
          return { status: 400, corpo: { erro: 'dados_invalidos' } };
        }
        inicio = indice + 1;
      }
      return {
        corpo: daConversa
          .slice(inicio, inicio + 50)
          .map(({ id, autorId, texto, enviadaEm }) => ({
            id,
            autorId,
            texto,
            enviadaEm,
          })),
        ...demora,
      };
    })
    .responder(`POST ${CAMINHO_DAS_MENSAGENS}`, (req) => {
      const eu = quem(req);
      if (eu === undefined) {
        return naoAutorizada();
      }
      const demora =
        mundo.demoraDoPostMs > 0 ? { demoraMs: mundo.demoraDoPostMs } : {};
      if (mundo.modoDoPost === 'falha') {
        return { falhaDeRede: true, ...demora };
      }
      if (mundo.modoDoPost === 'nao_encontrada') {
        return { ...NAO_ENCONTRADO, ...demora };
      }
      const { texto } = req.corpo as { texto: string };
      const nova = mundo.gravarMensagem(eu.id, texto);
      return mundo.modoDoPost === 'perdida'
        ? { falhaDeRede: true, ...demora }
        : {
            status: 201,
            corpo: { id: nova.id, enviadaEm: nova.enviadaEm },
            ...demora,
          };
    });
  for (const conta of CONTAS) {
    fetch.responder(`GET /perfis/${conta.id}`, { corpo: perfilDe(conta) });
  }
  return fetch;
}

// --- Gestos e leituras comuns ---

/** Avança os timers falsos e deixa terminar o que a última volta disparou. */
export async function avancar(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(20);
  });
}

export async function irPara(rota: Parameters<typeof router.push>[0]) {
  await act(async () => router.push(rota));
}

export async function navegarPara(rota: Parameters<typeof router.navigate>[0]) {
  await act(async () => router.navigate(rota));
}

export function campo() {
  return screen.getByLabelText(textos.conversas.campo);
}

export function botaoEnviar() {
  return screen.getByRole('button', { name: textos.conversas.enviar });
}

export async function escrever(valor: string) {
  await fireEvent.changeText(campo(), valor);
}

/** Rótulos acessíveis das bolhas (as que têm `TEXTO-SENTINELA-`), na ordem da tela. */
export function rotulosDasBolhas(): string[] {
  return screen
    .queryAllByLabelText(/TEXTO-SENTINELA-/)
    .map((el) => String(el.props.accessibilityLabel));
}

/** Só o texto de cada bolha (sem quem escreveu nem hora), na ordem da tela. */
export function textosDasBolhas(): string[] {
  return rotulosDasBolhas().map((rotulo) => {
    const achado = rotulo.match(/TEXTO-SENTINELA-.*$/);
    return achado === null ? rotulo : achado[0];
  });
}

/** Bolhas cujo rótulo termina com o texto `n`. */
export function bolhasCom(n: number | string) {
  return screen.queryAllByLabelText(new RegExp(`${textoDe(n)}$`));
}

/** Quem escreveu cada bolha: `Você` ou o nome do outro (primeiro trecho do rótulo). */
export function autoresDasBolhas(): string[] {
  return rotulosDasBolhas().map((rotulo) => rotulo.split(/[,.]/)[0] ?? rotulo);
}

export async function sairDaConta() {
  await navegarPara('/perfil');
  await fireEvent.press(
    await screen.findByRole('button', { name: textos.perfil.sair }),
  );
  const botoes = screen.getAllByRole('button', {
    name: textos.perfil.sairConfirmar,
  });
  await fireEvent.press(botoes[botoes.length - 1] as (typeof botoes)[number]);
}

export async function entrarComo(
  conta: ContaFalsa,
  { esperar = true }: { esperar?: boolean } = {},
) {
  // Depois de sair, o app cai na entrada ou direto no login.
  await waitFor(() =>
    expect(
      screen.queryByLabelText(textos.entrar.senha) ??
        screen.queryByRole('button', { name: textos.entrada.jaTenhoConta }),
    ).not.toBeNull(),
  );
  if (screen.queryByLabelText(textos.entrar.senha) === null) {
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrada.jaTenhoConta }),
    );
  }
  await fireEvent.changeText(
    await screen.findByLabelText(textos.entrar.email),
    conta.email,
  );
  await fireEvent.changeText(
    screen.getByLabelText(textos.entrar.senha),
    conta.senha,
  );
  await fireEvent.press(
    screen.getByRole('button', { name: textos.entrar.entrar }),
  );
  if (esperar) {
    await screen.findByText(`Olá, ${conta.nome}`);
  }
}

export function requisicoesDe(
  fetch: FetchFalso,
  metodo: string,
  caminho: string,
) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

export const GETS_DAS_MENSAGENS = (fetch: FetchFalso) =>
  requisicoesDe(fetch, 'GET', CAMINHO_DAS_MENSAGENS);
export const POSTS_DAS_MENSAGENS = (fetch: FetchFalso) =>
  requisicoesDe(fetch, 'POST', CAMINHO_DAS_MENSAGENS);

interface Fibra {
  readonly memoizedProps?: { readonly onPress?: unknown } | null;
  readonly return: Fibra | null;
}

/**
 * Chama o `onPress` do botão (o mesmo fechamento, como no aparelho) `vezes`
 * vezes num só `act`, antes de a tela redesenhar.
 */
export async function tocarNoMesmoTick(elemento: object, vezes = 2) {
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

/** Restaura a conexão no fim do teste (o `onlineManager` é global). */
export async function restaurarConexao() {
  await act(async () => {
    onlineManager.setOnline(true);
  });
}

/** Hora da mensagem como a tela mostra: `14:32` (hoje) ou `20/10 14:32`. */
export const PADRAO_DA_HORA = String.raw`(?:\d{2}:\d{2}|\d{2}/\d{2} \d{2}:\d{2})`;

function escaparParaRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rótulo da linha da lista de conversas (nome, prévia e a hora que o teste não
 * controla), montado com o próprio texto da interface para não repetir a
 * redação aqui.
 */
export function linhaDaListaCom(
  nome: string | null,
  previa: string | null,
  /** Trecho de regex da hora; o padrão aceita `14:32` e `20/10 14:32`. */
  hora: string = PADRAO_DA_HORA,
): RegExp {
  const marcador = 'MARCADOR-DA-HORA';
  const fixo = escaparParaRegex(
    textos.conversas.linhaDaLista(nome, previa, marcador),
  );
  return new RegExp(`^${fixo.replace(marcador, hora)}$`);
}

/** Item que a tela da conversa passa à `FlatList` (a lista só desenha as primeiras na jest). */
export interface ItemDaLista {
  readonly chave: string;
  readonly minha: boolean;
  readonly texto: string;
  readonly situacao: 'enviando' | 'enviada' | 'falhou';
}

interface FibraDaArvore {
  readonly memoizedProps?: Record<string, unknown> | null;
  readonly child: FibraDaArvore | null;
  readonly sibling: FibraDaArvore | null;
}

/** Props da `FlatList` da conversa (a que tem `data` e `renderItem`). */
function propsDaFlatList(): {
  data: readonly ItemDaLista[];
  renderItem: (info: { item: ItemDaLista; index: number }) => {
    props: { onTentarDeNovo: () => void };
  };
} {
  const raiz = (screen.root as unknown as { unstable_fiber?: FibraDaArvore })
    .unstable_fiber;
  const visitar = (
    fibra: FibraDaArvore | null,
  ): Record<string, unknown> | null => {
    for (let atual = fibra; atual !== null; atual = atual.sibling) {
      const props = atual.memoizedProps;
      if (
        props != null &&
        Array.isArray(props.data) &&
        typeof props.renderItem === 'function' &&
        typeof props.keyExtractor === 'function'
      ) {
        return props;
      }
      const dentro = visitar(atual.child);
      if (dentro !== null) {
        return dentro;
      }
    }
    return null;
  };
  const props = visitar(raiz ?? null);
  if (props === null) {
    throw new Error('FlatList da conversa não encontrada');
  }
  return props as ReturnType<typeof propsDaFlatList>;
}

/** Dados inteiros da lista de mensagens da tela, na ordem (confirmadas e depois pendentes). */
export function dadosDaLista(): readonly ItemDaLista[] {
  return propsDaFlatList().data;
}

/**
 * Toca em "tentar de novo" da bolha de `chave` pelo `renderItem` da lista (a
 * `FlatList` só desenha as primeiras bolhas sem layout, e a pendente fica no fim).
 */
export async function tentarDeNovoDa(chave: string) {
  const { data, renderItem } = propsDaFlatList();
  const indice = data.findIndex((item) => item.chave === chave);
  if (indice < 0) {
    throw new Error('bolha não encontrada');
  }
  const elemento = renderItem({
    item: data[indice] as ItemDaLista,
    index: indice,
  });
  await act(async () => {
    elemento.props.onTentarDeNovo();
  });
}
