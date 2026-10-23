import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../tema/tokens';
import { estiloDeFoco, type NomeDeIcone, useFoco } from './utilitarios';

export type PropsDaLinhaDeConfiguracao = {
  titulo: string;
  descricao?: string;
  icone: NomeDeIcone;
  /** Ação sem volta (ex.: excluir): texto e ícone na cor de erro. */
  destrutiva?: boolean;
  desabilitada?: boolean;
  onPress: () => void;
};

const ALTURA_MINIMA = 56;

/** Linha de lista de configurações: ícone, título, descrição e seta. Toda a linha é tocável. */
export function LinhaDeConfiguracao({
  titulo,
  descricao,
  icone,
  destrutiva = false,
  desabilitada = false,
  onPress,
}: PropsDaLinhaDeConfiguracao) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const corDoTitulo = destrutiva ? cores.erro : cores.texto;
  const corDoIcone = destrutiva ? cores.erro : cores.textoSecundario;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={descricao ? `${titulo}. ${descricao}` : titulo}
      accessibilityState={{ disabled: desabilitada }}
      disabled={desabilitada}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: ALTURA_MINIMA,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco[3],
          paddingVertical: espaco[2],
          paddingHorizontal: espaco[2],
          backgroundColor: pressed ? cores.superficie : 'transparent',
          opacity: desabilitada ? 0.5 : 1,
        },
        focado && estiloDeFoco,
      ]}
    >
      <Ionicons
        name={icone}
        size={24}
        color={corDoIcone}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: corDoTitulo,
            fontSize: tipografia.tamanho.corpo,
            lineHeight: tipografia.lineHeight.corpo,
            fontWeight: tipografia.peso.medio,
          }}
        >
          {titulo}
        </Text>
        {descricao ? (
          <Text
            style={{
              color: cores.textoSecundario,
              fontSize: tipografia.tamanho.legenda,
              lineHeight: tipografia.lineHeight.legenda,
            }}
          >
            {descricao}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={cores.textoSecundario}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}
