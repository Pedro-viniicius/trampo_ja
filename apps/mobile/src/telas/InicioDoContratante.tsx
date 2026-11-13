import { Feather } from '@expo/vector-icons';
import { ScrollView, Text, View } from 'react-native';
import {
  ALTURA_DA_BARRA_DE_ABAS,
  Avatar,
  Aviso,
  Botao,
  CartaoDeDestaque,
  EstadoVazio,
  folgaDaBarraDeAbas,
  MARGEM_DA_BARRA_DE_ABAS,
  Selo,
  Toast,
} from '../componentes';
import { useMargensSeguras } from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Carregando, Coluna, ErroDoBloco, Pagina } from './base';
import type { DemandaParaExibir, PropsDoInicioDoContratante } from './tipos';

/** CA82: o Início mostra até 3 demandas abertas. */
export const MAXIMO_DE_DEMANDAS_NO_INICIO = 3;

/**
 * Início do contratante (quadro 12; CA82): destaque com "+" para publicar e
 * as demandas abertas com o número de interessados. Sem Aceitar nem Recusar
 * aqui: isso fica na Lista de candidatos.
 */
export function InicioDoContratante({
  nome,
  perfilIncompleto,
  demandas,
  temDemandas = false,
  onNovaDemanda,
  onVerDemandas,
  onVerCandidatos,
  onCompletarPerfil,
  toast,
  onFecharToast,
}: PropsDoInicioDoContratante) {
  const margens = useMargensSeguras();
  return (
    <Pagina>
      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          paddingTop: margens.top + espaco.s,
          paddingBottom: folgaDaBarraDeAbas(margens.bottom),
        }}
      >
        <Coluna gap={espaco.l}>
          <Saudacao nome={nome} />
          {perfilIncompleto ? (
            <Aviso
              variante="alerta"
              texto={textos.perfil.avisoIncompleto(perfilIncompleto.falta)}
              textoAcao={
                onCompletarPerfil ? textos.perfil.completar : undefined
              }
              onAcao={onCompletarPerfil}
            />
          ) : null}
          <CartaoDeDestaque
            titulo={textos.inicioContratante.precisa}
            texto={textos.inicioContratante.publique}
            acaoRedonda={{
              icone: 'plus',
              rotulo: textos.inicioContratante.novaDemanda,
              onPress: onNovaDemanda,
            }}
          />
          <View style={{ gap: espaco.m }}>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                columnGap: espaco.s,
              }}
            >
              <Text
                accessibilityRole="header"
                style={[estiloDeTexto('h2'), { color: cores.texto }]}
              >
                {textos.inicioContratante.abertas}
              </Text>
              <Botao
                texto={textos.inicioContratante.verDemandas}
                variante="texto"
                larguraCheia={false}
                onPress={onVerDemandas}
              />
            </View>
            <Demandas
              demandas={demandas}
              temDemandas={temDemandas}
              onNovaDemanda={onNovaDemanda}
              onVerCandidatos={onVerCandidatos}
            />
          </View>
        </Coluna>
      </ScrollView>
      <Toast
        visivel={Boolean(toast)}
        mensagem={toast ?? ''}
        rotuloFechar={textos.gerais.toastFechar}
        onFechar={() => onFecharToast?.()}
        // O toast sobe acima da barra flutuante.
        deslocamentoInferior={ALTURA_DA_BARRA_DE_ABAS + MARGEM_DA_BARRA_DE_ABAS}
      />
    </Pagina>
  );
}

function Saudacao({ nome }: { nome?: string }) {
  const temNome = Boolean(nome?.trim());
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.m - 4 }}
    >
      {temNome ? <Avatar nome={nome ?? ''} variante="empresa" /> : null}
      <View style={{ flex: 1 }}>
        {temNome ? (
          <Text
            style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
          >
            {textos.inicioContratante.ola}
          </Text>
        ) : null}
        <Text
          accessibilityRole="header"
          style={[estiloDeTexto('h2'), { color: cores.texto }]}
        >
          {temNome ? nome : textos.inicio.saudacaoSemNome}
        </Text>
      </View>
    </View>
  );
}

function Demandas({
  demandas,
  temDemandas,
  onNovaDemanda,
  onVerCandidatos,
}: Pick<
  PropsDoInicioDoContratante,
  'demandas' | 'onNovaDemanda' | 'onVerCandidatos'
> & { temDemandas: boolean }) {
  // Dois vazios: quem já publicou (mas nada está aberto) e quem nunca publicou.
  const vazio = (
    <EstadoVazio
      icone="briefcase"
      titulo={
        temDemandas
          ? textos.demandas.vazioAbertas
          : textos.inicioContratante.semDemandas
      }
      texto={
        temDemandas
          ? textos.inicioContratante.semAbertasTexto
          : textos.inicioContratante.semDemandasTexto
      }
      textoAcao={textos.demandas.publicar}
      onAcao={onNovaDemanda}
    />
  );
  switch (demandas.situacao) {
    case 'carregando':
      return <Carregando cartoes={2} />;
    case 'erro':
      return (
        <ErroDoBloco
          mensagem={demandas.mensagem}
          onTentarDeNovo={demandas.onTentarDeNovo}
        />
      );
    case 'vazio':
      return vazio;
    case 'ok':
      if (demandas.dados.length === 0) return vazio;
      return (
        <View style={{ gap: espaco.m }}>
          {demandas.dados.slice(0, MAXIMO_DE_DEMANDAS_NO_INICIO).map((d) => (
            <CartaoDeDemanda
              key={d.id}
              demanda={d}
              onVerCandidatos={() => onVerCandidatos(d.id)}
            />
          ))}
        </View>
      );
  }
}

function CartaoDeDemanda({
  demanda,
  onVerCandidatos,
}: {
  demanda: DemandaParaExibir;
  onVerCandidatos: () => void;
}) {
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
      <Text
        numberOfLines={2}
        style={[estiloDeTexto('h3'), { color: cores.texto }]}
      >
        {demanda.titulo}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: espaco.s,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.xs }}
        >
          <Feather name="calendar" size={14} color={cores.textoSecundario} />
          <Text
            style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
          >
            {demanda.prazoFormatado ?? textos.detalheTrampo.semPrazo}
          </Text>
        </View>
        <Selo
          variante="roxo"
          icone="users"
          texto={textos.inicioContratante.interessados(demanda.interessados)}
        />
      </View>
      <Botao
        texto={textos.demandas.verCandidatos}
        rotuloDeAcessibilidade={textos.demandas.verCandidatosDe(demanda.titulo)}
        variante="tonal"
        onPress={onVerCandidatos}
      />
    </View>
  );
}
