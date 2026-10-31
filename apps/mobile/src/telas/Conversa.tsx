import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Aviso,
  BolhaDeMensagem,
  Botao,
  Cabecalho,
  EstadoVazio,
} from '../componentes';
import {
  contarPontosDeCodigo,
  cortarEmPontosDeCodigo,
  useFoco,
} from '../componentes/utilitarios';
import { cores, espaco, larguraMaxima, raio, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Carregando, ErroDoBloco, Pagina, RodapeFixo } from './base';
import type { MensagemParaExibir, PropsDaConversa } from './tipos';

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
          icone="chatbubble-ellipses-outline"
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
      <Cabecalho titulo={titulo} onVoltar={onVoltar} />
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
        <View style={{ padding: espaco[2] }}>
          <Aviso variante="info" texto={textos.conversas.atualizacaoFalhando} />
        </View>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={{ flex: 1 }}>
          {mensagens.situacao === 'carregando' ? (
            <View style={{ padding: espaco[4] }}>
              <Carregando cartoes={1} />
            </View>
          ) : null}
          {mensagens.situacao === 'erro' ? (
            <View style={{ padding: espaco[4] }}>
              <ErroDoBloco
                mensagem={mensagens.mensagem}
                onTentarDeNovo={mensagens.onTentarDeNovo}
              />
            </View>
          ) : null}
          {mensagens.situacao === 'vazio' ||
          (mensagens.situacao === 'ok' && mensagens.dados.length === 0) ? (
            <View style={{ padding: espaco[4], alignItems: 'center' }}>
              <Text
                style={{
                  color: cores.textoSecundario,
                  fontSize: tipografia.tamanho.corpo,
                  lineHeight: tipografia.lineHeight.corpo,
                  textAlign: 'center',
                }}
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
                padding: espaco[4],
                gap: espaco[3],
              }}
              renderItem={({ item }) => (
                <BolhaDeMensagem
                  minha={item.minha}
                  texto={item.texto}
                  horaFormatada={item.horaFormatada}
                  situacao={item.situacao}
                  nome={nomeDasBolhas}
                  onTentarDeNovo={() => onTentarDeNovo(item.chave)}
                />
              )}
            />
          ) : null}
        </View>
        <RodapeFixo>
          {avisoDoEnvio ? <Aviso variante="erro" texto={avisoDoEnvio} /> : null}
          {semConexao ? (
            <Text
              style={{
                color: cores.textoSecundario,
                fontSize: tipografia.tamanho.rotulo,
                lineHeight: tipografia.lineHeight.rotulo,
              }}
            >
              {textos.conversas.semConexaoNoCampo}
            </Text>
          ) : null}
          <ContadorDaMensagem
            valor={rascunho}
            limite={limite}
            cortou={cortou}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: espaco[2],
            }}
          >
            <CampoDaMensagem valor={rascunho} onChangeText={mudarRascunho} />
            <Botao
              texto={textos.conversas.enviar}
              larguraCheia={false}
              desabilitado={!podeEnviar}
              onPress={onEnviar}
            />
          </View>
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
        style={{
          color: faixa === 'perto' ? cores.textoSecundario : cores.texto,
          fontSize: tipografia.tamanho.rotulo,
          lineHeight: tipografia.lineHeight.rotulo,
          fontWeight:
            faixa === 'limite' || faixa === 'cortou'
              ? tipografia.peso.semibold
              : faixa === 'faltam'
                ? tipografia.peso.medio
                : tipografia.peso.normal,
        }}
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

function CampoDaMensagem({
  valor,
  onChangeText,
}: {
  valor: string;
  onChangeText: (texto: string) => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <TextInput
      accessibilityLabel={textos.conversas.campo}
      placeholder={textos.conversas.campo}
      placeholderTextColor={cores.textoSecundario}
      value={valor}
      onChangeText={onChangeText}
      multiline
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={[
        {
          flex: 1,
          minHeight: 48,
          maxHeight: 120,
          paddingHorizontal: espaco[3],
          paddingVertical: espaco[3],
          borderWidth: 2,
          borderRadius: raio.md,
          borderColor: focado ? cores.primaria : cores.borda,
          backgroundColor: cores.superficie,
          color: cores.texto,
          fontSize: tipografia.tamanho.corpo,
          textAlignVertical: 'top',
        },
      ]}
    />
  );
}
