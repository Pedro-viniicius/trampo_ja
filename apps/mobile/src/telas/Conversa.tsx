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
  FaixaSemConexao,
} from '../componentes';
import { useFoco } from '../componentes/utilitarios';
import { cores, espaco, larguraMaxima, raio, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Carregando, ErroDoBloco, Pagina, RodapeFixo } from './base';
import type { MensagemParaExibir, PropsDaConversa } from './tipos';

const LIMITE_PADRAO = 2000;
/** O contador de caracteres só aparece nesta folga antes do limite. */
const FOLGA_DO_CONTADOR = 200;
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
      {semConexao ? <FaixaSemConexao /> : null}
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
          {rascunho.length >= limite - FOLGA_DO_CONTADOR ? (
            <Text
              style={{
                color: cores.textoSecundario,
                fontSize: tipografia.tamanho.rotulo,
                lineHeight: tipografia.lineHeight.rotulo,
              }}
            >
              {textos.formularioDeAnuncio.contador(
                Array.from(rascunho).length,
                limite,
              )}
            </Text>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: espaco[2],
            }}
          >
            <CampoDaMensagem
              valor={rascunho}
              limite={limite}
              onChangeText={onMudarRascunho}
            />
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

function CampoDaMensagem({
  valor,
  limite,
  onChangeText,
}: {
  valor: string;
  limite: number;
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
      maxLength={limite}
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
