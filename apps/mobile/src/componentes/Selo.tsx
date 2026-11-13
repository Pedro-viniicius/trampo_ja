import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import type { NomeDeIcone } from './utilitarios';

export type VarianteDoSelo =
  | 'aberto'
  | 'em_andamento'
  | 'pendente'
  | 'aceita'
  | 'recusada'
  | 'encerrado'
  | 'neutro'
  // V2
  | 'alerta'
  | 'informacao'
  | 'roxo'
  | 'urgente'
  | 'nova';

export type PropsDoSelo = {
  variante: VarianteDoSelo;
  texto: string;
  /** Troca o ícone padrão da variante (ex.: `map-pin` num selo de cidade). */
  icone?: NomeDeIcone;
  /** Selo só visual, quando o mesmo dado já é falado no cartão. */
  decorativo?: boolean;
};

const { sucesso, erro, alerta, informacao } = cores.feedback;

/** Fundo, texto (>= 4,5:1 sobre o fundo) e ícone de cada variante. */
const aparencia: Record<
  VarianteDoSelo,
  { fundo: string; texto: string; icone: NomeDeIcone }
> = {
  aberto: { fundo: sucesso.fundo, texto: sucesso.texto, icone: 'circle' },
  em_andamento: {
    fundo: informacao.fundo,
    texto: informacao.texto,
    icone: 'play-circle',
  },
  pendente: { fundo: cores.roxo[50], texto: cores.roxo[700], icone: 'clock' },
  aceita: { fundo: sucesso.fundo, texto: sucesso.texto, icone: 'check-circle' },
  recusada: { fundo: erro.fundo, texto: erro.texto, icone: 'x-circle' },
  encerrado: {
    fundo: cores.tinta[100],
    texto: cores.tinta[700],
    icone: 'lock',
  },
  neutro: { fundo: cores.tinta[100], texto: cores.tinta[700], icone: 'tag' },
  alerta: { fundo: alerta.fundo, texto: alerta.texto, icone: 'alert-triangle' },
  informacao: {
    fundo: informacao.fundo,
    texto: informacao.texto,
    icone: 'info',
  },
  roxo: { fundo: cores.roxo[50], texto: cores.roxo[700], icone: 'users' },
  urgente: { fundo: cores.roxo[700], texto: cores.branco, icone: 'zap' },
  nova: { fundo: cores.azul[50], texto: cores.azul[700], icone: 'star' },
};

/** Fundo + ícone + texto: a cor nunca é o único sinal. */
export function Selo({
  variante,
  texto,
  icone,
  decorativo = false,
}: PropsDoSelo) {
  const cor = aparencia[variante];
  return (
    <View
      accessible={!decorativo}
      accessibilityLabel={decorativo ? undefined : textos.gerais.status(texto)}
      accessibilityElementsHidden={decorativo}
      importantForAccessibility={decorativo ? 'no-hide-descendants' : 'auto'}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: espaco.xs,
        minHeight: 26,
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: raio.chip,
        backgroundColor: cor.fundo,
      }}
    >
      <Feather name={icone ?? cor.icone} size={14} color={cor.texto} />
      <Text
        style={[
          estiloDeTexto('sobretitulo', 'negrito'),
          {
            color: cor.texto,
            textTransform: 'none',
            letterSpacing: 0,
            flexShrink: 1,
          },
        ]}
      >
        {texto}
      </Text>
    </View>
  );
}
