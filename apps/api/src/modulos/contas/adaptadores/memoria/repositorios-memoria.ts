import type { Conta } from '../../dominio/conta.js';
import type { Email } from '../../dominio/email.js';
import {
  type ContaId,
  ErroDeEmailDuplicado,
  type RepositorioDeContas,
  type RepositorioDeSessoes,
} from '../../dominio/portas.js';

/** Contas em memória, indexadas pelo e-mail normalizado (testes e BDD). */
export class RepositorioDeContasEmMemoria implements RepositorioDeContas {
  readonly #porEmail = new Map<string, Conta>();

  async salvar(conta: Conta): Promise<void> {
    if (this.#porEmail.has(conta.email.valor)) {
      throw new ErroDeEmailDuplicado();
    }
    this.#porEmail.set(conta.email.valor, conta);
  }

  async buscarPorEmail(email: Email): Promise<Conta | null> {
    return this.#porEmail.get(email.valor) ?? null;
  }

  async existeEmail(email: Email): Promise<boolean> {
    return this.#porEmail.has(email.valor);
  }

  /** Para os testes: quantas contas foram gravadas. */
  get quantidade(): number {
    return this.#porEmail.size;
  }
}

interface SessaoGravada {
  readonly contaId: ContaId;
  readonly expiraEm: Date;
}

/** Sessões em memória, indexadas pelo hash do token (testes e BDD). */
export class RepositorioDeSessoesEmMemoria implements RepositorioDeSessoes {
  readonly #porTokenHash = new Map<string, SessaoGravada>();

  async salvar(
    tokenHash: string,
    contaId: ContaId,
    expiraEm: Date,
  ): Promise<void> {
    this.#porTokenHash.set(tokenHash, {
      contaId,
      expiraEm: new Date(expiraEm.getTime()),
    });
  }

  async buscarContaIdPorTokenHash(
    tokenHash: string,
    agora: Date,
  ): Promise<ContaId | null> {
    const sessao = this.#porTokenHash.get(tokenHash);
    if (!sessao || sessao.expiraEm.getTime() <= agora.getTime()) {
      return null;
    }
    return sessao.contaId;
  }

  async remover(tokenHash: string): Promise<void> {
    this.#porTokenHash.delete(tokenHash);
  }

  /** Para os testes: as chaves gravadas, para conferir que são hashes. */
  hashesGravados(): string[] {
    return [...this.#porTokenHash.keys()];
  }
}
