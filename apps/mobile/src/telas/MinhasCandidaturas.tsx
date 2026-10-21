import { Pressable, Text, View } from 'react-native';
import { EstadoVazio, SeloDeCandidatura } from '../componentes';
import { estiloDeFoco, useFoco } from '../componentes/utilitarios';
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { EstadoDeTela, Rolavel } from './base';
import type {
  MinhaCandidaturaParaExibir,
  PropsDasMinhasCandidaturas,
} from './tipos';

export function MinhasCandidaturas({
  lista,
  semConexao,
  onAbrirTrampo,
  onBuscarTrampos,
  onVoltar,
}: PropsDasMinhasCandidaturas) {
  const vazio = (
    <EstadoVazio
      icone="document-text-outline"
      titulo={textos.minhasCandidaturas.vazio}
      texto={textos.minhasCandidaturas.vazioTexto}
      textoAcao={textos.minhasCandidaturas.buscarTrampos}
      onAcao={onBuscarTrampos}
    />
  );
  return (
    <Rolavel
      titulo={textos.minhasCandidaturas.titulo}
      onVoltar={onVoltar}
      semConexao={semConexao}
    >
      <EstadoDeTela estado={lista} vazio={vazio}>
        {(itens) =>
          itens.length === 0 ? (
            vazio
          ) : (
            <View style={{ gap: espaco[3] }}>
              {itens.map((item) => (
                <Linha key={item.id} item={item} onAbrir={onAbrirTrampo} />
              ))}
            </View>
          )
        }
      </EstadoDeTela>
    </Rolavel>
  );
}

function Linha({
  item,
  onAbrir,
}: {
  item: MinhaCandidaturaParaExibir;
  onAbrir: (trampoId: string) => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const titulo =
    item.tituloDoTrampo ?? textos.minhasCandidaturas.trampoIndisponivel;
  const rotulo = [
    titulo,
    textos.gerais.status(textos.selos[item.status].toLowerCase()),
    `${textos.minhasCandidaturas.valorProposto}: ${item.valorPropostoFormatado}`,
    textos.minhasCandidaturas.enviadaEm(item.dataFormatada),
  ].join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      onPress={() => onAbrir(item.trampoId)}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: toqueMinimo,
          gap: espaco[2],
          padding: espaco[4],
          borderRadius: raio.md,
          borderWidth: 1,
          borderColor: cores.borda,
          backgroundColor: pressed ? cores.superficie : cores.fundo,
        },
        focado && estiloDeFoco,
      ]}
    >
      <Text
        numberOfLines={2}
        style={{
          color: cores.texto,
          fontSize: tipografia.tamanho.tituloDeSeção,
          lineHeight: tipografia.lineHeight.tituloDeSeção,
          fontWeight: tipografia.peso.semibold,
        }}
      >
        {titulo}
      </Text>
      <SeloDeCandidatura status={item.status} />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          columnGap: espaco[2],
        }}
      >
        <Text
          style={{
            flexShrink: 1,
            color: cores.texto,
            fontSize: tipografia.tamanho.corpo,
            lineHeight: tipografia.lineHeight.corpo,
            fontWeight: tipografia.peso.negrito,
          }}
        >
          {item.valorPropostoFormatado}
        </Text>
        <Text
          style={{
            color: cores.textoSecundario,
            fontSize: tipografia.tamanho.legenda,
            lineHeight: tipografia.lineHeight.legenda,
          }}
        >
          {textos.minhasCandidaturas.enviadaEm(item.dataFormatada)}
        </Text>
      </View>
    </Pressable>
  );
}
