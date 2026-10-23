import type { IdCategoria } from '../../../../compartilhado/dominio/categorias.js';
import type { StatusDeServico } from '../../dominio/servico.js';

/** Linha da tabela `servicos` (migrações `0003_servicos.ts` e `0006_anuncios.ts`). */
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
  /** Trava otimista da edição (`0006`): 1 na criação, mais 1 a cada edição. */
  versao: number;
}

/** Visão do banco que o módulo `servicos` enxerga: só as próprias tabelas. */
export interface TabelasDeServicos {
  servicos: TabelaServicos;
}
