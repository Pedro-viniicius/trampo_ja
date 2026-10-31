import { type ComponentRef, useRef } from 'react';
import type { TextInput } from 'react-native';
import { Aviso, Botao, CampoDeTexto } from '../componentes';
import { textos } from '../textos/pt-BR';
import { FocarPrimeiroErro, Formulario, Paragrafo } from './base';
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
      onVoltar={onVoltar}
      semConexao={semConexao}
      rodape={
        <Botao
          texto={textos.entrar.entrar}
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
      <Paragrafo texto={textos.entrar.semConta} secundario />
      <Botao
        texto={textos.entrar.criarConta}
        variante="texto"
        larguraCheia={false}
        onPress={onIrParaCadastro}
      />
    </Formulario>
  );
}
