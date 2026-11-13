import { Pressable, Switch, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco } from '../tema/tokens';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDoInterruptor = {
  rotulo: string;
  descricao?: string;
  valor: boolean;
  onMudar: (valor: boolean) => void;
  desabilitado?: boolean;
  /** Cor do texto (ex.: branco sobre o cartão de modo). */
  claro?: boolean;
};

/** Cores do `Switch` nativo: ligado azul 600, desligado tinta 400, círculo branco. */
export const coresDoInterruptor = {
  trackColor: { false: cores.tinta[400], true: cores.azul[600] },
  thumbColor: cores.branco,
  ios_backgroundColor: cores.tinta[400],
} as const;

/**
 * Linha com rótulo à esquerda e interruptor à direita; a linha inteira (56)
 * alterna o valor e é falada como um interruptor.
 */
export function Interruptor({
  rotulo,
  descricao,
  valor,
  onMudar,
  desabilitado = false,
  claro = false,
}: PropsDoInterruptor) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={rotulo}
      accessibilityHint={descricao}
      accessibilityState={{ checked: valor, disabled: desabilitado }}
      disabled={desabilitado}
      onPress={() => onMudar(!valor)}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={[
        {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.m,
          opacity: desabilitado ? 0.5 : 1,
        },
        focado && estiloDeFoco,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[
            estiloDeTexto('corpo', 'negrito'),
            { color: claro ? cores.branco : cores.texto },
          ]}
        >
          {rotulo}
        </Text>
        {descricao ? (
          <Text
            style={[
              estiloDeTexto('legenda'),
              { color: claro ? cores.tinta[200] : cores.textoSecundario },
            ]}
          >
            {descricao}
          </Text>
        ) : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <Switch value={valor} disabled={desabilitado} {...coresDoInterruptor} />
      </View>
    </Pressable>
  );
}
