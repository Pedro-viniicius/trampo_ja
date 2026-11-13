import { ErroDeValidacao } from '../../../compartilhado/dominio/erros.js';
import { ehUuid } from '../dominio/avaliacao.js';
import type { CursorDeAvaliacoes } from '../dominio/portas.js';

const TAMANHO_MAXIMO_DO_CURSOR = 256;
const FORMATO_BASE64URL = /^[A-Za-z0-9_-]+$/;
/**
 * Faixa de datas aceita no cursor. Toda avaliação é criada depois de 1970, e
 * fora do ano 1 a 9999 o `timestamptz` do Postgres recusaria o parâmetro (500).
 */
const DATA_MINIMA_DO_CURSOR = Date.UTC(1970, 0, 1);
const DATA_MAXIMA_DO_CURSOR = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

/** Texto opaco para o cliente: base64url de `{"c":ISO,"id":uuid}` (CA90). */
export function codificarCursor(cursor: CursorDeAvaliacoes): string {
  const fio = { c: cursor.criadaEm.toISOString(), id: cursor.id };
  return Buffer.from(JSON.stringify(fio), 'utf8').toString('base64url');
}

function invalido(): ErroDeValidacao {
  return ErroDeValidacao.doCampo('antesDe', 'invalido');
}

/**
 * Decodifica o cursor recebido do cliente. Qualquer entrada fora do formato
 * (outro tipo, base64 quebrado, JSON inválido, campo a mais ou a menos, data
 * fora do ISO em UTC ou da faixa, id que não é uuid) vira `ErroDeValidacao`
 * no campo `antesDe`, sem ecoar o valor recebido.
 */
export function decodificarCursor(texto: unknown): CursorDeAvaliacoes {
  if (
    typeof texto !== 'string' ||
    texto.length > TAMANHO_MAXIMO_DO_CURSOR ||
    !FORMATO_BASE64URL.test(texto)
  ) {
    throw invalido();
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(Buffer.from(texto, 'base64url').toString('utf8'));
  } catch {
    throw invalido();
  }
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    throw invalido();
  }
  const { c, id, ...resto } = bruto as Record<string, unknown>;
  if (Object.keys(resto).length > 0 || typeof c !== 'string' || !ehUuid(id)) {
    throw invalido();
  }
  const criadaEm = new Date(c);
  // Só aceita o formato que `codificarCursor` produz (ISO completo em UTC).
  if (Number.isNaN(criadaEm.getTime()) || criadaEm.toISOString() !== c) {
    throw invalido();
  }
  if (
    criadaEm.getTime() < DATA_MINIMA_DO_CURSOR ||
    criadaEm.getTime() > DATA_MAXIMA_DO_CURSOR
  ) {
    throw invalido();
  }
  return Object.freeze({ criadaEm, id: id.toLowerCase() });
}
