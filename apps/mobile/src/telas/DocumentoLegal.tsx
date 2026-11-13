import { Text, View } from 'react-native';
import { Aviso, Botao } from '../componentes';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Paragrafo, Rolavel, Titulo } from './base';
import type { PropsDoDocumentoLegal } from './tipos';

// Pendência da L4: índice "Nesta página" (textos.documentoLegal.nestaPagina).
/** AAAA-MM-DD vira DD/MM/AAAA; outro formato é mostrado como veio. */
function formatarData(data: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : data;
}

export function DocumentoLegal({ documento, onVoltar }: PropsDoDocumentoLegal) {
  const t = textos.documentoLegal;
  return (
    <Rolavel titulo={documento.titulo} onVoltar={onVoltar}>
      <Text
        style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
      >
        {t.versao(formatarData(documento.versao))}
      </Text>
      {documento.rascunho ? <Aviso variante="info" texto={t.rascunho} /> : null}
      {documento.secoes.map((secao, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: lista estática, sem reordenação
          key={`${i}-${secao.titulo}`}
          style={{ gap: espaco.m - 4, marginTop: espaco.s }}
        >
          <Titulo texto={secao.titulo} />
          {secao.paragrafos.map((paragrafo, i) => (
            <Paragrafo
              // biome-ignore lint/suspicious/noArrayIndexKey: lista estática, sem reordenação
              key={`${i}-${paragrafo.slice(0, 20)}`}
              texto={paragrafo}
              selecionavel
            />
          ))}
        </View>
      ))}
      <Botao texto={t.voltar} variante="contorno" onPress={onVoltar} />
    </Rolavel>
  );
}
