import { randomBytes } from 'node:crypto';
import type { Conta } from './conta.js';
import type { Email } from './email.js';

/** Identificador da conta (uuid). É o que a fachada expõe aos outros módulos. */
export type ContaId = string;

/**
 * Lançado por `RepositorioDeContas.salvar` quando o e-mail já está gravado
 * (ex.: dois cadastros simultâneos). Não carrega o e-mail nem o id: o caso de
 * uso converte em `ErroDeRegra('email_em_uso')`.
 */
export class ErroDeEmailDuplicado extends Error {
  constructor() {
    super('email_duplicado');
    this.name = 'ErroDeEmailDuplicado';
  }
}

export interface RepositorioDeContas {
  /** Grava a conta nova. Lança `ErroDeEmailDuplicado` se o e-mail já existir. */
  salvar(conta: Conta): Promise<void>;
  buscarPorEmail(email: Email): Promise<Conta | null>;
  existeEmail(email: Email): Promise<boolean>;
}

/** Sessões guardadas pelo SHA-256 (hex) do token; o token em si nunca é gravado. */
export interface RepositorioDeSessoes {
  salvar(tokenHash: string, contaId: ContaId, expiraEm: Date): Promise<void>;
  /** Conta da sessão, ou `null` se não existir ou se `expiraEm <= agora`. */
  buscarContaIdPorTokenHash(
    tokenHash: string,
    agora: Date,
  ): Promise<ContaId | null>;
  /** Remove a sessão; não falha se ela não existir. */
  remover(tokenHash: string): Promise<void>;
}

export interface HasherDeSenha {
  gerarHash(senha: string): Promise<string>;
  /** `false` para senha errada ou hash malformado; nunca lança por formato. */
  verificar(senha: string, hashArmazenado: string): Promise<boolean>;
}

export interface GeradorDeToken {
  gerar(): string;
}

const BYTES_DO_TOKEN = 32;

/** Padrão: 32 bytes de `crypto.randomBytes` em base64url (43 caracteres). */
export const geradorDeTokenPadrao: GeradorDeToken = Object.freeze({
  gerar: () => randomBytes(BYTES_DO_TOKEN).toString('base64url'),
});
