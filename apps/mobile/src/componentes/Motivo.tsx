import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco } from '../tema/tokens';

export type PropsDoMotivo = {
  texto: string;
};

/** Explica por que o botão acima está desabilitado. Fica sempre abaixo do botão. */
export function Motivo({ texto }: PropsDoMotivo) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: espaco.xs }}
    >
      <Feather
        name="info"
        size={14}
        color={cores.textoSecundario}
        style={{ marginTop: 2 }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text
        style={[
          estiloDeTexto('legenda'),
          { flex: 1, color: cores.textoSecundario },
        ]}
      >
        {texto}
      </Text>
    </View>
  );
}
