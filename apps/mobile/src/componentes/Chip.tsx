import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDoChip = {
  texto: string;
  /** Chip de filtro: alterna entre selecionado e não. */
  selecionado?: boolean;
  onPress?: () => void;
  /** Chip removível (habilidade): mostra o botão de remover de 44×44. */
  onRemover?: () => void;
  rotuloRemover?: string;
};

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
          backgroundColor: pressed ? cores.superficie : 'transparent',
          borderRadius: raio.md,
        },
        focado && estiloDeFoco,
      ]}
    >
      <Ionicons name="close" size={18} color={cores.texto} />
    </Pressable>
  );
}

export function Chip({
  texto,
  selecionado = false,
  onPress,
  onRemover,
  rotuloRemover,
}: PropsDoChip) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const corDoTexto = selecionado ? cores.branco : cores.texto;
  const corpo = (
    <>
      {selecionado ? (
        <Ionicons name="checkmark" size={16} color={corDoTexto} />
      ) : null}
      <Text
        style={{
          color: corDoTexto,
          fontSize: tipografia.tamanho.rotulo,
          lineHeight: tipografia.lineHeight.rotulo,
          fontWeight: tipografia.peso.medio,
          flexShrink: 1,
        }}
      >
        {texto}
      </Text>
    </>
  );
  const caixa = {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco[1],
    paddingHorizontal: espaco[3],
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: selecionado ? cores.primaria : cores.borda,
    backgroundColor: selecionado ? cores.primaria : cores.superficie,
  } as const;

  if (onRemover) {
    return (
      <View style={[caixa, { paddingRight: 0, alignSelf: 'flex-start' }]}>
        <View style={{ flexShrink: 1 }}>{corpo}</View>
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
      accessibilityState={{ selected: selecionado }}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        caixa,
        pressed && { opacity: 0.8 },
        focado && estiloDeFoco,
        { alignSelf: 'flex-start' },
      ]}
    >
      {corpo}
    </Pressable>
  );
}
