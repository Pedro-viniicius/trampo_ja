import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  cores,
  espaco,
  larguraMaxima,
  raio,
  tipografia,
  toqueMinimo,
} from '../tema/tokens';
import { estiloDeFoco, useFoco, useMargensSeguras } from './utilitarios';

/** Duração mínima exigida pela spec (WCAG 2.2.1): 6 s. */
export const DURACAO_MINIMA_DO_TOAST_MS = 6000;

export type PropsDoToast = {
  visivel: boolean;
  mensagem: string;
  onFechar: () => void;
  /** Rótulo do botão de fechar (ex.: "Fechar"). */
  rotuloFechar: string;
  /** Nunca menor que 6 s. */
  duracaoMs?: number;
  /** Altura de algo fixo embaixo (ex.: rodapé com botão) que o toast não pode cobrir. */
  deslocamentoInferior?: number;
};

export function Toast({
  visivel,
  mensagem,
  onFechar,
  rotuloFechar,
  duracaoMs = DURACAO_MINIMA_DO_TOAST_MS,
  deslocamentoInferior = 0,
}: PropsDoToast) {
  const margens = useMargensSeguras();
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const aoFecharRef = useRef(onFechar);
  aoFecharRef.current = onFechar;

  useEffect(() => {
    if (!visivel) return;
    // iOS ignora liveRegion: anuncia à mão. No Android vale a liveRegion (um anúncio só).
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(mensagem);
    }
    const espera = setTimeout(
      () => aoFecharRef.current(),
      Math.max(duracaoMs, DURACAO_MINIMA_DO_TOAST_MS),
    );
    return () => clearTimeout(espera);
  }, [visivel, mensagem, duracaoMs]);

  if (!visivel) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: espaco[4],
        right: espaco[4],
        bottom: margens.bottom + espaco[4] + deslocamentoInferior,
        alignItems: 'center',
      }}
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{
          width: '100%',
          maxWidth: larguraMaxima,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco[2],
          paddingLeft: espaco[4],
          borderRadius: raio.md,
          backgroundColor: cores.texto,
        }}
      >
        <Ionicons name="checkmark-circle" size={20} color={cores.branco} />
        <Text
          style={{
            flex: 1,
            paddingVertical: espaco[3],
            color: cores.branco,
            fontSize: tipografia.tamanho.rotulo,
            lineHeight: tipografia.lineHeight.rotulo,
          }}
        >
          {mensagem}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rotuloFechar}
          onPress={onFechar}
          onFocus={aoFocar}
          onBlur={aoDesfocar}
          style={[
            {
              width: toqueMinimo,
              height: toqueMinimo,
              alignItems: 'center',
              justifyContent: 'center',
            },
            focado && { ...estiloDeFoco, outlineColor: cores.branco },
          ]}
        >
          <Ionicons name="close" size={20} color={cores.branco} />
        </Pressable>
      </View>
    </View>
  );
}
