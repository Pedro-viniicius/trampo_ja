import { createHash } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { DatabaseError } from 'pg';
import {
  travarContaComExclusividade,
  travarContasEmModoCompartilhado,
} from '../../../../compartilhado/banco/travas-de-conta.js';
import {
  type Avaliacao,
  ehUuid,
  type PapelDoAvaliado,
} from '../../dominio/avaliacao.js';
import type { Favorito } from '../../dominio/favorito.js';
import type {
  AvaliacaoFeita,
  AvaliacaoLida,
  ConferirVinculo,
  ContagemDeAvaliacoes,
  ContagemDeDestaque,
  OpcoesDeInsercaoDeFavorito,
  PaginaDeAvaliacoes,
  RepositorioDeAvaliacoes,
  ResultadoDaAvaliacao,
  ResultadoDoFavorito,
} from '../../dominio/portas.js';
import type { TabelasDeAvaliacoes } from './tabelas.js';

type Conexao = Kysely<TabelasDeAvaliacoes>;

const VIOLACAO_DE_UNICIDADE = '23505';
const AVALIACAO_UNICA = 'avaliacoes_trampo_avaliador_unico';

/**
 * Folga por linha em `medirExportacao`: cobre os ids, as datas, a nota, os
 * nomes das chaves e a pontuação do JSON, que não entram na soma dos textos
 * (contrato da L3, CA48, como em `conversas` e `trampos`).
 */
const BYTES_POR_LINHA_NA_MEDIDA = 256;

// Prefixo do texto que vira a chave da trava do teto de favoritos. É outro
// espaço de chaves, diferente do de `travas-de-conta.ts` ('trampo-ja:conta:'):
// esta trava é exclusiva só entre as gravações de favorito do mesmo dono e
// não conversa com a trava da conta (a da exclusão, D25).
const ESPACO_DA_TRAVA_DO_TETO = 'trampo-ja:favoritos-do-dono:';

/**
 * Chave `bigint` (como texto) da trava do teto de favoritos do dono: os 64
 * primeiros bits do SHA-256, com sinal, como `chaveDaTravaDaConta`.
 */
function chaveDaTravaDoTeto(donoId: string): string {
  return createHash('sha256')
    .update(`${ESPACO_DA_TRAVA_DO_TETO}${donoId.toLowerCase()}`, 'utf8')
    .digest()
    .readBigInt64BE(0)
    .toString();
}

/**
 * Adaptador Postgres da porta `RepositorioDeAvaliacoes` (tabelas da migração
 * `0009_avaliacoes.ts`). Os valores vão sempre como parâmetro. O
 * `comentario` (dado pessoal) nunca entra num erro criado aqui; uma recusa
 * inesperada do banco (ex.: uma check) sobe com o erro do driver, que pode
 * citá-lo no `detail` e que o serializer do logger descarta (só classe e
 * SQLSTATE).
 */
export class RepositorioDeAvaliacoesPostgres
  implements RepositorioDeAvaliacoes
{
  readonly #db: Conexao;

  constructor(db: Conexao) {
    this.#db = db;
  }

  /**
   * Grava a avaliação numa transação que, antes de tudo, pega a trava
   * compartilhada das duas contas (`travas-de-conta.ts`) e só então chama
   * `conferirVinculo` com a própria transação. A exclusão de conta pega a
   * trava exclusiva: se ela terminou antes, a conferência já vê o vínculo
   * apagado (`sem_vinculo`, nada gravado); se ela chega depois, espera este
   * commit e apaga a avaliação nova junto com o resto (D25).
   *
   * A unicidade é a constraint `avaliacoes_trampo_avaliador_unico`, nunca um
   * "ler e depois gravar": o `on conflict do nothing` faz a gravação
   * concorrente esperar o commit da primeira e não gravar nada (`ja_feita`).
   * O 23505 da mesma constraint também vira `ja_feita`, por garantia; o erro
   * do driver, que traz os ids no `detail`, não segue adiante.
   */
  async inserirAvaliacao(
    avaliacao: Avaliacao,
    conferirVinculo: ConferirVinculo,
  ): Promise<ResultadoDaAvaliacao> {
    try {
      return await this.#db.transaction().execute(async (trx) => {
        await travarContasEmModoCompartilhado(trx, [
          avaliacao.avaliadorId,
          avaliacao.avaliadoId,
        ]);
        if (!(await conferirVinculo(trx))) {
          return 'sem_vinculo';
        }
        const resultado = await trx
          .insertInto('avaliacoes')
          .values({
            id: avaliacao.id,
            trampo_id: avaliacao.trampoId,
            avaliador_id: avaliacao.avaliadorId,
            avaliado_id: avaliacao.avaliadoId,
            papel_do_avaliado: avaliacao.papelDoAvaliado,
            nota: avaliacao.nota,
            destaques: [...avaliacao.destaques],
            comentario: avaliacao.comentario,
            criada_em: avaliacao.criadaEm,
          })
          .onConflict((conflito) =>
            conflito.constraint(AVALIACAO_UNICA).doNothing(),
          )
          .executeTakeFirst();
        return (resultado.numInsertedOrUpdatedRows ?? 0n) > 0n
          ? 'inserida'
          : 'ja_feita';
      });
    } catch (erro) {
      if (
        erro instanceof DatabaseError &&
        erro.code === VIOLACAO_DE_UNICIDADE &&
        erro.constraint === AVALIACAO_UNICA
      ) {
        return 'ja_feita';
      }
      throw erro;
    }
  }

  /**
   * Página pelo índice `avaliacoes_avaliado_idx`: `(criada_em, id)`
   * estritamente menor que o cursor, em ordem decrescente. Id fora do
   * formato: lista vazia, sem consultar.
   */
  async listarRecebidas(
    avaliadoId: string,
    papel: PapelDoAvaliado,
    pagina: PaginaDeAvaliacoes,
  ): Promise<readonly AvaliacaoLida[]> {
    const { antesDe, limite } = pagina;
    if (!ehUuid(avaliadoId) || (antesDe && !ehUuid(antesDe.id))) {
      return [];
    }
    let consulta = this.#db
      .selectFrom('avaliacoes')
      .select([
        'id',
        'nota',
        'destaques',
        'comentario',
        'avaliador_id',
        'criada_em',
      ])
      .where('avaliado_id', '=', avaliadoId)
      .where('papel_do_avaliado', '=', papel);
    if (antesDe !== undefined) {
      consulta = consulta.where(
        sql<boolean>`(criada_em, id) < (
          ${antesDe.criadaEm}::timestamptz, ${antesDe.id}::uuid
        )`,
      );
    }
    const linhas = await consulta
      .orderBy('criada_em', 'desc')
      .orderBy('id', 'desc')
      .limit(limite)
      .execute();
    return linhas.map((linha) => ({
      id: linha.id,
      nota: linha.nota,
      destaques: Object.freeze([...linha.destaques]),
      comentario: linha.comentario,
      avaliadorId: linha.avaliador_id,
      criadaEm: linha.criada_em,
    }));
  }

  async listarFeitasNosTrampos(
    avaliadorId: string,
    trampoIds: readonly string[],
  ): Promise<readonly AvaliacaoFeita[]> {
    const trampos = trampoIds.filter(ehUuid);
    if (!ehUuid(avaliadorId) || trampos.length === 0) {
      return [];
    }
    const linhas = await this.#db
      .selectFrom('avaliacoes')
      .select(['trampo_id', 'nota', 'criada_em'])
      .where('avaliador_id', '=', avaliadorId)
      .where('trampo_id', 'in', trampos)
      .execute();
    return linhas.map((linha) => ({
      trampoId: linha.trampo_id,
      nota: linha.nota,
      criadaEm: linha.criada_em,
    }));
  }

  /**
   * Uma consulta só (um só instante): total e soma das notas por conta e
   * papel e, para cada grupo, a contagem de cada código de destaque
   * (`unnest`). A média e os 3 mais frequentes ficam no domínio.
   */
  async contarRecebidas(
    contaIds: readonly string[],
  ): Promise<readonly ContagemDeAvaliacoes[]> {
    const contas = contaIds.filter(ehUuid);
    if (contas.length === 0) {
      return [];
    }
    const { rows } = await sql<{
      avaliado_id: string;
      papel_do_avaliado: PapelDoAvaliado;
      total: number;
      soma_das_notas: number;
      destaques: ContagemDeDestaque[];
    }>`
      select grupo.avaliado_id, grupo.papel_do_avaliado, grupo.total,
        grupo.soma_das_notas,
        coalesce((
          select json_agg(json_build_object(
            'codigo', contagem.codigo, 'quantidade', contagem.quantidade))
          from (
            select destaque.codigo, count(*)::int as quantidade
            from avaliacoes as a2
            cross join lateral unnest(a2.destaques) as destaque(codigo)
            where a2.avaliado_id = grupo.avaliado_id
              and a2.papel_do_avaliado = grupo.papel_do_avaliado
            group by destaque.codigo
          ) as contagem
        ), '[]'::json) as destaques
      from (
        select avaliado_id, papel_do_avaliado, count(*)::int as total,
          sum(nota)::int as soma_das_notas
        from avaliacoes
        where avaliado_id in (${sql.join(contas)})
        group by avaliado_id, papel_do_avaliado
      ) as grupo
    `.execute(this.#db);
    return rows.map((linha) => ({
      contaId: linha.avaliado_id,
      papel: linha.papel_do_avaliado,
      total: linha.total,
      somaDasNotas: linha.soma_das_notas,
      destaques: linha.destaques.map(({ codigo, quantidade }) => ({
        codigo,
        quantidade,
      })),
    }));
  }

  /**
   * Grava o favorito numa transação, nesta ordem:
   * 1. trava compartilhada das duas contas, como em `inserirAvaliacao` (D25);
   * 2. trava exclusiva do teto do dono (`chaveDaTravaDoTeto`): as gravações
   *    de favorito do mesmo dono passam uma de cada vez, então a contagem e o
   *    insert são atômicos e uma rajada não passa do `limite`;
   * 3. par já gravado → `ja_existe` (nada muda, nem o `criadoEm`), sem
   *    conferir o vínculo (D61); a leitura é só dos favoritos do dono;
   * 4. `conferirVinculo` com a transação → `sem_vinculo` se negativo;
   * 5. `limite` favoritos ou mais → `limite_atingido`;
   * 6. insert com `on conflict do nothing` na chave primária.
   */
  async inserirFavorito(
    favorito: Favorito,
    opcoes: OpcoesDeInsercaoDeFavorito,
  ): Promise<ResultadoDoFavorito> {
    return this.#db.transaction().execute(async (trx) => {
      await travarContasEmModoCompartilhado(trx, [
        favorito.donoId,
        favorito.favoritoId,
      ]);
      await sql`select pg_advisory_xact_lock(${chaveDaTravaDoTeto(favorito.donoId)}::bigint)`.execute(
        trx,
      );
      const { existe, total } = await trx
        .selectFrom('favoritos')
        .select([
          sql<number>`(count(*) filter (
            where favorito_id = ${favorito.favoritoId}
          ))::int`.as('existe'),
          sql<number>`count(*)::int`.as('total'),
        ])
        .where('dono_id', '=', favorito.donoId)
        .executeTakeFirstOrThrow();
      if (existe > 0) {
        return 'ja_existe';
      }
      if (!(await opcoes.conferirVinculo(trx))) {
        return 'sem_vinculo';
      }
      if (total >= opcoes.limite) {
        return 'limite_atingido';
      }
      const resultado = await trx
        .insertInto('favoritos')
        .values({
          dono_id: favorito.donoId,
          favorito_id: favorito.favoritoId,
          criado_em: favorito.criadoEm,
        })
        .onConflict((conflito) =>
          conflito.columns(['dono_id', 'favorito_id']).doNothing(),
        )
        .executeTakeFirst();
      return (resultado.numInsertedOrUpdatedRows ?? 0n) > 0n
        ? 'inserido'
        : 'ja_existe';
    });
  }

  async removerFavorito(donoId: string, favoritoId: string): Promise<void> {
    if (!ehUuid(donoId) || !ehUuid(favoritoId)) {
      return;
    }
    await this.#db
      .deleteFrom('favoritos')
      .where('dono_id', '=', donoId)
      .where('favorito_id', '=', favoritoId)
      .execute();
  }

  async listarFavoritos(donoId: string): Promise<readonly Favorito[]> {
    if (!ehUuid(donoId)) {
      return [];
    }
    const linhas = await this.#db
      .selectFrom('favoritos')
      .select(['dono_id', 'favorito_id', 'criado_em'])
      .where('dono_id', '=', donoId)
      .orderBy('criado_em', 'desc')
      .orderBy('favorito_id', 'desc')
      .execute();
    return linhas.map((linha) => ({
      donoId: linha.dono_id,
      favoritoId: linha.favorito_id,
      criadoEm: linha.criado_em,
    }));
  }
}

/**
 * Avaliação feita pela conta, como sai na exportação (CA93): com o
 * comentário, que é dela. Do avaliado, nada além do trampo.
 */
export interface AvaliacaoFeitaExportada {
  readonly trampoId: string;
  readonly nota: number;
  readonly destaques: readonly string[];
  readonly comentario: string | null;
  /** ISO 8601. */
  readonly criadaEm: string;
}

/**
 * Avaliação recebida pela conta, como sai na exportação (CA93): só a nota,
 * os destaques e a data. O comentário é texto de terceiro e o avaliador fica
 * de fora.
 */
export interface AvaliacaoRecebidaExportada {
  readonly nota: number;
  readonly destaques: readonly string[];
  /** ISO 8601. */
  readonly criadaEm: string;
}

/** Conta na equipe favorita da conta, como sai na exportação (CA93). */
export interface FavoritoExportado {
  readonly contaId: string;
  /** ISO 8601. */
  readonly criadoEm: string;
}

/**
 * Parte de `avaliacoes` na exportação (CA93, ADR-005), cada lista da mais
 * antiga à mais nova.
 */
export interface ParteDeAvaliacoesNaExportacao {
  readonly avaliacoesFeitas: readonly AvaliacaoFeitaExportada[];
  readonly avaliacoesRecebidas: readonly AvaliacaoRecebidaExportada[];
  readonly favoritos: readonly FavoritoExportado[];
}

/**
 * Parte de `avaliacoes` na exclusão da conta (D25, CA93, ADR-005), dentro da
 * transação aberta pela composição (`trx`); não abre transação própria.
 * Apaga as avaliações feitas e recebidas pela conta e os favoritos dos dois
 * lados (os dela e os em que ela aparece).
 *
 * Pega a trava exclusiva da conta (`travas-de-conta.ts`) antes de apagar. A
 * composição já a pega no início da transação; pedir de novo na mesma
 * transação não espera nada, e assim esta parte não depende da ordem da
 * composição. Uma avaliação ou um favorito concorrente segura a trava
 * compartilhada da conta: ou já gravou (e é apagado aqui), ou espera o commit
 * e não acha mais o vínculo.
 *
 * Lança, sem consultar, com `contaId` fora do formato uuid ou com uma
 * conexão fora de transação. Sem nada a apagar, resolve sem erro.
 */
export async function excluirDadosDaConta(
  trx: Conexao,
  contaId: string,
): Promise<void> {
  if (!ehUuid(contaId)) {
    throw new TypeError(
      'avaliacoes.excluirDadosDaConta: contaId não é um uuid',
    );
  }
  if (!trx.isTransaction) {
    throw new TypeError('avaliacoes.excluirDadosDaConta: exige uma transação');
  }
  await travarContaComExclusividade(trx, contaId);
  await trx
    .deleteFrom('avaliacoes')
    .where(({ eb, or }) =>
      or([eb('avaliador_id', '=', contaId), eb('avaliado_id', '=', contaId)]),
    )
    .execute();
  await trx
    .deleteFrom('favoritos')
    .where(({ eb, or }) =>
      or([eb('dono_id', '=', contaId), eb('favorito_id', '=', contaId)]),
    )
    .execute();
}

/**
 * Parte de `avaliacoes` na exportação da conta (D26, CA93), lida num só
 * instante (`repeatable read`). Id fora do formato: listas vazias.
 */
export async function exportarDadosDaConta(
  db: Conexao,
  contaId: string,
): Promise<ParteDeAvaliacoesNaExportacao> {
  if (!ehUuid(contaId)) {
    return { avaliacoesFeitas: [], avaliacoesRecebidas: [], favoritos: [] };
  }
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .setAccessMode('read only')
    .execute(async (trx) => {
      const feitas = await trx
        .selectFrom('avaliacoes')
        .select(['trampo_id', 'nota', 'destaques', 'comentario', 'criada_em'])
        .where('avaliador_id', '=', contaId)
        .orderBy('criada_em', 'asc')
        .orderBy('id', 'asc')
        .execute();
      // Só estas três colunas: o comentário e o avaliador nem saem do banco.
      const recebidas = await trx
        .selectFrom('avaliacoes')
        .select(['nota', 'destaques', 'criada_em'])
        .where('avaliado_id', '=', contaId)
        .orderBy('criada_em', 'asc')
        .orderBy('id', 'asc')
        .execute();
      const favoritos = await trx
        .selectFrom('favoritos')
        .select(['favorito_id', 'criado_em'])
        .where('dono_id', '=', contaId)
        .orderBy('criado_em', 'asc')
        .orderBy('favorito_id', 'asc')
        .execute();
      return {
        avaliacoesFeitas: feitas.map((linha) => ({
          trampoId: linha.trampo_id,
          nota: linha.nota,
          destaques: [...linha.destaques],
          comentario: linha.comentario,
          criadaEm: linha.criada_em.toISOString(),
        })),
        avaliacoesRecebidas: recebidas.map((linha) => ({
          nota: linha.nota,
          destaques: [...linha.destaques],
          criadaEm: linha.criada_em.toISOString(),
        })),
        favoritos: favoritos.map((linha) => ({
          contaId: linha.favorito_id,
          criadoEm: linha.criado_em.toISOString(),
        })),
      };
    });
}

/**
 * Tamanho estimado, em bytes, da parte de `avaliacoes` na exportação (CA48,
 * CA93), calculado no banco sem carregar os textos, numa consulta só (um só
 * instante), com os mesmos filtros de `exportarDadosDaConta`:
 * - avaliações feitas: o comentário já como texto JSON (`to_json`, com as
 *   aspas e os escapes que a exportação terá) e os códigos de destaque;
 * - avaliações recebidas: os códigos de destaque (o comentário, de terceiro,
 *   não sai na exportação e não entra);
 * - favoritos: só a folga;
 * mais `BYTES_POR_LINHA_NA_MEDIDA` por linha. Id fora do formato: 0, sem
 * consultar.
 */
export async function medirExportacao(
  db: Conexao,
  contaId: string,
): Promise<number> {
  if (!ehUuid(contaId)) {
    return 0;
  }
  const destaquesEmBytes = sql`coalesce(octet_length(array_to_string(destaques, '')), 0)`;
  const { feitas, recebidas, favoritos } = await db
    .selectNoFrom((eb) => [
      // `sum` e `count` de inteiros são `bigint`, que o `pg` devolve como texto.
      eb
        .selectFrom('avaliacoes')
        .select(
          sql<string>`coalesce(sum(
            coalesce(octet_length(to_json(comentario)::text), 0)
            + ${destaquesEmBytes}
            + ${sql.lit(BYTES_POR_LINHA_NA_MEDIDA)}
          ), 0)`.as('bytes'),
        )
        .where('avaliador_id', '=', contaId)
        .as('feitas'),
      eb
        .selectFrom('avaliacoes')
        .select(
          sql<string>`coalesce(sum(
            ${destaquesEmBytes} + ${sql.lit(BYTES_POR_LINHA_NA_MEDIDA)}
          ), 0)`.as('bytes'),
        )
        .where('avaliado_id', '=', contaId)
        .as('recebidas'),
      eb
        .selectFrom('favoritos')
        .select(
          sql<string>`count(*) * ${sql.lit(BYTES_POR_LINHA_NA_MEDIDA)}`.as(
            'bytes',
          ),
        )
        .where('dono_id', '=', contaId)
        .as('favoritos'),
    ])
    .executeTakeFirstOrThrow();
  return Number(feitas ?? 0) + Number(recebidas ?? 0) + Number(favoritos ?? 0);
}
