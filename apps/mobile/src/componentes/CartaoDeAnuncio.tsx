import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { cores, espaco, raio, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDoCartaoDeAnuncio = {
  tipo: 'trampo' | 'servico';
  titulo: string;
  categoria: string;
  cidade: string | null;
  /** Ex.: "R$ 1.234,56". */
  valorFormatado: string;
  dataFormatada: string;
  onPress: () => void;
};

export function CartaoDeAnuncio({
  tipo,
  titulo,
  categoria,
  cidade,
  valorFormatado,
  dataFormatada,
  onPress,
}: PropsDoCartaoDeAnuncio) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const ehTrampo = tipo === 'trampo';
  const nomeDoTipo = ehTrampo
    ? textos.gerais.tipoTrampo
    : textos.gerais.tipoServico;
  const rotulo = [
    nomeDoTipo,
    titulo,
    categoria,
    cidade,
    valorFormatado,
    dataFormatada,
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
          gap: espaco[2],
          padding: espaco[4],
          borderRadius: raio.md,
          borderWidth: 1,
          borderColor: cores.borda,
          backgroundColor: pressed ? cores.superficie : cores.fundo,
        },
        focado && estiloDeFoco,
      ]}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: espaco[1] }}
      >
        <Ionicons
          name={ehTrampo ? 'briefcase-outline' : 'construct-outline'}
          size={16}
          color={cores.acento}
        />
        <Text
          style={{
            color: cores.acento,
            fontSize: tipografia.tamanho.legenda,
            lineHeight: tipografia.lineHeight.legenda,
            fontWeight: tipografia.peso.semibold,
          }}
        >
          {nomeDoTipo}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={{
          color: cores.texto,
          fontSize: tipografia.tamanho.tituloDeSeção,
          lineHeight: tipografia.lineHeight.tituloDeSeção,
          fontWeight: tipografia.peso.semibold,
        }}
      >
        {titulo}
      </Text>
      <Text
        numberOfLines={2}
        style={{
          color: cores.textoSecundario,
          fontSize: tipografia.tamanho.rotulo,
          lineHeight: tipografia.lineHeight.rotulo,
        }}
      >
        {cidade ? `${categoria} · ${cidade}` : categoria}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          columnGap: espaco[2],
        }}
      >
        <Text
          style={{
            flexShrink: 1,
            color: cores.texto,
            fontSize: tipografia.tamanho.corpo,
            lineHeight: tipografia.lineHeight.corpo,
            fontWeight: tipografia.peso.negrito,
          }}
        >
          {valorFormatado}
        </Text>
        <Text
          style={{
            color: cores.textoSecundario,
            fontSize: tipografia.tamanho.legenda,
            lineHeight: tipografia.lineHeight.legenda,
          }}
        >
          {dataFormatada}
        </Text>
      </View>
    </Pressable>
  );
}
