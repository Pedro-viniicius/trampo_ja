import { randomBytes } from 'node:crypto';
import type { Conta } from './conta.js';
import type { Email } from './email.js';

/** Identificador da conta (uuid). É o que a fachada expõe aos outros módulos. */
export type ContaId = string;

/**
 * Lançado por `RepositorioDeContas.salvar` quando o e-mail já está gravado
 * (ex.: dois cadastros simultâneos). Não carrega o e-mail nem o id: o caso de
 * uso converte em `ErroDeRegra('email_em_uso')`.
 */
export class ErroDeEmailDuplicado extends Error {
  constructor() {
    super('email_duplicado');
    this.name = 'ErroDeEmailDuplicado';
  }
}

export interface RepositorioDeContas {
  /** Grava a conta nova. Lança `ErroDeEmailDuplicado` se o e-mail já existir. */
  salvar(conta: Conta): Promise<void>;
  buscarPorEmail(email: Email): Promise<Conta | null>;
  /** Conta pelo id; `null` se não existir ou se o id não for um uuid. */
  buscarPorId(id: ContaId): Promise<Conta | null>;
  existeEmail(email: Email): Promise<boolean>;
}

/** Sessão da conta como sai na exportação: só as datas, nunca o hash. */
export interface SessaoDaConta {
  readonly criadaEm: Date;
  readonly expiraEm: Date;
}

/** Sessões guardadas pelo SHA-256 (hex) do token; o token em si nunca é gravado. */
export interface RepositorioDeSessoes {
  salvar(tokenHash: string, contaId: ContaId, expiraEm: Date): Promise<void>;
  /** Conta da sessão, ou `null` se não existir ou se `expiraEm <= agora`. */
  buscarContaIdPorTokenHash(
    tokenHash: string,
    agora: Date,
  ): Promise<ContaId | null>;
  /** Remove a sessão; não falha se ela não existir. */
  remover(tokenHash: string): Promise<void>;
  /**
   * Todas as sessões gravadas da conta (inclusive as expiradas), da mais
   * antiga para a mais nova. Id fora do formato devolve lista vazia.
   */
  listarDaConta(contaId: ContaId): Promise<SessaoDaConta[]>;
}

export interface HasherDeSenha {
  gerarHash(senha: string): Promise<string>;
  /** `false` para senha errada ou hash malformado; nunca lança por formato. */
  verificar(senha: string, hashArmazenado: string): Promise<boolean>;
}

export interface GeradorDeToken {
  gerar(): string;
}

const BYTES_DO_TOKEN = 32;

/** Padrão: 32 bytes de `crypto.randomBytes` em base64url (43 caracteres). */
export const geradorDeTokenPadrao: GeradorDeToken = Object.freeze({
  gerar: () => randomBytes(BYTES_DO_TOKEN).toString('base64url'),
});

/** Valor fixo de `formato` na exportação (D26). */
export const FORMATO_DA_EXPORTACAO = 'trampo-ja.exportacao.v1';

/**
 * Partes da exportação que vêm dos outros módulos (ADR-005). Datas em ISO 8601
 * (`prazo` em `AAAA-MM-DD`). Só dados da própria conta: de terceiros, apenas o
 * `outroUsuarioId` das conversas; nada de colunas derivadas (`cidade_normalizada`,
 * `texto_busca`).
 */
export interface PerfilExportado {
  readonly nome: string;
  readonly cidade: string;
  readonly descricao: string | null;
  readonly habilidades: readonly string[];
  readonly atualizadoEm: string;
}

export interface TrampoExportado {
  readonly id: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly categoria: string;
  readonly cidade: string;
  readonly valorCentavos: number;
  readonly prazo: string | null;
  readonly status: string;
  readonly criadoEm: string;
  /** Só a contagem: as candidaturas recebidas são texto de terceiros. */
  readonly candidaturasRecebidas: number;
}

export interface ServicoExportado {
  readonly id: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly categoria: string;
  readonly cidade: string | null;
  readonly precoBaseCentavos: number;
  readonly status: string;
  readonly criadoEm: string;
}

export interface CandidaturaExportada {
  readonly id: string;
  readonly trampoId: string;
  readonly mensagem: string;
  readonly valorPropostoCentavos: number;
  readonly status: string;
  readonly criadaEm: string;
}

export interface MensagemExportada {
  readonly id: string;
  readonly texto: string;
  readonly enviadaEm: string;
}

export interface ConversaExportada {
  readonly id: string;
  readonly outroUsuarioId: string;
  readonly criadaEm: string;
  /** Só as mensagens escritas pela conta; as do outro ficam de fora. */
  readonly minhasMensagens: readonly MensagemExportada[];
}

export interface PartesExportadas {
  readonly perfil: PerfilExportado | null;
  readonly trampos: readonly TrampoExportado[];
  readonly servicos: readonly ServicoExportado[];
  readonly candidaturas: readonly CandidaturaExportada[];
  readonly conversas: readonly ConversaExportada[];
}

/** JSON `trampo-ja.exportacao.v1` devolvido por `POST /contas/eu/exportacao`. */
export interface ExportacaoV1 extends PartesExportadas {
  readonly formato: typeof FORMATO_DA_EXPORTACAO;
  readonly geradoEm: string;
  readonly conta: {
    readonly id: ContaId;
    readonly email: string;
    readonly criadaEm: string;
  };
  readonly sessoes: readonly {
    readonly criadaEm: string;
    readonly expiraEm: string;
  }[];
}

/**
 * Dados da conta guardados fora do módulo `contas` (ADR-005). Quem implementa
 * é a composição, que conhece todas as fachadas.
 */
export interface DadosDaConta {
  /**
   * Apaga, numa só transação, os dados da conta em todos os módulos e por
   * último a própria conta e as sessões (D25). Idempotente: sem nada a
   * apagar (ex.: um segundo pedido concorrente), resolve sem erro.
   */
  excluirTudo(contaId: ContaId): Promise<void>;
  /** Junta as partes da exportação vindas dos outros módulos (D26). */
  coletarDosOutrosModulos(contaId: ContaId): Promise<PartesExportadas>;
}
