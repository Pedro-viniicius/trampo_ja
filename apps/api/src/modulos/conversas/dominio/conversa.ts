import { ErroDeRegra } from '../../../compartilhado/dominio/erros.js';

/** Estado completo da conversa, usado para reconstituir e para persistir. */
export interface DadosDaConversa {
  readonly id: string;
  /** O menor id do par (comparação de texto); `usuarioAId < usuarioBId`. */
  readonly usuarioAId: string;
  readonly usuarioBId: string;
  readonly criadaEm: Date;
}

export interface ContextoDaConversa {
  readonly id: string;
  readonly agora: Date;
}

/**
 * Conversa entre dois usuários (CA12). O par é guardado em ordem, para que
 * "A com B" e "B com A" sejam a mesma conversa: o banco tem `unique` no par e
 * `check (usuario_a_id < usuario_b_id)` (migração `0005_conversas.ts`).
 */
export class Conversa {
  readonly #dados: DadosDaConversa;

  private constructor(dados: DadosDaConversa) {
    this.#dados = Object.freeze({
      ...dados,
      criadaEm: new Date(dados.criadaEm.getTime()),
    });
  }

  /**
   * Cria a conversa entre `usuario1` e `usuario2`, em qualquer ordem.
   * Recusa a conversa de alguém consigo mesmo (`conversa_consigo_mesmo`).
   */
  static criar(
    usuario1: string,
    usuario2: string,
    contexto: ContextoDaConversa,
  ): Conversa {
    const [usuarioAId, usuarioBId] = Conversa.ordenarPar(usuario1, usuario2);
    return new Conversa({
      id: contexto.id,
      usuarioAId,
      usuarioBId,
      criadaEm: contexto.agora,
    });
  }

  /**
   * O par na ordem guardada (menor primeiro, por comparação de texto). Usado
   * também pelos repositórios para procurar a conversa de um par.
   */
  static ordenarPar(
    usuario1: string,
    usuario2: string,
  ): readonly [string, string] {
    if (usuario1 === usuario2) {
      throw new ErroDeRegra('conversa_consigo_mesmo');
    }
    return usuario1 < usuario2 ? [usuario1, usuario2] : [usuario2, usuario1];
  }

  /** Reconstitui a partir do que o repositório guardou (sem revalidar). */
  static reconstituir(dados: DadosDaConversa): Conversa {
    return new Conversa(dados);
  }

  get id(): string {
    return this.#dados.id;
  }

  get usuarioAId(): string {
    return this.#dados.usuarioAId;
  }

  get usuarioBId(): string {
    return this.#dados.usuarioBId;
  }

  get criadaEm(): Date {
    return new Date(this.#dados.criadaEm.getTime());
  }

  participa(usuarioId: string): boolean {
    return (
      usuarioId === this.#dados.usuarioAId ||
      usuarioId === this.#dados.usuarioBId
    );
  }

  /** O outro lado da conversa; `null` para quem não participa. */
  outroParticipante(usuarioId: string): string | null {
    if (usuarioId === this.#dados.usuarioAId) {
      return this.#dados.usuarioBId;
    }
    if (usuarioId === this.#dados.usuarioBId) {
      return this.#dados.usuarioAId;
    }
    return null;
  }

  /** Cópia do estado, para o repositório persistir. */
  dados(): DadosDaConversa {
    return {
      ...this.#dados,
      criadaEm: new Date(this.#dados.criadaEm.getTime()),
    };
  }
}
