import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { DadosExportados } from '../api/tipos';
import { textos } from '../textos/pt-BR';

/** Resultado de `compartilharExportacao`. */
export type ResultadoDoCompartilhamento = 'compartilhado' | 'indisponivel';

const PREFIXO_DO_ARQUIVO = 'trampo-ja-meus-dados-';

function doisDigitos(numero: number): string {
  return String(numero).padStart(2, '0');
}

/**
 * `trampo-ja-meus-dados-AAAA-MM-DD.json`, com a data local do aparelho (a
 * pessoa reconhece o dia em que gerou). Só a data: nada da conta no nome.
 */
export function nomeDoArquivoDeExportacao(agora: Date): string {
  const data = [
    String(agora.getFullYear()).padStart(4, '0'),
    doisDigitos(agora.getMonth() + 1),
    doisDigitos(agora.getDate()),
  ].join('-');
  return `${PREFIXO_DO_ARQUIVO}${data}.json`;
}

/** Apaga o arquivo se ele existir. Falha ao apagar não sobe nem vai a log. */
function apagarSemFalhar(arquivo: File): void {
  try {
    if (arquivo.exists) {
      arquivo.delete();
    }
  } catch {
    // Sem log (CA24). O arquivo fica só no cache do app, que o sistema
    // limpa; a próxima exportação do mesmo dia o sobrescreve.
  }
}

/**
 * Apaga de `Paths.cache` os arquivos de exportação que sobraram (prefixo
 * `trampo-ja-meus-dados-`). O `finally` de `compartilharExportacao` não roda
 * se o app morre com a folha aberta; por isso a raiz chama esta função ao
 * iniciar, quando nenhuma exportação está em andamento. Pastas com o mesmo
 * prefixo ficam. Qualquer falha (listar ou apagar) é engolida, sem log (CA24).
 */
export function limparExportacoesAntigas(): void {
  try {
    for (const item of Paths.cache.list()) {
      if (item instanceof File && item.name.startsWith(PREFIXO_DO_ARQUIVO)) {
        apagarSemFalhar(item);
      }
    }
  } catch {
    // Sem log (CA24). O sistema limpa o cache; a próxima abertura tenta de novo.
  }
}

/**
 * Entrega os dados exportados pela folha de compartilhamento do sistema
 * (CA19, D26):
 *
 * 1. Sem folha disponível (`Sharing.isAvailableAsync()` falso), devolve
 *    `indisponivel` sem gravar nada.
 * 2. Grava o JSON em `Paths.cache` (`nomeDoArquivoDeExportacao`), abre a
 *    folha (`application/json`, título `exportarDados.tituloDaFolha`) e
 *    devolve `compartilhado` quando ela fecha. O cancelamento não é
 *    detectável, então também conta como `compartilhado`.
 * 3. Apaga o arquivo no `finally`: depois da folha, e também quando a
 *    gravação ou a folha falham.
 *
 * Falha ao gravar ou ao abrir a folha rejeita com o erro da biblioteca, que
 * não leva o conteúdo; quem chama não deve registrar nem mostrar o erro cru
 * (CA24). O JSON só existe aqui, nunca no cache do TanStack.
 */
export async function compartilharExportacao(
  dados: DadosExportados,
  agora: Date = new Date(),
): Promise<ResultadoDoCompartilhamento> {
  if (!(await Sharing.isAvailableAsync())) {
    return 'indisponivel';
  }
  const arquivo = new File(Paths.cache, nomeDoArquivoDeExportacao(agora));
  try {
    // `writeSync` cria o arquivo se preciso e sobrescreve um resto anterior.
    // Síncrono de propósito (no SDK 58, `write` é assíncrono): o arquivo está
    // completo antes de a folha abrir, e uma falha cai no `finally`.
    arquivo.writeSync(JSON.stringify(dados));
    await Sharing.shareAsync(arquivo.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: textos.exportarDados.tituloDaFolha,
    });
    return 'compartilhado';
  } finally {
    apagarSemFalhar(arquivo);
  }
}
