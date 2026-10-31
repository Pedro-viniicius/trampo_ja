import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { AcaoDoAnuncio, PropsDaFolhaDeAcoes } from '../telas/tipos';
import { cores, espaco, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Aviso } from './Aviso';
import { Botao } from './Botao';
import { DialogoDeConfirmacao } from './DialogoDeConfirmacao';
import { FolhaInferior } from './FolhaInferior';
import { Motivo } from './Motivo';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDoBotaoMaisOpcoes = {
  titulo: string;
  onPress: () => void;
};

/** Botão de ícone "Mais opções de {título}" (alvo de 44×44). */
export function BotaoMaisOpcoes({ titulo, onPress }: PropsDoBotaoMaisOpcoes) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={textos.anuncio.maisOpcoes(titulo)}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          width: toqueMinimo,
          height: toqueMinimo,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: toqueMinimo / 2,
          backgroundColor: pressed ? cores.superficie : 'transparent',
        },
        focado && estiloDeFoco,
      ]}
    >
      <Ionicons name="ellipsis-horizontal" size={24} color={cores.texto} />
    </Pressable>
  );
}

type Confirmando = 'encerrar' | 'excluir' | null;

function Linha({
  texto,
  acao,
  onPress,
  icone,
  variante = 'secundario',
}: {
  texto: string;
  acao: AcaoDoAnuncio;
  onPress: () => void;
  icone: 'create-outline' | 'checkmark-done-outline' | 'trash-outline';
  variante?: 'secundario' | 'destrutivo';
}) {
  return (
    <View style={{ gap: espaco[1] }}>
      <Botao
        texto={texto}
        icone={icone}
        variante={variante}
        desabilitado={!acao.disponivel}
        onPress={onPress}
      />
      {!acao.disponivel && acao.motivo ? <Motivo texto={acao.motivo} /> : null}
    </View>
  );
}

/**
 * Folha "Mais opções" do anúncio. Os diálogos de encerrar e excluir ficam aqui:
 * `onEncerrar` e `onExcluir` só são chamados depois da confirmação.
 */
export function FolhaDeAcoesDoAnuncio({
  visivel,
  titulo,
  tipo,
  editar,
  encerrar,
  excluir,
  efeitoDoEncerrar,
  efeitoDoExcluir,
  processando,
  erro,
  atualizando = false,
  onEditar,
  onEncerrar,
  onExcluir,
  onFechar,
}: PropsDaFolhaDeAcoes) {
  const [confirmando, setConfirmando] = useState<Confirmando>(null);
  const anterior = useRef(processando);

  // Fecha o diálogo quando o processamento termina (sucesso ou erro) ou a folha fecha.
  useEffect(() => {
    if (anterior.current !== null && processando === null) {
      setConfirmando(null);
    }
    anterior.current = processando;
  }, [processando]);
  useEffect(() => {
    if (!visivel) setConfirmando(null);
  }, [visivel]);

  const ehTrampo = tipo === 'trampo';
  const ocupado = processando !== null || atualizando;

  return (
    <>
      <FolhaInferior
        visivel={visivel && confirmando === null}
        titulo={textos.anuncio.folhaTitulo(titulo)}
        onFechar={onFechar}
      >
        <View style={{ gap: espaco[3] }}>
          {erro ? <Aviso variante="erro" texto={erro} /> : null}
          <Linha
            texto={textos.anuncio.editar}
            icone="create-outline"
            acao={{
              ...editar,
              disponivel: editar.disponivel && !ocupado,
            }}
            onPress={onEditar}
          />
          {encerrar ? (
            <Linha
              texto={textos.anuncio.encerrarTrampo}
              icone="checkmark-done-outline"
              acao={{
                ...encerrar,
                disponivel: encerrar.disponivel && !ocupado,
              }}
              onPress={() => setConfirmando('encerrar')}
            />
          ) : null}
          <Linha
            texto={
              ehTrampo
                ? textos.anuncio.excluirTrampo
                : textos.anuncio.excluirServico
            }
            icone="trash-outline"
            variante="destrutivo"
            acao={{
              ...excluir,
              disponivel: excluir.disponivel && !ocupado,
            }}
            onPress={() => setConfirmando('excluir')}
          />
          {atualizando ? (
            <Motivo texto={textos.anuncio.folhaAtualizando} />
          ) : null}
        </View>
      </FolhaInferior>
      <DialogoDeConfirmacao
        visivel={visivel && confirmando === 'encerrar'}
        titulo={textos.anuncio.encerrarTitulo}
        mensagem={efeitoDoEncerrar}
        textoConfirmar={textos.anuncio.encerrarConfirmar}
        textoCarregando={textos.anuncio.encerrando}
        textoCancelar={textos.anuncio.cancelar}
        destrutivo
        carregando={processando === 'encerrar'}
        onConfirmar={onEncerrar}
        onCancelar={() => setConfirmando(null)}
      />
      <DialogoDeConfirmacao
        visivel={visivel && confirmando === 'excluir'}
        titulo={
          ehTrampo
            ? textos.anuncio.excluirTrampoTitulo
            : textos.anuncio.excluirServicoTitulo
        }
        mensagem={efeitoDoExcluir}
        textoConfirmar={
          ehTrampo
            ? textos.anuncio.excluirTrampo
            : textos.anuncio.excluirServico
        }
        textoCarregando={textos.anuncio.excluindo}
        textoCancelar={textos.anuncio.cancelar}
        destrutivo
        carregando={processando === 'excluir'}
        onConfirmar={onExcluir}
        onCancelar={() => setConfirmando(null)}
      />
    </>
  );
}
