import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { cores, espaco, raio, tipografia } from '../tema/tokens';
import { useMargensSeguras } from './utilitarios';

export type PropsDoCabecalhoGradiente = {
  /** Texto grande em negrito (22 pt), único tamanho que passa 3:1 sobre o gradiente. */
  titulo?: string;
  /** Normalmente a `Logo`. */
  children?: ReactNode;
};

export function CabecalhoGradiente({
  titulo,
  children,
}: PropsDoCabecalhoGradiente) {
  const margens = useMargensSeguras();
  return (
    <LinearGradient
      colors={[...cores.gradiente]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={{
        alignItems: 'center',
        gap: espaco[3],
        paddingTop: margens.top + espaco[5],
        paddingBottom: espaco[5],
        paddingHorizontal: espaco[4],
        borderBottomLeftRadius: raio.lg,
        borderBottomRightRadius: raio.lg,
      }}
    >
      {children}
      {titulo ? (
        <Text
          accessibilityRole="header"
          style={{
            color: cores.branco,
            fontSize: tipografia.tamanho.tituloDeTela,
            lineHeight: tipografia.lineHeight.tituloDeTela,
            fontWeight: tipografia.peso.negrito,
            textAlign: 'center',
          }}
        >
          {titulo}
        </Text>
      ) : null}
    </LinearGradient>
  );
}
