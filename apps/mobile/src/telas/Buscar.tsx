import { FlatList, Text, useWindowDimensions, View } from 'react-native';
import {
  AbasSublinhadas,
  ALTURA_DA_BARRA_DE_ABAS,
  Aviso,
  Botao,
  Cabecalho,
  CampoDeTexto,
  CartaoDeFreelancer,
  Chip,
  EstadoVazio,
  folgaDaBarraDeAbas,
  MARGEM_DA_BARRA_DE_ABAS,
  Seletor,
  Toast,
} from '../componentes';
import { useMargensSeguras } from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, larguraMaxima, margemDaTela } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Carregando, ErroDoBloco, Pagina, Titulo } from './base';
import { CartaoDoItem } from './item';
import type { AbaDaBusca, PropsDaBusca } from './tipos';

const LIMITE_DO_TEXTO = 100;
const LIMITE_DA_CIDADE = 80;
/** Abaixo disto (pt) ou com fonte ampliada, os seletores ficam um sobre o outro. */
const LARGURA_PARA_EMPILHAR = 400;
const ESCALA_PARA_EMPILHAR = 1.2;

export function Buscar({
  texto,
  categoria,
  cidade,
  categorias,
  cidadesSugeridas = [],
  aba = 'trampos',
  tipo,
  onVoltar,
  estado,
  temMais,
  carregandoMais = false,
  erroAoCarregarMais,
  onTentarCarregarMais,
  toast,
  onFecharToast,
  onMudarTexto,
  onMudarCategoria,
  onMudarCidade,
  onEnviar,
  onCarregarMais,
  onLimparFiltros,
  onAbrirItem,
  onTrocarAba,
}: PropsDaBusca) {
  const rotuloDaCategoria =
    categorias.find((item) => item.id === categoria)?.rotulo ?? null;
  const temFiltro = Boolean(texto.trim() || categoria || cidade);
  const { width, fontScale } = useWindowDimensions();
  const empilhar =
    width < LARGURA_PARA_EMPILHAR || fontScale > ESCALA_PARA_EMPILHAR;
  const margens = useMargensSeguras();
  // CA84: com `tipo`, a busca é de um tipo só, sem abas.
  const raiz = Boolean(tipo) && !onVoltar;
  const titulo =
    tipo === 'servicos'
      ? textos.buscarFreelancers.titulo
      : tipo === 'trampos'
        ? textos.buscar.tituloTrampos
        : textos.buscar.titulo;
  const rotuloDoCampo =
    tipo === 'servicos'
      ? textos.buscarFreelancers.campo
      : tipo === 'trampos'
        ? textos.buscar.campoTrampos
        : textos.buscar.campo;

  const cabecalhoDaLista = (
    <View style={{ gap: espaco.m }}>
      <CampoDeTexto
        rotulo={rotuloDoCampo}
        valor={texto}
        onChangeText={onMudarTexto}
        limite={LIMITE_DO_TEXTO}
        returnKeyType="search"
        onSubmitEditing={onEnviar}
      />
      <View
        style={{
          flexDirection: empilhar ? 'column' : 'row',
          gap: empilhar ? espaco.m : espaco.s,
        }}
      >
        <View style={{ flex: empilhar ? undefined : 1 }}>
          <Seletor
            rotulo={textos.buscar.categoria}
            valor={rotuloDaCategoria}
            textoVazio={textos.buscar.todasCategorias}
            opcoes={categorias.map((item) => item.rotulo)}
            rotuloDePesquisa={textos.buscar.pesquisarCategoria}
            textoTodas={textos.buscar.todasCategorias}
            textoSemOpcoes={textos.buscar.semOpcoes}
            onSelecionar={(rotulo) =>
              onMudarCategoria(
                categorias.find((item) => item.rotulo === rotulo)?.id ?? null,
              )
            }
          />
        </View>
        <View style={{ flex: empilhar ? undefined : 1 }}>
          <Seletor
            rotulo={textos.buscar.cidade}
            modo="livre"
            valor={cidade}
            textoVazio={textos.buscar.todasCidades}
            opcoes={cidadesSugeridas}
            rotuloDePesquisa={textos.buscar.pesquisarCidade}
            textoTodas={textos.buscar.todasCidades}
            textoSemOpcoes={textos.buscar.semOpcoes}
            limite={LIMITE_DA_CIDADE}
            onSelecionar={onMudarCidade}
          />
        </View>
      </View>
      {!tipo && onTrocarAba ? (
        <AbasSublinhadas<AbaDaBusca>
          rotulo={textos.buscar.titulo}
          itens={[
            { chave: 'trampos', rotulo: textos.buscar.abaTrampos },
            { chave: 'servicos', rotulo: textos.buscar.abaServicos },
          ]}
          selecionada={aba}
          onSelecionar={onTrocarAba}
        />
      ) : null}
      <Resumo
        estado={estado}
        temMais={temMais}
        temFiltro={temFiltro}
        onLimparFiltros={onLimparFiltros}
      />
    </View>
  );

  const itens = estado.situacao === 'ok' ? estado.dados : [];

  return (
    <Pagina>
      <Cabecalho titulo={titulo} raiz={raiz} onVoltar={onVoltar} />
      <FlatList
        data={itens}
        keyExtractor={(item) => `${item.tipo}-${item.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: '100%',
          maxWidth: larguraMaxima,
          alignSelf: 'center',
          paddingHorizontal: margemDaTela,
          paddingTop: espaco.m,
          gap: espaco.m,
          paddingBottom: raiz ? folgaDaBarraDeAbas(margens.bottom) : espaco.l,
        }}
        ListHeaderComponent={cabecalhoDaLista}
        renderItem={({ item }) =>
          tipo === 'servicos' &&
          item.tipo === 'servico' &&
          item.autor !== undefined ? (
            <CartaoDeFreelancer
              nome={item.autor}
              tituloDoServico={item.titulo}
              categoria={item.categoria}
              cidade={item.cidade}
              precoFormatado={item.valorFormatado}
              nota={item.nota}
              onPress={() => onAbrirItem(item)}
            />
          ) : (
            <CartaoDoItem item={item} onAbrir={onAbrirItem} />
          )
        }
        ListEmptyComponent={
          <Vazios
            estado={estado}
            categorias={categorias}
            temFiltro={temFiltro}
            onMudarCategoria={onMudarCategoria}
            onLimparFiltros={onLimparFiltros}
          />
        }
        ListFooterComponent={
          estado.situacao === 'ok' && (temMais || carregandoMais) ? (
            <View style={{ gap: espaco.s }}>
              {erroAoCarregarMais ? (
                <Aviso
                  variante="erro"
                  texto={erroAoCarregarMais}
                  textoAcao={textos.gerais.tentarDeNovo}
                  onAcao={onTentarCarregarMais ?? onCarregarMais}
                />
              ) : null}
              <Botao
                texto={textos.gerais.carregarMais}
                textoCarregando={textos.gerais.carregando}
                variante="contorno"
                carregando={carregandoMais}
                onPress={onCarregarMais}
              />
            </View>
          ) : undefined
        }
        onEndReached={temMais && !carregandoMais ? onCarregarMais : undefined}
        onEndReachedThreshold={0.5}
      />
      {toast ? (
        <Toast
          visivel
          mensagem={toast}
          rotuloFechar={textos.gerais.toastFechar}
          onFechar={() => onFecharToast?.()}
          // Como raiz de aba, o toast sobe acima da barra flutuante.
          deslocamentoInferior={
            raiz ? ALTURA_DA_BARRA_DE_ABAS + MARGEM_DA_BARRA_DE_ABAS : 0
          }
        />
      ) : null}
    </Pagina>
  );
}

/** Contagem (com "+" se houver mais) e "Limpar filtros". */
function Resumo({
  estado,
  temMais,
  temFiltro,
  onLimparFiltros,
}: {
  estado: PropsDaBusca['estado'];
  temMais: boolean;
  temFiltro: boolean;
  onLimparFiltros: () => void;
}) {
  const contagem =
    estado.situacao === 'ok'
      ? textos.buscar.resultados(estado.dados.length, temMais)
      : null;
  if (!contagem && !temFiltro) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: espaco.s,
      }}
    >
      <Text
        accessibilityLiveRegion="polite"
        style={[
          estiloDeTexto('legenda'),
          { flexShrink: 1, color: cores.textoSecundario },
        ]}
      >
        {contagem ?? ''}
      </Text>
      {temFiltro ? (
        <Botao
          texto={textos.buscar.limparFiltros}
          variante="texto"
          larguraCheia={false}
          onPress={onLimparFiltros}
        />
      ) : null}
    </View>
  );
}

/** Corpo da lista quando não há itens: carregando, erro, vazio ou inicial. */
function Vazios({
  estado,
  categorias,
  temFiltro,
  onMudarCategoria,
  onLimparFiltros,
}: {
  estado: PropsDaBusca['estado'];
  categorias: PropsDaBusca['categorias'];
  temFiltro: boolean;
  onMudarCategoria: (id: string | null) => void;
  onLimparFiltros: () => void;
}) {
  switch (estado.situacao) {
    case 'carregando':
      return <Carregando cartoes={3} />;
    case 'erro':
      return (
        <ErroDoBloco
          mensagem={estado.mensagem}
          onTentarDeNovo={estado.onTentarDeNovo}
        />
      );
    case 'vazio':
      return (
        <EstadoVazio
          icone="search"
          titulo={textos.buscar.semResultados}
          textoAcao={temFiltro ? textos.buscar.limparFiltros : undefined}
          onAcao={temFiltro ? onLimparFiltros : undefined}
        />
      );
    case 'inicial':
      return (
        <View style={{ gap: espaco.m - 4 }}>
          <Titulo texto={textos.buscar.inicial} />
          <Text
            style={[estiloDeTexto('corpo'), { color: cores.textoSecundario }]}
          >
            {textos.buscar.inicialTexto}
          </Text>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s }}
          >
            {categorias.map((categoria) => (
              <Chip
                key={categoria.id}
                texto={categoria.rotulo}
                onPress={() => onMudarCategoria(categoria.id)}
              />
            ))}
          </View>
        </View>
      );
    case 'ok':
      return null;
  }
}
