import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ehErroDaApi } from '../../../api/erros';
import type { MinhaCandidatura } from '../../../api/tipos';
import { useConexao } from '../../../estado/conexao';
import { useConversarPorConta } from '../../../estado/consultas/abrir-conversa';
import { useTramposPorIds } from '../../../estado/consultas/anuncios';
import {
  useMinhasCandidaturas,
  useRetirarCandidatura,
} from '../../../estado/consultas/candidaturas';
import { usePerfisPublicos } from '../../../estado/consultas/perfil';
import { textoDeErroDeAcao } from '../../../estado/erros';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import {
  formatarCentavos,
  formatarData,
  formatarDataHora,
} from '../../../estado/formatacao';
import {
  type MinhaCandidaturaParaExibir,
  MinhasCandidaturas,
} from '../../../telas';
import { textos } from '../../../textos/pt-BR';

/** Da mais recente para a mais antiga (`criadaEm` é ISO 8601). */
function maisRecentesPrimeiro(
  candidaturas: readonly MinhaCandidatura[],
): MinhaCandidatura[] {
  return [...candidaturas].sort(
    (a, b) => Date.parse(b.criadaEm) - Date.parse(a.criadaEm),
  );
}

/**
 * Aba Meus trampos do freela (CA78): as candidaturas de
 * `/candidaturas/minhas` nos segmentos Em análise, Confirmados e Encerrados.
 * O status, o prazo e o autor de cada trampo vêm de `GET /trampos/:id` e o
 * nome do autor de `GET /perfis/:id`, os dois com cache. Enquanto o trampo
 * não chega, a candidatura aceita fica em Confirmados.
 */
export default function RotaDeMeusTrampos() {
  const router = useRouter();
  const { online } = useConexao();
  const consulta = useMinhasCandidaturas();
  const retirar = useRetirarCandidatura();
  const conversa = useConversarPorConta(!online);
  // Candidaturas que a API já apagou (retirada ou 404): somem da lista na
  // hora, mesmo que a recarga demore ou falhe.
  const [sumidas, setSumidas] = useState<ReadonlySet<string>>(new Set());
  const [retirando, setRetirando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);
  // A falha ao abrir a conversa vira o aviso do topo (ajuste durante o
  // render): cada tentativa zera a falha antes, então a mesma mensagem
  // numa nova falha aparece de novo.
  const [falhaVista, setFalhaVista] = useState<string | null>(null);
  if (conversa.falha !== falhaVista) {
    setFalhaVista(conversa.falha);
    if (conversa.falha !== null) {
      setAviso(conversa.falha);
    }
  }
  // O `retirando` só chega à tela no próximo render: o toque duplo no
  // "Retirar" não pode disparar um segundo `DELETE`.
  const emVoo = useRef(false);
  const ordenadas = maisRecentesPrimeiro(
    (consulta.candidaturas ?? []).filter((c) => !sumidas.has(c.id)),
  );
  // `null` no mapa (404) e id ainda fora do mapa (carregando ou falha que
  // não é 404) viram o mesmo "Trampo indisponível": a lista não espera os
  // trampos nem quebra por causa de um deles.
  const trampos = useTramposPorIds(ordenadas.map((c) => c.trampoId));
  const autores = usePerfisPublicos(
    ordenadas.flatMap((c) => {
      const autorId = trampos.get(c.trampoId)?.autorId;
      return autorId === undefined ? [] : [autorId];
    }),
  );

  const lista = estadoDeConsulta(
    {
      dados: consulta.candidaturas === null ? null : ordenadas,
      erro: consulta.erro,
      recarregar: consulta.recarregar,
    },
    (itens): MinhaCandidaturaParaExibir[] =>
      itens.map((c) => {
        const trampo = trampos.get(c.trampoId) ?? null;
        return {
          id: c.id,
          trampoId: c.trampoId,
          tituloDoTrampo: trampo?.titulo ?? null,
          valorPropostoFormatado: formatarCentavos(c.valorPropostoCentavos),
          dataFormatada: formatarDataHora(c.criadaEm),
          status: c.status,
          podeRetirar: c.status === 'pendente',
          statusDoTrampo: trampo?.status ?? null,
          autor:
            trampo === null
              ? null
              : (autores.get(trampo.autorId)?.nome ?? null),
          prazoFormatado:
            trampo === null || trampo.prazo === null
              ? null
              : formatarData(trampo.prazo),
        };
      }),
  );

  const sumir = (id: string) => setSumidas((atuais) => new Set(atuais).add(id));

  const aoRetirar = (id: string) => {
    // Sem conexão a tela já desabilita o botão; o diálogo aberto antes da
    // queda não dispara o `DELETE`.
    if (emVoo.current || !online) {
      return;
    }
    emVoo.current = true;
    setRetirando(id);
    setAviso(undefined);
    setToast(null);
    retirar.mutate(id, {
      onSuccess: () => {
        sumir(id);
        setToast(textos.candidatura.retirada);
      },
      onError: (erro) => {
        if (ehErroDaApi(erro) && erro.status === 404) {
          // Já não existe (outra sessão, ou o trampo foi excluído).
          sumir(id);
          void consulta.recarregar();
          return;
        }
        if (
          ehErroDaApi(erro) &&
          erro.status === 409 &&
          erro.codigo === 'candidatura_nao_pendente'
        ) {
          // O empregador respondeu antes: a lista traz o status novo.
          setAviso(textos.candidatura.respondida);
          void consulta.recarregar();
          return;
        }
        setAviso(textoDeErroDeAcao(erro, textos.candidatura.erroAoRetirar));
      },
      onSettled: () => {
        emVoo.current = false;
        setRetirando(null);
      },
    });
  };

  // "Mensagem" na candidatura aceita: abre (ou cria) a conversa com o autor
  // do trampo. Sem o trampo carregado não há com quem conversar ainda.
  const aoMandarMensagem = (item: MinhaCandidaturaParaExibir) => {
    const autorId = trampos.get(item.trampoId)?.autorId;
    if (autorId === undefined) {
      return;
    }
    const motivo = conversa.motivoDe(autorId);
    if (motivo !== null) {
      setAviso(motivo);
      return;
    }
    conversa.conversar(autorId);
  };

  return (
    <MinhasCandidaturas
      segmentada
      lista={lista}
      semConexao={!online}
      retirando={retirando}
      aviso={aviso}
      onFecharAviso={() => setAviso(undefined)}
      toast={toast}
      onRetirar={aoRetirar}
      onFecharToast={() => setToast(null)}
      onAbrirTrampo={(trampoId) =>
        router.push({ pathname: '/trampos/[id]', params: { id: trampoId } })
      }
      onBuscarTrampos={() => router.push('/buscar-trampos')}
      onMensagem={aoMandarMensagem}
    />
  );
}
