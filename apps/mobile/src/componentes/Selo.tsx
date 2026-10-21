import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { cores, espaco, raio, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import type { NomeDeIcone } from './utilitarios';

export type VarianteDoSelo =
  | 'aberto'
  | 'em_andamento'
  | 'pendente'
  | 'aceita'
  | 'recusada'
  | 'neutro';

export type PropsDoSelo = {
  variante: VarianteDoSelo;
  texto: string;
};

const aparencia: Record<VarianteDoSelo, { cor: string; icone: NomeDeIcone }> = {
  aberto: { cor: cores.sucesso, icone: 'ellipse' },
  em_andamento: { cor: cores.acento, icone: 'play-circle' },
  pendente: { cor: cores.textoSecundario, icone: 'hourglass-outline' },
  aceita: { cor: cores.sucesso, icone: 'checkmark-circle' },
  recusada: { cor: cores.erro, icone: 'close-circle' },
  neutro: { cor: cores.textoSecundario, icone: 'ellipse-outline' },
};

/** Cor + ícone + texto: a cor nunca é o único sinal. */
export function Selo({ variante, texto }: PropsDoSelo) {
  const { cor, icone } = aparencia[variante];
  return (
    <View
      accessible
      accessibilityLabel={textos.gerais.status(texto)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: espaco[1],
        paddingVertical: espaco[1],
        paddingHorizontal: espaco[2],
        borderRadius: raio.sm,
        borderWidth: 1,
        borderColor: cor,
        backgroundColor: cores.superficie,
      }}
    >
      <Ionicons name={icone} size={14} color={cor} />
      <Text
        style={{
          color: cor,
          fontSize: tipografia.tamanho.legenda,
          lineHeight: tipografia.lineHeight.legenda,
          fontWeight: tipografia.peso.semibold,
        }}
      >
        {texto}
      </Text>
    </View>
  );
}
