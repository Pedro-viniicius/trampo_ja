import type { IdCategoria } from '../../../../compartilhado/dominio/categorias.js';
import type { StatusDeServico } from '../../dominio/servico.js';

/** Linha da tabela `servicos` (migração `0003_servicos.ts`). */
export interface TabelaServicos {
  id: string;
  autor_id: string;
  titulo: string;
  descricao: string;
  categoria: IdCategoria;
  /** D7: nula quando o serviço não tem cidade; `cidade_normalizada` também. */
  cidade: string | null;
  cidade_normalizada: string | null;
  texto_busca: string;
  preco_base_centavos: number;
  status: StatusDeServico;
  criado_em: Date;
}

/** Visão do banco que o módulo `servicos` enxerga: só as próprias tabelas. */
export interface TabelasDeServicos {
  servicos: TabelaServicos;
}
