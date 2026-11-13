import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import {
  type ArmazenamentoDeToken,
  criarArmazenamentoEmMemoria,
} from '../estado/armazenamento-token';
import {
  type ArmazenamentoDoModo,
  criarArmazenamentoDoModoEmMemoria,
  type Modo,
  ModoProvider,
} from '../estado/modo';
import { SessaoProvider } from '../estado/sessao';
import { criarFetchFalso, type FetchFalso } from './fetch-falso';

export const URL_BASE_DE_TESTE = 'https://api.teste';

export interface OpcoesDosProvedores {
  /** Padrão: fake em memória, sem token (sessão anônima). */
  readonly armazenamento?: ArmazenamentoDeToken;
  /**
   * Modo gravado no fake do modo. Padrão: `null` (nada gravado: abre em
   * freela). Ignorado se `armazenamentoDoModo` vier.
   */
  readonly modo?: Modo | null;
  /** Padrão: fake em memória com `modo`. */
  readonly armazenamentoDoModo?: ArmazenamentoDoModo;
  /** Padrão: `criarFetchFalso()` sem rotas (tudo responde 404). */
  readonly fetch?: FetchFalso;
  /** Padrão: `criarQueryClientDeTeste()`. */
  readonly queryClient?: QueryClient;
  /** Padrão: `URL_BASE_DE_TESTE`. */
  readonly urlBase?: string;
  /** Ver `PropsDoSessaoProvider.obterRotaAtual`. */
  readonly obterRotaAtual?: () => string | undefined;
}

export interface Provedores {
  /** Para `render(ui, { wrapper })` e `renderHook(fn, { wrapper })`. */
  readonly wrapper: (props: { children: ReactNode }) => ReactElement;
  readonly armazenamento: ArmazenamentoDeToken;
  readonly armazenamentoDoModo: ArmazenamentoDoModo;
  readonly fetch: FetchFalso;
  readonly queryClient: QueryClient;
}

/**
 * `QueryClient` para teste: sem nova tentativa (o erro aparece na hora) e sem
 * coleta do cache por tempo (nenhum timer pendente no fim do teste).
 */
export function criarQueryClientDeTeste(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  });
}

/** Monta `QueryClientProvider` + `SessaoProvider` + `ModoProvider` com fakes. */
export function criarProvedores({
  armazenamento = criarArmazenamentoEmMemoria(),
  modo = null,
  armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria(modo),
  fetch = criarFetchFalso(),
  queryClient = criarQueryClientDeTeste(),
  urlBase = URL_BASE_DE_TESTE,
  obterRotaAtual,
}: OpcoesDosProvedores = {}): Provedores {
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessaoProvider
          armazenamento={armazenamento}
          queryClient={queryClient}
          fetch={fetch.fetch}
          urlBase={urlBase}
          {...(obterRotaAtual !== undefined && { obterRotaAtual })}
        >
          <ModoProvider armazenamento={armazenamentoDoModo}>
            {children}
          </ModoProvider>
        </SessaoProvider>
      </QueryClientProvider>
    );
  }
  return { wrapper, armazenamento, armazenamentoDoModo, fetch, queryClient };
}

/**
 * `render` do RNTL dentro dos provedores do app. Devolve o resultado do RNTL
 * mais os handles: armazenamento, armazenamento do modo, fetch falso e
 * `queryClient`.
 *
 * ```ts
 * const { fetch } = await renderizar(<Tela />, {
 *   armazenamento: criarArmazenamentoEmMemoria('token'),
 * });
 * fetch.responder('GET /perfis/eu', { status: 404 });
 * ```
 */
export async function renderizar(
  ui: ReactElement,
  opcoes: OpcoesDosProvedores = {},
) {
  const { wrapper, ...handles } = criarProvedores(opcoes);
  const resultado = await render(ui, { wrapper });
  return { ...resultado, ...handles };
}
