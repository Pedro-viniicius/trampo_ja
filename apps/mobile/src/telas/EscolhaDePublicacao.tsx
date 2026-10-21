import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { Cabecalho } from '../componentes';
import {
  estiloDeFoco,
  type NomeDeIcone,
  useFoco,
} from '../componentes/utilitarios';
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Coluna, Pagina, Titulo } from './base';
import type { PropsDaEscolhaDePublicacao } from './tipos';

export function EscolhaDePublicacao({
  onPublicarTrampo,
  onOfertarServico,
}: PropsDaEscolhaDePublicacao) {
  const t = textos.escolhaDePublicacao;
  return (
    <Pagina>
      <Cabecalho titulo={t.titulo} />
      <View style={{ alignItems: 'center' }}>
        <Coluna>
          <Titulo texto={t.pergunta} />
          <OpcaoGrande
            icone="hammer-outline"
            titulo={t.trampo}
            ajuda={t.trampoAjuda}
            onPress={onPublicarTrampo}
          />
          <OpcaoGrande
            icone="briefcase-outline"
            titulo={t.servico}
            ajuda={t.servicoAjuda}
            onPress={onOfertarServico}
          />
        </Coluna>
      </View>
    </Pagina>
  );
}

function OpcaoGrande({
  icone,
  titulo,
  ajuda,
  onPress,
}: {
  icone: NomeDeIcone;
  titulo: string;
  ajuda: string;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${ajuda}`}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: toqueMinimo * 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco[3],
          padding: espaco[4],
          borderRadius: raio.md,
          borderWidth: 1,
          borderColor: cores.borda,
          backgroundColor: pressed ? cores.superficie : cores.fundo,
        },
        focado && estiloDeFoco,
      ]}
    >
      <Ionicons
        name={icone}
        size={32}
        color={cores.primaria}
        accessibilityElementsHidden
      />
      <View style={{ flex: 1, gap: espaco[1] }}>
        <Text
          style={{
            color: cores.texto,
            fontSize: tipografia.tamanho.tituloDeSeção,
            lineHeight: tipografia.lineHeight.tituloDeSeção,
            fontWeight: tipografia.peso.semibold,
          }}
        >
          {titulo}
        </Text>
        <Text
          style={{
            color: cores.textoSecundario,
            fontSize: tipografia.tamanho.corpo,
            lineHeight: tipografia.lineHeight.corpo,
          }}
        >
          {ajuda}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={cores.textoSecundario}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}
