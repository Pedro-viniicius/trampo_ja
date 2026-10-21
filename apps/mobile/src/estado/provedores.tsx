import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { FuncaoFetch } from '../api/cliente';
import type { ArmazenamentoDeToken } from './armazenamento-token';
import { SessaoProvider } from './sessao';

export interface PropsDosProvedores {
  readonly armazenamento: ArmazenamentoDeToken;
  readonly queryClient: QueryClient;
  /** Padrão: `globalThis.fetch`. Os testes passam o fake. */
  readonly fetch?: FuncaoFetch;
  /** Padrão: `urlDaApi()`. */
  readonly urlBase?: string;
  readonly children: ReactNode;
}

/** Guarda a rota atual num ref, sem fazer a raiz renderizar de novo. */
function RastreadorDeRota({
  destino,
}: {
  readonly destino: RefObject<string | undefined>;
}) {
  const rota = usePathname();
  useEffect(() => {
    destino.current = rota;
  }, [destino, rota]);
  return null;
}

/**
 * Provedores do app: `QueryClientProvider` e `SessaoProvider`, com a rota
 * atual (do Expo Router) ligada à sessão para o retorno depois de um 401
 * (CA14). As dependências vêm por props: a raiz passa as reais, os testes de
 * rota passam os fakes. Fica fora de `src/app/` porque todo arquivo de lá
 * vira rota.
 */
export function Provedores({
  armazenamento,
  queryClient,
  fetch,
  urlBase,
  children,
}: PropsDosProvedores) {
  const rotaAtual = useRef<string | undefined>(undefined);
  const obterRotaAtual = useCallback(() => rotaAtual.current, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SessaoProvider
        armazenamento={armazenamento}
        queryClient={queryClient}
        obterRotaAtual={obterRotaAtual}
        {...(fetch !== undefined && { fetch })}
        {...(urlBase !== undefined && { urlBase })}
      >
        <RastreadorDeRota destino={rotaAtual} />
        {children}
      </SessaoProvider>
    </QueryClientProvider>
  );
}
