import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Avatar } from './Avatar';
import { Botao } from './Botao';
import { Estrelas } from './Estrelas';
import { Motivo } from './Motivo';
import { Selo, type VarianteDoSelo } from './Selo';
import { estiloDeFoco, useFoco } from './utilitarios';

export type StatusDeCandidatura = 'pendente' | 'aceita' | 'recusada';

const LINHAS_DA_MENSAGEM = 3;

export type PropsDoSeloDeCandidatura = {
  status: StatusDeCandidatura;
  /** Troca o texto do selo (ex.: "Candidatura enviada" para pendente no rodapé do trampo). */
  texto?: string;
};

/** Selo de uma candidatura: a variante tem o mesmo nome do status. */
export function SeloDeCandidatura({ status, texto }: PropsDoSeloDeCandidatura) {
  const variante: VarianteDoSelo = status;
  return <Selo variante={variante} texto={texto ?? textos.selos[status]} />;
}

export type PropsDoCartaoDeCandidatura = {
  /** `null`: "Perfil indisponível". */
  nome: string | null;
  /** Ex.: "R$ 150,00". */
  valorFormatado: string;
  mensagem: string;
  dataFormatada: string;
  status: StatusDeCandidatura;
  podeAceitar: boolean;
  /** Esta candidatura está sendo aceita agora. */
  aceitando?: boolean;
  /** Outra candidatura está em aceite: todos os "Aceitar" ficam desabilitados. */
  aceiteDesabilitado?: boolean;
  /** Por que o "Aceitar" está desabilitado (ex.: sem conexão); aparece abaixo do botão. */
  motivoDoAceite?: string;
  onAceitar: () => void;
  onVerPerfil: () => void;
  /** Só aparece se for passado. */
  onConversar?: () => void;
  /** Abertura da conversa em andamento: "Conversar" desabilitado, com "Abrindo…". */
  abrindoConversa?: boolean;
  /** Por que o "Conversar" está desabilitado; aparece abaixo do botão. */
  motivoDaConversa?: string | null;
  /** V2b (CA97): nota de quem se candidatou; sem avaliações, não aparece. */
  nota?: { media: number; total: number } | null;
};

export function CartaoDeCandidatura({
  nome,
  valorFormatado,
  mensagem,
  dataFormatada,
  status,
  podeAceitar,
  aceitando = false,
  aceiteDesabilitado = false,
  motivoDoAceite,
  onAceitar,
  onVerPerfil,
  onConversar,
  abrindoConversa = false,
  motivoDaConversa = null,
  nota,
}: PropsDoCartaoDeCandidatura) {
  const [linhas, setLinhas] = useState<number | null>(null);
  const [expandida, setExpandida] = useState(false);
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const exibido = nome ?? textos.candidaturasRecebidas.perfilIndisponivel;
  const longa = linhas !== null && linhas > LINHAS_DA_MENSAGEM;

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
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.m - 4,
        }}
      >
        <Avatar nome={exibido} neutro={nome === null} />
        <View style={{ flex: 1, gap: espaco.xs }}>
          <Text
            numberOfLines={2}
            style={[estiloDeTexto('h3'), { color: cores.texto }]}
          >
            {exibido}
          </Text>
          {nota && nota.total > 0 ? (
            <Estrelas media={nota.media} total={nota.total} />
          ) : null}
          <SeloDeCandidatura status={status} />
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          columnGap: espaco.s,
        }}
      >
        <Text
          accessibilityLabel={`${textos.candidaturasRecebidas.valorProposto}: ${valorFormatado}`}
          style={[
            estiloDeTexto('h3'),
            { flexShrink: 1, color: cores.primaria },
          ]}
        >
          {valorFormatado}
        </Text>
        <Text
          style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
        >
          {textos.candidaturasRecebidas.enviadaEm(dataFormatada)}
        </Text>
      </View>
      <View style={{ gap: espaco.xs }}>
        <Text
          numberOfLines={longa && !expandida ? LINHAS_DA_MENSAGEM : undefined}
          onTextLayout={(evento) => {
            if (linhas === null) setLinhas(evento.nativeEvent.lines.length);
          }}
          style={[estiloDeTexto('corpo'), { color: cores.texto }]}
        >
          {mensagem}
        </Text>
        {longa ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              expandida
                ? textos.detalheTrampo.lerMenos
                : textos.detalheTrampo.lerMais
            }
            accessibilityState={{ expanded: expandida }}
            onPress={() => setExpandida((valor) => !valor)}
            onFocus={aoFocar}
            onBlur={aoDesfocar}
            style={[
              {
                minHeight: toqueMinimo,
                justifyContent: 'center',
                alignSelf: 'flex-start',
              },
              focado && estiloDeFoco,
            ]}
          >
            <Text
              style={[
                estiloDeTexto('corpo', 'negrito'),
                { color: cores.primaria, textDecorationLine: 'underline' },
              ]}
            >
              {expandida
                ? textos.detalheTrampo.lerMenos
                : textos.detalheTrampo.lerMais}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ gap: espaco.s }}>
        {podeAceitar ? (
          <Botao
            texto={textos.candidaturasRecebidas.aceitar}
            rotuloDeAcessibilidade={textos.candidaturasRecebidas.aceitarDe(
              nome,
            )}
            textoCarregando={textos.candidaturasRecebidas.aceitando}
            carregando={aceitando}
            desabilitado={aceiteDesabilitado && !aceitando}
            onPress={onAceitar}
          />
        ) : null}
        {podeAceitar && aceiteDesabilitado && !aceitando && motivoDoAceite ? (
          <Motivo texto={motivoDoAceite} />
        ) : null}
        <Botao
          texto={textos.candidaturasRecebidas.verPerfil(nome)}
          variante="contorno"
          onPress={onVerPerfil}
        />
        {onConversar ? (
          <Botao
            texto={textos.candidaturasRecebidas.conversar}
            rotuloDeAcessibilidade={textos.candidaturasRecebidas.conversarCom(
              nome,
            )}
            variante="tonal"
            desabilitado={!!motivoDaConversa}
            accessibilityHint={motivoDaConversa ?? undefined}
            carregando={abrindoConversa}
            textoCarregando={textos.conversas.abrindo}
            onPress={onConversar}
          />
        ) : null}
        {onConversar && motivoDaConversa ? (
          <Motivo texto={motivoDaConversa} />
        ) : null}
      </View>
    </View>
  );
}
