import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { estiloDeFoco, useFoco } from './utilitarios';

const NOTAS = [1, 2, 3, 4, 5] as const;

/**
 * Estrela do desenho: marcada = cheia (★, `alerta.texto`), não marcada = só
 * contorno (Feather, `tinta[500]`). Forma e cor mudam juntas e as duas passam
 * de 3:1 sobre branco (1.4.1 e 1.4.11).
 */
function DesenhoDeEstrela({
  marcada,
  tamanho,
}: {
  marcada: boolean;
  tamanho: number;
}) {
  return marcada ? (
    <Text
      accessible={false}
      importantForAccessibility="no"
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: tamanho,
        lineHeight: tamanho,
        textAlign: 'center',
        color: cores.feedback.alerta.texto,
      }}
    >
      {'\u2605'}
    </Text>
  ) : (
    <Feather name="star" size={tamanho} color={cores.tinta[500]} />
  );
}

/** "4,9" (vírgula decimal, uma casa). */
export function formatarNota(media: number): string {
  return media.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export type PropsDasEstrelas = {
  /** Média de 0 a 5. */
  media: number;
  /** Total de avaliações, mostrado entre parênteses quando informado. */
  total?: number;
  tamanho?: number;
};

/**
 * Nota em exibição: estrelas decorativas (cheia x contorno) e o número em
 * texto. Falado como "Nota 4,9 de 5".
 */
export function Estrelas({ media, total, tamanho = 16 }: PropsDasEstrelas) {
  const nota = formatarNota(media);
  const cheias = Math.round(media);
  return (
    <View
      accessible
      accessibilityLabel={
        total === undefined
          ? textos.gerais.nota(nota)
          : `${textos.gerais.nota(nota)}, ${textos.avaliacoes.recebidas(total)}`
      }
      style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.xs }}
    >
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {NOTAS.map((n) => (
          <DesenhoDeEstrela key={n} marcada={n <= cheias} tamanho={tamanho} />
        ))}
      </View>
      <Text
        style={[estiloDeTexto('legenda', 'negrito'), { color: cores.texto }]}
      >
        {total === undefined ? nota : textos.avaliacoes.resumo(nota, total)}
      </Text>
    </View>
  );
}

export type PropsDasEstrelasDeAvaliacao = {
  /** 0 = sem nota. */
  nota: number;
  onMudar: (nota: number) => void;
  desabilitado?: boolean;
};

function Estrela({
  n,
  marcada,
  selecionada,
  desabilitado,
  onPress,
}: {
  n: number;
  marcada: boolean;
  selecionada: boolean;
  desabilitado: boolean;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={textos.avaliar.rotuloEstrela(n)}
      accessibilityState={{ checked: selecionada, disabled: desabilitado }}
      disabled={desabilitado}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          width: toqueMinimo,
          height: toqueMinimo,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: raio.campo,
          backgroundColor: pressed
            ? cores.feedback.alerta.fundo
            : 'transparent',
        },
        focado && estiloDeFoco,
      ]}
    >
      <DesenhoDeEstrela marcada={marcada} tamanho={36} />
    </Pressable>
  );
}

/**
 * Entrada de nota (tela Avaliar): grupo de rádio com 5 estrelas de 48 e o
 * rótulo da nota em texto ("Ruim" a "Excelente!"), nunca só a cor.
 */
export function EstrelasDeAvaliacao({
  nota,
  onMudar,
  desabilitado = false,
}: PropsDasEstrelasDeAvaliacao) {
  const rotuloDaNota =
    nota >= 1 && nota <= 5
      ? (textos.avaliar.notas[nota - 1] ?? textos.avaliar.notaVazia)
      : textos.avaliar.notaVazia;
  return (
    <View style={{ alignItems: 'center', gap: espaco.s }}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={textos.avaliar.notaRotulo}
        style={{ flexDirection: 'row', gap: espaco.xs }}
      >
        {NOTAS.map((n) => (
          <Estrela
            key={n}
            n={n}
            marcada={n <= nota}
            selecionada={n === nota}
            desabilitado={desabilitado}
            onPress={() => onMudar(n)}
          />
        ))}
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[
          estiloDeTexto('corpo', nota > 0 ? 'negrito' : 'normal'),
          { color: nota > 0 ? cores.texto : cores.textoSecundario },
        ]}
      >
        {rotuloDaNota}
      </Text>
    </View>
  );
}
