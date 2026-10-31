/** Variáveis de ambiente que o app lê. */
export interface AmbienteDaApi {
  readonly EXPO_PUBLIC_API_URL?: string;
}

/**
 * Esquema, host não vazio, porta opcional e caminho opcional, sem query nem
 * fragmento. O host não aceita `@` nem `:`: usuário e senha na URL
 * (`https://u:p@host`) iriam embutidos no bundle (CA68). A porta é o grupo 1.
 */
const FORMATO_DA_URL =
  /^https?:\/\/[^\s/?#@:]+(?::(\d{1,5}))?(?:\/[^\s?#]*)?$/i;

/** Maior porta TCP. */
const PORTA_MAXIMA = 65_535;

/** A URL segue `FORMATO_DA_URL` e a porta, se houver, vai de 1 a 65535. */
function ehUrlValida(valor: string): boolean {
  const partes = FORMATO_DA_URL.exec(valor);
  if (partes === null) {
    return false;
  }
  const porta = partes[1];
  return (
    porta === undefined || (Number(porta) >= 1 && Number(porta) <= PORTA_MAXIMA)
  );
}

/**
 * URL base da API, sem barra final.
 *
 * - Vem de `EXPO_PUBLIC_API_URL` (`apps/mobile/.env`, ver `.env.example`).
 * - Fora de `__DEV__`, exige `https://`: HTTP só na rede local, em
 *   desenvolvimento.
 * - Recusa usuário e senha na URL, host vazio e porta fora de 1 a 65535.
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
  if (!ehUrlValida(valor)) {
    throw new Error(
      'EXPO_PUBLIC_API_URL inválida: use http(s)://host[:porta], sem usuário, senha nem query',
    );
  }
  if (!dev && !/^https:\/\//i.test(valor)) {
    throw new Error(
      'EXPO_PUBLIC_API_URL precisa usar https:// fora de desenvolvimento',
    );
  }
  return valor.replace(/\/+$/, '');
}
