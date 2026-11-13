import { randomBytes } from 'node:crypto';
import type { Conta } from './conta.js';
import type { Email } from './email.js';
import type { OpcoesDeExecucao } from './semaforo.js';

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

/** Primeira sessão da conta, gravada junto com ela no cadastro (S7). */
export interface SessaoInicial {
  /** SHA-256 (hex) do token; o token em si nunca é gravado. */
  readonly tokenHash: string;
  readonly expiraEm: Date;
}

export interface RepositorioDeContas {
  /**
   * Grava a conta nova e, se vier, a primeira sessão dela, numa só transação:
   * se a sessão falhar, a conta também não fica gravada (S7). Lança
   * `ErroDeEmailDuplicado` se o e-mail já existir.
   */
  salvar(conta: Conta, sessaoInicial?: SessaoInicial): Promise<void>;
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
  /**
   * Quantas sessões a conta tem gravadas (inclusive as expiradas), sem ler as
   * linhas: entra na medida da exportação. Id fora do formato devolve 0.
   */
  contarDaConta(contaId: ContaId): Promise<number>;
  /**
   * Apaga até `lote` sessões com `expiraEm <= agora` (as que
   * `buscarContaIdPorTokenHash` já não aceita) e devolve quantas apagou. As
   * válidas ficam intactas. Quem chama repete enquanto vier um lote cheio.
   */
  apagarExpiradas(agora: Date, lote: number): Promise<number>;
}

/**
 * Lápides das contas excluídas (ADR-007): só o id e a data da exclusão, nada
 * de dado pessoal. Gravadas na transação da exclusão; a limpeza periódica
 * refaz a exclusão de cada uma depois de alguns minutos (para apagar o que
 * uma escrita em voo gravou depois) e então a esquece.
 */
export interface RepositorioDeContasExcluidas {
  /**
   * Ids das lápides com `excluidaEm <= limite`, das mais antigas para as mais
   * novas, no máximo `lote`.
   */
  listarAntesDe(limite: Date, lote: number): Promise<ContaId[]>;
  /** Apaga a lápide; não falha se ela não existir. */
  esquecer(id: ContaId): Promise<void>;
}

/** Situação do contador de uma conta logo depois de somar uma tentativa. */
export interface ContagemDeTentativas {
  /** Tentativas na janela atual, já com a que acabou de ser somada. */
  readonly tentativas: number;
  readonly inicioDaJanela: Date;
}

/**
 * Teto de tentativas de entrada por conta (D31), guardado no banco: um
 * contador por conta existente, numa janela fixa que começa na primeira
 * tentativa. Não guarda e-mail nem IP. Por ficar fora da memória do
 * processo, pedidos com e-mails de lixo não despejam o contador da vítima
 * (achado S1 da rodada 1 da L3). A exclusão da conta apaga o contador junto
 * (cascade no Postgres).
 */
export interface RepositorioDeTentativasDeEntrada {
  /**
   * Soma uma tentativa ao contador da conta, de forma atômica (pedidos
   * simultâneos não perdem contagem). Se a janela venceu
   * (`inicioDaJanela + janelaMs <= agora`) ou não havia contador, começa uma
   * janela nova em `agora` com 1. Devolve `null`, sem gravar, se a conta não
   * existe (ex.: excluída entre a busca e a contagem) ou se o id não é uuid.
   */
  registrar(
    contaId: ContaId,
    agora: Date,
    janelaMs: number,
  ): Promise<ContagemDeTentativas | null>;
  /**
   * Apaga os contadores com `inicioDaJanela <= limite` (as janelas vencidas,
   * com `limite = agora - janela`) e devolve quantos apagou. Idempotente.
   */
  apagarVencidas(limite: Date): Promise<number>;
}

/**
 * Gera e confere hashes de senha. Cada derivação espera vaga numa fila do
 * processo; `fila` vai para ela (`Semaforo.executar`): com `esperaMaximaMs`, a
 * espera esgotada rejeita com `EsperaEsgotada`; com `sinal` abortado antes da
 * vaga, rejeita com `EsperaCancelada`. Nos dois casos nada é derivado. Sem
 * `fila`, espera o quanto for preciso (ex.: o hash fictício da partida).
 */
export interface HasherDeSenha {
  gerarHash(senha: string, fila?: OpcoesDeExecucao): Promise<string>;
  /** `false` para senha errada ou hash malformado; nunca lança por formato. */
  verificar(
    senha: string,
    hashArmazenado: string,
    fila?: OpcoesDeExecucao,
  ): Promise<boolean>;
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
 * `outroUsuarioId` das conversas e o `contaId` dos favoritos; nada de colunas
 * derivadas (`cidade_normalizada`, `texto_busca`).
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

/** Avaliação feita pela conta (CA93), com o comentário que ela escreveu. */
export interface AvaliacaoFeitaExportada {
  readonly trampoId: string;
  readonly nota: number;
  readonly destaques: readonly string[];
  readonly comentario: string | null;
  readonly criadaEm: string;
}

/**
 * Avaliação recebida pela conta (CA93): só a nota, os destaques e a data. O
 * comentário é texto de terceiro e o avaliador fica de fora.
 */
export interface AvaliacaoRecebidaExportada {
  readonly nota: number;
  readonly destaques: readonly string[];
  readonly criadaEm: string;
}

/** Conta na equipe favorita da conta (CA93): só o id e a data. */
export interface FavoritoExportado {
  readonly contaId: string;
  readonly criadoEm: string;
}

export interface PartesExportadas {
  readonly perfil: PerfilExportado | null;
  readonly trampos: readonly TrampoExportado[];
  readonly servicos: readonly ServicoExportado[];
  readonly candidaturas: readonly CandidaturaExportada[];
  readonly conversas: readonly ConversaExportada[];
  readonly avaliacoesFeitas: readonly AvaliacaoFeitaExportada[];
  readonly avaliacoesRecebidas: readonly AvaliacaoRecebidaExportada[];
  readonly favoritos: readonly FavoritoExportado[];
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
   * último a própria conta e as sessões (D25), e grava a lápide da conta
   * (ADR-007). Idempotente: sem nada a apagar (ex.: um segundo pedido
   * concorrente ou a limpeza periódica), resolve sem erro.
   */
  excluirTudo(contaId: ContaId): Promise<void>;
  /** Junta as partes da exportação vindas dos outros módulos (D26). */
  coletarDosOutrosModulos(contaId: ContaId): Promise<PartesExportadas>;
  /**
   * Tamanho estimado, em bytes, das partes que `coletarDosOutrosModulos`
   * devolveria, medido no banco sem carregar os textos (S1-R). Nunca menor
   * que os bytes crus dos textos; só a própria conta entra na conta.
   */
  medirDosOutrosModulos(contaId: ContaId): Promise<number>;
}
