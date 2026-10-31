import {
  notifyManager,
  type QueryClient,
  type QueryKey,
  useQueryClient,
} from '@tanstack/react-query';
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
  /**
   * O anúncio vivo (do cache das consultas) para o que está aberto na folha,
   * ou `null` se a rota não o tem (CA61, R8). Chamado a cada render: a folha
   * aberta mostra as ações do anúncio atual, e não as do momento do `abrir`.
   * Resposta de outro anúncio (outro `id` ou `tipo`) é ignorada.
   */
  readonly anuncioAtual?: (aberto: AnuncioDaFolha) => AnuncioDaFolha | null;
  /**
   * A consulta de onde sai o `anuncioAtual` (o detalhe ou a lista "minha").
   * Depois do 409 `trampo_nao_aberto`, o desfecho da releitura dela é o
   * `conflito` (CA61). Sem ela, vale o detalhe do trampo (`chaves.trampo`).
   */
  readonly consultaDoAtual?: QueryKey;
}

/**
 * A folha depois do 409 `trampo_nao_aberto` de Excluir (CA61, spec 3.4):
 * `relendo` enquanto a consulta do anúncio é relida; `relido` quando ela
 * voltou com sucesso (as ações já seguem o dado novo); `falhou` quando a
 * releitura não trouxe dado novo (erro que não é 404, ou nem saiu).
 * Se a releitura der 404, o anúncio sumiu: a folha fecha como num 404 da
 * própria ação, e não há `conflito`.
 */
export type ConflitoDaFolha = 'relendo' | 'relido' | 'falhou';

export interface AcoesDaFolha {
  /** `undefined` até o primeiro `abrir`. */
  readonly folha: PropsDaFolhaDeAcoes | undefined;
  readonly abrir: (anuncio: AnuncioDaFolha) => void;
  /** Resultado da última ação, para o `Toast`; `null` sem toast. */
  readonly toast: string | null;
  readonly fecharToast: () => void;
  /** Situação depois do 409 `trampo_nao_aberto`; `null` sem esse 409. */
  readonly conflito: ConflitoDaFolha | null;
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

/** Quantas respostas (boas e com erro) a consulta já recebeu. */
interface ContagemDaConsulta {
  readonly dados: number;
  readonly erros: number;
}

function contarRespostas(
  queryClient: QueryClient,
  consulta: QueryKey,
): ContagemDaConsulta {
  const estado = queryClient.getQueryState(consulta);
  return {
    dados: estado?.dataUpdateCount ?? 0,
    erros: estado?.errorUpdateCount ?? 0,
  };
}

/**
 * Desfecho da releitura de `consulta`, comparando as respostas de agora com as
 * de `antes`: a última que chegou decide. Nenhuma resposta nova (sem a
 * consulta no cache, ou pausada sem rede) conta como falha: não dá para dizer
 * que as opções foram atualizadas.
 */
function desfechoDaReleitura(
  queryClient: QueryClient,
  consulta: QueryKey,
  antes: ContagemDaConsulta,
): 'relido' | 'falhou' | 'sumiu' {
  const estado = queryClient.getQueryState(consulta);
  const agora = contarRespostas(queryClient, consulta);
  if (estado?.status === 'error' && agora.erros > antes.erros) {
    return ehNaoEncontrado(estado.error) ? 'sumiu' : 'falhou';
  }
  return agora.dados > antes.dados ? 'relido' : 'falhou';
}

/**
 * Contêiner da folha "Mais opções" (CA33): abre a folha de um anúncio, executa
 * Encerrar e Excluir depois do diálogo e conta o resultado.
 *
 * - `abrir(anuncio)` mostra a folha com as `acoesDoAnuncio` e a conexão do
 *   momento; Editar fecha a folha e chama `aoEditar`.
 * - Com `anuncioAtual`, a folha aberta segue o anúncio vivo (CA61): depois do
 *   409 `trampo_nao_aberto`, a recarga do detalhe deixa "Excluir"
 *   indisponível com o motivo, sem fechar e reabrir. Sem ela, vale o anúncio
 *   do `abrir`.
 * - Duas ações ao mesmo tempo (toque duplo, que chama o `onPress` duas vezes
 *   antes do novo render) viram uma só: `useRef`. Enquanto uma roda,
 *   `processando` diz qual é e a folha não fecha.
 * - Sucesso: `processando` volta a `null`, a folha fecha e o `toast` traz o
 *   resultado. Excluir também chama `aoExcluir`.
 * - 404 é "já removido": `toast` com `anuncio.jaNaoExiste`, o detalhe sai do
 *   cache (`esquecerConsultas`), as listas recarregam e `aoExcluir` é chamado.
 * - Outro erro: a folha continua aberta com `erro` (sem conexão, 429, excluir
 *   trampo que deixou de estar aberto ou texto genérico). O erro cru nunca
 *   chega à tela nem a log.
 * - Excluir um trampo que deixou de estar aberto (409 `trampo_nao_aberto`)
 *   também relê o detalhe e "meus trampos", e `conflito` conta como foi a
 *   releitura de `consultaDoAtual` (CA61). Se ela der 404, segue o caminho
 *   do 404 acima (toast `jaNaoExiste`, `aoExcluir` com `ja_removido`).
 * - Se a sessão mudou no meio (saída, expiração, outra conta), a folha fecha
 *   sem toast, sem callback e sem tocar no cache.
 */
export function useAcoesDoAnuncio({
  aoEditar,
  aoExcluir,
  anuncioAtual,
  consultaDoAtual,
}: OpcoesDasAcoesDoAnuncio): AcoesDaFolha {
  const { online } = useConexao();
  const { geracao } = useSessao();
  const queryClient = useQueryClient();
  const { mutateAsync: encerrarTrampo } = useEncerrarTrampo();
  const { mutateAsync: excluirTrampo } = useExcluirAnuncio('trampo');
  const { mutateAsync: excluirServico } = useExcluirAnuncio('servico');
  const emVoo = useRef(false);
  // O anúncio do último `abrir`; a folha mostra o vivo (`anuncioAtual`).
  const [aberto, setAberto] = useState<AnuncioDaFolha | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [processando, setProcessando] = useState<Acao | null>(null);
  const [erro, setErro] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [conflito, setConflito] = useState<ConflitoDaFolha | null>(null);
  // Cada `abrir` e cada ação começam uma rodada nova: o desfecho de uma
  // releitura antiga não mexe na folha de agora.
  const rodada = useRef(0);

  const abrir = useCallback((novo: AnuncioDaFolha) => {
    rodada.current += 1;
    setAberto(novo);
    setErro(undefined);
    setConflito(null);
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

  /** O anúncio já não existe (404): a folha fecha e o toast avisa. */
  const jaRemovido = useCallback(
    (alvo: AnuncioDaFolha) => {
      esquecer(alvo);
      setVisivel(false);
      setToast(textos.anuncio.jaNaoExiste);
      aoExcluir?.(alvo, 'ja_removido');
    },
    [aoExcluir, esquecer],
  );

  /**
   * Depois do 409 `trampo_nao_aberto` (candidatura, aceite ou encerramento
   * chegaram antes): relê o detalhe e "meus trampos" e conta em `conflito`
   * como foi a releitura da consulta de onde a folha tira o anúncio.
   */
  const reler = useCallback(
    (alvo: AnuncioDaFolha, geracaoAntes: number) => {
      const daRodada = rodada.current;
      const consulta = consultaDoAtual ?? chaves.trampo(alvo.id);
      const antes = contarRespostas(queryClient, consulta);
      setConflito('relendo');
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: chaves.trampo(alvo.id) }),
        queryClient.invalidateQueries({
          queryKey: chaves.meusTrampos(),
          refetchType: 'all',
        }),
      ]).then(() => {
        // Na fila do TanStack, depois do aviso da resposta aos componentes:
        // "Atualizamos as opções" só aparece com as ações já recalculadas.
        notifyManager.schedule(() => {
          if (daRodada !== rodada.current || geracaoAntes !== geracao()) {
            return;
          }
          const desfecho = desfechoDaReleitura(queryClient, consulta, antes);
          if (desfecho === 'sumiu') {
            setConflito(null);
            setErro(undefined);
            jaRemovido(alvo);
          } else {
            setConflito(desfecho);
          }
        });
      });
    },
    [consultaDoAtual, geracao, jaRemovido, queryClient],
  );

  const executar = useCallback(
    async (alvo: AnuncioDaFolha, acao: Acao) => {
      if (emVoo.current) {
        return;
      }
      emVoo.current = true;
      rodada.current += 1;
      const geracaoAntes = geracao();
      setErro(undefined);
      setConflito(null);
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
          jaRemovido(alvo);
        } else {
          setErro(mensagemDeErro(falha, acao, alvo));
          if (
            acao === 'excluir' &&
            alvo.tipo === 'trampo' &&
            chaveDoErro(falha, 'nenhum').geral === 'trampo_nao_aberto'
          ) {
            reler(alvo, geracaoAntes);
          }
        }
      } finally {
        emVoo.current = false;
        setProcessando(null);
      }
    },
    [
      aoExcluir,
      encerrarTrampo,
      jaRemovido,
      reler,
      excluirServico,
      excluirTrampo,
      geracao,
    ],
  );

  if (aberto === null) {
    return { folha: undefined, abrir, toast, fecharToast, conflito };
  }

  const vivo = anuncioAtual?.(aberto) ?? null;
  const anuncio =
    vivo !== null && vivo.id === aberto.id && vivo.tipo === aberto.tipo
      ? vivo
      : aberto;
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
  return { folha, abrir, toast, fecharToast, conflito };
}
