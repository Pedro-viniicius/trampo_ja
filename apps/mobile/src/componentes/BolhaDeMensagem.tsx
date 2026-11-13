import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { estiloDeFoco, pontosDoGradiente, useFoco } from './utilitarios';

export type PropsDaBolhaDeMensagem = {
  /** Minha mensagem: à direita, gradiente de ação. */
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

const RAIO = 20;
const RAIO_DA_PONTA = 6;

/** Bolha de mensagem: o texto e a hora ficam dentro; a situação, abaixo. */
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
  // Na minha, tudo em branco pleno: transparência derrubaria o contraste sobre o roxo 600.
  const corDoTexto = minha ? cores.branco : cores.texto;
  const corDaHora = minha ? cores.branco : cores.textoSecundario;

  const forma = {
    maxWidth: '100%' as const,
    borderTopLeftRadius: RAIO,
    borderTopRightRadius: RAIO,
    borderBottomLeftRadius: minha ? RAIO : RAIO_DA_PONTA,
    borderBottomRightRadius: minha ? RAIO_DA_PONTA : RAIO,
  };

  const miolo = (
    <View
      style={{
        paddingHorizontal: espaco.m - 2,
        paddingTop: espaco.s + 2,
        paddingBottom: espaco.s,
        gap: 2,
      }}
    >
      <Text style={[estiloDeTexto('corpo'), { color: corDoTexto }]}>
        {texto}
      </Text>
      {situacao === 'enviada' && horaFormatada ? (
        <Text
          style={[
            estiloDeTexto('legenda'),
            { color: corDaHora, alignSelf: 'flex-end' },
          ]}
        >
          {horaFormatada}
        </Text>
      ) : null}
    </View>
  );

  let bolha: ReactNode;
  if (minha) {
    bolha = (
      <LinearGradient
        colors={[...cores.gradienteAcao]}
        {...pontosDoGradiente}
        style={[
          forma,
          situacao === 'enviando' ? { opacity: 0.6 } : null,
          situacao === 'falhou'
            ? { borderWidth: 2, borderColor: cores.feedback.erro.base }
            : null,
        ]}
      >
        {miolo}
      </LinearGradient>
    );
  } else {
    bolha = (
      <View style={[forma, { backgroundColor: cores.superficie }, sombra.sm]}>
        {miolo}
      </View>
    );
  }

  const conteudo = (
    <View style={{ alignItems: minha ? 'flex-end' : 'flex-start' }}>
      {bolha}
      {situacao === 'enviando' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: espaco.xs,
            marginTop: espaco.xs,
          }}
        >
          <Feather name="clock" size={14} color={cores.textoSecundario} />
          <Text
            style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
          >
            {textos.conversas.rotuloEnviando}
          </Text>
        </View>
      ) : null}
      {situacao === 'falhou' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: espaco.xs,
            marginTop: espaco.xs,
          }}
        >
          <Feather name="alert-circle" size={16} color={cores.erro} />
          <Text
            style={[
              estiloDeTexto('legenda'),
              { flexShrink: 1, color: cores.erro },
            ]}
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
      <View style={{ maxWidth: '80%' }}>
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

/** Separador de dia ("Hoje", "Ontem", data) entre as bolhas. */
export function SeparadorDeDia({ texto }: { texto: string }) {
  return (
    <View
      style={{
        alignSelf: 'center',
        paddingHorizontal: espaco.m - 4,
        paddingVertical: espaco.xs,
        borderRadius: raio.pill,
        backgroundColor: cores.tinta[100],
      }}
    >
      <Text
        accessibilityRole="header"
        style={[estiloDeTexto('legenda'), { color: cores.tinta[700] }]}
      >
        {texto}
      </Text>
    </View>
  );
}
