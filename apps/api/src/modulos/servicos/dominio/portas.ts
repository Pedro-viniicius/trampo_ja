import type { IdCategoria } from '../../../compartilhado/dominio/categorias.js';
import type { Servico } from './servico.js';

/**
 * Posição de paginação: "itens estritamente mais antigos que este par", na
 * ordem `criadoEm` desc, `id` desc. O par evita pular ou repetir itens com o
 * mesmo `criadoEm`. A codificação opaca para o app é da fachada de busca.
 */
export interface CursorDeBusca {
  readonly criadoEm: Date;
  readonly id: string;
}

/**
 * Filtros já normalizados pelo caso de uso: `texto` e `cidade` chegam em
 * `normalizarTexto`, prontos para comparar com `textoBusca` e
 * `cidadeNormalizada`. Os filtros combinam com E lógico.
 */
export interface FiltrosDeBusca {
  /** Contido em `textoBusca`. */
  readonly texto?: string;
  /** Igual à categoria do serviço. */
  readonly categoria?: IdCategoria;
  /** Igual a `cidadeNormalizada`; serviço sem cidade nunca casa (D7). */
  readonly cidade?: string;
  readonly antesDe?: CursorDeBusca;
  readonly limite: number;
}

/** Porta de saída de persistência dos serviços. */
export interface RepositorioDeServicos {
  salvar(servico: Servico): Promise<void>;
  buscarPorId(id: string): Promise<Servico | null>;
  /** Todos os serviços do autor, mais recentes primeiro. */
  listarDoAutor(autorId: string): Promise<readonly Servico[]>;
  /** Mais recentes primeiro (`criadoEm` desc, `id` desc), no máximo `limite`. */
  buscar(filtros: FiltrosDeBusca): Promise<readonly Servico[]>;
}

/**
 * D9: pré-requisito para ofertar. Cada módulo declara a sua cópia desta porta;
 * a ligação com `perfis` só acontece na composição (etapa 13).
 */
export interface VerificadorDePerfil {
  perfilEstaCompleto(contaId: string): Promise<boolean>;
}
