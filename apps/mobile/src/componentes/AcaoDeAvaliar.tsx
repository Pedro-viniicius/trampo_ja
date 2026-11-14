import { View } from 'react-native';
import { textos } from '../textos/pt-BR';
import { Botao } from './Botao';
import { Selo } from './Selo';

export type PropsDaAcaoDeAvaliar = {
  /**
   * `undefined` = não dá para avaliar (ou ainda não se sabe): nada aparece.
   * `null` = pode avaliar e ainda não avaliou. Número = já avaliou.
   */
  notaDada?: number | null;
  /** Título do trampo, para o rótulo falado do botão. */
  titulo: string | null;
  /** Texto do botão (ex.: "Avaliar" ou "Avaliar profissional"). */
  texto?: string;
  /** Sem ele, o botão não aparece (o selo "Avaliado com N ★" aparece mesmo assim). */
  onAvaliar?: () => void;
};

/**
 * CA96: "Avaliar" enquanto a conta não avaliou; depois, "Avaliado com N ★".
 * O selo é falado por extenso ("Avaliado com 5 estrelas").
 */
export function AcaoDeAvaliar({
  notaDada,
  titulo,
  texto = textos.avaliar.avaliar,
  onAvaliar,
}: PropsDaAcaoDeAvaliar) {
  if (typeof notaDada === 'number') {
    return (
      <View
        accessible
        accessibilityLabel={textos.avaliar.avaliadoComFalado(notaDada)}
      >
        <Selo
          variante="alerta"
          icone="star"
          texto={textos.avaliar.avaliadoCom(notaDada)}
          decorativo
        />
      </View>
    );
  }
  if (notaDada === null && onAvaliar) {
    return (
      <Botao
        texto={texto}
        rotuloDeAcessibilidade={
          titulo ? textos.avaliar.avaliarDe(titulo) : undefined
        }
        variante="tonal"
        icone="star"
        onPress={onAvaliar}
      />
    );
  }
  return null;
}
