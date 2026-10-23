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

/**
 * Formas do texto a conferir contra um hash gravado, na ordem: a NFC, que é a
 * forma de todo hash novo (`Senha.criar`), e, só se diferente, a crua, que
 * cobre o hash gravado antes da normalização (S8). Assim quem cadastrou com
 * NFD entra digitando NFC e vice-versa. Quem chama confere o teto
 * (`tamanhoDaSenha`) na forma crua antes, e percorre as mesmas formas também
 * contra o hash fictício, para o e-mail inexistente custar o mesmo.
 */
export function formasDaSenha(texto: string): readonly string[] {
  const nfc = texto.normalize('NFC');
  return Object.freeze(nfc === texto ? [nfc] : [nfc, texto]);
}

/**
 * Confere a entrada e devolve o texto em NFC, ou o motivo da recusa. O teto
 * vale para a forma crua, antes de normalizar, para não normalizar um texto
 * enorme; o mínimo vale para a forma NFC, que é a que vira hash (S3): "éééé"
 * em NFD tem 8 pontos de código, mas só 4 em NFC.
 */
function analisar(
  entrada: unknown,
): { readonly motivo: MotivoDeCampo } | { readonly nfc: string } {
  if (entrada === undefined || entrada === null || entrada === '') {
    return { motivo: 'obrigatorio' };
  }
  if (typeof entrada !== 'string') {
    return { motivo: 'invalido' };
  }
  if (tamanhoDaSenha(entrada) > SENHA_TAMANHO_MAXIMO) {
    return { motivo: 'tamanho' };
  }
  const nfc = entrada.normalize('NFC');
  if (tamanhoDaSenha(nfc) < SENHA_TAMANHO_MINIMO) {
    return { motivo: 'tamanho' };
  }
  return { nfc };
}

/**
 * Senha em texto puro, só em memória e só até virar hash. Não é aparada:
 * espaços fazem parte da senha. É guardada em NFC, para o mesmo texto digitado
 * em teclados diferentes (ex.: "é" composto ou "e" + acento) dar o mesmo
 * hash. O teto de 128 é conferido na forma recebida; o mínimo de 8, na NFC.
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
    const analise = analisar(entrada);
    return 'motivo' in analise ? analise.motivo : null;
  }

  /**
   * Cria a senha, normalizada em NFC, ou lança `ErroDeValidacao` no campo
   * `senha`. O teto de 128 vale para o texto recebido, antes de normalizar;
   * o mínimo de 8, para o texto já em NFC.
   */
  static criar(entrada: unknown): Senha {
    const analise = analisar(entrada);
    if ('motivo' in analise) {
      throw ErroDeValidacao.doCampo('senha', analise.motivo);
    }
    return new Senha(analise.nfc);
  }

  /** O texto em NFC, para gerar o hash. */
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
