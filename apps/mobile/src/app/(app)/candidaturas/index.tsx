import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ehErroDaApi } from '../../../api/erros';
import type { MinhaCandidatura } from '../../../api/tipos';
import { useConexao } from '../../../estado/conexao';
import { useTramposPorIds } from '../../../estado/consultas/anuncios';
import {
  useMinhasCandidaturas,
  useRetirarCandidatura,
} from '../../../estado/consultas/candidaturas';
import { textoDeErroDeAcao } from '../../../estado/erros';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import { formatarCentavos, formatarDataHora } from '../../../estado/formatacao';
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

export default function RotaDasMinhasCandidaturas() {
  const router = useRouter();
  const { online } = useConexao();
  const consulta = useMinhasCandidaturas();
  const retirar = useRetirarCandidatura();
  // Candidaturas que a API já apagou (retirada ou 404): somem da lista na
  // hora, mesmo que a recarga demore ou falhe.
  const [sumidas, setSumidas] = useState<ReadonlySet<string>>(new Set());
  const [retirando, setRetirando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);
  // O `retirando` só chega à tela no próximo render: o toque duplo no
  // "Retirar" não pode disparar um segundo `DELETE`.
  const emVoo = useRef(false);
  const ordenadas = maisRecentesPrimeiro(
    (consulta.candidaturas ?? []).filter((c) => !sumidas.has(c.id)),
  );
  // Título de cada trampo. `null` no mapa (404) e id ainda fora do mapa
  // (carregando ou falha que não é 404) viram o mesmo "Trampo indisponível":
  // a lista não espera os títulos nem quebra por causa de um deles.
  const trampos = useTramposPorIds(ordenadas.map((c) => c.trampoId));

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const lista = estadoDeConsulta(
    {
      dados: consulta.candidaturas === null ? null : ordenadas,
      erro: consulta.erro,
      recarregar: consulta.recarregar,
    },
    (itens): MinhaCandidaturaParaExibir[] =>
      itens.map((c) => ({
        id: c.id,
        trampoId: c.trampoId,
        tituloDoTrampo: trampos.get(c.trampoId)?.titulo ?? null,
        valorPropostoFormatado: formatarCentavos(c.valorPropostoCentavos),
        dataFormatada: formatarDataHora(c.criadaEm),
        status: c.status,
        podeRetirar: c.status === 'pendente',
      })),
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

  return (
    <MinhasCandidaturas
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
      onBuscarTrampos={() => router.push('/buscar')}
      onVoltar={voltar}
    />
  );
}
