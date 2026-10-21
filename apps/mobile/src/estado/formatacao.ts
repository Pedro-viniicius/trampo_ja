import type { Categoria } from '../api/tipos';

/**
 * Formatação de exibição (pt-BR) sem `Intl`, que no Hermes pode faltar ou
 * variar por aparelho.
 */

/** `123456` -> `R$ 1.234,56`. Valores em centavos; arredonda se não for inteiro. */
export function formatarCentavos(centavos: number): string {
  if (!Number.isFinite(centavos)) {
    return '—';
  }
  const arredondado = Math.round(Math.abs(centavos));
  // BigInt serve a qualquer valor finito, sem perder precisão no texto.
  const digitos = BigInt(arredondado).toString().padStart(3, '0');
  const reais = digitos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sinal = centavos < 0 && arredondado > 0 ? '-' : '';
  return `${sinal}R$ ${reais},${digitos.slice(-2)}`;
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T/;

function dataExiste(ano: number, mes: number, dia: number): boolean {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

/** `2026-10-20` -> `20/10/2026`. Entrada inválida volta como veio. */
export function formatarData(iso: string): string {
  const partes = DATA_ISO.exec(iso);
  if (partes === null) {
    return iso;
  }
  const [, ano, mes, dia] = partes;
  if (!dataExiste(Number(ano), Number(mes), Number(dia))) {
    return iso;
  }
  return `${dia}/${mes}/${ano}`;
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * `criadoEm` (ISO 8601 com hora) -> `dd/mm/aaaa` no fuso do aparelho, sem hora
 * no MVP. Aceita também `YYYY-MM-DD`. Entrada inválida volta como veio.
 */
export function formatarDataHora(iso: string): string {
  if (DATA_ISO.test(iso)) {
    return formatarData(iso);
  }
  const instante = INSTANTE_ISO.test(iso)
    ? new Date(iso)
    : new Date(Number.NaN);
  if (Number.isNaN(instante.getTime())) {
    return iso;
  }
  return `${doisDigitos(instante.getDate())}/${doisDigitos(
    instante.getMonth() + 1,
  )}/${instante.getFullYear()}`;
}

/** Rótulo da categoria, ou o próprio id se a lista ainda não o tem. */
export function rotuloDaCategoria(
  categorias: readonly Categoria[] | undefined,
  id: string,
): string {
  return categorias?.find((categoria) => categoria.id === id)?.rotulo ?? id;
}
