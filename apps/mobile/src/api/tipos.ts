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

export type StatusDoTrampo = 'aberto' | 'em_andamento' | 'encerrado';

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
  /**
   * Só na visão do autor (`GET /trampos/meus` e o seu `GET /trampos/:id`):
   * é a `versao` que `PUT /trampos/:id` devolve à API.
   */
  readonly versao?: number;
  /** Só na visão do autor: quantas candidaturas o trampo recebeu. */
  readonly candidaturasRecebidas?: number;
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
  /**
   * Só na visão do autor (`GET /servicos/meus` e o seu `GET /servicos/:id`):
   * é a `versao` que `PUT /servicos/:id` devolve à API.
   */
  readonly versao?: number;
}

/**
 * Resposta de criação (`201`): `POST /trampos` (`aberto`), `POST /servicos`
 * (`ativo`) e `POST /trampos/:id/candidaturas` (`pendente`).
 */
export interface Criado<TStatus extends string = string> {
  readonly id: string;
  readonly status: TStatus;
}

/**
 * Corpo de `POST /trampos`. Valor em centavos. `prazo` (`YYYY-MM-DD`) é
 * opcional: `undefined`, `null` ou em branco não vai no corpo.
 */
export interface EntradaDeTrampo {
  readonly titulo: string;
  readonly descricao: string;
  /** Id da categoria (`Categoria.id`). */
  readonly categoria: string;
  readonly cidade: string;
  readonly valorCentavos: number;
  readonly prazo?: string | null;
}

/**
 * Corpo de `POST /servicos`. Preço em centavos. `cidade` é opcional (D7):
 * `undefined`, `null` ou em branco não vai no corpo.
 */
export interface EntradaDeServico {
  readonly titulo: string;
  readonly descricao: string;
  /** Id da categoria (`Categoria.id`). */
  readonly categoria: string;
  readonly cidade?: string | null;
  readonly precoBaseCentavos: number;
}

export type StatusDaCandidatura = 'pendente' | 'aceita' | 'recusada';

/** Corpo de `POST /trampos/:id/candidaturas`. Valor em centavos. */
export interface EntradaDeCandidatura {
  readonly mensagem: string;
  readonly valorPropostoCentavos: number;
}

/** Item de `GET /trampos/:id/candidaturas` (só o autor do trampo vê). */
export interface CandidaturaRecebida {
  readonly id: string;
  /** Id da conta de quem se candidatou (`GET /perfis/:contaId`). */
  readonly freelancerId: string;
  readonly mensagem: string;
  readonly valorPropostoCentavos: number;
  readonly status: StatusDaCandidatura;
  /** ISO 8601. */
  readonly criadaEm: string;
}

/** Item de `GET /candidaturas/minhas`: a candidatura e o trampo dela. */
export type MinhaCandidatura = CandidaturaRecebida & {
  readonly trampoId: string;
};

/** Resposta de `POST /trampos/:id/candidaturas/:cid/aceitar`. */
export interface ResultadoDoAceite {
  readonly status: 'aceita';
}

/**
 * Resposta de `POST /conversas`: igual no 201 (conversa nova) e no 200 (o par
 * já tinha conversa).
 */
export interface ConversaAberta {
  readonly conversaId: string;
}

/** Última mensagem de uma conversa, no item de `GET /conversas`. */
export interface UltimaMensagem {
  readonly texto: string;
  /** ISO 8601. */
  readonly enviadaEm: string;
}

/** Item de `GET /conversas` (última atividade primeiro). */
export interface ResumoDeConversa {
  readonly conversaId: string;
  /** Id da conta do outro participante (`GET /perfis/:contaId`). */
  readonly outroUsuarioId: string;
  /** ISO 8601. */
  readonly criadaEm: string;
  /** `null` na conversa ainda sem mensagens. */
  readonly ultimaMensagem: UltimaMensagem | null;
}

/** Item de `GET /conversas/:id/mensagens`, na ordem de envio. */
export interface Mensagem {
  readonly id: string;
  readonly autorId: string;
  readonly texto: string;
  /** ISO 8601. */
  readonly enviadaEm: string;
}

/** Resposta de `POST /conversas/:id/mensagens` (201). */
export interface MensagemEnviada {
  readonly id: string;
  /** ISO 8601. */
  readonly enviadaEm: string;
}

/** Corpo de `POST /contas/eu/exclusao` e `POST /contas/eu/exportacao`. */
export interface ConfirmacaoComSenha {
  readonly senha: string;
}

/**
 * Resposta de `POST /contas/eu/exportacao` (200, `trampo-ja.exportacao.v1`).
 * O app não lê os campos: grava o JSON como veio num arquivo temporário e o
 * compartilha. Traz dado pessoal (e-mail, perfil, mensagens): nunca vai para
 * erro, log, cache de consultas nem URL (CA24).
 */
export type DadosExportados = { readonly formato: string } & Readonly<
  Record<string, unknown>
>;
