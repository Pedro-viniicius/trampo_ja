import { Feather } from '@expo/vector-icons';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra, toqueMinimo } from '../tema/tokens';
import { estiloDeFoco, type NomeDeIcone, useFoco } from './utilitarios';

/** Fundo do quadrado do ícone (cor de feedback); o ícone usa o texto do mesmo tom. */
export type TomDaLinha =
  | 'azul'
  | 'roxo'
  | 'alerta'
  | 'sucesso'
  | 'erro'
  | 'neutro';

export type PropsDaLinhaDeConfiguracao = {
  titulo: string;
  descricao?: string;
  icone: NomeDeIcone;
  tom?: TomDaLinha;
  /** Ação sem volta (ex.: excluir): texto e ícone na cor de erro. */
  destrutiva?: boolean;
  desabilitada?: boolean;
  onPress: () => void;
};

const tons: Record<TomDaLinha, { fundo: string; icone: string }> = {
  azul: { fundo: cores.azul[50], icone: cores.azul[700] },
  roxo: { fundo: cores.roxo[50], icone: cores.roxo[700] },
  alerta: {
    fundo: cores.feedback.alerta.fundo,
    icone: cores.feedback.alerta.texto,
  },
  sucesso: {
    fundo: cores.feedback.sucesso.fundo,
    icone: cores.feedback.sucesso.texto,
  },
  erro: { fundo: cores.feedback.erro.fundo, icone: cores.feedback.erro.texto },
  neutro: { fundo: cores.tinta[100], icone: cores.tinta[700] },
};

const ALTURA_MINIMA = 72;

/** Linha de lista de configurações: ícone, título, descrição e seta. Toda a linha é tocável. */
export function LinhaDeConfiguracao({
  titulo,
  descricao,
  icone,
  tom = 'azul',
  destrutiva = false,
  desabilitada = false,
  onPress,
}: PropsDaLinhaDeConfiguracao) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const corDoTom = tons[destrutiva ? 'erro' : tom];
  const corDoTitulo = destrutiva ? cores.erro : cores.texto;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={descricao ? `${titulo}. ${descricao}` : titulo}
      accessibilityState={{ disabled: desabilitada }}
      disabled={desabilitada}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: ALTURA_MINIMA,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.m,
          paddingVertical: espaco.s + espaco.xs,
          paddingHorizontal: espaco.m,
          borderRadius: raio.campo,
          backgroundColor: pressed ? cores.tinta[50] : 'transparent',
          opacity: desabilitada ? 0.5 : 1,
        },
        focado && estiloDeFoco,
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: toqueMinimo,
          height: toqueMinimo,
          borderRadius: raio.campo,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: corDoTom.fundo,
        }}
      >
        <Feather name={icone} size={22} color={corDoTom.icone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[estiloDeTexto('corpo', 'negrito'), { color: corDoTitulo }]}
        >
          {titulo}
        </Text>
        {descricao ? (
          <Text
            style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
          >
            {descricao}
          </Text>
        ) : null}
      </View>
      <Feather
        name="chevron-right"
        size={20}
        color={cores.textoSecundario}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

export type PropsDoGrupoDeConfiguracao = {
  children: ReactNode;
};

/** Cartão branco que junta linhas de configuração, com divisor entre elas. */
export function GrupoDeConfiguracao({ children }: PropsDoGrupoDeConfiguracao) {
  const linhas = Children.toArray(children).filter(Boolean);
  return (
    <View
      style={[
        {
          padding: espaco.xs,
          borderRadius: raio.card,
          backgroundColor: cores.superficie,
        },
        sombra.sm,
      ]}
    >
      {linhas.map((linha, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a ordem das linhas é fixa.
        <Fragment key={i}>
          {i > 0 ? (
            <View
              style={{
                height: 1,
                marginHorizontal: espaco.m,
                backgroundColor: cores.divisor,
              }}
            />
          ) : null}
          {linha}
        </Fragment>
      ))}
    </View>
  );
}
