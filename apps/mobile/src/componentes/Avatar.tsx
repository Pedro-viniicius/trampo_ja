import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { textoDeIniciais } from '../tema/texto';
import { cores, sombra } from '../tema/tokens';
import { pontosDoGradiente } from './utilitarios';

export type PropsDoAvatar = {
  nome: string;
  /** Lado em pontos (40, 48, 56, 64 ou 96). */
  tamanho?: number;
  /** Sem identidade (perfil indisponível): mostra "?" em cor neutra. */
  neutro?: boolean;
  /**
   * `pessoa` (padrão): cor pelo nome. `destaque`: perfil grande, gradiente de
   * ação com leve giro. `empresa`: tinta 900 com iniciais brancas.
   */
  variante?: 'pessoa' | 'destaque' | 'empresa';
};

/** Pares fundo/texto (>= 4,5:1) escolhidos pelo nome: sempre o mesmo para a mesma pessoa. */
const pares = [
  { fundo: cores.azul[100], texto: cores.azul[700] },
  { fundo: cores.roxo[100], texto: cores.roxo[700] },
  { fundo: cores.feedback.sucesso.fundo, texto: cores.feedback.sucesso.texto },
  { fundo: cores.feedback.alerta.fundo, texto: cores.feedback.alerta.texto },
] as const;

function hash(texto: string): number {
  let h = 0;
  for (const c of texto) h = (h * 31 + (c.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

/** Até duas iniciais: primeira e última palavra ("Ana Maria Silva" = "AS"). */
export function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = Array.from(palavras[0] ?? '')[0] ?? '';
  const ultima =
    palavras.length > 1
      ? (Array.from(palavras[palavras.length - 1] ?? '')[0] ?? '')
      : '';
  const resultado = `${primeira}${ultima}`.toLocaleUpperCase('pt-BR');
  return resultado || '?';
}

/** Decorativo: o nome sempre aparece em texto ao lado (spec). */
export function Avatar({
  nome,
  tamanho = 48,
  neutro = false,
  variante = 'pessoa',
}: PropsDoAvatar) {
  const letras = neutro ? '?' : iniciais(nome);
  const par = pares[hash(nome.trim()) % pares.length] ?? pares[0];
  const corDoTexto = neutro || variante !== 'pessoa' ? cores.branco : par.texto;
  const fundo = neutro
    ? cores.textoSecundario
    : variante === 'empresa'
      ? cores.tinta[900]
      : par.fundo;
  const lado = { width: tamanho, height: tamanho, borderRadius: tamanho / 3 };
  const conteudo = (
    <Text
      allowFontScaling={false}
      style={[
        textoDeIniciais(
          Math.round(tamanho * (letras.length > 1 ? 0.36 : 0.42)),
        ),
        { color: corDoTexto },
      ]}
    >
      {letras}
    </Text>
  );

  if (variante === 'destaque' && !neutro) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[lado, sombra.marca, { transform: [{ rotate: '-4deg' }] }]}
      >
        <LinearGradient
          colors={[...cores.gradienteAcao]}
          {...pontosDoGradiente}
          style={[lado, { alignItems: 'center', justifyContent: 'center' }]}
        >
          {conteudo}
        </LinearGradient>
      </View>
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        lado,
        {
          backgroundColor: fundo,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      {conteudo}
    </View>
  );
}
