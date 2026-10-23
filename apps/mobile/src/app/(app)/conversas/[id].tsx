import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ehErroDaApi } from '../../../api/erros';
import type { Mensagem } from '../../../api/tipos';
import { useConexao } from '../../../estado/conexao';
import {
  useConversas,
  useEnviarMensagem,
  useMensagens,
} from '../../../estado/consultas/conversas';
import { usePerfisPublicos } from '../../../estado/consultas/perfil';
import {
  criarPendente,
  MAXIMO_DA_MENSAGEM,
  mensagensParaExibir,
  type Pendente,
  reconciliar,
  textoEnviavel,
} from '../../../estado/conversa';
import { mensagemDoErro } from '../../../estado/erros';
import { Conversa, type Estado, type MensagemParaExibir } from '../../../telas';
import { textos } from '../../../textos/pt-BR';

/** Falhas seguidas do polling a partir das quais a tela avisa. */
const FALHAS_PARA_AVISAR = 3;

function ehNaoEncontrado(erro: unknown): boolean {
  return ehErroDaApi(erro) && erro.status === 404;
}

function ehLimiteDeAcoes(erro: unknown): boolean {
  return ehErroDaApi(erro) && erro.status === 429;
}

/**
 * Conversa (CA12): mensagens por polling (só com a tela focada), envio com
 * pendentes locais e reconciliação sem idempotência na API (ADR-004, D21).
 *
 * A rota recebe só o `conversaId`: o outro participante vem de
 * `GET /conversas`, e a mensagem é minha quando o autor não é ele (ADR-003).
 * Rascunho e pendentes vivem só no estado deste componente: somem quando a
 * tela fecha. No 401 o cliente HTTP expira a sessão e a raiz leva ao login;
 * aqui nada navega por conta própria.
 */
export default function RotaDaConversa() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const conversaId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const router = useRouter();
  const ativa = useIsFocused();
  const { online } = useConexao();

  // A lista só serve para achar o outro participante: sem o ciclo de 30 s
  // aqui (ele é da aba Conversas). Na montagem, ela recarrega se estiver velha.
  const lista = useConversas({ ativa: false });
  const resumo =
    lista.conversas?.find((c) => c.conversaId === conversaId) ?? null;
  const outroId = resumo?.outroUsuarioId ?? null;

  // Lista em cache anterior à abertura não prova que a conversa não existe:
  // a conversa pode ter acabado de ser criada e a recarga ainda estar no ar
  // ou ter falhado (Q1/R1). "Fora da lista" só vale com uma resposta
  // posterior a este instante e nenhuma busca no ar.
  const [abertaEm] = useState(() => Date.now());
  const { buscando: listaBuscando, recarregar: recarregarLista } = lista;
  // Fora da lista em cache e nada no ar (lista fresca, ou com erro): pede a
  // lista de novo uma vez, ao abrir, e só decide com essa resposta.
  const [conferindo, setConferindo] = useState(
    () => resumo === null && !listaBuscando,
  );
  const conferiuAoAbrir = useRef(false);
  useEffect(() => {
    if (!conferindo || conferiuAoAbrir.current) {
      return;
    }
    conferiuAoAbrir.current = true;
    void recarregarLista().finally(() => setConferindo(false));
  }, [conferindo, recarregarLista]);
  const listaRespondida =
    !conferindo && !listaBuscando && lista.atualizadaEm >= abertaEm;
  const foraDaLista =
    lista.conversas !== null && resumo === null && listaRespondida;
  const listaFalhou =
    resumo === null && lista.erro !== null && !conferindo && !listaBuscando;

  const perfis = usePerfisPublicos(outroId === null ? [] : [outroId]);
  const consulta = useMensagens(conversaId, { ativa });
  const { mensagens, recarregar } = consulta;
  const { enviar } = useEnviarMensagem(conversaId);

  const [rascunho, setRascunho] = useState('');
  const [pendentes, setPendentes] = useState<readonly Pendente[]>([]);
  const [envioIndisponivel, setEnvioIndisponivel] = useState(false);
  // 429 no último envio ou reenvio (limite de ações por conta, CA20): aviso
  // acima do campo até um envio dar certo ou o rascunho mudar.
  const [limiteNoEnvio, setLimiteNoEnvio] = useState(false);
  // Espelhos lidos de forma síncrona: dois toques no mesmo tick (antes de a
  // tela redesenhar) veem o campo já vazio e a pendente já em `enviando`.
  const rascunhoAtual = useRef('');
  const pendentesAtuais = useRef<readonly Pendente[]>([]);
  const sequencia = useRef(0);

  const atualizarPendentes = useCallback(
    (mudar: (atuais: readonly Pendente[]) => readonly Pendente[]) => {
      const novas = mudar(pendentesAtuais.current);
      pendentesAtuais.current = novas;
      setPendentes(novas);
      return novas;
    },
    [],
  );

  const mudarSituacao = useCallback(
    (chave: string, mudanca: Partial<Pendente>) => {
      atualizarPendentes((atuais) =>
        atuais.map((p) => (p.chave === chave ? { ...p, ...mudanca } : p)),
      );
    },
    [atualizarPendentes],
  );

  // A cada resposta do GET, guarda as pendentes reconciliadas: a âncora da
  // que fica avança, e a que já chegou sai (sem duplicata na tela).
  useEffect(() => {
    if (mensagens === null || outroId === null) {
      return;
    }
    atualizarPendentes((atuais) =>
      atuais.length === 0 ? atuais : reconciliar(mensagens, atuais, outroId),
    );
  }, [mensagens, outroId, atualizarPendentes]);

  const despachar = useCallback(
    async (chave: string, texto: string) => {
      const resultado = await enviar(texto);
      if (resultado.tipo === 'descartada') {
        // A sessão mudou durante o POST: nada desta tela vale mais.
        return;
      }
      if (resultado.tipo === 'enviada') {
        // O hook já invalidou as mensagens: o GET que vem tira a pendente.
        setLimiteNoEnvio(false);
        mudarSituacao(chave, {
          situacao: 'enviada',
          id: resultado.id,
          enviadaEm: resultado.enviadaEm,
        });
        return;
      }
      mudarSituacao(chave, { situacao: 'falhou' });
      if (ehNaoEncontrado(resultado.erro)) {
        setEnvioIndisponivel(true);
      }
      if (ehLimiteDeAcoes(resultado.erro)) {
        setLimiteNoEnvio(true);
      }
    },
    [enviar, mudarSituacao],
  );

  const indisponivel =
    envioIndisponivel || consulta.indisponivel || foraDaLista;
  const cargaConcluida = mensagens !== null && !consulta.carregando;
  const podeEnviar =
    textoEnviavel(rascunho) !== null &&
    online &&
    cargaConcluida &&
    outroId !== null &&
    !indisponivel;

  const aoMudarRascunho = (texto: string) => {
    rascunhoAtual.current = texto;
    setRascunho(texto);
    setLimiteNoEnvio(false);
  };

  const aoEnviar = () => {
    const texto = textoEnviavel(rascunhoAtual.current);
    if (
      texto === null ||
      !online ||
      mensagens === null ||
      !cargaConcluida ||
      outroId === null ||
      indisponivel
    ) {
      return;
    }
    sequencia.current += 1;
    const pendente = criarPendente(sequencia.current, texto, mensagens);
    atualizarPendentes((atuais) => [...atuais, pendente]);
    rascunhoAtual.current = '';
    setRascunho('');
    void despachar(pendente.chave, texto);
  };

  const aoTentarDeNovo = async (chave: string) => {
    const pendente = pendentesAtuais.current.find((p) => p.chave === chave);
    if (pendente === undefined || pendente.situacao !== 'falhou') {
      return;
    }
    if (outroId === null) {
      return;
    }
    mudarSituacao(chave, { situacao: 'enviando' });
    // Antes de reenviar, as novas: sem idempotência na API, o POST que
    // falhou pode ter chegado (D21).
    const confirmadas: readonly Mensagem[] | null = await recarregar();
    if (confirmadas === null) {
      mudarSituacao(chave, { situacao: 'falhou' });
      return;
    }
    const restantes = atualizarPendentes((atuais) =>
      reconciliar(confirmadas, atuais, outroId),
    );
    if (!restantes.some((p) => p.chave === chave)) {
      return;
    }
    await despachar(chave, pendente.texto);
  };

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/conversas');
    }
  };

  const recarregarTudo = () => {
    void lista.recarregar();
    void recarregar();
  };

  let estado: Estado<readonly MensagemParaExibir[]>;
  if (outroId !== null && mensagens !== null) {
    estado = {
      situacao: 'ok',
      dados: mensagensParaExibir(mensagens, pendentes, outroId, new Date()),
    };
  } else if (listaFalhou && lista.erro !== null) {
    // Sem o outro participante porque a lista falhou: erro com "Tentar de
    // novo", nunca "indisponível" por engano.
    estado = {
      situacao: 'erro',
      mensagem: mensagemDoErro(lista.erro),
      onTentarDeNovo: recarregarTudo,
    };
  } else if (mensagens === null && consulta.erro !== null) {
    estado = {
      situacao: 'erro',
      mensagem: mensagemDoErro(consulta.erro),
      onTentarDeNovo: recarregarTudo,
    };
  } else {
    // Carregando ou, sem conexão, consulta pausada: nunca "vazio" por engano.
    estado = { situacao: 'carregando' };
  }

  const nome = outroId === null ? null : (perfis.get(outroId)?.nome ?? null);

  return (
    <Conversa
      titulo={nome ?? textos.conversas.perfilIndisponivel}
      nomeDoOutro={nome}
      limite={MAXIMO_DA_MENSAGEM}
      mensagens={estado}
      indisponivel={indisponivel}
      rascunho={rascunho}
      podeEnviar={podeEnviar}
      semConexao={!online}
      atualizacaoFalhando={consulta.falhasSeguidas >= FALHAS_PARA_AVISAR}
      {...(limiteNoEnvio && {
        avisoDoEnvio: textos.erros.muitas_tentativas_acao,
      })}
      onMudarRascunho={aoMudarRascunho}
      onEnviar={aoEnviar}
      onTentarDeNovo={(chave) => {
        void aoTentarDeNovo(chave);
      }}
      onVoltar={voltar}
    />
  );
}
