// Estilos de texto prontos para `style` (ADR-009): a família de fonte só é
// escrita em `src/tema/`, então os componentes pedem o estilo aqui, com o peso
// quando precisam de outro (no Android, `fontWeight` não escolhe o arquivo da
// fonte: cada peso é uma família).
import type { TextStyle } from 'react-native';
import { tipografia } from './tokens';

export type EstiloTipografico = keyof typeof tipografia.estilo;
export type PesoTipografico = 'normal' | 'medio' | 'semibold' | 'negrito';

const TITULOS: ReadonlySet<EstiloTipografico> = new Set([
  'display',
  'h1',
  'h2',
  'h3',
]);

/** Bricolage só tem 600, 700 e 800: peso normal e médio de título caem no 600. */
const familiaDeTitulo: Record<PesoTipografico, string> = {
  normal: tipografia.familia.tituloSemibold,
  medio: tipografia.familia.tituloSemibold,
  semibold: tipografia.familia.tituloSemibold,
  negrito: tipografia.familia.tituloNegrito,
};

const familiaDeTexto: Record<PesoTipografico, string> = {
  normal: tipografia.familia.normal,
  medio: tipografia.familia.medio,
  semibold: tipografia.familia.semibold,
  negrito: tipografia.familia.negrito,
};

function montar(nome: EstiloTipografico, peso?: PesoTipografico): TextStyle {
  const { caixaAlta, ...base } = tipografia.estilo[nome];
  return {
    ...base,
    ...(caixaAlta ? { textTransform: 'uppercase' as const } : null),
    ...(peso
      ? {
          fontFamily: TITULOS.has(nome)
            ? familiaDeTitulo[peso]
            : familiaDeTexto[peso],
        }
      : null),
  };
}

const cache = new Map<string, TextStyle>();

/**
 * Estilo de texto V2 (`display` a `botao`), opcionalmente com outro peso.
 * Ex.: `texto('corpo', 'negrito')` = Figtree 700, 15/22.
 */
export function texto(
  nome: EstiloTipografico,
  peso?: PesoTipografico,
): TextStyle {
  const chave = `${nome}:${peso ?? ''}`;
  let estilo = cache.get(chave);
  if (!estilo) {
    estilo = montar(nome, peso);
    cache.set(chave, estilo);
  }
  return estilo;
}

/** Iniciais do avatar: Bricolage 700 num tamanho livre. */
export function textoDeIniciais(tamanho: number): TextStyle {
  return {
    fontFamily: tipografia.familia.tituloNegrito,
    fontSize: tamanho,
    lineHeight: Math.round(tamanho * 1.2),
  };
}

/**
 * Só família e tamanho de um estilo (ex.: `headerTitleStyle` do cabeçalho
 * nativo, que não aceita `lineHeight` nem `letterSpacing`).
 */
export function fonteETamanho(nome: EstiloTipografico): {
  fontFamily: string;
  fontSize: number;
} {
  const { fontFamily, fontSize } = tipografia.estilo[nome];
  return { fontFamily, fontSize };
}
