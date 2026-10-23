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
  /**
   * Impressão da conta que expirou (D43). A `rota` só vale para um login da
   * mesma conta (`rotaParaAConta`). Ausente: sessão sem impressão.
   */
  readonly conta?: string;
}

/**
 * O que `useSessao()` expõe. Não há token aqui (CA15): ele só passa pela
 * porta `ArmazenamentoDeToken`.
 */
export interface Sessao {
  readonly status: StatusDaSessao;
  /**
   * Grava o token e a impressão do `email` (D43) e passa a `autenticado`
   * (CA1). Sem `email`, a sessão fica sem impressão.
   */
  entrar(token: string, email?: string): Promise<void>;
  /**
   * Passa a anônimo, apaga o token, a impressão e o cache sem esperar a rede
   * (S6) e só então dispara o `DELETE /sessoes` em segundo plano, com o token
   * capturado antes de apagar. A falha desse pedido é engolida. Nunca
   * rejeita.
   */
  sair(): Promise<void>;
  /**
   * Sessão recusada pela API (CA14): apaga o token, limpa o cache e guarda
   * em memória a rota de retorno, o aviso e a impressão da conta.
   * Idempotente; nunca rejeita.
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

/**
 * Impressão da conta (D43): hash não criptográfico (cyrb53, 53 bits, em
 * hexadecimal) do e-mail aparado e em minúsculas. Só serve para saber se o
 * novo login é da mesma conta; não protege o e-mail e nunca vai para log, URL
 * ou parâmetro de rota.
 */
export function impressaoDaConta(email: string): string {
  const texto = email.trim().toLowerCase();
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i += 1) {
    const codigo = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ codigo, 2654435761);
    h2 = Math.imul(h2 ^ codigo, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const valor = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return valor.toString(16).padStart(14, '0');
}

/**
 * A rota de retorno, se o login com `email` é da mesma conta que expirou
 * (CA50). Sem `conta` no retorno, devolve a rota: isso só acontece quando a
 * sessão que expirou veio de `entrar` sem e-mail ou de uma porta sem
 * `lerConta`, e nenhum dos dois ocorre em produção (o login, em
 * `consultas/conta.ts`, sempre passa o e-mail, e a porta real tem `lerConta`;
 * token sem impressão vira conta ilegível). Com outra conta, `undefined`: o
 * guarda da raiz leva ao Início.
 */
export function rotaParaAConta(
  retorno: RetornoDaSessao,
  email: string,
): string | undefined {
  if (retorno.conta === undefined) {
    return retorno.rota;
  }
  return retorno.conta === impressaoDaConta(email) ? retorno.rota : undefined;
}

/**
 * Impressão de uma conta que não se conseguiu ler da porta. Nunca é igual a
 * uma impressão de verdade (hexadecimal): o retorno cai no Início.
 */
const CONTA_ILEGIVEL = 'ilegivel';

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
  /** Impressão da conta da sessão autenticada, para guardar no retorno. */
  const contaAtual = useRef<string | undefined>(undefined);
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
        const conta = contaAtual.current;
        retorno.current = {
          ...(segura !== undefined && { rota: segura }),
          aviso: 'sessao_expirada',
          ...(conta !== undefined && { conta }),
        };
      }
      contaAtual.current = undefined;
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
    enfileirar(async () => {
      const token = await armazenamento.ler();
      if (!token) {
        return { token, conta: undefined };
      }
      if (armazenamento.lerConta === undefined) {
        // Porta sem impressão (só em testes): a sessão fica sem conta.
        return { token, conta: undefined };
      }
      let conta: string;
      try {
        // Todo login grava a impressão junto do token, e a sessão sem ela
        // (anterior à L3) cai pelo marcador de instalação. Token sem
        // impressão é estado inesperado: a conta é tratada como ilegível.
        conta = (await armazenamento.lerConta()) ?? CONTA_ILEGIVEL;
      } catch {
        // Sem como saber a conta: o retorno de uma expiração cai no Início
        // (falha fechada), e a sessão continua.
        conta = CONTA_ILEGIVEL;
      }
      return { token, conta };
    }).then(
      ({ token, conta }) => {
        if (montado && statusAtual.current === 'carregando') {
          if (token) {
            contaAtual.current = conta;
          }
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
    async (token: string, email?: string) => {
      if (typeof token !== 'string' || token === '') {
        throw new Error('token ausente');
      }
      const conta =
        typeof email === 'string' && email.trim() !== ''
          ? impressaoDaConta(email)
          : undefined;
      await enfileirar(() => armazenamento.gravar(token, conta));
      contaAtual.current = conta;
      geracaoAtual.current += 1;
      // O aviso de sessão expirada perde o sentido; a rota (com a conta a que
      // ela pertence) fica para o login que ainda não a consumiu.
      const { rota, conta: contaDaRota } = retorno.current;
      retorno.current =
        rota === undefined
          ? {}
          : { rota, ...(contaDaRota !== undefined && { conta: contaDaRota }) };
      definirStatus('autenticado');
    },
    [armazenamento, definirStatus, enfileirar],
  );

  const sair = useCallback(async () => {
    retorno.current = {};
    contaAtual.current = undefined;
    geracaoAtual.current += 1;
    definirStatus('anonimo');
    queryClient.clear();
    // Captura e apaga na mesma operação da fila: um login que entre na fila
    // depois nunca tem o token novo capturado nem apagado.
    const token = await enfileirar(async () => {
      let capturado: string | null = null;
      try {
        capturado = await armazenamento.ler();
      } catch {
        // Porta ilegível: sem token para revogar; apaga mesmo assim.
      }
      try {
        await armazenamento.apagar();
      } catch {
        // Sem log (CA15); ver `limparLocal`.
      }
      return capturado;
    });
    // Algo pode ter entrado no cache enquanto o token era apagado.
    queryClient.clear();
    if (token) {
      // Em segundo plano (S6): a saída local já aconteceu, e a falha (rede,
      // 401 de sessão já revogada) não aparece em lugar nenhum. O 401 deste
      // pedido não expira a sessão: `DELETE /sessoes` é rota de entrada no
      // cliente, e a porta já não guarda este token.
      void sairDaApi(cliente, token).catch(() => undefined);
    }
  }, [armazenamento, cliente, definirStatus, enfileirar, queryClient]);

  const encerrarPorExclusao = useCallback(async () => {
    retorno.current = { aviso: 'conta_excluida' };
    contaAtual.current = undefined;
    geracaoAtual.current += 1;
    definirStatus('anonimo');
    await limparLocal();
  }, [definirStatus, limparLocal]);

  const consumirRetorno = useCallback((): RetornoDaSessao => {
    const { rota, aviso, conta } = retorno.current;
    retorno.current = {};
    return {
      ...(rota !== undefined && { rota }),
      ...(aviso !== undefined && { aviso }),
      ...(conta !== undefined && { conta }),
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
