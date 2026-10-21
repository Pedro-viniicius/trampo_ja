import type {
  FuncaoFetch,
  InitDaRequisicao,
  RespostaHttp,
} from '../api/cliente';

/** Resposta que o fake devolve para uma rota. */
export interface RespostaFalsa {
  /** Padrão: 200. */
  readonly status?: number;
  /** Vai como JSON. Sem `corpo` nem `corpoBruto`, o corpo é vazio. */
  readonly corpo?: unknown;
  /** Texto literal do corpo (ex.: JSON malformado). Ganha de `corpo`. */
  readonly corpoBruto?: string;
  /** Espera antes de responder; o `abort` do cliente interrompe a espera. */
  readonly demoraMs?: number;
  /** Rejeita como o `fetch` do React Native sem conexão. */
  readonly falhaDeRede?: boolean;
}

/** Requisição que chegou ao fake. */
export interface RequisicaoFeita {
  readonly metodo: string;
  readonly url: string;
  /** Caminho sem a query, ainda codificado (ex.: `/perfis/a%2Fb`). */
  readonly caminho: string;
  /** Query decodificada. */
  readonly query: Readonly<Record<string, string>>;
  /** Cabeçalhos com o nome em minúsculas (ex.: `authorization`). */
  readonly cabecalhos: Readonly<Record<string, string>>;
  /** Corpo lido como JSON, ou `undefined` sem corpo. */
  readonly corpo: unknown;
}

export type Resposta =
  | RespostaFalsa
  | ((requisicao: RequisicaoFeita) => RespostaFalsa);

export interface FetchFalso {
  /** Para passar a `criarCliente({ fetch })`. */
  readonly fetch: FuncaoFetch;
  /** Todas as requisições, na ordem em que chegaram. */
  readonly requisicoes: readonly RequisicaoFeita[];
  /**
   * Registra a resposta de `rota` (`'GET /busca'` ou `'GET /busca?tipo=trampos'`).
   * A rota com query casa quando todos os parâmetros dela estão na requisição;
   * ganha a que tiver mais parâmetros e, no empate, a registrada por último.
   * Com uma lista, devolve um item por chamada e repete o último.
   */
  responder(rota: string, resposta: Resposta | readonly Resposta[]): FetchFalso;
  /** A última requisição; falha se não houve nenhuma. */
  ultima(): RequisicaoFeita;
  /** Esquece as requisições feitas (as rotas registradas ficam). */
  limparRequisicoes(): void;
}

interface Registro {
  readonly metodo: string;
  readonly caminho: string;
  readonly query: Readonly<Record<string, string>>;
  readonly respostas: readonly Resposta[];
  usadas: number;
}

function lerQuery(texto: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const par of texto.split('&')) {
    if (par === '') {
      continue;
    }
    const [chave = '', valor = ''] = par.split('=');
    query[decodeURIComponent(chave)] = decodeURIComponent(valor);
  }
  return query;
}

function separar(caminhoComQuery: string): {
  caminho: string;
  query: Record<string, string>;
} {
  const [caminho = '', query = ''] = caminhoComQuery.split('?');
  return { caminho, query: lerQuery(query) };
}

function erroDeAborto(): Error {
  const erro = new Error('Aborted');
  erro.name = 'AbortError';
  return erro;
}

function esperar(ms: number, sinal: AbortSignal): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    if (sinal.aborted) {
      rejeitar(erroDeAborto());
      return;
    }
    const aoAbortar = () => {
      clearTimeout(temporizador);
      rejeitar(erroDeAborto());
    };
    const temporizador = setTimeout(() => {
      sinal.removeEventListener('abort', aoAbortar);
      resolver();
    }, ms);
    sinal.addEventListener('abort', aoAbortar);
  });
}

/**
 * `fetch` falso, por rota, para os testes do app. Rota sem registro responde
 * 404 `nao_encontrado`, como a API.
 *
 * ```ts
 * const falso = criarFetchFalso().responder('GET /perfis/eu', { status: 404 });
 * const cliente = criarCliente({ fetch: falso.fetch, ... });
 * ```
 */
export function criarFetchFalso(): FetchFalso {
  const registros: Registro[] = [];
  const requisicoes: RequisicaoFeita[] = [];

  function escolher(requisicao: RequisicaoFeita): Resposta | undefined {
    let escolhido: Registro | undefined;
    for (const registro of registros) {
      const casa =
        registro.metodo === requisicao.metodo &&
        registro.caminho === requisicao.caminho &&
        Object.entries(registro.query).every(
          ([chave, valor]) => requisicao.query[chave] === valor,
        );
      if (
        casa &&
        (escolhido === undefined ||
          Object.keys(registro.query).length >=
            Object.keys(escolhido.query).length)
      ) {
        escolhido = registro;
      }
    }
    if (escolhido === undefined) {
      return undefined;
    }
    const indice = Math.min(escolhido.usadas, escolhido.respostas.length - 1);
    escolhido.usadas += 1;
    return escolhido.respostas[indice];
  }

  const fetch: FuncaoFetch = async (
    url: string,
    init: InitDaRequisicao,
  ): Promise<RespostaHttp> => {
    const { caminho, query } = separar(url.replace(/^https?:\/\/[^/]+/i, ''));
    const cabecalhos: Record<string, string> = {};
    for (const [nome, valor] of Object.entries(init.headers)) {
      cabecalhos[nome.toLowerCase()] = valor;
    }
    const requisicao: RequisicaoFeita = {
      metodo: init.method,
      url,
      caminho,
      query,
      cabecalhos,
      corpo: init.body === undefined ? undefined : JSON.parse(init.body),
    };
    requisicoes.push(requisicao);

    const escolhida = escolher(requisicao) ?? {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    };
    const resposta =
      typeof escolhida === 'function' ? escolhida(requisicao) : escolhida;

    if (resposta.demoraMs !== undefined) {
      await esperar(resposta.demoraMs, init.signal);
    }
    if (init.signal.aborted) {
      throw erroDeAborto();
    }
    if (resposta.falhaDeRede) {
      throw new TypeError('Network request failed');
    }
    const texto =
      resposta.corpoBruto ??
      (resposta.corpo === undefined ? '' : JSON.stringify(resposta.corpo));
    return { status: resposta.status ?? 200, text: async () => texto };
  };

  const falso: FetchFalso = {
    fetch,
    requisicoes,
    responder(rota, resposta) {
      const [metodo = '', caminhoComQuery = ''] = rota.split(' ');
      const { caminho, query } = separar(caminhoComQuery);
      const respostas: readonly Resposta[] = Array.isArray(resposta)
        ? resposta
        : [resposta as Resposta];
      if (respostas.length === 0) {
        throw new Error('responder: informe ao menos uma resposta');
      }
      registros.push({
        metodo: metodo.toUpperCase(),
        caminho,
        query,
        respostas,
        usadas: 0,
      });
      return falso;
    },
    ultima() {
      const ultima = requisicoes.at(-1);
      if (ultima === undefined) {
        throw new Error('nenhuma requisição foi feita');
      }
      return ultima;
    },
    limparRequisicoes() {
      requisicoes.length = 0;
    },
  };
  return falso;
}
