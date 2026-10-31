import { ehCategoriaValida } from '../../../compartilhado/dominio/categorias.js';
import {
  type CampoInvalido,
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../compartilhado/dominio/erros.js';
import type { Relogio } from '../../../compartilhado/dominio/relogio.js';
import {
  contemCaractereNulo,
  normalizarTexto,
} from '../../../compartilhado/dominio/texto.js';
import type {
  Candidatura,
  EntradaDeCandidatura,
  StatusDaCandidatura,
} from '../dominio/candidatura.js';
import type {
  CursorDeBusca,
  FiltrosDeBusca,
  GravacaoSobTrava,
  PaginaDoAutor,
  RepositorioDeTrampos,
  VerificadorDePerfil,
} from '../dominio/portas.js';
import {
  CIDADE_TAMANHO,
  type EntradaDeTrampo,
  Trampo,
  type TrampoDoAutor,
  type TrampoResumo,
} from '../dominio/trampo.js';

export const LIMITE_PADRAO_DE_BUSCA = 20;
export const LIMITE_MAXIMO_DE_BUSCA = 50;
export const TEXTO_DE_BUSCA_MAXIMO = 100;
/** Página de `GET /trampos/meus` (D47): 20 por padrão, no máximo 50. */
export const LIMITE_PADRAO_DOS_MEUS_TRAMPOS = 20;
export const LIMITE_MAXIMO_DOS_MEUS_TRAMPOS = 50;
/**
 * Quantas vezes candidatar e aceitar releem o trampo e tentam gravar de novo
 * quando perdem a trava otimista. Cada candidatura sobe a versão do trampo,
 * então N freelancers chegando juntos fazem até N rodadas: com este teto, um
 * pico de até 10 candidaturas simultâneas no mesmo trampo grava todas.
 */
export const TENTATIVAS_DE_GRAVACAO = 10;

export interface DependenciasDeTrampos {
  readonly repositorio: RepositorioDeTrampos;
  readonly verificadorDePerfil: VerificadorDePerfil;
  readonly relogio: Relogio;
}

/** Filtros como chegam da API, ainda não normalizados nem validados. */
export interface EntradaDeBusca {
  readonly texto?: unknown;
  readonly categoria?: unknown;
  readonly cidade?: unknown;
  readonly antesDe?: CursorDeBusca;
  readonly limite?: unknown;
}

/**
 * Página de "meus trampos" como chega da API (D47), ainda não validada. O
 * cursor é o `criadoEm` e o `id` do último item da página anterior, e os dois
 * vêm juntos ou nenhum.
 */
export interface EntradaDaListaDoAutor {
  readonly limite?: unknown;
  readonly antesDeCriadoEm?: unknown;
  readonly antesDeId?: unknown;
}

export interface CandidaturaVisao {
  readonly id: string;
  readonly freelancerId: string;
  readonly mensagem: string;
  readonly valorPropostoCentavos: number;
  readonly status: StatusDaCandidatura;
  readonly criadaEm: Date;
}

/** Corpo de `PUT /trampos/:id` (CA25): os campos do trampo e a `versao` lida. */
export interface EntradaDeEdicaoDeTrampo extends EntradaDeTrampo {
  readonly versao?: unknown;
}

/**
 * Trampo como quem pede o vê (D33): `versao` e `candidaturasRecebidas` só
 * existem na visão do autor; para os demais, as propriedades não existem.
 */
export type VisaoDoTrampo = TrampoResumo &
  Partial<Pick<TrampoDoAutor, 'versao' | 'candidaturasRecebidas'>>;

/** Candidatura vista pelo próprio freelancer, com o trampo a que se refere. */
export interface CandidaturaDoFreelancer extends CandidaturaVisao {
  readonly trampoId: string;
}

function visaoDaCandidatura(candidatura: Candidatura): CandidaturaVisao {
  return {
    id: candidatura.id,
    freelancerId: candidatura.freelancerId,
    mensagem: candidatura.mensagem,
    valorPropostoCentavos: candidatura.valorPropostoCentavos,
    status: candidatura.status,
    criadaEm: candidatura.criadaEm,
  };
}

/**
 * Ids de trampo e de candidatura são UUIDs, que não distinguem maiúsculas: o
 * id vindo da URL é comparado em minúsculas, a forma em que é gerado e guardado.
 */
function normalizarId(id: string): string {
  return id.toLowerCase();
}

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Faixa de datas aceita no cursor, como na busca: todo trampo é criado depois
 * de 1970, e fora do ano 1 a 9999 o `timestamptz` do Postgres recusaria o
 * parâmetro (500).
 */
const DATA_MINIMA_DO_CURSOR = Date.UTC(1970, 0, 1);
const DATA_MAXIMA_DO_CURSOR = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

/** `limite` de uma página: ausente vale o padrão; fora de 1 a `maximo`, `invalido`. */
function lerLimite(
  bruto: unknown,
  padrao: number,
  maximo: number,
  problemas: CampoInvalido[],
): number {
  if (bruto === undefined || bruto === null) {
    return padrao;
  }
  if (
    typeof bruto === 'number' &&
    Number.isInteger(bruto) &&
    bruto >= 1 &&
    bruto <= maximo
  ) {
    return bruto;
  }
  problemas.push({ campo: 'limite', motivo: 'invalido' });
  return padrao;
}

/**
 * `antesDeCriadoEm` do cursor: só o ISO 8601 em UTC que a API devolve no
 * `criadoEm` (`toISOString`, com milissegundos e `Z`), dentro da faixa.
 */
function lerDataDoCursor(bruta: string): Date | undefined {
  const data = new Date(bruta);
  if (
    Number.isNaN(data.getTime()) ||
    data.getTime() < DATA_MINIMA_DO_CURSOR ||
    data.getTime() > DATA_MAXIMA_DO_CURSOR ||
    data.toISOString() !== bruta
  ) {
    return undefined;
  }
  return data;
}

/**
 * Valida a página pedida (D47) antes de qualquer leitura. Os dois campos do
 * cursor vêm juntos: o que falta é `obrigatorio`; o fora do formato,
 * `invalido`. O id do cursor é guardado em minúsculas, como os ids gerados.
 * Os erros levam só o nome do campo, nunca o valor.
 */
function lerPaginaDoAutor(entrada: EntradaDaListaDoAutor): PaginaDoAutor {
  const problemas: CampoInvalido[] = [];
  const limite = lerLimite(
    entrada.limite,
    LIMITE_PADRAO_DOS_MEUS_TRAMPOS,
    LIMITE_MAXIMO_DOS_MEUS_TRAMPOS,
    problemas,
  );

  const { antesDeCriadoEm, antesDeId } = entrada;
  const temData = antesDeCriadoEm !== undefined && antesDeCriadoEm !== null;
  const temId = antesDeId !== undefined && antesDeId !== null;
  let criadoEm: Date | undefined;
  let id: string | undefined;
  if (temData) {
    criadoEm =
      typeof antesDeCriadoEm === 'string'
        ? lerDataDoCursor(antesDeCriadoEm)
        : undefined;
    if (criadoEm === undefined) {
      problemas.push({ campo: 'antesDeCriadoEm', motivo: 'invalido' });
    }
  } else if (temId) {
    problemas.push({ campo: 'antesDeCriadoEm', motivo: 'obrigatorio' });
  }
  if (temId) {
    if (typeof antesDeId === 'string' && FORMATO_UUID.test(antesDeId)) {
      id = normalizarId(antesDeId);
    } else {
      problemas.push({ campo: 'antesDeId', motivo: 'invalido' });
    }
  } else if (temData) {
    problemas.push({ campo: 'antesDeId', motivo: 'obrigatorio' });
  }

  if (problemas.length > 0) {
    throw new ErroDeValidacao(problemas);
  }
  return {
    limite,
    ...(criadoEm !== undefined &&
      id !== undefined && {
        antesDe: { criadoEm, id },
      }),
  };
}

/**
 * `versao` do corpo da edição. Vem antes de qualquer leitura (passo do schema
 * na ordem do plano), para o 400 não revelar se o trampo existe.
 */
function lerVersaoDaEdicao(bruta: unknown): number {
  if (bruta === undefined || bruta === null) {
    throw ErroDeValidacao.doCampo('versao', 'obrigatorio');
  }
  if (typeof bruta !== 'number' || !Number.isSafeInteger(bruta) || bruta < 1) {
    throw ErroDeValidacao.doCampo('versao', 'invalido');
  }
  return bruta;
}

/**
 * Texto opcional de filtro: ausente ou vazio (depois de normalizar) é ignorado.
 * O tamanho é medido depois de normalizar; caractere nulo é `invalido`.
 */
function lerFiltroDeTexto(
  campo: string,
  bruto: unknown,
  maximo: number,
  problemas: CampoInvalido[],
): string | undefined {
  if (bruto === undefined || bruto === null) {
    return undefined;
  }
  if (typeof bruto !== 'string' || contemCaractereNulo(bruto)) {
    problemas.push({ campo, motivo: 'invalido' });
    return undefined;
  }
  const normalizado = normalizarTexto(bruto);
  if (normalizado === '') {
    return undefined;
  }
  if (Array.from(normalizado).length > maximo) {
    problemas.push({ campo, motivo: 'tamanho' });
    return undefined;
  }
  return normalizado;
}

function lerFiltros(entrada: EntradaDeBusca): FiltrosDeBusca {
  const problemas: CampoInvalido[] = [];
  const texto = lerFiltroDeTexto(
    'texto',
    entrada.texto,
    TEXTO_DE_BUSCA_MAXIMO,
    problemas,
  );
  const cidade = lerFiltroDeTexto(
    'cidade',
    entrada.cidade,
    CIDADE_TAMANHO.max,
    problemas,
  );

  let categoria: FiltrosDeBusca['categoria'];
  if (entrada.categoria !== undefined && entrada.categoria !== null) {
    if (ehCategoriaValida(entrada.categoria)) {
      categoria = entrada.categoria;
    } else {
      problemas.push({ campo: 'categoria', motivo: 'invalido' });
    }
  }

  const limite = lerLimite(
    entrada.limite,
    LIMITE_PADRAO_DE_BUSCA,
    LIMITE_MAXIMO_DE_BUSCA,
    problemas,
  );

  const cursor = entrada.antesDe;
  if (
    cursor !== undefined &&
    (!(cursor.criadoEm instanceof Date) ||
      Number.isNaN(cursor.criadoEm.getTime()) ||
      typeof cursor.id !== 'string' ||
      cursor.id === '')
  ) {
    problemas.push({ campo: 'antesDe', motivo: 'invalido' });
  }

  if (problemas.length > 0) {
    throw new ErroDeValidacao(problemas);
  }
  return {
    ...(texto !== undefined && { texto }),
    ...(categoria !== undefined && { categoria }),
    ...(cidade !== undefined && { cidade }),
    ...(cursor !== undefined && { antesDe: cursor }),
    limite,
  };
}

/** Casos de uso do módulo `trampos`, com as dependências injetadas. */
export function criarCasosDeUsoDeTrampos(deps: DependenciasDeTrampos) {
  const { repositorio, verificadorDePerfil, relogio } = deps;

  // D9: perfil completo é a primeira checagem de publicar e de candidatar.
  async function exigirPerfilCompleto(contaId: string): Promise<void> {
    if (!(await verificadorDePerfil.perfilEstaCompleto(contaId))) {
      throw new ErroDeRegra('perfil_incompleto');
    }
  }

  async function carregarTrampo(trampoId: string): Promise<Trampo> {
    const trampo = await repositorio.buscarPorId(normalizarId(trampoId));
    if (!trampo) {
      throw new ErroNaoEncontrado();
    }
    return trampo;
  }

  /**
   * Lê o trampo, aplica a mudança e grava. Se outra gravação venceu a trava
   * otimista (`conflito_de_versao`), relê e reaplica a mudança sobre o estado
   * novo: as regras do agregado decidem de novo (o duplo toque vira
   * `candidatura_duplicada`; o trampo já aceito vira `trampo_nao_aberto`; o
   * trampo excluído vira 404). Esgotadas as tentativas, o conflito chega a
   * quem chamou, a não ser que o trampo tenha sumido (404).
   */
  async function alterarTrampo<T>(
    trampoId: string,
    mudar: (trampo: Trampo) => T,
  ): Promise<T> {
    for (let tentativa = 1; ; tentativa += 1) {
      const trampo = await carregarTrampo(trampoId);
      const resultado = mudar(trampo);
      try {
        await repositorio.salvar(trampo);
        return resultado;
      } catch (erro) {
        if (
          !(erro instanceof ErroDeRegra) ||
          erro.codigo !== 'conflito_de_versao'
        ) {
          throw erro;
        }
        if (tentativa >= TENTATIVAS_DE_GRAVACAO) {
          // CA28: se quem venceu a última rodada foi a exclusão do trampo, a
          // resposta é 404, não um conflito.
          await carregarTrampo(trampoId);
          throw erro;
        }
      }
    }
  }

  /**
   * Ação sob a trava pessimista do trampo: as do autor (D33, S1) e a retirada
   * do freelancer (D49). Sem releitura nem teto de tentativas. Trampo
   * inexistente: 404.
   */
  async function alterarSobTrava(
    trampoId: string,
    decidir: (trampo: Trampo) => GravacaoSobTrava,
  ): Promise<void> {
    if (!(await repositorio.alterarSobTrava(normalizarId(trampoId), decidir))) {
      throw new ErroNaoEncontrado();
    }
  }

  return {
    /** CA4, CA5 e D9. */
    async publicarTrampo(
      autorId: string,
      dados: EntradaDeTrampo,
    ): Promise<{ id: string; status: 'aberto' }> {
      await exigirPerfilCompleto(autorId);
      const trampo = Trampo.criar(autorId, dados, relogio);
      await repositorio.salvar(trampo);
      return { id: trampo.id, status: 'aberto' };
    },

    /** CA8, CA9, CA11 e D9. */
    async candidatar(
      freelancerId: string,
      trampoId: string,
      dados: EntradaDeCandidatura,
    ): Promise<{ id: string; status: 'pendente' }> {
      await exigirPerfilCompleto(freelancerId);
      const candidatura = await alterarTrampo(trampoId, (trampo) =>
        trampo.candidatar(freelancerId, dados, relogio),
      );
      return { id: candidatura.id, status: 'pendente' };
    },

    /** CA8: só o autor vê as candidaturas; os demais recebem 404. */
    async listarCandidaturas(
      quem: string,
      trampoId: string,
    ): Promise<CandidaturaVisao[]> {
      const trampo = await carregarTrampo(trampoId);
      if (trampo.autorId !== quem) {
        throw new ErroNaoEncontrado();
      }
      return trampo.candidaturas.map(visaoDaCandidatura);
    },

    /** CA8: as candidaturas que o próprio freelancer enviou, mais recentes primeiro. */
    async listarMinhasCandidaturas(
      freelancerId: string,
    ): Promise<CandidaturaDoFreelancer[]> {
      const candidaturas =
        await repositorio.listarCandidaturasDoFreelancer(freelancerId);
      return candidaturas.map((candidatura) => ({
        ...visaoDaCandidatura(candidatura),
        trampoId: candidatura.trampoId,
      }));
    },

    /**
     * CA10. Se a gravação perde a trava para uma candidatura que chegou ao
     * mesmo tempo, relê e tenta de novo; se perde para outro aceite, a
     * releitura encontra o trampo em andamento e responde `trampo_nao_aberto`.
     */
    async aceitarCandidatura(
      quem: string,
      trampoId: string,
      candidaturaId: string,
    ): Promise<void> {
      await alterarTrampo(trampoId, (trampo) =>
        trampo.aceitar(normalizarId(candidaturaId), quem),
      );
    },

    /**
     * Detalhe do trampo para qualquer conta autenticada. `versao` e
     * `candidaturasRecebidas` só vão para o autor (D33); para os demais, o
     * corpo é o de antes da L2.
     */
    async obterTrampo(trampoId: string, quem: string): Promise<VisaoDoTrampo> {
      const trampo = await carregarTrampo(trampoId);
      return trampo.autorId === quem ? trampo.resumoDoAutor() : trampo.resumo();
    },

    /**
     * Uma página dos trampos do autor, em qualquer status, na visão do autor
     * (D33), mais recentes primeiro (D47, CA66). Sem cursor, a primeira
     * página; com ele, os estritamente mais antigos que `(antesDeCriadoEm,
     * antesDeId)`. Só os do `autorId` da sessão. Página inválida: 400 antes
     * de ler.
     */
    async listarMeusTrampos(
      autorId: string,
      entrada: EntradaDaListaDoAutor = {},
    ): Promise<TrampoDoAutor[]> {
      return repositorio.listarDoAutor(autorId, lerPaginaDoAutor(entrada));
    },

    /**
     * CA25: o autor substitui os campos do trampo aberto e sem candidaturas,
     * mandando a `versao` lida. Ordem das checagens (plano, "Decisão"):
     * `versao` ausente ou inválida (400), trampo inexistente ou de outra conta
     * (404), regra (409 `trampo_nao_editavel`), versão velha (409
     * `conflito_de_versao`) e só então os campos (400). Se a gravação perder a
     * trava, relê e confere de novo, na mesma ordem: o trampo sumido dá 404, o
     * que recebeu candidatura dá `trampo_nao_editavel` e o editado por outro
     * aparelho dá `conflito_de_versao`. Não tenta de novo: a versão do
     * cliente já é velha.
     */
    async editarTrampo(
      quem: string,
      trampoId: string,
      dados: EntradaDeEdicaoDeTrampo | null | undefined,
    ): Promise<void> {
      const versaoLida = lerVersaoDaEdicao(dados?.versao);
      const entrada: EntradaDeTrampo = dados ?? {};
      const trampo = await carregarTrampo(trampoId);
      trampo.editar(quem, versaoLida, entrada);
      try {
        await repositorio.salvar(trampo);
      } catch (erro) {
        if (
          !(erro instanceof ErroDeRegra) ||
          erro.codigo !== 'conflito_de_versao'
        ) {
          throw erro;
        }
        const relido = await carregarTrampo(trampoId);
        relido.editar(quem, versaoLida, entrada);
        // Defesa: a versão só sobe, então a releitura já não tem a versão
        // lida e `editar` lança acima; se não lançar, fica o conflito.
        throw erro;
      }
    },

    /**
     * CA27: o autor encerra o trampo aberto ou em andamento; as pendentes
     * viram recusadas e o trampo sai da busca. Já encerrado, não grava nada
     * (D34). A regra roda no servidor sob a trava do trampo (ADR-006, S1): a
     * candidatura que gravou antes é recusada junto; a que chega durante
     * espera e recebe `trampo_nao_aberto`. Nunca dá `conflito_de_versao`.
     */
    async encerrarTrampo(quem: string, trampoId: string): Promise<void> {
      await alterarSobTrava(trampoId, (trampo) =>
        trampo.encerrar(quem) ? 'salvar' : 'nada',
      );
    },

    /**
     * CA28: o autor exclui o trampo aberto, com as candidaturas. A regra roda
     * no servidor sob a trava do trampo (ADR-006, S1): a candidatura que
     * gravou antes é apagada junto; a que chega durante espera e recebe 404;
     * o trampo que saiu de `aberto` dá `trampo_nao_aberto`; o que sumiu, 404.
     * Nunca dá `conflito_de_versao`.
     */
    async excluirTrampo(quem: string, trampoId: string): Promise<void> {
      await alterarSobTrava(trampoId, (trampo) => {
        trampo.conferirExclusao(quem);
        return 'excluir';
      });
    },

    /**
     * CA29: o freelancer retira a própria candidatura pendente; a linha é
     * apagada e ele pode se candidatar de novo. Inexistente ou de outra conta
     * dá 404; aceita ou recusada, `candidatura_nao_pendente`. A regra roda no
     * servidor sob a trava do trampo, como encerrar e excluir (D49, CA65): a
     * escrita que gravou antes é vista (o aceite vira
     * `candidatura_nao_pendente`; o trampo excluído, 404); a que chega durante
     * espera e relê o estado novo. Sem releitura nem teto de tentativas, nunca
     * dá `conflito_de_versao`, nem sob uma rajada de candidaturas.
     */
    async retirarCandidatura(
      quem: string,
      candidaturaId: string,
    ): Promise<void> {
      const id = normalizarId(candidaturaId);
      const trampoId = await repositorio.trampoDaCandidatura(id);
      if (trampoId === null) {
        throw new ErroNaoEncontrado();
      }
      await alterarSobTrava(trampoId, (trampo) => {
        trampo.retirar(id, quem);
        return 'salvar';
      });
    },

    /** CA4 e CA7 (parte de trampos): filtros com E lógico, mais recentes primeiro. */
    async buscarTrampos(entrada: EntradaDeBusca = {}): Promise<TrampoResumo[]> {
      return repositorio.buscar(lerFiltros(entrada));
    },

    /** Contrato com `conversas`: há candidatura, em qualquer estado, entre os dois? */
    async existeVinculoEntre(a: string, b: string): Promise<boolean> {
      return repositorio.existeCandidaturaEntre(a, b);
    },
  };
}

export type CasosDeUsoDeTrampos = ReturnType<typeof criarCasosDeUsoDeTrampos>;
