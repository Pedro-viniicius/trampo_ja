import {
  ehCategoriaValida,
  type IdCategoria,
} from '../../../compartilhado/dominio/categorias.js';
import {
  type CampoInvalido,
  ErroDeValidacao,
} from '../../../compartilhado/dominio/erros.js';
import {
  contemCaractereNulo,
  normalizarTexto,
} from '../../../compartilhado/dominio/texto.js';

/** Limites de domínio do serviço (plano, "Limites de domínio"). */
export const LIMITES_DO_SERVICO = Object.freeze({
  titulo: Object.freeze({ min: 5, max: 80 }),
  descricao: Object.freeze({ min: 1, max: 2000 }),
  cidade: Object.freeze({ min: 2, max: 80 }),
  // A coluna `preco_base_centavos` é `integer` no Postgres (migração 0003).
  precoBaseCentavosMax: 2_147_483_647,
});

export type StatusDeServico = 'ativo';

/** Serviço ofertado por um freelancer (CA6). Valores em centavos. */
export interface Servico {
  readonly id: string;
  readonly autorId: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly categoria: IdCategoria;
  /** D7: opcional. */
  readonly cidade?: string;
  readonly cidadeNormalizada?: string;
  /** `normalizarTexto(titulo + ' ' + descricao)`, usado na busca por texto. */
  readonly textoBusca: string;
  readonly precoBaseCentavos: number;
  readonly status: StatusDeServico;
  readonly criadoEm: Date;
  /**
   * Trava otimista da edição (D33, ADR-006): 1 na criação e mais 1 a cada
   * edição. Só o autor a vê.
   */
  readonly versao: number;
}

/**
 * Dados como chegam da borda (HTTP): nada é confiável, por isso `unknown`.
 * Ausente (`undefined`, `null` ou texto em branco) vira `obrigatorio`.
 */
export interface EntradaDeServico {
  readonly titulo?: unknown;
  readonly descricao?: unknown;
  readonly categoria?: unknown;
  readonly cidade?: unknown;
  readonly precoBaseCentavos?: unknown;
}

/** Corpo da edição (CA26): os campos da oferta e a `versao` lida pelo app. */
export interface EntradaDeEdicaoDeServico extends EntradaDeServico {
  readonly versao?: unknown;
}

export interface ContextoDeCriacao {
  readonly id: string;
  readonly autorId: string;
  readonly agora: Date;
}

type LeituraDeTexto =
  | { readonly tipo: 'ausente' }
  | { readonly tipo: 'invalido' }
  | { readonly tipo: 'texto'; readonly texto: string };

// Caractere nulo é `invalido`: o Postgres não o guarda em `text`.
function lerTexto(valor: unknown): LeituraDeTexto {
  if (valor === undefined || valor === null) {
    return { tipo: 'ausente' };
  }
  if (typeof valor !== 'string' || contemCaractereNulo(valor)) {
    return { tipo: 'invalido' };
  }
  const texto = valor.trim();
  return texto === '' ? { tipo: 'ausente' } : { tipo: 'texto', texto };
}

// Conta pontos de código, não unidades UTF-16 (um emoji conta como 1).
function tamanhoDe(texto: string): number {
  return Array.from(texto).length;
}

function validarTextoObrigatorio(
  campo: string,
  valor: unknown,
  limites: { readonly min: number; readonly max: number },
  erros: CampoInvalido[],
): string | undefined {
  const leitura = lerTexto(valor);
  if (leitura.tipo === 'ausente') {
    erros.push({ campo, motivo: 'obrigatorio' });
    return undefined;
  }
  if (leitura.tipo === 'invalido') {
    erros.push({ campo, motivo: 'invalido' });
    return undefined;
  }
  const tamanho = tamanhoDe(leitura.texto);
  if (tamanho < limites.min || tamanho > limites.max) {
    erros.push({ campo, motivo: 'tamanho' });
    return undefined;
  }
  return leitura.texto;
}

/** Campos que o autor escolhe, já validados, e os derivados para a busca. */
type CamposDoServico = Pick<
  Servico,
  | 'titulo'
  | 'descricao'
  | 'categoria'
  | 'cidade'
  | 'cidadeNormalizada'
  | 'textoBusca'
  | 'precoBaseCentavos'
>;

/**
 * Valida os campos da oferta (CA6 e D7), a mesma regra na criação e na
 * edição. Junta todos os campos inválidos num único `ErroDeValidacao`; o
 * valor informado nunca entra no erro (CA15).
 */
function lerCamposDoServico(
  entrada: EntradaDeServico | null | undefined,
): CamposDoServico {
  const dados = entrada ?? {};
  const erros: CampoInvalido[] = [];

  const titulo = validarTextoObrigatorio(
    'titulo',
    dados.titulo,
    LIMITES_DO_SERVICO.titulo,
    erros,
  );
  const descricao = validarTextoObrigatorio(
    'descricao',
    dados.descricao,
    LIMITES_DO_SERVICO.descricao,
    erros,
  );

  let categoria: IdCategoria | undefined;
  if (dados.categoria === undefined || dados.categoria === null) {
    erros.push({ campo: 'categoria', motivo: 'obrigatorio' });
  } else if (ehCategoriaValida(dados.categoria)) {
    categoria = dados.categoria;
  } else {
    erros.push({ campo: 'categoria', motivo: 'invalido' });
  }

  let precoBaseCentavos: number | undefined;
  const preco = dados.precoBaseCentavos;
  if (preco === undefined || preco === null) {
    erros.push({ campo: 'precoBaseCentavos', motivo: 'obrigatorio' });
  } else if (
    typeof preco === 'number' &&
    Number.isSafeInteger(preco) &&
    preco > 0 &&
    preco <= LIMITES_DO_SERVICO.precoBaseCentavosMax
  ) {
    precoBaseCentavos = preco;
  } else {
    erros.push({ campo: 'precoBaseCentavos', motivo: 'invalido' });
  }

  // D7: cidade é opcional; ausente ou em branco significa "sem cidade".
  let cidade: string | undefined;
  let cidadeNormalizada: string | undefined;
  const leituraCidade = lerTexto(dados.cidade);
  if (leituraCidade.tipo === 'invalido') {
    erros.push({ campo: 'cidade', motivo: 'invalido' });
  } else if (leituraCidade.tipo === 'texto') {
    const tamanho = tamanhoDe(leituraCidade.texto);
    const normalizada = normalizarTexto(leituraCidade.texto);
    if (
      tamanho < LIMITES_DO_SERVICO.cidade.min ||
      tamanho > LIMITES_DO_SERVICO.cidade.max
    ) {
      erros.push({ campo: 'cidade', motivo: 'tamanho' });
    } else if (normalizada === '') {
      erros.push({ campo: 'cidade', motivo: 'invalido' });
    } else {
      cidade = leituraCidade.texto;
      cidadeNormalizada = normalizada;
    }
  }

  if (
    erros.length > 0 ||
    titulo === undefined ||
    descricao === undefined ||
    categoria === undefined ||
    precoBaseCentavos === undefined
  ) {
    throw new ErroDeValidacao(erros);
  }

  return {
    titulo,
    descricao,
    categoria,
    ...(cidade !== undefined && cidadeNormalizada !== undefined
      ? { cidade, cidadeNormalizada }
      : {}),
    textoBusca: normalizarTexto(`${titulo} ${descricao}`),
    precoBaseCentavos,
  };
}

/**
 * Cria um serviço ativo, na versão 1. Campos inválidos: `ErroDeValidacao`
 * com todos eles (CA6).
 */
export function criarServico(
  entrada: EntradaDeServico | null | undefined,
  contexto: ContextoDeCriacao,
): Servico {
  return Object.freeze({
    id: contexto.id,
    autorId: contexto.autorId,
    ...lerCamposDoServico(entrada),
    status: 'ativo' as const,
    criadoEm: new Date(contexto.agora.getTime()),
    versao: 1,
  });
}

/**
 * Substitui os campos do serviço `atual` pelos da `entrada` (CA26), com a
 * mesma validação de `criarServico`: sem `cidade`, ou com ela nula, o serviço
 * fica sem cidade (D7). Recalcula a cidade normalizada e o texto de busca.
 * Id, autor, status e `criadoEm` não mudam; a `versao` sobe 1, e o
 * repositório só grava se a guardada ainda for a de `atual` (ADR-006).
 * A `versao` da entrada não é lida aqui: a conferência é do caso de uso.
 */
export function editarServico(
  atual: Servico,
  entrada: EntradaDeServico | null | undefined,
): Servico {
  return Object.freeze({
    id: atual.id,
    autorId: atual.autorId,
    ...lerCamposDoServico(entrada),
    status: atual.status,
    criadoEm: new Date(atual.criadoEm.getTime()),
    versao: atual.versao + 1,
  });
}
