import type { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { ErroDaApi } from '../api/erros';
import {
  criarProvedores,
  type OpcoesDosProvedores,
} from '../testes/renderizar';
import {
  type ArmazenamentoDeToken,
  criarArmazenamentoEmMemoria,
} from './armazenamento-token';
import { rotaDeRetornoSegura, useCliente, useSessao } from './sessao';

const TOKEN = 'token-secreto-123';
const NOVO_TOKEN = 'token-novo-456';

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
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
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
      armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    });

    await act(() =>
      provedores.result.current.sessao.expirar(
        '/buscar?texto=maria.silva@exemplo.com#topo',
      ),
    );

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/buscar',
      aviso: 'sessao_expirada',
    });
  });

  it('sem rota válida, guarda só o aviso', async () => {
    const provedores = await montar({
      armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    });

    await act(() =>
      provedores.result.current.sessao.expirar('https://outro.site/x'),
    );

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      aviso: 'sessao_expirada',
    });
  });

  it('chamado duas vezes em paralelo não quebra e mantém o primeiro retorno', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
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
      armazenamento: criarArmazenamentoEmMemoria(TOKEN),
    });

    await act(() => provedores.result.current.sessao.expirar('/perfil'));
    await act(() => provedores.result.current.sessao.entrar(NOVO_TOKEN));

    expect(provedores.result.current.sessao.consumirRetorno()).toEqual({
      rota: '/perfil',
    });
  });
});

describe('SessaoProvider: 401 vindo do cliente (CA14)', () => {
  it('um 401 autenticado expira a sessão com a rota atual', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
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
    });
  });

  it('vários 401 em paralelo expiram uma vez só, sem erro', async () => {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
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
