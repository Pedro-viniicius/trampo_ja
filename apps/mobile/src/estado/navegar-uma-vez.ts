import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * `router.push` que ignora o segundo toque. Um toque duplo rápido chama o
 * `onPress` duas vezes antes de a tela perder o foco e empilharia duas cópias
 * do destino (um "Voltar" não bastaria). Depois do primeiro `push`, os
 * seguintes são ignorados até esta tela perder e recuperar o foco (a pessoa
 * voltou a ela); então o próximo toque navega de novo.
 */
export function useNavegarUmaVez(): (destino: Href) => void {
  const router = useRouter();
  const navegando = useRef(false);

  // Roda a cada vez que a tela ganha o foco, inclusive na montagem.
  useFocusEffect(
    useCallback(() => {
      navegando.current = false;
    }, []),
  );

  return useCallback(
    (destino: Href) => {
      if (navegando.current) {
        return;
      }
      navegando.current = true;
      router.push(destino);
    },
    [router],
  );
}
