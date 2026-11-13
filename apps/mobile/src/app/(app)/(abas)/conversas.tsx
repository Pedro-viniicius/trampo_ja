import { useIsFocused, useRouter } from 'expo-router';
import { useConexao } from '../../../estado/conexao';
import { useConversas } from '../../../estado/consultas/conversas';
import { usePerfisPublicos } from '../../../estado/consultas/perfil';
import { conversaParaExibir } from '../../../estado/conversa';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import { useModo } from '../../../estado/modo';
import { ListaDeConversas } from '../../../telas';

/**
 * Aba Conversas (CA12): a lista vem de `GET /conversas`, já na ordem da
 * última atividade. Recarrega a cada 30 s só com a aba focada e, ao voltar a
 * ela, se o dado estiver velho (D20); fora de foco mostra o que está no
 * cache. O nome de cada pessoa vem do perfil público; o 404 (ou o perfil
 * ainda carregando) vira "Perfil indisponível" sem derrubar a lista.
 */
export default function RotaDasConversas() {
  const router = useRouter();
  const ativa = useIsFocused();
  const { online } = useConexao();
  const { modo } = useModo();
  const consulta = useConversas({ ativa });
  const perfis = usePerfisPublicos(
    (consulta.conversas ?? []).map((c) => c.outroUsuarioId),
  );

  // Sem conexão a consulta fica pausada (sem dado nem erro): o estado é
  // "carregando", nunca o vazio por engano.
  const agora = new Date();
  const lista = estadoDeConsulta(
    {
      dados: consulta.conversas,
      erro: consulta.erro,
      recarregar: consulta.recarregar,
    },
    (conversas) => conversas.map((c) => conversaParaExibir(c, perfis, agora)),
  );

  return (
    <ListaDeConversas
      lista={lista}
      modo={modo}
      semConexao={!online}
      onAbrir={(id) =>
        router.push({ pathname: '/conversas/[id]', params: { id } })
      }
    />
  );
}
