import { useIsFocused, useRouter } from 'expo-router';
import { useState } from 'react';
import type { Categoria, ItemDaBusca } from '../../../api/tipos';
import { notaDoResumo } from '../../../estado/avaliacoes-para-exibir';
import { useAvisoDeRetorno } from '../../../estado/aviso-de-retorno';
import { useConexao } from '../../../estado/conexao';
import { useConversarPorConta } from '../../../estado/consultas/abrir-conversa';
import { useMeusTrampos } from '../../../estado/consultas/anuncios';
import {
  useFavoritos,
  useResumosDeAvaliacoes,
} from '../../../estado/consultas/avaliacoes';
import { useCategorias, useRecentes } from '../../../estado/consultas/busca';
import { useMinhasCandidaturas } from '../../../estado/consultas/candidaturas';
import {
  useMeuPerfil,
  usePerfisPublicos,
} from '../../../estado/consultas/perfil';
import { mensagemDoErro } from '../../../estado/erros';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import { formatarData } from '../../../estado/formatacao';
import { paraItemParaExibir } from '../../../estado/item-para-exibir';
import { useModo } from '../../../estado/modo';
import { CAMPOS_DO_PERFIL_NOVO } from '../../../estado/perfil-incompleto';
import { Inicio } from '../../../telas/Inicio';
import { InicioDoContratante } from '../../../telas/InicioDoContratante';
import type {
  DemandaParaExibir,
  Estado,
  FavoritoParaExibir,
  ItemParaExibir,
} from '../../../telas/tipos';

interface ConsultaDeRecentes {
  readonly itens: readonly ItemDaBusca[];
  readonly carregando: boolean;
  readonly erro: Error | null;
  readonly recarregar: () => unknown;
}

/**
 * Traduz a consulta em `Estado`. Sem conexão e sem nada carregado, a consulta
 * fica pausada (nem carregando nem erro): segue como "carregando" em vez de
 * mostrar "ainda não há anúncios".
 */
function estadoDosRecentes(
  consulta: ConsultaDeRecentes,
  categorias: readonly Categoria[],
  online: boolean,
): Estado<readonly ItemParaExibir[]> {
  if (consulta.itens.length > 0) {
    return {
      situacao: 'ok',
      dados: consulta.itens.map((item) => paraItemParaExibir(item, categorias)),
    };
  }
  if (consulta.erro) {
    return {
      situacao: 'erro',
      mensagem: mensagemDoErro(consulta.erro),
      onTentarDeNovo: () => {
        void consulta.recarregar();
      },
    };
  }
  if (consulta.carregando || !online) {
    return { situacao: 'carregando' };
  }
  return { situacao: 'vazio' };
}

/** Início: cada modo tem o seu (CA76); só o do modo atual consulta a API. */
export default function InicioRota() {
  const { modo } = useModo();
  return modo === 'contratante' ? (
    <InicioDoContratanteRota />
  ) : (
    <InicioDoFreela />
  );
}

/**
 * Início do freela (D63): saudação, aviso de perfil incompleto, o destaque de
 * Meus trampos (com as candidaturas em análise), os trampos recentes e a
 * dica. Sem serviços e sem atalhos de publicar.
 */
function InicioDoFreela() {
  const router = useRouter();
  const { online } = useConexao();
  const meuPerfil = useMeuPerfil();
  const trampos = useRecentes('trampos');
  const { candidaturas } = useMinhasCandidaturas();
  const { categorias } = useCategorias();
  // CA63: o aviso que uma tela de cima deixou ao voltar (excluído, já não
  // existe, alterações salvas) aparece aqui quando a aba está em foco.
  const aviso = useAvisoDeRetorno(useIsFocused());

  function abrirItem(item: ItemParaExibir) {
    router.push({
      pathname: item.tipo === 'trampo' ? '/trampos/[id]' : '/servicos/[id]',
      params: { id: item.id },
    });
  }

  // CA84: o freela busca trampos em `/buscar-trampos` (pilha, com voltar),
  // que já abre listando todos. Serviços só se buscam na aba Buscar do
  // contratante (D63).
  function verTodos() {
    router.push({ pathname: '/buscar-trampos', params: { tipo: 'trampos' } });
  }

  return (
    <Inicio
      nome={meuPerfil.perfil?.nome}
      perfilIncompleto={
        meuPerfil.semPerfil ? { falta: CAMPOS_DO_PERFIL_NOVO } : null
      }
      recentesTrampos={estadoDosRecentes(trampos, categorias, online)}
      semConexao={!online}
      toast={aviso.texto}
      onFecharToast={aviso.limpar}
      onBuscar={() => router.push('/buscar-trampos')}
      onVerTodos={verTodos}
      onAbrirItem={abrirItem}
      onCompletarPerfil={() =>
        router.push({ pathname: '/perfil/editar', params: { completar: '1' } })
      }
      onMinhasCandidaturas={() => router.navigate('/meus-trampos')}
      // A mesma chave de cache do Perfil e de Meus trampos (R3).
      candidaturasEmAnalise={
        candidaturas === null
          ? null
          : candidaturas.filter((c) => c.status === 'pendente').length
      }
      onDicas={() => router.push('/dicas')}
    />
  );
}

/**
 * Quantas pessoas da equipe favorita o Início mostra: as 20 mais recentes
 * (a API devolve da mais recente para a mais antiga). Limita os pedidos de
 * perfil (um por pessoa) e de resumos.
 */
const LIMITE_DA_EQUIPE_NO_INICIO = 20;

/**
 * Equipe favorita (CA98): `GET /favoritos`, o nome de cada pessoa de
 * `GET /perfis/:id` (com cache) e a nota dela como freela num pedido só de
 * resumos (CA97), só das `LIMITE_DA_EQUIPE_NO_INICIO` mais recentes. Perfil
 * indisponível (404) fica de fora: não há com quem conversar. A tela só mostra
 * a seção com pelo menos uma pessoa.
 */
function useEquipeFavorita(): Estado<readonly FavoritoParaExibir[]> {
  const { favoritos: todos } = useFavoritos();
  const favoritos = todos?.slice(0, LIMITE_DA_EQUIPE_NO_INICIO) ?? null;
  const ids = (favoritos ?? []).map((favorito) => favorito.contaId);
  const perfis = usePerfisPublicos(ids);
  const { resumos } = useResumosDeAvaliacoes(ids);
  if (favoritos === null) {
    return { situacao: 'carregando' };
  }
  return {
    situacao: 'ok',
    dados: favoritos.flatMap((favorito): FavoritoParaExibir[] => {
      const perfil = perfis.get(favorito.contaId);
      return perfil
        ? [
            {
              contaId: favorito.contaId,
              nome: perfil.nome,
              nota: notaDoResumo(resumos.get(favorito.contaId), 'freela'),
            },
          ]
        : [];
    }),
  };
}

/**
 * Início do contratante (CA82): as demandas abertas de `/trampos/meus` (a
 * mesma chave de cache da aba Demandas), com os interessados de
 * `candidaturasRecebidas`. Sem conexão e sem nada carregado, a consulta fica
 * pausada e segue como "carregando".
 */
function InicioDoContratanteRota() {
  const router = useRouter();
  const { online } = useConexao();
  const meuPerfil = useMeuPerfil();
  const consulta = useMeusTrampos();
  const aviso = useAvisoDeRetorno(useIsFocused());
  const equipe = useEquipeFavorita();
  const conversa = useConversarPorConta(!online);
  // A falha ao abrir a conversa e o motivo da recusa da conta tocada (sem
  // vínculo, sem conexão) viram o toast. Cada toque zera o texto dispensado:
  // a mesma mensagem numa nova falha aparece de novo.
  const [alvoDaConversa, setAlvoDaConversa] = useState<string | null>(null);
  const [textoDispensado, setTextoDispensado] = useState<string | null>(null);
  const textoDaConversa =
    conversa.falha ??
    (alvoDaConversa === null ? null : conversa.motivoDe(alvoDaConversa));
  const avisoDaConversa =
    textoDaConversa !== textoDispensado ? textoDaConversa : null;

  const demandas: Estado<readonly DemandaParaExibir[]> = estadoDeConsulta(
    {
      dados: consulta.trampos,
      erro: consulta.erro,
      recarregar: consulta.recarregar,
    },
    (trampos) =>
      trampos
        .filter((trampo) => trampo.status === 'aberto')
        .map(
          (trampo): DemandaParaExibir => ({
            id: trampo.id,
            titulo: trampo.titulo,
            prazoFormatado:
              trampo.prazo === null ? null : formatarData(trampo.prazo),
            interessados: trampo.candidaturasRecebidas ?? 0,
          }),
        ),
  );

  return (
    <InicioDoContratante
      nome={meuPerfil.perfil?.nome}
      perfilIncompleto={
        meuPerfil.semPerfil ? { falta: CAMPOS_DO_PERFIL_NOVO } : null
      }
      demandas={demandas}
      // Qualquer trampo carregado, de qualquer status (R2): com só trampos em
      // andamento, o vazio diz "Nenhuma demanda aberta", não "ainda não publicou".
      temDemandas={(consulta.trampos?.length ?? 0) > 0}
      semConexao={!online}
      toast={aviso.texto ?? avisoDaConversa}
      onFecharToast={() => {
        aviso.limpar();
        setTextoDispensado(textoDaConversa);
      }}
      equipe={equipe}
      onVerPerfilDaEquipe={(contaId) =>
        router.push({
          pathname: '/perfis/[contaId]',
          params: { contaId, papel: 'freela' },
        })
      }
      // CA98: abre (ou cria) a conversa com a pessoa da equipe.
      onRecontratar={(contaId) => {
        setAlvoDaConversa(contaId);
        setTextoDispensado(null);
        conversa.conversar(contaId);
      }}
      onNovaDemanda={() => router.push('/trampos/novo')}
      onVerDemandas={() => router.navigate('/demandas')}
      onVerCandidatos={(id) =>
        router.push({
          pathname: '/candidaturas/[trampoId]',
          params: { trampoId: id },
        })
      }
      onCompletarPerfil={() =>
        router.push({ pathname: '/perfil/editar', params: { completar: '1' } })
      }
    />
  );
}
