import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Avatar,
  Aviso,
  CartaoDeModo,
  DialogoDeConfirmacao,
  Estrelas,
  GrupoDeConfiguracao,
  LinhaDeConfiguracao,
} from '../componentes';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { EstadoDeTela, NaoEncontrado, Paragrafo, Rolavel } from './base';
import type { PropsDoPerfilDaEmpresa } from './tipos';

/**
 * Perfil da empresa (quadro 18; CA83): o Perfil do modo contratante. Nome,
 * cidade e sobre, o cartão "Modo freela", Editar, Conta e privacidade e Sair.
 * Sem faturamento, CNPJ nem selo de verificado (não há dado).
 */
export function PerfilDaEmpresa({
  estado,
  perfilIncompleto,
  semConexao,
  onTrocarModo,
  onEditar,
  onContaEPrivacidade,
  onSair,
  nota,
  onVerAvaliacoes,
}: PropsDoPerfilDaEmpresa) {
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  return (
    <Rolavel
      titulo={textos.perfil.tituloEmpresa}
      raiz
      comBarraDeAbas
      semConexao={semConexao}
    >
      <EstadoDeTela estado={estado} vazio={<NaoEncontrado />}>
        {(perfil) => (
          <>
            {perfilIncompleto ? (
              <Aviso
                variante="alerta"
                texto={textos.perfil.avisoIncompleto(perfilIncompleto.falta)}
                textoAcao={textos.perfil.completar}
                onAcao={onEditar}
              />
            ) : null}
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
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: espaco.m,
                }}
              >
                <Avatar nome={perfil.nome} tamanho={96} variante="empresa" />
                <View style={{ flex: 1, minWidth: 160, gap: espaco.xs }}>
                  <Text
                    accessibilityRole="header"
                    style={[estiloDeTexto('h2'), { color: cores.texto }]}
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
                </View>
              </View>
              <View style={{ gap: espaco.xs }}>
                <Text
                  accessibilityRole="header"
                  style={[estiloDeTexto('h3'), { color: cores.texto }]}
                >
                  {textos.perfil.sobre}
                </Text>
                <Paragrafo
                  texto={perfil.descricao?.trim() || textos.perfil.semDescricao}
                  secundario={!perfil.descricao?.trim()}
                />
              </View>
            </View>
            <CartaoDeModo modoAtual="contratante" onTrocar={onTrocarModo} />
            <GrupoDeConfiguracao>
              {onVerAvaliacoes ? (
                <LinhaDeConfiguracao
                  titulo={textos.avaliacoes.recebidasTitulo}
                  descricao={
                    nota && nota.total > 0
                      ? textos.avaliacoes.recebidas(nota.total)
                      : textos.avaliacoes.semAvaliacoes
                  }
                  icone="star"
                  tom="alerta"
                  onPress={onVerAvaliacoes}
                />
              ) : null}
              <LinhaDeConfiguracao
                titulo={textos.perfil.editar}
                descricao={textos.perfil.infoEmpresaTexto}
                icone="edit-2"
                tom="roxo"
                onPress={onEditar}
              />
              <LinhaDeConfiguracao
                titulo={textos.perfil.contaEPrivacidade}
                icone="shield"
                onPress={onContaEPrivacidade}
              />
              <LinhaDeConfiguracao
                titulo={textos.perfil.sair}
                icone="log-out"
                destrutiva
                onPress={() => setConfirmandoSaida(true)}
              />
            </GrupoDeConfiguracao>
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
          onSair();
        }}
        onCancelar={() => setConfirmandoSaida(false)}
      />
    </Rolavel>
  );
}
