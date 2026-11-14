import { useCallback, useEffect, useState } from 'react';
import { textos } from '../textos/pt-BR';
import { useSessao } from './sessao';

/**
 * Quanto tempo o aviso espera a tela de destino aparecer. Passado isso, a
 * pessoa já fez outra coisa e o aviso não faz mais sentido.
 */
export const VALIDADE_DO_AVISO_MS = 10_000;

/**
 * Avisos que uma tela deixa para a anterior mostrar ao voltar. Só a chave
 * viaja (como o aviso do login em `RetornoDaSessao`): o texto sai de
 * `textos` na hora de mostrar, e nada do que a pessoa digitou passa por aqui.
 */
export type ChaveDeAvisoDeRetorno =
  | 'alteracoes_salvas'
  | 'trampo_excluido'
  | 'servico_excluido'
  | 'ja_nao_existe'
  | 'avaliacao_enviada'
  | 'avaliacao_enviada_sem_favorito';

const TEXTO_DO_AVISO: Readonly<Record<ChaveDeAvisoDeRetorno, string>> = {
  alteracoes_salvas: textos.anuncio.alteracoesSalvas,
  trampo_excluido: textos.anuncio.trampoExcluido,
  servico_excluido: textos.anuncio.servicoExcluido,
  ja_nao_existe: textos.anuncio.jaNaoExiste,
  // V2b (CA96, CA98): a avaliação foi enviada; ou foi, mas a equipe favorita
  // não recebeu a pessoa. Nesse caso o aviso diz que a avaliação foi (o cartão
  // "Avaliado com N ★" a confirma), para ninguém tentar reenviar.
  avaliacao_enviada: textos.avaliar.enviada,
  avaliacao_enviada_sem_favorito: textos.avaliar.enviadaSemFavorito,
};

interface AvisoPendente {
  readonly chave: ChaveDeAvisoDeRetorno;
  /** `Sessao.geracao()` de quem avisou. */
  readonly geracao: number;
  readonly expiraEm: number;
}

// Memória do módulo: o aviso passa de uma rota para outra e não sobrevive ao
// fechamento do app.
let pendente: AvisoPendente | null = null;
const ouvintes = new Set<() => void>();

/**
 * Deixa o aviso para a próxima tela que o pedir (`useAvisoDeRetorno`). Vale
 * por `VALIDADE_DO_AVISO_MS` e só na sessão `geracao`: quem sai ou expira e
 * entra de novo não vê o aviso da conta anterior. Um aviso novo substitui o
 * anterior.
 */
export function avisarAoVoltar(
  chave: ChaveDeAvisoDeRetorno,
  geracao: number,
): void {
  pendente = { chave, geracao, expiraEm: Date.now() + VALIDADE_DO_AVISO_MS };
  for (const ouvinte of [...ouvintes]) ouvinte();
}

/** Esquece o aviso que ninguém mostrou (saída da conta, testes). */
export function esquecerAvisoDeRetorno(): void {
  pendente = null;
}

/** Entrega o aviso à `geracao` (uma vez) ou o joga fora se não serve mais. */
function retirar(geracao: number): ChaveDeAvisoDeRetorno | null {
  const aviso = pendente;
  if (aviso === null) return null;
  if (aviso.geracao !== geracao || Date.now() >= aviso.expiraEm) {
    // Vencido ou de outra sessão: não serve a ninguém.
    pendente = null;
    return null;
  }
  pendente = null;
  return aviso.chave;
}

export interface AvisoDeRetorno {
  /** Texto a mostrar, ou `null`. */
  readonly texto: string | null;
  /** Esconde o aviso (a pessoa fechou ou ele já foi visto). */
  readonly limpar: () => void;
}

/**
 * O aviso que a tela seguinte deixou ao voltar (ex.: "Alterações salvas." ao
 * sair de Editar). Enquanto `ativa` é falso (a tela está sob outra), nada é
 * entregue; quando vira verdadeiro, o aviso pendente da sessão atual, ainda
 * dentro do prazo, passa a ser o `texto`. Cada aviso aparece uma vez. Se a
 * sessão muda com o aviso na tela, ele some.
 */
export function useAvisoDeRetorno(ativa: boolean): AvisoDeRetorno {
  const { geracao } = useSessao();
  const [mostrado, setMostrado] = useState<{
    readonly chave: ChaveDeAvisoDeRetorno;
    readonly geracao: number;
  } | null>(null);

  useEffect(() => {
    if (!ativa) return undefined;
    const buscar = () => {
      const atual = geracao();
      const chave = retirar(atual);
      if (chave !== null) setMostrado({ chave, geracao: atual });
    };
    buscar();
    ouvintes.add(buscar);
    return () => {
      ouvintes.delete(buscar);
    };
  }, [ativa, geracao]);

  const limpar = useCallback(() => setMostrado(null), []);

  const texto =
    mostrado !== null && mostrado.geracao === geracao()
      ? TEXTO_DO_AVISO[mostrado.chave]
      : null;
  return { texto, limpar };
}
