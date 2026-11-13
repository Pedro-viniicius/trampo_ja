import {
  type CampoInvalido,
  ErroDeValidacao,
} from '../../../compartilhado/dominio/erros.js';
import { contemCaractereNulo } from '../../../compartilhado/dominio/texto.js';

/** Papel de quem recebe a avaliação no trampo (coluna `papel_do_avaliado`). */
export type PapelDoAvaliado = 'freela' | 'contratante';

export const PAPEIS_DO_AVALIADO: readonly PapelDoAvaliado[] = Object.freeze([
  'freela',
  'contratante',
]);

/**
 * Listas fechadas de destaques por papel do avaliado (plano, "Esquema e
 * contratos"; D59 para o contratante). O app traduz os códigos em `textos`.
 */
export const DESTAQUES_POR_PAPEL: Readonly<
  Record<PapelDoAvaliado, readonly string[]>
> = Object.freeze({
  freela: Object.freeze([
    'pontual',
    'organizado',
    'rapido',
    'educado',
    'proativo',
  ]),
  contratante: Object.freeze([
    'pagamento_em_dia',
    'ambiente_organizado',
    'instrucoes_claras',
    'respeitoso',
    'pontual',
  ]),
});

/** Todos os códigos de destaque, de qualquer papel. */
const TODOS_OS_DESTAQUES: ReadonlySet<string> = new Set(
  PAPEIS_DO_AVALIADO.flatMap((papel) => DESTAQUES_POR_PAPEL[papel]),
);

/** Limites da avaliação (CA88), iguais às checks da migração `0009`. */
export const LIMITES_DA_AVALIACAO = Object.freeze({
  nota: Object.freeze({ min: 1, max: 5 }),
  destaques: Object.freeze({ max: 5 }),
  comentario: Object.freeze({ min: 1, max: 500 }),
});

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verdadeiro se o texto é um `uuid` (em qualquer caixa). Os ids do módulo são
 * `uuid` no banco: um texto fora do formato faria o Postgres recusar o
 * parâmetro (500), então a borda o barra antes.
 */
export function ehUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_UUID.test(valor);
}

/**
 * Avaliação de um trampo encerrado (CA87), imutável (D59): não se edita nem
 * se apaga, só some com a exclusão da conta de um dos dois lados (D25). O
 * `comentario` é dado pessoal (LGPD): nunca vai para log nem para erro.
 */
export interface Avaliacao {
  readonly id: string;
  readonly trampoId: string;
  readonly avaliadorId: string;
  readonly avaliadoId: string;
  readonly papelDoAvaliado: PapelDoAvaliado;
  /** Inteiro de 1 a 5. */
  readonly nota: number;
  /** Códigos da lista de `papelDoAvaliado`, sem repetição, até 5. */
  readonly destaques: readonly string[];
  /** Aparado, com 1 a 500 pontos de código, ou `null`. */
  readonly comentario: string | null;
  readonly criadaEm: Date;
}

/** Corpo de `POST /avaliacoes` como chega da borda, ainda não validado. */
export interface EntradaDeAvaliacao {
  readonly trampoId?: unknown;
  readonly nota?: unknown;
  readonly destaques?: unknown;
  readonly comentario?: unknown;
}

/**
 * Corpo validado no formato (`lerEntradaDeAvaliacao`). Os destaques já são
 * códigos conhecidos, mas ainda não conferidos contra a lista do papel do
 * avaliado, que só se sabe depois de ler o vínculo.
 */
export interface AvaliacaoPedida {
  /** Em minúsculas, como os ids gerados e guardados. */
  readonly trampoId: string;
  readonly nota: number;
  readonly destaques: readonly string[];
  readonly comentario: string | null;
}

export interface ContextoDaAvaliacao {
  readonly id: string;
  readonly avaliadorId: string;
  readonly avaliadoId: string;
  readonly papelDoAvaliado: PapelDoAvaliado;
  readonly agora: Date;
}

function lerTrampoId(bruto: unknown, problemas: CampoInvalido[]): string {
  if (bruto === undefined || bruto === null || bruto === '') {
    problemas.push({ campo: 'trampoId', motivo: 'obrigatorio' });
    return '';
  }
  if (!ehUuid(bruto)) {
    problemas.push({ campo: 'trampoId', motivo: 'invalido' });
    return '';
  }
  return bruto.toLowerCase();
}

function lerNota(bruta: unknown, problemas: CampoInvalido[]): number {
  if (bruta === undefined || bruta === null) {
    problemas.push({ campo: 'nota', motivo: 'obrigatorio' });
    return 0;
  }
  if (
    typeof bruta !== 'number' ||
    !Number.isInteger(bruta) ||
    bruta < LIMITES_DA_AVALIACAO.nota.min ||
    bruta > LIMITES_DA_AVALIACAO.nota.max
  ) {
    problemas.push({ campo: 'nota', motivo: 'invalido' });
    return 0;
  }
  return bruta;
}

/**
 * Destaques opcionais: ausente ou nulo vale lista vazia. Fora de lista, item
 * que não é código conhecido ou repetido → `invalido`; mais de 5 → `tamanho`.
 */
function lerDestaques(
  brutos: unknown,
  problemas: CampoInvalido[],
): readonly string[] {
  if (brutos === undefined || brutos === null) {
    return [];
  }
  if (!Array.isArray(brutos)) {
    problemas.push({ campo: 'destaques', motivo: 'invalido' });
    return [];
  }
  const conhecidos = brutos.every(
    (item): item is string =>
      typeof item === 'string' && TODOS_OS_DESTAQUES.has(item),
  );
  if (!conhecidos || new Set(brutos).size !== brutos.length) {
    problemas.push({ campo: 'destaques', motivo: 'invalido' });
    return [];
  }
  if (brutos.length > LIMITES_DA_AVALIACAO.destaques.max) {
    problemas.push({ campo: 'destaques', motivo: 'tamanho' });
    return [];
  }
  return Object.freeze([...brutos]);
}

/**
 * Comentário opcional: ausente, nulo ou só espaços vale `null`. Outro tipo ou
 * caractere nulo → `invalido`; acima de 500 pontos de código depois de
 * aparado → `tamanho` (conta como o `char_length` da check da tabela).
 */
function lerComentario(
  bruto: unknown,
  problemas: CampoInvalido[],
): string | null {
  if (bruto === undefined || bruto === null) {
    return null;
  }
  if (typeof bruto !== 'string' || contemCaractereNulo(bruto)) {
    problemas.push({ campo: 'comentario', motivo: 'invalido' });
    return null;
  }
  const aparado = bruto.trim();
  if (aparado === '') {
    return null;
  }
  const tamanho = Array.from(aparado).length;
  if (
    tamanho < LIMITES_DA_AVALIACAO.comentario.min ||
    tamanho > LIMITES_DA_AVALIACAO.comentario.max
  ) {
    problemas.push({ campo: 'comentario', motivo: 'tamanho' });
    return null;
  }
  return aparado;
}

/**
 * CA88, primeira parte: valida o formato do corpo antes de qualquer leitura,
 * para o 400 não revelar nada sobre o trampo. Junta todos os campos inválidos
 * num só `ErroDeValidacao`, que leva só o nome do campo e o motivo, nunca o
 * valor recebido.
 */
export function lerEntradaDeAvaliacao(
  entrada: EntradaDeAvaliacao,
): AvaliacaoPedida {
  const problemas: CampoInvalido[] = [];
  const trampoId = lerTrampoId(entrada.trampoId, problemas);
  const nota = lerNota(entrada.nota, problemas);
  const destaques = lerDestaques(entrada.destaques, problemas);
  const comentario = lerComentario(entrada.comentario, problemas);
  if (problemas.length > 0) {
    throw new ErroDeValidacao(problemas);
  }
  return Object.freeze({ trampoId, nota, destaques, comentario });
}

/**
 * CA88, segunda parte: cria a avaliação já sabendo o papel do avaliado. Um
 * destaque que não é da lista desse papel → `destaques` `invalido`. Só chega
 * aqui quem é parte do trampo, que já sabe o papel do outro lado.
 */
export function criarAvaliacao(
  pedida: AvaliacaoPedida,
  contexto: ContextoDaAvaliacao,
): Avaliacao {
  const permitidos = DESTAQUES_POR_PAPEL[contexto.papelDoAvaliado];
  if (!pedida.destaques.every((destaque) => permitidos.includes(destaque))) {
    throw ErroDeValidacao.doCampo('destaques', 'invalido');
  }
  return Object.freeze({
    id: contexto.id,
    trampoId: pedida.trampoId,
    avaliadorId: contexto.avaliadorId,
    avaliadoId: contexto.avaliadoId,
    papelDoAvaliado: contexto.papelDoAvaliado,
    nota: pedida.nota,
    destaques: Object.freeze([...pedida.destaques]),
    comentario: pedida.comentario,
    criadaEm: new Date(contexto.agora.getTime()),
  });
}
