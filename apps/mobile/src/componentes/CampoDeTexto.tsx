import { Feather } from '@expo/vector-icons';
import {
  type ComponentRef,
  type Ref,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  type ReturnKeyTypeOptions,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  contarPontosDeCodigo,
  cortarEmPontosDeCodigo,
  estiloDeFoco,
  useFoco,
} from './utilitarios';

export type TipoDeTeclado =
  | 'texto'
  | 'email'
  | 'numero'
  | 'decimal'
  | 'senha'
  | 'novaSenha';

export type PropsDoCampoDeTexto = {
  /** Rótulo sempre visível (nunca só placeholder). */
  rotulo: string;
  valor: string;
  onChangeText: (texto: string) => void;
  tipo?: TipoDeTeclado;
  placeholder?: string;
  ajuda?: string;
  /** Mensagem de erro já traduzida: aparece com ícone e é anunciada. */
  erro?: string;
  /** Ex.: "12 de 300 caracteres". */
  contador?: string;
  secureTextEntry?: boolean;
  rotuloMostrarSenha?: string;
  rotuloOcultarSenha?: string;
  multiline?: boolean;
  /** Só para campos ASCII (valor e prazo). Texto livre usa `limite`. */
  maxLength?: number;
  /**
   * Limite em pontos de código, como a API. Corta ao digitar ou colar, mostra
   * "n de limite" e anuncia o limite atingido.
   */
  limite?: number;
  /** `perto` (padrão): a partir de 80% do limite. `sempre` ou `nunca`. */
  contadorDoLimite?: 'perto' | 'sempre' | 'nunca';
  editable?: boolean;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  returnKeyType?: ReturnKeyTypeOptions;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  /** Sobrescreve o padrão do `tipo`. */
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
};

/** Altura do campo de uma linha (spec: 56). */
const ALTURA_DO_CAMPO = 56;

const propsPorTipo: Record<TipoDeTeclado, Partial<TextInputProps>> = {
  texto: {},
  email: {
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'email',
    textContentType: 'emailAddress',
  },
  numero: { keyboardType: 'number-pad' },
  decimal: { keyboardType: 'decimal-pad' },
  senha: {
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'password',
    textContentType: 'password',
  },
  novaSenha: {
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'new-password',
    textContentType: 'newPassword',
  },
};

export function CampoDeTexto({
  rotulo,
  valor,
  onChangeText,
  tipo = 'texto',
  placeholder,
  ajuda,
  erro,
  contador,
  secureTextEntry = false,
  rotuloMostrarSenha = textos.entrar.mostrarSenha,
  rotuloOcultarSenha = textos.entrar.ocultarSenha,
  multiline = false,
  maxLength,
  limite,
  contadorDoLimite = 'perto',
  editable = true,
  onBlur,
  onSubmitEditing,
  returnKeyType,
  inputRef,
  autoComplete,
  textContentType,
}: PropsDoCampoDeTexto) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const botaoFoco = useFoco();
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const temErro = Boolean(erro);
  const [cortou, setCortou] = useState(false);
  const total = limite === undefined ? 0 : contarPontosDeCodigo(valor);
  const faixa =
    limite === undefined || limite <= 0
      ? 'nenhuma'
      : cortou && total >= limite
        ? 'cortou'
        : total >= limite
          ? 'limite'
          : total >= limite * 0.9
            ? 'faltam'
            : total >= limite * 0.8
              ? 'perto'
              : 'nenhuma';
  const textoDoContador =
    limite === undefined || contadorDoLimite === 'nunca'
      ? null
      : faixa === 'cortou'
        ? textos.gerais.contadorCortado(limite)
        : faixa === 'limite'
          ? textos.gerais.contadorLimite(limite)
          : faixa === 'faltam'
            ? `${textos.gerais.contador(total, limite)}. ${textos.gerais.contadorFaltam(limite - total)}`
            : faixa === 'perto' || contadorDoLimite === 'sempre'
              ? textos.gerais.contador(total, limite)
              : null;
  const aoMudar = (texto: string) => {
    if (limite !== undefined && contarPontosDeCodigo(texto) > limite) {
      setCortou(true);
      onChangeText(cortarEmPontosDeCodigo(texto, limite));
      return;
    }
    setCortou(false);
    onChangeText(texto);
  };

  // Anúncio uma vez por mudança de faixa (não por tecla), inclusive o corte:
  // continuar digitando além do limite não repete. `n` remonta o <Text>.
  const [anuncio, setAnuncio] = useState<{ texto: string; n: number } | null>(
    null,
  );
  const ultimaFaixa = useRef(faixa);
  const colagens = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só à mudança de faixa; o resto é lido no momento.
  useEffect(() => {
    if (limite === undefined) return;
    const anterior = ultimaFaixa.current;
    ultimaFaixa.current = faixa;
    if (faixa === anterior) return;
    let texto: string | null = null;
    if (faixa === 'cortou') {
      texto = textos.gerais.contadorCortado(limite);
    } else if (faixa === 'limite') {
      texto = textos.gerais.contadorLimite(limite);
    } else if (faixa === 'faltam') {
      texto = textos.gerais.contadorFaltam(limite - total);
    }
    if (!texto) {
      setAnuncio(null);
      return;
    }
    colagens.current += 1;
    setAnuncio({ texto, n: colagens.current });
    if (Platform.OS === 'ios')
      AccessibilityInfo.announceForAccessibility(texto);
  }, [faixa, limite]);

  return (
    <View style={{ gap: espaco.s - 2 }}>
      <Text
        style={[estiloDeTexto('legenda', 'negrito'), { color: cores.texto }]}
      >
        {rotulo}
      </Text>
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: multiline ? 'flex-start' : 'center',
            minHeight: multiline ? 120 : ALTURA_DO_CAMPO,
            // A borda engrossa no foco e no erro; o padding compensa para o texto não pular.
            borderWidth: temErro || focado ? 2 : 1.5,
            paddingHorizontal: temErro || focado ? 0 : 0.5,
            borderRadius: raio.campo,
            borderColor: temErro
              ? cores.feedback.erro.base
              : focado
                ? cores.primaria
                : cores.bordaDeCampo,
            backgroundColor: !editable
              ? cores.tinta[100]
              : temErro
                ? cores.feedback.erro.fundo
                : cores.superficie,
          },
          focado && !temErro && estiloDeFoco,
        ]}
      >
        <TextInput
          ref={inputRef}
          accessibilityLabel={rotulo}
          accessibilityHint={erro ?? ajuda}
          value={valor}
          onChangeText={aoMudar}
          placeholder={placeholder}
          placeholderTextColor={cores.tinta[500]}
          secureTextEntry={secureTextEntry && !senhaVisivel}
          multiline={multiline}
          maxLength={maxLength}
          editable={editable}
          onFocus={aoFocar}
          onBlur={() => {
            aoDesfocar();
            onBlur?.();
          }}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          {...propsPorTipo[tipo]}
          {...(autoComplete ? { autoComplete } : {})}
          {...(textContentType ? { textContentType } : {})}
          style={[
            estiloDeTexto('corpo'),
            {
              flex: 1,
              minHeight: multiline ? 116 : ALTURA_DO_CAMPO - 4,
              paddingHorizontal: espaco.m,
              paddingVertical: multiline ? espaco.m - 2 : espaco.s,
              color: editable ? cores.texto : cores.tinta[500],
              textAlignVertical: multiline ? 'top' : 'center',
            },
          ]}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              senhaVisivel ? rotuloOcultarSenha : rotuloMostrarSenha
            }
            onPress={() => setSenhaVisivel((visivel) => !visivel)}
            onFocus={botaoFoco.aoFocar}
            onBlur={botaoFoco.aoDesfocar}
            style={[
              {
                width: toqueMinimo,
                height: toqueMinimo,
                alignItems: 'center',
                justifyContent: 'center',
              },
              botaoFoco.focado && estiloDeFoco,
            ]}
          >
            <Feather
              name={senhaVisivel ? 'eye-off' : 'eye'}
              size={22}
              color={cores.textoSecundario}
            />
          </Pressable>
        ) : null}
      </View>
      {ajuda && !erro ? (
        <Text
          style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
        >
          {ajuda}
        </Text>
      ) : null}
      <View accessibilityLiveRegion="polite">
        {erro ? (
          <View
            style={{
              flexDirection: 'row',
              gap: espaco[1],
              alignItems: 'flex-start',
            }}
          >
            <Feather
              name="alert-circle"
              size={16}
              color={cores.erro}
              style={{ marginTop: 1 }}
            />
            <Text
              style={[estiloDeTexto('legenda'), { flex: 1, color: cores.erro }]}
            >
              {erro}
            </Text>
          </View>
        ) : null}
      </View>
      {textoDoContador ? (
        <View
          accessible
          accessibilityLabel={textoDoContador}
          style={{
            alignSelf: 'flex-end',
            flexDirection: 'row',
            alignItems: 'center',
            gap: espaco[1],
          }}
        >
          {faixa === 'limite' || faixa === 'cortou' ? (
            <Feather name="info" size={14} color={cores.texto} />
          ) : null}
          <Text
            style={[
              estiloDeTexto(
                'legenda',
                faixa === 'limite' || faixa === 'cortou'
                  ? 'semibold'
                  : faixa === 'faltam'
                    ? 'medio'
                    : 'normal',
              ),
              {
                color:
                  faixa === 'perto' || faixa === 'nenhuma'
                    ? cores.textoSecundario
                    : cores.texto,
              },
            ]}
          >
            {textoDoContador}
          </Text>
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
      {contador ? (
        <Text
          style={[
            estiloDeTexto('legenda'),
            { alignSelf: 'flex-end', color: cores.textoSecundario },
          ]}
        >
          {contador}
        </Text>
      ) : null}
    </View>
  );
}
