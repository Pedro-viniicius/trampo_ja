import { useEffect, useRef } from 'react';
import {
  Animated,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { cores, raio } from '../tema/tokens';
import { useReduzirMovimento } from './utilitarios';

export type PropsDoEsqueleto = {
  largura?: DimensionValue;
  altura?: number;
  raioDaBorda?: number;
  estilo?: StyleProp<ViewStyle>;
};

/**
 * Bloco de carregamento. Decorativo: quem o usa deve anunciar o carregamento
 * (ex.: rótulo "Carregando…" no contêiner da lista). Pulsa só se o sistema permitir movimento.
 */
export function Esqueleto({
  largura = '100%',
  altura = 16,
  raioDaBorda = raio.sm,
  estilo,
}: PropsDoEsqueleto) {
  const reduzirMovimento = useReduzirMovimento();
  const opacidade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduzirMovimento) {
      opacidade.setValue(1);
      return;
    }
    const animacao = Animated.loop(
      Animated.sequence([
        Animated.timing(opacidade, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacidade, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animacao.start();
    return () => animacao.stop();
  }, [reduzirMovimento, opacidade]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: largura,
          height: altura,
          borderRadius: raioDaBorda,
          backgroundColor: cores.borda,
          opacity: opacidade,
        },
        estilo,
      ]}
    />
  );
}
