import { type ComponentRef, useRef } from 'react';
import { type TextInput, View } from 'react-native';
import { Aviso, Botao, CampoDeTexto, Motivo } from '../componentes';
import { espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  Cartao,
  FocarPrimeiroErro,
  ListaComMarcadores,
  Paragrafo,
  Rolavel,
  TituloDoCartao,
} from './base';
import type { PropsDeExportarDados } from './tipos';

export function ExportarDados({
  situacao,
  senha,
  onMudarSenha,
  erro,
  erroDaSenha,
  semConexao,
  onGerar,
  onVoltar,
}: PropsDeExportarDados) {
  const t = textos.exportarDados;
  const refSenha = useRef<ComponentRef<typeof TextInput>>(null);
  const gerando = situacao === 'gerando';
  const semSenha = senha.length === 0;
  const bloqueado = semSenha || Boolean(semConexao) || gerando;
  const motivo = semConexao
    ? t.semConexaoMotivo
    : semSenha
      ? t.motivoSenha
      : null;

  return (
    <Rolavel titulo={t.titulo} onVoltar={onVoltar} semConexao={semConexao}>
      <FocarPrimeiroErro campos={[{ ref: refSenha, erro: erroDaSenha }]} />
      <Paragrafo texto={t.intro} />
      <Cartao gap={espaco.m - 4}>
        <TituloDoCartao texto={t.oQueVem} />
        <ListaComMarcadores itens={t.itens} />
        <Paragrafo texto={t.formato} secundario />
      </Cartao>
      <Aviso variante="info" texto={t.aviso} />
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
        editable={!gerando}
        returnKeyType="done"
      />
      <View style={{ gap: espaco.s }}>
        {situacao === 'gerado' ? (
          <Aviso variante="sucesso" texto={t.gerado} />
        ) : null}
        {erro ? <Aviso variante="erro" texto={erro} /> : null}
        <Botao
          texto={situacao === 'gerado' ? t.gerarDeNovo : t.gerar}
          carregando={gerando}
          textoCarregando={t.gerando}
          desabilitado={bloqueado}
          onPress={onGerar}
        />
        {motivo ? <Motivo texto={motivo} /> : null}
        <Botao texto={t.voltar} variante="contorno" onPress={onVoltar} />
      </View>
    </Rolavel>
  );
}
