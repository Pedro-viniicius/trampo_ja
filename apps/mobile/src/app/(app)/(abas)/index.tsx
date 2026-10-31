import { useIsFocused, useRouter } from 'expo-router';
import type { Categoria, ItemDaBusca } from '../../../api/tipos';
import { useAvisoDeRetorno } from '../../../estado/aviso-de-retorno';
import { useConexao } from '../../../estado/conexao';
import { useCategorias, useRecentes } from '../../../estado/consultas/busca';
import { useMeuPerfil } from '../../../estado/consultas/perfil';
import { mensagemDoErro } from '../../../estado/erros';
import { paraItemParaExibir } from '../../../estado/item-para-exibir';
import { CAMPOS_DO_PERFIL_NOVO } from '../../../estado/perfil-incompleto';
import { Inicio } from '../../../telas/Inicio';
import type {
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

/** Início: saudação, aviso de perfil incompleto e os anúncios recentes. */
export default function InicioRota() {
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

  function verTodos(tipo: TipoDeAnuncio) {
    pedidosDeVerTodos += 1;
    router.navigate({
      pathname: '/buscar',
      params: {
        tipo: tipo === 'trampo' ? 'trampos' : 'servicos',
        pedido: String(pedidosDeVerTodos),
      },
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
      onBuscar={() => router.navigate('/buscar')}
      onVerTodos={verTodos}
      onAbrirItem={abrirItem}
      onCompletarPerfil={() =>
        router.push({ pathname: '/perfil/editar', params: { completar: '1' } })
      }
      onPublicarTrampo={() => router.push('/trampos/novo')}
      onOfertarServico={() => router.push('/servicos/novo')}
      onMinhasCandidaturas={() => router.push('/candidaturas')}
    />
  );
}
