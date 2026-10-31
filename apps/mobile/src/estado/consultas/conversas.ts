import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import type { ClienteHttp } from '../../api/cliente';
import {
  abrirConversa,
  enviarMensagem,
  listarConversas,
  listarMensagens,
} from '../../api/conversas';
import { ehErroDaApi } from '../../api/erros';
import type {
  ConversaAberta,
  Mensagem,
  MensagemEnviada,
  ResumoDeConversa,
} from '../../api/tipos';
import { useCliente, useSessao } from '../sessao';
import { useMutacaoComInvalidacao } from './anuncios';
import { chaves } from './chaves';

/** Ciclo do polling da conversa aberta, sem falhas (D20). */
export const INTERVALO_DO_POLLING_MS = 5_000;
/** Maior espera entre dois ciclos, com falhas passageiras seguidas. */
export const TETO_DO_POLLING_MS = 60_000;
/** Ciclo da lista de conversas com a aba focada (D20). */
export const INTERVALO_DA_LISTA_MS = 30_000;
/** Tempo em que a lista de conversas conta como fresca. */
export const FRESCOR_DA_LISTA_MS = 5_000;
/** Tamanho da página de `GET /conversas/:id/mensagens` (fixo na API). */
export const PAGINA_DE_MENSAGENS = 50;
/** Teto de páginas por busca; o que faltar vem nos ciclos seguintes. */
export const PAGINAS_POR_BUSCA = 20;
/**
 * Mensagens guardadas no cache por conversa (S1): passando disso, saem as
 * mais antigas. O cursor do polling fica no fim da lista (ver
 * `cursorDaReleitura`), então cortar o começo não muda o que se pede à API.
 */
export const TETO_DE_MENSAGENS_NO_CACHE = 500;
/**
 * Janela que cada ciclo relê, contada para trás a partir do `enviadaEm` da
 * última mensagem em cache (D48). A API ordena por `(enviada_em, ordem)`, e o
 * `enviada_em` sai do relógio antes do insert: uma mensagem gravada depois de
 * outra mais nova pode aparecer antes dela (R2). Supõe que essa diferença,
 * somada à dos relógios das réplicas, fique abaixo de 60 s. Com 0, o cursor
 * volta a ser o último id.
 */
export const JANELA_DE_RELEITURA_MS = 60_000;

/**
 * Espera até o próximo ciclo depois de `falhas` falhas passageiras seguidas
 * (rede, 5xx ou 429): `min(5 s × 2^falhas, 60 s)`. Valor inválido conta como
 * zero.
 */
export function intervaloDoPolling(falhas: number): number {
  const n = Number.isFinite(falhas) && falhas > 0 ? Math.floor(falhas) : 0;
  return Math.min(INTERVALO_DO_POLLING_MS * 2 ** n, TETO_DO_POLLING_MS);
}

/**
 * Acrescenta ao fim de `atuais` as mensagens de `novas` cujo id ainda não
 * apareceu (nem em `atuais`, nem antes em `novas`) e guarda só as últimas
 * `TETO_DE_MENSAGENS_NO_CACHE` (S1). Sem nada novo, devolve o próprio
 * `atuais`.
 */
export function mesclarPagina(
  atuais: readonly Mensagem[],
  novas: readonly Mensagem[],
): readonly Mensagem[] {
  const vistos = new Set(atuais.map((mensagem) => mensagem.id));
  const acrescentar: Mensagem[] = [];
  for (const mensagem of novas) {
    if (!vistos.has(mensagem.id)) {
      vistos.add(mensagem.id);
      acrescentar.push(mensagem);
    }
  }
  if (acrescentar.length === 0) {
    return atuais;
  }
  const juntas = [...atuais, ...acrescentar];
  return juntas.length > TETO_DE_MENSAGENS_NO_CACHE
    ? juntas.slice(-TETO_DE_MENSAGENS_NO_CACHE)
    : juntas;
}

/**
 * Troca o que vem depois de `cursorId` em `atuais` por `novas` (a resposta da
 * API a partir daquele cursor, na ordem dela), sem repetir id, e guarda só as
 * últimas `TETO_DE_MENSAGENS_NO_CACHE` (S1). Mensagem não some da conversa
 * (D25 apaga a conversa inteira), então a cauda nova contém a velha, agora na
 * ordem da API, mais o que chegou (CA59).
 *
 * - `cursorId` `null`: `novas` é a conversa desde o começo e substitui tudo.
 * - `cursorId` fora de `atuais` (não acontece no polling, que o tira da
 *   própria lista): só acrescenta, como `mesclarPagina`.
 * - Nada mudou (mesmos ids na mesma ordem): devolve o próprio `atuais`.
 */
export function substituirCauda(
  atuais: readonly Mensagem[],
  cursorId: string | null,
  novas: readonly Mensagem[],
): readonly Mensagem[] {
  const posicao =
    cursorId === null
      ? -1
      : atuais.findIndex((mensagem) => mensagem.id === cursorId);
  if (cursorId !== null && posicao < 0) {
    return mesclarPagina(atuais, novas);
  }
  const juntas = [...atuais.slice(0, posicao + 1)];
  const vistos = new Set(juntas.map((mensagem) => mensagem.id));
  for (const mensagem of novas) {
    if (!vistos.has(mensagem.id)) {
      vistos.add(mensagem.id);
      juntas.push(mensagem);
    }
  }
  const resultado =
    juntas.length > TETO_DE_MENSAGENS_NO_CACHE
      ? juntas.slice(-TETO_DE_MENSAGENS_NO_CACHE)
      : juntas;
  const igual =
    resultado.length === atuais.length &&
    resultado.every((mensagem, i) => mensagem.id === atuais[i]?.id);
  return igual ? atuais : resultado;
}

/**
 * Cursor do ciclo (D48): o id da última mensagem de `atuais` com `enviadaEm`
 * até `JANELA_DE_RELEITURA_MS` antes da última. O ciclo relê o que vem
 * depois dele e troca a cauda (`substituirCauda`).
 *
 * - Lista vazia: `null` (carga do começo).
 * - Nenhuma tão antiga: `null` se a lista ainda não chegou ao teto (então
 *   ela começa no começo da conversa); no teto, o id da primeira, porque
 *   recarregar do começo de uma conversa longa trocaria as mais novas pelas
 *   mais antigas.
 * - `enviadaEm` da última ilegível: o id dela, como antes da janela.
 */
export function cursorDaReleitura(atuais: readonly Mensagem[]): string | null {
  const ultima = atuais[atuais.length - 1];
  if (ultima === undefined) {
    return null;
  }
  const limite = Date.parse(ultima.enviadaEm) - JANELA_DE_RELEITURA_MS;
  if (!Number.isFinite(limite)) {
    return ultima.id;
  }
  for (let i = atuais.length - 1; i >= 0; i -= 1) {
    const mensagem = atuais[i];
    if (mensagem !== undefined && Date.parse(mensagem.enviadaEm) <= limite) {
      return mensagem.id;
    }
  }
  return atuais.length >= TETO_DE_MENSAGENS_NO_CACHE
    ? (atuais[0]?.id ?? null)
    : null;
}

/** Opção dos hooks com atualização periódica. */
export interface OpcoesDeAtividade {
  /**
   * A tela que usa o hook está focada (a rota passa `useIsFocused()`). Fora
   * de foco, nada é recarregado por tempo nem ao voltar ao app.
   */
  readonly ativa: boolean;
}

/** Limite de requisições por conta (D29): passa sozinho com o tempo. */
const STATUS_DO_LIMITE = 429;

/**
 * Queda de rede, tempo esgotado, 5xx ou 429 (limite por conta, CA20): conta
 * para o backoff e o ciclo continua.
 */
function ehFalhaPassageira(erro: unknown): boolean {
  return (
    !ehErroDaApi(erro) || erro.status >= 500 || erro.status === STATUS_DO_LIMITE
  );
}

/**
 * Os demais 4xx da API: repetir daria a mesma resposta, então o polling
 * para. O 429 fica de fora (ver `ehFalhaPassageira`).
 */
function ehErroDoCliente(erro: unknown): boolean {
  return (
    ehErroDaApi(erro) &&
    erro.status >= 400 &&
    erro.status < 500 &&
    erro.status !== STATUS_DO_LIMITE
  );
}

/**
 * `GET /conversas` (última atividade primeiro), só com a sessão autenticada.
 * Fresca por 5 s. Com `ativa`, recarrega a cada 30 s, ao voltar ao app e ao
 * voltar a ela (se o dado estiver velho); fora de foco, só mostra o cache.
 * Um erro (inclusive o 429 do limite por conta, CA20) não para o ciclo de
 * 30 s: a próxima resposta boa o substitui. Sem nova tentativa imediata no
 * 4xx (`deveTentarDeNovo`), para não gastar mais o limite.
 * A consulta segue habilitada fora de foco de propósito: assim a abertura de
 * conversa consegue recarregá-la (`useAbrirConversa`). `conversas` é `null`
 * enquanto não há resposta. `buscando` e `atualizadaEm` deixam quem usa
 * saber se a lista em cache já é posterior a um instante (a rota da
 * conversa não trata lista velha como prova de que a conversa não existe).
 */
export function useConversas({ ativa }: OpcoesDeAtividade) {
  const cliente = useCliente();
  const { status } = useSessao();
  const queryClient = useQueryClient();
  const autenticado = status === 'autenticado';
  const consulta = useQuery<readonly ResumoDeConversa[], Error>({
    queryKey: chaves.conversas(),
    queryFn: () => listarConversas(cliente),
    enabled: autenticado,
    staleTime: FRESCOR_DA_LISTA_MS,
    refetchInterval: ativa ? INTERVALO_DA_LISTA_MS : false,
    refetchOnWindowFocus: ativa,
    refetchOnReconnect: ativa,
  });

  // Ao voltar à tela, recarrega se o dado estiver velho. Na montagem, a
  // busca que já está no ar é reaproveitada (`cancelRefetch: false`).
  useEffect(() => {
    if (!ativa || !autenticado) {
      return;
    }
    void queryClient.refetchQueries(
      { queryKey: chaves.conversas(), exact: true, stale: true },
      { cancelRefetch: false },
    );
  }, [ativa, autenticado, queryClient]);

  return {
    conversas: consulta.data ?? null,
    carregando: consulta.isLoading,
    /** Há uma busca no ar (a primeira ou uma recarga). */
    buscando: consulta.isFetching,
    /** Instante (ms) da última resposta com sucesso; 0 sem nenhuma. */
    atualizadaEm: consulta.dataUpdatedAt,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

/** A busca foi cancelada ou a sessão mudou: o resultado não vale mais. */
function erroDeBuscaInterrompida(): Error {
  return new Error('busca de mensagens interrompida');
}

/** Cursor da página pedida por último em `lerPaginas` e onde ela parou. */
interface Leitura {
  depoisDe: string | null;
  /**
   * Parou no teto de `PAGINAS_POR_BUSCA` com a última página cheia: pode
   * haver mais mensagens depois do que foi lido.
   */
  noTeto?: boolean;
}

/**
 * Pede as mensagens depois de `leitura.depoisDe`, página a página, até vir
 * uma com menos de `PAGINA_DE_MENSAGENS` ou até `PAGINAS_POR_BUSCA` páginas.
 * A partir da 2ª página, o cursor é o último id da página anterior, e
 * `leitura.depoisDe` acompanha (quem chama sabe com que cursor a página que
 * falhou foi pedida) e `leitura.noTeto` diz se a leitura parou no teto
 * com a última página cheia. Lança o erro da página que falhou e
 * `erroDeBuscaInterrompida` se `interrompida()` virar.
 */
async function lerPaginas(
  cliente: ClienteHttp,
  conversaId: string,
  leitura: Leitura,
  interrompida: () => boolean,
): Promise<Mensagem[]> {
  const lidas: Mensagem[] = [];
  for (let pagina = 0; pagina < PAGINAS_POR_BUSCA; pagina += 1) {
    const novas = await listarMensagens(cliente, conversaId, leitura.depoisDe);
    if (interrompida()) {
      throw erroDeBuscaInterrompida();
    }
    lidas.push(...novas);
    const ultima = novas[novas.length - 1];
    if (ultima === undefined || novas.length < PAGINA_DE_MENSAGENS) {
      return lidas;
    }
    leitura.depoisDe = ultima.id;
  }
  leitura.noTeto = true;
  return lidas;
}

/**
 * Relê a janela do fim de `base` e o que veio depois (`cursorDaReleitura`) e
 * troca a cauda pela resposta (`substituirCauda`, D48).
 *
 * O cursor sai sempre de uma lista que um GET devolveu (`base`, que só este
 * polling escreve, ou a página anterior). Nunca o id devolvido pelo `POST` do
 * envio: mensagens do outro enviadas antes dele, que este aparelho ainda não
 * viu, seriam puladas.
 *
 * 400 numa página pedida com cursor (o id não vale mais nesta conversa):
 * refaz a carga do zero uma vez, descartando `base`.
 */
async function carregarDesde(
  cliente: ClienteHttp,
  conversaId: string,
  base: readonly Mensagem[],
  interrompida: () => boolean,
  podeRecomecar: boolean,
): Promise<readonly Mensagem[]> {
  const cursor = cursorDaReleitura(base);
  const leitura: Leitura = { depoisDe: cursor };
  try {
    const lidas = await lerPaginas(cliente, conversaId, leitura, interrompida);
    return substituirCauda(base, cursor, lidas);
  } catch (erro) {
    if (
      podeRecomecar &&
      leitura.depoisDe !== null &&
      ehErroDaApi(erro) &&
      erro.status === 400 &&
      !interrompida()
    ) {
      return carregarDesde(cliente, conversaId, [], interrompida, false);
    }
    throw erro;
  }
}

/**
 * Lê na API as mensagens depois de `ancora` (`null`: desde o começo), até
 * `PAGINAS_POR_BUSCA` páginas, sem gravar nada no cache (CA60). Serve ao
 * "Tentar de novo" quando a âncora da pendente já saiu do teto do cache: a
 * lista volta para `reconciliar`, que confere se a mensagem chegou.
 *
 * Devolve `null` se não deu para conferir: falha de rede, erro da API
 * (inclusive o 400 de âncora que não vale mais), `interrompida()` virou
 * entre as páginas, ou a leitura parou no teto de `PAGINAS_POR_BUSCA` com a
 * última página cheia (a mensagem pode estar depois dela; dar a conferência
 * por completa levaria a reenviar, D21). O texto das mensagens fica só no
 * valor devolvido.
 */
export async function conferirDesde(
  cliente: ClienteHttp,
  conversaId: string,
  ancora: string | null,
  interrompida: () => boolean = () => false,
): Promise<readonly Mensagem[] | null> {
  const leitura: Leitura = { depoisDe: ancora };
  try {
    const lidas = await lerPaginas(cliente, conversaId, leitura, interrompida);
    return leitura.noTeto === true ? null : lidas;
  } catch {
    // O erro cru não sai daqui (CA15): quem chama só precisa saber que não
    // deu para conferir.
    return null;
  }
}

/**
 * Mensagens da conversa (CA12), acumuladas no cache por polling incremental:
 * cada busca lê o que já está em `chaves.mensagens(conversaId)`, relê os
 * últimos 60 s dele e o que veio depois (`depoisDe`, ver
 * `cursorDaReleitura`) e troca a cauda pela resposta (`substituirCauda`).
 * Uma mensagem gravada depois de outra mais nova entra na posição da API, sem
 * duplicata (CA59, D48).
 *
 * - Só busca com `ativa` e a sessão autenticada; o ciclo também para com o
 *   app em segundo plano (`focusManager`) e sem rede (`onlineManager`), e
 *   volta na hora ao app voltar, à rede voltar e a tela ganhar foco.
 * - Ciclo de 5 s; depois de `n` falhas passageiras seguidas (rede, 5xx ou
 *   429 do limite por conta, CA20), `intervaloDoPolling(n)`, até 60 s. Sem
 *   nova tentativa automática (`retry: 0`): o backoff é o do ciclo. O
 *   contador zera no sucesso.
 * - Para nos demais 4xx: o 404 (conversa alheia ou inexistente) marca
 *   `indisponivel`; o 401 já expira a sessão pelo cliente HTTP. Só
 *   `recarregar()` (ou a tela ganhar foco de novo) tenta outra vez.
 * - A sessão que sai limpa o cache (`queryClient.clear()`): a busca no ar é
 *   cancelada e não continua para a página seguinte, e nada dela entra no
 *   cache novo.
 *
 * `mensagens` é `null` enquanto não houve resposta. Erros sobem crus
 * (`ErroDaApi` ou `ErroDeRede`) para a rota traduzir.
 */
export function useMensagens(conversaId: string, { ativa }: OpcoesDeAtividade) {
  const cliente = useCliente();
  const { status, geracao } = useSessao();
  const queryClient = useQueryClient();
  // Falhas passageiras seguidas desta conversa. Fica fora do estado da
  // consulta porque o TanStack zera `fetchFailureCount` a cada busca.
  const falhas = useRef({ conversaId, n: 0 });

  const lerFalhas = useCallback(
    () => (falhas.current.conversaId === conversaId ? falhas.current.n : 0),
    [conversaId],
  );

  const consulta = useQuery<
    readonly Mensagem[],
    Error,
    readonly Mensagem[],
    ReturnType<typeof chaves.mensagens>
  >({
    queryKey: chaves.mensagens(conversaId),
    queryFn: async ({ signal }) => {
      const geracaoDaBusca = geracao();
      const interrompida = () => signal.aborted || geracaoDaBusca !== geracao();
      const atuais =
        queryClient.getQueryData<readonly Mensagem[]>(
          chaves.mensagens(conversaId),
        ) ?? [];
      try {
        const lista = await carregarDesde(
          cliente,
          conversaId,
          atuais,
          interrompida,
          true,
        );
        falhas.current = { conversaId, n: 0 };
        return lista;
      } catch (erro) {
        if (!interrompida() && ehFalhaPassageira(erro)) {
          falhas.current = { conversaId, n: lerFalhas() + 1 };
        }
        throw erro;
      }
    },
    enabled: ativa && status === 'autenticado',
    retry: 0,
    staleTime: 0,
    refetchInterval: (query) =>
      ehErroDoCliente(query.state.error)
        ? false
        : intervaloDoPolling(lerFalhas()),
    refetchOnWindowFocus: (query) => !ehErroDoCliente(query.state.error),
    refetchOnReconnect: (query) => !ehErroDoCliente(query.state.error),
  });

  const { refetch } = consulta;
  const autenticado = status === 'autenticado';

  /**
   * Busca as novas agora (ex.: antes de reenviar uma mensagem que falhou) e
   * devolve a lista inteira. `null` quando não deu para confirmar: sem
   * sessão, sem conexão (não espera a rede voltar), busca com erro ou sessão
   * trocada no meio.
   */
  const recarregar = useCallback(async (): Promise<
    readonly Mensagem[] | null
  > => {
    if (!autenticado || !onlineManager.isOnline()) {
      return null;
    }
    const geracaoAntes = geracao();
    const resultado = await refetch();
    if (geracaoAntes !== geracao() || resultado.isError) {
      return null;
    }
    return resultado.data ?? null;
  }, [autenticado, geracao, refetch]);

  /**
   * Confere na API, sem gravar no cache, as mensagens depois de `ancora`
   * (`conferirDesde`, CA60). `null` quando não deu para conferir: sem sessão,
   * sem conexão, falha da API, sessão trocada no meio ou leitura parada no
   * teto de páginas com a última cheia.
   */
  const conferir = useCallback(
    async (ancora: string | null): Promise<readonly Mensagem[] | null> => {
      if (!autenticado || !onlineManager.isOnline()) {
        return null;
      }
      // `conferirDesde` confere a sessão depois de cada página.
      const geracaoAntes = geracao();
      return conferirDesde(
        cliente,
        conversaId,
        ancora,
        () => geracaoAntes !== geracao(),
      );
    },
    [autenticado, cliente, conversaId, geracao],
  );

  const erro = consulta.error;
  return {
    mensagens: consulta.data ?? null,
    carregando: consulta.isLoading,
    erro,
    /** A API respondeu 404: conversa alheia ou inexistente. */
    indisponivel: ehErroDaApi(erro) && erro.status === 404,
    /** Falhas seguidas de rede, 5xx ou 429 (0 depois de um sucesso). */
    falhasSeguidas: consulta.isError ? lerFalhas() : 0,
    recarregar,
    conferirDesde: conferir,
  };
}

/** A sessão mudou enquanto o POST estava no ar: a rota não faz nada. */
export interface Descartada {
  readonly tipo: 'descartada';
}

const DESCARTADA: Descartada = { tipo: 'descartada' };

export type ResultadoDaAbertura =
  | { readonly tipo: 'aberta'; readonly conversaId: string }
  | { readonly tipo: 'erro'; readonly erro: Error }
  | Descartada;

export type ResultadoDoEnvio =
  | {
      readonly tipo: 'enviada';
      readonly id: string;
      readonly enviadaEm: string;
    }
  | { readonly tipo: 'falhou'; readonly erro: Error }
  | Descartada;

function comoErro(erro: unknown): Error {
  return erro instanceof Error ? erro : new Error('falha desconhecida');
}

/**
 * `POST /conversas` (CA13). No sucesso, espera a lista de conversas recarregar
 * (essencial, até `TETO_DA_RECARGA_MS`) antes de devolver `aberta`: a rota da
 * conversa já encontra o `outroUsuarioId`. O erro volta cru (403
 * `sem_vinculo`, 409 `conversa_consigo_mesmo`, `ErroDeRede`) para quem chama
 * traduzir. Sem conexão falha na hora (`networkMode: 'always'`), sem nova
 * tentativa. Se a sessão mudou durante o POST, devolve `descartada` e nada é
 * invalidado. A trava do duplo toque e as recusas por conta ficam em
 * `useConversarPorConta` / `useConversar` (`abrir-conversa.ts`).
 */
export function useAbrirConversa() {
  const { geracao } = useSessao();
  const { mutateAsync, isPending } = useMutacaoComInvalidacao<
    ConversaAberta,
    string
  >(abrirConversa, { essenciais: [chaves.conversas()] });

  const abrir = useCallback(
    async (contaId: string): Promise<ResultadoDaAbertura> => {
      const geracaoAntes = geracao();
      try {
        const { conversaId } = await mutateAsync(contaId);
        return geracaoAntes === geracao()
          ? { tipo: 'aberta', conversaId }
          : DESCARTADA;
      } catch (erro) {
        return geracaoAntes === geracao()
          ? { tipo: 'erro', erro: comoErro(erro) }
          : DESCARTADA;
      }
    },
    [geracao, mutateAsync],
  );

  return { abrir, abrindo: isPending };
}

/**
 * `POST /conversas/:id/mensagens` (CA12). Usa `mutateAsync`, porque os
 * callbacks de `mutate` só valem para a última chamada e há envios
 * concorrentes. No sucesso invalida `chaves.mensagens(conversaId)` sem
 * esperar, o que puxa um ciclo do polling na hora (o cursor continua vindo
 * do GET; ver `useMensagens`), e também `chaves.conversas()`, sem esperar:
 * ao voltar à lista, a prévia já é a da mensagem enviada (Q2). A falha volta crua (`ErroDeRede`, `ErroDaApi`
 * 5xx, 404, 401, 429) para a rota decidir; o texto nunca entra no erro (CA15).
 * Sem conexão falha na hora, sem fila nem nova tentativa. Se a sessão mudou
 * durante o POST, devolve `descartada` e nada é invalidado.
 */
export function useEnviarMensagem(conversaId: string) {
  const { geracao } = useSessao();
  const { mutateAsync } = useMutacaoComInvalidacao<MensagemEnviada, string>(
    (cliente, texto) => enviarMensagem(cliente, conversaId, texto),
    {
      essenciais: [],
      demais: [chaves.mensagens(conversaId), chaves.conversas()],
    },
  );

  const enviar = useCallback(
    async (texto: string): Promise<ResultadoDoEnvio> => {
      const geracaoAntes = geracao();
      try {
        const { id, enviadaEm } = await mutateAsync(texto);
        return geracaoAntes === geracao()
          ? { tipo: 'enviada', id, enviadaEm }
          : DESCARTADA;
      } catch (erro) {
        return geracaoAntes === geracao()
          ? { tipo: 'falhou', erro: comoErro(erro) }
          : DESCARTADA;
      }
    },
    [geracao, mutateAsync],
  );

  return { enviar };
}
