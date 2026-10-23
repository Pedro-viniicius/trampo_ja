import type { Conversa } from './conversa.js';
import type { Mensagem } from './mensagem.js';

/**
 * Posição de paginação das mensagens: "estritamente depois desta", na ordem
 * de envio (`enviadaEm` asc e, no empate, a ordem em que foram gravadas). O
 * `id` identifica a mensagem do cursor; o desempate nunca é pelo `id`, que é
 * aleatório.
 */
export interface CursorDeMensagens {
  readonly enviadaEm: Date;
  readonly id: string;
}

export interface OpcoesDaListagemDeMensagens {
  readonly depoisDe?: CursorDeMensagens;
  readonly limite: number;
}

/** Última mensagem de uma conversa, para a lista de conversas. */
export interface UltimaMensagem {
  readonly texto: string;
  readonly enviadaEm: Date;
}

export interface ConversaComUltimaMensagem {
  readonly conversa: Conversa;
  /** `null` se ninguém escreveu ainda. */
  readonly ultimaMensagem: UltimaMensagem | null;
}

/**
 * Resultado de `inserirConversa`. `par_ja_existe`: outra requisição criou a
 * conversa do mesmo par entre a busca e a inserção (no Postgres, o 23505 do
 * `unique (usuario_a_id, usuario_b_id)`). `sem_vinculo`: a conferência do
 * vínculo, feita já sob a trava das duas contas, deu `false` (a exclusão de
 * conta de um dos dois terminou nesse meio-tempo, D25); nada foi gravado.
 */
export type ResultadoDaInsercao = 'inserida' | 'par_ja_existe' | 'sem_vinculo';

/**
 * Transação em curso, opaca para o domínio. Na abertura de conversa, o
 * adaptador Postgres a passa à conferência do vínculo, para a consulta correr
 * na mesma conexão e sob a mesma trava (sem pedir outra conexão ao pool
 * enquanto segura esta); o adaptador em memória passa `undefined`.
 */
export type TransacaoEmCurso = unknown;

/** Conferência do vínculo dentro da inserção (ver `inserirConversa`). */
export type ConferirVinculo = (transacao: TransacaoEmCurso) => Promise<boolean>;

/** Porta de saída de persistência das conversas e mensagens. */
export interface RepositorioDeConversas {
  /**
   * Insere a conversa só se `conferirVinculo` confirmar o vínculo, chamado
   * depois de travar as duas contas contra a exclusão (no Postgres, a trava
   * compartilhada de `compartilhado/banco/travas-de-conta.ts`, na transação do
   * insert). Assim, nenhuma conversa fica com o id de uma conta excluída.
   */
  inserirConversa(
    conversa: Conversa,
    conferirVinculo: ConferirVinculo,
  ): Promise<ResultadoDaInsercao>;
  buscarConversaPorId(id: string): Promise<Conversa | null>;
  /** A conversa do par, em qualquer ordem dos dois ids. */
  buscarConversaDoPar(
    usuario1: string,
    usuario2: string,
  ): Promise<Conversa | null>;
  /**
   * Conversas em que o usuário participa, pela última atividade (a última
   * mensagem ou, sem mensagem, a criação) desc, desempate por id desc.
   */
  listarConversasDoUsuario(
    usuarioId: string,
  ): Promise<readonly ConversaComUltimaMensagem[]>;
  salvarMensagem(mensagem: Mensagem): Promise<void>;
  /** A mensagem `mensagemId` se ela for da conversa `conversaId`; senão `null`. */
  buscarMensagemDaConversa(
    conversaId: string,
    mensagemId: string,
  ): Promise<Mensagem | null>;
  /**
   * Em ordem de envio (`enviadaEm` asc e, no empate, ordem de gravação), no
   * máximo `limite`.
   */
  listarMensagens(
    conversaId: string,
    opcoes: OpcoesDaListagemDeMensagens,
  ): Promise<readonly Mensagem[]>;
}

/**
 * CA13: só conversa quem tem vínculo (candidatura em qualquer estado entre os
 * dois). Na composição, ligada a `trampos.existeVinculoEntre`; declarada aqui
 * para este módulo não importar `trampos`.
 */
export interface VerificadorDeVinculo {
  /**
   * Com `transacao` (a de `inserirConversa`), a consulta roda nela; sem,
   * numa conexão qualquer.
   */
  existeVinculoEntre(
    a: string,
    b: string,
    transacao?: TransacaoEmCurso,
  ): Promise<boolean>;
}
