// Etapa 7 do visual V2: as telas novas ligadas às rotas. Candidatura enviada
// no lugar do toast (CA80), Dicas & minicursos sem rede (CA81), Início do
// contratante (CA82) e a linha "Dicas & minicursos" do Perfil (CA83).
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import RotaDaLeituraDeDica from '../../app/(app)/dicas/[id]';
import RotaDasDicas from '../../app/(app)/dicas/index';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { chaves } from '../../estado/consultas/chaves';
import { formatarCentavos, formatarData } from '../../estado/formatacao';
import type { Modo } from '../../estado/modo';
import { CATEGORIAS_DAS_DICAS, DICAS } from '../../textos/dicas';
import { textos } from '../../textos/pt-BR';
import type { FetchFalso } from '../fetch-falso';
import { fakeComCategorias, ROTAS_REAIS, vigiarConsole } from '../qa/apoio-qa';
import { criarQueryClientDeTeste } from '../renderizar';
import {
  type MapaDeRotas,
  type RotasRenderizadas,
  renderizarRotas,
  TOKEN_DE_TESTE,
} from './apoio';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
}));

vigiarConsole();

// --- Dados ---

const PRAZO = '2026-12-05';
const VALOR_DO_TRAMPO = 150000;
const VALOR_PROPOSTO = 12000;

const TRAMPO = {
  id: 't1',
  autorId: 'c-autor',
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: VALOR_DO_TRAMPO,
  prazo: PRAZO,
  status: 'aberto',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

const AUTOR = {
  contaId: 'c-autor',
  nome: 'Carla Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
};

const MEU_PERFIL = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

const MINHA = {
  id: 'm1',
  trampoId: 't1',
  freelancerId: 'eu',
  mensagem: 'Posso ir amanhã.',
  valorPropostoCentavos: VALOR_PROPOSTO,
  status: 'pendente',
  criadaEm: '2026-10-02T12:00:00.000Z',
};

const ROTAS: MapaDeRotas = {
  ...ROTAS_REAIS,
  '(app)/dicas/index': RotaDasDicas,
  '(app)/dicas/[id]': RotaDaLeituraDeDica,
};

/** Freela com perfil salvo diante de um trampo aberto, sem candidaturas. */
function fake(): FetchFalso {
  return fakeComCategorias()
    .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
    .responder('GET /perfis/c-autor', { corpo: AUTOR })
    .responder('GET /trampos/t1', { corpo: TRAMPO })
    .responder('GET /trampos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', { corpo: [] })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('GET /conversas', { corpo: [] });
}

/** O fake em que o `POST` da candidatura dá 201 e passa a constar em "minhas". */
function fakeQueAceitaACandidatura(): FetchFalso {
  let enviada = false;
  return fake()
    .responder('GET /candidaturas/minhas', () => ({
      corpo: enviada ? [MINHA] : [],
    }))
    .responder('POST /trampos/t1/candidaturas', () => {
      enviada = true;
      return { status: 201, corpo: { id: 'm1', status: 'pendente' } };
    });
}

async function abrir(
  url: string,
  {
    fetch = fake(),
    modo = null,
  }: { fetch?: FetchFalso; modo?: Modo | null } = {},
) {
  const resultado = await renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch,
    modo,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
  return { ...resultado, fetch };
}

function chamadas(fetch: FetchFalso, metodo: string, caminho: string) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

/** Abre o detalhe, preenche a folha e envia: o 201 leva à tela nova. */
async function candidatarNoDetalhe() {
  await fireEvent.press(
    await screen.findByRole('button', {
      name: textos.detalheTrampo.candidatar,
    }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText(textos.candidatar.mensagem),
    'Posso ir amanhã.',
  );
  await fireEvent.changeText(
    screen.getByLabelText(textos.candidatar.valor),
    '120',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: textos.candidatar.enviar }),
  );
  await waitFor(() => expect(screen).toHavePathname('/candidatura-enviada'));
}

/** Nomes das rotas na pilha de `(app)`, de baixo para cima. */
function pilhaDoApp(rotas: RotasRenderizadas): string[] {
  type No = { routes?: { name: string; state?: No }[] };
  const raiz = rotas.getRouterState() as No;
  const app = raiz.routes?.[0]?.state?.routes?.find((r) => r.name === '(app)');
  return (app?.state?.routes ?? []).map((r) => r.name);
}

/** Início → detalhe do trampo, como no aparelho: as abas ficam por baixo. */
async function abrirDetalheAPartirDoInicio() {
  const resultado = await abrir('/', { fetch: fakeQueAceitaACandidatura() });
  await screen.findByRole('button', { name: textos.abas.meusTrampos });
  await act(async () => router.push('/trampos/t1'));
  await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
  return resultado;
}

// --- CA80: Candidatura enviada ---

describe('CA80: Candidatura enviada', () => {
  it('o 201 abre /candidatura-enviada?trampoId= com o resumo do cache, sem o toast', async () => {
    const { fetch, getSearchParams } = await abrir('/trampos/t1', {
      fetch: fakeQueAceitaACandidatura(),
    });
    // O autor é lido pelo detalhe; a tela nova só olha o cache.
    expect(await screen.findByText(AUTOR.nome)).toBeOnTheScreen();

    await candidatarNoDetalhe();

    // O `id` do link inicial fica nos parâmetros do grupo pai; o da tela é
    // só o `trampoId`.
    expect(getSearchParams()).toEqual(
      expect.objectContaining({ trampoId: 't1' }),
    );
    expect(
      await screen.findByText(textos.candidaturaEnviada.titulo),
    ).toBeOnTheScreen();
    // O toast antigo (texto que saiu de `pt-BR.ts`) não aparece mais.
    expect(
      screen.queryByText(
        'Candidatura enviada! Você pode acompanhar em Minhas candidaturas.',
      ),
    ).toBeNull();
    expect(chamadas(fetch, 'POST', '/trampos/t1/candidaturas')).toHaveLength(1);

    expect(
      screen.getByText(textos.candidaturaEnviada.texto(AUTOR.nome)),
    ).toBeOnTheScreen();
    expect(screen.getAllByText(TRAMPO.titulo).length).toBeGreaterThan(0);
    expect(
      screen.getByText(textos.meusTrampos.publicadoPor(AUTOR.nome)),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(`${textos.detalheTrampo.prazo}: ${formatarData(PRAZO)}`),
    ).toBeOnTheScreen();
    // O valor é o proposto (de Minhas candidaturas), não o do trampo.
    expect(
      screen.getByText(formatarCentavos(VALOR_PROPOSTO)),
    ).toBeOnTheScreen();
  });

  it('a tela não faz requisição: sem o trampo no cache, só o título e os passos', async () => {
    const { fetch } = await abrir('/candidatura-enviada?trampoId=t1');

    expect(
      await screen.findByText(textos.candidaturaEnviada.titulo),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.candidaturaEnviada.textoSemAutor),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.candidaturaEnviada.passos.enviada),
    ).toBeOnTheScreen();
    expect(screen.queryByText(TRAMPO.titulo)).toBeNull();
    expect(screen.queryByText(AUTOR.nome, { exact: false })).toBeNull();
    expect(chamadas(fetch, 'GET', '/trampos/t1')).toEqual([]);
    expect(chamadas(fetch, 'GET', '/perfis/c-autor')).toEqual([]);
    expect(chamadas(fetch, 'GET', '/candidaturas/minhas')).toEqual([]);
  });

  it('trampo no cache sem o autor e sem a candidatura: valor do trampo e texto sem nome', async () => {
    const queryClient = criarQueryClientDeTeste();
    queryClient.setQueryData(chaves.trampo('t2'), {
      ...TRAMPO,
      id: 't2',
      autorId: 'c-outro',
      prazo: null,
    });
    const fetch = fake();
    await renderizarRotas(ROTAS, {
      initialUrl: '/candidatura-enviada?trampoId=t2',
      fetch,
      queryClient,
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
    });

    expect(await screen.findByText(TRAMPO.titulo)).toBeOnTheScreen();
    expect(
      screen.getByText(textos.candidaturaEnviada.textoSemAutor),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(formatarCentavos(VALOR_DO_TRAMPO)),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText(textos.detalheTrampo.prazo, { exact: false }),
    ).toBeNull();
    expect(chamadas(fetch, 'GET', '/perfis/c-outro')).toEqual([]);
  });

  it('"Ver em Meus trampos" volta às abas, em /meus-trampos, e tira a tela da pilha', async () => {
    const rotas = await abrirDetalheAPartirDoInicio();
    await candidatarNoDetalhe();

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.candidaturaEnviada.verMeusTrampos,
      }),
    );

    await waitFor(() => expect(screen).toHavePathname('/meus-trampos'));
    // As abas que já estavam por baixo, sem uma segunda cópia por cima.
    expect(pilhaDoApp(rotas)).toEqual(['(abas)']);
  });

  it('"Buscar mais trampos" troca a tela por /buscar-trampos, que volta ao detalhe', async () => {
    const rotas = await abrirDetalheAPartirDoInicio();
    await candidatarNoDetalhe();

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.candidaturaEnviada.buscarMais,
      }),
    );

    await waitFor(() => expect(screen).toHavePathname('/buscar-trampos'));
    expect(pilhaDoApp(rotas)).toEqual([
      '(abas)',
      'trampos/[id]',
      'buscar-trampos',
    ]);
  });

  it('voltar leva ao detalhe, já com "Candidatura enviada"', async () => {
    await abrirDetalheAPartirDoInicio();
    await candidatarNoDetalhe();

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.gerais.voltar }),
    );

    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
    expect(
      await screen.findByText(textos.detalheTrampo.jaCandidatou),
    ).toBeOnTheScreen();
  });

  it('aberta direto (sem pilha), voltar vai ao detalhe do trampo', async () => {
    await abrir('/candidatura-enviada?trampoId=t1');

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.gerais.voltar }),
    );

    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
  });
});

// --- CA81: Dicas & minicursos ---

describe('CA81: Dicas & minicursos', () => {
  afterEach(async () => {
    await act(async () => onlineManager.setOnline(true));
  });

  it('Perfil do freela → Dicas → filtro → leitura → voltar, sem rede e sem requisição', async () => {
    const { fetch } = await abrir('/perfil');
    const linha = await screen.findByRole('button', {
      name: textos.perfil.dicas,
    });
    await act(async () => onlineManager.setOnline(false));
    const antes = fetch.requisicoes.length;

    await fireEvent.press(linha);
    await waitFor(() => expect(screen).toHavePathname('/dicas'));
    expect(
      await screen.findByText(textos.dicas.conteudos(DICAS.length)),
    ).toBeOnTheScreen();

    // Filtro por categoria (a primeira com conteúdo).
    const categoria = CATEGORIAS_DAS_DICAS.find((c) =>
      DICAS.some((d) => d.categoria === c),
    );
    if (categoria === undefined) throw new Error('nenhuma categoria com dica');
    const daCategoria = DICAS.filter((d) => d.categoria === categoria);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.dicas.categoria[categoria] }),
    );
    expect(
      await screen.findByText(textos.dicas.conteudos(daCategoria.length)),
    ).toBeOnTheScreen();
    const outra = DICAS.find((d) => d.categoria !== categoria);
    if (outra !== undefined) {
      expect(screen.queryByText(outra.titulo)).toBeNull();
    }

    const dica = daCategoria[0];
    if (dica === undefined) throw new Error('categoria sem dica');
    await fireEvent.press(screen.getByText(dica.titulo));
    await waitFor(() => expect(screen).toHavePathname(`/dicas/${dica.id}`));
    expect(await screen.findByText(textos.dicas.paraLembrar)).toBeOnTheScreen();
    expect(screen.getByText(dica.paragrafos[0] ?? '')).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.dicas.voltar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/dicas'));

    expect(fetch.requisicoes.length).toBe(antes);
  });

  it('a lista e a leitura abertas direto não fazem nenhuma requisição', async () => {
    const dica = DICAS[0];
    if (dica === undefined) throw new Error('sem dicas');
    const fetch = fakeComCategorias();
    await renderizarRotas(
      {
        '(app)/_layout': ROTAS_REAIS['(app)/_layout'],
        '(app)/dicas/index': RotaDasDicas,
        '(app)/dicas/[id]': RotaDaLeituraDeDica,
      } as MapaDeRotas,
      {
        initialUrl: `/dicas/${dica.id}`,
        fetch,
        armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
      },
    );
    expect(await screen.findByText(textos.dicas.paraLembrar)).toBeOnTheScreen();

    // Sem pilha, "Voltar às dicas" abre a lista.
    await fireEvent.press(
      screen.getByRole('button', { name: textos.dicas.voltar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/dicas'));
    expect(
      await screen.findByText(textos.dicas.conteudos(DICAS.length)),
    ).toBeOnTheScreen();

    expect(fetch.requisicoes).toEqual([]);
  });

  it('id que não existe mostra "não encontrado"', async () => {
    const fetch = fakeComCategorias();
    await renderizarRotas(
      {
        '(app)/_layout': ROTAS_REAIS['(app)/_layout'],
        '(app)/dicas/index': RotaDasDicas,
        '(app)/dicas/[id]': RotaDaLeituraDeDica,
      } as MapaDeRotas,
      {
        initialUrl: '/dicas/nao-existe',
        fetch,
        armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
      },
    );

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    expect(fetch.requisicoes).toEqual([]);
  });
});

// --- CA82: Início do contratante (ligado na etapa 6) ---

describe('CA82: Início do contratante', () => {
  it('"+" abre /trampos/novo e "Demandas abertas" traz os interessados, sem Aceitar', async () => {
    const fetch = fake().responder('GET /trampos/meus', {
      corpo: [
        { ...TRAMPO, versao: 1, candidaturasRecebidas: 2 },
        { ...TRAMPO, id: 't9', titulo: 'Já encerrado', status: 'encerrado' },
      ],
    });
    await abrir('/', { modo: 'contratante', fetch });

    expect(await screen.findByText(TRAMPO.titulo)).toBeOnTheScreen();
    expect(
      screen.getByText(textos.inicioContratante.interessados(2)),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Já encerrado')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /aceitar|recusar/i }),
    ).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.inicioContratante.novaDemanda,
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/trampos/novo'));
  });
});

// --- CA83: a linha de Dicas no Perfil ---

describe('CA83: Perfil', () => {
  it('freela vê "Dicas & minicursos", que abre /dicas', async () => {
    await abrir('/perfil');

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.dicas }),
    );

    await waitFor(() => expect(screen).toHavePathname('/dicas'));
  });

  it('o Perfil da empresa não tem a linha de Dicas', async () => {
    await abrir('/perfil', { modo: 'contratante' });

    expect(
      await screen.findByText(textos.perfil.tituloEmpresa),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.perfil.dicas }),
    ).toBeNull();
  });
});
