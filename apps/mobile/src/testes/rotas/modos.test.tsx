import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import {
  type ArmazenamentoDoModoEmMemoria,
  criarArmazenamentoDoModoEmMemoria,
  type Modo,
} from '../../estado/modo';
import { toqueMinimo } from '../../tema/tokens';
import { textos } from '../../textos/pt-BR';
import type { FetchFalso } from '../fetch-falso';
import { fakeComCategorias, ROTAS_REAIS } from '../qa/apoio-qa';
import { renderizarRotas, TOKEN_DE_TESTE } from './apoio';

// Navegação por modo (ADR-010): abas por modo, troca pelo Perfil e pelo
// Cadastro, o link que vence, Meus trampos, Demandas, Perfil e Buscar.

const PERFIL = {
  contaId: 'conta-eu',
  nome: 'Maria Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

const ABAS_DO_FREELA = [
  textos.abas.inicio,
  textos.abas.meusTrampos,
  textos.abas.conversas,
  textos.abas.perfil,
];

const ABAS_DO_CONTRATANTE = [
  textos.abas.inicio,
  textos.abas.demandas,
  textos.abas.buscar,
  textos.abas.mensagens,
  textos.abas.perfil,
];

const TODOS_OS_ROTULOS: readonly string[] = [
  ...new Set([...ABAS_DO_FREELA, ...ABAS_DO_CONTRATANTE, textos.abas.publicar]),
];

/** Meio-dia UTC: a data local é a mesma em qualquer fuso do Brasil. */
function trampo(
  id: string,
  status: 'aberto' | 'em_andamento' | 'encerrado',
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    autorId: 'conta-autor',
    titulo: `Trampo ${id}`,
    descricao: 'Descrição.',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 15000,
    prazo: null,
    status,
    criadoEm: '2026-10-20T12:00:00.000Z',
    ...extra,
  };
}

function candidatura(
  id: string,
  trampoId: string,
  status: 'pendente' | 'aceita' | 'recusada',
  criadaEm = '2026-10-20T12:00:00.000Z',
) {
  return {
    id,
    trampoId,
    freelancerId: 'conta-eu',
    mensagem: null,
    valorPropostoCentavos: 12000,
    status,
    criadaEm,
  };
}

function fake(): FetchFalso {
  return fakeComCategorias()
    .responder('GET /perfis/eu', { corpo: PERFIL })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('GET /trampos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', { corpo: [] })
    .responder('GET /conversas', { corpo: [] });
}

interface OpcoesDeAbrir {
  readonly modo?: Modo | null;
  readonly fetch?: FetchFalso;
  readonly armazenamentoDoModo?: ArmazenamentoDoModoEmMemoria;
  readonly token?: string | null;
}

async function abrir(
  url: string,
  {
    modo = null,
    fetch = fake(),
    armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria(modo),
    token = TOKEN_DE_TESTE,
  }: OpcoesDeAbrir = {},
) {
  const resultado = await renderizarRotas(ROTAS_REAIS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(token ?? undefined),
    armazenamentoDoModo,
  });
  return { ...resultado, fetch };
}

/** Os rótulos das abas visíveis, na ordem da barra. */
function abasNaBarra(): string[] {
  return screen
    .queryAllByRole('button')
    .map((b) => b.props.accessibilityLabel as string | undefined)
    .filter(
      (nome): nome is string =>
        nome !== undefined && TODOS_OS_ROTULOS.includes(nome),
    );
}

/** Nenhuma troca de modo chama a API para gravar nada (CA75). */
function escritas(fetch: FetchFalso) {
  return fetch.requisicoes.filter((r) => r.metodo !== 'GET');
}

function chamadas(fetch: FetchFalso, caminho: string) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === 'GET' && r.caminho === caminho,
  );
}

describe('CA76: abas por modo', () => {
  it('sem modo gravado abre no freela: Início, Meus trampos, Conversas e Perfil', async () => {
    const { armazenamentoDoModo } = await abrir('/');

    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_FREELA));
    // Nada foi gravado: o padrão vale só na memória (CA75).
    expect(armazenamentoDoModo.atual()).toBeNull();
  });

  it('modo gravado inválido também abre no freela', async () => {
    const armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria();
    jest
      .spyOn(armazenamentoDoModo, 'ler')
      .mockResolvedValue('outro' as unknown as Modo);
    await abrir('/', { armazenamentoDoModo });

    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_FREELA));
  });

  it('contratante: Início, Demandas, Buscar, Mensagens e Perfil', async () => {
    await abrir('/', { modo: 'contratante' });

    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE));
  });

  it.each([
    ['freela', ABAS_DO_FREELA],
    ['contratante', ABAS_DO_CONTRATANTE],
  ] as const)(
    '%s: não há aba Publicar, e cada aba tem nome acessível e alvo de 48',
    async (modo, rotulos) => {
      await abrir('/', { modo });
      await waitFor(() => expect(abasNaBarra()).toEqual(rotulos));

      expect(
        screen.queryByRole('button', { name: textos.abas.publicar }),
      ).toBeNull();
      for (const rotulo of rotulos) {
        // O alvo é o item da barra, que envolve o botão da aba.
        const item = screen.getByRole('button', { name: rotulo }).parent;
        const estilo = StyleSheet.flatten(item?.props.style) ?? {};
        expect(estilo.minHeight).toBeGreaterThanOrEqual(toqueMinimo);
      }
    },
  );

  it('tocar em cada aba do contratante abre a rota dela', async () => {
    await abrir('/', { modo: 'contratante' });
    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE));

    const destinos: [string, string][] = [
      [textos.abas.demandas, '/demandas'],
      [textos.abas.buscar, '/buscar'],
      [textos.abas.mensagens, '/conversas'],
      [textos.abas.perfil, '/perfil'],
      [textos.abas.inicio, '/'],
    ];
    for (const [rotulo, caminho] of destinos) {
      await fireEvent.press(screen.getByRole('button', { name: rotulo }));
      await waitFor(() => expect(screen).toHavePathname(caminho));
    }
    expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE);
  });
});

describe('CA75: troca de modo', () => {
  it('o cartão no Perfil do freela troca as abas na hora, vai ao Início e persiste ao reabrir, sem API', async () => {
    const armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria();
    const { fetch } = await abrir('/perfil', { armazenamentoDoModo });
    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_FREELA));

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.modo.trocarParaContratante,
      }),
    );

    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE));
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(
      await screen.findByText(textos.inicioContratante.precisa),
    ).toBeOnTheScreen();
    await waitFor(() =>
      expect(armazenamentoDoModo.atual()).toBe('contratante'),
    );
    expect(escritas(fetch)).toEqual([]);
  });

  it('reabrir o app depois da troca volta no modo gravado', async () => {
    // O aparelho guardou o modo de uma troca anterior.
    const armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria();
    await armazenamentoDoModo.gravar('contratante');

    await abrir('/', { armazenamentoDoModo });

    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE));
    expect(
      await screen.findByText(textos.inicioContratante.precisa),
    ).toBeOnTheScreen();
  });

  it('o cartão no Perfil da empresa volta ao modo freela', async () => {
    const armazenamentoDoModo =
      criarArmazenamentoDoModoEmMemoria('contratante');
    const { fetch } = await abrir('/perfil', { armazenamentoDoModo });
    expect(
      await screen.findByText(textos.perfil.tituloEmpresa),
    ).toBeOnTheScreen();

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.modo.trocarParaFreela }),
    );

    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_FREELA));
    await waitFor(() => expect(screen).toHavePathname('/'));
    await waitFor(() => expect(armazenamentoDoModo.atual()).toBe('freela'));
    expect(escritas(fetch)).toEqual([]);
  });

  it.each([
    [textos.cadastro.querContratar, 'contratante'],
    [textos.cadastro.querTrampar, 'freela'],
  ] as const)(
    'o Cadastro grava o objetivo "%s" como modo, sem API, e a conta abre nele',
    async (objetivo, modo) => {
      const fetch = fake().responder('POST /contas', {
        status: 201,
        corpo: { token: 'token-novo' },
      });
      const { armazenamentoDoModo } = await abrir('/cadastro', {
        fetch,
        token: null,
      });

      // Sem objetivo, "Criar conta" não envia nada.
      await fireEvent.changeText(
        await screen.findByLabelText(textos.cadastro.email),
        'nova@exemplo.com',
      );
      await fireEvent.changeText(
        screen.getByLabelText(textos.cadastro.senha),
        'senha-boa-123',
      );
      await fireEvent.press(
        screen.getByRole('button', { name: textos.cadastro.criarConta }),
      );
      expect(screen.getByText(textos.cadastro.escolhaObjetivo)).toBeTruthy();
      expect(escritas(fetch)).toEqual([]);

      await fireEvent.press(screen.getByRole('radio', { name: objetivo }));
      await waitFor(() => expect(armazenamentoDoModo.atual()).toBe(modo));
      expect(escritas(fetch)).toEqual([]);

      await fireEvent.press(
        screen.getByRole('button', { name: textos.cadastro.criarConta }),
      );
      await waitFor(() => expect(screen).toHavePathname('/perfil/editar'));
      // Só o cadastro foi para a API; o modo, não.
      expect(escritas(fetch).map((r) => r.caminho)).toEqual(['/contas']);
      expect(JSON.stringify(escritas(fetch)[0]?.corpo)).not.toContain(modo);
      expect(armazenamentoDoModo.atual()).toBe(modo);
    },
  );
});

describe('CA77: links', () => {
  it.each([
    ['/meus-trampos', 'contratante', 'freela', ABAS_DO_FREELA],
    ['/demandas', 'freela', 'contratante', ABAS_DO_CONTRATANTE],
    ['/buscar', 'freela', 'contratante', ABAS_DO_CONTRATANTE],
  ] as const)(
    'a aba exclusiva %s aberta no modo %s troca para %s e abre a aba',
    async (url, modoInicial, modoFinal, abas) => {
      const { armazenamentoDoModo, fetch } = await abrir(url, {
        modo: modoInicial,
      });

      await waitFor(() => expect(abasNaBarra()).toEqual(abas));
      expect(screen).toHavePathname(url);
      await waitFor(() => expect(armazenamentoDoModo.atual()).toBe(modoFinal));
      expect(escritas(fetch)).toEqual([]);
    },
  );

  const ROTAS_DE_PILHA = [
    '/trampos/t1',
    '/servicos/s1',
    '/conversas/c1',
    '/perfis/conta-x',
    '/candidaturas/t1',
  ];
  it.each(
    ROTAS_DE_PILHA.flatMap((url) =>
      (['freela', 'contratante'] as const).map((modo) => [url, modo] as const),
    ),
  )('%s abre no modo %s sem trocar o modo', async (url, modo) => {
    const armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria(modo);
    await abrir(url, { armazenamentoDoModo });

    await waitFor(() => expect(screen).toHavePathname(url));
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(armazenamentoDoModo.atual()).toBe(modo);
  });

  it.each([
    ['/publicar', '/trampos/novo'],
    ['/candidaturas', '/meus-trampos'],
    ['/meus-anuncios', '/demandas'],
    ['/meus-anuncios?tipo=trampo', '/demandas'],
  ])('%s leva a %s', async (url, destino) => {
    await abrir(url, { modo: 'contratante' });

    await waitFor(() => expect(screen).toHavePathname(destino));
  });

  it('/meus-anuncios?tipo=servico continua em Meus serviços, sem trocar o modo', async () => {
    const fetch = fake().responder('GET /servicos/meus', { corpo: [] });
    const { armazenamentoDoModo } = await abrir('/meus-anuncios?tipo=servico', {
      fetch,
    });

    expect(
      await screen.findByText(textos.meusAnuncios.tituloServicos),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/meus-anuncios');
    expect(armazenamentoDoModo.atual()).toBeNull();
  });
});

describe('CA78: Meus trampos', () => {
  function fakeDeMeusTrampos() {
    return fake()
      .responder('GET /candidaturas/minhas', {
        corpo: [
          candidatura('c1', 't1', 'pendente', '2026-10-24T12:00:00.000Z'),
          candidatura('c2', 't2', 'aceita', '2026-10-23T12:00:00.000Z'),
          candidatura('c3', 't3', 'aceita', '2026-10-22T12:00:00.000Z'),
          candidatura('c4', 't4', 'recusada', '2026-10-21T12:00:00.000Z'),
        ],
      })
      .responder('GET /trampos/t1', {
        corpo: trampo('t1', 'aberto', { prazo: '2026-12-31' }),
      })
      .responder('GET /trampos/t2', { corpo: trampo('t2', 'em_andamento') })
      .responder('GET /trampos/t3', { corpo: trampo('t3', 'encerrado') })
      .responder('GET /trampos/t4', { corpo: trampo('t4', 'em_andamento') })
      .responder('GET /perfis/conta-autor', {
        corpo: { ...PERFIL, contaId: 'conta-autor', nome: 'Padaria Sol' },
      });
  }

  it('cada candidatura cai em exatamente um segmento, com autor e prazo do cache', async () => {
    const fetch = fakeDeMeusTrampos();
    await abrir('/meus-trampos', { fetch });

    // Em análise: só a pendente, com o autor e o prazo do trampo.
    expect(await screen.findByText('Trampo t1')).toBeOnTheScreen();
    expect(await screen.findByText(/Padaria Sol/)).toBeOnTheScreen();
    expect(screen.getByText(/31\/12\/2026/)).toBeOnTheScreen();
    expect(screen.queryByText('Trampo t2')).toBeNull();
    expect(screen.queryByText('Trampo t3')).toBeNull();
    expect(screen.queryByText('Trampo t4')).toBeNull();

    // Confirmados: aceita com trampo em andamento.
    await fireEvent.press(
      screen.getByRole('tab', {
        name: new RegExp(textos.meusTrampos.abaConfirmados),
      }),
    );
    expect(await screen.findByText('Trampo t2')).toBeOnTheScreen();
    expect(screen.queryByText('Trampo t1')).toBeNull();
    expect(screen.queryByText('Trampo t3')).toBeNull();
    expect(screen.queryByText('Trampo t4')).toBeNull();

    // Encerrados: recusada, e aceita com trampo encerrado.
    await fireEvent.press(
      screen.getByRole('tab', { name: textos.meusTrampos.abaEncerrados }),
    );
    expect(await screen.findByText('Trampo t3')).toBeOnTheScreen();
    expect(screen.getByText('Trampo t4')).toBeOnTheScreen();
    expect(screen.queryByText('Trampo t1')).toBeNull();
    expect(screen.queryByText('Trampo t2')).toBeNull();

    // Uma leitura de cada recurso: as listas e o autor repetido vêm do cache.
    expect(chamadas(fetch, '/candidaturas/minhas')).toHaveLength(1);
    expect(chamadas(fetch, '/perfis/conta-autor')).toHaveLength(1);
    for (const id of ['t1', 't2', 't3', 't4']) {
      expect(chamadas(fetch, `/trampos/${id}`)).toHaveLength(1);
    }
  });

  it('"Mensagem" na candidatura confirmada abre a conversa com o autor do trampo', async () => {
    const fetch = fakeDeMeusTrampos().responder('POST /conversas', {
      status: 201,
      corpo: { conversaId: 'conversa-1' },
    });
    await abrir('/meus-trampos', { fetch });
    await screen.findByText('Trampo t1');
    await fireEvent.press(
      screen.getByRole('tab', {
        name: new RegExp(textos.meusTrampos.abaConfirmados),
      }),
    );
    await screen.findByText('Trampo t2');

    await fireEvent.press(
      await screen.findByRole('button', { name: /Mensagem/ }),
    );

    await waitFor(() => expect(screen).toHavePathname('/conversas/conversa-1'));
    const posts = fetch.requisicoes.filter(
      (r) => r.metodo === 'POST' && r.caminho === '/conversas',
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]?.corpo).toEqual({ outroUsuarioId: 'conta-autor' });
  });

  it('"Ver trampos" do vazio abre a busca de trampos do freela', async () => {
    await abrir('/meus-trampos');

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.meusTrampos.verTrampos,
      }),
    );

    await waitFor(() => expect(screen).toHavePathname('/buscar-trampos'));
    expect(
      await screen.findByText(textos.buscar.tituloTrampos),
    ).toBeOnTheScreen();
  });
});

describe('CA79: Demandas', () => {
  const TRAMPOS = [
    trampo('t1', 'aberto', { candidaturasRecebidas: 2 }),
    trampo('t2', 'em_andamento', { criadoEm: '2026-10-19T12:00:00.000Z' }),
    trampo('t3', 'encerrado', { criadoEm: '2026-10-18T12:00:00.000Z' }),
  ];

  it('as abas filtram as páginas carregadas de /trampos/meus pelo status', async () => {
    const fetch = fake().responder('GET /trampos/meus', { corpo: TRAMPOS });
    await abrir('/demandas', { modo: 'contratante', fetch });

    expect(await screen.findByText('Trampo t1')).toBeOnTheScreen();
    expect(
      screen.getByText(textos.inicioContratante.interessados(2)),
    ).toBeTruthy();
    expect(screen.queryByText('Trampo t2')).toBeNull();
    expect(screen.queryByText('Trampo t3')).toBeNull();

    await fireEvent.press(
      screen.getByRole('tab', { name: textos.demandas.abaAndamento }),
    );
    expect(await screen.findByText('Trampo t2')).toBeOnTheScreen();
    expect(screen.queryByText('Trampo t1')).toBeNull();

    await fireEvent.press(
      screen.getByRole('tab', { name: textos.demandas.abaEncerradas }),
    );
    expect(await screen.findByText('Trampo t3')).toBeOnTheScreen();
    expect(screen.queryByText('Trampo t2')).toBeNull();

    // A troca de aba não pede a lista de novo.
    expect(chamadas(fetch, '/trampos/meus')).toHaveLength(1);
  });

  it('"Carregar mais" fica visível em toda aba enquanto houver página', async () => {
    const pagina = Array.from({ length: 21 }, (_, i) =>
      trampo(`p${i}`, 'aberto', {
        criadoEm: `2026-10-${String(28 - i).padStart(2, '0')}T12:00:00.000Z`,
      }),
    );
    const fetch = fake().responder('GET /trampos/meus', { corpo: pagina });
    await abrir('/demandas', { modo: 'contratante', fetch });
    await screen.findByText('Trampo p0');

    for (const aba of [
      textos.demandas.abaAndamento,
      textos.demandas.abaEncerradas,
      textos.demandas.abaAbertas,
    ]) {
      await fireEvent.press(screen.getByRole('tab', { name: aba }));
      expect(
        screen.getByRole('button', { name: textos.gerais.carregarMais }),
      ).toBeOnTheScreen();
    }
  });

  it('o "+" abre /trampos/novo', async () => {
    await abrir('/demandas', { modo: 'contratante' });

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.demandas.nova }),
    );

    await waitFor(() => expect(screen).toHavePathname('/trampos/novo'));
  });
});

describe('CA82 (rota): Início do contratante', () => {
  it('mostra só as demandas abertas de /trampos/meus e "+" abre /trampos/novo', async () => {
    const fetch = fake().responder('GET /trampos/meus', {
      corpo: [
        trampo('t1', 'aberto', { candidaturasRecebidas: 3 }),
        trampo('t2', 'em_andamento'),
      ],
    });
    await abrir('/', { modo: 'contratante', fetch });

    expect(await screen.findByText('Trampo t1')).toBeOnTheScreen();
    expect(
      screen.getByText(textos.inicioContratante.interessados(3)),
    ).toBeTruthy();
    expect(screen.queryByText('Trampo t2')).toBeNull();
    // O Início do contratante não pede os recentes do freela.
    expect(chamadas(fetch, '/busca')).toHaveLength(0);

    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.inicioContratante.novaDemanda,
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/trampos/novo'));
  });
});

describe('CA83: Perfil por modo', () => {
  it('freela: cartão de modo, números de /candidaturas/minhas e só as linhas do freela', async () => {
    const fetch = fake().responder('GET /candidaturas/minhas', {
      corpo: [
        candidatura('c1', 't1', 'pendente'),
        candidatura('c2', 't2', 'aceita'),
        candidatura('c3', 't3', 'recusada'),
      ],
    });
    await abrir('/perfil', { fetch });

    expect(
      await screen.findByText(textos.perfil.candidaturasEnviadas(3)),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.perfil.confirmadas(1))).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.modo.trocarParaContratante }),
    ).toBeOnTheScreen();
    for (const nome of [
      textos.perfil.editar,
      textos.perfil.meusServicos,
      textos.perfil.contaEPrivacidade,
      textos.perfil.sair,
    ]) {
      expect(screen.getByRole('button', { name: nome })).toBeOnTheScreen();
    }
    // Só a aba "Meus trampos" da barra (que tem `href`) leva esse nome.
    const semAba = (nome: string) =>
      screen
        .queryAllByRole('button', { name: nome })
        .filter((b) => b.props.href === undefined);
    expect(semAba(textos.perfil.minhasCandidaturas)).toEqual([]);
    expect(semAba(textos.perfil.meusTrampos)).toEqual([]);
  });

  it('freela: os números usam a mesma chave de cache de Meus trampos', async () => {
    // A segunda leitura falha: o número só aparece se vier do cache que
    // Meus trampos já encheu.
    const fetch = fake().responder('GET /candidaturas/minhas', [
      { corpo: [candidatura('c1', 't1', 'aceita')] },
      { status: 500, corpo: { erro: 'interno' } },
    ]);
    await abrir('/meus-trampos', { fetch });
    await waitFor(() =>
      expect(chamadas(fetch, '/candidaturas/minhas')).toHaveLength(1),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: textos.abas.perfil }),
    );

    expect(
      await screen.findByText(textos.perfil.candidaturasEnviadas(1)),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.perfil.confirmadas(1))).toBeOnTheScreen();
  });

  it('contratante: Perfil da empresa, sem números do freela', async () => {
    const fetch = fake();
    await abrir('/perfil', { modo: 'contratante', fetch });

    expect(
      await screen.findByText(textos.perfil.tituloEmpresa),
    ).toBeOnTheScreen();
    expect(
      await screen.findByRole('button', { name: textos.modo.trocarParaFreela }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/candidaturas? enviadas?/)).toBeNull();
    expect(chamadas(fetch, '/candidaturas/minhas')).toHaveLength(0);
  });
});

describe('CA84: Buscar', () => {
  it('a aba Buscar do contratante busca só serviços, sem abas de tipo', async () => {
    const fetch = fake();
    await abrir('/buscar?tipo=servicos', { modo: 'contratante', fetch });

    expect(
      await screen.findByText(textos.buscarFreelancers.titulo),
    ).toBeOnTheScreen();
    await waitFor(() =>
      expect(chamadas(fetch, '/busca').length).toBeGreaterThan(0),
    );
    expect(
      chamadas(fetch, '/busca').every((r) => r.query.tipo === 'servicos'),
    ).toBe(true);
    expect(
      screen.queryByRole('tab', { name: textos.buscar.abaTrampos }),
    ).toBeNull();
  });

  it('"Ver todos" de trampos do Início do freela abre /buscar-trampos, que já lista e volta', async () => {
    const fetch = fake();
    const { armazenamentoDoModo } = await abrir('/', { fetch });

    const verTodos = await screen.findAllByRole('button', {
      name: textos.gerais.verTodos,
    });
    await fireEvent.press(verTodos[0] as never);

    await waitFor(() => expect(screen).toHavePathname('/buscar-trampos'));
    expect(
      await screen.findByText(textos.buscar.tituloTrampos),
    ).toBeOnTheScreen();
    await waitFor(() =>
      expect(
        chamadas(fetch, '/busca').some(
          (r) => r.query.tipo === 'trampos' && r.query.texto === undefined,
        ),
      ).toBe(true),
    );
    // Rota de pilha: o modo não muda.
    expect(armazenamentoDoModo.atual()).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(abasNaBarra()).toEqual(ABAS_DO_FREELA);
  });
});

describe('sem conexão', () => {
  afterEach(async () => {
    await act(async () => onlineManager.setOnline(true));
  });

  it('a troca de modo funciona offline (é só do aparelho)', async () => {
    const { fetch, armazenamentoDoModo } = await abrir('/perfil');
    const cartao = await screen.findByRole('button', {
      name: textos.modo.trocarParaContratante,
    });
    await act(async () => onlineManager.setOnline(false));

    await fireEvent.press(cartao);

    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE));
    await waitFor(() =>
      expect(armazenamentoDoModo.atual()).toBe('contratante'),
    );
    expect(escritas(fetch)).toEqual([]);
  });
});
