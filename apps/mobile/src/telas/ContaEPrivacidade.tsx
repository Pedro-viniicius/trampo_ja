import { useState } from 'react';
import { View } from 'react-native';
import {
  Botao,
  DialogoDeConfirmacao,
  GrupoDeConfiguracao,
  LinhaDeConfiguracao,
  Motivo,
} from '../componentes';
import { espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Rolavel, Titulo } from './base';
import type { PropsDeContaEPrivacidade } from './tipos';

export function ContaEPrivacidade({
  onExportar,
  onExcluir,
  onPolitica,
  onTermos,
  onSair,
  onVoltar,
  semConexao,
}: PropsDeContaEPrivacidade) {
  const t = textos.contaEPrivacidade;
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  return (
    <Rolavel titulo={t.titulo} onVoltar={onVoltar} semConexao={semConexao}>
      <View style={{ gap: espaco.s }}>
        <Titulo texto={t.secaoDados} />
        <GrupoDeConfiguracao>
          <LinhaDeConfiguracao
            titulo={t.exportar}
            descricao={t.exportarDescricao}
            icone="download"
            desabilitada={semConexao}
            onPress={onExportar}
          />
          <LinhaDeConfiguracao
            titulo={t.excluir}
            descricao={t.excluirDescricao}
            icone="trash-2"
            destrutiva
            desabilitada={semConexao}
            onPress={onExcluir}
          />
        </GrupoDeConfiguracao>
        {semConexao ? <Motivo texto={t.semConexaoMotivo} /> : null}
      </View>
      <View style={{ gap: espaco.s }}>
        <Titulo texto={t.secaoSobre} />
        <GrupoDeConfiguracao>
          <LinhaDeConfiguracao
            titulo={t.politica}
            icone="shield"
            tom="neutro"
            onPress={onPolitica}
          />
          <LinhaDeConfiguracao
            titulo={t.termos}
            icone="file-text"
            tom="neutro"
            onPress={onTermos}
          />
        </GrupoDeConfiguracao>
      </View>
      <Botao
        texto={t.sair}
        variante="secundario"
        icone="log-out"
        onPress={() => setConfirmandoSaida(true)}
      />
      <DialogoDeConfirmacao
        visivel={confirmandoSaida}
        titulo={textos.perfil.sairTitulo}
        textoConfirmar={textos.perfil.sairConfirmar}
        textoCancelar={textos.perfil.sairCancelar}
        destrutivo
        onConfirmar={() => {
          setConfirmandoSaida(false);
          onSair();
        }}
        onCancelar={() => setConfirmandoSaida(false)}
      />
    </Rolavel>
  );
}
