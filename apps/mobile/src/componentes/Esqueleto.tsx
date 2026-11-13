import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  type DimensionValue,
  Easing,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { cores, movimento, raio } from '../tema/tokens';
import { useReduzirMovimento } from './utilitarios';

export type PropsDoEsqueleto = {
  largura?: DimensionValue;
  altura?: number;
  /** Igual ao do elemento real (padrão: raio de chip, 8). */
  raioDaBorda?: number;
  estilo?: StyleProp<ViewStyle>;
};

/**
 * Bloco de carregamento: fundo tinta 100 com um brilho que atravessa em 1,4 s.
 * Decorativo: quem o usa anuncia o carregamento (ex.: rótulo "Carregando…" no
 * contêiner da lista). Com "reduzir movimento", fica parado.
 */
export function Esqueleto({
  largura = '100%',
  altura = 16,
  raioDaBorda = raio.chip,
  estilo,
}: PropsDoEsqueleto) {
  const reduzirMovimento = useReduzirMovimento();
  const progresso = useRef(new Animated.Value(0)).current;
  const [larguraMedida, setLarguraMedida] = useState(0);

  useEffect(() => {
    if (reduzirMovimento || larguraMedida === 0) {
      progresso.setValue(0);
      return;
    }
    const animacao = Animated.loop(
      Animated.timing(progresso, {
        toValue: 1,
        duration: movimento.esqueletoMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animacao.start();
    return () => animacao.stop();
  }, [reduzirMovimento, larguraMedida, progresso]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(evento) => setLarguraMedida(evento.nativeEvent.layout.width)}
      style={[
        {
          width: largura,
          height: altura,
          borderRadius: raioDaBorda,
          backgroundColor: cores.tinta[100],
          overflow: 'hidden',
        },
        estilo,
      ]}
    >
      {!reduzirMovimento && larguraMedida > 0 ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                {
                  translateX: progresso.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-larguraMedida, larguraMedida],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[cores.tinta[100], cores.tinta[50], cores.tinta[100]]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
