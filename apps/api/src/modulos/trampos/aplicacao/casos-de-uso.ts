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
  RepositorioDeTrampos,
  VerificadorDePerfil,
} from '../dominio/portas.js';
import {
  CIDADE_TAMANHO,
  type EntradaDeTrampo,
  Trampo,
  type TrampoResumo,
} from '../dominio/trampo.js';

export const LIMITE_PADRAO_DE_BUSCA = 20;
export const LIMITE_MAXIMO_DE_BUSCA = 50;
export const TEXTO_DE_BUSCA_MAXIMO = 100;
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

export interface CandidaturaVisao {
  readonly id: string;
  readonly freelancerId: string;
  readonly mensagem: string;
  readonly valorPropostoCentavos: number;
  readonly status: StatusDaCandidatura;
  readonly criadaEm: Date;
}

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

  let limite = LIMITE_PADRAO_DE_BUSCA;
  if (entrada.limite !== undefined && entrada.limite !== null) {
    if (
      typeof entrada.limite === 'number' &&
      Number.isInteger(entrada.limite) &&
      entrada.limite >= 1 &&
      entrada.limite <= LIMITE_MAXIMO_DE_BUSCA
    ) {
      limite = entrada.limite;
    } else {
      problemas.push({ campo: 'limite', motivo: 'invalido' });
    }
  }

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
   * `candidatura_duplicada`; o trampo já aceito vira `trampo_nao_aberto`).
   * Esgotadas as tentativas, o conflito chega a quem chamou.
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
          tentativa >= TENTATIVAS_DE_GRAVACAO ||
          !(erro instanceof ErroDeRegra) ||
          erro.codigo !== 'conflito_de_versao'
        ) {
          throw erro;
        }
      }
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

    async obterTrampo(trampoId: string): Promise<TrampoResumo> {
      return (await carregarTrampo(trampoId)).resumo();
    },

    async listarMeusTrampos(autorId: string): Promise<TrampoResumo[]> {
      return repositorio.listarDoAutor(autorId);
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
