import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra, toqueMinimo } from '../tema/tokens';
import { estiloDeFoco, type NomeDeIcone, useFoco } from './utilitarios';

export type PropsDoCartaoDeConteudo = {
  titulo: string;
  resumo: string;
  /** Ex.: "Dica rápida" ou "Minicurso". */
  tipo: string;
  /** Ex.: "3 min". */
  duracao: string;
  icone?: NomeDeIcone;
  onPress: () => void;
};

/** Cartão de Dicas & minicursos: ícone, título, resumo em 2 linhas, tipo e duração. */
export function CartaoDeConteudo({
  titulo,
  resumo,
  tipo,
  duracao,
  icone = 'book-open',
  onPress,
}: PropsDoCartaoDeConteudo) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${tipo}, ${duracao}. ${resumo}`}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          gap: espaco.m,
          padding: espaco.m,
          borderRadius: raio.card,
          backgroundColor: pressed ? cores.tinta[50] : cores.superficie,
        },
        pressed ? sombra.md : sombra.sm,
        focado && estiloDeFoco,
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: toqueMinimo,
          height: toqueMinimo,
          borderRadius: raio.campo,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: cores.azul[50],
        }}
      >
        <Feather name={icone} size={22} color={cores.primaria} />
      </View>
      <View style={{ flex: 1, gap: espaco.xs }}>
        <Text
          numberOfLines={2}
          style={[estiloDeTexto('h3'), { color: cores.texto }]}
        >
          {titulo}
        </Text>
        <Text
          numberOfLines={2}
          style={[estiloDeTexto('corpo'), { color: cores.textoSecundario }]}
        >
          {resumo}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: espaco.s,
            marginTop: espaco.xs,
          }}
        >
          <Text style={[estiloDeTexto('sobretitulo'), { color: cores.acento }]}>
            {tipo}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: espaco.xs,
            }}
          >
            <Feather name="clock" size={14} color={cores.textoSecundario} />
            <Text
              style={[
                estiloDeTexto('legenda'),
                { color: cores.textoSecundario },
              ]}
            >
              {duracao}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
