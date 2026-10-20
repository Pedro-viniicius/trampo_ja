import type { VerificadorDePerfil } from '../../dominio/portas.js';

/** Fake da porta da D9: guarda o conjunto de contas com perfil completo. */
export class VerificadorDePerfilEmMemoria implements VerificadorDePerfil {
  readonly #completos = new Set<string>();

  constructor(contasComPerfilCompleto: Iterable<string> = []) {
    for (const contaId of contasComPerfilCompleto) {
      this.#completos.add(contaId);
    }
  }

  completar(contaId: string): void {
    this.#completos.add(contaId);
  }

  async perfilEstaCompleto(contaId: string): Promise<boolean> {
    return this.#completos.has(contaId);
  }
}
