import {
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { ClienteHttp } from '../../api/cliente';
import { ehErroDaApi } from '../../api/erros';
import {
  listarMeusServicos,
  obterServico,
  ofertarServico,
} from '../../api/servicos';
import type {
  Criado,
  EntradaDeServico,
  EntradaDeTrampo,
  Servico,
  StatusDoServico,
  StatusDoTrampo,
  Trampo,
} from '../../api/tipos';
import {
  listarMeusTrampos,
  obterTrampo,
  publicarTrampo,
} from '../../api/trampos';
import { useCliente, useSessao } from '../sessao';
import { chaves } from './chaves';

/** `GET /trampos/:id`. Inexistente sobe como `ErroDaApi` 404. */
export function useTrampo(id: string) {
  const cliente = useCliente();
  const consulta = useQuery<Trampo, Error>({
    queryKey: chaves.trampo(id),
    queryFn: () => obterTrampo(cliente, id),
  });
  return {
    trampo: consulta.data ?? null,
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

/** `GET /servicos/:id`. Inexistente sobe como `ErroDaApi` 404. */
export function useServico(id: string) {
  const cliente = useCliente();
  const consulta = useQuery<Servico, Error>({
    queryKey: chaves.servico(id),
    queryFn: () => obterServico(cliente, id),
  });
  return {
    servico: consulta.data ?? null,
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

/**
 * `GET /trampos/meus`, só com a sessão autenticada. `trampos` é `null`
 * enquanto não há resposta (inclusive offline, com a consulta pausada).
 */
export function useMeusTrampos() {
  const cliente = useCliente();
  const { status } = useSessao();
  const consulta = useQuery<readonly Trampo[], Error>({
    queryKey: chaves.meusTrampos(),
    queryFn: () => listarMeusTrampos(cliente),
    enabled: status === 'autenticado',
  });
  return {
    trampos: consulta.data ?? null,
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

/** `GET /servicos/meus`, como `useMeusTrampos`. */
export function useMeusServicos() {
  const cliente = useCliente();
  const { status } = useSessao();
  const consulta = useQuery<readonly Servico[], Error>({
    queryKey: chaves.meusServicos(),
    queryFn: () => listarMeusServicos(cliente),
    enabled: status === 'autenticado',
  });
  return {
    servicos: consulta.data ?? null,
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

/**
 * Resultado de várias consultas por id: o dado de cada id que já respondeu e
 * `null` para o que respondeu 404. Id sem resposta ainda (carregando, offline
 * ou erro que não é 404) fica fora do mapa.
 */
export type MapaPorId<T> = ReadonlyMap<string, T | null>;

function mapaDeResultados<T>(
  ids: readonly string[],
  resultados: readonly UseQueryResult<T, Error>[],
): MapaPorId<T> {
  const mapa = new Map<string, T | null>();
  resultados.forEach((resultado, indice) => {
    const id = ids[indice];
    if (id === undefined) {
      return;
    }
    // Dado em mãos vence o erro de uma recarga.
    if (resultado.data !== undefined) {
      mapa.set(id, resultado.data);
    } else if (ehErroDaApi(resultado.error) && resultado.error.status === 404) {
      mapa.set(id, null);
    }
  });
  return mapa;
}

/**
 * Uma consulta por id (`useQueries`), na mesma chave do hook de um item só:
 * o cache é compartilhado, e o id que outra tela já buscou não gera nova
 * requisição enquanto o dado estiver fresco. Ids repetidos ou vazios viram
 * uma consulta só (ou nenhuma). O mapa só muda quando um resultado muda.
 */
export function useConsultasPorIds<T>(
  ids: readonly string[],
  chaveDoItem: (id: string) => QueryKey,
  buscarItem: (cliente: ClienteHttp, id: string) => Promise<T>,
): MapaPorId<T> {
  const cliente = useCliente();
  const assinatura = JSON.stringify([
    ...new Set(ids.filter((id) => id !== '')),
  ]);
  const unicos = useMemo(
    () => JSON.parse(assinatura) as readonly string[],
    [assinatura],
  );
  const combinar = useCallback(
    (resultados: UseQueryResult<T, Error>[]) =>
      mapaDeResultados(unicos, resultados),
    [unicos],
  );
  return useQueries({
    queries: unicos.map((id) => ({
      queryKey: chaveDoItem(id),
      queryFn: () => buscarItem(cliente, id),
    })),
    combine: combinar,
  });
}

/**
 * Vários `GET /trampos/:id` (ex.: o título de cada item de Minhas
 * candidaturas), sobre `chaves.trampo(id)`, que `useTrampo` também usa.
 * Trampo 404 vira `null` ("Trampo indisponível").
 */
export function useTramposPorIds(ids: readonly string[]): MapaPorId<Trampo> {
  return useConsultasPorIds<Trampo>(ids, chaves.trampo, obterTrampo);
}

/** Sessão em que a mutação começou (ver `Sessao.geracao`). */
export interface ContextoDaMutacao {
  readonly geracao: number;
}

/**
 * Teto da espera pelas listas essenciais no sucesso de uma mutação: com a
 * rede lenta ou caindo, o botão não fica preso em "Enviando…".
 */
export const TETO_DA_RECARGA_MS = 5_000;

/** Chaves que uma mutação invalida no sucesso. */
export interface ChavesDaMutacao {
  /**
   * Recarregadas antes do `onSuccess` passado ao `mutate`, mesmo sem tela
   * observando (`refetchType: 'all'`), com teto de `TETO_DA_RECARGA_MS`.
   */
  readonly essenciais: readonly QueryKey[];
  /**
   * Invalidadas sem esperar: recarrega já só o que alguma tela observa
   * (`refetchType: 'active'`); o resto recarrega quando uma tela abrir.
   */
  readonly demais?: readonly QueryKey[];
}

/** Espera `promessa` por até `ms`; falha dela também libera a espera. */
async function esperarComTeto(
  promessa: Promise<unknown>,
  ms: number,
): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<void>((resolver) => {
    temporizador = setTimeout(resolver, ms);
  });
  try {
    await Promise.race([promessa.then(undefined, () => undefined), teto]);
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Mutação de uma ação da conta (publicar, ofertar, candidatar, aceitar):
 *
 * - `networkMode: 'always'`: sem conexão, falha na hora com `ErroDeRede`. O
 *   padrão do TanStack a deixaria pausada, para rodar sozinha quando a rede
 *   voltasse, sem a pessoa ver.
 * - Sem nova tentativa automática (`retry: 0`).
 * - `gcTime: 0`: a entrada (mensagem, valores) sai do cache de mutações assim
 *   que a tela que a enviou deixa de observá-la.
 * - No sucesso, se a sessão ainda é a mesma em que a mutação começou, invalida
 *   as `demais` sem esperar e espera a recarga das `essenciais` (até
 *   `TETO_DA_RECARGA_MS`): o `onSuccess` passado ao `mutate` já encontra as
 *   listas essenciais atualizadas, e uma recarga que falha ou demora não
 *   transforma o sucesso em erro. Se a sessão mudou (saída, expiração ou outra
 *   conta), nada é invalidado.
 *
 * Erros sobem como `ErroDaApi` ou `ErroDeRede`, para a rota traduzir.
 */
export function useMutacaoComInvalidacao<TDados, TEntrada>(
  executar: (cliente: ClienteHttp, entrada: TEntrada) => Promise<TDados>,
  { essenciais, demais = [] }: ChavesDaMutacao,
): UseMutationResult<TDados, Error, TEntrada, ContextoDaMutacao> {
  const cliente = useCliente();
  const sessao = useSessao();
  const queryClient = useQueryClient();
  return useMutation<TDados, Error, TEntrada, ContextoDaMutacao>({
    mutationFn: (entrada) => executar(cliente, entrada),
    networkMode: 'always',
    retry: 0,
    gcTime: 0,
    onMutate: () => ({ geracao: sessao.geracao() }),
    onSuccess: async (_dados, _entrada, contexto) => {
      if (contexto.geracao !== sessao.geracao()) {
        return;
      }
      const recargas = essenciais.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey, refetchType: 'all' }),
      );
      for (const queryKey of demais) {
        void queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
      }
      await esperarComTeto(Promise.all(recargas), TETO_DA_RECARGA_MS);
    },
  });
}

/**
 * `POST /trampos` (CA4). No sucesso recarrega Meus trampos (esperado) e
 * invalida os recentes de trampos do Início e toda busca em cache. 400 traz
 * os `campos`; 409 `perfil_incompleto` (D9).
 */
export function usePublicarTrampo() {
  return useMutacaoComInvalidacao<Criado<StatusDoTrampo>, EntradaDeTrampo>(
    publicarTrampo,
    {
      essenciais: [chaves.meusTrampos()],
      demais: [chaves.recentes('trampos'), chaves.todasAsBuscas()],
    },
  );
}

/** `POST /servicos` (CA6), como `usePublicarTrampo`, com os serviços. */
export function useOfertarServico() {
  return useMutacaoComInvalidacao<Criado<StatusDoServico>, EntradaDeServico>(
    ofertarServico,
    {
      essenciais: [chaves.meusServicos()],
      demais: [chaves.recentes('servicos'), chaves.todasAsBuscas()],
    },
  );
}
