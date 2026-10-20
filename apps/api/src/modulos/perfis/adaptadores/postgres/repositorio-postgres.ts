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
