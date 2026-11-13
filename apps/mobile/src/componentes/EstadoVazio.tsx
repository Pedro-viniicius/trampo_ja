import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco } from '../tema/tokens';
import { Botao, type VarianteDoBotao } from './Botao';
import type { NomeDeIcone } from './utilitarios';

export type PropsDoEstadoVazio = {
  icone: NomeDeIcone;
  titulo: string;
  texto?: string;
  textoAcao?: string;
  onAcao?: () => void;
  /** Variante de erro: círculo de erro (a ação costuma ser "Tentar de novo"). */
  erro?: boolean;
  /** `tonal` (padrão) ou `primario`, quando é a ação principal da tela. */
  varianteDaAcao?: Extract<VarianteDoBotao, 'tonal' | 'primario'>;
};

const LADO_DO_CIRCULO = 80;

/** Vazio ou erro de uma lista: ícone em círculo, título, texto e uma ação. */
export function EstadoVazio({
  icone,
  titulo,
  texto,
  textoAcao,
  onAcao,
  erro = false,
  varianteDaAcao = 'tonal',
}: PropsDoEstadoVazio) {
  return (
    <View
      style={{
        alignItems: 'center',
        gap: espaco.s,
        paddingVertical: espaco.xl,
        paddingHorizontal: espaco.m,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: LADO_DO_CIRCULO,
          height: LADO_DO_CIRCULO,
          borderRadius: LADO_DO_CIRCULO / 2,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: espaco.s,
          backgroundColor: erro ? cores.feedback.erro.fundo : cores.azul[50],
        }}
      >
        <Feather
          name={icone}
          size={32}
          color={erro ? cores.feedback.erro.texto : cores.primaria}
        />
      </View>
      <Text
        accessibilityRole="header"
        style={[
          estiloDeTexto('h3'),
          { color: cores.texto, textAlign: 'center' },
        ]}
      >
        {titulo}
      </Text>
      {texto ? (
        <Text
          style={[
            estiloDeTexto('corpo'),
            {
              color: cores.textoSecundario,
              textAlign: 'center',
              maxWidth: 420,
            },
          ]}
        >
          {texto}
        </Text>
      ) : null}
      {textoAcao && onAcao ? (
        <View style={{ marginTop: espaco.s, alignSelf: 'stretch' }}>
          <Botao texto={textoAcao} variante={varianteDaAcao} onPress={onAcao} />
        </View>
      ) : null}
    </View>
  );
}
