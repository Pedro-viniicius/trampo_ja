import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

/**
 * Porta do token da sessão. É o único caminho do token no app (CA15): nada
 * de estado do React, AsyncStorage, URL, parâmetro de rota ou log.
 *
 * Junto do token fica a impressão da conta (D43), que a sessão calcula a
 * partir do e-mail: quem lê uma lê a outra, e nenhuma das duas vai para log.
 */
export interface ArmazenamentoDeToken {
  /** O token guardado, ou `null` sem sessão. */
  ler(): Promise<string | null>;
  /**
   * A impressão da conta gravada com o token, ou `null` sem ela. Opcional:
   * quem não implementa (fakes antigos) equivale a sempre `null`.
   */
  lerConta?(): Promise<string | null>;
  /**
   * Grava o token e a impressão da conta. Sem `conta` (ou vazia), a
   * impressão anterior é apagada: ela nunca fica de outra sessão.
   */
  gravar(token: string, conta?: string): Promise<void>;
  /** Apaga o token e a impressão; sem nada guardado, não faz nada. */
  apagar(): Promise<void>;
}

/** Chave fixa no `expo-secure-store` (letras, `.`, `-` e `_`). */
export const CHAVE_DO_TOKEN = 'trampoja.token';
/** Chave da impressão da conta (D43), no mesmo formato. */
export const CHAVE_DA_CONTA = 'trampoja.conta';
/** Nome do arquivo marcador de instalação em `Paths.document` (S2). */
export const NOME_DO_MARCADOR = 'trampoja.instalacao';
/** Conteúdo fixo do marcador: ele não guarda dado nenhum. */
const CONTEUDO_DO_MARCADOR = '1';

/**
 * Marcador de instalação (S2). O keychain do iOS sobrevive à desinstalação
 * do app, mas a pasta de documentos não: sem o marcador, o que estiver no
 * secure-store é de uma instalação anterior e não vale.
 */
export interface MarcadorDeInstalacao {
  /** Pode lançar; quem chama trata a falha como "não existe". */
  existe(): boolean;
  /** Pode lançar. */
  criar(): void;
}

/** Marcador real: arquivo `trampoja.instalacao` em `Paths.document`. */
export function marcadorEmDocumentos(): MarcadorDeInstalacao {
  return {
    existe() {
      return new File(Paths.document, NOME_DO_MARCADOR).exists;
    },
    criar() {
      // `writeSync`: desde o SDK 58, `write` devolve uma promessa. O marcador
      // precisa existir quando `criar` volta, e a falha precisa sair daqui.
      new File(Paths.document, NOME_DO_MARCADOR).writeSync(
        CONTEUDO_DO_MARCADOR,
      );
    },
  };
}

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

async function lerChave(chave: string): Promise<string | null> {
  const valor = await SecureStore.getItemAsync(chave, OPCOES);
  return valor === null || valor === '' ? null : valor;
}

/** Tenta apagar as duas chaves; lança se alguma falhou. */
async function apagarTudo(): Promise<void> {
  const resultados = await Promise.allSettled([
    SecureStore.deleteItemAsync(CHAVE_DO_TOKEN, OPCOES),
    SecureStore.deleteItemAsync(CHAVE_DA_CONTA, OPCOES),
  ]);
  if (resultados.some((r) => r.status === 'rejected')) {
    throw new Error('apagar');
  }
}

/**
 * Adaptador real, sobre o `expo-secure-store`.
 *
 * Antes do primeiro `ler`, `lerConta` ou `gravar`, confere o marcador de
 * instalação, uma vez por instância (a raiz do app cria uma por execução).
 * Sem o marcador (ou sem conseguir conferir), apaga o token e a impressão e
 * só então cria o marcador: o app abre anônimo. Se apagar falhar, a operação
 * falha com `ErroDoArmazenamento` e o marcador não é criado; a próxima
 * operação tenta de novo. Se só criar o marcador falhar, o secure-store já
 * está limpo e o app segue; a próxima execução limpa de novo.
 */
export function criarArmazenamentoSeguro(
  marcador: MarcadorDeInstalacao = marcadorEmDocumentos(),
): ArmazenamentoDeToken {
  let conferencia: Promise<void> | null = null;

  async function conferirInstalacao(): Promise<void> {
    let existe = false;
    try {
      existe = marcador.existe();
    } catch {
      // Sem como conferir: trata como instalação nova (falha fechada).
    }
    if (existe) {
      return;
    }
    await apagarTudo();
    try {
      marcador.criar();
    } catch {
      // Sem log (CA15). O secure-store já está limpo.
    }
  }

  async function conferirUmaVez(operacao: 'ler' | 'gravar'): Promise<void> {
    if (conferencia === null) {
      const atual = conferirInstalacao();
      conferencia = atual;
      // Falhou: a próxima operação confere de novo.
      atual.catch(() => {
        if (conferencia === atual) {
          conferencia = null;
        }
      });
    }
    try {
      await conferencia;
    } catch {
      throw new ErroDoArmazenamento(operacao);
    }
  }

  return {
    async ler() {
      await conferirUmaVez('ler');
      try {
        return await lerChave(CHAVE_DO_TOKEN);
      } catch {
        throw new ErroDoArmazenamento('ler');
      }
    },
    async lerConta() {
      await conferirUmaVez('ler');
      try {
        return await lerChave(CHAVE_DA_CONTA);
      } catch {
        throw new ErroDoArmazenamento('ler');
      }
    },
    async gravar(token, conta) {
      await conferirUmaVez('gravar');
      try {
        await SecureStore.setItemAsync(CHAVE_DO_TOKEN, token, OPCOES);
      } catch {
        throw new ErroDoArmazenamento('gravar');
      }
      try {
        if (conta === undefined || conta === '') {
          await SecureStore.deleteItemAsync(CHAVE_DA_CONTA, OPCOES);
        } else {
          await SecureStore.setItemAsync(CHAVE_DA_CONTA, conta, OPCOES);
        }
      } catch {
        // Tudo ou nada: sem a impressão certa, o token novo não fica.
        try {
          await SecureStore.deleteItemAsync(CHAVE_DO_TOKEN, OPCOES);
        } catch {
          // Sem log (CA15). A sessão não começa (o `gravar` falha), e um
          // token que sobrar é recusado pela API ou apagado no próximo sair.
        }
        throw new ErroDoArmazenamento('gravar');
      }
    },
    async apagar() {
      try {
        await apagarTudo();
      } catch {
        throw new ErroDoArmazenamento('apagar');
      }
    },
  };
}

/** Fake em memória para os testes, com o mesmo contrato do adaptador real. */
export interface ArmazenamentoEmMemoria extends ArmazenamentoDeToken {
  lerConta(): Promise<string | null>;
  /** O token guardado agora, sem passar pela porta (só para asserção). */
  readonly atual: () => string | null;
  /** A impressão guardada agora, sem passar pela porta (só para asserção). */
  readonly contaAtual: () => string | null;
}

export function criarArmazenamentoEmMemoria(
  inicial: string | null = null,
  contaInicial: string | null = null,
): ArmazenamentoEmMemoria {
  let token: string | null = inicial === '' ? null : inicial;
  let conta: string | null = contaInicial === '' ? null : contaInicial;
  return {
    async ler() {
      return token;
    },
    async lerConta() {
      return conta;
    },
    async gravar(novo, novaConta) {
      token = novo;
      conta = novaConta === undefined || novaConta === '' ? null : novaConta;
    },
    async apagar() {
      token = null;
      conta = null;
    },
    atual: () => token,
    contaAtual: () => conta,
  };
}
