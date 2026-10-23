import {
  notifyManager,
  onlineManager,
  QueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ErroDaApi, ErroDeRede } from '../../api/erros';
import type {
  CandidaturaRecebida,
  EntradaDeCandidatura,
  EntradaDeServico,
  EntradaDeTrampo,
  MinhaCandidatura,
  PerfilPublico,
  Servico,
  Trampo,
} from '../../api/tipos';
import type { RespostaFalsa } from '../../testes/fetch-falso';
import {
  criarProvedores as criarProvedoresBase,
  type OpcoesDosProvedores,
} from '../../testes/renderizar';
import {
  type ArmazenamentoEmMemoria,
  criarArmazenamentoEmMemoria,
} from '../armazenamento-token';
import { TEMPO_FRESCO_MS } from '../cliente-de-consultas';
import { useSessao } from '../sessao';
import {
  type ContextoDaMutacao,
  TETO_DA_RECARGA_MS,
  useEditarServico,
  useEditarTrampo,
  useEncerrarTrampo,
  useExcluirAnuncio,
  useMeusServicos,
  useMeusTrampos,
  useOfertarServico,
  usePublicarTrampo,
  useServico,
  useTrampo,
  useTramposPorIds,
} from './anuncios';
import { useRecentes } from './busca';
import {
  useAceitarCandidatura,
  useCandidatar,
  useCandidaturasRecebidas,
  useMinhasCandidaturas,
  useRetirarCandidatura,
} from './candidaturas';
import { chaves } from './chaves';
import { usePerfilPublico, usePerfisPublicos } from './perfil';

const TOKEN = 'token-da-sessao-123';
const TOKEN_NOVO = 'token-novo-456';
const BEARER = `Bearer ${TOKEN}`;

function trampo(id: string, extras: Partial<Trampo> = {}): Trampo {
  return {
    id,
    autorId: 'conta-autora',
    titulo: `Trampo ${id}`,
    descricao: 'Pintar a sala',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 15_000,
    prazo: null,
    status: 'aberto',
    criadoEm: '2026-10-01T10:00:00.000Z',
    ...extras,
  };
}

function servico(id: string, extras: Partial<Servico> = {}): Servico {
  return {
    id,
    autorId: 'conta-autora',
    titulo: `Serviço ${id}`,
    descricao: 'Faço reparos',
    categoria: 'reformas',
    cidade: null,
    precoBaseCentavos: 8_000,
    status: 'ativo',
    criadoEm: '2026-10-01T10:00:00.000Z',
    ...extras,
  };
}

function recebida(id: string): CandidaturaRecebida {
  return {
    id,
    freelancerId: `conta-${id}`,
    mensagem: 'Posso amanhã',
    valorPropostoCentavos: 12_000,
    status: 'pendente',
    criadaEm: '2026-10-02T10:00:00.000Z',
  };
}

function minha(id: string, trampoId: string): MinhaCandidatura {
  return { ...recebida(id), trampoId };
}

function perfil(contaId: string): PerfilPublico {
  return {
    contaId,
    nome: `Pessoa ${contaId}`,
    cidade: 'Lavras',
    descricao: null,
    habilidades: [],
  };
}

const ENTRADA_TRAMPO: EntradaDeTrampo = {
  titulo: 'Pintar a sala',
  descricao: 'Sala de 12 m²',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 15_000,
  prazo: '2026-12-31',
};

const ENTRADA_SERVICO: EntradaDeServico = {
  titulo: 'Reparos em geral',
  descricao: 'Faço pequenos reparos',
  categoria: 'reformas',
  precoBaseCentavos: 8_000,
};

const ENTRADA_CANDIDATURA: EntradaDeCandidatura = {
  mensagem: 'Posso amanhã cedo',
  valorPropostoCentavos: 12_000,
};

/**
 * Como `criarQueryClientDeTeste`, mas as mutações também não são coletadas
 * por tempo (o gc de 5 min segura o jest aberto). `staleTime` opcional, para
 * reproduzir o dado fresco do app (`TEMPO_FRESCO_MS`).
 */
function criarQueryClient(staleTime = 0): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime },
      mutations: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  });
}

function criarProvedores(opcoes: OpcoesDosProvedores = {}) {
  const armazenamento = opcoes.armazenamento ?? criarArmazenamentoEmMemoria();
  return {
    ...criarProvedoresBase({
      queryClient: criarQueryClient(),
      ...opcoes,
      armazenamento,
    }),
    armazenamento: armazenamento as ArmazenamentoEmMemoria,
  };
}

function autenticado(opcoes: OpcoesDosProvedores = {}) {
  return criarProvedores({
    armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    ...opcoes,
  });
}

type Provedores = ReturnType<typeof criarProvedores>;

// O TanStack avisa os componentes num `setTimeout(0)`: sem esperar por ele,
// a última notificação de um teste cai fora do `act`.
afterEach(async () => {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
});

/** Monta o hook e espera a sessão sair de `carregando`. */
async function montar<T>(hook: () => T, provedores: Provedores) {
  const resultado = await renderHook(
    () => ({ sessao: useSessao(), dados: hook() }),
    { wrapper: provedores.wrapper },
  );
  await waitFor(() =>
    expect(resultado.result.current.sessao.status).not.toBe('carregando'),
  );
  return resultado;
}

function requisicoesPara(
  provedores: Provedores,
  metodo: string,
  caminho: string,
) {
  return provedores.fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

describe('consultas das listas da conta (CA4, CA6, CA8, CA14)', () => {
  it('useMeusTrampos faz GET /trampos/meus com o Bearer', async () => {
    const provedores = autenticado();
    const lista = [trampo('t1'), trampo('t2', { status: 'em_andamento' })];
    provedores.fetch.responder('GET /trampos/meus', { corpo: lista });
    const { result } = await montar(useMeusTrampos, provedores);

    await waitFor(() => expect(result.current.dados.trampos).toEqual(lista));
    expect(provedores.fetch.ultima()).toMatchObject({
      metodo: 'GET',
      caminho: '/trampos/meus',
    });
    expect(provedores.fetch.ultima().cabecalhos.authorization).toBe(BEARER);
  });

  it('useMeusServicos faz GET /servicos/meus com o Bearer', async () => {
    const provedores = autenticado();
    const lista = [servico('s1')];
    provedores.fetch.responder('GET /servicos/meus', { corpo: lista });
    const { result } = await montar(useMeusServicos, provedores);

    await waitFor(() => expect(result.current.dados.servicos).toEqual(lista));
    expect(provedores.fetch.ultima().caminho).toBe('/servicos/meus');
    expect(provedores.fetch.ultima().cabecalhos.authorization).toBe(BEARER);
  });

  it('useMinhasCandidaturas faz GET /candidaturas/minhas com o Bearer', async () => {
    const provedores = autenticado();
    const lista = [minha('c1', 't1')];
    provedores.fetch.responder('GET /candidaturas/minhas', { corpo: lista });
    const { result } = await montar(useMinhasCandidaturas, provedores);

    await waitFor(() =>
      expect(result.current.dados.candidaturas).toEqual(lista),
    );
    expect(provedores.fetch.ultima().caminho).toBe('/candidaturas/minhas');
    expect(provedores.fetch.ultima().cabecalhos.authorization).toBe(BEARER);
  });

  it('useCandidaturasRecebidas faz GET /trampos/:id/candidaturas com o id codificado', async () => {
    const provedores = autenticado();
    const lista = [recebida('c1'), recebida('c2')];
    provedores.fetch.responder('GET /trampos/t%2F1/candidaturas', {
      corpo: lista,
    });
    const { result } = await montar(
      () => useCandidaturasRecebidas('t/1'),
      provedores,
    );

    await waitFor(() =>
      expect(result.current.dados.candidaturas).toEqual(lista),
    );
    expect(provedores.fetch.ultima().cabecalhos.authorization).toBe(BEARER);
  });

  it('useCandidaturasRecebidas de quem não é o autor: 404 sobe como ErroDaApi', async () => {
    const provedores = autenticado();
    const { result } = await montar(
      () => useCandidaturasRecebidas('t1'),
      provedores,
    );

    await waitFor(() =>
      expect(result.current.dados.erro).toBeInstanceOf(ErroDaApi),
    );
    expect((result.current.dados.erro as ErroDaApi).status).toBe(404);
    expect(result.current.dados.candidaturas).toBeNull();
  });

  it('useCandidaturasRecebidas não chama a API com habilitada: false e chama ao habilitar', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /trampos/t1/candidaturas', {
      corpo: [recebida('c1')],
    });
    const resultado = await renderHook(
      ({ habilitada }: { habilitada: boolean }) => ({
        sessao: useSessao(),
        dados: useCandidaturasRecebidas('t1', { habilitada }),
      }),
      { wrapper: provedores.wrapper, initialProps: { habilitada: false } },
    );
    await waitFor(() =>
      expect(resultado.result.current.sessao.status).toBe('autenticado'),
    );
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 20));
    });
    expect(provedores.fetch.requisicoes).toHaveLength(0);
    expect(resultado.result.current.dados.candidaturas).toBeNull();

    await resultado.rerender({ habilitada: true });

    await waitFor(() =>
      expect(resultado.result.current.dados.candidaturas).toHaveLength(1),
    );
    expect(
      requisicoesPara(provedores, 'GET', '/trampos/t1/candidaturas'),
    ).toHaveLength(1);
  });

  it('sem sessão autenticada nenhuma das listas da conta é pedida', async () => {
    const provedores = criarProvedores();
    const { result } = await montar(
      () => ({
        trampos: useMeusTrampos(),
        servicos: useMeusServicos(),
        minhas: useMinhasCandidaturas(),
        recebidas: useCandidaturasRecebidas('t1'),
      }),
      provedores,
    );
    expect(result.current.sessao.status).toBe('anonimo');
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 20));
    });

    expect(provedores.fetch.requisicoes).toHaveLength(0);
  });
});

/** O que os testes de mutação usam, igual para os quatro hooks. */
interface MutacaoDeTeste {
  readonly enviar: () => Promise<unknown>;
  readonly disparar: (aoTerSucesso: () => void) => void;
  readonly error: Error | null;
  readonly isPaused: boolean;
  readonly status: string;
}

function adaptar<TDados, TEntrada>(
  mutacao: UseMutationResult<TDados, Error, TEntrada, ContextoDaMutacao>,
  entrada: TEntrada,
): MutacaoDeTeste {
  return {
    enviar: () => mutacao.mutateAsync(entrada),
    disparar: (aoTerSucesso) =>
      mutacao.mutate(entrada, { onSuccess: aoTerSucesso }),
    error: mutacao.error,
    isPaused: mutacao.isPaused,
    status: mutacao.status,
  };
}

interface CasoDeMutacao {
  readonly nome: string;
  readonly usar: () => MutacaoDeTeste;
  /** Rota da mutação no fake (`'POST /trampos'`). */
  readonly rota: string;
  readonly resposta: RespostaFalsa;
  /** Caminho e corpo esperados da requisição. */
  readonly caminho: string;
  readonly corpo: unknown;
  readonly devolve: unknown;
  /** Chaves recarregadas (e esperadas) no sucesso, na ordem. */
  readonly essenciais: readonly QueryKey[];
  /** Chaves invalidadas sem esperar, na ordem. */
  readonly demais: readonly QueryKey[];
  /** Uma das chaves essenciais, para provar a recarga antes do `onSuccess`. */
  readonly lista: {
    readonly usar: () => unknown;
    readonly rota: string;
    readonly chave: QueryKey;
    readonly antes: unknown;
    readonly depois: unknown;
  };
}

const CASOS: readonly CasoDeMutacao[] = [
  {
    nome: 'usePublicarTrampo (CA4)',
    usar: () => adaptar(usePublicarTrampo(), ENTRADA_TRAMPO),
    rota: 'POST /trampos',
    resposta: { status: 201, corpo: { id: 't-novo', status: 'aberto' } },
    caminho: '/trampos',
    corpo: ENTRADA_TRAMPO,
    devolve: { id: 't-novo', status: 'aberto' },
    essenciais: [['meusTrampos']],
    demais: [['recentes', 'trampos'], ['busca']],
    lista: {
      usar: useMeusTrampos,
      rota: 'GET /trampos/meus',
      chave: chaves.meusTrampos(),
      antes: [],
      depois: [trampo('t-novo')],
    },
  },
  {
    nome: 'useOfertarServico (CA6)',
    usar: () => adaptar(useOfertarServico(), ENTRADA_SERVICO),
    rota: 'POST /servicos',
    resposta: { status: 201, corpo: { id: 's-novo', status: 'ativo' } },
    caminho: '/servicos',
    corpo: ENTRADA_SERVICO,
    devolve: { id: 's-novo', status: 'ativo' },
    essenciais: [['meusServicos']],
    demais: [['recentes', 'servicos'], ['busca']],
    lista: {
      usar: useMeusServicos,
      rota: 'GET /servicos/meus',
      chave: chaves.meusServicos(),
      antes: [],
      depois: [servico('s-novo')],
    },
  },
  {
    nome: 'useCandidatar (CA8)',
    usar: () => adaptar(useCandidatar('t1'), ENTRADA_CANDIDATURA),
    rota: 'POST /trampos/t1/candidaturas',
    resposta: { status: 201, corpo: { id: 'c-nova', status: 'pendente' } },
    caminho: '/trampos/t1/candidaturas',
    corpo: ENTRADA_CANDIDATURA,
    devolve: { id: 'c-nova', status: 'pendente' },
    essenciais: [['minhasCandidaturas']],
    demais: [],
    lista: {
      usar: useMinhasCandidaturas,
      rota: 'GET /candidaturas/minhas',
      chave: chaves.minhasCandidaturas(),
      antes: [],
      depois: [minha('c-nova', 't1')],
    },
  },
  {
    nome: 'useAceitarCandidatura (CA10)',
    usar: () => adaptar(useAceitarCandidatura('t1'), 'c1'),
    rota: 'POST /trampos/t1/candidaturas/c1/aceitar',
    resposta: { corpo: { status: 'aceita' } },
    caminho: '/trampos/t1/candidaturas/c1/aceitar',
    corpo: undefined,
    devolve: { status: 'aceita' },
    essenciais: [
      ['trampo', 't1'],
      ['candidaturasRecebidas', 't1'],
    ],
    demais: [['meusTrampos'], ['recentes', 'trampos'], ['busca']],
    lista: {
      usar: () => useTrampo('t1'),
      rota: 'GET /trampos/t1',
      chave: chaves.trampo('t1'),
      antes: trampo('t1'),
      depois: trampo('t1', { status: 'em_andamento' }),
    },
  },
  {
    nome: 'useEditarTrampo (CA32)',
    usar: () =>
      adaptar(useEditarTrampo('t1'), { ...ENTRADA_TRAMPO, versao: 3 }),
    rota: 'PUT /trampos/t1',
    resposta: { status: 204 },
    caminho: '/trampos/t1',
    corpo: { ...ENTRADA_TRAMPO, versao: 3 },
    devolve: undefined,
    essenciais: [['trampo', 't1'], ['meusTrampos']],
    demais: [['recentes', 'trampos'], ['busca']],
    lista: {
      usar: () => useTrampo('t1'),
      rota: 'GET /trampos/t1',
      chave: chaves.trampo('t1'),
      antes: trampo('t1', { versao: 3 }),
      depois: trampo('t1', { titulo: 'Pintar o quarto', versao: 4 }),
    },
  },
  {
    nome: 'useEditarServico (CA32)',
    usar: () =>
      adaptar(useEditarServico('s1'), { ...ENTRADA_SERVICO, versao: 2 }),
    rota: 'PUT /servicos/s1',
    resposta: { status: 204 },
    caminho: '/servicos/s1',
    corpo: { ...ENTRADA_SERVICO, versao: 2 },
    devolve: undefined,
    essenciais: [['servico', 's1'], ['meusServicos']],
    demais: [['recentes', 'servicos'], ['busca']],
    lista: {
      usar: () => useServico('s1'),
      rota: 'GET /servicos/s1',
      chave: chaves.servico('s1'),
      antes: servico('s1', { versao: 2 }),
      depois: servico('s1', { titulo: 'Novo título', versao: 3 }),
    },
  },
  {
    nome: 'useEncerrarTrampo (CA33)',
    usar: () => adaptar(useEncerrarTrampo(), 't1'),
    rota: 'POST /trampos/t1/encerrar',
    resposta: { status: 204 },
    caminho: '/trampos/t1/encerrar',
    corpo: undefined,
    devolve: undefined,
    essenciais: [['trampo', 't1'], ['meusTrampos']],
    demais: [
      ['candidaturasRecebidas', 't1'],
      ['recentes', 'trampos'],
      ['busca'],
    ],
    lista: {
      usar: () => useTrampo('t1'),
      rota: 'GET /trampos/t1',
      chave: chaves.trampo('t1'),
      antes: trampo('t1'),
      depois: trampo('t1', { status: 'encerrado' }),
    },
  },
  {
    nome: "useExcluirAnuncio('trampo') (CA33)",
    usar: () => adaptar(useExcluirAnuncio('trampo'), 't1'),
    rota: 'DELETE /trampos/t1',
    resposta: { status: 204 },
    caminho: '/trampos/t1',
    corpo: undefined,
    devolve: undefined,
    essenciais: [['meusTrampos']],
    demais: [['recentes', 'trampos'], ['busca']],
    lista: {
      usar: useMeusTrampos,
      rota: 'GET /trampos/meus',
      chave: chaves.meusTrampos(),
      antes: [trampo('t1')],
      depois: [],
    },
  },
  {
    nome: "useExcluirAnuncio('servico') (CA33)",
    usar: () => adaptar(useExcluirAnuncio('servico'), 's1'),
    rota: 'DELETE /servicos/s1',
    resposta: { status: 204 },
    caminho: '/servicos/s1',
    corpo: undefined,
    devolve: undefined,
    essenciais: [['meusServicos']],
    demais: [['recentes', 'servicos'], ['busca']],
    lista: {
      usar: useMeusServicos,
      rota: 'GET /servicos/meus',
      chave: chaves.meusServicos(),
      antes: [servico('s1')],
      depois: [],
    },
  },
  {
    nome: 'useRetirarCandidatura (CA34)',
    usar: () => adaptar(useRetirarCandidatura(), 'c1'),
    rota: 'DELETE /candidaturas/c1',
    resposta: { status: 204 },
    caminho: '/candidaturas/c1',
    corpo: undefined,
    devolve: undefined,
    essenciais: [['minhasCandidaturas']],
    demais: [],
    lista: {
      usar: useMinhasCandidaturas,
      rota: 'GET /candidaturas/minhas',
      chave: chaves.minhasCandidaturas(),
      antes: [minha('c1', 't1')],
      depois: [],
    },
  },
];

describe.each(CASOS)('$nome', (caso) => {
  afterEach(async () => {
    await act(async () => onlineManager.setOnline(true));
  });

  it('faz a requisição certa com o Bearer e devolve a resposta', async () => {
    const provedores = autenticado();
    provedores.fetch.responder(caso.rota, caso.resposta);
    const { result } = await montar(caso.usar, provedores);

    let devolvido: unknown;
    await act(async () => {
      devolvido = await result.current.dados.enviar();
    });

    expect(devolvido).toEqual(caso.devolve);
    const [metodo] = caso.rota.split(' ');
    const feitas = requisicoesPara(provedores, metodo ?? '', caso.caminho);
    expect(feitas).toHaveLength(1);
    expect(feitas[0]?.corpo).toEqual(caso.corpo);
    expect(feitas[0]?.cabecalhos.authorization).toBe(BEARER);
    await waitFor(() => expect(result.current.dados.status).toBe('success'));
  });

  it('no sucesso recarrega as essenciais com refetchType: "all" e invalida as demais só com "active"', async () => {
    const provedores = autenticado();
    provedores.fetch.responder(caso.rota, caso.resposta);
    const { result } = await montar(caso.usar, provedores);
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.dados.enviar();
    });

    expect(invalidar.mock.calls.map(([filtros]) => filtros)).toEqual([
      ...caso.essenciais.map((queryKey) => ({ queryKey, refetchType: 'all' })),
      ...caso.demais.map((queryKey) => ({ queryKey, refetchType: 'active' })),
    ]);
    await waitFor(() => expect(result.current.dados.status).toBe('success'));
  });

  it('a recarga essencial que falha com a rede caindo não impede o sucesso', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder(caso.lista.rota, [
        { corpo: caso.lista.antes },
        { falhaDeRede: true },
      ])
      .responder(caso.rota, caso.resposta);
    const { result } = await montar(
      () => ({ lista: caso.lista.usar(), mutacao: caso.usar() }),
      provedores,
    );
    await waitFor(() =>
      expect(provedores.queryClient.getQueryData(caso.lista.chave)).toEqual(
        caso.lista.antes,
      ),
    );
    const aoTerSucesso = jest.fn();

    await act(async () => {
      result.current.dados.mutacao.disparar(aoTerSucesso);
    });

    await waitFor(() => expect(aoTerSucesso).toHaveBeenCalledTimes(1));
    const [, caminhoDaLista = ''] = caso.lista.rota.split(' ');
    expect(requisicoesPara(provedores, 'GET', caminhoDaLista)).toHaveLength(2);
    await waitFor(() =>
      expect(result.current.dados.mutacao.status).toBe('success'),
    );
    // O dado de antes fica; a recarga falha sem virar erro da mutação.
    expect(provedores.queryClient.getQueryData(caso.lista.chave)).toEqual(
      caso.lista.antes,
    );
  });

  it(`a recarga essencial lenta segura o sucesso por no máximo ${TETO_DA_RECARGA_MS} ms`, async () => {
    jest.useFakeTimers();
    try {
      const provedores = autenticado();
      provedores.fetch
        .responder(caso.lista.rota, [
          { corpo: caso.lista.antes },
          { corpo: caso.lista.depois, demoraMs: 60_000 },
        ])
        .responder(caso.rota, caso.resposta);
      const { result } = await montar(
        () => ({ lista: caso.lista.usar(), mutacao: caso.usar() }),
        provedores,
      );
      await waitFor(() =>
        expect(provedores.queryClient.getQueryData(caso.lista.chave)).toEqual(
          caso.lista.antes,
        ),
      );
      const aoTerSucesso = jest.fn();

      await act(async () => {
        result.current.dados.mutacao.disparar(aoTerSucesso);
      });
      await act(async () => {
        jest.advanceTimersByTime(TETO_DA_RECARGA_MS - 100);
      });

      // A recarga começou e ainda não respondeu.
      const [, caminhoDaLista = ''] = caso.lista.rota.split(' ');
      expect(requisicoesPara(provedores, 'GET', caminhoDaLista)).toHaveLength(
        2,
      );
      expect(aoTerSucesso).not.toHaveBeenCalled();
      expect(result.current.dados.mutacao.status).toBe('pending');

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      expect(aoTerSucesso).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(result.current.dados.mutacao.status).toBe('success'),
      );
      expect(provedores.queryClient.getQueryData(caso.lista.chave)).toEqual(
        caso.lista.antes,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('recarrega a lista sem tela antes do onSuccess do mutate', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder(caso.lista.rota, [
        { corpo: caso.lista.antes },
        { corpo: caso.lista.depois },
      ])
      .responder(caso.rota, caso.resposta);
    // A lista entra no cache e a tela dela sai: a consulta fica inativa.
    const daLista = await montar(caso.lista.usar, provedores);
    await waitFor(() =>
      expect(provedores.queryClient.getQueryData(caso.lista.chave)).toEqual(
        caso.lista.antes,
      ),
    );
    await daLista.unmount();
    const { result } = await montar(caso.usar, provedores);

    let lidaNoSucesso: unknown;
    await act(async () => {
      result.current.dados.disparar(() => {
        lidaNoSucesso = provedores.queryClient.getQueryData(caso.lista.chave);
      });
    });

    await waitFor(() => expect(lidaNoSucesso).toEqual(caso.lista.depois));
    const [, caminhoDaLista = ''] = caso.lista.rota.split(' ');
    expect(requisicoesPara(provedores, 'GET', caminhoDaLista)).toHaveLength(2);
    await waitFor(() => expect(result.current.dados.status).toBe('success'));
  });

  it('se a sessão mudou durante a mutação, nada é invalidado nem recarregado', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder(caso.rota, { ...caso.resposta, demoraMs: 30 })
      .responder('DELETE /sessoes', { status: 204 });
    const { result } = await montar(caso.usar, provedores);
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    let enviada: Promise<unknown> = Promise.resolve();
    await act(async () => {
      enviada = result.current.dados.enviar();
      await Promise.resolve();
    });
    // Sai e outra conta entra enquanto a requisição ainda está no ar.
    await act(() => result.current.sessao.sair());
    await act(() => result.current.sessao.entrar(TOKEN_NOVO));
    await act(async () => {
      await enviada;
    });

    expect(invalidar).not.toHaveBeenCalled();
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(
      provedores.fetch.requisicoes.map((r) => `${r.metodo} ${r.caminho}`),
    ).toEqual([caso.rota, 'DELETE /sessoes']);
    await waitFor(() => expect(result.current.dados.status).toBe('success'));
  });

  it('offline falha na hora com ErroDeRede e não fica pausada', async () => {
    const provedores = autenticado();
    provedores.fetch.responder(caso.rota, { falhaDeRede: true });
    const { result } = await montar(caso.usar, provedores);
    await act(async () => onlineManager.setOnline(false));

    await act(async () => {
      await result.current.dados.enviar().catch(() => {});
    });

    await waitFor(() =>
      expect(result.current.dados.error).toBeInstanceOf(ErroDeRede),
    );
    expect(result.current.dados.isPaused).toBe(false);
    const [mutacao] = provedores.queryClient.getMutationCache().getAll();
    expect(mutacao?.state.isPaused).toBe(false);
    expect(mutacao?.state.status).toBe('error');
  });
});

describe('chaves que não são esperadas (usePublicarTrampo)', () => {
  it('o sucesso não espera os recentes nem a busca, e a busca sem tela só fica invalidada', async () => {
    jest.useFakeTimers();
    try {
      const provedores = autenticado();
      const pagina = { itens: [], proximoCursor: null };
      provedores.fetch
        .responder('GET /trampos/meus', { corpo: [] })
        .responder('GET /busca', [
          { corpo: pagina },
          { corpo: pagina, demoraMs: 60_000 },
        ])
        .responder('POST /trampos', {
          status: 201,
          corpo: { id: 't-novo', status: 'aberto' },
        });
      const { result } = await montar(
        () => ({
          recentes: useRecentes('trampos'),
          mutacao: adaptar(usePublicarTrampo(), ENTRADA_TRAMPO),
        }),
        provedores,
      );
      const buscas = () => requisicoesPara(provedores, 'GET', '/busca');
      await waitFor(() => expect(buscas()).toHaveLength(1));
      // Uma busca em cache sem tela nenhuma observando.
      const chaveSemTela = chaves.busca({ texto: 'pintor' });
      provedores.queryClient.setQueryData(chaveSemTela, {
        pages: [pagina],
        pageParams: [null],
      });
      const aoTerSucesso = jest.fn();

      await act(async () => {
        result.current.dados.mutacao.disparar(aoTerSucesso);
      });
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(aoTerSucesso).toHaveBeenCalledTimes(1);
      // Os recentes (com tela) estão recarregando; a busca sem tela não.
      expect(buscas()).toHaveLength(2);
      expect(buscas().every((r) => r.query.texto === undefined)).toBe(true);
      expect(
        provedores.queryClient.getQueryState(chaveSemTela)?.isInvalidated,
      ).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a mutação não guarda a entrada no cache depois que a tela sai (gcTime 0)', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('POST /trampos', {
        status: 201,
        corpo: { id: 't-novo', status: 'aberto' },
      });
    const montado = await montar(
      () => adaptar(usePublicarTrampo(), ENTRADA_TRAMPO),
      provedores,
    );
    await act(async () => {
      await montado.result.current.dados.enviar();
    });
    await waitFor(() =>
      expect(montado.result.current.dados.status).toBe('success'),
    );
    expect(provedores.queryClient.getMutationCache().getAll()).toHaveLength(1);

    await montado.unmount();
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 10));
    });

    expect(provedores.queryClient.getMutationCache().getAll()).toHaveLength(0);
  });
});

describe('erros das mutações', () => {
  it('409 do aceite sobe como ErroDaApi com o código e nada é invalidado', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /trampos/t1/candidaturas/c1/aceitar', {
      status: 409,
      corpo: { erro: 'trampo_nao_aberto' },
    });
    const { result } = await montar(
      () => useAceitarCandidatura('t1'),
      provedores,
    );
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.dados.mutateAsync('c1').catch(() => {});
    });

    await waitFor(() =>
      expect(result.current.dados.error).toBeInstanceOf(ErroDaApi),
    );
    expect((result.current.dados.error as ErroDaApi).codigo).toBe(
      'trampo_nao_aberto',
    );
    expect(invalidar).not.toHaveBeenCalled();
    expect(
      requisicoesPara(
        provedores,
        'POST',
        '/trampos/t1/candidaturas/c1/aceitar',
      ),
    ).toHaveLength(1);
  });

  it('401 expira a sessão (CA14) e a mutação falha com sessao_expirada', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /trampos/t1/candidaturas', {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });
    const { result } = await montar(() => useCandidatar('t1'), provedores);

    await act(async () => {
      await result.current.dados
        .mutateAsync(ENTRADA_CANDIDATURA)
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.sessao.status).toBe('anonimo'));
    expect((result.current.dados.error as ErroDaApi).codigo).toBe(
      'sessao_expirada',
    );
    expect(provedores.armazenamento.atual()).toBeNull();
  });
});

describe('exclusão tira o anúncio do cache em vez de recarregá-lo (CA33)', () => {
  // O aviso do TanStack aos componentes sai numa microtarefa (e não num
  // `setTimeout(0)`), dentro do `await` do teste.
  beforeEach(() => {
    notifyManager.setScheduler((f) => {
      void Promise.resolve().then(f);
    });
  });
  afterEach(() => {
    notifyManager.setScheduler((f) => setTimeout(f, 0));
  });

  it('o detalhe do trampo e as candidaturas recebidas saem do cache, sem GET que daria 404', async () => {
    const provedores = autenticado({
      queryClient: criarQueryClient(TEMPO_FRESCO_MS),
    });
    provedores.fetch
      .responder('GET /trampos/meus', [
        { corpo: [trampo('t1'), trampo('t2')] },
        { corpo: [trampo('t2')] },
      ])
      .responder('GET /trampos/t1', {
        status: 404,
        corpo: { erro: 'nao_encontrado' },
      })
      .responder('DELETE /trampos/t1', { status: 204 });
    const { queryClient } = provedores;
    queryClient.setQueryData(chaves.trampo('t1'), trampo('t1'));
    queryClient.setQueryData(chaves.trampo('t2'), trampo('t2'));
    queryClient.setQueryData(chaves.candidaturasRecebidas('t1'), []);
    queryClient.setQueryData(chaves.candidaturasRecebidas('t2'), []);
    const { result } = await montar(
      () => ({
        meus: useMeusTrampos(),
        mutacao: adaptar(useExcluirAnuncio('trampo'), 't1'),
      }),
      provedores,
    );
    await waitFor(() =>
      expect(result.current.dados.meus.trampos).toHaveLength(2),
    );

    await act(async () => {
      await result.current.dados.mutacao.enviar();
    });

    expect(queryClient.getQueryState(chaves.trampo('t1'))).toBeUndefined();
    expect(
      queryClient.getQueryState(chaves.candidaturasRecebidas('t1')),
    ).toBeUndefined();
    // O de outro trampo fica como estava.
    expect(queryClient.getQueryData(chaves.trampo('t2'))).toEqual(trampo('t2'));
    expect(
      queryClient.getQueryData(chaves.candidaturasRecebidas('t2')),
    ).toEqual([]);
    expect(requisicoesPara(provedores, 'GET', '/trampos/t1')).toHaveLength(0);
    expect(
      requisicoesPara(provedores, 'GET', '/trampos/t1/candidaturas'),
    ).toHaveLength(0);
    // A lista "meus" é recarregada.
    await waitFor(() =>
      expect(result.current.dados.meus.trampos).toEqual([trampo('t2')]),
    );
    await waitFor(() =>
      expect(result.current.dados.mutacao.status).toBe('success'),
    );
  });

  it('o detalhe que uma tela ainda observa não é recarregado (daria 404): fica velho e a próxima abertura o pede', async () => {
    const provedores = autenticado({
      queryClient: criarQueryClient(TEMPO_FRESCO_MS),
    });
    provedores.fetch
      .responder('GET /trampos/t1', [
        { corpo: trampo('t1') },
        { status: 404, corpo: { erro: 'nao_encontrado' } },
      ])
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('DELETE /trampos/t1', { status: 204 });
    const { queryClient } = provedores;
    const { result, unmount } = await montar(
      () => ({
        detalhe: useTrampo('t1'),
        mutacao: adaptar(useExcluirAnuncio('trampo'), 't1'),
      }),
      provedores,
    );
    await waitFor(() =>
      expect(result.current.dados.detalhe.trampo).not.toBeNull(),
    );

    await act(async () => {
      await result.current.dados.mutacao.enviar();
    });
    await waitFor(() =>
      expect(result.current.dados.mutacao.status).toBe('success'),
    );
    // Várias renderizações depois, a tela segue com o dado e sem nova requisição.
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 20));
    });

    expect(requisicoesPara(provedores, 'GET', '/trampos/t1')).toHaveLength(1);
    expect(result.current.dados.detalhe.trampo).toEqual(trampo('t1'));
    expect(queryClient.getQueryState(chaves.trampo('t1'))?.isInvalidated).toBe(
      true,
    );

    await unmount();
    const depois = await montar(() => useTrampo('t1'), provedores);

    await waitFor(() =>
      expect(requisicoesPara(provedores, 'GET', '/trampos/t1')).toHaveLength(2),
    );
    await waitFor(() =>
      expect(depois.result.current.dados.erro).toBeInstanceOf(ErroDaApi),
    );
  });

  it('as chaves seguem a entrada: outro id invalida as chaves do outro id', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /trampos/t9/encerrar', { status: 204 });
    const { result } = await montar(() => useEncerrarTrampo(), provedores);
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.dados.mutateAsync('t9');
    });

    expect(invalidar.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ['trampo', 't9'],
      ['meusTrampos'],
      ['candidaturasRecebidas', 't9'],
      ['recentes', 'trampos'],
      ['busca'],
    ]);
    await waitFor(() => expect(result.current.dados.status).toBe('success'));
  });

  it('a exclusão do serviço tira só o serviço do cache, não o trampo de mesmo id', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('GET /servicos/meus', { corpo: [] })
      .responder('DELETE /servicos/x1', { status: 204 });
    const { queryClient } = provedores;
    queryClient.setQueryData(chaves.servico('x1'), servico('x1'));
    queryClient.setQueryData(chaves.trampo('x1'), trampo('x1'));
    const { result } = await montar(
      () => adaptar(useExcluirAnuncio('servico'), 'x1'),
      provedores,
    );

    await act(async () => {
      await result.current.dados.enviar();
    });

    expect(queryClient.getQueryState(chaves.servico('x1'))).toBeUndefined();
    expect(queryClient.getQueryData(chaves.trampo('x1'))).toEqual(trampo('x1'));
    await waitFor(() => expect(result.current.dados.status).toBe('success'));
  });

  it('o 409 (trampo que deixou de estar aberto) e o 404 não tiram nada do cache nem invalidam', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('DELETE /trampos/t1', {
        status: 409,
        corpo: { erro: 'trampo_nao_aberto' },
      })
      .responder('DELETE /trampos/t2', {
        status: 404,
        corpo: { erro: 'nao_encontrado' },
      });
    const { queryClient } = provedores;
    queryClient.setQueryData(chaves.trampo('t1'), trampo('t1'));
    queryClient.setQueryData(chaves.trampo('t2'), trampo('t2'));
    const { result } = await montar(
      () => useExcluirAnuncio('trampo'),
      provedores,
    );
    const remover = jest.spyOn(queryClient, 'removeQueries');
    const invalidar = jest.spyOn(queryClient, 'invalidateQueries');

    const erros: unknown[] = [];
    for (const id of ['t1', 't2']) {
      await act(async () => {
        await result.current.dados.mutateAsync(id).catch((e) => erros.push(e));
      });
    }

    await waitFor(() => expect(result.current.dados.status).toBe('error'));
    expect(erros.map((e) => (e as ErroDaApi).status)).toEqual([409, 404]);
    expect((erros[0] as ErroDaApi).codigo).toBe('trampo_nao_aberto');
    expect(remover).not.toHaveBeenCalled();
    expect(invalidar).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(chaves.trampo('t1'))).toEqual(trampo('t1'));
    expect(queryClient.getQueryData(chaves.trampo('t2'))).toEqual(trampo('t2'));
  });

  it('se a sessão mudou durante a exclusão, nada sai do cache', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('DELETE /trampos/t1', { status: 204, demoraMs: 30 })
      .responder('DELETE /sessoes', { status: 204 });
    const { result } = await montar(
      () => adaptar(useExcluirAnuncio('trampo'), 't1'),
      provedores,
    );
    const remover = jest.spyOn(provedores.queryClient, 'removeQueries');

    let enviada: Promise<unknown> = Promise.resolve();
    await act(async () => {
      enviada = result.current.dados.enviar();
      await Promise.resolve();
    });
    await act(() => result.current.sessao.sair());
    await act(() => result.current.sessao.entrar(TOKEN_NOVO));
    await act(async () => {
      await enviada;
    });

    expect(remover).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.dados.status).toBe('success'));
  });
});

describe('erros das mutações da L2', () => {
  // O aviso do TanStack aos componentes sai numa microtarefa (e não num
  // `setTimeout(0)`), dentro do `await` do teste.
  beforeEach(() => {
    notifyManager.setScheduler((f) => {
      void Promise.resolve().then(f);
    });
  });
  afterEach(() => {
    notifyManager.setScheduler((f) => setTimeout(f, 0));
  });

  it.each([
    [
      'useEditarTrampo',
      409,
      'trampo_nao_editavel',
      'PUT /trampos/t1',
      () => adaptar(useEditarTrampo('t1'), { ...ENTRADA_TRAMPO, versao: 1 }),
    ],
    [
      'useEditarTrampo',
      409,
      'conflito_de_versao',
      'PUT /trampos/t1',
      () => adaptar(useEditarTrampo('t1'), { ...ENTRADA_TRAMPO, versao: 1 }),
    ],
    [
      'useEditarServico',
      409,
      'conflito_de_versao',
      'PUT /servicos/s1',
      () => adaptar(useEditarServico('s1'), { ...ENTRADA_SERVICO, versao: 1 }),
    ],
    [
      'useEncerrarTrampo',
      404,
      'nao_encontrado',
      'POST /trampos/t1/encerrar',
      () => adaptar(useEncerrarTrampo(), 't1'),
    ],
    [
      'useExcluirAnuncio',
      409,
      'trampo_nao_aberto',
      'DELETE /trampos/t1',
      () => adaptar(useExcluirAnuncio('trampo'), 't1'),
    ],
    [
      'useRetirarCandidatura',
      409,
      'candidatura_nao_pendente',
      'DELETE /candidaturas/c1',
      () => adaptar(useRetirarCandidatura(), 'c1'),
    ],
    [
      'useRetirarCandidatura',
      404,
      'nao_encontrado',
      'DELETE /candidaturas/c1',
      () => adaptar(useRetirarCandidatura(), 'c1'),
    ],
  ] as const)(
    '%s: %s %s sobe como ErroDaApi e nada é invalidado',
    async (_nome, status, codigo, rota, usar) => {
      const provedores = autenticado();
      provedores.fetch.responder(rota, { status, corpo: { erro: codigo } });
      const { result } = await montar(usar, provedores);
      const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

      await act(async () => {
        await result.current.dados.enviar().catch(() => {});
      });

      await waitFor(() =>
        expect(result.current.dados.error).toBeInstanceOf(ErroDaApi),
      );
      const erro = result.current.dados.error as ErroDaApi;
      expect([erro.status, erro.codigo]).toEqual([status, codigo]);
      expect(invalidar).not.toHaveBeenCalled();
    },
  );

  it('a edição não guarda o texto no cache de mutações depois que a tela sai, e a mutação não tem chave', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('PUT /trampos/t1', { status: 204 });
    const montado = await montar(
      () =>
        adaptar(useEditarTrampo('t1'), {
          ...ENTRADA_TRAMPO,
          titulo: 'TEXTO-SENTINELA',
          versao: 1,
        }),
      provedores,
    );
    await act(async () => {
      await montado.result.current.dados.enviar();
    });
    await waitFor(() =>
      expect(montado.result.current.dados.status).toBe('success'),
    );
    const [mutacao] = provedores.queryClient.getMutationCache().getAll();
    expect(mutacao?.options.mutationKey).toBeUndefined();

    await montado.unmount();
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 10));
    });

    expect(provedores.queryClient.getMutationCache().getAll()).toHaveLength(0);
  });
});

describe('usePerfisPublicos (nomes nas candidaturas recebidas)', () => {
  it('reaproveita o cache de usePerfilPublico e mapeia o 404 para null', async () => {
    const provedores = autenticado({
      queryClient: criarQueryClient(TEMPO_FRESCO_MS),
    });
    provedores.fetch
      .responder('GET /perfis/conta-1', { corpo: perfil('conta-1') })
      .responder('GET /perfis/conta-2', { corpo: perfil('conta-2') })
      .responder('GET /perfis/conta-500', {
        status: 500,
        corpo: { erro: 'erro_interno' },
      });
    // O detalhe já buscou a conta-1 e a pessoa saiu dele.
    const doDetalhe = await montar(
      () => usePerfilPublico('conta-1'),
      provedores,
    );
    await waitFor(() =>
      expect(doDetalhe.result.current.dados.perfil).toEqual(perfil('conta-1')),
    );
    await doDetalhe.unmount();

    const { result } = await montar(
      () =>
        usePerfisPublicos([
          'conta-1',
          'conta-2',
          'conta-404',
          'conta-2',
          'conta-500',
          '',
        ]),
      provedores,
    );

    await waitFor(() => expect(result.current.dados.size).toBe(3));
    await waitFor(() =>
      expect(
        provedores.queryClient.getQueryState(chaves.perfil('conta-500'))
          ?.status,
      ).toBe('error'),
    );
    const mapa = result.current.dados;
    expect(mapa.get('conta-1')).toEqual(perfil('conta-1'));
    expect(mapa.get('conta-2')).toEqual(perfil('conta-2'));
    expect(mapa.get('conta-404')).toBeNull();
    // Erro que não é 404 não vira "Perfil indisponível": fica sem resposta.
    expect(mapa.has('conta-500')).toBe(false);
    expect(mapa.size).toBe(3);

    expect(requisicoesPara(provedores, 'GET', '/perfis/conta-1')).toHaveLength(
      1,
    );
    expect(requisicoesPara(provedores, 'GET', '/perfis/conta-2')).toHaveLength(
      1,
    );
    expect(
      requisicoesPara(provedores, 'GET', '/perfis/conta-404'),
    ).toHaveLength(1);
    expect(provedores.fetch.requisicoes).toHaveLength(4);
    for (const requisicao of provedores.fetch.requisicoes) {
      expect(requisicao.cabecalhos.authorization).toBe(BEARER);
    }
    // O cache é o mesmo de usePerfilPublico.
    expect(
      provedores.queryClient.getQueryData(chaves.perfil('conta-2')),
    ).toEqual(perfil('conta-2'));
  });

  it('devolve o mesmo mapa enquanto nenhum resultado muda', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /perfis/conta-1', {
      corpo: perfil('conta-1'),
    });
    const resultado = await renderHook(
      ({ ids }: { ids: readonly string[] }) => usePerfisPublicos(ids),
      { wrapper: provedores.wrapper, initialProps: { ids: ['conta-1'] } },
    );
    await waitFor(() => expect(resultado.result.current.size).toBe(1));
    const primeiro = resultado.result.current;

    await resultado.rerender({ ids: ['conta-1'] });

    expect(resultado.result.current).toBe(primeiro);
  });

  it('sem ids não faz requisição e devolve um mapa vazio', async () => {
    const provedores = autenticado();
    const { result } = await montar(() => usePerfisPublicos([]), provedores);

    expect(result.current.dados.size).toBe(0);
    expect(provedores.fetch.requisicoes).toHaveLength(0);
  });
});

describe('useTramposPorIds (títulos em Minhas candidaturas)', () => {
  it('pede cada id uma vez, mesmo repetido, e o 404 vira null', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /trampos/t1', { corpo: trampo('t1') });
    const { result } = await montar(
      () => useTramposPorIds(['t1', 't404', 't1']),
      provedores,
    );

    await waitFor(() => expect(result.current.dados.size).toBe(2));
    expect(result.current.dados.get('t1')).toEqual(trampo('t1'));
    expect(result.current.dados.get('t404')).toBeNull();
    expect(requisicoesPara(provedores, 'GET', '/trampos/t1')).toHaveLength(1);
    expect(requisicoesPara(provedores, 'GET', '/trampos/t404')).toHaveLength(1);
    expect(provedores.fetch.ultima().cabecalhos.authorization).toBe(BEARER);
    // Mesma chave de useTrampo: o detalhe aberto depois já tem o dado.
    expect(provedores.queryClient.getQueryData(chaves.trampo('t1'))).toEqual(
      trampo('t1'),
    );
  });
});
