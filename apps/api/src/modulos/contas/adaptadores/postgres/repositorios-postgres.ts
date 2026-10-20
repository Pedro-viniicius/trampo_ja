import type { Kysely } from 'kysely';
import { Conta } from '../../dominio/conta.js';
import type { Email } from '../../dominio/email.js';
import {
  type ContaId,
  ErroDeEmailDuplicado,
  type RepositorioDeContas,
  type RepositorioDeSessoes,
} from '../../dominio/portas.js';
import type { TabelasDeContas } from './tabelas.js';

// SQLSTATE de violação de unicidade e o nome da constraint (migração 0001).
const VIOLACAO_DE_UNICIDADE = '23505';
const CONSTRAINT_DO_EMAIL = 'contas_email_key';

/**
 * Erro do driver `pg` para e-mail repetido. Por pato (`code` e `constraint`),
 * como o logger compartilhado, para não depender da classe do driver.
 */
function ehEmailDuplicado(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) {
    return false;
  }
  const { code, constraint } = erro as { code?: unknown; constraint?: unknown };
  return code === VIOLACAO_DE_UNICIDADE && constraint === CONSTRAINT_DO_EMAIL;
}

/** Contas no Postgres (tabela `contas`). */
export class RepositorioDeContasPostgres implements RepositorioDeContas {
  readonly #db: Kysely<TabelasDeContas>;

  constructor(db: Kysely<TabelasDeContas>) {
    this.#db = db;
  }

  /**
   * Grava a conta nova. E-mail repetido vira `ErroDeEmailDuplicado`, que não
   * leva o erro do driver: o `detail` dele traz o e-mail (`Key (email)=(...)`).
   */
  async salvar(conta: Conta): Promise<void> {
    try {
      await this.#db
        .insertInto('contas')
        .values({
          id: conta.id,
          email: conta.email.valor,
          senha_hash: conta.senhaHash,
          criada_em: conta.criadaEm,
        })
        .execute();
    } catch (erro) {
      if (ehEmailDuplicado(erro)) {
        // Erro novo, sem `cause`: nada do erro original sobe.
        throw new ErroDeEmailDuplicado();
      }
      throw erro;
    }
  }

  async buscarPorEmail(email: Email): Promise<Conta | null> {
    const linha = await this.#db
      .selectFrom('contas')
      .select(['id', 'senha_hash', 'criada_em'])
      .where('email', '=', email.valor)
      .executeTakeFirst();
    if (!linha) {
      return null;
    }
    // A busca é por igualdade exata, então o e-mail gravado é o recebido.
    return Conta.reconstituir({
      id: linha.id,
      email,
      senhaHash: linha.senha_hash,
      criadaEm: linha.criada_em,
    });
  }

  async existeEmail(email: Email): Promise<boolean> {
    const linha = await this.#db
      .selectFrom('contas')
      .select('id')
      .where('email', '=', email.valor)
      .limit(1)
      .executeTakeFirst();
    return linha !== undefined;
  }
}

/** Sessões no Postgres (tabela `sessoes`), pelo SHA-256 do token. */
export class RepositorioDeSessoesPostgres implements RepositorioDeSessoes {
  readonly #db: Kysely<TabelasDeContas>;

  constructor(db: Kysely<TabelasDeContas>) {
    this.#db = db;
  }

  async salvar(
    tokenHash: string,
    contaId: ContaId,
    expiraEm: Date,
  ): Promise<void> {
    await this.#db
      .insertInto('sessoes')
      .values({ token_hash: tokenHash, conta_id: contaId, expira_em: expiraEm })
      .execute();
  }

  async buscarContaIdPorTokenHash(
    tokenHash: string,
    agora: Date,
  ): Promise<ContaId | null> {
    const linha = await this.#db
      .selectFrom('sessoes')
      .select('conta_id')
      .where('token_hash', '=', tokenHash)
      .where('expira_em', '>', agora)
      .executeTakeFirst();
    return linha?.conta_id ?? null;
  }

  async remover(tokenHash: string): Promise<void> {
    await this.#db
      .deleteFrom('sessoes')
      .where('token_hash', '=', tokenHash)
      .execute();
  }
}
