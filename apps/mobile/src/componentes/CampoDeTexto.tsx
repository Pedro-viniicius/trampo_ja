import { Ionicons } from '@expo/vector-icons';
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
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
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
  const [cortes, setCortes] = useState(0);
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
      setCortes((n) => n + 1);
      onChangeText(cortarEmPontosDeCodigo(texto, limite));
      return;
    }
    setCortou(false);
    onChangeText(texto);
  };

  // Anúncio uma vez por mudança de faixa (não por tecla). `n` remonta o
  // <Text> para repetir o mesmo texto (ex.: colar de novo além do limite).
  const [anuncio, setAnuncio] = useState<{ texto: string; n: number } | null>(
    null,
  );
  const ultimaFaixa = useRef(faixa);
  const colagens = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só à mudança de faixa e de corte; o resto é lido no momento.
  useEffect(() => {
    if (limite === undefined) return;
    const anterior = ultimaFaixa.current;
    ultimaFaixa.current = faixa;
    if (faixa === anterior && faixa !== 'cortou') return;
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
  }, [faixa, valor, limite, cortes]);

  return (
    <View style={{ gap: espaco[1] }}>
      <Text
        style={{
          color: cores.texto,
          fontSize: tipografia.tamanho.rotulo,
          lineHeight: tipografia.lineHeight.rotulo,
          fontWeight: tipografia.peso.medio,
        }}
      >
        {rotulo}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: multiline ? 96 : toqueMinimo + 4,
          borderWidth: 2,
          borderRadius: raio.sm,
          borderColor: temErro
            ? cores.erro
            : focado
              ? cores.primaria
              : cores.borda,
          backgroundColor: cores.superficie,
          opacity: editable ? 1 : 0.6,
        }}
      >
        <TextInput
          ref={inputRef}
          accessibilityLabel={rotulo}
          accessibilityHint={erro ?? ajuda}
          value={valor}
          onChangeText={aoMudar}
          placeholder={placeholder}
          placeholderTextColor={cores.textoSecundario}
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
          style={{
            flex: 1,
            paddingHorizontal: espaco[3],
            paddingVertical: espaco[2],
            color: cores.texto,
            fontSize: tipografia.tamanho.corpo,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
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
            <Ionicons
              name={senhaVisivel ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={cores.textoSecundario}
            />
          </Pressable>
        ) : null}
      </View>
      {ajuda && !erro ? (
        <Text
          style={{
            color: cores.textoSecundario,
            fontSize: tipografia.tamanho.legenda,
            lineHeight: tipografia.lineHeight.legenda,
          }}
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
            <Ionicons
              name="alert-circle"
              size={16}
              color={cores.erro}
              style={{ marginTop: 2 }}
            />
            <Text
              style={{
                flex: 1,
                color: cores.erro,
                fontSize: tipografia.tamanho.rotulo,
                lineHeight: tipografia.lineHeight.rotulo,
              }}
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
            <Ionicons name="information-circle" size={14} color={cores.texto} />
          ) : null}
          <Text
            style={{
              color:
                faixa === 'perto' || faixa === 'nenhuma'
                  ? cores.textoSecundario
                  : cores.texto,
              fontSize: tipografia.tamanho.legenda,
              lineHeight: tipografia.lineHeight.legenda,
              fontWeight:
                faixa === 'limite' || faixa === 'cortou'
                  ? tipografia.peso.semibold
                  : faixa === 'faltam'
                    ? tipografia.peso.medio
                    : tipografia.peso.normal,
            }}
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
          style={{
            alignSelf: 'flex-end',
            color: cores.textoSecundario,
            fontSize: tipografia.tamanho.legenda,
            lineHeight: tipografia.lineHeight.legenda,
          }}
        >
          {contador}
        </Text>
      ) : null}
    </View>
  );
}
