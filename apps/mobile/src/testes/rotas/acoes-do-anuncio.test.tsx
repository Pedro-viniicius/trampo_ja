// Etapa 15 da L2: "Mais opções" (editar, encerrar, excluir) nas rotas de Meus
// anúncios e dos dois detalhes, só para o autor (CA33), e o aviso de retorno
// "Alterações salvas." (CA32). Rotas reais com o fake de `fetch`; o servidor
// do teste guarda os anúncios e responde às ações, para a tela mostrar o que
// a API mostraria depois.
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import RotaDasDemandas from '../../app/(app)/(abas)/demandas';
import RotaDasCandidaturasRecebidas from '../../app/(app)/candidaturas/[trampoId]';
import RotaDosMeusAnuncios from '../../app/(app)/meus-anuncios';
import RotaDoServico from '../../app/(app)/servicos/[id]';
import RotaDeEditarServico from '../../app/(app)/servicos/editar/[id]';
import RotaDoTrampo from '../../app/(app)/trampos/[id]';
import RotaDeEditarTrampo from '../../app/(app)/trampos/editar/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { esquecerAvisoDeRetorno } from '../../estado/aviso-de-retorno';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { tocarNoMesmoTick } from '../qa/apoio-conversas-2c';
import { vigiarConsole } from '../qa/apoio-qa';
import { type MapaDeRotas, renderizarRotas, TOKEN_DE_TESTE } from './apoio';

const a = textos.anuncio;
const t = textos.formularioDeAnuncio;

// --- Dados ---

type StatusDoTrampo = 'aberto' | 'em_andamento' | 'encerrado';

interface TrampoDoServidor {
  id: string;
  autorId: string;
  titulo: string;
  descricao: string;
  categoria: string;
  cidade: string;
  valorCentavos: number;
  prazo: string | null;
  status: StatusDoTrampo;
  criadoEm: string;
  versao?: number;
  candidaturasRecebidas?: number;
}

interface ServicoDoServidor {
  id: string;
  autorId: string;
  titulo: string;
  descricao: string;
  categoria: string;
  cidade: string | null;
  precoBaseCentavos: number;
  status: 'ativo';
  criadoEm: string;
  versao?: number;
}

function trampo(
  id: string,
  titulo: string,
  status: StatusDoTrampo,
  candidaturas: number,
  dia: number,
): TrampoDoServidor {
  return {
    id,
    autorId: 'conta-ana',
    titulo,
    descricao: 'Duas demãos de tinta branca.',
    categoria: 'pintura',
    cidade: 'Lavras',
    valorCentavos: 150000,
    prazo: null,
    status,
    criadoEm: `2026-10-0${dia}T12:00:00.000Z`,
    versao: 3,
    candidaturasRecebidas: candidaturas,
  };
}

function servico(
  id: string,
  titulo: string,
  autorId: string,
  doAutor: boolean,
): ServicoDoServidor {
  return {
    id,
    autorId,
    titulo,
    descricao: 'Aulas para iniciantes, na sua casa.',
    categoria: 'aulas',
    cidade: null,
    precoBaseCentavos: 8000,
    status: 'ativo',
    criadoEm: '2026-10-01T12:00:00.000Z',
    ...(doAutor && { versao: 7 }),
  };
}

const CATEGORIAS = [
  { id: 'pintura', rotulo: 'Pintura e reparos' },
  { id: 'aulas', rotulo: 'Aulas e reforço' },
];

const PERFIL_COMPLETO = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

/** O trampo de outra conta: sem `versao` nem contagem. */
const TRAMPO_DE_TERCEIRO: TrampoDoServidor = {
  id: 't9',
  autorId: 'conta-bia',
  titulo: 'Pintar a casa do vizinho',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'pintura',
  cidade: 'Lavras',
  valorCentavos: 150000,
  prazo: null,
  status: 'aberto',
  criadoEm: '2026-10-05T12:00:00.000Z',
};

const SERVICO_DE_TERCEIRO = servico(
  's9',
  'Aulas de inglês',
  'conta-bia',
  false,
);

interface Servidor {
  readonly fetch: FetchFalso;
  readonly trampos: TrampoDoServidor[];
  readonly servicos: ServicoDoServidor[];
}

/** Os anúncios da Ana, mais um trampo e um serviço de outra conta. */
function criarServidor(): Servidor {
  const trampos = [
    trampo('t1', 'Pintar a sala', 'aberto', 0, 4),
    trampo('t2', 'Trocar o telhado', 'aberto', 2, 3),
    trampo('t3', 'Montar estante', 'em_andamento', 1, 2),
    trampo('t4', 'Limpar o quintal', 'encerrado', 0, 1),
  ];
  const servicos = [servico('s1', 'Aulas de violão', 'conta-ana', true)];
  const fetch = criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /trampos/meus', () => ({ corpo: trampos }))
    .responder('GET /servicos/meus', () => ({ corpo: servicos }));

  for (const id of ['t1', 't2', 't3', 't4']) {
    fetch
      .responder(`GET /trampos/${id}`, () => {
        const achado = trampos.find((x) => x.id === id);
        return achado === undefined
          ? { status: 404, corpo: { erro: 'nao_encontrado' } }
          : { corpo: achado };
      })
      .responder(`GET /trampos/${id}/candidaturas`, { corpo: [] })
      .responder(`POST /trampos/${id}/encerrar`, () => {
        const achado = trampos.find((x) => x.id === id);
        if (achado !== undefined) achado.status = 'encerrado';
        return { status: 204 };
      })
      .responder(`DELETE /trampos/${id}`, () => {
        const i = trampos.findIndex((x) => x.id === id);
        if (i >= 0) trampos.splice(i, 1);
        return { status: 204 };
      })
      .responder(`PUT /trampos/${id}`, (r) => {
        const achado = trampos.find((x) => x.id === id);
        const corpo = r.corpo as { titulo: string };
        if (achado !== undefined) achado.titulo = corpo.titulo;
        return { status: 204 };
      });
  }
  fetch.responder('GET /trampos/t9', { corpo: TRAMPO_DE_TERCEIRO });

  fetch
    .responder('GET /servicos/s1', () => {
      const achado = servicos.find((x) => x.id === 's1');
      return achado === undefined
        ? { status: 404, corpo: { erro: 'nao_encontrado' } }
        : { corpo: achado };
    })
    .responder('DELETE /servicos/s1', () => {
      const i = servicos.findIndex((x) => x.id === 's1');
      if (i >= 0) servicos.splice(i, 1);
      return { status: 204 };
    })
    .responder('PUT /servicos/s1', (r) => {
      const achado = servicos.find((x) => x.id === 's1');
      const corpo = r.corpo as { titulo: string };
      if (achado !== undefined) achado.titulo = corpo.titulo;
      return { status: 204 };
    })
    .responder('GET /servicos/s9', { corpo: SERVICO_DE_TERCEIRO });
  return { fetch, trampos, servicos };
}

function stub(texto: string) {
  return function Stub() {
    return <Text>{texto}</Text>;
  };
}

const ROTAS: MapaDeRotas = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/(abas)/index': stub('stub: início'),
  '(app)/(abas)/demandas': RotaDasDemandas,
  '(app)/meus-anuncios': RotaDosMeusAnuncios,
  '(app)/trampos/[id]': RotaDoTrampo,
  '(app)/trampos/editar/[id]': RotaDeEditarTrampo,
  '(app)/servicos/[id]': RotaDoServico,
  '(app)/servicos/editar/[id]': RotaDeEditarServico,
  '(app)/candidaturas/[trampoId]': RotaDasCandidaturasRecebidas,
  '(app)/perfis/[contaId]': stub('stub: perfil'),
};

async function abrir(url: string, servidor: Servidor = criarServidor()) {
  const rotas = await renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch: servidor.fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
  return { ...rotas, servidor };
}

// --- Apoio ---

function requisicoes(fetch: FetchFalso, metodo: string, caminho: string) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

const avancar = (ms = 50) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

const botaoMaisOpcoes = (titulo: string) =>
  screen.findByRole('button', { name: a.maisOpcoes(titulo) });

/** Abre "Mais opções" do anúncio e espera a folha. */
async function abrirFolha(titulo: string) {
  await fireEvent.press(await botaoMaisOpcoes(titulo));
  await screen.findByText(a.folhaTitulo(titulo));
}

const acao = (nome: string) => screen.getByRole('button', { name: nome });

/** O botão do diálogo repete o nome do botão da folha: é o último. */
function botaoDoDialogo(nome: string) {
  const ultimo = screen.getAllByRole('button', { name: nome }).at(-1);
  if (ultimo === undefined) throw new Error(`sem botão "${nome}"`);
  return ultimo;
}

/** O cartão do anúncio na lista (o nome acessível começa pelo tipo). */
/** Demandas filtra por status (CA79): abre a aba Abertas, Em andamento ou Encerradas. */
async function abrirAbaDeDemandas(nome: string) {
  await fireEvent.press(await screen.findByRole('tab', { name: nome }));
}

function cartao(tipo: 'Trampo' | 'Serviço', titulo: string) {
  return screen.findByRole('button', {
    name: new RegExp(`^${tipo}, ${titulo}`),
  });
}

async function fecharToast() {
  await fireEvent.press(
    screen.getByRole('button', { name: textos.gerais.toastFechar }),
  );
}

async function esperarAsListas() {
  await avancar();
  await avancar();
}

vigiarConsole();

afterEach(() => {
  esquecerAvisoDeRetorno();
});

// --- CA33: quem vê o botão ---

describe('"Mais opções": só para o autor (CA33)', () => {
  it('Meus anúncios mostra um botão por trampo e por serviço', async () => {
    await abrir('/demandas');
    // Demandas mostra cada trampo na aba do seu status (CA79).
    for (const [aba, titulos] of [
      [textos.demandas.abaAbertas, ['Pintar a sala', 'Trocar o telhado']],
      [textos.demandas.abaAndamento, ['Montar estante']],
      [textos.demandas.abaEncerradas, ['Limpar o quintal']],
    ] as const) {
      await abrirAbaDeDemandas(aba);
      for (const titulo of titulos) {
        expect(await botaoMaisOpcoes(titulo)).toBeOnTheScreen();
      }
    }

    await act(async () => {
      router.replace('/meus-anuncios?tipo=servico');
    });
    expect(await botaoMaisOpcoes('Aulas de violão')).toBeOnTheScreen();
  });

  it('o caminho antigo de Meus trampos (`?tipo=trampo`) leva a Demandas, com o botão (CA77)', async () => {
    await abrir('/meus-anuncios?tipo=trampo');
    expect(await botaoMaisOpcoes('Pintar a sala')).toBeOnTheScreen();
    expect(screen).toHavePathname('/demandas');
  });

  it('o detalhe do trampo tem o botão para o autor e não para um terceiro', async () => {
    const { servidor } = await abrir('/trampos/t1');
    expect(await botaoMaisOpcoes('Pintar a sala')).toBeOnTheScreen();
    // D46: o autor vem do próprio trampo, sem a lista "meus".
    expect(requisicoes(servidor.fetch, 'GET', '/trampos/meus')).toHaveLength(0);

    await act(async () => {
      router.replace('/trampos/t9');
    });
    expect(
      await screen.findByText('Pintar a casa do vizinho'),
    ).toBeOnTheScreen();
    await esperarAsListas();
    expect(
      screen.queryByRole('button', {
        name: a.maisOpcoes('Pintar a casa do vizinho'),
      }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /Mais opções/ })).toBeNull();
  });

  it('o detalhe do serviço tem o botão para o autor e não para um terceiro', async () => {
    await abrir('/servicos/s1');
    expect(await botaoMaisOpcoes('Aulas de violão')).toBeOnTheScreen();

    await act(async () => {
      router.replace('/servicos/s9');
    });
    expect(await screen.findByText('Aulas de inglês')).toBeOnTheScreen();
    await esperarAsListas();
    expect(screen.queryByRole('button', { name: /Mais opções/ })).toBeNull();
  });
});

// --- CA33: ações desabilitadas com o motivo ---

describe('a folha: ação indisponível aparece desabilitada com o motivo (CA33)', () => {
  it('trampo aberto e sem candidaturas: as três ações disponíveis', async () => {
    await abrir('/demandas');
    await abrirFolha('Pintar a sala');
    expect(acao(a.editar)).toBeEnabled();
    expect(acao(a.encerrarTrampo)).toBeEnabled();
    expect(acao(a.excluirTrampo)).toBeEnabled();
    expect(screen.queryByText(a.motivoEditarComCandidaturas)).toBeNull();
  });

  it('com candidaturas: só Editar fica desabilitado', async () => {
    await abrir('/demandas');
    await abrirFolha('Trocar o telhado');
    expect(acao(a.editar)).toBeDisabled();
    expect(screen.getByText(a.motivoEditarComCandidaturas)).toBeOnTheScreen();
    expect(acao(a.encerrarTrampo)).toBeEnabled();
    expect(acao(a.excluirTrampo)).toBeEnabled();
  });

  it('em andamento: Editar e Excluir desabilitados, Encerrar disponível', async () => {
    await abrir('/demandas');
    await abrirAbaDeDemandas(textos.demandas.abaAndamento);
    await abrirFolha('Montar estante');
    expect(acao(a.editar)).toBeDisabled();
    expect(screen.getByText(a.motivoEditarEmAndamento)).toBeOnTheScreen();
    expect(acao(a.encerrarTrampo)).toBeEnabled();
    expect(acao(a.excluirTrampo)).toBeDisabled();
    expect(screen.getByText(a.motivoExcluirNaoAberto)).toBeOnTheScreen();
  });

  it('encerrado: sem Encerrar, Editar e Excluir desabilitados', async () => {
    await abrir('/demandas');
    await abrirAbaDeDemandas(textos.demandas.abaEncerradas);
    await abrirFolha('Limpar o quintal');
    expect(acao(a.editar)).toBeDisabled();
    expect(screen.getByText(a.motivoEditarEncerrado)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: a.encerrarTrampo })).toBeNull();
    expect(acao(a.excluirTrampo)).toBeDisabled();
    expect(screen.getByText(a.motivoExcluirNaoAberto)).toBeOnTheScreen();
  });

  it('no detalhe, o status e a contagem vêm do próprio detalhe (R6)', async () => {
    await abrir('/trampos/t3');
    await abrirFolha('Montar estante');
    expect(acao(a.editar)).toBeDisabled();
    expect(screen.getByText(a.motivoEditarEmAndamento)).toBeOnTheScreen();
    expect(acao(a.encerrarTrampo)).toBeEnabled();
    expect(acao(a.excluirTrampo)).toBeDisabled();
  });

  it('no detalhe, a lista "minha" velha só diz que é o autor: a folha segue o detalhe (R6)', async () => {
    const servidor = criarServidor();
    // A lista ainda o vê aberto e sem candidaturas; o detalhe é mais novo.
    servidor.fetch.responder('GET /trampos/meus', () => ({
      corpo: [trampo('t3', 'Montar estante', 'aberto', 0, 2)],
    }));
    await abrir('/trampos/t3', servidor);
    await abrirFolha('Montar estante');
    expect(acao(a.editar)).toBeDisabled();
    expect(screen.getByText(a.motivoEditarEmAndamento)).toBeOnTheScreen();
    expect(acao(a.excluirTrampo)).toBeDisabled();
    expect(screen.getByText(a.motivoExcluirNaoAberto)).toBeOnTheScreen();
  });

  it('serviço: Editar e Excluir disponíveis e sem Encerrar', async () => {
    await abrir('/servicos/s1');
    await abrirFolha('Aulas de violão');
    expect(acao(a.editar)).toBeEnabled();
    expect(acao(a.excluirServico)).toBeEnabled();
    expect(screen.queryByRole('button', { name: a.encerrarTrampo })).toBeNull();
  });
});

// --- CA33: encerrar ---

describe('encerrar (CA33)', () => {
  it('o diálogo diz o efeito; confirmar encerra, mostra o toast e o selo "Encerrado"', async () => {
    const { servidor } = await abrir('/demandas');
    await abrirAbaDeDemandas(textos.demandas.abaEncerradas);
    expect(await screen.findAllByText(textos.selos.encerrado)).toHaveLength(1);

    await abrirAbaDeDemandas(textos.demandas.abaAbertas);
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.encerrarTrampo));
    expect(await screen.findByText(a.encerrarTitulo)).toBeOnTheScreen();
    expect(screen.getByText(a.encerrarTextoAberto)).toBeOnTheScreen();
    expect(
      requisicoes(servidor.fetch, 'POST', '/trampos/t1/encerrar'),
    ).toHaveLength(0);

    await fireEvent.press(botaoDoDialogo(a.encerrarConfirmar));

    expect(await screen.findByText(a.trampoEncerrado)).toBeOnTheScreen();
    expect(
      requisicoes(servidor.fetch, 'POST', '/trampos/t1/encerrar'),
    ).toHaveLength(1);
    // O trampo encerrado sai de Abertas e aparece em Encerradas.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: a.maisOpcoes('Pintar a sala') }),
      ).toBeNull(),
    );
    await abrirAbaDeDemandas(textos.demandas.abaEncerradas);
    await waitFor(() =>
      expect(screen.getAllByText(textos.selos.encerrado)).toHaveLength(2),
    );
    expect(screen.queryByText(a.encerrarTitulo)).toBeNull();
  });

  it('em andamento, o diálogo traz a mensagem do status', async () => {
    await abrir('/demandas');
    await abrirAbaDeDemandas(textos.demandas.abaAndamento);
    await abrirFolha('Montar estante');
    await fireEvent.press(acao(a.encerrarTrampo));
    expect(
      await screen.findByText(a.encerrarTextoEmAndamento),
    ).toBeOnTheScreen();
  });

  it('cancelar o diálogo não encerra', async () => {
    const { servidor } = await abrir('/demandas');
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.encerrarTrampo));
    await fireEvent.press(
      await screen.findByRole('button', { name: a.cancelar }),
    );
    await avancar();
    expect(
      requisicoes(servidor.fetch, 'POST', '/trampos/t1/encerrar'),
    ).toHaveLength(0);
  });

  it('no detalhe: toast no próprio detalhe e selo "Encerrado" no lugar do "Aberto"', async () => {
    await abrir('/trampos/t1');
    expect(
      await screen.findByText(textos.detalheTrampo.seloAberto),
    ).toBeOnTheScreen();
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.encerrarTrampo));
    await fireEvent.press(botaoDoDialogo(a.encerrarConfirmar));

    expect(await screen.findByText(a.trampoEncerrado)).toBeOnTheScreen();
    expect(
      await screen.findByText(textos.detalheTrampo.seloEncerrado),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.detalheTrampo.seloAberto)).toBeNull();
    expect(screen).toHavePathname('/trampos/t1');
  });

  it('Candidaturas recebidas mostra o selo "Encerrado" do trampo encerrado', async () => {
    await abrir('/candidaturas/t4');
    expect(await screen.findByText(textos.selos.encerrado)).toBeOnTheScreen();
    expect(
      screen.getByText(textos.candidaturasRecebidas.trampoEncerrado),
    ).toBeOnTheScreen();
  });
});

// --- CA33: excluir ---

describe('excluir pela lista (CA33)', () => {
  it('trampo sem candidaturas: o diálogo diz o efeito; confirmar exclui, mostra o toast e tira da lista', async () => {
    const { servidor } = await abrir('/demandas');
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.excluirTrampo));
    expect(await screen.findByText(a.excluirTrampoTitulo)).toBeOnTheScreen();
    expect(screen.getByText(a.excluirTrampoTexto(0))).toBeOnTheScreen();
    expect(requisicoes(servidor.fetch, 'DELETE', '/trampos/t1')).toHaveLength(
      0,
    );

    await fireEvent.press(botaoDoDialogo(a.excluirTrampo));

    expect(await screen.findByText(a.trampoExcluido)).toBeOnTheScreen();
    expect(requisicoes(servidor.fetch, 'DELETE', '/trampos/t1')).toHaveLength(
      1,
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: a.maisOpcoes('Pintar a sala') }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole('button', { name: a.maisOpcoes('Trocar o telhado') }),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/demandas');
  });

  it('com candidaturas, o diálogo conta quantas somem junto', async () => {
    await abrir('/demandas');
    await abrirFolha('Trocar o telhado');
    await fireEvent.press(acao(a.excluirTrampo));
    expect(await screen.findByText(a.excluirTrampoTexto(2))).toBeOnTheScreen();
    expect(a.excluirTrampoTexto(2)).toContain('2 candidaturas');
  });

  it('serviço: exclui e mostra "Serviço excluído."', async () => {
    const { servidor } = await abrir('/meus-anuncios?tipo=servico');
    await abrirFolha('Aulas de violão');
    await fireEvent.press(acao(a.excluirServico));
    expect(await screen.findByText(a.excluirServicoTitulo)).toBeOnTheScreen();
    expect(screen.getByText(a.excluirServicoTexto)).toBeOnTheScreen();
    await fireEvent.press(botaoDoDialogo(a.excluirServico));

    expect(await screen.findByText(a.servicoExcluido)).toBeOnTheScreen();
    expect(requisicoes(servidor.fetch, 'DELETE', '/servicos/s1')).toHaveLength(
      1,
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Mais opções/ })).toBeNull(),
    );
  });
});

describe('excluir pelo detalhe: o aviso aparece na tela de destino (CA33)', () => {
  /** Meus anúncios -> detalhe, para ter para onde voltar. */
  async function abrirPelaLista(
    url: string,
    tipo: 'Trampo' | 'Serviço',
    titulo: string,
    id: string,
    servidor: Servidor = criarServidor(),
  ) {
    await abrir(url, servidor);
    await fireEvent.press(await cartao(tipo, titulo));
    await waitFor(() =>
      expect(screen).toHavePathname(
        `/${tipo === 'Trampo' ? 'trampos' : 'servicos'}/${id}`,
      ),
    );
    return servidor;
  }

  it('trampo: volta a Demandas, que mostra "Trampo excluído." uma vez só', async () => {
    const servidor = await abrirPelaLista(
      '/demandas',
      'Trampo',
      'Pintar a sala',
      't1',
    );
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.excluirTrampo));
    await fireEvent.press(botaoDoDialogo(a.excluirTrampo));

    expect(await screen.findByText(a.trampoExcluido)).toBeOnTheScreen();
    expect(screen).toHavePathname('/demandas');
    expect(screen).toHaveSearchParams({});
    expect(screen.getAllByText(a.trampoExcluido)).toHaveLength(1);
    expect(requisicoes(servidor.fetch, 'DELETE', '/trampos/t1')).toHaveLength(
      1,
    );
    // O detalhe excluído não foi pedido de novo (daria 404).
    expect(requisicoes(servidor.fetch, 'GET', '/trampos/t1')).toHaveLength(1);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: a.maisOpcoes('Pintar a sala') }),
      ).toBeNull(),
    );

    // Fechado, não volta.
    await fecharToast();
    expect(screen.queryByText(a.trampoExcluido)).toBeNull();
    await esperarAsListas();
    expect(screen.queryByText(a.trampoExcluido)).toBeNull();
  });

  it('serviço: volta a Meus anúncios, que mostra "Serviço excluído."', async () => {
    const servidor = await abrirPelaLista(
      '/meus-anuncios?tipo=servico',
      'Serviço',
      'Aulas de violão',
      's1',
    );
    await abrirFolha('Aulas de violão');
    await fireEvent.press(acao(a.excluirServico));
    await fireEvent.press(botaoDoDialogo(a.excluirServico));

    expect(await screen.findByText(a.servicoExcluido)).toBeOnTheScreen();
    expect(screen).toHavePathname('/meus-anuncios');
    expect(screen.getAllByText(a.servicoExcluido)).toHaveLength(1);
    expect(requisicoes(servidor.fetch, 'DELETE', '/servicos/s1')).toHaveLength(
      1,
    );
  });
});

// --- CA33: 404 é "já removido" ---

describe('404 em encerrar ou excluir: "já removido" (CA33)', () => {
  const NAO_ENCONTRADO = { status: 404, corpo: { erro: 'nao_encontrado' } };

  it('em Meus anúncios mostra o toast e recarrega a lista', async () => {
    const servidor = criarServidor();
    servidor.fetch.responder('DELETE /trampos/t1', () => {
      // Outro aparelho já tinha excluído.
      const i = servidor.trampos.findIndex((x) => x.id === 't1');
      if (i >= 0) servidor.trampos.splice(i, 1);
      return NAO_ENCONTRADO;
    });
    await abrir('/demandas', servidor);
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.excluirTrampo));
    await fireEvent.press(botaoDoDialogo(a.excluirTrampo));

    expect(await screen.findByText(a.jaNaoExiste)).toBeOnTheScreen();
    await waitFor(() =>
      expect(requisicoes(servidor.fetch, 'GET', '/trampos/meus')).toHaveLength(
        2,
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: a.maisOpcoes('Pintar a sala') }),
      ).toBeNull(),
    );
    expect(screen.queryByText(a.erroAoExcluir)).toBeNull();
  });

  it('encerrar com 404 também é "já removido"', async () => {
    const servidor = criarServidor();
    servidor.fetch.responder('POST /trampos/t1/encerrar', () => {
      const i = servidor.trampos.findIndex((x) => x.id === 't1');
      if (i >= 0) servidor.trampos.splice(i, 1);
      return NAO_ENCONTRADO;
    });
    await abrir('/demandas', servidor);
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.encerrarTrampo));
    await fireEvent.press(botaoDoDialogo(a.encerrarConfirmar));

    expect(await screen.findByText(a.jaNaoExiste)).toBeOnTheScreen();
    expect(screen.queryByText(a.erroAoEncerrar)).toBeNull();
    await waitFor(() =>
      expect(requisicoes(servidor.fetch, 'GET', '/trampos/meus')).toHaveLength(
        2,
      ),
    );
  });

  it('serviço excluído em outro aparelho: toast e lista recarregada', async () => {
    const servidor = criarServidor();
    servidor.fetch.responder('DELETE /servicos/s1', () => {
      servidor.servicos.splice(0);
      return NAO_ENCONTRADO;
    });
    await abrir('/meus-anuncios?tipo=servico', servidor);
    await abrirFolha('Aulas de violão');
    await fireEvent.press(acao(a.excluirServico));
    await fireEvent.press(botaoDoDialogo(a.excluirServico));

    expect(await screen.findByText(a.jaNaoExiste)).toBeOnTheScreen();
    await waitFor(() =>
      expect(requisicoes(servidor.fetch, 'GET', '/servicos/meus')).toHaveLength(
        2,
      ),
    );
  });

  it('no detalhe, volta com o aviso de que o anúncio já não existe', async () => {
    const servidor = criarServidor();
    servidor.fetch.responder('DELETE /trampos/t1', () => {
      const i = servidor.trampos.findIndex((x) => x.id === 't1');
      if (i >= 0) servidor.trampos.splice(i, 1);
      return NAO_ENCONTRADO;
    });
    await abrir('/demandas', servidor);
    await fireEvent.press(await cartao('Trampo', 'Pintar a sala'));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.excluirTrampo));
    await fireEvent.press(botaoDoDialogo(a.excluirTrampo));

    expect(await screen.findByText(a.jaNaoExiste)).toBeOnTheScreen();
    expect(screen).toHavePathname('/demandas');
    expect(screen.getAllByText(a.jaNaoExiste)).toHaveLength(1);
  });

  it('no detalhe do serviço, o 404 também volta com o aviso', async () => {
    const servidor = criarServidor();
    servidor.fetch.responder('DELETE /servicos/s1', () => {
      servidor.servicos.splice(0);
      return NAO_ENCONTRADO;
    });
    await abrir('/meus-anuncios?tipo=servico', servidor);
    await fireEvent.press(await cartao('Serviço', 'Aulas de violão'));
    await waitFor(() => expect(screen).toHavePathname('/servicos/s1'));
    await abrirFolha('Aulas de violão');
    await fireEvent.press(acao(a.excluirServico));
    await fireEvent.press(botaoDoDialogo(a.excluirServico));

    expect(await screen.findByText(a.jaNaoExiste)).toBeOnTheScreen();
    expect(screen).toHavePathname('/meus-anuncios');
  });
});

// --- CA33: erro que não é 404 ---

describe('outro erro: a folha continua aberta com a mensagem (CA33)', () => {
  it('500 ao excluir não fecha a folha nem mostra o código da API', async () => {
    const servidor = criarServidor();
    servidor.fetch.responder('DELETE /trampos/t1', {
      status: 500,
      corpo: { erro: 'erro_interno' },
    });
    await abrir('/demandas', servidor);
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.excluirTrampo));
    await fireEvent.press(botaoDoDialogo(a.excluirTrampo));

    expect(await screen.findByText(a.erroAoExcluir)).toBeOnTheScreen();
    expect(screen.queryByText(a.trampoExcluido)).toBeNull();
    expect(screen.queryByText(/erro_interno/)).toBeNull();
    expect(screen.getByText(a.folhaTitulo('Pintar a sala'))).toBeOnTheScreen();
  });
});

// --- Editar ---

describe('Editar (CA33, CA32)', () => {
  it('abre a rota de edição do trampo e do serviço', async () => {
    await abrir('/demandas');
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.editar));
    await waitFor(() => expect(screen).toHavePathname('/trampos/editar/t1'));
    expect(await screen.findByDisplayValue('Pintar a sala')).toBeOnTheScreen();

    await act(async () => {
      router.replace('/servicos/s1');
    });
    await abrirFolha('Aulas de violão');
    await fireEvent.press(acao(a.editar));
    await waitFor(() => expect(screen).toHavePathname('/servicos/editar/s1'));
    expect(
      await screen.findByDisplayValue('Aulas de violão'),
    ).toBeOnTheScreen();
  });

  it('o título do anúncio não vai para a URL', async () => {
    const rotas = await abrir('/demandas');
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.editar));
    await waitFor(() => expect(screen).toHavePathname('/trampos/editar/t1'));
    expect(rotas.getPathnameWithParams()).toBe('/trampos/editar/t1');
  });

  it('o detalhe do trampo mostra "Alterações salvas." depois de salvar pela rota de edição', async () => {
    const { servidor } = await abrir('/trampos/t1');
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.editar));
    await screen.findByDisplayValue('Pintar a sala');

    await fireEvent.changeText(
      screen.getByLabelText(t.titulo),
      'Pintar a sala e o quarto',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: a.salvarAlteracoes }),
    );

    expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/t1');
    expect(screen.getAllByText(a.alteracoesSalvas)).toHaveLength(1);
    expect(requisicoes(servidor.fetch, 'PUT', '/trampos/t1')).toHaveLength(1);
    expect(
      await screen.findByText('Pintar a sala e o quarto'),
    ).toBeOnTheScreen();

    await fecharToast();
    expect(screen.queryByText(a.alteracoesSalvas)).toBeNull();
  });

  it('o detalhe do serviço mostra "Alterações salvas." depois de salvar', async () => {
    const { servidor } = await abrir('/servicos/s1');
    await abrirFolha('Aulas de violão');
    await fireEvent.press(acao(a.editar));
    await screen.findByDisplayValue('Aulas de violão');

    await fireEvent.changeText(
      screen.getByLabelText(t.titulo),
      'Aulas de violão e cavaquinho',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: a.salvarAlteracoes }),
    );

    expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();
    expect(screen).toHavePathname('/servicos/s1');
    expect(requisicoes(servidor.fetch, 'PUT', '/servicos/s1')).toHaveLength(1);

    await fecharToast();
    expect(screen.queryByText(a.alteracoesSalvas)).toBeNull();
  });

  it('Meus anúncios também mostra "Alterações salvas." ao voltar da edição', async () => {
    await abrir('/demandas');
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.editar));
    await screen.findByDisplayValue('Pintar a sala');
    await fireEvent.changeText(
      screen.getByLabelText(t.titulo),
      'Pintar a sala e o quarto',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: a.salvarAlteracoes }),
    );

    expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();
    expect(screen).toHavePathname('/demandas');
    expect(await botaoMaisOpcoes('Pintar a sala e o quarto')).toBeOnTheScreen();
  });
});

// --- Toque duplo ---

describe('toque duplo faz um pedido só', () => {
  it('confirmar o encerramento duas vezes manda um POST', async () => {
    const { servidor } = await abrir('/demandas');
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.encerrarTrampo));
    await screen.findByText(a.encerrarTitulo);

    await tocarNoMesmoTick(botaoDoDialogo(a.encerrarConfirmar));

    expect(await screen.findByText(a.trampoEncerrado)).toBeOnTheScreen();
    expect(
      requisicoes(servidor.fetch, 'POST', '/trampos/t1/encerrar'),
    ).toHaveLength(1);
  });

  it('confirmar a exclusão duas vezes manda um DELETE', async () => {
    const { servidor } = await abrir('/demandas');
    await abrirFolha('Pintar a sala');
    await fireEvent.press(acao(a.excluirTrampo));
    await screen.findByText(a.excluirTrampoTitulo);

    await tocarNoMesmoTick(botaoDoDialogo(a.excluirTrampo));

    expect(await screen.findByText(a.trampoExcluido)).toBeOnTheScreen();
    expect(requisicoes(servidor.fetch, 'DELETE', '/trampos/t1')).toHaveLength(
      1,
    );
  });

  it('confirmar a exclusão duas vezes pelo detalhe do serviço manda um DELETE e volta uma vez', async () => {
    const servidor = criarServidor();
    await abrir('/meus-anuncios?tipo=servico', servidor);
    await fireEvent.press(await cartao('Serviço', 'Aulas de violão'));
    await waitFor(() => expect(screen).toHavePathname('/servicos/s1'));
    await abrirFolha('Aulas de violão');
    await fireEvent.press(acao(a.excluirServico));
    await screen.findByText(a.excluirServicoTitulo);

    await tocarNoMesmoTick(botaoDoDialogo(a.excluirServico));

    expect(await screen.findByText(a.servicoExcluido)).toBeOnTheScreen();
    expect(screen).toHavePathname('/meus-anuncios');
    expect(requisicoes(servidor.fetch, 'DELETE', '/servicos/s1')).toHaveLength(
      1,
    );
  });

  it('tocar duas vezes em Editar abre uma tela só', async () => {
    await abrir('/demandas');
    await abrirFolha('Pintar a sala');

    await tocarNoMesmoTick(acao(a.editar));
    await waitFor(() => expect(screen).toHavePathname('/trampos/editar/t1'));
    await screen.findByDisplayValue('Pintar a sala');

    await act(async () => {
      router.back();
    });
    await waitFor(() => expect(screen).toHavePathname('/demandas'));
  });
});
