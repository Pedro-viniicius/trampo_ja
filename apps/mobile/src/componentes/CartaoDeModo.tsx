import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { coresDoInterruptor } from './Interruptor';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDoCartaoDeModo = {
  /** Modo em que a pessoa está agora; o cartão oferece o outro. */
  modoAtual: 'freela' | 'contratante';
  onTrocar: () => void;
};

/**
 * Cartão escuro do Perfil que troca de modo. O interruptor aparece desligado
 * (o modo oferecido é o outro) e liga ao tocar; para o leitor de tela é um
 * botão "Trocar para o modo …".
 */
export function CartaoDeModo({ modoAtual, onTrocar }: PropsDoCartaoDeModo) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const [ligado, setLigado] = useState(false);
  const textosDoCartao =
    modoAtual === 'freela'
      ? textos.modo.cartaoFreela
      : textos.modo.cartaoContratante;
  const rotulo =
    modoAtual === 'freela'
      ? textos.modo.trocarParaContratante
      : textos.modo.trocarParaFreela;

  // O modo mudou (a tela trocou): volta ao estado desligado.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só à troca de modo.
  useEffect(() => {
    setLigado(false);
  }, [modoAtual]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityHint={textosDoCartao.descricao}
      onPress={() => {
        setLigado(true);
        onTrocar();
      }}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.m,
          minHeight: 72,
          paddingVertical: espaco.m,
          paddingHorizontal: espaco.l,
          borderRadius: raio.card,
          backgroundColor: pressed ? cores.tinta[950] : cores.tinta[900],
        },
        sombra.md,
        focado && estiloDeFoco,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[estiloDeTexto('h3'), { color: cores.branco }]}>
          {textosDoCartao.titulo}
        </Text>
        <Text style={[estiloDeTexto('legenda'), { color: cores.tinta[200] }]}>
          {textosDoCartao.descricao}
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <Switch value={ligado} {...coresDoInterruptor} />
      </View>
    </Pressable>
  );
}
