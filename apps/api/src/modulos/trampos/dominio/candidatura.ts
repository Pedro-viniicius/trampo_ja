import { randomUUID } from 'node:crypto';
import {
  type CampoInvalido,
  ErroDeValidacao,
  type MotivoDeCampo,
} from '../../../compartilhado/dominio/erros.js';
import type { Relogio } from '../../../compartilhado/dominio/relogio.js';
import { contemCaractereNulo } from '../../../compartilhado/dominio/texto.js';

export type StatusDaCandidatura = 'pendente' | 'aceita' | 'recusada';

/** Interesse de um freelancer num trampo. Parte do agregado `Trampo`. */
export interface Candidatura {
  readonly id: string;
  readonly trampoId: string;
  readonly freelancerId: string;
  /** Texto livre do freelancer, já aparado (dado pessoal: nunca vai para log). */
  readonly mensagem: string;
  readonly valorPropostoCentavos: number;
  readonly status: StatusDaCandidatura;
  readonly criadaEm: Date;
}

/** Entrada ainda não validada (vem do corpo da requisição). */
export interface EntradaDeCandidatura {
  readonly mensagem?: unknown;
  readonly valorPropostoCentavos?: unknown;
}

export const MENSAGEM_TAMANHO = Object.freeze({ min: 1, max: 2000 });
/** Teto do `integer` do Postgres: acima disso a gravação falharia com erro de banco. */
export const VALOR_MAXIMO_CENTAVOS = 2_147_483_647;

export type Leitura<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly motivo: MotivoDeCampo };

function contarCaracteres(texto: string): number {
  // Conta pontos de código, como o `char_length` do Postgres.
  return Array.from(texto).length;
}

/**
 * Lê um texto obrigatório: apara as pontas e confere o tamanho.
 * Ausente ou só espaços é `obrigatorio`; fora do tamanho é `tamanho`; outro
 * tipo ou caractere nulo (que o Postgres recusa) é `invalido`.
 */
export function lerTexto(
  bruto: unknown,
  min: number,
  max: number,
): Leitura<string> {
  if (bruto === undefined || bruto === null) {
    return { ok: false, motivo: 'obrigatorio' };
  }
  if (typeof bruto !== 'string' || contemCaractereNulo(bruto)) {
    return { ok: false, motivo: 'invalido' };
  }
  const valor = bruto.trim();
  if (valor === '') {
    return { ok: false, motivo: 'obrigatorio' };
  }
  const tamanho = contarCaracteres(valor);
  if (tamanho < min || tamanho > max) {
    return { ok: false, motivo: 'tamanho' };
  }
  return { ok: true, valor };
}

/** Lê um valor em centavos: inteiro maior que zero e dentro do `integer` do banco. */
export function lerValorEmCentavos(bruto: unknown): Leitura<number> {
  if (bruto === undefined || bruto === null) {
    return { ok: false, motivo: 'obrigatorio' };
  }
  if (
    typeof bruto !== 'number' ||
    !Number.isSafeInteger(bruto) ||
    bruto <= 0 ||
    bruto > VALOR_MAXIMO_CENTAVOS
  ) {
    return { ok: false, motivo: 'invalido' };
  }
  return { ok: true, valor: bruto };
}

/**
 * Valida os campos da candidatura e junta todos os problemas num único erro.
 * O erro nunca carrega o valor informado (CA15).
 */
export function criarCandidatura(
  trampoId: string,
  freelancerId: string,
  entrada: EntradaDeCandidatura,
  relogio: Relogio,
): Candidatura {
  const problemas: CampoInvalido[] = [];
  const mensagem = lerTexto(
    entrada.mensagem,
    MENSAGEM_TAMANHO.min,
    MENSAGEM_TAMANHO.max,
  );
  if (!mensagem.ok) {
    problemas.push({ campo: 'mensagem', motivo: mensagem.motivo });
  }
  const valor = lerValorEmCentavos(entrada.valorPropostoCentavos);
  if (!valor.ok) {
    problemas.push({ campo: 'valorPropostoCentavos', motivo: valor.motivo });
  }
  if (!mensagem.ok || !valor.ok) {
    throw new ErroDeValidacao(problemas);
  }
  return {
    id: randomUUID(),
    trampoId,
    freelancerId,
    mensagem: mensagem.valor,
    valorPropostoCentavos: valor.valor,
    status: 'pendente',
    criadaEm: relogio.agora(),
  };
}

/** Cópia independente (a data é mutável, então também é copiada). */
export function copiarCandidatura(candidatura: Candidatura): Candidatura {
  return { ...candidatura, criadaEm: new Date(candidatura.criadaEm.getTime()) };
}
