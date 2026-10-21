import { ErroDaApi, ErroDeRede } from './erros';
import type { CampoInvalido, MotivoDeCampo } from './tipos';

export type MetodoHttp = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** O que o cliente passa ao `fetch`: um subconjunto de `RequestInit`. */
export interface InitDaRequisicao {
  readonly method: MetodoHttp;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal: AbortSignal;
}

/** O que o cliente lê da resposta: um subconjunto de `Response`. */
export interface RespostaHttp {
  readonly status: number;
  text(): Promise<string>;
}

/** Assinatura mínima de `fetch`: o global do React Native é compatível. */
export type FuncaoFetch = (
  url: string,
  init: InitDaRequisicao,
) => Promise<RespostaHttp>;

export type ValorDeQuery = string | number | boolean | null | undefined;
export type Query = Readonly<Record<string, ValorDeQuery>>;

export interface OpcoesDaRequisicao {
  /** Vai como JSON, com `Content-Type: application/json`. */
  readonly corpo?: unknown;
  /** Campos `undefined`, `null` ou em branco não vão na URL. */
  readonly query?: Query;
  /** Manda `Authorization: Bearer` quando há token. Padrão: `true`. */
  readonly autenticar?: boolean;
}

export type OpcoesSemCorpo = Omit<OpcoesDaRequisicao, 'corpo'>;

export interface OpcoesDoCliente {
  readonly fetch: FuncaoFetch;
  /** Sem barra final (ver `urlDaApi`). */
  readonly urlBase: string;
  /** Token da sessão, ou `null` sem sessão. */
  readonly obterToken: () =>
    | string
    | null
    | undefined
    | Promise<string | null | undefined>;
  /**
   * Chamado quando a API recusa o token de uma requisição autenticada (CA14).
   * Recebe o token que a requisição levou: um 401 que chega atrasado, de uma
   * sessão que já acabou, não deve derrubar a sessão nova.
   */
  readonly aoExpirar: (tokenUsado: string) => void;
  /** Padrão: 15 s. */
  readonly timeoutMs?: number;
}

export interface ClienteHttp {
  /**
   * Faz a requisição e devolve o JSON da resposta (`undefined` em 204 ou
   * corpo vazio). Falha com `ErroDaApi` (resposta fora de 2xx) ou
   * `ErroDeRede` (sem resposta ou tempo esgotado). `caminho` começa com `/` e
   * já traz os ids codificados (`segmentoDaUrl`).
   */
  requisitar<T>(
    metodo: MetodoHttp,
    caminho: string,
    opcoes?: OpcoesDaRequisicao,
  ): Promise<T>;
  get<T>(caminho: string, opcoes?: OpcoesSemCorpo): Promise<T>;
  post<T>(
    caminho: string,
    corpo?: unknown,
    opcoes?: OpcoesSemCorpo,
  ): Promise<T>;
  put<T>(caminho: string, corpo?: unknown, opcoes?: OpcoesSemCorpo): Promise<T>;
  delete<T>(caminho: string, opcoes?: OpcoesSemCorpo): Promise<T>;
}

export const TIMEOUT_PADRAO_MS = 15_000;

/**
 * Rotas de entrada: um 401 nelas não é sessão expirada. `POST /sessoes` e
 * `POST /contas` vão sem token; `DELETE /sessoes` é a saída, que já apaga o
 * token local por conta própria.
 */
const ROTAS_DE_ENTRADA: ReadonlySet<string> = new Set(['/sessoes', '/contas']);

/** Código de erro da API: minúsculas e `_` (ex.: `email_em_uso`). */
const FORMATO_DO_CODIGO = /^[a-z][a-z0-9_]{0,63}$/;
/** Nome de campo da API, inclusive composto (ex.: `habilidades.2`). */
const FORMATO_DO_CAMPO = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;
const MOTIVOS: ReadonlySet<string> = new Set<MotivoDeCampo>([
  'obrigatorio',
  'tamanho',
  'invalido',
]);

/**
 * Um id (de rota, deep link ou resposta) como segmento de URL. O id não é
 * confiável: vai por `encodeURIComponent`, e `.`/`..`/vazio, que mudariam o
 * caminho, viram `nao_encontrado` sem requisição.
 */
export function segmentoDaUrl(id: string): string {
  if (id === '' || id === '.' || id === '..') {
    throw new ErroDaApi(404, 'nao_encontrado');
  }
  return encodeURIComponent(id);
}

function montarQuery(query: Query | undefined): string {
  if (query === undefined) {
    return '';
  }
  const partes: string[] = [];
  for (const [chave, valor] of Object.entries(query)) {
    if (valor === undefined || valor === null) {
      continue;
    }
    const texto = String(valor);
    if (texto.trim() === '') {
      continue;
    }
    partes.push(`${encodeURIComponent(chave)}=${encodeURIComponent(texto)}`);
  }
  return partes.length === 0 ? '' : `?${partes.join('&')}`;
}

/**
 * Lê `{erro, campos?}` sem copiar nada que não tenha o formato de código ou
 * de nome de campo: o corpo nunca entra no erro (CA15). Corpo vazio,
 * malformado ou fora do formato vira `interno`.
 */
function lerCorpoDeErro(texto: string): {
  codigo: string;
  campos: CampoInvalido[];
} {
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return { codigo: 'interno', campos: [] };
  }
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) {
    return { codigo: 'interno', campos: [] };
  }
  const { erro, campos } = corpo as { erro?: unknown; campos?: unknown };
  if (typeof erro !== 'string' || !FORMATO_DO_CODIGO.test(erro)) {
    return { codigo: 'interno', campos: [] };
  }
  return { codigo: erro, campos: lerCampos(campos) };
}

function lerCampos(campos: unknown): CampoInvalido[] {
  if (!Array.isArray(campos)) {
    return [];
  }
  const lidos: CampoInvalido[] = [];
  for (const item of campos) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const { campo, motivo } = item as { campo?: unknown; motivo?: unknown };
    if (
      typeof campo === 'string' &&
      FORMATO_DO_CAMPO.test(campo) &&
      typeof motivo === 'string' &&
      MOTIVOS.has(motivo)
    ) {
      lidos.push({ campo, motivo: motivo as MotivoDeCampo });
    }
  }
  return lidos;
}

/**
 * Cliente HTTP da API (contrato no plano `mvp-trampo-ja-app`, "Decisão").
 *
 * - `Authorization: Bearer <token>` quando `autenticar` (padrão) e há token.
 * - Timeout com `AbortController` (15 s), que vale até o corpo ser lido.
 * - 401 de requisição que levou token, fora das rotas de entrada: chama
 *   `aoExpirar(tokenUsado)` e lança `ErroDaApi(401, 'sessao_expirada')`.
 * - 401 de `POST /sessoes`: `credenciais_invalidas`; 429: `muitas_requisicoes`.
 * - Nada vai para `console` e nenhum erro guarda corpo, URL ou token (CA15).
 */
export function criarCliente({
  fetch,
  urlBase,
  obterToken,
  aoExpirar,
  timeoutMs = TIMEOUT_PADRAO_MS,
}: OpcoesDoCliente): ClienteHttp {
  async function requisitar<T>(
    metodo: MetodoHttp,
    caminho: string,
    { corpo, query, autenticar = true }: OpcoesDaRequisicao = {},
  ): Promise<T> {
    const cabecalhos: Record<string, string> = { Accept: 'application/json' };
    let tokenUsado: string | undefined;
    if (autenticar) {
      const token = await obterToken();
      if (token) {
        cabecalhos.Authorization = `Bearer ${token}`;
        tokenUsado = token;
      }
    }
    let body: string | undefined;
    if (corpo !== undefined) {
      cabecalhos['Content-Type'] = 'application/json';
      body = JSON.stringify(corpo);
    }

    const controlador = new AbortController();
    let esgotou = false;
    const temporizador = setTimeout(() => {
      esgotou = true;
      controlador.abort();
    }, timeoutMs);

    let status: number;
    let texto: string;
    try {
      const resposta = await fetch(
        `${urlBase}${caminho}${montarQuery(query)}`,
        {
          method: metodo,
          headers: cabecalhos,
          signal: controlador.signal,
          ...(body !== undefined && { body }),
        },
      );
      status = resposta.status;
      texto = await resposta.text();
    } catch {
      // O erro original não é guardado: a mensagem dele pode trazer a URL.
      throw new ErroDeRede(esgotou ? 'tempo_esgotado' : 'falha');
    } finally {
      clearTimeout(temporizador);
    }

    if (status >= 200 && status < 300) {
      if (status === 204 || texto === '') {
        return undefined as T;
      }
      try {
        return JSON.parse(texto) as T;
      } catch {
        throw new ErroDaApi(status, 'interno');
      }
    }

    if (
      status === 401 &&
      tokenUsado !== undefined &&
      !ROTAS_DE_ENTRADA.has(caminho)
    ) {
      aoExpirar(tokenUsado);
      throw new ErroDaApi(401, 'sessao_expirada');
    }
    if (status === 401 && metodo === 'POST' && caminho === '/sessoes') {
      throw new ErroDaApi(401, 'credenciais_invalidas');
    }
    if (status === 429) {
      throw new ErroDaApi(429, 'muitas_requisicoes');
    }
    const { codigo, campos } = lerCorpoDeErro(texto);
    throw new ErroDaApi(status, codigo, campos);
  }

  return {
    requisitar,
    get<T>(caminho: string, opcoes?: OpcoesSemCorpo) {
      return requisitar<T>('GET', caminho, opcoes);
    },
    post<T>(caminho: string, corpo?: unknown, opcoes?: OpcoesSemCorpo) {
      return requisitar<T>('POST', caminho, { ...opcoes, corpo });
    },
    put<T>(caminho: string, corpo?: unknown, opcoes?: OpcoesSemCorpo) {
      return requisitar<T>('PUT', caminho, { ...opcoes, corpo });
    },
    delete<T>(caminho: string, opcoes?: OpcoesSemCorpo) {
      return requisitar<T>('DELETE', caminho, opcoes);
    },
  };
}
