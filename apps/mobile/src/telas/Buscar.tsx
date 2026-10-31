import {
  FlatList,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Aviso,
  Botao,
  Cabecalho,
  CampoDeTexto,
  Chip,
  EstadoVazio,
  Seletor,
  Toast,
} from '../componentes';
import { estiloDeFoco, useFoco } from '../componentes/utilitarios';
import {
  cores,
  espaco,
  larguraMaxima,
  tipografia,
  toqueMinimo,
} from '../tema/tokens';
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
  aba,
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

  const cabecalhoDaLista = (
    <View style={{ gap: espaco[3] }}>
      <CampoDeTexto
        rotulo={textos.buscar.campo}
        valor={texto}
        onChangeText={onMudarTexto}
        limite={LIMITE_DO_TEXTO}
        returnKeyType="search"
        onSubmitEditing={onEnviar}
      />
      <View
        style={{ flexDirection: empilhar ? 'column' : 'row', gap: espaco[2] }}
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
      <Abas aba={aba} onTrocar={onTrocarAba} />
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
      <Cabecalho titulo={textos.buscar.titulo} />
      <FlatList
        data={itens}
        keyExtractor={(item) => `${item.tipo}-${item.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: '100%',
          maxWidth: larguraMaxima,
          alignSelf: 'center',
          padding: espaco[4],
          gap: espaco[3],
        }}
        ListHeaderComponent={cabecalhoDaLista}
        renderItem={({ item }) => (
          <CartaoDoItem item={item} onAbrir={onAbrirItem} />
        )}
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
            <View style={{ gap: espaco[3] }}>
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
                variante="secundario"
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
        gap: espaco[2],
      }}
    >
      <Text
        accessibilityLiveRegion="polite"
        style={{
          flexShrink: 1,
          color: cores.textoSecundario,
          fontSize: tipografia.tamanho.rotulo,
          lineHeight: tipografia.lineHeight.rotulo,
        }}
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
      return <Carregando />;
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
          icone="search-outline"
          titulo={textos.buscar.semResultados}
          textoAcao={temFiltro ? textos.buscar.limparFiltros : undefined}
          onAcao={temFiltro ? onLimparFiltros : undefined}
        />
      );
    case 'inicial':
      return (
        <View style={{ gap: espaco[3] }}>
          <Titulo texto={textos.buscar.inicial} />
          <Text
            style={{
              color: cores.textoSecundario,
              fontSize: tipografia.tamanho.corpo,
              lineHeight: tipografia.lineHeight.corpo,
            }}
          >
            {textos.buscar.inicialTexto}
          </Text>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco[2] }}
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

function Abas({
  aba,
  onTrocar,
}: {
  aba: AbaDaBusca;
  onTrocar: (aba: AbaDaBusca) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: cores.borda,
      }}
    >
      <Aba
        texto={textos.buscar.abaTrampos}
        ativa={aba === 'trampos'}
        onPress={() => onTrocar('trampos')}
      />
      <Aba
        texto={textos.buscar.abaServicos}
        ativa={aba === 'servicos'}
        onPress={() => onTrocar('servicos')}
      />
    </View>
  );
}

function Aba({
  texto,
  ativa,
  onPress,
}: {
  texto: string;
  ativa: boolean;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={texto}
      accessibilityState={{ selected: ativa }}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={[
        {
          flex: 1,
          minHeight: toqueMinimo,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 3,
          borderBottomColor: ativa ? cores.primaria : 'transparent',
          marginBottom: -1,
        },
        focado && estiloDeFoco,
      ]}
    >
      <Text
        style={{
          color: ativa ? cores.primaria : cores.textoSecundario,
          fontSize: tipografia.tamanho.corpo,
          fontWeight: ativa ? tipografia.peso.semibold : tipografia.peso.normal,
        }}
      >
        {texto}
      </Text>
    </Pressable>
  );
}
