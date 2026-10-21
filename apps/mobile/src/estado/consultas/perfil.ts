import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  obterMeuPerfil,
  obterPerfilPublico,
  salvarMeuPerfil,
} from '../../api/perfis';
import type {
  EntradaDePerfil,
  MeuPerfil,
  PerfilPublico,
} from '../../api/tipos';
import { useCliente, useSessao } from '../sessao';
import { type MapaPorId, useConsultasPorIds } from './anuncios';
import { chaves } from './chaves';

/**
 * `GET /perfis/eu`, só com a sessão autenticada. `perfil` é `null` enquanto
 * não há resposta, com erro e quando a API responde 404 (perfil ainda não
 * salvo). Só `semPerfil` diz que é o 404: sem conexão a consulta fica pausada
 * (sem dado e sem erro) e não pode ser lida como "sem perfil".
 */
export function useMeuPerfil() {
  const cliente = useCliente();
  const { status } = useSessao();
  const consulta = useQuery<MeuPerfil | null, Error>({
    queryKey: chaves.meuPerfil(),
    queryFn: () => obterMeuPerfil(cliente),
    enabled: status === 'autenticado',
  });
  return {
    perfil: consulta.data ?? null,
    /** A API respondeu 404: o perfil ainda não foi salvo. */
    semPerfil: consulta.isSuccess && consulta.data === null,
    /** Ainda sem resposta: buscando, pausada (offline) ou sem sessão. */
    carregando: consulta.isPending,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

/** Sessão em que o `PUT` começou (ver `Sessao.geracao`). */
interface ContextoDoSalvar {
  readonly geracao: number;
}

/**
 * `PUT /perfis/eu`. No sucesso grava o perfil devolvido em `meuPerfil` (a
 * tela já mostra o dado novo) e invalida a chave para a próxima leitura vir
 * do servidor. Se a sessão mudou enquanto o `PUT` estava no ar (saída,
 * expiração ou outra conta), a resposta não entra no cache.
 */
export function useSalvarPerfil() {
  const cliente = useCliente();
  const sessao = useSessao();
  const queryClient = useQueryClient();
  return useMutation<MeuPerfil, Error, EntradaDePerfil, ContextoDoSalvar>({
    mutationFn: (entrada) => salvarMeuPerfil(cliente, entrada),
    onMutate: () => ({ geracao: sessao.geracao() }),
    onSuccess: (perfil, _entrada, contexto) => {
      if (contexto.geracao !== sessao.geracao()) {
        return undefined;
      }
      queryClient.setQueryData(chaves.meuPerfil(), perfil);
      return queryClient.invalidateQueries({ queryKey: chaves.meuPerfil() });
    },
  });
}

/** `GET /perfis/:contaId`. 404 sobe como `ErroDaApi` `nao_encontrado`. */
export function usePerfilPublico(contaId: string) {
  const cliente = useCliente();
  const consulta = useQuery<PerfilPublico, Error>({
    queryKey: chaves.perfil(contaId),
    queryFn: () => obterPerfilPublico(cliente, contaId),
  });
  return {
    perfil: consulta.data ?? null,
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

/**
 * Vários `GET /perfis/:contaId` (ex.: o nome de cada freelancer nas
 * candidaturas recebidas), sobre `chaves.perfil(id)`, a mesma chave de
 * `usePerfilPublico`: o perfil que o detalhe já buscou vem do cache. Perfil
 * 404 (inexistente ou incompleto) vira `null` ("Perfil indisponível"); id
 * ainda sem resposta fica fora do mapa (ver `MapaPorId`).
 */
export function usePerfisPublicos(
  contaIds: readonly string[],
): MapaPorId<PerfilPublico> {
  return useConsultasPorIds<PerfilPublico>(
    contaIds,
    chaves.perfil,
    obterPerfilPublico,
  );
}
