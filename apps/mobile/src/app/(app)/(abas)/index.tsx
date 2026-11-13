import { useIsFocused, useRouter } from 'expo-router';
import type { Categoria, ItemDaBusca } from '../../../api/tipos';
import { useAvisoDeRetorno } from '../../../estado/aviso-de-retorno';
import { useConexao } from '../../../estado/conexao';
import { useMeusTrampos } from '../../../estado/consultas/anuncios';
import { useCategorias, useRecentes } from '../../../estado/consultas/busca';
import { useMeuPerfil } from '../../../estado/consultas/perfil';
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
  ItemParaExibir,
  TipoDeAnuncio,
} from '../../../telas/tipos';

/**
 * Cada "Ver todos" leva um número novo na URL (`pedido`): a Buscar reaplica
 * o tipo mesmo quando ele é igual ao do toque anterior (a pessoa pode ter
 * trocado a aba à mão no meio).
 */
let pedidosDeVerTodos = 0;

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

/** Início do freela: saudação, aviso de perfil incompleto e os anúncios recentes. */
function InicioDoFreela() {
  const router = useRouter();
  const { online } = useConexao();
  const meuPerfil = useMeuPerfil();
  const trampos = useRecentes('trampos');
  const servicos = useRecentes('servicos');
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
  // contratante: o link dela troca o modo (CA77).
  function verTodos(tipo: TipoDeAnuncio) {
    if (tipo === 'trampo') {
      router.push({ pathname: '/buscar-trampos', params: { tipo: 'trampos' } });
      return;
    }
    pedidosDeVerTodos += 1;
    router.navigate({
      pathname: '/buscar',
      params: { tipo: 'servicos', pedido: String(pedidosDeVerTodos) },
    });
  }

  return (
    <Inicio
      nome={meuPerfil.perfil?.nome}
      perfilIncompleto={
        meuPerfil.semPerfil ? { falta: CAMPOS_DO_PERFIL_NOVO } : null
      }
      recentesTrampos={estadoDosRecentes(trampos, categorias, online)}
      recentesServicos={estadoDosRecentes(servicos, categorias, online)}
      semConexao={!online}
      toast={aviso.texto}
      onFecharToast={aviso.limpar}
      onBuscar={() => router.push('/buscar-trampos')}
      onVerTodos={verTodos}
      onAbrirItem={abrirItem}
      onCompletarPerfil={() =>
        router.push({ pathname: '/perfil/editar', params: { completar: '1' } })
      }
      onPublicarTrampo={() => router.push('/trampos/novo')}
      onOfertarServico={() => router.push('/servicos/novo')}
      onMinhasCandidaturas={() => router.navigate('/meus-trampos')}
    />
  );
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
      semConexao={!online}
      toast={aviso.texto}
      onFecharToast={aviso.limpar}
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
