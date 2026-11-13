import { Feather } from '@expo/vector-icons';
import { type ComponentRef, type ReactNode, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import {
  cores,
  espaco,
  larguraMaxima,
  margemDaTela,
  raio,
  sombra,
} from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Botao } from './Botao';
import {
  type NomeDeIcone,
  OPACIDADE_DO_VEU,
  useMargensSeguras,
  useReduzirMovimento,
} from './utilitarios';

export type PropsDaFolhaInferior = {
  visivel: boolean;
  titulo: string;
  onFechar: () => void;
  textoFechar?: string;
  /** Ícone opcional em círculo roxo claro, acima do título. */
  icone?: NomeDeIcone;
  children: ReactNode;
};

/** Véu escuro (tinta 900 a 50%) atrás da folha e do diálogo; o toque fecha. */
export function Veu({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      accessible={false}
      importantForAccessibility="no"
      onPress={onPress}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: cores.tinta[900], opacity: OPACIDADE_DO_VEU },
      ]}
    />
  );
}

/** Alça decorativa do topo da folha. */
export function Alca() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: raio.pill,
        backgroundColor: cores.tinta[300],
        marginBottom: espaco.s,
      }}
    />
  );
}

/** Ícone da folha ou do diálogo, em círculo roxo claro. */
export function IconeDaFolha({
  icone,
  fundo = cores.roxo[50],
  cor = cores.roxo[700],
}: {
  icone: NomeDeIcone;
  fundo?: string;
  cor?: string;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 56,
        height: 56,
        borderRadius: raio.campo,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fundo,
      }}
    >
      <Feather name={icone} size={26} color={cor} />
    </View>
  );
}

export function FolhaInferior({
  visivel,
  titulo,
  onFechar,
  textoFechar = textos.gerais.cancelar,
  icone,
  children,
}: PropsDaFolhaInferior) {
  const reduzirMovimento = useReduzirMovimento();
  const margens = useMargensSeguras();
  const tituloRef = useRef<ComponentRef<typeof Text>>(null);

  // Leva o foco do leitor de tela ao título ao abrir (foco preso na folha).
  useEffect(() => {
    if (!visivel) return;
    const espera = setTimeout(() => {
      const no = findNodeHandle(tituloRef.current);
      if (no) AccessibilityInfo.setAccessibilityFocus(no);
    }, 150);
    return () => clearTimeout(espera);
  }, [visivel]);

  return (
    <Modal
      visible={visivel}
      transparent
      animationType={reduzirMovimento ? 'fade' : 'slide'}
      onRequestClose={onFechar}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Veu onPress={onFechar} />
        <View
          accessibilityViewIsModal
          style={[
            {
              alignSelf: 'center',
              width: '100%',
              maxWidth: larguraMaxima,
              maxHeight: '85%',
              backgroundColor: cores.superficie,
              borderTopLeftRadius: raio.folha,
              borderTopRightRadius: raio.folha,
              paddingTop: espaco.s + 4,
              paddingHorizontal: margemDaTela,
              paddingBottom: Math.max(margens.bottom, espaco.l),
              gap: espaco.m,
            },
            sombra.lg,
          ]}
        >
          <Alca />
          {icone ? <IconeDaFolha icone={icone} /> : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: espaco.s,
            }}
          >
            <Text
              ref={tituloRef}
              accessible
              accessibilityRole="header"
              style={[estiloDeTexto('h2'), { flex: 1, color: cores.texto }]}
            >
              {titulo}
            </Text>
            <Botao
              texto={textoFechar}
              variante="texto"
              tamanho="pequeno"
              larguraCheia={false}
              onPress={onFechar}
            />
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
