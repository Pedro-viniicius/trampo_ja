import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, toqueMinimo } from '../tema/tokens';
import { estiloDeFoco, type NomeDeIcone, useFoco } from './utilitarios';

export type VarianteDoAviso = 'erro' | 'sucesso' | 'info' | 'alerta';

export type PropsDoAviso = {
  variante: VarianteDoAviso;
  texto: string;
  /** Ação opcional (ex.: "Tentar de novo"), à direita do texto. */
  textoAcao?: string;
  onAcao?: () => void;
};

const aparencia: Record<
  VarianteDoAviso,
  { fundo: string; texto: string; icone: NomeDeIcone }
> = {
  erro: { ...cores.feedback.erro, icone: 'alert-circle' },
  sucesso: { ...cores.feedback.sucesso, icone: 'check-circle' },
  info: { ...cores.feedback.informacao, icone: 'info' },
  alerta: { ...cores.feedback.alerta, icone: 'alert-triangle' },
};

/**
 * Faixa de aviso: fundo de feedback, ícone e texto (a cor nunca é o único sinal).
 * Erro é anunciado na hora; sucesso, com educação.
 */
export function Aviso({ variante, texto, textoAcao, onAcao }: PropsDoAviso) {
  const { fundo, texto: corDoTexto, icone } = aparencia[variante];
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
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: espaco.s,
        paddingVertical: espaco.s,
        paddingHorizontal: espaco.m,
        borderRadius: raio.campo,
        backgroundColor: fundo,
      }}
    >
      <View
        style={{
          flex: 1,
          minWidth: 180,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: espaco.s,
          paddingVertical: espaco.s,
        }}
      >
        <Feather
          name={icone}
          size={20}
          color={corDoTexto}
          style={{ marginTop: 1 }}
        />
        <Text
          style={[
            estiloDeTexto('corpo', 'medio'),
            { flex: 1, color: corDoTexto },
          ]}
        >
          {texto}
        </Text>
      </View>
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
              paddingHorizontal: espaco.xs,
              marginLeft: 'auto',
            },
            focado && estiloDeFoco,
          ]}
        >
          <Text
            style={[
              estiloDeTexto('corpo', 'negrito'),
              { color: corDoTexto, textDecorationLine: 'underline' },
            ]}
          >
            {textoAcao}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
