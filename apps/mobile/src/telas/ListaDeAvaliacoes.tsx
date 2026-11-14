import { Text, View } from 'react-native';
import {
  Avatar,
  Aviso,
  Botao,
  EstadoVazio,
  Estrelas,
  Selo,
} from '../componentes';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { rotuloDoDestaque } from './Avaliar';
import { Carregando, ErroDoBloco, Rolavel } from './base';
import type { AvaliacaoParaExibir, PropsDaListaDeAvaliacoes } from './tipos';

/**
 * Avaliações recebidas por uma conta (spec, perfil): bloco com a média e o
 * total e um cartão por avaliação (autor, estrelas, destaques e comentário).
 */
export function ListaDeAvaliacoes({
  resumo,
  lista,
  semConexao,
  carregarMais,
  onVoltar,
}: PropsDaListaDeAvaliacoes) {
  const vazio = (
    <EstadoVazio
      icone="star"
      titulo={textos.avaliacoes.semAvaliacoes}
      texto={textos.avaliacoes.semAvaliacoesTexto}
    />
  );
  return (
    <Rolavel
      titulo={textos.avaliacoes.recebidasTitulo}
      onVoltar={onVoltar}
      semConexao={semConexao}
    >
      {resumo && resumo.total > 0 ? (
        <View
          style={[
            {
              padding: espaco.m,
              borderRadius: raio.card,
              backgroundColor: cores.superficie,
            },
            sombra.sm,
          ]}
        >
          <Estrelas media={resumo.media} total={resumo.total} tamanho={24} />
        </View>
      ) : null}
      {lista.situacao === 'carregando' ? <Carregando cartoes={3} /> : null}
      {lista.situacao === 'erro' ? (
        <ErroDoBloco
          mensagem={lista.mensagem}
          onTentarDeNovo={lista.onTentarDeNovo}
        />
      ) : null}
      {lista.situacao === 'vazio' ? vazio : null}
      {lista.situacao === 'ok' ? (
        lista.dados.length === 0 ? (
          vazio
        ) : (
          <View style={{ gap: espaco.m }}>
            {lista.dados.map((a) => (
              <CartaoDeAvaliacao key={a.id} avaliacao={a} />
            ))}
          </View>
        )
      ) : null}
      {carregarMais && lista.situacao === 'ok' && lista.dados.length > 0 ? (
        <View style={{ gap: espaco.s }}>
          {carregarMais.erro ? (
            <Aviso
              variante="erro"
              texto={carregarMais.erro}
              textoAcao={textos.gerais.tentarDeNovo}
              onAcao={carregarMais.onCarregarMais}
            />
          ) : null}
          <Botao
            texto={textos.gerais.carregarMais}
            textoCarregando={textos.gerais.carregando}
            variante="contorno"
            carregando={carregarMais.carregando}
            desabilitado={Boolean(semConexao)}
            onPress={carregarMais.onCarregarMais}
          />
        </View>
      ) : null}
    </Rolavel>
  );
}

function CartaoDeAvaliacao({ avaliacao }: { avaliacao: AvaliacaoParaExibir }) {
  const autor = avaliacao.autor ?? textos.conversas.perfilIndisponivel;
  const rotulosDosDestaques = avaliacao.destaques
    .map((codigo) => rotuloDoDestaque(avaliacao.papelDoAvaliado, codigo))
    .filter((rotulo): rotulo is string => rotulo !== null);
  return (
    <View
      style={[
        {
          gap: espaco.s,
          padding: espaco.m,
          borderRadius: raio.card,
          backgroundColor: cores.superficie,
        },
        sombra.sm,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco[3],
        }}
      >
        <Avatar nome={autor} neutro={avaliacao.autor === null} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={2}
            style={[estiloDeTexto('h3'), { color: cores.texto }]}
          >
            {autor}
          </Text>
          <Text
            style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
          >
            {avaliacao.dataFormatada}
          </Text>
        </View>
      </View>
      <Estrelas media={avaliacao.nota} />
      {rotulosDosDestaques.length > 0 ? (
        <View
          accessibilityLabel={`${textos.avaliacoes.destaquesRotulo}: ${rotulosDosDestaques.join(', ')}`}
          accessible
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s }}
        >
          {rotulosDosDestaques.map((rotulo) => (
            <Selo
              key={rotulo}
              variante="neutro"
              icone="check"
              texto={rotulo}
              decorativo
            />
          ))}
        </View>
      ) : null}
      {avaliacao.comentario ? (
        <Text
          accessibilityLabel={`${textos.avaliacoes.comentarioDe(autor)}: ${avaliacao.comentario}`}
          style={[estiloDeTexto('corpo'), { color: cores.texto }]}
        >
          {avaliacao.comentario}
        </Text>
      ) : null}
    </View>
  );
}
