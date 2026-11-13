import { Image, View } from 'react-native';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';

export type PropsDaLogo = {
  tamanho?: 'pequeno' | 'grande';
};

/** Lados da imagem: mínimo 48 (pequeno) e 112 (grande, dentro da faixa 96–128 da spec). */
const lados = { pequeno: 48, grande: 112 } as const;

/** O raster tem fundo branco: vai sempre num contêiner branco com raio e respiro de 16. */
export function Logo({ tamanho = 'grande' }: PropsDaLogo) {
  const lado = lados[tamanho];
  return (
    <View
      style={[
        {
          alignSelf: 'center',
          padding: espaco.m,
          borderRadius: raio.card,
          backgroundColor: cores.branco,
        },
        sombra.sm,
      ]}
    >
      <Image
        source={require('../../assets/logo.png')}
        accessibilityRole="image"
        accessibilityLabel={textos.entrada.logo}
        style={{ width: lado, height: lado }}
        resizeMode="contain"
      />
    </View>
  );
}
