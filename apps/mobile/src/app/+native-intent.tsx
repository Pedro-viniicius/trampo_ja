import type { NativeIntent } from 'expo-router';

/** Maior link de entrada aceito (deep link do sistema). */
export const TAMANHO_MAXIMO_DO_LINK = 2048;

// `%` que não abre um escape de dois dígitos hexadecimais.
const ESCAPE_MALFORMADO = /%(?![0-9A-Fa-f]{2})/;

function linkSeguro(caminho: string): boolean {
  if (caminho.length > TAMANHO_MAXIMO_DO_LINK) {
    return false;
  }
  if (ESCAPE_MALFORMADO.test(caminho)) {
    return false;
  }
  try {
    // Escape bem formado que não é UTF-8 válido (`%E0%A4%A`) também lança.
    decodeURI(caminho);
    return true;
  } catch {
    return false;
  }
}

/**
 * Filtra o link que chega do sistema antes de o expo-router interpretá-lo:
 * link grande demais ou com escape `%` malformado abre o Início, em vez de
 * travar ou derrubar o app. O resto segue como veio. Nunca lança (um erro
 * aqui fecharia o app) e nunca registra o link.
 */
export const redirectSystemPath: NonNullable<
  NativeIntent['redirectSystemPath']
> = ({ path }) => {
  try {
    return typeof path === 'string' && linkSeguro(path) ? path : '/';
  } catch {
    return '/';
  }
};
