import { View } from 'react-native';
import { CartaoDeAnuncio, EstadoVazio, Selo } from '../componentes';
import { espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { EstadoDeTela, Rolavel } from './base';
import type { MeuAnuncioParaExibir, PropsDosMeusAnuncios } from './tipos';

const selo = {
  aberto: { variante: 'aberto', texto: textos.selos.aberto },
  em_andamento: { variante: 'em_andamento', texto: textos.selos.emAndamento },
  ativo: { variante: 'aberto', texto: textos.selos.ativo },
} as const;

export function MeusAnuncios({
  tipo,
  lista,
  semConexao,
  onAbrirItem,
  onPublicar,
  onVoltar,
}: PropsDosMeusAnuncios) {
  const ehTrampo = tipo === 'trampo';
  const vazio = (
    <EstadoVazio
      icone={ehTrampo ? 'briefcase-outline' : 'construct-outline'}
      titulo={
        ehTrampo
          ? textos.meusAnuncios.vazioTrampos
          : textos.meusAnuncios.vazioServicos
      }
      texto={
        ehTrampo
          ? textos.meusAnuncios.vazioTrampoTexto
          : textos.meusAnuncios.vazioServicoTexto
      }
      textoAcao={
        ehTrampo
          ? textos.meusAnuncios.publicarTrampo
          : textos.meusAnuncios.ofertarServico
      }
      onAcao={onPublicar}
    />
  );
  return (
    <Rolavel
      titulo={
        ehTrampo
          ? textos.meusAnuncios.tituloTrampos
          : textos.meusAnuncios.tituloServicos
      }
      onVoltar={onVoltar}
      semConexao={semConexao}
    >
      <EstadoDeTela estado={lista} vazio={vazio}>
        {(itens) =>
          itens.length === 0 ? (
            vazio
          ) : (
            <View style={{ gap: espaco[3] }}>
              {itens.map((item) => (
                <Anuncio key={item.id} item={item} onAbrir={onAbrirItem} />
              ))}
            </View>
          )
        }
      </EstadoDeTela>
    </Rolavel>
  );
}

function Anuncio({
  item,
  onAbrir,
}: {
  item: MeuAnuncioParaExibir;
  onAbrir: (item: MeuAnuncioParaExibir) => void;
}) {
  const { variante, texto } = selo[item.status];
  return (
    <View style={{ gap: espaco[1] }}>
      <Selo variante={variante} texto={texto} />
      <CartaoDeAnuncio
        tipo={item.tipo}
        titulo={item.titulo}
        categoria={item.categoria}
        cidade={item.cidade}
        valorFormatado={item.valorFormatado}
        dataFormatada={item.dataFormatada}
        onPress={() => onAbrir(item)}
      />
    </View>
  );
}
