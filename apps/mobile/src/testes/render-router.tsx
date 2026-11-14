import {
  type MockContextConfig,
  type RenderRouterOptions,
  type RenderRouterResult,
  renderRouter as renderRouterDoExpo,
  screen,
} from 'expo-router/testing-library';

export type { RenderRouterResult };

/** Leitores de rota que o `renderRouter` do Expo Router devolve no resultado. */
export type LeitoresDeRota = Pick<
  RenderRouterResult,
  | 'getPathname'
  | 'getPathnameWithParams'
  | 'getSegments'
  | 'getSearchParams'
  | 'getRouterState'
>;

/**
 * `renderRouter` do Expo Router (SDK 58) com os leitores também no `screen`.
 *
 * O `renderRouter` do SDK 58 é assíncrono e devolve `getPathname()` e companhia
 * só no resultado. Os matchers (`expect(screen).toHavePathname`) os procuram no
 * `screen`, que o pacote não preenche: copiamos para lá.
 */
export async function renderRouter(
  contexto?: MockContextConfig,
  opcoes?: RenderRouterOptions,
): Promise<RenderRouterResult> {
  const resultado = await renderRouterDoExpo(contexto, opcoes);
  const leitores: LeitoresDeRota = {
    getPathname: resultado.getPathname,
    getPathnameWithParams: resultado.getPathnameWithParams,
    getSegments: resultado.getSegments,
    getSearchParams: resultado.getSearchParams,
    getRouterState: resultado.getRouterState,
  };
  Object.assign(screen, leitores);
  return resultado;
}
