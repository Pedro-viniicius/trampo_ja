import { Ionicons } from '@expo/vector-icons';
import { type ComponentRef, type Ref, useState } from 'react';
import {
  Pressable,
  type ReturnKeyTypeOptions,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { estiloDeFoco, useFoco } from './utilitarios';

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
  maxLength?: number;
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
          onChangeText={onChangeText}
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
