import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  Aviso,
  Botao,
  CartaoDeConteudo,
  CartaoDeDestaque,
  EstadoVazio,
  folgaDaBarraDeAbas,
  Toast,
} from '../componentes';
import {
  estiloDeFoco,
  useFoco,
  useMargensSeguras,
} from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra, toqueMinimo } from '../tema/tokens';
import { DICAS } from '../textos/dicas';
import { textos } from '../textos/pt-BR';
import { Carregando, Coluna, ErroDoBloco, Pagina } from './base';
import { rotuloDoTipoDaDica } from './Dicas';
import { CartaoDoItem } from './item';
import type {
  Estado,
  ItemParaExibir,
  PropsDoInicio,
  TipoDeAnuncio,
} from './tipos';

/** Largura do cartão no carrossel de serviços: o próximo aparece cortado em 320 pt. */
const LARGURA_DO_CARTAO = 280;

/**
 * Início do freela (quadro 04): saudação e título de aba, busca, destaque de
 * Meus trampos, trampos recentes em lista, serviços em carrossel e, no fim,
 * Dicas & minicursos. Ganhos, extrato e "raio de 3 km" ficam de fora (spec).
 */
export function Inicio({
  nome,
  perfilIncompleto,
  recentesTrampos,
  recentesServicos,
  onBuscar,
  onVerTodos,
  onAbrirItem,
  onCompletarPerfil,
  onPublicarTrampo,
  onOfertarServico,
  onMinhasCandidaturas,
  candidaturasEmAnalise,
  onDicas,
  toast,
  onFecharToast,
}: PropsDoInicio) {
  const margens = useMargensSeguras();
  const dica = DICAS[0];
  return (
    <Pagina>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          alignItems: 'center',
          paddingTop: margens.top + espaco.s,
          paddingBottom: folgaDaBarraDeAbas(margens.bottom),
        }}
      >
        <Coluna gap={espaco.l}>
          <View style={{ gap: espaco.xs }}>
            <Text
              style={[estiloDeTexto('corpo'), { color: cores.textoSecundario }]}
            >
              {nome?.trim()
                ? textos.inicio.saudacao(nome)
                : textos.inicio.saudacaoSemNome}
            </Text>
            <Text
              accessibilityRole="header"
              style={[estiloDeTexto('h1'), { color: cores.texto }]}
            >
              {textos.inicioFreela.titulo}
            </Text>
          </View>
          <AtalhoDeBusca onPress={onBuscar} />
          {perfilIncompleto ? (
            <Aviso
              variante="alerta"
              texto={textos.perfil.avisoIncompleto(perfilIncompleto.falta)}
              textoAcao={textos.perfil.completar}
              onAcao={onCompletarPerfil}
            />
          ) : null}
          {onMinhasCandidaturas ? (
            <CartaoDeDestaque
              sobretitulo={textos.inicioFreela.destaque}
              titulo={
                candidaturasEmAnalise == null
                  ? textos.inicioFreela.acompanhe
                  : candidaturasEmAnalise > 0
                    ? textos.inicioFreela.emAnalise(candidaturasEmAnalise)
                    : textos.inicioFreela.semCandidaturas
              }
              acao={{
                texto: textos.inicio.minhasCandidaturas,
                onPress: onMinhasCandidaturas,
              }}
            />
          ) : null}
          {onPublicarTrampo || onOfertarServico ? (
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s }}
            >
              {onPublicarTrampo ? (
                <View style={{ flexGrow: 1, flexBasis: 140 }}>
                  <Botao
                    texto={textos.inicio.publicarTrampo}
                    variante="tonal"
                    icone="plus"
                    onPress={onPublicarTrampo}
                  />
                </View>
              ) : null}
              {onOfertarServico ? (
                <View style={{ flexGrow: 1, flexBasis: 140 }}>
                  <Botao
                    texto={textos.inicio.ofertarServico}
                    variante="contorno"
                    icone="tool"
                    onPress={onOfertarServico}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          <Secao
            tipo="trampo"
            titulo={textos.inicio.trampos}
            estado={recentesTrampos}
            onVerTodos={onVerTodos}
            onAbrirItem={onAbrirItem}
          />
          <Secao
            tipo="servico"
            titulo={textos.inicio.servicos}
            estado={recentesServicos}
            onVerTodos={onVerTodos}
            onAbrirItem={onAbrirItem}
            carrossel
          />
          {onDicas && dica ? (
            <View style={{ gap: espaco.m }}>
              <TituloDeSecao texto={textos.perfil.dicas} />
              <CartaoDeConteudo
                titulo={dica.titulo}
                resumo={dica.resumo}
                tipo={rotuloDoTipoDaDica(dica.tipo)}
                duracao={textos.dicas.minutos(dica.minutos)}
                onPress={onDicas}
              />
            </View>
          ) : null}
        </Coluna>
      </ScrollView>
      <Toast
        visivel={Boolean(toast)}
        mensagem={toast ?? ''}
        rotuloFechar={textos.gerais.toastFechar}
        onFechar={() => onFecharToast?.()}
      />
    </Pagina>
  );
}

/** Pílula com cara de campo de busca: abre a tela de busca. */
function AtalhoDeBusca({ onPress }: { onPress: () => void }) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={textos.inicio.buscar}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.m - 4,
          paddingHorizontal: espaco.l - 4,
          borderRadius: raio.pill,
          borderWidth: 1.5,
          borderColor: cores.bordaDeCampo,
          backgroundColor: pressed ? cores.tinta[100] : cores.superficie,
        },
        sombra.sm,
        focado && estiloDeFoco,
      ]}
    >
      <Feather name="search" size={20} color={cores.textoSecundario} />
      <Text
        numberOfLines={1}
        style={[
          estiloDeTexto('corpo'),
          { flex: 1, color: cores.textoSecundario },
        ]}
      >
        {textos.inicio.buscar}
      </Text>
    </Pressable>
  );
}

function TituloDeSecao({ texto }: { texto: string }) {
  return (
    <Text
      accessibilityRole="header"
      style={[estiloDeTexto('h2'), { color: cores.texto }]}
    >
      {texto}
    </Text>
  );
}

function Secao({
  tipo,
  titulo,
  estado,
  onVerTodos,
  onAbrirItem,
  carrossel = false,
}: {
  tipo: TipoDeAnuncio;
  titulo: string;
  estado: Estado<readonly ItemParaExibir[]>;
  onVerTodos: (tipo: TipoDeAnuncio) => void;
  onAbrirItem: (item: ItemParaExibir) => void;
  carrossel?: boolean;
}) {
  return (
    <View style={{ gap: espaco.m - 4 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: espaco.s,
          minHeight: toqueMinimo,
        }}
      >
        <View style={{ flexShrink: 1 }}>
          <TituloDeSecao texto={titulo} />
        </View>
        <Botao
          texto={textos.gerais.verTodos}
          variante="texto"
          larguraCheia={false}
          accessibilityHint={titulo}
          onPress={() => onVerTodos(tipo)}
        />
      </View>
      <ConteudoDaSecao
        estado={estado}
        onAbrirItem={onAbrirItem}
        carrossel={carrossel}
      />
    </View>
  );
}

function ConteudoDaSecao({
  estado,
  onAbrirItem,
  carrossel,
}: {
  estado: Estado<readonly ItemParaExibir[]>;
  onAbrirItem: (item: ItemParaExibir) => void;
  carrossel: boolean;
}) {
  switch (estado.situacao) {
    case 'carregando':
      return <Carregando cartoes={carrossel ? 1 : 3} />;
    case 'erro':
      return (
        <ErroDoBloco
          mensagem={estado.mensagem || textos.inicio.erroSecao}
          onTentarDeNovo={estado.onTentarDeNovo}
        />
      );
    case 'vazio':
      return (
        <EstadoVazio
          icone="inbox"
          titulo={textos.inicio.vazio}
          texto={textos.inicio.vazioTexto}
        />
      );
    case 'ok':
      if (!carrossel) {
        return (
          <View style={{ gap: espaco.m }}>
            {estado.dados.map((item) => (
              <CartaoDoItem
                key={`${item.tipo}-${item.id}`}
                item={item}
                onAbrir={onAbrirItem}
              />
            ))}
          </View>
        );
      }
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // A sombra do cartão não é cortada pela rolagem.
          style={{ marginHorizontal: -espaco.l }}
          contentContainerStyle={{
            gap: espaco.m - 4,
            paddingHorizontal: espaco.l,
            paddingVertical: espaco.xs,
          }}
        >
          {estado.dados.map((item) => (
            <View
              key={`${item.tipo}-${item.id}`}
              style={{ width: LARGURA_DO_CARTAO }}
            >
              <CartaoDoItem item={item} onAbrir={onAbrirItem} />
            </View>
          ))}
        </ScrollView>
      );
  }
}
