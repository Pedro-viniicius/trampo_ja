import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentRef, Ref } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Chip } from './Chip';
import {
  cortarEmPontosDeCodigo,
  estiloDeFoco,
  pontosDoGradiente,
  useFoco,
} from './utilitarios';

export type PropsDoCampoDeMensagem = {
  valor: string;
  onChangeText: (texto: string) => void;
  onEnviar: () => void;
  /** Rótulo e texto de exemplo do campo (padrão: "Escreva uma mensagem"). */
  rotulo?: string;
  rotuloEnviar?: string;
  /** Envio bloqueado (ex.: sem conexão): o campo segue editável. */
  envioDesabilitado?: boolean;
  /**
   * Quando informado, só ele decide se o botão enviar habilita (a tela já
   * considera o texto vazio e a conexão). Sem ele: bloqueia com o campo vazio
   * ou com `envioDesabilitado`.
   */
  podeEnviar?: boolean;
  /** Por que o envio está bloqueado (falado como dica do botão). */
  motivoDoEnvio?: string;
  /** Limite em pontos de código (corta ao digitar ou colar). */
  limite?: number;
  /**
   * Chips acima do campo; tocar preenche o campo vazio ou acrescenta ao fim do
   * rascunho, com um espaço (nunca apaga o que a pessoa escreveu nem envia).
   */
  respostasRapidas?: readonly string[];
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
};

const LINHAS_MAXIMAS = 4;
const ALTURA_DA_LINHA = 22;

/** Rodapé do chat: pílula branca multilinha (até 4 linhas) e botão enviar redondo. */
export function CampoDeMensagem({
  valor,
  onChangeText,
  onEnviar,
  rotulo = textos.conversas.campo,
  rotuloEnviar = textos.conversas.enviar,
  envioDesabilitado = false,
  podeEnviar,
  motivoDoEnvio,
  limite,
  respostasRapidas,
  inputRef,
}: PropsDoCampoDeMensagem) {
  const campo = useFoco();
  const botao = useFoco();
  const vazio = valor.trim().length === 0;
  const bloqueado =
    podeEnviar === undefined ? vazio || envioDesabilitado : !podeEnviar;
  const mudar = (texto: string) =>
    onChangeText(
      limite === undefined ? texto : cortarEmPontosDeCodigo(texto, limite),
    );

  return (
    <View style={{ gap: espaco.s }}>
      {respostasRapidas && respostasRapidas.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="list"
          accessibilityLabel={textos.conversas.respostasRapidasRotulo}
          contentContainerStyle={{ gap: espaco.s, paddingVertical: espaco.xs }}
        >
          {respostasRapidas.map((resposta) => (
            <Chip
              key={resposta}
              texto={resposta}
              onPress={() =>
                // Nunca apaga o rascunho: com texto, a resposta vai ao fim.
                mudar(vazio ? resposta : `${valor.trimEnd()} ${resposta}`)
              }
            />
          ))}
        </ScrollView>
      ) : null}
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: espaco.s }}
      >
        <View
          style={[
            {
              flex: 1,
              minHeight: 56,
              justifyContent: 'center',
              paddingHorizontal: espaco.m + 4,
              paddingVertical: espaco.s,
              borderRadius: 28,
              borderWidth: 1.5,
              borderColor: campo.focado ? cores.primaria : cores.bordaDeCampo,
              backgroundColor: cores.superficie,
            },
            sombra.sm,
            campo.focado && estiloDeFoco,
          ]}
        >
          <TextInput
            ref={inputRef}
            accessibilityLabel={rotulo}
            placeholder={rotulo}
            placeholderTextColor={cores.tinta[500]}
            value={valor}
            onChangeText={mudar}
            onFocus={campo.aoFocar}
            onBlur={campo.aoDesfocar}
            multiline
            style={[
              estiloDeTexto('corpo'),
              {
                color: cores.texto,
                maxHeight: ALTURA_DA_LINHA * LINHAS_MAXIMAS + espaco.s,
                paddingVertical: espaco.xs,
                textAlignVertical: 'center',
              },
            ]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rotuloEnviar}
          accessibilityHint={bloqueado ? motivoDoEnvio : undefined}
          accessibilityState={{ disabled: bloqueado }}
          disabled={bloqueado}
          onPress={onEnviar}
          onFocus={botao.aoFocar}
          onBlur={botao.aoDesfocar}
          style={[
            {
              width: toqueMinimo,
              height: toqueMinimo,
              marginBottom: 4,
              borderRadius: raio.pill,
              overflow: 'hidden',
              backgroundColor: bloqueado ? cores.tinta[100] : 'transparent',
            },
            botao.focado && estiloDeFoco,
          ]}
        >
          {bloqueado ? (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="send" size={20} color={cores.tinta[500]} />
            </View>
          ) : (
            <LinearGradient
              colors={[...cores.gradienteAcao]}
              {...pontosDoGradiente}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="send" size={20} color={cores.branco} />
            </LinearGradient>
          )}
        </Pressable>
      </View>
    </View>
  );
}
