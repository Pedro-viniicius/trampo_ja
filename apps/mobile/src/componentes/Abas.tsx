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
          flex: 1,
          minHeight: toqueMinimo,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: espaco.xs + 2,
          paddingHorizontal: espaco.s,
          borderRadius: raio.pill,
          backgroundColor: ativo ? cores.branco : 'transparent',
        },
        ativo ? sombra.sm : null,
        focado && estiloDeFoco,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          estiloDeTexto('corpo', ativo ? 'negrito' : 'semibold'),
          {
            flexShrink: 1,
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

/** Abas em trilho cinza com a ativa em branco (Meus trampos, Perfil). 2 ou 3 itens. */
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
        minHeight: 56,
        flexDirection: 'row',
        padding: 4,
        gap: 4,
        borderRadius: raio.pill,
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
