import { useState } from 'react';
import { View } from 'react-native';
import {
  AbasSegmentadas,
  ALTURA_DA_BARRA_DE_ABAS,
  Aviso,
  CartaoDeMinhaCandidatura,
  DialogoDeConfirmacao,
  EstadoVazio,
  MARGEM_DA_BARRA_DE_ABAS,
  Toast,
} from '../componentes';
import { espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Carregando, ErroDoBloco, EstadoDeTela, Rolavel } from './base';
import type {
  MinhaCandidaturaParaExibir,
  PropsDasMinhasCandidaturas,
  SegmentoDeMeusTrampos,
} from './tipos';

/**
 * CA78: cada candidatura cai em exatamente um segmento. Pendente = Em
 * análise; recusada, ou aceita com trampo encerrado = Encerrados; aceita com
 * o trampo em andamento (ou sem status conhecido) = Confirmados.
 */
export function segmentoDaCandidatura(
  item: Pick<MinhaCandidaturaParaExibir, 'status' | 'statusDoTrampo'>,
): SegmentoDeMeusTrampos {
  switch (item.status) {
    case 'pendente':
      return 'analise';
    case 'recusada':
      return 'encerrados';
    case 'aceita':
      return item.statusDoTrampo === 'encerrado' ? 'encerrados' : 'confirmados';
  }
}

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
  segmentada = false,
  segmentoInicial = 'analise',
  onMensagem,
  onAvaliar,
}: PropsDasMinhasCandidaturas) {
  const [pendente, setPendente] = useState<MinhaCandidaturaParaExibir | null>(
    null,
  );
  const [segmento, setSegmento] =
    useState<SegmentoDeMeusTrampos>(segmentoInicial);
  const vazio = (
    <EstadoVazio
      icone="file-text"
      titulo={textos.minhasCandidaturas.vazio}
      texto={textos.minhasCandidaturas.vazioTexto}
      textoAcao={textos.minhasCandidaturas.buscarTrampos}
      onAcao={onBuscarTrampos}
    />
  );
  const dialogoEToast = (
    <>
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
        // Na aba (segmentada, sem voltar), o toast sobe acima da barra flutuante.
        deslocamentoInferior={
          segmentada && !onVoltar
            ? ALTURA_DA_BARRA_DE_ABAS + MARGEM_DA_BARRA_DE_ABAS
            : 0
        }
      />
    </>
  );
  const avisoNoTopo = aviso ? (
    <View style={{ paddingHorizontal: espaco.l, paddingTop: espaco.s }}>
      <Aviso
        variante="erro"
        texto={aviso}
        textoAcao={onFecharAviso ? textos.candidatura.fecharAviso : undefined}
        onAcao={onFecharAviso}
      />
    </View>
  ) : null;

  if (segmentada) {
    const itens = lista.situacao === 'ok' ? lista.dados : ([] as const);
    const doSegmento = itens.filter(
      (item) => segmentoDaCandidatura(item) === segmento,
    );
    const confirmados = itens.filter(
      (item) => segmentoDaCandidatura(item) === 'confirmados',
    ).length;
    const prontaOuVazia = lista.situacao === 'ok' || lista.situacao === 'vazio';
    return (
      <>
        <Rolavel
          titulo={textos.meusTrampos.titulo}
          subtitulo={textos.meusTrampos.subtitulo}
          raiz={!onVoltar}
          onVoltar={onVoltar}
          comBarraDeAbas={!onVoltar}
          semConexao={semConexao}
          acima={avisoNoTopo}
        >
          <AbasSegmentadas
            rotulo={textos.meusTrampos.titulo}
            itens={[
              { chave: 'analise', rotulo: textos.meusTrampos.abaAnalise },
              {
                chave: 'confirmados',
                rotulo: textos.meusTrampos.abaConfirmados,
                ...(prontaOuVazia && { contador: confirmados }),
              },
              { chave: 'encerrados', rotulo: textos.meusTrampos.abaEncerrados },
            ]}
            selecionada={segmento}
            onSelecionar={setSegmento}
          />
          {prontaOuVazia ? (
            doSegmento.length === 0 ? (
              <VazioDoSegmento
                segmento={segmento}
                onBuscarTrampos={onBuscarTrampos}
              />
            ) : (
              <View style={{ gap: espaco.m }}>
                {doSegmento.map((item) => (
                  <CartaoDeMinhaCandidatura
                    key={item.id}
                    titulo={item.tituloDoTrampo}
                    autor={item.autor}
                    valorFormatado={item.valorPropostoFormatado}
                    prazoFormatado={item.prazoFormatado}
                    status={item.status}
                    onPress={() => onAbrirTrampo(item.trampoId)}
                    onMensagem={onMensagem ? () => onMensagem(item) : undefined}
                    notaDada={
                      // CA96: só em Encerrados, na candidatura aceita.
                      segmento === 'encerrados' &&
                      item.status === 'aceita' &&
                      item.statusDoTrampo === 'encerrado'
                        ? item.notaDada
                        : undefined
                    }
                    onAvaliar={onAvaliar ? () => onAvaliar(item) : undefined}
                    onRetirar={
                      item.podeRetirar && onRetirar
                        ? () => {
                            if (!retirando) setPendente(item);
                          }
                        : undefined
                    }
                    retirando={retirando === item.id}
                    retirarDesabilitado={
                      Boolean(retirando) && retirando !== item.id
                    }
                    motivoDoRetirar={
                      semConexao ? textos.candidatura.semConexaoMotivo : null
                    }
                  />
                ))}
              </View>
            )
          ) : lista.situacao === 'erro' ? (
            <ErroDoBloco
              mensagem={lista.mensagem}
              onTentarDeNovo={lista.onTentarDeNovo}
            />
          ) : (
            <Carregando cartoes={3} />
          )}
        </Rolavel>
        {dialogoEToast}
      </>
    );
  }

  return (
    <>
      <Rolavel
        titulo={textos.minhasCandidaturas.titulo}
        onVoltar={onVoltar}
        semConexao={semConexao}
        acima={avisoNoTopo}
      >
        <EstadoDeTela estado={lista} vazio={vazio}>
          {(itens) =>
            itens.length === 0 ? (
              vazio
            ) : (
              <View style={{ gap: espaco.m }}>
                {itens.map((item) => (
                  <CartaoDeMinhaCandidatura
                    key={item.id}
                    titulo={item.tituloDoTrampo}
                    autor={item.autor}
                    valorFormatado={item.valorPropostoFormatado}
                    prazoFormatado={item.prazoFormatado}
                    enviadaEm={textos.minhasCandidaturas.enviadaEm(
                      item.dataFormatada,
                    )}
                    status={item.status}
                    onPress={() => onAbrirTrampo(item.trampoId)}
                    onRetirar={
                      item.podeRetirar && onRetirar
                        ? () => {
                            if (!retirando) setPendente(item);
                          }
                        : undefined
                    }
                    retirando={retirando === item.id}
                    retirarDesabilitado={
                      Boolean(retirando) && retirando !== item.id
                    }
                    motivoDoRetirar={
                      semConexao ? textos.candidatura.semConexaoMotivo : null
                    }
                  />
                ))}
              </View>
            )
          }
        </EstadoDeTela>
      </Rolavel>
      {dialogoEToast}
    </>
  );
}

/** Vazio de cada segmento (spec, quadro 07). */
function VazioDoSegmento({
  segmento,
  onBuscarTrampos,
}: {
  segmento: SegmentoDeMeusTrampos;
  onBuscarTrampos: () => void;
}) {
  switch (segmento) {
    case 'analise':
      return (
        <EstadoVazio
          icone="clock"
          titulo={textos.meusTrampos.vazioAnalise}
          textoAcao={textos.meusTrampos.verTrampos}
          onAcao={onBuscarTrampos}
        />
      );
    case 'confirmados':
      return (
        <EstadoVazio
          icone="check-circle"
          titulo={textos.meusTrampos.vazioConfirmados}
        />
      );
    case 'encerrados':
      return (
        <EstadoVazio
          icone="archive"
          titulo={textos.meusTrampos.vazioEncerrados}
        />
      );
  }
}
