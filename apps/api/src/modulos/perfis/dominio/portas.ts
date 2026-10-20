import type { Perfil } from './perfil.js';

/** Porta de saída de persistência dos perfis: um perfil por conta. */
export interface RepositorioDePerfis {
  /** Grava o perfil da conta, criando ou substituindo o anterior (upsert). */
  salvar(perfil: Perfil): Promise<void>;
  /** Perfil da conta, ou `null` se ela ainda não salvou nenhum. */
  buscarPorConta(contaId: string): Promise<Perfil | null>;
}
