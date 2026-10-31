import { onlineManager, QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ErroDaApi, ErroDeRede } from '../../api/erros';
import type { ItemDaBusca, MeuPerfil } from '../../api/tipos';
import {
  criarProvedores as criarProvedoresBase,
  type OpcoesDosProvedores,
} from '../../testes/renderizar';
import {
  type ArmazenamentoEmMemoria,
  criarArmazenamentoEmMemoria,
} from '../armazenamento-token';
import { useSessao } from '../sessao';
import { useServico, useTrampo } from './anuncios';
import { useBusca, useCategorias, useRecentes } from './busca';
import { chaves, normalizarFiltros } from './chaves';
import { useCadastrar, useEntrar, useSair } from './conta';
import { useMeuPerfil, usePerfilPublico, useSalvarPerfil } from './perfil';

const TOKEN = 'token-da-sessao-123';
const TOKEN_NOVO = 'token-novo-456';
const CREDENCIAIS = { email: 'maria@exemplo.com', senha: 'senha-forte-1' };

const PERFIL: MeuPerfil = {
  nome: 'Maria Silva',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

function trampo(id: string): ItemDaBusca {
  return {
    tipo: 'trampo',
    id,
    autorId: 'conta-1',
    titulo: `Trampo ${id}`,
    categoria: 'reformas',
    cidade: 'Lavras',
    criadoEm: '2026-10-01T10:00:00.000Z',
    valorCentavos: 10_000,
  };
}

/**
 * Como `criarQueryClientDeTeste`, mas as mutações também não são coletadas
 * por tempo: o gc de 5 min do padrão segura o processo do jest aberto.
 */
function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
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

// O TanStack avisa os componentes num `setTimeout(0)`: sem esperar por ele,
// a última notificação de um teste cai fora do `act`.
afterEach(async () => {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
});

function autenticado(opcoes: OpcoesDosProvedores = {}) {
  return criarProvedores({
    armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    ...opcoes,
  });
}

/** Espera a sessão sair de `carregando`. */
async function montar<T>(
  hook: () => T,
  provedores: ReturnType<typeof criarProvedores>,
) {
  const resultado = await renderHook(
    () => ({ sessao: useSessao(), dados: hook() }),
    { wrapper: provedores.wrapper },
  );
  await waitFor(() =>
    expect(resultado.result.current.sessao.status).not.toBe('carregando'),
  );
  return resultado;
}

describe('useCadastrar e useEntrar (CA1)', () => {
  it('useCadastrar faz POST /contas sem token e leva a sessão a autenticado', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('POST /contas', {
      status: 201,
      corpo: { token: TOKEN_NOVO },
    });
    const { result } = await montar(useCadastrar, provedores);
    expect(result.current.sessao.status).toBe('anonimo');

    await act(async () => {
      await result.current.dados.mutateAsync(CREDENCIAIS);
    });

    const requisicao = provedores.fetch.requisicoes[0];
    expect(requisicao).toMatchObject({
      metodo: 'POST',
      caminho: '/contas',
      corpo: CREDENCIAIS,
    });
    expect(requisicao?.cabecalhos.authorization).toBeUndefined();
    expect(result.current.sessao.status).toBe('autenticado');
    expect(provedores.armazenamento.atual()).toBe(TOKEN_NOVO);
    await waitFor(() => expect(result.current.dados.status).toBe('idle'));
  });

  it('useEntrar faz POST /sessoes e leva a sessão a autenticado', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('POST /sessoes', { corpo: { token: TOKEN } });
    const { result } = await montar(useEntrar, provedores);

    await act(async () => {
      await result.current.dados.mutateAsync(CREDENCIAIS);
    });

    expect(provedores.fetch.requisicoes[0]).toMatchObject({
      metodo: 'POST',
      caminho: '/sessoes',
      corpo: CREDENCIAIS,
    });
    expect(result.current.sessao.status).toBe('autenticado');
    await waitFor(() => expect(result.current.dados.status).toBe('idle'));
  });

  it('não guarda credenciais nem token depois do sucesso (CA15)', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('POST /sessoes', { corpo: { token: TOKEN } });
    const { result } = await montar(useEntrar, provedores);

    await act(async () => {
      await result.current.dados.mutateAsync(CREDENCIAIS);
    });

    await waitFor(() => expect(result.current.dados.status).toBe('idle'));
    expect(result.current.dados.variables).toBeUndefined();
    expect(result.current.dados.data).toBeUndefined();
    expect(JSON.stringify(result.current.dados)).not.toContain(TOKEN);
    await waitFor(() =>
      expect(provedores.queryClient.getMutationCache().getAll()).toHaveLength(
        0,
      ),
    );
  });

  it('chama o onSuccess passado ao mutate mesmo com o reset', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('POST /sessoes', { corpo: { token: TOKEN } });
    const { result, unmount } = await montar(useEntrar, provedores);
    const aoTerminar = jest.fn();

    await act(async () => {
      result.current.dados.mutate(CREDENCIAIS, { onSuccess: aoTerminar });
    });

    await waitFor(() => expect(aoTerminar).toHaveBeenCalledTimes(1));
    // O `reset()` do sucesso avisa o hook num `setTimeout(0)` que, sob carga,
    // cai entre o fim do teste e o `afterEach`, fora do `act`. Desmontar aqui
    // tira o ouvinte: o aviso atrasado não acha mais o componente.
    await unmount();
  });

  it('senha errada sobe como ErroDaApi e a sessão segue anônima', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('POST /sessoes', {
      status: 401,
      corpo: { erro: 'credenciais_invalidas' },
    });
    const { result } = await montar(useEntrar, provedores);

    await act(async () => {
      await result.current.dados.mutateAsync(CREDENCIAIS).catch(() => {});
    });

    await waitFor(() =>
      expect(result.current.dados.error).toBeInstanceOf(ErroDaApi),
    );
    expect((result.current.dados.error as ErroDaApi).codigo).toBe(
      'credenciais_invalidas',
    );
    expect(result.current.sessao.status).toBe('anonimo');
    expect(provedores.armazenamento.atual()).toBeNull();
  });

  it('erro de rede sobe como ErroDeRede', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('POST /contas', { falhaDeRede: true });
    const { result } = await montar(useCadastrar, provedores);

    await act(async () => {
      await result.current.dados.mutateAsync(CREDENCIAIS).catch(() => {});
    });

    await waitFor(() =>
      expect(result.current.dados.error).toBeInstanceOf(ErroDeRede),
    );
    expect(result.current.sessao.status).toBe('anonimo');
  });
});

describe('useSair', () => {
  it('deixa a sessão anônima, apaga o token e esvazia o cache', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('DELETE /sessoes', { status: 204 });
    provedores.queryClient.setQueryData(chaves.meuPerfil(), PERFIL);
    const { result } = await montar(useSair, provedores);
    expect(result.current.sessao.status).toBe('autenticado');

    await act(async () => {
      await result.current.dados.mutateAsync();
    });

    expect(provedores.fetch.requisicoes[0]).toMatchObject({
      metodo: 'DELETE',
      caminho: '/sessoes',
    });
    expect(provedores.fetch.requisicoes[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(result.current.sessao.status).toBe('anonimo');
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(provedores.armazenamento.atual()).toBeNull();
  });
});

describe('useSair sem conexão (R2)', () => {
  afterEach(async () => {
    await act(async () => onlineManager.setOnline(true));
  });

  it('roda mesmo offline: sessão anônima e token apagado', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('DELETE /sessoes', { falhaDeRede: true });
    const { result } = await montar(useSair, provedores);
    expect(result.current.sessao.status).toBe('autenticado');

    await act(async () => onlineManager.setOnline(false));
    await act(async () => {
      result.current.dados.mutate();
    });

    await waitFor(() => expect(result.current.sessao.status).toBe('anonimo'));
    expect(provedores.armazenamento.atual()).toBeNull();
  });
});

describe('useMeuPerfil (CA3)', () => {
  it('lê GET /perfis/eu com o Bearer', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /perfis/eu', { corpo: PERFIL });
    const { result } = await montar(useMeuPerfil, provedores);

    await waitFor(() => expect(result.current.dados.perfil).toEqual(PERFIL));

    expect(result.current.dados.carregando).toBe(false);
    expect(provedores.fetch.requisicoes[0]).toMatchObject({
      metodo: 'GET',
      caminho: '/perfis/eu',
    });
    expect(provedores.fetch.requisicoes[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it('devolve null quando a API responde 404 (perfil incompleto)', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /perfis/eu', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    const { result } = await montar(useMeuPerfil, provedores);

    await waitFor(() => expect(result.current.dados.carregando).toBe(false));

    expect(result.current.dados.perfil).toBeNull();
    expect(result.current.dados.erro).toBeNull();
    expect(result.current.dados.semPerfil).toBe(true);
  });

  it('com perfil salvo ou com erro, semPerfil é falso', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /perfis/eu', [
      { corpo: PERFIL },
      { status: 500 },
    ]);
    const { result } = await montar(useMeuPerfil, provedores);
    await waitFor(() => expect(result.current.dados.perfil).toEqual(PERFIL));
    expect(result.current.dados.semPerfil).toBe(false);

    await act(async () => {
      provedores.queryClient.resetQueries();
    });
    await waitFor(() => expect(result.current.dados.erro).not.toBeNull());
    expect(result.current.dados.perfil).toBeNull();
    expect(result.current.dados.semPerfil).toBe(false);
  });

  it('offline e sem nada no cache: segue carregando, não "sem perfil" (R1)', async () => {
    onlineManager.setOnline(false);
    try {
      const provedores = autenticado();
      provedores.fetch.responder('GET /perfis/eu', { status: 404 });
      const { result } = await montar(useMeuPerfil, provedores);
      await act(async () => {});

      expect(provedores.fetch.requisicoes).toHaveLength(0);
      expect(result.current.dados.perfil).toBeNull();
      expect(result.current.dados.erro).toBeNull();
      expect(result.current.dados.carregando).toBe(true);
      expect(result.current.dados.semPerfil).toBe(false);
    } finally {
      // Voltar online dispara a busca que estava pausada: espera ela e a
      // notificação do TanStack (`setTimeout(0)` agendado só depois da
      // resposta) dentro do `act`, senão a atualização cai depois do teste.
      await act(async () => {
        onlineManager.setOnline(true);
        await new Promise((resolver) => setTimeout(resolver, 0));
        await new Promise((resolver) => setTimeout(resolver, 0));
      });
    }
  });

  it('não consulta sem sessão autenticada', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /perfis/eu', { corpo: PERFIL });
    const { result } = await montar(useMeuPerfil, provedores);
    await act(async () => {});

    expect(provedores.fetch.requisicoes).toHaveLength(0);
    expect(result.current.dados.perfil).toBeNull();
  });

  it('erro de rede sobe como ErroDeRede e recarregar tenta de novo', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /perfis/eu', [
      { falhaDeRede: true },
      { corpo: PERFIL },
    ]);
    const { result } = await montar(useMeuPerfil, provedores);

    await waitFor(() =>
      expect(result.current.dados.erro).toBeInstanceOf(ErroDeRede),
    );
    await act(async () => {
      await result.current.dados.recarregar();
    });

    await waitFor(() => expect(result.current.dados.perfil).toEqual(PERFIL));
    expect(result.current.dados.erro).toBeNull();
  });
});

describe('useSalvarPerfil (CA3)', () => {
  it('faz PUT /perfis/eu, grava o retorno e invalida meuPerfil', async () => {
    const provedores = autenticado();
    const novo: MeuPerfil = { ...PERFIL, nome: 'Maria S. Souza' };
    provedores.fetch
      .responder('GET /perfis/eu', [{ corpo: PERFIL }, { corpo: novo }])
      .responder('PUT /perfis/eu', { corpo: novo });
    const { result } = await montar(
      () => ({ leitura: useMeuPerfil(), salvar: useSalvarPerfil() }),
      provedores,
    );
    await waitFor(() =>
      expect(result.current.dados.leitura.perfil).toEqual(PERFIL),
    );
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.dados.salvar.mutateAsync({
        nome: 'Maria S. Souza',
        cidade: 'Lavras',
        habilidades: ['pintura'],
      });
    });

    const put = provedores.fetch.requisicoes.find((r) => r.metodo === 'PUT');
    expect(put).toMatchObject({
      caminho: '/perfis/eu',
      corpo: {
        nome: 'Maria S. Souza',
        cidade: 'Lavras',
        habilidades: ['pintura'],
      },
    });
    expect(put?.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['meuPerfil'] });
    expect(provedores.queryClient.getQueryData(['meuPerfil'])).toEqual(novo);
    await waitFor(() =>
      expect(
        provedores.fetch.requisicoes.filter(
          (r) => r.metodo === 'GET' && r.caminho === '/perfis/eu',
        ),
      ).toHaveLength(2),
    );
    expect(result.current.dados.leitura.perfil).toEqual(novo);
  });

  it('com perfil ainda inexistente (null), salvar passa a devolver o perfil', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('GET /perfis/eu', [
        { status: 404, corpo: { erro: 'nao_encontrado' } },
        { corpo: PERFIL },
      ])
      .responder('PUT /perfis/eu', { corpo: PERFIL });
    const { result } = await montar(
      () => ({ leitura: useMeuPerfil(), salvar: useSalvarPerfil() }),
      provedores,
    );
    await waitFor(() =>
      expect(result.current.dados.leitura.carregando).toBe(false),
    );
    expect(result.current.dados.leitura.perfil).toBeNull();

    await act(async () => {
      await result.current.dados.salvar.mutateAsync({
        nome: PERFIL.nome,
        cidade: PERFIL.cidade,
        habilidades: ['pintura'],
      });
    });

    await waitFor(() =>
      expect(result.current.dados.leitura.perfil).toEqual(PERFIL),
    );
  });

  it('resposta que chega depois de outra sessão começar não entra no cache (S4)', async () => {
    const provedores = autenticado();
    const daContaAntiga: MeuPerfil = { ...PERFIL, nome: 'Conta Antiga' };
    provedores.fetch
      .responder('PUT /perfis/eu', { corpo: daContaAntiga, demoraMs: 30 })
      .responder('DELETE /sessoes', { status: 204 });
    const { result } = await montar(
      () => ({ sessao: useSessao(), salvar: useSalvarPerfil() }),
      provedores,
    );

    let salvo: Promise<unknown> = Promise.resolve();
    await act(async () => {
      salvo = result.current.dados.salvar.mutateAsync({
        nome: 'Conta Antiga',
        cidade: 'Lavras',
        habilidades: ['pintura'],
      });
      await Promise.resolve();
    });
    // Sai e outra conta entra enquanto o PUT ainda está no ar.
    await act(() => result.current.dados.sessao.sair());
    await act(() => result.current.dados.sessao.entrar(TOKEN_NOVO));
    await act(async () => {
      await salvo;
      // A notificação do sucesso sai num `setTimeout(0)` agendado agora: o
      // `afterEach` chega tarde, e o jest-circus deixa o timer disparar no
      // intervalo entre o teste e o hook, fora do `act`.
      await new Promise((resolver) => setTimeout(resolver, 0));
    });

    expect(provedores.queryClient.getQueryData(chaves.meuPerfil())).toBe(
      undefined,
    );
  });

  it('sem conexão falha na hora com ErroDeRede e nada é salvo quando a rede volta (CA58)', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('PUT /perfis/eu', { falhaDeRede: true });
    provedores.queryClient.setQueryData(chaves.meuPerfil(), PERFIL);
    const { result } = await montar(useSalvarPerfil, provedores);
    await act(async () => onlineManager.setOnline(false));
    try {
      let pedido: Promise<unknown> = Promise.resolve();
      await act(async () => {
        pedido = result.current.dados
          .mutateAsync({ ...PERFIL, nome: 'Nome Novo' })
          .catch(() => undefined);
      });

      await waitFor(() =>
        expect(result.current.dados.error).toBeInstanceOf(ErroDeRede),
      );
      expect(result.current.dados.isPaused).toBe(false);
      expect(
        provedores.fetch.requisicoes.filter((r) => r.metodo === 'PUT'),
      ).toHaveLength(1);

      await act(async () => onlineManager.setOnline(true));
      await act(async () => {
        await pedido;
      });

      expect(
        provedores.fetch.requisicoes.filter((r) => r.metodo === 'PUT'),
      ).toHaveLength(1);
      expect(provedores.queryClient.getQueryData(chaves.meuPerfil())).toEqual(
        PERFIL,
      );
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
  });

  it('erro de validação sobe como ErroDaApi com os campos', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('PUT /perfis/eu', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'nome', motivo: 'obrigatorio' }],
      },
    });
    const { result } = await montar(useSalvarPerfil, provedores);

    await act(async () => {
      await result.current.dados
        .mutateAsync({ nome: '', cidade: 'Lavras', habilidades: [] })
        .catch(() => {});
    });

    await waitFor(() =>
      expect(result.current.dados.error).toBeInstanceOf(ErroDaApi),
    );
    const erro = result.current.dados.error as ErroDaApi;
    expect(erro.campos).toEqual([{ campo: 'nome', motivo: 'obrigatorio' }]);
  });
});

describe('usePerfilPublico', () => {
  it('faz GET /perfis/:contaId', async () => {
    const provedores = autenticado();
    const publico = {
      contaId: 'conta-9',
      nome: 'João',
      cidade: 'Lavras',
      descricao: null,
      habilidades: [],
    };
    provedores.fetch.responder('GET /perfis/conta-9', { corpo: publico });
    const { result } = await montar(
      () => usePerfilPublico('conta-9'),
      provedores,
    );

    await waitFor(() => expect(result.current.dados.perfil).toEqual(publico));

    expect(provedores.fetch.requisicoes[0]).toMatchObject({
      metodo: 'GET',
      caminho: '/perfis/conta-9',
    });
    expect(provedores.fetch.requisicoes[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it('404 sobe como ErroDaApi nao_encontrado', async () => {
    const provedores = autenticado();
    const { result } = await montar(
      () => usePerfilPublico('conta-x'),
      provedores,
    );

    await waitFor(() =>
      expect(result.current.dados.erro).toBeInstanceOf(ErroDaApi),
    );
    expect((result.current.dados.erro as ErroDaApi).codigo).toBe(
      'nao_encontrado',
    );
    expect(result.current.dados.perfil).toBeNull();
  });
});

describe('useCategorias', () => {
  it('faz GET /categorias e guarda sem expirar nem coletar', async () => {
    const provedores = autenticado();
    const categorias = [{ id: 'reformas', rotulo: 'Reformas' }];
    provedores.fetch.responder('GET /categorias', { corpo: categorias });
    const { result } = await montar(useCategorias, provedores);

    await waitFor(() =>
      expect(result.current.dados.categorias).toEqual(categorias),
    );

    const consulta = provedores.queryClient
      .getQueryCache()
      .find({ queryKey: chaves.categorias() });
    expect(consulta?.isStale()).toBe(false);
    expect(consulta?.observers[0]?.options.staleTime).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(consulta?.options.gcTime).toBe(Number.POSITIVE_INFINITY);
    expect(provedores.fetch.requisicoes[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });
});

describe('useBusca (CA7)', () => {
  const pagina1 = { itens: [trampo('t1'), trampo('t2')], proximoCursor: 'c1' };
  const pagina2 = { itens: [trampo('t3')], proximoCursor: null };

  it('pede 20 por página, sem campo vazio, e pagina com antesDe até o cursor acabar', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('GET /busca', { corpo: pagina1 })
      .responder('GET /busca?antesDe=c1', { corpo: pagina2 });
    const { result } = await montar(
      () =>
        useBusca({
          texto: ' pintor ',
          cidade: '',
          categoria: '   ',
          tipo: 'trampos',
        }),
      provedores,
    );

    await waitFor(() => expect(result.current.dados.itens).toHaveLength(2));
    expect(result.current.dados.temMais).toBe(true);
    expect(provedores.fetch.requisicoes[0]).toMatchObject({
      metodo: 'GET',
      caminho: '/busca',
      query: { texto: 'pintor', tipo: 'trampos', limite: '20' },
    });
    expect(provedores.fetch.requisicoes[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN}`,
    );

    await act(async () => {
      await result.current.dados.carregarMais();
    });

    expect(provedores.fetch.requisicoes[1]?.query).toEqual({
      texto: 'pintor',
      tipo: 'trampos',
      limite: '20',
      antesDe: 'c1',
    });
    await waitFor(() =>
      expect(result.current.dados.itens.map((i) => i.id)).toEqual([
        't1',
        't2',
        't3',
      ]),
    );
    expect(result.current.dados.temMais).toBe(false);

    await act(async () => {
      await result.current.dados.carregarMais();
    });
    expect(provedores.fetch.requisicoes).toHaveLength(2);
  });

  it('erro na página 2 fica em erroAoCarregarMais e a página 1 continua (Q1)', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('GET /busca', { corpo: pagina1 })
      .responder('GET /busca?antesDe=c1', [
        { status: 500 },
        { corpo: pagina2 },
      ]);
    const { result } = await montar(() => useBusca({}), provedores);
    await waitFor(() => expect(result.current.dados.itens).toHaveLength(2));
    expect(result.current.dados.erroAoCarregarMais).toBeNull();

    await act(async () => {
      await result.current.dados.carregarMais();
    });

    await waitFor(() =>
      expect(result.current.dados.erroAoCarregarMais).toBeInstanceOf(ErroDaApi),
    );
    expect(result.current.dados.itens.map((i) => i.id)).toEqual(['t1', 't2']);
    expect(result.current.dados.temMais).toBe(true);

    await act(async () => {
      await result.current.dados.carregarMais();
    });
    await waitFor(() => expect(result.current.dados.itens).toHaveLength(3));
    expect(result.current.dados.erroAoCarregarMais).toBeNull();
  });

  it('duas chamadas seguidas a carregarMais pedem a página 2 uma vez só (S3)', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('GET /busca', { corpo: pagina1 })
      .responder('GET /busca?antesDe=c1', { corpo: pagina2, demoraMs: 20 });
    const { result } = await montar(() => useBusca({}), provedores);
    await waitFor(() => expect(result.current.dados.itens).toHaveLength(2));

    await act(async () => {
      // O mesmo render: o segundo toque ainda vê `carregandoMais` falso.
      const { carregarMais } = result.current.dados;
      await Promise.all([carregarMais(), carregarMais()]);
    });

    await waitFor(() => expect(result.current.dados.itens).toHaveLength(3));
    expect(
      provedores.fetch.requisicoes.filter((r) => r.query.antesDe === 'c1'),
    ).toHaveLength(1);
  });

  it('sem filtros manda só o limite', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /busca', { corpo: pagina2 });
    const { result } = await montar(() => useBusca({}), provedores);

    await waitFor(() => expect(result.current.dados.itens).toHaveLength(1));

    expect(provedores.fetch.requisicoes[0]?.query).toEqual({ limite: '20' });
  });

  it('não dispara enquanto habilitado for falso e dispara ao habilitar', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /busca', { corpo: pagina2 });
    const { result, rerender } = await renderHook(
      ({ habilitado }: { habilitado: boolean }) => ({
        sessao: useSessao(),
        dados: useBusca({ texto: 'pintor' }, { habilitado }),
      }),
      { wrapper: provedores.wrapper, initialProps: { habilitado: false } },
    );
    await waitFor(() =>
      expect(result.current.sessao.status).toBe('autenticado'),
    );
    await act(async () => {});

    expect(provedores.fetch.requisicoes).toHaveLength(0);
    expect(result.current.dados.itens).toEqual([]);
    expect(result.current.dados.carregando).toBe(false);

    await rerender({ habilitado: true });

    await waitFor(() => expect(result.current.dados.itens).toHaveLength(1));
    expect(provedores.fetch.requisicoes).toHaveLength(1);
  });

  it('erro de rede sobe como ErroDeRede', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /busca', { falhaDeRede: true });
    const { result } = await montar(() => useBusca({}), provedores);

    await waitFor(() =>
      expect(result.current.dados.erro).toBeInstanceOf(ErroDeRede),
    );
    expect(result.current.dados.itens).toEqual([]);
  });

  it('filtros equivalentes compartilham a mesma chave', () => {
    expect(chaves.busca({ texto: ' a ', cidade: '' })).toEqual(
      chaves.busca({ texto: 'a' }),
    );
    expect(normalizarFiltros({ texto: '  ' })).toEqual({});
  });
});

describe('useRecentes (CA7)', () => {
  it.each(['trampos', 'servicos'] as const)(
    'pede tipo=%s com limite=10',
    async (tipo) => {
      const provedores = autenticado();
      provedores.fetch.responder('GET /busca', {
        corpo: { itens: [trampo('t1')], proximoCursor: null },
      });
      const { result } = await montar(() => useRecentes(tipo), provedores);

      await waitFor(() => expect(result.current.dados.itens).toHaveLength(1));

      expect(provedores.fetch.requisicoes[0]).toMatchObject({
        metodo: 'GET',
        caminho: '/busca',
        query: { tipo, limite: '10' },
      });
    },
  );
});

describe('useTrampo e useServico', () => {
  it('useTrampo faz GET /trampos/:id', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /trampos/t1', { corpo: { id: 't1' } });
    const { result } = await montar(() => useTrampo('t1'), provedores);

    await waitFor(() =>
      expect(result.current.dados.trampo).toEqual({ id: 't1' }),
    );
    expect(provedores.fetch.requisicoes[0]).toMatchObject({
      metodo: 'GET',
      caminho: '/trampos/t1',
    });
  });

  it('useServico faz GET /servicos/:id', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('GET /servicos/s1', { corpo: { id: 's1' } });
    const { result } = await montar(() => useServico('s1'), provedores);

    await waitFor(() =>
      expect(result.current.dados.servico).toEqual({ id: 's1' }),
    );
    expect(provedores.fetch.requisicoes[0]).toMatchObject({
      metodo: 'GET',
      caminho: '/servicos/s1',
    });
  });

  it('id inexistente sobe como ErroDaApi 404', async () => {
    const provedores = autenticado();
    const { result } = await montar(() => useTrampo('nada'), provedores);

    await waitFor(() =>
      expect(result.current.dados.erro).toBeInstanceOf(ErroDaApi),
    );
    expect((result.current.dados.erro as ErroDaApi).status).toBe(404);
  });
});
