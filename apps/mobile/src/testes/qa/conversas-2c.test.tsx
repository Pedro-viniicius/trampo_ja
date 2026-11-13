// QA da entrega 2c (conversas) pelas rotas reais (`ROTAS_REAIS`), com um
// servidor em memória de duas contas (`apoio-conversas-2c`): a jornada
// candidatura -> aceite -> conversa nos dois lados (CA12, CA13, CA16),
// mensagens pendentes e duplicata, limites do texto, polling e sessão.
import { focusManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';
import { ligarGerenciadores } from '../../estado/cliente-de-consultas';
import { textos } from '../../textos/pt-BR';
import {
  AUTOR,
  autoresDasBolhas,
  avancar,
  bolhasCom,
  botaoEnviar,
  CONVERSA,
  campo,
  criarFetchDoMundo,
  criarMundo,
  ESTRANHO,
  entrarComo,
  escrever,
  FREELA,
  GETS_DAS_MENSAGENS,
  irPara,
  linhaDaListaCom,
  navegarPara,
  POSTS_DAS_MENSAGENS,
  requisicoesDe,
  restaurarConexao,
  rotulosDasBolhas,
  sairDaConta,
  textoDe,
  textosDasBolhas,
  tocarNoMesmoTick,
} from './apoio-conversas-2c';
import {
  abrirApp,
  esperarCandidaturaEnviada,
  textosEPropriedades,
  vigiarConsole,
  voltarDaCandidaturaEnviada,
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

afterEach(async () => {
  await restaurarConexao();
});

// `Você, 14:32. TEXTO` ou `Nome, 20/10 14:32. TEXTO` (hora conforme o dia).
const HORA = String.raw`(?:\d{2}:\d{2}|\d{2}/\d{2} \d{2}:\d{2})`;

async function enviarTexto(valor: string) {
  await escrever(valor);
  await fireEvent.press(botaoEnviar());
}

async function abrirConversaComo(
  conta: typeof FREELA | typeof AUTOR,
  mundo = criarMundo(),
) {
  const fetch = criarFetchDoMundo(mundo);
  const app = await abrirApp(`/conversas/${CONVERSA}`, {
    fetch,
    token: conta.token,
  });
  return { ...app, fetch, mundo };
}

describe('jornada com duas contas (CA12, CA13, CA16)', () => {
  it('A se candidata e conversa, B aceita e responde: os dois veem tudo em ordem, com prévia e hora na lista', async () => {
    const mundo = criarMundo({ conversaAberta: false, candidatura: false });
    const fetch = criarFetchDoMundo(mundo);
    const { getPathname } = await abrirApp('/trampos/t1', {
      fetch,
      token: FREELA.token,
    });

    // A se candidata pela folha.
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText(textos.candidatar.mensagem),
      'Posso fazer.',
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.candidatar.valor),
      '150',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatar.enviar }),
    );
    await esperarCandidaturaEnviada();
    await voltarDaCandidaturaEnviada('/trampos/t1');

    // A abre a conversa pelo rodapé do candidatado (POST /conversas com o autor).
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheServico.conversar,
      }),
    );
    await waitFor(() => expect(getPathname()).toBe(`/conversas/${CONVERSA}`));
    expect(
      await screen.findByText(textos.conversas.semMensagens),
    ).toBeOnTheScreen();
    expect(screen.getByText(AUTOR.nome)).toBeOnTheScreen();
    expect(
      requisicoesDe(fetch, 'POST', '/conversas').map((r) => r.corpo),
    ).toEqual([{ outroUsuarioId: AUTOR.id }]);

    // A manda duas, uma de cada vez (a primeira com espaços nas pontas).
    await enviarTexto(`  ${textoDe('a1')}  `);
    await screen.findByLabelText(
      new RegExp(`^Você, ${HORA}\\. ${textoDe('a1')}$`),
    );
    await enviarTexto(textoDe('a2'));
    await screen.findByLabelText(
      new RegExp(`^Você, ${HORA}\\. ${textoDe('a2')}$`),
    );
    await avancar(6_000);
    expect(textosDasBolhas()).toEqual([textoDe('a1'), textoDe('a2')]);
    expect(POSTS_DAS_MENSAGENS(fetch).map((r) => r.corpo)).toEqual([
      { texto: textoDe('a1') },
      { texto: textoDe('a2') },
    ]);

    // B entra, vê a candidatura, aceita e abre a conversa (a que já existe: 200).
    await sairDaConta();
    await entrarComo(AUTOR);
    await irPara('/candidaturas/t1');
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.candidaturasRecebidas.aceitarDe(FREELA.nome),
      }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.candidaturasRecebidas.confirmar,
      }),
    );
    await screen.findByText(textos.candidaturasRecebidas.aceitaToast);
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom(FREELA.nome),
      }),
    );
    await waitFor(() => expect(getPathname()).toBe(`/conversas/${CONVERSA}`));
    await screen.findByLabelText(new RegExp(`${textoDe('a2')}$`));
    expect(
      requisicoesDe(fetch, 'POST', '/conversas').map((r) => r.corpo),
    ).toEqual([{ outroUsuarioId: AUTOR.id }, { outroUsuarioId: FREELA.id }]);
    // Do lado de B, as duas são "do outro", na mesma ordem.
    expect(textosDasBolhas()).toEqual([textoDe('a1'), textoDe('a2')]);
    expect(autoresDasBolhas()).toEqual([FREELA.nome, FREELA.nome]);

    await enviarTexto(textoDe('b1'));
    await screen.findByLabelText(
      new RegExp(`^Você, ${HORA}\\. ${textoDe('b1')}$`),
    );
    await avancar(6_000);
    expect(textosDasBolhas()).toEqual([
      textoDe('a1'),
      textoDe('a2'),
      textoDe('b1'),
    ]);
    expect(autoresDasBolhas()).toEqual([FREELA.nome, FREELA.nome, 'Você']);

    // Lista de B: nome, prévia (a última) e hora.
    await navegarPara('/conversas');
    const linhaDeB = await screen.findByRole('button', {
      name: linhaDaListaCom(FREELA.nome, textoDe('b1')),
    });
    expect(linhaDeB).toBeOnTheScreen();

    // A volta: a lista dele mostra a resposta de B e a conversa traz as três em ordem.
    await sairDaConta();
    await entrarComo(FREELA);
    await navegarPara('/conversas');
    const linhaDeA = await screen.findByRole('button', {
      name: linhaDaListaCom(AUTOR.nome, textoDe('b1')),
    });
    await fireEvent.press(linhaDeA);
    await waitFor(() => expect(getPathname()).toBe(`/conversas/${CONVERSA}`));
    await screen.findByLabelText(new RegExp(`${textoDe('b1')}$`));
    expect(textosDasBolhas()).toEqual([
      textoDe('a1'),
      textoDe('a2'),
      textoDe('b1'),
    ]);
    expect(autoresDasBolhas()).toEqual(['Você', 'Você', AUTOR.nome]);
    // Nada de nome, texto ou id de conta na rota (CA15).
    expect(getPathname()).toBe(`/conversas/${CONVERSA}`);
  });
});

describe('pendentes e duplicata (CA12, D21)', () => {
  it('envio lento: o polling traz a mensagem antes do 201 e a bolha nunca duplica', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    mundo.demoraDoPostMs = 8_000;
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));

    await enviarTexto(textoDe('lenta'));
    expect(bolhasCom('lenta')).toHaveLength(1);
    expect(bolhasCom('lenta')[0]?.props.accessibilityLabel).toBe(
      `Você. ${textos.conversas.rotuloEnviando}. ${textoDe('lenta')}`,
    );

    // O ciclo de 5 s lê a mensagem que o servidor já gravou; o 201 ainda não chegou.
    await avancar(5_200);
    expect(GETS_DAS_MENSAGENS(fetch).length).toBeGreaterThan(1);
    expect(bolhasCom('lenta')).toHaveLength(1);
    expect(bolhasCom('lenta')[0]?.props.accessibilityLabel).toMatch(
      new RegExp(`^Você, ${HORA}\\. ${textoDe('lenta')}$`),
    );
    expect(screen.queryByText(textos.conversas.rotuloEnviando)).toBeNull();

    // O 201 chega depois: nada muda, nem nos ciclos seguintes.
    await avancar(4_000);
    expect(bolhasCom('lenta')).toHaveLength(1);
    await avancar(15_000);
    expect(bolhasCom('lenta')).toHaveLength(1);
    expect(textosDasBolhas()).toEqual([textoDe(1), textoDe('lenta')]);
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(1);
  });

  it('duas mensagens de texto igual seguidas: duas bolhas, dois POSTs, nunca uma nem três', async () => {
    const mundo = criarMundo();
    mundo.demoraDoPostMs = 3_000;
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByText(textos.conversas.semMensagens);

    await enviarTexto(textoDe('igual'));
    await enviarTexto(textoDe('igual'));
    expect(bolhasCom('igual')).toHaveLength(2);

    // As duas respostas e vários ciclos depois, ainda duas (cada confirmada casa uma pendente só).
    for (const ms of [1_000, 2_500, 5_000, 5_000, 20_000]) {
      await avancar(ms);
      expect(bolhasCom('igual')).toHaveLength(2);
    }
    expect(
      rotulosDasBolhas().every((r) => new RegExp(`^Você, ${HORA}\\.`).test(r)),
    ).toBe(true);
    expect(POSTS_DAS_MENSAGENS(fetch).map((r) => r.corpo)).toEqual([
      { texto: textoDe('igual') },
      { texto: textoDe('igual') },
    ]);
    expect(mundo.mensagens).toHaveLength(2);
  });

  it('a primeira igual já confirmada e a segunda no ar: continuam duas bolhas', async () => {
    const mundo = criarMundo();
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByText(textos.conversas.semMensagens);

    await enviarTexto(textoDe('igual'));
    await avancar(1_000);
    expect(bolhasCom('igual')).toHaveLength(1);

    mundo.demoraDoPostMs = 7_000;
    await enviarTexto(textoDe('igual'));
    expect(bolhasCom('igual')).toHaveLength(2);
    await avancar(5_200);
    expect(bolhasCom('igual')).toHaveLength(2);
    await avancar(5_000);
    expect(bolhasCom('igual')).toHaveLength(2);
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(2);
  });

  it('uma que se perdeu na rede e outra igual enviada em seguida: as duas chegam e aparecem uma vez cada', async () => {
    const mundo = criarMundo();
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByText(textos.conversas.semMensagens);

    mundo.modoDoPost = 'perdida';
    await enviarTexto(textoDe('igual'));
    await avancar(100);
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();

    mundo.modoDoPost = 'ok';
    await enviarTexto(textoDe('igual'));
    await avancar(6_000);

    expect(bolhasCom('igual')).toHaveLength(2);
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    expect(mundo.mensagens).toHaveLength(2);
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(2);
  });

  it('mensagem do outro com o mesmo texto não conta como a minha que falhou: ela segue "Não enviada" e o toque reenvia', async () => {
    const mundo = criarMundo();
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByText(textos.conversas.semMensagens);

    mundo.modoDoPost = 'falha';
    await enviarTexto(textoDe('igual'));
    await avancar(100);
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();

    mundo.gravarMensagem(AUTOR.id, textoDe('igual'));
    await avancar(5_200);
    expect(bolhasCom('igual')).toHaveLength(2);
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();

    mundo.modoDoPost = 'ok';
    await fireEvent.press(
      screen.getByRole('button', {
        name: new RegExp(
          `${textos.conversas.rotuloNaoEnviada}\\. ${textoDe('igual')}$`,
        ),
      }),
    );
    await avancar(6_000);
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    expect(autoresDasBolhas().sort()).toEqual([AUTOR.nome, 'Você'].sort());
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(2);
  });

  it('resposta perdida com uma minha igual mais antiga: o polling reconhece só a que chegou agora, sem "Não enviada" nem duplicata', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: FREELA, texto: textoDe('igual') }],
    });
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByLabelText(new RegExp(`${textoDe('igual')}$`));

    // Já havia uma minha igual (antes da âncora); a nova se perde na rede e chegou.
    mundo.modoDoPost = 'perdida';
    await enviarTexto(textoDe('igual'));
    await avancar(100);
    await avancar(5_200);
    // O polling já mostrou a que chegou: a pendente some e continuam duas, sem "Não enviada".
    expect(bolhasCom('igual')).toHaveLength(2);
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(1);
  });
});

describe('tempo esgotado no envio (CA12, D21)', () => {
  it('POST que o servidor gravou mas não respondeu a tempo: o polling o mostra e o tempo esgotado depois não gera "Não enviada" nem duplicata', async () => {
    const mundo = criarMundo();
    mundo.demoraDoPostMs = 40_000;
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByText(textos.conversas.semMensagens);

    await enviarTexto(textoDe('demorada'));
    await avancar(20_000);
    expect(bolhasCom('demorada')).toHaveLength(1);
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    await avancar(30_000);
    expect(bolhasCom('demorada')).toHaveLength(1);
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(1);
    expect(mundo.mensagens).toHaveLength(1);
  });

  it('POST que nem chegou e estoura o tempo (15 s): fica "Enviando" até lá, depois "Não enviada", e o toque reenvia uma vez só', async () => {
    const mundo = criarMundo();
    mundo.modoDoPost = 'falha';
    mundo.demoraDoPostMs = 40_000;
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByText(textos.conversas.semMensagens);

    await enviarTexto(textoDe('travada'));
    await avancar(14_000);
    expect(screen.getByText(textos.conversas.rotuloEnviando)).toBeOnTheScreen();
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    await avancar(2_000);
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
    expect(screen.queryByText(textos.conversas.rotuloEnviando)).toBeNull();

    mundo.modoDoPost = 'ok';
    mundo.demoraDoPostMs = 0;
    await fireEvent.press(
      screen.getByRole('button', {
        name: new RegExp(
          `${textos.conversas.rotuloNaoEnviada}\\. ${textoDe('travada')}$`,
        ),
      }),
    );
    await avancar(6_000);
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    expect(bolhasCom('travada')).toHaveLength(1);
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(2);
    expect(mundo.mensagens).toHaveLength(1);
  });
});

describe('limites do texto no campo (CA12)', () => {
  const EMOJI = '\u{1F642}';
  const FAMILIA = '\u{1F468}‍\u{1F469}‍\u{1F467}';

  async function abrirVazia() {
    const aberto = await abrirConversaComo(FREELA);
    await screen.findByText(textos.conversas.semMensagens);
    return aberto;
  }

  it.each([
    [
      '2000 emojis (4000 unidades UTF-16)',
      EMOJI.repeat(2000),
      EMOJI.repeat(2000),
    ],
    [
      '400 famílias com ZWJ (2000 pontos de código)',
      FAMILIA.repeat(400),
      FAMILIA.repeat(400),
    ],
    [
      '1995 letras com espaços e quebras nas pontas (2000 pontos de código)',
      `  \n${'a'.repeat(1995)}\t `,
      'a'.repeat(1995),
    ],
    [
      'quebra de linha no meio fica',
      'linha 1\n\nlinha 2',
      'linha 1\n\nlinha 2',
    ],
  ])(
    '%s: o "Enviar" habilita e o POST leva o texto aparado, inteiro',
    async (_nome, digitado, esperado) => {
      const { fetch } = await abrirVazia();
      await escrever(digitado);
      expect(botaoEnviar()).toBeEnabled();
      await fireEvent.press(botaoEnviar());
      await avancar(100);

      const posts = POSTS_DAS_MENSAGENS(fetch);
      expect(posts).toHaveLength(1);
      expect(posts[0]?.corpo).toEqual({ texto: esperado });
      expect(Array.from(esperado).length).toBeLessThanOrEqual(2000);
      expect(campo()).toHaveDisplayValue('');
    },
  );

  // D45 (L4): acima de 2000 pontos de código o campo corta no limite, nunca
  // antes (um emoji conta 1), e anuncia o corte. O texto que vai à API nunca
  // passa de 2000.
  it.each([
    ['2001 emojis', EMOJI.repeat(2001), EMOJI.repeat(2000), EMOJI.repeat(2000)],
    [
      '401 famílias com ZWJ (2005 pontos de código)',
      FAMILIA.repeat(401),
      FAMILIA.repeat(400),
      FAMILIA.repeat(400),
    ],
    ['2001 letras', 'a'.repeat(2001), 'a'.repeat(2000), 'a'.repeat(2000)],
    [
      '2000 letras com espaços e quebras nas pontas (2005 pontos de código)',
      `  \n${'a'.repeat(2000)}\t `,
      `  \n${'a'.repeat(1997)}`,
      'a'.repeat(1997),
    ],
  ])(
    '%s: o campo corta em 2000 pontos de código, anuncia o corte e o POST leva o texto cortado e aparado',
    async (_nome, digitado, noCampo, esperado) => {
      const { fetch } = await abrirVazia();
      await escrever(digitado);

      expect(campo()).toHaveDisplayValue(noCampo);
      expect(Array.from(noCampo)).toHaveLength(2000);
      expect(
        screen.getAllByText(textos.gerais.contadorCortado(2000)).length,
      ).toBeGreaterThanOrEqual(1);
      expect(botaoEnviar()).toBeEnabled();
      await fireEvent.press(botaoEnviar());
      await avancar(100);

      const posts = POSTS_DAS_MENSAGENS(fetch);
      expect(posts).toHaveLength(1);
      expect(posts[0]?.corpo).toEqual({ texto: esperado });
      expect(Array.from(esperado).length).toBeLessThanOrEqual(2000);
      expect(campo()).toHaveDisplayValue('');
    },
  );

  it.each([
    ['caractere nulo no meio', 'oi\u0000tchau'],
    ['só o caractere nulo', '\u0000'],
    ['vazio', ''],
    ['só espaços e quebras', '   \n\t  \n'],
    ['só espaços Unicode (NBSP, em space, ideográfico)', '  　'],
  ])(
    '%s: o "Enviar" fica desabilitado, o texto fica no campo e nenhum POST sai',
    async (_nome, digitado) => {
      const { fetch } = await abrirVazia();
      await escrever(digitado);
      expect(botaoEnviar()).toBeDisabled();
      await tocarNoMesmoTick(botaoEnviar(), 2);
      await avancar(100);

      expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(0);
      expect(campo()).toHaveDisplayValue(digitado);
      expect(rotulosDasBolhas()).toEqual([]);
    },
  );

  it('o campo avisa o limite de 2000 e é multilinha', async () => {
    await abrirVazia();
    // D45: o limite é em pontos de código, no corte, e não no `maxLength`
    // (que contaria unidades UTF-16 e cortaria um emoji antes da hora).
    expect(campo().props.maxLength).toBeUndefined();
    expect(campo().props.multiline).toBe(true);

    await escrever(EMOJI.repeat(2000));

    expect(campo()).toHaveDisplayValue(EMOJI.repeat(2000));
    expect(
      screen.getAllByText(textos.gerais.contadorLimite(2000)).length,
    ).toBeGreaterThanOrEqual(1);
    expect(botaoEnviar()).toBeEnabled();
  });
});

/** Captura os ouvintes de `AppState` que o app registrar (o `focusManager` do TanStack usa um). */
function capturarAppState() {
  const ouvintes: ((estado: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    tipo: string,
    ouvinte: (estado: AppStateStatus) => void,
  ) => {
    if (tipo === 'change') {
      ouvintes.push(ouvinte);
    }
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);
  return async (estado: AppStateStatus) => {
    await act(async () => {
      for (const ouvinte of ouvintes) {
        ouvinte(estado);
      }
    });
  };
}

describe('polling da conversa (CA12, D20)', () => {
  it('só busca de 5 em 5 s, e `GET /conversas` não se repete com a conversa aberta', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));
    const listas = requisicoesDe(fetch, 'GET', '/conversas').length;
    const antes = GETS_DAS_MENSAGENS(fetch).length;

    await avancar(4_800);
    expect(GETS_DAS_MENSAGENS(fetch)).toHaveLength(antes);
    await avancar(400);
    expect(GETS_DAS_MENSAGENS(fetch)).toHaveLength(antes + 1);

    mundo.gravarMensagem(AUTOR.id, textoDe(2));
    await avancar(5_200);
    await screen.findByLabelText(new RegExp(`${textoDe(2)}$`));
    expect(textosDasBolhas()).toEqual([textoDe(1), textoDe(2)]);
    // Só com `m1` em cache, nada fica fora da janela de 60 s (D48): o ciclo
    // relê do começo, sem `depoisDe`, e `m1` não duplica.
    expect(GETS_DAS_MENSAGENS(fetch).at(-1)?.query).toEqual({});

    await avancar(120_000);
    expect(requisicoesDe(fetch, 'GET', '/conversas')).toHaveLength(listas);
  });

  it('com o app em segundo plano não busca; ao voltar, busca na hora e mostra o que chegou', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const mudarEstadoDoApp = capturarAppState();
    // O layout raiz real liga o `focusManager` ao `AppState`; o apoio de teste não.
    const desligar = ligarGerenciadores();
    try {
      const { fetch } = await abrirConversaComo(FREELA, mundo);
      await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));

      await mudarEstadoDoApp('background');
      const antes = GETS_DAS_MENSAGENS(fetch).length;
      mundo.gravarMensagem(AUTOR.id, textoDe(2));
      await avancar(60_000);
      expect(GETS_DAS_MENSAGENS(fetch)).toHaveLength(antes);
      expect(bolhasCom(2)).toHaveLength(0);

      await mudarEstadoDoApp('active');
      await avancar(100);
      expect(GETS_DAS_MENSAGENS(fetch)).toHaveLength(antes + 1);
      expect(bolhasCom(2)).toHaveLength(1);
      // E o ciclo de 5 s volta.
      await avancar(5_300);
      expect(GETS_DAS_MENSAGENS(fetch)).toHaveLength(antes + 2);
    } finally {
      desligar();
      focusManager.setFocused(undefined);
    }
  });

  it('falhas seguidas (500): 10, 20, 40 e 60 s entre as buscas, aviso na terceira, mensagens à vista e volta aos 5 s ao se recuperar', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));
    const n = () => GETS_DAS_MENSAGENS(fetch).length;
    mundo.falhaDoGet = { status: 500, corpo: { erro: 'erro_interno' } };

    // Anota o instante (relógio falso) de cada busca nova, em passos de 250 ms.
    const instantes: number[] = [Date.now()];
    let vistas = n();
    while (instantes.length < 7) {
      await avancar(230);
      if (n() > vistas) {
        vistas = n();
        instantes.push(Date.now());
      }
      expect(Date.now() - (instantes.at(-1) ?? 0)).toBeLessThan(70_000);
    }
    const esperas = instantes.slice(1).map((t, i) => t - (instantes[i] ?? 0));
    // 5 s da carga até a 1a falha; depois 10, 20, 40 e 60 s (o teto), e 60 s de novo.
    const esperados = [5_000, 10_000, 20_000, 40_000, 60_000, 60_000];
    esperados.forEach((esperado, i) => {
      expect(Math.abs((esperas[i] ?? 0) - esperado)).toBeLessThan(600);
    });
    expect(
      screen.getByText(textos.conversas.atualizacaoFalhando),
    ).toBeOnTheScreen();
    expect(textosDasBolhas()).toEqual([textoDe(1)]);

    // Recuperou: a próxima volta traz o que faltava, o aviso some e o ritmo volta a 5 s.
    mundo.falhaDoGet = null;
    mundo.gravarMensagem(AUTOR.id, textoDe(2));
    await avancar(61_000);
    await screen.findByLabelText(new RegExp(`${textoDe(2)}$`));
    expect(screen.queryByText(textos.conversas.atualizacaoFalhando)).toBeNull();
    const depoisDeRecuperar = n();
    await avancar(5_300);
    expect(n()).toBe(depoisDeRecuperar + 1);
  });

  it('404 no polling: aviso "Conversa indisponível" e nenhuma busca depois', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));

    mundo.falhaDoGet = { status: 404, corpo: { erro: 'nao_encontrado' } };
    await avancar(5_300);
    expect(
      await screen.findByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.conversas.campo)).toBeNull();
    expect(screen.queryAllByLabelText(/TEXTO-SENTINELA-/)).toHaveLength(0);

    const depois = GETS_DAS_MENSAGENS(fetch).length;
    await avancar(180_000);
    expect(GETS_DAS_MENSAGENS(fetch)).toHaveLength(depois);
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(0);
  });

  it('403 no polling: para de buscar e não mostra código cru nem derruba as mensagens', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const { fetch } = await abrirConversaComo(FREELA, mundo);
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));

    mundo.falhaDoGet = { status: 403, corpo: { erro: 'sem_vinculo' } };
    await avancar(5_300);
    const depois = GETS_DAS_MENSAGENS(fetch).length;
    await avancar(180_000);

    expect(GETS_DAS_MENSAGENS(fetch)).toHaveLength(depois);
    expect(screen.queryAllByText(/[a-z]+_[a-z_]+/)).toHaveLength(0);
    expect(textosDasBolhas()).toEqual([textoDe(1)]);
  });

  it('401 no polling leva ao login, para de buscar e a conta seguinte não vê a conversa da anterior', async () => {
    const mundo = criarMundo({
      mensagens: [
        { autor: AUTOR, texto: textoDe(1) },
        { autor: FREELA, texto: textoDe(2) },
      ],
    });
    const { fetch, armazenamento, queryClient, getPathname } =
      await abrirConversaComo(FREELA, mundo);
    await screen.findByLabelText(new RegExp(`${textoDe(2)}$`));

    mundo.falhaDoGet = { status: 401, corpo: { erro: 'sessao_invalida' } };
    await avancar(5_300);
    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    await waitFor(() => expect(armazenamento.atual()).toBeNull());
    expect(screen.queryAllByLabelText(/TEXTO-SENTINELA-/)).toHaveLength(0);
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .some((c) => c.state.data !== undefined),
    ).toBe(false);

    const depois = GETS_DAS_MENSAGENS(fetch).length;
    await avancar(120_000);
    expect(GETS_DAS_MENSAGENS(fetch)).toHaveLength(depois);

    // Uma terceira conta entra: a rota anterior era de outra conta, então ela
    // cai no Início (CA50), sem nada da conversa.
    mundo.falhaDoGet = null;
    await entrarComo(ESTRANHO);
    expect(getPathname()).toBe('/');
    expect(screen.queryAllByLabelText(/TEXTO-SENTINELA-/)).toHaveLength(0);
    // O Início cumprimenta a conta nova pelo nome; nenhum outro sentinela.
    expect(
      textosEPropriedades(screen.toJSON()).some((t) =>
        t.replaceAll(ESTRANHO.nome, '').includes('SENTINELA-'),
      ),
    ).toBe(false);
  });
});

describe('id da conversa na rota (CA15)', () => {
  it('um id com barra, interrogação e cerquilha vai codificado no caminho e não vira parâmetro nem outra rota', async () => {
    const mundo = criarMundo();
    const fetch = criarFetchDoMundo(mundo);
    const hostil = 'a/b?depoisDe=zzz#x';
    await abrirApp(`/conversas/${encodeURIComponent(hostil)}`, {
      fetch,
      token: FREELA.token,
    });
    expect(
      await screen.findByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();

    const pedidos = fetch.requisicoes.filter((r) =>
      r.caminho.startsWith('/conversas/'),
    );
    expect(pedidos.length).toBeGreaterThan(0);
    for (const pedido of pedidos) {
      expect(pedido.caminho).toBe(
        `/conversas/${encodeURIComponent(hostil)}/mensagens`,
      );
      expect(pedido.query).toEqual({});
    }
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(0);
  });
});

describe('lista de conversas e abertura (CA12, CA16)', () => {
  it('abrir uma conversa nova com a lista lenta: a tela não mostra "Conversa indisponível" enquanto a lista não chega', async () => {
    const mundo = criarMundo({ conversaAberta: false });
    const fetch = criarFetchDoMundo(mundo);
    const { getPathname } = await abrirApp('/conversas', {
      fetch,
      token: FREELA.token,
    });
    // A lista já está no cache, vazia: a conversa nova ainda não consta nela.
    await screen.findByText(textos.conversas.vazio);
    await irPara('/trampos/t1');
    mundo.demoraDaListaMs = 8_000;
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheServico.conversar,
      }),
    );

    const indisponiveis: number[] = [];
    for (let ms = 500; ms <= 10_000; ms += 500) {
      await avancar(480);
      if (screen.queryByText(textos.conversas.indisponivelTitulo) !== null) {
        indisponiveis.push(ms);
      }
    }
    expect(getPathname()).toBe(`/conversas/${CONVERSA}`);
    expect(indisponiveis).toEqual([]);
    expect(
      await screen.findByText(textos.conversas.semMensagens),
    ).toBeOnTheScreen();
  });

  it('a prévia da lista mostra a mensagem que acabei de enviar ao voltar logo da conversa', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp('/conversas', { fetch, token: FREELA.token });
    await fireEvent.press(
      await screen.findByLabelText(linhaDaListaCom(AUTOR.nome, textoDe(1))),
    );
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));

    await enviarTexto(textoDe('ok'));
    await avancar(300);
    await act(async () => router.back());
    await avancar(1_000);

    expect(
      screen.queryByLabelText(linhaDaListaCom(AUTOR.nome, textoDe('ok'))),
    ).toBeOnTheScreen();
  });

  it('a conversa aberta não mostra a barra de abas; "Voltar" devolve à lista, que tem as 4 abas do freela na ordem', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp('/conversas', { fetch, token: FREELA.token });
    // CA76: o modo padrão é o freela, sem aba Publicar.
    const rotulosDasAbas: string[] = [
      textos.abas.inicio,
      textos.abas.meusTrampos,
      textos.abas.conversas,
      textos.abas.perfil,
    ];
    const todosOsRotulos: string[] = [
      ...rotulosDasAbas,
      textos.abas.demandas,
      textos.abas.buscar,
      textos.abas.mensagens,
      textos.abas.publicar,
    ];
    // Cada aba é um botão com o rótulo da aba; a ordem é a da barra.
    const abas = () =>
      screen
        .queryAllByRole('button')
        .map((botao) => String(botao.props.accessibilityLabel))
        .filter((rotulo) => todosOsRotulos.includes(rotulo));
    expect(abas()).toEqual(rotulosDasAbas);

    await fireEvent.press(
      await screen.findByLabelText(linhaDaListaCom(AUTOR.nome, textoDe(1))),
    );
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));
    expect(abas()).toEqual([]);

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await screen.findByLabelText(linhaDaListaCom(AUTOR.nome, textoDe(1)));
    expect(abas()).toEqual(rotulosDasAbas);
  });
});
