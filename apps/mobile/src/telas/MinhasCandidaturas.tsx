import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Aviso,
  Botao,
  DialogoDeConfirmacao,
  EstadoVazio,
  Motivo,
  SeloDeCandidatura,
  Toast,
} from '../componentes';
import { estiloDeFoco, useFoco } from '../componentes/utilitarios';
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { EstadoDeTela, Rolavel } from './base';
import type {
  MinhaCandidaturaParaExibir,
  PropsDasMinhasCandidaturas,
} from './tipos';

export function MinhasCandidaturas({
  lista,
  semConexao,
  retirando,
  aviso,
  onFecharAviso,
  toast,
  onRetirar,
  onFecharToast,
  onAbrirTrampo,
  onBuscarTrampos,
  onVoltar,
}: PropsDasMinhasCandidaturas) {
  const [pendente, setPendente] = useState<MinhaCandidaturaParaExibir | null>(
    null,
  );
  const vazio = (
    <EstadoVazio
      icone="document-text-outline"
      titulo={textos.minhasCandidaturas.vazio}
      texto={textos.minhasCandidaturas.vazioTexto}
      textoAcao={textos.minhasCandidaturas.buscarTrampos}
      onAcao={onBuscarTrampos}
    />
  );
  return (
    <>
      <Rolavel
        titulo={textos.minhasCandidaturas.titulo}
        onVoltar={onVoltar}
        semConexao={semConexao}
        acima={
          aviso ? (
            <View style={{ padding: espaco[4], paddingBottom: 0 }}>
              <Aviso
                variante="erro"
                texto={aviso}
                textoAcao={
                  onFecharAviso ? textos.candidatura.fecharAviso : undefined
                }
                onAcao={onFecharAviso}
              />
            </View>
          ) : null
        }
      >
        <EstadoDeTela estado={lista} vazio={vazio}>
          {(itens) =>
            itens.length === 0 ? (
              vazio
            ) : (
              <View style={{ gap: espaco[3] }}>
                {itens.map((item) => (
                  <Linha
                    key={item.id}
                    item={item}
                    onAbrir={onAbrirTrampo}
                    onRetirar={onRetirar ? () => setPendente(item) : undefined}
                    retirandoEsta={retirando === item.id}
                    bloqueado={Boolean(retirando) || Boolean(semConexao)}
                    semConexao={semConexao}
                  />
                ))}
              </View>
            )
          }
        </EstadoDeTela>
      </Rolavel>
      <DialogoDeConfirmacao
        visivel={pendente !== null}
        titulo={textos.candidatura.retirarTitulo}
        mensagem={textos.candidatura.retirarTexto}
        textoConfirmar={textos.candidatura.retirar}
        textoCancelar={textos.candidatura.manter}
        destrutivo
        onCancelar={() => setPendente(null)}
        onConfirmar={() => {
          if (pendente) onRetirar?.(pendente.id);
          setPendente(null);
        }}
      />
      <Toast
        visivel={Boolean(toast)}
        mensagem={toast ?? ''}
        onFechar={onFecharToast ?? (() => undefined)}
        rotuloFechar={textos.gerais.toastFechar}
      />
    </>
  );
}

function Linha({
  item,
  onAbrir,
  onRetirar,
  retirandoEsta,
  bloqueado,
  semConexao,
}: {
  item: MinhaCandidaturaParaExibir;
  onAbrir: (trampoId: string) => void;
  onRetirar?: () => void;
  retirandoEsta: boolean;
  bloqueado: boolean;
  semConexao?: boolean;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const titulo =
    item.tituloDoTrampo ?? textos.minhasCandidaturas.trampoIndisponivel;
  const rotulo = [
    titulo,
    textos.gerais.status(textos.selos[item.status].toLowerCase()),
    `${textos.minhasCandidaturas.valorProposto}: ${item.valorPropostoFormatado}`,
    textos.minhasCandidaturas.enviadaEm(item.dataFormatada),
  ].join(', ');
  const mostrarRetirar = Boolean(item.podeRetirar && onRetirar);
  return (
    <View
      style={{
        borderRadius: raio.md,
        borderWidth: 1,
        borderColor: cores.borda,
        backgroundColor: cores.fundo,
        overflow: 'hidden',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={rotulo}
        onPress={() => onAbrir(item.trampoId)}
        onFocus={aoFocar}
        onBlur={aoDesfocar}
        style={({ pressed }) => [
          {
            minHeight: toqueMinimo,
            gap: espaco[2],
            padding: espaco[4],
            backgroundColor: pressed ? cores.superficie : cores.fundo,
          },
          focado && estiloDeFoco,
        ]}
      >
        <Text
          numberOfLines={2}
          style={{
            color: cores.texto,
            fontSize: tipografia.tamanho.tituloDeSeção,
            lineHeight: tipografia.lineHeight.tituloDeSeção,
            fontWeight: tipografia.peso.semibold,
          }}
        >
          {titulo}
        </Text>
        <SeloDeCandidatura status={item.status} />
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            columnGap: espaco[2],
          }}
        >
          <Text
            style={{
              flexShrink: 1,
              color: cores.texto,
              fontSize: tipografia.tamanho.corpo,
              lineHeight: tipografia.lineHeight.corpo,
              fontWeight: tipografia.peso.negrito,
            }}
          >
            {item.valorPropostoFormatado}
          </Text>
          <Text
            style={{
              color: cores.textoSecundario,
              fontSize: tipografia.tamanho.legenda,
              lineHeight: tipografia.lineHeight.legenda,
            }}
          >
            {textos.minhasCandidaturas.enviadaEm(item.dataFormatada)}
          </Text>
        </View>
      </Pressable>
      {mostrarRetirar ? (
        <View
          style={{
            gap: espaco[2],
            paddingHorizontal: espaco[4],
            paddingBottom: espaco[4],
          }}
        >
          <Botao
            texto={textos.candidatura.retirar}
            textoCarregando={textos.candidatura.retirando}
            rotuloDeAcessibilidade={textos.candidatura.retirarDe(
              item.tituloDoTrampo,
            )}
            variante="secundario"
            carregando={retirandoEsta}
            desabilitado={bloqueado && !retirandoEsta}
            onPress={() => onRetirar?.()}
          />
          {semConexao ? (
            <Motivo texto={textos.candidatura.semConexaoMotivo} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
