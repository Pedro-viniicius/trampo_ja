/**
 * Módulo `avaliacoes`, Visual V2b (ADR-011, CA95): avaliações mútuas depois
 * do trampo encerrado e a equipe favorita do contratante.
 *
 * - `avaliacoes`: uma por trampo e avaliador. A unicidade vem da constraint
 *   `avaliacoes_trampo_avaliador_unico`, e não de um "ler e depois gravar":
 *   numa rajada, a segunda gravação recebe 23505 (CA87).
 *   - `papel_do_avaliado` fica gravado, porque a mesma conta pode ser avaliada
 *     como freela e como contratante.
 *   - `nota` é inteira de 1 a 5. `destaques` é uma lista de uma dimensão com no
 *     máximo 5 códigos; a lista fechada por papel e a falta de repetição são
 *     regra do domínio (CA88). `comentario` é opcional, com 1 a 500 pontos de
 *     código (texto já aparado), e é dado pessoal (LGPD).
 *   - Sem coluna de média: ela é calculada na leitura (ADR-011).
 * - `favoritos`: um por par (`dono_id`, `favorito_id`), e ninguém favorita a
 *   si mesmo (CA92). O teto de 200 por dono é regra da aplicação.
 * - Contas e trampos são referenciados só pelo id (sem FK entre módulos). A
 *   exclusão de conta apaga os dois lados de cada tabela pela porta
 *   `DadosDaConta` (ADR-005, CA93); daí os índices em `avaliador_id` e em
 *   `favorito_id`, os lados que não abrem a chave principal.
 */
import { type Kysely, sql } from 'kysely';
import { removerTabelaSeVazia } from '../src/compartilhado/banco/migrador.js';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('avaliacoes')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('trampo_id', 'uuid', (c) => c.notNull())
    .addColumn('avaliador_id', 'uuid', (c) => c.notNull())
    .addColumn('avaliado_id', 'uuid', (c) => c.notNull())
    .addColumn('papel_do_avaliado', 'text', (c) => c.notNull())
    .addColumn('nota', 'smallint', (c) => c.notNull())
    .addColumn('destaques', sql`text[]`, (c) =>
      c.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn('comentario', 'text')
    .addColumn('criada_em', 'timestamptz', (c) => c.notNull())
    .addCheckConstraint(
      'avaliacoes_papel_do_avaliado_valido',
      sql`papel_do_avaliado in ('freela', 'contratante')`,
    )
    .addCheckConstraint('avaliacoes_nota_valida', sql`nota between 1 and 5`)
    // `array_ndims` do vetor vazio é null; o `cardinality` dele é 0.
    .addCheckConstraint(
      'avaliacoes_destaques_validos',
      sql`(array_ndims(destaques) is null or array_ndims(destaques) = 1)
        and cardinality(destaques) <= 5`,
    )
    // Mesmo limite do domínio, em pontos de código (texto já aparado).
    .addCheckConstraint(
      'avaliacoes_comentario_tamanho',
      sql`comentario is null or char_length(comentario) between 1 and 500`,
    )
    .addCheckConstraint(
      'avaliacoes_avaliador_diferente_do_avaliado',
      sql`avaliador_id <> avaliado_id`,
    )
    .addUniqueConstraint('avaliacoes_trampo_avaliador_unico', [
      'trampo_id',
      'avaliador_id',
    ])
    .execute();

  // Avaliações recebidas por papel, das mais recentes para as mais antigas,
  // com cursor `(criada_em, id)` (CA90), e os resumos (CA89).
  await sql`create index avaliacoes_avaliado_idx
    on avaliacoes (avaliado_id, papel_do_avaliado, criada_em desc, id desc)`.execute(
    db,
  );
  // Avaliações feitas (CA91), exportação e exclusão do lado do avaliador.
  await db.schema
    .createIndex('avaliacoes_avaliador_idx')
    .on('avaliacoes')
    .column('avaliador_id')
    .execute();

  await db.schema
    .createTable('favoritos')
    .addColumn('dono_id', 'uuid', (c) => c.notNull())
    .addColumn('favorito_id', 'uuid', (c) => c.notNull())
    .addColumn('criado_em', 'timestamptz', (c) => c.notNull())
    .addPrimaryKeyConstraint('favoritos_pkey', ['dono_id', 'favorito_id'])
    .addCheckConstraint(
      'favoritos_dono_diferente_do_favorito',
      sql`dono_id <> favorito_id`,
    )
    .execute();

  // Exclusão da conta do lado de quem foi favoritado (CA93); o lado do dono
  // usa o índice da chave primária.
  await db.schema
    .createIndex('favoritos_favorito_idx')
    .on('favoritos')
    .column('favorito_id')
    .execute();
}

/**
 * Só remove as duas tabelas vazias. Roda numa transação só (fora de uma, abre
 * a própria): se `avaliacoes` tiver linhas depois de `favoritos` já ter caído,
 * o erro desfaz a remoção de `favoritos`.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  if (!db.isTransaction) {
    await db.transaction().execute((trx) => down(trx));
    return;
  }
  await removerTabelaSeVazia(db, 'favoritos');
  await removerTabelaSeVazia(db, 'avaliacoes');
}
