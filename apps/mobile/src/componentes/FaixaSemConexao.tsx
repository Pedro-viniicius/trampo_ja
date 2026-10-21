import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';

export type PropsDaFaixaSemConexao = {
  texto?: string;
};

/** Faixa logo abaixo do cabeçalho (cada tela a posiciona); quem usa só a renderiza enquanto estiver offline. */
export function FaixaSemConexao({
  texto = textos.gerais.semConexaoFaixa,
}: PropsDaFaixaSemConexao) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: espaco[2],
        paddingVertical: espaco[2],
        paddingHorizontal: espaco[4],
        backgroundColor: cores.texto,
      }}
    >
      <Ionicons name="cloud-offline-outline" size={18} color={cores.branco} />
      <Text
        style={{
          flexShrink: 1,
          color: cores.branco,
          fontSize: tipografia.tamanho.rotulo,
          lineHeight: tipografia.lineHeight.rotulo,
          fontWeight: tipografia.peso.medio,
          textAlign: 'center',
        }}
      >
        {texto}
      </Text>
    </View>
  );
}
