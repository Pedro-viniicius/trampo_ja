// QA da entrega 2c: regressões nas telas da 2a/2b que ganharam "Conversar"
// (rodapé do trampo, candidaturas recebidas, detalhe do serviço), o CA13 de
// ponta a ponta com a regra de vínculo da API e a varredura do CA15 nos fluxos
// das conversas, tudo pelas rotas reais.
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { StatusDaCandidatura } from '../../api/tipos';
import { textos } from '../../textos/pt-BR';
import type { FetchFalso } from '../fetch-falso';
import {
  AUTOR,
  avancar,
  botaoEnviar,
  CONVERSA,
  type ContaFalsa,
  criarFetchDoMundo,
  criarMundo,
  ESTRANHO,
  escrever,
  FREELA,
  GETS_DAS_MENSAGENS,
  irPara,
  linhaDaListaCom,
  type Mundo,
  navegarPara,
  POSTS_DAS_MENSAGENS,
  requisicoesDe,
  restaurarConexao,
  TEXTO_DO_CA13,
  textoDe,
  tocarNoMesmoTick,
} from './apoio-conversas-2c';
import { abrirApp, textosEPropriedades, vigiarConsole } from './apoio-qa';

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

afterEach(async () => {
  await restaurarConexao();
});

const CONVERSAR = textos.detalheServico.conversar;

const SERVICO = {
  id: 's1',
  autorId: AUTOR.id,
  titulo: 'Faço pintura de parede',
  descricao: 'Equipe própria.',
  categoria: 'reformas',
  cidade: null,
  precoBaseCentavos: 8000,
  status: 'ativo',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

/** O servidor das conversas mais o serviço `s1` do `AUTOR`. */
function fakeComServico(mundo: Mundo): FetchFalso {
  return criarFetchDoMundo(mundo).responder('GET /servicos/s1', {
    corpo: SERVICO,
  });
}

function abrirComo(
  conta: ContaFalsa,
  url: string,
  mundo: Mundo,
  fetch: FetchFalso = fakeComServico(mundo),
) {
  return abrirApp(url, { fetch, token: conta.token });
}

describe('rodapé do trampo por situação, com "Conversar" (regressão 2b, D22/D23)', () => {
  it.each(['pendente', 'aceita', 'recusada'] as const)(
    'candidatado (%s): "Conversar" aparece junto do selo e abre a conversa com o autor',
    async (status: StatusDaCandidatura) => {
      const mundo = criarMundo({ conversaAberta: false });
      for (const c of mundo.candidaturas) {
        c.status = status;
      }
      const fetch = fakeComServico(mundo);
      const { getPathname } = await abrirComo(
        FREELA,
        '/trampos/t1',
        mundo,
        fetch,
      );

      expect(
        await screen.findByText(
          status === 'pendente'
            ? textos.detalheTrampo.jaCandidatou
            : textos.selos[status],
        ),
      ).toBeOnTheScreen();
      expect(
        screen.queryByRole('button', { name: textos.detalheTrampo.candidatar }),
      ).toBeNull();
      await fireEvent.press(
        await screen.findByRole('button', { name: CONVERSAR }),
      );
      await waitFor(() => expect(getPathname()).toBe(`/conversas/${CONVERSA}`));
      expect(
        requisicoesDe(fetch, 'POST', '/conversas').map((r) => r.corpo),
      ).toEqual([{ outroUsuarioId: AUTOR.id }]);
    },
  );

  it('quem ainda não se candidatou vê "Candidatar-se" e nada de "Conversar"', async () => {
    const mundo = criarMundo({ conversaAberta: false, candidatura: false });
    await abrirComo(ESTRANHO, '/trampos/t1', mundo);
    expect(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: CONVERSAR })).toBeNull();
  });

  it('o autor do trampo vê as candidaturas e não vê "Conversar" no detalhe', async () => {
    const mundo = criarMundo({ conversaAberta: false });
    await abrirComo(AUTOR, '/trampos/t1', mundo);
    expect(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.verCandidaturas(1),
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: CONVERSAR })).toBeNull();
  });

  it('trampo fechado e sem candidatura: motivo "fechado" e nenhum "Conversar"', async () => {
    const mundo = criarMundo({ conversaAberta: false, candidatura: false });
    const fetch = fakeComServico(mundo).responder('GET /trampos/t1', {
      corpo: { ...TRAMPO_FECHADO },
    });
    await abrirComo(ESTRANHO, '/trampos/t1', mundo, fetch);
    expect(
      await screen.findByText(textos.detalheTrampo.fechado),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: CONVERSAR })).toBeNull();
  });
});

const TRAMPO_FECHADO = {
  id: 't1',
  autorId: AUTOR.id,
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 150000,
  prazo: null,
  status: 'em_andamento',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

describe('candidaturas recebidas com "Conversar" em todo status (regressão 2b, D23)', () => {
  it('pendente, aceita e recusada têm "Conversar"; só a pendente tem "Aceitar"; aceitar não tira o "Conversar"', async () => {
    const mundo = criarMundo({ conversaAberta: false });
    // Segunda candidatura (de outra conta) e uma já recusada.
    mundo.candidaturas.push({
      id: 'k2',
      freelancerId: ESTRANHO.id,
      mensagem: 'Também posso.',
      valorPropostoCentavos: 20000,
      status: 'recusada',
    });
    const fetch = fakeComServico(mundo);
    await abrirComo(AUTOR, '/candidaturas/t1', mundo, fetch);

    expect(
      await screen.findByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom(FREELA.nome),
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom(ESTRANHO.nome),
      }),
    ).toBeOnTheScreen();
    expect(
      screen.queryAllByRole('button', {
        name: textos.candidaturasRecebidas.aceitarDe(FREELA.nome),
      }),
    ).toHaveLength(1);
    expect(
      screen.queryAllByRole('button', {
        name: textos.candidaturasRecebidas.aceitarDe(ESTRANHO.nome),
      }),
    ).toHaveLength(0);

    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.aceitarDe(FREELA.nome),
      }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.candidaturasRecebidas.confirmar,
      }),
    );
    await screen.findByText(textos.candidaturasRecebidas.aceitaToast);
    expect(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom(FREELA.nome),
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom(ESTRANHO.nome),
      }),
    ).toBeOnTheScreen();
  });
});

describe('detalhe do serviço com "Conversar" (regressão 2b, D22) e CA13 de ponta a ponta', () => {
  it('quem tem candidatura com o autor conversa pelo serviço: o vínculo é decidido pela API', async () => {
    const mundo = criarMundo({ conversaAberta: false });
    const fetch = fakeComServico(mundo);
    const { getPathname } = await abrirComo(
      FREELA,
      '/servicos/s1',
      mundo,
      fetch,
    );

    await fireEvent.press(
      await screen.findByRole('button', { name: CONVERSAR }),
    );
    await waitFor(() => expect(getPathname()).toBe(`/conversas/${CONVERSA}`));
    expect(
      requisicoesDe(fetch, 'POST', '/conversas').map((r) => r.corpo),
    ).toEqual([{ outroUsuarioId: AUTOR.id }]);
    // O detalhe leu "meus serviços" uma vez só.
    expect(requisicoesDe(fetch, 'GET', '/servicos/meus')).toHaveLength(1);
  });

  it('CA13: sem candidatura nem contratação, o toque mostra o texto literal, desabilita o botão e não tenta de novo', async () => {
    const mundo = criarMundo({ conversaAberta: false });
    const fetch = fakeComServico(mundo);
    await abrirComo(ESTRANHO, '/servicos/s1', mundo, fetch);

    const botao = await screen.findByRole('button', { name: CONVERSAR });
    await fireEvent.press(botao);
    expect(await screen.findByText(TEXTO_DO_CA13)).toBeOnTheScreen();
    expect(textos.erros.sem_vinculo).toBe(TEXTO_DO_CA13);
    expect(screen.getByRole('button', { name: CONVERSAR })).toBeDisabled();

    await tocarNoMesmoTick(screen.getByRole('button', { name: CONVERSAR }), 2);
    await avancar(200);
    expect(requisicoesDe(fetch, 'POST', '/conversas')).toHaveLength(1);
    expect(mundo.conversas).toHaveLength(0);
    // Nada de código cru da API nem de conversa criada.
    expect(screen.queryAllByText(/sem_vinculo/)).toHaveLength(0);
  });

  it('o autor do serviço (que consta em "meus serviços") não vê "Conversar"', async () => {
    const mundo = criarMundo({ conversaAberta: false });
    const fetch = fakeComServico(mundo).responder('GET /servicos/meus', {
      corpo: [SERVICO],
    });
    await abrirComo(AUTOR, '/servicos/s1', mundo, fetch);
    expect(await screen.findByText(SERVICO.titulo)).toBeOnTheScreen();
    await avancar(500);
    expect(screen.queryByRole('button', { name: CONVERSAR })).toBeNull();
  });
});

// --- CA15: dado pessoal fora da tela ---

/** Todo `testID` e `nativeID` da árvore (a tela pode mostrar o dado; o identificador, nunca). */
function identificadores(arvore: unknown): string[] {
  const achados: string[] = [];
  const visitar = (no: unknown) => {
    if (Array.isArray(no)) {
      for (const filho of no) visitar(filho);
      return;
    }
    if (typeof no !== 'object' || no === null) return;
    const { props, children } = no as {
      props?: Record<string, unknown>;
      children?: unknown;
    };
    for (const chave of ['testID', 'nativeID', 'key']) {
      const valor = props?.[chave];
      if (typeof valor === 'string') achados.push(valor);
    }
    visitar(children ?? []);
  };
  visitar(arvore);
  return achados;
}

const SENTINELA = /SENTINELA/;

describe('CA15: nome e texto de mensagem fora de testID, URL, rota, cache e erro', () => {
  it('conversa, envio, queda de rede, reenvio e 500 do polling: nada vaza para fora do texto da tela', async () => {
    const mundo = criarMundo({
      mensagens: [
        { autor: AUTOR, texto: textoDe('do-outro') },
        { autor: FREELA, texto: textoDe('minha') },
      ],
    });
    const fetch = fakeComServico(mundo);
    const { queryClient, getPathnameWithParams, getSearchParams } =
      await abrirComo(FREELA, '/conversas', mundo, fetch);

    const varrer = () => {
      expect(
        identificadores(screen.toJSON()).filter((i) => SENTINELA.test(i)),
      ).toEqual([]);
      expect(getPathnameWithParams()).not.toMatch(SENTINELA);
      expect(JSON.stringify(getSearchParams())).not.toMatch(SENTINELA);
      for (const req of fetch.requisicoes) {
        expect(req.url).not.toMatch(SENTINELA);
        expect(JSON.stringify(req.cabecalhos)).not.toMatch(SENTINELA);
        // Só o corpo de `POST /conversas/:id/mensagens` leva o texto.
        if (!(req.metodo === 'POST' && req.caminho.endsWith('/mensagens'))) {
          expect(JSON.stringify(req.corpo ?? null)).not.toMatch(SENTINELA);
        }
      }
      for (const consulta of queryClient.getQueryCache().getAll()) {
        expect(JSON.stringify(consulta.queryKey)).not.toMatch(SENTINELA);
        expect(String(consulta.state.error?.message ?? '')).not.toMatch(
          SENTINELA,
        );
      }
      for (const mutacao of queryClient.getMutationCache().getAll()) {
        expect(JSON.stringify(mutacao.options.mutationKey ?? null)).not.toMatch(
          SENTINELA,
        );
        expect(String(mutacao.state.error?.message ?? '')).not.toMatch(
          SENTINELA,
        );
      }
      // A tela não mostra código cru de erro nem a mensagem do `fetch`.
      expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);
      expect(
        screen.queryAllByText(/Network request failed|Aborted|erro da API/i),
      ).toHaveLength(0);
    };

    // Lista (nome e prévia à vista, mas só no texto/rótulo).
    await screen.findByLabelText(linhaDaListaCom(AUTOR.nome, textoDe('minha')));
    varrer();

    // Abre a conversa pela linha.
    await fireEvent.press(
      screen.getByLabelText(linhaDaListaCom(AUTOR.nome, textoDe('minha'))),
    );
    await screen.findByLabelText(new RegExp(`${textoDe('do-outro')}$`));
    varrer();

    // Envio que falha na rede, depois o reenvio.
    mundo.modoDoPost = 'falha';
    await escrever(textoDe('nova'));
    await fireEvent.press(botaoEnviar());
    await avancar(100);
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
    varrer();
    mundo.modoDoPost = 'ok';
    await fireEvent.press(
      screen.getByRole('button', {
        name: new RegExp(
          `${textos.conversas.rotuloNaoEnviada}\\. ${textoDe('nova')}$`,
        ),
      }),
    );
    await avancar(6_000);
    varrer();

    // O polling passa a dar 500: erro e aviso, sem texto no erro.
    mundo.falhaDoGet = { status: 500, corpo: { erro: 'erro_interno' } };
    await avancar(90_000);
    expect(
      screen.getByText(textos.conversas.atualizacaoFalhando),
    ).toBeOnTheScreen();
    varrer();

    // 404 no envio: aviso de conversa indisponível.
    mundo.falhaDoGet = null;
    mundo.modoDoPost = 'nao_encontrada';
    await avancar(65_000);
    await escrever(textoDe('ultima'));
    await fireEvent.press(botaoEnviar());
    expect(
      await screen.findByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();
    varrer();
  });

  it('o texto da mensagem aparece como conteúdo e rótulo da bolha, e nunca como testID, nativeID ou key', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe('visivel') }],
    });
    await abrirComo(FREELA, `/conversas/${CONVERSA}`, mundo);
    await screen.findByLabelText(new RegExp(`${textoDe('visivel')}$`));

    const props = textosEPropriedades(screen.toJSON());
    // O texto da mensagem está no conteúdo e no rótulo da bolha, e em nenhuma outra propriedade.
    const comTexto = props.filter((t) => t.includes(textoDe('visivel')));
    expect(comTexto.length).toBeGreaterThan(0);
    expect(
      identificadores(screen.toJSON()).some((i) => SENTINELA.test(i)),
    ).toBe(false);
  });

  it('sair da conta com a conversa aberta apaga mensagens e nomes do cache e da tela', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe('privada') }],
    });
    const fetch = fakeComServico(mundo);
    const { queryClient } = await abrirComo(
      FREELA,
      `/conversas/${CONVERSA}`,
      mundo,
      fetch,
    );
    await screen.findByLabelText(new RegExp(`${textoDe('privada')}$`));
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await navegarPara('/perfil');
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.sair }),
    );
    const botoes = screen.getAllByRole('button', {
      name: textos.perfil.sairConfirmar,
    });
    await fireEvent.press(botoes[botoes.length - 1] as (typeof botoes)[number]);
    await waitFor(() =>
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .filter((c) => c.state.data !== undefined),
      ).toEqual([]),
    );
    expect(JSON.stringify(textosEPropriedades(screen.toJSON()))).not.toMatch(
      SENTINELA,
    );
    const depois = GETS_DAS_MENSAGENS(fetch).length;
    await avancar(60_000);
    expect(GETS_DAS_MENSAGENS(fetch)).toHaveLength(depois);
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(0);
  });

  it('fora da aba Conversas a lista não recarrega por tempo; ao voltar a ela com o dado velho, recarrega', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const fetch = fakeComServico(mundo);
    await abrirComo(FREELA, '/conversas', mundo, fetch);
    await screen.findByLabelText(linhaDaListaCom(AUTOR.nome, textoDe(1)));
    await irPara('/buscar');
    await avancar(40_000);
    const listas = requisicoesDe(fetch, 'GET', '/conversas').length;
    await avancar(120_000);
    // Fora da aba Conversas a lista não recarrega por tempo.
    expect(requisicoesDe(fetch, 'GET', '/conversas')).toHaveLength(listas);
    await act(async () => {
      await navegarPara('/conversas');
    });
    await avancar(100);
    expect(requisicoesDe(fetch, 'GET', '/conversas')).toHaveLength(listas + 1);
  });
});
