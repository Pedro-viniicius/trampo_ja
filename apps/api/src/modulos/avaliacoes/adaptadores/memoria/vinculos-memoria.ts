import type {
  VerificadorDeVinculo,
  VinculoDeAvaliacao,
  VinculoParaAvaliacao,
} from '../../dominio/portas.js';

/** Status do trampo, como no módulo `trampos`. */
export type StatusDoTrampo = 'aberto' | 'em_andamento' | 'encerrado';

/** O que o fake sabe de um trampo para decidir quem avalia quem. */
export interface TrampoParaAvaliacao {
  readonly autorId: string;
  /** Freelancer da candidatura `aceita`; `null` se nenhuma foi aceita. */
  readonly freelaAceitoId: string | null;
  readonly status: StatusDoTrampo;
}

/**
 * Fake de teste da porta do CA87, com a mesma regra de
 * `trampos.vinculoParaAvaliacao`: o autor avalia o freela aceito e o freela
 * aceito avalia o autor, só com o trampo encerrado; parte com o trampo aberto
 * ou em andamento recebe `'nao_encerrado'`; terceiro, trampo inexistente ou
 * sem freela aceito, `null`.
 */
export class VinculoDeAvaliacaoEmMemoria implements VinculoDeAvaliacao {
  readonly #trampos = new Map<string, TrampoParaAvaliacao>();

  registrar(trampoId: string, trampo: TrampoParaAvaliacao): void {
    this.#trampos.set(trampoId, { ...trampo });
  }

  mudarStatus(trampoId: string, status: StatusDoTrampo): void {
    const trampo = this.#trampos.get(trampoId);
    if (!trampo) {
      throw new Error('trampo não registrado no fake');
    }
    this.#trampos.set(trampoId, { ...trampo, status });
  }

  /** Some com o trampo, como a exclusão da conta do autor (D25). */
  remover(trampoId: string): void {
    this.#trampos.delete(trampoId);
  }

  /** A transação, se vier, é ignorada: não há banco. */
  async obter(
    trampoId: string,
    contaId: string,
  ): Promise<VinculoParaAvaliacao> {
    const trampo = this.#trampos.get(trampoId);
    if (!trampo) {
      return null;
    }
    const ehAutor = contaId === trampo.autorId;
    const ehFreelaAceito =
      trampo.freelaAceitoId !== null && contaId === trampo.freelaAceitoId;
    if (ehAutor === ehFreelaAceito) {
      // Nenhum dos dois (terceiro) ou os dois ao mesmo tempo (dado incoerente).
      return null;
    }
    if (trampo.status !== 'encerrado') {
      return 'nao_encerrado';
    }
    if (ehFreelaAceito) {
      return { avaliadoId: trampo.autorId, papelDoAvaliado: 'contratante' };
    }
    return trampo.freelaAceitoId === null
      ? null
      : { avaliadoId: trampo.freelaAceitoId, papelDoAvaliado: 'freela' };
  }
}

function chaveDoPar(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Fake de teste da porta do CA92 (D4): um conjunto de pares com vínculo
 * (candidatura em qualquer estado). O vínculo vale nos dois sentidos.
 */
export class VerificadorDeVinculoEmMemoria implements VerificadorDeVinculo {
  readonly #pares = new Set<string>();

  constructor(pares: Iterable<readonly [string, string]> = []) {
    for (const [a, b] of pares) {
      this.vincular(a, b);
    }
  }

  vincular(a: string, b: string): void {
    this.#pares.add(chaveDoPar(a, b));
  }

  desvincular(a: string, b: string): void {
    this.#pares.delete(chaveDoPar(a, b));
  }

  /** A transação, se vier, é ignorada: não há banco. */
  async existeVinculoEntre(a: string, b: string): Promise<boolean> {
    return this.#pares.has(chaveDoPar(a, b));
  }
}
