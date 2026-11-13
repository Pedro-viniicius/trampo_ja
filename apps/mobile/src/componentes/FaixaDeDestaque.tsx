import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cores, espaco, margemDaTela, raio } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { BotaoDeIcone } from './BotaoDeIcone';
import { pontosDoGradiente, useMargensSeguras } from './utilitarios';

export type PropsDaFaixaDeDestaque = {
  /** Botão voltar redondo branco à esquerda. */
  onVoltar?: () => void;
  rotuloVoltar?: string;
  /** Ações à direita (`BotaoDeIcone` claro). */
  direita?: ReactNode;
  /** Altura sem a margem segura (padrão 188). */
  altura?: number;
  /** Conteúdo sobre a faixa: só texto branco >= 24 pt (gradiente de marca). */
  children?: ReactNode;
};

/** Forma decorativa: círculo roxo claro cortado na borda, oculto do leitor de tela. */
export function FormaDecorativa({
  lado,
  cor,
  topo,
  direita,
  opacidade = 1,
}: {
  lado: number;
  cor: string;
  topo: number;
  direita: number;
  opacidade?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: topo,
        right: direita,
        width: lado,
        height: lado,
        borderRadius: lado / 2,
        backgroundColor: cor,
        opacity: opacidade,
      }}
    />
  );
}

/**
 * Faixa do topo dos detalhes (quadro 05) e da Entrada: gradiente de marca com
 * um círculo decorativo atrás e botões redondos brancos por cima.
 */
export function FaixaDeDestaque({
  onVoltar,
  rotuloVoltar = textos.gerais.voltar,
  direita,
  altura = 188,
  children,
}: PropsDaFaixaDeDestaque) {
  const margens = useMargensSeguras();
  return (
    <LinearGradient
      colors={[...cores.gradienteMarca]}
      {...pontosDoGradiente}
      style={{
        minHeight: altura + margens.top,
        paddingTop: margens.top + espaco.s,
        paddingHorizontal: margemDaTela,
        paddingBottom: espaco.l,
        borderBottomLeftRadius: raio.folha,
        borderBottomRightRadius: raio.folha,
        overflow: 'hidden',
      }}
    >
      <FormaDecorativa
        lado={220}
        cor={cores.roxo[300]}
        topo={-60}
        direita={-70}
        opacidade={0.6}
      />
      {onVoltar || direita ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 56,
          }}
        >
          {onVoltar ? (
            <BotaoDeIcone
              icone="chevron-left"
              rotulo={rotuloVoltar}
              onPress={onVoltar}
            />
          ) : (
            <View />
          )}
          {direita ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: espaco.s,
              }}
            >
              {direita}
            </View>
          ) : null}
        </View>
      ) : null}
      {children}
    </LinearGradient>
  );
}
