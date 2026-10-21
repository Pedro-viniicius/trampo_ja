import { useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar, Aviso, Botao, DialogoDeConfirmacao } from '../componentes';
import { cores, espaco, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  EstadoDeTela,
  Etiqueta,
  NaoEncontrado,
  Paragrafo,
  Rolavel,
  Titulo,
} from './base';
import type { PropsDoPerfil } from './tipos';

export function Perfil({
  proprio,
  estado,
  perfilIncompleto,
  semConexao,
  onEditar,
  onSair,
  onVoltar,
  onMinhasCandidaturas,
  onMeusTrampos,
  onMeusServicos,
}: PropsDoPerfil) {
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  return (
    <Rolavel
      titulo={textos.perfil.titulo}
      onVoltar={onVoltar}
      semConexao={semConexao}
    >
      <EstadoDeTela
        estado={estado}
        vazio={<NaoEncontrado onVoltar={onVoltar} />}
      >
        {(perfil) => (
          <>
            {proprio && perfilIncompleto ? (
              <Aviso
                variante="info"
                texto={textos.perfil.avisoIncompleto(perfilIncompleto.falta)}
                textoAcao={textos.perfil.completar}
                onAcao={onEditar}
              />
            ) : null}
            <View style={{ alignItems: 'center', gap: espaco[2] }}>
              <Avatar nome={perfil.nome} tamanho={80} />
              <Text
                accessibilityRole="header"
                style={{
                  color: cores.texto,
                  fontSize: tipografia.tamanho.tituloDeTela,
                  lineHeight: tipografia.lineHeight.tituloDeTela,
                  fontWeight: tipografia.peso.negrito,
                  textAlign: 'center',
                }}
              >
                {perfil.nome}
              </Text>
              <Paragrafo texto={perfil.cidade} secundario />
            </View>
            <Titulo texto={textos.perfil.sobre} />
            <Paragrafo
              texto={perfil.descricao?.trim() || textos.perfil.semDescricao}
              secundario={!perfil.descricao?.trim()}
            />
            <Titulo texto={textos.perfil.habilidades} />
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco[2] }}
            >
              {perfil.habilidades.map((habilidade) => (
                <Etiqueta key={habilidade} texto={habilidade} />
              ))}
            </View>
            {proprio ? (
              <View style={{ gap: espaco[2], marginTop: espaco[2] }}>
                {onEditar ? (
                  <Botao
                    texto={textos.perfil.editar}
                    icone="create-outline"
                    onPress={onEditar}
                  />
                ) : null}
                {onMinhasCandidaturas ? (
                  <Botao
                    texto={textos.perfil.minhasCandidaturas}
                    variante="secundario"
                    onPress={onMinhasCandidaturas}
                  />
                ) : null}
                {onMeusTrampos ? (
                  <Botao
                    texto={textos.perfil.meusTrampos}
                    variante="secundario"
                    onPress={onMeusTrampos}
                  />
                ) : null}
                {onMeusServicos ? (
                  <Botao
                    texto={textos.perfil.meusServicos}
                    variante="secundario"
                    onPress={onMeusServicos}
                  />
                ) : null}
                {onSair ? (
                  <Botao
                    texto={textos.perfil.sair}
                    variante="texto"
                    icone="log-out-outline"
                    onPress={() => setConfirmandoSaida(true)}
                  />
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </EstadoDeTela>
      <DialogoDeConfirmacao
        visivel={confirmandoSaida}
        titulo={textos.perfil.sairTitulo}
        textoConfirmar={textos.perfil.sairConfirmar}
        textoCancelar={textos.perfil.sairCancelar}
        destrutivo
        onConfirmar={() => {
          setConfirmandoSaida(false);
          onSair?.();
        }}
        onCancelar={() => setConfirmandoSaida(false)}
      />
    </Rolavel>
  );
}
