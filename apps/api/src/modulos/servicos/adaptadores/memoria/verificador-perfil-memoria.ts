import type { VerificadorDePerfil } from '../../dominio/portas.js';

/** Fake de teste da porta da D9: um conjunto de contas com perfil completo. */
export class VerificadorDePerfilEmMemoria implements VerificadorDePerfil {
  readonly #completos: Set<string>;

  constructor(contasComPerfilCompleto: Iterable<string> = []) {
    this.#completos = new Set(contasComPerfilCompleto);
  }

  completar(contaId: string): void {
    this.#completos.add(contaId);
  }

  descompletar(contaId: string): void {
    this.#completos.delete(contaId);
  }

  async perfilEstaCompleto(contaId: string): Promise<boolean> {
    return this.#completos.has(contaId);
  }
}
