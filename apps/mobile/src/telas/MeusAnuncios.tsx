import { Feather } from '@expo/vector-icons';
import { type Ref, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  AbasSublinhadas,
  ALTURA_DA_BARRA_DE_ABAS,
  Aviso,
  Botao,
  BotaoDeIcone,
  BotaoMaisOpcoes,
  CartaoDeAnuncio,
  EstadoVazio,
  FolhaDeAcoesDoAnuncio,
  MARGEM_DA_BARRA_DE_ABAS,
  Motivo,
  Selo,
  Toast,
} from '../componentes';
import { estiloDeFoco, useFoco } from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { EstadoDeTela, Rolavel } from './base';
import type {
  AbaDeDemandas,
  MeuAnuncioParaExibir,
  PropsDosMeusAnuncios,
} from './tipos';

const VAZIO_DA_ABA = {
  aberto: { icone: 'briefcase', titulo: textos.demandas.vazioAbertas },
  em_andamento: { icone: 'clock', titulo: textos.demandas.vazioAndamento },
  encerrado: { icone: 'archive', titulo: textos.demandas.vazioEncerradas },
} as const;

const selo = {
  aberto: { variante: 'aberto', texto: textos.selos.aberto },
  em_andamento: { variante: 'em_andamento', texto: textos.selos.emAndamento },
  encerrado: { variante: 'encerrado', texto: textos.selos.encerrado },
  ativo: { variante: 'aberto', texto: textos.selos.ativo },
} as const;

export function MeusAnuncios({
  tipo,
  lista,
  semConexao,
  onAbrirItem,
  onPublicar,
  onVerCandidatos,
  onEditar,
  onVoltar,
  folha,
  onMaisOpcoes,
  toast,
  onFecharToast,
  carregarMais,
  segmentada = false,
  abaInicial = 'aberto',
}: PropsDosMeusAnuncios) {
  const ehTrampo = tipo === 'trampo';
  // CA79: as abas só existem em Demandas (trampos) e filtram o que já carregou.
  const comAbas = segmentada && ehTrampo;
  const [aba, setAba] = useState<AbaDeDemandas>(abaInicial);
  const todos = lista.situacao === 'ok' ? lista.dados : [];
  const visiveis = comAbas
    ? todos.filter((item) => item.status === aba)
    : todos;
  const quantidade = todos.length;
  const carregandoMais = carregarMais?.carregando ?? false;
  const antes = useRef<number | null>(null);
  const primeiroNovo = useRef<View>(null);
  const [idDoNovo, setIdDoNovo] = useState<string | null>(null);
  const recentes = useRef({ todos, visiveis });
  recentes.current = { todos, visiveis };
  const [anuncio, setAnuncio] = useState<{ texto: string; n: number } | null>(
    null,
  );

  // Ao terminar "Carregar mais": anuncia quantos vieram e leva o foco do
  // leitor de tela ao primeiro item novo (o foco ficaria no botão, que desce).
  useEffect(() => {
    if (carregandoMais) {
      antes.current = quantidade;
      setIdDoNovo(null);
      return;
    }
    const anterior = antes.current;
    antes.current = null;
    if (anterior === null || quantidade <= anterior) return;
    const texto = textos.meusAnuncios.maisCarregados(
      quantidade - anterior,
      tipo,
    );
    // Com abas, o foco vai ao primeiro novo que aparece na aba aberta.
    const novos = recentes.current.todos.slice(anterior);
    const visivel = novos.find((novo) =>
      recentes.current.visiveis.some((item) => item.id === novo.id),
    );
    setIdDoNovo(visivel?.id ?? null);
    setAnuncio((atual) => ({ texto, n: (atual?.n ?? 0) + 1 }));
    if (Platform.OS === 'ios')
      AccessibilityInfo.announceForAccessibility(texto);
  }, [carregandoMais, quantidade, tipo]);
  useEffect(() => {
    if (idDoNovo === null) return;
    const no = findNodeHandle(primeiroNovo.current);
    if (no) AccessibilityInfo.setAccessibilityFocus(no);
  }, [idDoNovo]);
  const vazioDaAba = VAZIO_DA_ABA[aba];
  const vazio = comAbas ? (
    <EstadoVazio
      icone={vazioDaAba.icone}
      titulo={vazioDaAba.titulo}
      textoAcao={aba === 'aberto' ? textos.demandas.publicar : undefined}
      onAcao={aba === 'aberto' ? onPublicar : undefined}
    />
  ) : (
    <EstadoVazio
      icone={ehTrampo ? 'briefcase' : 'tool'}
      titulo={
        ehTrampo
          ? textos.meusAnuncios.vazioTrampos
          : textos.meusAnuncios.vazioServicos
      }
      texto={
        ehTrampo
          ? textos.meusAnuncios.vazioTrampoTexto
          : textos.meusAnuncios.vazioServicoTexto
      }
      textoAcao={
        ehTrampo
          ? textos.meusAnuncios.publicarTrampo
          : textos.meusAnuncios.ofertarServico
      }
      onAcao={onPublicar}
    />
  );
  return (
    <Rolavel
      titulo={
        comAbas
          ? textos.demandas.titulo
          : ehTrampo
            ? textos.meusAnuncios.tituloTrampos
            : textos.meusAnuncios.tituloServicos
      }
      raiz={comAbas && !onVoltar}
      comBarraDeAbas={comAbas && !onVoltar}
      onVoltar={onVoltar}
      direita={
        comAbas ? (
          <BotaoDeIcone
            icone="plus"
            variante="gradiente"
            rotulo={textos.demandas.nova}
            onPress={onPublicar}
          />
        ) : !ehTrampo ? (
          <BotaoDeIcone
            icone="plus"
            variante="gradiente"
            rotulo={textos.meusAnuncios.ofertarServico}
            onPress={onPublicar}
          />
        ) : undefined
      }
      semConexao={semConexao}
      sobreposicao={
        toast ? (
          <Toast
            visivel
            mensagem={toast}
            rotuloFechar={textos.gerais.toastFechar}
            onFechar={() => onFecharToast?.()}
            // Na aba Demandas, o toast sobe acima da barra flutuante.
            deslocamentoInferior={
              comAbas && !onVoltar
                ? ALTURA_DA_BARRA_DE_ABAS + MARGEM_DA_BARRA_DE_ABAS
                : 0
            }
          />
        ) : undefined
      }
    >
      {comAbas ? (
        <AbasSublinhadas
          rotulo={textos.demandas.titulo}
          itens={[
            { chave: 'aberto', rotulo: textos.demandas.abaAbertas },
            { chave: 'em_andamento', rotulo: textos.demandas.abaAndamento },
            { chave: 'encerrado', rotulo: textos.demandas.abaEncerradas },
          ]}
          selecionada={aba}
          onSelecionar={setAba}
        />
      ) : null}
      <EstadoDeTela estado={lista} vazio={vazio}>
        {() =>
          visiveis.length === 0 ? (
            vazio
          ) : (
            <View style={{ gap: espaco.l }}>
              {visiveis.map((item) => (
                <Anuncio
                  key={item.id}
                  refDoFoco={item.id === idDoNovo ? primeiroNovo : undefined}
                  item={item}
                  comoDemanda={comAbas}
                  onAbrir={onAbrirItem}
                  onMaisOpcoes={onMaisOpcoes}
                  onVerCandidatos={onVerCandidatos}
                  onEditar={onEditar}
                />
              ))}
            </View>
          )
        }
      </EstadoDeTela>
      {carregarMais && lista.situacao === 'ok' && quantidade > 0 ? (
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
          {semConexao ? (
            <Motivo texto={textos.meusAnuncios.semConexaoParaCarregarMais} />
          ) : null}
        </View>
      ) : null}
      {anuncio ? (
        <Text
          key={anuncio.n}
          accessibilityLiveRegion="polite"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        >
          {anuncio.texto}
        </Text>
      ) : null}
      {folha ? <FolhaDeAcoesDoAnuncio {...folha} /> : null}
    </Rolavel>
  );
}

function Anuncio({
  item,
  refDoFoco,
  comoDemanda,
  onAbrir,
  onMaisOpcoes,
  onVerCandidatos,
  onEditar,
}: {
  refDoFoco?: Ref<View>;
  item: MeuAnuncioParaExibir;
  /** Aba Demandas: cartão do quadro 14 em vez do cartão de anúncio. */
  comoDemanda: boolean;
  onAbrir: (item: MeuAnuncioParaExibir) => void;
  onMaisOpcoes?: (item: MeuAnuncioParaExibir) => void;
  onVerCandidatos?: (item: MeuAnuncioParaExibir) => void;
  onEditar?: (item: MeuAnuncioParaExibir) => void;
}) {
  const { variante, texto } = selo[item.status];
  if (comoDemanda) {
    return (
      <View ref={refDoFoco} accessible={false}>
        <CartaoDeDemanda
          item={item}
          rotuloDoStatus={texto}
          varianteDoStatus={variante}
          onAbrir={onAbrir}
          onMaisOpcoes={onMaisOpcoes}
          onVerCandidatos={onVerCandidatos}
          onEditar={onEditar}
        />
      </View>
    );
  }
  return (
    <View ref={refDoFoco} accessible={false} style={{ gap: espaco.s }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.s,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: espaco.s,
          }}
        >
          <Selo variante={variante} texto={texto} />
          {item.tipo === 'trampo' && item.interessados !== undefined ? (
            <Selo
              variante="roxo"
              icone="users"
              texto={textos.inicioContratante.interessados(item.interessados)}
            />
          ) : null}
        </View>
        {onMaisOpcoes ? (
          <BotaoMaisOpcoes
            titulo={item.titulo}
            onPress={() => onMaisOpcoes(item)}
          />
        ) : null}
      </View>
      <CartaoDeAnuncio
        tipo={item.tipo}
        titulo={item.titulo}
        categoria={item.categoria}
        cidade={item.cidade}
        valorFormatado={item.valorFormatado}
        dataFormatada={item.dataFormatada}
        onPress={() => onAbrir(item)}
      />
    </View>
  );
}

/**
 * Cartão de demanda (quadro 14; D64): título, status, interessados, "Criada
 * em", prazo e o botão principal. Com interessados, "Ver candidatos ({n})";
 * sem nenhum, "Editar". Fora de Abertas o botão é de apoio (tonal). A área
 * de informações abre o detalhe; "Mais opções" fica ao lado.
 */
function CartaoDeDemanda({
  item,
  rotuloDoStatus,
  varianteDoStatus,
  onAbrir,
  onMaisOpcoes,
  onVerCandidatos,
  onEditar,
}: {
  item: MeuAnuncioParaExibir;
  rotuloDoStatus: string;
  varianteDoStatus: (typeof selo)[keyof typeof selo]['variante'];
  onAbrir: (item: MeuAnuncioParaExibir) => void;
  onMaisOpcoes?: (item: MeuAnuncioParaExibir) => void;
  onVerCandidatos?: (item: MeuAnuncioParaExibir) => void;
  onEditar?: (item: MeuAnuncioParaExibir) => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const interessados = item.interessados ?? 0;
  const prazo = item.prazoFormatado ?? textos.detalheTrampo.semPrazo;
  const criada = textos.demandas.criadaEm(item.dataFormatada);
  const principal = item.status === 'aberto';
  const botao =
    interessados > 0 && onVerCandidatos ? (
      <Botao
        texto={textos.demandas.verCandidatosComN(interessados)}
        rotuloDeAcessibilidade={textos.demandas.verCandidatosDe(item.titulo)}
        variante={principal ? 'primario' : 'tonal'}
        onPress={() => onVerCandidatos(item)}
      />
    ) : interessados === 0 && principal && onEditar ? (
      <Botao
        texto={textos.anuncio.editar}
        rotuloDeAcessibilidade={textos.demandas.editarDe(item.titulo)}
        variante="tonal"
        onPress={() => onEditar(item)}
      />
    ) : null;
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
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: espaco.s,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={[
            item.titulo,
            rotuloDoStatus,
            item.tipo === 'trampo' && item.interessados !== undefined
              ? textos.inicioContratante.interessados(item.interessados)
              : null,
            criada,
            prazo,
          ]
            .filter(Boolean)
            .join(', ')}
          accessibilityHint={textos.demandas.abrirDemanda(item.titulo)}
          onPress={() => onAbrir(item)}
          onFocus={aoFocar}
          onBlur={aoDesfocar}
          style={[
            { flex: 1, gap: espaco.s, minHeight: toqueMinimo },
            focado && estiloDeFoco,
          ]}
        >
          <Text
            numberOfLines={2}
            style={[estiloDeTexto('h3'), { color: cores.texto }]}
          >
            {item.titulo}
          </Text>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s }}
          >
            <Selo variante={varianteDoStatus} texto={rotuloDoStatus} />
            {item.interessados !== undefined ? (
              <Selo
                variante="roxo"
                icone="users"
                texto={textos.inicioContratante.interessados(item.interessados)}
              />
            ) : null}
          </View>
          <Text
            style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
          >
            {criada}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: espaco.xs,
            }}
          >
            <Feather name="calendar" size={14} color={cores.textoSecundario} />
            <Text
              style={[
                estiloDeTexto('legenda'),
                { flexShrink: 1, color: cores.textoSecundario },
              ]}
            >
              {prazo}
            </Text>
          </View>
        </Pressable>
        {onMaisOpcoes ? (
          <BotaoMaisOpcoes
            titulo={item.titulo}
            onPress={() => onMaisOpcoes(item)}
          />
        ) : null}
      </View>
      {botao}
    </View>
  );
}
