import type { QueryClient } from '@tanstack/react-query';
import type { MockContextConfig } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { NavegacaoRaiz } from '../../app/_layout';
import * as LayoutPublico from '../../app/(publico)/_layout';
import Cadastro from '../../app/(publico)/cadastro';
import Entrada from '../../app/(publico)/entrada';
import Entrar from '../../app/(publico)/entrar';
import Politica from '../../app/politica-de-privacidade';
import Termos from '../../app/termos-de-uso';
import {
  type ArmazenamentoEmMemoria,
  criarArmazenamentoEmMemoria,
} from '../../estado/armazenamento-token';
import {
  type ArmazenamentoDoModoEmMemoria,
  criarArmazenamentoDoModoEmMemoria,
  type Modo,
} from '../../estado/modo';
import { Provedores } from '../../estado/provedores';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { type RenderRouterResult, renderRouter } from '../render-router';
import { criarQueryClientDeTeste, URL_BASE_DE_TESTE } from '../renderizar';

/**
 * Casa o nome acessível que leva o nome da pessoa (ex.: "Aceitar
 * candidatura de {nome}"), com qualquer nome ou sem nome (`null`).
 */
export function rotuloComQualquerNome(
  rotulo: (nome: string | null) => string,
): RegExp {
  const escapar = (texto: string) =>
    texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marcador = '\u0000';
  const comNome = escapar(rotulo(marcador)).replace(marcador, '.+');
  return new RegExp(`^(?:${comNome}|${escapar(rotulo(null))})$`);
}

/** Qualquer "Aceitar" das candidaturas recebidas. */
export const ACEITAR_QUALQUER = rotuloComQualquerNome(
  textos.candidaturasRecebidas.aceitarDe,
);

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
  /**
   * Modo gravado no aparelho ao abrir o app. Padrão: `null` (nada gravado:
   * abre em freela). Ignorado se `armazenamentoDoModo` vier.
   */
  readonly modo?: Modo | null;
  /**
   * Padrão: fake em memória com `modo`. Passe o mesmo fake em duas
   * renderizações para simular reabrir o app.
   */
  readonly armazenamentoDoModo?: ArmazenamentoDoModoEmMemoria;
  /** Padrão: `criarFetchFalso()` sem rotas (tudo 404). */
  readonly fetch?: FetchFalso;
  /** Padrão: `criarQueryClientDeTeste()`. */
  readonly queryClient?: QueryClient;
}

export type RotasRenderizadas = RenderRouterResult & {
  readonly armazenamento: ArmazenamentoEmMemoria;
  readonly armazenamentoDoModo: ArmazenamentoDoModoEmMemoria;
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
 * As seis rotas que o layout das abas declara (ADR-010), cada uma como um
 * texto `stub: <rota>`. O layout avisa no console quando falta uma delas no
 * mapa: espalhe isto antes das rotas reais que o teste usa.
 */
export function abasDeStub(): MapaDeRotas {
  const stub = (nome: string) =>
    function Stub() {
      return <Text>{`stub: ${nome}`}</Text>;
    };
  return {
    '(app)/(abas)/index': stub('index'),
    '(app)/(abas)/meus-trampos': stub('meus-trampos'),
    '(app)/(abas)/demandas': stub('demandas'),
    '(app)/(abas)/buscar': stub('buscar'),
    '(app)/(abas)/conversas': stub('conversas'),
    '(app)/(abas)/perfil': stub('perfil'),
  };
}

/** Rotas legais da raiz (fora das guardas), nas rotas padrão. */
export const ROTAS_LEGAIS: MapaDeRotas = {
  'politica-de-privacidade': Politica,
  'termos-de-uso': Termos,
};

/**
 * `renderRouter` com a raiz real do app (`NavegacaoRaiz`: guarda por status
 * da sessão) sobre os provedores com fakes. O mapa recebe as rotas do teste;
 * o `_layout` raiz, as rotas de `(publico)` e as legais já vêm (uma rota do mapa com o
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
    modo = null,
    armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria(modo),
    fetch = criarFetchFalso(),
    queryClient = criarQueryClientDeTeste(),
  }: OpcoesDasRotas = {},
): Promise<RotasRenderizadas> {
  function LayoutRaizDeTeste() {
    return (
      <Provedores
        armazenamento={armazenamento}
        armazenamentoDoModo={armazenamentoDoModo}
        queryClient={queryClient}
        fetch={fetch.fetch}
        urlBase={URL_BASE_DE_TESTE}
      >
        <NavegacaoRaiz />
      </Provedores>
    );
  }
  const resultado = await renderRouter(
    {
      _layout: LayoutRaizDeTeste,
      ...ROTAS_PUBLICAS,
      ...ROTAS_LEGAIS,
      ...rotas,
    },
    { initialUrl },
  );
  return Object.assign(resultado, {
    armazenamento,
    armazenamentoDoModo,
    fetch,
    queryClient,
  });
}
