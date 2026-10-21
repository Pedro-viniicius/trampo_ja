import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Trampo } from '../../../api/tipos';
import { useConexao } from '../../../estado/conexao';
import { useTrampo } from '../../../estado/consultas/anuncios';
import { useCategorias } from '../../../estado/consultas/busca';
import { usePerfilPublico } from '../../../estado/consultas/perfil';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import {
  formatarCentavos,
  formatarData,
  rotuloDaCategoria,
} from '../../../estado/formatacao';
import { DetalheDoTrampo, type TrampoParaExibir } from '../../../telas';

const CARREGANDO = { situacao: 'carregando' } as const;

export default function RotaDoTrampo() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const idDoTrampo = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const router = useRouter();
  const { online } = useConexao();
  const { categorias } = useCategorias();
  const consulta = useTrampo(idDoTrampo);

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const estado = estadoDeConsulta(
    { ...consulta, dados: consulta.trampo },
    (trampo): TrampoParaExibir => ({
      titulo: trampo.titulo,
      descricao: trampo.descricao,
      categoria: rotuloDaCategoria(categorias, trampo.categoria),
      cidade: trampo.cidade,
      valorFormatado: formatarCentavos(trampo.valorCentavos),
      prazoFormatado: trampo.prazo === null ? null : formatarData(trampo.prazo),
      status: trampo.status,
    }),
  );

  if (consulta.trampo === null) {
    return (
      <DetalheDoTrampo
        estado={estado}
        autor={CARREGANDO}
        semConexao={!online}
        onVoltar={voltar}
        onAbrirAutor={() => undefined}
      />
    );
  }
  return (
    <TrampoComAutor
      trampo={consulta.trampo}
      estado={estado}
      semConexao={!online}
      onVoltar={voltar}
    />
  );
}

/**
 * Só existe depois que o trampo carregou: o autor é buscado a partir do
 * `autorId`, e um 404 dele (`vazio`) não derruba o detalhe.
 */
function TrampoComAutor({
  trampo,
  estado,
  semConexao,
  onVoltar,
}: {
  trampo: Trampo;
  estado: ReturnType<typeof estadoDeConsulta<Trampo, TrampoParaExibir>>;
  semConexao: boolean;
  onVoltar: () => void;
}) {
  const router = useRouter();
  const consultaDoAutor = usePerfilPublico(trampo.autorId);
  const autor = estadoDeConsulta(
    { ...consultaDoAutor, dados: consultaDoAutor.perfil },
    (perfil) => perfil,
  );
  return (
    <DetalheDoTrampo
      estado={estado}
      autor={autor}
      semConexao={semConexao}
      onVoltar={onVoltar}
      onAbrirAutor={(contaId) =>
        router.push({ pathname: '/perfis/[contaId]', params: { contaId } })
      }
    />
  );
}
