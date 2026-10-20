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

/**
 * Cria um serviço ativo. Junta todos os campos inválidos num único
 * `ErroDeValidacao`; o valor informado nunca entra no erro (CA15).
 */
export function criarServico(
  entrada: EntradaDeServico | null | undefined,
  contexto: ContextoDeCriacao,
): Servico {
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

  return Object.freeze({
    id: contexto.id,
    autorId: contexto.autorId,
    titulo,
    descricao,
    categoria,
    ...(cidade !== undefined && cidadeNormalizada !== undefined
      ? { cidade, cidadeNormalizada }
      : {}),
    textoBusca: normalizarTexto(`${titulo} ${descricao}`),
    precoBaseCentavos,
    status: 'ativo' as const,
    criadoEm: new Date(contexto.agora.getTime()),
  });
}
