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
