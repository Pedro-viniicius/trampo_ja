import type { Avaliacao, PapelDoAvaliado } from './avaliacao.js';
import type { Favorito } from './favorito.js';

/**
 * Transação em curso, opaca para o domínio. Na gravação, o adaptador Postgres
 * a passa à conferência do vínculo, para a consulta correr na mesma conexão e
 * sob a mesma trava das contas; o adaptador em memória passa `undefined`.
 */
export type TransacaoEmCurso = unknown;

/** Conferência do vínculo dentro da gravação (ver `inserirAvaliacao`). */
export type ConferirVinculo = (transacao: TransacaoEmCurso) => Promise<boolean>;

/**
 * Resposta de `VinculoDeAvaliacao.obter` (ADR-011), na mesma forma de
 * `trampos.vinculoParaAvaliacao`: quem a conta pode avaliar no trampo e em
 * que papel; `'nao_encerrado'` se ela é parte, mas o trampo ainda não está
 * encerrado; `null` se ela não é parte (ou não há a quem avaliar).
 */
export type VinculoParaAvaliacao =
  | {
      readonly avaliadoId: string;
      readonly papelDoAvaliado: PapelDoAvaliado;
    }
  | 'nao_encerrado'
  | null;

/**
 * CA87: quem pode avaliar quem num trampo. Na composição, ligada a
 * `trampos.vinculoParaAvaliacao`; declarada aqui para este módulo não
 * importar `trampos`.
 */
export interface VinculoDeAvaliacao {
  /**
   * São partes o autor do trampo e o freelancer da candidatura `aceita`. O
   * autor avalia o freela (`'freela'`) e o freela avalia o autor
   * (`'contratante'`), só com o trampo `encerrado`. Terceiro, trampo
   * inexistente ou id fora do formato: `null`, igual em qualquer status (sem
   * oráculo). Com `transacao` (a de `inserirAvaliacao`), a consulta roda nela;
   * sem, numa conexão qualquer.
   */
  obter(
    trampoId: string,
    contaId: string,
    transacao?: TransacaoEmCurso,
  ): Promise<VinculoParaAvaliacao>;
}

/**
 * CA92 (D4): só favorita quem tem vínculo (candidatura em qualquer estado
 * entre os dois). Na composição, ligada a `trampos.existeVinculoEntre`.
 */
export interface VerificadorDeVinculo {
  /**
   * Com `transacao` (a de `inserirFavorito`), a consulta roda nela; sem,
   * numa conexão qualquer.
   */
  existeVinculoEntre(
    a: string,
    b: string,
    transacao?: TransacaoEmCurso,
  ): Promise<boolean>;
}

/**
 * Resultado de `inserirAvaliacao`. `ja_feita`: já há avaliação do mesmo
 * avaliador no trampo (no Postgres, o 23505 de
 * `avaliacoes_trampo_avaliador_unico`, nunca um "ler e depois gravar").
 * `sem_vinculo`: a conferência do vínculo, feita sob a trava das duas contas,
 * deu `false` (a exclusão de conta de um dos dois terminou nesse meio-tempo,
 * D25); nada foi gravado.
 */
export type ResultadoDaAvaliacao = 'inserida' | 'ja_feita' | 'sem_vinculo';

/**
 * Resultado de `inserirFavorito`. `ja_existe`: o par já está favoritado
 * (nada muda, nem o `criadoEm`), com ou sem vínculo (D61). `sem_vinculo`: o
 * par é novo e a conferência do vínculo deu `false`. `limite_atingido`: o dono já tem `limite` favoritos. Nos dois
 * últimos, nada foi gravado.
 */
export type ResultadoDoFavorito =
  | 'inserido'
  | 'ja_existe'
  | 'sem_vinculo'
  | 'limite_atingido';

export interface OpcoesDeInsercaoDeFavorito {
  /** Teto de favoritos por dono (`LIMITE_DE_FAVORITOS`). */
  readonly limite: number;
  readonly conferirVinculo: ConferirVinculo;
}

/** Posição na lista ordenada por `criadaEm` e `id` decrescentes (CA90). */
export interface CursorDeAvaliacoes {
  readonly criadaEm: Date;
  readonly id: string;
}

/** Página das avaliações recebidas, já validada pelo caso de uso. */
export interface PaginaDeAvaliacoes {
  readonly limite: number;
  /** Só traz avaliações estritamente mais antigas que o cursor. */
  readonly antesDe?: CursorDeAvaliacoes;
}

/**
 * Avaliação recebida como o repositório a lê para a listagem (CA90): sem o
 * trampo e sem o avaliado. O `id` serve só ao cursor; não vai na resposta.
 */
export type AvaliacaoLida = Pick<
  Avaliacao,
  'id' | 'nota' | 'destaques' | 'comentario' | 'avaliadorId' | 'criadaEm'
>;

/** Avaliação feita pela conta, só com o que o CA91 devolve. */
export type AvaliacaoFeita = Pick<Avaliacao, 'trampoId' | 'nota' | 'criadaEm'>;

/** Quantas vezes um destaque aparece nas avaliações recebidas num papel. */
export interface ContagemDeDestaque {
  readonly codigo: string;
  readonly quantidade: number;
}

/**
 * Agregado das avaliações recebidas por uma conta num papel (CA89). Só vem
 * do repositório quem tem ao menos uma avaliação no papel; a média e os
 * destaques mais frequentes são calculados no domínio (`resumo.ts`).
 */
export interface ContagemDeAvaliacoes {
  readonly contaId: string;
  readonly papel: PapelDoAvaliado;
  readonly total: number;
  readonly somaDasNotas: number;
  readonly destaques: readonly ContagemDeDestaque[];
}

/**
 * Porta de saída de persistência das avaliações e dos favoritos. Não há
 * método de editar nem de apagar avaliação (P5, D59): só a exclusão de conta
 * (`DadosDaConta`, pela fachada) as apaga.
 */
export interface RepositorioDeAvaliacoes {
  /**
   * Grava a avaliação só se `conferirVinculo` confirmar o vínculo, chamado
   * depois de travar as duas contas contra a exclusão (no Postgres, a trava
   * compartilhada de `compartilhado/banco/travas-de-conta.ts`, na transação do
   * insert). Assim, nenhuma avaliação fica com o id de uma conta excluída.
   */
  inserirAvaliacao(
    avaliacao: Avaliacao,
    conferirVinculo: ConferirVinculo,
  ): Promise<ResultadoDaAvaliacao>;
  /**
   * Avaliações recebidas por `avaliadoId` no `papel`, mais recentes primeiro
   * (`criadaEm` e `id` decrescentes), no máximo `limite`.
   */
  listarRecebidas(
    avaliadoId: string,
    papel: PapelDoAvaliado,
    pagina: PaginaDeAvaliacoes,
  ): Promise<readonly AvaliacaoLida[]>;
  /** Avaliações que `avaliadorId` fez nos trampos pedidos, em qualquer ordem. */
  listarFeitasNosTrampos(
    avaliadorId: string,
    trampoIds: readonly string[],
  ): Promise<readonly AvaliacaoFeita[]>;
  /**
   * Agregados das avaliações recebidas pelas contas pedidas, um por conta e
   * papel que tenha avaliação, em qualquer ordem.
   */
  contarRecebidas(
    contaIds: readonly string[],
  ): Promise<readonly ContagemDeAvaliacoes[]>;
  /**
   * Grava o favorito, nesta ordem (D61): par já gravado → `ja_existe`, sem
   * conferir o vínculo; `conferirVinculo` negativo (sob a trava compartilhada
   * das duas contas) → `sem_vinculo`; dono com `limite` favoritos →
   * `limite_atingido`. A contagem e a gravação têm de ser atômicas por dono:
   * duas gravações simultâneas não passam juntas do teto.
   */
  inserirFavorito(
    favorito: Favorito,
    opcoes: OpcoesDeInsercaoDeFavorito,
  ): Promise<ResultadoDoFavorito>;
  /** Apaga o favorito, se existir. Idempotente. */
  removerFavorito(donoId: string, favoritoId: string): Promise<void>;
  /** Favoritos do dono, mais recentes primeiro (`criadoEm` e `favoritoId` decrescentes). */
  listarFavoritos(donoId: string): Promise<readonly Favorito[]>;
}
