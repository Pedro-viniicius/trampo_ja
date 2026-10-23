import type { Kysely } from 'kysely';
import { Conta } from '../../dominio/conta.js';
import { Email } from '../../dominio/email.js';
import {
  type ContaId,
  ErroDeEmailDuplicado,
  type RepositorioDeContas,
  type RepositorioDeSessoes,
  type SessaoDaConta,
} from '../../dominio/portas.js';
import type { TabelasDeContas } from './tabelas.js';

// SQLSTATE de violação de unicidade e o nome da constraint (migração 0001).
const VIOLACAO_DE_UNICIDADE = '23505';
const CONSTRAINT_DO_EMAIL = 'contas_email_key';

// Formato textual de um `uuid` do Postgres. Um id fora dele faria o banco
// recusar a consulta (SQLSTATE 22P02) e viraria 500; aqui vira "não existe".
const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ehUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_UUID.test(valor);
}

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

  async buscarPorId(id: ContaId): Promise<Conta | null> {
    if (!ehUuid(id)) {
      return null;
    }
    const linha = await this.#db
      .selectFrom('contas')
      .select(['id', 'email', 'senha_hash', 'criada_em'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!linha) {
      return null;
    }
    return Conta.reconstituir({
      id: linha.id,
      // Gravado já normalizado por `Email.criar`: lido sem revalidar (S6).
      email: Email.reconstituir(linha.email),
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

  async listarDaConta(contaId: ContaId): Promise<SessaoDaConta[]> {
    if (!ehUuid(contaId)) {
      return [];
    }
    const linhas = await this.#db
      .selectFrom('sessoes')
      .select(['criada_em', 'expira_em'])
      .where('conta_id', '=', contaId)
      .orderBy('criada_em', 'asc')
      .orderBy('expira_em', 'asc')
      .execute();
    return linhas.map((linha) => ({
      criadaEm: linha.criada_em,
      expiraEm: linha.expira_em,
    }));
  }
}

/**
 * Parte de `contas` na exclusão (D25, ADR-005): apaga as sessões e depois a
 * conta, dentro da transação aberta pela composição (`trx`), que também apaga
 * os dados dos outros módulos. Não abre transação própria.
 *
 * Recusa (lança, sem consultar) um `contaId` que não seja uuid e uma conexão
 * fora de transação, para nunca apagar fora do lote atômico. Sem nada a
 * apagar (ex.: um segundo pedido concorrente, que espera a trava da linha),
 * resolve sem erro.
 */
export async function excluirRegistrosDaConta(
  trx: Kysely<TabelasDeContas>,
  contaId: ContaId,
): Promise<void> {
  if (!ehUuid(contaId)) {
    throw new TypeError('excluirRegistrosDaConta: contaId não é um uuid');
  }
  if (!trx.isTransaction) {
    throw new TypeError('excluirRegistrosDaConta: exige uma transação');
  }
  // O cascade de `sessoes` também apagaria; o `delete` explícito deixa a
  // ordem clara e não depende da FK.
  await trx.deleteFrom('sessoes').where('conta_id', '=', contaId).execute();
  await trx.deleteFrom('contas').where('id', '=', contaId).execute();
}
