import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import {
  Avatar,
  BotaoMaisOpcoes,
  FolhaDeAcoesDoAnuncio,
  Selo,
} from '../componentes';
import type { NomeDeIcone } from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  BlocoDoAutor,
  Cartao,
  DescricaoLonga,
  EstadoDeTela,
  LadrilhoDeDado,
  LadrilhosDeDados,
  NaoEncontrado,
  Rolavel,
  TituloDoCartao,
} from './base';
import type { PropsDoDetalheDoTrampo } from './tipos';

/**
 * Detalhe do trampo (quadro 05): faixa gradiente com voltar (e ⋯ para o autor),
 * card sobreposto com título, categoria, status e os ladrilhos de prazo, valor
 * e local; depois a descrição e o cartão do autor.
 */
export function DetalheDoTrampo({
  estado,
  autor,
  rodape,
  sobreposicao,
  semConexao,
  onMaisOpcoes,
  folha,
  onVoltar,
  onAbrirAutor,
}: PropsDoDetalheDoTrampo) {
  const t = textos.detalheTrampo;
  return (
    <Rolavel
      titulo={t.titulo}
      faixa
      onVoltar={onVoltar}
      semConexao={semConexao}
      rodape={rodape}
      direita={
        folha && onMaisOpcoes ? (
          <BotaoMaisOpcoes
            titulo={folha.titulo}
            variante="claro"
            onPress={onMaisOpcoes}
          />
        ) : undefined
      }
      sobreposicao={sobreposicao}
    >
      <EstadoDeTela
        estado={estado}
        vazio={<NaoEncontrado onVoltar={onVoltar} />}
      >
        {(trampo) => (
          <>
            <Cartao>
              <TopoDoDetalhe
                titulo={trampo.titulo}
                linha={trampo.categoria}
                autor={autor}
                icone="briefcase"
              />
              <Selo
                variante={trampo.status}
                texto={
                  trampo.status === 'aberto'
                    ? t.seloAberto
                    : trampo.status === 'encerrado'
                      ? t.seloEncerrado
                      : t.seloEmAndamento
                }
              />
              <LadrilhosDeDados>
                <LadrilhoDeDado
                  icone="calendar"
                  rotulo={t.prazo}
                  valor={trampo.prazoFormatado ?? t.semPrazo}
                />
                <LadrilhoDeDado
                  icone="dollar-sign"
                  rotulo={t.valor}
                  valor={trampo.valorFormatado}
                />
                <LadrilhoDeDado
                  icone="map-pin"
                  rotulo={t.local}
                  valor={trampo.cidade}
                />
              </LadrilhosDeDados>
            </Cartao>
            <Cartao gap={espaco.s}>
              <TituloDoCartao texto={t.descricao} />
              <DescricaoLonga
                texto={trampo.descricao}
                rotuloMais={t.lerMais}
                rotuloMenos={t.lerMenos}
              />
            </Cartao>
            <BlocoDoAutor
              rotulo={t.publicadoPor}
              autor={autor}
              onAbrir={onAbrirAutor}
            />
          </>
        )}
      </EstadoDeTela>
      {folha ? <FolhaDeAcoesDoAnuncio {...folha} /> : null}
    </Rolavel>
  );
}

/**
 * Topo do card do detalhe: avatar do autor (ou ícone enquanto o autor não
 * chega), título `h2` (o `header` da tela) e uma linha de apoio.
 */
export function TopoDoDetalhe({
  titulo,
  linha,
  autor,
  icone,
}: {
  titulo: string;
  linha: string;
  autor: PropsDoDetalheDoTrampo['autor'];
  icone: NomeDeIcone;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.m }}>
      {autor.situacao === 'ok' ? (
        <Avatar nome={autor.dados.nome} tamanho={64} />
      ) : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 64,
            height: 64,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: raio.campo,
            backgroundColor: cores.azul[50],
          }}
        >
          <Feather name={icone} size={28} color={cores.primaria} />
        </View>
      )}
      <View style={{ flex: 1, gap: espaco.xs }}>
        <Text
          accessibilityRole="header"
          style={[estiloDeTexto('h2'), { color: cores.texto }]}
        >
          {titulo}
        </Text>
        <Text
          style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
        >
          {linha}
        </Text>
      </View>
    </View>
  );
}
