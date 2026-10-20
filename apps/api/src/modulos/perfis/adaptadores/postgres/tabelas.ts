/** Linha da tabela `perfis` (migração `0004_perfis.ts`). Toda ela é dado pessoal. */
export interface TabelaPerfis {
  conta_id: string;
  nome: string;
  cidade: string;
  cidade_normalizada: string;
  /** Nula quando o perfil não tem descrição. */
  descricao: string | null;
  habilidades: string[];
  atualizado_em: Date;
}

/** Visão do banco que o módulo `perfis` enxerga: só a própria tabela. */
export interface TabelasDePerfis {
  perfis: TabelaPerfis;
}
