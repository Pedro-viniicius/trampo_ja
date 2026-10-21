import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cores, espaco, tipografia, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { estiloDeFoco, useFoco, useMargensSeguras } from './utilitarios';

export type PropsDoCabecalho = {
  titulo: string;
  /** Sem `onVoltar`, o botão não aparece (telas raiz das abas). */
  onVoltar?: () => void;
  rotuloVoltar?: string;
  /** Ações à direita (cada uma deve ter alvo de 44×44). */
  direita?: ReactNode;
};

export function Cabecalho({
  titulo,
  onVoltar,
  rotuloVoltar = textos.gerais.voltar,
  direita,
}: PropsDoCabecalho) {
  const margens = useMargensSeguras();
  const { focado, aoFocar, aoDesfocar } = useFoco();

  return (
    <View
      style={{
        paddingTop: margens.top,
        paddingHorizontal: espaco[2],
        backgroundColor: cores.fundo,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 56,
          gap: espaco[1],
        }}
      >
        {onVoltar ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rotuloVoltar}
            onPress={onVoltar}
            onFocus={aoFocar}
            onBlur={aoDesfocar}
            style={({ pressed }) => [
              {
                width: toqueMinimo,
                height: toqueMinimo,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: toqueMinimo / 2,
                backgroundColor: pressed ? cores.superficie : 'transparent',
              },
              focado && estiloDeFoco,
            ]}
          >
            <Ionicons name="arrow-back" size={24} color={cores.texto} />
          </Pressable>
        ) : (
          <View style={{ width: espaco[2] }} />
        )}
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={{
            flex: 1,
            color: cores.texto,
            fontSize: tipografia.tamanho.tituloDeTela,
            lineHeight: tipografia.lineHeight.tituloDeTela,
            fontWeight: tipografia.peso.negrito,
          }}
        >
          {titulo}
        </Text>
        {direita}
      </View>
    </View>
  );
}
