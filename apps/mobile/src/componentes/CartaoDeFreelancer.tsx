import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Avatar } from './Avatar';
import { Botao } from './Botao';
import { Estrelas } from './Estrelas';
import { Selo } from './Selo';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDoCartaoDeFreelancer = {
  /** Nome do autor do serviço; `null` = perfil indisponível. */
  nome: string | null;
  tituloDoServico: string;
  categoria: string;
  cidade: string | null;
  /** Ex.: "R$ 80,00" (vira "A partir de R$ 80,00"). */
  precoFormatado: string;
  /** Só com avaliações (V2b). */
  nota?: { media: number; total: number } | null;
  onPress: () => void;
};

/**
 * Cartão da Busca do contratante (quadro 16): o serviço e quem o oferta. O
 * cartão inteiro abre o serviço; "Ver serviço" faz o mesmo, para quem procura
 * um botão.
 */
export function CartaoDeFreelancer({
  nome,
  tituloDoServico,
  categoria,
  cidade,
  precoFormatado,
  nota,
  onPress,
}: PropsDoCartaoDeFreelancer) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const exibido = nome ?? textos.conversas.perfilIndisponivel;
  const preco = textos.buscarFreelancers.aPartirDe(precoFormatado);
  const rotulo = [exibido, tituloDoServico, categoria, cidade, preco]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={[
        {
          gap: espaco.m - 4,
          padding: espaco.m,
          borderRadius: raio.card,
          backgroundColor: cores.superficie,
        },
        sombra.sm,
        focado && estiloDeFoco,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={rotulo}
        onPress={onPress}
        onFocus={aoFocar}
        onBlur={aoDesfocar}
        style={{ flexDirection: 'row', gap: espaco.m - 4 }}
      >
        <Avatar nome={exibido} neutro={nome === null} tamanho={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={2}
            style={[estiloDeTexto('h3'), { color: cores.texto }]}
          >
            {exibido}
          </Text>
          <Text
            numberOfLines={2}
            style={[estiloDeTexto('corpo'), { color: cores.textoSecundario }]}
          >
            {tituloDoServico}
          </Text>
        </View>
      </Pressable>
      {nota && nota.total > 0 ? (
        <Estrelas media={nota.media} total={nota.total} />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s }}>
        <Selo variante="neutro" texto={categoria} decorativo />
        {cidade ? (
          <Selo variante="neutro" icone="map-pin" texto={cidade} decorativo />
        ) : null}
        <Selo variante="informacao" icone="tag" texto={preco} decorativo />
      </View>
      <Botao
        texto={textos.buscarFreelancers.verServico}
        rotuloDeAcessibilidade={textos.buscarFreelancers.verServicoDe(exibido)}
        variante="tonal"
        larguraCheia={false}
        estilo={{ alignSelf: 'flex-end' }}
        onPress={onPress}
      />
    </View>
  );
}
