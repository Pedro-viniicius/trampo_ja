import { randomUUID } from 'node:crypto';
import type { Email } from './email.js';
import type { ContaId } from './portas.js';

interface DadosDaConta {
  readonly id: ContaId;
  readonly email: Email;
  readonly senhaHash: string;
  readonly criadaEm: Date;
}

/**
 * Conta de acesso: e-mail e hash da senha. A senha em texto puro nunca chega
 * aqui. `toJSON` omite o e-mail (dado pessoal) e o hash, para que um log
 * acidental da entidade não vaze nenhum dos dois (CA15).
 */
export class Conta {
  readonly id: ContaId;
  readonly email: Email;
  readonly senhaHash: string;
  readonly #criadaEm: Date;

  private constructor(dados: DadosDaConta) {
    if (typeof dados.id !== 'string' || dados.id === '') {
      throw new TypeError('Conta: id vazio');
    }
    if (typeof dados.senhaHash !== 'string' || dados.senhaHash === '') {
      throw new TypeError('Conta: hash de senha vazio');
    }
    if (Number.isNaN(dados.criadaEm.getTime())) {
      throw new TypeError('Conta: data de criação inválida');
    }
    this.id = dados.id;
    this.email = dados.email;
    this.senhaHash = dados.senhaHash;
    this.#criadaEm = new Date(dados.criadaEm.getTime());
  }

  /** Conta nova, com id `crypto.randomUUID()`. */
  static criar(dados: Omit<DadosDaConta, 'id'>): Conta {
    return new Conta({ ...dados, id: randomUUID() });
  }

  /** Reconstrói uma conta já gravada (adaptadores de persistência). */
  static reconstituir(dados: DadosDaConta): Conta {
    return new Conta(dados);
  }

  /** Devolve uma cópia: quem recebe não altera a conta. */
  get criadaEm(): Date {
    return new Date(this.#criadaEm.getTime());
  }

  toJSON(): { id: ContaId; criadaEm: string } {
    return { id: this.id, criadaEm: this.#criadaEm.toISOString() };
  }
}
