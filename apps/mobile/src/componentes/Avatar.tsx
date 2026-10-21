import { Text, View } from 'react-native';
import { cores, tipografia } from '../tema/tokens';

export type PropsDoAvatar = {
  nome: string;
  /** Lado em pontos. */
  tamanho?: number;
};

/** Decorativo: o nome sempre aparece em texto ao lado (spec). */
export function Avatar({ nome, tamanho = 48 }: PropsDoAvatar) {
  const inicial = (Array.from(nome.trim())[0] ?? '?').toLocaleUpperCase(
    'pt-BR',
  );
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: tamanho / 2,
        backgroundColor: cores.acento,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          color: cores.branco,
          fontSize: Math.round(tamanho * 0.42),
          fontWeight: tipografia.peso.negrito,
        }}
      >
        {inicial}
      </Text>
    </View>
  );
}
