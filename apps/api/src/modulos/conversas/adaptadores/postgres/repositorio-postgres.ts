import { type Kysely, type Selectable, sql } from 'kysely';
import { DatabaseError } from 'pg';
import { Conversa } from '../../dominio/conversa.js';
import type { Mensagem } from '../../dominio/mensagem.js';
import type {
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
   * Insere a conversa. Se outra transação já gravou o mesmo par, o `unique`
   * recusa com 23505 e o resultado é `par_ja_existe`; o erro do driver, que
   * traz os ids no `detail`, não segue adiante.
   */
  async inserirConversa(conversa: Conversa): Promise<ResultadoDaInsercao> {
    const dados = conversa.dados();
    try {
      await this.#db
        .insertInto('conversas')
        .values({
          id: dados.id,
          usuario_a_id: dados.usuarioAId,
          usuario_b_id: dados.usuarioBId,
          criada_em: dados.criadaEm,
        })
        .execute();
      return 'inserida';
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

  async salvarMensagem(mensagem: Mensagem): Promise<void> {
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
