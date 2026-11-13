import { type ComponentRef, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
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
import { Alca, IconeDaFolha, Veu } from './FolhaInferior';
import {
  type NomeDeIcone,
  useMargensSeguras,
  useReduzirMovimento,
} from './utilitarios';

export type PropsDoDialogoDeConfirmacao = {
  visivel: boolean;
  titulo: string;
  mensagem?: string;
  textoConfirmar: string;
  textoCancelar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  /** Ação sem volta (ex.: "Sair"): botão de erro com texto branco. */
  destrutivo?: boolean;
  carregando?: boolean;
  textoCarregando?: string;
  /** Ícone opcional acima do título (padrão: alerta no destrutivo). */
  icone?: NomeDeIcone;
};

/**
 * Confirmação no padrão V2 (quadro 01): folha que sobe de baixo, com ícone,
 * título, mensagem, a ação principal e "cancelar" como botão de texto.
 */
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
  icone,
}: PropsDoDialogoDeConfirmacao) {
  const reduzirMovimento = useReduzirMovimento();
  const margens = useMargensSeguras();
  const tituloRef = useRef<ComponentRef<typeof Text>>(null);
  const iconeFinal = icone ?? (destrutivo ? 'alert-triangle' : undefined);

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
      animationType={reduzirMovimento ? 'fade' : 'slide'}
      onRequestClose={onCancelar}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Veu />
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            {
              alignSelf: 'center',
              width: '100%',
              maxWidth: larguraMaxima,
              backgroundColor: cores.superficie,
              borderTopLeftRadius: raio.folha,
              borderTopRightRadius: raio.folha,
              paddingTop: espaco.s + 4,
              paddingHorizontal: margemDaTela,
              paddingBottom: Math.max(margens.bottom, espaco.l),
              gap: espaco.m - 4,
            },
            sombra.lg,
          ]}
        >
          <Alca />
          {iconeFinal ? (
            <IconeDaFolha
              icone={iconeFinal}
              fundo={destrutivo ? cores.feedback.erro.fundo : undefined}
              cor={destrutivo ? cores.feedback.erro.texto : undefined}
            />
          ) : null}
          <Text
            ref={tituloRef}
            accessible
            accessibilityRole="header"
            style={[estiloDeTexto('h2'), { color: cores.texto }]}
          >
            {titulo}
          </Text>
          {mensagem ? (
            <Text
              style={[estiloDeTexto('corpo'), { color: cores.textoSecundario }]}
            >
              {mensagem}
            </Text>
          ) : null}
          <View style={{ gap: espaco.s, marginTop: espaco.s }}>
            <Botao
              texto={textoConfirmar}
              variante={destrutivo ? 'perigo' : 'primario'}
              tamanho="grande"
              onPress={onConfirmar}
              carregando={carregando}
              textoCarregando={textoCarregando}
            />
            <Botao
              texto={textoCancelar}
              variante="texto"
              onPress={onCancelar}
              desabilitado={carregando}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
