import { Pressable, Text, View } from 'react-native';
import { Avatar, EstadoVazio } from '../componentes';
import { estiloDeFoco, useFoco } from '../componentes/utilitarios';
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { EstadoDeTela, Rolavel } from './base';
import type { ConversaParaExibir, PropsDaListaDeConversas } from './tipos';

export function ListaDeConversas({
  lista,
  semConexao,
  onAbrir,
}: PropsDaListaDeConversas) {
  const vazio = (
    <EstadoVazio
      icone="chatbubbles-outline"
      titulo={textos.conversas.vazio}
      texto={textos.conversas.vazioTexto}
    />
  );
  return (
    <Rolavel titulo={textos.conversas.titulo} semConexao={semConexao}>
      <EstadoDeTela estado={lista} vazio={vazio}>
        {(itens) =>
          itens.length === 0 ? (
            vazio
          ) : (
            <View style={{ gap: espaco[2] }}>
              {itens.map((item) => (
                <Linha key={item.id} item={item} onAbrir={onAbrir} />
              ))}
            </View>
          )
        }
      </EstadoDeTela>
    </Rolavel>
  );
}

function Linha({
  item,
  onAbrir,
}: {
  item: ConversaParaExibir;
  onAbrir: (id: string) => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const nome = item.nome ?? textos.conversas.perfilIndisponivel;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={textos.conversas.linhaDaLista(
        item.nome,
        item.previa,
        item.horaFormatada,
      )}
      onPress={() => onAbrir(item.id)}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: toqueMinimo + espaco[5],
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco[3],
          padding: espaco[3],
          borderRadius: raio.md,
          backgroundColor: pressed ? cores.superficie : cores.fundo,
        },
        focado && estiloDeFoco,
      ]}
    >
      <Avatar nome={nome} neutro={item.nome === null} />
      <View style={{ flex: 1, gap: espaco[1] }}>
        <Text
          numberOfLines={1}
          style={{
            color: cores.texto,
            fontSize: tipografia.tamanho.corpo,
            lineHeight: tipografia.lineHeight.corpo,
            fontWeight: tipografia.peso.semibold,
          }}
        >
          {nome}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: cores.textoSecundario,
            fontSize: tipografia.tamanho.rotulo,
            lineHeight: tipografia.lineHeight.rotulo,
          }}
        >
          {item.previa ?? textos.conversas.previaVazia}
        </Text>
      </View>
      <Text
        style={{
          color: cores.textoSecundario,
          fontSize: tipografia.tamanho.legenda,
          lineHeight: tipografia.lineHeight.legenda,
          alignSelf: 'flex-start',
        }}
      >
        {item.horaFormatada}
      </Text>
    </Pressable>
  );
}
