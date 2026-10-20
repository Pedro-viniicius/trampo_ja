import type { Perfil } from '../../dominio/perfil.js';
import type { RepositorioDePerfis } from '../../dominio/portas.js';

/**
 * Adaptador de teste: guarda um perfil por conta num `Map`, sem banco. O
 * `Perfil` é imutável, então guardar a própria instância não vaza alteração.
 */
export class RepositorioDePerfisEmMemoria implements RepositorioDePerfis {
  readonly #perfis = new Map<string, Perfil>();

  async salvar(perfil: Perfil): Promise<void> {
    this.#perfis.set(perfil.contaId, perfil);
  }

  async buscarPorConta(contaId: string): Promise<Perfil | null> {
    return this.#perfis.get(contaId) ?? null;
  }

  /** Quantos perfis estão guardados (para os testes conferirem gravações). */
  get tamanho(): number {
    return this.#perfis.size;
  }
}
