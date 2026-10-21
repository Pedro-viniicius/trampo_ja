import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
import { estiloDeFoco, type NomeDeIcone, useFoco } from './utilitarios';

export type VarianteDoAviso = 'erro' | 'sucesso' | 'info';

export type PropsDoAviso = {
  variante: VarianteDoAviso;
  texto: string;
  /** Ação opcional (ex.: "Tentar de novo"). */
  textoAcao?: string;
  onAcao?: () => void;
};

const aparencia: Record<VarianteDoAviso, { cor: string; icone: NomeDeIcone }> =
  {
    erro: { cor: cores.erro, icone: 'alert-circle' },
    sucesso: { cor: cores.sucesso, icone: 'checkmark-circle' },
    info: { cor: cores.primaria, icone: 'information-circle' },
  };

/** Aviso em linha: ícone + texto (a cor nunca é o único sinal). Erro é anunciado na hora. */
export function Aviso({ variante, texto, textoAcao, onAcao }: PropsDoAviso) {
  const { cor, icone } = aparencia[variante];
  const { focado, aoFocar, aoDesfocar } = useFoco();

  return (
    <View
      accessibilityRole={variante === 'erro' ? 'alert' : undefined}
      accessibilityLiveRegion={
        variante === 'erro'
          ? 'assertive'
          : variante === 'sucesso'
            ? 'polite'
            : undefined
      }
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: espaco[2],
        padding: espaco[3],
        borderRadius: raio.md,
        borderWidth: 1,
        borderColor: cor,
        backgroundColor: cores.superficie,
      }}
    >
      <Ionicons name={icone} size={20} color={cor} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: espaco[1] }}>
        <Text
          style={{
            color: cores.texto,
            fontSize: tipografia.tamanho.rotulo,
            lineHeight: tipografia.lineHeight.rotulo,
          }}
        >
          {texto}
        </Text>
        {textoAcao && onAcao ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textoAcao}
            onPress={onAcao}
            onFocus={aoFocar}
            onBlur={aoDesfocar}
            style={[
              {
                minHeight: toqueMinimo,
                justifyContent: 'center',
                alignSelf: 'flex-start',
              },
              focado && estiloDeFoco,
            ]}
          >
            <Text
              style={{
                color: cores.primaria,
                fontSize: tipografia.tamanho.rotulo,
                fontWeight: tipografia.peso.semibold,
                textDecorationLine: 'underline',
              }}
            >
              {textoAcao}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
