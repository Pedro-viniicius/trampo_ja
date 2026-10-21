import type { ClienteHttp } from './cliente';
import type { Categoria, FiltrosDaBusca, PaginaDaBusca } from './tipos';

/**
 * `GET /busca`. Filtros ausentes ou em branco não vão na URL. A próxima
 * página usa `antesDe` com o `proximoCursor` da anterior.
 */
export async function buscar(
  cliente: ClienteHttp,
  { texto, categoria, cidade, tipo, antesDe, limite }: FiltrosDaBusca = {},
): Promise<PaginaDaBusca> {
  return cliente.get<PaginaDaBusca>('/busca', {
    query: { texto, categoria, cidade, tipo, antesDe, limite },
  });
}

/** `GET /categorias`: as 10 categorias, `[{id, rotulo}]`. */
export async function listarCategorias(
  cliente: ClienteHttp,
): Promise<Categoria[]> {
  return cliente.get<Categoria[]>('/categorias');
}
