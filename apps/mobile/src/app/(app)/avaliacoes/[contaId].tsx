import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  notaDoResumo,
  papelDaUrl,
} from '../../../estado/avaliacoes-para-exibir';
import { useConexao } from '../../../estado/conexao';
import {
  useAvaliacoesRecebidas,
  useResumosDeAvaliacoes,
} from '../../../estado/consultas/avaliacoes';
import { usePerfisPublicos } from '../../../estado/consultas/perfil';
import { mensagemDoErro } from '../../../estado/erros';
import { formatarDataHora } from '../../../estado/formatacao';
import {
  type AvaliacaoParaExibir,
  type Estado,
  ListaDeAvaliacoes,
} from '../../../telas';

/**
 * Avaliações recebidas por uma conta, no papel de `?papel=` (`freela` se
 * faltar), das mais recentes para as mais antigas, 20 por página (CA90). A
 * média e o total vêm do resumo (um pedido), e o nome de quem avaliou de
 * `GET /perfis/:id`, com cache; perfil 404 vira "Perfil indisponível". O
 * comentário só existe nesta tela e no cache em memória (CA93).
 */
export default function RotaDasAvaliacoes() {
  const { contaId, papel: papelDaRota } = useLocalSearchParams<{
    contaId: string | string[];
    papel?: string | string[];
  }>();
  const id = Array.isArray(contaId) ? (contaId[0] ?? '') : (contaId ?? '');
  const papel = papelDaUrl(papelDaRota);
  const router = useRouter();
  const { online } = useConexao();
  const consulta = useAvaliacoesRecebidas(id, papel);
  const { resumos } = useResumosDeAvaliacoes([id]);
  const autores = usePerfisPublicos(
    consulta.avaliacoes.map((avaliacao) => avaliacao.avaliadorId),
  );

  let lista: Estado<readonly AvaliacaoParaExibir[]>;
  if (consulta.avaliacoes.length > 0) {
    lista = {
      situacao: 'ok',
      dados: consulta.avaliacoes.map(
        (avaliacao, indice): AvaliacaoParaExibir => ({
          // A mesma pessoa pode avaliar a conta em dois trampos na mesma data:
          // a posição (a lista só cresce no fim) desempata a chave.
          id: `${indice}|${avaliacao.criadaEm}|${avaliacao.avaliadorId}`,
          autor: autores.get(avaliacao.avaliadorId)?.nome ?? null,
          nota: avaliacao.nota,
          papelDoAvaliado: papel,
          destaques: avaliacao.destaques,
          comentario: avaliacao.comentario,
          dataFormatada: formatarDataHora(avaliacao.criadaEm),
        }),
      ),
    };
  } else if (consulta.erro !== null) {
    lista = {
      situacao: 'erro',
      mensagem: mensagemDoErro(consulta.erro),
      onTentarDeNovo: () => {
        void consulta.recarregar();
      },
    };
  } else if (consulta.carregando || !online) {
    // Sem conexão e sem nada carregado a consulta fica pausada.
    lista = { situacao: 'carregando' };
  } else {
    lista = { situacao: 'vazio' };
  }

  return (
    <ListaDeAvaliacoes
      resumo={notaDoResumo(resumos.get(id), papel)}
      lista={lista}
      semConexao={!online}
      carregarMais={
        consulta.temMais
          ? {
              carregando: consulta.carregandoMais,
              ...(consulta.erroAoCarregarMais !== null && {
                erro: mensagemDoErro(consulta.erroAoCarregarMais),
              }),
              onCarregarMais: () => {
                void consulta.carregarMais();
              },
            }
          : undefined
      }
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
