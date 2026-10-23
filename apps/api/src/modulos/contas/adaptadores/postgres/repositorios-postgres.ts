import { type Kysely, sql } from 'kysely';
import { Conta } from '../../dominio/conta.js';
import { Email } from '../../dominio/email.js';
import {
  type ContagemDeTentativas,
  type ContaId,
  ErroDeEmailDuplicado,
  type RepositorioDeContas,
  type RepositorioDeContasExcluidas,
  type RepositorioDeSessoes,
  type RepositorioDeTentativasDeEntrada,
  type SessaoDaConta,
  type SessaoInicial,
} from '../../dominio/portas.js';
import type { TabelasDeContas } from './tabelas.js';

// SQLSTATE de violação de unicidade e o nome da constraint (migração 0001).
const VIOLACAO_DE_UNICIDADE = '23505';
const CONSTRAINT_DO_EMAIL = 'contas_email_key';
// SQLSTATE de violação de FK e o nome da FK de `tentativas_de_entrada` para
// `contas` (migração 0008, nome dado pelo Postgres).
const VIOLACAO_DE_FK = '23503';
const FK_DAS_TENTATIVAS = 'tentativas_de_entrada_conta_id_fkey';
// Maior `integer` do Postgres: a contagem satura nele em vez de estourar.
const MAIOR_INTEIRO = 2_147_483_647;

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

/** Erro do driver `pg` para contador de uma conta que já não existe. */
function ehContaInexistenteNaContagem(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) {
    return false;
  }
  const { code, constraint } = erro as { code?: unknown; constraint?: unknown };
  return code === VIOLACAO_DE_FK && constraint === FK_DAS_TENTATIVAS;
}

/** Contas no Postgres (tabela `contas`). */
export class RepositorioDeContasPostgres implements RepositorioDeContas {
  readonly #db: Kysely<TabelasDeContas>;

  constructor(db: Kysely<TabelasDeContas>) {
    this.#db = db;
  }

  /**
   * Grava a conta nova e a sessão inicial numa transação (S7): se a sessão
   * falhar, a conta é desfeita junto. E-mail repetido vira
   * `ErroDeEmailDuplicado`, que não leva o erro do driver: o `detail` dele
   * traz o e-mail (`Key (email)=(...)`).
   */
  async salvar(conta: Conta, sessaoInicial?: SessaoInicial): Promise<void> {
    const gravar = async (db: Kysely<TabelasDeContas>) => {
      await db
        .insertInto('contas')
        .values({
          id: conta.id,
          email: conta.email.valor,
          senha_hash: conta.senhaHash,
          criada_em: conta.criadaEm,
        })
        .execute();
      if (sessaoInicial !== undefined) {
        await db
          .insertInto('sessoes')
          .values({
            token_hash: sessaoInicial.tokenHash,
            conta_id: conta.id,
            expira_em: sessaoInicial.expiraEm,
          })
          .execute();
      }
    };
    try {
      await this.#db.transaction().execute(gravar);
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

  async contarDaConta(contaId: ContaId): Promise<number> {
    if (!ehUuid(contaId)) {
      return 0;
    }
    const linha = await this.#db
      .selectFrom('sessoes')
      .select((eb) => eb.fn.countAll<string>().as('quantas'))
      .where('conta_id', '=', contaId)
      .executeTakeFirstOrThrow();
    // `count` é `bigint`, que o `pg` entrega como texto.
    return Number(linha.quantas);
  }

  /**
   * Um `delete` por lote, sobre a subconsulta limitada (o Postgres não tem
   * `delete … limit`). Em várias réplicas, dois lotes simultâneos podem pegar
   * as mesmas linhas: cada uma é apagada uma vez só, e a contagem de cada um
   * diz o que ele apagou.
   */
  async apagarExpiradas(agora: Date, lote: number): Promise<number> {
    if (!Number.isSafeInteger(lote) || lote < 1) {
      throw new RangeError('apagarExpiradas: lote deve ser inteiro positivo');
    }
    const resultado = await this.#db
      .deleteFrom('sessoes')
      .where('token_hash', 'in', (eb) =>
        eb
          .selectFrom('sessoes')
          .select('token_hash')
          .where('expira_em', '<=', agora)
          .limit(lote),
      )
      .executeTakeFirst();
    return Number(resultado.numDeletedRows);
  }
}

/** Lápides no Postgres (tabela `contas_excluidas`, ADR-007). */
export class RepositorioDeContasExcluidasPostgres
  implements RepositorioDeContasExcluidas
{
  readonly #db: Kysely<TabelasDeContas>;

  constructor(db: Kysely<TabelasDeContas>) {
    this.#db = db;
  }

  async listarAntesDe(limite: Date, lote: number): Promise<ContaId[]> {
    if (!Number.isSafeInteger(lote) || lote < 1) {
      throw new RangeError('listarAntesDe: lote deve ser inteiro positivo');
    }
    const linhas = await this.#db
      .selectFrom('contas_excluidas')
      .select('id')
      .where('excluida_em', '<=', limite)
      .orderBy('excluida_em', 'asc')
      .orderBy('id', 'asc')
      .limit(lote)
      .execute();
    return linhas.map((linha) => linha.id);
  }

  async esquecer(id: ContaId): Promise<void> {
    if (!ehUuid(id)) {
      return;
    }
    await this.#db
      .deleteFrom('contas_excluidas')
      .where('id', '=', id)
      .execute();
  }
}

/**
 * Teto de entrada por conta no Postgres (tabela `tentativas_de_entrada`, D31).
 * Uma linha por conta, sem e-mail nem IP; a exclusão da conta apaga a linha
 * pelo cascade da FK.
 */
export class RepositorioDeTentativasDeEntradaPostgres
  implements RepositorioDeTentativasDeEntrada
{
  readonly #db: Kysely<TabelasDeContas>;

  constructor(db: Kysely<TabelasDeContas>) {
    this.#db = db;
  }

  /**
   * Um só `insert … on conflict (conta_id) do update … returning`: a linha
   * fica travada do conflito até o fim do comando, então pedidos
   * simultâneos somam um depois do outro. As duas expressões do `set` leem
   * a linha antiga: se a janela dela venceu, recomeça em `agora` com 1. A
   * conta excluída no meio (FK) devolve `null`; o erro do driver não sobe,
   * porque o `detail` dele traz o id da conta.
   */
  async registrar(
    contaId: ContaId,
    agora: Date,
    janelaMs: number,
  ): Promise<ContagemDeTentativas | null> {
    if (!ehUuid(contaId)) {
      return null;
    }
    const vencidaAte = new Date(agora.getTime() - janelaMs);
    const venceu = sql<boolean>`tentativas_de_entrada.inicio_da_janela <= ${vencidaAte}`;
    try {
      const linha = await this.#db
        .insertInto('tentativas_de_entrada')
        .values({ conta_id: contaId, inicio_da_janela: agora, tentativas: 1 })
        .onConflict((conflito) =>
          conflito.column('conta_id').doUpdateSet({
            inicio_da_janela: sql<Date>`case when ${venceu}
              then excluded.inicio_da_janela
              else tentativas_de_entrada.inicio_da_janela end`,
            tentativas: sql<number>`case when ${venceu} then 1
              else least(tentativas_de_entrada.tentativas,
                ${sql.lit(MAIOR_INTEIRO - 1)}) + 1 end`,
          }),
        )
        .returning(['tentativas', 'inicio_da_janela'])
        .executeTakeFirstOrThrow();
      return {
        tentativas: linha.tentativas,
        inicioDaJanela: linha.inicio_da_janela,
      };
    } catch (erro) {
      if (ehContaInexistenteNaContagem(erro)) {
        return null;
      }
      throw erro;
    }
  }

  async apagarVencidas(limite: Date): Promise<number> {
    const resultado = await this.#db
      .deleteFrom('tentativas_de_entrada')
      .where('inicio_da_janela', '<=', limite)
      .executeTakeFirst();
    return Number(resultado.numDeletedRows);
  }
}

/**
 * Parte de `contas` na exclusão (D25, ADR-005): apaga as sessões e depois a
 * conta, dentro da transação aberta pela composição (`trx`), que também apaga
 * os dados dos outros módulos, e grava a lápide `contas_excluidas(id,
 * excluida_em = agora)` (ADR-007). Não abre transação própria: se a exclusão
 * desfaz, a lápide some junto.
 *
 * Recusa (lança, sem consultar) um `contaId` que não seja uuid, uma data
 * inválida e uma conexão fora de transação, para nunca apagar fora do lote
 * atômico. Sem nada a apagar (ex.: um segundo pedido concorrente, que espera a
 * trava da linha, ou a limpeza refazendo a exclusão), resolve sem erro e a
 * lápide que já existe guarda a data original (`on conflict do nothing`).
 */
export async function excluirRegistrosDaConta(
  trx: Kysely<TabelasDeContas>,
  contaId: ContaId,
  agora: Date,
): Promise<void> {
  if (!ehUuid(contaId)) {
    throw new TypeError('excluirRegistrosDaConta: contaId não é um uuid');
  }
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) {
    throw new TypeError('excluirRegistrosDaConta: data inválida');
  }
  if (!trx.isTransaction) {
    throw new TypeError('excluirRegistrosDaConta: exige uma transação');
  }
  // O cascade de `sessoes` também apagaria; o `delete` explícito deixa a
  // ordem clara e não depende da FK. O contador do teto de entrada
  // (`tentativas_de_entrada`) sai pelo cascade, junto com a conta.
  await trx.deleteFrom('sessoes').where('conta_id', '=', contaId).execute();
  await trx.deleteFrom('contas').where('id', '=', contaId).execute();
  await trx
    .insertInto('contas_excluidas')
    .values({ id: contaId, excluida_em: agora })
    .onConflict((conflito) => conflito.column('id').doNothing())
    .execute();
}
