import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  ALTURA_DA_BARRA_DE_ABAS,
  Aviso,
  Botao,
  CartaoDeConteudo,
  CartaoDeDestaque,
  EstadoVazio,
  folgaDaBarraDeAbas,
  MARGEM_DA_BARRA_DE_ABAS,
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
  ResumoDasCandidaturas,
  TipoDeAnuncio,
} from './tipos';

/**
 * Início do freela (quadro 04; D63): saudação e título de aba, busca, destaque
 * de Meus trampos, trampos recentes em lista e, no fim, Dicas & minicursos.
 * Sem atalhos de publicar e sem serviços (o freela busca trampos). Ganhos,
 * extrato e "raio de 3 km" ficam de fora (spec).
 */
export function Inicio({
  nome,
  perfilIncompleto,
  recentesTrampos,
  onBuscar,
  onVerTodos,
  onAbrirItem,
  onCompletarPerfil,
  onMinhasCandidaturas,
  candidaturas,
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
              titulo={tituloDoDestaque(candidaturas)}
              acao={{
                texto: textos.inicio.minhasCandidaturas,
                onPress: onMinhasCandidaturas,
              }}
            />
          ) : null}
          <Secao
            tipo="trampo"
            titulo={textos.inicio.trampos}
            estado={recentesTrampos}
            onVerTodos={onVerTodos}
            onAbrirItem={onAbrirItem}
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
        // O toast sobe acima da barra flutuante.
        deslocamentoInferior={ALTURA_DA_BARRA_DE_ABAS + MARGEM_DA_BARRA_DE_ABAS}
      />
    </Pagina>
  );
}

/**
 * Título do destaque "Suas candidaturas" (F1): o convite enquanto carrega,
 * "{n} em análise" com pendentes e, sem pendentes, "Você ainda não se
 * candidatou" só para quem não tem nenhuma candidatura.
 */
function tituloDoDestaque(
  candidaturas: ResumoDasCandidaturas | null | undefined,
): string {
  if (candidaturas == null) {
    return textos.inicioFreela.acompanhe;
  }
  if (candidaturas.emAnalise > 0) {
    return textos.inicioFreela.emAnalise(candidaturas.emAnalise);
  }
  return candidaturas.total > 0
    ? textos.meusTrampos.vazioAnalise
    : textos.inicioFreela.semCandidaturas;
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
}: {
  tipo: TipoDeAnuncio;
  titulo: string;
  estado: Estado<readonly ItemParaExibir[]>;
  onVerTodos: (tipo: TipoDeAnuncio) => void;
  onAbrirItem: (item: ItemParaExibir) => void;
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
      <ConteudoDaSecao estado={estado} onAbrirItem={onAbrirItem} />
    </View>
  );
}

function ConteudoDaSecao({
  estado,
  onAbrirItem,
}: {
  estado: Estado<readonly ItemParaExibir[]>;
  onAbrirItem: (item: ItemParaExibir) => void;
}) {
  switch (estado.situacao) {
    case 'carregando':
      return <Carregando cartoes={3} />;
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
}
