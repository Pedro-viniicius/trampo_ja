import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Avatar } from './Avatar';
import { Botao } from './Botao';
import {
  SeloDeCandidatura,
  type StatusDeCandidatura,
} from './CartaoDeCandidatura';
import { Motivo } from './Motivo';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDoCartaoDeMinhaCandidatura = {
  /** `null`: "Trampo indisponível". */
  titulo: string | null;
  /** Quem publicou, quando houver. */
  autor?: string | null;
  /** Ex.: "R$ 150,00" (valor proposto). */
  valorFormatado: string;
  /** Prazo do trampo; sem ele, a linha some. */
  prazoFormatado?: string | null;
  /** Ex.: "Enviada em 20/10/2026"; sem ele, a linha some. */
  enviadaEm?: string | null;
  status: StatusDeCandidatura;
  /** Toque no cartão: abre o trampo. */
  onPress?: () => void;
  /** "Mensagem": só na aceita. */
  onMensagem?: () => void;
  /** "Retirar candidatura": só na pendente. */
  onRetirar?: () => void;
  retirando?: boolean;
  /**
   * "Retirar" desabilitado (ex.: outra retirada no ar ou sem conexão). Sem
   * isso, um `motivoDoRetirar` também desabilita.
   */
  retirarDesabilitado?: boolean;
  /** Por que "Retirar" está desabilitado (ex.: sem conexão), em texto. */
  motivoDoRetirar?: string | null;
};

/** Cartão de Meus trampos (quadro 07): status, valor, trampo e ações da candidatura. */
export function CartaoDeMinhaCandidatura({
  titulo,
  autor,
  valorFormatado,
  prazoFormatado,
  enviadaEm,
  status,
  onPress,
  onMensagem,
  onRetirar,
  retirando = false,
  retirarDesabilitado = false,
  motivoDoRetirar = null,
}: PropsDoCartaoDeMinhaCandidatura) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const exibido = titulo ?? textos.minhasCandidaturas.trampoIndisponivel;
  const rotulo = [
    exibido,
    autor,
    textos.selos[status],
    `${textos.minhasCandidaturas.valorProposto}: ${valorFormatado}`,
    prazoFormatado,
    enviadaEm,
  ]
    .filter(Boolean)
    .join(', ');

  const corpo = (
    <View style={{ gap: espaco.m - 4 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: espaco.s,
        }}
      >
        <SeloDeCandidatura status={status} />
        <Text style={[estiloDeTexto('h3'), { color: cores.primaria }]}>
          {valorFormatado}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.m - 4,
        }}
      >
        <Avatar nome={autor ?? exibido} neutro={titulo === null} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={2}
            style={[estiloDeTexto('h3'), { color: cores.texto }]}
          >
            {exibido}
          </Text>
          {autor ? (
            <Text
              numberOfLines={1}
              style={[
                estiloDeTexto('legenda'),
                { color: cores.textoSecundario },
              ]}
            >
              {textos.meusTrampos.publicadoPor(autor)}
            </Text>
          ) : null}
        </View>
      </View>
      {prazoFormatado ? (
        <LinhaComIcone icone="calendar" texto={prazoFormatado} />
      ) : null}
      {enviadaEm ? <LinhaComIcone icone="send" texto={enviadaEm} /> : null}
    </View>
  );

  return (
    <View
      style={[
        {
          gap: espaco.m - 4,
          padding: espaco.m,
          borderRadius: raio.card,
          backgroundColor: cores.superficie,
        },
        sombra.sm,
        focado && estiloDeFoco,
      ]}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rotulo}
          onPress={onPress}
          onFocus={aoFocar}
          onBlur={aoDesfocar}
        >
          {corpo}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={rotulo}>
          {corpo}
        </View>
      )}
      {(status === 'aceita' && onMensagem) ||
      (status === 'pendente' && onRetirar) ? (
        <View style={{ gap: espaco.s }}>
          {status === 'aceita' && onMensagem ? (
            <Botao
              texto={textos.meusTrampos.mensagem}
              rotuloDeAcessibilidade={textos.meusTrampos.mensagemPara(
                autor ?? null,
              )}
              icone="message-circle"
              variante="tonal"
              onPress={onMensagem}
            />
          ) : null}
          {status === 'pendente' && onRetirar ? (
            <>
              <BotaoRetirar
                titulo={titulo}
                retirando={retirando}
                desabilitado={retirarDesabilitado || Boolean(motivoDoRetirar)}
                onPress={onRetirar}
              />
              {motivoDoRetirar ? <Motivo texto={motivoDoRetirar} /> : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LinhaComIcone({
  icone,
  texto,
}: {
  icone: 'calendar' | 'send';
  texto: string;
}) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.xs }}
    >
      <Feather name={icone} size={14} color={cores.textoSecundario} />
      <Text
        style={[
          estiloDeTexto('legenda'),
          { flexShrink: 1, color: cores.textoSecundario },
        ]}
      >
        {texto}
      </Text>
    </View>
  );
}

/** "Retirar candidatura" como botão de texto em vermelho (ação sem volta, com diálogo). */
function BotaoRetirar({
  titulo,
  retirando,
  desabilitado,
  onPress,
}: {
  titulo: string | null;
  retirando: boolean;
  desabilitado: boolean;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const bloqueado = retirando || desabilitado;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        retirando
          ? textos.candidatura.retirando
          : textos.candidatura.retirarDe(titulo)
      }
      accessibilityState={{ disabled: bloqueado, busy: retirando }}
      disabled={bloqueado}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: raio.pill,
          backgroundColor: pressed ? cores.feedback.erro.fundo : 'transparent',
        },
        focado && estiloDeFoco,
      ]}
    >
      <Text
        style={[
          estiloDeTexto('botao'),
          { color: bloqueado ? cores.tinta[500] : cores.feedback.erro.texto },
        ]}
      >
        {retirando ? textos.candidatura.retirando : textos.candidatura.retirar}
      </Text>
    </Pressable>
  );
}
