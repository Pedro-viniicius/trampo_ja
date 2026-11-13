import { Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, raio } from '../tema/tokens';
import { Avatar } from './Avatar';

export type PropsDaPilhaDeAvatares = {
  nomes: readonly string[];
  /** Lado de cada avatar (padrão 32). */
  tamanho?: number;
  /** Quantos aparecem antes do "+N" (padrão 3). */
  maximo?: number;
};

/**
 * Até 3 avatares sobrepostos e "+N". Decorativa: o texto ao lado ("N
 * interessados") diz o número ao leitor de tela.
 */
export function PilhaDeAvatares({
  nomes,
  tamanho = 32,
  maximo = 3,
}: PropsDaPilhaDeAvatares) {
  const visiveis = nomes.slice(0, maximo);
  const resto = nomes.length - visiveis.length;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center' }}
    >
      {visiveis.map((nome, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: nomes podem repetir; a ordem é estável.
          key={i}
          style={{
            marginLeft: i === 0 ? 0 : -8,
            borderRadius: tamanho / 3 + 2,
            borderWidth: 2,
            borderColor: cores.branco,
          }}
        >
          <Avatar nome={nome} tamanho={tamanho} />
        </View>
      ))}
      {resto > 0 ? (
        <View
          style={{
            marginLeft: -8,
            minWidth: tamanho + 4,
            height: tamanho + 4,
            paddingHorizontal: 4,
            borderRadius: raio.pill,
            borderWidth: 2,
            borderColor: cores.branco,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: cores.tinta[100],
          }}
        >
          <Text
            allowFontScaling={false}
            style={[
              estiloDeTexto('sobretitulo', 'negrito'),
              { color: cores.tinta[700] },
            ]}
          >
            {`+${resto}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
