import { type ComponentRef, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Text,
  View,
} from 'react-native';
import { cores, espaco, larguraMaxima, raio, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Botao } from './Botao';
import { useReduzirMovimento } from './utilitarios';

export type PropsDoDialogoDeConfirmacao = {
  visivel: boolean;
  titulo: string;
  mensagem?: string;
  textoConfirmar: string;
  textoCancelar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  /** Ação sem volta (ex.: "Sair"): botão em vermelho. */
  destrutivo?: boolean;
  carregando?: boolean;
  textoCarregando?: string;
};

export function DialogoDeConfirmacao({
  visivel,
  titulo,
  mensagem,
  textoConfirmar,
  textoCancelar = textos.gerais.cancelar,
  onConfirmar,
  onCancelar,
  destrutivo = false,
  carregando = false,
  textoCarregando,
}: PropsDoDialogoDeConfirmacao) {
  const reduzirMovimento = useReduzirMovimento();
  const tituloRef = useRef<ComponentRef<typeof Text>>(null);

  // Leva o foco do leitor de tela ao título ao abrir.
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
      animationType={reduzirMovimento ? 'none' : 'fade'}
      onRequestClose={onCancelar}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: espaco[4],
          backgroundColor: 'rgba(27, 31, 39, 0.5)',
        }}
      >
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: larguraMaxima,
            backgroundColor: cores.fundo,
            borderRadius: raio.lg,
            padding: espaco[5],
            gap: espaco[3],
          }}
        >
          <Text
            ref={tituloRef}
            accessible
            accessibilityRole="header"
            style={{
              color: cores.texto,
              fontSize: tipografia.tamanho.tituloDeSeção,
              lineHeight: tipografia.lineHeight.tituloDeSeção,
              fontWeight: tipografia.peso.semibold,
            }}
          >
            {titulo}
          </Text>
          {mensagem ? (
            <Text
              style={{
                color: cores.textoSecundario,
                fontSize: tipografia.tamanho.corpo,
                lineHeight: tipografia.lineHeight.corpo,
              }}
            >
              {mensagem}
            </Text>
          ) : null}
          <View style={{ gap: espaco[2], marginTop: espaco[2] }}>
            <Botao
              texto={textoConfirmar}
              variante={destrutivo ? 'destrutivo' : 'primario'}
              onPress={onConfirmar}
              carregando={carregando}
              textoCarregando={textoCarregando}
            />
            <Botao
              texto={textoCancelar}
              variante="secundario"
              onPress={onCancelar}
              desabilitado={carregando}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
