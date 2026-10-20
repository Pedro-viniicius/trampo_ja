import {
  type CampoInvalido,
  ErroDeValidacao,
} from '../../../compartilhado/dominio/erros.js';
import {
  type CursorDaBusca,
  codificarCursor,
  decodificarCursor,
  type PosicaoNaLista,
} from './cursor.js';

export const LIMITE_PADRAO_DA_BUSCA = 20;
/**
 * Cada fachada recusa `limite` acima de 50 e a busca pede `limite + 1` para
 * saber se há próxima página; por isso o máximo aqui é 49.
 */
export const LIMITE_MAXIMO_DA_BUSCA = 49;

export const TIPOS_DE_BUSCA = ['trampos', 'servicos', 'todos'] as const;
export type TipoDeBusca = (typeof TIPOS_DE_BUSCA)[number];

/** Filtros como a fachada de cada módulo os recebe. */
export interface FiltrosDaFachada {
  readonly texto?: string;
  readonly categoria?: string;
  readonly cidade?: string;
  readonly antesDe?: PosicaoNaLista;
  readonly limite?: number;
}

/** O que a busca lê de um trampo (subconjunto de `TrampoResumo`). */
export interface TrampoParaBusca {
  readonly id: string;
  readonly autorId: string;
  readonly titulo: string;
  readonly categoria: string;
  readonly cidade: string;
  readonly valorCentavos: number;
  readonly criadoEm: Date;
}

/** O que a busca lê de um serviço (subconjunto de `Servico`). */
export interface ServicoParaBusca {
  readonly id: string;
  readonly autorId: string;
  readonly titulo: string;
  readonly categoria: string;
  readonly cidade?: string;
  readonly precoBaseCentavos: number;
  readonly criadoEm: Date;
}

/**
 * Portas para as fachadas de `trampos` e `servicos`. Cada uma já valida os
 * filtros (`ErroDeValidacao`) e devolve os mais recentes primeiro.
 */
export interface FachadasDeBusca {
  readonly buscarTrampos: (
    filtros: FiltrosDaFachada,
  ) => Promise<readonly TrampoParaBusca[]>;
  readonly buscarServicos: (
    filtros: FiltrosDaFachada,
  ) => Promise<readonly ServicoParaBusca[]>;
}

/** Filtros da busca como chegam da borda (texto puro, ainda não validado). */
export interface PedidoDeBuscaGeral {
  readonly texto?: string;
  readonly categoria?: string;
  readonly cidade?: string;
  /** Padrão `todos`. */
  readonly tipo?: string;
  /** Cursor opaco devolvido por uma resposta anterior (`proximoCursor`). */
  readonly antesDe?: string;
  /** Padrão 20, de 1 a 49. */
  readonly limite?: number;
}

/**
 * Item do resultado, num formato único para as duas fontes: os campos comuns
 * mais um discriminante `tipo`. O trampo traz `valorCentavos`; o serviço traz
 * `precoBaseCentavos`. `cidade` é `null` só para serviço sem cidade (D7) e
 * `criadoEm` é ISO 8601 em UTC.
 */
interface ItemComum {
  readonly id: string;
  readonly autorId: string;
  readonly titulo: string;
  readonly categoria: string;
  readonly cidade: string | null;
  readonly criadoEm: string;
}

export type ItemDeBusca =
  | (ItemComum & { readonly tipo: 'trampo'; readonly valorCentavos: number })
  | (ItemComum & {
      readonly tipo: 'servico';
      readonly precoBaseCentavos: number;
    });

export interface ResultadoDaBusca {
  readonly itens: readonly ItemDeBusca[];
  /** Cursor opaco da próxima página; `null` na última. */
  readonly proximoCursor: string | null;
}

interface Candidato {
  readonly criadoEm: Date;
  readonly item: ItemDeBusca;
}

function comoTrampo(trampo: TrampoParaBusca): Candidato {
  return {
    criadoEm: trampo.criadoEm,
    item: {
      tipo: 'trampo',
      id: trampo.id,
      autorId: trampo.autorId,
      titulo: trampo.titulo,
      categoria: trampo.categoria,
      cidade: trampo.cidade,
      valorCentavos: trampo.valorCentavos,
      criadoEm: trampo.criadoEm.toISOString(),
    },
  };
}

function comoServico(servico: ServicoParaBusca): Candidato {
  return {
    criadoEm: servico.criadoEm,
    item: {
      tipo: 'servico',
      id: servico.id,
      autorId: servico.autorId,
      titulo: servico.titulo,
      categoria: servico.categoria,
      cidade: servico.cidade ?? null,
      precoBaseCentavos: servico.precoBaseCentavos,
      criadoEm: servico.criadoEm.toISOString(),
    },
  };
}

/** `criadoEm` e `id` decrescentes; o tipo só desempata ids iguais entre fontes. */
function maisRecentesPrimeiro(a: Candidato, b: Candidato): number {
  const porData = b.criadoEm.getTime() - a.criadoEm.getTime();
  if (porData !== 0) {
    return porData;
  }
  if (a.item.id !== b.item.id) {
    return a.item.id < b.item.id ? 1 : -1;
  }
  return a.item.tipo === b.item.tipo ? 0 : a.item.tipo < b.item.tipo ? 1 : -1;
}

function lerLimite(limite: unknown, problemas: CampoInvalido[]): number {
  if (limite === undefined || limite === null) {
    return LIMITE_PADRAO_DA_BUSCA;
  }
  if (
    typeof limite === 'number' &&
    Number.isInteger(limite) &&
    limite >= 1 &&
    limite <= LIMITE_MAXIMO_DA_BUSCA
  ) {
    return limite;
  }
  problemas.push({ campo: 'limite', motivo: 'invalido' });
  return LIMITE_PADRAO_DA_BUSCA;
}

function lerTipo(tipo: unknown, problemas: CampoInvalido[]): TipoDeBusca {
  if (tipo === undefined || tipo === null) {
    return 'todos';
  }
  if (TIPOS_DE_BUSCA.some((valido) => valido === tipo)) {
    return tipo as TipoDeBusca;
  }
  problemas.push({ campo: 'tipo', motivo: 'invalido' });
  return 'todos';
}

function lerCursor(
  antesDe: unknown,
  problemas: CampoInvalido[],
): CursorDaBusca {
  if (antesDe === undefined || antesDe === null) {
    return {};
  }
  try {
    return decodificarCursor(antesDe as string);
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      problemas.push(...erro.campos);
      return {};
    }
    throw erro;
  }
}

/** Casos de uso do módulo `busca` (só leitura), com as fachadas injetadas. */
export function criarCasosDeUsoDeBusca(fachadas: FachadasDeBusca) {
  return {
    /**
     * CA7: junta trampos e serviços, só com os itens que atendem a todos os
     * filtros informados, mais recentes primeiro.
     *
     * Cada fachada recebe `limite + 1`, só para saber se há próxima página, e
     * a posição da própria lista (nunca a da outra). O cursor da resposta
     * guarda a posição do último item mostrado de cada lista.
     *
     * Erros: `tipo`, `limite` e `antesDe` inválidos viram `ErroDeValidacao`
     * aqui; os demais filtros são validados pelas fachadas e o erro delas sobe.
     */
    async buscar(pedido: PedidoDeBuscaGeral = {}): Promise<ResultadoDaBusca> {
      const problemas: CampoInvalido[] = [];
      const tipo = lerTipo(pedido.tipo, problemas);
      const limite = lerLimite(pedido.limite, problemas);
      const cursor = lerCursor(pedido.antesDe, problemas);
      if (problemas.length > 0) {
        throw new ErroDeValidacao(problemas);
      }

      // Em branco equivale a "sem filtro" (formulário não preenchido); as
      // fachadas divergem nisso para a categoria.
      const categoria = pedido.categoria?.trim() || undefined;
      const comuns = {
        ...(pedido.texto !== undefined && { texto: pedido.texto }),
        ...(categoria !== undefined && { categoria }),
        ...(pedido.cidade !== undefined && { cidade: pedido.cidade }),
        limite: limite + 1,
      };

      const buscarTrampos = tipo !== 'servicos';
      const buscarServicos = tipo !== 'trampos';
      const [trampos, servicos] = await Promise.all([
        buscarTrampos
          ? fachadas.buscarTrampos({
              ...comuns,
              ...(cursor.trampos && { antesDe: cursor.trampos }),
            })
          : [],
        buscarServicos
          ? fachadas.buscarServicos({
              ...comuns,
              ...(cursor.servicos && { antesDe: cursor.servicos }),
            })
          : [],
      ]);

      const juntos = [
        ...trampos.map(comoTrampo),
        ...servicos.map(comoServico),
      ].sort(maisRecentesPrimeiro);
      const pagina = juntos.slice(0, limite);
      const itens = pagina.map((candidato) => candidato.item);
      if (juntos.length <= limite) {
        return { itens, proximoCursor: null };
      }

      // Os itens mostrados de cada lista são um prefixo dela, então a posição
      // do último deles marca onde a lista continua. Lista sem item na página
      // mantém a posição anterior.
      const ultimo = (tipoDaLista: ItemDeBusca['tipo']) =>
        [...pagina]
          .reverse()
          .find((candidato) => candidato.item.tipo === tipoDaLista);
      const ultimoTrampo = ultimo('trampo');
      const ultimoServico = ultimo('servico');
      const posicaoDe = (
        candidato: Candidato | undefined,
        anterior: PosicaoNaLista | undefined,
      ): PosicaoNaLista | undefined =>
        candidato
          ? { criadoEm: candidato.criadoEm, id: candidato.item.id }
          : anterior;
      const trampoDoCursor = buscarTrampos
        ? posicaoDe(ultimoTrampo, cursor.trampos)
        : undefined;
      const servicoDoCursor = buscarServicos
        ? posicaoDe(ultimoServico, cursor.servicos)
        : undefined;

      return {
        itens,
        proximoCursor: codificarCursor({
          ...(trampoDoCursor && { trampos: trampoDoCursor }),
          ...(servicoDoCursor && { servicos: servicoDoCursor }),
        }),
      };
    },
  };
}

export type CasosDeUsoDeBusca = ReturnType<typeof criarCasosDeUsoDeBusca>;
