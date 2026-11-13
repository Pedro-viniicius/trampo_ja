import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useAvisoDeRetorno } from '../../../estado/aviso-de-retorno';
import { useConexao } from '../../../estado/conexao';
import { useBusca, useCategorias } from '../../../estado/consultas/busca';
import type { FiltrosDeConsulta } from '../../../estado/consultas/chaves';
import { mensagemDoErro } from '../../../estado/erros';
import { paraItemParaExibir } from '../../../estado/item-para-exibir';
import { Buscar } from '../../../telas/Buscar';
import type {
  AbaDaBusca,
  EstadoDaBusca,
  ItemParaExibir,
} from '../../../telas/tipos';

/** O que a pessoa vê e digita no formulário (ainda não enviado). */
interface Formulario {
  readonly texto: string;
  readonly categoria: string | null;
  readonly cidade: string | null;
}

/** Formulário zerado: é como "Ver todos" abre a busca. */
const FORMULARIO_LIMPO: Formulario = {
  texto: '',
  categoria: null,
  cidade: null,
};

/** Filtros da query; o que está em branco nem entra (a consulta também normaliza). */
function filtrosDo(
  tipo: AbaDaBusca,
  formulario: Formulario,
): FiltrosDeConsulta {
  const { texto, categoria, cidade } = formulario;
  return {
    tipo,
    ...(texto.trim() !== '' && { texto }),
    ...(categoria !== null && { categoria }),
    ...(cidade !== null && { cidade }),
  };
}

/** Aba Buscar do contratante (CA84): busca serviços ("Buscar freelancers"). */
export default function BuscarRota() {
  return <BuscaDeUmTipo tipo="servicos" />;
}

/**
 * Busca de um tipo só (CA84): serviços na aba Buscar do contratante, trampos
 * em `/buscar-trampos` (freela, com voltar). A busca só dispara ao enviar o
 * texto ou ao mudar um filtro (nunca a cada letra). `?tipo=` igual ao tipo
 * da tela (vindo de "Ver todos") zera os filtros e já lista tudo. Cada "Ver
 * todos" manda um `pedido` novo, e é a mudança dele que reaplica a lista com
 * a tela já montada.
 */
export function BuscaDeUmTipo({
  tipo,
  onVoltar,
}: {
  readonly tipo: AbaDaBusca;
  readonly onVoltar?: () => void;
}) {
  const router = useRouter();
  const { online } = useConexao();
  const { categorias } = useCategorias();
  // CA63: ver `Inicio`; o detalhe aberto daqui que exclui volta com o aviso.
  const aviso = useAvisoDeRetorno(useIsFocused());
  const params = useLocalSearchParams<{ tipo?: string; pedido?: string }>();
  const tipoDaUrl = params.tipo === tipo ? tipo : undefined;
  const pedidoDaUrl = tipoDaUrl === undefined ? undefined : params.pedido;

  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_LIMPO);
  // `null`: nada enviado ainda, e a tela mostra as categorias sugeridas.
  const [enviados, setEnviados] = useState<FiltrosDeConsulta | null>(
    tipoDaUrl ? { tipo } : null,
  );
  const [pedidoAplicado, setPedidoAplicado] = useState({
    tipo: tipoDaUrl,
    pedido: pedidoDaUrl,
  });

  // Outro "Ver todos" com a tela já montada: reaplica o tipo da URL e zera os
  // filtros (ajuste durante o render, sem efeito).
  if (
    tipoDaUrl !== pedidoAplicado.tipo ||
    pedidoDaUrl !== pedidoAplicado.pedido
  ) {
    setPedidoAplicado({ tipo: tipoDaUrl, pedido: pedidoDaUrl });
    if (tipoDaUrl !== undefined) {
      setFormulario(FORMULARIO_LIMPO);
      setEnviados(filtrosDo(tipo, FORMULARIO_LIMPO));
    }
  }

  const busca = useBusca(enviados ?? {}, { habilitado: enviados !== null });

  function enviar(novo: Formulario) {
    setFormulario(novo);
    setEnviados(filtrosDo(tipo, novo));
  }

  function limparFiltros() {
    enviar(FORMULARIO_LIMPO);
  }

  function carregarMais() {
    void busca.carregarMais();
  }

  function abrirItem(item: ItemParaExibir) {
    router.push({
      pathname: item.tipo === 'trampo' ? '/trampos/[id]' : '/servicos/[id]',
      params: { id: item.id },
    });
  }

  // Some durante a nova tentativa: o botão "Carregar mais" mostra o progresso.
  const erroAoCarregarMais =
    busca.erroAoCarregarMais && !busca.carregandoMais
      ? mensagemDoErro(busca.erroAoCarregarMais)
      : undefined;

  return (
    <Buscar
      texto={formulario.texto}
      categoria={formulario.categoria}
      cidade={formulario.cidade}
      categorias={categorias}
      tipo={tipo}
      onVoltar={onVoltar}
      estado={estadoDaBusca()}
      temMais={busca.temMais}
      carregandoMais={busca.carregandoMais}
      erroAoCarregarMais={erroAoCarregarMais}
      onTentarCarregarMais={carregarMais}
      semConexao={!online}
      toast={aviso.texto}
      onFecharToast={aviso.limpar}
      onMudarTexto={(texto) => setFormulario({ ...formulario, texto })}
      onMudarCategoria={(categoria) => enviar({ ...formulario, categoria })}
      onMudarCidade={(cidade) => enviar({ ...formulario, cidade })}
      onEnviar={() => enviar(formulario)}
      onCarregarMais={carregarMais}
      onLimparFiltros={limparFiltros}
      onAbrirItem={abrirItem}
    />
  );

  function estadoDaBusca(): EstadoDaBusca {
    if (enviados === null) {
      return { situacao: 'inicial' };
    }
    if (busca.itens.length > 0) {
      return {
        situacao: 'ok',
        dados: busca.itens.map((item) => paraItemParaExibir(item, categorias)),
      };
    }
    if (busca.erro) {
      return {
        situacao: 'erro',
        mensagem: mensagemDoErro(busca.erro),
        onTentarDeNovo: () => {
          void busca.recarregar();
        },
      };
    }
    // Sem conexão a busca fica pausada (nem carregando nem erro).
    if (busca.carregando || !online) {
      return { situacao: 'carregando' };
    }
    return { situacao: 'vazio' };
  }
}
