import { useQuery } from '@tanstack/react-query';
import type {
  CandidaturaRecebida,
  Criado,
  EntradaDeCandidatura,
  MinhaCandidatura,
  ResultadoDoAceite,
  StatusDaCandidatura,
} from '../../api/tipos';
import {
  aceitarCandidatura,
  candidatar,
  listarCandidaturasDoTrampo,
  listarMinhasCandidaturas,
  retirarCandidatura,
} from '../../api/trampos';
import { useCliente, useSessao } from '../sessao';
import { useMutacaoComInvalidacao } from './anuncios';
import { chaves } from './chaves';

/**
 * `GET /candidaturas/minhas`, só com a sessão autenticada. `candidaturas` é
 * `null` enquanto não há resposta (inclusive offline, com a consulta
 * pausada).
 */
export function useMinhasCandidaturas() {
  const cliente = useCliente();
  const { status } = useSessao();
  const consulta = useQuery<readonly MinhaCandidatura[], Error>({
    queryKey: chaves.minhasCandidaturas(),
    queryFn: () => listarMinhasCandidaturas(cliente),
    enabled: status === 'autenticado',
  });
  return {
    candidaturas: consulta.data ?? null,
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

export interface OpcoesDasRecebidas {
  /**
   * Só consulta quando for verdadeiro (ex.: o rodapé, quando a pessoa é a
   * autora do trampo). Padrão: `true`.
   */
  readonly habilitada?: boolean;
}

/**
 * `GET /trampos/:id/candidaturas`, só com a sessão autenticada e
 * `habilitada`. A API responde 404 para quem não é o autor (e para o trampo
 * inexistente): sobe como `ErroDaApi`. `candidaturas` é `null` enquanto não
 * há resposta.
 */
export function useCandidaturasRecebidas(
  trampoId: string,
  { habilitada = true }: OpcoesDasRecebidas = {},
) {
  const cliente = useCliente();
  const { status } = useSessao();
  const consulta = useQuery<readonly CandidaturaRecebida[], Error>({
    queryKey: chaves.candidaturasRecebidas(trampoId),
    queryFn: () => listarCandidaturasDoTrampo(cliente, trampoId),
    enabled: habilitada && status === 'autenticado',
  });
  return {
    candidaturas: consulta.data ?? null,
    carregando: consulta.isLoading,
    erro: consulta.error,
    recarregar: () => consulta.refetch(),
  };
}

/**
 * `POST /trampos/:id/candidaturas` (CA8). No sucesso recarrega Minhas
 * candidaturas antes de resolver: o selo "Candidatura enviada" já aparece
 * quando a folha fecha. 409 (`perfil_incompleto`, `candidatura_duplicada`,
 * `autor_nao_pode_candidatar`, `trampo_nao_aberto`, `conflito_de_versao`)
 * sobe como `ErroDaApi`. Ver `useMutacaoComInvalidacao`.
 */
export function useCandidatar(trampoId: string) {
  return useMutacaoComInvalidacao<
    Criado<StatusDaCandidatura>,
    EntradaDeCandidatura
  >((cliente, entrada) => candidatar(cliente, trampoId, entrada), {
    essenciais: [chaves.minhasCandidaturas()],
  });
}

/**
 * `POST /trampos/:id/candidaturas/:cid/aceitar` (CA10); a entrada do
 * `mutate` é o id da candidatura. No sucesso recarrega o trampo (agora em
 * andamento) e as candidaturas recebidas (aceita e recusadas), e invalida
 * sem esperar Meus trampos, os recentes de trampos e toda busca em cache.
 * Sem nova tentativa: os 409
 * (`trampo_nao_aberto`, `candidatura_nao_pendente`, `conflito_de_versao`)
 * sobem como `ErroDaApi` e a rota decide. Ver `useMutacaoComInvalidacao`.
 */
export function useAceitarCandidatura(trampoId: string) {
  return useMutacaoComInvalidacao<ResultadoDoAceite, string>(
    (cliente, candidaturaId) =>
      aceitarCandidatura(cliente, trampoId, candidaturaId),
    {
      essenciais: [
        chaves.trampo(trampoId),
        chaves.candidaturasRecebidas(trampoId),
      ],
      demais: [
        chaves.meusTrampos(),
        chaves.recentes('trampos'),
        chaves.todasAsBuscas(),
      ],
    },
  );
}

/**
 * `DELETE /candidaturas/:id` (CA34); a entrada do `mutate` é o id da
 * candidatura. No sucesso recarrega Minhas candidaturas antes de resolver: a
 * linha sai da lista e o rodapé do trampo volta a "Candidatar-se". 409
 * `candidatura_nao_pendente` e 404 sobem como `ErroDaApi`; a rota recarrega a
 * lista. Ver `useMutacaoComInvalidacao`.
 */
export function useRetirarCandidatura() {
  return useMutacaoComInvalidacao<void, string>(retirarCandidatura, {
    essenciais: [chaves.minhasCandidaturas()],
  });
}
