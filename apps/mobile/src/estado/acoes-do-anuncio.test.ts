import {
  notifyManager,
  onlineManager,
  QueryClient,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { RespostaFalsa } from '../testes/fetch-falso';
import { criarProvedores as criarProvedoresBase } from '../testes/renderizar';
import { textos } from '../textos/pt-BR';
import {
  type AnuncioDaFolha,
  type AnuncioParaAcoes,
  acoesDoAnuncio,
  type OpcoesDasAcoesDoAnuncio,
  useAcoesDoAnuncio,
} from './acoes-do-anuncio';
import { criarArmazenamentoEmMemoria } from './armazenamento-token';
import {
  useMeusServicos,
  useMeusTrampos,
  useTrampo,
} from './consultas/anuncios';
import { chaves } from './consultas/chaves';
import { useSessao } from './sessao';

const t = textos.anuncio;
const OK = { disponivel: true };
const nao = (motivo: string) => ({ disponivel: false, motivo });
const SEM_CONEXAO = nao(t.motivoSemConexao);

describe('acoesDoAnuncio: trampo (D30, D34)', () => {
  // [status, candidaturas, online, editar, encerrar, excluir]; `undefined`
  // em encerrar = a ação não existe.
  const TABELA = [
    ['aberto', 0, true, OK, OK, OK],
    ['aberto', 1, true, nao(t.motivoEditarComCandidaturas), OK, OK],
    ['aberto', 3, true, nao(t.motivoEditarComCandidaturas), OK, OK],
    [
      'em_andamento',
      0,
      true,
      nao(t.motivoEditarEmAndamento),
      OK,
      nao(t.motivoExcluirNaoAberto),
    ],
    [
      'em_andamento',
      2,
      true,
      nao(t.motivoEditarEmAndamento),
      OK,
      nao(t.motivoExcluirNaoAberto),
    ],
    [
      'encerrado',
      0,
      true,
      nao(t.motivoEditarEncerrado),
      undefined,
      nao(t.motivoExcluirNaoAberto),
    ],
    [
      'encerrado',
      2,
      true,
      nao(t.motivoEditarEncerrado),
      undefined,
      nao(t.motivoExcluirNaoAberto),
    ],
    // Offline: o que a regra libera fica sem conexão; o que ela já nega
    // mantém o motivo dela (conectar-se não resolveria).
    ['aberto', 0, false, SEM_CONEXAO, SEM_CONEXAO, SEM_CONEXAO],
    [
      'aberto',
      3,
      false,
      nao(t.motivoEditarComCandidaturas),
      SEM_CONEXAO,
      SEM_CONEXAO,
    ],
    [
      'em_andamento',
      0,
      false,
      nao(t.motivoEditarEmAndamento),
      SEM_CONEXAO,
      nao(t.motivoExcluirNaoAberto),
    ],
    [
      'em_andamento',
      2,
      false,
      nao(t.motivoEditarEmAndamento),
      SEM_CONEXAO,
      nao(t.motivoExcluirNaoAberto),
    ],
    [
      'encerrado',
      0,
      false,
      nao(t.motivoEditarEncerrado),
      undefined,
      nao(t.motivoExcluirNaoAberto),
    ],
    [
      'encerrado',
      2,
      false,
      nao(t.motivoEditarEncerrado),
      undefined,
      nao(t.motivoExcluirNaoAberto),
    ],
  ] as const;

  it.each(TABELA)(
    '%s com %i candidaturas, online %s',
    (status, candidaturasRecebidas, online, editar, encerrar, excluir) => {
      const acoes = acoesDoAnuncio(
        { tipo: 'trampo', status, candidaturasRecebidas },
        online,
      );

      expect(acoes.editar).toEqual(editar);
      expect(acoes.excluir).toEqual(excluir);
      if (encerrar === undefined) {
        expect(acoes).not.toHaveProperty('encerrar');
      } else {
        expect(acoes.encerrar).toEqual(encerrar);
      }
    },
  );

  it('sem a contagem de candidaturas (campo ausente) vale como zero', () => {
    const acoes = acoesDoAnuncio({ tipo: 'trampo', status: 'aberto' }, true);

    expect(acoes.editar).toEqual(OK);
    expect(acoes.efeitoDoExcluir).toBe(t.excluirTrampoTexto(0));
  });

  it('as mensagens dos diálogos dizem o efeito de cada status e da contagem', () => {
    const efeitos = (
      status: 'aberto' | 'em_andamento' | 'encerrado',
      candidaturasRecebidas: number,
    ) => {
      const { efeitoDoEncerrar, efeitoDoExcluir } = acoesDoAnuncio(
        { tipo: 'trampo', status, candidaturasRecebidas },
        true,
      );
      return { efeitoDoEncerrar, efeitoDoExcluir };
    };

    expect(efeitos('aberto', 0)).toEqual({
      efeitoDoEncerrar: t.encerrarTextoAberto,
      efeitoDoExcluir: t.excluirTrampoTexto(0),
    });
    expect(efeitos('aberto', 3)).toEqual({
      efeitoDoEncerrar: t.encerrarTextoAberto,
      efeitoDoExcluir: t.excluirTrampoTexto(3),
    });
    expect(efeitos('em_andamento', 1).efeitoDoEncerrar).toBe(
      t.encerrarTextoEmAndamento,
    );
    // Sem Encerrar não há mensagem de encerrar.
    expect(efeitos('encerrado', 0).efeitoDoEncerrar).toBe('');
    // As mensagens com e sem candidaturas são diferentes de fato.
    expect(t.excluirTrampoTexto(3)).not.toBe(t.excluirTrampoTexto(0));
    expect(t.encerrarTextoAberto).not.toBe(t.encerrarTextoEmAndamento);
  });
});

describe('acoesDoAnuncio: serviço', () => {
  it('online: editar e excluir sempre disponíveis, sem encerrar', () => {
    const acoes = acoesDoAnuncio({ tipo: 'servico' }, true);

    expect(acoes.editar).toEqual(OK);
    expect(acoes.excluir).toEqual(OK);
    expect(acoes).not.toHaveProperty('encerrar');
    expect(acoes.efeitoDoExcluir).toBe(t.excluirServicoTexto);
    expect(acoes.efeitoDoEncerrar).toBe('');
  });

  it('offline: as duas ações ficam desabilitadas com o motivo de sem conexão', () => {
    const acoes = acoesDoAnuncio({ tipo: 'servico' }, false);

    expect(acoes.editar).toEqual(SEM_CONEXAO);
    expect(acoes.excluir).toEqual(SEM_CONEXAO);
    expect(acoes).not.toHaveProperty('encerrar');
  });

  it('ignora status e contagem de candidaturas que não são do serviço', () => {
    const intruso = {
      tipo: 'servico',
      status: 'encerrado',
      candidaturasRecebidas: 9,
    } as AnuncioParaAcoes;

    expect(acoesDoAnuncio(intruso, true)).toEqual(
      acoesDoAnuncio({ tipo: 'servico' }, true),
    );
  });
});

// ---- useAcoesDoAnuncio ----

const TOKEN = 'token-da-sessao-123';
const TOKEN_NOVO = 'token-novo-456';

const TRAMPO: AnuncioDaFolha = {
  tipo: 'trampo',
  id: 't1',
  titulo: 'Pintar a sala',
  status: 'aberto',
  candidaturasRecebidas: 0,
};
const TRAMPO_ANDAMENTO: AnuncioDaFolha = {
  tipo: 'trampo',
  id: 't1',
  titulo: 'Pintar a sala',
  status: 'em_andamento',
  candidaturasRecebidas: 1,
};
const SERVICO: AnuncioDaFolha = {
  tipo: 'servico',
  id: 's1',
  titulo: 'Reparos em geral',
};

function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  });
}

function montarHook() {
  const provedores = criarProvedoresBase({
    queryClient: criarQueryClient(),
    armazenamento: criarArmazenamentoEmMemoria(TOKEN),
  });
  const aoEditar = jest.fn();
  const aoExcluir = jest.fn();
  const montar = async () => {
    const resultado = await renderHook(
      () => ({
        sessao: useSessao(),
        meusTrampos: useMeusTrampos(),
        meusServicos: useMeusServicos(),
        acoes: useAcoesDoAnuncio({ aoEditar, aoExcluir }),
      }),
      { wrapper: provedores.wrapper },
    );
    await waitFor(() =>
      expect(resultado.result.current.sessao.status).toBe('autenticado'),
    );
    return resultado;
  };
  return { provedores, aoEditar, aoExcluir, montar };
}

type Montado = Awaited<ReturnType<ReturnType<typeof montarHook>['montar']>>;

/** O `folha` que `abrir` deixa; falha se a folha não existe. */
function folhaDe(montado: Montado) {
  const { folha } = montado.result.current.acoes;
  if (folha === undefined) {
    throw new Error('a folha não foi aberta');
  }
  return folha;
}

async function abrir(montado: Montado, anuncio: AnuncioDaFolha) {
  await act(async () => {
    montado.result.current.acoes.abrir(anuncio);
  });
}

function contar(
  provedores: ReturnType<typeof montarHook>['provedores'],
  metodo: string,
  caminho: string,
) {
  return provedores.fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  ).length;
}

const ERRO_404: RespostaFalsa = {
  status: 404,
  corpo: { erro: 'nao_encontrado' },
};

// O TanStack avisa os componentes num `setTimeout(0)`, que às vezes cai fora
// do `act`: aqui o aviso sai numa microtarefa, dentro do `await` do teste.
beforeEach(() => {
  notifyManager.setScheduler((f) => {
    void Promise.resolve().then(f);
  });
});

afterEach(async () => {
  await act(async () => {
    onlineManager.setOnline(true);
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
  notifyManager.setScheduler((f) => setTimeout(f, 0));
});

describe('useAcoesDoAnuncio: abrir e editar', () => {
  it('não há folha antes do primeiro abrir; depois mostra as ações do anúncio', async () => {
    const { montar } = montarHook();
    const montado = await montar();
    expect(montado.result.current.acoes.folha).toBeUndefined();
    expect(montado.result.current.acoes.toast).toBeNull();

    await abrir(montado, TRAMPO);

    const folha = folhaDe(montado);
    expect(folha).toMatchObject({
      visivel: true,
      titulo: 'Pintar a sala',
      tipo: 'trampo',
      editar: OK,
      encerrar: OK,
      excluir: OK,
      efeitoDoEncerrar: t.encerrarTextoAberto,
      efeitoDoExcluir: t.excluirTrampoTexto(0),
      processando: null,
    });
    expect(folha).not.toHaveProperty('erro');
  });

  it('o serviço não traz Encerrar', async () => {
    const montado = await montarHook().montar();

    await abrir(montado, SERVICO);

    const folha = folhaDe(montado);
    expect(folha.tipo).toBe('servico');
    expect(folha).not.toHaveProperty('encerrar');
    expect(folha.efeitoDoExcluir).toBe(t.excluirServicoTexto);
  });

  it('sem conexão tudo fica desabilitado com o motivo, e volta quando a rede volta', async () => {
    const montado = await montarHook().montar();
    await abrir(montado, TRAMPO);
    await act(async () => onlineManager.setOnline(false));

    await waitFor(() => expect(folhaDe(montado).editar).toEqual(SEM_CONEXAO));
    expect(folhaDe(montado).encerrar).toEqual(SEM_CONEXAO);
    expect(folhaDe(montado).excluir).toEqual(SEM_CONEXAO);

    await act(async () => onlineManager.setOnline(true));

    await waitFor(() => expect(folhaDe(montado).editar).toEqual(OK));
  });

  it('Editar fecha a folha e entrega o anúncio à rota', async () => {
    const { montar, aoEditar } = montarHook();
    const montado = await montar();
    await abrir(montado, TRAMPO);

    await act(async () => folhaDe(montado).onEditar());

    expect(aoEditar).toHaveBeenCalledTimes(1);
    expect(aoEditar).toHaveBeenCalledWith(TRAMPO);
    expect(folhaDe(montado).visivel).toBe(false);
  });

  it('Editar indisponível (candidaturas, sem conexão) não chama a rota', async () => {
    const { montar, aoEditar } = montarHook();
    const montado = await montar();
    await abrir(montado, { ...TRAMPO, candidaturasRecebidas: 2 });

    await act(async () => folhaDe(montado).onEditar());

    expect(aoEditar).not.toHaveBeenCalled();
    expect(folhaDe(montado).visivel).toBe(true);

    await abrir(montado, SERVICO);
    await act(async () => onlineManager.setOnline(false));
    await waitFor(() => expect(folhaDe(montado).editar.disponivel).toBe(false));
    await act(async () => folhaDe(montado).onEditar());

    expect(aoEditar).not.toHaveBeenCalled();
  });

  it('onFechar esconde a folha e o abrir seguinte a mostra de novo, sem o erro de antes', async () => {
    const { montar, provedores } = montarHook();
    provedores.fetch.responder('DELETE /servicos/s1', { status: 500 });
    const montado = await montar();
    await abrir(montado, SERVICO);
    await act(async () => folhaDe(montado).onExcluir());
    await waitFor(() => expect(folhaDe(montado)).toHaveProperty('erro'));

    await act(async () => folhaDe(montado).onFechar());
    expect(folhaDe(montado).visivel).toBe(false);
    await abrir(montado, SERVICO);

    expect(folhaDe(montado).visivel).toBe(true);
    expect(folhaDe(montado)).not.toHaveProperty('erro');
  });
});

describe('useAcoesDoAnuncio: encerrar (CA33)', () => {
  it('POST sem corpo, processando durante o pedido, depois fecha a folha e mostra o toast', async () => {
    const { montar, provedores, aoExcluir } = montarHook();
    provedores.fetch
      .responder('GET /trampos/meus', [
        { corpo: [{ id: 't1', status: 'aberto' }] },
        { corpo: [{ id: 't1', status: 'encerrado' }] },
      ])
      .responder('POST /trampos/t1/encerrar', { status: 204, demoraMs: 40 });
    const montado = await montar();
    await waitFor(() =>
      expect(montado.result.current.meusTrampos.trampos).toHaveLength(1),
    );
    await abrir(montado, TRAMPO);

    await act(async () => folhaDe(montado).onEncerrar());
    await waitFor(() => expect(folhaDe(montado).processando).toBe('encerrar'));
    expect(folhaDe(montado).visivel).toBe(true);

    await waitFor(() => expect(folhaDe(montado).processando).toBeNull());
    expect(folhaDe(montado).visivel).toBe(false);
    expect(montado.result.current.acoes.toast).toBe(t.trampoEncerrado);
    expect(contar(provedores, 'POST', '/trampos/t1/encerrar')).toBe(1);
    expect(provedores.fetch.requisicoes.at(-1)?.corpo).toBeUndefined();
    // A lista foi recarregada antes de a folha terminar.
    expect(contar(provedores, 'GET', '/trampos/meus')).toBe(2);
    expect(montado.result.current.meusTrampos.trampos?.[0]?.status).toBe(
      'encerrado',
    );
    // Encerrar não tira o anúncio da tela.
    expect(aoExcluir).not.toHaveBeenCalled();
  });

  it('o trampo em andamento também encerra', async () => {
    const { montar, provedores } = montarHook();
    provedores.fetch
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('POST /trampos/t1/encerrar', { status: 204 });
    const montado = await montar();
    await abrir(montado, TRAMPO_ANDAMENTO);
    expect(folhaDe(montado).efeitoDoEncerrar).toBe(t.encerrarTextoEmAndamento);

    await act(async () => folhaDe(montado).onEncerrar());

    await waitFor(() =>
      expect(montado.result.current.acoes.toast).toBe(t.trampoEncerrado),
    );
  });

  it('com a ação desabilitada (sem conexão) o onEncerrar não faz requisição', async () => {
    const { montar, provedores } = montarHook();
    const montado = await montar();
    await abrir(montado, TRAMPO);
    await act(async () => onlineManager.setOnline(false));
    await waitFor(() => expect(folhaDe(montado).encerrar).toEqual(SEM_CONEXAO));

    await act(async () => folhaDe(montado).onEncerrar());

    expect(contar(provedores, 'POST', '/trampos/t1/encerrar')).toBe(0);
    expect(folhaDe(montado).processando).toBeNull();
  });

  it('o 404 vira "já removido": toast, folha fechada, detalhe fora do cache e a rota avisada', async () => {
    const { montar, provedores, aoExcluir } = montarHook();
    provedores.fetch
      .responder('GET /trampos/meus', [
        { corpo: [{ id: 't1' }] },
        { corpo: [] },
      ])
      .responder('POST /trampos/t1/encerrar', ERRO_404);
    provedores.queryClient.setQueryData(chaves.trampo('t1'), { id: 't1' });
    const montado = await montar();
    await waitFor(() =>
      expect(montado.result.current.meusTrampos.trampos).toHaveLength(1),
    );
    await abrir(montado, TRAMPO);

    await act(async () => folhaDe(montado).onEncerrar());

    await waitFor(() =>
      expect(montado.result.current.acoes.toast).toBe(t.jaNaoExiste),
    );
    expect(folhaDe(montado).visivel).toBe(false);
    expect(folhaDe(montado).processando).toBeNull();
    expect(folhaDe(montado)).not.toHaveProperty('erro');
    expect(aoExcluir).toHaveBeenCalledWith(TRAMPO, 'ja_removido');
    expect(
      provedores.queryClient.getQueryState(chaves.trampo('t1')),
    ).toBeUndefined();
    await waitFor(() =>
      expect(montado.result.current.meusTrampos.trampos).toEqual([]),
    );
  });
});

describe('useAcoesDoAnuncio: excluir (CA33)', () => {
  it('trampo: DELETE, detalhe fora do cache, toast e a rota avisada', async () => {
    const { montar, provedores, aoExcluir } = montarHook();
    provedores.fetch
      .responder('GET /trampos/meus', [
        { corpo: [{ id: 't1' }] },
        { corpo: [] },
      ])
      .responder('DELETE /trampos/t1', { status: 204 })
      .responder('GET /trampos/t1', ERRO_404);
    provedores.queryClient.setQueryData(chaves.trampo('t1'), { id: 't1' });
    const montado = await montar();
    await waitFor(() =>
      expect(montado.result.current.meusTrampos.trampos).toHaveLength(1),
    );
    await abrir(montado, TRAMPO);

    await act(async () => folhaDe(montado).onExcluir());
    await waitFor(() =>
      expect(montado.result.current.acoes.toast).toBe(t.trampoExcluido),
    );

    expect(folhaDe(montado).visivel).toBe(false);
    expect(folhaDe(montado).processando).toBeNull();
    expect(aoExcluir).toHaveBeenCalledTimes(1);
    expect(aoExcluir).toHaveBeenCalledWith(TRAMPO, 'excluido');
    expect(
      provedores.queryClient.getQueryState(chaves.trampo('t1')),
    ).toBeUndefined();
    expect(contar(provedores, 'GET', '/trampos/t1')).toBe(0);
    expect(montado.result.current.meusTrampos.trampos).toEqual([]);
  });

  it('serviço: DELETE /servicos/:id, toast do serviço e a lista de serviços recarregada', async () => {
    const { montar, provedores, aoExcluir } = montarHook();
    provedores.fetch
      .responder('GET /servicos/meus', [
        { corpo: [{ id: 's1' }] },
        { corpo: [] },
      ])
      .responder('DELETE /servicos/s1', { status: 204 });
    const montado = await montar();
    await waitFor(() =>
      expect(montado.result.current.meusServicos.servicos).toHaveLength(1),
    );
    await abrir(montado, SERVICO);

    await act(async () => folhaDe(montado).onExcluir());
    await waitFor(() =>
      expect(montado.result.current.acoes.toast).toBe(t.servicoExcluido),
    );

    expect(contar(provedores, 'DELETE', '/servicos/s1')).toBe(1);
    expect(contar(provedores, 'DELETE', '/trampos/s1')).toBe(0);
    expect(aoExcluir).toHaveBeenCalledWith(SERVICO, 'excluido');
    expect(montado.result.current.meusServicos.servicos).toEqual([]);
  });

  it('o 404 vira "já removido" também ao excluir', async () => {
    const { montar, provedores, aoExcluir } = montarHook();
    provedores.fetch
      .responder('GET /servicos/meus', { corpo: [] })
      .responder('DELETE /servicos/s1', ERRO_404);
    provedores.queryClient.setQueryData(chaves.servico('s1'), { id: 's1' });
    const montado = await montar();
    await abrir(montado, SERVICO);

    await act(async () => folhaDe(montado).onExcluir());

    await waitFor(() =>
      expect(montado.result.current.acoes.toast).toBe(t.jaNaoExiste),
    );
    expect(folhaDe(montado).visivel).toBe(false);
    expect(folhaDe(montado)).not.toHaveProperty('erro');
    expect(aoExcluir).toHaveBeenCalledWith(SERVICO, 'ja_removido');
    expect(
      provedores.queryClient.getQueryState(chaves.servico('s1')),
    ).toBeUndefined();
  });

  it('o detalhe observado por useTrampo não é recarregado (404) depois da exclusão', async () => {
    const { provedores } = montarHook();
    provedores.fetch
      .responder('GET /trampos/t1', { corpo: { id: 't1' } })
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('DELETE /trampos/t1', { status: 204 });
    const resultado = await renderHook(
      () => ({
        sessao: useSessao(),
        trampo: useTrampo('t1'),
        acoes: useAcoesDoAnuncio({ aoEditar: jest.fn() }),
      }),
      { wrapper: provedores.wrapper },
    );
    await waitFor(() =>
      expect(resultado.result.current.trampo.trampo).not.toBeNull(),
    );
    await act(async () => {
      resultado.result.current.acoes.abrir(TRAMPO);
    });

    await act(async () => resultado.result.current.acoes.folha?.onExcluir());
    await waitFor(() =>
      expect(resultado.result.current.acoes.toast).toBe(t.trampoExcluido),
    );
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 20));
    });

    expect(contar(provedores, 'GET', '/trampos/t1')).toBe(1);
  });
});

describe('useAcoesDoAnuncio: erros e toque duplo', () => {
  it.each<[string, RespostaFalsa, string]>([
    ['500', { status: 500 }, t.erroAoExcluir],
    ['sem conexão', { falhaDeRede: true }, textos.erros.sem_conexao],
    [
      '429',
      { status: 429, corpo: { erro: 'muitas_requisicoes' } },
      textos.erros.muitas_tentativas_acao,
    ],
    [
      '409 trampo_nao_aberto',
      { status: 409, corpo: { erro: 'trampo_nao_aberto' } },
      t.motivoExcluirNaoAberto,
    ],
  ])(
    'excluir com %s: a folha segue aberta com a mensagem, sem toast nem aviso à rota',
    async (_nome, resposta, mensagem) => {
      const { montar, provedores, aoExcluir } = montarHook();
      provedores.fetch.responder('DELETE /trampos/t1', resposta);
      provedores.queryClient.setQueryData(chaves.trampo('t1'), { id: 't1' });
      const montado = await montar();
      await abrir(montado, TRAMPO);

      await act(async () => folhaDe(montado).onExcluir());

      await waitFor(() => expect(folhaDe(montado).erro).toBe(mensagem));
      expect(folhaDe(montado).visivel).toBe(true);
      expect(folhaDe(montado).processando).toBeNull();
      expect(montado.result.current.acoes.toast).toBeNull();
      expect(aoExcluir).not.toHaveBeenCalled();
      expect(provedores.queryClient.getQueryData(chaves.trampo('t1'))).toEqual({
        id: 't1',
      });
    },
  );

  it('excluir com 409 trampo_nao_aberto recarrega o detalhe e "meus trampos" (R4)', async () => {
    const { provedores } = montarHook();
    provedores.fetch
      .responder('GET /trampos/t1', { corpo: { id: 't1' } })
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('DELETE /trampos/t1', {
        status: 409,
        corpo: { erro: 'trampo_nao_aberto' },
      });
    const resultado = await renderHook(
      () => ({
        sessao: useSessao(),
        trampo: useTrampo('t1'),
        meus: useMeusTrampos(),
        acoes: useAcoesDoAnuncio({ aoEditar: jest.fn() }),
      }),
      { wrapper: provedores.wrapper },
    );
    await waitFor(() => {
      expect(resultado.result.current.trampo.trampo).not.toBeNull();
      expect(resultado.result.current.meus.trampos).not.toBeNull();
    });
    await act(async () => {
      resultado.result.current.acoes.abrir(TRAMPO);
    });

    await act(async () => resultado.result.current.acoes.folha?.onExcluir());
    await waitFor(() =>
      expect(resultado.result.current.acoes.folha?.erro).toBe(
        t.motivoExcluirNaoAberto,
      ),
    );
    await waitFor(() => {
      expect(contar(provedores, 'GET', '/trampos/t1')).toBe(2);
      expect(contar(provedores, 'GET', '/trampos/meus')).toBe(2);
    });
  });

  it('Excluir indisponível (trampo em andamento) não faz requisição', async () => {
    const { montar, provedores } = montarHook();
    const montado = await montar();
    await abrir(montado, TRAMPO_ANDAMENTO);
    expect(folhaDe(montado).excluir).toEqual(nao(t.motivoExcluirNaoAberto));

    await act(async () => folhaDe(montado).onExcluir());

    expect(contar(provedores, 'DELETE', '/trampos/t1')).toBe(0);
    expect(folhaDe(montado).processando).toBeNull();
  });

  it('encerrar com erro genérico mostra o texto de encerrar e nunca o corpo do erro', async () => {
    const { montar, provedores } = montarHook();
    provedores.fetch.responder('POST /trampos/t1/encerrar', {
      status: 500,
      corpo: { erro: 'PINTAR-A-SALA-SEGREDO' },
    });
    const montado = await montar();
    await abrir(montado, TRAMPO);

    await act(async () => folhaDe(montado).onEncerrar());

    await waitFor(() => expect(folhaDe(montado).erro).toBe(t.erroAoEncerrar));
    expect(JSON.stringify(folhaDe(montado))).not.toContain('SEGREDO');
  });

  it('toque duplo faz uma requisição só, seja no mesmo botão, seja em botões diferentes', async () => {
    const { montar, provedores } = montarHook();
    provedores.fetch
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('DELETE /trampos/t1', { status: 204, demoraMs: 30 })
      .responder('POST /trampos/t1/encerrar', { status: 204, demoraMs: 30 });
    const montado = await montar();
    await abrir(montado, TRAMPO);
    // O mesmo fechamento do render, como no aparelho: dois `onPress` seguidos
    // antes de o React renderizar de novo.
    const { onExcluir, onEncerrar } = folhaDe(montado);

    await act(async () => {
      onExcluir();
      onExcluir();
      onEncerrar();
    });
    await waitFor(() =>
      expect(montado.result.current.acoes.toast).toBe(t.trampoExcluido),
    );

    expect(contar(provedores, 'DELETE', '/trampos/t1')).toBe(1);
    expect(contar(provedores, 'POST', '/trampos/t1/encerrar')).toBe(0);
  });

  it('depois que a ação termina, uma nova ação é aceita', async () => {
    const { montar, provedores } = montarHook();
    provedores.fetch
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('POST /trampos/t1/encerrar', { status: 204 });
    const montado = await montar();
    await abrir(montado, TRAMPO);
    await act(async () => folhaDe(montado).onEncerrar());
    await waitFor(() =>
      expect(montado.result.current.acoes.toast).toBe(t.trampoEncerrado),
    );
    await abrir(montado, TRAMPO);

    await act(async () => folhaDe(montado).onEncerrar());

    await waitFor(() =>
      expect(contar(provedores, 'POST', '/trampos/t1/encerrar')).toBe(2),
    );
    await waitFor(() => expect(folhaDe(montado).processando).toBeNull());
  });

  it('onFechar durante o pedido é ignorado', async () => {
    const { montar, provedores } = montarHook();
    provedores.fetch
      .responder('GET /servicos/meus', { corpo: [] })
      .responder('DELETE /servicos/s1', { status: 204, demoraMs: 40 });
    const montado = await montar();
    await abrir(montado, SERVICO);
    await act(async () => folhaDe(montado).onExcluir());
    await waitFor(() => expect(folhaDe(montado).processando).toBe('excluir'));

    await act(async () => folhaDe(montado).onFechar());

    expect(folhaDe(montado).visivel).toBe(true);
    await waitFor(() => expect(folhaDe(montado).visivel).toBe(false));
  });

  it('fecharToast limpa o toast', async () => {
    const { montar, provedores } = montarHook();
    provedores.fetch
      .responder('GET /servicos/meus', { corpo: [] })
      .responder('DELETE /servicos/s1', { status: 204 });
    const montado = await montar();
    await abrir(montado, SERVICO);
    await act(async () => folhaDe(montado).onExcluir());
    await waitFor(() =>
      expect(montado.result.current.acoes.toast).toBe(t.servicoExcluido),
    );

    await act(async () => montado.result.current.acoes.fecharToast());

    expect(montado.result.current.acoes.toast).toBeNull();
  });
});

describe('useAcoesDoAnuncio: folha viva (CA61, R8)', () => {
  /** O que a rota faz: o trampo do cache de `useTrampo` sobre o aberto. */
  function doDetalhe(trampo: ReturnType<typeof useTrampo>['trampo']) {
    return (aberto: AnuncioDaFolha): AnuncioDaFolha | null =>
      trampo === null || aberto.tipo !== 'trampo'
        ? null
        : {
            ...aberto,
            titulo: trampo.titulo,
            status: trampo.status,
            ...(trampo.candidaturasRecebidas !== undefined && {
              candidaturasRecebidas: trampo.candidaturasRecebidas,
            }),
          };
  }

  function trampoDaApi(
    status: 'aberto' | 'em_andamento',
    titulo = TRAMPO.titulo,
  ) {
    return {
      id: 't1',
      autorId: 'conta-eu',
      titulo,
      descricao: 'Descrição',
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 10_000,
      prazo: null,
      status,
      criadoEm: '2026-10-21T10:00:00.000Z',
      versao: 1,
      candidaturasRecebidas: status === 'aberto' ? 0 : 1,
    };
  }

  async function montarComDetalhe(
    provedores: ReturnType<typeof montarHook>['provedores'],
    aoEditar = jest.fn(),
    extras: Pick<OpcoesDasAcoesDoAnuncio, 'aoExcluir' | 'consultaDoAtual'> = {},
  ) {
    const resultado = await renderHook(
      () => {
        const { trampo } = useTrampo('t1');
        return {
          sessao: useSessao(),
          trampo,
          meus: useMeusTrampos(),
          acoes: useAcoesDoAnuncio({
            aoEditar,
            anuncioAtual: doDetalhe(trampo),
            ...extras,
          }),
        };
      },
      { wrapper: provedores.wrapper },
    );
    await waitFor(() => expect(resultado.result.current.trampo).not.toBeNull());
    return resultado;
  }

  it('depois do 409 trampo_nao_aberto, a folha aberta mostra Excluir indisponível com o motivo, sem fechar e reabrir', async () => {
    const { provedores } = montarHook();
    provedores.fetch
      .responder('GET /trampos/t1', [
        { corpo: trampoDaApi('aberto') },
        { corpo: trampoDaApi('em_andamento') },
      ])
      .responder('DELETE /trampos/t1', {
        status: 409,
        corpo: { erro: 'trampo_nao_aberto' },
      });
    const montado = await montarComDetalhe(provedores);
    await act(async () => {
      montado.result.current.acoes.abrir(TRAMPO);
    });
    expect(montado.result.current.acoes.folha?.excluir).toEqual(OK);

    await act(async () => montado.result.current.acoes.folha?.onExcluir());

    await waitFor(() =>
      expect(montado.result.current.acoes.folha?.excluir).toEqual(
        nao(t.motivoExcluirNaoAberto),
      ),
    );
    const folha = montado.result.current.acoes.folha;
    expect(folha?.visivel).toBe(true);
    expect(folha?.editar).toEqual(nao(t.motivoEditarEmAndamento));
    expect(folha?.efeitoDoEncerrar).toBe(t.encerrarTextoEmAndamento);
    expect(contar(provedores, 'GET', '/trampos/t1')).toBe(2);

    // E o toque em Excluir não faz outro DELETE.
    await act(async () => montado.result.current.acoes.folha?.onExcluir());
    expect(contar(provedores, 'DELETE', '/trampos/t1')).toBe(1);
  });

  it('a troca do anúncio no cache chega à folha aberta, e as ações usam o anúncio atual', async () => {
    const { provedores } = montarHook();
    provedores.fetch.responder('GET /trampos/t1', {
      corpo: trampoDaApi('em_andamento'),
    });
    const aoEditar = jest.fn();
    const montado = await montarComDetalhe(provedores, aoEditar);
    await act(async () => {
      montado.result.current.acoes.abrir(TRAMPO_ANDAMENTO);
    });
    expect(montado.result.current.acoes.folha?.editar).toEqual(
      nao(t.motivoEditarEmAndamento),
    );

    await act(async () => {
      provedores.queryClient.setQueryData(
        chaves.trampo('t1'),
        trampoDaApi('aberto', 'Pintar a sala e a cozinha'),
      );
    });

    await waitFor(() =>
      expect(montado.result.current.acoes.folha?.editar).toEqual(OK),
    );
    expect(montado.result.current.acoes.folha?.titulo).toBe(
      'Pintar a sala e a cozinha',
    );
    await act(async () => montado.result.current.acoes.folha?.onEditar());
    expect(aoEditar).toHaveBeenCalledWith({
      ...TRAMPO,
      titulo: 'Pintar a sala e a cozinha',
    });
  });

  it('anuncioAtual que devolve null ou outro anúncio é ignorado: vale o do abrir', async () => {
    const { provedores } = montarHook();
    let resposta: AnuncioDaFolha | null = null;
    const { result, rerender } = await renderHook(
      () => ({
        sessao: useSessao(),
        acoes: useAcoesDoAnuncio({
          aoEditar: jest.fn(),
          anuncioAtual: () => resposta,
        }),
      }),
      { wrapper: provedores.wrapper },
    );
    await waitFor(() =>
      expect(result.current.sessao.status).toBe('autenticado'),
    );
    await act(async () => {
      result.current.acoes.abrir(TRAMPO);
    });
    expect(result.current.acoes.folha?.excluir).toEqual(OK);

    for (const outro of [
      { ...TRAMPO_ANDAMENTO, id: 't2' },
      { ...SERVICO, id: 't1' },
    ]) {
      resposta = outro;
      await rerender({});
      expect(result.current.acoes.folha?.excluir).toEqual(OK);
      expect(result.current.acoes.folha?.tipo).toBe('trampo');
    }

    // Controle: a mesma resposta, com o id e o tipo do aberto, vale.
    resposta = TRAMPO_ANDAMENTO;
    await rerender({});
    expect(result.current.acoes.folha?.excluir).toEqual(
      nao(t.motivoExcluirNaoAberto),
    );
  });

  describe('conflito: o desfecho da releitura depois do 409 (CA61, Q3, R2)', () => {
    const CONFLITO_409: RespostaFalsa = {
      status: 409,
      corpo: { erro: 'trampo_nao_aberto' },
    };

    async function excluirComConflito(montado: {
      result: { current: { acoes: { folha?: { onExcluir: () => void } } } };
    }) {
      await act(async () => montado.result.current.acoes.folha?.onExcluir());
    }

    it('relendo enquanto o detalhe é relido; relido quando ele volta, com as ações do dado novo', async () => {
      const { provedores } = montarHook();
      provedores.fetch
        .responder('GET /trampos/meus', { corpo: [] })
        .responder('GET /trampos/t1', [
          { corpo: trampoDaApi('aberto') },
          { corpo: trampoDaApi('em_andamento'), demoraMs: 50 },
        ])
        .responder('DELETE /trampos/t1', CONFLITO_409);
      const montado = await montarComDetalhe(provedores);
      await act(async () => montado.result.current.acoes.abrir(TRAMPO));
      expect(montado.result.current.acoes.conflito).toBeNull();

      await excluirComConflito(montado);

      await waitFor(() =>
        expect(montado.result.current.acoes.conflito).toBe('relendo'),
      );
      expect(montado.result.current.acoes.folha?.erro).toBe(
        t.motivoExcluirNaoAberto,
      );
      await waitFor(() =>
        expect(montado.result.current.acoes.conflito).toBe('relido'),
      );
      // Quando o sinal chega, as ações já seguem o dado relido.
      expect(montado.result.current.acoes.folha?.excluir).toEqual(
        nao(t.motivoExcluirNaoAberto),
      );
      expect(montado.result.current.acoes.folha?.visivel).toBe(true);
    });

    it('a releitura falha (500): falhou, com o texto do 409 e a folha aberta', async () => {
      const { provedores } = montarHook();
      provedores.fetch
        .responder('GET /trampos/meus', { corpo: [] })
        .responder('GET /trampos/t1', [
          { corpo: trampoDaApi('aberto') },
          { status: 500, corpo: { erro: 'erro_interno' } },
        ])
        .responder('DELETE /trampos/t1', CONFLITO_409);
      const aoExcluir = jest.fn();
      const montado = await montarComDetalhe(provedores, jest.fn(), {
        aoExcluir,
      });
      await act(async () => montado.result.current.acoes.abrir(TRAMPO));

      await excluirComConflito(montado);

      await waitFor(() =>
        expect(montado.result.current.acoes.conflito).toBe('falhou'),
      );
      const folha = montado.result.current.acoes.folha;
      expect(folha?.erro).toBe(t.motivoExcluirNaoAberto);
      expect(folha?.visivel).toBe(true);
      expect(montado.result.current.acoes.toast).toBeNull();
      expect(aoExcluir).not.toHaveBeenCalled();
    });

    it('a releitura dá 404: o anúncio sumiu, a folha fecha com "já não existe" e a rota é avisada', async () => {
      const { provedores } = montarHook();
      provedores.fetch
        .responder('GET /trampos/meus', { corpo: [] })
        .responder('GET /trampos/t1', [
          { corpo: trampoDaApi('aberto') },
          ERRO_404,
        ])
        .responder('DELETE /trampos/t1', CONFLITO_409);
      const aoExcluir = jest.fn();
      const montado = await montarComDetalhe(provedores, jest.fn(), {
        aoExcluir,
      });
      await act(async () => montado.result.current.acoes.abrir(TRAMPO));

      await excluirComConflito(montado);

      await waitFor(() =>
        expect(montado.result.current.acoes.toast).toBe(t.jaNaoExiste),
      );
      expect(montado.result.current.acoes.folha?.visivel).toBe(false);
      expect(montado.result.current.acoes.folha?.erro).toBeUndefined();
      expect(montado.result.current.acoes.conflito).toBeNull();
      expect(aoExcluir).toHaveBeenCalledTimes(1);
      expect(aoExcluir).toHaveBeenCalledWith(TRAMPO, 'ja_removido');
      expect(contar(provedores, 'DELETE', '/trampos/t1')).toBe(1);
    });

    it('o desfecho é o da consultaDoAtual: a lista falha e o detalhe volta, então falhou', async () => {
      const { provedores } = montarHook();
      provedores.fetch
        .responder('GET /trampos/meus', [
          { corpo: [] },
          { status: 500, corpo: { erro: 'erro_interno' } },
        ])
        .responder('GET /trampos/t1', [
          { corpo: trampoDaApi('aberto') },
          { corpo: trampoDaApi('em_andamento') },
        ])
        .responder('DELETE /trampos/t1', CONFLITO_409);
      const montado = await montarComDetalhe(provedores, jest.fn(), {
        consultaDoAtual: chaves.meusTrampos(),
      });
      await waitFor(() =>
        expect(montado.result.current.meus.trampos).not.toBeNull(),
      );
      await act(async () => montado.result.current.acoes.abrir(TRAMPO));

      await excluirComConflito(montado);

      await waitFor(() =>
        expect(montado.result.current.acoes.conflito).toBe('falhou'),
      );
      expect(contar(provedores, 'GET', '/trampos/t1')).toBe(2);
    });

    it('sem resposta nova da consultaDoAtual (fora do cache), falhou: não dá para dizer que atualizou', async () => {
      const { provedores } = montarHook();
      provedores.fetch
        .responder('GET /trampos/meus', { corpo: [] })
        .responder('GET /trampos/t1', [
          { corpo: trampoDaApi('aberto') },
          { corpo: trampoDaApi('em_andamento') },
        ])
        .responder('DELETE /trampos/t1', CONFLITO_409);
      const montado = await montarComDetalhe(provedores, jest.fn(), {
        consultaDoAtual: ['consulta-sem-tela'],
      });
      await act(async () => montado.result.current.acoes.abrir(TRAMPO));

      await excluirComConflito(montado);

      await waitFor(() =>
        expect(montado.result.current.acoes.conflito).toBe('falhou'),
      );
      expect(contar(provedores, 'GET', '/trampos/t1')).toBe(2);
    });

    it('abrir de novo enquanto relê descarta o desfecho antigo', async () => {
      const { provedores } = montarHook();
      provedores.fetch
        .responder('GET /trampos/meus', { corpo: [] })
        .responder('GET /trampos/t1', [
          { corpo: trampoDaApi('aberto') },
          { ...ERRO_404, demoraMs: 50 },
        ])
        .responder('DELETE /trampos/t1', CONFLITO_409);
      const aoExcluir = jest.fn();
      const montado = await montarComDetalhe(provedores, jest.fn(), {
        aoExcluir,
      });
      await act(async () => montado.result.current.acoes.abrir(TRAMPO));
      await excluirComConflito(montado);
      await waitFor(() =>
        expect(montado.result.current.acoes.conflito).toBe('relendo'),
      );

      await act(async () => montado.result.current.acoes.abrir(TRAMPO));
      expect(montado.result.current.acoes.conflito).toBeNull();
      await waitFor(() =>
        expect(contar(provedores, 'GET', '/trampos/t1')).toBe(2),
      );
      await act(async () => {
        await new Promise((resolver) => setTimeout(resolver, 100));
      });

      expect(montado.result.current.acoes.conflito).toBeNull();
      expect(montado.result.current.acoes.toast).toBeNull();
      expect(montado.result.current.acoes.folha?.visivel).toBe(true);
      expect(aoExcluir).not.toHaveBeenCalled();
    });

    it('outro erro (500 no DELETE) não é conflito, mesmo com a folha aberta', async () => {
      const { provedores } = montarHook();
      provedores.fetch
        .responder('GET /trampos/meus', { corpo: [] })
        .responder('GET /trampos/t1', { corpo: trampoDaApi('aberto') })
        .responder('DELETE /trampos/t1', { status: 500 });
      const montado = await montarComDetalhe(provedores);
      await act(async () => montado.result.current.acoes.abrir(TRAMPO));

      await excluirComConflito(montado);

      await waitFor(() =>
        expect(montado.result.current.acoes.folha?.erro).toBe(t.erroAoExcluir),
      );
      expect(montado.result.current.acoes.conflito).toBeNull();
      expect(contar(provedores, 'GET', '/trampos/t1')).toBe(1);
    });
  });
});

describe('useAcoesDoAnuncio: sessão trocada no meio', () => {
  it('a geração nova não invalida, não tira do cache, não avisa a rota nem mostra toast', async () => {
    const { montar, provedores, aoExcluir } = montarHook();
    provedores.fetch
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('DELETE /trampos/t1', { status: 204, demoraMs: 40 })
      .responder('DELETE /sessoes', { status: 204 });
    const montado = await montar();
    await abrir(montado, TRAMPO);
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');
    const remover = jest.spyOn(provedores.queryClient, 'removeQueries');

    await act(async () => folhaDe(montado).onExcluir());
    await waitFor(() => expect(folhaDe(montado).processando).toBe('excluir'));
    await act(() => montado.result.current.sessao.sair());
    await act(() => montado.result.current.sessao.entrar(TOKEN_NOVO));
    await waitFor(() => expect(folhaDe(montado).processando).toBeNull());
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 60));
    });

    expect(contar(provedores, 'DELETE', '/trampos/t1')).toBe(1);
    expect(invalidar).not.toHaveBeenCalled();
    expect(remover).not.toHaveBeenCalled();
    expect(aoExcluir).not.toHaveBeenCalled();
    expect(montado.result.current.acoes.toast).toBeNull();
    expect(folhaDe(montado).visivel).toBe(false);
  });

  it('o 404 de uma sessão que mudou também não mexe no cache da conta nova', async () => {
    const { montar, provedores, aoExcluir } = montarHook();
    provedores.fetch
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('POST /trampos/t1/encerrar', { ...ERRO_404, demoraMs: 40 })
      .responder('DELETE /sessoes', { status: 204 });
    const montado = await montar();
    await abrir(montado, TRAMPO);
    const remover = jest.spyOn(provedores.queryClient, 'removeQueries');
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    await act(async () => folhaDe(montado).onEncerrar());
    await waitFor(() => expect(folhaDe(montado).processando).toBe('encerrar'));
    await act(() => montado.result.current.sessao.sair());
    await act(() => montado.result.current.sessao.entrar(TOKEN_NOVO));
    await waitFor(() => expect(folhaDe(montado).processando).toBeNull());
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 60));
    });

    expect(remover).not.toHaveBeenCalled();
    expect(invalidar).not.toHaveBeenCalled();
    expect(aoExcluir).not.toHaveBeenCalled();
    expect(montado.result.current.acoes.toast).toBeNull();
  });
});
