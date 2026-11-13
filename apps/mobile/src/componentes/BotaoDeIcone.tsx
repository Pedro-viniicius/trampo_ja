import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, movimento, raio, sombra, toqueMinimo } from '../tema/tokens';
import {
  estiloDeFoco,
  type NomeDeIcone,
  pontosDoGradiente,
  useFoco,
  useReduzirMovimento,
} from './utilitarios';

/**
 * - `claro`: branco com sombra (voltar, compartilhar, sobre a faixa gradiente);
 * - `escuro`: tinta 900 (filtro da busca);
 * - `gradiente`: gradiente de ação (o "+" de Nova demanda);
 * - `transparente`: sem fundo (⋯ dentro de cartão).
 */
export type VarianteDoBotaoDeIcone =
  | 'claro'
  | 'escuro'
  | 'gradiente'
  | 'transparente';

export type PropsDoBotaoDeIcone = {
  icone: NomeDeIcone;
  /** Obrigatório: o ícone sozinho não diz nada ao leitor de tela. */
  rotulo: string;
  onPress: () => void;
  variante?: VarianteDoBotaoDeIcone;
  /** Lado em pontos (mínimo 48). */
  tamanho?: number;
  desabilitado?: boolean;
  /** Número no canto (ex.: filtros ativos). O rótulo deve dizer o número também. */
  contador?: number;
  accessibilityHint?: string;
};

const aparencia: Record<
  Exclude<VarianteDoBotaoDeIcone, 'gradiente'>,
  { fundo: string; pressionado: string; icone: string }
> = {
  claro: {
    fundo: cores.branco,
    pressionado: cores.tinta[100],
    icone: cores.tinta[900],
  },
  escuro: {
    fundo: cores.tinta[900],
    pressionado: cores.tinta[950],
    icone: cores.branco,
  },
  transparente: {
    fundo: 'transparent',
    pressionado: cores.tinta[100],
    icone: cores.tinta[900],
  },
};

/** Botão redondo só com ícone, alvo de 48 ou mais. */
export function BotaoDeIcone({
  icone,
  rotulo,
  onPress,
  variante = 'claro',
  tamanho = toqueMinimo,
  desabilitado = false,
  contador,
  accessibilityHint,
}: PropsDoBotaoDeIcone) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const reduzirMovimento = useReduzirMovimento();
  const lado = Math.max(tamanho, toqueMinimo);
  const cor = variante === 'gradiente' ? null : aparencia[variante];
  const corDoIcone = desabilitado
    ? cores.tinta[500]
    : (cor?.icone ?? cores.branco);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: desabilitado }}
      disabled={desabilitado}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          width: lado,
          height: lado,
          borderRadius: raio.pill,
          backgroundColor: desabilitado
            ? cores.tinta[100]
            : cor
              ? pressed
                ? cor.pressionado
                : cor.fundo
              : 'transparent',
          transform: [
            {
              scale: pressed && !reduzirMovimento ? movimento.pressaoEscala : 1,
            },
          ],
        },
        variante === 'claro' && !desabilitado ? sombra.sm : null,
        variante === 'gradiente' && !desabilitado ? sombra.marca : null,
        focado && estiloDeFoco,
      ]}
    >
      {({ pressed }) => (
        <>
          {variante === 'gradiente' && !desabilitado ? (
            <LinearGradient
              colors={[
                ...(pressed
                  ? cores.gradienteAcaoPressionado
                  : cores.gradienteAcao),
              ]}
              {...pontosDoGradiente}
              style={{
                width: lado,
                height: lado,
                borderRadius: raio.pill,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name={icone} size={24} color={corDoIcone} />
            </LinearGradient>
          ) : (
            <View
              style={{
                width: lado,
                height: lado,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name={icone} size={22} color={corDoIcone} />
            </View>
          )}
          {contador ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                minWidth: 20,
                height: 20,
                paddingHorizontal: 4,
                borderRadius: raio.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: cores.azul[600],
                borderWidth: 2,
                borderColor: cores.branco,
              }}
            >
              <Text
                allowFontScaling={false}
                style={[
                  estiloDeTexto('sobretitulo', 'negrito'),
                  { color: cores.branco, letterSpacing: 0, lineHeight: 14 },
                ]}
              >
                {contador > 99 ? '99+' : String(contador)}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}
