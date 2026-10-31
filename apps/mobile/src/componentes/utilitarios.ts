import type { Ionicons } from '@expo/vector-icons';
import {
  type ComponentProps,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { AccessibilityInfo, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { cores } from '../tema/tokens';

export type NomeDeIcone = ComponentProps<typeof Ionicons>['name'];

/** Anel de foco: 2 px com 2 px de afastamento (spec, token color-focus). */
export const estiloDeFoco: ViewStyle = {
  outlineWidth: 2,
  outlineOffset: 2,
  outlineColor: cores.foco,
  outlineStyle: 'solid',
};

export function useFoco(): {
  focado: boolean;
  aoFocar: () => void;
  aoDesfocar: () => void;
} {
  const [focado, setFocado] = useState(false);
  const aoFocar = useCallback(() => setFocado(true), []);
  const aoDesfocar = useCallback(() => setFocado(false), []);
  return { focado, aoFocar, aoDesfocar };
}

/** Segue a preferência "reduzir animações" do sistema. */
export function useReduzirMovimento(): boolean {
  const [reduzir, setReduzir] = useState(false);

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((valor) => {
        if (ativo) setReduzir(valor);
      })
      .catch(() => undefined);
    const assinatura = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduzir,
    );
    return () => {
      ativo = false;
      assinatura.remove();
    };
  }, []);

  return reduzir;
}

/** Margens seguras sem exigir o provider (zeros quando não há). */
export function useMargensSeguras(): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const margens = useContext(SafeAreaInsetsContext);
  return margens ?? { top: 0, bottom: 0, left: 0, right: 0 };
}

const ZWJ = '‍';

/** Conta pontos de código (como `[...t].length` e a API), não unidades UTF-16. */
export function contarPontosDeCodigo(texto: string): number {
  let n = 0;
  for (const _ of texto) n += 1;
  return n;
}

/**
 * Corta em no máximo `limite` pontos de código, nunca no meio de um par
 * substituto (um emoji conta 1). Se o corte deixar um ZWJ solto no fim
 * (família cortada), o ZWJ também sai.
 */
export function cortarEmPontosDeCodigo(texto: string, limite: number): string {
  const max = Math.max(0, Math.floor(limite));
  const pontos = Array.from(texto);
  if (pontos.length <= max) return texto;
  const cortado = pontos.slice(0, max);
  while (cortado.length > 0 && cortado[cortado.length - 1] === ZWJ) {
    cortado.pop();
  }
  return cortado.join('');
}
