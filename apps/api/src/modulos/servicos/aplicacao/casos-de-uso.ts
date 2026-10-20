import { randomUUID } from 'node:crypto';
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
  CursorDeBusca,
  FiltrosDeBusca,
  RepositorioDeServicos,
  VerificadorDePerfil,
} from '../dominio/portas.js';
import {
  criarServico,
  type EntradaDeServico,
  LIMITES_DO_SERVICO,
  type Servico,
  type StatusDeServico,
} from '../dominio/servico.js';

export const LIMITE_PADRAO_DE_BUSCA = 20;
export const LIMITE_MAXIMO_DE_BUSCA = 50;
/** Tamanho máximo do texto de busca (plano, "Pontos para o seguranca"). */
export const TAMANHO_MAXIMO_DO_TEXTO_DE_BUSCA = 100;

export interface DependenciasDeServicos {
  readonly repositorio: RepositorioDeServicos;
  readonly verificadorDePerfil: VerificadorDePerfil;
  readonly relogio: Relogio;
  /** Gerador de id; o padrão é `crypto.randomUUID`. Injetável em teste. */
  readonly gerarId?: () => string;
}

/** Filtros como chegam da borda; o caso de uso valida e normaliza. */
export interface PedidoDeBusca {
  readonly texto?: string;
  readonly categoria?: string;
  readonly cidade?: string;
  readonly antesDe?: CursorDeBusca;
  readonly limite?: number;
}

export interface ServicoOfertado {
  readonly id: string;
  readonly status: StatusDeServico;
}

/**
 * Texto opcional de filtro: ausente ou vazio (depois de normalizar) é ignorado.
 * O tamanho é medido depois de normalizar, como em `trampos`; caractere nulo
 * (que o Postgres recusa) é `invalido`.
 */
function lerFiltroDeTexto(
  campo: string,
  bruto: unknown,
  maximo: number,
  erros: CampoInvalido[],
): string | undefined {
  if (bruto === undefined || bruto === null) {
    return undefined;
  }
  if (typeof bruto !== 'string' || contemCaractereNulo(bruto)) {
    erros.push({ campo, motivo: 'invalido' });
    return undefined;
  }
  const normalizado = normalizarTexto(bruto);
  if (normalizado === '') {
    return undefined;
  }
  if (Array.from(normalizado).length > maximo) {
    erros.push({ campo, motivo: 'tamanho' });
    return undefined;
  }
  return normalizado;
}

function validarBusca(pedido: PedidoDeBusca): FiltrosDeBusca {
  const erros: CampoInvalido[] = [];
  let categoria: FiltrosDeBusca['categoria'];
  let antesDe: CursorDeBusca | undefined;
  let limite = LIMITE_PADRAO_DE_BUSCA;

  const texto = lerFiltroDeTexto(
    'texto',
    pedido.texto,
    TAMANHO_MAXIMO_DO_TEXTO_DE_BUSCA,
    erros,
  );

  // Em branco equivale a "sem filtro", como num formulário não preenchido.
  if (
    pedido.categoria !== undefined &&
    pedido.categoria !== null &&
    pedido.categoria !== ''
  ) {
    if (ehCategoriaValida(pedido.categoria)) {
      categoria = pedido.categoria;
    } else {
      erros.push({ campo: 'categoria', motivo: 'invalido' });
    }
  }

  const cidade = lerFiltroDeTexto(
    'cidade',
    pedido.cidade,
    LIMITES_DO_SERVICO.cidade.max,
    erros,
  );

  if (pedido.antesDe !== undefined && pedido.antesDe !== null) {
    const { criadoEm, id } = pedido.antesDe;
    if (
      criadoEm instanceof Date &&
      !Number.isNaN(criadoEm.getTime()) &&
      typeof id === 'string' &&
      id !== ''
    ) {
      antesDe = { criadoEm: new Date(criadoEm.getTime()), id };
    } else {
      erros.push({ campo: 'antesDe', motivo: 'invalido' });
    }
  }

  if (pedido.limite !== undefined && pedido.limite !== null) {
    if (
      Number.isInteger(pedido.limite) &&
      pedido.limite >= 1 &&
      pedido.limite <= LIMITE_MAXIMO_DE_BUSCA
    ) {
      limite = pedido.limite;
    } else {
      erros.push({ campo: 'limite', motivo: 'invalido' });
    }
  }

  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
  return {
    ...(texto !== undefined ? { texto } : {}),
    ...(categoria !== undefined ? { categoria } : {}),
    ...(cidade !== undefined ? { cidade } : {}),
    ...(antesDe !== undefined ? { antesDe } : {}),
    limite,
  };
}

/** Casos de uso do módulo `servicos`, com as portas injetadas. */
export function criarCasosDeUsoDeServicos(deps: DependenciasDeServicos) {
  const { repositorio, verificadorDePerfil, relogio } = deps;
  const gerarId = deps.gerarId ?? randomUUID;

  return {
    /**
     * CA6 e D9. A checagem de perfil vem antes de qualquer outra regra: com
     * perfil incompleto, nem os dados são validados.
     */
    async ofertarServico(
      autorId: string,
      dados: EntradaDeServico,
    ): Promise<ServicoOfertado> {
      if (!(await verificadorDePerfil.perfilEstaCompleto(autorId))) {
        throw new ErroDeRegra('perfil_incompleto');
      }
      const servico = criarServico(dados, {
        id: gerarId(),
        autorId,
        agora: relogio.agora(),
      });
      await repositorio.salvar(servico);
      return { id: servico.id, status: servico.status };
    },

    async obterServico(id: string): Promise<Servico> {
      const servico = await repositorio.buscarPorId(id);
      if (!servico) {
        throw new ErroNaoEncontrado();
      }
      return servico;
    },

    async listarMeusServicos(autorId: string): Promise<readonly Servico[]> {
      return repositorio.listarDoAutor(autorId);
    },

    /** CA7 (parte de serviços): filtros com E lógico, mais recentes primeiro. */
    async buscarServicos(
      pedido: PedidoDeBusca = {},
    ): Promise<readonly Servico[]> {
      return repositorio.buscar(validarBusca(pedido));
    },
  };
}

export type CasosDeUsoDeServicos = ReturnType<typeof criarCasosDeUsoDeServicos>;
