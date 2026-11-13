/**
 * Tokens de design do Trampo Já, versão V2 (spec: docs/produto/specs/visual-v2.md, seção "Tokens V2").
 * Origem das cores: "marca" = definida pelo dono (logo); o resto foi escolhido pelo designer para
 * passar no contraste WCAG AA (o teste em tokens.test.ts prova).
 * As chaves antigas (`primaria`, `texto`, `fundo`, `espaco[1..6]`, `raio.sm/md/lg`, `tipografia.tamanho`...)
 * seguem existindo como apelidos dos valores novos, para as telas migrarem aos poucos.
 */

/** Escalas de cor. */
const azul = {
  50: '#EEF5FF',
  100: '#D9E9FE',
  200: '#B3D3FD',
  300: '#7DB4FB',
  400: '#4797F8',
  /** marca (dono). Só decorativo, foco e texto grande. */
  500: '#1A7FF6',
  /** botão, link, seleção. */
  600: '#0F6AD8',
  700: '#0B54AD',
  800: '#0C4588',
  900: '#0E3866',
  950: '#0A2342',
} as const;

const roxo = {
  50: '#F8F2FE',
  100: '#EFE2FD',
  200: '#DFC6FB',
  300: '#CBA0F7',
  400: '#BC85F4',
  /** marca (dono). Só decorativo e texto grande. */
  500: '#AF6FF1',
  600: '#9550E0',
  /** texto e ícone em roxo. */
  700: '#7A3BBF',
  800: '#632F9A',
  900: '#4F2A78',
  950: '#331650',
} as const;

const tinta = {
  /** superfície (card, campo). */
  0: '#FFFFFF',
  /** fundo do app. */
  50: '#F6F7FA',
  100: '#EEF0F5',
  /** divisor: só decoração (1,27:1), nunca borda de controle. */
  200: '#E1E4EC',
  300: '#C4C8D5',
  /** só decorativo: não usar em texto. */
  400: '#9AA0B4',
  /** apoio. */
  500: '#687189',
  /** legenda. */
  600: '#555B73',
  700: '#3A4057',
  /** texto. */
  900: '#161A2B',
  950: '#0D0F1A',
} as const;

/** Feedback: fundo claro, base (ícone, borda) e texto (4,5:1 sobre o fundo e sobre branco). */
const feedback = {
  sucesso: { fundo: '#DDF5E6', base: '#16A34A', texto: '#0B7A3D' },
  erro: { fundo: '#FEE4E2', base: '#F04438', texto: '#B42318' },
  alerta: { fundo: '#FEF0C7', base: '#F79009', texto: '#93370D' },
  informacao: { fundo: '#EEF5FF', base: '#1A7FF6', texto: '#0B54AD' },
} as const;

export const cores = {
  azul,
  roxo,
  tinta,
  feedback,
  /** dono. Só decorativo e texto grande; nunca texto pequeno sobre branco. */
  marcaAzul: azul[500],
  /** dono. Só decorativo e texto grande. */
  marcaRoxo: roxo[500],
  /** gradiente de marca (início, fim): só texto branco grande (>= 24 pt), ícone e fundo decorativo. */
  gradienteMarca: [azul[500], roxo[500]] as const,
  /** gradiente do botão principal, cartão de destaque, bolha enviada e avatar grande (texto branco passa AA). */
  gradienteAcao: [azul[600], roxo[600]] as const,
  /** pressionado do gradiente de ação. */
  gradienteAcaoPressionado: [azul[800], roxo[800]] as const,
  /** botão Urgente (opcional). */
  gradienteUrgencia: [roxo[700], roxo[800]] as const,
  /** apelido de gradienteMarca (nome antigo). */
  gradiente: [azul[500], roxo[500]] as const,
  /** botão, link, seleção. */
  primaria: azul[600],
  primariaPressionada: azul[700],
  /** texto, ícone e selo em roxo. */
  acento: roxo[700],
  /** fundo do app (V2: cinza claro; no V1 era branco). */
  fundo: tinta[50],
  /** card e campo (V2: branco; no V1 era cinza). */
  superficie: tinta[0],
  texto: tinta[900],
  textoSecundario: tinta[600],
  /** borda de campo e de controle em repouso (3:1 sobre branco e sobre o fundo). */
  bordaDeCampo: '#7E869C',
  /** apelido de bordaDeCampo (nome antigo). */
  borda: '#7E869C',
  /** divisor e borda decorativa (não passa 3:1; nunca em controle). */
  divisor: tinta[200],
  erro: feedback.erro.texto,
  sucesso: feedback.sucesso.texto,
  /** anel de foco: 2 px com 2 px de afastamento. */
  foco: azul[500],
  branco: '#FFFFFF',
} as const;

/** Ângulo dos gradientes (graus). */
export const anguloDoGradiente = 135;

/** Escala de espaço (grid de 8). As chaves numéricas são o apelido antigo (space-1..6). */
export const espaco = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  '4xl': 96,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
} as const;

/** Margem lateral das telas. */
export const margemDaTela = 24;

export const raio = {
  chip: 8,
  campo: 16,
  card: 24,
  folha: 32,
  pill: 999,
  /** apelidos antigos. */
  sm: 8,
  md: 12,
  lg: 20,
} as const;

type Sombra = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

/** Sombras com cor tinta.900 (nunca preto). shadowRadius ~ blur/2; no Android só vale `elevation`. */
export const sombra: Record<'sm' | 'md' | 'lg' | 'marca', Sombra> = {
  sm: {
    shadowColor: tinta[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: tinta[900],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: tinta[900],
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  marca: {
    shadowColor: azul[500],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 6,
  },
};

/** Movimento. Com "reduzir movimento": sem escala, deslizamento, mola e brilho; troca vira opacidade em 120 ms. */
export const movimento = {
  pressaoEscala: 0.97,
  pressaoMs: 120,
  entradaDeTelaMs: 280,
  folhaMs: 320,
  opacidadeMs: 200,
  reduzidoMs: 120,
  esqueletoMs: 1400,
  /** cubic-bezier(.2,.8,.2,1) */
  curva: [0.2, 0.8, 0.2, 1] as const,
  /** leve mola da folha: cubic-bezier(.2,.8,.2,1.2) */
  curvaDaFolha: [0.2, 0.8, 0.2, 1.2] as const,
} as const;

/** Famílias por peso (ADR-009): o nome é o mesmo chave de FONTES em ./fontes. */
const familia = {
  tituloSemibold: 'BricolageGrotesque_600SemiBold',
  tituloNegrito: 'BricolageGrotesque_700Bold',
  tituloExtra: 'BricolageGrotesque_800ExtraBold',
  normal: 'Figtree_400Regular',
  medio: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  negrito: 'Figtree_700Bold',
} as const;

type EstiloDeTexto = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  /** só o sobretítulo é forçado em caixa alta. */
  caixaAlta?: boolean;
};

/** Estilos de texto V2, em pontos. Nunca abaixo de 12 pt (12 só em sobretítulo, selo e rótulo de aba). */
const estilo: Record<
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'corpoG'
  | 'corpo'
  | 'legenda'
  | 'sobretitulo'
  | 'botao',
  EstiloDeTexto
> = {
  display: {
    fontFamily: familia.tituloExtra,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
  },
  h1: {
    fontFamily: familia.tituloNegrito,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.64,
  },
  h2: {
    fontFamily: familia.tituloNegrito,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.24,
  },
  h3: {
    fontFamily: familia.tituloSemibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: 0,
  },
  corpoG: {
    fontFamily: familia.normal,
    fontSize: 17,
    lineHeight: 26,
    letterSpacing: 0,
  },
  corpo: {
    fontFamily: familia.normal,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
  },
  legenda: {
    fontFamily: familia.medio,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  sobretitulo: {
    fontFamily: familia.negrito,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.96,
    caixaAlta: true,
  },
  botao: {
    fontFamily: familia.semibold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
  },
};

/**
 * `tamanho`, `lineHeight` e `peso` são os apelidos antigos (as telas ainda não migraram para `estilo`).
 * Os valores seguem a escala V2.
 */
export const tipografia = {
  familia,
  estilo,
  tamanho: {
    corpo: estilo.corpo.fontSize,
    rotulo: 14,
    tituloDeTela: estilo.h2.fontSize,
    tituloDeSeção: estilo.h3.fontSize,
    legenda: estilo.legenda.fontSize,
  },
  lineHeight: {
    corpo: estilo.corpo.lineHeight,
    rotulo: 20,
    tituloDeTela: estilo.h2.lineHeight,
    tituloDeSeção: estilo.h3.lineHeight,
    legenda: estilo.legenda.lineHeight,
  },
  peso: {
    normal: '400',
    medio: '500',
    semibold: '600',
    negrito: '700',
  },
} as const;

/** Alvo de toque mínimo (V2: 48). */
export const toqueMinimo = 48;

/** Largura máxima do conteúdo em telas largas. */
export const larguraMaxima = 560;
