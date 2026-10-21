import type { Categoria, ItemDaBusca } from '../api/tipos';
import type { ItemParaExibir } from '../telas/tipos';
import {
  formatarCentavos,
  formatarDataHora,
  rotuloDaCategoria,
} from './formatacao';

/**
 * Item de `GET /busca` pronto para o cartão das listas (Início e Buscar):
 * rótulo da categoria (ou o id, se a lista de categorias ainda não chegou),
 * valor do trampo ou preço base do serviço em reais e data de publicação.
 */
export function paraItemParaExibir(
  item: ItemDaBusca,
  categorias: readonly Categoria[],
): ItemParaExibir {
  return {
    tipo: item.tipo,
    id: item.id,
    titulo: item.titulo,
    categoria: rotuloDaCategoria(categorias, item.categoria),
    cidade: item.cidade,
    valorFormatado: formatarCentavos(
      item.tipo === 'trampo' ? item.valorCentavos : item.precoBaseCentavos,
    ),
    dataFormatada: formatarDataHora(item.criadoEm),
  };
}
