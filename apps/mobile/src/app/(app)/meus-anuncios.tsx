import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import type { Categoria, Servico, Trampo } from '../../api/tipos';
import {
  type AnuncioDaFolha,
  useAcoesDoAnuncio,
} from '../../estado/acoes-do-anuncio';
import { useAvisoDeRetorno } from '../../estado/aviso-de-retorno';
import { useConexao } from '../../estado/conexao';
import {
  useMeusServicos,
  useMeusTrampos,
} from '../../estado/consultas/anuncios';
import { useCategorias } from '../../estado/consultas/busca';
import { estadoDeConsulta } from '../../estado/estado-de-bloco';
import { meuAnuncioParaExibir } from '../../estado/item-para-exibir';
import { useNavegarUmaVez } from '../../estado/navegar-uma-vez';
import {
  type MeuAnuncioParaExibir,
  MeusAnuncios,
  type TipoDeAnuncio,
} from '../../telas';

/** Do mais recente para o mais antigo (`criadoEm` é ISO 8601). */
function maisRecentesPrimeiro<T extends Trampo | Servico>(
  anuncios: readonly T[],
): T[] {
  return [...anuncios].sort(
    (a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm),
  );
}

/** Qualquer valor que não seja `servico` (ausente, repetido, outro) é `trampo`. */
function lerTipo(valor: string | string[] | undefined): TipoDeAnuncio {
  return valor === 'servico' ? 'servico' : 'trampo';
}

export default function RotaDosMeusAnuncios() {
  const { tipo: tipoDaUrl } = useLocalSearchParams<{ tipo?: string }>();
  const tipo = lerTipo(tipoDaUrl);
  return tipo === 'servico' ? <MeusServicos /> : <MeusTrampos />;
}

/** Contêiner comum: cada tipo só chama o próprio hook (uma requisição só). */
function useAcoes(tipo: TipoDeAnuncio) {
  const router = useRouter();
  const { online } = useConexao();
  const { categorias } = useCategorias();
  return {
    online,
    categorias,
    voltar: () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    },
    abrir: (item: MeuAnuncioParaExibir) =>
      router.push(
        item.tipo === 'trampo'
          ? { pathname: '/trampos/[id]', params: { id: item.id } }
          : { pathname: '/servicos/[id]', params: { id: item.id } },
      ),
    publicar: () =>
      router.push(tipo === 'trampo' ? '/trampos/novo' : '/servicos/novo'),
  };
}

/**
 * "Mais opções" de Meus anúncios (CA33): a folha, o toast do resultado e o
 * aviso que a edição deixou ao voltar ("Alterações salvas."). `paraFolha`
 * monta o anúncio da folha a partir do dado cru da lista "minha" (só ele traz
 * o status e a contagem de candidaturas); `null` se o item já saiu da lista.
 */
function useMaisOpcoes(
  paraFolha: (id: string, titulo: string) => AnuncioDaFolha | null,
) {
  const abrirEdicao = useNavegarUmaVez();
  const acoes = useAcoesDoAnuncio({
    aoEditar: (anuncio) =>
      abrirEdicao(
        anuncio.tipo === 'trampo'
          ? { pathname: '/trampos/editar/[id]', params: { id: anuncio.id } }
          : { pathname: '/servicos/editar/[id]', params: { id: anuncio.id } },
      ),
  });
  const aviso = useAvisoDeRetorno(useIsFocused());
  const { abrir, fecharToast } = acoes;
  const { limpar } = aviso;
  return {
    folha: acoes.folha,
    onMaisOpcoes: (item: MeuAnuncioParaExibir) => {
      const anuncio = paraFolha(item.id, item.titulo);
      if (anuncio !== null) {
        abrir(anuncio);
      }
    },
    toast: acoes.toast ?? aviso.texto,
    onFecharToast: () => {
      fecharToast();
      limpar();
    },
  };
}

function paraExibir(
  anuncios: readonly (Trampo | Servico)[],
  categorias: readonly Categoria[],
): MeuAnuncioParaExibir[] {
  return maisRecentesPrimeiro(anuncios).map((a) =>
    meuAnuncioParaExibir(a, categorias),
  );
}

function MeusTrampos() {
  const acoes = useAcoes('trampo');
  const consulta = useMeusTrampos();
  const opcoes = useMaisOpcoes((id, titulo) => {
    const trampo = consulta.trampos?.find((t) => t.id === id);
    return trampo === undefined
      ? null
      : {
          tipo: 'trampo',
          id,
          titulo,
          status: trampo.status,
          ...(trampo.candidaturasRecebidas !== undefined && {
            candidaturasRecebidas: trampo.candidaturasRecebidas,
          }),
        };
  });
  const lista = estadoDeConsulta(
    {
      dados: consulta.trampos,
      erro: consulta.erro,
      recarregar: consulta.recarregar,
    },
    (trampos) => paraExibir(trampos, acoes.categorias),
  );
  return (
    <MeusAnuncios
      tipo="trampo"
      lista={lista}
      semConexao={!acoes.online}
      onAbrirItem={acoes.abrir}
      onPublicar={acoes.publicar}
      onVoltar={acoes.voltar}
      folha={opcoes.folha}
      onMaisOpcoes={opcoes.onMaisOpcoes}
      toast={opcoes.toast}
      onFecharToast={opcoes.onFecharToast}
    />
  );
}

function MeusServicos() {
  const acoes = useAcoes('servico');
  const consulta = useMeusServicos();
  const opcoes = useMaisOpcoes((id, titulo) =>
    consulta.servicos?.some((s) => s.id === id)
      ? { tipo: 'servico', id, titulo }
      : null,
  );
  const lista = estadoDeConsulta(
    {
      dados: consulta.servicos,
      erro: consulta.erro,
      recarregar: consulta.recarregar,
    },
    (servicos) => paraExibir(servicos, acoes.categorias),
  );
  return (
    <MeusAnuncios
      tipo="servico"
      lista={lista}
      semConexao={!acoes.online}
      onAbrirItem={acoes.abrir}
      onPublicar={acoes.publicar}
      onVoltar={acoes.voltar}
      folha={opcoes.folha}
      onMaisOpcoes={opcoes.onMaisOpcoes}
      toast={opcoes.toast}
      onFecharToast={opcoes.onFecharToast}
    />
  );
}
