import type { IdCategoria } from '../../../compartilhado/dominio/categorias.js';
import type { Candidatura } from './candidatura.js';
import type { Trampo, TrampoDoAutor, TrampoResumo } from './trampo.js';

/** Posição na lista ordenada por `criadoEm` e `id` decrescentes. */
export interface CursorDeBusca {
  readonly criadoEm: Date;
  readonly id: string;
}

/**
 * Filtros da busca, combinados com E lógico. Chegam já normalizados pelo caso
 * de uso: o repositório compara literalmente (e, no Postgres, escapa `%`, `_`
 * e `\` do `texto`).
 */
export interface FiltrosDeBusca {
  /** Texto normalizado, procurado dentro de `textoBusca`. */
  readonly texto?: string;
  readonly categoria?: IdCategoria;
  /** Cidade normalizada, igual a `cidadeNormalizada`. */
  readonly cidade?: string;
  /** Só traz itens estritamente mais antigos que o cursor. */
  readonly antesDe?: CursorDeBusca;
  readonly limite: number;
}

/**
 * Página da lista do autor (D47): até `limite` trampos, estritamente mais
 * antigos que `antesDe` na ordem de `criadoEm` e `id` decrescentes. Chega já
 * validada pelo caso de uso.
 */
export interface PaginaDoAutor {
  readonly limite: number;
  readonly antesDe?: CursorDeBusca;
}

/** O que `alterarSobTrava` faz com o agregado depois de `decidir`. */
export type GravacaoSobTrava = 'salvar' | 'excluir' | 'nada';

export interface RepositorioDeTrampos {
  /**
   * Grava o agregado com trava otimista. Um trampo novo chega com `versao` 1;
   * um existente chega com a versão lida mais 1, e a gravação regrava todos
   * os campos editáveis. Se a versão gravada não for a esperada, lança
   * `ErroDeRegra('conflito_de_versao')`.
   *
   * Candidaturas (ADR-006): insere só as que a operação criou e apaga só as
   * que ela tirou (`alteracoesDasCandidaturas`); das demais, só o status é
   * atualizado. Uma candidatura apagada por outra transação depois da leitura
   * não volta.
   */
  salvar(trampo: Trampo): Promise<void>;
  /**
   * Trava pessimista das ações de estado do autor (encerrar e excluir, D33)
   * e da retirada do freelancer (D49): trava o trampo sem olhar a versão, lê
   * o agregado sob a trava e o passa a `decidir`, que aplica a regra (e pode
   * lançar: nada é gravado). Conforme a resposta, grava o agregado como
   * `salvar` (`'salvar'`), apaga o trampo e todas as candidaturas dele
   * (`'excluir'`) ou não grava nada (`'nada'`).
   * Uma escrita concorrente espera a trava e depois vê o estado novo, então
   * essas ações nunca dão `conflito_de_versao`. Devolve `false`, sem chamar
   * `decidir`, se o trampo não existe.
   */
  alterarSobTrava(
    id: string,
    decidir: (trampo: Trampo) => GravacaoSobTrava,
  ): Promise<boolean>;
  buscarPorId(id: string): Promise<Trampo | null>;
  /** Id do trampo da candidatura, ou `null` se ela não existe (CA29). */
  trampoDaCandidatura(candidaturaId: string): Promise<string | null>;
  /**
   * Uma página dos trampos do autor, em qualquer status, mais recentes
   * primeiro (`criadoEm` e `id` decrescentes), na visão do autor (com versão
   * e contagem). Só os do `autorId`: um cursor tirado de trampo de outra
   * conta só marca a posição.
   */
  listarDoAutor(
    autorId: string,
    pagina: PaginaDoAutor,
  ): Promise<TrampoDoAutor[]>;
  /** Só trampos abertos, mais recentes primeiro (`criadoEm` e `id` decrescentes). */
  buscar(filtros: FiltrosDeBusca): Promise<TrampoResumo[]>;
  /** Verdadeiro se há candidatura, em qualquer estado, de um para o trampo do outro. */
  existeCandidaturaEntre(a: string, b: string): Promise<boolean>;
  /**
   * Candidaturas enviadas pelo freelancer, em qualquer estado e de qualquer
   * trampo, mais recentes primeiro (`criadaEm` e `id` decrescentes).
   */
  listarCandidaturasDoFreelancer(freelancerId: string): Promise<Candidatura[]>;
}

/**
 * Porta da D9: publicar e candidatar-se exigem perfil completo. A fachada de
 * `perfis` só é ligada a esta porta na composição (etapa 13).
 */
export interface VerificadorDePerfil {
  perfilEstaCompleto(contaId: string): Promise<boolean>;
}
