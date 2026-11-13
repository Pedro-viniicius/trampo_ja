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

/**
 * Hora de uma mensagem (ou da última atividade de uma conversa), no fuso do
 * aparelho, relativa a `agora`:
 * - no mesmo dia: `14:32`;
 * - em outro dia do mesmo ano: `20/10 14:32`;
 * - em outro ano: `20/10/2025`.
 *
 * Só aceita instante ISO 8601 com hora; entrada inválida volta como veio.
 */
export function formatarHoraDaMensagem(iso: string, agora: Date): string {
  const instante = INSTANTE_ISO.test(iso)
    ? new Date(iso)
    : new Date(Number.NaN);
  if (Number.isNaN(instante.getTime())) {
    return iso;
  }
  const dia = doisDigitos(instante.getDate());
  const mes = doisDigitos(instante.getMonth() + 1);
  const ano = instante.getFullYear();
  if (ano !== agora.getFullYear()) {
    return `${dia}/${mes}/${ano}`;
  }
  const hora = `${doisDigitos(instante.getHours())}:${doisDigitos(
    instante.getMinutes(),
  )}`;
  const mesmoDia =
    instante.getMonth() === agora.getMonth() &&
    instante.getDate() === agora.getDate();
  return mesmoDia ? hora : `${dia}/${mes} ${hora}`;
}

/**
 * Só a hora (`14:32`) de um instante ISO 8601 com hora, no fuso do aparelho.
 * É a hora da bolha do chat: o dia vem do separador, então a bolha de um dia
 * anterior não repete a data. Entrada inválida volta como veio.
 */
export function formatarHoraCurta(iso: string): string {
  const instante = INSTANTE_ISO.test(iso)
    ? new Date(iso)
    : new Date(Number.NaN);
  if (Number.isNaN(instante.getTime())) {
    return iso;
  }
  return `${doisDigitos(instante.getHours())}:${doisDigitos(
    instante.getMinutes(),
  )}`;
}

/** Meia-noite (no fuso do aparelho) do dia `deslocamento` dias depois de `data`. */
function inicioDoDia(data: Date, deslocamento = 0): number {
  return new Date(
    data.getFullYear(),
    data.getMonth(),
    data.getDate() + deslocamento,
  ).getTime();
}

/**
 * Dia de uma mensagem para o separador do chat, no fuso do aparelho e
 * relativo a `agora`: `rotulos.hoje`, `rotulos.ontem` ou `dd/mm/aaaa`. Só
 * aceita instante ISO 8601 com hora; entrada inválida dá `null` (sem
 * separador).
 */
export function formatarDiaDaMensagem(
  iso: string,
  agora: Date,
  rotulos: { readonly hoje: string; readonly ontem: string },
): string | null {
  const instante = INSTANTE_ISO.test(iso)
    ? new Date(iso).getTime()
    : Number.NaN;
  if (Number.isNaN(instante)) {
    return null;
  }
  if (instante >= inicioDoDia(agora) && instante < inicioDoDia(agora, 1)) {
    return rotulos.hoje;
  }
  if (instante >= inicioDoDia(agora, -1) && instante < inicioDoDia(agora)) {
    return rotulos.ontem;
  }
  return formatarDataHora(iso);
}

/** Rótulo da categoria, ou o próprio id se a lista ainda não o tem. */
export function rotuloDaCategoria(
  categorias: readonly Categoria[] | undefined,
  id: string,
): string {
  return categorias?.find((categoria) => categoria.id === id)?.rotulo ?? id;
}

// Texto do campo de valor: só dígitos, ponto e vírgula depois de tirar "R$".
const CARACTERES_DO_VALOR = /^[\d.,]+$/;
// Ponto como milhar: grupos de exatamente 3 dígitos depois de um primeiro
// grupo de 1 a 3 dígitos que não começa em zero ("1.500", "12.345.678").
const COM_MILHAR = /^[1-9]\d{0,2}(?:\.\d{3})+$/;
const SO_DIGITOS = /^\d+$/;
const DECIMAL_COM_PONTO = /^(\d+)\.(\d{1,2})$/;
const COM_VIRGULA = /^([\d.]+),(\d{1,2})$/;

function centavosDe(reais: string, decimais: string): number {
  const total =
    BigInt(reais.replace(/\./g, '')) * 100n + BigInt(decimais.padEnd(2, '0'));
  const maximo = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(total > maximo ? maximo : total);
}

function reaisValidos(reais: string): boolean {
  return SO_DIGITOS.test(reais) || COM_MILHAR.test(reais);
}

/**
 * Lê o que a pessoa digitou no campo de valor e devolve centavos, ou `null`
 * se o texto não for um valor.
 *
 * - A vírgula é o separador decimal (no máximo 2 casas); antes dela o ponto
 *   só vale como milhar.
 * - Sem vírgula, o ponto é milhar quando separa grupos de 3 dígitos
 *   (`1.500` -> 150000) e decimal nos demais casos (`1.5` -> 150).
 * - Aceita o prefixo `R$`. Sinal, letras, 3 casas (`0,001`) e texto vazio
 *   dão `null`.
 * - Não valida limites: `0` volta como 0 e um número gigante é limitado a
 *   `Number.MAX_SAFE_INTEGER`, para o validador apontar `valor_alto`.
 *
 * Nunca registra nem devolve o texto (CA15).
 */
export function lerValorEmCentavos(texto: string): number | null {
  const limpo = texto.replace(/^\s*R\$/i, '').replace(/\s+/g, '');
  if (limpo === '' || !CARACTERES_DO_VALOR.test(limpo)) {
    return null;
  }

  const comVirgula = COM_VIRGULA.exec(limpo);
  if (comVirgula !== null) {
    const [, reais = '', decimais = ''] = comVirgula;
    return reaisValidos(reais) ? centavosDe(reais, decimais) : null;
  }
  if (limpo.includes(',')) {
    return null;
  }
  if (reaisValidos(limpo)) {
    return centavosDe(limpo, '');
  }
  const comPonto = DECIMAL_COM_PONTO.exec(limpo);
  if (comPonto === null) {
    return null;
  }
  return centavosDe(comPonto[1] ?? '', comPonto[2] ?? '');
}

/**
 * Centavos no formato do campo de valor, sem o `R$`: `150000` -> `1.500,00`.
 * Valor que não é número finito e não negativo volta como texto vazio.
 */
export function centavosParaCampo(centavos: number): string {
  if (!Number.isFinite(centavos) || centavos < 0) {
    return '';
  }
  return formatarCentavos(centavos).replace(/^R\$ /, '');
}

// Prazo: a API aceita anos de 1900 a 9999.
const ANO_MINIMO_DO_PRAZO = 1900;
const DATA_DO_CAMPO = /^(\d{2})\/(\d{2})\/(\d{4})$|^(\d{2})(\d{2})(\d{4})$/;

/**
 * Lê a data do campo (`31/12/2026` ou `31122026`) e devolve `YYYY-MM-DD`, ou
 * `null` se o formato estiver errado, o dia não existir (`31/02/2026`) ou o
 * ano ficar fora de 1900 a 9999. Não exige data futura (a API também não).
 */
export function lerData(texto: string): string | null {
  const partes = DATA_DO_CAMPO.exec(texto.trim());
  if (partes === null) {
    return null;
  }
  const dia = partes[1] ?? partes[4] ?? '';
  const mes = partes[2] ?? partes[5] ?? '';
  const ano = partes[3] ?? partes[6] ?? '';
  if (
    Number(ano) < ANO_MINIMO_DO_PRAZO ||
    !dataExiste(Number(ano), Number(mes), Number(dia))
  ) {
    return null;
  }
  return `${ano}-${mes}-${dia}`;
}

/**
 * Máscara do prazo enquanto a pessoa digita: fica só com os 8 primeiros
 * dígitos e põe as barras de `dd/mm/aaaa` (`3112` -> `31/12`). A barra só
 * entra quando há dígito depois dela, para o apagar não travar nela. Quem
 * valida é `lerData`, na saída do campo e no envio.
 */
export function mascararData(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  const dia = digitos.slice(0, 2);
  const mes = digitos.slice(2, 4);
  const ano = digitos.slice(4);
  return [dia, mes, ano].filter((parte) => parte !== '').join('/');
}

/** `2026-12-31` -> `31/12/2026`, para o campo. Entrada inválida volta vazia. */
export function dataParaCampo(iso: string): string {
  const formatada = formatarData(iso);
  return formatada === iso ? '' : formatada;
}
