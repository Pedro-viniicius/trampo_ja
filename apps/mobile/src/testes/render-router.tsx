import {
  type MockContextConfig,
  type RenderResult,
  type RenderRouterOptions,
  renderRouter as renderRouterDoExpo,
  screen,
} from 'expo-router/testing-library';

/** Leitores de rota que o `expo-router/testing-library` anexa ao resultado. */
export interface LeitoresDeRota {
  getPathname(): string;
  getPathnameWithParams(): string;
  getSegments(): string[];
  getSearchParams(): Record<string, string | string[]>;
  getRouterState(): unknown;
}

export type RenderRouterResult = RenderResult & LeitoresDeRota;

/**
 * `renderRouter` do Expo Router (SDK 57) com o RNTL 14 assíncrono.
 *
 * O `renderRouter` do SDK 57 foi escrito para o `render` síncrono do RNTL 13:
 * anexa `getPathname()` e companhia ao valor devolvido pelo `render`, que no
 * RNTL 14 é uma Promise. Aqui esperamos a Promise e copiamos os leitores para
 * o resultado e para o `screen`, que é onde os matchers
 * (`expect(screen).toHavePathname`) os procuram.
 */
export async function renderRouter(
  contexto?: MockContextConfig,
  opcoes?: RenderRouterOptions,
): Promise<RenderRouterResult> {
  const pendente = renderRouterDoExpo(
    contexto,
    opcoes,
  ) as unknown as Promise<RenderResult> & LeitoresDeRota;
  const resultado = await pendente;
  const leitores: LeitoresDeRota = {
    getPathname: pendente.getPathname,
    getPathnameWithParams: pendente.getPathnameWithParams,
    getSegments: pendente.getSegments,
    getSearchParams: pendente.getSearchParams,
    getRouterState: pendente.getRouterState,
  };
  Object.assign(screen, leitores);
  return Object.assign(resultado, leitores);
}
