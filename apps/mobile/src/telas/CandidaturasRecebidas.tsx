import { type ComponentRef, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  type ScrollView,
  Text,
  View,
} from 'react-native';
import {
  Aviso,
  CartaoDeCandidatura,
  DialogoDeConfirmacao,
  EstadoVazio,
  Selo,
  Toast,
} from '../componentes';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { EstadoDeTela, NaoEncontrado, Rolavel, rolarAteOAlvo } from './base';
import type { PropsDasCandidaturasRecebidas } from './tipos';

export function CandidaturasRecebidas({
  trampo,
  lista,
  aceitando,
  erroDoAceite,
  abrindoConversaCom,
  erroDaConversa,
  motivoDaConversa,
  toast,
  semConexao,
  onAceitar,
  onAbrirPerfil,
  onFecharToast,
  onVoltar,
  onConversar,
}: PropsDasCandidaturasRecebidas) {
  const [pendente, setPendente] = useState<{
    id: string;
    nome: string | null;
  } | null>(null);

  const rolagem = useRef<ComponentRef<typeof ScrollView>>(null);
  const refDoErro = useRef<View>(null);

  // Erro do aceite aparece no topo: rola até ele e anuncia (iOS ignora liveRegion).
  useEffect(() => {
    if (!erroDoAceite) return;
    rolarAteOAlvo(rolagem, refDoErro.current);
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(erroDoAceite);
    }
  }, [erroDoAceite]);

  const motivoDoAceite = semConexao
    ? textos.candidaturasRecebidas.semConexaoMotivo
    : undefined;

  return (
    <>
      <Rolavel
        scrollRef={rolagem}
        titulo={textos.candidaturasRecebidas.titulo}
        onVoltar={onVoltar}
        semConexao={semConexao}
      >
        <EstadoDeTela
          estado={trampo}
          vazio={<NaoEncontrado onVoltar={onVoltar} />}
        >
          {(dados) => (
            <View
              style={[
                {
                  gap: espaco.s,
                  padding: espaco.m,
                  borderRadius: raio.card,
                  backgroundColor: cores.superficie,
                },
                sombra.sm,
              ]}
            >
              <Selo
                variante={dados.status}
                texto={
                  dados.status === 'aberto'
                    ? textos.selos.aberto
                    : dados.status === 'encerrado'
                      ? textos.selos.encerrado
                      : textos.selos.emAndamento
                }
              />
              <Text
                accessibilityRole="header"
                style={[estiloDeTexto('h2'), { color: cores.texto }]}
              >
                {dados.titulo}
              </Text>
              {lista.situacao === 'ok' && lista.dados.length > 0 ? (
                <Text
                  style={[
                    estiloDeTexto('legenda'),
                    { color: cores.textoSecundario },
                  ]}
                >
                  {textos.candidatos.subtitulo(lista.dados.length)}
                </Text>
              ) : null}
              {dados.status !== 'aberto' ? (
                <Aviso
                  variante="info"
                  texto={
                    dados.status === 'encerrado'
                      ? textos.candidaturasRecebidas.trampoEncerrado
                      : textos.candidaturasRecebidas.trampoEmAndamento
                  }
                />
              ) : null}
            </View>
          )}
        </EstadoDeTela>
        {erroDoAceite ? (
          <View ref={refDoErro} collapsable={false}>
            <Aviso variante="erro" texto={erroDoAceite} />
          </View>
        ) : null}
        {erroDaConversa ? (
          <Aviso variante="erro" texto={erroDaConversa} />
        ) : null}
        <EstadoDeTela
          estado={lista}
          vazio={
            <EstadoVazio
              icone="users"
              titulo={textos.candidaturasRecebidas.vazio}
              texto={textos.candidaturasRecebidas.vazioTexto}
            />
          }
        >
          {(candidaturas) => (
            <View style={{ gap: espaco.m }}>
              {candidaturas.length === 0 ? (
                <EstadoVazio
                  icone="users"
                  titulo={textos.candidaturasRecebidas.vazio}
                  texto={textos.candidaturasRecebidas.vazioTexto}
                />
              ) : (
                candidaturas.map((item) => (
                  <CartaoDeCandidatura
                    key={item.id}
                    nome={item.nome}
                    valorFormatado={item.valorPropostoFormatado}
                    mensagem={item.mensagem}
                    dataFormatada={item.dataFormatada}
                    status={item.status}
                    podeAceitar={item.podeAceitar}
                    aceitando={aceitando === item.id}
                    aceiteDesabilitado={aceitando !== null || !!semConexao}
                    motivoDoAceite={motivoDoAceite}
                    onAceitar={() =>
                      setPendente({ id: item.id, nome: item.nome })
                    }
                    onVerPerfil={() => onAbrirPerfil(item.contaId)}
                    onConversar={
                      onConversar ? () => onConversar(item.contaId) : undefined
                    }
                    abrindoConversa={abrindoConversaCom === item.contaId}
                    motivoDaConversa={motivoDaConversa?.[item.contaId] ?? null}
                  />
                ))
              )}
            </View>
          )}
        </EstadoDeTela>
      </Rolavel>
      <DialogoDeConfirmacao
        visivel={pendente !== null}
        titulo={textos.candidaturasRecebidas.confirmarTitulo(
          pendente?.nome ?? null,
        )}
        mensagem={textos.candidaturasRecebidas.confirmarTexto}
        textoConfirmar={textos.candidaturasRecebidas.confirmar}
        textoCancelar={textos.candidaturasRecebidas.cancelar}
        onCancelar={() => setPendente(null)}
        onConfirmar={() => {
          if (pendente) onAceitar(pendente.id);
          setPendente(null);
        }}
      />
      <Toast
        visivel={toast !== null}
        mensagem={toast ?? ''}
        onFechar={onFecharToast}
        rotuloFechar={textos.gerais.toastFechar}
      />
    </>
  );
}
