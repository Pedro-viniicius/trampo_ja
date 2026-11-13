import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { Botao } from '../componentes';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { NaoEncontrado, Paragrafo, Rolavel } from './base';
import { rotuloDoTipoDaDica } from './Dicas';
import type { PropsDaLeituraDeDica } from './tipos';

/**
 * Leitura de uma dica (CA81; tela simples, fora do redesign): título, tipo e
 * tempo, parágrafos curtos e a lista "Para lembrar". Conteúdo local.
 */
export function LeituraDeDica({ dica, onVoltar }: PropsDaLeituraDeDica) {
  if (!dica) {
    return (
      <Rolavel titulo={textos.dicas.titulo} onVoltar={onVoltar}>
        <NaoEncontrado onVoltar={onVoltar} />
      </Rolavel>
    );
  }
  return (
    <Rolavel titulo={dica.titulo} onVoltar={onVoltar}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.s }}
      >
        <Text style={[estiloDeTexto('sobretitulo'), { color: cores.acento }]}>
          {rotuloDoTipoDaDica(dica.tipo)}
        </Text>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.xs }}
        >
          <Feather name="clock" size={14} color={cores.textoSecundario} />
          <Text
            style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
          >
            {textos.dicas.minutos(dica.minutos)}
          </Text>
        </View>
      </View>
      {dica.paragrafos.map((paragrafo, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, sem reordenação.
        <Paragrafo key={i} texto={paragrafo} />
      ))}
      <View
        style={[
          {
            gap: espaco.m - 4,
            padding: espaco.m,
            borderRadius: raio.card,
            backgroundColor: cores.superficie,
          },
          sombra.sm,
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[estiloDeTexto('h3'), { color: cores.texto }]}
        >
          {textos.dicas.paraLembrar}
        </Text>
        {dica.lembrar.map((item, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, sem reordenação.
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: espaco.s,
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ paddingTop: 2 }}
            >
              <Feather
                name="check"
                size={18}
                color={cores.feedback.sucesso.texto}
              />
            </View>
            <Text
              style={[estiloDeTexto('corpo'), { flex: 1, color: cores.texto }]}
            >
              {item}
            </Text>
          </View>
        ))}
      </View>
      <Botao texto={textos.dicas.voltar} variante="tonal" onPress={onVoltar} />
    </Rolavel>
  );
}
