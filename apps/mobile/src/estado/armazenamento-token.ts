import * as SecureStore from 'expo-secure-store';

/**
 * Porta do token da sessão. É o único caminho do token no app (CA15): nada
 * de estado do React, AsyncStorage, URL, parâmetro de rota ou log.
 */
export interface ArmazenamentoDeToken {
  /** O token guardado, ou `null` sem sessão. */
  ler(): Promise<string | null>;
  gravar(token: string): Promise<void>;
  /** Apaga o token; sem token guardado, não faz nada. */
  apagar(): Promise<void>;
}

/** Chave fixa no `expo-secure-store` (letras, `.`, `-` e `_`). */
export const CHAVE_DO_TOKEN = 'trampoja.token';

/**
 * Falha do armazenamento seguro. A mensagem é fixa e não há `cause`: o erro
 * nativo pode trazer detalhes do keychain/keystore que não interessam a quem
 * chama, e nunca deve carregar o token.
 */
export class ErroDoArmazenamento extends Error {
  override readonly name = 'ErroDoArmazenamento';
  readonly operacao: 'ler' | 'gravar' | 'apagar';

  constructor(operacao: 'ler' | 'gravar' | 'apagar') {
    super(`falha ao ${operacao} o token`);
    this.operacao = operacao;
  }
}

/**
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (iOS): o token só é lido com o aparelho
 * desbloqueado e não vai para backup nem para outro aparelho. No Android, o
 * `expo-secure-store` cifra com chave do Keystore.
 */
const OPCOES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Adaptador real, sobre o `expo-secure-store`. */
export function criarArmazenamentoSeguro(): ArmazenamentoDeToken {
  return {
    async ler() {
      try {
        const token = await SecureStore.getItemAsync(CHAVE_DO_TOKEN, OPCOES);
        return token === null || token === '' ? null : token;
      } catch {
        throw new ErroDoArmazenamento('ler');
      }
    },
    async gravar(token) {
      try {
        await SecureStore.setItemAsync(CHAVE_DO_TOKEN, token, OPCOES);
      } catch {
        throw new ErroDoArmazenamento('gravar');
      }
    },
    async apagar() {
      try {
        await SecureStore.deleteItemAsync(CHAVE_DO_TOKEN, OPCOES);
      } catch {
        throw new ErroDoArmazenamento('apagar');
      }
    },
  };
}

/** Fake em memória para os testes, com o mesmo contrato do adaptador real. */
export interface ArmazenamentoEmMemoria extends ArmazenamentoDeToken {
  /** O token guardado agora, sem passar pela porta (só para asserção). */
  readonly atual: () => string | null;
}

export function criarArmazenamentoEmMemoria(
  inicial: string | null = null,
): ArmazenamentoEmMemoria {
  let token: string | null = inicial === '' ? null : inicial;
  return {
    async ler() {
      return token;
    },
    async gravar(novo) {
      token = novo;
    },
    async apagar() {
      token = null;
    },
    atual: () => token,
  };
}
