import { ErroDeValidacao } from '../../../compartilhado/dominio/erros.js';

/** Posição numa das listas, ordenadas por `criadoEm` e `id` decrescentes. */
export interface PosicaoNaLista {
  readonly criadoEm: Date;
  readonly id: string;
}

/**
 * Cursor da busca: guarda a posição de cada lista separadamente, porque a
 * busca junta duas fontes e cada uma avança no seu ritmo. Lista sem posição
 * começa do item mais recente.
 */
export interface CursorDaBusca {
  readonly trampos?: PosicaoNaLista;
  readonly servicos?: PosicaoNaLista;
}

const TAMANHO_MAXIMO_DO_CURSOR = 512;
const TAMANHO_MAXIMO_DO_ID = 100;
const FORMATO_BASE64URL = /^[A-Za-z0-9_-]+$/;
/**
 * Faixa de datas aceita no cursor. Todo item é criado depois de 1970, e fora
 * do ano 1 a 9999 o `timestamptz` do Postgres recusaria o parâmetro (500).
 */
const DATA_MINIMA_DO_CURSOR = Date.UTC(1970, 0, 1);
const DATA_MAXIMA_DO_CURSOR = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

interface PosicaoNoFio {
  c: string;
  id: string;
}

function paraOFio(posicao: PosicaoNaLista): PosicaoNoFio {
  return { c: posicao.criadoEm.toISOString(), id: posicao.id };
}

/** Texto opaco para o cliente: base64url de `{"t":{"c":ISO,"id":…},"s":{…}}`. */
export function codificarCursor(cursor: CursorDaBusca): string {
  const fio: { t?: PosicaoNoFio; s?: PosicaoNoFio } = {};
  if (cursor.trampos) {
    fio.t = paraOFio(cursor.trampos);
  }
  if (cursor.servicos) {
    fio.s = paraOFio(cursor.servicos);
  }
  return Buffer.from(JSON.stringify(fio), 'utf8').toString('base64url');
}

function invalido(): ErroDeValidacao {
  return ErroDeValidacao.doCampo('antesDe', 'invalido');
}

function lerPosicao(bruto: unknown): PosicaoNaLista {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    throw invalido();
  }
  const { c, id, ...resto } = bruto as Record<string, unknown>;
  if (
    Object.keys(resto).length > 0 ||
    typeof c !== 'string' ||
    typeof id !== 'string' ||
    id === '' ||
    id.length > TAMANHO_MAXIMO_DO_ID
  ) {
    throw invalido();
  }
  const criadoEm = new Date(c);
  // Só aceita o formato que `codificarCursor` produz (ISO completo em UTC).
  if (Number.isNaN(criadoEm.getTime()) || criadoEm.toISOString() !== c) {
    throw invalido();
  }
  if (
    criadoEm.getTime() < DATA_MINIMA_DO_CURSOR ||
    criadoEm.getTime() > DATA_MAXIMA_DO_CURSOR
  ) {
    throw invalido();
  }
  return { criadoEm, id };
}

/**
 * Decodifica o cursor recebido do cliente. Qualquer entrada fora do formato
 * (base64 quebrado, JSON inválido, campo extra, data ou id inválido, cursor
 * sem posição nenhuma) vira `ErroDeValidacao` no campo `antesDe`, sem ecoar o
 * valor recebido.
 */
export function decodificarCursor(texto: string): CursorDaBusca {
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
  const { t, s, ...resto } = bruto as Record<string, unknown>;
  if (Object.keys(resto).length > 0 || (t === undefined && s === undefined)) {
    throw invalido();
  }
  return {
    ...(t !== undefined && { trampos: lerPosicao(t) }),
    ...(s !== undefined && { servicos: lerPosicao(s) }),
  };
}
