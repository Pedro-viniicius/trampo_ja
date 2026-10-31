import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { Servico } from '../../../api/tipos';
import { Aviso, Toast } from '../../../componentes';
import {
  type AnuncioDaFolha,
  acoesDoAnuncio,
  type MotivoDaSaida,
  useAcoesDoAnuncio,
} from '../../../estado/acoes-do-anuncio';
import {
  avisarAoVoltar,
  type ChaveDeAvisoDeRetorno,
  useAvisoDeRetorno,
} from '../../../estado/aviso-de-retorno';
import { useConexao } from '../../../estado/conexao';
import { useConversar } from '../../../estado/consultas/abrir-conversa';
import {
  useMeusServicos,
  useServico,
} from '../../../estado/consultas/anuncios';
import { useCategorias } from '../../../estado/consultas/busca';
import { usePerfilPublico } from '../../../estado/consultas/perfil';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import {
  formatarCentavos,
  rotuloDaCategoria,
} from '../../../estado/formatacao';
import { useNavegarUmaVez } from '../../../estado/navegar-uma-vez';
import { useSessao } from '../../../estado/sessao';
import {
  DetalheDoServico,
  type PropsDaFolhaDeAcoes,
  RodapeDoServico,
  type ServicoParaExibir,
} from '../../../telas';
import { textos } from '../../../textos/pt-BR';

const CARREGANDO = { situacao: 'carregando' } as const;

const SEM_ACAO = () => undefined;

/**
 * Folha fechada: o detalhe só mostra "Mais opções" com uma `folha` em mãos, e
 * a do hook só existe depois do primeiro `abrir`.
 */
function folhaFechada(
  anuncio: AnuncioDaFolha,
  online: boolean,
): PropsDaFolhaDeAcoes {
  return {
    visivel: false,
    titulo: anuncio.titulo,
    tipo: anuncio.tipo,
    ...acoesDoAnuncio(anuncio, online),
    processando: null,
    onEditar: SEM_ACAO,
    onEncerrar: SEM_ACAO,
    onExcluir: SEM_ACAO,
    onFechar: SEM_ACAO,
  };
}

/** O aviso que o detalhe deixa à tela anterior quando o serviço some. */
function avisoDaSaida(motivo: MotivoDaSaida): ChaveDeAvisoDeRetorno {
  return motivo === 'excluido' ? 'servico_excluido' : 'ja_nao_existe';
}

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
  const { geracao } = useSessao();
  const abrirEdicao = useNavegarUmaVez();
  const consultaDoAutor = usePerfilPublico(servico.autorId);
  const autor = estadoDeConsulta(
    { ...consultaDoAutor, dados: consultaDoAutor.perfil },
    (perfil) => perfil,
  );
  // D22: "Conversar" para quem não é o autor. Lista que falhou (ou pausada
  // sem conexão) conta como "não é meu": a API decide o vínculo.
  const meusServicos = useMeusServicos();
  const ehMeu =
    meusServicos.servicos?.some((meu) => meu.id === servico.id) ?? false;
  const conversa = useConversar(servico.autorId, semConexao);

  // "Mais opções" (CA33), só para o autor. Excluir não mostra o toast do hook:
  // o aviso vai para a tela de destino, e esta para de ouvir antes de avisar
  // (senão consumiria o próprio aviso).
  // A folha aberta segue o detalhe vivo (`anuncioAtual`, CA61): o título de
  // uma edição que chegou depois da abertura aparece sem reabrir.
  const anuncio: AnuncioDaFolha = {
    tipo: 'servico',
    id: servico.id,
    titulo: servico.titulo,
  };
  const [saida, setSaida] = useState<MotivoDaSaida | null>(null);
  const acoes = useAcoesDoAnuncio({
    aoEditar: (aberto) =>
      abrirEdicao({
        pathname: '/servicos/editar/[id]',
        params: { id: aberto.id },
      }),
    aoExcluir: (_aberto, motivo) => setSaida(motivo),
    anuncioAtual: () => anuncio,
  });
  const aviso = useAvisoDeRetorno(useIsFocused() && saida === null);
  const saiu = useRef(false);
  const voltarRef = useRef(onVoltar);
  voltarRef.current = onVoltar;
  useEffect(() => {
    if (saida === null || saiu.current) {
      return;
    }
    saiu.current = true;
    avisarAoVoltar(avisoDaSaida(saida), geracao());
    voltarRef.current();
  }, [saida, geracao]);

  // Excluído: a lista já não traz o serviço, e o "Conversar" não pisca antes de sair.
  const mostrarConversar = !meusServicos.carregando && !ehMeu && saida === null;
  return (
    <DetalheDoServico
      estado={estado}
      autor={autor}
      rodape={
        mostrarConversar ? (
          <>
            {conversa.falha ? (
              <Aviso variante="erro" texto={conversa.falha} />
            ) : null}
            <RodapeDoServico
              conversar={conversa.estado}
              onConversar={conversa.conversar}
            />
          </>
        ) : undefined
      }
      sobreposicao={
        <Toast
          visivel={aviso.texto !== null}
          mensagem={aviso.texto ?? ''}
          onFechar={aviso.limpar}
          rotuloFechar={textos.gerais.toastFechar}
        />
      }
      folha={
        ehMeu
          ? // O botão "Mais opções" fala do título de agora, não do da última
            // abertura da folha.
            {
              ...(acoes.folha ?? folhaFechada(anuncio, !semConexao)),
              titulo: anuncio.titulo,
            }
          : undefined
      }
      onMaisOpcoes={ehMeu ? () => acoes.abrir(anuncio) : undefined}
      semConexao={semConexao}
      onVoltar={onVoltar}
      onAbrirAutor={(contaId) =>
        router.push({ pathname: '/perfis/[contaId]', params: { contaId } })
      }
    />
  );
}
