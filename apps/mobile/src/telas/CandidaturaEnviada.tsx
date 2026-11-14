import { Feather } from '@expo/vector-icons';
import { type ComponentRef, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  findNodeHandle,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  Avatar,
  Botao,
  BotaoDeIcone,
  PassosDeCandidatura,
} from '../componentes';
import {
  useMargensSeguras,
  useReduzirMovimento,
} from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import {
  cores,
  espaco,
  larguraMaxima,
  margemDaTela,
  movimento,
  raio,
  sombra,
} from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Pagina, RodapeFixo } from './base';
import type {
  PropsDaCandidaturaEnviada,
  ResumoDaCandidaturaEnviada,
} from './tipos';

const LADO_DO_CIRCULO = 96;
const LADO_DO_HALO = 128;

/**
 * Candidatura enviada (quadro 06; CA80): tela cheia, sem barra de abas. O
 * foco vai ao título, anunciado ao abrir. Sem dados do resumo no cache, só o
 * título e os passos.
 */
export function CandidaturaEnviada({
  resumo,
  onVerMeusTrampos,
  onBuscarMais,
  onVoltar,
}: PropsDaCandidaturaEnviada) {
  const margens = useMargensSeguras();
  const titulo = useRef<ComponentRef<typeof Text>>(null);

  useEffect(() => {
    const no = findNodeHandle(titulo.current);
    if (no) AccessibilityInfo.setAccessibilityFocus(no);
  }, []);

  return (
    <Pagina>
      {onVoltar ? (
        <View
          style={{
            width: '100%',
            maxWidth: larguraMaxima,
            alignSelf: 'center',
            paddingTop: margens.top + espaco.s,
            paddingHorizontal: margemDaTela,
          }}
        >
          <BotaoDeIcone
            icone="chevron-left"
            variante="claro"
            rotulo={textos.gerais.voltar}
            onPress={onVoltar}
          />
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          paddingTop: onVoltar ? 0 : margens.top,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: larguraMaxima,
            paddingHorizontal: margemDaTela,
            paddingVertical: espaco.l,
            alignItems: 'center',
            gap: espaco.m,
          }}
        >
          <CirculoDeSucesso />
          <Text
            ref={titulo}
            accessibilityRole="header"
            style={[
              estiloDeTexto('h1'),
              { color: cores.texto, textAlign: 'center' },
            ]}
          >
            {textos.candidaturaEnviada.titulo}
          </Text>
          <Text
            style={[
              estiloDeTexto('corpoG'),
              { color: cores.textoSecundario, textAlign: 'center' },
            ]}
          >
            {resumo?.autor
              ? textos.candidaturaEnviada.texto(resumo.autor)
              : textos.candidaturaEnviada.textoSemAutor}
          </Text>
          <View
            style={[
              {
                alignSelf: 'stretch',
                gap: espaco.m,
                padding: espaco.m,
                borderRadius: raio.card,
                backgroundColor: cores.superficie,
              },
              sombra.sm,
            ]}
          >
            {resumo ? <Resumo resumo={resumo} /> : null}
            <PassosDeCandidatura passoAtual={2} />
          </View>
        </View>
      </ScrollView>
      <RodapeFixo>
        <Botao
          texto={textos.candidaturaEnviada.verMeusTrampos}
          tamanho="grande"
          onPress={onVerMeusTrampos}
        />
        <Botao
          texto={textos.candidaturaEnviada.buscarMais}
          variante="contorno"
          onPress={onBuscarMais}
        />
      </RodapeFixo>
    </Pagina>
  );
}

/** Círculo de sucesso com halo: decorativo; pulsa uma vez (parado com reduzir movimento). */
function CirculoDeSucesso() {
  const reduzir = useReduzirMovimento();
  const escala = useRef(new Animated.Value(reduzir ? 1 : 0.85)).current;
  useEffect(() => {
    if (reduzir) {
      escala.setValue(1);
      return;
    }
    const animacao = Animated.timing(escala, {
      toValue: 1,
      duration: movimento.entradaDeTelaMs,
      useNativeDriver: true,
    });
    animacao.start();
    return () => animacao.stop();
  }, [escala, reduzir]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: LADO_DO_HALO,
        height: LADO_DO_HALO,
        borderRadius: LADO_DO_HALO / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: cores.feedback.sucesso.fundo,
        transform: [{ scale: escala }],
      }}
    >
      <View
        style={{
          width: LADO_DO_CIRCULO,
          height: LADO_DO_CIRCULO,
          borderRadius: LADO_DO_CIRCULO / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: cores.feedback.sucesso.base,
        }}
      >
        <Feather name="check" size={48} color={cores.branco} />
      </View>
    </Animated.View>
  );
}

/** Trampo da candidatura: avatar de quem publicou, título, autor, prazo e valor. */
function Resumo({ resumo }: { resumo: ResumoDaCandidaturaEnviada }) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.m - 4 }}
    >
      <Avatar nome={resumo.autor ?? resumo.titulo} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={2}
          style={[estiloDeTexto('h3'), { color: cores.texto }]}
        >
          {resumo.titulo}
        </Text>
        {resumo.autor ? (
          <Text
            numberOfLines={1}
            style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
          >
            {textos.meusTrampos.publicadoPor(resumo.autor)}
          </Text>
        ) : null}
        {resumo.prazoFormatado ? (
          <Text
            style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
          >
            {`${textos.detalheTrampo.prazo}: ${resumo.prazoFormatado}`}
          </Text>
        ) : null}
      </View>
      {resumo.valorFormatado ? (
        <Text style={[estiloDeTexto('h3'), { color: cores.texto }]}>
          {resumo.valorFormatado}
        </Text>
      ) : null}
    </View>
  );
}
