import type { ColumnType } from 'kysely';
import type { IdCategoria } from '../../../../compartilhado/dominio/categorias.js';
import type { StatusDaCandidatura } from '../../dominio/candidatura.js';
import type { StatusDoTrampo } from '../../dominio/trampo.js';

/**
 * Tabelas do módulo `trampos` (migração `0002_trampos.ts`; a `0006_anuncios.ts`
 * acrescenta o status `encerrado`). O módulo recebe uma conexão
 * `Kysely<TabelasDeTrampos>` e não enxerga tabela de outro módulo.
 */
export interface TabelasDeTrampos {
  trampos: TabelaTrampos;
  candidaturas: TabelaCandidaturas;
}

export interface TabelaTrampos {
  id: string;
  /** Conta do módulo `contas`, referenciada só pelo id (sem FK entre módulos). */
  autor_id: string;
  titulo: string;
  descricao: string;
  categoria: IdCategoria;
  cidade: string;
  cidade_normalizada: string;
  texto_busca: string;
  valor_centavos: number;
  /**
   * O `pg` converte `date` em `Date` no fuso local; por isso o repositório lê
   * esta coluna com `to_char(prazo, 'YYYY-MM-DD')` e grava o texto.
   */
  prazo: ColumnType<Date | null, string | null, string | null>;
  status: StatusDoTrampo;
  versao: number;
  criado_em: ColumnType<Date, Date, never>;
}

export interface TabelaCandidaturas {
  id: string;
  trampo_id: string;
  freelancer_id: string;
  mensagem: string;
  valor_proposto_centavos: number;
  status: StatusDaCandidatura;
  criada_em: ColumnType<Date, Date, never>;
}
