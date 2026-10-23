// Sob carga contínua a fila pode nunca esvaziar; compacta de tempos em tempos.
const COMPACTAR_A_PARTIR_DE = 1024;

/**
 * Semáforo contador com fila FIFO e sem teto: no máximo `limite` tarefas rodam
 * ao mesmo tempo; as demais esperam na ordem de chegada.
 *
 * Quando uma tarefa termina (com sucesso ou erro), a vaga passa direto para a
 * primeira da fila, então ninguém que chega depois fura a fila.
 */
export class Semaforo {
  readonly #limite: number;
  #emUso = 0;
  // Fila com índice de início: `shift()` em fila longa custaria O(n) por saída.
  #fila: Array<() => void> = [];
  #inicio = 0;

  constructor(limite: number) {
    if (!Number.isSafeInteger(limite) || limite < 1) {
      throw new TypeError('Semaforo: o limite precisa ser um inteiro >= 1');
    }
    this.#limite = limite;
  }

  /** Tarefas rodando agora. */
  get emUso(): number {
    return this.#emUso;
  }

  /** Tarefas esperando vaga. */
  get naFila(): number {
    return this.#fila.length - this.#inicio;
  }

  /**
   * Roda `tarefa` quando houver vaga e devolve o resultado dela. A vaga é
   * liberada em `finally`: também quando a tarefa lança ou rejeita.
   */
  async executar<T>(tarefa: () => Promise<T>): Promise<T> {
    await this.#adquirir();
    try {
      return await tarefa();
    } finally {
      this.#liberar();
    }
  }

  #adquirir(): Promise<void> {
    if (this.#emUso < this.#limite) {
      this.#emUso += 1;
      return Promise.resolve();
    }
    return new Promise((resolver) => {
      this.#fila.push(resolver);
    });
  }

  #liberar(): void {
    if (this.#inicio < this.#fila.length) {
      const proxima = this.#fila[this.#inicio] as () => void;
      this.#inicio += 1;
      this.#compactarFila();
      // A vaga passa direto: `#emUso` não muda.
      proxima();
      return;
    }
    this.#emUso -= 1;
  }

  /** Descarta as posições já atendidas, sem refazer o array a cada saída. */
  #compactarFila(): void {
    if (this.#inicio === this.#fila.length) {
      this.#fila = [];
      this.#inicio = 0;
    } else if (
      this.#inicio >= COMPACTAR_A_PARTIR_DE &&
      this.#inicio * 2 >= this.#fila.length
    ) {
      this.#fila = this.#fila.slice(this.#inicio);
      this.#inicio = 0;
    }
  }
}
