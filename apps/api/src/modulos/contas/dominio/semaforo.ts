// Sob carga contínua a fila pode nunca esvaziar; compacta de tempos em tempos.
const COMPACTAR_A_PARTIR_DE = 1024;

// Maior atraso que o `setTimeout` aceita; acima disso o Node dispara em 1 ms.
const ESPERA_MAXIMA_ACEITA_MS = 2_147_483_647;

/** Opções de uma execução. Sem nenhuma, a tarefa espera o quanto for preciso. */
export interface OpcoesDeExecucao {
  /**
   * Tempo máximo, em ms, esperando vaga na fila. Esgotado, a tarefa sai da
   * fila sem rodar e a promessa rejeita com `EsperaEsgotada`. Não limita a
   * tarefa depois que ela pega a vaga.
   */
  readonly esperaMaximaMs?: number;
  /**
   * Sinal de cancelamento (ex.: a conexão do pedido caiu). Abortado antes de a
   * tarefa pegar a vaga, ela sai da fila sem rodar e a promessa rejeita com
   * `EsperaCancelada`. Abortado depois, não interrompe a tarefa.
   */
  readonly sinal?: AbortSignal;
}

/** A espera pela vaga passou de `esperaMaximaMs`; a tarefa não rodou. */
export class EsperaEsgotada extends Error {
  constructor() {
    super('espera_esgotada');
    this.name = 'EsperaEsgotada';
  }
}

/**
 * O sinal abortou antes de a tarefa pegar a vaga; ela não rodou. A mensagem
 * é fixa: o motivo do abort (`sinal.reason`) nunca é copiado.
 */
export class EsperaCancelada extends Error {
  constructor() {
    super('espera_cancelada');
    this.name = 'EsperaCancelada';
  }
}

/**
 * Lugar na fila. `ativa` vira `false` quando a vaga é concedida ou quando a
 * espera esgota ou é cancelada; o que acontecer primeiro vale, e os demais
 * caminhos viram no-op.
 */
interface Espera {
  ativa: boolean;
  readonly conceder: () => void;
}

/**
 * Semáforo contador com fila FIFO e sem teto: no máximo `limite` tarefas rodam
 * ao mesmo tempo; as demais esperam na ordem de chegada.
 *
 * Quando uma tarefa termina (com sucesso ou erro), a vaga passa direto para a
 * primeira da fila, então ninguém que chega depois fura a fila. Quem sai da
 * fila por espera esgotada ou cancelada não consome vaga nem muda a ordem dos
 * demais.
 */
export class Semaforo {
  readonly #limite: number;
  #emUso = 0;
  // Fila com índice de início: `shift()` em fila longa custaria O(n) por saída.
  // Quem sai do meio da fila fica marcado como inativo e é pulado depois.
  #fila: Espera[] = [];
  #inicio = 0;
  #esperando = 0;

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
    return this.#esperando;
  }

  /**
   * Roda `tarefa` quando houver vaga e devolve o resultado dela. A vaga é
   * liberada em `finally`: também quando a tarefa lança ou rejeita.
   *
   * Com `sinal` já abortado, rejeita com `EsperaCancelada` sem rodar, mesmo
   * com vaga livre. Com vaga livre, roda na hora, sem olhar `esperaMaximaMs`.
   */
  async executar<T>(
    tarefa: () => Promise<T>,
    opcoes: OpcoesDeExecucao = {},
  ): Promise<T> {
    await this.#adquirir(opcoes);
    try {
      return await tarefa();
    } finally {
      this.#liberar();
    }
  }

  #adquirir({ esperaMaximaMs, sinal }: OpcoesDeExecucao): Promise<void> {
    if (
      esperaMaximaMs !== undefined &&
      !(
        Number.isFinite(esperaMaximaMs) &&
        esperaMaximaMs >= 0 &&
        esperaMaximaMs <= ESPERA_MAXIMA_ACEITA_MS
      )
    ) {
      return Promise.reject(
        new TypeError(
          'Semaforo: esperaMaximaMs precisa ser um número de 0 a 2^31-1',
        ),
      );
    }
    if (sinal?.aborted) {
      return Promise.reject(new EsperaCancelada());
    }
    if (this.#emUso < this.#limite) {
      this.#emUso += 1;
      return Promise.resolve();
    }
    if (esperaMaximaMs === 0) {
      return Promise.reject(new EsperaEsgotada());
    }

    return new Promise<void>((resolver, rejeitar) => {
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const aoAbortar = () => sair(new EsperaCancelada());
      const parar = () => {
        clearTimeout(temporizador);
        sinal?.removeEventListener('abort', aoAbortar);
      };
      const espera: Espera = {
        ativa: true,
        conceder: () => {
          parar();
          resolver();
        },
      };
      const sair = (erro: Error) => {
        if (!espera.ativa) {
          return;
        }
        espera.ativa = false;
        parar();
        this.#esperando -= 1;
        this.#compactarFila();
        rejeitar(erro);
      };

      this.#fila.push(espera);
      this.#esperando += 1;
      if (esperaMaximaMs !== undefined) {
        temporizador = setTimeout(
          () => sair(new EsperaEsgotada()),
          esperaMaximaMs,
        );
        // O temporizador só serve para recusar quem espera: não segura o
        // processo vivo no encerramento.
        temporizador.unref();
      }
      sinal?.addEventListener('abort', aoAbortar, { once: true });
    });
  }

  #liberar(): void {
    // Sem ninguém esperando, a fila já foi zerada por `#compactarFila`.
    while (this.#inicio < this.#fila.length) {
      const proxima = this.#fila[this.#inicio] as Espera;
      this.#inicio += 1;
      if (!proxima.ativa) {
        continue;
      }
      proxima.ativa = false;
      this.#esperando -= 1;
      this.#compactarFila();
      // A vaga passa direto: `#emUso` não muda.
      proxima.conceder();
      return;
    }
    this.#emUso -= 1;
  }

  /**
   * Descarta as posições já atendidas ou que saíram da fila, sem refazer o
   * array a cada saída: só quando as inativas são ao menos metade dele.
   */
  #compactarFila(): void {
    if (this.#esperando === 0) {
      this.#fila = [];
      this.#inicio = 0;
    } else if (
      this.#fila.length >= COMPACTAR_A_PARTIR_DE &&
      this.#esperando * 2 <= this.#fila.length
    ) {
      this.#fila = this.#fila
        .slice(this.#inicio)
        .filter((espera) => espera.ativa);
      this.#inicio = 0;
    }
  }
}
