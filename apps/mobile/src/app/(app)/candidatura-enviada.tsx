import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { MinhaCandidatura, PerfilPublico, Trampo } from '../../api/tipos';
import { chaves } from '../../estado/consultas/chaves';
import { formatarCentavos, formatarData } from '../../estado/formatacao';
import {
  CandidaturaEnviada,
  type ResumoDaCandidaturaEnviada,
} from '../../telas';

/**
 * Candidatura enviada (CA80), aberta pelo detalhe do trampo depois do 201 do
 * `POST /trampos/:id/candidaturas`, no lugar do toast. O resumo sai só do
 * cache, sem requisição: o trampo (título e prazo), o perfil público do autor
 * (nome) e Minhas candidaturas (o valor proposto; sem ele, o valor do
 * trampo). Sem o trampo no cache, a tela mostra só o título e os passos.
 */
export default function RotaDaCandidaturaEnviada() {
  const { trampoId } = useLocalSearchParams<{
    trampoId?: string | string[];
  }>();
  const id = Array.isArray(trampoId) ? (trampoId[0] ?? '') : (trampoId ?? '');
  const router = useRouter();
  const resumo = useResumoDoCache(id);

  return (
    <CandidaturaEnviada
      resumo={resumo}
      onVerMeusTrampos={() => router.dismissTo('/meus-trampos')}
      onBuscarMais={() => router.dismissTo('/buscar-trampos')}
      onVoltar={() => {
        if (router.canGoBack()) {
          router.back();
        } else if (id !== '') {
          router.replace({ pathname: '/trampos/[id]', params: { id } });
        } else {
          router.replace('/');
        }
      }}
    />
  );
}

/** Resumo do trampo lido do cache; `null` se o trampo não estiver lá. */
function useResumoDoCache(id: string): ResumoDaCandidaturaEnviada | null {
  const queryClient = useQueryClient();
  if (id === '') {
    return null;
  }
  const trampo = queryClient.getQueryData<Trampo>(chaves.trampo(id));
  if (trampo === undefined) {
    return null;
  }
  const autor = queryClient.getQueryData<PerfilPublico>(
    chaves.perfil(trampo.autorId),
  );
  const minha = queryClient
    .getQueryData<readonly MinhaCandidatura[]>(chaves.minhasCandidaturas())
    ?.find((candidatura) => candidatura.trampoId === id);
  return {
    titulo: trampo.titulo,
    autor: autor?.nome ?? null,
    prazoFormatado: trampo.prazo === null ? null : formatarData(trampo.prazo),
    valorFormatado: formatarCentavos(
      minha?.valorPropostoCentavos ?? trampo.valorCentavos,
    ),
  };
}
