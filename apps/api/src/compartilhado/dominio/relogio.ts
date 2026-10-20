/** Porta de tempo: o domínio pede a hora ao relógio, nunca a `new Date()` direto. */
export interface Relogio {
  agora(): Date;
}

/** Relógio real, usado na composição da aplicação. */
export const relogioDoSistema: Relogio = {
  agora: () => new Date(),
};

/** Relógio parado num instante, para testes determinísticos. */
export class RelogioFixo implements Relogio {
  #instante: Date;

  constructor(instante: Date | string) {
    const data = new Date(instante);
    if (Number.isNaN(data.getTime())) {
      throw new TypeError('RelogioFixo: instante inválido');
    }
    this.#instante = data;
  }

  /** Devolve uma cópia: quem recebe não consegue mudar a hora do relógio. */
  agora(): Date {
    return new Date(this.#instante.getTime());
  }

  /** Avança o relógio em milissegundos (útil para testar expiração). */
  avancar(milissegundos: number): void {
    this.#instante = new Date(this.#instante.getTime() + milissegundos);
  }
}
