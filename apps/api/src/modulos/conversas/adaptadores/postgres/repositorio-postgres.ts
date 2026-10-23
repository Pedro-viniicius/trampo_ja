import { type Kysely, type Selectable, sql } from 'kysely';
import { DatabaseError } from 'pg';
import { travarContasEmModoCompartilhado } from '../../../../compartilhado/banco/travas-de-conta.js';
import { ErroNaoEncontrado } from '../../../../compartilhado/dominio/erros.js';
import { Conversa } from '../../dominio/conversa.js';
import type { Mensagem } from '../../dominio/mensagem.js';
import type {
  ConferirVinculo,
  ConversaComUltimaMensagem,
  OpcoesDaListagemDeMensagens,
  RepositorioDeConversas,
  ResultadoDaInsercao,
} from '../../dominio/portas.js';
import type {
  TabelaConversas,
  TabelaMensagens,
  TabelasDeConversas,
} from './tabelas.js';

const VIOLACAO_DE_UNICIDADE = '23505';
const PAR_UNICO = 'conversas_par_unico';
const VIOLACAO_DE_FK = '23503';
// Nome padrão do Postgres para a FK `mensagens.conversa_id` (migração 0005).
const FK_DA_CONVERSA = 'mensagens_conversa_id_fkey';

// Os ids são `uuid` no banco: um texto fora do formato faria o Postgres
// recusar a consulta (SQLSTATE 22P02) e viraria 500; aqui vira "não existe".
const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ehUuid(valor: string): boolean {
  return FORMATO_UUID.test(valor);
}

function paraConversa(linha: Selectable<TabelaConversas>): Conversa {
  return Conversa.reconstituir({
    id: linha.id,
    usuarioAId: linha.usuario_a_id,
    usuarioBId: linha.usuario_b_id,
    criadaEm: linha.criada_em,
  });
}

function paraMensagem(linha: Selectable<TabelaMensagens>): Mensagem {
  return {
    id: linha.id,
    conversaId: linha.conversa_id,
    autorId: linha.autor_id,
    texto: linha.texto,
    enviadaEm: linha.enviada_em,
  };
}

/**
 * Adaptador Postgres da porta `RepositorioDeConversas` (tabelas da migração
 * `0005_conversas.ts`). Os valores vão sempre como parâmetro.
 */
export class RepositorioDeConversasPostgres implements RepositorioDeConversas {
  readonly #db: Kysely<TabelasDeConversas>;

  constructor(db: Kysely<TabelasDeConversas>) {
    this.#db = db;
  }

  /**
   * Insere a conversa numa transação que, antes de tudo, pega a trava
   * compartilhada das duas contas (`travas-de-conta.ts`) e só então chama
   * `conferirVinculo` com a própria transação. A exclusão de conta pega a
   * trava exclusiva: se ela terminou antes, a conferência já vê o vínculo
   * apagado (`sem_vinculo`, nada gravado); se ela chega depois, espera este
   * commit e apaga a conversa nova junto com o resto (Q1).
   *
   * Se outra transação já gravou o mesmo par, o `unique` recusa com 23505 e o
   * resultado é `par_ja_existe`; o erro do driver, que traz os ids no
   * `detail`, não segue adiante.
   */
  async inserirConversa(
    conversa: Conversa,
    conferirVinculo: ConferirVinculo,
  ): Promise<ResultadoDaInsercao> {
    const dados = conversa.dados();
    try {
      return await this.#db.transaction().execute(async (trx) => {
        await travarContasEmModoCompartilhado(trx, [
          dados.usuarioAId,
          dados.usuarioBId,
        ]);
        if (!(await conferirVinculo(trx))) {
          return 'sem_vinculo';
        }
        await trx
          .insertInto('conversas')
          .values({
            id: dados.id,
            usuario_a_id: dados.usuarioAId,
            usuario_b_id: dados.usuarioBId,
            criada_em: dados.criadaEm,
          })
          .execute();
        return 'inserida';
      });
    } catch (erro) {
      if (
        erro instanceof DatabaseError &&
        erro.code === VIOLACAO_DE_UNICIDADE &&
        erro.constraint === PAR_UNICO
      ) {
        return 'par_ja_existe';
      }
      throw erro;
    }
  }

  async buscarConversaPorId(id: string): Promise<Conversa | null> {
    if (!ehUuid(id)) {
      return null;
    }
    const linha = await this.#db
      .selectFrom('conversas')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return linha ? paraConversa(linha) : null;
  }

  async buscarConversaDoPar(
    usuario1: string,
    usuario2: string,
  ): Promise<Conversa | null> {
    if (!ehUuid(usuario1) || !ehUuid(usuario2)) {
      return null;
    }
    // O banco guarda o uuid em forma canônica (minúsculas): a ordem do texto
    // minúsculo é a mesma do `check (usuario_a_id < usuario_b_id)`.
    const [a, b] = [usuario1.toLowerCase(), usuario2.toLowerCase()];
    if (a === b) {
      return null;
    }
    const [usuarioA, usuarioB] = Conversa.ordenarPar(a, b);
    const linha = await this.#db
      .selectFrom('conversas')
      .selectAll()
      .where('usuario_a_id', '=', usuarioA)
      .where('usuario_b_id', '=', usuarioB)
      .executeTakeFirst();
    return linha ? paraConversa(linha) : null;
  }

  /**
   * Conversas do usuário com a última mensagem de cada uma (`left join
   * lateral` pelo índice `(conversa_id, enviada_em, ordem)`), ordenadas pela
   * última atividade desc e, no empate, pelo id desc.
   */
  async listarConversasDoUsuario(
    usuarioId: string,
  ): Promise<readonly ConversaComUltimaMensagem[]> {
    if (!ehUuid(usuarioId)) {
      return [];
    }
    const linhas = await this.#db
      .selectFrom('conversas')
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom('mensagens')
            .select(['mensagens.texto', 'mensagens.enviada_em'])
            .whereRef('mensagens.conversa_id', '=', 'conversas.id')
            .orderBy('mensagens.enviada_em', 'desc')
            .orderBy('mensagens.ordem', 'desc')
            .limit(1)
            .as('ultima'),
        (join) => join.onTrue(),
      )
      .selectAll('conversas')
      .select([
        'ultima.texto as ultima_texto',
        'ultima.enviada_em as ultima_enviada_em',
      ])
      .where((eb) =>
        eb.or([
          eb('conversas.usuario_a_id', '=', usuarioId),
          eb('conversas.usuario_b_id', '=', usuarioId),
        ]),
      )
      .orderBy(
        sql`coalesce(${sql.ref('ultima.enviada_em')}, ${sql.ref('conversas.criada_em')})`,
        'desc',
      )
      .orderBy('conversas.id', 'desc')
      .execute();
    return linhas.map((linha) => ({
      conversa: paraConversa(linha),
      ultimaMensagem:
        linha.ultima_texto !== null && linha.ultima_enviada_em !== null
          ? { texto: linha.ultima_texto, enviadaEm: linha.ultima_enviada_em }
          : null,
    }));
  }

  /**
   * Grava a mensagem. Se a conversa sumiu depois da checagem de participação
   * (a exclusão de conta de um dos dois a apaga inteira, D25), a FK recusa
   * com 23503 e o resultado é `ErroNaoEncontrado` (404), o mesmo de conversa
   * inexistente. O erro do driver, que traz os valores no `detail`, não segue.
   */
  async salvarMensagem(mensagem: Mensagem): Promise<void> {
    try {
      await this.#db
        .insertInto('mensagens')
        .values({
          id: mensagem.id,
          conversa_id: mensagem.conversaId,
          autor_id: mensagem.autorId,
          texto: mensagem.texto,
          enviada_em: mensagem.enviadaEm,
        })
        .execute();
    } catch (erro) {
      if (
        erro instanceof DatabaseError &&
        erro.code === VIOLACAO_DE_FK &&
        erro.constraint === FK_DA_CONVERSA
      ) {
        // Erro novo, sem `cause`: nada do erro original sobe.
        throw new ErroNaoEncontrado();
      }
      throw erro;
    }
  }

  async buscarMensagemDaConversa(
    conversaId: string,
    mensagemId: string,
  ): Promise<Mensagem | null> {
    if (!ehUuid(conversaId) || !ehUuid(mensagemId)) {
      return null;
    }
    const linha = await this.#db
      .selectFrom('mensagens')
      .selectAll()
      .where('id', '=', mensagemId)
      .where('conversa_id', '=', conversaId)
      .executeTakeFirst();
    return linha ? paraMensagem(linha) : null;
  }

  /**
   * Ordem de envio: `enviada_em` e, no empate, `ordem` (a ordem de gravação).
   * O cursor é a mensagem `depoisDe.id` desta conversa: a posição dela
   * (`enviada_em`, `ordem`) é lida no próprio banco, por subconsulta.
   */
  async listarMensagens(
    conversaId: string,
    opcoes: OpcoesDaListagemDeMensagens,
  ): Promise<readonly Mensagem[]> {
    const { depoisDe, limite } = opcoes;
    if (!ehUuid(conversaId) || (depoisDe && !ehUuid(depoisDe.id))) {
      return [];
    }
    let consulta = this.#db
      .selectFrom('mensagens')
      .selectAll()
      .where('conversa_id', '=', conversaId);
    if (depoisDe !== undefined) {
      consulta = consulta.where(
        sql<boolean>`(enviada_em, ordem) > (
          select cursor.enviada_em, cursor.ordem
          from mensagens as cursor
          where cursor.id = ${depoisDe.id}
            and cursor.conversa_id = ${conversaId}
        )`,
      );
    }
    const linhas = await consulta
      .orderBy('enviada_em', 'asc')
      .orderBy('ordem', 'asc')
      .limit(limite)
      .execute();
    return linhas.map(paraMensagem);
  }
}

/** Mensagem escrita pela conta, como sai na exportação (D26). */
export interface MensagemExportada {
  readonly id: string;
  readonly texto: string;
  /** ISO 8601. */
  readonly enviadaEm: string;
}

/**
 * Conversa como sai na exportação da conta (D26, ADR-005). Mesmo formato de
 * `ConversaExportada` do módulo `contas`, declarado aqui para não acoplar os
 * módulos. Do outro participante, só o id (que a conta já vê em
 * `GET /conversas`); as mensagens dele ficam de fora.
 */
export interface ConversaExportada {
  readonly id: string;
  readonly outroUsuarioId: string;
  /** ISO 8601. */
  readonly criadaEm: string;
  /** Só as escritas pela conta, em ordem de envio. */
  readonly minhasMensagens: readonly MensagemExportada[];
}

/** Parte de `conversas` na exportação: as conversas da conta, da mais antiga à mais nova. */
export interface ParteDeConversasNaExportacao {
  readonly conversas: readonly ConversaExportada[];
}

/**
 * Parte de `conversas` na exclusão da conta (D25, ADR-005), dentro da
 * transação aberta pela composição (`trx`); não abre transação própria.
 * Apaga as conversas de que a conta participa, inteiras: as mensagens dos
 * dois lados e depois a conversa (`mensagens.conversa_id` não tem cascade).
 *
 * Trava, antes de apagar: `for update` nas conversas da conta, em ordem de
 * id. Uma mensagem concorrente do outro participante espera a trava (a FK
 * precisa da linha da conversa), cai no 23503 depois do commit e vira 404
 * em `salvarMensagem`. A ordem por id evita deadlock entre as exclusões
 * simultâneas dos dois participantes.
 *
 * Lança, sem consultar, com `contaId` fora do formato uuid ou com uma
 * conexão fora de transação. Sem conversas, resolve sem erro.
 */
export async function excluirDadosDaConta(
  trx: Kysely<TabelasDeConversas>,
  contaId: string,
): Promise<void> {
  if (!ehUuid(contaId)) {
    throw new TypeError('conversas.excluirDadosDaConta: contaId não é um uuid');
  }
  if (!trx.isTransaction) {
    throw new TypeError('conversas.excluirDadosDaConta: exige uma transação');
  }
  const conversasDaConta = () =>
    trx
      .selectFrom('conversas')
      .select('conversas.id')
      .where((eb) =>
        eb.or([
          eb('conversas.usuario_a_id', '=', contaId),
          eb('conversas.usuario_b_id', '=', contaId),
        ]),
      );

  await conversasDaConta().orderBy('conversas.id').forUpdate().execute();
  await trx
    .deleteFrom('mensagens')
    .where('conversa_id', 'in', conversasDaConta())
    .execute();
  await trx
    .deleteFrom('conversas')
    .where((eb) =>
      eb.or([
        eb('usuario_a_id', '=', contaId),
        eb('usuario_b_id', '=', contaId),
      ]),
    )
    .execute();
}

/**
 * Parte de `conversas` na exportação da conta (D26), lida num só instante
 * (`repeatable read`): cada conversa com o id do outro participante e só as
 * mensagens escritas pela conta. Id fora do formato: lista vazia.
 */
export async function exportarDadosDaConta(
  db: Kysely<TabelasDeConversas>,
  contaId: string,
): Promise<ParteDeConversasNaExportacao> {
  if (!ehUuid(contaId)) {
    return { conversas: [] };
  }
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .setAccessMode('read only')
    .execute(async (trx) => {
      const conversas = await trx
        .selectFrom('conversas')
        .selectAll()
        .where((eb) =>
          eb.or([
            eb('usuario_a_id', '=', contaId),
            eb('usuario_b_id', '=', contaId),
          ]),
        )
        .orderBy('criada_em', 'asc')
        .orderBy('id', 'asc')
        .execute();
      const mensagens = await trx
        .selectFrom('mensagens')
        .select(['id', 'conversa_id', 'texto', 'enviada_em'])
        .where('autor_id', '=', contaId)
        .where(
          'conversa_id',
          'in',
          trx
            .selectFrom('conversas')
            .select('conversas.id')
            .where((eb) =>
              eb.or([
                eb('conversas.usuario_a_id', '=', contaId),
                eb('conversas.usuario_b_id', '=', contaId),
              ]),
            ),
        )
        .orderBy('enviada_em', 'asc')
        .orderBy('ordem', 'asc')
        .execute();

      const porConversa = new Map<string, MensagemExportada[]>();
      for (const linha of mensagens) {
        const lista = porConversa.get(linha.conversa_id) ?? [];
        lista.push({
          id: linha.id,
          texto: linha.texto,
          enviadaEm: linha.enviada_em.toISOString(),
        });
        porConversa.set(linha.conversa_id, lista);
      }
      return {
        conversas: conversas.map((linha) => ({
          id: linha.id,
          // O banco guarda o uuid em minúsculas; a conta é um dos dois lados.
          outroUsuarioId:
            linha.usuario_a_id === contaId.toLowerCase()
              ? linha.usuario_b_id
              : linha.usuario_a_id,
          criadaEm: linha.criada_em.toISOString(),
          minhasMensagens: porConversa.get(linha.id) ?? [],
        })),
      };
    });
}
