import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  Avatar,
  Aviso,
  BolhaDeMensagem,
  BotaoDeIcone,
  Cabecalho,
  CampoDeMensagem,
  Esqueleto,
  EstadoVazio,
  SeloDeCandidatura,
  SeparadorDeDia,
} from '../componentes';
import {
  contarPontosDeCodigo,
  cortarEmPontosDeCodigo,
  estiloDeFoco,
  useFoco,
  useMargensSeguras,
} from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import {
  cores,
  espaco,
  larguraMaxima,
  margemDaTela,
  raio,
  sombra,
  toqueMinimo,
} from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { ErroDoBloco, Pagina, RodapeFixo } from './base';
import type {
  FaixaDaConversa,
  MensagemParaExibir,
  PropsDaConversa,
} from './tipos';

const LIMITE_PADRAO = 2000;
/** Distância do fim (em pontos) que ainda conta como "perto do fim". */
const MARGEM_DO_FIM = 120;

export function Conversa({
  titulo,
  nomeDoOutro,
  limite = LIMITE_PADRAO,
  mensagens,
  indisponivel,
  rascunho,
  podeEnviar,
  semConexao,
  atualizacaoFalhando,
  avisoDoEnvio,
  contexto,
  comRespostasRapidas = false,
  faixa,
  onMudarRascunho,
  onEnviar,
  onTentarDeNovo,
  onVoltar,
}: PropsDaConversa) {
  const lista = useRef<FlatList<MensagemParaExibir>>(null);
  const pertoDoFim = useRef(true);
  const ultimaChave = useRef<string | null>(null);
  const ultimaMinha = useRef<string | null>(null);
  // O contador `n` remonta o <Text> (via `key`) a cada mensagem nova: sem isso,
  // duas mensagens seguidas do mesmo remetente dariam o mesmo texto e o leitor
  // de tela só anunciaria a primeira (D1c).
  const [anuncio, setAnuncio] = useState<{ texto: string; n: number } | null>(
    null,
  );
  const [cortou, setCortou] = useState(false);
  // Conta e corta em pontos de código, como a API (um emoji conta 1).
  const mudarRascunho = (texto: string) => {
    const passou = contarPontosDeCodigo(texto) > limite;
    setCortou(passou);
    onMudarRascunho(passou ? cortarEmPontosDeCodigo(texto, limite) : texto);
  };
  const nomeDasBolhas = nomeDoOutro === undefined ? titulo : nomeDoOutro;
  const dados = mensagens.situacao === 'ok' ? mensagens.dados : null;

  useEffect(() => {
    const ultima = dados && dados.length > 0 ? dados[dados.length - 1] : null;
    if (!ultima) return;
    if (ultima.minha) {
      // Mensagem minha (nova ou confirmada): rola ao fim, de qualquer distância.
      const assinatura = `${ultima.chave}:${ultima.situacao}`;
      if (ultimaMinha.current !== assinatura) {
        pertoDoFim.current = true;
        lista.current?.scrollToEnd({ animated: false });
      }
      ultimaMinha.current = assinatura;
    } else if (
      ultimaChave.current !== null &&
      ultimaChave.current !== ultima.chave
    ) {
      const texto = textos.conversas.novaMensagemDe(nomeDasBolhas);
      setAnuncio((atual) => ({ texto, n: (atual?.n ?? 0) + 1 }));
      // `accessibilityLiveRegion` só existe no Android; no iOS o VoiceOver
      // precisa do anúncio explícito (R8).
      if (Platform.OS === 'ios') {
        AccessibilityInfo.announceForAccessibility(texto);
      }
    }
    ultimaChave.current = ultima.chave;
  }, [dados, nomeDasBolhas]);

  if (indisponivel) {
    return (
      <Pagina>
        <Cabecalho titulo={textos.conversas.titulo} onVoltar={onVoltar} />
        <EstadoVazio
          icone="message-circle"
          titulo={textos.conversas.indisponivelTitulo}
          texto={textos.conversas.indisponivelTexto}
          textoAcao={textos.gerais.voltar}
          onAcao={onVoltar}
        />
      </Pagina>
    );
  }

  const aoRolar = (evento: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } =
      evento.nativeEvent;
    pertoDoFim.current =
      contentSize.height - (contentOffset.y + layoutMeasurement.height) <=
      MARGEM_DO_FIM;
  };

  return (
    <Pagina>
      <CabecalhoDaConversa
        titulo={titulo}
        neutro={nomeDoOutro === null}
        // Com a faixa de contexto, o cabeçalho não repete o "Sobre:".
        contexto={faixa ? null : contexto}
        onVoltar={onVoltar}
      />
      {faixa ? <FaixaDeContexto {...faixa} /> : null}
      <View
        accessibilityLiveRegion="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
        }}
      >
        {anuncio ? <Text key={anuncio.n}>{anuncio.texto}</Text> : null}
      </View>
      {atualizacaoFalhando ? (
        <View
          style={{ paddingHorizontal: margemDaTela, paddingBottom: espaco.s }}
        >
          <Aviso variante="info" texto={textos.conversas.atualizacaoFalhando} />
        </View>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={{ flex: 1 }}>
          {mensagens.situacao === 'carregando' ? <BolhasCarregando /> : null}
          {mensagens.situacao === 'erro' ? (
            <View style={{ padding: margemDaTela }}>
              <ErroDoBloco
                mensagem={mensagens.mensagem}
                onTentarDeNovo={mensagens.onTentarDeNovo}
              />
            </View>
          ) : null}
          {mensagens.situacao === 'vazio' ||
          (mensagens.situacao === 'ok' && mensagens.dados.length === 0) ? (
            <View style={{ padding: margemDaTela, alignItems: 'center' }}>
              <Text
                style={[
                  estiloDeTexto('corpo'),
                  { color: cores.textoSecundario, textAlign: 'center' },
                ]}
              >
                {textos.conversas.semMensagens}
              </Text>
            </View>
          ) : null}
          {mensagens.situacao === 'ok' && mensagens.dados.length > 0 ? (
            <FlatList
              ref={lista}
              data={mensagens.dados}
              keyExtractor={(item) => item.chave}
              keyboardShouldPersistTaps="handled"
              onScroll={aoRolar}
              scrollEventThrottle={16}
              onLayout={() => {
                if (pertoDoFim.current) {
                  lista.current?.scrollToEnd({ animated: false });
                }
              }}
              onContentSizeChange={() => {
                if (pertoDoFim.current) {
                  lista.current?.scrollToEnd({ animated: false });
                }
              }}
              contentContainerStyle={{
                alignSelf: 'center',
                width: '100%',
                maxWidth: larguraMaxima,
                paddingHorizontal: margemDaTela,
                paddingVertical: espaco.m,
                gap: espaco.m - 4,
              }}
              renderItem={({ item, index }) => {
                const bolha = (
                  <BolhaDeMensagem
                    minha={item.minha}
                    texto={item.texto}
                    horaFormatada={item.horaFormatada}
                    situacao={item.situacao}
                    nome={nomeDasBolhas}
                    onTentarDeNovo={() => onTentarDeNovo(item.chave)}
                  />
                );
                const dia = item.diaFormatado;
                // Separador antes da primeira mensagem e a cada troca de dia.
                if (!dia || mensagens.dados[index - 1]?.diaFormatado === dia) {
                  return bolha;
                }
                return (
                  <View style={{ gap: espaco.m - 4 }}>
                    <SeparadorDeDia texto={dia} />
                    {bolha}
                  </View>
                );
              }}
            />
          ) : null}
        </View>
        <RodapeFixo>
          {avisoDoEnvio ? <Aviso variante="erro" texto={avisoDoEnvio} /> : null}
          {semConexao ? (
            <Text
              style={[
                estiloDeTexto('legenda'),
                { color: cores.textoSecundario },
              ]}
            >
              {textos.conversas.semConexaoNoCampo}
            </Text>
          ) : null}
          <ContadorDaMensagem
            valor={rascunho}
            limite={limite}
            cortou={cortou}
          />
          <CampoDeMensagem
            valor={rascunho}
            onChangeText={mudarRascunho}
            onEnviar={onEnviar}
            podeEnviar={podeEnviar}
            motivoDoEnvio={
              semConexao ? textos.conversas.semConexaoNoCampo : undefined
            }
            respostasRapidas={
              comRespostasRapidas
                ? textos.conversas.respostasRapidas
                : undefined
            }
          />
        </RodapeFixo>
      </KeyboardAvoidingView>
    </Pagina>
  );
}

type FaixaDoContador = 'nenhuma' | 'perto' | 'faltam' | 'limite' | 'cortou';

/**
 * Contador do campo da mensagem, com as mesmas faixas do `CampoDeTexto`:
 * aparece a partir de 80%, e o leitor de tela ouve um anúncio por mudança de
 * faixa (90%, limite, corte), nunca por tecla.
 */
function ContadorDaMensagem({
  valor,
  limite,
  cortou,
}: {
  valor: string;
  limite: number;
  cortou: boolean;
}) {
  const total = contarPontosDeCodigo(valor);
  // O corte só vale enquanto o texto segue no limite (o envio limpa o campo).
  const faixa: FaixaDoContador =
    cortou && total >= limite
      ? 'cortou'
      : total >= limite
        ? 'limite'
        : total >= limite * 0.9
          ? 'faltam'
          : total >= limite * 0.8
            ? 'perto'
            : 'nenhuma';
  const g = textos.gerais;
  const anunciado =
    faixa === 'cortou'
      ? g.contadorCortado(limite)
      : faixa === 'limite'
        ? g.contadorLimite(limite)
        : faixa === 'faltam'
          ? g.contadorFaltam(limite - total)
          : null;
  const [anuncio, setAnuncio] = useState<{ texto: string; n: number } | null>(
    null,
  );
  const ultimaFaixa = useRef<FaixaDoContador>(faixa);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só à mudança de faixa e ao corte; o texto é lido no momento.
  useEffect(() => {
    const anterior = ultimaFaixa.current;
    ultimaFaixa.current = faixa;
    if (faixa === anterior && faixa !== 'cortou') return;
    if (!anunciado) {
      setAnuncio(null);
      return;
    }
    setAnuncio((atual) => ({ texto: anunciado, n: (atual?.n ?? 0) + 1 }));
    if (Platform.OS === 'ios')
      AccessibilityInfo.announceForAccessibility(anunciado);
  }, [faixa, valor]);

  if (faixa === 'nenhuma') return null;
  const texto =
    faixa === 'cortou' || faixa === 'limite'
      ? (anunciado as string)
      : faixa === 'faltam'
        ? `${g.contador(total, limite)}. ${g.contadorFaltam(limite - total)}`
        : g.contador(total, limite);
  return (
    <>
      <Text
        style={[
          estiloDeTexto(
            'legenda',
            faixa === 'limite' || faixa === 'cortou'
              ? 'negrito'
              : faixa === 'faltam'
                ? 'semibold'
                : 'medio',
          ),
          { color: faixa === 'perto' ? cores.textoSecundario : cores.texto },
        ]}
      >
        {texto}
      </Text>
      {anuncio ? (
        <Text
          key={anuncio.n}
          accessibilityLiveRegion="polite"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        >
          {anuncio.texto}
        </Text>
      ) : null}
    </>
  );
}

/**
 * Cabeçalho do chat (quadro 09): voltar redondo, avatar 40, nome em `h3` e o
 * contexto da conversa em legenda.
 */
function CabecalhoDaConversa({
  titulo,
  neutro,
  contexto,
  onVoltar,
}: {
  titulo: string;
  neutro: boolean;
  contexto?: string | null;
  onVoltar: () => void;
}) {
  const margens = useMargensSeguras();
  return (
    <View
      style={{
        paddingTop: margens.top + espaco.s,
        paddingBottom: espaco.s,
        paddingHorizontal: margemDaTela,
        backgroundColor: cores.fundo,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 56,
          gap: espaco.m - 4,
        }}
      >
        <BotaoDeIcone
          icone="chevron-left"
          rotulo={textos.gerais.voltar}
          onPress={onVoltar}
        />
        <Avatar nome={titulo} tamanho={40} neutro={neutro} />
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[estiloDeTexto('h3'), { color: cores.texto }]}
          >
            {titulo}
          </Text>
          {contexto ? (
            <Text
              numberOfLines={1}
              style={[
                estiloDeTexto('legenda'),
                { color: cores.textoSecundario },
              ]}
            >
              {textos.conversas.contexto(contexto)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * Faixa de contexto (quadro 09): card compacto com o título do trampo, o selo
 * da candidatura e o valor; o toque abre o trampo.
 */
function FaixaDeContexto({
  titulo,
  statusDaCandidatura,
  valorFormatado,
  onAbrir,
}: FaixaDaConversa) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <View style={{ paddingHorizontal: margemDaTela, paddingBottom: espaco.s }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={textos.conversas.abrirTrampoDaFaixa(
          titulo,
          textos.selos[statusDaCandidatura],
          valorFormatado,
        )}
        onPress={onAbrir}
        onFocus={aoFocar}
        onBlur={aoDesfocar}
        style={({ pressed }) => [
          {
            alignSelf: 'center',
            width: '100%',
            maxWidth: larguraMaxima,
            minHeight: toqueMinimo,
            flexDirection: 'row',
            alignItems: 'center',
            gap: espaco.m - 4,
            paddingVertical: espaco.s,
            paddingHorizontal: espaco.m,
            borderRadius: raio.campo,
            backgroundColor: cores.superficie,
            opacity: pressed ? 0.85 : 1,
          },
          sombra.sm,
          focado && estiloDeFoco,
        ]}
      >
        <View style={{ flex: 1, gap: espaco.xs }}>
          <Text
            numberOfLines={1}
            style={[estiloDeTexto('corpo', 'negrito'), { color: cores.texto }]}
          >
            {titulo}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <SeloDeCandidatura status={statusDaCandidatura} />
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={[estiloDeTexto('h3'), { color: cores.primaria }]}
        >
          {valorFormatado}
        </Text>
        <Feather name="chevron-right" size={20} color={cores.textoSecundario} />
      </Pressable>
    </View>
  );
}

/** Carregando: bolhas de esqueleto alternadas, anunciadas uma vez. */
function BolhasCarregando() {
  const formas = [
    { minha: false, largura: '62%' },
    { minha: true, largura: '48%' },
    { minha: false, largura: '70%' },
  ] as const;
  return (
    <View
      accessible
      accessibilityLabel={textos.gerais.carregando}
      accessibilityState={{ busy: true }}
      style={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: larguraMaxima,
        padding: margemDaTela,
        gap: espaco.m - 4,
      }}
    >
      {formas.map((forma) => (
        <Esqueleto
          key={`${forma.minha}-${forma.largura}`}
          largura={forma.largura}
          altura={48}
          raioDaBorda={raio.lg}
          estilo={{ alignSelf: forma.minha ? 'flex-end' : 'flex-start' }}
        />
      ))}
    </View>
  );
}
