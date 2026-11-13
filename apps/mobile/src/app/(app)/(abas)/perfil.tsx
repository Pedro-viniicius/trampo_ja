import { useRouter } from 'expo-router';
import { AccessibilityInfo } from 'react-native';
import { useConexao } from '../../../estado/conexao';
import { useMinhasCandidaturas } from '../../../estado/consultas/candidaturas';
import { useSair } from '../../../estado/consultas/conta';
import { useMeuPerfil } from '../../../estado/consultas/perfil';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import { type Modo, useModo } from '../../../estado/modo';
import {
  type ContagensDoPerfil,
  Perfil,
  PerfilDaEmpresa,
  type PerfilParaExibir,
} from '../../../telas';
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

/**
 * O próprio perfil, comum aos dois modos: o estado da tela, os campos que
 * faltam e as ações de conta. A troca de modo (CA75) muda as abas na hora,
 * grava o modo no aparelho (sem API) e leva ao Início do outro modo.
 */
function useMeuPerfilParaExibir(outroModo: Modo) {
  const router = useRouter();
  const { online } = useConexao();
  const consulta = useMeuPerfil();
  const sair = useSair();
  const { definirModo } = useModo();

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

  return {
    estado,
    perfilIncompleto: faltam.length > 0 ? { falta: faltam } : null,
    semConexao: !online,
    onEditar: () => router.push('/perfil/editar'),
    onContaEPrivacidade: () => router.push('/perfil/conta'),
    onSair: () => sair.mutate(),
    onTrocarModo: () => {
      void definirModo(outroModo);
      // O leitor de tela anuncia o modo novo (spec, Acessibilidade).
      AccessibilityInfo.announceForAccessibility(
        outroModo === 'contratante'
          ? textos.modo.ativoContratante
          : textos.modo.ativoFreela,
      );
      router.navigate('/');
    },
  };
}

/** Perfil: o do freela ou o da empresa, pelo modo (CA83). */
export default function RotaDoMeuPerfil() {
  const { modo } = useModo();
  return modo === 'contratante' ? <PerfilDoContratante /> : <PerfilDoFreela />;
}

/**
 * Perfil do freela: cartão de modo, os números de `/candidaturas/minhas` (a
 * mesma chave de cache de Meus trampos), Editar perfil, Meus serviços, Dicas
 * & minicursos (CA81), Conta e privacidade e Sair.
 */
function PerfilDoFreela() {
  const router = useRouter();
  const perfil = useMeuPerfilParaExibir('contratante');
  const { candidaturas } = useMinhasCandidaturas();
  const contagens: ContagensDoPerfil | null =
    candidaturas === null
      ? null
      : {
          enviadas: candidaturas.length,
          confirmadas: candidaturas.filter((c) => c.status === 'aceita').length,
        };

  return (
    <Perfil
      proprio
      {...perfil}
      contagens={contagens}
      onMeusServicos={() =>
        router.push({
          pathname: '/meus-anuncios',
          params: { tipo: 'servico' },
        })
      }
      onDicas={() => router.push('/dicas')}
    />
  );
}

/** Perfil da empresa (contratante): nome, cidade, sobre e as ações de conta. */
function PerfilDoContratante() {
  const perfil = useMeuPerfilParaExibir('freela');
  return <PerfilDaEmpresa {...perfil} />;
}
