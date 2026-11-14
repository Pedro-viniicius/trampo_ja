import {
  keepPreviousData,
  type QueryKey,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import {
  desfavoritar,
  enviarAvaliacao,
  favoritar,
  listarAvaliacoesFeitas,
  listarAvaliacoesRecebidas,
  listarFavoritos,
  listarResumosDeAvaliacoes,
  MAXIMO_DE_IDS_POR_PEDIDO,
} from '../../api/avaliacoes';
import type { ClienteHttp } from '../../api/cliente';
import { ehErroDaApi } from '../../api/erros';
import type {
  AvaliacaoCriada,
  AvaliacaoFeita,
  AvaliacaoRecebida,
  EntradaDeAvaliacao,
  Favorito,
  PaginaDeAvaliacoes,
  PapelDoAvaliado,
  ResumoDeAvaliacoes,
} from '../../api/tipos';
import { useCliente, useSessao } from '../sessao';
import { useMutacaoComInvalidacao } from './anuncios';
import { chaves } from './chaves';
import type { Descartada } from './conversas';

/** Tamanho da página de `GET /avaliacoes` (a API assume o mesmo valor). */
export const LIMITE_DE_AVALIACOES = 20;

/** Ids sem repetição e sem vazio, na ordem em que apareceram. */
function idsUnicos(ids: readonly string[]): readonly string[] {
  return [...new Set(ids.filter((id) => id !== ''))];
}

function emLotes(ids: readonly string[]): (readonly string[])[] {
  const lotes: (readonly string[])[] = [];
  for (let i = 0; i < ids.length; i += MAXIMO_DE_IDS_POR_PEDIDO) {
    lotes.push(ids.slice(i, i + MAXIMO_DE_IDS_POR_PEDIDO));
  }
  return lotes;
}

/**
 * Resultado de uma consulta em lote: o que já se sabe por id, e se isso
 * vale para a lista de ids pedida agora.
 */
interface ConsultaEmLote<T> {
  /** Por id. Vazio enquanto nada chegou. */
  readonly porId: ReadonlyMap<string, T>;
  /**
   * A resposta cobre os ids pedidos agora. Falso enquanto a primeira chegada
   * não vem e enquanto a lista cresceu e a resposta nova não chegou (o mapa
   * continua com o que já se sabia, para a tela não piscar).
   */
  readonly completa: boolean;
  readonly carregando: boolean;
  readonly erro: Error | null;
  readonly recarregar: () => Promise<unknown>;
}

/**
 * Uma consulta para a lista de ids inteira, com um pedido por até 50 ids
 * (CA97): uma lista de tela cabe num pedido só, e a que passa de 50 vai em
 * lotes. A chave leva a lista na ordem pedida; ao crescer (página seguinte)
 * o mapa anterior fica na tela até a resposta nova chegar
 * (`keepPreviousData`). Ids repetidos ou vazios não contam. Sem ids ou sem
 * sessão autenticada, não há requisição.
 */
function useConsultaEmLote<T>(
  ids: readonly string[],
  chaveDe: (lista: readonly string[]) => QueryKey,
  buscar: (
    cliente: ClienteHttp,
    lote: readonly string[],
  ) => Promise<readonly T[]>,
  idDe: (item: T) => string,
): ConsultaEmLote<T> {
  const cliente = useCliente();
  const { status } = useSessao();
  // Texto como retrato: a lista nova com os mesmos ids não muda a chave.
  const assinatura = JSON.stringify(idsUnicos(ids));
  const unicos = useMemo(
    () => JSON.parse(assinatura) as readonly string[],
    [assinatura],
  );
  const consulta = useQuery<readonly T[], Error>({
    queryKey: chaveDe(unicos),
    queryFn: async () => {
      const respostas = await Promise.all(
        emLotes(unicos).map((lote) => buscar(cliente, lote)),
      );
      return respostas.flat();
    },
    enabled: status === 'autenticado' && unicos.length > 0,
    placeholderData: keepPreviousData,
  });
  const dados = consulta.data;
  const porId = useMemo(
    () => new Map((dados ?? []).map((item) => [idDe(item), item])),
    [dados, idDe],
  );
  return {
    porId,
    completa:
      unicos.length === 0 ||
      (consulta.isSuccess && !consulta.isPlaceholderData),
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

const idDoResumo = (resumo: ResumoDeAvaliacoes) => resumo.contaId;
const idDaFeita = (feita: AvaliacaoFeita) => feita.trampoId;

/**
 * `GET /avaliacoes/resumos?contas=` (CA89, CA97): a nota (média e total) de
 * cada conta da lista, num pedido só por tela (até 50 contas por pedido; a
 * lista que passa disso vai em lotes). Cada lista chama este hook uma vez com
 * todos os ids dela, nunca um por item. A conta sem avaliação vem com
 * `total: 0` e `media: null`. A nota é enfeite: o erro não precisa de tela, só
 * deixa o item sem nota. `resumos` fica fora do id que ainda não chegou.
 */
export function useResumosDeAvaliacoes(contaIds: readonly string[]) {
  const consulta = useConsultaEmLote(
    contaIds,
    chaves.resumosDeAvaliacoes,
    listarResumosDeAvaliacoes,
    idDoResumo,
  );
  return {
    resumos: consulta.porId,
    carregando: consulta.carregando,
    erro: consulta.erro,
    recarregar: consulta.recarregar,
  };
}

/**
 * `GET /avaliacoes/feitas?trampos=` (CA91, CA96): as avaliações que a conta
 * da sessão fez nos trampos da lista, num pedido só por tela. O trampo que
 * está em `feitas` mostra "Avaliado com N ★"; o que não está só pode mostrar
 * "Avaliar" quando `completa` for verdadeiro (a resposta já cobre a lista):
 * antes disso, a ausência não prova que a conta não avaliou.
 */
export function useAvaliacoesFeitas(trampoIds: readonly string[]) {
  const consulta = useConsultaEmLote(
    trampoIds,
    chaves.avaliacoesFeitas,
    listarAvaliacoesFeitas,
    idDaFeita,
  );
  return {
    feitas: consulta.porId,
    completa: consulta.completa,
    carregando: consulta.carregando,
    erro: consulta.erro,
    recarregar: consulta.recarregar,
  };
}

export interface OpcoesDasAvaliacoesRecebidas {
  /** Só consulta quando for verdadeiro (ex.: a aba aberta). Padrão: `true`. */
  readonly habilitada?: boolean;
}

/**
 * `GET /avaliacoes` (CA90) paginada por cursor, 20 por página: cada página
 * seguinte usa `antesDe` com o `proximoCursor` da anterior, e `null` encerra.
 * Conta sem avaliação dá lista vazia (a API não diz se a conta existe). O
 * comentário é dado pessoal: fica só no cache em memória.
 */
export function useAvaliacoesRecebidas(
  contaId: string,
  papel: PapelDoAvaliado,
  { habilitada = true }: OpcoesDasAvaliacoesRecebidas = {},
) {
  const cliente = useCliente();
  const { status } = useSessao();
  const consulta = useInfiniteQuery<
    PaginaDeAvaliacoes,
    Error,
    { pages: PaginaDeAvaliacoes[] },
    ReturnType<typeof chaves.avaliacoesRecebidas>,
    string | undefined
  >({
    queryKey: chaves.avaliacoesRecebidas(contaId, papel),
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      listarAvaliacoesRecebidas(cliente, {
        contaId,
        papel,
        ...(pageParam !== undefined && { antesDe: pageParam }),
        limite: LIMITE_DE_AVALIACOES,
      }),
    getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
    enabled: habilitada && contaId !== '' && status === 'autenticado',
  });
  const avaliacoes: AvaliacaoRecebida[] = (consulta.data?.pages ?? []).flatMap(
    (pagina) => pagina.itens,
  );
  return {
    avaliacoes,
    temMais: consulta.hasNextPage,
    /** Pede a próxima página; com uma em andamento, a chamada é ignorada. */
    carregarMais: () => {
      if (consulta.hasNextPage) {
        return consulta.fetchNextPage({ cancelRefetch: false });
      }
      return Promise.resolve();
    },
    carregando: consulta.isLoading,
    carregandoMais: consulta.isFetchingNextPage,
    erro: consulta.error,
    /** Erro ao pedir a página seguinte; as já carregadas continuam em `avaliacoes`. */
    erroAoCarregarMais: consulta.isFetchNextPageError ? consulta.error : null,
    recarregar: () => consulta.refetch(),
  };
}

export type ResultadoDaAvaliacao =
  | { readonly tipo: 'enviada'; readonly id: string }
  | { readonly tipo: 'erro'; readonly erro: Error }
  | Descartada;

const DESCARTADA: Descartada = { tipo: 'descartada' };

function comoErro(erro: unknown): Error {
  return erro instanceof Error ? erro : new Error('falha desconhecida');
}

/** 409 `avaliacao_ja_feita`: a conta já avaliou este trampo (CA96). */
export function ehAvaliacaoJaFeita(erro: unknown): boolean {
  return (
    ehErroDaApi(erro) &&
    erro.status === 409 &&
    erro.codigo === 'avaliacao_ja_feita'
  );
}

/**
 * `POST /avaliacoes` (CA87, CA88, CA96). Manda um só pedido: com um já no ar,
 * a chamada devolve o mesmo resultado em vez de abrir outro (duplo toque). O
 * comentário é aparado e, em branco, não vai no corpo; destaques vazios
 * também não. Os erros voltam em `{tipo: 'erro'}`, crus (`ErroDaApi`: 400 com
 * `campos`, 404, 409 `trampo_nao_encerrado` e `avaliacao_ja_feita`, ou
 * `ErroDeRede`); o texto nunca entra no erro (CA15).
 *
 * No sucesso recarrega, antes de resolver, as avaliações feitas (o trampo
 * passa a "Avaliado com N ★") e invalida sem esperar as notas e as listas de
 * avaliações recebidas. No 409 `avaliacao_ja_feita`, recarrega as feitas sem
 * esperar, para o "Avaliado" aparecer ao voltar. Se a sessão mudou durante o
 * pedido, devolve `descartada` e nada é invalidado.
 */
export function useAvaliar() {
  const { geracao } = useSessao();
  const queryClient = useQueryClient();
  const { mutateAsync, isPending } = useMutacaoComInvalidacao<
    AvaliacaoCriada,
    EntradaDeAvaliacao
  >(enviarAvaliacao, {
    essenciais: [chaves.todasAsAvaliacoesFeitas()],
    demais: [
      chaves.todosOsResumosDeAvaliacoes(),
      chaves.todasAsAvaliacoesRecebidas(),
    ],
  });
  const emVoo = useRef<Promise<ResultadoDaAvaliacao> | null>(null);

  const avaliar = useCallback(
    (entrada: EntradaDeAvaliacao): Promise<ResultadoDaAvaliacao> => {
      if (emVoo.current !== null) {
        return emVoo.current;
      }
      const geracaoAntes = geracao();
      const comentario = entrada.comentario?.trim();
      const envio = mutateAsync({
        trampoId: entrada.trampoId,
        nota: entrada.nota,
        ...(entrada.destaques !== undefined &&
          entrada.destaques.length > 0 && { destaques: entrada.destaques }),
        ...(comentario !== undefined && comentario !== '' && { comentario }),
      }).then(
        ({ id }): ResultadoDaAvaliacao =>
          geracaoAntes === geracao() ? { tipo: 'enviada', id } : DESCARTADA,
        (erro: unknown): ResultadoDaAvaliacao => {
          if (geracaoAntes !== geracao()) {
            return DESCARTADA;
          }
          if (ehAvaliacaoJaFeita(erro)) {
            void queryClient.invalidateQueries({
              queryKey: chaves.todasAsAvaliacoesFeitas(),
              refetchType: 'all',
            });
          }
          return { tipo: 'erro', erro: comoErro(erro) };
        },
      );
      emVoo.current = envio;
      void envio.then(() => {
        emVoo.current = null;
      });
      return envio;
    },
    [geracao, mutateAsync, queryClient],
  );

  return { avaliar, avaliando: isPending };
}

/**
 * `GET /favoritos` (CA92), só com a sessão autenticada: a equipe favorita da
 * conta, mais recentes primeiro. `favoritos` é `null` enquanto não há
 * resposta. `ehFavorito` consulta a lista em cache (inclusive o que
 * `useDefinirFavorito` já marcou, antes da resposta da API).
 */
export function useFavoritos() {
  const cliente = useCliente();
  const { status } = useSessao();
  const consulta = useQuery<readonly Favorito[], Error>({
    queryKey: chaves.favoritos(),
    queryFn: () => listarFavoritos(cliente),
    enabled: status === 'autenticado',
  });
  const favoritos = consulta.data ?? null;
  const ids = useMemo(
    () => new Set((favoritos ?? []).map((favorito) => favorito.contaId)),
    [favoritos],
  );
  const ehFavorito = useCallback((contaId: string) => ids.has(contaId), [ids]);
  return {
    favoritos,
    ehFavorito,
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

/** Pedido de `useDefinirFavorito`: `favorito` é o estado que se quer. */
export interface EntradaDoFavorito {
  readonly contaId: string;
  readonly favorito: boolean;
}

export type ResultadoDoFavorito =
  | { readonly tipo: 'feito' }
  | { readonly tipo: 'erro'; readonly erro: Error }
  | Descartada;

/** O que `onMutate` guarda para desfazer só a conta que mudou. */
interface ContextoDoFavorito {
  readonly geracao: number;
  /** A lista estava no cache e foi alterada na hora. */
  readonly alterou: boolean;
  /** Como a conta estava antes (`undefined`: não era favorita). */
  readonly anterior: Favorito | undefined;
}

/** `lista` sem a conta e, se `novo` vier, com ela no lugar certo (mais recentes primeiro). */
function comFavorito(
  lista: readonly Favorito[],
  contaId: string,
  novo: Favorito | undefined,
): readonly Favorito[] {
  const resto = lista.filter((favorito) => favorito.contaId !== contaId);
  if (novo === undefined) {
    return resto;
  }
  return [novo, ...resto].sort((a, b) =>
    a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : 0,
  );
}

/**
 * Favoritar (`PUT /favoritos/:contaId`) e desfavoritar (`DELETE`) (CA92,
 * CA98). A lista de `useFavoritos` muda na hora, antes da resposta; se a API
 * recusar (404 sem vínculo, 409 `favorito_invalido` ou `limite_de_favoritos`,
 * 429, rede), volta só a conta que mudou, sobre a lista que está no cache
 * agora: outro favorito mexido enquanto isso fica como está. Ao terminar o
 * último pedido no ar, a lista é recarregada para ficar igual à da API. Sem a
 * lista em cache ainda, nada é alterado na hora (só a recarga).
 *
 * `definir` nunca lança: devolve `feito`, `erro` (cru: `ErroDaApi` ou
 * `ErroDeRede`) ou `descartada` (a sessão mudou no meio). Sem conexão falha na
 * hora, sem fila. Dois toques seguidos na mesma conta mandam dois pedidos, na
 * ordem; a recarga final mostra o que a API guardou.
 */
export function useDefinirFavorito() {
  const cliente = useCliente();
  const { geracao } = useSessao();
  const queryClient = useQueryClient();
  const chave = chaves.favoritos();
  const { mutateAsync, isPending } = useMutation<
    void,
    Error,
    EntradaDoFavorito,
    ContextoDoFavorito
  >({
    mutationKey: chave,
    mutationFn: ({ contaId, favorito }) =>
      favorito ? favoritar(cliente, contaId) : desfavoritar(cliente, contaId),
    networkMode: 'always',
    retry: 0,
    gcTime: 0,
    onMutate: async ({ contaId, favorito }) => {
      const geracaoAntes = geracao();
      // Uma recarga em andamento sobrescreveria a mudança com a lista velha.
      await queryClient.cancelQueries({ queryKey: chave, exact: true });
      const lista = queryClient.getQueryData<readonly Favorito[]>(chave);
      if (lista === undefined || geracaoAntes !== geracao()) {
        return { geracao: geracaoAntes, alterou: false, anterior: undefined };
      }
      const anterior = lista.find((item) => item.contaId === contaId);
      queryClient.setQueryData<readonly Favorito[]>(
        chave,
        comFavorito(
          lista,
          contaId,
          favorito
            ? (anterior ?? { contaId, criadoEm: new Date().toISOString() })
            : undefined,
        ),
      );
      return { geracao: geracaoAntes, alterou: true, anterior };
    },
    onError: (_erro, { contaId }, contexto) => {
      if (
        contexto === undefined ||
        !contexto.alterou ||
        contexto.geracao !== geracao()
      ) {
        return;
      }
      queryClient.setQueryData<readonly Favorito[]>(chave, (atual) =>
        atual === undefined
          ? atual
          : comFavorito(atual, contaId, contexto.anterior),
      );
    },
    onSettled: (_dados, _erro, _entrada, contexto) => {
      if (contexto === undefined || contexto.geracao !== geracao()) {
        return;
      }
      // Este pedido ainda conta como em andamento: só o último recarrega.
      if (queryClient.isMutating({ mutationKey: chave }) <= 1) {
        void queryClient.invalidateQueries({
          queryKey: chave,
          refetchType: 'all',
        });
      }
    },
  });

  const definir = useCallback(
    async (
      contaId: string,
      favorito: boolean,
    ): Promise<ResultadoDoFavorito> => {
      const geracaoAntes = geracao();
      try {
        await mutateAsync({ contaId, favorito });
        return geracaoAntes === geracao() ? { tipo: 'feito' } : DESCARTADA;
      } catch (erro) {
        return geracaoAntes === geracao()
          ? { tipo: 'erro', erro: comoErro(erro) }
          : DESCARTADA;
      }
    },
    [geracao, mutateAsync],
  );

  return { definir, definindo: isPending };
}
