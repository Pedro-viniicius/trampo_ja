import { Ionicons } from '@expo/vector-icons';
import {
  type ComponentRef,
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  type TextInput,
  View,
} from 'react-native';
import {
  Avatar,
  Aviso,
  Cabecalho,
  Esqueleto,
  EstadoVazio,
  FaixaSemConexao,
} from '../componentes';
import {
  estiloDeFoco,
  useFoco,
  useMargensSeguras,
} from '../componentes/utilitarios';
import {
  cores,
  espaco,
  larguraMaxima,
  raio,
  tipografia,
  toqueMinimo,
} from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import type { Estado } from './tipos';

export const LINHAS_DA_DESCRICAO = 5;

/** Alvo de foco: `TextInput` (campo) ou `View`/`Pressable` (seletor, botão). */
export type RefDeCampo = RefObject<
  ComponentRef<typeof TextInput> | ComponentRef<typeof View> | null
>;

type RefDaRolagem = RefObject<ComponentRef<typeof ScrollView> | null>;

/** A rolagem da tela, para levar o foco e os avisos à vista. */
const ContextoDeRolagem = createContext<RefDaRolagem | null>(null);

type AlvoMedivel = {
  focus?: () => void;
  isFocused?: () => boolean;
  measureLayout?: (
    relativoA: unknown,
    aoMedir: (x: number, y: number) => void,
    aoFalhar: () => void,
  ) => void;
};

/** Rola até o alvo ficar à vista, sem animação (respeita "reduzir movimento"). */
export function rolarAteOAlvo(rolagem: RefDaRolagem | null, alvo: unknown) {
  const rolavel = rolagem?.current as
    | (ComponentRef<typeof ScrollView> & {
        getInnerViewRef?: () => unknown;
      })
    | null
    | undefined;
  const medivel = alvo as AlvoMedivel | null;
  const interno = rolavel?.getInnerViewRef?.();
  if (!rolavel || !interno || typeof medivel?.measureLayout !== 'function') {
    return;
  }
  try {
    medivel.measureLayout(
      interno,
      (_x, y) =>
        rolavel.scrollTo({ y: Math.max(0, y - espaco[6]), animated: false }),
      () => {},
    );
  } catch {
    // Alvo fora desta rolagem (ex.: dentro de uma folha): o foco já basta.
  }
}

/** Fundo da tela; o conteúdo é centralizado com largura máxima em telas largas. */
export function Pagina({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>{children}</View>
  );
}

/** Coluna de conteúdo: margem de 16, espaçamento de 16 e largura máxima 560. */
export function Coluna({
  children,
  gap = espaco[4],
}: {
  children: ReactNode;
  gap?: number;
}) {
  return (
    <View
      style={{
        width: '100%',
        maxWidth: larguraMaxima,
        padding: espaco[4],
        gap,
      }}
    >
      {children}
    </View>
  );
}

/** Tela rolável com cabeçalho. `rodape` fica fixo embaixo, fora da rolagem. */
export function Rolavel({
  titulo,
  onVoltar,
  semConexao,
  rodape,
  children,
  acima,
  scrollRef,
  sobreposicao,
  aoMedirRodape,
}: {
  titulo: string;
  onVoltar?: () => void;
  semConexao?: boolean;
  rodape?: ReactNode;
  children: ReactNode;
  acima?: ReactNode;
  /** Ref da rolagem, para a tela rolar até um aviso. */
  scrollRef?: RefDaRolagem;
  /** Conteúdo sobreposto à tela (ex.: toast), fora do rodapé. */
  sobreposicao?: ReactNode;
  /** Recebe a altura do rodapé fixo (para o toast não cobri-lo). */
  aoMedirRodape?: (altura: number) => void;
}) {
  const propria = useRef<ComponentRef<typeof ScrollView>>(null);
  const rolagem = scrollRef ?? propria;
  const [alturaDoRodape, setAlturaDoRodape] = useState(0);
  return (
    <Pagina>
      <Cabecalho titulo={titulo} onVoltar={onVoltar} />
      {semConexao ? <FaixaSemConexao /> : null}
      {acima}
      <ScrollView
        ref={rolagem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ alignItems: 'center' }}
      >
        <ContextoDeRolagem.Provider value={rolagem}>
          <Coluna>{children}</Coluna>
        </ContextoDeRolagem.Provider>
      </ScrollView>
      {rodape ? (
        <RodapeFixo
          aoMedir={(altura) => {
            setAlturaDoRodape(altura);
            aoMedirRodape?.(altura);
          }}
        >
          {rodape}
        </RodapeFixo>
      ) : null}
      {sobreposicao ? (
        // Cobre só a área acima do rodapé: o toast nunca tapa o botão.
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: rodape ? alturaDoRodape : 0,
          }}
        >
          {sobreposicao}
        </View>
      ) : null}
    </Pagina>
  );
}

/** Formulário: o botão principal fica fixo no rodapé, acima do teclado. */
export function Formulario({
  titulo,
  onVoltar,
  semConexao,
  rodape,
  aoMedirRodape,
  children,
}: {
  titulo: string;
  onVoltar?: () => void;
  semConexao?: boolean;
  rodape: ReactNode;
  /** Recebe a altura do rodapé fixo (para o toast não cobri-lo). */
  aoMedirRodape?: (altura: number) => void;
  children: ReactNode;
}) {
  const rolagem = useRef<ComponentRef<typeof ScrollView>>(null);
  return (
    <Pagina>
      <Cabecalho titulo={titulo} onVoltar={onVoltar} />
      {semConexao ? <FaixaSemConexao /> : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={rolagem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ alignItems: 'center' }}
        >
          <ContextoDeRolagem.Provider value={rolagem}>
            <Coluna>{children}</Coluna>
          </ContextoDeRolagem.Provider>
        </ScrollView>
        <RodapeFixo aoMedir={aoMedirRodape}>{rodape}</RodapeFixo>
      </KeyboardAvoidingView>
    </Pagina>
  );
}

export function RodapeFixo({
  children,
  aoMedir,
}: {
  children: ReactNode;
  aoMedir?: (altura: number) => void;
}) {
  const margens = useMargensSeguras();
  return (
    <View
      onLayout={(evento) => aoMedir?.(evento.nativeEvent.layout.height)}
      style={{
        alignItems: 'center',
        paddingBottom: margens.bottom,
        borderTopWidth: 1,
        borderTopColor: cores.superficie,
        backgroundColor: cores.fundo,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: larguraMaxima,
          padding: espaco[4],
          gap: espaco[2],
        }}
      >
        {children}
      </View>
    </View>
  );
}

/**
 * Leva o foco ao primeiro campo com erro quando o conjunto de erros muda
 * ou quando o envio é recusado de novo (`tentativa` muda), e rola até ele.
 * O leitor de tela anuncia o erro pelo próprio campo. Aceita `TextInput`
 * (`focus()`) e `View`/`Pressable` (foco de acessibilidade).
 */
export function useFocarPrimeiroErro(
  campos: readonly { ref: RefDeCampo; erro?: string }[],
  tentativa?: number,
): void {
  const recentes = useRef(campos);
  recentes.current = campos;
  const rolagem = useContext(ContextoDeRolagem);
  const chave = `${tentativa ?? 0}#${campos.map((campo) => campo.erro ?? '').join('|')}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `chave` resume os erros; os refs são lidos de `recentes`.
  useEffect(() => {
    const primeiro = recentes.current.find((campo) => campo.erro);
    const alvo = primeiro?.ref.current as AlvoMedivel | null | undefined;
    if (!alvo) return;
    // Só `TextInput` tem `isFocused`; o ref de `View`/`Pressable` também tem `focus()`,
    // mas ele não move o foco do leitor de tela (R10).
    if (
      typeof alvo.isFocused === 'function' &&
      typeof alvo.focus === 'function'
    ) {
      alvo.focus();
    } else {
      const no = findNodeHandle(alvo as never);
      if (no) AccessibilityInfo.setAccessibilityFocus(no);
    }
    rolarAteOAlvo(rolagem, alvo);
  }, [chave]);
}

export function Titulo({ texto }: { texto: string }) {
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: cores.texto,
        fontSize: tipografia.tamanho.tituloDeSeção,
        lineHeight: tipografia.lineHeight.tituloDeSeção,
        fontWeight: tipografia.peso.semibold,
      }}
    >
      {texto}
    </Text>
  );
}

export function Paragrafo({
  texto,
  secundario = false,
  selecionavel = false,
}: {
  texto: string;
  secundario?: boolean;
  selecionavel?: boolean;
}) {
  return (
    <Text
      selectable={selecionavel}
      style={{
        color: secundario ? cores.textoSecundario : cores.texto,
        fontSize: tipografia.tamanho.corpo,
        lineHeight: tipografia.lineHeight.corpo,
      }}
    >
      {texto}
    </Text>
  );
}

/** Bloco de carregamento anunciado como um só ("Carregando…"). */
export function Carregando({ cartoes = 2 }: { cartoes?: number }) {
  return (
    <View
      accessible
      accessibilityLabel={textos.gerais.carregando}
      accessibilityState={{ busy: true }}
      style={{ gap: espaco[3] }}
    >
      {Array.from({ length: cartoes }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: esqueletos idênticos e estáticos.
          key={i}
          style={{
            gap: espaco[2],
            padding: espaco[4],
            borderRadius: raio.md,
            borderWidth: 1,
            borderColor: cores.superficie,
          }}
        >
          <Esqueleto largura="40%" altura={14} />
          <Esqueleto altura={20} />
          <Esqueleto largura="70%" altura={14} />
        </View>
      ))}
    </View>
  );
}

/** Erro de um bloco, com "Tentar de novo". */
export function ErroDoBloco({
  mensagem,
  onTentarDeNovo,
}: {
  mensagem: string;
  onTentarDeNovo: () => void;
}) {
  return (
    <Aviso
      variante="erro"
      texto={mensagem}
      textoAcao={textos.gerais.tentarDeNovo}
      onAcao={onTentarDeNovo}
    />
  );
}

/** Tela inteira em estado de carregamento, erro ou "não encontrado". */
export function EstadoDeTela<T>({
  estado,
  vazio,
  children,
}: {
  estado: Estado<T>;
  vazio: ReactNode;
  children: (dados: T) => ReactNode;
}) {
  switch (estado.situacao) {
    case 'carregando':
      return <Carregando cartoes={1} />;
    case 'erro':
      return (
        <ErroDoBloco
          mensagem={estado.mensagem}
          onTentarDeNovo={estado.onTentarDeNovo}
        />
      );
    case 'vazio':
      return <>{vazio}</>;
    case 'ok':
      return <>{children(estado.dados)}</>;
  }
}

export function NaoEncontrado({ onVoltar }: { onVoltar?: () => void }) {
  return (
    <EstadoVazio
      icone="search-outline"
      titulo={textos.erros.nao_encontrado}
      textoAcao={onVoltar ? textos.gerais.voltar : undefined}
      onAcao={onVoltar}
    />
  );
}

/** Descrição com "Ler mais" quando passa de 5 linhas (medido na primeira renderização). */
export function DescricaoLonga({
  texto,
  rotuloMais,
  rotuloMenos,
}: {
  texto: string;
  rotuloMais: string;
  rotuloMenos: string;
}) {
  const [linhas, setLinhas] = useState<number | null>(null);
  const [expandida, setExpandida] = useState(false);
  const { focado, aoFocar, aoDesfocar } = useFoco();
  const longa = linhas !== null && linhas > LINHAS_DA_DESCRICAO;
  return (
    <View style={{ gap: espaco[1] }}>
      <Text
        numberOfLines={longa && !expandida ? LINHAS_DA_DESCRICAO : undefined}
        onTextLayout={(evento) => {
          if (linhas === null) setLinhas(evento.nativeEvent.lines.length);
        }}
        style={{
          color: cores.texto,
          fontSize: tipografia.tamanho.corpo,
          lineHeight: tipografia.lineHeight.corpo,
        }}
      >
        {texto}
      </Text>
      {longa ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expandida ? rotuloMenos : rotuloMais}
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
            {expandida ? rotuloMenos : rotuloMais}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Rótulo pequeno + valor, em uma linha que quebra. */
export function LinhaDeDado({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco[2] }}>
      <Text
        style={{
          color: cores.textoSecundario,
          fontSize: tipografia.tamanho.rotulo,
          lineHeight: tipografia.lineHeight.rotulo,
        }}
      >
        {rotulo}
      </Text>
      <Text
        style={{
          flexShrink: 1,
          color: cores.texto,
          fontSize: tipografia.tamanho.rotulo,
          lineHeight: tipografia.lineHeight.rotulo,
          fontWeight: tipografia.peso.semibold,
        }}
      >
        {valor}
      </Text>
    </View>
  );
}

/** Cartão da pessoa (autor): avatar decorativo, nome e cidade em texto; toque abre o perfil. */
export function CartaoDaPessoa({
  rotulo,
  nome,
  cidade,
  onPress,
}: {
  rotulo: string;
  nome: string;
  cidade: string;
  onPress: () => void;
}) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}: ${nome}, ${cidade}`}
      onPress={onPress}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
      style={({ pressed }) => [
        {
          minHeight: toqueMinimo,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco[3],
          padding: espaco[4],
          borderRadius: raio.md,
          borderWidth: 1,
          borderColor: cores.borda,
          backgroundColor: pressed ? cores.superficie : cores.fundo,
        },
        focado && estiloDeFoco,
      ]}
    >
      <Avatar nome={nome} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: cores.textoSecundario,
            fontSize: tipografia.tamanho.legenda,
            lineHeight: tipografia.lineHeight.legenda,
          }}
        >
          {rotulo}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: cores.texto,
            fontSize: tipografia.tamanho.corpo,
            lineHeight: tipografia.lineHeight.corpo,
            fontWeight: tipografia.peso.semibold,
          }}
        >
          {nome}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: cores.textoSecundario,
            fontSize: tipografia.tamanho.rotulo,
            lineHeight: tipografia.lineHeight.rotulo,
          }}
        >
          {cidade}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={cores.textoSecundario}
      />
    </Pressable>
  );
}

/** Autor em estado próprio: carregando e erro não derrubam o resto do detalhe. */
export function BlocoDoAutor({
  rotulo,
  autor,
  onAbrir,
}: {
  rotulo: string;
  autor: Estado<{ contaId: string; nome: string; cidade: string }>;
  onAbrir: (contaId: string) => void;
}) {
  switch (autor.situacao) {
    case 'carregando':
      return <Carregando cartoes={1} />;
    case 'erro':
      return (
        <ErroDoBloco
          mensagem={autor.mensagem}
          onTentarDeNovo={autor.onTentarDeNovo}
        />
      );
    case 'vazio':
      return null;
    case 'ok':
      return (
        <CartaoDaPessoa
          rotulo={rotulo}
          nome={autor.dados.nome}
          cidade={autor.dados.cidade}
          onPress={() => onAbrir(autor.dados.contaId)}
        />
      );
  }
}

/** Etiqueta de leitura (habilidade no perfil): não é tocável. */
export function Etiqueta({ texto }: { texto: string }) {
  return (
    <View
      style={{
        paddingVertical: espaco[1],
        paddingHorizontal: espaco[3],
        borderRadius: raio.lg,
        borderWidth: 1,
        borderColor: cores.borda,
        backgroundColor: cores.superficie,
      }}
    >
      <Text
        style={{
          color: cores.texto,
          fontSize: tipografia.tamanho.rotulo,
          lineHeight: tipografia.lineHeight.rotulo,
          fontWeight: tipografia.peso.medio,
        }}
      >
        {texto}
      </Text>
    </View>
  );
}
