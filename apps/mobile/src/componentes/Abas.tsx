import { Pressable, ScrollView, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra, toqueMinimo } from '../tema/tokens';
import { estiloDeFoco, useFoco } from './utilitarios';

export type ItemDeAba<C extends string> = {
  chave: C;
  rotulo: string;
  /** Número opcional ao lado do rótulo (ex.: confirmados). */
  contador?: number;
};

export type PropsDasAbas<C extends string> = {
  itens: readonly ItemDeAba<C>[];
  selecionada: C;
  onSelecionar: (chave: C) => void;
  /** Nome do grupo para o leitor de tela (ex.: "Meus trampos"). */
  rotulo?: string;
};

function rotuloFalado(item: ItemDeAba<string>): string {
  return item.contador === undefined
    ? item.rotulo
    : `${item.rotulo}, ${item.contador}`;
}

function Contador({ n, ativo }: { n: number; ativo: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: 5,
        borderRadius: raio.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ativo ? cores.azul[600] : cores.tinta[300],
      }}
    >
      <Text
        allowFontScaling={false}
        style={[
          estiloDeTexto('sobretitulo', 'negrito'),
          {
            color: ativo ? cores.branco : cores.tinta[900],
            letterSpacing: 0,
            lineHeight: 14,
          },
        ]}
      >
        {n > 99 ? '99+' : String(n)}
      </Text>
    </View>
  );
}

/** Folga entre o trilho e as abas, nos quatro lados e entre as abas. */
const FOLGA_DO_TRILHO = 4;
/**
 * Raio da aba: metade do alvo de toque, então numa linha a aba é uma pílula.
 * Se ela crescer (contador abaixo do rótulo), vira retângulo arredondado.
 */
const RAIO_DA_ABA = toqueMinimo / 2;
/**
 * Raio do trilho, concêntrico ao da aba (R1, etapa 12). Numa linha, o trilho
 * também é uma pílula; em duas linhas, os cantos seguem as abas dos cantos e
 * nenhuma vaza do fundo (com `raio.pill`, o Android limitava o raio do trilho
 * alto e a aba ativa do canto saía para fora).
 */
const RAIO_DO_TRILHO = RAIO_DA_ABA + FOLGA_DO_TRILHO;

function ItemSegmentado<C extends string>({
  item,
  ativo,
  onPress,
}: {
  item: ItemDeAba<C>;
  ativo: boolean;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={rotuloFalado(item)}
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={[
        {
          // Largura pelo conteúdo, e o que sobra é dividido igual (F3, etapa
          // 12): com fonte padrão, os três rótulos de Meus trampos cabem
          // inteiros em 411 dp, em vez de um terço fixo para cada aba.
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 'auto',
          minHeight: toqueMinimo,
          // Com `flexWrap`, o Yoga empilha as linhas no topo
          // (`alignContent: 'flex-start'`); `center` mantém o rótulo no meio
          // da aba, vertical e horizontalmente.
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignContent: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          columnGap: espaco.xs + 2,
          rowGap: espaco.xs,
          paddingHorizontal: espaco.xs,
          paddingVertical: espaco.xs,
          borderRadius: RAIO_DA_ABA,
          backgroundColor: ativo ? cores.branco : 'transparent',
        },
        ativo ? sombra.sm : null,
        focado && estiloDeFoco,
      ]}
    >
      {/* Sem `numberOfLines`: com fonte grande, quebra em vez de cortar. */}
      <Text
        style={[
          estiloDeTexto('corpo', ativo ? 'negrito' : 'semibold'),
          {
            flexShrink: 1,
            textAlign: 'center',
            color: ativo ? cores.tinta[900] : cores.tinta[600],
          },
        ]}
      >
        {item.rotulo}
      </Text>
      {item.contador !== undefined ? (
        <Contador n={item.contador} ativo={ativo} />
      ) : null}
    </Pressable>
  );
}

/**
 * Abas em trilho cinza com a ativa em branco (Meus trampos, Perfil). 2 ou 3 itens.
 * Se os rótulos não cabem numa linha (fonte grande ou tela estreita), a aba que
 * sobra desce para uma segunda linha do trilho; nenhum rótulo é cortado.
 */
export function AbasSegmentadas<C extends string>({
  itens,
  selecionada,
  onSelecionar,
  rotulo,
}: PropsDasAbas<C>) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={rotulo}
      style={{
        // Altura = aba (48) + folgas: sem `minHeight` próprio, o trilho nunca
        // fica mais alto que as abas. Numa linha, as abas esticam até a mais
        // alta (`alignItems` padrão), então todas têm a mesma altura.
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: FOLGA_DO_TRILHO,
        gap: FOLGA_DO_TRILHO,
        borderRadius: RAIO_DO_TRILHO,
        backgroundColor: cores.tinta[100],
      }}
    >
      {itens.map((item) => (
        <ItemSegmentado
          key={item.chave}
          item={item}
          ativo={item.chave === selecionada}
          onPress={() => onSelecionar(item.chave)}
        />
      ))}
    </View>
  );
}

function ItemSublinhado<C extends string>({
  item,
  ativo,
  onPress,
}: {
  item: ItemDeAba<C>;
  ativo: boolean;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={rotuloFalado(item)}
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={[
        {
          minHeight: toqueMinimo,
          justifyContent: 'center',
          paddingHorizontal: espaco.xs,
          borderBottomWidth: 3,
          borderBottomColor: ativo ? cores.azul[600] : 'transparent',
        },
        focado && estiloDeFoco,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.xs + 2,
        }}
      >
        <Text
          numberOfLines={1}
          style={[
            estiloDeTexto('corpo', ativo ? 'negrito' : 'semibold'),
            { color: ativo ? cores.tinta[900] : cores.tinta[600] },
          ]}
        >
          {item.rotulo}
        </Text>
        {item.contador !== undefined ? (
          <Contador n={item.contador} ativo={ativo} />
        ) : null}
      </View>
    </Pressable>
  );
}

/** Abas de texto com linha de 3 px na ativa (Demandas). 3 a 4 itens; rola se não couber. */
export function AbasSublinhadas<C extends string>({
  itens,
  selecionada,
  onSelecionar,
  rotulo,
}: PropsDasAbas<C>) {
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: cores.divisor }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel={rotulo}
        contentContainerStyle={{ gap: espaco.l }}
      >
        {itens.map((item) => (
          <ItemSublinhado
            key={item.chave}
            item={item}
            ativo={item.chave === selecionada}
            onPress={() => onSelecionar(item.chave)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
