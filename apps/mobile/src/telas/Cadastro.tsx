import { type ComponentRef, useRef } from 'react';
import type { TextInput } from 'react-native';
import { Aviso, Botao, CampoDeTexto } from '../componentes';
import { textos } from '../textos/pt-BR';
import { Formulario, useFocarPrimeiroErro } from './base';
import type { PropsDeCadastro } from './tipos';

const LIMITE_DA_SENHA = 128;

export function Cadastro({
  email,
  senha,
  erros,
  enviando,
  semConexao,
  onMudarEmail,
  onMudarSenha,
  onCriarConta,
  onIrParaEntrar,
  onVoltar,
}: PropsDeCadastro) {
  const refEmail = useRef<ComponentRef<typeof TextInput>>(null);
  const refSenha = useRef<ComponentRef<typeof TextInput>>(null);
  useFocarPrimeiroErro([
    { ref: refEmail, erro: erros.email },
    { ref: refSenha, erro: erros.senha },
  ]);
  const enviar = () => {
    if (!enviando) onCriarConta();
  };

  return (
    <Formulario
      titulo={textos.cadastro.titulo}
      onVoltar={onVoltar}
      semConexao={semConexao}
      rodape={
        <Botao
          texto={textos.cadastro.criarConta}
          textoCarregando={textos.cadastro.criando}
          carregando={enviando}
          onPress={enviar}
        />
      }
    >
      {erros.geral ? <Aviso variante="erro" texto={erros.geral} /> : null}
      <CampoDeTexto
        rotulo={textos.cadastro.email}
        tipo="email"
        valor={email}
        onChangeText={onMudarEmail}
        erro={erros.email}
        inputRef={refEmail}
        returnKeyType="next"
        onSubmitEditing={() => refSenha.current?.focus()}
      />
      <CampoDeTexto
        rotulo={textos.cadastro.senha}
        tipo="novaSenha"
        secureTextEntry
        maxLength={LIMITE_DA_SENHA}
        valor={senha}
        onChangeText={onMudarSenha}
        ajuda={textos.cadastro.ajudaSenha}
        erro={erros.senha}
        inputRef={refSenha}
        rotuloMostrarSenha={textos.cadastro.mostrarSenha}
        rotuloOcultarSenha={textos.cadastro.ocultarSenha}
        returnKeyType="go"
        onSubmitEditing={enviar}
      />
      <Aviso variante="info" texto={textos.cadastro.privacidade} />
      <Botao
        texto={textos.cadastro.jaTenhoConta}
        variante="texto"
        larguraCheia={false}
        onPress={onIrParaEntrar}
      />
    </Formulario>
  );
}
