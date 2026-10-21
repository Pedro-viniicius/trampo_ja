import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
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
  readonly aba: AbaDaBusca;
}

function tipoValido(tipo: string | undefined): AbaDaBusca | undefined {
  return tipo === 'trampos' || tipo === 'servicos' ? tipo : undefined;
}

/** Formulário zerado numa aba: é como "Ver todos" abre a Buscar. */
function formularioLimpo(aba: AbaDaBusca): Formulario {
  return { texto: '', categoria: null, cidade: null, aba };
}

/** Filtros da query; o que está em branco nem entra (a consulta também normaliza). */
function filtrosDo(formulario: Formulario): FiltrosDeConsulta {
  const { texto, categoria, cidade, aba } = formulario;
  return {
    tipo: aba,
    ...(texto.trim() !== '' && { texto }),
    ...(categoria !== null && { categoria }),
    ...(cidade !== null && { cidade }),
  };
}

/**
 * Buscar. A busca só dispara ao enviar o texto ou ao mudar filtro/aba (nunca a
 * cada letra); `?tipo=` (vindo de "Ver todos") escolhe a aba, zera os filtros
 * e já lista tudo daquele tipo. Cada "Ver todos" manda um `pedido` novo, e é
 * a mudança dele que reaplica o tipo com a tela já montada.
 */
export default function BuscarRota() {
  const router = useRouter();
  const { online } = useConexao();
  const { categorias } = useCategorias();
  const params = useLocalSearchParams<{ tipo?: string; pedido?: string }>();
  const tipoDaUrl = tipoValido(params.tipo);
  const pedidoDaUrl = tipoDaUrl === undefined ? undefined : params.pedido;

  const [formulario, setFormulario] = useState<Formulario>(
    formularioLimpo(tipoDaUrl ?? 'trampos'),
  );
  // `null`: nada enviado ainda, e a tela mostra as categorias sugeridas.
  const [enviados, setEnviados] = useState<FiltrosDeConsulta | null>(
    tipoDaUrl ? { tipo: tipoDaUrl } : null,
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
      const novo = formularioLimpo(tipoDaUrl);
      setFormulario(novo);
      setEnviados(filtrosDo(novo));
    }
  }

  const busca = useBusca(enviados ?? {}, { habilitado: enviados !== null });

  function enviar(novo: Formulario) {
    setFormulario(novo);
    setEnviados(filtrosDo(novo));
  }

  function limparFiltros() {
    enviar(formularioLimpo(formulario.aba));
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
      aba={formulario.aba}
      estado={estadoDaBusca()}
      temMais={busca.temMais}
      carregandoMais={busca.carregandoMais}
      erroAoCarregarMais={erroAoCarregarMais}
      onTentarCarregarMais={carregarMais}
      semConexao={!online}
      onMudarTexto={(texto) => setFormulario({ ...formulario, texto })}
      onMudarCategoria={(categoria) => enviar({ ...formulario, categoria })}
      onMudarCidade={(cidade) => enviar({ ...formulario, cidade })}
      onEnviar={() => enviar(formulario)}
      onCarregarMais={carregarMais}
      onLimparFiltros={limparFiltros}
      onAbrirItem={abrirItem}
      onTrocarAba={(aba) => enviar({ ...formulario, aba })}
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
