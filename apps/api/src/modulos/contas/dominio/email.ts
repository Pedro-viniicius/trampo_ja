import {
  ErroDeValidacao,
  type MotivoDeCampo,
} from '../../../compartilhado/dominio/erros.js';

export const EMAIL_TAMANHO_MAXIMO = 254;

// `local@dominio.tld`: sem espaço nem caractere de controle, um único `@` e
// domínio com rótulos não vazios separados por ponto. Cada repetição começa
// num caractere que as classes vizinhas excluem (`@` ou `.`), então não há
// backtracking catastrófico (ReDoS). O tamanho é checado antes do regex.
const FORMATO_EMAIL = /^[^\s@\p{Cc}]+@[^\s@.\p{Cc}]+(?:\.[^\s@.\p{Cc}]+)+$/u;

type Analise =
  | { readonly ok: true; readonly valor: string }
  | { readonly ok: false; readonly motivo: MotivoDeCampo };

function analisar(entrada: unknown): Analise {
  if (entrada === undefined || entrada === null) {
    return { ok: false, motivo: 'obrigatorio' };
  }
  if (typeof entrada !== 'string') {
    return { ok: false, motivo: 'invalido' };
  }
  // Minúsculas depois de aparar: a mudança de caixa pode alterar o tamanho.
  const valor = entrada.trim().toLowerCase();
  if (valor === '') {
    return { ok: false, motivo: 'obrigatorio' };
  }
  if (valor.length > EMAIL_TAMANHO_MAXIMO) {
    return { ok: false, motivo: 'tamanho' };
  }
  if (!FORMATO_EMAIL.test(valor)) {
    return { ok: false, motivo: 'invalido' };
  }
  return { ok: true, valor };
}

/**
 * E-mail da conta, aparado e em minúsculas: `' Maria@Exemplo.COM '` e
 * `'maria@exemplo.com'` são o mesmo e-mail.
 *
 * O erro de validação nunca carrega o valor digitado (CA15).
 */
export class Email {
  readonly valor: string;

  private constructor(valor: string) {
    this.valor = valor;
  }

  /** Motivo da recusa, ou `null` se a entrada é um e-mail válido. */
  static validar(entrada: unknown): MotivoDeCampo | null {
    const analise = analisar(entrada);
    return analise.ok ? null : analise.motivo;
  }

  /** Cria o e-mail normalizado ou lança `ErroDeValidacao` no campo `email`. */
  static criar(entrada: unknown): Email {
    const analise = analisar(entrada);
    if (!analise.ok) {
      throw ErroDeValidacao.doCampo('email', analise.motivo);
    }
    return new Email(analise.valor);
  }

  /**
   * E-mail lido do banco, sem validar de novo: ele foi validado e normalizado
   * por `criar` quando a conta foi gravada. Revalidar faria uma regra de
   * formato mais nova (ou mais estreita) travar a conta antiga, inclusive na
   * exclusão e na exportação. Só para dado já gravado, nunca para entrada.
   */
  static reconstituir(valor: string): Email {
    return new Email(valor);
  }

  igual(outro: Email): boolean {
    return this.valor === outro.valor;
  }
}
