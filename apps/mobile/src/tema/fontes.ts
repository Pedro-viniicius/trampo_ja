// Fontes da marca (ADR-009 / D52): Bricolage Grotesque só em título e Figtree
// no resto. Entram só os pesos da spec, cada um pelo subcaminho do pacote, para
// o bundle não levar os 14 pesos de cada família. A chave é o nome de família
// que os tokens usam em `fontFamily` (no Android, `fontWeight` não escolhe
// arquivo, então cada peso é uma família). Este é o único lugar do app que
// conhece esses arquivos; `fontFamily` só aparece em `src/tema/`.
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';

export const FONTES = {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
};

export type NomeDeFonte = keyof typeof FONTES;
