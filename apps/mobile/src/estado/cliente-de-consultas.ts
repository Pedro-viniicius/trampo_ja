import {
  focusManager,
  onlineManager,
  QueryClient,
} from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';
import { ehErroDaApi } from '../api/erros';

/** Tempo em que um dado buscado conta como fresco. */
export const TEMPO_FRESCO_MS = 30_000;
/** Tempo em que um dado sem tela que o use fica no cache. */
export const TEMPO_NO_CACHE_MS = 5 * 60_000;

/**
 * Tenta de novo uma vez, e só quando a falha pode ser passageira: queda de
 * rede (`ErroDeRede`) ou 5xx. Um 4xx (404, 401, 429 e afins) repetiria a
 * mesma resposta, e o 429 pioraria o limite.
 */
export function deveTentarDeNovo(falhas: number, erro: unknown): boolean {
  if (falhas >= 1) {
    return false;
  }
  return !(ehErroDaApi(erro) && erro.status < 500);
}

/**
 * `QueryClient` do app: 1 nova tentativa nas consultas (ver
 * `deveTentarDeNovo`), nenhuma nas mutações, dado fresco por 30 s e cache por
 * 5 min. A sessão limpa este cliente ao sair e ao expirar (CA14).
 */
export function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: deveTentarDeNovo,
        staleTime: TEMPO_FRESCO_MS,
        gcTime: TEMPO_NO_CACHE_MS,
      },
      mutations: { retry: 0 },
    },
  });
}

/**
 * Com conexão, a não ser que o sistema diga claramente que não há. Estado
 * desconhecido conta como conectado: se a rede estiver mesmo fora, a
 * requisição falha com `ErroDeRede` em vez de ficar pausada para sempre.
 * `isInternetReachable` fica de fora porque a API roda na rede local em
 * desenvolvimento, sem acesso à internet garantido.
 */
export function estaConectado(estado: Network.NetworkState): boolean {
  return estado.isConnected !== false;
}

/**
 * Liga o `onlineManager` do TanStack ao `expo-network` e o `focusManager` ao
 * `AppState` (app em primeiro plano = em foco). Devolve a função que desliga
 * os dois. Chame uma vez, na raiz do app.
 */
export function ligarGerenciadores(): () => void {
  onlineManager.setEventListener((definirOnline) => {
    let ativo = true;
    let recebeuEvento = false;
    const inscricao = Network.addNetworkStateListener((estado) => {
      recebeuEvento = true;
      definirOnline(estaConectado(estado));
    });
    Network.getNetworkStateAsync().then(
      (estado) => {
        // Um evento que chegou antes desta leitura é mais novo que ela.
        if (ativo && !recebeuEvento) {
          definirOnline(estaConectado(estado));
        }
      },
      () => {
        // Sem leitura inicial, vale o último estado conhecido.
      },
    );
    return () => {
      ativo = false;
      inscricao.remove();
    };
  });

  focusManager.setEventListener((definirFoco) => {
    const inscricao = AppState.addEventListener(
      'change',
      (estado: AppStateStatus) => {
        definirFoco(estado === 'active');
      },
    );
    return () => inscricao.remove();
  });

  return () => {
    // Trocar o listener chama a limpeza do anterior.
    onlineManager.setEventListener(() => undefined);
    focusManager.setEventListener(() => undefined);
  };
}
