import { Ionicons } from '@expo/vector-icons';
import { type ComponentRef, type Ref, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { cores, espaco, raio, tipografia, toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Botao } from './Botao';
import { CampoDeTexto } from './CampoDeTexto';
import { FolhaInferior } from './FolhaInferior';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDoSeletor = {
  rotulo: string;
  /** Valor atual; `null` mostra `textoVazio`. */
  valor: string | null;
  textoVazio: string;
  opcoes: readonly string[];
  /** `lista`: só escolhe entre as opções. `livre`: aceita também texto digitado (sugestões). */
  modo?: 'lista' | 'livre';
  rotuloDePesquisa: string;
  /** Se informado, a primeira linha limpa a escolha (ex.: "Todas as categorias"). */
  textoTodas?: string;
  textoAplicar?: string;
  textoSemOpcoes: string;
  onSelecionar: (valor: string | null) => void;
  erro?: string;
  desabilitado?: boolean;
  /** Limite em pontos de código do campo de pesquisa/texto livre (corta e conta). */
  limite?: number;
  /** Só para texto ASCII; texto livre usa `limite`. */
  maxLength?: number;
  /** Ref do botão que abre a lista: recebe o foco quando há erro. */
  gatilhoRef?: Ref<ComponentRef<typeof Pressable>>;
};

const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');

type Linha = { chave: string; texto: string; valor: string | null };

export function Seletor({
  rotulo,
  valor,
  textoVazio,
  opcoes,
  modo = 'lista',
  rotuloDePesquisa,
  textoTodas,
  textoAplicar = textos.buscar.aplicar,
  textoSemOpcoes,
  onSelecionar,
  erro,
  desabilitado = false,
  limite,
  maxLength,
  gatilhoRef,
}: PropsDoSeletor) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const { focado, aoFocar, aoDesfocar } = useFoco();

  const termo = normalizar(busca.trim());
  const filtradas = opcoes.filter((opcao) => normalizar(opcao).includes(termo));
  const linhas: Linha[] = [
    ...(textoTodas && !termo
      ? [{ chave: '__todas__', texto: textoTodas, valor: null }]
      : []),
    ...filtradas.map((opcao) => ({ chave: opcao, texto: opcao, valor: opcao })),
  ];

  const abrir = () => {
    setBusca('');
    setAberto(true);
  };
  const escolher = (escolhido: string | null) => {
    onSelecionar(escolhido);
    setAberto(false);
  };
  const textoLivre = busca.trim();
  const aplicarLivre = () => {
    if (modo === 'livre' && textoLivre) escolher(textoLivre);
  };

  return (
    <View style={{ gap: espaco[1] }}>
      <Text
        style={{
          color: cores.texto,
          fontSize: tipografia.tamanho.rotulo,
          lineHeight: tipografia.lineHeight.rotulo,
          fontWeight: tipografia.peso.medio,
        }}
      >
        {rotulo}
      </Text>
      <Pressable
        ref={gatilhoRef}
        accessibilityRole="button"
        accessibilityLabel={`${rotulo}: ${valor ?? textoVazio}`}
        accessibilityHint={textos.buscar.tocarParaEscolher}
        accessibilityState={{ disabled: desabilitado }}
        disabled={desabilitado}
        onPress={abrir}
        onFocus={aoFocar}
        onBlur={aoDesfocar}
        style={({ pressed }) => [
          {
            minHeight: toqueMinimo + 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: espaco[2],
            paddingHorizontal: espaco[3],
            borderWidth: 2,
            borderRadius: raio.sm,
            borderColor: erro ? cores.erro : cores.borda,
            backgroundColor: pressed ? cores.fundo : cores.superficie,
            opacity: desabilitado ? 0.6 : 1,
          },
          focado && estiloDeFoco,
        ]}
      >
        <Text
          numberOfLines={2}
          style={{
            flex: 1,
            color: valor ? cores.texto : cores.textoSecundario,
            fontSize: tipografia.tamanho.corpo,
          }}
        >
          {valor ?? textoVazio}
        </Text>
        <Ionicons name="chevron-down" size={20} color={cores.textoSecundario} />
      </Pressable>
      <View accessibilityLiveRegion="polite">
        {erro ? (
          <View
            style={{
              flexDirection: 'row',
              gap: espaco[1],
              alignItems: 'flex-start',
            }}
          >
            <Ionicons
              name="alert-circle"
              size={16}
              color={cores.erro}
              style={{ marginTop: 2 }}
            />
            <Text
              style={{
                flex: 1,
                color: cores.erro,
                fontSize: tipografia.tamanho.rotulo,
                lineHeight: tipografia.lineHeight.rotulo,
              }}
            >
              {erro}
            </Text>
          </View>
        ) : null}
      </View>

      <FolhaInferior
        visivel={aberto}
        titulo={rotulo}
        onFechar={() => setAberto(false)}
      >
        <CampoDeTexto
          rotulo={rotuloDePesquisa}
          valor={busca}
          onChangeText={setBusca}
          limite={limite}
          contadorDoLimite="perto"
          maxLength={maxLength}
          returnKeyType={modo === 'livre' ? 'done' : 'search'}
          onSubmitEditing={aplicarLivre}
        />
        <FlatList
          data={linhas}
          keyExtractor={(linha) => linha.chave}
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0 }}
          ListEmptyComponent={
            <Text
              style={{
                color: cores.textoSecundario,
                fontSize: tipografia.tamanho.corpo,
                paddingVertical: espaco[3],
              }}
            >
              {textoSemOpcoes}
            </Text>
          }
          renderItem={({ item }) => (
            <LinhaDeOpcao
              texto={item.texto}
              selecionada={item.valor === valor}
              onPress={() => escolher(item.valor)}
            />
          )}
        />
        {modo === 'livre' && textoLivre ? (
          <Botao texto={textoAplicar} onPress={aplicarLivre} />
        ) : null}
      </FolhaInferior>
    </View>
  );
}

function LinhaDeOpcao({
  texto,
  selecionada,
  onPress,
}: {
  texto: string;
  selecionada: boolean;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ selected: selecionada }}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: toqueMinimo + 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco[2],
          paddingHorizontal: espaco[2],
          borderRadius: raio.sm,
          backgroundColor: pressed ? cores.superficie : 'transparent',
        },
        focado && estiloDeFoco,
      ]}
    >
      <Text
        style={{
          flex: 1,
          color: cores.texto,
          fontSize: tipografia.tamanho.corpo,
          fontWeight: selecionada
            ? tipografia.peso.semibold
            : tipografia.peso.normal,
        }}
      >
        {texto}
      </Text>
      {selecionada ? (
        <Ionicons name="checkmark" size={20} color={cores.primaria} />
      ) : null}
    </Pressable>
  );
}
