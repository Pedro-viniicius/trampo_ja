import {
  notifyManager,
  onlineManager,
  QueryClient,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { ErroDaApi, ErroDeRede } from '../../api/erros';
import {
  criarProvedores as criarProvedoresBase,
  type OpcoesDosProvedores,
} from '../../testes/renderizar';
import {
  type ArmazenamentoEmMemoria,
  criarArmazenamentoEmMemoria,
} from '../armazenamento-token';
import { chaveDoErro } from '../erros';
import { useSessao } from '../sessao';
import { chaves } from './chaves';
import {
  type ResultadoDaExportacao,
  useExcluirConta,
  useExportarDados,
} from './conta';

// Disco falso: uri -> conteúdo. `mock*` pode ser lido dentro do `jest.mock`.
const mockDisco = new Map<string, string>();

jest.mock('expo-file-system', () => {
  class File {
    readonly uri: string;
    constructor(diretorio: { readonly uri: string }, nome: string) {
      this.uri = `${diretorio.uri}${nome}`;
    }
    get exists(): boolean {
      return mockDisco.has(this.uri);
    }
    write(conteudo: string): void {
      mockDisco.set(this.uri, conteudo);
    }
    delete(): void {
      mockDisco.delete(this.uri);
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache/' } } };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const disponivel = jest.mocked(Sharing.isAvailableAsync);
const compartilhar = jest.mocked(Sharing.shareAsync);

const TOKEN = 'token-da-sessao-123';
const TOKEN_NOVO = 'token-novo-456';
const SENHA = 'senha-sentinela-9d2c';
const SENTINELA_DO_JSON = 'mensagem-sentinela-4b1e';
const EXPORTACAO = {
  formato: 'trampo-ja.exportacao.v1',
  conta: { id: 'c1', email: 'maria@exemplo.com' },
  conversas: [{ id: 'v1', minhasMensagens: [{ texto: SENTINELA_DO_JSON }] }],
};
const PERFIL = { nome: 'Maria Silva', cidade: 'Lavras' };

/** Conteúdo do arquivo no instante em que a folha abriu. */
let vistoPelaFolha: (string | undefined)[] = [];

beforeEach(() => {
  // O TanStack avisa os componentes num `setTimeout(0)`; o `reset()` do fim
  // de `exportar` cairia depois do `act` do teste. Numa microtarefa, o aviso
  // sai dentro do `act` que chamou o hook.
  notifyManager.setScheduler((avisar) => {
    void Promise.resolve().then(avisar);
  });
  mockDisco.clear();
  vistoPelaFolha = [];
  disponivel.mockReset().mockResolvedValue(true);
  compartilhar.mockReset().mockImplementation(async (uri: string) => {
    vistoPelaFolha.push(mockDisco.get(uri));
  });
});

afterEach(async () => {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
  notifyManager.setScheduler((avisar) => setTimeout(avisar, 0));
});

/**
 * `QueryClient` em que o hook é que precisa desligar a nova tentativa e a
 * coleta por tempo: o padrão aqui é tentar 3 vezes, sem espera, e guardar a
 * mutação para sempre. Assim os testes provam o `retry: 0` e o `gcTime: 0`
 * dos hooks.
 */
function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: {
        retry: 3,
        retryDelay: 0,
        gcTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

function autenticado(opcoes: OpcoesDosProvedores = {}) {
  const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
  const provedores = criarProvedoresBase({
    queryClient: criarQueryClient(),
    armazenamento,
    ...opcoes,
  });
  provedores.queryClient.setQueryData(chaves.meuPerfil(), PERFIL);
  return {
    ...provedores,
    armazenamento: armazenamento as ArmazenamentoEmMemoria,
  };
}

type Provedores = ReturnType<typeof autenticado>;

async function montar<T>(hook: () => T, provedores: Provedores) {
  const resultado = await renderHook(
    () => ({ sessao: useSessao(), dados: hook() }),
    { wrapper: provedores.wrapper },
  );
  await waitFor(() =>
    expect(resultado.result.current.sessao.status).toBe('autenticado'),
  );
  return resultado;
}

/** Tudo o que os caches do TanStack guardam, em texto. */
function textoDosCaches(provedores: Provedores): string {
  return JSON.stringify([
    provedores.queryClient
      .getMutationCache()
      .getAll()
      .map((mutacao) => mutacao.state),
    provedores.queryClient
      .getQueryCache()
      .getAll()
      .map((consulta) => consulta.state.data),
  ]);
}

async function esperarCacheDeMutacoesVazio(provedores: Provedores) {
  await waitFor(() =>
    expect(provedores.queryClient.getMutationCache().getAll()).toHaveLength(0),
  );
}

describe('useExcluirConta (CA17)', () => {
  it('faz o POST só com a senha e encerra a sessão sem DELETE /sessoes', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exclusao', { status: 204 });
    const { result } = await montar(useExcluirConta, provedores);
    const geracao = result.current.sessao.geracao();

    await act(async () => {
      await result.current.dados.mutateAsync(SENHA);
    });

    expect(provedores.fetch.requisicoes).toHaveLength(1);
    expect(provedores.fetch.requisicoes[0]).toMatchObject({
      metodo: 'POST',
      caminho: '/contas/eu/exclusao',
      corpo: { senha: SENHA },
      cabecalhos: { authorization: `Bearer ${TOKEN}` },
    });
    expect(provedores.fetch.requisicoes[0]?.url).not.toContain(SENHA);
    expect(result.current.sessao.status).toBe('anonimo');
    expect(result.current.sessao.geracao()).not.toBe(geracao);
    expect(provedores.armazenamento.atual()).toBeNull();
    expect(provedores.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(result.current.sessao.consumirRetorno()).toEqual({
      aviso: 'conta_excluida',
    });
  });

  it('depois do sucesso a mutação fica sem data e sem variables (CA24)', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exclusao', { status: 204 });
    const { result } = await montar(useExcluirConta, provedores);

    await act(async () => {
      result.current.dados.mutate(SENHA);
    });

    await waitFor(() => expect(result.current.sessao.status).toBe('anonimo'));
    await waitFor(() => expect(result.current.dados.status).toBe('idle'));
    expect(result.current.dados.variables).toBeUndefined();
    expect(result.current.dados.data).toBeUndefined();
    await esperarCacheDeMutacoesVazio(provedores);
    expect(textoDosCaches(provedores)).not.toContain(SENHA);
  });

  it('403 senha_incorreta sobe cru, vira senha_incorreta e nada muda', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exclusao', {
      status: 403,
      corpo: { erro: 'senha_incorreta' },
    });
    const { result } = await montar(useExcluirConta, provedores);

    await act(async () => {
      await result.current.dados.mutateAsync(SENHA).catch(() => undefined);
    });

    await waitFor(() =>
      expect(result.current.dados.error).toBeInstanceOf(ErroDaApi),
    );
    const erro = result.current.dados.error;
    expect(chaveDoErro(erro, 'nenhum')).toEqual({
      geral: 'senha_incorreta',
      campos: {},
    });
    expect(JSON.stringify(erro)).not.toContain(SENHA);
    expect(String(erro)).not.toContain(SENHA);
    expect(result.current.sessao.status).toBe('autenticado');
    expect(provedores.armazenamento.atual()).toBe(TOKEN);
    expect(provedores.queryClient.getQueryData(chaves.meuPerfil())).toEqual(
      PERFIL,
    );
    expect(result.current.sessao.consumirRetorno()).toEqual({});
  });

  it('429 vira o texto de muitas ações (CA20) e a sessão continua', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exclusao', {
      status: 429,
      corpo: { erro: 'muitas_requisicoes' },
    });
    const { result } = await montar(useExcluirConta, provedores);

    await act(async () => {
      await result.current.dados.mutateAsync(SENHA).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.dados.isError).toBe(true));
    expect(chaveDoErro(result.current.dados.error, 'nenhum').geral).toBe(
      'muitas_tentativas_acao',
    );
    expect(result.current.sessao.status).toBe('autenticado');
  });

  it('sem nova tentativa: um 500 faz um POST só', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exclusao', { status: 500 });
    const { result } = await montar(useExcluirConta, provedores);

    await act(async () => {
      await result.current.dados.mutateAsync(SENHA).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.dados.isError).toBe(true));
    expect(provedores.fetch.requisicoes).toHaveLength(1);
  });

  it('offline falha na hora com ErroDeRede, sem ficar pausada', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exclusao', {
      falhaDeRede: true,
    });
    const { result } = await montar(useExcluirConta, provedores);
    await act(async () => onlineManager.setOnline(false));
    try {
      await act(async () => {
        await result.current.dados.mutateAsync(SENHA).catch(() => undefined);
      });

      await waitFor(() =>
        expect(result.current.dados.error).toBeInstanceOf(ErroDeRede),
      );
      expect(result.current.dados.isPaused).toBe(false);
      expect(result.current.sessao.status).toBe('autenticado');
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
  });

  it('a mutação com a senha sai do cache quando a tela deixa de observar', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exclusao', {
      status: 403,
      corpo: { erro: 'senha_incorreta' },
    });
    const { result, unmount } = await montar(useExcluirConta, provedores);
    await act(async () => {
      await result.current.dados.mutateAsync(SENHA).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.dados.isError).toBe(true));

    await act(async () => unmount());

    await esperarCacheDeMutacoesVazio(provedores);
  });

  it('se outra sessão começou durante o POST, não a derruba', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exclusao', {
      status: 204,
      demoraMs: 30,
    });
    const { result } = await montar(useExcluirConta, provedores);

    let pedido: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pedido = result.current.dados.mutateAsync(SENHA);
      await Promise.resolve();
    });
    await act(() => result.current.sessao.entrar(TOKEN_NOVO));
    await act(async () => {
      await pedido;
    });

    expect(result.current.sessao.status).toBe('autenticado');
    expect(provedores.armazenamento.atual()).toBe(TOKEN_NOVO);
    expect(result.current.sessao.consumirRetorno()).toEqual({});
    await waitFor(() => expect(result.current.dados.status).toBe('idle'));
  });
});

describe('useExportarDados (CA19)', () => {
  it('faz o POST só com a senha, compartilha o arquivo e o apaga', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exportacao', {
      corpo: EXPORTACAO,
    });
    const { result } = await montar(useExportarDados, provedores);

    let resultado: ResultadoDaExportacao | undefined;
    await act(async () => {
      resultado = await result.current.dados.exportar(SENHA);
    });

    expect(resultado).toEqual({ tipo: 'compartilhado' });
    expect(provedores.fetch.requisicoes).toHaveLength(1);
    expect(provedores.fetch.requisicoes[0]).toMatchObject({
      metodo: 'POST',
      caminho: '/contas/eu/exportacao',
      corpo: { senha: SENHA },
      cabecalhos: { authorization: `Bearer ${TOKEN}` },
    });
    expect(compartilhar).toHaveBeenCalledTimes(1);
    expect(compartilhar.mock.calls[0]?.[0]).toMatch(
      /^file:\/\/\/cache\/trampo-ja-meus-dados-\d{4}-\d{2}-\d{2}\.json$/,
    );
    expect(vistoPelaFolha.map((texto) => JSON.parse(texto ?? ''))).toEqual([
      EXPORTACAO,
    ]);
    expect(mockDisco.size).toBe(0);
    expect(result.current.sessao.status).toBe('autenticado');
  });

  it('nem a senha nem o JSON ficam no cache de mutações ou de consultas (CA24)', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exportacao', {
      corpo: EXPORTACAO,
    });
    const { result } = await montar(useExportarDados, provedores);

    await act(async () => {
      await result.current.dados.exportar(SENHA);
    });

    await esperarCacheDeMutacoesVazio(provedores);
    const caches = textoDosCaches(provedores);
    expect(caches).not.toContain(SENHA);
    expect(caches).not.toContain(SENTINELA_DO_JSON);
    expect(JSON.stringify(result.current.dados)).not.toContain(
      SENTINELA_DO_JSON,
    );
  });

  it('exportando vale true até a folha fechar', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exportacao', {
      corpo: EXPORTACAO,
    });
    let fecharFolha: () => void = () => undefined;
    compartilhar.mockImplementation(
      () =>
        new Promise<void>((resolver) => {
          fecharFolha = resolver;
        }),
    );
    const { result } = await montar(useExportarDados, provedores);
    expect(result.current.dados.exportando).toBe(false);

    let pedido: Promise<ResultadoDaExportacao> | undefined;
    await act(async () => {
      pedido = result.current.dados.exportar(SENHA);
    });
    await waitFor(() => expect(compartilhar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.dados.exportando).toBe(true));

    await act(async () => {
      fecharFolha();
      await pedido;
    });
    await waitFor(() => expect(result.current.dados.exportando).toBe(false));
  });

  it('sem folha no aparelho devolve indisponivel e não grava arquivo', async () => {
    disponivel.mockResolvedValue(false);
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exportacao', {
      corpo: EXPORTACAO,
    });
    const { result } = await montar(useExportarDados, provedores);

    let resultado: ResultadoDaExportacao | undefined;
    await act(async () => {
      resultado = await result.current.dados.exportar(SENHA);
    });

    expect(resultado).toEqual({ tipo: 'indisponivel' });
    expect(compartilhar).not.toHaveBeenCalled();
    expect(mockDisco.size).toBe(0);
  });

  it('quando a folha falha, devolve indisponivel e o arquivo é apagado', async () => {
    compartilhar.mockImplementation(async (uri: string) => {
      vistoPelaFolha.push(mockDisco.get(uri));
      throw new Error(`falha da folha em ${uri}`);
    });
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exportacao', {
      corpo: EXPORTACAO,
    });
    const { result } = await montar(useExportarDados, provedores);

    let resultado: ResultadoDaExportacao | undefined;
    await act(async () => {
      resultado = await result.current.dados.exportar(SENHA);
    });

    expect(resultado).toEqual({ tipo: 'indisponivel' });
    expect(vistoPelaFolha).toHaveLength(1);
    expect(mockDisco.size).toBe(0);
  });

  it.each([
    [
      '403 senha_incorreta',
      { status: 403, corpo: { erro: 'senha_incorreta' } },
      'senha_incorreta',
    ],
    [
      '429',
      { status: 429, corpo: { erro: 'muitas_requisicoes' } },
      'muitas_tentativas_acao',
    ],
    ['ErroDeRede', { falhaDeRede: true }, 'sem_conexao'],
    ['500', { status: 500 }, 'erro_servidor'],
    ['resposta sem formato', { corpo: { outra: 1 } }, 'erro_servidor'],
  ] as const)(
    '%s devolve erro cru, sem compartilhar nem guardar a senha',
    async (_nome, resposta, chave) => {
      const provedores = autenticado();
      provedores.fetch.responder('POST /contas/eu/exportacao', resposta);
      const { result } = await montar(useExportarDados, provedores);

      let resultado: ResultadoDaExportacao | undefined;
      await act(async () => {
        resultado = await result.current.dados.exportar(SENHA);
      });

      expect(resultado?.tipo).toBe('erro');
      const erro = resultado?.tipo === 'erro' ? resultado.erro : undefined;
      expect(chaveDoErro(erro, 'nenhum').geral).toBe(chave);
      expect(String(erro)).not.toContain(SENHA);
      expect(JSON.stringify(erro)).not.toContain(SENHA);
      expect(compartilhar).not.toHaveBeenCalled();
      expect(mockDisco.size).toBe(0);
      // Sem nova tentativa, mesmo com o padrão do QueryClient em 3.
      expect(provedores.fetch.requisicoes).toHaveLength(1);
      expect(result.current.sessao.status).toBe('autenticado');
      // O `reset()` do fim tira a senha (`variables`) também no erro.
      await esperarCacheDeMutacoesVazio(provedores);
    },
  );

  it('offline falha na hora com ErroDeRede, sem ficar pausada', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exportacao', {
      falhaDeRede: true,
    });
    const { result } = await montar(useExportarDados, provedores);
    await act(async () => onlineManager.setOnline(false));
    try {
      let resultado: ResultadoDaExportacao | undefined;
      await act(async () => {
        resultado = await result.current.dados.exportar(SENHA);
      });

      expect(resultado?.tipo).toBe('erro');
      expect(resultado?.tipo === 'erro' && resultado.erro).toBeInstanceOf(
        ErroDeRede,
      );
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
  });

  it('se a sessão mudou durante o POST, devolve descartada e não compartilha', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('POST /contas/eu/exportacao', {
        corpo: EXPORTACAO,
        demoraMs: 30,
      })
      .responder('DELETE /sessoes', { status: 204 });
    const { result } = await montar(useExportarDados, provedores);

    let pedido: Promise<ResultadoDaExportacao> | undefined;
    await act(async () => {
      pedido = result.current.dados.exportar(SENHA);
      await Promise.resolve();
    });
    await act(() => result.current.sessao.sair());
    let resultado: ResultadoDaExportacao | undefined;
    await act(async () => {
      resultado = await pedido;
    });

    expect(resultado).toEqual({ tipo: 'descartada' });
    expect(disponivel).not.toHaveBeenCalled();
    expect(compartilhar).not.toHaveBeenCalled();
    expect(mockDisco.size).toBe(0);
    await esperarCacheDeMutacoesVazio(provedores);
    expect(textoDosCaches(provedores)).not.toContain(SENTINELA_DO_JSON);
  });

  it('se a sessão mudou com a folha aberta, devolve descartada e apaga o arquivo', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('POST /contas/eu/exportacao', { corpo: EXPORTACAO })
      .responder('DELETE /sessoes', { status: 204 });
    let fecharFolha: () => void = () => undefined;
    compartilhar.mockImplementation(
      () =>
        new Promise<void>((resolver) => {
          fecharFolha = resolver;
        }),
    );
    const { result } = await montar(useExportarDados, provedores);

    let pedido: Promise<ResultadoDaExportacao> | undefined;
    await act(async () => {
      pedido = result.current.dados.exportar(SENHA);
    });
    await waitFor(() => expect(compartilhar).toHaveBeenCalledTimes(1));
    await act(() => result.current.sessao.sair());
    let resultado: ResultadoDaExportacao | undefined;
    await act(async () => {
      fecharFolha();
      resultado = await pedido;
    });

    expect(resultado).toEqual({ tipo: 'descartada' });
    expect(mockDisco.size).toBe(0);
  });

  it('se a sessão mudou durante um erro, devolve descartada', async () => {
    const provedores = autenticado();
    provedores.fetch
      .responder('POST /contas/eu/exportacao', {
        status: 403,
        corpo: { erro: 'senha_incorreta' },
        demoraMs: 30,
      })
      .responder('DELETE /sessoes', { status: 204 });
    const { result } = await montar(useExportarDados, provedores);

    let pedido: Promise<ResultadoDaExportacao> | undefined;
    await act(async () => {
      pedido = result.current.dados.exportar(SENHA);
      await Promise.resolve();
    });
    await act(() => result.current.sessao.sair());
    let resultado: ResultadoDaExportacao | undefined;
    await act(async () => {
      resultado = await pedido;
    });

    expect(resultado).toEqual({ tipo: 'descartada' });
    await waitFor(() => expect(result.current.dados.exportando).toBe(false));
  });

  it('toque duplo faz um POST só; a segunda chamada é descartada', async () => {
    const provedores = autenticado();
    provedores.fetch.responder('POST /contas/eu/exportacao', {
      corpo: EXPORTACAO,
      demoraMs: 20,
    });
    const { result } = await montar(useExportarDados, provedores);

    let resultados: ResultadoDaExportacao[] = [];
    await act(async () => {
      const { exportar } = result.current.dados;
      resultados = await Promise.all([exportar(SENHA), exportar(SENHA)]);
    });

    expect(resultados).toEqual([
      { tipo: 'compartilhado' },
      { tipo: 'descartada' },
    ]);
    expect(provedores.fetch.requisicoes).toHaveLength(1);
    expect(compartilhar).toHaveBeenCalledTimes(1);

    // Terminada a primeira, pode exportar de novo.
    await act(async () => {
      resultados = [await result.current.dados.exportar(SENHA)];
    });
    expect(resultados).toEqual([{ tipo: 'compartilhado' }]);
    expect(provedores.fetch.requisicoes).toHaveLength(2);
    await waitFor(() => expect(result.current.dados.exportando).toBe(false));
  });

  it('nada vai para o console, no sucesso nem nas falhas (CA24)', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (metodo) => jest.spyOn(console, metodo).mockImplementation(() => {}),
    );
    let chamadas: unknown[] = [];
    try {
      const provedores = autenticado();
      provedores.fetch
        .responder('POST /contas/eu/exportacao', [
          { corpo: EXPORTACAO },
          { status: 403, corpo: { erro: 'senha_incorreta' } },
          { corpo: EXPORTACAO },
        ])
        .responder('POST /contas/eu/exclusao', [
          { status: 403, corpo: { erro: 'senha_incorreta' } },
          { status: 204 },
        ]);
      const { result } = await montar(
        () => ({ exportacao: useExportarDados(), exclusao: useExcluirConta() }),
        provedores,
      );

      await act(async () => {
        await result.current.dados.exportacao.exportar(SENHA);
        await result.current.dados.exportacao.exportar(SENHA);
      });
      compartilhar.mockRejectedValueOnce(new Error('falha da folha'));
      await act(async () => {
        await result.current.dados.exportacao.exportar(SENHA);
      });
      await act(async () => {
        await result.current.dados.exclusao
          .mutateAsync(SENHA)
          .catch(() => undefined);
      });
      await act(async () => {
        await result.current.dados.exclusao.mutateAsync(SENHA);
      });
      await waitFor(() => expect(result.current.sessao.status).toBe('anonimo'));
      chamadas = espioes.flatMap((espiao) => espiao.mock.calls);
    } finally {
      for (const espiao of espioes) {
        espiao.mockRestore();
      }
    }
    expect(chamadas).toEqual([]);
  });
});
