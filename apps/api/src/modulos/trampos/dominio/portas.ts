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
   * Trava pessimista das ações de estado do autor (encerrar e excluir, D33):
   * trava o trampo sem olhar a versão, lê o agregado sob a trava e o passa a
   * `decidir`, que aplica a regra (e pode lançar: nada é gravado). Conforme a
   * resposta, grava o agregado como `salvar` (`'salvar'`), apaga o trampo e
   * todas as candidaturas dele (`'excluir'`) ou não grava nada (`'nada'`).
   * Uma escrita concorrente espera a trava e depois vê o estado novo, então a
   * ação do autor nunca dá `conflito_de_versao`. Devolve `false`, sem chamar
   * `decidir`, se o trampo não existe.
   */
  alterarSobTrava(
    id: string,
    decidir: (trampo: Trampo) => GravacaoSobTrava,
  ): Promise<boolean>;
  buscarPorId(id: string): Promise<Trampo | null>;
  /** Id do trampo da candidatura, ou `null` se ela não existe (CA29). */
  trampoDaCandidatura(candidaturaId: string): Promise<string | null>;
  /** Mais recentes primeiro, na visão do autor (com versão e contagem). */
  listarDoAutor(autorId: string): Promise<TrampoDoAutor[]>;
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
