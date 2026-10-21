import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { buscar, listarCategorias } from '../../api/busca';
import type { Categoria, ItemDaBusca, PaginaDaBusca } from '../../api/tipos';
import { useCliente } from '../sessao';
import { chaves, type FiltrosDeConsulta, normalizarFiltros } from './chaves';

/** Tamanho da página da busca (a API assume o mesmo valor). */
export const LIMITE_DA_BUSCA = 20;
/** Quantos itens o Início pede por tipo. */
export const LIMITE_DOS_RECENTES = 10;

export interface OpcoesDaBusca {
  /**
   * A busca só dispara quando for verdadeiro (a pessoa enviou o formulário).
   * Padrão: `true`.
   */
  readonly habilitado?: boolean;
}

/**
 * `GET /busca` paginada por cursor: cada página seguinte usa `antesDe` com o
 * `proximoCursor` da anterior, e `proximoCursor: null` encerra a lista.
 * Campos em branco não vão na query (CA7).
 */
export function useBusca(
  filtros: FiltrosDeConsulta,
  { habilitado = true }: OpcoesDaBusca = {},
) {
  const cliente = useCliente();
  const normalizados = normalizarFiltros(filtros);
  const consulta = useInfiniteQuery<
    PaginaDaBusca,
    Error,
    { pages: PaginaDaBusca[] },
    ReturnType<typeof chaves.busca>,
    string | undefined
  >({
    queryKey: chaves.busca(normalizados),
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      buscar(cliente, {
        ...normalizados,
        ...(pageParam !== undefined && { antesDe: pageParam }),
        limite: LIMITE_DA_BUSCA,
      }),
    getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
    enabled: habilitado,
  });
  const itens: ItemDaBusca[] = (consulta.data?.pages ?? []).flatMap(
    (pagina) => pagina.itens,
  );
  return {
    itens,
    temMais: consulta.hasNextPage,
    /**
     * Pede a próxima página. Com uma já em andamento, a chamada é ignorada
     * (`cancelRefetch: false`): duplo toque não cancela a primeira nem pede
     * a mesma página duas vezes.
     */
    carregarMais: () => {
      if (consulta.hasNextPage) {
        return consulta.fetchNextPage({ cancelRefetch: false });
      }
      return Promise.resolve();
    },
    carregando: consulta.isLoading,
    carregandoMais: consulta.isFetchingNextPage,
    erro: consulta.error,
    /** Erro ao pedir a página seguinte; as páginas já carregadas continuam em `itens`. */
    erroAoCarregarMais: consulta.isFetchNextPageError ? consulta.error : null,
    recarregar: () => consulta.refetch(),
  };
}

/** Últimos anúncios de um tipo para o Início: `GET /busca?tipo=…&limite=10`. */
export function useRecentes(tipo: 'trampos' | 'servicos') {
  const cliente = useCliente();
  const consulta = useQuery<PaginaDaBusca, Error>({
    queryKey: chaves.recentes(tipo),
    queryFn: () => buscar(cliente, { tipo, limite: LIMITE_DOS_RECENTES }),
  });
  return {
    itens: consulta.data?.itens ?? [],
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

/**
 * `GET /categorias`. A lista é fixa no MVP: nunca fica velha nem sai do
 * cache enquanto o app roda (a sessão ainda a apaga ao sair).
 */
export function useCategorias() {
  const cliente = useCliente();
  const consulta = useQuery<Categoria[], Error>({
    queryKey: chaves.categorias(),
    queryFn: () => listarCategorias(cliente),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  return {
    categorias: consulta.data ?? [],
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}
