import type { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { ErroDaApi } from '../api/erros';
import { criarFetchFalso, type FetchFalso } from '../testes/fetch-falso';
import {
  criarProvedores,
  type OpcoesDosProvedores,
} from '../testes/renderizar';
import {
  type ArmazenamentoDeToken,
  criarArmazenamentoEmMemoria,
} from './armazenamento-token';
import {
  impressaoDaConta,
  rotaDeRetornoSegura,
  rotaParaAConta,
  useCliente,
  useSessao,
} from './sessao';

const TOKEN = 'token-secreto-123';
const NOVO_TOKEN = 'token-novo-456';
const EMAIL = 'maria.silva@exemplo.com';
const OUTRO_EMAIL = 'joao.souza@exemplo.com';
/** Impressão de `EMAIL`: toda sessão gravada por login traz a dela (D43). */
const IMPRESSAO = impressaoDaConta(EMAIL);

function useSessaoECliente() {
  return { sessao: useSessao(), cliente: useCliente() };
}

/** Renderiza os hooks da sessão e espera o carregamento terminar. */
async function montar(opcoes: OpcoesDosProvedores = {}) {
  const provedores = criarProvedores(opcoes);
  const hook = await renderHook(useSessaoECliente, {
    wrapper: provedores.wrapper,
  });
  await act(async () => {});
  return { ...provedores, ...hook };
}

function semearCache(provedores: { queryClient: QueryClient }) {
  provedores.queryClient.setQueryData(['meuPerfil'], {
    nome: 'Maria Silva',
    cidade: 'Lavras',
  });
}

/** Promessa que o teste resolve quando quiser. */
function adiada() {
  let resolver: () => void = () => undefined;
  const promessa = new Promise<void>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

/**
 * `fetch` que registra a requisição e só responde quando o teste soltar,
 * como uma rede pendurada.
 */
function fetchPendurado(): FetchFalso & { soltar: () => void } {
  const base = criarFetchFalso();
  const pendencia = adiada();
  return {
    ...base,
    fetch: (url, init) => {
      const resposta = base.fetch(url, init);
      return pendencia.promessa.then(() => resposta);
    },
    soltar: pendencia.resolver,
  };
}

describe('SessaoProvider: carregamento', () => {
  it('começa carregando e fica autenticado quando há token na porta', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const ler = jest.spyOn(armazenamento, 'ler');
    const { wrapper } = criarProvedores({ armazenamento });

    const { result } = await renderHook(useSessao, { wrapper });
    const primeiro = result.current.status;
    await act(async () => {});

    expect(['carregando', 'autenticado']).toContain(primeiro);
    expect(result.current.status).toBe('autenticado');
    expect(ler).toHaveBeenCalled();
  });

  it('fica carregando enquanto a porta não responde', async () => {
    const leitura = adiada();
    const armazenamento: ArmazenamentoDeToken = {
      ler: async () => {
        await leitura.promessa;
        return null;
      },
      gravar: async () => undefined,
      apagar: async () => undefined,
    };
    const { result } = await montar({ armazenamento });

    expect(result.current.sessao.status).toBe('carregando');
    await act(async () => leitura.resolver());
    expect(result.current.sessao.status).toBe('anonimo');
  });

  it('fica anônimo sem token', async () => {
    const { result } = await montar();

    expect(result.current.sessao.status).toBe('anonimo');
  });

  it('fica anônimo quando a porta falha ao ler', async () => {
    const armazenamento: ArmazenamentoDeToken = {
      ler: async () => {
        throw new Error('keychain indisponível');
      },
      gravar: async () => undefined,
      apagar: async () => undefined,
    };
    const { result } = await montar({ armazenamento });

    expect(result.current.sessao.status).toBe('anonimo');
  });
});

describe('SessaoProvider: entrar (CA1)', () => {
  it('grava o token na porta e fica autenticado', async () => {
    const armazenamento = criarArmazenamentoEmMemoria();
    const { result } = await montar({ armazenamento });

    await act(() => result.current.sessao.entrar(TOKEN));

    expect(armazenamento.atual()).toBe(TOKEN);
    expect(result.current.sessao.status).toBe('autenticado');
  });

  it('o cliente da sessão manda o token gravado como Bearer', async () => {
    const { result, fetch } = await montar();
    fetch.responder('GET /perfis/eu', { corpo: { nome: 'Maria' } });

    await act(() => result.current.sessao.entrar(TOKEN));
    await act(() => result.current.cliente.get('/perfis/eu'));

    expect(fetch.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('recusa token vazio sem gravar nem mudar o status', async () => {
    const armazenamento = criarArmazenamentoEmMemoria();
    const { result } = await montar({ armazenamento });

    await act(async () => {
      await expect(result.current.sessao.entrar('')).rejects.toThrow(
        'token ausente',
      );
    });

    expect(armazenamento.atual()).toBeNull();
    expect(result.current.sessao.status).toBe('anonimo');
  });

  it('falha ao gravar mantém a sessão anônima', async () => {
    const armazenamento: ArmazenamentoDeToken = {
      ler: async () => null,
      gravar: async () => {
        throw new Error('falha ao gravar o token');
      },
      apagar: async () => undefined,
    };
    const { result } = await montar({ armazenamento });

    await act(async () => {
      await expect(result.current.sessao.entrar(TOKEN)).rejects.toThrow();
    });

    expect(result.current.sessao.status).toBe('anonimo');
  });
});

describe('SessaoProvider: sair (CA15)', () => {
  it('chama DELETE /sessoes com Bearer, apaga o token e limpa o cache', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const provedores = await montar({ armazenamento });
    provedores.fetch.responder('DELETE /sessoes', { status: 204 });
    semearCache(provedores);

    await act(() => provedores.result.current.sessao.sair());

    const requisicao = provedores.fetch.ultima();
    expect(requisicao.metodo).toBe('DELETE');
    expect(requisicao.caminho).toBe('/sessoes');
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(armazenamento.atual()).toBeNull();
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
  });

  it('com falha de rede, ainda apaga o token e limpa o cache', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const provedores = await montar({ armazenamento });
    provedores.fetch.responder('DELETE /sessoes', { falhaDeRede: true });
    semearCache(provedores);

    await act(() => provedores.result.current.sessao.sair());

    expect(provedores.fetch.ultima().caminho).toBe('/sessoes');
    expect(armazenamento.atual()).toBeNull();
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
  });

  it('com a sessão já revogada (401), sai sem marcar como expirada', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const provedores = await montar({ armazenamento });
    provedores.fetch.responder('DELETE /sessoes', {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });

    await act(() => provedores.result.current.sessao.sair());

    expect(armazenamento.atual()).toBeNull();
    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});
  });

  it('com falha da porta ao apagar, ainda limpa o cache e fica anônimo', async () => {
    const armazenamento: ArmazenamentoDeToken = {
      ler: async () => TOKEN,
      gravar: async () => undefined,
      apagar: async () => {
        throw new Error('falha ao apagar o token');
      },
    };
    const provedores = await montar({ armazenamento });
    provedores.fetch.responder('DELETE /sessoes', { status: 204 });
    semearCache(provedores);

    await act(() => provedores.result.current.sessao.sair());

    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
  });

  it('descarta o retorno de uma expiração anterior', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    });
    provedores.fetch.responder('DELETE /sessoes', { status: 204 });

    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));
    await act(() => provedores.result.current.sessao.sair());

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});
  });
});

describe('SessaoProvider: expirar (CA14)', () => {
  it('apaga o token, limpa o cache e guarda rota e aviso', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN, IMPRESSAO);
    const provedores = await montar({ armazenamento });
    semearCache(provedores);

    await act(() =>
      provedores.result.current.sessao.expirar('/trampos/abc-123'),
    );

    expect(armazenamento.atual()).toBeNull();
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/trampos/abc-123',
      aviso: 'sessao_expirada',
      conta: IMPRESSAO,
    });
  });

  it('consumirRetorno zera o retorno', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    });

    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    provedores.result.current.sessao.consumirRetorno();

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});
  });

  it('guarda só o caminho, sem query nem fragmento', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN, IMPRESSAO),
    });

    await act(() =>
      provedores.result.current.sessao.expirar(
        '/buscar?texto=maria.silva@exemplo.com#topo',
      ),
    );

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/buscar',
      aviso: 'sessao_expirada',
      conta: IMPRESSAO,
    });
  });

  it('sem rota válida, guarda só o aviso e a conta', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN, IMPRESSAO),
    });

    await act(() =>
      provedores.result.current.sessao.expirar('https://outro.site/x'),
    );

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      aviso: 'sessao_expirada',
      conta: IMPRESSAO,
    });
  });

  it('chamado duas vezes em paralelo não quebra e mantém o primeiro retorno', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN, IMPRESSAO);
    const provedores = await montar({ armazenamento });
    semearCache(provedores);

    await act(async () => {
      await Promise.all([
        provedores.result.current.sessao.expirar('/perfil'),
        provedores.result.current.sessao.expirar('/buscar'),
      ]);
    });
    await act(() => provedores.result.current.sessao.expirar());

    expect(armazenamento.atual()).toBeNull();
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/perfil',
      aviso: 'sessao_expirada',
      conta: IMPRESSAO,
    });
  });

  it('sem sessão autenticada, não guarda aviso de sessão expirada', async () => {
    const provedores = await montar();

    await act(() => provedores.result.current.sessao.expirar('/perfil'));

    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});
  });

  it('entrar logo depois de expirar não perde o token novo (fila da porta)', async () => {
    let token: string | null = TOKEN;
    const apagamento = adiada();
    const armazenamento: ArmazenamentoDeToken = {
      ler: async () => token,
      gravar: async (novo) => {
        token = novo;
      },
      apagar: async () => {
        await apagamento.promessa;
        token = null;
      },
    };
    const provedores = await montar({ armazenamento });

    let expiracao: Promise<void> = Promise.resolve();
    let entrada: Promise<void> = Promise.resolve();
    await act(async () => {
      expiracao = provedores.result.current.sessao.expirar('/perfil');
      entrada = provedores.result.current.sessao.entrar(NOVO_TOKEN);
    });
    await act(async () => {
      apagamento.resolver();
      await Promise.all([expiracao, entrada]);
    });

    expect(token).toBe(NOVO_TOKEN);
    expect(provedores.result.current.sessao.status).toBe('autenticado');
  });

  it('entrar depois de expirar mantém a rota de retorno e descarta o aviso', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN, IMPRESSAO),
    });

    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/perfil',
      conta: IMPRESSAO,
    });
  });
});

describe('SessaoProvider: 401 vindo do cliente (CA14)', () => {
  it('um 401 autenticado expira a sessão com a rota atual', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN, IMPRESSAO);
    const provedores = await montar({
      armazenamento,
      obterRotaAtual: () => '/perfis/abc?x=1',
    });
    provedores.fetch.responder('GET /perfis/eu', {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });
    semearCache(provedores);

    let erro: unknown;
    await act(async () => {
      erro = await provedores.result.current.cliente
        .get('/perfis/eu')
        .catch((e: unknown) => e);
    });
    await act(async () => {});

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro).toMatchObject({ status: 401, codigo: 'sessao_expirada' });
    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(armazenamento.atual()).toBeNull();
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/perfis/abc',
      aviso: 'sessao_expirada',
      conta: IMPRESSAO,
    });
  });

  it('vários 401 em paralelo expiram uma vez só, sem erro', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN, IMPRESSAO);
    const provedores = await montar({
      armazenamento,
      obterRotaAtual: () => '/buscar',
    });
    provedores.fetch.responder('GET /perfis/eu', { status: 401 });
    provedores.fetch.responder('GET /categorias', { status: 401 });
    provedores.fetch.responder('GET /busca', { status: 401 });

    let resultados: PromiseSettledResult<unknown>[] = [];
    await act(async () => {
      const { cliente } = provedores.result.current;
      resultados = await Promise.allSettled([
        cliente.get('/perfis/eu'),
        cliente.get('/categorias'),
        cliente.get('/busca'),
      ]);
    });
    await act(async () => {});

    expect(resultados.map((r) => r.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(armazenamento.atual()).toBeNull();
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/buscar',
      aviso: 'sessao_expirada',
      conta: IMPRESSAO,
    });
  });

  it('depois de expirar, a próxima requisição vai sem token', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    });
    provedores.fetch.responder('GET /categorias', [
      { status: 401 },
      { corpo: [] },
    ]);

    await act(async () => {
      await provedores.result.current.cliente
        .get('/categorias')
        .catch(() => undefined);
    });
    await act(async () => {});
    await act(() => provedores.result.current.cliente.get('/categorias'));

    expect(provedores.fetch.ultima().cabecalhos.authorization).toBeUndefined();
  });
});

describe('SessaoProvider: 401 atrasado de outra sessão (Q4)', () => {
  it('um 401 da requisição feita com o token antigo não derruba a sessão nova', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const provedores = await montar({ armazenamento });
    provedores.fetch.responder('GET /perfis/eu', [
      { status: 401, demoraMs: 30 },
      { corpo: {} },
    ]);
    semearCache(provedores);

    let pedido: Promise<unknown> = Promise.resolve();
    await act(async () => {
      // Sai com o token antigo; a resposta só chega depois do novo login.
      pedido = provedores.result.current.cliente
        .get('/perfis/eu')
        .catch((e: unknown) => e);
      await Promise.resolve();
    });
    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));
    const geracao = provedores.result.current.sessao.geracao();
    let erro: unknown;
    await act(async () => {
      erro = await pedido;
    });
    await act(async () => {});

    expect(provedores.fetch.requisicoes[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(erro).toMatchObject({ status: 401, codigo: 'sessao_expirada' });
    expect(provedores.result.current.sessao.status).toBe('autenticado');
    expect(armazenamento.atual()).toBe(NOVO_TOKEN);
    expect(provedores.queryClient.getQueryData(['meuPerfil'])).toBeDefined();
    expect(provedores.result.current.sessao.geracao()).toBe(geracao);
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});
  });

  it('um 401 depois da saída não marca sessão expirada nem muda a geração', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const provedores = await montar({ armazenamento });
    provedores.fetch
      .responder('GET /perfis/eu', { status: 401, demoraMs: 30 })
      .responder('DELETE /sessoes', { status: 204 });

    let pedido: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pedido = provedores.result.current.cliente
        .get('/perfis/eu')
        .catch(() => undefined);
      await Promise.resolve();
    });
    await act(() => provedores.result.current.sessao.sair());
    const geracao = provedores.result.current.sessao.geracao();
    await act(async () => {
      await pedido;
    });
    await act(async () => {});

    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(provedores.result.current.sessao.geracao()).toBe(geracao);
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});
  });

  it('com a porta ilegível, o 401 expira a sessão mesmo assim (falha fechada)', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const provedores = await montar({ armazenamento });
    provedores.fetch.responder('GET /perfis/eu', { status: 401 });
    const ler = jest.spyOn(armazenamento, 'ler');
    // A 1ª leitura é a do token da requisição; a 2ª, a da conferência.
    ler
      .mockResolvedValueOnce(TOKEN)
      .mockRejectedValueOnce(new Error('ilegivel'));

    await act(async () => {
      await provedores.result.current.cliente
        .get('/perfis/eu')
        .catch(() => undefined);
    });
    await act(async () => {});

    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(armazenamento.atual()).toBeNull();
  });

  it('geracao muda a cada entrar, sair, expirar e encerrarPorExclusao', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    });
    provedores.fetch.responder('DELETE /sessoes', { status: 204 });
    const { sessao } = provedores.result.current;
    const vistas = [sessao.geracao()];

    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    vistas.push(provedores.result.current.sessao.geracao());
    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));
    vistas.push(provedores.result.current.sessao.geracao());
    await act(() => provedores.result.current.sessao.sair());
    vistas.push(provedores.result.current.sessao.geracao());
    await act(() => provedores.result.current.sessao.entrar(TOKEN));
    vistas.push(provedores.result.current.sessao.geracao());
    await act(() => provedores.result.current.sessao.encerrarPorExclusao());
    vistas.push(provedores.result.current.sessao.geracao());

    expect(new Set(vistas).size).toBe(6);
  });
});

describe('SessaoProvider: encerrarPorExclusao (CA17)', () => {
  it('apaga o token e o cache, fica anônimo e deixa só o aviso, sem rede', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const provedores = await montar({
      armazenamento,
      obterRotaAtual: () => '/perfil/excluir',
    });
    semearCache(provedores);
    const geracao = provedores.result.current.sessao.geracao();

    await act(() => provedores.result.current.sessao.encerrarPorExclusao());

    // Nenhum DELETE /sessoes (a API já derrubou as sessões) nem outra chamada.
    expect(provedores.fetch.requisicoes).toEqual([]);
    expect(armazenamento.atual()).toBeNull();
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(provedores.result.current.sessao.geracao()).not.toBe(geracao);
    // Sem rota de retorno: a conta acabou, não há para onde voltar.
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      aviso: 'conta_excluida',
    });
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});
  });

  it('troca o retorno de uma expiração anterior pelo aviso de conta excluída', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    });

    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));
    await act(() => provedores.result.current.sessao.encerrarPorExclusao());

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      aviso: 'conta_excluida',
    });
  });

  it('um 401 atrasado de um pedido anterior não troca o aviso nem a geração', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const provedores = await montar({
      armazenamento,
      obterRotaAtual: () => '/conversas/c1',
    });
    provedores.fetch.responder('GET /conversas', { status: 401, demoraMs: 30 });

    let pedido: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pedido = provedores.result.current.cliente
        .get('/conversas')
        .catch(() => undefined);
      await Promise.resolve();
    });
    await act(() => provedores.result.current.sessao.encerrarPorExclusao());
    const geracao = provedores.result.current.sessao.geracao();
    await act(async () => {
      await pedido;
    });
    await act(async () => {});

    expect(provedores.fetch.requisicoes.map((r) => r.caminho)).toEqual([
      '/conversas',
    ]);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(provedores.result.current.sessao.geracao()).toBe(geracao);
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      aviso: 'conta_excluida',
    });
  });

  it('com falha da porta ao apagar, não rejeita, limpa o cache e fica anônimo', async () => {
    const armazenamento: ArmazenamentoDeToken = {
      ler: async () => TOKEN,
      gravar: async () => undefined,
      apagar: async () => {
        throw new Error('falha ao apagar o token');
      },
    };
    const provedores = await montar({ armazenamento });
    semearCache(provedores);

    await act(async () => {
      await expect(
        provedores.result.current.sessao.encerrarPorExclusao(),
      ).resolves.toBeUndefined();
    });

    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(provedores.fetch.requisicoes).toEqual([]);
  });

  it('entrar depois descarta o aviso de conta excluída', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const provedores = await montar({ armazenamento });

    await act(() => provedores.result.current.sessao.encerrarPorExclusao());
    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));

    expect(armazenamento.atual()).toBe(NOVO_TOKEN);
    expect(provedores.result.current.sessao.status).toBe('autenticado');
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});
  });

  it('nada vai para o console', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (metodo) => jest.spyOn(console, metodo).mockImplementation(() => {}),
    );
    const chamadas = () => espioes.flatMap((espiao) => espiao.mock.calls);
    let vistas: unknown[] = [];
    try {
      const provedores = await montar({
        armazenamento: criarArmazenamentoEmMemoria(TOKEN),
      });
      await act(() => provedores.result.current.sessao.encerrarPorExclusao());
      vistas = chamadas();
    } finally {
      for (const espiao of espioes) {
        espiao.mockRestore();
      }
    }
    expect(vistas).toEqual([]);
  });
});

describe('SessaoProvider: sair sem esperar a rede (CA51)', () => {
  it('com o fetch pendurado, termina, deixa token e cache vazios e o DELETE leva o token antigo', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(
      TOKEN,
      impressaoDaConta(EMAIL),
    );
    const fetch = fetchPendurado();
    fetch.responder('DELETE /sessoes', { status: 204 });
    const provedores = await montar({ armazenamento, fetch });
    semearCache(provedores);

    let terminou = false;
    await act(async () => {
      await provedores.result.current.sessao.sair();
      terminou = true;
    });

    expect(terminou).toBe(true);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
    expect(armazenamento.atual()).toBeNull();
    expect(armazenamento.contaAtual()).toBeNull();
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(fetch.requisicoes).toHaveLength(1);
    expect(fetch.ultima()).toMatchObject({
      metodo: 'DELETE',
      caminho: '/sessoes',
      cabecalhos: { authorization: `Bearer ${TOKEN}` },
    });
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});

    await act(async () => fetch.soltar());
  });

  it('o 401 do DELETE em segundo plano não derruba um login feito depois', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const provedores = await montar({ armazenamento });
    provedores.fetch.responder('DELETE /sessoes', {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
      demoraMs: 30,
    });

    await act(() => provedores.result.current.sessao.sair());
    await act(() =>
      provedores.result.current.sessao.entrar(NOVO_TOKEN, OUTRO_EMAIL),
    );
    const geracao = provedores.result.current.sessao.geracao();
    semearCache(provedores);
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 60));
    });

    expect(
      provedores.fetch.requisicoes.map((r) => r.cabecalhos.authorization),
    ).toEqual([`Bearer ${TOKEN}`]);
    expect(provedores.result.current.sessao.status).toBe('autenticado');
    expect(armazenamento.atual()).toBe(NOVO_TOKEN);
    expect(armazenamento.contaAtual()).toBe(impressaoDaConta(OUTRO_EMAIL));
    expect(provedores.result.current.sessao.geracao()).toBe(geracao);
    expect(provedores.queryClient.getQueryData(['meuPerfil'])).toBeDefined();
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});
  });

  it('a falha do DELETE não aparece em lugar nenhum: sem rejeição nem console', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (metodo) => jest.spyOn(console, metodo).mockImplementation(() => {}),
    );
    const naoTratadas: unknown[] = [];
    const aoRejeitar = (motivo: unknown) => naoTratadas.push(motivo);
    process.on('unhandledRejection', aoRejeitar);
    try {
      const provedores = await montar({
        armazenamento: criarArmazenamentoEmMemoria(TOKEN),
      });
      provedores.fetch.responder('DELETE /sessoes', [{ falhaDeRede: true }]);

      await act(async () => {
        await expect(
          provedores.result.current.sessao.sair(),
        ).resolves.toBeUndefined();
      });
      await act(async () => {
        await new Promise((resolver) => setTimeout(resolver, 0));
      });

      expect(provedores.fetch.ultima().caminho).toBe('/sessoes');
      expect(provedores.result.current.sessao.status).toBe('anonimo');
      expect(provedores.result.current.sessao.consumirRetorno()).toEqual({});
      for (const espiao of espioes) {
        expect(espiao).not.toHaveBeenCalled();
      }
      expect(naoTratadas).toEqual([]);
    } finally {
      process.off('unhandledRejection', aoRejeitar);
      for (const espiao of espioes) {
        espiao.mockRestore();
      }
    }
  });

  it('sem token na porta, sai sem chamar a rede', async () => {
    const provedores = await montar();

    await act(() => provedores.result.current.sessao.sair());

    expect(provedores.fetch.requisicoes).toEqual([]);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
  });

  it('com a porta ilegível, ainda apaga, limpa o cache e fica anônimo, sem rede', async () => {
    const apagar = jest.fn(async () => undefined);
    const armazenamento: ArmazenamentoDeToken = {
      ler: jest
        .fn<Promise<string | null>, []>()
        .mockResolvedValueOnce(TOKEN)
        .mockRejectedValue(new Error('ilegivel')),
      gravar: async () => undefined,
      apagar,
    };
    const provedores = await montar({ armazenamento });
    semearCache(provedores);

    await act(() => provedores.result.current.sessao.sair());

    expect(apagar).toHaveBeenCalled();
    expect(provedores.fetch.requisicoes).toEqual([]);
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(provedores.result.current.sessao.status).toBe('anonimo');
  });
});

describe('SessaoProvider: impressão da conta (CA50)', () => {
  it('entrar com e-mail grava a impressão junto do token, sem o e-mail', async () => {
    const armazenamento = criarArmazenamentoEmMemoria();
    const { result } = await montar({ armazenamento });

    await act(() => result.current.sessao.entrar(TOKEN, `  ${EMAIL} `));

    expect(armazenamento.atual()).toBe(TOKEN);
    expect(armazenamento.contaAtual()).toBe(impressaoDaConta(EMAIL));
    expect(armazenamento.contaAtual()).not.toContain('maria');
  });

  it('entrar sem e-mail não deixa a impressão de outra sessão', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(
      TOKEN,
      impressaoDaConta(EMAIL),
    );
    const { result } = await montar({ armazenamento });

    await act(() => result.current.sessao.entrar(NOVO_TOKEN));

    expect(armazenamento.atual()).toBe(NOVO_TOKEN);
    expect(armazenamento.contaAtual()).toBeNull();
  });

  it('a sessão restaurada guarda a impressão da porta no retorno da expiração', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(
        TOKEN,
        impressaoDaConta(EMAIL),
      ),
    });

    await act(() => provedores.result.current.sessao.expirar('/perfil'));

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/perfil',
      aviso: 'sessao_expirada',
      conta: impressaoDaConta(EMAIL),
    });
  });

  it('o 401 de uma sessão aberta com e-mail guarda a impressão dela', async () => {
    const provedores = await montar({ obterRotaAtual: () => '/conversas/c1' });
    provedores.fetch.responder('GET /perfis/eu', { status: 401 });

    await act(() => provedores.result.current.sessao.entrar(TOKEN, EMAIL));
    await act(async () => {
      await provedores.result.current.cliente
        .get('/perfis/eu')
        .catch(() => undefined);
    });
    await act(async () => {});

    const retorno = provedores.result.current.sessao.consumirRetorno();
    expect(retorno).toEqual({
      rota: '/conversas/c1',
      aviso: 'sessao_expirada',
      conta: impressaoDaConta(EMAIL),
    });
    expect(rotaParaAConta(retorno, EMAIL)).toBe('/conversas/c1');
    expect(rotaParaAConta(retorno, OUTRO_EMAIL)).toBeUndefined();
  });

  it('sessão restaurada com token e sem impressão: o retorno não volta à rota para login nenhum (R4, falha fechada)', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
    const lerConta = jest.spyOn(armazenamento, 'lerConta');
    const provedores = await montar({ armazenamento });

    expect(provedores.result.current.sessao.status).toBe('autenticado');
    expect(lerConta).toHaveBeenCalledTimes(1);
    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    const retorno = provedores.result.current.sessao.consumirRetorno();

    expect(retorno).toMatchObject({
      rota: '/perfil',
      aviso: 'sessao_expirada',
    });
    expect(retorno.conta).toEqual(expect.any(String));
    for (const email of [EMAIL, OUTRO_EMAIL, '']) {
      expect(rotaParaAConta(retorno, email)).toBeUndefined();
    }
  });

  it('sessão restaurada sem impressão e login novo: a rota de antes não volta nem para quem entra', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    });

    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN, EMAIL));
    const retorno = provedores.result.current.sessao.consumirRetorno();

    expect(retorno.rota).toBe('/perfil');
    expect(rotaParaAConta(retorno, EMAIL)).toBeUndefined();
  });

  it('porta sem lerConta: a sessão restaurada segue sem conta, como antes', async () => {
    const armazenamento: ArmazenamentoDeToken = {
      ler: async () => TOKEN,
      gravar: async () => undefined,
      apagar: async () => undefined,
    };
    const provedores = await montar({ armazenamento });

    expect(provedores.result.current.sessao.status).toBe('autenticado');
    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    const retorno = provedores.result.current.sessao.consumirRetorno();

    expect(retorno).toEqual({ rota: '/perfil', aviso: 'sessao_expirada' });
    expect(rotaParaAConta(retorno, OUTRO_EMAIL)).toBe('/perfil');
  });

  it('com a impressão ilegível na porta, o retorno não volta à rota (falha fechada)', async () => {
    const armazenamento: ArmazenamentoDeToken = {
      ler: async () => TOKEN,
      lerConta: async () => {
        throw new Error('ilegivel');
      },
      gravar: async () => undefined,
      apagar: async () => undefined,
    };
    const provedores = await montar({ armazenamento });

    expect(provedores.result.current.sessao.status).toBe('autenticado');
    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    const retorno = provedores.result.current.sessao.consumirRetorno();

    expect(retorno.rota).toBe('/perfil');
    expect(rotaParaAConta(retorno, EMAIL)).toBeUndefined();
  });

  it('entrar depois de expirar mantém a rota com a conta dela', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(
        TOKEN,
        impressaoDaConta(EMAIL),
      ),
    });

    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    await act(() =>
      provedores.result.current.sessao.entrar(NOVO_TOKEN, OUTRO_EMAIL),
    );

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/perfil',
      conta: impressaoDaConta(EMAIL),
    });
  });

  it('sair e encerrarPorExclusao esquecem a conta: a expiração seguinte vai sem ela', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(
        TOKEN,
        impressaoDaConta(EMAIL),
      ),
    });
    provedores.fetch.responder('DELETE /sessoes', { status: 204 });

    await act(() => provedores.result.current.sessao.sair());
    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));
    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/perfil',
      aviso: 'sessao_expirada',
    });

    await act(() => provedores.result.current.sessao.entrar(TOKEN, EMAIL));
    await act(() => provedores.result.current.sessao.encerrarPorExclusao());
    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));
    await act(() => provedores.result.current.sessao.expirar('/buscar'));
    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/buscar',
      aviso: 'sessao_expirada',
    });
  });
});

describe('SessaoProvider: o token não vaza (CA15)', () => {
  it('o estado exposto por useSessao() não contém o token', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    });

    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));
    const exposto = JSON.stringify(provedores.result.current.sessao);
    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    const retorno = JSON.stringify(
      provedores.result.current.sessao.consumirRetorno(),
    );

    expect(exposto).toBe('{"status":"autenticado"}');
    for (const texto of [exposto, retorno]) {
      expect(texto).not.toContain(TOKEN);
      expect(texto).not.toContain(NOVO_TOKEN);
    }
  });

  it('nada vai para o console durante entrar, sair e expirar', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (metodo) => jest.spyOn(console, metodo).mockImplementation(() => {}),
    );
    try {
      const provedores = await montar({
        armazenamento: criarArmazenamentoEmMemoria(TOKEN),
      });
      provedores.fetch.responder('DELETE /sessoes', { falhaDeRede: true });
      provedores.fetch.responder('GET /perfis/eu', { status: 401 });

      await act(async () => {
        await provedores.result.current.cliente
          .get('/perfis/eu')
          .catch(() => undefined);
      });
      await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));
      await act(() => provedores.result.current.sessao.sair());

      for (const espiao of espioes) {
        expect(espiao).not.toHaveBeenCalled();
      }
    } finally {
      for (const espiao of espioes) {
        espiao.mockRestore();
      }
    }
  });
});

describe('useSessao e useCliente fora do provider', () => {
  it('lançam erro', async () => {
    const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(renderHook(useSessao)).rejects.toThrow(
        'useSessao precisa estar dentro de <SessaoProvider>',
      );
      await expect(renderHook(useCliente)).rejects.toThrow(
        'useCliente precisa estar dentro de <SessaoProvider>',
      );
    } finally {
      silencio.mockRestore();
    }
  });
});

describe('rotaDeRetornoSegura', () => {
  it.each([
    ['/perfil', '/perfil'],
    ['/trampos/abc-123', '/trampos/abc-123'],
    ['/buscar?texto=maria', '/buscar'],
    ['/perfis/x#y', '/perfis/x'],
    ['/', '/'],
  ])('aceita %s como %s', (entrada, esperado) => {
    expect(rotaDeRetornoSegura(entrada)).toBe(esperado);
  });

  it.each([
    undefined,
    '',
    'perfil',
    '//outro.site/x',
    'https://outro.site/x',
    'trampoja://perfil',
    '/a\\b',
    '/com espaco',
    '/a\u0000b',
    `/${'a'.repeat(200)}`,
  ])('recusa %j', (entrada) => {
    expect(rotaDeRetornoSegura(entrada)).toBeUndefined();
  });
});

describe('impressaoDaConta (D43)', () => {
  it('ignora espaços nas pontas e maiúsculas', () => {
    expect(impressaoDaConta('  Maria.Silva@Exemplo.COM ')).toBe(
      impressaoDaConta(EMAIL),
    );
  });

  it('muda com o e-mail', () => {
    expect(impressaoDaConta(OUTRO_EMAIL)).not.toBe(impressaoDaConta(EMAIL));
    expect(impressaoDaConta('maria.silva@exemplo.co')).not.toBe(
      impressaoDaConta(EMAIL),
    );
  });

  it('é hexadecimal de tamanho fixo e não carrega o e-mail', () => {
    for (const email of [EMAIL, OUTRO_EMAIL, 'a@b.c', '']) {
      const impressao = impressaoDaConta(email);
      expect(impressao).toMatch(/^[0-9a-f]{14}$/);
      expect(impressao).not.toContain('@');
    }
  });
});

describe('rotaParaAConta (CA50)', () => {
  const conta = impressaoDaConta(EMAIL);

  it('mesma conta volta à rota, mesmo com o e-mail digitado diferente', () => {
    expect(
      rotaParaAConta({ rota: '/perfil', conta }, ' MARIA.silva@exemplo.com'),
    ).toBe('/perfil');
  });

  it('outra conta não volta à rota', () => {
    expect(
      rotaParaAConta({ rota: '/perfil', conta }, OUTRO_EMAIL),
    ).toBeUndefined();
  });

  it('retorno sem conta volta à rota', () => {
    expect(rotaParaAConta({ rota: '/perfil' }, OUTRO_EMAIL)).toBe('/perfil');
  });

  it('sem rota, não há para onde voltar', () => {
    expect(rotaParaAConta({ conta }, EMAIL)).toBeUndefined();
    expect(rotaParaAConta({}, EMAIL)).toBeUndefined();
  });
});
