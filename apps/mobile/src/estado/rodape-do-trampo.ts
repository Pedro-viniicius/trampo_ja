import type { StatusDaCandidatura, StatusDoTrampo } from '../api/tipos';
import type { SituacaoDoRodape } from '../telas/tipos';

/**
 * Uma lista "minha". `dados` ainda `undefined` e sem `falhou` = a consulta
 * não respondeu. `falhou` conta como lista vazia: a API decide (409
 * `candidatura_duplicada`).
 */
export interface ListaDoRodape<T> {
  readonly dados: readonly T[] | undefined;
  readonly falhou?: boolean;
}

export interface EntradaDoRodape {
  /** O trampo do detalhe; `undefined` enquanto não chegou. */
  readonly trampo:
    | { readonly id: string; readonly status: StatusDoTrampo }
    | undefined;
  /**
   * A pessoa é a autora do trampo (D46): o `GET /trampos/:id` trouxe a visão
   * do autor, que só ela recebe (`trampo.versao !== undefined`). Não depende
   * de lista nenhuma.
   */
  readonly souAutor: boolean;
  /** `GET /candidaturas/minhas`. */
  readonly minhasCandidaturas: ListaDoRodape<{
    readonly trampoId: string;
    readonly status: StatusDaCandidatura;
  }>;
  /** `GET /trampos/:id/candidaturas`, só pedida quando é o autor. */
  readonly recebidas: readonly unknown[] | undefined;
}

function semResposta(lista: ListaDoRodape<unknown>): boolean {
  return lista.dados === undefined && lista.falhou !== true;
}

/**
 * Situação do rodapé do detalhe do trampo, na ordem: `carregando` (falta o
 * trampo) -> `autor` (`souAutor`; `quantidade` é `null` até as recebidas
 * chegarem) -> `carregando` (falta Minhas candidaturas, sem erro) ->
 * `candidatado` (há candidatura minha nele) -> `fechado` (não está aberto)
 * -> `candidatar`. O papel é só exibição: a permissão é da API.
 */
export function situacaoDoRodape(entrada: EntradaDoRodape): SituacaoDoRodape {
  const { trampo, souAutor, minhasCandidaturas, recebidas } = entrada;
  if (trampo === undefined) {
    return { tipo: 'carregando' };
  }
  if (souAutor) {
    return { tipo: 'autor', quantidade: recebidas?.length ?? null };
  }
  if (semResposta(minhasCandidaturas)) {
    return { tipo: 'carregando' };
  }
  const minha = (minhasCandidaturas.dados ?? []).find(
    (candidatura) => candidatura.trampoId === trampo.id,
  );
  if (minha !== undefined) {
    return { tipo: 'candidatado', status: minha.status };
  }
  if (trampo.status !== 'aberto') {
    return { tipo: 'fechado' };
  }
  return { tipo: 'candidatar' };
}
