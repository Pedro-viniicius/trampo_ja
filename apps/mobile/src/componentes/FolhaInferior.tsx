import { type ComponentRef, type ReactNode, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { cores, espaco, larguraMaxima, raio, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Botao } from './Botao';
import { useMargensSeguras, useReduzirMovimento } from './utilitarios';

export type PropsDaFolhaInferior = {
  visivel: boolean;
  titulo: string;
  onFechar: () => void;
  textoFechar?: string;
  children: ReactNode;
};

export function FolhaInferior({
  visivel,
  titulo,
  onFechar,
  textoFechar = textos.gerais.cancelar,
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
      animationType={reduzirMovimento ? 'none' : 'slide'}
      onRequestClose={onFechar}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(27, 31, 39, 0.5)',
        }}
      >
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onFechar}
          style={{ flex: 1 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: larguraMaxima,
            maxHeight: '85%',
            backgroundColor: cores.fundo,
            borderTopLeftRadius: raio.lg,
            borderTopRightRadius: raio.lg,
            paddingTop: espaco[4],
            paddingHorizontal: espaco[4],
            paddingBottom: Math.max(margens.bottom, espaco[4]),
            gap: espaco[3],
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: espaco[2],
            }}
          >
            <Text
              ref={tituloRef}
              accessible
              accessibilityRole="header"
              style={{
                flex: 1,
                color: cores.texto,
                fontSize: tipografia.tamanho.tituloDeSeção,
                lineHeight: tipografia.lineHeight.tituloDeSeção,
                fontWeight: tipografia.peso.semibold,
              }}
            >
              {titulo}
            </Text>
            <Botao
              texto={textoFechar}
              variante="texto"
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
