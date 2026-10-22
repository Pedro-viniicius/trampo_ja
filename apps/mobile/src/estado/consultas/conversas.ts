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
/** Maior espera entre dois ciclos, com falhas seguidas de rede ou 5xx. */
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
 * mais antigas. O cursor do polling é sempre o último id, então cortar o
 * começo não muda o que se pede à API.
 */
export const TETO_DE_MENSAGENS_NO_CACHE = 500;

/**
 * Espera até o próximo ciclo depois de `falhas` falhas seguidas de rede ou
 * 5xx: `min(5 s × 2^falhas, 60 s)`. Valor inválido conta como zero.
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

/** Opção dos hooks com atualização periódica. */
export interface OpcoesDeAtividade {
  /**
   * A tela que usa o hook está focada (a rota passa `useIsFocused()`). Fora
   * de foco, nada é recarregado por tempo nem ao voltar ao app.
   */
  readonly ativa: boolean;
}

/** 4xx da API: repetir daria a mesma resposta, então o polling para. */
function ehErroDoCliente(erro: unknown): boolean {
  return ehErroDaApi(erro) && erro.status >= 400 && erro.status < 500;
}

/** Queda de rede, tempo esgotado ou 5xx: conta para o backoff. */
function ehFalhaPassageira(erro: unknown): boolean {
  return !(ehErroDaApi(erro) && erro.status < 500);
}

/**
 * `GET /conversas` (última atividade primeiro), só com a sessão autenticada.
 * Fresca por 5 s. Com `ativa`, recarrega a cada 30 s, ao voltar ao app e ao
 * voltar a ela (se o dado estiver velho); fora de foco, só mostra o cache.
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

/**
 * Pede as mensagens depois da última de `base`, página a página, até vir uma
 * com menos de `PAGINA_DE_MENSAGENS` ou até `PAGINAS_POR_BUSCA` páginas.
 *
 * O cursor é sempre o último id que um GET listou (o fim de `base`, que só
 * este polling escreve, ou o fim da página anterior). Nunca o id devolvido
 * pelo `POST` do envio: mensagens do outro enviadas antes dele, que este
 * aparelho ainda não viu, seriam puladas.
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
  let lista = base;
  let cursor = base[base.length - 1]?.id ?? null;
  for (let pagina = 0; pagina < PAGINAS_POR_BUSCA; pagina += 1) {
    let novas: readonly Mensagem[];
    try {
      novas = await listarMensagens(cliente, conversaId, cursor);
    } catch (erro) {
      if (
        podeRecomecar &&
        cursor !== null &&
        ehErroDaApi(erro) &&
        erro.status === 400 &&
        !interrompida()
      ) {
        return carregarDesde(cliente, conversaId, [], interrompida, false);
      }
      throw erro;
    }
    if (interrompida()) {
      throw erroDeBuscaInterrompida();
    }
    lista = mesclarPagina(lista, novas);
    const ultima = novas[novas.length - 1];
    if (ultima === undefined || novas.length < PAGINA_DE_MENSAGENS) {
      break;
    }
    cursor = ultima.id;
  }
  return lista;
}

/**
 * Mensagens da conversa (CA12), acumuladas no cache por polling incremental:
 * cada busca lê o que já está em `chaves.mensagens(conversaId)` e pede só o
 * que veio depois (`depoisDe`), acrescentando com `mesclarPagina`.
 *
 * - Só busca com `ativa` e a sessão autenticada; o ciclo também para com o
 *   app em segundo plano (`focusManager`) e sem rede (`onlineManager`), e
 *   volta na hora ao app voltar, à rede voltar e a tela ganhar foco.
 * - Ciclo de 5 s; depois de `n` falhas seguidas de rede ou 5xx,
 *   `intervaloDoPolling(n)`. Sem nova tentativa automática (`retry: 0`): o
 *   backoff é o do ciclo. O contador zera no sucesso.
 * - Para no 4xx: o 404 (conversa alheia ou inexistente) marca
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
  // Falhas seguidas de rede ou 5xx desta conversa. Fica fora do estado da
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

  const erro = consulta.error;
  return {
    mensagens: consulta.data ?? null,
    carregando: consulta.isLoading,
    erro,
    /** A API respondeu 404: conversa alheia ou inexistente. */
    indisponivel: ehErroDaApi(erro) && erro.status === 404,
    /** Falhas seguidas de rede ou 5xx (0 depois de um sucesso). */
    falhasSeguidas: consulta.isError ? lerFalhas() : 0,
    recarregar,
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
 * 5xx, 404, 401) para a rota decidir; o texto nunca entra no erro (CA15).
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
