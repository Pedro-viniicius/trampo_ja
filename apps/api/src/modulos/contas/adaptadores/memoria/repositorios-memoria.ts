import {
  type Relogio,
  relogioDoSistema,
} from '../../../../compartilhado/dominio/relogio.js';
import type { Conta } from '../../dominio/conta.js';
import type { Email } from '../../dominio/email.js';
import {
  type ContaId,
  type DadosDaConta,
  ErroDeEmailDuplicado,
  type PartesExportadas,
  type RepositorioDeContas,
  type RepositorioDeSessoes,
  type SessaoDaConta,
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

  async buscarPorId(id: ContaId): Promise<Conta | null> {
    for (const conta of this.#porEmail.values()) {
      if (conta.id === id) {
        return conta;
      }
    }
    return null;
  }

  async existeEmail(email: Email): Promise<boolean> {
    return this.#porEmail.has(email.valor);
  }

  /** Apaga a conta pelo id; sem a conta, não faz nada (`DadosDaContaEmMemoria`). */
  excluir(id: ContaId): void {
    for (const [chave, conta] of this.#porEmail) {
      if (conta.id === id) {
        this.#porEmail.delete(chave);
      }
    }
  }

  /** Para os testes: quantas contas foram gravadas. */
  get quantidade(): number {
    return this.#porEmail.size;
  }
}

interface SessaoGravada {
  readonly contaId: ContaId;
  readonly expiraEm: Date;
  readonly criadaEm: Date;
}

/** Sessões em memória, indexadas pelo hash do token (testes e BDD). */
export class RepositorioDeSessoesEmMemoria implements RepositorioDeSessoes {
  readonly #porTokenHash = new Map<string, SessaoGravada>();
  readonly #relogio: Relogio;

  /** O relógio faz o papel do `default now()` de `sessoes.criada_em`. */
  constructor(relogio: Relogio = relogioDoSistema) {
    this.#relogio = relogio;
  }

  async salvar(
    tokenHash: string,
    contaId: ContaId,
    expiraEm: Date,
  ): Promise<void> {
    this.#porTokenHash.set(tokenHash, {
      contaId,
      expiraEm: new Date(expiraEm.getTime()),
      criadaEm: this.#relogio.agora(),
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

  async listarDaConta(contaId: ContaId): Promise<SessaoDaConta[]> {
    return [...this.#porTokenHash.values()]
      .filter((sessao) => sessao.contaId === contaId)
      .sort((a, b) => a.criadaEm.getTime() - b.criadaEm.getTime())
      .map((sessao) => ({
        criadaEm: new Date(sessao.criadaEm.getTime()),
        expiraEm: new Date(sessao.expiraEm.getTime()),
      }));
  }

  /** Apaga todas as sessões da conta (`DadosDaContaEmMemoria`). */
  excluirDaConta(contaId: ContaId): void {
    for (const [chave, sessao] of this.#porTokenHash) {
      if (sessao.contaId === contaId) {
        this.#porTokenHash.delete(chave);
      }
    }
  }

  /** Para os testes: as chaves gravadas, para conferir que são hashes. */
  hashesGravados(): string[] {
    return [...this.#porTokenHash.keys()];
  }
}

/** Exportação sem nada nos outros módulos. */
export const PARTES_VAZIAS: PartesExportadas = Object.freeze({
  perfil: null,
  trampos: [],
  servicos: [],
  candidaturas: [],
  conversas: [],
});

/**
 * `DadosDaConta` para testes e BDD, no lugar da composição: a exclusão apaga
 * a conta e as sessões dos repositórios em memória (como o cascade do banco)
 * e a coleta devolve as partes recebidas. Guarda os ids de cada chamada.
 */
export class DadosDaContaEmMemoria implements DadosDaConta {
  readonly #contas: RepositorioDeContasEmMemoria;
  readonly #sessoes: RepositorioDeSessoesEmMemoria;
  readonly #partes: PartesExportadas;
  /** Ids recebidos por `excluirTudo`, na ordem. */
  readonly exclusoes: ContaId[] = [];
  /** Ids recebidos por `coletarDosOutrosModulos`, na ordem. */
  readonly coletas: ContaId[] = [];

  constructor(dependencias: {
    readonly contas: RepositorioDeContasEmMemoria;
    readonly sessoes: RepositorioDeSessoesEmMemoria;
    readonly partes?: PartesExportadas;
  }) {
    this.#contas = dependencias.contas;
    this.#sessoes = dependencias.sessoes;
    this.#partes = dependencias.partes ?? PARTES_VAZIAS;
  }

  async excluirTudo(contaId: ContaId): Promise<void> {
    this.exclusoes.push(contaId);
    this.#sessoes.excluirDaConta(contaId);
    this.#contas.excluir(contaId);
  }

  async coletarDosOutrosModulos(contaId: ContaId): Promise<PartesExportadas> {
    this.coletas.push(contaId);
    return this.#partes;
  }
}
