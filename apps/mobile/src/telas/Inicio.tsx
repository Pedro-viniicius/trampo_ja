import { ScrollView, View } from 'react-native';
import { Aviso, Botao, EstadoVazio, Toast } from '../componentes';
import { espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Carregando, ErroDoBloco, Rolavel, Titulo } from './base';
import { CartaoDoItem } from './item';
import type {
  Estado,
  ItemParaExibir,
  PropsDoInicio,
  TipoDeAnuncio,
} from './tipos';

/** Largura do cartão no carrossel: deixa o próximo cartão aparecer em 320 pt. */
const LARGURA_DO_CARTAO = 280;

export function Inicio({
  nome,
  perfilIncompleto,
  recentesTrampos,
  recentesServicos,
  semConexao,
  onBuscar,
  onVerTodos,
  onAbrirItem,
  onCompletarPerfil,
  onPublicarTrampo,
  onOfertarServico,
  onMinhasCandidaturas,
  toast,
  onFecharToast,
}: PropsDoInicio) {
  return (
    <Rolavel
      titulo={
        nome?.trim()
          ? textos.inicio.saudacao(nome)
          : textos.inicio.saudacaoSemNome
      }
      semConexao={semConexao}
      sobreposicao={
        toast ? (
          <Toast
            visivel
            mensagem={toast}
            rotuloFechar={textos.gerais.toastFechar}
            onFechar={() => onFecharToast?.()}
          />
        ) : undefined
      }
    >
      {perfilIncompleto ? (
        <Aviso
          variante="info"
          texto={textos.perfil.avisoIncompleto(perfilIncompleto.falta)}
          textoAcao={textos.perfil.completar}
          onAcao={onCompletarPerfil}
        />
      ) : null}
      <Botao
        texto={textos.inicio.buscar}
        variante="secundario"
        icone="search"
        onPress={onBuscar}
      />
      {onPublicarTrampo || onOfertarServico ? (
        <View style={{ gap: espaco[2] }}>
          {onPublicarTrampo ? (
            <Botao
              texto={textos.inicio.publicarTrampo}
              icone="add-circle-outline"
              onPress={onPublicarTrampo}
            />
          ) : null}
          {onOfertarServico ? (
            <Botao
              texto={textos.inicio.ofertarServico}
              variante="secundario"
              icone="construct-outline"
              onPress={onOfertarServico}
            />
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
      />
      {onMinhasCandidaturas ? (
        <Botao
          texto={textos.inicio.minhasCandidaturas}
          variante="texto"
          icone="document-text-outline"
          onPress={onMinhasCandidaturas}
        />
      ) : null}
    </Rolavel>
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
    <View style={{ gap: espaco[2] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: espaco[2],
        }}
      >
        <View style={{ flexShrink: 1 }}>
          <Titulo texto={titulo} />
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
      return <Carregando cartoes={1} />;
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
          icone="file-tray-outline"
          titulo={textos.inicio.vazio}
          texto={textos.inicio.vazioTexto}
        />
      );
    case 'ok':
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: espaco[3] }}
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
