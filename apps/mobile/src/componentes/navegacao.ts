import { Feather } from '@expo/vector-icons';
import { createElement } from 'react';
import { type ColorValue, Text } from 'react-native';
import { texto as estiloDeTexto, fonteETamanho } from '../tema/texto';
import { cores, espaco, raio, sombra, toqueMinimo } from '../tema/tokens';
import type { NomeDeIcone } from './utilitarios';

/** Opções visuais para as rotas espalharem em `Tabs`/`Stack` (sem importar o expo-router). */

/**
 * Abas dos dois modos (spec, "Navegação em dois modos"):
 * - freela: `inicio`, `meus-trampos`, `conversas`, `perfil`;
 * - contratante: `inicio`, `demandas`, `buscar`, `mensagens`, `perfil`.
 * `mensagens` é a aba `conversas` com o rótulo do contratante (mesmo ícone).
 */
export type RotaDeAba =
  | 'inicio'
  | 'meus-trampos'
  | 'demandas'
  | 'buscar'
  | 'conversas'
  | 'mensagens'
  | 'perfil';

/** Feather não tem ícone cheio: o ativo é marcado pela pílula azul e pelo rótulo em negrito. */
const icones: Record<RotaDeAba, NomeDeIcone> = {
  inicio: 'home',
  'meus-trampos': 'briefcase',
  demandas: 'check-square',
  buscar: 'search',
  conversas: 'message-circle',
  mensagens: 'message-circle',
  perfil: 'user',
};

/** Altura da barra flutuante. */
export const ALTURA_DA_BARRA_DE_ABAS = 72;
/** Afastamento da barra até a borda (lados e base, além da margem segura). */
export const MARGEM_DA_BARRA_DE_ABAS = espaco.s;

/**
 * Folga que o conteúdo de uma aba deixa embaixo para nada ficar atrás da
 * barra flutuante: altura + margem + margem segura + 16.
 */
export function folgaDaBarraDeAbas(margemInferior: number): number {
  return (
    ALTURA_DA_BARRA_DE_ABAS +
    MARGEM_DA_BARRA_DE_ABAS +
    margemInferior +
    espaco.m
  );
}

/**
 * `screenOptions` do `Tabs` com a barra flutuante (quadro 01): cartão branco
 * raio 32, sombra grande, 8 de afastamento (mais a margem segura de baixo),
 * altura 72. O item ativo ganha a pílula azul 50; ícone e rótulo em azul 600.
 */
export function opcoesDaBarraDeAbasCom(margens: { bottom: number }) {
  return {
    headerShown: false,
    tabBarActiveTintColor: cores.primaria,
    tabBarInactiveTintColor: cores.textoSecundario,
    tabBarActiveBackgroundColor: cores.azul[50],
    tabBarStyle: {
      position: 'absolute',
      left: MARGEM_DA_BARRA_DE_ABAS,
      right: MARGEM_DA_BARRA_DE_ABAS,
      bottom: MARGEM_DA_BARRA_DE_ABAS + margens.bottom,
      height: ALTURA_DA_BARRA_DE_ABAS,
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: espaco.s,
      borderRadius: raio.folha,
      borderTopWidth: 0,
      borderTopColor: 'transparent',
      backgroundColor: cores.branco,
      ...sombra.lg,
    },
    // A pílula: o item recorta o fundo ativo com raio 24.
    // Largura pelo rótulo (F4, decisão 74): cada aba parte da largura natural
    // do seu conteúdo e a sobra da barra é dividida igualmente (abas curtas,
    // como "Início" e "Perfil", cedem espaço às longas). Assim "Meus trampos"
    // e "Mensagens" cabem inteiros em 360 com fonte 1,0 e em 411 com fonte
    // 1,3; reticências só quando nem assim cabe.
    //
    // Por que `flex: 0`: o bottom-tabs monta o item com
    // `[{ flex: 1 }, tabBarItemStyle]`. No Yoga (`Node::processFlexBasis`,
    // `Node.cpp` do RN 0.86.3), `flexBasis: 'auto'` conta como base não
    // definida, e aí `flex > 0` impõe base 0: todas as abas ficavam iguais.
    // Com `flex: 0`, a base fica auto; `flexGrow`/`flexShrink` explícitos
    // valem por cima do `flex` (`resolveFlexGrow`/`resolveFlexShrink`).
    //
    // Efeito colateral: o item repassa o `flex` (0) ao botão interno, que
    // deixa de esticar na vertical e fica com a altura do conteúdo (ícone +
    // rótulo + 10: 52 com fonte 1,0). Por isso o item não estica na barra
    // (`alignSelf: 'center'`): tem a altura do botão, a pílula ocupa o item
    // inteiro, fica centralizada nos 72 e nunca tem menos de 48.
    tabBarItemStyle: {
      flex: 0,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      alignSelf: 'center',
      minWidth: toqueMinimo,
      minHeight: toqueMinimo,
      marginVertical: espaco.s,
      marginHorizontal: 2,
      borderRadius: raio.card,
      overflow: 'hidden',
    },
    tabBarLabelStyle: {
      ...estiloDeTexto('sobretitulo', 'semibold'),
      textTransform: 'none',
      letterSpacing: 0,
    },
  } as const;
}

/** Barra sem margem segura (a rota pode trocar por `opcoesDaBarraDeAbasCom(margens)`). */
export const opcoesDaBarraDeAbas = opcoesDaBarraDeAbasCom({ bottom: 0 });

type PropsDoIconeDaAba = { color: ColorValue; size: number; focused: boolean };
type PropsDoRotuloDaAba = { color: ColorValue; focused: boolean };

const corOuPadrao = (cor: ColorValue): string =>
  typeof cor === 'string' ? cor : cores.textoSecundario;

/**
 * `options` de uma `Tabs.Screen`: título já traduzido, nome falado e ícone
 * Feather 24. O rótulo fica em uma linha; a aba ganha a largura do rótulo
 * (`tabBarItemStyle`, F4), então só corta com reticências quando nem assim
 * cabe (o nome falado continua inteiro). Fica em negrito na aba ativa e
 * respeita a fonte do sistema.
 */
export function opcoesDaAba(rota: RotaDeAba, titulo: string) {
  return {
    title: titulo,
    tabBarAccessibilityLabel: titulo,
    tabBarLabel: ({ color, focused }: PropsDoRotuloDaAba) =>
      createElement(
        Text,
        {
          // Último recurso (R2): dentro dos CAs a aba tem a largura natural do
          // rótulo e não corta; com fonte maior que isso, reticências em vez
          // de uma segunda linha cortada pela barra de altura fixa.
          numberOfLines: 1,
          ellipsizeMode: 'tail',
          style: [
            estiloDeTexto('sobretitulo', focused ? 'negrito' : 'semibold'),
            {
              color: corOuPadrao(color),
              textTransform: 'none',
              letterSpacing: 0,
              marginTop: 2,
              textAlign: 'center',
            },
          ],
        },
        titulo,
      ),
    tabBarIcon: ({ color }: PropsDoIconeDaAba) =>
      createElement(Feather, {
        name: icones[rota],
        size: 24,
        color: corOuPadrao(color),
      }),
  };
}

/** `screenOptions` do `Stack` com cabeçalho nativo (alternativa ao `Cabecalho`). */
export const opcoesDoCabecalho = {
  headerShown: true,
  headerShadowVisible: false,
  headerStyle: { backgroundColor: cores.fundo },
  headerTintColor: cores.texto,
  headerTitleStyle: fonteETamanho('h2'),
  contentStyle: { backgroundColor: cores.fundo },
} as const;
