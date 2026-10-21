/** Variáveis de ambiente que o app lê. */
export interface AmbienteDaApi {
  readonly EXPO_PUBLIC_API_URL?: string;
}

/** Esquema, host (com porta opcional) e caminho opcional, sem query nem fragmento. */
const FORMATO_DA_URL = /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i;

/**
 * URL base da API, sem barra final.
 *
 * - Vem de `EXPO_PUBLIC_API_URL` (`apps/mobile/.env`, ver `.env.example`).
 * - Fora de `__DEV__`, exige `https://`: HTTP só na rede local, em
 *   desenvolvimento.
 * - Lança `Error` com mensagem fixa (sem o valor) se faltar ou for inválida.
 *
 * O padrão do parâmetro cita `process.env.EXPO_PUBLIC_API_URL` por extenso de
 * propósito: o Babel do Expo só embute no bundle o acesso estático
 * (`process.env.EXPO_PUBLIC_X`). Passar `process.env` inteiro deixaria a URL
 * vazia no build de produção.
 */
export function urlDaApi(
  env: AmbienteDaApi = {
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  },
  dev: boolean = __DEV__,
): string {
  const valor = env.EXPO_PUBLIC_API_URL?.trim() ?? '';
  if (valor === '') {
    throw new Error(
      'EXPO_PUBLIC_API_URL não definida: copie apps/mobile/.env.example para apps/mobile/.env',
    );
  }
  if (!FORMATO_DA_URL.test(valor)) {
    throw new Error(
      'EXPO_PUBLIC_API_URL inválida: use http(s)://host[:porta], sem query',
    );
  }
  if (!dev && !/^https:\/\//i.test(valor)) {
    throw new Error(
      'EXPO_PUBLIC_API_URL precisa usar https:// fora de desenvolvimento',
    );
  }
  return valor.replace(/\/+$/, '');
}
