import {
  ErroDeValidacao,
  type MotivoDeCampo,
} from '../../../compartilhado/dominio/erros.js';

export const SENHA_TAMANHO_MINIMO = 8;
/** O teto evita gastar hash com textos enormes (DoS). */
export const SENHA_TAMANHO_MAXIMO = 128;

const OCULTA = '[senha oculta]';

/**
 * Tamanho da senha em pontos de código, não em unidades UTF-16 (um emoji conta
 * como 1), como os demais campos de texto da API. Cada ponto de código ocupa 1
 * ou 2 unidades: acima do dobro do teto, devolve `Infinity` sem percorrer um
 * texto enorme.
 */
export function tamanhoDaSenha(texto: string): number {
  if (texto.length > SENHA_TAMANHO_MAXIMO * 2) {
    return Number.POSITIVE_INFINITY;
  }
  return [...texto].length;
}

function analisar(entrada: unknown): MotivoDeCampo | null {
  if (entrada === undefined || entrada === null || entrada === '') {
    return 'obrigatorio';
  }
  if (typeof entrada !== 'string') {
    return 'invalido';
  }
  const tamanho = tamanhoDaSenha(entrada);
  if (tamanho < SENHA_TAMANHO_MINIMO || tamanho > SENHA_TAMANHO_MAXIMO) {
    return 'tamanho';
  }
  return null;
}

/**
 * Senha em texto puro, só em memória e só até virar hash. Não é aparada:
 * espaços fazem parte da senha.
 *
 * Nunca aparece em `toString`, `JSON.stringify` nem `util.inspect` (logs);
 * o valor só sai por `revelar()`, chamado por quem gera ou confere o hash.
 */
export class Senha {
  readonly #valor: string;

  private constructor(valor: string) {
    this.#valor = valor;
  }

  /** Motivo da recusa, ou `null` se a senha tem de 8 a 128 caracteres. */
  static validar(entrada: unknown): MotivoDeCampo | null {
    return analisar(entrada);
  }

  /** Cria a senha ou lança `ErroDeValidacao` no campo `senha`. */
  static criar(entrada: unknown): Senha {
    const motivo = analisar(entrada);
    if (motivo !== null) {
      throw ErroDeValidacao.doCampo('senha', motivo);
    }
    return new Senha(entrada as string);
  }

  revelar(): string {
    return this.#valor;
  }

  toString(): string {
    return OCULTA;
  }

  toJSON(): string {
    return OCULTA;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return OCULTA;
  }
}
