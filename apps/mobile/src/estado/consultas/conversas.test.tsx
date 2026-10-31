import {
  focusManager,
  notifyManager,
  onlineManager,
  type QueryClient,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { criarCliente } from '../../api/cliente';
import { ErroDaApi, ErroDeRede } from '../../api/erros';
import type { Mensagem, ResumoDeConversa } from '../../api/tipos';
import type { RequisicaoFeita, RespostaFalsa } from '../../testes/fetch-falso';
import {
  criarProvedores as criarProvedoresBase,
  URL_BASE_DE_TESTE,
} from '../../testes/renderizar';
import {
  type ArmazenamentoEmMemoria,
  criarArmazenamentoEmMemoria,
} from '../armazenamento-token';
import { criarQueryClient } from '../cliente-de-consultas';
import { useSessao } from '../sessao';
import { TETO_DA_RECARGA_MS } from './anuncios';
import { chaves } from './chaves';
import {
  conferirDesde,
  cursorDaReleitura,
  FRESCOR_DA_LISTA_MS,
  INTERVALO_DA_LISTA_MS,
  INTERVALO_DO_POLLING_MS,
  intervaloDoPolling,
  JANELA_DE_RELEITURA_MS,
  mesclarPagina,
  PAGINA_DE_MENSAGENS,
  PAGINAS_POR_BUSCA,
  substituirCauda,
  TETO_DE_MENSAGENS_NO_CACHE,
  TETO_DO_POLLING_MS,
  useAbrirConversa,
  useConversas,
  useEnviarMensagem,
  useMensagens,
} from './conversas';

const TOKEN = 'token-da-sessao-123';
const TOKEN_NOVO = 'token-novo-456';
const CONVERSA = 'c1';
const CAMINHO_DAS_MENSAGENS = '/conversas/c1/mensagens';
const OUTRO = 'conta-outra';
const EU = 'conta-eu';
// Sentinelas genéricas no lugar do texto das mensagens (CA15).
const TEXTO_A = 'SENTINELA-TEXTO-A';
const TEXTO_B = 'SENTINELA-TEXTO-B';

const INICIO_MS = Date.parse('2026-10-21T10:00:00.000Z');
/**
 * Distância entre `mensagem(n)` e `mensagem(n + 1)`: mais que a janela de
 * releitura (D48), então o ciclo relê a partir da penúltima mensagem.
 */
const PASSO_MS = 2 * 60_000;

/** `enviadaEm` da posição `n` (aceita fração, para ficar entre duas). */
function instante(n: number): string {
  return new Date(INICIO_MS + n * PASSO_MS).toISOString();
}

function mensagem(
  n: number | string,
  autorId = OUTRO,
  enviadaEm = instante(typeof n === 'number' ? n : 0),
): Mensagem {
  return {
    id: `m${n}`,
    autorId,
    texto: `SENTINELA-TEXTO-${n}`,
    enviadaEm,
  };
}

function mensagens(de: number, ate: number): Mensagem[] {
  const lista: Mensagem[] = [];
  for (let n = de; n <= ate; n += 1) {
    lista.push(mensagem(n));
  }
  return lista;
}

function ids(lista: readonly Mensagem[] | null | undefined) {
  return (lista ?? []).map((m) => m.id);
}

function resumo(conversaId: string): ResumoDeConversa {
  return {
    conversaId,
    outroUsuarioId: OUTRO,
    criadaEm: '2026-10-21T09:00:00.000Z',
    ultimaMensagem: null,
  };
}

/**
 * Imita `GET /conversas/:id/mensagens` da API: até 50 por página, depois do
 * `depoisDe`; cursor desconhecido dá 400. `falha` responde no lugar de tudo.
 */
function criarServidorDeMensagens(inicial: readonly Mensagem[]) {
  const servidor = {
    mensagens: [...inicial],
    falha: null as RespostaFalsa | null,
    demoraMs: 0,
    responder(requisicao: RequisicaoFeita): RespostaFalsa {
      const demora =
        servidor.demoraMs > 0 ? { demoraMs: servidor.demoraMs } : {};
      if (servidor.falha !== null) {
        return { ...servidor.falha, ...demora };
      }
      const { depoisDe } = requisicao.query;
      let inicio = 0;
      if (depoisDe !== undefined) {
        const indice = servidor.mensagens.findIndex((m) => m.id === depoisDe);
        if (indice < 0) {
          return { status: 400, corpo: { erro: 'dados_invalidos' }, ...demora };
        }
        inicio = indice + 1;
      }
      return {
        corpo: servidor.mensagens.slice(inicio, inicio + PAGINA_DE_MENSAGENS),
        ...demora,
      };
    },
  };
  return servidor;
}

function criarProvedores(token: string | null = TOKEN) {
  const armazenamento = criarArmazenamentoEmMemoria(token);
  // O `QueryClient` do app (1 nova tentativa, dado fresco por 30 s): prova
  // que o polling sobrepõe esses padrões.
  const queryClient = criarQueryClient();
  clientes.push(queryClient);
  return {
    ...criarProvedoresBase({ armazenamento, queryClient }),
    armazenamento: armazenamento as ArmazenamentoEmMemoria,
  };
}

type Provedores = ReturnType<typeof criarProvedores>;

const clientes: QueryClient[] = [];
const montados: { unmount: () => Promise<void> }[] = [];
const METODOS_DO_CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;
let espioes: jest.SpyInstance[] = [];

beforeEach(() => {
  jest.useFakeTimers();
  // O TanStack avisa os componentes num `setTimeout(0)`, que o relógio falso
  // agenda 1 ms adiante no meio de uma volta. Numa microtarefa, o aviso sai
  // no mesmo instante da resposta, e os limites de tempo dos testes ficam
  // exatos.
  notifyManager.setScheduler((avisar) => {
    void Promise.resolve().then(avisar);
  });
  espioes = METODOS_DO_CONSOLE.map((metodo) =>
    jest.spyOn(console, metodo).mockImplementation(() => undefined),
  );
});

afterEach(async () => {
  // Desmonta a árvore e esvazia os caches antes de voltar aos timers reais:
  // nenhum intervalo do polling fica vivo depois do teste.
  for (const montado of montados.splice(0)) {
    await montado.unmount();
  }
  await act(async () => {
    onlineManager.setOnline(true);
    focusManager.setFocused(undefined);
    for (const cliente of clientes.splice(0)) {
      cliente.clear();
    }
    await jest.advanceTimersByTimeAsync(0);
  });
  jest.useRealTimers();
  notifyManager.setScheduler((avisar) => setTimeout(avisar, 0));
  const chamadas = espioes.flatMap((espiao) => espiao.mock.calls);
  jest.restoreAllMocks();
  // CA15: nenhum `console`, nem aviso de `act` do React.
  expect(chamadas).toEqual([]);
});

/**
 * Avança os timers falsos dentro do `act` e, sem mover o relógio, deixa
 * terminar o que a última volta disparou (a resposta do fetch falso).
 */
async function avancar(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
    await jest.advanceTimersByTimeAsync(0);
  });
}

/** Monta o hook (com a sessão ao lado) e espera a sessão carregar. */
async function montar<R, P>(
  hook: (props: P) => R,
  provedores: Provedores,
  initialProps: P,
) {
  const montado = await renderHook(
    (props: P) => ({ sessao: useSessao(), dados: hook(props) }),
    { wrapper: provedores.wrapper, initialProps },
  );
  montados.push(montado);
  await avancar(0);
  return montado;
}

interface PropsDeAtividade {
  readonly ativa: boolean;
}

/** `useMensagens(CONVERSA)` com `ativa` controlável por `rerender`. */
function montarMensagens(provedores: Provedores, ativa = true) {
  return montar(
    ({ ativa: a }: PropsDeAtividade) => useMensagens(CONVERSA, { ativa: a }),
    provedores,
    { ativa },
  );
}

/** O `depoisDe` de cada GET de mensagens feito (`null` sem cursor). */
function cursores(provedores: Provedores) {
  return provedores.fetch.requisicoes
    .filter((r) => r.metodo === 'GET' && r.caminho === CAMINHO_DAS_MENSAGENS)
    .map((r) => r.query.depoisDe ?? null);
}

function requisicoesPara(provedores: Provedores, rota: string) {
  return provedores.fetch.requisicoes.filter(
    (r) => `${r.metodo} ${r.caminho}` === rota,
  );
}

/** Polling com o servidor de mensagens ligado ao fetch falso. */
function comServidor(inicial: readonly Mensagem[], token?: string | null) {
  const provedores = criarProvedores(token);
  const servidor = criarServidorDeMensagens(inicial);
  provedores.fetch.responder(`GET ${CAMINHO_DAS_MENSAGENS}`, (r) =>
    servidor.responder(r),
  );
  return { provedores, servidor };
}

describe('chaves das conversas', () => {
  it('conversas() e mensagens(id)', () => {
    expect(chaves.conversas()).toEqual(['conversas']);
    expect(chaves.mensagens('c9')).toEqual(['mensagens', 'c9']);
  });
});

describe('intervaloDoPolling', () => {
  it.each([
    [0, 5_000],
    [1, 10_000],
    [2, 20_000],
    [3, 40_000],
    [4, 60_000],
    [10, 60_000],
    [5_000, 60_000],
    [-1, 5_000],
    [Number.NaN, 5_000],
  ])('%p falhas seguidas → %p ms', (falhas, esperado) => {
    expect(intervaloDoPolling(falhas)).toBe(esperado);
  });

  it('usa as constantes do plano', () => {
    expect(INTERVALO_DO_POLLING_MS).toBe(5_000);
    expect(TETO_DO_POLLING_MS).toBe(60_000);
    expect(INTERVALO_DA_LISTA_MS).toBe(30_000);
  });
});

describe('mesclarPagina', () => {
  it('acrescenta as novas no fim, na ordem da página', () => {
    expect(ids(mesclarPagina(mensagens(1, 2), mensagens(3, 4)))).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
    ]);
  });

  it('ignora id repetido, do cache ou da própria página', () => {
    const atuais = mensagens(1, 3);
    const novas = [mensagem(3), mensagem(4), mensagem(4), mensagem(2)];
    expect(ids(mesclarPagina(atuais, novas))).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('sem nada novo devolve a mesma lista', () => {
    const atuais = mensagens(1, 3);
    expect(mesclarPagina(atuais, [])).toBe(atuais);
    expect(mesclarPagina(atuais, [mensagem(2)])).toBe(atuais);
  });

  it(`guarda só as últimas ${TETO_DE_MENSAGENS_NO_CACHE} (S1)`, () => {
    expect(TETO_DE_MENSAGENS_NO_CACHE).toBe(500);
    const quaseCheia = mensagens(1, TETO_DE_MENSAGENS_NO_CACHE - 1);
    const cheia = mesclarPagina(quaseCheia, [
      mensagem(TETO_DE_MENSAGENS_NO_CACHE),
    ]);
    expect(ids(cheia)).toEqual(ids(mensagens(1, TETO_DE_MENSAGENS_NO_CACHE)));

    const passou = mesclarPagina(cheia, mensagens(501, 503));
    expect(passou).toHaveLength(TETO_DE_MENSAGENS_NO_CACHE);
    expect(ids(passou)).toEqual(ids(mensagens(4, 503)));
  });

  it('uma página maior que o teto fica só com o fim dela', () => {
    const novas = mensagens(1, TETO_DE_MENSAGENS_NO_CACHE + 50);
    const resultado = mesclarPagina(mensagens(-9, 0), novas);
    expect(ids(resultado)).toEqual(ids(mensagens(51, 550)));
  });
});

/** `n` mensagens do outro com o mesmo `enviadaEm` (todas na mesma janela). */
function rajada(de: number, ate: number): Mensagem[] {
  return mensagens(de, ate).map((m) => ({ ...m, enviadaEm: instante(0) }));
}

describe('cursorDaReleitura (D48)', () => {
  it('a janela é de 60 s', () => {
    expect(JANELA_DE_RELEITURA_MS).toBe(60_000);
  });

  it('sem mensagens, carga do começo', () => {
    expect(cursorDaReleitura([])).toBeNull();
  });

  it('é a última com enviadaEm até 60 s antes da última, inclusive no limite', () => {
    const ultima = Date.parse(instante(10));
    const em = (ms: number) => new Date(ultima - ms).toISOString();
    const lista = [
      mensagem('a', OUTRO, em(5 * 60_000)),
      mensagem('b', OUTRO, em(JANELA_DE_RELEITURA_MS)),
      mensagem('c', OUTRO, em(JANELA_DE_RELEITURA_MS - 1)),
      mensagem('d', OUTRO, em(0)),
    ];
    expect(cursorDaReleitura(lista)).toBe('mb');
    expect(cursorDaReleitura(lista.filter((m) => m.id !== 'mb'))).toBe('ma');
    expect(cursorDaReleitura(mensagens(1, 3))).toBe('m2');
  });

  it('nenhuma tão antiga e a lista abaixo do teto: carga do começo', () => {
    expect(cursorDaReleitura(rajada(1, 30))).toBeNull();
    expect(cursorDaReleitura([mensagem(1)])).toBeNull();
    expect(
      cursorDaReleitura(rajada(1, TETO_DE_MENSAGENS_NO_CACHE - 1)),
    ).toBeNull();
  });

  it('nenhuma tão antiga e a lista no teto: a primeira, nunca o começo da conversa', () => {
    expect(
      cursorDaReleitura(rajada(101, 100 + TETO_DE_MENSAGENS_NO_CACHE)),
    ).toBe('m101');
  });

  it('enviadaEm ilegível na última: o id dela, como antes da janela', () => {
    expect(cursorDaReleitura([mensagem(1), mensagem(2, OUTRO, 'ontem')])).toBe(
      'm2',
    );
  });
});

describe('substituirCauda (D48)', () => {
  it('troca o que vem depois do cursor pela resposta, na ordem da API', () => {
    const atrasada = mensagem('-atrasada', EU, instante(2.9));
    const resultado = substituirCauda(mensagens(1, 3), 'm2', [
      atrasada,
      mensagem(3),
      mensagem(4),
    ]);
    expect(ids(resultado)).toEqual(['m1', 'm2', 'm-atrasada', 'm3', 'm4']);
  });

  it('cursor null: a resposta é a conversa desde o começo e substitui tudo', () => {
    expect(
      ids(substituirCauda(mensagens(1, 3), null, [mensagem(1), mensagem(3)])),
    ).toEqual(['m1', 'm3']);
  });

  it('não repete id, nem do começo mantido nem da própria resposta', () => {
    const resultado = substituirCauda(mensagens(1, 3), 'm2', [
      mensagem(1),
      mensagem(3),
      mensagem(3),
      mensagem(4),
    ]);
    expect(ids(resultado)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('sem nada mudado devolve a mesma lista', () => {
    const atuais = mensagens(1, 3);
    expect(substituirCauda(atuais, 'm2', [mensagem(3)])).toBe(atuais);
    expect(substituirCauda(atuais, 'm3', [])).toBe(atuais);
    expect(substituirCauda(atuais, null, mensagens(1, 3))).toBe(atuais);
  });

  it('cursor fora da lista: só acrescenta, sem perder nada', () => {
    expect(
      ids(substituirCauda(mensagens(1, 3), 'm9', [mensagem(3), mensagem(4)])),
    ).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it(`guarda só as últimas ${TETO_DE_MENSAGENS_NO_CACHE} (S1)`, () => {
    const atuais = mensagens(1, TETO_DE_MENSAGENS_NO_CACHE);
    const resultado = substituirCauda(
      atuais,
      `m${TETO_DE_MENSAGENS_NO_CACHE - 1}`,
      mensagens(TETO_DE_MENSAGENS_NO_CACHE, TETO_DE_MENSAGENS_NO_CACHE + 3),
    );
    expect(resultado).toHaveLength(TETO_DE_MENSAGENS_NO_CACHE);
    expect(ids(resultado)).toEqual(
      ids(mensagens(4, TETO_DE_MENSAGENS_NO_CACHE + 3)),
    );
  });
});

describe('useMensagens: carga incremental e ciclo (CA12)', () => {
  it('carrega em 2 páginas (50 + 3) e depois relê a partir da penúltima (janela de 60 s)', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 53));
    const { result } = await montarMensagens(provedores);

    expect(cursores(provedores)).toEqual([null, 'm50']);
    expect(ids(result.current.dados.mensagens)).toEqual(ids(mensagens(1, 53)));
    expect(result.current.dados.erro).toBeNull();
    expect(provedores.fetch.ultima().cabecalhos.authorization).toBe(
      `Bearer ${TOKEN}`,
    );

    servidor.mensagens.push(mensagem(54, EU));
    await avancar(INTERVALO_DO_POLLING_MS);

    expect(cursores(provedores)).toEqual([null, 'm50', 'm52']);
    expect(ids(result.current.dados.mensagens).slice(-2)).toEqual([
      'm53',
      'm54',
    ]);
  });

  it('busca a cada 5 s, não antes', async () => {
    const { provedores } = comServidor(mensagens(1, 3));
    await montarMensagens(provedores);
    expect(cursores(provedores)).toEqual([null]);

    await avancar(INTERVALO_DO_POLLING_MS - 1);
    expect(cursores(provedores)).toEqual([null]);
    await avancar(1);
    expect(cursores(provedores)).toEqual([null, 'm2']);
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(cursores(provedores)).toEqual([null, 'm2', 'm2']);
  });

  it(`lê no máximo ${PAGINAS_POR_BUSCA} páginas por busca; o resto vem no ciclo seguinte`, async () => {
    const total = PAGINA_DE_MENSAGENS * PAGINAS_POR_BUSCA + 3;
    const { provedores } = comServidor(mensagens(1, total));
    const { result } = await montarMensagens(provedores);

    const lidas = PAGINA_DE_MENSAGENS * PAGINAS_POR_BUSCA;
    expect(cursores(provedores)).toHaveLength(PAGINAS_POR_BUSCA);
    // O cache fica no teto (S1), com as mais recentes das lidas.
    expect(ids(result.current.dados.mensagens).at(-1)).toBe(`m${lidas}`);
    expect(result.current.dados.mensagens).toHaveLength(
      Math.min(lidas, TETO_DE_MENSAGENS_NO_CACHE),
    );

    await avancar(INTERVALO_DO_POLLING_MS);

    expect(cursores(provedores).at(-1)).toBe(`m${lidas - 1}`);
    expect(ids(result.current.dados.mensagens).at(-1)).toBe(`m${total}`);
  });

  it(`o cache não passa de ${TETO_DE_MENSAGENS_NO_CACHE} mensagens e o ciclo relê a partir da penúltima (S1)`, async () => {
    const total = TETO_DE_MENSAGENS_NO_CACHE + 20;
    const { provedores, servidor } = comServidor(mensagens(1, total));
    const { result } = await montarMensagens(provedores);

    expect(ids(result.current.dados.mensagens)).toEqual(
      ids(mensagens(21, total)),
    );

    servidor.mensagens.push(mensagem(total + 1, EU));
    provedores.fetch.limparRequisicoes();
    await avancar(INTERVALO_DO_POLLING_MS);

    expect(cursores(provedores)).toEqual([`m${total - 1}`]);
    expect(ids(result.current.dados.mensagens)).toEqual(
      ids(mensagens(22, total + 1)),
    );
    expect(
      provedores.queryClient.getQueryData(chaves.mensagens(CONVERSA)),
    ).toHaveLength(TETO_DE_MENSAGENS_NO_CACHE);
  });

  it('com ativa: false não faz nenhum GET; ao ativar, busca na hora; ao desativar, para', async () => {
    const { provedores } = comServidor(mensagens(1, 3));
    const montado = await montarMensagens(provedores, false);

    await avancar(TETO_DO_POLLING_MS);
    expect(cursores(provedores)).toEqual([]);
    expect(montado.result.current.dados.mensagens).toBeNull();

    await montado.rerender({ ativa: true });
    await avancar(0);
    expect(cursores(provedores)).toEqual([null]);

    await montado.rerender({ ativa: false });
    await avancar(TETO_DO_POLLING_MS);
    expect(cursores(provedores)).toEqual([null]);
    // O que já veio continua na tela.
    expect(ids(montado.result.current.dados.mensagens)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('ao ganhar foco de novo logo depois, busca na hora (o dado nunca conta como fresco)', async () => {
    const { provedores } = comServidor(mensagens(1, 3));
    const montado = await montarMensagens(provedores);

    await montado.rerender({ ativa: false });
    await avancar(1_000);
    await montado.rerender({ ativa: true });
    await avancar(0);

    expect(cursores(provedores)).toEqual([null, 'm2']);
  });

  it('com o app em segundo plano (focusManager) não busca; ao voltar, busca na hora', async () => {
    const { provedores } = comServidor(mensagens(1, 3));
    await montarMensagens(provedores);

    await act(async () => focusManager.setFocused(false));
    await avancar(TETO_DO_POLLING_MS);
    expect(cursores(provedores)).toEqual([null]);

    await act(async () => focusManager.setFocused(true));
    await avancar(0);
    expect(cursores(provedores)).toEqual([null, 'm2']);
  });

  it('sem sessão autenticada não busca', async () => {
    const { provedores } = comServidor(mensagens(1, 3), null);
    const { result } = await montarMensagens(provedores);

    await avancar(TETO_DO_POLLING_MS);

    expect(result.current.sessao.status).toBe('anonimo');
    expect(provedores.fetch.requisicoes).toHaveLength(0);
  });
});

describe('useMensagens: releitura da janela (CA59, D48)', () => {
  it('a mensagem gravada depois de outra mais nova entra no ciclo seguinte, na posição da API e sem duplicata', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    const { result } = await montarMensagens(provedores);
    expect(ids(result.current.dados.mensagens)).toEqual(['m1', 'm2', 'm3']);

    // R2: o relógio deu a ela um instante anterior ao de m3, mas o insert
    // chegou depois de este aparelho ler m3. A API a lista antes de m3.
    servidor.mensagens.splice(2, 0, mensagem('-atrasada', EU, instante(2.9)));
    provedores.fetch.limparRequisicoes();
    await avancar(INTERVALO_DO_POLLING_MS);

    expect(cursores(provedores)).toEqual(['m2']);
    const lista = ids(result.current.dados.mensagens);
    expect(lista).toEqual(['m1', 'm2', 'm-atrasada', 'm3']);
    expect(new Set(lista).size).toBe(lista.length);

    // O ciclo seguinte relê de novo e não muda nada (nem a referência).
    const antes = result.current.dados.mensagens;
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(cursores(provedores)).toEqual(['m2', 'm2']);
    expect(result.current.dados.mensagens).toBe(antes);
  });

  it('com menos de 50 mensagens na janela, continua 1 GET por ciclo', async () => {
    const { provedores, servidor } = comServidor(rajada(1, 30));
    const { result } = await montarMensagens(provedores);
    expect(cursores(provedores)).toEqual([null]);

    servidor.mensagens.push({ ...mensagem(31), enviadaEm: instante(0) });
    for (let ciclo = 1; ciclo <= 3; ciclo += 1) {
      await avancar(INTERVALO_DO_POLLING_MS);
      expect(cursores(provedores)).toHaveLength(1 + ciclo);
    }
    // Todas na janela e a lista abaixo do teto: relê do começo.
    expect(cursores(provedores)).toEqual([null, null, null, null]);
    expect(ids(result.current.dados.mensagens)).toEqual(ids(rajada(1, 31)));
  });

  it(`no teto, com todas na janela, relê a partir da primeira em cache e nunca volta ao começo da conversa`, async () => {
    const total = PAGINA_DE_MENSAGENS * PAGINAS_POR_BUSCA + 3;
    const { provedores, servidor } = comServidor(rajada(1, total));
    const { result } = await montarMensagens(provedores);
    const lidas = PAGINA_DE_MENSAGENS * PAGINAS_POR_BUSCA;
    expect(ids(result.current.dados.mensagens)).toEqual(
      ids(rajada(lidas - TETO_DE_MENSAGENS_NO_CACHE + 1, lidas)),
    );

    provedores.fetch.limparRequisicoes();
    await avancar(INTERVALO_DO_POLLING_MS);
    const primeira = `m${lidas - TETO_DE_MENSAGENS_NO_CACHE + 1}`;
    expect(cursores(provedores)[0]).toBe(primeira);
    expect(cursores(provedores)).not.toContain(null);
    expect(ids(result.current.dados.mensagens)).toEqual(
      ids(rajada(total - TETO_DE_MENSAGENS_NO_CACHE + 1, total)),
    );

    servidor.mensagens.push({ ...mensagem(total + 1), enviadaEm: instante(0) });
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(ids(result.current.dados.mensagens)).toEqual(
      ids(rajada(total - TETO_DE_MENSAGENS_NO_CACHE + 2, total + 1)),
    );
    expect(
      provedores.queryClient.getQueryData(chaves.mensagens(CONVERSA)),
    ).toHaveLength(TETO_DE_MENSAGENS_NO_CACHE);
  });
});

describe('useMensagens: falhas e parada', () => {
  it('backoff de 10 s e 20 s em falhas seguidas (5xx e rede), sem nova tentativa, e zera no sucesso', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    const { result } = await montarMensagens(provedores);
    expect(result.current.dados.falhasSeguidas).toBe(0);

    servidor.falha = { status: 500, corpo: { erro: 'erro_interno' } };
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(cursores(provedores)).toHaveLength(2);
    expect(result.current.dados.erro).toBeInstanceOf(ErroDaApi);
    expect(result.current.dados.falhasSeguidas).toBe(1);
    // A mensagem que já veio fica.
    expect(ids(result.current.dados.mensagens)).toEqual(['m1', 'm2', 'm3']);

    servidor.falha = { falhaDeRede: true };
    await avancar(10_000 - 1);
    expect(cursores(provedores)).toHaveLength(2);
    await avancar(1);
    expect(cursores(provedores)).toHaveLength(3);
    expect(result.current.dados.erro).toBeInstanceOf(ErroDeRede);
    expect(result.current.dados.falhasSeguidas).toBe(2);

    servidor.falha = null;
    servidor.mensagens.push(mensagem(4));
    await avancar(20_000 - 1);
    expect(cursores(provedores)).toHaveLength(3);
    await avancar(1);
    expect(cursores(provedores)).toEqual([null, 'm2', 'm2', 'm2']);
    expect(result.current.dados.erro).toBeNull();
    expect(result.current.dados.falhasSeguidas).toBe(0);
    expect(ids(result.current.dados.mensagens)).toContain('m4');

    await avancar(INTERVALO_DO_POLLING_MS - 1);
    expect(cursores(provedores)).toHaveLength(4);
    await avancar(1);
    expect(cursores(provedores)).toEqual([null, 'm2', 'm2', 'm2', 'm3']);
  });

  it('404 para o ciclo e marca indisponivel, inclusive ao voltar ao app e à rede', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    const { result } = await montarMensagens(provedores);

    servidor.falha = { status: 404, corpo: { erro: 'nao_encontrado' } };
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(result.current.dados.indisponivel).toBe(true);
    expect((result.current.dados.erro as ErroDaApi).status).toBe(404);
    expect(result.current.dados.falhasSeguidas).toBe(0);

    await avancar(TETO_DO_POLLING_MS * 2);
    await act(async () => focusManager.setFocused(false));
    await act(async () => focusManager.setFocused(true));
    await act(async () => onlineManager.setOnline(false));
    await act(async () => onlineManager.setOnline(true));
    await avancar(TETO_DO_POLLING_MS);

    expect(cursores(provedores)).toEqual([null, 'm2']);
  });

  it('404 na primeira carga: sem mensagens, indisponivel e sem novo GET', async () => {
    const { provedores, servidor } = comServidor([]);
    servidor.falha = { status: 404, corpo: { erro: 'nao_encontrado' } };
    const { result } = await montarMensagens(provedores);

    expect(result.current.dados.indisponivel).toBe(true);
    expect(result.current.dados.mensagens).toBeNull();
    expect(result.current.dados.carregando).toBe(false);
    await avancar(TETO_DO_POLLING_MS * 2);
    expect(cursores(provedores)).toEqual([null]);
  });

  it.each([403])(
    '%p também para o ciclo, sem marcar indisponivel',
    async (status) => {
      const { provedores, servidor } = comServidor(mensagens(1, 3));
      const { result } = await montarMensagens(provedores);

      servidor.falha = { status, corpo: { erro: 'qualquer_codigo' } };
      await avancar(INTERVALO_DO_POLLING_MS);
      expect((result.current.dados.erro as ErroDaApi).status).toBe(status);
      expect(result.current.dados.indisponivel).toBe(false);

      await avancar(TETO_DO_POLLING_MS * 2);
      expect(cursores(provedores)).toHaveLength(2);
    },
  );

  it('429 (limite por conta, CA20) entra no backoff até 60 s sem parar o ciclo e zera no sucesso', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    const { result } = await montarMensagens(provedores);

    servidor.falha = { status: 429, corpo: { erro: 'muitas_requisicoes' } };
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(cursores(provedores)).toHaveLength(2);
    expect((result.current.dados.erro as ErroDaApi).status).toBe(429);
    expect(result.current.dados.indisponivel).toBe(false);
    expect(result.current.dados.falhasSeguidas).toBe(1);
    // A mensagem que já veio fica.
    expect(ids(result.current.dados.mensagens)).toEqual(['m1', 'm2', 'm3']);

    // 10 s, 20 s, 40 s e depois o teto de 60 s, sem nova tentativa no meio.
    const esperas = [10_000, 20_000, 40_000, TETO_DO_POLLING_MS];
    for (const [i, espera] of esperas.entries()) {
      await avancar(espera - 1);
      expect(cursores(provedores)).toHaveLength(2 + i);
      await avancar(1);
      expect(cursores(provedores)).toHaveLength(3 + i);
      expect(result.current.dados.falhasSeguidas).toBe(2 + i);
    }
    // Continua no teto.
    await avancar(TETO_DO_POLLING_MS - 1);
    expect(cursores(provedores)).toHaveLength(6);
    await avancar(1);
    expect(cursores(provedores)).toHaveLength(7);
    expect(result.current.dados.falhasSeguidas).toBe(6);

    servidor.falha = null;
    servidor.mensagens.push(mensagem(4));
    await avancar(TETO_DO_POLLING_MS);
    expect(cursores(provedores)).toHaveLength(8);
    expect(result.current.dados.erro).toBeNull();
    expect(result.current.dados.falhasSeguidas).toBe(0);
    expect(ids(result.current.dados.mensagens)).toContain('m4');

    await avancar(INTERVALO_DO_POLLING_MS);
    expect(cursores(provedores)).toHaveLength(9);
    expect(cursores(provedores).at(-1)).toBe('m3');
  });

  it('429 na primeira carga: sem indisponivel, e o ciclo segue até carregar', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    servidor.falha = { status: 429, corpo: { erro: 'muitas_requisicoes' } };
    const { result } = await montarMensagens(provedores);

    expect(result.current.dados.mensagens).toBeNull();
    expect((result.current.dados.erro as ErroDaApi).status).toBe(429);
    expect(result.current.dados.indisponivel).toBe(false);
    expect(result.current.dados.falhasSeguidas).toBe(1);

    servidor.falha = null;
    await avancar(intervaloDoPolling(1));
    expect(cursores(provedores)).toEqual([null, null]);
    expect(ids(result.current.dados.mensagens)).toEqual(['m1', 'm2', 'm3']);
    expect(result.current.dados.erro).toBeNull();
  });

  it('depois de um 429, voltar ao app e à rede busca de novo', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    await montarMensagens(provedores);

    servidor.falha = { status: 429, corpo: { erro: 'muitas_requisicoes' } };
    await avancar(INTERVALO_DO_POLLING_MS);
    expect(cursores(provedores)).toHaveLength(2);

    await act(async () => focusManager.setFocused(false));
    await act(async () => focusManager.setFocused(true));
    await avancar(0);
    expect(cursores(provedores)).toHaveLength(3);

    await act(async () => onlineManager.setOnline(false));
    await act(async () => onlineManager.setOnline(true));
    await avancar(0);
    expect(cursores(provedores)).toHaveLength(4);
  });

  it('401 expira a sessão pelo cliente, limpa o cache e para o ciclo', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    const { result } = await montarMensagens(provedores);

    servidor.falha = { status: 401, corpo: { erro: 'nao_autenticado' } };
    await avancar(INTERVALO_DO_POLLING_MS);

    expect(result.current.sessao.status).toBe('anonimo');
    expect(provedores.armazenamento.atual()).toBeNull();
    expect(result.current.dados.mensagens).toBeNull();
    expect(
      provedores.queryClient.getQueryData(chaves.mensagens(CONVERSA)),
    ).toBeUndefined();
    await avancar(TETO_DO_POLLING_MS * 2);
    expect(cursores(provedores)).toHaveLength(2);
  });

  it('400 no cursor refaz a carga do zero e troca a lista', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    const { result } = await montarMensagens(provedores);

    // O cursor do ciclo (m2, a penúltima) deixou de valer nesta conversa.
    servidor.mensagens = [mensagem(1), mensagem(4)];
    await avancar(INTERVALO_DO_POLLING_MS);

    expect(cursores(provedores)).toEqual([null, 'm2', null]);
    expect(ids(result.current.dados.mensagens)).toEqual(['m1', 'm4']);
    expect(result.current.dados.erro).toBeNull();

    await avancar(INTERVALO_DO_POLLING_MS);
    expect(cursores(provedores).at(-1)).toBe('m1');
  });

  it('400 no cursor refaz do zero uma vez só; o segundo 400 para o ciclo', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    const { result } = await montarMensagens(provedores);

    servidor.falha = { status: 400, corpo: { erro: 'dados_invalidos' } };
    await avancar(INTERVALO_DO_POLLING_MS);

    expect(cursores(provedores)).toEqual([null, 'm2', null]);
    expect((result.current.dados.erro as ErroDaApi).status).toBe(400);
    expect(ids(result.current.dados.mensagens)).toEqual(['m1', 'm2', 'm3']);
    await avancar(TETO_DO_POLLING_MS * 2);
    expect(cursores(provedores)).toHaveLength(3);
  });
});

describe('useMensagens: sessão e cache (CA14)', () => {
  it('a saída com a busca no ar não deixa mensagem no cache; a conta nova começa do zero', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    provedores.fetch.responder('DELETE /sessoes', { status: 204 });
    servidor.demoraMs = 1_000;
    const { result } = await montarMensagens(provedores);
    expect(cursores(provedores)).toEqual([null]);

    await act(() => result.current.sessao.sair());
    await avancar(1_000);

    expect(result.current.dados.mensagens).toBeNull();
    expect(
      provedores.queryClient.getQueryData(chaves.mensagens(CONVERSA)),
    ).toBeUndefined();
    await avancar(TETO_DO_POLLING_MS);
    expect(cursores(provedores)).toEqual([null]);

    servidor.demoraMs = 0;
    await act(() => result.current.sessao.entrar(TOKEN_NOVO));
    await avancar(0);

    expect(cursores(provedores)).toEqual([null, null]);
    expect(provedores.fetch.ultima().cabecalhos.authorization).toBe(
      `Bearer ${TOKEN_NOVO}`,
    );
    expect(ids(result.current.dados.mensagens)).toEqual(['m1', 'm2', 'm3']);
  });

  it('queryClient.clear() entre a 1ª e a 2ª página: não pede a 2ª nem grava a 1ª', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 53));
    servidor.demoraMs = 1_000;
    await montarMensagens(provedores);
    expect(cursores(provedores)).toEqual([null]);

    await act(async () => provedores.queryClient.clear());
    await avancar(1_000);

    expect(cursores(provedores)).toEqual([null]);
    expect(
      provedores.queryClient.getQueryData(chaves.mensagens(CONVERSA)),
    ).toBeUndefined();
  });
});

describe('useMensagens: recarregar', () => {
  it('busca as novas na hora e devolve a lista inteira', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    const { result } = await montarMensagens(provedores);
    servidor.mensagens.push(mensagem(4, EU));

    let lista: readonly Mensagem[] | null = null;
    await act(async () => {
      lista = await result.current.dados.recarregar();
    });

    expect(ids(lista)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(cursores(provedores)).toEqual([null, 'm2']);
  });

  it('devolve null quando a busca falha', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    const { result } = await montarMensagens(provedores);
    servidor.falha = { falhaDeRede: true };

    let lista: readonly Mensagem[] | null = [];
    await act(async () => {
      lista = await result.current.dados.recarregar();
    });

    expect(lista).toBeNull();
    expect(cursores(provedores)).toEqual([null, 'm2']);
  });

  it('sem conexão devolve null na hora, sem GET', async () => {
    const { provedores } = comServidor(mensagens(1, 3));
    const { result } = await montarMensagens(provedores);
    await act(async () => onlineManager.setOnline(false));

    let lista: readonly Mensagem[] | null = [];
    await act(async () => {
      lista = await result.current.dados.recarregar();
    });

    expect(lista).toBeNull();
    expect(cursores(provedores)).toEqual([null]);
  });
});

describe('conferirDesde (CA60)', () => {
  /** Lê do cache e devolve a referência, para provar que nada foi gravado. */
  function cache(provedores: Provedores) {
    return provedores.queryClient.getQueryData(chaves.mensagens(CONVERSA));
  }

  async function conferir(
    montado: Awaited<ReturnType<typeof montarMensagens>>,
    ancora: string | null,
  ) {
    let lista: readonly Mensagem[] | null | undefined;
    await act(async () => {
      lista = await montado.result.current.dados.conferirDesde(ancora);
    });
    return lista;
  }

  it('pagina a partir da âncora e devolve o que veio depois, sem tocar no cache', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    const montado = await montarMensagens(provedores, false);
    await montado.rerender({ ativa: true });
    await avancar(0);
    await montado.rerender({ ativa: false });
    const antes = cache(provedores);
    servidor.mensagens = mensagens(1, 120);
    provedores.fetch.limparRequisicoes();

    const lista = await conferir(montado, 'm10');

    expect(cursores(provedores)).toEqual(['m10', 'm60', 'm110']);
    expect(ids(lista)).toEqual(ids(mensagens(11, 120)));
    expect(cache(provedores)).toBe(antes);
    expect(ids(montado.result.current.dados.mensagens)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('âncora null confere desde o começo', async () => {
    const { provedores } = comServidor(mensagens(1, 3));
    const montado = await montarMensagens(provedores, false);

    expect(ids(await conferir(montado, null))).toEqual(['m1', 'm2', 'm3']);
    expect(cursores(provedores)).toEqual([null]);
    expect(cache(provedores)).toBeUndefined();
  });

  it(`lê no máximo ${PAGINAS_POR_BUSCA} páginas e, parando no teto com a última cheia, devolve null (S2, D21)`, async () => {
    const lidas = PAGINA_DE_MENSAGENS * PAGINAS_POR_BUSCA;
    // 1001 depois da âncora: a 1001ª nunca é lida nesta conferência.
    const { provedores } = comServidor(mensagens(1, lidas + 2));
    const montado = await montarMensagens(provedores, false);

    const lista = await conferir(montado, 'm1');

    expect(cursores(provedores)).toHaveLength(PAGINAS_POR_BUSCA);
    expect(lista).toBeNull();
  });

  it(`exatamente ${PAGINAS_POR_BUSCA} páginas cheias também devolvem null: não dá para saber se há mais`, async () => {
    const lidas = PAGINA_DE_MENSAGENS * PAGINAS_POR_BUSCA;
    const { provedores } = comServidor(mensagens(1, lidas + 1));
    const montado = await montarMensagens(provedores, false);

    expect(await conferir(montado, 'm1')).toBeNull();
    expect(cursores(provedores)).toHaveLength(PAGINAS_POR_BUSCA);
  });

  it(`a ${PAGINAS_POR_BUSCA}ª página incompleta encerra a conferência: devolve tudo o que leu`, async () => {
    const lidas = PAGINA_DE_MENSAGENS * PAGINAS_POR_BUSCA - 1;
    const { provedores } = comServidor(mensagens(1, lidas + 1));
    const montado = await montarMensagens(provedores, false);

    const lista = await conferir(montado, 'm1');

    expect(cursores(provedores)).toHaveLength(PAGINAS_POR_BUSCA);
    expect(ids(lista)).toEqual(ids(mensagens(2, lidas + 1)));
  });

  it.each<[string, RespostaFalsa]>([
    ['falha de rede', { falhaDeRede: true }],
    ['500', { status: 500, corpo: { erro: 'erro_interno' } }],
    [
      '400 (âncora que não vale mais)',
      { status: 400, corpo: { erro: 'dados_invalidos' } },
    ],
    ['404', { status: 404, corpo: { erro: 'nao_encontrado' } }],
  ])(
    '%s devolve null, sem lançar e sem tocar no cache',
    async (_nome, falha) => {
      const { provedores, servidor } = comServidor(mensagens(1, 3));
      const montado = await montarMensagens(provedores);
      const antes = cache(provedores);
      servidor.falha = falha;

      expect(await conferir(montado, 'm2')).toBeNull();
      expect(cache(provedores)).toBe(antes);
      expect(montado.result.current.dados.erro).toBeNull();
    },
  );

  it('a falha na 2ª página também devolve null', async () => {
    const { provedores } = comServidor(mensagens(1, 120));
    provedores.fetch.responder(`GET ${CAMINHO_DAS_MENSAGENS}?depoisDe=m50`, {
      status: 500,
      corpo: { erro: 'erro_interno' },
    });
    const montado = await montarMensagens(provedores, false);

    expect(await conferir(montado, null)).toBeNull();
    expect(cursores(provedores)).toEqual([null, 'm50']);
  });

  it('sem conexão devolve null na hora, sem GET', async () => {
    const { provedores } = comServidor(mensagens(1, 3));
    const montado = await montarMensagens(provedores, false);
    await act(async () => onlineManager.setOnline(false));

    expect(await conferir(montado, 'm1')).toBeNull();
    expect(cursores(provedores)).toEqual([]);
  });

  it('sem sessão devolve null, sem GET', async () => {
    const { provedores } = comServidor(mensagens(1, 3), null);
    const montado = await montarMensagens(provedores, false);

    expect(await conferir(montado, 'm1')).toBeNull();
    expect(provedores.fetch.requisicoes).toHaveLength(0);
  });

  it('se a sessão mudou no meio, devolve null e não pede a página seguinte', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 120));
    provedores.fetch.responder('DELETE /sessoes', { status: 204 });
    servidor.demoraMs = 1_000;
    const montado = await montarMensagens(provedores, false);

    let lista: readonly Mensagem[] | null | undefined;
    await act(async () => {
      void montado.result.current.dados.conferirDesde(null).then((r) => {
        lista = r;
      });
    });
    await act(() => montado.result.current.sessao.sair());
    await act(() => montado.result.current.sessao.entrar(TOKEN_NOVO));
    await avancar(1_000);
    await avancar(1_000);

    expect(lista).toBeNull();
    expect(cursores(provedores)).toEqual([null]);
  });

  it('a função pura para entre as páginas quando interrompida() vira', async () => {
    const { provedores } = comServidor(mensagens(1, 120));
    const cliente = criarCliente({
      fetch: provedores.fetch.fetch,
      urlBase: URL_BASE_DE_TESTE,
      obterToken: () => TOKEN,
      aoExpirar: () => undefined,
    });
    // Falso na 1ª página, verdadeiro depois da 2ª.
    let paginas = 0;
    const interrompida = () => {
      paginas += 1;
      return paginas > 1;
    };

    let lista: readonly Mensagem[] | null | undefined;
    await act(async () => {
      lista = await conferirDesde(cliente, CONVERSA, null, interrompida);
    });

    expect(lista).toBeNull();
    expect(cursores(provedores)).toEqual([null, 'm50']);
  });
});

describe('useConversas', () => {
  function montarLista(provedores: Provedores, ativa = true) {
    return montar(
      ({ ativa: a }: PropsDeAtividade) => useConversas({ ativa: a }),
      provedores,
      { ativa },
    );
  }

  function gets(provedores: Provedores) {
    return requisicoesPara(provedores, 'GET /conversas').length;
  }

  it('faz GET /conversas e, com a aba focada, recarrega a cada 30 s', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /conversas', { corpo: [resumo('c1')] });
    const { result } = await montarLista(provedores);

    expect(result.current.dados.conversas).toEqual([resumo('c1')]);
    expect(gets(provedores)).toBe(1);
    await avancar(INTERVALO_DA_LISTA_MS - 1);
    expect(gets(provedores)).toBe(1);
    await avancar(1);
    expect(gets(provedores)).toBe(2);
  });

  it('fora de foco não recarrega por tempo nem ao voltar ao app; ao voltar à aba com dado velho, recarrega', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /conversas', { corpo: [] });
    const montado = await montarLista(provedores);
    expect(gets(provedores)).toBe(1);

    await montado.rerender({ ativa: false });
    await avancar(INTERVALO_DA_LISTA_MS * 3);
    await act(async () => focusManager.setFocused(false));
    await act(async () => focusManager.setFocused(true));
    await avancar(0);
    expect(gets(provedores)).toBe(1);

    await montado.rerender({ ativa: true });
    await avancar(0);
    expect(gets(provedores)).toBe(2);
  });

  it(`ao voltar à aba com dado de menos de ${FRESCOR_DA_LISTA_MS} ms, não recarrega`, async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /conversas', { corpo: [] });
    const montado = await montarLista(provedores);

    await montado.rerender({ ativa: false });
    await avancar(FRESCOR_DA_LISTA_MS - 1_000);
    await montado.rerender({ ativa: true });
    await avancar(0);

    expect(gets(provedores)).toBe(1);
  });

  it('com o app em segundo plano não recarrega; ao voltar com dado velho, recarrega', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('GET /conversas', { corpo: [] });
    await montarLista(provedores);

    await act(async () => focusManager.setFocused(false));
    await avancar(INTERVALO_DA_LISTA_MS * 2);
    expect(gets(provedores)).toBe(1);

    await act(async () => focusManager.setFocused(true));
    await avancar(0);
    expect(gets(provedores)).toBe(2);
  });

  it('429 (limite por conta, CA20) não para o ciclo de 30 s nem apaga a lista em mãos', async () => {
    const provedores = criarProvedores();
    const limite = { status: 429, corpo: { erro: 'muitas_requisicoes' } };
    provedores.fetch.responder('GET /conversas', [
      limite,
      { corpo: [resumo('c1')] },
      limite,
      { corpo: [resumo('c1'), resumo('c2')] },
    ]);
    const { result } = await montarLista(provedores);

    // Sem nova tentativa imediata no 4xx: espera o ciclo.
    expect(gets(provedores)).toBe(1);
    expect(result.current.dados.conversas).toBeNull();
    expect((result.current.dados.erro as ErroDaApi).status).toBe(429);
    await avancar(INTERVALO_DA_LISTA_MS - 1);
    expect(gets(provedores)).toBe(1);
    await avancar(1);
    expect(gets(provedores)).toBe(2);
    expect(result.current.dados.conversas).toEqual([resumo('c1')]);
    expect(result.current.dados.erro).toBeNull();

    await avancar(INTERVALO_DA_LISTA_MS);
    expect(gets(provedores)).toBe(3);
    expect((result.current.dados.erro as ErroDaApi).status).toBe(429);
    expect(result.current.dados.conversas).toEqual([resumo('c1')]);

    await avancar(INTERVALO_DA_LISTA_MS);
    expect(gets(provedores)).toBe(4);
    expect(result.current.dados.erro).toBeNull();
    expect(result.current.dados.conversas).toHaveLength(2);
  });

  it('sem sessão autenticada não busca', async () => {
    const provedores = criarProvedores(null);
    const { result } = await montarLista(provedores);
    await avancar(INTERVALO_DA_LISTA_MS);

    expect(result.current.dados.conversas).toBeNull();
    expect(provedores.fetch.requisicoes).toHaveLength(0);
  });
});

describe('useAbrirConversa (CA13)', () => {
  /** A lista montada fora de foco (como a aba Conversas atrás de outra). */
  function montarAbertura(provedores: Provedores) {
    return montar(
      () => ({
        lista: useConversas({ ativa: false }),
        abertura: useAbrirConversa(),
      }),
      provedores,
      {},
    );
  }

  it('POST /conversas só com outroUsuarioId e espera a lista recarregar antes de devolver aberta', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('GET /conversas', [
        { corpo: [] },
        { corpo: [resumo('c1')], demoraMs: 1_000 },
      ])
      .responder('POST /conversas', {
        status: 201,
        corpo: { conversaId: 'c1' },
      });
    const { result } = await montarAbertura(provedores);
    expect(result.current.dados.lista.conversas).toEqual([]);

    let resultado: unknown;
    await act(async () => {
      void result.current.dados.abertura.abrir(OUTRO).then((r) => {
        resultado = r;
      });
    });
    await avancar(999);
    expect(resultado).toBeUndefined();
    expect(result.current.dados.abertura.abrindo).toBe(true);

    await avancar(1);
    expect(resultado).toEqual({ tipo: 'aberta', conversaId: 'c1' });
    expect(provedores.queryClient.getQueryData(chaves.conversas())).toEqual([
      resumo('c1'),
    ]);
    const [post] = requisicoesPara(provedores, 'POST /conversas');
    expect(post?.corpo).toEqual({ outroUsuarioId: OUTRO });
    expect(post?.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(result.current.dados.abertura.abrindo).toBe(false);
  });

  it(`a lista lenta segura a abertura por no máximo ${TETO_DA_RECARGA_MS} ms`, async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('GET /conversas', [
        { corpo: [] },
        { corpo: [resumo('c1')], demoraMs: 60_000 },
      ])
      .responder('POST /conversas', { corpo: { conversaId: 'c1' } });
    const { result } = await montarAbertura(provedores);

    let resultado: unknown;
    await act(async () => {
      void result.current.dados.abertura.abrir(OUTRO).then((r) => {
        resultado = r;
      });
    });
    await avancar(TETO_DA_RECARGA_MS - 1);
    expect(resultado).toBeUndefined();
    await avancar(1);

    expect(resultado).toEqual({ tipo: 'aberta', conversaId: 'c1' });
    expect(requisicoesPara(provedores, 'GET /conversas')).toHaveLength(2);
  });

  it.each([
    [403, 'sem_vinculo'],
    [409, 'conversa_consigo_mesmo'],
  ])(
    '%p %s volta como erro cru, sem invalidar nada',
    async (status, codigo) => {
      const provedores = criarProvedores();
      provedores.fetch.responder('POST /conversas', {
        status,
        corpo: { erro: codigo },
      });
      const { result } = await montarAbertura(provedores);
      const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

      let resultado: unknown;
      await act(async () => {
        resultado = await result.current.dados.abertura.abrir(OUTRO);
      });

      expect(resultado).toEqual({ tipo: 'erro', erro: expect.any(ErroDaApi) });
      const { erro } = resultado as { erro: ErroDaApi };
      expect(erro.status).toBe(status);
      expect(erro.codigo).toBe(codigo);
      expect(invalidar).not.toHaveBeenCalled();
      expect(requisicoesPara(provedores, 'POST /conversas')).toHaveLength(1);
    },
  );

  it('offline falha na hora com ErroDeRede e não fica pausada', async () => {
    const provedores = criarProvedores();
    provedores.fetch.responder('POST /conversas', { falhaDeRede: true });
    const { result } = await montarAbertura(provedores);
    await act(async () => onlineManager.setOnline(false));

    let resultado: unknown;
    await act(async () => {
      resultado = await result.current.dados.abertura.abrir(OUTRO);
    });

    expect(resultado).toEqual({ tipo: 'erro', erro: expect.any(ErroDeRede) });
    const [mutacao] = provedores.queryClient.getMutationCache().getAll();
    expect(mutacao?.state.isPaused).toBe(false);
    expect(mutacao?.state.status).toBe('error');
  });

  it('se a sessão mudou durante o POST, devolve descartada e não invalida nada', async () => {
    const provedores = criarProvedores();
    provedores.fetch
      .responder('POST /conversas', {
        corpo: { conversaId: 'c1' },
        demoraMs: 30,
      })
      .responder('DELETE /sessoes', { status: 204 });
    const { result } = await montarAbertura(provedores);
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    let resultado: unknown;
    await act(async () => {
      void result.current.dados.abertura.abrir(OUTRO).then((r) => {
        resultado = r;
      });
    });
    await act(() => result.current.sessao.sair());
    await act(() => result.current.sessao.entrar(TOKEN_NOVO));
    await avancar(30);

    expect(resultado).toEqual({ tipo: 'descartada' });
    expect(invalidar).not.toHaveBeenCalled();
    expect(requisicoesPara(provedores, 'POST /conversas')).toHaveLength(1);
  });
});

describe('useEnviarMensagem (CA12, CA15)', () => {
  function montarConversa(provedores: Provedores) {
    return montar(
      () => ({
        lista: useMensagens(CONVERSA, { ativa: true }),
        envio: useEnviarMensagem(CONVERSA),
      }),
      provedores,
      {},
    );
  }

  async function enviar(
    montado: Awaited<ReturnType<typeof montarConversa>>,
    texto: string,
  ) {
    let resultado: unknown;
    await act(async () => {
      resultado = await montado.result.current.dados.envio.enviar(texto);
    });
    return resultado;
  }

  it('envia só {texto}, devolve enviada e puxa um ciclo na hora com o cursor do GET, não o id do POST', async () => {
    const { provedores, servidor } = comServidor(mensagens(1, 3));
    provedores.fetch.responder(`POST ${CAMINHO_DAS_MENSAGENS}`, (r) => {
      // O outro mandou uma mensagem antes da nossa chegar ao servidor.
      servidor.mensagens.push(mensagem(4));
      servidor.mensagens.push(mensagem('-post', EU, instante(5)));
      expect(r.corpo).toEqual({ texto: TEXTO_A });
      return {
        status: 201,
        corpo: { id: 'm-post', enviadaEm: '2026-10-21T10:01:00.000Z' },
      };
    });
    const montado = await montarConversa(provedores);
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    const resultado = await enviar(montado, TEXTO_A);
    await avancar(0);

    expect(resultado).toEqual({
      tipo: 'enviada',
      id: 'm-post',
      enviadaEm: '2026-10-21T10:01:00.000Z',
    });
    expect(invalidar.mock.calls.map(([filtros]) => filtros)).toEqual([
      { queryKey: chaves.mensagens(CONVERSA), refetchType: 'active' },
      // A prévia da lista (Q2), sem esperar.
      { queryKey: chaves.conversas(), refetchType: 'active' },
    ]);
    // O ciclo veio na hora (sem esperar 5 s) e pediu a partir do cache do
    // GET (m2, a penúltima), não do id do POST.
    expect(cursores(provedores)).toEqual([null, 'm2']);
    expect(ids(montado.result.current.dados.lista.mensagens)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm-post',
    ]);
  });

  it('dois envios concorrentes resolvem cada um com o seu id', async () => {
    const { provedores } = comServidor(mensagens(1, 3));
    provedores.fetch.responder(`POST ${CAMINHO_DAS_MENSAGENS}`, (r) => {
      const primeiro = (r.corpo as { texto: string }).texto === TEXTO_A;
      return {
        status: 201,
        corpo: {
          id: primeiro ? 'm-a' : 'm-b',
          enviadaEm: '2026-10-21T10:01:00.000Z',
        },
        demoraMs: primeiro ? 50 : 10,
      };
    });
    const montado = await montarConversa(provedores);

    const resultados: unknown[] = [];
    await act(async () => {
      const { enviar: enviarTexto } = montado.result.current.dados.envio;
      void enviarTexto(TEXTO_A).then((r) => resultados.push(r));
      void enviarTexto(TEXTO_B).then((r) => resultados.push(r));
    });
    await avancar(50);

    expect(resultados).toEqual([
      expect.objectContaining({ tipo: 'enviada', id: 'm-b' }),
      expect.objectContaining({ tipo: 'enviada', id: 'm-a' }),
    ]);
  });

  it.each([
    [500, 'erro_interno'],
    [404, 'nao_encontrado'],
    [429, 'muitas_requisicoes'],
  ])(
    '%p volta como falhou com o erro cru, sem o texto e sem invalidar',
    async (status, codigo) => {
      const { provedores } = comServidor(mensagens(1, 3));
      provedores.fetch.responder(`POST ${CAMINHO_DAS_MENSAGENS}`, {
        status,
        corpo: { erro: codigo, texto: TEXTO_A },
      });
      const montado = await montarConversa(provedores);
      const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

      const resultado = await enviar(montado, TEXTO_A);

      expect(resultado).toEqual({
        tipo: 'falhou',
        erro: expect.any(ErroDaApi),
      });
      const { erro } = resultado as { erro: ErroDaApi };
      expect(erro.status).toBe(status);
      expect(erro.codigo).toBe(codigo);
      const visivel = `${String(erro)} ${erro.message} ${JSON.stringify(erro)}`;
      expect(visivel).not.toContain(TEXTO_A);
      expect(invalidar).not.toHaveBeenCalled();
    },
  );

  it('offline falha na hora com ErroDeRede, sem fila nem nova tentativa', async () => {
    const { provedores } = comServidor(mensagens(1, 3));
    provedores.fetch.responder(`POST ${CAMINHO_DAS_MENSAGENS}`, {
      falhaDeRede: true,
    });
    const montado = await montarConversa(provedores);
    await act(async () => onlineManager.setOnline(false));

    const resultado = await enviar(montado, TEXTO_A);

    expect(resultado).toEqual({ tipo: 'falhou', erro: expect.any(ErroDeRede) });
    const [mutacao] = provedores.queryClient.getMutationCache().getAll();
    expect(mutacao?.state.isPaused).toBe(false);
    await act(async () => onlineManager.setOnline(true));
    await avancar(TETO_DO_POLLING_MS);
    expect(
      requisicoesPara(provedores, `POST ${CAMINHO_DAS_MENSAGENS}`),
    ).toHaveLength(1);
  });

  it('se a sessão mudou durante o POST, devolve descartada e não invalida nada', async () => {
    const { provedores } = comServidor(mensagens(1, 3));
    provedores.fetch
      .responder(`POST ${CAMINHO_DAS_MENSAGENS}`, {
        status: 201,
        corpo: { id: 'm-post', enviadaEm: '2026-10-21T10:01:00.000Z' },
        demoraMs: 30,
      })
      .responder('DELETE /sessoes', { status: 204 });
    const montado = await montarConversa(provedores);
    const invalidar = jest.spyOn(provedores.queryClient, 'invalidateQueries');

    let resultado: unknown;
    await act(async () => {
      void montado.result.current.dados.envio.enviar(TEXTO_A).then((r) => {
        resultado = r;
      });
    });
    await act(() => montado.result.current.sessao.sair());
    await act(() => montado.result.current.sessao.entrar(TOKEN_NOVO));
    await avancar(30);

    expect(resultado).toEqual({ tipo: 'descartada' });
    expect(invalidar).not.toHaveBeenCalled();
  });
});
