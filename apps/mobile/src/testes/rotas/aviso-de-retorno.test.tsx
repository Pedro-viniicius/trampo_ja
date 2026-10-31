// Etapa 16 da L4 (CA63): o toast de retorno ("excluído", "já não existe",
// "alterações salvas") também aparece quando a volta cai no Início ou na
// Busca, não só em Meus anúncios e nos detalhes. Rotas reais (abas incluídas)
// com o fake de `fetch`; o servidor do teste guarda os anúncios e responde à
// exclusão.
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import LayoutDasAbas from '../../app/(app)/(abas)/_layout';
import BuscarRota from '../../app/(app)/(abas)/buscar';
import InicioRota from '../../app/(app)/(abas)/index';
import RotaDoServico from '../../app/(app)/servicos/[id]';
import RotaDoTrampo from '../../app/(app)/trampos/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import {
  avisarAoVoltar,
  esquecerAvisoDeRetorno,
  VALIDADE_DO_AVISO_MS,
} from '../../estado/aviso-de-retorno';
import { type Sessao, useSessao } from '../../estado/sessao';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { vigiarConsole } from '../qa/apoio-qa';
import {
  type MapaDeRotas,
  type RotasRenderizadas,
  renderizarRotas,
  TOKEN_DE_TESTE,
} from './apoio';

const a = textos.anuncio;

const CATEGORIAS = [
  { id: 'pintura', rotulo: 'Pintura e reparos' },
  { id: 'aulas', rotulo: 'Aulas e reforço' },
];

const PERFIL_COMPLETO = {
  contaId: 'conta-ana',
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

interface AnuncioDoServidor {
  id: string;
  tipo: 'trampo' | 'servico';
  titulo: string;
}

function itemDaBusca(anuncio: AnuncioDoServidor) {
  return anuncio.tipo === 'trampo'
    ? {
        tipo: 'trampo',
        id: anuncio.id,
        autorId: 'conta-ana',
        titulo: anuncio.titulo,
        categoria: 'pintura',
        cidade: 'Lavras',
        criadoEm: '2026-10-04T12:00:00.000Z',
        valorCentavos: 150000,
      }
    : {
        tipo: 'servico',
        id: anuncio.id,
        autorId: 'conta-ana',
        titulo: anuncio.titulo,
        categoria: 'aulas',
        cidade: null,
        criadoEm: '2026-10-04T12:00:00.000Z',
        precoBaseCentavos: 8000,
      };
}

function servicoDoAutor(titulo: string) {
  return {
    id: 's1',
    autorId: 'conta-ana',
    titulo,
    descricao: 'Aulas para iniciantes, na sua casa.',
    categoria: 'aulas',
    cidade: null,
    precoBaseCentavos: 8000,
    status: 'ativo',
    criadoEm: '2026-10-04T12:00:00.000Z',
    versao: 7,
  };
}

/** Os anúncios são da própria Ana: o detalhe mostra "Mais opções". */
function criarServidor(opcoes: { jaRemovidoNoServidor?: boolean } = {}) {
  const anuncios: AnuncioDoServidor[] = [
    { id: 't1', tipo: 'trampo', titulo: 'Pintar a sala' },
    { id: 's1', tipo: 'servico', titulo: 'Aulas de violão' },
  ];
  const tipoDe = (tipo: 'trampo' | 'servico') =>
    anuncios.filter((x) => x.tipo === tipo);
  const remover = (id: string) => {
    const i = anuncios.findIndex((x) => x.id === id);
    if (i >= 0) anuncios.splice(i, 1);
  };
  const naoEncontrado = { status: 404, corpo: { erro: 'nao_encontrado' } };

  const fetch = criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /perfis/conta-ana', { corpo: PERFIL_COMPLETO })
    .responder('GET /candidaturas/minhas', { corpo: [] })
    .responder('GET /trampos/meus', () => ({
      corpo: tipoDe('trampo').map((x) => ({
        id: x.id,
        autorId: 'conta-ana',
        titulo: x.titulo,
        descricao: 'Duas demãos de tinta branca.',
        categoria: 'pintura',
        cidade: 'Lavras',
        valorCentavos: 150000,
        prazo: null,
        status: 'aberto',
        criadoEm: '2026-10-04T12:00:00.000Z',
        versao: 3,
        candidaturasRecebidas: 0,
      })),
    }))
    .responder('GET /servicos/meus', () => ({
      corpo: tipoDe('servico').map((x) => servicoDoAutor(x.titulo)),
    }))
    .responder('GET /busca', (r) => {
      const tipo = r.query.tipo === 'servicos' ? 'servico' : 'trampo';
      return {
        corpo: { itens: tipoDe(tipo).map(itemDaBusca), proximoCursor: null },
      };
    })
    .responder('GET /trampos/t1', () => {
      const achado = anuncios.find((x) => x.id === 't1');
      return achado === undefined
        ? naoEncontrado
        : {
            corpo: {
              id: 't1',
              autorId: 'conta-ana',
              titulo: achado.titulo,
              descricao: 'Duas demãos de tinta branca.',
              categoria: 'pintura',
              cidade: 'Lavras',
              valorCentavos: 150000,
              prazo: null,
              status: 'aberto',
              criadoEm: '2026-10-04T12:00:00.000Z',
              versao: 3,
              candidaturasRecebidas: 0,
            },
          };
    })
    .responder('GET /trampos/t1/candidaturas', { corpo: [] })
    .responder('GET /servicos/s1', () => {
      const achado = anuncios.find((x) => x.id === 's1');
      return achado === undefined
        ? naoEncontrado
        : {
            corpo: servicoDoAutor(achado.titulo),
          };
    });
  for (const [rota, id] of [
    ['DELETE /trampos/t1', 't1'],
    ['DELETE /servicos/s1', 's1'],
  ] as const) {
    fetch.responder(rota, () => {
      remover(id);
      // `jaRemovidoNoServidor`: outro aparelho já tinha excluído.
      return opcoes.jaRemovidoNoServidor === true
        ? naoEncontrado
        : { status: 204 };
    });
  }
  return { fetch, anuncios };
}

let sessaoDaSonda: Sessao | null = null;

/** Layout da área autenticada com uma sonda que guarda a sessão. */
function LayoutComSonda() {
  sessaoDaSonda = useSessao();
  return <LayoutDaAreaAutenticada />;
}

const ROTAS: MapaDeRotas = {
  '(app)/_layout': LayoutComSonda,
  '(app)/(abas)/_layout': LayoutDasAbas,
  '(app)/(abas)/index': InicioRota,
  '(app)/(abas)/buscar': BuscarRota,
  '(app)/(abas)/conversas': () => <Text>stub: conversas</Text>,
  '(app)/(abas)/perfil': () => <Text>stub: perfil</Text>,
  '(app)/(abas)/publicar': () => <Text>stub: publicar</Text>,
  '(app)/trampos/[id]': RotaDoTrampo,
  '(app)/servicos/[id]': RotaDoServico,
  '(app)/perfis/[contaId]': () => <Text>stub: perfil público</Text>,
};

async function abrir(
  url: string,
  servidor = criarServidor(),
): Promise<RotasRenderizadas & { servidor: typeof servidor }> {
  const rotas = await renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch: servidor.fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
  return Object.assign(rotas, { servidor });
}

function requisicoes(fetch: FetchFalso, metodo: string, caminho: string) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

const avancar = (ms = 50) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

const acao = (nome: string) => screen.getByRole('button', { name: nome });

/** O botão do diálogo repete o nome do botão da folha: é o último. */
function botaoDoDialogo(nome: string) {
  const ultimo = screen.getAllByRole('button', { name: nome }).at(-1);
  if (ultimo === undefined) throw new Error(`sem botão "${nome}"`);
  return ultimo;
}

/** No detalhe aberto: "Mais opções" > excluir > confirmar. */
async function excluirPeloDetalhe(
  titulo: string,
  nomeDaAcao: string,
): Promise<void> {
  await fireEvent.press(
    await screen.findByRole('button', { name: a.maisOpcoes(titulo) }),
  );
  await screen.findByText(a.folhaTitulo(titulo));
  await fireEvent.press(acao(nomeDaAcao));
  await fireEvent.press(botaoDoDialogo(nomeDaAcao));
}

async function fecharToast() {
  await fireEvent.press(
    screen.getByRole('button', { name: textos.gerais.toastFechar }),
  );
}

vigiarConsole();

afterEach(() => {
  esquecerAvisoDeRetorno();
  sessaoDaSonda = null;
});

describe('Busca: excluir pelo detalhe aberto dela (CA63)', () => {
  it('trampo: volta à Busca, que mostra "Trampo excluído." uma vez só', async () => {
    const { servidor } = await abrir('/buscar?tipo=trampos&pedido=1');
    await fireEvent.press(await screen.findByText('Pintar a sala'));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));

    await excluirPeloDetalhe('Pintar a sala', a.excluirTrampo);

    expect(await screen.findByText(a.trampoExcluido)).toBeOnTheScreen();
    expect(screen).toHavePathname('/buscar');
    expect(screen.getAllByText(a.trampoExcluido)).toHaveLength(1);
    expect(requisicoes(servidor.fetch, 'DELETE', '/trampos/t1')).toHaveLength(
      1,
    );

    // Fechado, não volta.
    await fecharToast();
    expect(screen.queryByText(a.trampoExcluido)).toBeNull();
    await avancar();
    await avancar();
    expect(screen.queryByText(a.trampoExcluido)).toBeNull();
  });

  it('serviço: volta à Busca, que mostra "Serviço excluído."', async () => {
    await abrir('/buscar?tipo=servicos&pedido=1');
    await fireEvent.press(await screen.findByText('Aulas de violão'));
    await waitFor(() => expect(screen).toHavePathname('/servicos/s1'));

    await excluirPeloDetalhe('Aulas de violão', a.excluirServico);

    expect(await screen.findByText(a.servicoExcluido)).toBeOnTheScreen();
    expect(screen).toHavePathname('/buscar');
  });

  it('excluído em outro aparelho (404): a Busca mostra "já não existe"', async () => {
    await abrir(
      '/buscar?tipo=trampos&pedido=1',
      criarServidor({ jaRemovidoNoServidor: true }),
    );
    await fireEvent.press(await screen.findByText('Pintar a sala'));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));

    await excluirPeloDetalhe('Pintar a sala', a.excluirTrampo);

    expect(await screen.findByText(a.jaNaoExiste)).toBeOnTheScreen();
    expect(screen).toHavePathname('/buscar');
    expect(screen.queryByText(a.erroAoExcluir)).toBeNull();
  });
});

describe('Início: excluir pelo detalhe aberto dele (CA63)', () => {
  it('trampo: volta ao Início, que mostra "Trampo excluído."', async () => {
    const { servidor } = await abrir('/');
    await fireEvent.press(await screen.findByText('Pintar a sala'));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));

    await excluirPeloDetalhe('Pintar a sala', a.excluirTrampo);

    expect(await screen.findByText(a.trampoExcluido)).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
    expect(screen.getAllByText(a.trampoExcluido)).toHaveLength(1);
    expect(requisicoes(servidor.fetch, 'DELETE', '/trampos/t1')).toHaveLength(
      1,
    );

    await fecharToast();
    expect(screen.queryByText(a.trampoExcluido)).toBeNull();
  });

  it('serviço: volta ao Início, que mostra "Serviço excluído."', async () => {
    await abrir('/');
    await fireEvent.press(await screen.findByText('Aulas de violão'));
    await waitFor(() => expect(screen).toHavePathname('/servicos/s1'));

    await excluirPeloDetalhe('Aulas de violão', a.excluirServico);

    expect(await screen.findByText(a.servicoExcluido)).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });

  it('excluído em outro aparelho (404): o Início mostra "já não existe"', async () => {
    await abrir('/', criarServidor({ jaRemovidoNoServidor: true }));
    await fireEvent.press(await screen.findByText('Pintar a sala'));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));

    await excluirPeloDetalhe('Pintar a sala', a.excluirTrampo);

    expect(await screen.findByText(a.jaNaoExiste)).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });
});

describe('o aviso vai só à aba em foco, dentro do prazo e da sessão', () => {
  const avisar = (chave: Parameters<typeof avisarAoVoltar>[0]) =>
    act(async () => {
      avisarAoVoltar(chave, sessaoDaSonda?.geracao() ?? -1);
    });

  it('"Alterações salvas." aparece no Início e na Busca', async () => {
    await abrir('/');
    await screen.findByText('Olá, Ana Lima');
    await avisar('alteracoes_salvas');
    expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();
    await fecharToast();
    expect(screen.queryByText(a.alteracoesSalvas)).toBeNull();

    await act(async () => {
      router.navigate('/buscar');
    });
    await waitFor(() => expect(screen).toHavePathname('/buscar'));
    await avisar('alteracoes_salvas');
    expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();
  });

  it('a aba sob outra tela espera: o aviso aparece quando ela volta ao foco', async () => {
    await abrir('/');
    await screen.findByText('Olá, Ana Lima');
    await act(async () => {
      router.push('/perfis/c1');
    });
    await screen.findByText('stub: perfil público');
    await avisar('servico_excluido');
    // Sob o perfil, o Início não recebe nada ainda (nem escondido na árvore).
    expect(
      screen.queryByText(a.servicoExcluido, { includeHiddenElements: true }),
    ).toBeNull();

    await act(async () => {
      router.back();
    });
    expect(await screen.findByText(a.servicoExcluido)).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });

  it('a Busca sob outra tela também espera e mostra o aviso ao voltar ao foco', async () => {
    await abrir('/buscar');
    await screen.findByText(textos.buscar.inicial);
    await act(async () => {
      router.push('/perfis/c1');
    });
    await screen.findByText('stub: perfil público');
    await avisar('trampo_excluido');
    expect(
      screen.queryByText(a.trampoExcluido, { includeHiddenElements: true }),
    ).toBeNull();

    await act(async () => {
      router.back();
    });
    expect(await screen.findByText(a.trampoExcluido)).toBeOnTheScreen();
    expect(screen).toHavePathname('/buscar');
  });

  it('aviso vencido (mais de 10 s) não aparece quando a aba volta', async () => {
    await abrir('/');
    await screen.findByText('Olá, Ana Lima');
    await act(async () => {
      router.push('/perfis/c1');
    });
    await screen.findByText('stub: perfil público');
    await avisar('trampo_excluido');
    await avancar(VALIDADE_DO_AVISO_MS + 1);

    await act(async () => {
      router.back();
    });
    await screen.findByText('Olá, Ana Lima');
    await avancar();
    expect(screen.queryByText(a.trampoExcluido)).toBeNull();
  });

  it('aviso de outra sessão (geração) não aparece', async () => {
    await abrir('/');
    await screen.findByText('Olá, Ana Lima');
    await act(async () => {
      router.push('/perfis/c1');
    });
    await screen.findByText('stub: perfil público');
    await act(async () => {
      avisarAoVoltar('trampo_excluido', (sessaoDaSonda?.geracao() ?? 0) + 1);
    });

    await act(async () => {
      router.back();
    });
    await screen.findByText('Olá, Ana Lima');
    await avancar();
    expect(screen.queryByText(a.trampoExcluido)).toBeNull();
  });
});
