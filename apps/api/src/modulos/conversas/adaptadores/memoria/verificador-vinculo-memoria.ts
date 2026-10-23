import type { VerificadorDeVinculo } from '../../dominio/portas.js';

function chave(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Fake de teste da porta do CA13: um conjunto de pares com vínculo
 * (candidatura ou contratação). O vínculo vale nos dois sentidos.
 */
export class VerificadorDeVinculoEmMemoria implements VerificadorDeVinculo {
  readonly #pares = new Set<string>();

  constructor(pares: Iterable<readonly [string, string]> = []) {
    for (const [a, b] of pares) {
      this.vincular(a, b);
    }
  }

  vincular(a: string, b: string): void {
    this.#pares.add(chave(a, b));
  }

  desvincular(a: string, b: string): void {
    this.#pares.delete(chave(a, b));
  }

  /** A transação, se vier, é ignorada: não há banco. */
  async existeVinculoEntre(a: string, b: string): Promise<boolean> {
    return this.#pares.has(chave(a, b));
  }
}
