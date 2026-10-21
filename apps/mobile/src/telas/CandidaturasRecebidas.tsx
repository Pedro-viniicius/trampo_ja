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
import { cores, espaco, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { EstadoDeTela, NaoEncontrado, Rolavel, rolarAteOAlvo } from './base';
import type { PropsDasCandidaturasRecebidas } from './tipos';

export function CandidaturasRecebidas({
  trampo,
  lista,
  aceitando,
  erroDoAceite,
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
            <View style={{ gap: espaco[2] }}>
              <Selo
                variante={dados.status}
                texto={
                  dados.status === 'aberto'
                    ? textos.selos.aberto
                    : textos.selos.emAndamento
                }
              />
              <Text
                accessibilityRole="header"
                style={{
                  color: cores.texto,
                  fontSize: tipografia.tamanho.tituloDeSeção,
                  lineHeight: tipografia.lineHeight.tituloDeSeção,
                  fontWeight: tipografia.peso.semibold,
                }}
              >
                {dados.titulo}
              </Text>
              {dados.status !== 'aberto' ? (
                <Aviso
                  variante="info"
                  texto={textos.candidaturasRecebidas.trampoEmAndamento}
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
        <EstadoDeTela
          estado={lista}
          vazio={
            <EstadoVazio
              icone="people-outline"
              titulo={textos.candidaturasRecebidas.vazio}
              texto={textos.candidaturasRecebidas.vazioTexto}
            />
          }
        >
          {(candidaturas) => (
            <View style={{ gap: espaco[3] }}>
              {candidaturas.length === 0 ? (
                <EstadoVazio
                  icone="people-outline"
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
                      onConversar && item.status === 'aceita'
                        ? () => onConversar(item.contaId)
                        : undefined
                    }
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
