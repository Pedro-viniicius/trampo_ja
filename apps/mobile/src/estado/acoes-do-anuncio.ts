import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { ehErroDaApi } from '../api/erros';
import type { StatusDoTrampo } from '../api/tipos';
import type { PropsDaFolhaDeAcoes } from '../telas/tipos';
import { textos } from '../textos/pt-BR';
import { useConexao } from './conexao';
import {
  esquecerConsultas,
  useEncerrarTrampo,
  useExcluirAnuncio,
} from './consultas/anuncios';
import { chaves } from './consultas/chaves';
import { chaveDoErro } from './erros';
import { useSessao } from './sessao';

/** O que a regra das ações precisa saber de um serviço. */
export interface ServicoParaAcoes {
  readonly tipo: 'servico';
}

/** O que a regra das ações precisa saber de um trampo do autor. */
export interface TrampoParaAcoes {
  readonly tipo: 'trampo';
  readonly status: StatusDoTrampo;
  /**
   * Quantas candidaturas o trampo recebeu (só vem na visão do autor). Ausente
   * conta como zero: a API recusa com 409 `trampo_nao_editavel` se errarmos.
   */
  readonly candidaturasRecebidas?: number;
}

export type AnuncioParaAcoes = ServicoParaAcoes | TrampoParaAcoes;

/** As ações da folha "Mais opções" e as mensagens dos diálogos. */
export type AcoesDoAnuncio = Pick<
  PropsDaFolhaDeAcoes,
  'editar' | 'encerrar' | 'excluir' | 'efeitoDoEncerrar' | 'efeitoDoExcluir'
>;

const DISPONIVEL = { disponivel: true } as const;

function indisponivel(motivo: string) {
  return { disponivel: false, motivo } as const;
}

/**
 * Regras da folha "Mais opções" (D30, D34), puras:
 *
 * - Trampo: Editar só se `aberto` e sem candidaturas; Encerrar só para
 *   `aberto` ou `em_andamento` (para `encerrado` a ação nem existe); Excluir
 *   só se `aberto`.
 * - Serviço: sempre Editar e Excluir; não tem Encerrar.
 * - Ação que a regra libera fica desabilitada sem conexão
 *   (`motivoSemConexao`). Ação que a regra já nega mantém o motivo da regra:
 *   conectar-se não a liberaria.
 *
 * `efeitoDoEncerrar` e `efeitoDoExcluir` são as mensagens dos diálogos;
 * `efeitoDoEncerrar` é vazio quando não há Encerrar.
 */
export function acoesDoAnuncio(
  anuncio: AnuncioParaAcoes,
  online: boolean,
): AcoesDoAnuncio {
  const liberar = (motivoDaRegra: string | null) =>
    motivoDaRegra !== null
      ? indisponivel(motivoDaRegra)
      : online
        ? DISPONIVEL
        : indisponivel(textos.anuncio.motivoSemConexao);

  if (anuncio.tipo === 'servico') {
    return {
      editar: liberar(null),
      excluir: liberar(null),
      efeitoDoEncerrar: '',
      efeitoDoExcluir: textos.anuncio.excluirServicoTexto,
    };
  }

  const { status } = anuncio;
  const candidaturas = anuncio.candidaturasRecebidas ?? 0;

  let motivoDeEditar: string | null = null;
  if (status === 'encerrado') {
    motivoDeEditar = textos.anuncio.motivoEditarEncerrado;
  } else if (status === 'em_andamento') {
    motivoDeEditar = textos.anuncio.motivoEditarEmAndamento;
  } else if (candidaturas > 0) {
    motivoDeEditar = textos.anuncio.motivoEditarComCandidaturas;
  }

  const motivoDeExcluir =
    status === 'aberto' ? null : textos.anuncio.motivoExcluirNaoAberto;

  return {
    editar: liberar(motivoDeEditar),
    ...(status !== 'encerrado' && { encerrar: liberar(null) }),
    excluir: liberar(motivoDeExcluir),
    efeitoDoEncerrar:
      status === 'aberto'
        ? textos.anuncio.encerrarTextoAberto
        : status === 'em_andamento'
          ? textos.anuncio.encerrarTextoEmAndamento
          : '',
    efeitoDoExcluir: textos.anuncio.excluirTrampoTexto(candidaturas),
  };
}

/** Anúncio aberto na folha: o que a regra precisa, o id e o título. */
export type AnuncioDaFolha = AnuncioParaAcoes & {
  readonly id: string;
  /** Rótulo da folha. Texto da pessoa: fica só no estado do componente. */
  readonly titulo: string;
};

/** Como o anúncio deixou de estar na tela depois da ação. */
export type MotivoDaSaida = 'excluido' | 'ja_removido';

export interface OpcoesDasAcoesDoAnuncio {
  /** Editar: a rota decide para onde ir. A folha já foi fechada. */
  readonly aoEditar: (anuncio: AnuncioDaFolha) => void;
  /**
   * O anúncio deixou de existir (excluído, ou a API respondeu 404 a um
   * encerrar ou excluir): o detalhe aberto volta, por exemplo. Não é chamado
   * se a sessão mudou no meio.
   */
  readonly aoExcluir?: (anuncio: AnuncioDaFolha, motivo: MotivoDaSaida) => void;
}

export interface AcoesDaFolha {
  /** `undefined` até o primeiro `abrir`. */
  readonly folha: PropsDaFolhaDeAcoes | undefined;
  readonly abrir: (anuncio: AnuncioDaFolha) => void;
  /** Resultado da última ação, para o `Toast`; `null` sem toast. */
  readonly toast: string | null;
  readonly fecharToast: () => void;
}

type Acao = 'encerrar' | 'excluir';

/** Mensagem da folha para um erro que não é 404. */
function mensagemDeErro(
  erro: unknown,
  acao: Acao,
  anuncio: AnuncioDaFolha,
): string {
  const { geral } = chaveDoErro(erro, 'nenhum');
  if (geral === 'sem_conexao' || geral === 'muitas_tentativas_acao') {
    return textos.erros[geral];
  }
  if (
    acao === 'excluir' &&
    anuncio.tipo === 'trampo' &&
    geral === 'trampo_nao_aberto'
  ) {
    return textos.anuncio.motivoExcluirNaoAberto;
  }
  return acao === 'encerrar'
    ? textos.anuncio.erroAoEncerrar
    : textos.anuncio.erroAoExcluir;
}

function ehNaoEncontrado(erro: unknown): boolean {
  return ehErroDaApi(erro) && erro.status === 404;
}

/**
 * Contêiner da folha "Mais opções" (CA33): abre a folha de um anúncio, executa
 * Encerrar e Excluir depois do diálogo e conta o resultado.
 *
 * - `abrir(anuncio)` mostra a folha com as `acoesDoAnuncio` e a conexão do
 *   momento; Editar fecha a folha e chama `aoEditar`.
 * - Duas ações ao mesmo tempo (toque duplo, que chama o `onPress` duas vezes
 *   antes do novo render) viram uma só: `useRef`. Enquanto uma roda,
 *   `processando` diz qual é e a folha não fecha.
 * - Sucesso: `processando` volta a `null`, a folha fecha e o `toast` traz o
 *   resultado. Excluir também chama `aoExcluir`.
 * - 404 é "já removido": `toast` com `anuncio.jaNaoExiste`, o detalhe sai do
 *   cache (`esquecerConsultas`), as listas recarregam e `aoExcluir` é chamado.
 * - Outro erro: a folha continua aberta com `erro` (sem conexão, 429, excluir
 *   trampo que deixou de estar aberto ou texto genérico). Excluir um trampo
 *   que deixou de estar aberto também recarrega o detalhe e "meus trampos". O erro cru nunca
 *   chega à tela nem a log.
 * - Se a sessão mudou no meio (saída, expiração, outra conta), a folha fecha
 *   sem toast, sem callback e sem tocar no cache.
 */
export function useAcoesDoAnuncio({
  aoEditar,
  aoExcluir,
}: OpcoesDasAcoesDoAnuncio): AcoesDaFolha {
  const { online } = useConexao();
  const { geracao } = useSessao();
  const queryClient = useQueryClient();
  const { mutateAsync: encerrarTrampo } = useEncerrarTrampo();
  const { mutateAsync: excluirTrampo } = useExcluirAnuncio('trampo');
  const { mutateAsync: excluirServico } = useExcluirAnuncio('servico');
  const emVoo = useRef(false);
  const [anuncio, setAnuncio] = useState<AnuncioDaFolha | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [processando, setProcessando] = useState<Acao | null>(null);
  const [erro, setErro] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  const abrir = useCallback((novo: AnuncioDaFolha) => {
    setAnuncio(novo);
    setErro(undefined);
    setVisivel(true);
  }, []);

  const fecharToast = useCallback(() => setToast(null), []);

  const aoFechar = useCallback(() => {
    if (!emVoo.current) {
      setVisivel(false);
    }
  }, []);

  /** O anúncio já não existe: sai do cache e as listas recarregam. */
  const esquecer = useCallback(
    (alvo: AnuncioDaFolha) => {
      if (alvo.tipo === 'trampo') {
        esquecerConsultas(queryClient, [
          chaves.trampo(alvo.id),
          chaves.candidaturasRecebidas(alvo.id),
        ]);
        void queryClient.invalidateQueries({
          queryKey: chaves.meusTrampos(),
          refetchType: 'all',
        });
        void queryClient.invalidateQueries({
          queryKey: chaves.recentes('trampos'),
          refetchType: 'active',
        });
      } else {
        esquecerConsultas(queryClient, [chaves.servico(alvo.id)]);
        void queryClient.invalidateQueries({
          queryKey: chaves.meusServicos(),
          refetchType: 'all',
        });
        void queryClient.invalidateQueries({
          queryKey: chaves.recentes('servicos'),
          refetchType: 'active',
        });
      }
      void queryClient.invalidateQueries({
        queryKey: chaves.todasAsBuscas(),
        refetchType: 'active',
      });
    },
    [queryClient],
  );

  const executar = useCallback(
    async (alvo: AnuncioDaFolha, acao: Acao) => {
      if (emVoo.current) {
        return;
      }
      emVoo.current = true;
      const geracaoAntes = geracao();
      setErro(undefined);
      setProcessando(acao);
      try {
        if (acao === 'encerrar') {
          await encerrarTrampo(alvo.id);
        } else if (alvo.tipo === 'trampo') {
          await excluirTrampo(alvo.id);
        } else {
          await excluirServico(alvo.id);
        }
        setVisivel(false);
        if (geracaoAntes !== geracao()) {
          return;
        }
        if (acao === 'encerrar') {
          setToast(textos.anuncio.trampoEncerrado);
        } else {
          setToast(
            alvo.tipo === 'trampo'
              ? textos.anuncio.trampoExcluido
              : textos.anuncio.servicoExcluido,
          );
          aoExcluir?.(alvo, 'excluido');
        }
      } catch (falha) {
        if (geracaoAntes !== geracao()) {
          setVisivel(false);
        } else if (ehNaoEncontrado(falha)) {
          esquecer(alvo);
          setVisivel(false);
          setToast(textos.anuncio.jaNaoExiste);
          aoExcluir?.(alvo, 'ja_removido');
        } else {
          if (
            acao === 'excluir' &&
            alvo.tipo === 'trampo' &&
            chaveDoErro(falha, 'nenhum').geral === 'trampo_nao_aberto'
          ) {
            // O trampo deixou de estar aberto (candidatura, aceite ou
            // encerramento): o detalhe e a lista trazem o estado novo.
            void queryClient.invalidateQueries({
              queryKey: chaves.trampo(alvo.id),
            });
            void queryClient.invalidateQueries({
              queryKey: chaves.meusTrampos(),
              refetchType: 'all',
            });
          }
          setErro(mensagemDeErro(falha, acao, alvo));
        }
      } finally {
        emVoo.current = false;
        setProcessando(null);
      }
    },
    [
      aoExcluir,
      encerrarTrampo,
      esquecer,
      queryClient,
      excluirServico,
      excluirTrampo,
      geracao,
    ],
  );

  if (anuncio === null) {
    return { folha: undefined, abrir, toast, fecharToast };
  }

  const acoes = acoesDoAnuncio(anuncio, online);
  const folha: PropsDaFolhaDeAcoes = {
    visivel,
    titulo: anuncio.titulo,
    tipo: anuncio.tipo,
    ...acoes,
    processando,
    ...(erro !== undefined && { erro }),
    onEditar: () => {
      if (!acoes.editar.disponivel || emVoo.current) {
        return;
      }
      setVisivel(false);
      aoEditar(anuncio);
    },
    onEncerrar: () => {
      if (acoes.encerrar?.disponivel === true) {
        void executar(anuncio, 'encerrar');
      }
    },
    onExcluir: () => {
      if (acoes.excluir.disponivel) {
        void executar(anuncio, 'excluir');
      }
    },
    onFechar: aoFechar,
  };
  return { folha, abrir, toast, fecharToast };
}
