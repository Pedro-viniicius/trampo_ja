import { type ComponentRef, useRef } from 'react';
import { Text, type TextInput, View } from 'react-native';
import { Aviso, Botao, CampoDeTexto, Motivo } from '../componentes';
import { cores, espaco, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { FocarPrimeiroErro, Paragrafo, Rolavel, Titulo } from './base';
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
      <Titulo texto={t.oQueVem} />
      <View style={{ gap: espaco[2] }}>
        {t.itens.map((item) => (
          <View key={item} style={{ flexDirection: 'row', gap: espaco[2] }}>
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={{
                color: cores.texto,
                fontSize: tipografia.tamanho.corpo,
                lineHeight: tipografia.lineHeight.corpo,
              }}
            >
              {'•'}
            </Text>
            <View style={{ flex: 1 }}>
              <Paragrafo texto={item} />
            </View>
          </View>
        ))}
      </View>
      <Paragrafo texto={t.formato} secundario />
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
      <View style={{ gap: espaco[2] }}>
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
        <Botao texto={t.voltar} variante="secundario" onPress={onVoltar} />
      </View>
    </Rolavel>
  );
}
