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
 * `unique (usuario_a_id, usuario_b_id)`).
 */
export type ResultadoDaInsercao = 'inserida' | 'par_ja_existe';

/** Porta de saída de persistência das conversas e mensagens. */
export interface RepositorioDeConversas {
  inserirConversa(conversa: Conversa): Promise<ResultadoDaInsercao>;
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
  existeVinculoEntre(a: string, b: string): Promise<boolean>;
}
