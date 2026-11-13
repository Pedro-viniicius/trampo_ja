import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, margemDaTela, raio } from '../tema/tokens';
import { FormaDecorativa } from './FaixaDeDestaque';
import { pontosDoGradiente, useMargensSeguras } from './utilitarios';

export type PropsDoCabecalhoGradiente = {
  /** Título branco em `h2` (24 pt): sobre o gradiente de marca, só texto grande passa 3:1. */
  titulo?: string;
  /** Normalmente a `Logo`. */
  children?: ReactNode;
};

/** Topo da Entrada: gradiente de marca, círculo decorativo e o conteúdo centralizado. */
export function CabecalhoGradiente({
  titulo,
  children,
}: PropsDoCabecalhoGradiente) {
  const margens = useMargensSeguras();
  return (
    <LinearGradient
      colors={[...cores.gradienteMarca]}
      {...pontosDoGradiente}
      style={{
        alignItems: 'center',
        gap: espaco.m,
        paddingTop: margens.top + espaco.l,
        paddingBottom: espaco.l,
        paddingHorizontal: margemDaTela,
        borderBottomLeftRadius: raio.folha,
        borderBottomRightRadius: raio.folha,
        overflow: 'hidden',
      }}
    >
      <FormaDecorativa
        lado={220}
        cor={cores.roxo[300]}
        topo={-60}
        direita={-70}
        opacidade={0.6}
      />
      {children}
      {titulo ? (
        <Text
          accessibilityRole="header"
          style={[
            estiloDeTexto('h2'),
            { color: cores.branco, textAlign: 'center' },
          ]}
        >
          {titulo}
        </Text>
      ) : null}
    </LinearGradient>
  );
}
