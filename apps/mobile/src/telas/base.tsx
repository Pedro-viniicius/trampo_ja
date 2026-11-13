import { Feather } from '@expo/vector-icons';
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
  BotaoDeIcone,
  Cabecalho,
  Esqueleto,
  EstadoVazio,
  FaixaDeDestaque,
  folgaDaBarraDeAbas,
  Logo,
} from '../componentes';
import {
  estiloDeFoco,
  type NomeDeIcone,
  useFoco,
  useMargensSeguras,
} from '../componentes/utilitarios';
import { texto as estiloDeTexto } from '../tema/texto';
import {
  cores,
  espaco,
  larguraMaxima,
  margemDaTela,
  raio,
  sombra,
  toqueMinimo,
} from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import type { Estado } from './tipos';

export const LINHAS_DA_DESCRICAO = 5;

/** Quanto o primeiro card do detalhe sobe sobre a faixa gradiente. */
const SOBREPOSICAO_DA_FAIXA = espaco['3xl'] + espaco.m;

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
        rolavel.scrollTo({ y: Math.max(0, y - espaco.xl), animated: false }),
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

/** Coluna de conteúdo: margem lateral de 24, espaçamento de 16 e largura máxima 560. */
export function Coluna({
  children,
  gap = espaco.m,
}: {
  children: ReactNode;
  gap?: number;
}) {
  return (
    <View
      style={{
        width: '100%',
        maxWidth: larguraMaxima,
        paddingHorizontal: margemDaTela,
        paddingVertical: espaco.m,
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
  rodape,
  children,
  acima,
  scrollRef,
  sobreposicao,
  aoMedirRodape,
  direita,
  comBarraDeAbas,
  subtitulo,
  raiz = false,
  faixa = false,
}: {
  titulo: string;
  /**
   * V2 (detalhes, quadro 05): no lugar do cabeçalho, a faixa gradiente rola
   * junto com o conteúdo, com voltar e `direita` por cima; o conteúdo sobe
   * sobre ela. O título da tela fica para o conteúdo (o `header` é o do card).
   */
  faixa?: boolean;
  /** V2: linha de apoio abaixo do título. */
  subtitulo?: string;
  /** V2: raiz de aba (título `h1`, sem voltar). */
  raiz?: boolean;
  onVoltar?: () => void;
  /**
   * Raiz de aba: o fim da rolagem ganha folga para nada ficar atrás da barra
   * de abas flutuante (altura + margens + 16). Padrão: o valor de `raiz`.
   */
  comBarraDeAbas?: boolean;
  /** Só a tela usa (ações); a faixa única fica na raiz (`NavegacaoRaiz`). */
  semConexao?: boolean;
  rodape?: ReactNode;
  children: ReactNode;
  /** Ações à direita do cabeçalho (ex.: "Mais opções"). */
  direita?: ReactNode;
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
  const margens = useMargensSeguras();
  return (
    <Pagina>
      {faixa ? null : (
        <Cabecalho
          titulo={titulo}
          subtitulo={subtitulo}
          raiz={raiz}
          onVoltar={onVoltar}
          direita={direita}
        />
      )}
      {acima}
      <ScrollView
        ref={rolagem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          alignItems: 'center',
          paddingBottom:
            (comBarraDeAbas ?? raiz) ? folgaDaBarraDeAbas(margens.bottom) : 0,
        }}
      >
        {faixa ? (
          <View style={{ alignSelf: 'stretch' }}>
            <FaixaDeDestaque onVoltar={onVoltar} direita={direita} />
          </View>
        ) : null}
        <ContextoDeRolagem.Provider value={rolagem}>
          <View
            style={{
              width: '100%',
              alignItems: 'center',
              marginTop: faixa ? -SOBREPOSICAO_DA_FAIXA : 0,
            }}
          >
            <Coluna>{children}</Coluna>
          </View>
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
  rodape,
  aoMedirRodape,
  ilustracao,
  subtitulo,
  children,
}: {
  titulo: string;
  onVoltar?: () => void;
  /**
   * V2 (quadro 02): ilustração no topo do conteúdo. Com ela, o título vira
   * `h1` centralizado abaixo da ilustração e o topo fica só com o voltar.
   */
  ilustracao?: ReactNode;
  /** Linha de apoio abaixo do título (só com `ilustracao`). */
  subtitulo?: string;
  /** Só a tela usa (ações); a faixa única fica na raiz (`NavegacaoRaiz`). */
  semConexao?: boolean;
  rodape: ReactNode;
  /** Recebe a altura do rodapé fixo (para o toast não cobri-lo). */
  aoMedirRodape?: (altura: number) => void;
  children: ReactNode;
}) {
  const rolagem = useRef<ComponentRef<typeof ScrollView>>(null);
  return (
    <Pagina>
      {ilustracao ? (
        <SoVoltar onVoltar={onVoltar} />
      ) : (
        <Cabecalho titulo={titulo} onVoltar={onVoltar} />
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={rolagem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ alignItems: 'center' }}
        >
          <ContextoDeRolagem.Provider value={rolagem}>
            <Coluna>
              {ilustracao ? (
                <View
                  style={{
                    alignItems: 'center',
                    gap: espaco.s,
                    marginBottom: espaco.s,
                  }}
                >
                  {ilustracao}
                  <Text
                    accessibilityRole="header"
                    style={[
                      estiloDeTexto('h1'),
                      { color: cores.texto, textAlign: 'center' },
                    ]}
                  >
                    {titulo}
                  </Text>
                  {subtitulo ? (
                    <Text
                      style={[
                        estiloDeTexto('corpoG'),
                        { color: cores.textoSecundario, textAlign: 'center' },
                      ]}
                    >
                      {subtitulo}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {children}
            </Coluna>
          </ContextoDeRolagem.Provider>
        </ScrollView>
        <RodapeFixo aoMedir={aoMedirRodape}>{rodape}</RodapeFixo>
      </KeyboardAvoidingView>
    </Pagina>
  );
}

/** Topo só com o voltar (telas cujo título está no conteúdo). */
function SoVoltar({ onVoltar }: { onVoltar?: () => void }) {
  const margens = useMargensSeguras();
  return (
    <View
      style={{
        minHeight: margens.top + espaco.s,
        paddingTop: margens.top + espaco.s,
        paddingHorizontal: margemDaTela,
        alignItems: 'flex-start',
      }}
    >
      {onVoltar ? (
        <BotaoDeIcone
          icone="chevron-left"
          rotulo={textos.gerais.voltar}
          onPress={onVoltar}
        />
      ) : null}
    </View>
  );
}

/**
 * Ilustração de Entrar (quadro 02): a logo sobre um círculo roxo claro, com
 * duas formas decorativas. Só a logo é falada.
 */
export function IlustracaoDaMarca() {
  return (
    <View
      style={{
        width: 220,
        height: 180,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: cores.roxo[50],
        }}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: espaco.m,
          left: 0,
          width: 44,
          height: 44,
          borderRadius: raio.campo,
          backgroundColor: cores.azul[100],
          transform: [{ rotate: '-12deg' }],
        }}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: espaco.m,
          right: espaco.s,
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: cores.roxo[200],
        }}
      />
      <Logo tamanho="grande" />
    </View>
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
      style={[
        {
          alignItems: 'center',
          paddingBottom: margens.bottom,
          borderTopLeftRadius: raio.folha,
          borderTopRightRadius: raio.folha,
          backgroundColor: cores.superficie,
        },
        sombra.lg,
      ]}
    >
      <View
        style={{
          width: '100%',
          maxWidth: larguraMaxima,
          paddingVertical: espaco.m,
          paddingHorizontal: margemDaTela,
          gap: espaco.s,
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

/**
 * Montado dentro de `Formulario`/`Rolavel` (sob o contexto da rolagem), como o
 * `RolarAoTopo`: as telas que chamam o hook no próprio corpo ficam fora do
 * provider e não rolam.
 */
export function FocarPrimeiroErro({
  campos,
  tentativa,
}: {
  campos: readonly { ref: RefDeCampo; erro?: string }[];
  tentativa?: number;
}) {
  useFocarPrimeiroErro(campos, tentativa);
  return null;
}

/**
 * Leva a rolagem ao topo quando `ativo` passa a valer (ou `tentativa` muda
 * enquanto vale): avisos de topo, como conflito ou erro geral, ficam à vista.
 */
export function useRolarAoTopoQuando(ativo: boolean, tentativa?: number): void {
  const rolagem = useContext(ContextoDeRolagem);
  const chave = `${ativo}#${tentativa ?? 0}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `chave` resume `ativo` e `tentativa`; a rolagem é lida do contexto.
  useEffect(() => {
    if (!ativo) return;
    rolagem?.current?.scrollTo?.({ y: 0, animated: false });
  }, [chave]);
}

/** Montado dentro de `Formulario`/`Rolavel` (sob o contexto da rolagem). */
export function RolarAoTopo({
  quando,
  tentativa,
}: {
  quando: boolean;
  tentativa?: number;
}) {
  useRolarAoTopoQuando(quando, tentativa);
  return null;
}

export function Titulo({ texto }: { texto: string }) {
  return (
    <Text
      accessibilityRole="header"
      style={[estiloDeTexto('h2'), { color: cores.texto }]}
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
      style={[
        estiloDeTexto('corpo'),
        { color: secundario ? cores.textoSecundario : cores.texto },
      ]}
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
          style={[
            {
              gap: espaco.s,
              padding: espaco.m,
              borderRadius: raio.card,
              backgroundColor: cores.superficie,
            },
            sombra.sm,
          ]}
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
      icone="search"
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
    <View style={{ gap: espaco.xs }}>
      <Text
        numberOfLines={longa && !expandida ? LINHAS_DA_DESCRICAO : undefined}
        onTextLayout={(evento) => {
          if (linhas === null) setLinhas(evento.nativeEvent.lines.length);
        }}
        style={[estiloDeTexto('corpo'), { color: cores.texto }]}
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
            style={[
              estiloDeTexto('corpo', 'negrito'),
              { color: cores.primaria, textDecorationLine: 'underline' },
            ]}
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s }}>
      <Text style={[estiloDeTexto('corpo'), { color: cores.textoSecundario }]}>
        {rotulo}
      </Text>
      <Text
        style={[
          estiloDeTexto('corpo', 'semibold'),
          { flexShrink: 1, color: cores.texto },
        ]}
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
          gap: espaco.m - 4,
          padding: espaco.m,
          borderRadius: raio.card,
          backgroundColor: pressed ? cores.tinta[50] : cores.superficie,
        },
        pressed ? sombra.md : sombra.sm,
        focado && estiloDeFoco,
      ]}
    >
      <Avatar nome={nome} />
      <View style={{ flex: 1 }}>
        <Text
          style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
        >
          {rotulo}
        </Text>
        <Text
          numberOfLines={1}
          style={[estiloDeTexto('h3'), { color: cores.texto }]}
        >
          {nome}
        </Text>
        <Text
          numberOfLines={1}
          style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
        >
          {cidade}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={cores.textoSecundario} />
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
        paddingVertical: espaco.xs + 2,
        paddingHorizontal: espaco.m - 4,
        borderRadius: raio.pill,
        backgroundColor: cores.azul[50],
      }}
    >
      <Text
        style={[estiloDeTexto('corpo', 'semibold'), { color: cores.azul[700] }]}
      >
        {texto}
      </Text>
    </View>
  );
}

/** Card branco V2 (raio 24, sombra pequena) para agrupar um bloco da tela. */
export function Cartao({
  children,
  gap = espaco.m,
}: {
  children: ReactNode;
  gap?: number;
}) {
  return (
    <View
      style={[
        {
          gap,
          padding: espaco.l - 4,
          borderRadius: raio.card,
          backgroundColor: cores.superficie,
        },
        sombra.sm,
      ]}
    >
      {children}
    </View>
  );
}

/** Ladrilho de dado (quadro 05): ícone azul, rótulo em legenda e valor em negrito. */
export function LadrilhoDeDado({
  icone,
  rotulo,
  valor,
}: {
  icone: NomeDeIcone;
  rotulo: string;
  valor: string;
}) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 96,
        gap: espaco.xs,
        padding: espaco.m - 4,
        borderRadius: raio.campo,
        backgroundColor: cores.fundo,
      }}
    >
      <Feather name={icone} size={20} color={cores.primaria} />
      <Text
        style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
      >
        {rotulo}
      </Text>
      <Text style={[estiloDeTexto('corpo', 'negrito'), { color: cores.texto }]}>
        {valor}
      </Text>
    </View>
  );
}

/** Linha de ladrilhos que quebra em telas estreitas. */
export function LadrilhosDeDados({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s }}>
      {children}
    </View>
  );
}

/**
 * Rodapé com o valor à esquerda (legenda + `h3`) e o botão principal no resto
 * da largura (quadros 05 e 13). Sem `valor`, só o botão.
 */
export function ComValorAoLado({
  rotulo,
  valor,
  children,
}: {
  rotulo: string;
  valor?: string | null;
  children: ReactNode;
}) {
  if (!valor) return <>{children}</>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.m }}>
      <View style={{ maxWidth: '40%' }}>
        <Text
          style={[estiloDeTexto('legenda'), { color: cores.textoSecundario }]}
        >
          {rotulo}
        </Text>
        <Text
          numberOfLines={1}
          style={[estiloDeTexto('h3'), { color: cores.texto }]}
        >
          {valor}
        </Text>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** Título de bloco dentro de um card (`h3`). */
export function TituloDoCartao({ texto }: { texto: string }) {
  return (
    <Text
      accessibilityRole="header"
      style={[estiloDeTexto('h3'), { color: cores.texto }]}
    >
      {texto}
    </Text>
  );
}

/** Lista com marcador em ícone (decorativo); cada item é um parágrafo. */
export function ListaComMarcadores({
  itens,
  icone = 'check',
  corDoIcone = cores.primaria,
}: {
  itens: readonly string[];
  icone?: NomeDeIcone;
  corDoIcone?: string;
}) {
  return (
    <View style={{ gap: espaco.s }}>
      {itens.map((item) => (
        <View
          key={item}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: espaco.s,
          }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ paddingTop: 3 }}
          >
            <Feather name={icone} size={16} color={corDoIcone} />
          </View>
          <View style={{ flex: 1 }}>
            <Paragrafo texto={item} />
          </View>
        </View>
      ))}
    </View>
  );
}
