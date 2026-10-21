import { useLocalSearchParams, useRouter } from 'expo-router';
import { useConexao } from '../../../estado/conexao';
import { usePerfilPublico } from '../../../estado/consultas/perfil';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import { Perfil, type PerfilParaExibir } from '../../../telas';

/** Perfil de outra pessoa: só leitura, sem editar nem sair. */
export default function RotaDoPerfilPublico() {
  const { contaId } = useLocalSearchParams<{ contaId: string | string[] }>();
  const id = Array.isArray(contaId) ? (contaId[0] ?? '') : (contaId ?? '');
  const router = useRouter();
  const { online } = useConexao();
  const consulta = usePerfilPublico(id);

  const estado = estadoDeConsulta(
    { ...consulta, dados: consulta.perfil },
    (perfil): PerfilParaExibir => ({
      nome: perfil.nome,
      cidade: perfil.cidade,
      descricao: perfil.descricao,
      habilidades: perfil.habilidades,
    }),
  );

  return (
    <Perfil
      proprio={false}
      estado={estado}
      semConexao={!online}
      onVoltar={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      }}
    />
  );
}
