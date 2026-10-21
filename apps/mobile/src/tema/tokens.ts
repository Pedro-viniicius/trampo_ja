/**
 * Tokens de design do Trampo Já (spec: docs/produto/specs/mvp-trampo-ja.md).
 * Origem das cores: "dono" = extraída da logo e definida pelo dono; "derivado" = escurecida
 * pelo designer para passar no contraste WCAG AA (o teste em tokens.test.ts prova).
 */

export const cores = {
  /** dono. Só decorativo e texto grande; nunca texto pequeno sobre branco. */
  marcaAzul: '#1A7FF6',
  /** dono. Só decorativo e texto grande. */
  marcaRoxo: '#AF6FF1',
  /** dono: gradiente 90° azul -> roxo (início, fim). Cabeçalho da Entrada, progresso, splash. */
  gradiente: ['#1A7FF6', '#AF6FF1'] as const,
  /** derivado do azul do dono: botão primário, links, seleção, foco. */
  primaria: '#0B5FD0',
  /** derivado: estado pressionado do botão primário. */
  primariaPressionada: '#0A4FB0',
  /** derivado do roxo do dono: texto, ícone e selo em roxo. */
  acento: '#7A3FC4',
  fundo: '#FFFFFF',
  superficie: '#F3F5F9',
  texto: '#1B1F27',
  textoSecundario: '#4B5563',
  /** borda de campo (3:1 sobre o fundo). */
  borda: '#7A8496',
  erro: '#B3261E',
  sucesso: '#1B7A43',
  /** anel de foco: 2 px com 2 px de offset. */
  foco: '#0B5FD0',
  branco: '#FFFFFF',
} as const;

/** Escala de espaçamento (space-1..6). */
export const espaco = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
} as const;

export const raio = {
  sm: 8,
  md: 12,
  lg: 20,
} as const;

const alturaDeLinha = (tamanho: number): number => Math.round(tamanho * 1.4);

/** Fonte do sistema (decisão D14); a fonte do protótipo segue pendente. */
export const tipografia = {
  tamanho: {
    corpo: 16,
    rotulo: 14,
    tituloDeTela: 22,
    tituloDeSeção: 18,
    legenda: 13,
  },
  /** line-height 1,4, em valor absoluto por tamanho. */
  lineHeight: {
    corpo: alturaDeLinha(16),
    rotulo: alturaDeLinha(14),
    tituloDeTela: alturaDeLinha(22),
    tituloDeSeção: alturaDeLinha(18),
    legenda: alturaDeLinha(13),
  },
  peso: {
    normal: '400',
    medio: '500',
    semibold: '600',
    negrito: '700',
  },
} as const;

/** Alvo de toque mínimo (touch-min). */
export const toqueMinimo = 44;

/** Largura máxima do conteúdo em telas largas. */
export const larguraMaxima = 560;
