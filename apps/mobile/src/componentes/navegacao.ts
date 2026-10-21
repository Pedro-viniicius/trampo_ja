import { Ionicons } from '@expo/vector-icons';
import { createElement } from 'react';
import type { ColorValue } from 'react-native';
import { cores, tipografia, toqueMinimo } from '../tema/tokens';
import type { NomeDeIcone } from './utilitarios';

/** Opções visuais para a etapa 11 espalhar em `Tabs`/`Stack` (sem importar o expo-router). */

export type RotaDeAba = 'inicio' | 'buscar' | 'perfil';

const icones: Record<RotaDeAba, { ativo: NomeDeIcone; inativo: NomeDeIcone }> =
  {
    inicio: { ativo: 'home', inativo: 'home-outline' },
    buscar: { ativo: 'search', inativo: 'search-outline' },
    perfil: { ativo: 'person', inativo: 'person-outline' },
  };

/** `screenOptions` do `Tabs`: cores, altura 56 e alvo mínimo de 44 por aba. */
export const opcoesDaBarraDeAbas = {
  headerShown: false,
  tabBarActiveTintColor: cores.primaria,
  tabBarInactiveTintColor: cores.textoSecundario,
  tabBarStyle: {
    height: 56,
    backgroundColor: cores.fundo,
    borderTopColor: cores.borda,
  },
  tabBarItemStyle: { minHeight: toqueMinimo },
  tabBarLabelStyle: {
    fontSize: tipografia.tamanho.legenda,
    fontWeight: tipografia.peso.semibold,
  },
} as const;

type PropsDoIconeDaAba = { color: ColorValue; size: number; focused: boolean };

/** `options` de uma `Tabs.Screen`: título (já traduzido) e ícone cheio quando ativa. */
export function opcoesDaAba(rota: RotaDeAba, titulo: string) {
  return {
    title: titulo,
    tabBarLabel: titulo,
    tabBarAccessibilityLabel: titulo,
    tabBarIcon: ({ color, size, focused }: PropsDoIconeDaAba) =>
      createElement(Ionicons, {
        name: focused ? icones[rota].ativo : icones[rota].inativo,
        size,
        color: typeof color === 'string' ? color : cores.textoSecundario,
      }),
  };
}

/** `screenOptions` do `Stack` com cabeçalho nativo (alternativa ao `Cabecalho`). */
export const opcoesDoCabecalho = {
  headerShown: true,
  headerShadowVisible: false,
  headerStyle: { backgroundColor: cores.fundo },
  headerTintColor: cores.texto,
  headerTitleStyle: {
    fontSize: tipografia.tamanho.tituloDeTela,
    fontWeight: tipografia.peso.negrito,
  },
  contentStyle: { backgroundColor: cores.fundo },
} as const;
