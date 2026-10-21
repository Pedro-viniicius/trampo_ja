import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

export interface Conexao {
  readonly online: boolean;
}

function inscrever(avisar: () => void): () => void {
  return onlineManager.subscribe(() => avisar());
}

function lerOnline(): boolean {
  return onlineManager.isOnline();
}

/**
 * Estado da conexão segundo o `onlineManager` do TanStack, que
 * `ligarGerenciadores()` liga ao `expo-network`. Usado pela `FaixaSemConexao`.
 */
export function useConexao(): Conexao {
  const online = useSyncExternalStore(inscrever, lerOnline, lerOnline);
  return { online };
}
