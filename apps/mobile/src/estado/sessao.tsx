import type { QueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type ClienteHttp,
  criarCliente,
  type FuncaoFetch,
} from '../api/cliente';
import { urlDaApi } from '../api/config';
import { sair as sairDaApi } from '../api/contas';
import type { ChaveDeErro } from '../textos/pt-BR';
import type { ArmazenamentoDeToken } from './armazenamento-token';

export type StatusDaSessao = 'carregando' | 'anonimo' | 'autenticado';

/** Para onde voltar depois de entrar de novo, e o aviso a mostrar no login. */
export interface RetornoDaSessao {
  readonly rota?: string;
  readonly aviso?: ChaveDeErro;
}

/**
 * O que `useSessao()` expõe. Não há token aqui (CA15): ele só passa pela
 * porta `ArmazenamentoDeToken`.
 */
export interface Sessao {
  readonly status: StatusDaSessao;
  /** Grava o token e passa a `autenticado` (CA1). */
  entrar(token: string): Promise<void>;
  /**
   * `DELETE /sessoes` e, mesmo se falhar, apaga o token e limpa o cache.
   * Nunca rejeita.
   */
  sair(): Promise<void>;
  /**
   * Sessão recusada pela API (CA14): apaga o token, limpa o cache e guarda
   * em memória a rota de retorno e o aviso. Idempotente; nunca rejeita.
   */
  expirar(rotaAtual?: string): Promise<void>;
  /**
   * A conta acabou de ser excluída (CA17): guarda o aviso `conta_excluida`
   * para o login (sem rota de retorno), muda a geração, passa a anônimo e
   * apaga o token e o cache. Não chama a rede: a API já derrubou todas as
   * sessões, e um 401 atrasado é ignorado porque o token saiu da porta.
   * Nunca rejeita.
   */
  encerrarPorExclusao(): Promise<void>;
  /** Devolve o retorno guardado e o zera. */
  consumirRetorno(): RetornoDaSessao;
  /**
   * Número da sessão atual: muda a cada entrar, sair, expirar e
   * encerrarPorExclusao. Quem começa algo assíncrono guarda o número e, na
   * volta, só grava no cache se ainda for o mesmo (a resposta pode ser de uma
   * conta que já saiu).
   */
  geracao(): number;
}

export interface PropsDoSessaoProvider {
  readonly armazenamento: ArmazenamentoDeToken;
  readonly queryClient: QueryClient;
  /** Padrão: `globalThis.fetch`. Os testes passam o fake. */
  readonly fetch?: FuncaoFetch;
  /** Padrão: `urlDaApi()` (`EXPO_PUBLIC_API_URL`). */
  readonly urlBase?: string;
  /**
   * Rota em que a pessoa está, lida quando um 401 expira a sessão (o cliente
   * HTTP não conhece a rota). A raiz do app passa o `usePathname()`.
   */
  readonly obterRotaAtual?: () => string | undefined;
  readonly children: ReactNode;
}

/** Tamanho máximo da rota de retorno guardada. */
const TAMANHO_MAXIMO_DA_ROTA = 200;

/**
 * Só caminho interno: começa com uma `/` (não `//`, que seria outro host),
 * sem barra invertida, espaço ou caractere de controle. Query e fragmento são
 * descartados, porque podem levar texto digitado (dado pessoal); a rota leva
 * só ids.
 */
export function rotaDeRetornoSegura(
  rota: string | undefined,
): string | undefined {
  if (typeof rota !== 'string') {
    return undefined;
  }
  const caminho = rota.split(/[?#]/, 1)[0] ?? '';
  if (
    caminho.length > TAMANHO_MAXIMO_DA_ROTA ||
    !/^\/(?!\/)[^\s\\]*$/.test(caminho) ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: recusa caractere de controle na rota.
    /[\u0000-\u001f\u007f]/.test(caminho)
  ) {
    return undefined;
  }
  return caminho;
}

const ContextoDaSessao = createContext<{
  readonly sessao: Sessao;
  readonly cliente: ClienteHttp;
} | null>(null);

function fetchGlobal(): FuncaoFetch {
  return (url, init) => globalThis.fetch(url, init);
}

/**
 * Sessão do app: carrega o token da porta na montagem, cria o `ClienteHttp`
 * (com `obterToken` lendo a porta a cada requisição e `aoExpirar` expirando
 * a sessão só se o token recusado ainda for o atual) e expõe `useSessao()` e
 * `useCliente()`.
 *
 * As operações no armazenamento rodam em fila, na ordem em que foram
 * pedidas: um `apagar` de uma expiração atrasada nunca passa por cima do
 * `gravar` de um login feito depois.
 */
export function SessaoProvider({
  armazenamento,
  queryClient,
  fetch,
  urlBase,
  obterRotaAtual,
  children,
}: PropsDoSessaoProvider) {
  const [status, setStatus] = useState<StatusDaSessao>('carregando');
  const statusAtual = useRef<StatusDaSessao>('carregando');
  const retorno = useRef<RetornoDaSessao>({});
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const geracaoAtual = useRef(0);
  const rotaAtual = useRef(obterRotaAtual);
  rotaAtual.current = obterRotaAtual;

  const definirStatus = useCallback((novo: StatusDaSessao) => {
    statusAtual.current = novo;
    setStatus(novo);
  }, []);

  const enfileirar = useCallback(
    <T,>(operacao: () => Promise<T>): Promise<T> => {
      const resultado = fila.current.then(() => operacao());
      fila.current = resultado.catch(() => undefined);
      return resultado;
    },
    [],
  );

  /** Apaga o token e o cache. Falha ao apagar não impede a saída. */
  const limparLocal = useCallback(async () => {
    queryClient.clear();
    try {
      await enfileirar(() => armazenamento.apagar());
    } catch {
      // Sem log (CA15). O token que sobrar é recusado pela API no próximo
      // uso, e o 401 expira a sessão de novo.
    }
    // Algo pode ter entrado no cache enquanto o token era apagado.
    queryClient.clear();
  }, [armazenamento, enfileirar, queryClient]);

  /** Guarda o retorno (só se havia sessão) e passa a anônimo. */
  const encerrarPorExpiracao = useCallback(
    (rota: string | undefined) => {
      if (statusAtual.current === 'autenticado') {
        const segura = rotaDeRetornoSegura(rota);
        retorno.current = {
          ...(segura !== undefined && { rota: segura }),
          aviso: 'sessao_expirada',
        };
      }
      geracaoAtual.current += 1;
      if (statusAtual.current !== 'anonimo') {
        definirStatus('anonimo');
      }
    },
    [definirStatus],
  );

  const expirar = useCallback(
    async (rota?: string) => {
      encerrarPorExpiracao(rota);
      await limparLocal();
    },
    [encerrarPorExpiracao, limparLocal],
  );

  /**
   * 401 de uma requisição feita com `tokenUsado`. Confere e apaga na mesma
   * operação da fila: se a porta já guarda outro token (login feito depois)
   * ou nenhum (saída ou expiração anterior), o 401 é de uma sessão que já
   * acabou e é ignorado; e um login que entre na fila depois nunca tem o
   * token novo apagado por este 401.
   */
  const expirarSeForAtual = useCallback(
    async (tokenUsado: string, rota: string | undefined) => {
      const daSessaoAtual = await enfileirar(async () => {
        try {
          if ((await armazenamento.ler()) !== tokenUsado) {
            return false;
          }
        } catch {
          // Porta ilegível: sem como comparar, expira (falha fechada).
        }
        try {
          await armazenamento.apagar();
        } catch {
          // Sem log (CA15); ver `limparLocal`.
        }
        return true;
      });
      if (!daSessaoAtual) {
        return;
      }
      encerrarPorExpiracao(rota);
      queryClient.clear();
    },
    [armazenamento, encerrarPorExpiracao, enfileirar, queryClient],
  );

  const expirarSeForAtualRef = useRef(expirarSeForAtual);
  expirarSeForAtualRef.current = expirarSeForAtual;

  const cliente = useMemo(
    () =>
      criarCliente({
        fetch: fetch ?? fetchGlobal(),
        urlBase: urlBase ?? urlDaApi(),
        obterToken: () => enfileirar(() => armazenamento.ler()),
        aoExpirar: (tokenUsado) => {
          void expirarSeForAtualRef.current(tokenUsado, rotaAtual.current?.());
        },
      }),
    [armazenamento, enfileirar, fetch, urlBase],
  );

  useEffect(() => {
    let montado = true;
    enfileirar(() => armazenamento.ler()).then(
      (token) => {
        if (montado && statusAtual.current === 'carregando') {
          definirStatus(token ? 'autenticado' : 'anonimo');
        }
      },
      () => {
        // Keychain ilegível: começa sem sessão, sem log (CA15).
        if (montado && statusAtual.current === 'carregando') {
          definirStatus('anonimo');
        }
      },
    );
    return () => {
      montado = false;
    };
  }, [armazenamento, definirStatus, enfileirar]);

  const entrar = useCallback(
    async (token: string) => {
      if (typeof token !== 'string' || token === '') {
        throw new Error('token ausente');
      }
      await enfileirar(() => armazenamento.gravar(token));
      geracaoAtual.current += 1;
      // O aviso de sessão expirada perde o sentido; a rota fica para o login
      // que ainda não a consumiu.
      const { rota } = retorno.current;
      retorno.current = rota === undefined ? {} : { rota };
      definirStatus('autenticado');
    },
    [armazenamento, definirStatus, enfileirar],
  );

  const sair = useCallback(async () => {
    try {
      await sairDaApi(cliente);
    } catch {
      // Falha de rede ou sessão já revogada: a saída local acontece igual.
    }
    retorno.current = {};
    geracaoAtual.current += 1;
    definirStatus('anonimo');
    await limparLocal();
  }, [cliente, definirStatus, limparLocal]);

  const encerrarPorExclusao = useCallback(async () => {
    retorno.current = { aviso: 'conta_excluida' };
    geracaoAtual.current += 1;
    definirStatus('anonimo');
    await limparLocal();
  }, [definirStatus, limparLocal]);

  const consumirRetorno = useCallback((): RetornoDaSessao => {
    const { rota, aviso } = retorno.current;
    retorno.current = {};
    return {
      ...(rota !== undefined && { rota }),
      ...(aviso !== undefined && { aviso }),
    };
  }, []);

  const geracao = useCallback(() => geracaoAtual.current, []);

  const valor = useMemo(
    () => ({
      sessao: {
        status,
        entrar,
        sair,
        expirar,
        encerrarPorExclusao,
        consumirRetorno,
        geracao,
      },
      cliente,
    }),
    [
      status,
      entrar,
      sair,
      expirar,
      encerrarPorExclusao,
      consumirRetorno,
      geracao,
      cliente,
    ],
  );

  return (
    <ContextoDaSessao.Provider value={valor}>
      {children}
    </ContextoDaSessao.Provider>
  );
}

function useContextoDaSessao(gancho: string) {
  const contexto = useContext(ContextoDaSessao);
  if (contexto === null) {
    throw new Error(`${gancho} precisa estar dentro de <SessaoProvider>`);
  }
  return contexto;
}

/** Estado e ações da sessão. Lança fora do `SessaoProvider`. */
export function useSessao(): Sessao {
  return useContextoDaSessao('useSessao').sessao;
}

/** O `ClienteHttp` da sessão. Lança fora do `SessaoProvider`. */
export function useCliente(): ClienteHttp {
  return useContextoDaSessao('useCliente').cliente;
}
