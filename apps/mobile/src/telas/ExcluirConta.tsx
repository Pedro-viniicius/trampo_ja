import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';
import {
  Aviso,
  Botao,
  CampoDeTexto,
  DialogoDeConfirmacao,
  Motivo,
} from '../componentes';
import { cores, espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  Cartao,
  FocarPrimeiroErro,
  ListaComMarcadores,
  Paragrafo,
  Rolavel,
  TituloDoCartao,
} from './base';
import type { PropsDeExcluirConta } from './tipos';

export function ExcluirConta({
  senha,
  onMudarSenha,
  excluindo,
  erro,
  erroDaSenha,
  semConexao,
  onExcluir,
  onExportar,
  onCancelar,
}: PropsDeExcluirConta) {
  const t = textos.excluirConta;
  const [confirmando, setConfirmando] = useState(false);
  const refSenha = useRef<ComponentRef<typeof TextInput>>(null);
  const eraExcluindo = useRef(false);

  // O diálogo fecha quando a exclusão termina com falha ou quando chega um erro.
  useEffect(() => {
    if (eraExcluindo.current && !excluindo) setConfirmando(false);
    eraExcluindo.current = excluindo;
  }, [excluindo]);
  useEffect(() => {
    if (erro || erroDaSenha) setConfirmando(false);
  }, [erro, erroDaSenha]);

  const semSenha = senha.length === 0;
  const bloqueado = semSenha || Boolean(semConexao) || excluindo;
  const motivo = semConexao
    ? t.semConexaoMotivo
    : semSenha
      ? t.motivoSenha
      : null;

  return (
    <Rolavel titulo={t.titulo} onVoltar={onCancelar} semConexao={semConexao}>
      <FocarPrimeiroErro campos={[{ ref: refSenha, erro: erroDaSenha }]} />
      <Aviso variante="erro" texto={t.alerta} />
      <Cartao gap={espaco.m - 4}>
        <TituloDoCartao texto={t.oQueAcontece} />
        <ListaComMarcadores
          itens={t.itens}
          icone="x-circle"
          corDoIcone={cores.erro}
        />
        <View>
          <Paragrafo texto={t.dica} secundario />
          <Botao
            texto={t.dicaLink}
            variante="texto"
            tamanho="pequeno"
            larguraCheia={false}
            onPress={onExportar}
          />
        </View>
      </Cartao>
      {erro ? <Aviso variante="erro" texto={erro} /> : null}
      <CampoDeTexto
        rotulo={t.senha}
        tipo="senha"
        secureTextEntry
        valor={senha}
        onChangeText={onMudarSenha}
        ajuda={t.ajudaSenha}
        erro={erroDaSenha}
        inputRef={refSenha}
        rotuloMostrarSenha={t.mostrarSenha}
        rotuloOcultarSenha={t.ocultarSenha}
        returnKeyType="done"
      />
      <View style={{ gap: espaco.s }}>
        <Botao
          texto={t.excluir}
          variante="destrutivo"
          desabilitado={bloqueado}
          carregando={excluindo && !confirmando}
          textoCarregando={t.excluindo}
          onPress={() => setConfirmando(true)}
        />
        {motivo ? <Motivo texto={motivo} /> : null}
        <Botao texto={t.cancelar} variante="texto" onPress={onCancelar} />
      </View>
      <DialogoDeConfirmacao
        visivel={confirmando}
        titulo={t.dialogoTitulo}
        mensagem={t.dialogoTexto}
        textoConfirmar={t.dialogoConfirmar}
        textoCancelar={t.dialogoCancelar}
        destrutivo
        carregando={excluindo}
        textoCarregando={t.excluindo}
        onConfirmar={onExcluir}
        onCancelar={() => {
          if (!excluindo) setConfirmando(false);
        }}
      />
    </Rolavel>
  );
}
