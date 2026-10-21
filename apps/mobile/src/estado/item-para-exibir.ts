import type { Categoria, ItemDaBusca, Servico, Trampo } from '../api/tipos';
import type { ItemParaExibir, MeuAnuncioParaExibir } from '../telas/tipos';
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

/**
 * Trampo ou serviço de `GET /trampos/meus` ou `GET /servicos/meus` pronto
 * para Meus anúncios: igual ao cartão das listas, mais o status. O serviço
 * pode não ter cidade (`null`).
 */
export function meuAnuncioParaExibir(
  anuncio: Trampo | Servico,
  categorias: readonly Categoria[],
): MeuAnuncioParaExibir {
  const base = {
    id: anuncio.id,
    titulo: anuncio.titulo,
    categoria: rotuloDaCategoria(categorias, anuncio.categoria),
    cidade: anuncio.cidade,
    dataFormatada: formatarDataHora(anuncio.criadoEm),
    status: anuncio.status,
  };
  if ('valorCentavos' in anuncio) {
    return {
      ...base,
      tipo: 'trampo',
      valorFormatado: formatarCentavos(anuncio.valorCentavos),
    };
  }
  return {
    ...base,
    tipo: 'servico',
    valorFormatado: formatarCentavos(anuncio.precoBaseCentavos),
  };
}
