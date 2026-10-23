import type { ColumnType, Generated } from 'kysely';

/** Linha de `contas` (migração `0001_contas.ts`). */
export interface TabelaContas {
  id: string;
  /** Aparado e em minúsculas; único pela constraint `contas_email_key`. */
  email: string;
  senha_hash: string;
  criada_em: ColumnType<Date, Date, never>;
}

/** Linha de `sessoes`: só o SHA-256 (hex) do token, nunca o token. */
export interface TabelaSessoes {
  token_hash: string;
  conta_id: string;
  expira_em: Date;
  criada_em: Generated<Date>;
}

/**
 * Linha de `contas_excluidas` (migração `0007_contas_excluidas.ts`): a lápide
 * da conta excluída, só o id e a data (ADR-007). Sem FK.
 */
export interface TabelaContasExcluidas {
  id: string;
  excluida_em: Date;
}

/**
 * Linha de `tentativas_de_entrada` (migração `0008_tentativas_de_entrada.ts`):
 * o contador do teto de entrada da conta (D31), sem e-mail nem IP. FK para
 * `contas` com `on delete cascade`.
 */
export interface TabelaTentativasDeEntrada {
  conta_id: string;
  inicio_da_janela: Date;
  tentativas: number;
}

/** Visão do banco que o módulo `contas` enxerga: só as próprias tabelas. */
export interface TabelasDeContas {
  contas: TabelaContas;
  sessoes: TabelaSessoes;
  contas_excluidas: TabelaContasExcluidas;
  tentativas_de_entrada: TabelaTentativasDeEntrada;
}
