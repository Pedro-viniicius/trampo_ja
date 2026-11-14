import { notifyManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { MAXIMO_DE_IDS_POR_PEDIDO } from '../../api/avaliacoes';
import { ErroDaApi, ErroDeRede } from '../../api/erros';
import type {
  AvaliacaoFeita,
  AvaliacaoRecebida,
  Favorito,
  ResumoDeAvaliacoes,
  ResumoDoPapel,
} from '../../api/tipos';
import type { RequisicaoFeita } from '../../testes/fetch-falso';
import {
  criarProvedores as criarProvedoresBase,
  criarQueryClientDeTeste,
  type OpcoesDosProvedores,
} from '../../testes/renderizar';
import { criarArmazenamentoEmMemoria } from '../armazenamento-token';
import { useSessao } from '../sessao';
import {
  ehAvaliacaoJaFeita,
  LIMITE_DE_AVALIACOES,
  useAvaliacoesFeitas,
  useAvaliacoesRecebidas,
  useAvaliar,
  useDefinirFavorito,
  useFavoritos,
  useResumosDeAvaliacoes,
} from './avaliacoes';
import { chaves } from './chaves';

const TOKEN = 'token-da-sessao-123';
const TOKEN_NOVO = 'token-novo-456';
const BEARER = `Bearer ${TOKEN}`;
// Sentinela no lugar do comentário (dado pessoal, CA15).
const COMENTARIO = 'SENTINELA-COMENTARIO-DA-ANA';

const SEM_NOTA: ResumoDoPapel = { media: null, total: 0, destaques: [] };

function resumo(
  contaId: string,
  media: number | null = 4.5,
): ResumoDeAvaliacoes {
  return {
    contaId,
    comoFreela:
      media === null
        ? SEM_NOTA
        : { media, total: 2, destaques: ['pontual', 'educado'] },
    comoContratante: SEM_NOTA,
  };
}

function feita(trampoId: string, nota = 4): AvaliacaoFeita {
  return { trampoId, nota, criadaEm: '2026-11-02T10:00:00.000Z' };
}

function recebida(n: number): AvaliacaoRecebida {
  return {
    nota: 5,
    destaques: ['pontual'],
    comentario: `SENTINELA-COMENTARIO-${n}`,
    avaliadorId: `autor-${n}`,
    criadaEm: '2026-11-01T10:00:00.000Z',
  };
}

function favorito(contaId: string, dia: number): Favorito {
  return {
    contaId,
    criadoEm: `2026-11-${String(dia).padStart(2, '0')}T10:00:00.000Z`,
  };
}

function ids(prefixo: string, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => `${prefixo}${i + 1}`);
}

const montados: Provedores[] = [];

// O TanStack avisa os componentes num `setTimeout(0)`, que cai fora do `act`
// quando a mutação acaba no fim dele. Numa microtarefa, o aviso sai junto da
// resposta, ainda dentro do `act`.
beforeAll(() => {
  notifyManager.setScheduler((avisar) => {
    void Promise.resolve().then(avisar);
  });
});

afterAll(() => {
  notifyManager.setScheduler((avisar) => setTimeout(avisar, 0));
});

function criarProvedores(opcoes: OpcoesDosProvedores = {}) {
  const provedores = criarProvedoresBase({
    queryClient: criarQueryClientDeTeste(),
    armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    ...opcoes,
  });
  montados.push(provedores);
  return provedores;
}

type Provedores = ReturnType<typeof criarProvedoresBase>;

// O TanStack avisa os componentes num `setTimeout(0)`: sem esperar por ele,
// a última notificação de um teste cai fora do `act`.
afterEach(async () => {
  // Nenhuma busca nem mutação sobra no ar: a última notificação do TanStack
  // cairia fora do `act`.
  for (const { queryClient } of montados.splice(0)) {
    await waitFor(() =>
      expect(queryClient.isFetching() + queryClient.isMutating()).toBe(0),
    );
  }
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
});

/** Monta o hook (com a sessão ao lado) e espera a sessão carregar. */
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
): RequisicaoFeita[] {
  return provedores.fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

function lerFavoritos(provedores: Provedores) {
  return provedores.queryClient.getQueryData<readonly Favorito[]>(
    chaves.favoritos(),
  );
}

describe('chaves das avaliações e dos favoritos', () => {
  it('cada consulta tem a sua chave e o prefixo de todas', () => {
    expect(chaves.avaliacoesRecebidas('c1', 'freela')).toEqual([
      'avaliacoesRecebidas',
      'c1',
      'freela',
    ]);
    expect(chaves.todasAsAvaliacoesRecebidas()).toEqual([
      'avaliacoesRecebidas',
    ]);
    expect(chaves.resumosDeAvaliacoes(['c1', 'c2'])).toEqual([
      'resumosDeAvaliacoes',
      ['c1', 'c2'],
    ]);
    expect(chaves.todosOsResumosDeAvaliacoes()).toEqual([
      'resumosDeAvaliacoes',
    ]);
    expect(chaves.avaliacoesFeitas(['t1'])).toEqual([
      'avaliacoesFeitas',
      ['t1'],
    ]);
    expect(chaves.todasAsAvaliacoesFeitas()).toEqual(['avaliacoesFeitas']);
    expect(chaves.favoritos()).toEqual(['favoritos']);
  });
});

describe('useResumosDeAvaliacoes (CA89, CA97)', () => {
  it('faz um único GET para a lista inteira, sem repetidos nem vazios, com o Bearer', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /avaliacoes/resumos', {
      corpo: [resumo('c1'), resumo('c2', null)],
    });

    const { result } = await montar(
      () => useResumosDeAvaliacoes(['c1', 'c2', 'c1', '']),
      provedores,
    );

    await waitFor(() => expect(result.current.dados.resumos.size).toBe(2));
    expect(result.current.dados.resumos.get('c1')).toEqual(resumo('c1'));
    expect(result.current.dados.resumos.get('c2')?.comoFreela.media).toBeNull();
    const feitas = requisicoesPara(provedores, 'GET', '/avaliacoes/resumos');
    expect(feitas).toHaveLength(1);
    expect(feitas[0]?.query).toEqual({ contas: 'c1,c2' });
    expect(feitas[0]?.cabecalhos.authorization).toBe(BEARER);
    expect(provedores.fetch.requisicoes).toHaveLength(1);
  });

  it(`uma lista de ${MAXIMO_DE_IDS_POR_PEDIDO} contas ainda cabe num pedido`, async () => {
    const provedores = criarProvedores();
    const contas = ids('c', MAXIMO_DE_IDS_POR_PEDIDO);
    provedores.fetch.responder('GET /avaliacoes/resumos', {
      corpo: contas.map((c) => resumo(c)),
    });

    const { result } = await montar(
      () => useResumosDeAvaliacoes(contas),
      provedores,
    );

    await waitFor(() =>
      expect(result.current.dados.resumos.size).toBe(MAXIMO_DE_IDS_POR_PEDIDO),
    );
    expect(provedores.fetch.requisicoes).toHaveLength(1);
  });

  it('com mais de 50 contas divide em pedidos de até 50, sem nunca pedir uma por item', async () => {
    const provedores = criarProvedores();
    const contas = ids('c', 120);
    provedores.fetch.responder('GET /avaliacoes/resumos', (requisicao) => ({
      corpo: (requisicao.query.contas ?? '').split(',').map((c) => resumo(c)),
    }));

    const { result } = await montar(
      () => useResumosDeAvaliacoes(contas),
      provedores,
    );

    await waitFor(() => expect(result.current.dados.resumos.size).toBe(120));
    const pedidos = requisicoesPara(provedores, 'GET', '/avaliacoes/resumos');
    expect(
      pedidos.map((p) => (p.query.contas ?? '').split(',').length),
    ).toEqual([50, 50, 20]);
  });

  it('quando a lista cresce, o mapa anterior fica na tela e a resposta nova o completa', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /avaliacoes/resumos', (requisicao) => ({
      corpo: (requisicao.query.contas ?? '').split(',').map((c) => resumo(c)),
      demoraMs: requisicao.query.contas === 'c1' ? 0 : 30,
    }));
    const resultado = await renderHook(
      ({ contas }: { contas: readonly string[] }) => ({
        sessao: useSessao(),
        dados: useResumosDeAvaliacoes(contas),
      }),
      { wrapper: provedores.wrapper, initialProps: { contas: ['c1'] } },
    );
    await waitFor(() =>
      expect(resultado.result.current.dados.resumos.size).toBe(1),
    );

    await resultado.rerender({ contas: ['c1', 'c2'] });

    // Enquanto a resposta nova não chega, c1 continua com a nota.
    expect(resultado.result.current.dados.resumos.get('c1')).toEqual(
      resumo('c1'),
    );
    expect(resultado.result.current.dados.resumos.has('c2')).toBe(false);
    await waitFor(() =>
      expect(resultado.result.current.dados.resumos.size).toBe(2),
    );
    expect(
      requisicoesPara(provedores, 'GET', '/avaliacoes/resumos').map(
        (p) => p.query.contas,
      ),
    ).toEqual(['c1', 'c1,c2']);
  });

  it('devolve o mesmo mapa enquanto nada muda', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /avaliacoes/resumos', {
      corpo: [resumo('c1')],
    });
    const resultado = await renderHook(
      ({ contas }: { contas: readonly string[] }) =>
        useResumosDeAvaliacoes(contas),
      { wrapper: provedores.wrapper, initialProps: { contas: ['c1'] } },
    );
    await waitFor(() => expect(resultado.result.current.resumos.size).toBe(1));
    const primeiro = resultado.result.current.resumos;

    await resultado.rerender({ contas: ['c1'] });

    expect(resultado.result.current.resumos).toBe(primeiro);
    expect(provedores.fetch.requisicoes).toHaveLength(1);
  });

  it('sem ids, ou sem sessão, não faz requisição', async () => {
    const vazia = criarProvedores();
    await montar(() => useResumosDeAvaliacoes([]), vazia);
    const anonima = criarProvedores({
      armazenamento: criarArmazenamentoEmMemoria(),
    });
    const { result } = await montar(
      () => useResumosDeAvaliacoes(['c1']),
      anonima,
    );

    expect(result.current.dados.resumos.size).toBe(0);
    expect(vazia.fetch.requisicoes).toHaveLength(0);
    expect(anonima.fetch.requisicoes).toHaveLength(0);
  });

  it('com erro, a lista fica sem nota e o erro sobe cru', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /avaliacoes/resumos', {
      status: 500,
      corpo: { erro: 'erro_interno' },
    });

    const { result } = await montar(
      () => useResumosDeAvaliacoes(['c1']),
      provedores,
    );

    await waitFor(() =>
      expect(result.current.dados.erro).toBeInstanceOf(ErroDaApi),
    );
    expect(result.current.dados.resumos.size).toBe(0);
  });
});

describe('useAvaliacoesFeitas (CA91, CA96)', () => {
  it('faz um GET com os trampos da lista e só some "completa" depois da resposta', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /avaliacoes/feitas', {
      corpo: [feita('t1', 5)],
      demoraMs: 20,
    });

    const { result } = await montar(
      () => useAvaliacoesFeitas(['t1', 't2', 't1']),
      provedores,
    );

    expect(result.current.dados.completa).toBe(false);
    await waitFor(() => expect(result.current.dados.completa).toBe(true));
    expect(result.current.dados.feitas.get('t1')).toEqual(feita('t1', 5));
    expect(result.current.dados.feitas.has('t2')).toBe(false);
    const pedidos = requisicoesPara(provedores, 'GET', '/avaliacoes/feitas');
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.query).toEqual({ trampos: 't1,t2' });
    expect(pedidos[0]?.cabecalhos.authorization).toBe(BEARER);
  });

  it('sem trampos já é completa e não faz requisição', async () => {
    const provedores = criarProvedores();

    const { result } = await montar(() => useAvaliacoesFeitas([]), provedores);

    expect(result.current.dados.completa).toBe(true);
    expect(result.current.dados.feitas.size).toBe(0);
    expect(provedores.fetch.requisicoes).toHaveLength(0);
  });

  it('quando a lista cresce, mantém as feitas conhecidas e deixa de ser completa até a resposta nova', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /avaliacoes/feitas', (requisicao) => ({
      corpo: [feita('t1', 3)],
      demoraMs: requisicao.query.trampos === 't1' ? 0 : 30,
    }));
    const resultado = await renderHook(
      ({ trampos }: { trampos: readonly string[] }) =>
        useAvaliacoesFeitas(trampos),
      { wrapper: provedores.wrapper, initialProps: { trampos: ['t1'] } },
    );
    await waitFor(() => expect(resultado.result.current.completa).toBe(true));

    await resultado.rerender({ trampos: ['t1', 't2'] });

    expect(resultado.result.current.completa).toBe(false);
    expect(resultado.result.current.feitas.get('t1')).toEqual(feita('t1', 3));
    await waitFor(() => expect(resultado.result.current.completa).toBe(true));
  });

  it('com mais de 50 trampos divide em pedidos de até 50', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /avaliacoes/feitas', { corpo: [] });

    const { result } = await montar(
      () => useAvaliacoesFeitas(ids('t', 75)),
      provedores,
    );

    await waitFor(() => expect(result.current.dados.completa).toBe(true));
    expect(
      requisicoesPara(provedores, 'GET', '/avaliacoes/feitas').map(
        (p) => (p.query.trampos ?? '').split(',').length,
      ),
    ).toEqual([50, 25]);
  });
});

describe('useAvaliacoesRecebidas (CA90)', () => {
  it('pagina por cursor, 20 por vez, com conta e papel, até o cursor acabar', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /avaliacoes', [
      { corpo: { itens: [recebida(1), recebida(2)], proximoCursor: 'cur-2' } },
      { corpo: { itens: [recebida(3)], proximoCursor: null } },
    ]);

    const { result } = await montar(
      () => useAvaliacoesRecebidas('c1', 'contratante'),
      provedores,
    );

    await waitFor(() =>
      expect(result.current.dados.avaliacoes).toHaveLength(2),
    );
    expect(result.current.dados.temMais).toBe(true);
    await act(async () => {
      await result.current.dados.carregarMais();
    });
    await waitFor(() =>
      expect(result.current.dados.avaliacoes).toHaveLength(3),
    );
    expect(result.current.dados.temMais).toBe(false);
    expect(result.current.dados.avaliacoes.map((a) => a.avaliadorId)).toEqual([
      'autor-1',
      'autor-2',
      'autor-3',
    ]);
    const pedidos = requisicoesPara(provedores, 'GET', '/avaliacoes');
    expect(pedidos.map((p) => p.query)).toEqual([
      {
        contaId: 'c1',
        papel: 'contratante',
        limite: String(LIMITE_DE_AVALIACOES),
      },
      {
        contaId: 'c1',
        papel: 'contratante',
        antesDe: 'cur-2',
        limite: String(LIMITE_DE_AVALIACOES),
      },
    ]);
    expect(pedidos[0]?.cabecalhos.authorization).toBe(BEARER);
    // Sem mais páginas, carregarMais não pede nada.
    await act(async () => {
      await result.current.dados.carregarMais();
    });
    expect(pedidos).toHaveLength(2);
  });

  it('conta sem avaliação dá lista vazia', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /avaliacoes', {
      corpo: { itens: [], proximoCursor: null },
    });

    const { result } = await montar(
      () => useAvaliacoesRecebidas('c1', 'freela'),
      provedores,
    );

    await waitFor(() => expect(result.current.dados.carregando).toBe(false));
    expect(result.current.dados.avaliacoes).toEqual([]);
    expect(result.current.dados.temMais).toBe(false);
  });

  it('o erro da página seguinte não apaga as já carregadas', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /avaliacoes', [
      { corpo: { itens: [recebida(1)], proximoCursor: 'cur-1' } },
      { status: 500, corpo: { erro: 'erro_interno' } },
    ]);
    const { result } = await montar(
      () => useAvaliacoesRecebidas('c1', 'freela'),
      provedores,
    );
    await waitFor(() =>
      expect(result.current.dados.avaliacoes).toHaveLength(1),
    );

    await act(async () => {
      await result.current.dados.carregarMais();
    });

    await waitFor(() =>
      expect(result.current.dados.erroAoCarregarMais).toBeInstanceOf(ErroDaApi),
    );
    expect(result.current.dados.avaliacoes).toHaveLength(1);
  });

  it('desabilitada ou sem conta não faz requisição', async () => {
    const provedores = criarProvedores();
    await montar(
      () => useAvaliacoesRecebidas('c1', 'freela', { habilitada: false }),
      provedores,
    );
    await montar(() => useAvaliacoesRecebidas('', 'freela'), provedores);

    expect(provedores.fetch.requisicoes).toHaveLength(0);
  });
});

describe('useAvaliar (CA87, CA88, CA96)', () => {
  function montarAvaliar(provedores: Provedores) {
    return montar(
      () => ({
        avaliar: useAvaliar(),
        feitas: useAvaliacoesFeitas(['t1']),
        resumos: useResumosDeAvaliacoes(['c1']),
      }),
      provedores,
    );
  }

  it('manda o pedido com nota, destaques e comentário aparado, e devolve o id', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('POST /avaliacoes', { status: 201, corpo: { id: 'av-1' } })
      .responder('GET /avaliacoes/feitas', { corpo: [] })
      .responder('GET /avaliacoes/resumos', { corpo: [resumo('c1')] });
    const { result } = await montarAvaliar(provedores);
    await waitFor(() =>
      expect(result.current.dados.feitas.completa).toBe(true),
    );
    await waitFor(() =>
      expect(result.current.dados.resumos.resumos.size).toBe(1),
    );

    let resultado: unknown;
    await act(async () => {
      resultado = await result.current.dados.avaliar.avaliar({
        trampoId: 't1',
        nota: 5,
        destaques: ['pontual', 'educado'],
        comentario: `  ${COMENTARIO}  `,
      });
    });

    expect(resultado).toEqual({ tipo: 'enviada', id: 'av-1' });
    const posts = requisicoesPara(provedores, 'POST', '/avaliacoes');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.corpo).toEqual({
      trampoId: 't1',
      nota: 5,
      destaques: ['pontual', 'educado'],
      comentario: COMENTARIO,
    });
    expect(posts[0]?.cabecalhos.authorization).toBe(BEARER);
  });

  it('comentário em branco e destaques vazios não vão no corpo', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('POST /avaliacoes', {
      status: 201,
      corpo: { id: 'av-1' },
    });
    const { result } = await montar(() => useAvaliar(), provedores);

    await act(async () => {
      await result.current.dados.avaliar({
        trampoId: 't1',
        nota: 3,
        destaques: [],
        comentario: '   ',
      });
    });

    expect(
      requisicoesPara(provedores, 'POST', '/avaliacoes')[0]?.corpo,
    ).toEqual({
      trampoId: 't1',
      nota: 3,
    });
  });

  it('o duplo toque manda um só pedido e as duas chamadas recebem o mesmo resultado', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('POST /avaliacoes', {
      status: 201,
      corpo: { id: 'av-1' },
      demoraMs: 30,
    });
    const { result } = await montar(() => useAvaliar(), provedores);

    let resultados: unknown[] = [];
    await act(async () => {
      const primeira = result.current.dados.avaliar({
        trampoId: 't1',
        nota: 4,
      });
      const segunda = result.current.dados.avaliar({ trampoId: 't1', nota: 4 });
      resultados = await Promise.all([primeira, segunda]);
    });

    expect(resultados).toEqual([
      { tipo: 'enviada', id: 'av-1' },
      { tipo: 'enviada', id: 'av-1' },
    ]);
    expect(requisicoesPara(provedores, 'POST', '/avaliacoes')).toHaveLength(1);
    // Terminado o pedido, uma nova avaliação volta a ser aceita.
    await act(async () => {
      await result.current.dados.avaliar({ trampoId: 't2', nota: 4 });
    });
    expect(requisicoesPara(provedores, 'POST', '/avaliacoes')).toHaveLength(2);
    await waitFor(() => expect(result.current.dados.avaliando).toBe(false));
  });

  it('no sucesso recarrega as feitas antes de resolver e as notas em seguida', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('POST /avaliacoes', { status: 201, corpo: { id: 'av-1' } })
      .responder('GET /avaliacoes/feitas', [
        { corpo: [] },
        { corpo: [feita('t1', 5)] },
      ])
      .responder('GET /avaliacoes/resumos', [
        { corpo: [resumo('c1', null)] },
        { corpo: [resumo('c1', 5)] },
      ]);
    const { result } = await montarAvaliar(provedores);
    await waitFor(() =>
      expect(result.current.dados.feitas.completa).toBe(true),
    );
    await waitFor(() =>
      expect(result.current.dados.resumos.resumos.size).toBe(1),
    );

    await act(async () => {
      await result.current.dados.avaliar.avaliar({ trampoId: 't1', nota: 5 });
    });

    // "Avaliado com 5 ★": a feita já está no cache quando a chamada resolve.
    expect(
      provedores.queryClient.getQueryData(chaves.avaliacoesFeitas(['t1'])),
    ).toEqual([feita('t1', 5)]);
    await waitFor(() =>
      expect(
        result.current.dados.resumos.resumos.get('c1')?.comoFreela.media,
      ).toBe(5),
    );
    expect(result.current.dados.feitas.feitas.get('t1')?.nota).toBe(5);
    expect(
      requisicoesPara(provedores, 'GET', '/avaliacoes/feitas'),
    ).toHaveLength(2);
    expect(
      requisicoesPara(provedores, 'GET', '/avaliacoes/resumos'),
    ).toHaveLength(2);
  });

  it('o 409 avaliacao_ja_feita volta como erro e recarrega as feitas', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('POST /avaliacoes', {
        status: 409,
        corpo: { erro: 'avaliacao_ja_feita' },
      })
      .responder('GET /avaliacoes/feitas', [
        { corpo: [] },
        { corpo: [feita('t1', 4)] },
      ])
      .responder('GET /avaliacoes/resumos', { corpo: [] });
    const { result } = await montarAvaliar(provedores);
    await waitFor(() =>
      expect(result.current.dados.feitas.completa).toBe(true),
    );

    let resultado: { tipo: string; erro?: unknown } | undefined;
    await act(async () => {
      resultado = await result.current.dados.avaliar.avaliar({
        trampoId: 't1',
        nota: 4,
      });
    });

    expect(resultado?.tipo).toBe('erro');
    expect(ehAvaliacaoJaFeita(resultado?.erro)).toBe(true);
    await waitFor(() =>
      expect(result.current.dados.feitas.feitas.get('t1')?.nota).toBe(4),
    );
  });

  it.each([
    [400, 'dados_invalidos'],
    [404, 'nao_encontrado'],
    [409, 'trampo_nao_encerrado'],
  ])(
    '%i %s volta como erro cru, sem recarregar nada e sem o comentário',
    async (status, codigo) => {
      const provedores = criarProvedores();
      provedores.fetch.responder('POST /avaliacoes', {
        status,
        corpo: { erro: codigo, comentario: COMENTARIO },
      });
      const { result } = await montar(() => useAvaliar(), provedores);

      let resultado: { tipo: string; erro?: Error } | undefined;
      await act(async () => {
        resultado = await result.current.dados.avaliar({
          trampoId: 't1',
          nota: 4,
          comentario: COMENTARIO,
        });
      });

      expect(resultado?.tipo).toBe('erro');
      expect(resultado?.erro).toMatchObject({ status, codigo });
      expect(ehAvaliacaoJaFeita(resultado?.erro)).toBe(false);
      expect(JSON.stringify(resultado?.erro)).not.toContain(COMENTARIO);
      expect(resultado?.erro?.message).not.toContain(COMENTARIO);
      expect(provedores.fetch.requisicoes).toHaveLength(1);
      await waitFor(() => expect(result.current.dados.avaliando).toBe(false));
    },
  );

  it('sem conexão falha na hora com ErroDeRede e uma nova tentativa é aceita', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('POST /avaliacoes', [
      { falhaDeRede: true },
      { status: 201, corpo: { id: 'av-2' } },
    ]);
    const { result } = await montar(() => useAvaliar(), provedores);

    let primeiro: { tipo: string; erro?: Error } | undefined;
    await act(async () => {
      primeiro = await result.current.dados.avaliar({
        trampoId: 't1',
        nota: 4,
      });
    });
    let segundo: unknown;
    await act(async () => {
      segundo = await result.current.dados.avaliar({ trampoId: 't1', nota: 4 });
    });

    expect(primeiro?.erro).toBeInstanceOf(ErroDeRede);
    expect(segundo).toEqual({ tipo: 'enviada', id: 'av-2' });
    await waitFor(() => expect(result.current.dados.avaliando).toBe(false));
  });

  it('se a sessão mudou durante o pedido, devolve descartada e não recarrega nada', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('POST /avaliacoes', {
        status: 201,
        corpo: { id: 'av-1' },
        demoraMs: 30,
      })
      .responder('DELETE /sessoes', { status: 204 });
    const { result } = await montar(() => useAvaliar(), provedores);
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    let enviada: Promise<unknown> = Promise.resolve();
    await act(async () => {
      enviada = result.current.dados.avaliar({ trampoId: 't1', nota: 4 });
      await Promise.resolve();
    });
    await act(() => result.current.sessao.sair());
    await act(() => result.current.sessao.entrar(TOKEN_NOVO));
    let resultado: unknown;
    await act(async () => {
      resultado = await enviada;
    });

    expect(resultado).toEqual({ tipo: 'descartada' });
    expect(invalidar).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.dados.avaliando).toBe(false));
  });
});

describe('ehAvaliacaoJaFeita', () => {
  it('só o 409 avaliacao_ja_feita', () => {
    expect(ehAvaliacaoJaFeita(new ErroDaApi(409, 'avaliacao_ja_feita'))).toBe(
      true,
    );
    expect(ehAvaliacaoJaFeita(new ErroDaApi(409, 'trampo_nao_encerrado'))).toBe(
      false,
    );
    expect(ehAvaliacaoJaFeita(new ErroDaApi(404, 'nao_encontrado'))).toBe(
      false,
    );
    expect(ehAvaliacaoJaFeita(new Error('x'))).toBe(false);
    expect(ehAvaliacaoJaFeita(undefined)).toBe(false);
  });
});

describe('useFavoritos (CA92)', () => {
  it('faz GET /favoritos com o Bearer e responde ehFavorito', async () => {
    const provedores = criarProvedores();
    const lista = [favorito('c2', 5), favorito('c1', 3)];
    provedores.fetch.responder('GET /favoritos', { corpo: lista });

    const { result } = await montar(() => useFavoritos(), provedores);

    await waitFor(() => expect(result.current.dados.favoritos).toEqual(lista));
    expect(result.current.dados.ehFavorito('c1')).toBe(true);
    expect(result.current.dados.ehFavorito('c9')).toBe(false);
    expect(provedores.fetch.ultima().cabecalhos.authorization).toBe(BEARER);
  });

  it('sem sessão não faz requisição', async () => {
    const provedores = criarProvedores({
      armazenamento: criarArmazenamentoEmMemoria(),
    });

    await montar(() => useFavoritos(), provedores);

    expect(provedores.fetch.requisicoes).toHaveLength(0);
  });
});

describe('useDefinirFavorito (CA92, CA98)', () => {
  function montarFavoritos(provedores: Provedores) {
    return montar(
      () => ({ lista: useFavoritos(), favoritar: useDefinirFavorito() }),
      provedores,
    );
  }

  it('favoritar aparece na hora, antes da resposta, e depois recarrega a lista da API', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('GET /favoritos', [
        { corpo: [favorito('c1', 3)] },
        { corpo: [favorito('c2', 8), favorito('c1', 3)] },
      ])
      .responder('PUT /favoritos/c2', { status: 204, demoraMs: 300 });
    const { result } = await montarFavoritos(provedores);
    await waitFor(() =>
      expect(result.current.dados.lista.favoritos).toHaveLength(1),
    );

    let pedido: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pedido = result.current.dados.favoritar.definir('c2', true);
      await Promise.resolve();
    });

    // O PUT ainda está no ar e a conta já está na equipe.
    expect(requisicoesPara(provedores, 'PUT', '/favoritos/c2')).toHaveLength(1);
    await waitFor(() =>
      expect(result.current.dados.lista.ehFavorito('c2')).toBe(true),
    );
    expect(result.current.dados.favoritar.definindo).toBe(true);
    let resultado: unknown;
    await act(async () => {
      resultado = await pedido;
    });

    expect(resultado).toEqual({ tipo: 'feito' });
    await waitFor(() =>
      expect(requisicoesPara(provedores, 'GET', '/favoritos')).toHaveLength(2),
    );
    await waitFor(() =>
      expect(result.current.dados.lista.favoritos).toEqual([
        favorito('c2', 8),
        favorito('c1', 3),
      ]),
    );
    expect(
      requisicoesPara(provedores, 'PUT', '/favoritos/c2')[0]?.corpo,
    ).toBeUndefined();
  });

  it('desfavoritar some na hora e manda DELETE', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('GET /favoritos', [
        { corpo: [favorito('c2', 8), favorito('c1', 3)] },
        { corpo: [favorito('c1', 3)] },
      ])
      .responder('DELETE /favoritos/c2', { status: 204, demoraMs: 300 });
    const { result } = await montarFavoritos(provedores);
    await waitFor(() =>
      expect(result.current.dados.lista.favoritos).toHaveLength(2),
    );

    let pedido: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pedido = result.current.dados.favoritar.definir('c2', false);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(result.current.dados.lista.ehFavorito('c2')).toBe(false),
    );
    expect(lerFavoritos(provedores)).toEqual([favorito('c1', 3)]);
    await act(async () => {
      expect(await pedido).toEqual({ tipo: 'feito' });
    });
    expect(requisicoesPara(provedores, 'DELETE', '/favoritos/c2')).toHaveLength(
      1,
    );
    await waitFor(() =>
      expect(requisicoesPara(provedores, 'GET', '/favoritos')).toHaveLength(2),
    );
    await waitFor(() =>
      expect(result.current.dados.favoritar.definindo).toBe(false),
    );
  });

  it.each([
    [404, 'nao_encontrado'],
    [409, 'favorito_invalido'],
    [409, 'limite_de_favoritos'],
  ])(
    'se a API recusar (%i %s), a conta volta ao que era',
    async (status, codigo) => {
      const provedores = criarProvedores();
      const lista = [favorito('c1', 3)];
      provedores.fetch
        .responder('GET /favoritos', { corpo: lista })
        .responder('PUT /favoritos/c2', {
          status,
          corpo: { erro: codigo },
          demoraMs: 300,
        });
      const { result } = await montarFavoritos(provedores);
      await waitFor(() =>
        expect(result.current.dados.lista.favoritos).toEqual(lista),
      );

      let pedido: Promise<unknown> = Promise.resolve();
      await act(async () => {
        pedido = result.current.dados.favoritar.definir('c2', true);
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(result.current.dados.lista.ehFavorito('c2')).toBe(true),
      );
      let resultado: { tipo: string; erro?: unknown } | undefined;
      await act(async () => {
        resultado = (await pedido) as typeof resultado;
      });

      expect(resultado?.tipo).toBe('erro');
      expect(resultado?.erro).toMatchObject({ status, codigo });
      await waitFor(() =>
        expect(result.current.dados.lista.ehFavorito('c2')).toBe(false),
      );
      expect(result.current.dados.lista.favoritos).toEqual(lista);
    },
  );

  it('desfavoritar que falha devolve a conta no mesmo lugar da lista', async () => {
    const provedores = criarProvedores();
    const lista = [favorito('c3', 9), favorito('c2', 8), favorito('c1', 3)];
    provedores.fetch
      .responder('GET /favoritos', { corpo: lista })
      .responder('DELETE /favoritos/c2', { falhaDeRede: true });
    const { result } = await montarFavoritos(provedores);
    await waitFor(() =>
      expect(result.current.dados.lista.favoritos).toEqual(lista),
    );

    let resultado: { tipo: string; erro?: unknown } | undefined;
    await act(async () => {
      resultado = (await result.current.dados.favoritar.definir(
        'c2',
        false,
      )) as typeof resultado;
    });

    expect(resultado?.erro).toBeInstanceOf(ErroDeRede);
    expect(result.current.dados.lista.favoritos).toEqual(lista);
  });

  it('favoritar quem já era favorito e falhar não tira a conta', async () => {
    const provedores = criarProvedores();
    const lista = [favorito('c2', 8), favorito('c1', 3)];
    provedores.fetch
      .responder('GET /favoritos', { corpo: lista })
      .responder('PUT /favoritos/c2', { falhaDeRede: true });
    const { result } = await montarFavoritos(provedores);
    await waitFor(() =>
      expect(result.current.dados.lista.favoritos).toEqual(lista),
    );

    await act(async () => {
      await result.current.dados.favoritar.definir('c2', true);
    });

    expect(result.current.dados.lista.favoritos).toEqual(lista);
  });

  it('desfaz só a conta que falhou, sem mexer no que outro pedido já mudou', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('GET /favoritos', [
        { corpo: [favorito('c1', 3)] },
        { corpo: [favorito('c3', 9), favorito('c1', 3)] },
      ])
      .responder('PUT /favoritos/c2', {
        status: 404,
        corpo: { erro: 'nao_encontrado' },
        demoraMs: 60,
      })
      .responder('PUT /favoritos/c3', { status: 204, demoraMs: 10 });
    const { result } = await montarFavoritos(provedores);
    await waitFor(() =>
      expect(result.current.dados.lista.favoritos).toHaveLength(1),
    );

    let falhou: Promise<unknown> = Promise.resolve();
    let deuCerto: Promise<unknown> = Promise.resolve();
    await act(async () => {
      falhou = result.current.dados.favoritar.definir('c2', true);
      deuCerto = result.current.dados.favoritar.definir('c3', true);
      await Promise.resolve();
    });
    await act(async () => {
      await deuCerto;
    });

    // O pedido de c3 terminou, o de c2 ainda não: sem recarga e com as duas contas.
    expect(requisicoesPara(provedores, 'GET', '/favoritos')).toHaveLength(1);
    expect(
      lerFavoritos(provedores)
        ?.map((f) => f.contaId)
        .sort(),
    ).toEqual(['c1', 'c2', 'c3']);
    await act(async () => {
      await falhou;
    });

    await waitFor(() =>
      expect(requisicoesPara(provedores, 'GET', '/favoritos')).toHaveLength(2),
    );
    await waitFor(() =>
      expect(result.current.dados.lista.favoritos).toEqual([
        favorito('c3', 9),
        favorito('c1', 3),
      ]),
    );
  });

  it('uma recarga em andamento não sobrescreve a mudança com a lista velha', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('GET /favoritos', [
        { corpo: [favorito('c1', 3)] },
        { corpo: [favorito('c1', 3)], demoraMs: 60 },
        { corpo: [favorito('c2', 8), favorito('c1', 3)] },
      ])
      .responder('PUT /favoritos/c2', { status: 204, demoraMs: 10 });
    const { result } = await montarFavoritos(provedores);
    await waitFor(() =>
      expect(result.current.dados.lista.favoritos).toHaveLength(1),
    );
    await act(async () => {
      void result.current.dados.lista.recarregar();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.dados.favoritar.definir('c2', true);
    });

    await waitFor(() =>
      expect(result.current.dados.lista.favoritos).toEqual([
        favorito('c2', 8),
        favorito('c1', 3),
      ]),
    );
  });

  it('sem a lista em cache não inventa uma: só manda o pedido', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('PUT /favoritos/c2', { status: 204 });
    const { result } = await montar(() => useDefinirFavorito(), provedores);

    await act(async () => {
      expect(await result.current.dados.definir('c2', true)).toEqual({
        tipo: 'feito',
      });
    });

    expect(lerFavoritos(provedores)).toBeUndefined();
    expect(provedores.fetch.requisicoes).toHaveLength(1);
  });

  it('se a sessão mudou durante o pedido, devolve descartada e não mexe no cache novo', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('GET /favoritos', { corpo: [favorito('c1', 3)] })
      .responder('PUT /favoritos/c2', {
        status: 404,
        corpo: { erro: 'nao_encontrado' },
        demoraMs: 30,
      })
      .responder('DELETE /sessoes', { status: 204 });
    const { result } = await montarFavoritos(provedores);
    await waitFor(() =>
      expect(result.current.dados.lista.favoritos).toHaveLength(1),
    );
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    let pedido: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pedido = result.current.dados.favoritar.definir('c2', true);
      await Promise.resolve();
    });
    await act(() => result.current.sessao.sair());
    await act(() => result.current.sessao.entrar(TOKEN_NOVO));
    let resultado: unknown;
    await act(async () => {
      resultado = await pedido;
    });

    expect(resultado).toEqual({ tipo: 'descartada' });
    expect(invalidar).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: chaves.favoritos() }),
    );
    // A conta nova recarrega a própria lista; espera para não vazar do teste.
    await waitFor(() =>
      expect(requisicoesPara(provedores, 'GET', '/favoritos')).toHaveLength(2),
    );
    await waitFor(() =>
      expect(result.current.dados.favoritar.definindo).toBe(false),
    );
  });
});
