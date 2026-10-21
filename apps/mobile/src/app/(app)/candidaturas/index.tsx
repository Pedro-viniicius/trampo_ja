import { useRouter } from 'expo-router';
import type { MinhaCandidatura } from '../../../api/tipos';
import { useConexao } from '../../../estado/conexao';
import { useTramposPorIds } from '../../../estado/consultas/anuncios';
import { useMinhasCandidaturas } from '../../../estado/consultas/candidaturas';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import { formatarCentavos, formatarDataHora } from '../../../estado/formatacao';
import {
  type MinhaCandidaturaParaExibir,
  MinhasCandidaturas,
} from '../../../telas';

/** Da mais recente para a mais antiga (`criadaEm` é ISO 8601). */
function maisRecentesPrimeiro(
  candidaturas: readonly MinhaCandidatura[],
): MinhaCandidatura[] {
  return [...candidaturas].sort(
    (a, b) => Date.parse(b.criadaEm) - Date.parse(a.criadaEm),
  );
}

export default function RotaDasMinhasCandidaturas() {
  const router = useRouter();
  const { online } = useConexao();
  const consulta = useMinhasCandidaturas();
  const ordenadas = maisRecentesPrimeiro(consulta.candidaturas ?? []);
  // Título de cada trampo. `null` no mapa (404) e id ainda fora do mapa
  // (carregando ou falha que não é 404) viram o mesmo "Trampo indisponível":
  // a lista não espera os títulos nem quebra por causa de um deles.
  const trampos = useTramposPorIds(ordenadas.map((c) => c.trampoId));

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const lista = estadoDeConsulta(
    {
      dados: consulta.candidaturas === null ? null : ordenadas,
      erro: consulta.erro,
      recarregar: consulta.recarregar,
    },
    (itens): MinhaCandidaturaParaExibir[] =>
      itens.map((c) => ({
        id: c.id,
        trampoId: c.trampoId,
        tituloDoTrampo: trampos.get(c.trampoId)?.titulo ?? null,
        valorPropostoFormatado: formatarCentavos(c.valorPropostoCentavos),
        dataFormatada: formatarDataHora(c.criadaEm),
        status: c.status,
      })),
  );

  return (
    <MinhasCandidaturas
      lista={lista}
      semConexao={!online}
      onAbrirTrampo={(trampoId) =>
        router.push({ pathname: '/trampos/[id]', params: { id: trampoId } })
      }
      onBuscarTrampos={() => router.push('/buscar')}
      onVoltar={voltar}
    />
  );
}
