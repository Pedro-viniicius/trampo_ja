import {
  type CampoInvalido,
  ErroDeValidacao,
} from '../../../compartilhado/dominio/erros.js';
import {
  contemCaractereNulo,
  normalizarTexto,
} from '../../../compartilhado/dominio/texto.js';

/**
 * Limites de domínio do perfil (plano, "Limites de domínio"; descrição até 300
 * pela spec, tela "Editar perfil").
 */
export const LIMITES_DO_PERFIL = Object.freeze({
  nome: Object.freeze({ min: 2, max: 80 }),
  cidade: Object.freeze({ min: 2, max: 80 }),
  descricao: Object.freeze({ min: 1, max: 300 }),
  habilidades: Object.freeze({ min: 1, max: 10 }),
  habilidade: Object.freeze({ min: 2, max: 30 }),
});

/**
 * Dados como chegam da borda (HTTP): nada é confiável, por isso `unknown`.
 * Ausente (`undefined`, `null` ou texto em branco) vira `obrigatorio`, exceto
 * a descrição, que é opcional.
 */
export interface EntradaDePerfil {
  readonly nome?: unknown;
  readonly cidade?: unknown;
  readonly descricao?: unknown;
  readonly habilidades?: unknown;
}

export interface ContextoDoPerfil {
  readonly contaId: string;
  readonly agora: Date;
}

/** Campos de um perfil já validado (persistência e reconstituição). */
export interface DadosDoPerfil {
  readonly contaId: string;
  readonly nome: string;
  readonly cidade: string;
  readonly cidadeNormalizada: string;
  readonly descricao?: string;
  readonly habilidades: readonly string[];
  readonly atualizadoEm: Date;
}

/**
 * Perfil de uma conta (CA3). Nome, cidade, descrição e habilidades são dado
 * pessoal (plano, "Pontos para o seguranca"): `toJSON` e a inspeção do Node
 * mostram só o id da conta, a completude e a data, para que um log acidental
 * da entidade não vaze nada (CA15). A API monta as respostas campo a campo.
 */
export class Perfil {
  readonly contaId: string;
  readonly nome: string;
  readonly cidade: string;
  readonly cidadeNormalizada: string;
  // `declare`: sem descrição, a propriedade fica ausente (e não `undefined`).
  declare readonly descricao?: string;
  readonly habilidades: readonly string[];
  readonly #atualizadoEm: Date;

  private constructor(dados: DadosDoPerfil) {
    if (typeof dados.contaId !== 'string' || dados.contaId === '') {
      throw new TypeError('Perfil: id da conta vazio');
    }
    if (Number.isNaN(dados.atualizadoEm.getTime())) {
      throw new TypeError('Perfil: data de atualização inválida');
    }
    this.contaId = dados.contaId;
    this.nome = dados.nome;
    this.cidade = dados.cidade;
    this.cidadeNormalizada = dados.cidadeNormalizada;
    if (dados.descricao !== undefined) {
      this.descricao = dados.descricao;
    }
    this.habilidades = Object.freeze([...dados.habilidades]);
    this.#atualizadoEm = new Date(dados.atualizadoEm.getTime());
    Object.freeze(this);
  }

  /**
   * Valida a entrada e cria o perfil. Junta todos os campos inválidos num
   * único `ErroDeValidacao`; o valor informado nunca entra no erro (CA15).
   */
  static criar(
    entrada: EntradaDePerfil | null | undefined,
    contexto: ContextoDoPerfil,
  ): Perfil {
    const dados = entrada ?? {};
    const erros: CampoInvalido[] = [];

    const nome = validarTextoObrigatorio(
      'nome',
      dados.nome,
      LIMITES_DO_PERFIL.nome,
      erros,
    );
    const cidade = validarTextoObrigatorio(
      'cidade',
      dados.cidade,
      LIMITES_DO_PERFIL.cidade,
      erros,
    );
    let cidadeNormalizada: string | undefined;
    if (cidade !== undefined) {
      cidadeNormalizada = normalizarTexto(cidade);
      if (cidadeNormalizada === '') {
        erros.push({ campo: 'cidade', motivo: 'invalido' });
      }
    }
    const descricao = validarDescricao(dados.descricao, erros);
    const habilidades = validarHabilidades(dados.habilidades, erros);

    if (
      erros.length > 0 ||
      nome === undefined ||
      cidade === undefined ||
      cidadeNormalizada === undefined ||
      habilidades === undefined
    ) {
      throw new ErroDeValidacao(erros);
    }

    return new Perfil({
      contaId: contexto.contaId,
      nome,
      cidade,
      cidadeNormalizada,
      ...(descricao !== undefined ? { descricao } : {}),
      habilidades,
      atualizadoEm: contexto.agora,
    });
  }

  /** Reconstrói um perfil já gravado (adaptadores de persistência). */
  static reconstituir(dados: DadosDoPerfil): Perfil {
    return new Perfil(dados);
  }

  /** Devolve uma cópia: quem recebe não altera o perfil. */
  get atualizadoEm(): Date {
    return new Date(this.#atualizadoEm.getTime());
  }

  /**
   * D9: completo = nome, cidade e ao menos uma habilidade. Como `criar` exige
   * os três, todo perfil válido é completo; a regra fica explícita aqui para
   * não depender disso.
   */
  get completo(): boolean {
    return (
      this.nome !== '' && this.cidade !== '' && this.habilidades.length >= 1
    );
  }

  toJSON(): { contaId: string; completo: boolean; atualizadoEm: string } {
    return {
      contaId: this.contaId,
      completo: this.completo,
      atualizadoEm: this.#atualizadoEm.toISOString(),
    };
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `Perfil ${JSON.stringify(this.toJSON())}`;
  }
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

// Conta pontos de código, não unidades UTF-16 (um emoji conta como 1), como o
// `char_length` dos checks da migração.
function tamanhoDe(texto: string): number {
  return Array.from(texto).length;
}

function dentroDe(
  texto: string,
  limites: { readonly min: number; readonly max: number },
): boolean {
  const tamanho = tamanhoDe(texto);
  return tamanho >= limites.min && tamanho <= limites.max;
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
  if (!dentroDe(leitura.texto, limites)) {
    erros.push({ campo, motivo: 'tamanho' });
    return undefined;
  }
  return leitura.texto;
}

/** Opcional: ausente, nula ou em branco significa "sem descrição". */
function validarDescricao(
  valor: unknown,
  erros: CampoInvalido[],
): string | undefined {
  const leitura = lerTexto(valor);
  if (leitura.tipo === 'ausente') {
    return undefined;
  }
  if (leitura.tipo === 'invalido') {
    erros.push({ campo: 'descricao', motivo: 'invalido' });
    return undefined;
  }
  if (!dentroDe(leitura.texto, LIMITES_DO_PERFIL.descricao)) {
    erros.push({ campo: 'descricao', motivo: 'tamanho' });
    return undefined;
  }
  return leitura.texto;
}

/**
 * Lista de 1 a 10 habilidades, cada uma com 2 a 30 caracteres depois de
 * aparada. Duas iguais depois de `normalizarTexto` (ex.: "Pintura" e
 * " pintura ") são duplicadas: a repetida é apontada como `invalido`.
 * Erro de item aponta o índice (`habilidades.2`), nunca o texto.
 */
function validarHabilidades(
  valor: unknown,
  erros: CampoInvalido[],
): readonly string[] | undefined {
  if (valor === undefined || valor === null) {
    erros.push({ campo: 'habilidades', motivo: 'obrigatorio' });
    return undefined;
  }
  if (!Array.isArray(valor)) {
    erros.push({ campo: 'habilidades', motivo: 'invalido' });
    return undefined;
  }
  if (valor.length === 0) {
    erros.push({ campo: 'habilidades', motivo: 'obrigatorio' });
    return undefined;
  }
  if (valor.length > LIMITES_DO_PERFIL.habilidades.max) {
    erros.push({ campo: 'habilidades', motivo: 'tamanho' });
    return undefined;
  }

  const habilidades: string[] = [];
  const vistas = new Set<string>();
  let algumInvalido = false;
  for (const [indice, item] of (valor as unknown[]).entries()) {
    const campo = `habilidades.${indice}`;
    if (typeof item !== 'string' || contemCaractereNulo(item)) {
      erros.push({ campo, motivo: 'invalido' });
      algumInvalido = true;
      continue;
    }
    const texto = item.trim();
    if (!dentroDe(texto, LIMITES_DO_PERFIL.habilidade)) {
      erros.push({ campo, motivo: 'tamanho' });
      algumInvalido = true;
      continue;
    }
    const normalizada = normalizarTexto(texto);
    if (normalizada === '' || vistas.has(normalizada)) {
      erros.push({ campo, motivo: 'invalido' });
      algumInvalido = true;
      continue;
    }
    vistas.add(normalizada);
    habilidades.push(texto);
  }
  return algumInvalido ? undefined : habilidades;
}
