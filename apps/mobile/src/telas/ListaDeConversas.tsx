import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar, CampoDeBusca, EstadoVazio } from '../componentes';
import { estiloDeFoco, useFoco } from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { EstadoDeTela, Rolavel } from './base';
import type { ConversaParaExibir, PropsDaListaDeConversas } from './tipos';

/** Sem acento e em minúsculas, para a busca por nome no aparelho. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Conversas (quadro 08): título de aba, busca por nome na lista já carregada
 * (sem chamar a API) e uma linha em cartão por conversa.
 */
export function ListaDeConversas({
  lista,
  semConexao,
  onAbrir,
  modo,
}: PropsDaListaDeConversas) {
  const [busca, setBusca] = useState('');
  const vazio = (
    <EstadoVazio
      icone="message-circle"
      titulo={textos.conversas.vazio}
      texto={textos.conversas.vazioTexto}
    />
  );
  const termo = normalizar(busca);
  return (
    <Rolavel
      titulo={textos.conversas.titulo}
      subtitulo={
        modo === 'contratante'
          ? textos.conversas.subtituloContratante
          : modo === 'freela'
            ? textos.conversas.subtituloFreela
            : undefined
      }
      raiz
      semConexao={semConexao}
    >
      <EstadoDeTela estado={lista} vazio={vazio}>
        {(itens) => {
          if (itens.length === 0) return vazio;
          const filtrados = termo
            ? itens.filter((item) =>
                normalizar(
                  item.nome ?? textos.conversas.perfilIndisponivel,
                ).includes(termo),
              )
            : itens;
          return (
            <>
              <CampoDeBusca
                rotulo={textos.conversas.buscar}
                valor={busca}
                onChangeText={setBusca}
              />
              {filtrados.length === 0 ? (
                <EstadoVazio
                  icone="search"
                  titulo={textos.conversas.semResultadoDaBusca}
                />
              ) : (
                <View style={{ gap: espaco.s }}>
                  {filtrados.map((item) => (
                    <Linha key={item.id} item={item} onAbrir={onAbrir} />
                  ))}
                </View>
              )}
            </>
          );
        }}
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
          minHeight: 72,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.m - 4,
          padding: espaco.m,
          borderRadius: raio.card,
          backgroundColor: pressed ? cores.tinta[100] : cores.superficie,
        },
        pressed ? sombra.md : sombra.sm,
        focado && estiloDeFoco,
      ]}
    >
      <Avatar nome={nome} neutro={item.nome === null} />
      <View style={{ flex: 1, gap: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: espaco.s,
          }}
        >
          <Text
            numberOfLines={1}
            style={[
              estiloDeTexto('corpo', 'negrito'),
              { flex: 1, color: cores.texto },
            ]}
          >
            {nome}
          </Text>
          <Text
            style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
          >
            {item.horaFormatada}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={[estiloDeTexto('corpo'), { color: cores.textoSecundario }]}
        >
          {item.previa ?? textos.conversas.previaVazia}
        </Text>
      </View>
    </Pressable>
  );
}
