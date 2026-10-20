import type { IdCategoria } from '../../../compartilhado/dominio/categorias.js';
import type { Candidatura } from './candidatura.js';
import type { Trampo, TrampoResumo } from './trampo.js';

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

export interface RepositorioDeTrampos {
  /**
   * Grava o agregado inteiro com trava otimista. Um trampo novo chega com
   * `versao` 1; um existente chega com a versão lida mais 1. Se a versão
   * gravada não for a esperada, lança `ErroDeRegra('conflito_de_versao')`.
   */
  salvar(trampo: Trampo): Promise<void>;
  buscarPorId(id: string): Promise<Trampo | null>;
  /** Mais recentes primeiro. */
  listarDoAutor(autorId: string): Promise<TrampoResumo[]>;
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
