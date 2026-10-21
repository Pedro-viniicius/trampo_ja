import type { QueryClient } from '@tanstack/react-query';
import type { MockContextConfig } from 'expo-router/testing-library';
import { NavegacaoRaiz } from '../../app/_layout';
import * as LayoutPublico from '../../app/(publico)/_layout';
import Cadastro from '../../app/(publico)/cadastro';
import Entrada from '../../app/(publico)/entrada';
import Entrar from '../../app/(publico)/entrar';
import {
  type ArmazenamentoEmMemoria,
  criarArmazenamentoEmMemoria,
} from '../../estado/armazenamento-token';
import { Provedores } from '../../estado/provedores';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { type RenderRouterResult, renderRouter } from '../render-router';
import { criarQueryClientDeTeste, URL_BASE_DE_TESTE } from '../renderizar';

/** Token que as rotas de teste usam como sessão já aberta. */
export const TOKEN_DE_TESTE = 'token-de-teste';

export type MapaDeRotas = Exclude<
  MockContextConfig,
  string | string[] | { appDir: string }
>;

export interface OpcoesDasRotas {
  /** URL inicial (ex.: `'/'`, `'/entrar'`). Padrão: `'/'`. */
  readonly initialUrl?: string;
  /**
   * Padrão: fake em memória sem token (anônimo). Para começar autenticado:
   * `criarArmazenamentoEmMemoria(TOKEN_DE_TESTE)`.
   */
  readonly armazenamento?: ArmazenamentoEmMemoria;
  /** Padrão: `criarFetchFalso()` sem rotas (tudo 404). */
  readonly fetch?: FetchFalso;
  /** Padrão: `criarQueryClientDeTeste()`. */
  readonly queryClient?: QueryClient;
}

export type RotasRenderizadas = RenderRouterResult & {
  readonly armazenamento: ArmazenamentoEmMemoria;
  readonly fetch: FetchFalso;
  readonly queryClient: QueryClient;
};

/** Rotas reais do grupo `(publico)` (entrada, entrar, cadastro e o layout). */
export const ROTAS_PUBLICAS: MapaDeRotas = {
  '(publico)/_layout': LayoutPublico,
  '(publico)/entrada': Entrada,
  '(publico)/entrar': Entrar,
  '(publico)/cadastro': Cadastro,
};

/**
 * `renderRouter` com a raiz real do app (`NavegacaoRaiz`: guarda por status
 * da sessão) sobre os provedores com fakes. O mapa recebe as rotas do teste;
 * o `_layout` raiz e as rotas de `(publico)` já vêm (uma rota do mapa com o
 * mesmo nome substitui a padrão).
 *
 * ```ts
 * const { fetch } = await renderizarRotas(
 *   { '(app)/_layout': LayoutDoApp, '(app)/index': Inicio },
 *   { armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE) },
 * );
 * ```
 *
 * Responda as rotas do fetch antes de renderizar (passe um `fetch` já
 * configurado) quando a tela pedir dados na montagem.
 */
export async function renderizarRotas(
  rotas: MapaDeRotas,
  {
    initialUrl = '/',
    armazenamento = criarArmazenamentoEmMemoria(),
    fetch = criarFetchFalso(),
    queryClient = criarQueryClientDeTeste(),
  }: OpcoesDasRotas = {},
): Promise<RotasRenderizadas> {
  function LayoutRaizDeTeste() {
    return (
      <Provedores
        armazenamento={armazenamento}
        queryClient={queryClient}
        fetch={fetch.fetch}
        urlBase={URL_BASE_DE_TESTE}
      >
        <NavegacaoRaiz />
      </Provedores>
    );
  }
  const resultado = await renderRouter(
    { _layout: LayoutRaizDeTeste, ...ROTAS_PUBLICAS, ...rotas },
    { initialUrl },
  );
  return Object.assign(resultado, { armazenamento, fetch, queryClient });
}
