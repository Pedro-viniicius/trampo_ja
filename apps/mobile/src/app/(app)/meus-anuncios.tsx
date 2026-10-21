import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Categoria, Servico, Trampo } from '../../api/tipos';
import { useConexao } from '../../estado/conexao';
import {
  useMeusServicos,
  useMeusTrampos,
} from '../../estado/consultas/anuncios';
import { useCategorias } from '../../estado/consultas/busca';
import { estadoDeConsulta } from '../../estado/estado-de-bloco';
import { meuAnuncioParaExibir } from '../../estado/item-para-exibir';
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
    />
  );
}

function MeusServicos() {
  const acoes = useAcoes('servico');
  const consulta = useMeusServicos();
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
    />
  );
}
