import type { ComponentRef } from 'react';
import { useRef, useState } from 'react';
import { ScrollView, type TextInput, View } from 'react-native';
import {
  Aviso,
  Botao,
  CampoDeTexto,
  DialogoDeConfirmacao,
  Esqueleto,
  FolhaInferior,
  Motivo,
  SeloDeCandidatura,
} from '../componentes';
import { espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { useFocarPrimeiroErro } from './base';
import { BotaoDeConversar } from './RodapeDoServico';
import type { FolhaDeCandidatura, PropsDoRodapeDoTrampo } from './tipos';

const LIMITE_DA_MENSAGEM = 2000;
const LIMITE_DO_VALOR = 15;

/** Rodapé do detalhe do trampo (vai no slot `rodape`): botão por situação e folha. O toast vai em `sobreposicao`. */
export function RodapeDoTrampo({
  situacao,
  semConexao,
  folha,
  onCandidatar,
  onVerCandidaturas,
  onConversar,
  estadoDoConversar,
  retirar,
}: PropsDoRodapeDoTrampo) {
  const [confirmando, setConfirmando] = useState(false);
  const retirarVisivel = situacao.tipo === 'candidatado' && retirar;
  return (
    <>
      <View style={{ gap: espaco[2] }}>
        {situacao.tipo === 'carregando' ? (
          <View
            accessible
            accessibilityLabel={textos.gerais.carregando}
            accessibilityState={{ busy: true }}
          >
            <Esqueleto altura={48} />
          </View>
        ) : null}
        {situacao.tipo === 'fechado' ? (
          <>
            <Botao
              texto={textos.detalheTrampo.candidatar}
              desabilitado
              onPress={onCandidatar}
            />
            <Motivo texto={textos.detalheTrampo.fechado} />
          </>
        ) : null}
        {situacao.tipo === 'candidatar' ? (
          <>
            <Botao
              texto={textos.detalheTrampo.candidatar}
              desabilitado={semConexao}
              onPress={onCandidatar}
            />
            {semConexao ? (
              <Motivo texto={textos.candidatar.semConexaoMotivo} />
            ) : null}
          </>
        ) : null}
        {situacao.tipo === 'autor' ? (
          <Botao
            texto={textos.candidatar.verCandidaturas(situacao.quantidade)}
            onPress={onVerCandidaturas}
          />
        ) : null}
        {situacao.tipo === 'candidatado' ? (
          <>
            <SeloDeCandidatura
              status={situacao.status}
              texto={
                situacao.status === 'pendente'
                  ? textos.detalheTrampo.jaCandidatou
                  : undefined
              }
            />
            {onConversar ? (
              <BotaoDeConversar
                estado={estadoDoConversar ?? { abrindo: false, motivo: null }}
                variante="secundario"
                onConversar={onConversar}
              />
            ) : null}
            {situacao.status === 'pendente' && retirar ? (
              <>
                <Botao
                  texto={textos.candidatura.retirar}
                  textoCarregando={textos.candidatura.retirando}
                  variante="texto"
                  carregando={retirar.retirando}
                  desabilitado={Boolean(retirar.motivo)}
                  onPress={() => setConfirmando(true)}
                />
                {retirar.motivo ? <Motivo texto={retirar.motivo} /> : null}
              </>
            ) : null}
          </>
        ) : null}
      </View>
      {retirarVisivel ? (
        <DialogoDeConfirmacao
          visivel={confirmando}
          titulo={textos.candidatura.retirarTitulo}
          mensagem={textos.candidatura.retirarTexto}
          textoConfirmar={textos.candidatura.retirar}
          textoCancelar={textos.candidatura.manter}
          destrutivo
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => {
            setConfirmando(false);
            retirar.onRetirar();
          }}
        />
      ) : null}
      <FolhaDeCandidaturaView folha={folha} semConexao={semConexao} />
    </>
  );
}

function FolhaDeCandidaturaView({
  folha,
  semConexao,
}: {
  folha: FolhaDeCandidatura;
  semConexao?: boolean;
}) {
  const mensagemRef = useRef<ComponentRef<typeof TextInput>>(null);
  const valorRef = useRef<ComponentRef<typeof TextInput>>(null);
  useFocarPrimeiroErro(
    [
      { ref: mensagemRef, erro: folha.erros.mensagem },
      { ref: valorRef, erro: folha.erros.valor },
    ],
    folha.tentativa,
  );

  return (
    <FolhaInferior
      visivel={folha.visivel}
      titulo={textos.candidatar.titulo}
      textoFechar={textos.candidatar.fecharFolha}
      onFechar={folha.onFechar}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: espaco[3] }}
      >
        <Aviso variante="info" texto={textos.candidatar.avisoVisibilidade} />
        <CampoDeTexto
          rotulo={textos.candidatar.mensagem}
          valor={folha.mensagem}
          onChangeText={folha.onMudarMensagem}
          multiline
          limite={LIMITE_DA_MENSAGEM}
          erro={folha.erros.mensagem}
          editable={!folha.enviando}
          inputRef={mensagemRef}
        />
        <CampoDeTexto
          rotulo={textos.candidatar.valor}
          valor={folha.valor}
          onChangeText={folha.onMudarValor}
          tipo="decimal"
          ajuda={textos.gerais.ajudaValor}
          maxLength={LIMITE_DO_VALOR}
          erro={folha.erros.valor}
          editable={!folha.enviando}
          onBlur={folha.onSairDoValor}
          inputRef={valorRef}
        />
        {folha.erros.geral ? (
          <Aviso variante="erro" texto={folha.erros.geral} />
        ) : null}
        {folha.perfilIncompleto ? (
          <>
            <Aviso
              variante="info"
              texto={textos.avisoPerfil.mensagem(folha.perfilIncompleto.falta)}
              textoAcao={textos.avisoPerfil.completar}
              onAcao={folha.onCompletarPerfil}
            />
            <Botao
              texto={textos.avisoPerfil.agoraNao}
              variante="texto"
              onPress={folha.onFechar}
            />
          </>
        ) : (
          <>
            <Botao
              texto={textos.candidatar.enviar}
              textoCarregando={textos.candidatar.enviando}
              carregando={folha.enviando}
              desabilitado={semConexao}
              onPress={folha.onEnviar}
            />
            {semConexao ? (
              <Motivo texto={textos.candidatar.semConexaoMotivo} />
            ) : null}
          </>
        )}
      </ScrollView>
    </FolhaInferior>
  );
}
