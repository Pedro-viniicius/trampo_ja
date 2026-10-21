import type { EntradaDePerfil } from '../api/tipos';
import type { ChaveDeErro } from '../textos/pt-BR';

/**
 * Validação local dos formulários. Funções puras que espelham os limites da
 * API (`perfil.ts`, `email.ts` e `senha.ts` do backend) para o erro aparecer
 * antes do envio. A API continua sendo a autoridade: o que passar aqui ainda
 * pode voltar recusado.
 *
 * Só devolvem chaves de `textos.erros`; o valor digitado nunca entra na
 * resposta (CA15).
 */
export const LIMITES = Object.freeze({
  email: Object.freeze({ max: 254 }),
  senha: Object.freeze({ min: 8, max: 128 }),
  nome: Object.freeze({ min: 2, max: 80 }),
  cidade: Object.freeze({ min: 2, max: 80 }),
  descricao: Object.freeze({ max: 300 }),
  habilidades: Object.freeze({ min: 1, max: 10 }),
  habilidade: Object.freeze({ min: 2, max: 30 }),
});

export type CampoDoPerfil = 'nome' | 'cidade' | 'descricao' | 'habilidades';

// Mesmo critério da API: um único `@`, domínio com rótulos não vazios
// separados por ponto, sem espaço nem caractere de controle. Sem
// backtracking catastrófico: o tamanho é checado antes do regex.
const FORMATO_EMAIL = /^[^\s@\p{Cc}]+@[^\s@.\p{Cc}]+(?:\.[^\s@.\p{Cc}]+)+$/u;

/** Conta pontos de código, não unidades UTF-16 (um emoji conta como 1). */
function tamanhoDe(texto: string): number {
  return Array.from(texto).length;
}

function dentroDe(
  tamanho: number,
  limites: { readonly min: number; readonly max: number },
): boolean {
  return tamanho >= limites.min && tamanho <= limites.max;
}

/** O caractere nulo não é guardado pelo banco da API (ela o recusa). */
function temCaractereNulo(texto: string): boolean {
  return texto.includes('\u0000');
}

/**
 * Minúsculas, sem acento, espaços colapsados e aparados. Igual ao
 * `normalizarTexto` da API: `'  Pintura   Ç '` vira `'pintura c'`.
 */
export function normalizarHabilidade(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** E-mail aparado e em minúsculas, como a API o lê. `null` = válido. */
export function validarEmail(valor: string): ChaveDeErro | null {
  const email = valor.trim().toLowerCase();
  if (email === '' || email.length > LIMITES.email.max) {
    return 'email_invalido';
  }
  return FORMATO_EMAIL.test(email) ? null : 'email_invalido';
}

/**
 * Senha de 8 a 128 pontos de código. Não é aparada: espaços fazem parte da
 * senha. Acima do dobro do teto (cada ponto ocupa 1 ou 2 unidades) recusa sem
 * percorrer o texto. `null` = válida.
 */
export function validarSenha(valor: string): ChaveDeErro | null {
  if (valor.length > LIMITES.senha.max * 2) {
    return 'senha_curta';
  }
  return dentroDe(tamanhoDe(valor), LIMITES.senha) ? null : 'senha_curta';
}

function validarTextoObrigatorio(
  valor: string,
  limites: { readonly min: number; readonly max: number },
  obrigatorio: ChaveDeErro,
  tamanho: ChaveDeErro,
): ChaveDeErro | null {
  const texto = valor.trim();
  if (texto === '') {
    return obrigatorio;
  }
  if (temCaractereNulo(texto) || !dentroDe(tamanhoDe(texto), limites)) {
    return tamanho;
  }
  return null;
}

function validarDescricao(
  valor: string | null | undefined,
): ChaveDeErro | null {
  const texto = (valor ?? '').trim();
  if (texto === '') {
    return null;
  }
  if (temCaractereNulo(texto) || tamanhoDe(texto) > LIMITES.descricao.max) {
    return 'descricao_tamanho';
  }
  return null;
}

function validarHabilidades(
  valor: readonly string[] | null | undefined,
): ChaveDeErro | null {
  if (valor === undefined || valor === null || valor.length === 0) {
    return 'habilidade_obrigatoria';
  }
  if (valor.length > LIMITES.habilidades.max) {
    return 'habilidades_demais';
  }
  const vistas = new Set<string>();
  for (const item of valor) {
    const texto = item.trim();
    if (
      temCaractereNulo(texto) ||
      !dentroDe(tamanhoDe(texto), LIMITES.habilidade)
    ) {
      return 'habilidade_tamanho';
    }
    const normalizada = normalizarHabilidade(texto);
    if (normalizada === '' || vistas.has(normalizada)) {
      return 'habilidade_invalida';
    }
    vistas.add(normalizada);
  }
  return null;
}

/**
 * Valida o perfil inteiro. Devolve um objeto vazio quando está válido; senão,
 * uma chave por campo com problema. Em `habilidades` aparece o primeiro
 * problema encontrado (lista vazia ou grande demais antes dos itens).
 */
export function validarPerfil(
  entrada: EntradaDePerfil,
): Partial<Record<CampoDoPerfil, ChaveDeErro>> {
  const erros: Partial<Record<CampoDoPerfil, ChaveDeErro>> = {};

  const nome = validarTextoObrigatorio(
    entrada.nome,
    LIMITES.nome,
    'nome_obrigatorio',
    'nome_tamanho',
  );
  if (nome !== null) {
    erros.nome = nome;
  }

  let cidade = validarTextoObrigatorio(
    entrada.cidade,
    LIMITES.cidade,
    'cidade_obrigatoria',
    'cidade_tamanho',
  );
  // Como a API: cidade só de marcas combinantes some ao normalizar.
  if (cidade === null && normalizarHabilidade(entrada.cidade) === '') {
    cidade = 'cidade_tamanho';
  }
  if (cidade !== null) {
    erros.cidade = cidade;
  }

  const descricao = validarDescricao(entrada.descricao);
  if (descricao !== null) {
    erros.descricao = descricao;
  }

  const habilidades = validarHabilidades(entrada.habilidades);
  if (habilidades !== null) {
    erros.habilidades = habilidades;
  }

  return erros;
}
