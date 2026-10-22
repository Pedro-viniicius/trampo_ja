import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ehErroDaApi } from '../../../api/erros';
import { useConexao } from '../../../estado/conexao';
import { useConversarPorConta } from '../../../estado/consultas/abrir-conversa';
import { useTrampo } from '../../../estado/consultas/anuncios';
import {
  useAceitarCandidatura,
  useCandidaturasRecebidas,
} from '../../../estado/consultas/candidaturas';
import { usePerfisPublicos } from '../../../estado/consultas/perfil';
import { chaveDoErro } from '../../../estado/erros';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import { formatarCentavos, formatarDataHora } from '../../../estado/formatacao';
import {
  type CandidaturaParaExibir,
  CandidaturasRecebidas,
  type Estado,
} from '../../../telas';
import { textos } from '../../../textos/pt-BR';

/** 409 do aceite que pedem a lista e o trampo atualizados (sem nova tentativa). */
const CONFLITOS_DO_ACEITE: ReadonlySet<string> = new Set([
  'trampo_nao_aberto',
  'candidatura_nao_pendente',
  'conflito_de_versao',
]);

function ehConflitoDoAceite(erro: unknown): boolean {
  return (
    ehErroDaApi(erro) &&
    erro.status === 409 &&
    CONFLITOS_DO_ACEITE.has(erro.codigo)
  );
}

/**
 * Candidaturas recebidas de um trampo (só o autor vê: para os demais a API
 * responde 404). Os nomes vêm de `GET /perfis/:id`; perfil 404 ou ainda sem
 * resposta aparece como "Perfil indisponível".
 */
export default function RotaDasCandidaturasRecebidas() {
  const { trampoId } = useLocalSearchParams<{ trampoId: string | string[] }>();
  const idDoTrampo = Array.isArray(trampoId)
    ? (trampoId[0] ?? '')
    : (trampoId ?? '');
  const router = useRouter();
  const { online } = useConexao();
  const consultaDoTrampo = useTrampo(idDoTrampo);
  const consultaDaLista = useCandidaturasRecebidas(idDoTrampo);
  const perfis = usePerfisPublicos(
    (consultaDaLista.candidaturas ?? []).map((c) => c.freelancerId),
  );
  const aceitar = useAceitarCandidatura(idDoTrampo);

  const [aceitando, setAceitando] = useState<string | null>(null);
  const [erroDoAceite, setErroDoAceite] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);
  // O `aceitando` só chega à tela no próximo render: o toque duplo não pode
  // disparar um segundo `POST .../aceitar`.
  const emVoo = useRef<string | null>(null);
  // "Conversar" com quem se candidatou (CA12, D23: qualquer status), pelo
  // `freelancerId`.
  const conversa = useConversarPorConta(!online);

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const trampo = estadoDeConsulta(
    { ...consultaDoTrampo, dados: consultaDoTrampo.trampo },
    ({ titulo, status }) => ({ titulo, status }),
  );
  const aberto = consultaDoTrampo.trampo?.status === 'aberto';

  const erroDaLista = consultaDaLista.erro;
  // Quem não é o autor recebe 404: é erro (com o "Voltar" do cabeçalho), não
  // "nenhuma candidatura ainda".
  const lista: Estado<readonly CandidaturaParaExibir[]> =
    consultaDaLista.candidaturas === null &&
    ehErroDaApi(erroDaLista) &&
    erroDaLista.status === 404
      ? {
          situacao: 'erro',
          mensagem: textos.erros.nao_encontrado,
          onTentarDeNovo: () => {
            void consultaDaLista.recarregar();
          },
        }
      : estadoDeConsulta(
          { ...consultaDaLista, dados: consultaDaLista.candidaturas },
          (candidaturas) =>
            candidaturas.map(
              (candidatura): CandidaturaParaExibir => ({
                id: candidatura.id,
                contaId: candidatura.freelancerId,
                nome: perfis.get(candidatura.freelancerId)?.nome ?? null,
                valorPropostoFormatado: formatarCentavos(
                  candidatura.valorPropostoCentavos,
                ),
                mensagem: candidatura.mensagem,
                dataFormatada: formatarDataHora(candidatura.criadaEm),
                status: candidatura.status,
                podeAceitar: aberto && candidatura.status === 'pendente',
              }),
            ),
        );

  // Conta recusada (403/409) ou sem conexão: o "Conversar" dela fica
  // desabilitado com o motivo.
  const motivoDaConversa: Record<string, string> = {};
  for (const candidatura of consultaDaLista.candidaturas ?? []) {
    const motivo = conversa.motivoDe(candidatura.freelancerId);
    if (motivo !== null) {
      motivoDaConversa[candidatura.freelancerId] = motivo;
    }
  }

  const aoAceitar = (candidaturaId: string) => {
    if (emVoo.current !== null) {
      return;
    }
    emVoo.current = candidaturaId;
    setAceitando(candidaturaId);
    setErroDoAceite(undefined);
    aceitar.mutate(candidaturaId, {
      onSuccess: () => {
        // A invalidação já terminou: a lista e o trampo estão atualizados.
        setToast(textos.candidaturasRecebidas.aceitaToast);
      },
      onError: (erro) => {
        const chave = chaveDoErro(erro, 'nenhum').geral ?? 'erro_servidor';
        // No aceite, `trampo_nao_aberto` quer dizer que outra candidatura
        // foi aceita antes (a lista é recarregada logo abaixo).
        setErroDoAceite(
          textos.erros[
            chave === 'trampo_nao_aberto' ? 'aceite_perdido' : chave
          ],
        );
        if (ehConflitoDoAceite(erro)) {
          void consultaDoTrampo.recarregar();
          void consultaDaLista.recarregar();
        }
      },
      onSettled: () => {
        emVoo.current = null;
        setAceitando(null);
      },
    });
  };

  return (
    <CandidaturasRecebidas
      trampo={trampo}
      lista={lista}
      aceitando={aceitando}
      erroDoAceite={erroDoAceite}
      toast={toast}
      semConexao={!online}
      abrindoConversaCom={conversa.abrindoCom}
      erroDaConversa={conversa.falha ?? undefined}
      motivoDaConversa={motivoDaConversa}
      onConversar={conversa.conversar}
      onAceitar={aoAceitar}
      onAbrirPerfil={(contaId) =>
        router.push({ pathname: '/perfis/[contaId]', params: { contaId } })
      }
      onFecharToast={() => setToast(null)}
      onVoltar={voltar}
    />
  );
}
