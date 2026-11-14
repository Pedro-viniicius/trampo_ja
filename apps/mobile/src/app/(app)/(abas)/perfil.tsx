import { useRouter } from 'expo-router';
import { AccessibilityInfo } from 'react-native';
import { notaDoResumo } from '../../../estado/avaliacoes-para-exibir';
import { useConexao } from '../../../estado/conexao';
import { useMeusTrampos } from '../../../estado/consultas/anuncios';
import { useResumosDeAvaliacoes } from '../../../estado/consultas/avaliacoes';
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
 * & minicursos (CA81), Conta e privacidade e Sair. A nota (CA97) é a da própria
 * conta como freela: o app não conhece o id dela (ADR-003), então vem do
 * `freelancerId` das candidaturas (quem foi avaliado como freela se candidatou).
 */
function PerfilDoFreela() {
  const router = useRouter();
  const perfil = useMeuPerfilParaExibir('contratante');
  const { candidaturas } = useMinhasCandidaturas();
  const meuId = candidaturas?.[0]?.freelancerId ?? '';
  const { resumos } = useResumosDeAvaliacoes([meuId]);
  const nota = notaDoResumo(resumos.get(meuId), 'freela');
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
      nota={nota}
      onVerAvaliacoes={() =>
        router.push({
          pathname: '/avaliacoes/[contaId]',
          params: { contaId: meuId, papel: 'freela' },
        })
      }
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

/**
 * Perfil da empresa (contratante): nome, cidade, sobre, a nota e as ações de
 * conta. O id da conta vem do `autorId` dos trampos dela (`/trampos/meus`, a
 * mesma chave de cache de Demandas e do Início); quem nunca publicou não foi
 * avaliado como contratante.
 */
function PerfilDoContratante() {
  const router = useRouter();
  const perfil = useMeuPerfilParaExibir('freela');
  const { trampos } = useMeusTrampos();
  const meuId = trampos?.[0]?.autorId ?? '';
  const { resumos } = useResumosDeAvaliacoes([meuId]);
  const nota = notaDoResumo(resumos.get(meuId), 'contratante');
  return (
    <PerfilDaEmpresa
      {...perfil}
      nota={nota}
      // Sem trampos não há id (nem avaliação): a linha não aparece.
      onVerAvaliacoes={
        meuId === ''
          ? undefined
          : () =>
              router.push({
                pathname: '/avaliacoes/[contaId]',
                params: { contaId: meuId, papel: 'contratante' },
              })
      }
    />
  );
}
