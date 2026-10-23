import { useRouter } from 'expo-router';
import { useConexao } from '../../../estado/conexao';
import { useSair } from '../../../estado/consultas/conta';
import { useMeuPerfil } from '../../../estado/consultas/perfil';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import { Perfil, type PerfilParaExibir } from '../../../telas';
import { textos } from '../../../textos/pt-BR';

const SEM_PERFIL: PerfilParaExibir = {
  nome: '',
  cidade: '',
  descricao: null,
  habilidades: [],
};

/** Campos que ainda faltam, com os rótulos já traduzidos. */
function camposQueFaltam(perfil: PerfilParaExibir): string[] {
  const falta: string[] = [];
  if (perfil.nome.trim() === '') falta.push(textos.perfil.camposNome);
  if (perfil.cidade.trim() === '') falta.push(textos.perfil.camposCidade);
  if (perfil.habilidades.length === 0) {
    falta.push(textos.perfil.camposHabilidades);
  }
  return falta;
}

export default function RotaDoMeuPerfil() {
  const router = useRouter();
  const { online } = useConexao();
  const consulta = useMeuPerfil();
  const sair = useSair();

  // 404 em `GET /perfis/eu`: o perfil ainda não foi salvo (não é erro).
  // Sem conexão a consulta fica pausada e não conta como "sem perfil".
  const { semPerfil } = consulta;

  const estado = semPerfil
    ? ({ situacao: 'ok', dados: SEM_PERFIL } as const)
    : estadoDeConsulta(
        { ...consulta, dados: consulta.perfil },
        (perfil): PerfilParaExibir => ({
          nome: perfil.nome,
          cidade: perfil.cidade,
          descricao: perfil.descricao,
          habilidades: perfil.habilidades,
        }),
      );

  const faltam =
    estado.situacao === 'ok' &&
    (semPerfil || consulta.perfil?.completo === false)
      ? camposQueFaltam(estado.dados)
      : [];

  return (
    <Perfil
      proprio
      estado={estado}
      perfilIncompleto={faltam.length > 0 ? { falta: faltam } : null}
      semConexao={!online}
      onEditar={() => router.push('/perfil/editar')}
      onMinhasCandidaturas={() => router.push('/candidaturas')}
      onMeusTrampos={() =>
        router.push({ pathname: '/meus-anuncios', params: { tipo: 'trampo' } })
      }
      onMeusServicos={() =>
        router.push({
          pathname: '/meus-anuncios',
          params: { tipo: 'servico' },
        })
      }
      onContaEPrivacidade={() => router.push('/perfil/conta')}
      onSair={() => sair.mutate()}
    />
  );
}
