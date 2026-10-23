import { randomUUID } from 'node:crypto';
import {
  ehCategoriaValida,
  type IdCategoria,
} from '../../../compartilhado/dominio/categorias.js';
import {
  type CampoInvalido,
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../compartilhado/dominio/erros.js';
import type { Relogio } from '../../../compartilhado/dominio/relogio.js';
import { normalizarTexto } from '../../../compartilhado/dominio/texto.js';
import {
  type Candidatura,
  copiarCandidatura,
  criarCandidatura,
  type EntradaDeCandidatura,
  lerTexto,
  lerValorEmCentavos,
} from './candidatura.js';

/** `encerrado` é estado final (D34): não reabre, não é editado nem excluído. */
export type StatusDoTrampo = 'aberto' | 'em_andamento' | 'encerrado';

export const TITULO_TAMANHO = Object.freeze({ min: 5, max: 80 });
export const DESCRICAO_TAMANHO = Object.freeze({ min: 1, max: 2000 });
export const CIDADE_TAMANHO = Object.freeze({ min: 2, max: 80 });

/** Entrada ainda não validada (vem do corpo da requisição). */
export interface EntradaDeTrampo {
  readonly titulo?: unknown;
  readonly descricao?: unknown;
  readonly categoria?: unknown;
  readonly cidade?: unknown;
  readonly valorCentavos?: unknown;
  /** Opcional, no formato `YYYY-MM-DD`. */
  readonly prazo?: unknown;
}

/** Estado completo do agregado, usado para reconstituir e para persistir. */
export interface DadosDoTrampo {
  readonly id: string;
  readonly autorId: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly categoria: IdCategoria;
  readonly cidade: string;
  readonly cidadeNormalizada: string;
  readonly textoBusca: string;
  readonly valorCentavos: number;
  /** `YYYY-MM-DD` ou `null`. */
  readonly prazo: string | null;
  readonly status: StatusDoTrampo;
  /** Trava otimista: começa em 1 e sobe a cada mudança gravada. */
  readonly versao: number;
  readonly criadoEm: Date;
  readonly candidaturas: readonly Candidatura[];
}

/** Visão de leitura do trampo, sem as candidaturas (usada em busca e listas). */
export type TrampoResumo = Omit<DadosDoTrampo, 'candidaturas' | 'versao'>;

/**
 * Visão do autor (D33): o resumo com a `versao`, que o app manda de volta na
 * edição, e a contagem de candidaturas em qualquer estado. Só sai para quem
 * publicou: pela versão, um terceiro deduziria quantas candidaturas houve.
 */
export type TrampoDoAutor = TrampoResumo & {
  readonly versao: number;
  readonly candidaturasRecebidas: number;
};

/** Campos que o autor escolhe ao publicar e ao editar, já validados. */
export interface CamposDoTrampo {
  readonly titulo: string;
  readonly descricao: string;
  readonly categoria: IdCategoria;
  readonly cidade: string;
  readonly valorCentavos: number;
  /** `YYYY-MM-DD` ou `null`. */
  readonly prazo: string | null;
}

/**
 * O que uma operação mudou nas linhas de candidatura (ADR-006): o
 * repositório insere só as `inseridas` e apaga só as `removidas`. Assim uma
 * candidatura apagada por outra transação (retirada ou exclusão de conta)
 * nunca volta numa gravação que a tinha lido.
 */
export interface AlteracoesDasCandidaturas {
  readonly inseridas: readonly Candidatura[];
  /** Ids das candidaturas lidas que a operação tirou do agregado. */
  readonly removidas: readonly string[];
}

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };

const FORMATO_PRAZO = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Faixa de anos aceita no prazo. O formato já limita a 9999; o piso evita
 * datas que o Postgres recusa (o ano 0000 não existe no `date`) e que não
 * fazem sentido como prazo.
 */
export const PRAZO_ANO = Object.freeze({ min: 1900, max: 9999 });

function prazoValido(bruto: unknown): string | null | undefined {
  if (bruto === undefined || bruto === null) {
    return null;
  }
  if (typeof bruto !== 'string' || !FORMATO_PRAZO.test(bruto)) {
    return undefined;
  }
  const data = new Date(`${bruto}T00:00:00.000Z`);
  if (
    Number.isNaN(data.getTime()) ||
    data.toISOString().slice(0, 10) !== bruto
  ) {
    return undefined;
  }
  const ano = data.getUTCFullYear();
  if (ano < PRAZO_ANO.min || ano > PRAZO_ANO.max) {
    return undefined;
  }
  return bruto;
}

/**
 * Valida os campos do trampo, para publicar (CA4) e para editar (CA25). Junta
 * todos os campos inválidos num único `ErroDeValidacao` (CA5); o erro nunca
 * carrega o valor informado. `prazo` ausente ou `null` é "sem prazo".
 */
export function lerCamposDoTrampo(entrada: EntradaDeTrampo): CamposDoTrampo {
  const problemas: CampoInvalido[] = [];

  const titulo = lerTexto(
    entrada.titulo,
    TITULO_TAMANHO.min,
    TITULO_TAMANHO.max,
  );
  if (!titulo.ok) {
    problemas.push({ campo: 'titulo', motivo: titulo.motivo });
  }
  const descricao = lerTexto(
    entrada.descricao,
    DESCRICAO_TAMANHO.min,
    DESCRICAO_TAMANHO.max,
  );
  if (!descricao.ok) {
    problemas.push({ campo: 'descricao', motivo: descricao.motivo });
  }

  let categoria: IdCategoria | undefined;
  if (entrada.categoria === undefined || entrada.categoria === null) {
    problemas.push({ campo: 'categoria', motivo: 'obrigatorio' });
  } else if (ehCategoriaValida(entrada.categoria)) {
    categoria = entrada.categoria;
  } else {
    problemas.push({ campo: 'categoria', motivo: 'invalido' });
  }

  const cidade = lerTexto(
    entrada.cidade,
    CIDADE_TAMANHO.min,
    CIDADE_TAMANHO.max,
  );
  if (!cidade.ok) {
    problemas.push({ campo: 'cidade', motivo: cidade.motivo });
  }

  const valor = lerValorEmCentavos(entrada.valorCentavos);
  if (!valor.ok) {
    problemas.push({ campo: 'valorCentavos', motivo: valor.motivo });
  }

  const prazo = prazoValido(entrada.prazo);
  if (prazo === undefined) {
    problemas.push({ campo: 'prazo', motivo: 'invalido' });
  }

  if (
    !titulo.ok ||
    !descricao.ok ||
    categoria === undefined ||
    !cidade.ok ||
    !valor.ok ||
    prazo === undefined
  ) {
    throw new ErroDeValidacao(problemas);
  }
  return {
    titulo: titulo.valor,
    descricao: descricao.valor,
    categoria,
    cidade: cidade.valor,
    valorCentavos: valor.valor,
    prazo,
  };
}

/** Colunas derivadas que a busca usa, recalculadas a cada publicação ou edição. */
function camposDeBusca(
  campos: CamposDoTrampo,
): Pick<DadosDoTrampo, 'cidadeNormalizada' | 'textoBusca'> {
  return {
    cidadeNormalizada: normalizarTexto(campos.cidade),
    textoBusca: normalizarTexto(`${campos.titulo} ${campos.descricao}`),
  };
}

/**
 * Agregado `Trampo`: a vaga publicada por um empregador com as suas
 * candidaturas. As regras do CA9, CA10 e CA11 e as da L2 (CA25, CA27 a CA29)
 * são invariantes dele.
 */
export class Trampo {
  readonly #dados: Mutavel<DadosDoTrampo>;
  /** Ids das candidaturas como foram lidas, base de `alteracoesDasCandidaturas`. */
  readonly #idsLidos: ReadonlySet<string>;

  private constructor(
    dados: Mutavel<DadosDoTrampo>,
    idsLidos: ReadonlySet<string>,
  ) {
    this.#dados = dados;
    this.#idsLidos = idsLidos;
  }

  /**
   * Cria um trampo aberto (CA4), com os campos validados por
   * `lerCamposDoTrampo` (CA5).
   */
  static criar(
    autorId: string,
    entrada: EntradaDeTrampo,
    relogio: Relogio,
  ): Trampo {
    const campos = lerCamposDoTrampo(entrada);
    return new Trampo(
      {
        id: randomUUID(),
        autorId,
        ...campos,
        ...camposDeBusca(campos),
        status: 'aberto',
        versao: 1,
        criadoEm: relogio.agora(),
        candidaturas: [],
      },
      new Set(),
    );
  }

  /** Reconstitui o agregado a partir do que o repositório guardou (sem revalidar). */
  static reconstituir(dados: DadosDoTrampo): Trampo {
    return new Trampo(
      {
        ...dados,
        criadoEm: new Date(dados.criadoEm.getTime()),
        candidaturas: dados.candidaturas.map(copiarCandidatura),
      },
      new Set(dados.candidaturas.map((c) => c.id)),
    );
  }

  get id(): string {
    return this.#dados.id;
  }

  get autorId(): string {
    return this.#dados.autorId;
  }

  get status(): StatusDoTrampo {
    return this.#dados.status;
  }

  get versao(): number {
    return this.#dados.versao;
  }

  /** Candidaturas, em ordem de envio. Devolve cópias. */
  get candidaturas(): readonly Candidatura[] {
    return this.#dados.candidaturas.map(copiarCandidatura);
  }

  /** Cópia do estado completo, para o repositório persistir. */
  dados(): DadosDoTrampo {
    return {
      ...this.#dados,
      criadoEm: new Date(this.#dados.criadoEm.getTime()),
      candidaturas: this.candidaturas,
    };
  }

  /** Visão de leitura sem candidaturas nem versão. */
  resumo(): TrampoResumo {
    const {
      candidaturas: _candidaturas,
      versao: _versao,
      ...resto
    } = this.dados();
    return resto;
  }

  /** Visão do autor: o resumo com a versão e a contagem de candidaturas (D33). */
  resumoDoAutor(): TrampoDoAutor {
    return {
      ...this.resumo(),
      versao: this.#dados.versao,
      candidaturasRecebidas: this.#dados.candidaturas.length,
    };
  }

  /**
   * Candidaturas que esta instância criou (não estavam na leitura) e ids das
   * lidas que ela tirou. Um trampo recém-criado não tem lidas.
   */
  alteracoesDasCandidaturas(): AlteracoesDasCandidaturas {
    const atuais = new Set(this.#dados.candidaturas.map((c) => c.id));
    return {
      inseridas: this.#dados.candidaturas
        .filter((c) => !this.#idsLidos.has(c.id))
        .map(copiarCandidatura),
      removidas: [...this.#idsLidos].filter((id) => !atuais.has(id)),
    };
  }

  /**
   * Registra a candidatura de um freelancer (CA8). Recusa, nesta ordem:
   * campos inválidos (`ErroDeValidacao`), o próprio autor, o mesmo freelancer
   * de novo em qualquer estado (CA9) e trampo que não está aberto (CA11).
   * A duplicada vem antes da checagem de status: quem foi recusado depois de
   * um aceite recebe `candidatura_duplicada`, não `trampo_nao_aberto`.
   */
  candidatar(
    freelancerId: string,
    entrada: EntradaDeCandidatura,
    relogio: Relogio,
  ): Candidatura {
    const candidatura = criarCandidatura(
      this.#dados.id,
      freelancerId,
      entrada,
      relogio,
    );
    if (freelancerId === this.#dados.autorId) {
      throw new ErroDeRegra('autor_nao_pode_candidatar');
    }
    if (this.#dados.candidaturas.some((c) => c.freelancerId === freelancerId)) {
      throw new ErroDeRegra('candidatura_duplicada');
    }
    if (this.#dados.status !== 'aberto') {
      throw new ErroDeRegra('trampo_nao_aberto');
    }
    this.#dados.candidaturas = [...this.#dados.candidaturas, candidatura];
    this.#dados.versao += 1;
    return copiarCandidatura(candidatura);
  }

  /**
   * Aceita uma candidatura (CA10): o trampo passa a `em_andamento`, a escolhida
   * a `aceita` e as demais pendentes a `recusada`. Só o autor pode; quem não é
   * o autor recebe `ErroNaoEncontrado`, para não confirmar que o trampo existe.
   */
  aceitar(candidaturaId: string, quem: string): void {
    if (quem !== this.#dados.autorId) {
      throw new ErroNaoEncontrado();
    }
    if (this.#dados.status !== 'aberto') {
      throw new ErroDeRegra('trampo_nao_aberto');
    }
    const escolhida = this.#dados.candidaturas.find(
      (c) => c.id === candidaturaId,
    );
    if (!escolhida) {
      throw new ErroNaoEncontrado();
    }
    if (escolhida.status !== 'pendente') {
      throw new ErroDeRegra('candidatura_nao_pendente');
    }
    this.#dados.candidaturas = this.#dados.candidaturas.map((c) => {
      if (c.id === candidaturaId) {
        return { ...c, status: 'aceita' as const };
      }
      return c.status === 'pendente'
        ? { ...c, status: 'recusada' as const }
        : c;
    });
    this.#dados.status = 'em_andamento';
    this.#dados.versao += 1;
  }

  /**
   * CA25: o autor substitui todos os campos. Ordem das checagens (plano,
   * "Decisão"): quem não é o autor recebe `ErroNaoEncontrado`; trampo que não
   * está aberto ou que já tem candidatura, `trampo_nao_editavel`; versão lida
   * diferente da atual, `conflito_de_versao`; e só então os campos (CA5).
   * `criadoEm` não muda (a posição na busca fica); as colunas de busca são
   * recalculadas.
   */
  editar(quem: string, versaoLida: number, entrada: EntradaDeTrampo): void {
    if (quem !== this.#dados.autorId) {
      throw new ErroNaoEncontrado();
    }
    if (
      this.#dados.status !== 'aberto' ||
      this.#dados.candidaturas.length > 0
    ) {
      throw new ErroDeRegra('trampo_nao_editavel');
    }
    if (versaoLida !== this.#dados.versao) {
      throw new ErroDeRegra('conflito_de_versao');
    }
    const campos = lerCamposDoTrampo(entrada);
    Object.assign(this.#dados, campos, camposDeBusca(campos));
    this.#dados.versao += 1;
  }

  /**
   * CA27: trampo aberto ou em andamento passa a `encerrado` e as candidaturas
   * pendentes viram recusadas (a aceita fica). Devolve `false`, sem mudar
   * nada, se já estava encerrado (D34). Quem não é o autor recebe
   * `ErroNaoEncontrado`.
   */
  encerrar(quem: string): boolean {
    if (quem !== this.#dados.autorId) {
      throw new ErroNaoEncontrado();
    }
    if (this.#dados.status === 'encerrado') {
      return false;
    }
    this.#dados.candidaturas = this.#dados.candidaturas.map((c) =>
      c.status === 'pendente' ? { ...c, status: 'recusada' as const } : c,
    );
    this.#dados.status = 'encerrado';
    this.#dados.versao += 1;
    return true;
  }

  /**
   * CA28: confere se o trampo pode ser excluído, sem mudá-lo (a exclusão é do
   * repositório). Quem não é o autor recebe `ErroNaoEncontrado`; trampo que
   * não está aberto, `trampo_nao_aberto`.
   */
  conferirExclusao(quem: string): void {
    if (quem !== this.#dados.autorId) {
      throw new ErroNaoEncontrado();
    }
    if (this.#dados.status !== 'aberto') {
      throw new ErroDeRegra('trampo_nao_aberto');
    }
  }

  /**
   * CA29: o freelancer retira a própria candidatura pendente, que sai do
   * agregado (e a linha é apagada). Candidatura inexistente ou de outra conta
   * dá `ErroNaoEncontrado`; aceita ou recusada, `candidatura_nao_pendente`.
   */
  retirar(candidaturaId: string, quem: string): void {
    const alvo = this.#dados.candidaturas.find((c) => c.id === candidaturaId);
    if (!alvo || alvo.freelancerId !== quem) {
      throw new ErroNaoEncontrado();
    }
    if (alvo.status !== 'pendente') {
      throw new ErroDeRegra('candidatura_nao_pendente');
    }
    this.#dados.candidaturas = this.#dados.candidaturas.filter(
      (c) => c.id !== candidaturaId,
    );
    this.#dados.versao += 1;
  }
}
