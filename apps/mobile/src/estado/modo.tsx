import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Modo de navegação (ADR-010): o mesmo app, com as abas de quem procura
 * trampo (`freela`) ou de quem contrata (`contratante`).
 */
export type Modo = 'freela' | 'contratante';

/** Sem modo gravado, ou com valor inválido, a conta abre no modo freela (CA75). */
export const MODO_PADRAO: Modo = 'freela';

/** Chave fixa no `expo-secure-store` (letras, `.`, `-` e `_`). */
export const CHAVE_DO_MODO = 'trampoja.modo';

export function ehModo(valor: unknown): valor is Modo {
  return valor === 'freela' || valor === 'contratante';
}

/**
 * Porta da persistência do modo. O modo é preferência do aparelho (P3): não
 * vai para a API, não sai ao sair da conta e não é segredo, mas também não
 * vai para log nem para URL.
 */
export interface ArmazenamentoDoModo {
  /** O modo gravado, ou `null` sem modo (ou com valor inválido). Pode lançar. */
  ler(): Promise<Modo | null>;
  /** Pode lançar. */
  gravar(modo: Modo): Promise<void>;
}

/**
 * Falha do armazenamento do modo. Mensagem fixa e sem `cause`: o erro nativo
 * do keychain/keystore não interessa a quem chama.
 */
export class ErroDoArmazenamentoDoModo extends Error {
  override readonly name = 'ErroDoArmazenamentoDoModo';
  readonly operacao: 'ler' | 'gravar';

  constructor(operacao: 'ler' | 'gravar') {
    super(`falha ao ${operacao} o modo`);
    this.operacao = operacao;
  }
}

/** As mesmas opções do token: só neste aparelho, fora do backup. */
const OPCOES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Adaptador real, sobre o `expo-secure-store` (sem dependência nova;
 * AsyncStorage é proibido no app). Valor fora de `Modo` é lido como `null`.
 */
export function criarArmazenamentoDoModoSeguro(): ArmazenamentoDoModo {
  return {
    async ler() {
      let valor: string | null;
      try {
        valor = await SecureStore.getItemAsync(CHAVE_DO_MODO, OPCOES);
      } catch {
        throw new ErroDoArmazenamentoDoModo('ler');
      }
      return ehModo(valor) ? valor : null;
    },
    async gravar(modo) {
      try {
        await SecureStore.setItemAsync(CHAVE_DO_MODO, modo, OPCOES);
      } catch {
        throw new ErroDoArmazenamentoDoModo('gravar');
      }
    },
  };
}

/** Fake em memória para os testes, com o mesmo contrato do adaptador real. */
export interface ArmazenamentoDoModoEmMemoria extends ArmazenamentoDoModo {
  /** O modo guardado agora, sem passar pela porta (só para asserção). */
  readonly atual: () => Modo | null;
}

export function criarArmazenamentoDoModoEmMemoria(
  inicial: Modo | null = null,
): ArmazenamentoDoModoEmMemoria {
  let modo: Modo | null = inicial;
  return {
    async ler() {
      return modo;
    },
    async gravar(novo) {
      modo = novo;
    },
    atual: () => modo,
  };
}

/** O que `useModo()` expõe. */
export interface EstadoDoModo {
  readonly modo: Modo;
  /**
   * Troca o modo na hora (as abas mudam no mesmo render) e grava no
   * armazenamento em segundo plano. Não chama a API. Se gravar falhar, o modo
   * novo vale até fechar o app. A promessa resolve depois da gravação e nunca
   * rejeita.
   */
  definirModo(modo: Modo): Promise<void>;
}

const ContextoDoModo = createContext<EstadoDoModo | null>(null);

export interface PropsDoModoProvider {
  readonly armazenamento: ArmazenamentoDoModo;
  readonly children: ReactNode;
}

/**
 * Lê o modo gravado e só então desenha os filhos: o app nunca pisca o modo
 * padrão antes do gravado (a splash continua enquanto isso, porque a
 * `NavegacaoRaiz` ainda não montou). Leitura que falha ou valor inválido dá o
 * modo freela. As gravações rodam em fila, na ordem em que foram pedidas: o
 * último modo escolhido é o que fica gravado.
 */
export function ModoProvider({ armazenamento, children }: PropsDoModoProvider) {
  const [modo, setModo] = useState<Modo | null>(null);
  const fila = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let montado = true;
    armazenamento
      .ler()
      .then(
        (lido) => (ehModo(lido) ? lido : MODO_PADRAO),
        // Sem log: o modo padrão basta.
        () => MODO_PADRAO,
      )
      .then((inicial) => {
        if (montado) setModo(inicial);
      });
    return () => {
      montado = false;
    };
  }, [armazenamento]);

  const definirModo = useCallback(
    (novo: Modo): Promise<void> => {
      setModo(novo);
      const gravacao = fila.current
        .catch(() => undefined)
        .then(() => armazenamento.gravar(novo))
        // Sem log: o modo novo continua valendo na memória.
        .catch(() => undefined);
      fila.current = gravacao;
      return gravacao;
    },
    [armazenamento],
  );

  const valor = useMemo<EstadoDoModo | null>(
    () => (modo === null ? null : { modo, definirModo }),
    [modo, definirModo],
  );

  if (valor === null) {
    return null;
  }
  return (
    <ContextoDoModo.Provider value={valor}>{children}</ContextoDoModo.Provider>
  );
}

/** Modo atual e a troca. Lança fora do `ModoProvider`. */
export function useModo(): EstadoDoModo {
  const contexto = useContext(ContextoDoModo);
  if (contexto === null) {
    throw new Error('useModo precisa estar dentro de <ModoProvider>');
  }
  return contexto;
}
