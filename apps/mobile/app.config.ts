import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuração dinâmica do Expo. Devolve o `app.json` como veio (o Expo o lê
 * antes e o entrega em `config`) e, no build de produção, confere a URL da API.
 *
 * O script `build:producao` liga `TRAMPOJA_BUILD=producao`. Sem essa variável
 * (o `build` comum, o `start` e os testes), nada é conferido aqui: o `.env`
 * de desenvolvimento (ver `.env.example`) usa `http://` na rede local.
 */
export const BUILD_DE_PRODUCAO = 'producao';

/** Variáveis que esta configuração lê. */
export interface AmbienteDoBuild {
  readonly TRAMPOJA_BUILD?: string;
  readonly EXPO_PUBLIC_API_URL?: string;
}

/**
 * Mesma regra de `urlDaApi(env, false)` em `src/api/config.ts`: esquema, host
 * não vazio, porta opcional (grupo 1) e caminho opcional, sem query nem
 * fragmento. O host não aceita `@` nem `:`: usuário e senha
 * (`https://u:p@host`) iriam embutidos no APK (CA68).
 *
 * Repetida de propósito: o Expo CLI transpila só este arquivo, e o `import`
 * de `./src/api/config` não resolve (`Cannot find module`). O teste
 * `src/testes/app-config.test.ts` confere que as duas regras concordam.
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
 * Lança `Error` com mensagem fixa (sem o valor) se a URL faltar, for inválida
 * (inclusive com usuário e senha, host vazio ou porta fora de 1 a 65535) ou
 * não usar `https://`.
 *
 * Na `expo export`, o Expo CLI lê esta configuração uma vez antes de carregar
 * o `.env`: por isso a URL do build de produção vem do ambiente do comando.
 */
export function conferirUrlDeProducao(url: string | undefined): void {
  const valor = url?.trim() ?? '';
  if (valor === '') {
    throw new Error(
      'build:producao: defina EXPO_PUBLIC_API_URL com https:// no ambiente do comando',
    );
  }
  if (!ehUrlValida(valor)) {
    throw new Error(
      'build:producao: EXPO_PUBLIC_API_URL inválida, use https://host[:porta], sem usuário, senha nem query',
    );
  }
  if (!/^https:\/\//i.test(valor)) {
    throw new Error(
      'build:producao: EXPO_PUBLIC_API_URL precisa usar https://',
    );
  }
}

export default function configDoApp(
  { config }: ConfigContext,
  env: AmbienteDoBuild = {
    TRAMPOJA_BUILD: process.env.TRAMPOJA_BUILD,
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  },
): Partial<ExpoConfig> {
  if (env.TRAMPOJA_BUILD === BUILD_DE_PRODUCAO) {
    conferirUrlDeProducao(env.EXPO_PUBLIC_API_URL);
  }
  return config;
}
