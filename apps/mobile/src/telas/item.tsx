import { CartaoDeAnuncio } from '../componentes';
import type { ItemParaExibir } from './tipos';

/** Cartão de um item de lista; tudo já chega formatado do contêiner. */
export function CartaoDoItem({
  item,
  onAbrir,
}: {
  item: ItemParaExibir;
  onAbrir: (item: ItemParaExibir) => void;
}) {
  return (
    <CartaoDeAnuncio
      tipo={item.tipo}
      titulo={item.titulo}
      categoria={item.categoria}
      cidade={item.cidade}
      valorFormatado={item.valorFormatado}
      dataFormatada={item.dataFormatada}
      prazoFormatado={item.prazoFormatado}
      onPress={() => onAbrir(item)}
    />
  );
}
