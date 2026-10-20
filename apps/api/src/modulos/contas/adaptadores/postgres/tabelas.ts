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

/** Visão do banco que o módulo `contas` enxerga: só as próprias tabelas. */
export interface TabelasDeContas {
  contas: TabelaContas;
  sessoes: TabelaSessoes;
}
