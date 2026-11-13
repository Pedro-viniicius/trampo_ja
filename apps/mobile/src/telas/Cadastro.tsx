import { Feather } from '@expo/vector-icons';
import { type ComponentRef, useRef } from 'react';
import type { TextInput } from 'react-native';
import { Pressable, Text, View } from 'react-native';
import { Aviso, Botao, CampoDeTexto, Motivo } from '../componentes';
import {
  estiloDeFoco,
  type NomeDeIcone,
  useFoco,
} from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { FocarPrimeiroErro, Formulario } from './base';
import type { ModoDoApp, PropsDeCadastro } from './tipos';

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
  onPolitica,
  onTermos,
  onVoltar,
  objetivo = null,
  onEscolherObjetivo,
}: PropsDeCadastro) {
  const refEmail = useRef<ComponentRef<typeof TextInput>>(null);
  const refSenha = useRef<ComponentRef<typeof TextInput>>(null);
  // CA75: com a escolha de objetivo, criar a conta exige escolher antes.
  const faltaObjetivo = Boolean(onEscolherObjetivo) && objetivo === null;
  const enviar = () => {
    if (!enviando && !faltaObjetivo) onCriarConta();
  };

  return (
    <Formulario
      titulo={textos.cadastro.titulo}
      onVoltar={onVoltar}
      semConexao={semConexao}
      rodape={
        <>
          <TextoDeAceite onTermos={onTermos} onPolitica={onPolitica} />
          <Botao
            texto={textos.cadastro.criarConta}
            tamanho="grande"
            textoCarregando={textos.cadastro.criando}
            carregando={enviando}
            desabilitado={faltaObjetivo}
            onPress={enviar}
          />
          {faltaObjetivo ? (
            <Motivo texto={textos.cadastro.escolhaObjetivo} />
          ) : null}
        </>
      }
    >
      <FocarPrimeiroErro
        campos={[
          { ref: refEmail, erro: erros.email },
          { ref: refSenha, erro: erros.senha },
        ]}
      />
      {erros.geral ? <Aviso variante="erro" texto={erros.geral} /> : null}
      {onEscolherObjetivo ? (
        <EscolhaDeObjetivo
          objetivo={objetivo}
          onEscolher={onEscolherObjetivo}
        />
      ) : null}
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
        limite={LIMITE_DA_SENHA}
        contadorDoLimite="nunca"
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

/** Frase completa para o leitor de tela; os links ficam em uma linha abaixo. */
function TextoDeAceite({
  onTermos,
  onPolitica,
}: {
  onTermos: () => void;
  onPolitica: () => void;
}) {
  const t = textos.cadastro;
  return (
    <View style={{ gap: espaco.xs }}>
      <Text
        style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
      >
        {t.aceite}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: espaco.m,
        }}
      >
        <Botao
          texto={t.aceiteTermos}
          variante="texto"
          tamanho="pequeno"
          larguraCheia={false}
          onPress={onTermos}
        />
        <Botao
          texto={t.aceitePolitica}
          variante="texto"
          tamanho="pequeno"
          larguraCheia={false}
          onPress={onPolitica}
        />
      </View>
    </View>
  );
}

const OBJETIVOS: readonly {
  modo: ModoDoApp;
  texto: string;
  icone: NomeDeIcone;
}[] = [
  {
    modo: 'contratante',
    texto: textos.cadastro.querContratar,
    icone: 'briefcase',
  },
  { modo: 'freela', texto: textos.cadastro.querTrampar, icone: 'tool' },
];

/**
 * "Qual é o seu objetivo principal?" (quadro 03): dois cartões de escolha
 * única. Define só o modo inicial; a dica diz que dá para alternar no perfil.
 */
function EscolhaDeObjetivo({
  objetivo,
  onEscolher,
}: {
  objetivo: ModoDoApp | null;
  onEscolher: (modo: ModoDoApp) => void;
}) {
  return (
    <View style={{ gap: espaco.m - 4 }}>
      <Text style={[estiloDeTexto('h3'), { color: cores.texto }]}>
        {textos.cadastro.objetivo}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={textos.cadastro.objetivo}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m - 4 }}
      >
        {OBJETIVOS.map((opcao) => (
          <CartaoDeObjetivo
            key={opcao.modo}
            texto={opcao.texto}
            icone={opcao.icone}
            selecionado={objetivo === opcao.modo}
            onPress={() => onEscolher(opcao.modo)}
          />
        ))}
      </View>
      {objetivo ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
        >
          {objetivo === 'contratante'
            ? textos.cadastro.dicaContratar
            : textos.cadastro.dicaTrampar}
        </Text>
      ) : null}
    </View>
  );
}

function CartaoDeObjetivo({
  texto,
  icone,
  selecionado,
  onPress,
}: {
  texto: string;
  icone: NomeDeIcone;
  selecionado: boolean;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={texto}
      accessibilityState={{ checked: selecionado }}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          flexGrow: 1,
          flexBasis: 140,
          minHeight: 88,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.m - 4,
          padding: espaco.m,
          borderRadius: raio.card,
          borderWidth: selecionado ? 2 : 1.5,
          borderColor: selecionado ? cores.roxo[700] : cores.bordaDeCampo,
          backgroundColor: selecionado
            ? cores.roxo[50]
            : pressed
              ? cores.tinta[50]
              : cores.superficie,
        },
        focado && estiloDeFoco,
      ]}
    >
      <Feather
        name={icone}
        size={24}
        color={selecionado ? cores.roxo[700] : cores.texto}
      />
      <Text
        style={[
          estiloDeTexto('corpo', 'negrito'),
          { flex: 1, color: selecionado ? cores.roxo[700] : cores.texto },
        ]}
      >
        {texto}
      </Text>
      {selecionado ? (
        <Feather name="check-circle" size={20} color={cores.roxo[700]} />
      ) : null}
    </Pressable>
  );
}
