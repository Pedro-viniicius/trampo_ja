import { Feather } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { useMargensSeguras } from './utilitarios';

export type PropsDaFaixaSemConexao = {
  texto?: string;
  /**
   * `false` esconde a faixa. A raiz mantém o componente montado: ao passar de
   * `true` para `false`, ele anuncia "Conexão de volta." uma vez.
   */
  visivel?: boolean;
};

/**
 * Faixa única de "sem conexão", desenhada na raiz, no topo: ocupa a margem
 * segura de cima (quem a usa zera o `top` do contexto das telas enquanto ela
 * aparece). Nenhuma tela desenha a sua.
 */
export function FaixaSemConexao({
  texto = textos.gerais.semConexaoFaixa,
  visivel = true,
}: PropsDaFaixaSemConexao) {
  const margens = useMargensSeguras();
  const eraVisivel = useRef(false);

  useEffect(() => {
    if (visivel && !eraVisivel.current && Platform.OS === 'ios') {
      // No Android a `liveRegion` basta; no iOS o anúncio é explícito.
      AccessibilityInfo.announceForAccessibility(texto);
    }
    if (!visivel && eraVisivel.current) {
      AccessibilityInfo.announceForAccessibility(textos.gerais.conexaoDeVolta);
    }
    eraVisivel.current = visivel;
  }, [visivel, texto]);

  if (!visivel) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: espaco[2],
        paddingTop: margens.top + espaco[2],
        paddingBottom: espaco[2],
        paddingHorizontal: espaco.m,
        backgroundColor: cores.tinta[900],
      }}
    >
      <Feather name="wifi-off" size={18} color={cores.branco} />
      <Text
        style={[
          estiloDeTexto('legenda', 'semibold'),
          { flexShrink: 1, color: cores.branco, textAlign: 'center' },
        ]}
      >
        {texto}
      </Text>
    </View>
  );
}
