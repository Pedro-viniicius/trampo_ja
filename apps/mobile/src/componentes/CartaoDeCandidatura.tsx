import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Avatar } from './Avatar';
import { Botao } from './Botao';
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
}: PropsDoCartaoDeCandidatura) {
  const [linhas, setLinhas] = useState<number | null>(null);
  const [expandida, setExpandida] = useState(false);
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const exibido = nome ?? textos.candidaturasRecebidas.perfilIndisponivel;
  const longa = linhas !== null && linhas > LINHAS_DA_MENSAGEM;

  return (
    <View
      style={{
        gap: espaco[3],
        padding: espaco[4],
        borderRadius: raio.md,
        borderWidth: 1,
        borderColor: cores.borda,
        backgroundColor: cores.fundo,
      }}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: espaco[3] }}
      >
        <Avatar nome={exibido} neutro={nome === null} />
        <View style={{ flex: 1, gap: espaco[1] }}>
          <Text
            numberOfLines={2}
            style={{
              color: cores.texto,
              fontSize: tipografia.tamanho.corpo,
              lineHeight: tipografia.lineHeight.corpo,
              fontWeight: tipografia.peso.semibold,
            }}
          >
            {exibido}
          </Text>
          <SeloDeCandidatura status={status} />
        </View>
      </View>
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
          accessibilityLabel={`${textos.candidaturasRecebidas.valorProposto}: ${valorFormatado}`}
          style={{
            flexShrink: 1,
            color: cores.texto,
            fontSize: tipografia.tamanho.corpo,
            lineHeight: tipografia.lineHeight.corpo,
            fontWeight: tipografia.peso.negrito,
          }}
        >
          {valorFormatado}
        </Text>
        <Text
          style={{
            color: cores.textoSecundario,
            fontSize: tipografia.tamanho.legenda,
            lineHeight: tipografia.lineHeight.legenda,
          }}
        >
          {textos.candidaturasRecebidas.enviadaEm(dataFormatada)}
        </Text>
      </View>
      <View style={{ gap: espaco[1] }}>
        <Text
          numberOfLines={longa && !expandida ? LINHAS_DA_MENSAGEM : undefined}
          onTextLayout={(evento) => {
            if (linhas === null) setLinhas(evento.nativeEvent.lines.length);
          }}
          style={{
            color: cores.texto,
            fontSize: tipografia.tamanho.corpo,
            lineHeight: tipografia.lineHeight.corpo,
          }}
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
              style={{
                color: cores.primaria,
                fontSize: tipografia.tamanho.rotulo,
                fontWeight: tipografia.peso.semibold,
                textDecorationLine: 'underline',
              }}
            >
              {expandida
                ? textos.detalheTrampo.lerMenos
                : textos.detalheTrampo.lerMais}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ gap: espaco[2] }}>
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
          variante="secundario"
          onPress={onVerPerfil}
        />
        {onConversar ? (
          <Botao
            texto={textos.candidaturasRecebidas.conversar}
            rotuloDeAcessibilidade={textos.candidaturasRecebidas.conversarCom(
              nome,
            )}
            variante="secundario"
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
