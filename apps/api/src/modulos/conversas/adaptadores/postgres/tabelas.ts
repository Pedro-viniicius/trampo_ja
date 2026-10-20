import type { ColumnType, GeneratedAlways } from 'kysely';

/**
 * Tabelas do módulo `conversas` (migração `0005_conversas.ts`). O módulo
 * recebe uma conexão `Kysely<TabelasDeConversas>` e não enxerga tabela de
 * outro módulo.
 */
export interface TabelasDeConversas {
  conversas: TabelaConversas;
  mensagens: TabelaMensagens;
}

export interface TabelaConversas {
  id: string;
  /**
   * Contas do módulo `contas`, referenciadas só pelo id (sem FK entre
   * módulos). Sempre `usuario_a_id < usuario_b_id`.
   */
  usuario_a_id: string;
  usuario_b_id: string;
  criada_em: ColumnType<Date, Date, never>;
}

export interface TabelaMensagens {
  id: string;
  /** FK para `conversas.id` (dentro do módulo). */
  conversa_id: string;
  /** Conta autora, só pelo id. */
  autor_id: string;
  /** Dado pessoal (LGPD): nunca em log nem em erro. */
  texto: string;
  enviada_em: ColumnType<Date, Date, never>;
  /**
   * Ordem de gravação (`bigint generated always as identity`), desempate das
   * mensagens com o mesmo `enviada_em`. O `pg` devolve `bigint` como texto.
   */
  ordem: GeneratedAlways<string>;
}
