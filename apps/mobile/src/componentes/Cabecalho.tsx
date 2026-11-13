import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, margemDaTela } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { BotaoDeIcone } from './BotaoDeIcone';
import { useMargensSeguras } from './utilitarios';

export type PropsDoCabecalho = {
  titulo: string;
  /** Linha de apoio abaixo do título (ex.: "Acompanhe candidaturas e trabalhos"). */
  subtitulo?: string;
  /** Sem `onVoltar`, o botão não aparece (telas raiz das abas). */
  onVoltar?: () => void;
  rotuloVoltar?: string;
  /** Ações à direita (de preferência `BotaoDeIcone`, alvo de 48). */
  direita?: ReactNode;
  /** Tela raiz de aba: título grande (`h1`) à esquerda, sem voltar. */
  raiz?: boolean;
};

/**
 * Cabeçalho V2: sem barra branca, direto sobre o fundo da tela. Voltar é um
 * botão redondo branco; o título é `h2` (ou `h1` nas raízes das abas).
 */
export function Cabecalho({
  titulo,
  subtitulo,
  onVoltar,
  rotuloVoltar = textos.gerais.voltar,
  direita,
  raiz = false,
}: PropsDoCabecalho) {
  const margens = useMargensSeguras();
  const comVoltar = Boolean(onVoltar) && !raiz;

  return (
    <View
      style={{
        paddingTop: margens.top + espaco.s,
        paddingBottom: espaco.s,
        paddingHorizontal: margemDaTela,
        backgroundColor: cores.fundo,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 56,
          gap: espaco.m,
        }}
      >
        {comVoltar && onVoltar ? (
          <BotaoDeIcone
            icone="chevron-left"
            rotulo={rotuloVoltar}
            onPress={onVoltar}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[estiloDeTexto(raiz ? 'h1' : 'h2'), { color: cores.texto }]}
          >
            {titulo}
          </Text>
          {subtitulo ? (
            <Text
              style={[
                estiloDeTexto('legenda'),
                { color: cores.textoSecundario },
              ]}
            >
              {subtitulo}
            </Text>
          ) : null}
        </View>
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
    </View>
  );
}
