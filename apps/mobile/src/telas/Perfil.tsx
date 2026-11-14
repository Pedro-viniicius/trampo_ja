import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Avatar,
  Aviso,
  Botao,
  CartaoDeModo,
  DialogoDeConfirmacao,
  Estrelas,
  GrupoDeConfiguracao,
  Interruptor,
  LinhaDeConfiguracao,
} from '../componentes';
import { pontosDoGradiente } from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  EstadoDeTela,
  Etiqueta,
  NaoEncontrado,
  Paragrafo,
  Rolavel,
} from './base';
import type {
  ContagensDoPerfil,
  FavoritoDoPerfil,
  PropsDoPerfil,
} from './tipos';

export function Perfil({
  proprio,
  estado,
  perfilIncompleto,
  semConexao,
  onEditar,
  onSair,
  onVoltar,
  onMinhasCandidaturas,
  onMeusTrampos,
  onMeusServicos,
  onContaEPrivacidade,
  onTrocarModo,
  onDicas,
  contagens,
  nota,
  onVerAvaliacoes,
  favorito,
}: PropsDoPerfil) {
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  return (
    <Rolavel
      titulo={textos.perfil.titulo}
      raiz={!onVoltar}
      onVoltar={onVoltar}
      semConexao={semConexao}
    >
      <EstadoDeTela
        estado={estado}
        vazio={<NaoEncontrado onVoltar={onVoltar} />}
      >
        {(perfil) => (
          <>
            {proprio && perfilIncompleto ? (
              <Aviso
                variante="alerta"
                texto={textos.perfil.avisoIncompleto(perfilIncompleto.falta)}
                textoAcao={textos.perfil.completar}
                onAcao={onEditar}
              />
            ) : null}
            <View style={{ alignItems: 'center', gap: espaco.s }}>
              <View style={{ marginBottom: espaco.s }}>
                <Avatar nome={perfil.nome} tamanho={96} variante="destaque" />
              </View>
              <Text
                accessibilityRole="header"
                style={[
                  estiloDeTexto('h1'),
                  { color: cores.texto, textAlign: 'center' },
                ]}
              >
                {perfil.nome}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: espaco.xs,
                }}
              >
                <Feather
                  name="map-pin"
                  size={16}
                  color={cores.textoSecundario}
                />
                <Text
                  style={[
                    estiloDeTexto('corpo'),
                    { flexShrink: 1, color: cores.textoSecundario },
                  ]}
                >
                  {perfil.cidade}
                </Text>
              </View>
              {nota && nota.total > 0 ? (
                <Estrelas media={nota.media} total={nota.total} />
              ) : null}
              {nota && nota.total > 0 && onVerAvaliacoes ? (
                <Botao
                  texto={textos.avaliacoes.recebidasTitulo}
                  variante="texto"
                  larguraCheia={false}
                  onPress={onVerAvaliacoes}
                />
              ) : null}
            </View>
            {!proprio && favorito ? (
              <Favoritar nome={perfil.nome} favorito={favorito} />
            ) : null}
            {proprio && onTrocarModo ? (
              <CartaoDeModo modoAtual="freela" onTrocar={onTrocarModo} />
            ) : null}
            {proprio && contagens ? <Contagens contagens={contagens} /> : null}
            <View
              style={[
                {
                  gap: espaco.m,
                  padding: espaco.l,
                  borderRadius: raio.card,
                  backgroundColor: cores.superficie,
                },
                sombra.sm,
              ]}
            >
              <View style={{ gap: espaco.s }}>
                <TituloDoCartao texto={textos.perfil.habilidades} />
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: espaco.s,
                  }}
                >
                  {perfil.habilidades.map((habilidade, i) => (
                    <Etiqueta
                      // biome-ignore lint/suspicious/noArrayIndexKey: lista estática, sem reordenação
                      key={`${habilidade}-${i}`}
                      texto={habilidade}
                    />
                  ))}
                </View>
              </View>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ height: 1, backgroundColor: cores.divisor }}
              />
              <View style={{ gap: espaco.xs }}>
                <TituloDoCartao texto={textos.perfil.sobre} />
                <Paragrafo
                  texto={perfil.descricao?.trim() || textos.perfil.semDescricao}
                  secundario={!perfil.descricao?.trim()}
                />
              </View>
            </View>
            {proprio ? (
              <View style={{ gap: espaco.m }}>
                {onEditar ? (
                  <Botao
                    texto={textos.perfil.editar}
                    variante="secundario"
                    icone="edit-2"
                    onPress={onEditar}
                  />
                ) : null}
                {onMinhasCandidaturas ||
                onMeusTrampos ||
                onMeusServicos ||
                onDicas ||
                onContaEPrivacidade ||
                onSair ? (
                  <GrupoDeConfiguracao>
                    {onMinhasCandidaturas ? (
                      <LinhaDeConfiguracao
                        titulo={textos.perfil.minhasCandidaturas}
                        icone="file-text"
                        onPress={onMinhasCandidaturas}
                      />
                    ) : null}
                    {onMeusTrampos ? (
                      <LinhaDeConfiguracao
                        titulo={textos.perfil.meusTrampos}
                        icone="briefcase"
                        onPress={onMeusTrampos}
                      />
                    ) : null}
                    {onMeusServicos ? (
                      <LinhaDeConfiguracao
                        titulo={textos.perfil.meusServicos}
                        icone="tool"
                        tom="sucesso"
                        onPress={onMeusServicos}
                      />
                    ) : null}
                    {onDicas ? (
                      <LinhaDeConfiguracao
                        titulo={textos.perfil.dicas}
                        icone="book-open"
                        tom="roxo"
                        onPress={onDicas}
                      />
                    ) : null}
                    {onContaEPrivacidade ? (
                      <LinhaDeConfiguracao
                        titulo={textos.perfil.contaEPrivacidade}
                        icone="shield"
                        tom="neutro"
                        onPress={onContaEPrivacidade}
                      />
                    ) : null}
                    {onSair ? (
                      <LinhaDeConfiguracao
                        titulo={textos.perfil.sair}
                        icone="log-out"
                        destrutiva
                        onPress={() => setConfirmandoSaida(true)}
                      />
                    ) : null}
                  </GrupoDeConfiguracao>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </EstadoDeTela>
      <DialogoDeConfirmacao
        visivel={confirmandoSaida}
        titulo={textos.perfil.sairTitulo}
        textoConfirmar={textos.perfil.sairConfirmar}
        textoCancelar={textos.perfil.sairCancelar}
        destrutivo
        onConfirmar={() => {
          setConfirmandoSaida(false);
          onSair?.();
        }}
        onCancelar={() => setConfirmandoSaida(false)}
      />
    </Rolavel>
  );
}

/** CA98: marca e desmarca a pessoa na equipe favorita (só no perfil de outra pessoa). */
function Favoritar({
  nome,
  favorito,
}: {
  nome: string;
  favorito: FavoritoDoPerfil;
}) {
  return (
    <View
      style={[
        {
          gap: espaco.xs,
          paddingVertical: espaco.xs,
          paddingHorizontal: espaco.m,
          borderRadius: raio.card,
          backgroundColor: favorito.ativo ? cores.roxo[50] : cores.superficie,
        },
        sombra.sm,
      ]}
    >
      <Interruptor
        rotulo={textos.favoritos.favoritar(nome)}
        descricao={favorito.ativo ? textos.favoritos.favoritado : undefined}
        valor={favorito.ativo}
        desabilitado={favorito.salvando}
        onMudar={(valor) => {
          if (!favorito.salvando) favorito.onAlternar(valor);
        }}
      />
      {favorito.erro ? <Aviso variante="erro" texto={favorito.erro} /> : null}
    </View>
  );
}

function TituloDoCartao({ texto }: { texto: string }) {
  return (
    <Text
      accessibilityRole="header"
      style={[estiloDeTexto('h3'), { color: cores.texto }]}
    >
      {texto}
    </Text>
  );
}

/**
 * Cartões de número (CA83): no lugar de ganhos e "trampinhos" do redesign,
 * as candidaturas enviadas e confirmadas, de `/candidaturas/minhas`.
 */
function Contagens({ contagens }: { contagens: ContagensDoPerfil }) {
  const cartao = {
    minHeight: 88,
    justifyContent: 'center' as const,
    padding: espaco.m,
    borderRadius: raio.card,
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m - 4 }}>
      <View style={[{ flexGrow: 1, flexBasis: 140 }, sombra.marca]}>
        <LinearGradient
          colors={[...cores.gradienteAcao]}
          {...pontosDoGradiente}
          style={cartao}
        >
          <Text style={[estiloDeTexto('h3'), { color: cores.branco }]}>
            {textos.perfil.candidaturasEnviadas(contagens.enviadas)}
          </Text>
        </LinearGradient>
      </View>
      <View
        style={[
          cartao,
          { flexGrow: 1, flexBasis: 140, backgroundColor: cores.roxo[50] },
        ]}
      >
        <Text style={[estiloDeTexto('h3'), { color: cores.roxo[700] }]}>
          {textos.perfil.confirmadas(contagens.confirmadas)}
        </Text>
      </View>
    </View>
  );
}
