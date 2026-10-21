import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../tema/tokens';
import { Botao } from './Botao';
import type { NomeDeIcone } from './utilitarios';

export type PropsDoEstadoVazio = {
  icone: NomeDeIcone;
  titulo: string;
  texto?: string;
  textoAcao?: string;
  onAcao?: () => void;
};

export function EstadoVazio({
  icone,
  titulo,
  texto,
  textoAcao,
  onAcao,
}: PropsDoEstadoVazio) {
  return (
    <View
      style={{
        alignItems: 'center',
        gap: espaco[2],
        paddingVertical: espaco[6],
        paddingHorizontal: espaco[4],
      }}
    >
      <Ionicons
        name={icone}
        size={48}
        color={cores.acento}
        accessibilityElementsHidden
      />
      <Text
        accessibilityRole="header"
        style={{
          color: cores.texto,
          fontSize: tipografia.tamanho.tituloDeSeção,
          lineHeight: tipografia.lineHeight.tituloDeSeção,
          fontWeight: tipografia.peso.semibold,
          textAlign: 'center',
        }}
      >
        {titulo}
      </Text>
      {texto ? (
        <Text
          style={{
            color: cores.textoSecundario,
            fontSize: tipografia.tamanho.corpo,
            lineHeight: tipografia.lineHeight.corpo,
            textAlign: 'center',
          }}
        >
          {texto}
        </Text>
      ) : null}
      {textoAcao && onAcao ? (
        <View style={{ marginTop: espaco[2], alignSelf: 'stretch' }}>
          <Botao texto={textoAcao} onPress={onAcao} />
        </View>
      ) : null}
    </View>
  );
}
