/**
 * Normaliza texto para comparação e busca (`cidade_normalizada`, `texto_busca`):
 * minúsculas, sem acento, espaços colapsados em um só e aparados nas pontas.
 *
 * Exemplo: `'  São   PAULO '` vira `'sao paulo'`.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verdadeiro se o texto tem o caractere nulo (`\u0000`). O Postgres não guarda
 * esse caractere em `text` nem o aceita como parâmetro de consulta (a query
 * falharia com 500): os leitores de texto livre o recusam com `invalido`.
 */
export function contemCaractereNulo(texto: string): boolean {
  return texto.includes('\u0000');
}
