import { useState } from 'react';
import { View } from 'react-native';
import {
  Botao,
  DialogoDeConfirmacao,
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
      <View style={{ gap: espaco[1] }}>
        <Titulo texto={t.secaoDados} />
        <LinhaDeConfiguracao
          titulo={t.exportar}
          descricao={t.exportarDescricao}
          icone="download-outline"
          desabilitada={semConexao}
          onPress={onExportar}
        />
        <LinhaDeConfiguracao
          titulo={t.excluir}
          descricao={t.excluirDescricao}
          icone="trash-outline"
          destrutiva
          desabilitada={semConexao}
          onPress={onExcluir}
        />
        {semConexao ? <Motivo texto={t.semConexaoMotivo} /> : null}
      </View>
      <View style={{ gap: espaco[1] }}>
        <Titulo texto={t.secaoSobre} />
        <LinhaDeConfiguracao
          titulo={t.politica}
          icone="shield-checkmark-outline"
          onPress={onPolitica}
        />
        <LinhaDeConfiguracao
          titulo={t.termos}
          icone="document-text-outline"
          onPress={onTermos}
        />
      </View>
      <Botao
        texto={t.sair}
        variante="secundario"
        icone="log-out-outline"
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
