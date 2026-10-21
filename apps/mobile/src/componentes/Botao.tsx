import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  Text,
  type ViewStyle,
} from 'react-native';
import { cores, espaco, raio, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { estiloDeFoco, type NomeDeIcone, useFoco } from './utilitarios';

export type VarianteDoBotao =
  | 'primario'
  | 'secundario'
  | 'texto'
  | 'destrutivo';

export type PropsDoBotao = {
  texto: string;
  onPress: () => void;
  variante?: VarianteDoBotao;
  /** Mostra indicador, troca o texto e bloqueia novo toque (evita duplo envio). */
  carregando?: boolean;
  /** Texto do estado carregando (ex.: "Entrando…"). */
  textoCarregando?: string;
  desabilitado?: boolean;
  larguraCheia?: boolean;
  icone?: NomeDeIcone;
  accessibilityHint?: string;
  /** Rótulo falado, quando precisa dizer mais que o texto (ex.: o nome da pessoa). */
  rotuloDeAcessibilidade?: string;
  estilo?: StyleProp<ViewStyle>;
};

const ALTURA = 48;

const paleta = {
  primario: {
    fundo: cores.primaria,
    pressionado: cores.primariaPressionada,
    texto: cores.branco,
    borda: cores.primaria,
  },
  secundario: {
    fundo: cores.fundo,
    pressionado: cores.superficie,
    texto: cores.primaria,
    borda: cores.primaria,
  },
  texto: {
    fundo: 'transparent',
    pressionado: cores.superficie,
    texto: cores.primaria,
    borda: 'transparent',
  },
  destrutivo: {
    fundo: cores.erro,
    pressionado: cores.erro,
    texto: cores.branco,
    borda: cores.erro,
  },
} as const;

export function Botao({
  texto,
  onPress,
  variante = 'primario',
  carregando = false,
  textoCarregando = textos.gerais.carregando,
  desabilitado = false,
  larguraCheia = true,
  icone,
  accessibilityHint,
  rotuloDeAcessibilidade,
  estilo,
}: PropsDoBotao) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const cor = paleta[variante];
  const bloqueado = desabilitado || carregando;
  const rotulo = carregando ? textoCarregando : texto;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        carregando ? rotulo : (rotuloDeAcessibilidade ?? rotulo)
      }
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: bloqueado, busy: carregando }}
      disabled={bloqueado}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: ALTURA,
          paddingHorizontal: espaco[4],
          borderRadius: raio.md,
          borderWidth: 2,
          borderColor: cor.borda,
          backgroundColor: pressed ? cor.pressionado : cor.fundo,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: espaco[2],
          alignSelf: larguraCheia ? 'stretch' : 'flex-start',
          opacity:
            bloqueado && !carregando
              ? 0.5
              : pressed && variante === 'destrutivo'
                ? 0.85
                : 1,
        },
        focado && estiloDeFoco,
        estilo,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={cor.texto} />
      ) : icone ? (
        <Ionicons name={icone} size={20} color={cor.texto} />
      ) : null}
      <Text
        style={{
          color: cor.texto,
          fontSize: tipografia.tamanho.corpo,
          lineHeight: tipografia.lineHeight.corpo,
          fontWeight: tipografia.peso.semibold,
          flexShrink: 1,
          textAlign: 'center',
        }}
      >
        {rotulo}
      </Text>
    </Pressable>
  );
}
