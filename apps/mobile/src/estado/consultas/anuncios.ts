import { useQuery } from '@tanstack/react-query';
import { obterServico } from '../../api/servicos';
import type { Servico, Trampo } from '../../api/tipos';
import { obterTrampo } from '../../api/trampos';
import { useCliente } from '../sessao';
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
