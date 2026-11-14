import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import {
  Avatar,
  Aviso,
  Botao,
  CampoDeTexto,
  Chip,
  EstadoVazio,
  EstrelasDeAvaliacao,
  Interruptor,
} from '../componentes';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  Cartao,
  EstadoDeTela,
  Formulario,
  NaoEncontrado,
  Paragrafo,
  Rolavel,
} from './base';
import type { AlvoDaAvaliacao, PapelDoAvaliado, PropsDaAvaliar } from './tipos';

/** Limite do comentário, igual ao da API (1 a 500 pontos de código). */
export const LIMITE_DO_COMENTARIO = 500;

/** Códigos de destaque de cada papel, na ordem da API (rótulos em `textos`). */
export function destaquesDoPapel(papel: PapelDoAvaliado): readonly string[] {
  return Object.keys(
    papel === 'freela'
      ? textos.avaliar.destaquesFreela
      : textos.avaliar.destaquesContratante,
  );
}

/** Rótulo de um código de destaque; código desconhecido não aparece como texto cru. */
export function rotuloDoDestaque(
  papel: PapelDoAvaliado,
  codigo: string,
): string | null {
  const tabela: Readonly<Record<string, string>> =
    papel === 'freela'
      ? textos.avaliar.destaquesFreela
      : textos.avaliar.destaquesContratante;
  return tabela[codigo] ?? null;
}

/**
 * Avaliar (CA96, quadro 17): nota em estrelas (grupo de rádio), destaques
 * opcionais, comentário com contador e, só quando o contratante avalia um
 * freela, o interruptor "Favoritar". Enviar fica desabilitado sem nota e
 * manda um só pedido por vez.
 */
export function Avaliar({
  papel,
  alvo,
  nota,
  destaques,
  comentario,
  favoritar = false,
  enviando = false,
  erro,
  jaAvaliado = false,
  semProfissional = false,
  semConexao,
  onMudarNota,
  onAlternarDestaque,
  onMudarComentario,
  onMudarFavoritar,
  onEnviar,
  onVoltar,
}: PropsDaAvaliar) {
  const titulo =
    papel === 'freela'
      ? textos.avaliar.titulo
      : textos.avaliar.tituloContratante;
  // Trava síncrona: dois toques no mesmo instante não geram dois pedidos.
  const travado = useRef(false);
  useEffect(() => {
    // Termina o envio (ou falha): libera um novo.
    if (!enviando) travado.current = false;
  }, [enviando]);
  useEffect(() => {
    if (erro) travado.current = false;
  }, [erro]);

  if (jaAvaliado) {
    return (
      <Rolavel titulo={titulo} onVoltar={onVoltar} semConexao={semConexao}>
        <EstadoVazio
          icone="check-circle"
          titulo={textos.avaliar.jaAvaliado}
          textoAcao={textos.gerais.voltar}
          onAcao={onVoltar}
        />
      </Rolavel>
    );
  }

  if (semProfissional) {
    return (
      <Rolavel titulo={titulo} onVoltar={onVoltar} semConexao={semConexao}>
        <EstadoVazio
          icone="info"
          titulo={textos.avaliar.semProfissional}
          textoAcao={textos.gerais.voltar}
          onAcao={onVoltar}
        />
      </Rolavel>
    );
  }

  const semNota = nota < 1;
  const motivo = semConexao
    ? textos.avaliar.semConexaoMotivo
    : semNota
      ? textos.avaliar.escolhaNota
      : null;
  const enviar = () => {
    if (enviando || semNota || semConexao || travado.current) return;
    travado.current = true;
    onEnviar();
  };

  return (
    <Formulario
      titulo={titulo}
      onVoltar={onVoltar}
      semConexao={semConexao}
      rodape={
        <>
          {erro ? <Aviso variante="erro" texto={erro} /> : null}
          {motivo ? <Paragrafo texto={motivo} secundario /> : null}
          <Botao
            texto={textos.avaliar.enviar}
            textoCarregando={textos.avaliar.enviando}
            carregando={enviando}
            desabilitado={semNota || Boolean(semConexao)}
            accessibilityHint={motivo ?? undefined}
            onPress={enviar}
          />
        </>
      }
    >
      <EstadoDeTela estado={alvo} vazio={<NaoEncontrado onVoltar={onVoltar} />}>
        {(dados) => (
          <>
            <Alvo alvo={dados} />
            <Cartao gap={espaco.s}>
              <EstrelasDeAvaliacao
                nota={nota}
                onMudar={onMudarNota}
                desabilitado={enviando}
              />
            </Cartao>
            <Cartao gap={espaco.s}>
              <Text
                accessibilityRole="header"
                style={[estiloDeTexto('h3'), { color: cores.texto }]}
              >
                {textos.avaliar.destaques}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: espaco.s,
                }}
              >
                {destaquesDoPapel(papel).map((codigo) => (
                  <Chip
                    key={codigo}
                    texto={rotuloDoDestaque(papel, codigo) ?? codigo}
                    selecionado={destaques.includes(codigo)}
                    desabilitado={enviando}
                    onPress={() => onAlternarDestaque(codigo)}
                  />
                ))}
              </View>
            </Cartao>
            <CampoDeTexto
              rotulo={textos.avaliar.comentario}
              valor={comentario}
              onChangeText={onMudarComentario}
              multiline
              limite={LIMITE_DO_COMENTARIO}
              contadorDoLimite="sempre"
              editable={!enviando}
            />
            {papel === 'freela' && onMudarFavoritar ? (
              <View
                style={[
                  {
                    paddingHorizontal: espaco.m,
                    borderRadius: raio.card,
                    backgroundColor: cores.superficie,
                  },
                  sombra.sm,
                ]}
              >
                <Interruptor
                  rotulo={textos.avaliar.favoritar}
                  descricao={textos.avaliar.favoritarTexto}
                  valor={favoritar}
                  desabilitado={enviando}
                  onMudar={onMudarFavoritar}
                />
              </View>
            ) : null}
          </>
        )}
      </EstadoDeTela>
    </Formulario>
  );
}

function Alvo({ alvo }: { alvo: AlvoDaAvaliacao }) {
  const nome = alvo.nome ?? textos.conversas.perfilIndisponivel;
  return (
    <View
      accessible
      accessibilityLabel={`${nome}, ${alvo.titulo}, ${alvo.dataFormatada}`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.m,
          padding: espaco.m,
          borderRadius: raio.card,
          backgroundColor: cores.superficie,
        },
        sombra.sm,
      ]}
    >
      <Avatar nome={nome} neutro={alvo.nome === null} tamanho={64} />
      <View style={{ flex: 1, gap: espaco.xs }}>
        <Text
          numberOfLines={2}
          style={[estiloDeTexto('h3'), { color: cores.texto }]}
        >
          {nome}
        </Text>
        <Text
          numberOfLines={2}
          style={[estiloDeTexto('corpo'), { color: cores.textoSecundario }]}
        >
          {`${alvo.titulo} · ${alvo.dataFormatada}`}
        </Text>
      </View>
    </View>
  );
}
