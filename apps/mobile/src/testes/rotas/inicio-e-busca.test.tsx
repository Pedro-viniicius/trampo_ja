import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import type { ItemDaBusca } from '../../api/tipos';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import LayoutDasAbas from '../../app/(app)/(abas)/_layout';
import BuscarRota from '../../app/(app)/(abas)/buscar';
import InicioRota from '../../app/(app)/(abas)/index';
import RotaDeBuscarTrampos from '../../app/(app)/buscar-trampos';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import {
  criarArmazenamentoDoModoEmMemoria,
  type Modo,
} from '../../estado/modo';
import { DICAS } from '../../textos/dicas';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { renderRouter } from '../render-router';
import { criarProvedores } from '../renderizar';
import { abasDeStub } from './apoio';

const categorias = [
  { id: 'reformas', rotulo: 'Reformas' },
  { id: 'aulas', rotulo: 'Aulas e reforço' },
];

function trampo(id: string, titulo: string): ItemDaBusca {
  return {
    tipo: 'trampo',
    id,
    autorId: 'conta-1',
    titulo,
    categoria: 'reformas',
    cidade: 'Lavras',
    criadoEm: '2026-10-20T12:00:00.000Z',
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

const meuPerfil = {
  contaId: 'conta-eu',
  nome: 'Maria Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
};

function stub(nome: string) {
  return function Stub() {
    return <Text>{nome}</Text>;
  };
}

const rotas = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/(abas)/_layout': LayoutDasAbas,
  ...abasDeStub(),
  '(app)/(abas)/index': InicioRota,
  '(app)/(abas)/buscar': BuscarRota,
  '(app)/(abas)/conversas': stub('conversas-stub'),
  '(app)/(abas)/perfil': stub('perfil-stub'),
  '(app)/buscar-trampos': RotaDeBuscarTrampos,
  '(app)/perfil/editar': stub('editar-perfil-stub'),
  '(app)/dicas/index': stub('dicas-stub'),
  '(app)/candidaturas/[trampoId]': stub('candidaturas-stub'),
  '(app)/trampos/[id]': stub('detalhe-trampo-stub'),
  '(app)/servicos/[id]': stub('detalhe-servico-stub'),
};

/** Sessão já autenticada (token em memória) e um fetch falso com as categorias. */
async function abrir(
  url: string,
  preparar: (fetch: FetchFalso) => void,
  modo: Modo | null = null,
) {
  const fetch = criarFetchFalso().responder('GET /categorias', {
    corpo: categorias,
  });
  preparar(fetch);
  const armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria(modo);
  const { wrapper } = criarProvedores({
    armazenamento: criarArmazenamentoEmMemoria('token-teste'),
    fetch,
    armazenamentoDoModo,
  });
  const resultado = await renderRouter(rotas, { initialUrl: url, wrapper });
  return { fetch, armazenamentoDoModo, ...resultado };
}

function buscas(fetch: FetchFalso) {
  return fetch.requisicoes.filter((r) => r.caminho === '/busca');
}

function pagina(itens: readonly ItemDaBusca[], proximoCursor: string | null) {
  return { corpo: { itens, proximoCursor } };
}

describe('Início', () => {
  it('sem perfil (404): mostra o aviso e o botão leva a completar', async () => {
    const { fetch } = await abrir('/', (f) => {
      f.responder('GET /perfis/eu', { status: 404 });
      f.responder('GET /busca', pagina([], null));
    });

    expect(await screen.findByText(/Complete seu perfil/)).toBeOnTheScreen();
    expect(
      screen.getByText(/Falta: nome, cidade e habilidades/),
    ).toBeOnTheScreen();
    expect(fetch.requisicoes[0]?.cabecalhos.authorization).toBe(
      'Bearer token-teste',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.completar }),
    );

    await waitFor(() => expect(screen).toHavePathname('/perfil/editar'));
    expect(screen).toHaveSearchParams({ completar: '1' });
  });

  it('sem perfil (404): a saudação é "Olá!", sem nome (D2)', async () => {
    await abrir('/', (f) => {
      f.responder('GET /perfis/eu', { status: 404 });
      f.responder('GET /busca', pagina([], null));
    });

    expect(
      await screen.findByText(textos.inicio.saudacaoSemNome),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/^Olá, /)).toBeNull();
  });

  it('offline sem perfil carregado: nada de aviso "Complete seu perfil" (R1)', async () => {
    onlineManager.setOnline(false);
    try {
      const { fetch } = await abrir('/', (f) => {
        f.responder('GET /perfis/eu', { status: 404 });
        f.responder('GET /busca', pagina([], null));
      });

      // A faixa é da raiz (CA56): esta tela não desenha a sua.
      expect(
        await screen.findByText(textos.inicio.saudacaoSemNome),
      ).toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      expect(screen.queryByText(textos.gerais.semConexaoFaixa)).toBeNull();
      expect(fetch.requisicoes).toHaveLength(0);
      expect(screen.queryByText(/Complete seu perfil/)).toBeNull();
      expect(
        screen.queryByRole('button', { name: textos.perfil.completar }),
      ).toBeNull();
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
  });

  it('com perfil: saudação com o nome e sem aviso', async () => {
    await abrir('/', (f) => {
      f.responder('GET /perfis/eu', { corpo: meuPerfil });
      f.responder('GET /busca', pagina([], null));
    });

    expect(await screen.findByText('Olá, Maria Souza')).toBeOnTheScreen();
    expect(screen.queryByText(/Complete seu perfil/)).not.toBeOnTheScreen();
  });

  it('pede 10 trampos e as categorias, mostra os itens e não pede serviços (D63)', async () => {
    const { fetch } = await abrir('/', (f) => {
      f.responder('GET /perfis/eu', { corpo: meuPerfil });
      f.responder(
        'GET /busca?tipo=trampos',
        pagina([trampo('t1', 'Pintar')], null),
      );
      f.responder(
        'GET /busca?tipo=servicos',
        pagina([servico('s1', 'Aula de violão')], null),
      );
    });

    expect(await screen.findByText('Pintar')).toBeOnTheScreen();
    // O rótulo da categoria vem de GET /categorias.
    expect(await screen.findByText('Reformas · Lavras')).toBeOnTheScreen();
    expect(buscas(fetch).map((r) => r.query)).toEqual([
      { tipo: 'trampos', limite: '10' },
    ]);
    expect(screen.queryByText('Aula de violão')).toBeNull();
    expect(screen.queryByText(textos.inicio.servicos)).toBeNull();
    expect(
      await screen.findAllByRole('button', { name: textos.gerais.verTodos }),
    ).toHaveLength(1);
    expect(fetch.requisicoes.some((r) => r.caminho === '/categorias')).toBe(
      true,
    );
  });

  describe('destaque e dicas do freela (R3)', () => {
    const minha = (id: string, status: 'pendente' | 'aceita' | 'recusada') => ({
      id,
      trampoId: `t-${id}`,
      freelancerId: 'conta-eu',
      mensagem: 'm',
      valorPropostoCentavos: 100,
      status,
      criadaEm: '2026-10-20T12:00:00.000Z',
    });

    it('o destaque mostra quantas candidaturas estão em análise (só as pendentes)', async () => {
      const { fetch } = await abrir('/', (f) => {
        f.responder('GET /perfis/eu', { corpo: meuPerfil });
        f.responder('GET /busca', pagina([], null));
        f.responder('GET /candidaturas/minhas', {
          corpo: [
            minha('1', 'pendente'),
            minha('2', 'aceita'),
            minha('3', 'pendente'),
            minha('4', 'recusada'),
          ],
        });
      });

      expect(
        await screen.findByText(textos.inicioFreela.emAnalise(2)),
      ).toBeOnTheScreen();
      expect(
        fetch.requisicoes.filter((r) => r.caminho === '/candidaturas/minhas'),
      ).toHaveLength(1);
    });

    it('com candidaturas, mas nenhuma pendente, o destaque diz que não há nenhuma em análise (F1)', async () => {
      const { fetch } = await abrir('/', (f) => {
        f.responder('GET /perfis/eu', { corpo: meuPerfil });
        f.responder('GET /busca', pagina([], null));
        f.responder('GET /candidaturas/minhas', {
          corpo: [minha('2', 'aceita'), minha('4', 'recusada')],
        });
      });

      expect(
        await screen.findByText(textos.meusTrampos.vazioAnalise),
      ).toBeOnTheScreen();
      expect(
        screen.queryByText(textos.inicioFreela.semCandidaturas),
      ).toBeNull();
      expect(screen.queryByText(/^\d+ em análise$/)).toBeNull();
      expect(
        fetch.requisicoes.filter((r) => r.caminho === '/candidaturas/minhas'),
      ).toHaveLength(1);
    });

    it('sem nenhuma candidatura, o destaque diz que a pessoa ainda não se candidatou', async () => {
      await abrir('/', (f) => {
        f.responder('GET /perfis/eu', { corpo: meuPerfil });
        f.responder('GET /busca', pagina([], null));
        f.responder('GET /candidaturas/minhas', { corpo: [] });
      });

      expect(
        await screen.findByText(textos.inicioFreela.semCandidaturas),
      ).toBeOnTheScreen();
      expect(screen.queryByText(textos.meusTrampos.vazioAnalise)).toBeNull();
      expect(screen.queryByText(/em análise/)).toBeNull();
    });

    it('o cartão de dica abre Dicas & minicursos', async () => {
      await abrir('/', (f) => {
        f.responder('GET /perfis/eu', { corpo: meuPerfil });
        f.responder('GET /busca', pagina([], null));
        f.responder('GET /candidaturas/minhas', { corpo: [] });
      });

      await fireEvent.press(await screen.findByText(DICAS[0]?.titulo ?? ''));

      await waitFor(() => expect(screen).toHavePathname('/dicas'));
    });
  });

  describe('Início do contratante: vazio das demandas abertas (R2)', () => {
    const demanda = (id: string, status: string) => ({
      id,
      autorId: 'conta-eu',
      titulo: `Demanda ${id}`,
      descricao: 'd',
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 10000,
      prazo: null,
      status,
      criadoEm: '2026-10-20T12:00:00.000Z',
      candidaturasRecebidas: 0,
    });

    it('nunca publicou: "Você ainda não publicou demandas"', async () => {
      await abrir(
        '/',
        (f) => {
          f.responder('GET /perfis/eu', { corpo: meuPerfil });
          f.responder('GET /trampos/meus', { corpo: [] });
        },
        'contratante',
      );

      expect(
        await screen.findByText(textos.inicioContratante.semDemandas),
      ).toBeOnTheScreen();
      expect(screen.queryByText(textos.demandas.vazioAbertas)).toBeNull();
    });

    it('só há demandas em andamento: "Nenhuma demanda aberta", não "ainda não publicou"', async () => {
      await abrir(
        '/',
        (f) => {
          f.responder('GET /perfis/eu', { corpo: meuPerfil });
          f.responder('GET /trampos/meus', {
            corpo: [demanda('a', 'em_andamento'), demanda('b', 'encerrado')],
          });
        },
        'contratante',
      );

      expect(
        await screen.findByText(textos.demandas.vazioAbertas),
      ).toBeOnTheScreen();
      expect(
        screen.getByText(textos.inicioContratante.semAbertasTexto),
      ).toBeOnTheScreen();
      expect(
        screen.queryByText(textos.inicioContratante.semDemandas),
      ).toBeNull();
    });

    it('com uma demanda aberta, lista a aberta e não mostra vazio', async () => {
      await abrir(
        '/',
        (f) => {
          f.responder('GET /perfis/eu', { corpo: meuPerfil });
          f.responder('GET /trampos/meus', {
            corpo: [demanda('a', 'em_andamento'), demanda('c', 'aberto')],
          });
        },
        'contratante',
      );

      expect(await screen.findByText('Demanda c')).toBeOnTheScreen();
      expect(screen.queryByText('Demanda a')).toBeNull();
      expect(screen.queryByText(textos.demandas.vazioAbertas)).toBeNull();
    });
  });

  it('recentes com erro mostram "Tentar de novo" e recarregam', async () => {
    const { fetch } = await abrir('/', (f) => {
      f.responder('GET /perfis/eu', { corpo: meuPerfil });
      f.responder('GET /busca?tipo=servicos', pagina([], null));
      f.responder('GET /busca?tipo=trampos', [
        { status: 500, corpo: { erro: 'erro_interno' } },
        pagina([trampo('t1', 'Pintar')], null),
      ]);
    });

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.gerais.tentarDeNovo }),
    );

    expect(await screen.findByText('Pintar')).toBeOnTheScreen();
    expect(
      buscas(fetch).filter((r) => r.query.tipo === 'trampos'),
    ).toHaveLength(2);
  });

  it('"Ver todos" de trampos abre a busca de trampos, já listando (CA84)', async () => {
    const { fetch } = await abrir('/', (f) => {
      f.responder('GET /perfis/eu', { corpo: meuPerfil });
      f.responder('GET /busca', pagina([], null));
      f.responder(
        'GET /busca?tipo=trampos&limite=20',
        pagina([trampo('t9', 'Pintar o muro')], null),
      );
    });

    const verTodos = await screen.findAllByRole('button', {
      name: textos.gerais.verTodos,
    });
    await fireEvent.press(verTodos[0] as (typeof verTodos)[number]);

    await waitFor(() => expect(screen).toHavePathname('/buscar-trampos'));
    expect(screen).toHaveSearchParams({ tipo: 'trampos' });
    expect(await screen.findByText('Pintar o muro')).toBeOnTheScreen();
    expect(screen.getByText(textos.buscar.tituloTrampos)).toBeOnTheScreen();
    expect(buscas(fetch).at(-1)?.query).toEqual({
      tipo: 'trampos',
      limite: '20',
    });

    // É tela de pilha: voltar leva ao Início.
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('"Buscar" do Início abre a busca de trampos sem buscar ainda (CA84)', async () => {
    const { fetch } = await abrir('/', (f) => {
      f.responder('GET /perfis/eu', { corpo: meuPerfil });
      f.responder('GET /busca', pagina([], null));
    });
    await screen.findByText('Maria Souza', { exact: false });
    const antes = buscas(fetch).length;

    await fireEvent.press(
      screen.getByRole('button', { name: textos.inicio.buscar }),
    );

    await waitFor(() => expect(screen).toHavePathname('/buscar-trampos'));
    expect(await screen.findByText(textos.buscar.inicial)).toBeOnTheScreen();
    expect(buscas(fetch)).toHaveLength(antes);
  });

  it('abrir um recente leva ao detalhe do tipo certo', async () => {
    await abrir('/', (f) => {
      f.responder('GET /perfis/eu', { corpo: meuPerfil });
      f.responder(
        'GET /busca?tipo=trampos',
        pagina([trampo('t7', 'Pintar')], null),
      );
      f.responder('GET /busca?tipo=servicos', pagina([], null));
    });

    await fireEvent.press(await screen.findByText('Pintar'));

    await waitFor(() => expect(screen).toHavePathname('/trampos/t7'));
  });
});

describe('Buscar', () => {
  it('não requisita antes de enviar (nem a cada letra)', async () => {
    const { fetch } = await abrir('/buscar-trampos', () => undefined);

    expect(await screen.findByText(textos.buscar.inicial)).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText(textos.buscar.campoTrampos),
      'pintor',
    );

    expect(buscas(fetch)).toHaveLength(0);
  });

  it('ao enviar manda só os campos preenchidos e preserva a ordem da API', async () => {
    const { fetch } = await abrir('/buscar-trampos', (f) => {
      f.responder(
        'GET /busca',
        pagina([trampo('t2', 'Zeta'), trampo('t1', 'Alfa')], null),
      );
    });

    await fireEvent.changeText(
      await screen.findByLabelText(textos.buscar.campoTrampos),
      '  pintor ',
    );
    await fireEvent(
      screen.getByLabelText(textos.buscar.campoTrampos),
      'submitEditing',
    );

    expect(await screen.findByText('Zeta')).toBeOnTheScreen();
    expect(buscas(fetch)).toHaveLength(1);
    expect(buscas(fetch)[0]?.query).toEqual({
      texto: 'pintor',
      tipo: 'trampos',
      limite: '20',
    });
    expect(
      fetch.requisicoes.find((r) => r.caminho === '/busca')?.cabecalhos
        .authorization,
    ).toBe('Bearer token-teste');
    const titulos = screen
      .getAllByText(/^(Zeta|Alfa)$/)
      .map((no) => no.props.children);
    expect(titulos).toEqual(['Zeta', 'Alfa']);
    expect(screen.getByText('2 resultados')).toBeOnTheScreen();
  });

  it('categoria e cidade entram na query ao serem escolhidas', async () => {
    const { fetch } = await abrir('/buscar-trampos', (f) => {
      f.responder('GET /busca', pagina([trampo('t1', 'Alfa')], null));
    });

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Aulas e reforço' }),
    );
    await screen.findByText('Alfa');
    expect(buscas(fetch).at(-1)?.query).toEqual({
      categoria: 'aulas',
      tipo: 'trampos',
      limite: '20',
    });

    await fireEvent.press(
      screen.getByRole('button', {
        name: `${textos.buscar.cidade}: ${textos.buscar.todasCidades}`,
      }),
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.buscar.pesquisarCidade),
      'Lavras',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.buscar.aplicar }),
    );

    await waitFor(() =>
      expect(buscas(fetch).at(-1)?.query).toEqual({
        categoria: 'aulas',
        cidade: 'Lavras',
        tipo: 'trampos',
        limite: '20',
      }),
    );
  });

  it('"Carregar mais" manda antesDe e junta as páginas; a contagem leva "+"', async () => {
    const { fetch } = await abrir('/buscar-trampos', (f) => {
      f.responder('GET /busca', [
        pagina([trampo('t1', 'Alfa')], 'cursor-1'),
        pagina([trampo('t2', 'Beta')], null),
      ]);
    });

    await fireEvent(
      await screen.findByLabelText(textos.buscar.campoTrampos),
      'submitEditing',
    );
    expect(await screen.findByText('Alfa')).toBeOnTheScreen();
    expect(screen.getByText('1+ resultado')).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.carregarMais }),
    );

    expect(await screen.findByText('Beta')).toBeOnTheScreen();
    expect(buscas(fetch)[1]?.query).toEqual({
      tipo: 'trampos',
      limite: '20',
      antesDe: 'cursor-1',
    });
    expect(screen.getByText('2 resultados')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.gerais.carregarMais }),
    ).not.toBeOnTheScreen();
  });

  it('sem resultados: mostra o vazio e "Limpar filtros" zera e busca de novo', async () => {
    const { fetch } = await abrir('/buscar-trampos', (f) => {
      f.responder('GET /busca', pagina([], null));
    });

    await fireEvent.changeText(
      await screen.findByLabelText(textos.buscar.campoTrampos),
      'xyz',
    );
    await fireEvent(
      screen.getByLabelText(textos.buscar.campoTrampos),
      'submitEditing',
    );
    expect(
      await screen.findByText(textos.buscar.semResultados),
    ).toBeOnTheScreen();
    expect(buscas(fetch).at(-1)?.query).toMatchObject({ texto: 'xyz' });

    await fireEvent.press(
      screen.getAllByRole('button', {
        name: textos.buscar.limparFiltros,
      })[0] as never,
    );

    await waitFor(() => expect(buscas(fetch)).toHaveLength(2));
    expect(buscas(fetch).at(-1)?.query).toEqual({
      tipo: 'trampos',
      limite: '20',
    });
    expect(screen.getByLabelText(textos.buscar.campoTrampos).props.value).toBe(
      '',
    );
  });

  it('cada busca tem o seu tipo fixo, sem abas (CA84)', async () => {
    const { fetch } = await abrir('/buscar-trampos', (f) => {
      f.responder(
        'GET /busca?tipo=trampos',
        pagina([trampo('t1', 'Alfa')], null),
      );
      f.responder(
        'GET /busca?tipo=servicos',
        pagina([servico('s1', 'Violão')], null),
      );
    });

    expect(
      await screen.findByText(textos.buscar.tituloTrampos),
    ).toBeOnTheScreen();
    await fireEvent(
      screen.getByLabelText(textos.buscar.campoTrampos),
      'submitEditing',
    );
    expect(await screen.findByText('Alfa')).toBeOnTheScreen();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(buscas(fetch).at(-1)?.query).toEqual({
      tipo: 'trampos',
      limite: '20',
    });
  });

  it('a aba Buscar do contratante só busca serviços, sem abas (CA84)', async () => {
    const { fetch } = await abrir(
      '/buscar',
      (f) => {
        f.responder(
          'GET /busca?tipo=servicos',
          pagina([servico('s1', 'Violão')], null),
        );
      },
      'contratante',
    );

    expect(
      await screen.findByText(textos.buscarFreelancers.titulo),
    ).toBeOnTheScreen();
    await fireEvent(
      screen.getByLabelText(textos.buscarFreelancers.campo),
      'submitEditing',
    );
    expect(await screen.findByText('Violão')).toBeOnTheScreen();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(buscas(fetch).at(-1)?.query).toEqual({
      tipo: 'servicos',
      limite: '20',
    });
  });

  it('"Voltar" da busca de trampos sem histórico leva ao Início', async () => {
    await abrir('/buscar-trampos', (f) => {
      f.responder('GET /perfis/eu', { corpo: meuPerfil });
      f.responder('GET /busca', pagina([], null));
    });

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.gerais.voltar }),
    );

    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('erro de rede mostra "Tentar de novo" e recarrega', async () => {
    const { fetch } = await abrir('/buscar-trampos', (f) => {
      f.responder('GET /busca', [
        { falhaDeRede: true },
        pagina([trampo('t1', 'Alfa')], null),
      ]);
    });

    await fireEvent(
      await screen.findByLabelText(textos.buscar.campoTrampos),
      'submitEditing',
    );
    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );

    expect(await screen.findByText('Alfa')).toBeOnTheScreen();
    expect(buscas(fetch)).toHaveLength(2);
  });

  it('offline: não finge que não há resultados e não desenha a faixa (é da raiz)', async () => {
    onlineManager.setOnline(false);
    try {
      await abrir('/buscar-trampos', (f) => {
        f.responder('GET /busca', pagina([], null));
      });
      await fireEvent(
        await screen.findByLabelText(textos.buscar.campoTrampos),
        'submitEditing',
      );

      // A faixa é da raiz (CA56): a tela de Buscar não desenha a sua.
      await act(async () => {
        jest.advanceTimersByTime(50);
      });
      expect(screen.queryByText(textos.gerais.semConexaoFaixa)).toBeNull();
      expect(
        screen.queryByText(textos.buscar.semResultados),
      ).not.toBeOnTheScreen();
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
  });
});
