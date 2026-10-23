import type { Kysely, Selectable } from 'kysely';
import { Perfil } from '../../dominio/perfil.js';
import type { RepositorioDePerfis } from '../../dominio/portas.js';
import type { TabelaPerfis, TabelasDePerfis } from './tabelas.js';

// Formato textual de um `uuid` do Postgres. Um id fora dele faria o banco
// recusar a consulta (SQLSTATE 22P02) e viraria 500; aqui vira "não existe".
const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ehUuid(valor: string): boolean {
  return FORMATO_UUID.test(valor);
}

function paraLinha(perfil: Perfil): TabelaPerfis {
  return {
    conta_id: perfil.contaId,
    nome: perfil.nome,
    cidade: perfil.cidade,
    cidade_normalizada: perfil.cidadeNormalizada,
    descricao: perfil.descricao ?? null,
    habilidades: [...perfil.habilidades],
    atualizado_em: perfil.atualizadoEm,
  };
}

function paraPerfil(linha: Selectable<TabelaPerfis>): Perfil {
  return Perfil.reconstituir({
    contaId: linha.conta_id,
    nome: linha.nome,
    cidade: linha.cidade,
    cidadeNormalizada: linha.cidade_normalizada,
    ...(linha.descricao !== null ? { descricao: linha.descricao } : {}),
    habilidades: linha.habilidades,
    atualizadoEm: linha.atualizado_em,
  });
}

/** Adaptador Postgres da porta `RepositorioDePerfis` (tabela `perfis`). */
export class RepositorioDePerfisPostgres implements RepositorioDePerfis {
  readonly #db: Kysely<TabelasDePerfis>;

  constructor(db: Kysely<TabelasDePerfis>) {
    this.#db = db;
  }

  /** Upsert numa instrução só: duas gravações simultâneas não duplicam linha. */
  async salvar(perfil: Perfil): Promise<void> {
    const { conta_id, ...colunas } = paraLinha(perfil);
    await this.#db
      .insertInto('perfis')
      .values({ conta_id, ...colunas })
      .onConflict((conflito) =>
        conflito.column('conta_id').doUpdateSet(colunas),
      )
      .execute();
  }

  async buscarPorConta(contaId: string): Promise<Perfil | null> {
    if (!ehUuid(contaId)) {
      return null;
    }
    const linha = await this.#db
      .selectFrom('perfis')
      .selectAll()
      .where('conta_id', '=', contaId)
      .executeTakeFirst();
    return linha ? paraPerfil(linha) : null;
  }
}

/**
 * Perfil como sai na exportação da conta (D26, ADR-005). Mesmo formato de
 * `PerfilExportado` do módulo `contas`, declarado aqui para não acoplar os
 * módulos: a composição liga os dois por compatibilidade estrutural. Fica de
 * fora a coluna derivada `cidade_normalizada`.
 */
export interface PerfilExportado {
  readonly nome: string;
  readonly cidade: string;
  readonly descricao: string | null;
  readonly habilidades: readonly string[];
  /** ISO 8601. */
  readonly atualizadoEm: string;
}

/** Parte de `perfis` na exportação: `null` se a conta não tem perfil. */
export interface ParteDePerfisNaExportacao {
  readonly perfil: PerfilExportado | null;
}

/**
 * Parte de `perfis` na exclusão da conta (D25, ADR-005): apaga o perfil
 * dentro da transação aberta pela composição (`trx`). Não abre transação
 * própria. Lança, sem consultar, com `contaId` fora do formato uuid ou com
 * uma conexão fora de transação. Sem perfil, resolve sem erro.
 */
export async function excluirDadosDaConta(
  trx: Kysely<TabelasDePerfis>,
  contaId: string,
): Promise<void> {
  if (!ehUuid(contaId)) {
    throw new TypeError('perfis.excluirDadosDaConta: contaId não é um uuid');
  }
  if (!trx.isTransaction) {
    throw new TypeError('perfis.excluirDadosDaConta: exige uma transação');
  }
  await trx.deleteFrom('perfis').where('conta_id', '=', contaId).execute();
}

/** Parte de `perfis` na exportação da conta (D26). Id fora do formato: sem perfil. */
export async function exportarDadosDaConta(
  db: Kysely<TabelasDePerfis>,
  contaId: string,
): Promise<ParteDePerfisNaExportacao> {
  if (!ehUuid(contaId)) {
    return { perfil: null };
  }
  const linha = await db
    .selectFrom('perfis')
    .select(['nome', 'cidade', 'descricao', 'habilidades', 'atualizado_em'])
    .where('conta_id', '=', contaId)
    .executeTakeFirst();
  if (!linha) {
    return { perfil: null };
  }
  return {
    perfil: {
      nome: linha.nome,
      cidade: linha.cidade,
      descricao: linha.descricao,
      habilidades: [...linha.habilidades],
      atualizadoEm: linha.atualizado_em.toISOString(),
    },
  };
}
