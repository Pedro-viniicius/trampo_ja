import type { StatusDaCandidatura, StatusDoTrampo } from '../api/tipos';
import type { SituacaoDoRodape } from '../telas/tipos';

/**
 * Uma das listas "minhas". `dados` ainda `undefined` e sem `falhou` = a
 * consulta não respondeu. `falhou` conta como lista vazia: a API decide
 * (409 `autor_nao_pode_candidatar` ou `candidatura_duplicada`).
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
  /** `GET /trampos/meus`. */
  readonly meusTrampos: ListaDoRodape<{ readonly id: string }>;
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
 * trampo ou uma das listas, sem erro) -> `autor` (o trampo está em
 * "meus trampos"; `quantidade` é `null` até as recebidas chegarem) ->
 * `candidatado` (há candidatura minha nele) -> `fechado` (não está aberto)
 * -> `candidatar`. O papel é só exibição: a permissão é da API.
 */
export function situacaoDoRodape(entrada: EntradaDoRodape): SituacaoDoRodape {
  const { trampo, meusTrampos, minhasCandidaturas, recebidas } = entrada;
  if (
    trampo === undefined ||
    semResposta(meusTrampos) ||
    semResposta(minhasCandidaturas)
  ) {
    return { tipo: 'carregando' };
  }
  if ((meusTrampos.dados ?? []).some((meu) => meu.id === trampo.id)) {
    return { tipo: 'autor', quantidade: recebidas?.length ?? null };
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
