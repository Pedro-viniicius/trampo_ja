import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, movimento, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  estiloDeFoco,
  type NomeDeIcone,
  pontosDoGradiente,
  useFoco,
  useReduzirMovimento,
} from './utilitarios';

/**
 * Variantes V2 (spec, `Botao`):
 * - `primario`: gradiente de ação, uma por tela;
 * - `secundario`: tinta 900 com texto branco;
 * - `tonal`: azul 50 com texto azul 700 (ações de apoio);
 * - `contorno`: branco com borda, neutro;
 * - `urgente`: roxo 700 com raio;
 * - `texto`: sem fundo, texto azul 600;
 * - `destrutivo`: fundo de erro claro com texto de erro (ex.: "Excluir");
 * - `perigo`: fundo de erro escuro com texto branco (só a confirmação final do diálogo).
 */
export type VarianteDoBotao =
  | 'primario'
  | 'secundario'
  | 'tonal'
  | 'contorno'
  | 'urgente'
  | 'texto'
  | 'destrutivo'
  | 'perigo';

/** Grande 56, médio 48 (padrão), pequeno 40 (só em linha; toque continua 48). */
export type TamanhoDoBotao = 'grande' | 'medio' | 'pequeno';

export type PropsDoBotao = {
  texto: string;
  onPress: () => void;
  variante?: VarianteDoBotao;
  tamanho?: TamanhoDoBotao;
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

const ALTURA: Record<TamanhoDoBotao, number> = {
  grande: 56,
  medio: 48,
  pequeno: 40,
};

type Paleta = {
  fundo: string;
  pressionado: string;
  texto: string;
  /** Texto e borda quando pressionado (só o contorno muda). */
  textoPressionado?: string;
  borda?: string;
  bordaPressionada?: string;
};

const paleta: Record<Exclude<VarianteDoBotao, 'primario'>, Paleta> = {
  secundario: {
    fundo: cores.tinta[900],
    pressionado: cores.tinta[950],
    texto: cores.branco,
  },
  tonal: {
    fundo: cores.azul[50],
    pressionado: cores.azul[100],
    texto: cores.azul[700],
  },
  contorno: {
    fundo: cores.branco,
    pressionado: cores.tinta[50],
    texto: cores.tinta[900],
    textoPressionado: cores.azul[600],
    borda: cores.divisor,
    bordaPressionada: cores.azul[600],
  },
  urgente: {
    fundo: cores.roxo[700],
    pressionado: cores.roxo[800],
    texto: cores.branco,
  },
  texto: {
    fundo: 'transparent',
    pressionado: cores.azul[50],
    texto: cores.primaria,
  },
  destrutivo: {
    fundo: cores.feedback.erro.fundo,
    pressionado: cores.feedback.erro.fundo,
    texto: cores.feedback.erro.texto,
  },
  perigo: {
    fundo: cores.feedback.erro.texto,
    pressionado: cores.feedback.erro.texto,
    texto: cores.branco,
  },
};

/** Desabilitado: inativo, isento de contraste (a causa aparece em texto ao lado). */
const DESABILITADO = { fundo: cores.tinta[100], texto: cores.tinta[500] };

export function Botao({
  texto,
  onPress,
  variante = 'primario',
  tamanho = 'medio',
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
  const reduzirMovimento = useReduzirMovimento();
  const bloqueado = desabilitado || carregando;
  const inativo = desabilitado && !carregando;
  const rotulo = carregando ? textoCarregando : texto;
  const altura = ALTURA[tamanho];
  const gradiente = variante === 'primario' && !inativo;
  const iconeFinal = icone ?? (variante === 'urgente' ? 'zap' : undefined);

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
      hitSlop={tamanho === 'pequeno' ? 4 : undefined}
      style={({ pressed }) => {
        const cor =
          variante === 'primario' || inativo
            ? null
            : (paleta[variante] as Paleta);
        return [
          {
            minHeight: altura,
            borderRadius: raio.pill,
            alignSelf: larguraCheia ? 'stretch' : 'flex-start',
            overflow: 'hidden',
            backgroundColor: inativo
              ? DESABILITADO.fundo
              : cor
                ? pressed
                  ? cor.pressionado
                  : cor.fundo
                : 'transparent',
            borderWidth: cor?.borda ? 1.5 : 0,
            borderColor: cor?.borda
              ? pressed
                ? cor.bordaPressionada
                : cor.borda
              : undefined,
            transform: [
              {
                scale:
                  pressed && !reduzirMovimento ? movimento.pressaoEscala : 1,
              },
            ],
          },
          gradiente ? sombra.marca : null,
          focado && estiloDeFoco,
          estilo,
        ];
      }}
    >
      {({ pressed }) => {
        const cor =
          variante === 'primario' || inativo
            ? null
            : (paleta[variante] as Paleta);
        const corDoTexto = inativo
          ? DESABILITADO.texto
          : cor
            ? pressed && cor.textoPressionado
              ? cor.textoPressionado
              : cor.texto
            : cores.branco;
        const conteudo = (
          <View
            style={{
              minHeight: altura,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: espaco.s,
              paddingHorizontal: tamanho === 'pequeno' ? espaco.m : espaco.l,
              paddingVertical: espaco.xs,
            }}
          >
            {carregando ? (
              <ActivityIndicator color={corDoTexto} />
            ) : iconeFinal ? (
              <Feather name={iconeFinal} size={20} color={corDoTexto} />
            ) : null}
            <Text
              style={[
                estiloDeTexto('botao'),
                { color: corDoTexto, flexShrink: 1, textAlign: 'center' },
              ]}
            >
              {rotulo}
            </Text>
          </View>
        );
        return gradiente ? (
          <LinearGradient
            colors={[
              ...(pressed
                ? cores.gradienteAcaoPressionado
                : cores.gradienteAcao),
            ]}
            {...pontosDoGradiente}
            style={{ borderRadius: raio.pill }}
          >
            {conteudo}
          </LinearGradient>
        ) : (
          conteudo
        );
      }}
    </Pressable>
  );
}
