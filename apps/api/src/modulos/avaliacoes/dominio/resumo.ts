import { DESTAQUES_POR_PAPEL, type PapelDoAvaliado } from './avaliacao.js';
import type { ContagemDeAvaliacoes } from './portas.js';

/** Quantos destaques, no máximo, entram no resumo de cada papel (CA89). */
export const DESTAQUES_NO_RESUMO = 3;

/** Resumo das avaliações recebidas por uma conta num papel (CA89). */
export interface ResumoDoPapel {
  /** Média das notas com 1 casa; `null` sem avaliação. */
  readonly media: number | null;
  readonly total: number;
  /** Até 3 códigos, do mais frequente ao menos frequente. */
  readonly destaques: readonly string[];
}

/** Resumo de uma conta nos dois papéis (CA89). */
export interface ResumoDeAvaliacoes {
  readonly contaId: string;
  readonly comoFreela: ResumoDoPapel;
  readonly comoContratante: ResumoDoPapel;
}

const SEM_AVALIACAO: ResumoDoPapel = Object.freeze({
  media: null,
  total: 0,
  destaques: Object.freeze([]),
});

/**
 * Média com 1 casa, arredondada para cima no meio (4,25 → 4,3), como o
 * `round(numeric, 1)` do Postgres com notas positivas. A conta é feita em
 * inteiros (`round(soma × 10 / total)`), sem o erro de ponto flutuante de
 * arredondar `soma / total`. Sem avaliação: `null`.
 */
export function mediaComUmaCasa(
  somaDasNotas: number,
  total: number,
): number | null {
  if (total <= 0) {
    return null;
  }
  const decimos = Math.floor((somaDasNotas * 20 + total) / (2 * total));
  return decimos / 10;
}

/**
 * Até 3 destaques mais frequentes do papel. Só entram códigos da lista do
 * papel com contagem positiva; no empate, vale a ordem da lista
 * (`DESTAQUES_POR_PAPEL`), para o resultado não depender do banco.
 */
function destaquesMaisFrequentes(
  papel: PapelDoAvaliado,
  contagem: ContagemDeAvaliacoes,
): readonly string[] {
  const lista = DESTAQUES_POR_PAPEL[papel];
  const quantidades = new Map<string, number>();
  for (const { codigo, quantidade } of contagem.destaques) {
    if (lista.includes(codigo) && quantidade > 0) {
      quantidades.set(codigo, (quantidades.get(codigo) ?? 0) + quantidade);
    }
  }
  return Object.freeze(
    [...quantidades.entries()]
      .sort(
        ([codigoA, a], [codigoB, b]) =>
          b - a || lista.indexOf(codigoA) - lista.indexOf(codigoB),
      )
      .slice(0, DESTAQUES_NO_RESUMO)
      .map(([codigo]) => codigo),
  );
}

function resumirPapel(
  papel: PapelDoAvaliado,
  contagem: ContagemDeAvaliacoes | undefined,
): ResumoDoPapel {
  if (contagem === undefined || contagem.total <= 0) {
    return SEM_AVALIACAO;
  }
  return Object.freeze({
    media: mediaComUmaCasa(contagem.somaDasNotas, contagem.total),
    total: contagem.total,
    destaques: destaquesMaisFrequentes(papel, contagem),
  });
}

/**
 * Um resumo por conta pedida, na ordem pedida (CA89). Conta sem avaliação
 * num papel tem `media` `null`, `total` 0 e nenhum destaque. Contagem de
 * conta que não foi pedida é ignorada.
 */
export function resumirAvaliacoes(
  contaIds: readonly string[],
  contagens: readonly ContagemDeAvaliacoes[],
): readonly ResumoDeAvaliacoes[] {
  const porChave = new Map<string, ContagemDeAvaliacoes>();
  for (const contagem of contagens) {
    porChave.set(`${contagem.contaId}|${contagem.papel}`, contagem);
  }
  return Object.freeze(
    contaIds.map((contaId) =>
      Object.freeze({
        contaId,
        comoFreela: resumirPapel('freela', porChave.get(`${contaId}|freela`)),
        comoContratante: resumirPapel(
          'contratante',
          porChave.get(`${contaId}|contratante`),
        ),
      }),
    ),
  );
}
