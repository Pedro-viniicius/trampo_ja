import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Estrelas, formatarNota } from './Estrelas';
import { estiloDeFoco, useFoco, useReduzirMovimento } from './utilitarios';

export type PropsDoCartaoDeAnuncio = {
  tipo: 'trampo' | 'servico';
  titulo: string;
  categoria: string;
  cidade: string | null;
  /** Ex.: "R$ 1.234,56". */
  valorFormatado: string;
  /** Data de publicação; aparece com o ícone de relógio, nunca no lugar do prazo. */
  dataFormatada: string;
  /**
   * Prazo do trampo (ex.: "30/11/2026"). `string` = mostra o prazo; `null` =
   * o trampo não tem prazo ("Sem prazo definido"); `undefined` = a lista não
   * sabe (a busca não devolve o prazo): sem a linha do calendário e sem o
   * prazo no rótulo falado. Serviço não tem prazo e não mostra a linha.
   */
  prazoFormatado?: string | null;
  /** Nome de quem publicou, quando a lista trouxer. */
  autor?: string | null;
  /** V2b (CA97): nota de quem publicou, ao lado do `autor`; sem os dois, não aparece. */
  nota?: { media: number; total: number } | null;
  onPress: () => void;
};

/**
 * Cartão de trampo ou serviço (V2): branco, raio 24, sombra leve. O cartão
 * inteiro é um botão; a seta redonda é só visual.
 */
export function CartaoDeAnuncio({
  tipo,
  titulo,
  categoria,
  cidade,
  valorFormatado,
  dataFormatada,
  prazoFormatado,
  autor,
  nota,
  onPress,
}: PropsDoCartaoDeAnuncio) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const reduzirMovimento = useReduzirMovimento();
  const ehTrampo = tipo === 'trampo';
  const nomeDoTipo = ehTrampo
    ? textos.gerais.tipoTrampo
    : textos.gerais.tipoServico;
  const textoDoPrazo =
    ehTrampo && prazoFormatado !== undefined
      ? (prazoFormatado ?? textos.detalheTrampo.semPrazo)
      : null;
  const rotulo = [
    nomeDoTipo,
    titulo,
    categoria,
    cidade,
    autor,
    autor && nota && nota.total > 0
      ? `${textos.gerais.nota(formatarNota(nota.media))}, ${textos.avaliacoes.recebidas(nota.total)}`
      : null,
    textoDoPrazo,
    valorFormatado,
    textos.gerais.publicadoEm(dataFormatada),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          gap: espaco.s,
          padding: espaco.m,
          borderRadius: raio.card,
          backgroundColor: cores.superficie,
          transform: [{ translateY: pressed && !reduzirMovimento ? -2 : 0 }],
        },
        pressed ? sombra.md : sombra.sm,
        focado && estiloDeFoco,
      ]}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.xs }}
      >
        <Feather
          name={ehTrampo ? 'briefcase' : 'tool'}
          size={14}
          color={cores.acento}
        />
        <Text
          style={[
            estiloDeTexto('sobretitulo', 'negrito'),
            { color: cores.acento },
          ]}
        >
          {nomeDoTipo}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={[estiloDeTexto('h3'), { color: cores.texto }]}
      >
        {titulo}
      </Text>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.xs }}
      >
        <Feather name="map-pin" size={14} color={cores.textoSecundario} />
        <Text
          numberOfLines={2}
          style={[
            estiloDeTexto('legenda'),
            { flex: 1, color: cores.textoSecundario },
          ]}
        >
          {cidade ? `${categoria} · ${cidade}` : categoria}
        </Text>
      </View>
      {autor ? (
        <Text
          numberOfLines={1}
          style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
        >
          {autor}
        </Text>
      ) : null}
      {autor && nota && nota.total > 0 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Estrelas media={nota.media} total={nota.total} />
        </View>
      ) : null}
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.xs }}
      >
        <Feather name="clock" size={14} color={cores.textoSecundario} />
        <Text
          numberOfLines={1}
          style={[
            estiloDeTexto('legenda'),
            { flexShrink: 1, color: cores.textoSecundario },
          ]}
        >
          {dataFormatada}
        </Text>
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: cores.divisor,
          marginVertical: espaco.xs,
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.s,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: espaco.xs,
          }}
        >
          {textoDoPrazo !== null ? (
            <>
              <Feather
                name="calendar"
                size={14}
                color={cores.textoSecundario}
              />
              <Text
                numberOfLines={1}
                style={[
                  estiloDeTexto('legenda'),
                  { flexShrink: 1, color: cores.textoSecundario },
                ]}
              >
                {textoDoPrazo}
              </Text>
            </>
          ) : null}
        </View>
        <Text style={[estiloDeTexto('h3'), { color: cores.texto }]}>
          {valorFormatado}
        </Text>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: raio.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: cores.primaria,
          }}
        >
          <Feather name="chevron-right" size={18} color={cores.branco} />
        </View>
      </View>
    </Pressable>
  );
}
