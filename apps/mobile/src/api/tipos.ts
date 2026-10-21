/**
 * Tipos que espelham as respostas e os corpos da API (contrato no `README.md`,
 * seção "API HTTP"). Datas chegam como texto ISO 8601 e valores em centavos.
 */

/** Motivo de um campo recusado (`campos` do erro `dados_invalidos`). */
export type MotivoDeCampo = 'obrigatorio' | 'tamanho' | 'invalido';

/** Campo recusado pela API. `campo` pode ser composto, como `habilidades.2`. */
export interface CampoInvalido {
  readonly campo: string;
  readonly motivo: MotivoDeCampo;
}

/** Corpo de `POST /contas` e `POST /sessoes`. */
export interface Credenciais {
  readonly email: string;
  readonly senha: string;
}

/** Resposta de `POST /contas` e `POST /sessoes`. */
export interface Sessao {
  readonly token: string;
}

/** `GET` e `PUT /perfis/eu`. */
export interface MeuPerfil {
  readonly nome: string;
  readonly cidade: string;
  readonly descricao: string | null;
  readonly habilidades: readonly string[];
  readonly completo: boolean;
}

/** `GET /perfis/:contaId`: nunca traz e-mail nem outro dado da conta. */
export interface PerfilPublico {
  readonly contaId: string;
  readonly nome: string;
  readonly cidade: string;
  readonly descricao: string | null;
  readonly habilidades: readonly string[];
}

/** Corpo de `PUT /perfis/eu`. */
export interface EntradaDePerfil {
  readonly nome: string;
  readonly cidade: string;
  readonly descricao?: string | null;
  readonly habilidades: readonly string[];
}

/** Item de `GET /categorias`. */
export interface Categoria {
  readonly id: string;
  readonly rotulo: string;
}

/** Valores de `tipo` na consulta de `GET /busca` (a API assume `todos`). */
export type TipoDaBusca = 'trampos' | 'servicos' | 'todos';

/** Consulta de `GET /busca`. Todos os filtros são opcionais e combinam com E. */
export interface FiltrosDaBusca {
  /** Até 100 caracteres. */
  readonly texto?: string;
  /** Id da categoria (`Categoria.id`). */
  readonly categoria?: string;
  readonly cidade?: string;
  readonly tipo?: TipoDaBusca;
  /** `proximoCursor` da página anterior. */
  readonly antesDe?: string;
  /** De 1 a 49; a API assume 20. */
  readonly limite?: number;
}

interface ItemComum {
  readonly id: string;
  readonly autorId: string;
  readonly titulo: string;
  readonly categoria: string;
  /** `null` em serviço sem cidade. */
  readonly cidade: string | null;
  /** ISO 8601. */
  readonly criadoEm: string;
}

export interface ItemTrampoDaBusca extends ItemComum {
  readonly tipo: 'trampo';
  readonly valorCentavos: number;
}

export interface ItemServicoDaBusca extends ItemComum {
  readonly tipo: 'servico';
  readonly precoBaseCentavos: number;
}

/** Item de `GET /busca`, discriminado por `tipo`. */
export type ItemDaBusca = ItemTrampoDaBusca | ItemServicoDaBusca;

/** Resposta de `GET /busca`. `proximoCursor` é `null` na última página. */
export interface PaginaDaBusca {
  readonly itens: readonly ItemDaBusca[];
  readonly proximoCursor: string | null;
}

export type StatusDoTrampo = 'aberto' | 'em_andamento';

/** `GET /trampos/:id`. */
export interface Trampo {
  readonly id: string;
  readonly autorId: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly categoria: string;
  readonly cidade: string;
  readonly valorCentavos: number;
  /** `YYYY-MM-DD` ou `null` sem prazo. */
  readonly prazo: string | null;
  readonly status: StatusDoTrampo;
  /** ISO 8601. */
  readonly criadoEm: string;
}

export type StatusDoServico = 'ativo';

/** `GET /servicos/:id`. */
export interface Servico {
  readonly id: string;
  readonly autorId: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly categoria: string;
  /** `null` quando o serviço não tem cidade. */
  readonly cidade: string | null;
  readonly precoBaseCentavos: number;
  readonly status: StatusDoServico;
  /** ISO 8601. */
  readonly criadoEm: string;
}
