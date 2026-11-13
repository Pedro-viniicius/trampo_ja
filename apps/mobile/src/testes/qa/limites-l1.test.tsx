// QA da L1 (CA20): o 429 por conta nas telas do app, pelas rotas reais. O
// texto é o de "muitas ações" (nunca o do login), o rascunho fica, nenhuma
// tela navega nem expira a sessão, e tocar de novo depois funciona.
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import {
  AUTOR,
  CONVERSA,
  criarFetchDoMundo,
  criarMundo,
  FREELA,
  GETS_DAS_MENSAGENS,
  textoDe,
} from './apoio-conversas-2c';
import {
  abrirApp,
  CATEGORIAS,
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

const MUITAS_ACOES = textos.erros.muitas_tentativas_acao;
const LIMITE = { status: 429, corpo: { erro: 'muitas_requisicoes' } };
const t = textos.formularioDeAnuncio;

const TRAMPO = {
  id: 't1',
  autorId: 'c-autor',
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 150000,
  prazo: null,
  status: 'aberto',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

const PERFIL = (contaId: string, nome: string) => ({
  contaId,
  nome,
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
});

function criarFake(): FetchFalso {
  return criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /perfis/c-autor', {
      corpo: PERFIL('c-autor', 'Carla Souza'),
    })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('GET /trampos/t1', { corpo: TRAMPO })
    .responder('GET /trampos/meus', { corpo: [] })
    .responder('GET /servicos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', { corpo: [] })
    .responder('GET /conversas', { corpo: [] })
    .responder('DELETE /sessoes', { status: 204 });
}

const pedidos = (fetch: FetchFalso, metodo: string, caminho: string) =>
  fetch.requisicoes.filter((r) => r.metodo === metodo && r.caminho === caminho);

const avancar = (ms = 50) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

async function digitar(rotulo: string, texto: string) {
  await fireEvent.changeText(screen.getByLabelText(rotulo), texto);
}

async function escolherCategoria(rotulo = 'Reformas e reparos') {
  await fireEvent.press(
    screen.getByRole('button', {
      name: `${t.categoria}: ${t.escolherCategoria}`,
    }),
  );
  await fireEvent.press(await screen.findByRole('button', { name: rotulo }));
}

describe('publicar trampo e ofertar serviço com 429', () => {
  it('trampo: aviso de "muitas ações", rascunho intacto e a nova tentativa publica', async () => {
    const fetch = criarFake().responder('POST /trampos', [
      LIMITE,
      { status: 201, corpo: { id: 't-novo', status: 'aberto' } },
    ]);
    await abrirApp('/trampos/novo', { fetch });
    await screen.findByDisplayValue('Lavras');
    await digitar(t.titulo, 'Pintar a sala');
    await digitar(t.descricao, 'Duas demãos de tinta.');
    await escolherCategoria();
    await digitar(t.valor, '1.500,00');

    await fireEvent.press(
      screen.getByRole('button', { name: t.publicarTrampo }),
    );

    expect(await screen.findByText(MUITAS_ACOES)).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.muitas_tentativas)).toBeNull();
    expect(screen.queryByText(t.publicadoTrampo)).toBeNull();
    expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue('Pintar a sala');
    expect(screen.getByLabelText(t.valor)).toHaveDisplayValue('1.500,00');
    expect(
      screen.getByRole('button', { name: t.publicarTrampo }),
    ).toBeEnabled();

    await fireEvent.press(
      screen.getByRole('button', { name: t.publicarTrampo }),
    );

    expect(await screen.findByText(t.publicadoTrampo)).toBeOnTheScreen();
    expect(screen.queryByText(MUITAS_ACOES)).toBeNull();
    expect(pedidos(fetch, 'POST', '/trampos')).toHaveLength(2);
  });

  it('serviço: o mesmo, sem perder o rascunho', async () => {
    const fetch = criarFake().responder('POST /servicos', [
      LIMITE,
      { status: 201, corpo: { id: 's-novo', status: 'ativo' } },
    ]);
    await abrirApp('/servicos/novo', { fetch });
    await screen.findByDisplayValue('Lavras');
    await digitar(t.titulo, 'Pinto paredes');
    await digitar(t.descricao, 'Paredes internas e externas.');
    await escolherCategoria();
    await digitar(t.precoBase, '200,00');

    await fireEvent.press(
      screen.getByRole('button', { name: t.ofertarServico }),
    );

    expect(await screen.findByText(MUITAS_ACOES)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue('Pinto paredes');
    expect(screen.queryByText(t.publicadoServico)).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: t.ofertarServico }),
    );

    expect(await screen.findByText(t.publicadoServico)).toBeOnTheScreen();
    expect(pedidos(fetch, 'POST', '/servicos')).toHaveLength(2);
  });
});

describe('candidatar com 429', () => {
  it('a folha fica aberta com o rascunho e o aviso; depois o envio funciona', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', [
      LIMITE,
      { status: 201, corpo: { id: 'm1', status: 'pendente' } },
    ]);
    await abrirApp('/trampos/t1', { fetch });
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText(textos.candidatar.mensagem),
      'Posso fazer amanhã.',
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.candidatar.valor),
      '1.400,00',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatar.enviar }),
    );

    expect(await screen.findByText(MUITAS_ACOES)).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.muitas_tentativas)).toBeNull();
    expect(
      screen.getByLabelText(textos.candidatar.mensagem),
    ).toHaveDisplayValue('Posso fazer amanhã.');
    expect(screen.getByLabelText(textos.candidatar.valor)).toHaveDisplayValue(
      '1.400,00',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatar.enviar }),
    );
    await avancar();

    expect(screen.queryByText(MUITAS_ACOES)).toBeNull();
    expect(pedidos(fetch, 'POST', '/trampos/t1/candidaturas')).toHaveLength(2);
  });
});

function candidatura(id: string, freelancerId: string) {
  return {
    id,
    freelancerId,
    mensagem: `Mensagem de ${id}`,
    valorPropostoCentavos: 15000,
    status: 'pendente',
    criadaEm: '2026-10-02T12:00:00.000Z',
  };
}

/** Autor do t1 com duas candidaturas pendentes (Maria e João). */
function mundoDoAutor(): FetchFalso {
  return criarFake()
    .responder('GET /trampos/meus', { corpo: [TRAMPO] })
    .responder('GET /trampos/t1/candidaturas', {
      corpo: [candidatura('k1', 'f1'), candidatura('k2', 'f2')],
    })
    .responder('GET /perfis/f1', { corpo: PERFIL('f1', 'Maria Souza') })
    .responder('GET /perfis/f2', { corpo: PERFIL('f2', 'João Pereira') });
}

describe('aceitar candidatura e conversar com 429', () => {
  it('aceitar: aviso de "muitas ações", as candidaturas continuam pendentes e dá para tentar de novo', async () => {
    const fetch = mundoDoAutor().responder(
      'POST /trampos/t1/candidaturas/k2/aceitar',
      [LIMITE, { corpo: { status: 'aceita' } }],
    );
    await abrirApp('/candidaturas/t1', { fetch });
    await screen.findByText('João Pereira');
    const aceitarOJoao = async () => {
      const botoes = screen.getAllByRole('button', {
        name: /^Aceitar candidatura/,
      });
      await fireEvent.press(botoes[1] as never);
      await fireEvent.press(
        await screen.findByRole('button', {
          name: textos.candidaturasRecebidas.confirmar,
        }),
      );
    };

    await aceitarOJoao();

    expect(await screen.findByText(MUITAS_ACOES)).toBeOnTheScreen();
    expect(
      screen.getAllByRole('button', { name: /^Aceitar candidatura/ }),
    ).toHaveLength(2);
    expect(screen.queryByText('Aceitar João Pereira?')).toBeNull();

    await aceitarOJoao();
    await avancar();

    expect(
      pedidos(fetch, 'POST', '/trampos/t1/candidaturas/k2/aceitar'),
    ).toHaveLength(2);
  });

  it('conversar: o aviso aparece, o botão continua ativo e a nova tentativa abre a conversa', async () => {
    const fetch = mundoDoAutor()
      .responder('POST /conversas', [
        LIMITE,
        { status: 201, corpo: { conversaId: 'c1' } },
      ])
      .responder('GET /conversas/c1/mensagens', { corpo: [] });
    await abrirApp('/candidaturas/t1', { fetch });
    await screen.findByText('Maria Souza');
    const conversar = () =>
      screen.getAllByRole('button', { name: /^Conversar com/ })[0] as never;

    await fireEvent.press(conversar());

    expect(await screen.findByText(MUITAS_ACOES)).toBeOnTheScreen();
    expect(screen).toHavePathname('/candidaturas/t1');

    await fireEvent.press(conversar());
    await avancar();

    expect(screen).toHavePathname('/conversas/c1');
    expect(pedidos(fetch, 'POST', '/conversas')).toHaveLength(2);
  });
});

describe('editar perfil com 429', () => {
  it('mostra o aviso, mantém o rascunho e não sai da tela', async () => {
    const fetch = criarFake().responder('PUT /perfis/eu', LIMITE);
    await abrirApp('/perfil/editar', { fetch });
    const nome = await screen.findByLabelText(textos.editarPerfil.nome);
    await fireEvent.changeText(nome, 'Maria Nova');

    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.salvar }),
    );

    expect(await screen.findByText(MUITAS_ACOES)).toBeOnTheScreen();
    expect(screen.getByLabelText(textos.editarPerfil.nome)).toHaveDisplayValue(
      'Maria Nova',
    );
    expect(screen).toHavePathname('/perfil/editar');
  });
});

describe('leituras com 429', () => {
  it('a busca mostra o texto de "muitas ações" com "Tentar de novo", e a nova tentativa lista', async () => {
    const fetch = criarFake().responder('GET /busca', [
      LIMITE,
      {
        corpo: {
          itens: [
            {
              tipo: 'trampo',
              id: 't1',
              titulo: 'Pintar a sala',
              categoria: 'reformas',
              cidade: 'Lavras',
              valorCentavos: 150000,
            },
          ],
          proximoCursor: null,
        },
      },
    ]);
    await abrirApp('/', { fetch });

    expect(await screen.findByText(MUITAS_ACOES)).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.erro_servidor)).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );

    await waitFor(() => expect(screen.queryByText(MUITAS_ACOES)).toBeNull());
  });

  it('um 429 em qualquer leitura não derruba a sessão nem o token', async () => {
    const fetch = criarFake().responder('GET /candidaturas/minhas', LIMITE);
    const rotas = await abrirApp('/meus-trampos', { fetch });

    expect(await screen.findByText(MUITAS_ACOES)).toBeOnTheScreen();
    expect(rotas.armazenamento.atual()).not.toBeNull();
    expect(screen).toHavePathname('/meus-trampos');
    expect(pedidos(fetch, 'DELETE', '/sessoes')).toHaveLength(0);
  });
});

describe('sair com 429 no DELETE /sessoes', () => {
  it('a saída local acontece mesmo assim: token apagado e login aberto', async () => {
    const fetch = criarFake().responder('DELETE /sessoes', LIMITE);
    const rotas = await abrirApp('/perfil', { fetch });
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.sair }),
    );
    const confirmar = screen.getAllByRole('button', {
      name: textos.perfil.sairConfirmar,
    });

    await fireEvent.press(confirmar[confirmar.length - 1] as never);
    await avancar(100);

    expect(rotas.armazenamento.atual()).toBeNull();
    expect(screen).toHavePathname('/entrar');
  });
});

describe('polling da conversa com 429 longo (CA20)', () => {
  it('o intervalo dobra até o teto de 60 s, o ciclo nunca para e, ao voltar a responder, volta a 5 s; as mensagens ficam na tela', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: FREELA, texto: textoDe(1) }],
    });
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: AUTOR.token });
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));
    mundo.falhaDoGet = LIMITE;

    // Anota o instante de cada GET novo, em passos de 250 ms, por 7 minutos.
    const instantes: number[] = [];
    let vistos = GETS_DAS_MENSAGENS(fetch).length;
    for (let passo = 0; passo < (7 * 60 * 1000) / 250; passo++) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      const agora = GETS_DAS_MENSAGENS(fetch).length;
      if (agora > vistos) {
        instantes.push(Date.now());
        vistos = agora;
      }
    }

    const intervalos = instantes
      .slice(1)
      .map((t, i) => t - (instantes[i] ?? 0));
    // 1º GET com 429 (já no ar), depois 10 s, 20 s, 40 s e 60 s fixos.
    expect(intervalos.length).toBeGreaterThanOrEqual(8);
    const arredondados = intervalos.map((ms) => Math.round(ms / 1000));
    expect(Math.max(...arredondados)).toBeLessThanOrEqual(61);
    expect(arredondados.slice(-3).every((s) => s >= 59 && s <= 61)).toBe(true);
    for (let i = 1; i < arredondados.length; i++) {
      expect(arredondados[i]).toBeGreaterThanOrEqual(
        (arredondados[i - 1] ?? 0) - 1,
      );
    }
    expect(
      screen.getByLabelText(new RegExp(`${textoDe(1)}$`)),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.conversas.indisponivelTitulo)).toBeNull();

    // O limite passa: no próximo ciclo (até 60 s) volta a 5 s entre buscas.
    mundo.falhaDoGet = null;
    const apos: number[] = [];
    vistos = GETS_DAS_MENSAGENS(fetch).length;
    for (let passo = 0; passo < (150 * 1000) / 250; passo++) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      const agora = GETS_DAS_MENSAGENS(fetch).length;
      if (agora > vistos) {
        apos.push(Date.now());
        vistos = agora;
      }
    }
    const depois = apos
      .slice(-3)
      .map((t, i, l) => t - (l[i - 1] ?? t))
      .slice(1);
    expect(depois).toHaveLength(2);
    expect(depois.every((ms) => ms >= 4_900 && ms <= 5_600)).toBe(true);
    expect(screen.queryByText(textos.conversas.atualizacaoFalhando)).toBeNull();
  }, 60_000);
});
