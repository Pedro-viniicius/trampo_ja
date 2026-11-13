import type { ColumnType } from 'kysely';

/**
 * Tabelas do módulo `avaliacoes` (migração `0009_avaliacoes.ts`). O módulo
 * recebe uma conexão `Kysely<TabelasDeAvaliacoes>` e não enxerga tabela de
 * outro módulo.
 *
 * As linhas não se editam (premissa P5): toda coluna recusa `update` no tipo.
 * A exclusão (`DadosDaConta`) apaga a linha inteira.
 */
export interface TabelasDeAvaliacoes {
  avaliacoes: TabelaAvaliacoes;
  favoritos: TabelaFavoritos;
}

/** Coluna gravada só no `insert`. */
type SoNaCriacao<T> = ColumnType<T, T, never>;

/** Valores aceitos pela check `avaliacoes_papel_do_avaliado_valido`. */
export type PapelDoAvaliadoNaTabela = 'freela' | 'contratante';

export interface TabelaAvaliacoes {
  id: SoNaCriacao<string>;
  /** Trampo do módulo `trampos`, só pelo id (sem FK entre módulos). */
  trampo_id: SoNaCriacao<string>;
  /**
   * Contas do módulo `contas`, só pelo id. Sempre diferentes entre si, e no
   * máximo uma avaliação por `(trampo_id, avaliador_id)`
   * (`avaliacoes_trampo_avaliador_unico`).
   */
  avaliador_id: SoNaCriacao<string>;
  avaliado_id: SoNaCriacao<string>;
  papel_do_avaliado: SoNaCriacao<PapelDoAvaliadoNaTabela>;
  /** `smallint` de 1 a 5; o `pg` devolve como número. */
  nota: SoNaCriacao<number>;
  /**
   * `text[]` de uma dimensão, com no máximo 5 códigos (padrão `'{}'`). A lista
   * fechada por papel e a falta de repetição ficam no domínio.
   */
  destaques: ColumnType<string[], string[] | undefined, never>;
  /**
   * Dado pessoal (LGPD): nunca em log nem em erro. Aparado, com 1 a 500 pontos
   * de código, ou `null`.
   */
  comentario: SoNaCriacao<string | null>;
  criada_em: SoNaCriacao<Date>;
}

export interface TabelaFavoritos {
  /**
   * Contas do módulo `contas`, só pelo id. Chave primária
   * `(dono_id, favorito_id)` e nunca a mesma conta nos dois lados.
   */
  dono_id: SoNaCriacao<string>;
  favorito_id: SoNaCriacao<string>;
  criado_em: SoNaCriacao<Date>;
}
