import { Text } from 'react-native';
import { cores, tipografia } from '../tema/tokens';

export type PropsDoMotivo = {
  texto: string;
};

/** Explica por que o botão acima está desabilitado. Fica sempre abaixo do botão. */
export function Motivo({ texto }: PropsDoMotivo) {
  return (
    <Text
      style={{
        color: cores.textoSecundario,
        fontSize: tipografia.tamanho.rotulo,
        lineHeight: tipografia.lineHeight.rotulo,
      }}
    >
      {texto}
    </Text>
  );
}
