import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDoChip = {
  texto: string;
  /** Chip de filtro: alterna entre selecionado e não. */
  selecionado?: boolean;
  onPress?: () => void;
  /** Chip removível (habilidade): mostra o botão de remover de 48×48. */
  onRemover?: () => void;
  rotuloRemover?: string;
  desabilitado?: boolean;
};

/** Altura visual 40; o alvo de toque chega a 48 pelo `hitSlop`. */
const ALTURA = 40;
const FOLGA_DE_TOQUE = (toqueMinimo - ALTURA) / 2;

function BotaoRemover({
  rotulo,
  onPress,
}: {
  rotulo: string;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          width: toqueMinimo,
          height: toqueMinimo,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? cores.tinta[100] : 'transparent',
          borderRadius: raio.pill,
        },
        focado && estiloDeFoco,
      ]}
    >
      <Feather name="x" size={18} color={cores.tinta[700]} />
    </Pressable>
  );
}

export function Chip({
  texto,
  selecionado = false,
  onPress,
  onRemover,
  rotuloRemover,
  desabilitado = false,
}: PropsDoChip) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const corDoTexto = desabilitado
    ? cores.tinta[500]
    : selecionado
      ? cores.branco
      : cores.tinta[700];
  const corpo = (
    <>
      {selecionado ? (
        <Feather name="check" size={16} color={corDoTexto} />
      ) : null}
      <Text
        style={[
          estiloDeTexto('corpo', 'semibold'),
          { color: corDoTexto, flexShrink: 1 },
        ]}
      >
        {texto}
      </Text>
    </>
  );
  const caixa = {
    minHeight: ALTURA,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.xs + 2,
    paddingHorizontal: espaco.m,
    borderRadius: raio.pill,
    borderWidth: 1.5,
    borderColor: selecionado ? cores.primaria : cores.divisor,
    backgroundColor: selecionado ? cores.primaria : cores.superficie,
  } as const;

  if (onRemover) {
    return (
      <View
        style={[
          caixa,
          { minHeight: toqueMinimo, paddingRight: 0, alignSelf: 'flex-start' },
        ]}
      >
        <View style={{ flexShrink: 1, flexDirection: 'row', gap: espaco.xs }}>
          {corpo}
        </View>
        <BotaoRemover
          rotulo={rotuloRemover ?? textos.editarPerfil.remover(texto)}
          onPress={onRemover}
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ selected: selecionado, disabled: desabilitado }}
      disabled={desabilitado}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      hitSlop={FOLGA_DE_TOQUE}
      style={({ pressed }) => [
        caixa,
        pressed && !selecionado && { backgroundColor: cores.tinta[50] },
        focado && estiloDeFoco,
        { alignSelf: 'flex-start' },
      ]}
    >
      {corpo}
    </Pressable>
  );
}
