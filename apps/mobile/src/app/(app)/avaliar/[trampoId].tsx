import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { DESTAQUES_POR_PAPEL } from '../../../api/avaliacoes';
import { ehErroDaApi } from '../../../api/erros';
import type {
  DestaqueDeAvaliacao,
  PapelDoAvaliado,
  Trampo,
} from '../../../api/tipos';
import { papelDaUrl } from '../../../estado/avaliacoes-para-exibir';
import {
  avisarAoVoltar,
  type ChaveDeAvisoDeRetorno,
} from '../../../estado/aviso-de-retorno';
import { useConexao } from '../../../estado/conexao';
import { useTrampo } from '../../../estado/consultas/anuncios';
import {
  ehAvaliacaoJaFeita,
  useAvaliar,
  useDefinirFavorito,
  useFavoritos,
} from '../../../estado/consultas/avaliacoes';
import { useCandidaturasRecebidas } from '../../../estado/consultas/candidaturas';
import { usePerfilPublico } from '../../../estado/consultas/perfil';
import { mensagemDoErro } from '../../../estado/erros';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import { formatarDataHora } from '../../../estado/formatacao';
import { useSessao } from '../../../estado/sessao';
import { type AlvoDaAvaliacao, Avaliar, type Estado } from '../../../telas';

const SEM_ACAO = () => undefined;

/** Só os destaques que a API aceita para o papel (a tela já oferece só esses). */
function destaquesValidos(
  papel: PapelDoAvaliado,
  escolhidos: readonly string[],
): DestaqueDeAvaliacao[] {
  const aceitos: readonly string[] = DESTAQUES_POR_PAPEL[papel];
  return escolhidos.filter((codigo): codigo is DestaqueDeAvaliacao =>
    aceitos.includes(codigo),
  );
}

/**
 * Avaliar um trampo encerrado (CA96). Quem avalia e quem é avaliado vêm do
 * próprio trampo (ADR-003): o autor (visão com `versao`) avalia o freela da
 * candidatura aceita, e quem não é autor avalia o contratante. A API decide
 * se a conta pode avaliar (404 para quem não é parte, 409 `trampo_nao_encerrado`
 * e `avaliacao_ja_feita`). `?papel=` só diz o título enquanto o trampo carrega.
 */
export default function RotaDeAvaliar() {
  const { trampoId, papel: papelDaRota } = useLocalSearchParams<{
    trampoId: string | string[];
    papel?: string | string[];
  }>();
  const id = Array.isArray(trampoId) ? (trampoId[0] ?? '') : (trampoId ?? '');
  const router = useRouter();
  const { online } = useConexao();
  const consultaDoTrampo = useTrampo(id);
  const trampo = consultaDoTrampo.trampo;
  const souAutor = trampo?.versao !== undefined;
  const recebidas = useCandidaturasRecebidas(id, { habilitada: souAutor });

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // O freela da candidatura aceita (só o autor vê a lista).
  const contaDoFreela =
    recebidas.candidaturas?.find((c) => c.status === 'aceita')?.freelancerId ??
    null;

  if (trampo !== null && souAutor && contaDoFreela !== null) {
    return (
      <AvaliarConta
        trampo={trampo}
        papel="freela"
        contaId={contaDoFreela}
        semConexao={!online}
        onVoltar={voltar}
      />
    );
  }
  if (trampo !== null && !souAutor) {
    return (
      <AvaliarConta
        trampo={trampo}
        papel="contratante"
        contaId={trampo.autorId}
        semConexao={!online}
        onVoltar={voltar}
      />
    );
  }

  // Ainda sem saber quem avaliar: carregando, erro ou "não encontrado". O
  // autor sem candidatura aceita não tem a quem avaliar: estado próprio (R1).
  let semProfissional = false;
  let alvo: Estado<AlvoDaAvaliacao>;
  if (trampo === null) {
    alvo = estadoDeConsulta(
      { ...consultaDoTrampo, dados: trampo },
      (): AlvoDaAvaliacao => ({ nome: null, titulo: '', dataFormatada: '' }),
    );
  } else if (recebidas.candidaturas !== null) {
    // Só o trampo encerrado diz "encerrado sem profissional" (R11); aberto por
    // link direto, ainda não há o que avaliar e cai em "não encontrado".
    semProfissional = trampo.status === 'encerrado';
    alvo = { situacao: 'vazio' };
  } else if (ehErroDaApi(recebidas.erro) && recebidas.erro.status === 404) {
    alvo = { situacao: 'vazio' };
  } else if (recebidas.erro !== null) {
    alvo = {
      situacao: 'erro',
      mensagem: mensagemDoErro(recebidas.erro),
      onTentarDeNovo: () => {
        void recebidas.recarregar();
      },
    };
  } else {
    alvo = { situacao: 'carregando' };
  }
  return (
    <Avaliar
      papel={trampo !== null ? 'freela' : papelDaUrl(papelDaRota)}
      alvo={alvo}
      nota={0}
      destaques={[]}
      comentario=""
      semProfissional={semProfissional}
      semConexao={!online}
      onMudarNota={SEM_ACAO}
      onAlternarDestaque={SEM_ACAO}
      onMudarComentario={SEM_ACAO}
      onEnviar={SEM_ACAO}
      onVoltar={voltar}
    />
  );
}

/**
 * O formulário, com a conta avaliada já conhecida. O que a pessoa digitou fica
 * só neste estado (o comentário é dado pessoal: nunca em URL, log nem erro).
 * Enviada a avaliação, o "favoritar" (só ao avaliar um freela) vai em seguida;
 * a tela volta com o aviso "Avaliação enviada." (ou o aviso do favorito que
 * falhou: a avaliação já foi, e o cartão passa a "Avaliado com N ★").
 */
function AvaliarConta({
  trampo,
  papel,
  contaId,
  semConexao,
  onVoltar,
}: {
  trampo: Trampo;
  papel: PapelDoAvaliado;
  contaId: string;
  semConexao: boolean;
  onVoltar: () => void;
}) {
  const { geracao } = useSessao();
  const { avaliar } = useAvaliar();
  const { definir } = useDefinirFavorito();
  const perfil = usePerfilPublico(contaId);
  const { favoritos, ehFavorito } = useFavoritos();
  // Quem já está na equipe começa ligado (e não manda `PUT` de novo); a
  // escolha da pessoa, depois de tocar, vale sobre isso.
  const jaNaEquipe = favoritos !== null && ehFavorito(contaId);

  const [nota, setNota] = useState(0);
  const [destaques, setDestaques] = useState<readonly string[]>([]);
  const [comentario, setComentario] = useState('');
  const [escolhaDoFavorito, setEscolhaDoFavorito] = useState<
    boolean | undefined
  >();
  const favoritar = escolhaDoFavorito ?? jaNaEquipe;
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();
  const [jaAvaliado, setJaAvaliado] = useState(false);
  // A pessoa pode sair com o pedido no ar: o fim dele não navega por cima.
  const montada = useRef(true);
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);
  // `enviando` só chega ao render seguinte: o toque duplo não manda dois.
  const emVoo = useRef(false);

  // O nome é só rótulo: o erro do perfil (inclusive o 404) não impede avaliar.
  const alvo: Estado<AlvoDaAvaliacao> =
    perfil.perfil === null && perfil.erro === null
      ? { situacao: 'carregando' }
      : {
          situacao: 'ok',
          dados: {
            nome: perfil.perfil?.nome ?? null,
            titulo: trampo.titulo,
            dataFormatada: formatarDataHora(trampo.criadoEm),
          },
        };

  const enviar = async () => {
    if (emVoo.current || nota < 1 || semConexao) {
      return;
    }
    emVoo.current = true;
    setEnviando(true);
    setErro(undefined);
    const resultado = await avaliar({
      trampoId: trampo.id,
      nota,
      destaques: destaquesValidos(papel, destaques),
      comentario,
    });
    if (resultado.tipo === 'descartada') {
      emVoo.current = false;
      return;
    }
    if (resultado.tipo === 'erro') {
      emVoo.current = false;
      if (!montada.current) {
        return;
      }
      setEnviando(false);
      if (ehAvaliacaoJaFeita(resultado.erro)) {
        setJaAvaliado(true);
      } else {
        setErro(mensagemDoErro(resultado.erro));
      }
      return;
    }
    // A avaliação já foi: se só o favorito falhar, o aviso diz isso (e não
    // "tente de novo", que levaria a reenviar).
    let aviso: ChaveDeAvisoDeRetorno = 'avaliacao_enviada';
    if (papel === 'freela' && favoritar && !jaNaEquipe) {
      const favorito = await definir(contaId, true);
      if (favorito.tipo === 'descartada') {
        return;
      }
      if (favorito.tipo === 'erro') {
        aviso = 'avaliacao_enviada_sem_favorito';
      }
    }
    avisarAoVoltar(aviso, geracao());
    if (montada.current) {
      onVoltar();
    }
  };

  return (
    <Avaliar
      papel={papel}
      alvo={alvo}
      nota={nota}
      destaques={destaques}
      comentario={comentario}
      favoritar={favoritar}
      enviando={enviando}
      erro={erro}
      jaAvaliado={jaAvaliado}
      semConexao={semConexao}
      onMudarNota={(valor) => {
        setNota(valor);
        setErro(undefined);
      }}
      onAlternarDestaque={(codigo) =>
        setDestaques((atuais) =>
          atuais.includes(codigo)
            ? atuais.filter((c) => c !== codigo)
            : [...atuais, codigo],
        )
      }
      onMudarComentario={setComentario}
      onMudarFavoritar={papel === 'freela' ? setEscolhaDoFavorito : undefined}
      onEnviar={() => {
        void enviar();
      }}
      onVoltar={onVoltar}
    />
  );
}
