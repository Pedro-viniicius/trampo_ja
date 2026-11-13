import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, movimento, raio, sombra } from '../tema/tokens';
import { BotaoDeIcone } from './BotaoDeIcone';
import {
  estiloDeFoco,
  type NomeDeIcone,
  pontosDoGradiente,
  useFoco,
  useReduzirMovimento,
} from './utilitarios';

export type PropsDoCartaoDeDestaque = {
  sobretitulo?: string;
  titulo: string;
  texto?: string;
  /** Botão branco com texto azul 700 (ex.: "Ver meus trampos"). */
  acao?: { texto: string; onPress: () => void; rotulo?: string };
  /** Botão redondo branco (ex.: "+" de Nova demanda), no lugar de `acao`. */
  acaoRedonda?: { icone: NomeDeIcone; rotulo: string; onPress: () => void };
  /** Conteúdo extra abaixo do texto (ex.: o sub-cartão da cidade). */
  children?: ReactNode;
};

/** Formas translúcidas do destaque: puramente decorativas. */
function Formas() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <View
        style={{
          position: 'absolute',
          top: -40,
          right: -30,
          width: 140,
          height: 140,
          borderRadius: 70,
          backgroundColor: cores.branco,
          opacity: 0.12,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -18,
          right: 40,
          width: 120,
          height: 44,
          borderRadius: raio.pill,
          backgroundColor: cores.branco,
          opacity: 0.12,
          transform: [{ rotate: '-18deg' }],
        }}
      />
    </View>
  );
}

function BotaoBranco({
  texto,
  rotulo,
  onPress,
}: {
  texto: string;
  rotulo?: string;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const reduzirMovimento = useReduzirMovimento();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo ?? texto}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: 48,
          alignSelf: 'flex-start',
          justifyContent: 'center',
          paddingHorizontal: espaco.l,
          borderRadius: raio.pill,
          backgroundColor: pressed ? cores.azul[50] : cores.branco,
          transform: [
            {
              scale: pressed && !reduzirMovimento ? movimento.pressaoEscala : 1,
            },
          ],
        },
        focado && { ...estiloDeFoco, outlineColor: cores.branco },
      ]}
    >
      <Text style={[estiloDeTexto('botao'), { color: cores.azul[700] }]}>
        {texto}
      </Text>
    </Pressable>
  );
}

/**
 * Cartão de destaque (Início dos dois modos, Dicas): gradiente de ação, texto
 * branco (passa AA em toda a extensão) e uma ação só.
 */
export function CartaoDeDestaque({
  sobretitulo,
  titulo,
  texto,
  acao,
  acaoRedonda,
  children,
}: PropsDoCartaoDeDestaque) {
  return (
    <View style={[{ borderRadius: raio.card }, sombra.marca]}>
      <LinearGradient
        colors={[...cores.gradienteAcao]}
        {...pontosDoGradiente}
        style={{
          borderRadius: raio.card,
          padding: espaco.l,
          gap: espaco.s,
          overflow: 'hidden',
        }}
      >
        <Formas />
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.m }}
        >
          <View style={{ flex: 1, gap: espaco.s }}>
            {sobretitulo ? (
              <Text
                style={[estiloDeTexto('sobretitulo'), { color: cores.branco }]}
              >
                {sobretitulo}
              </Text>
            ) : null}
            <Text
              accessibilityRole="header"
              style={[estiloDeTexto('h2'), { color: cores.branco }]}
            >
              {titulo}
            </Text>
            {texto ? (
              <Text style={[estiloDeTexto('corpo'), { color: cores.branco }]}>
                {texto}
              </Text>
            ) : null}
          </View>
          {acaoRedonda ? (
            <BotaoDeIcone
              icone={acaoRedonda.icone}
              rotulo={acaoRedonda.rotulo}
              onPress={acaoRedonda.onPress}
              tamanho={56}
            />
          ) : null}
        </View>
        {children}
        {acao ? (
          <View style={{ marginTop: espaco.s }}>
            <BotaoBranco
              texto={acao.texto}
              rotulo={acao.rotulo}
              onPress={acao.onPress}
            />
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}
