import { type ComponentRef, useRef } from 'react';
import type { TextInput } from 'react-native';
import { Text, View } from 'react-native';
import { Aviso, Botao, CampoDeTexto } from '../componentes';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { FocarPrimeiroErro, Formulario, IlustracaoDaMarca } from './base';
import type { PropsDeEntrar } from './tipos';

const LIMITE_DA_SENHA = 128;

export function Entrar({
  email,
  senha,
  erros,
  enviando,
  semConexao,
  onMudarEmail,
  onMudarSenha,
  onEntrar,
  onIrParaCadastro,
  onVoltar,
}: PropsDeEntrar) {
  const refEmail = useRef<ComponentRef<typeof TextInput>>(null);
  const refSenha = useRef<ComponentRef<typeof TextInput>>(null);
  const enviar = () => {
    if (!enviando) onEntrar();
  };

  return (
    <Formulario
      titulo={textos.entrar.titulo}
      subtitulo={textos.entrar.subtitulo}
      ilustracao={<IlustracaoDaMarca />}
      onVoltar={onVoltar}
      semConexao={semConexao}
      rodape={
        <Botao
          texto={textos.entrar.entrar}
          tamanho="grande"
          textoCarregando={textos.entrar.entrando}
          carregando={enviando}
          onPress={enviar}
        />
      }
    >
      <FocarPrimeiroErro
        campos={[
          { ref: refEmail, erro: erros.email },
          { ref: refSenha, erro: erros.senha },
        ]}
      />
      {erros.geral ? <Aviso variante="erro" texto={erros.geral} /> : null}
      <CampoDeTexto
        rotulo={textos.entrar.email}
        tipo="email"
        valor={email}
        onChangeText={onMudarEmail}
        erro={erros.email}
        inputRef={refEmail}
        returnKeyType="next"
        onSubmitEditing={() => refSenha.current?.focus()}
      />
      <CampoDeTexto
        rotulo={textos.entrar.senha}
        tipo="senha"
        limite={LIMITE_DA_SENHA}
        contadorDoLimite="nunca"
        secureTextEntry
        valor={senha}
        onChangeText={onMudarSenha}
        erro={erros.senha}
        inputRef={refSenha}
        rotuloMostrarSenha={textos.entrar.mostrarSenha}
        rotuloOcultarSenha={textos.entrar.ocultarSenha}
        returnKeyType="go"
        onSubmitEditing={enviar}
      />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          columnGap: espaco.xs,
        }}
      >
        <Text
          style={[estiloDeTexto('corpo'), { color: cores.textoSecundario }]}
        >
          {textos.entrar.semConta}
        </Text>
        <Botao
          texto={textos.entrar.criarConta}
          variante="texto"
          tamanho="pequeno"
          larguraCheia={false}
          onPress={onIrParaCadastro}
        />
      </View>
    </Formulario>
  );
}
