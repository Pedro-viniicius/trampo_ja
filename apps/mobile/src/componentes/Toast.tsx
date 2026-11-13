import { Feather } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import {
  cores,
  espaco,
  larguraMaxima,
  raio,
  sombra,
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
  /** Altura de algo fixo embaixo (ex.: rodapé ou barra de abas) que o toast não pode cobrir. */
  deslocamentoInferior?: number;
  /** Ação opcional (ex.: "Desfazer"), em branco e negrito. */
  textoAcao?: string;
  onAcao?: () => void;
};

export function Toast({
  visivel,
  mensagem,
  onFechar,
  rotuloFechar,
  duracaoMs = DURACAO_MINIMA_DO_TOAST_MS,
  deslocamentoInferior = 0,
  textoAcao,
  onAcao,
}: PropsDoToast) {
  const margens = useMargensSeguras();
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const acao = useFoco();
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
        left: espaco.m,
        right: espaco.m,
        bottom: margens.bottom + espaco.m + deslocamentoInferior,
        alignItems: 'center',
      }}
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          {
            width: '100%',
            maxWidth: larguraMaxima,
            flexDirection: 'row',
            alignItems: 'center',
            gap: espaco.m - 4,
            paddingLeft: espaco.m,
            borderRadius: raio.campo,
            backgroundColor: cores.tinta[900],
          },
          sombra.md,
        ]}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 28,
            height: 28,
            borderRadius: raio.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: cores.feedback.sucesso.base,
          }}
        >
          <Feather name="check" size={16} color={cores.branco} />
        </View>
        <Text
          style={[
            estiloDeTexto('corpo'),
            { flex: 1, paddingVertical: espaco.m - 2, color: cores.branco },
          ]}
        >
          {mensagem}
        </Text>
        {textoAcao && onAcao ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textoAcao}
            onPress={onAcao}
            onFocus={acao.aoFocar}
            onBlur={acao.aoDesfocar}
            style={[
              {
                minHeight: toqueMinimo,
                justifyContent: 'center',
                paddingHorizontal: espaco.xs,
              },
              acao.focado && { ...estiloDeFoco, outlineColor: cores.branco },
            ]}
          >
            <Text
              style={[
                estiloDeTexto('corpo', 'negrito'),
                { color: cores.branco },
              ]}
            >
              {textoAcao}
            </Text>
          </Pressable>
        ) : null}
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
          <Feather name="x" size={20} color={cores.branco} />
        </Pressable>
      </View>
    </View>
  );
}
