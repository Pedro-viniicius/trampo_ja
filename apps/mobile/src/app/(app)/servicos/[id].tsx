import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Servico } from '../../../api/tipos';
import { useConexao } from '../../../estado/conexao';
import { useServico } from '../../../estado/consultas/anuncios';
import { useCategorias } from '../../../estado/consultas/busca';
import { usePerfilPublico } from '../../../estado/consultas/perfil';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import {
  formatarCentavos,
  rotuloDaCategoria,
} from '../../../estado/formatacao';
import { DetalheDoServico, type ServicoParaExibir } from '../../../telas';

const CARREGANDO = { situacao: 'carregando' } as const;

export default function RotaDoServico() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const idDoServico = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const router = useRouter();
  const { online } = useConexao();
  const { categorias } = useCategorias();
  const consulta = useServico(idDoServico);

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const estado = estadoDeConsulta(
    { ...consulta, dados: consulta.servico },
    (servico): ServicoParaExibir => ({
      titulo: servico.titulo,
      descricao: servico.descricao,
      categoria: rotuloDaCategoria(categorias, servico.categoria),
      cidade: servico.cidade,
      precoBaseFormatado: formatarCentavos(servico.precoBaseCentavos),
    }),
  );

  if (consulta.servico === null) {
    return (
      <DetalheDoServico
        estado={estado}
        autor={CARREGANDO}
        semConexao={!online}
        onVoltar={voltar}
        onAbrirAutor={() => undefined}
      />
    );
  }
  return (
    <ServicoComAutor
      servico={consulta.servico}
      estado={estado}
      semConexao={!online}
      onVoltar={voltar}
    />
  );
}

/**
 * Só existe depois que o serviço carregou: o autor é buscado a partir do
 * `autorId`, e um 404 dele (`vazio`) não derruba o detalhe.
 */
function ServicoComAutor({
  servico,
  estado,
  semConexao,
  onVoltar,
}: {
  servico: Servico;
  estado: ReturnType<typeof estadoDeConsulta<Servico, ServicoParaExibir>>;
  semConexao: boolean;
  onVoltar: () => void;
}) {
  const router = useRouter();
  const consultaDoAutor = usePerfilPublico(servico.autorId);
  const autor = estadoDeConsulta(
    { ...consultaDoAutor, dados: consultaDoAutor.perfil },
    (perfil) => perfil,
  );
  return (
    <DetalheDoServico
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
