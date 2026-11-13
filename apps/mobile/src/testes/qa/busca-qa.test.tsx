import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { ItemDaBusca } from '../../api/tipos';
import { textos } from '../../textos/pt-BR';
import type { FetchFalso } from '../fetch-falso';
import {
  abrirApp,
  fakeComCategorias,
  PERFIL_COMPLETO,
  vigiarConsole,
} from './apoio-qa';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 99,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

vigiarConsole();

function trampo(
  id: string,
  titulo: string,
  criadoEm = '2026-10-20T12:00:00.000Z',
): ItemDaBusca {
  return {
    tipo: 'trampo',
    id,
    autorId: 'conta-1',
    titulo,
    categoria: 'reformas',
    cidade: 'Lavras',
    criadoEm,
    valorCentavos: 15000,
  };
}

function servico(id: string, titulo: string): ItemDaBusca {
  return {
    tipo: 'servico',
    id,
    autorId: 'conta-2',
    titulo,
    categoria: 'aulas',
    cidade: null,
    criadoEm: '2026-10-19T12:00:00.000Z',
    precoBaseCentavos: 8000,
  };
}

function pagina(itens: readonly ItemDaBusca[], proximoCursor: string | null) {
  return { corpo: { itens, proximoCursor } };
}

const buscas = (fetch: FetchFalso) =>
  fetch.requisicoes.filter((r) => r.caminho === '/busca');

// A busca de trampos do freela (`/buscar-trampos`, CA84) cobre o texto, os
// filtros e a paginação; a aba Buscar do contratante usa a mesma tela.
const campo = () => screen.getByLabelText(textos.buscar.campoTrampos);
const enviar = () => fireEvent(campo(), 'submitEditing');
/** Abre o seletor `rotulo` e escolhe a opção (o último botão com o nome: a folha vem depois). */
async function escolherNoSeletor(rotulo: string, opcao: string) {
  await fireEvent.press(
    screen.getByRole('button', { name: new RegExp(`^${rotulo}:`) }),
  );
  const botoes = await screen.findAllByRole('button', { name: opcao });
  await fireEvent.press(botoes[botoes.length - 1] as (typeof botoes)[number]);
}

const aoLado = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

describe('Buscar: texto e filtros (CA7)', () => {
  it('texto só de espaços não manda `texto` na query', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', pagina([], null));
    await abrirApp('/buscar-trampos', { fetch });

    await fireEvent.changeText(
      await screen.findByLabelText(textos.buscar.campoTrampos),
      '     ',
    );
    await enviar();

    await waitFor(() => expect(buscas(fetch)).toHaveLength(1));
    expect(buscas(fetch)[0]?.query).toEqual({ tipo: 'trampos', limite: '20' });
    expect(buscas(fetch)[0]?.url).not.toContain('texto');
  });

  it('texto com espaços nas pontas vai aparado', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', pagina([], null));
    await abrirApp('/buscar-trampos', { fetch });

    await fireEvent.changeText(
      await screen.findByLabelText(textos.buscar.campoTrampos),
      '  pintor  ',
    );
    await enviar();

    await waitFor(() => expect(buscas(fetch)).toHaveLength(1));
    expect(buscas(fetch)[0]?.query.texto).toBe('pintor');
  });

  it('texto com &, =, #, % e acentos chega inteiro à API (codificado na URL)', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', pagina([], null));
    await abrirApp('/buscar-trampos', { fetch });
    const texto = 'pintura & reforma=1 #50% açaí';

    await fireEvent.changeText(
      await screen.findByLabelText(textos.buscar.campoTrampos),
      texto,
    );
    await enviar();

    await waitFor(() => expect(buscas(fetch)).toHaveLength(1));
    expect(buscas(fetch)[0]?.query.texto).toBe(texto);
    expect(Object.keys(buscas(fetch)[0]?.query ?? {}).sort()).toEqual([
      'limite',
      'texto',
      'tipo',
    ]);
  });

  // Desde a L4 (CA55, D45) o campo corta no próprio `onChangeText`, em pontos
  // de código, no lugar do `maxLength` (que o RN conta em unidades UTF-16).
  it('o campo de texto limita a 100 caracteres: corta ao digitar ou colar, nunca antes', async () => {
    await abrirApp('/buscar-trampos');
    await screen.findByLabelText(textos.buscar.campoTrampos);
    const valor = () =>
      screen.getByLabelText(textos.buscar.campoTrampos).props.value;

    // Exatamente no limite: nada é cortado e o aviso de corte não aparece.
    await fireEvent.changeText(campo(), 'a'.repeat(100));
    expect(valor()).toBe('a'.repeat(100));
    expect(screen.queryByText(textos.gerais.contadorCortado(100))).toBeNull();

    // Colar além do limite corta nos 100.
    await fireEvent.changeText(campo(), 'a'.repeat(101));
    expect(valor()).toBe('a'.repeat(100));
    // O texto aparece no contador e na região que o leitor de tela anuncia.
    expect(
      (await screen.findAllByText(textos.gerais.contadorCortado(100))).length,
    ).toBeGreaterThan(0);

    // Emoji conta 1 (2 unidades UTF-16): 100 emojis cabem, o 101º é cortado.
    await fireEvent.changeText(campo(), '😀'.repeat(100));
    expect(valor()).toBe('😀'.repeat(100));
    await fireEvent.changeText(campo(), '😀'.repeat(101));
    expect(valor()).toBe('😀'.repeat(100));
    // O corte é do componente; o `maxLength` do RN (UTF-16) não é usado.
    expect(campo().props.maxLength).toBeUndefined();
  });

  it('combina texto, categoria e cidade na busca de serviços do contratante, com E', async () => {
    const fetch = fakeComCategorias().responder(
      'GET /busca',
      pagina([servico('s1', 'Aula de reforço')], null),
    );
    await abrirApp('/buscar', { fetch, modo: 'contratante' });

    await fireEvent.changeText(
      await screen.findByLabelText(textos.buscarFreelancers.campo),
      'matemática',
    );
    await escolherNoSeletor(textos.buscar.categoria, 'Aulas e reforço');
    await fireEvent.press(
      screen.getByRole('button', {
        name: new RegExp(`^${textos.buscar.cidade}:`),
      }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText(textos.buscar.pesquisarCidade),
      'Lavras',
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.buscar.aplicar }),
    );

    await screen.findByText('Aula de reforço');
    expect(buscas(fetch).at(-1)?.query).toEqual({
      texto: 'matemática',
      categoria: 'aulas',
      cidade: 'Lavras',
      tipo: 'servicos',
      limite: '20',
    });
  });

  it('voltar a "Todas as categorias" tira a categoria da query', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', pagina([], null));
    await abrirApp('/buscar-trampos', { fetch });

    await screen.findByText(textos.buscar.inicial);
    await escolherNoSeletor(textos.buscar.categoria, 'Aulas e reforço');
    await waitFor(() => expect(buscas(fetch)).toHaveLength(1));
    expect(buscas(fetch)[0]?.query.categoria).toBe('aulas');

    await escolherNoSeletor(
      textos.buscar.categoria,
      textos.buscar.todasCategorias,
    );

    await waitFor(() => expect(buscas(fetch)).toHaveLength(2));
    expect(buscas(fetch)[1]?.query).toEqual({ tipo: 'trampos', limite: '20' });
  });
});

describe('Buscar: resultados e paginação (CA7)', () => {
  it('preserva a ordem da API mesmo fora da ordem de data, nas duas páginas', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', [
      pagina(
        [
          trampo('t1', 'Zebra', '2026-01-01T00:00:00.000Z'),
          trampo('t2', 'Alfa', '2026-12-01T00:00:00.000Z'),
        ],
        'c1',
      ),
      pagina([trampo('t3', 'Mango', '2026-06-01T00:00:00.000Z')], null),
    ]);
    await abrirApp('/buscar-trampos', { fetch });

    await enviar();
    await screen.findByText('Zebra');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.carregarMais }),
    );
    await screen.findByText('Mango');

    const titulos = ['Zebra', 'Alfa', 'Mango'].map((t) => screen.getByText(t));
    const textosVistos = screen
      .getAllByText(/^(Zebra|Alfa|Mango)$/)
      .map((n) => String(n.props.children));
    expect(textosVistos).toEqual(['Zebra', 'Alfa', 'Mango']);
    expect(titulos).toHaveLength(3);
  });

  it('cada página usa o cursor da anterior, não o primeiro, e para ao vir null', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', [
      pagina([trampo('t1', 'Um')], 'cursor-A'),
      pagina([trampo('t2', 'Dois')], 'cursor-B'),
      pagina([trampo('t3', 'Tres')], null),
    ]);
    await abrirApp('/buscar-trampos', { fetch });

    await enviar();
    await screen.findByText('Um');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.carregarMais }),
    );
    await screen.findByText('Dois');
    expect(screen.getByText('2+ resultados')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.carregarMais }),
    );
    await screen.findByText('Tres');

    expect(buscas(fetch).map((r) => r.query.antesDe)).toEqual([
      undefined,
      'cursor-A',
      'cursor-B',
    ]);
    expect(screen.getByText('3 resultados')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.gerais.carregarMais }),
    ).toBeNull();
  });

  it('"Carregar mais" tocado duas vezes seguidas manda uma requisição só', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', [
      pagina([trampo('t1', 'Um')], 'cursor-A'),
      { ...pagina([trampo('t2', 'Dois')], null), demoraMs: 200 },
    ]);
    await abrirApp('/buscar-trampos', { fetch });

    await enviar();
    await screen.findByText('Um');
    const botao = screen.getByRole('button', {
      name: textos.gerais.carregarMais,
    });
    await fireEvent.press(botao);
    // Segundo toque 50 ms depois, com a página 2 ainda a caminho.
    await aoLado(50);
    await fireEvent.press(botao);
    await aoLado(300);

    await screen.findByText('Dois');
    expect(buscas(fetch)).toHaveLength(2);
  });

  it('"1 resultado" no singular e sem "+" quando não há mais páginas', async () => {
    const fetch = fakeComCategorias().responder(
      'GET /busca',
      pagina([trampo('t1', 'Um')], null),
    );
    await abrirApp('/buscar-trampos', { fetch });

    await enviar();

    expect(await screen.findByText('1 resultado')).toBeOnTheScreen();
  });

  it('mudar o filtro com a busca ainda carregando mostra só a busca nova (resposta atrasada não vaza)', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /busca?tipo=trampos', {
        ...pagina([trampo('t1', 'Trampo atrasado')], null),
        demoraMs: 500,
      })
      .responder(
        'GET /busca?tipo=trampos&categoria=aulas',
        pagina([trampo('t2', 'Trampo da categoria')], null),
      );
    await abrirApp('/buscar-trampos', { fetch });

    await enviar();
    await escolherNoSeletor(textos.buscar.categoria, 'Aulas e reforço');
    await aoLado(100);
    expect(await screen.findByText('Trampo da categoria')).toBeOnTheScreen();
    await aoLado(1000);

    expect(screen.queryByText('Trampo atrasado')).toBeNull();
    expect(screen.getByText('Trampo da categoria')).toBeOnTheScreen();
  });

  it('erro ao carregar a página 2 avisa a pessoa (não fica mudo) e mantém a página 1', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', [
      pagina([trampo('t1', 'Um')], 'cursor-A'),
      { status: 500, corpo: { erro: 'interno' } },
    ]);
    await abrirApp('/buscar-trampos', { fetch });

    await enviar();
    await screen.findByText('Um');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.carregarMais }),
    );
    await waitFor(() => expect(buscas(fetch)).toHaveLength(2));
    await aoLado(50);

    expect(screen.getByText('Um')).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.erro_servidor)).toBeOnTheScreen();
  });

  it('erro 500 na primeira página mostra o texto traduzido, nunca a mensagem crua', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', {
      status: 500,
      corpo: { erro: 'erro_interno' },
    });
    await abrirApp('/buscar-trampos', { fetch });

    await enviar();

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/erro da API|erro_interno/)).toBeNull();
  });

  it('429 na busca mostra o texto de "muitas ações" (CA20)', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', {
      status: 429,
      corpo: { erro: 'muitas_requisicoes' },
    });
    await abrirApp('/buscar-trampos', { fetch });

    await enviar();

    expect(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    ).toBeOnTheScreen();
  });

  it('vazio com filtro mostra "Limpar filtros" e sem filtro não oferece o botão', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', pagina([], null));
    await abrirApp('/buscar-trampos', { fetch });

    await enviar();
    expect(
      await screen.findByText(textos.buscar.semResultados),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.buscar.limparFiltros }),
    ).toBeNull();

    await fireEvent.changeText(campo(), 'xyz');
    await enviar();
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: textos.buscar.limparFiltros })
          .length,
      ).toBeGreaterThan(0),
    );
  });

  it('sem enviar nada, abre com as categorias sugeridas e sem requisição de busca', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', pagina([], null));
    await abrirApp('/buscar-trampos', { fetch });

    expect(await screen.findByText(textos.buscar.inicial)).toBeOnTheScreen();
    expect(buscas(fetch)).toHaveLength(0);
  });

  it('tocar numa categoria sugerida busca com ela (e o tipo da tela)', async () => {
    const fetch = fakeComCategorias().responder(
      'GET /busca',
      pagina([trampo('t1', 'Reboco')], null),
    );
    await abrirApp('/buscar-trampos', { fetch });

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Reformas e reparos' }),
    );

    expect(await screen.findByText('Reboco')).toBeOnTheScreen();
    expect(buscas(fetch)[0]?.query).toEqual({
      categoria: 'reformas',
      tipo: 'trampos',
      limite: '20',
    });
  });
});

describe('Início → "Ver todos" → Buscar (CA7, CA84)', () => {
  const campoDeServicos = () =>
    screen.getByLabelText(textos.buscarFreelancers.campo);

  function fakeDoInicio() {
    return fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder(
        'GET /busca?tipo=trampos',
        pagina([trampo('t1', 'Pintar')], null),
      )
      .responder(
        'GET /busca?tipo=servicos',
        pagina([servico('s1', 'Violão')], null),
      );
  }

  it('um link para a Buscar de serviços com outro `pedido` zera os filtros e lista tudo de novo', async () => {
    // O Início do freela não tem mais "Ver todos" de serviços (D63): o link
    // chega por navegação direta, como o `pedido` sempre chegou.
    const fetch = fakeDoInicio();
    const { getPathname } = await abrirApp('/', { fetch });
    await screen.findByText('Pintar');

    await act(async () => {
      router.navigate({
        pathname: '/buscar',
        params: { tipo: 'servicos', pedido: 'pedido-1-do-teste' },
      });
    });
    await waitFor(() => expect(getPathname()).toBe('/buscar'));
    expect(await screen.findByText('Violão')).toBeOnTheScreen();

    // A pessoa filtra à mão e volta ao Início pela barra de abas.
    await fireEvent.changeText(campoDeServicos(), 'piano');
    await fireEvent(campoDeServicos(), 'submitEditing');
    await waitFor(() =>
      expect(buscas(fetch).at(-1)?.query.texto).toBe('piano'),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: /^Início(, tab|$)/ }),
    );
    await waitFor(() => expect(getPathname()).toBe('/'));

    // O link chega de novo, com outro `pedido`.
    await act(async () => {
      router.navigate({
        pathname: '/buscar',
        params: { tipo: 'servicos', pedido: 'pedido-novo-do-teste' },
      });
    });
    await waitFor(() => expect(getPathname()).toBe('/buscar'));

    await waitFor(() =>
      expect(buscas(fetch).at(-1)?.query).toEqual({
        tipo: 'servicos',
        limite: '20',
      }),
    );
    expect(campoDeServicos().props.value).toBe('');
  });

  it.each([
    ['desconhecido', 'admin'],
    ['do outro tipo', 'servicos'],
  ])(
    '?tipo= %s na URL é ignorado: abre a busca de trampos sem buscar',
    async (_caso, tipo) => {
      const fetch = fakeDoInicio();
      await abrirApp(`/buscar-trampos?tipo=${tipo}`, { fetch });

      expect(await screen.findByText(textos.buscar.inicial)).toBeOnTheScreen();
      expect(screen.getByText(textos.buscar.tituloTrampos)).toBeOnTheScreen();
      expect(screen.queryByRole('tab')).toBeNull();
      expect(buscas(fetch)).toHaveLength(0);
    },
  );
});

describe('Início (CA7)', () => {
  const vazia = pagina([], null);

  it('GET /categorias falhando não derruba o Início: recentes aparecem com o id da categoria', async () => {
    const fetch = fakeComCategorias();
    fetch.responder('GET /categorias', {
      status: 500,
      corpo: { erro: 'interno' },
    });
    fetch.responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO });
    fetch.responder(
      'GET /busca?tipo=trampos',
      pagina([trampo('t1', 'Pintar a sala')], null),
    );
    fetch.responder(
      'GET /busca?tipo=servicos',
      pagina([servico('s1', 'Aula de violão')], null),
    );
    await abrirApp('/', { fetch });

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    // Sem a lista de categorias, o cartão mostra o id da categoria.
    expect(screen.getByText('reformas · Lavras')).toBeOnTheScreen();
    expect(screen.getByText('Olá, Maria Souza')).toBeOnTheScreen();
    expect(screen.queryByText(/erro da API/)).toBeNull();
  });

  it('os recentes falham: erro na seção, um só "Tentar de novo" e nenhum pedido de serviços (D63)', async () => {
    const fetch = fakeComCategorias();
    fetch.responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO });
    fetch.responder('GET /busca?tipo=trampos', {
      status: 500,
      corpo: { erro: 'interno' },
    });
    fetch.responder(
      'GET /busca?tipo=servicos',
      pagina([servico('s1', 'Aula de violão')], null),
    );
    await abrirApp('/', { fetch });

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    expect(
      screen.getAllByRole('button', { name: textos.gerais.tentarDeNovo }),
    ).toHaveLength(1);
    expect(screen.queryByText('Aula de violão')).toBeNull();
    expect(buscas(fetch).some((r) => r.query.tipo === 'servicos')).toBe(false);
  });

  it('GET /perfis/eu com erro 500 não mostra o aviso "Complete seu perfil" (só o 404 mostra)', async () => {
    const fetch = fakeComCategorias();
    fetch.responder('GET /perfis/eu', {
      status: 500,
      corpo: { erro: 'interno' },
    });
    fetch.responder(
      'GET /busca?tipo=trampos',
      pagina([trampo('t1', 'Pintar a sala')], null),
    );
    fetch.responder('GET /busca?tipo=servicos', pagina([], null));
    await abrirApp('/', { fetch });

    await screen.findByText('Pintar a sala');

    expect(screen.queryByText(/Complete seu perfil/)).toBeNull();
  });

  it('sem nenhum anúncio mostra o vazio do Início, sem erro', async () => {
    const fetch = fakeComCategorias();
    fetch.responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO });
    fetch.responder('GET /busca', vazia);
    await abrirApp('/', { fetch });

    expect(
      (await screen.findAllByText(textos.inicio.vazio)).length,
    ).toBeGreaterThan(0);
  });

  it('o aviso "Complete seu perfil" some depois de salvar o perfil', async () => {
    const fetch = fakeComCategorias();
    fetch.responder('GET /perfis/eu', [
      { status: 404 },
      { corpo: PERFIL_COMPLETO },
    ]);
    fetch.responder('PUT /perfis/eu', { corpo: PERFIL_COMPLETO });
    fetch.responder('GET /busca', vazia);
    const { getPathname } = await abrirApp('/', { fetch });

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.completar }),
    );
    await waitFor(() => expect(getPathname()).toBe('/perfil/editar'));
    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.nome),
      'Maria Souza',
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.cidade),
      'Lavras',
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.adicionarHabilidade),
      'pintura',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.adicionar }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.salvar }),
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.gerais.fechar }),
    );

    expect(await screen.findByText('Olá, Maria Souza')).toBeOnTheScreen();
    expect(screen.queryByText(/Complete seu perfil/)).toBeNull();
    expect(getPathname()).toBe('/');
  });
});
