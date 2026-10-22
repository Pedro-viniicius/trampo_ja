import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDaBolhaDeMensagem = {
  /** Minha mensagem: à direita, fundo primário. */
  minha: boolean;
  texto: string;
  /** `null` enquanto não há hora confirmada. */
  horaFormatada: string | null;
  situacao: 'enviada' | 'enviando' | 'falhou';
  /** Nome de quem escreveu (só para o rótulo falado das mensagens do outro). */
  nome?: string | null;
  /** Toque na bolha que falhou. Sem ele, a bolha não é tocável. */
  onTentarDeNovo?: () => void;
};

const corDoTextoSecundario = {
  color: cores.textoSecundario,
  fontSize: tipografia.tamanho.legenda,
  lineHeight: tipografia.lineHeight.legenda,
} as const;

/** Bolha de mensagem: o texto da mensagem é conteúdo; a hora e a situação ficam abaixo. */
export function BolhaDeMensagem({
  minha,
  texto,
  horaFormatada,
  situacao,
  nome = null,
  onTentarDeNovo,
}: PropsDaBolhaDeMensagem) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const quem = minha
    ? textos.conversas.minha(horaFormatada)
    : textos.conversas.deNome(nome, horaFormatada);
  const situacaoFalada =
    situacao === 'enviando'
      ? textos.conversas.rotuloEnviando
      : situacao === 'falhou'
        ? textos.conversas.rotuloNaoEnviada
        : null;
  const rotulo = [quem, situacaoFalada, texto].filter(Boolean).join('. ');
  const tocavel = situacao === 'falhou' && onTentarDeNovo !== undefined;

  const conteudo = (
    <View style={{ alignItems: minha ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          maxWidth: '100%',
          paddingHorizontal: espaco[3],
          paddingVertical: espaco[2],
          borderRadius: raio.md,
          backgroundColor: minha ? cores.primaria : cores.superficie,
        }}
      >
        <Text
          style={{
            color: minha ? cores.branco : cores.texto,
            fontSize: tipografia.tamanho.corpo,
            lineHeight: tipografia.lineHeight.corpo,
          }}
        >
          {texto}
        </Text>
      </View>
      {situacao === 'enviada' && horaFormatada ? (
        <Text style={{ ...corDoTextoSecundario, marginTop: espaco[1] }}>
          {horaFormatada}
        </Text>
      ) : null}
      {situacao === 'enviando' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: espaco[1],
            marginTop: espaco[1],
          }}
        >
          <Ionicons
            name="time-outline"
            size={14}
            color={cores.textoSecundario}
          />
          <Text style={corDoTextoSecundario}>
            {textos.conversas.rotuloEnviando}
          </Text>
        </View>
      ) : null}
      {situacao === 'falhou' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: espaco[1],
            marginTop: espaco[1],
          }}
        >
          <Ionicons name="alert-circle" size={16} color={cores.erro} />
          <Text
            style={{
              flexShrink: 1,
              color: cores.erro,
              fontSize: tipografia.tamanho.legenda,
              lineHeight: tipografia.lineHeight.legenda,
            }}
          >
            {textos.conversas.naoEnviada}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      style={{
        width: '100%',
        alignItems: minha ? 'flex-end' : 'flex-start',
      }}
    >
      <View style={{ maxWidth: '85%' }}>
        {tocavel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rotulo}
            accessibilityHint={textos.conversas.dicaTentarDeNovo}
            onPress={onTentarDeNovo}
            onFocus={aoFocar}
            onBlur={aoDesfocar}
            style={[
              { minHeight: toqueMinimo, justifyContent: 'center' },
              focado && estiloDeFoco,
            ]}
          >
            {conteudo}
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={rotulo}>
            {conteudo}
          </View>
        )}
      </View>
    </View>
  );
}
