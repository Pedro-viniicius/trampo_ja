// QA da entrega 2c, rodada 2: bordas das correções (lista em cache sem a
// conversa, teto de 500 mensagens no cache com âncora por id, reconciliação em
// duas passadas, rótulo novo da linha da lista e conversa com perfil em 404).
// Pelas rotas reais, com o servidor em memória de `apoio-conversas-2c`.
import { router } from 'expo-router';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { textos } from '../../textos/pt-BR';
import {
  AUTOR,
  avancar,
  bolhasCom,
  botaoEnviar,
  CONVERSA,
  criarFetchDoMundo,
  criarMundo,
  dadosDaLista,
  ESTRANHO,
  escrever,
  FREELA,
  GETS_DAS_MENSAGENS,
  irPara,
  linhaDaListaCom,
  POSTS_DAS_MENSAGENS,
  requisicoesDe,
  restaurarConexao,
  tentarDeNovoDa,
  textoDe,
} from './apoio-conversas-2c';
import { abrirApp, vigiarConsole } from './apoio-qa';

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

const ERRO_500 = { status: 500, corpo: { erro: 'erro_interno' } };

async function enviarTexto(valor: string) {
  await escrever(valor);
  await fireEvent.press(botaoEnviar());
}

function listasPedidas(fetch: ReturnType<typeof criarFetchDoMundo>) {
  return requisicoesDe(fetch, 'GET', '/conversas');
}

describe('conversa que a lista em cache não contém (Q1/R1)', () => {
  it('lista em 500 e sem cache: erro com "Tentar de novo", nunca "indisponível", sem martelar a API; o toque recupera', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    mundo.falhaDaLista = ERRO_500;
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    await avancar(20_000);
    expect(screen.queryByText(textos.conversas.indisponivelTitulo)).toBeNull();
    expect(screen.getByText(textos.erros.erro_servidor)).toBeOnTheScreen();
    expect(botaoEnviar()).toBeDisabled();
    // A tela confere a lista uma vez ao abrir; nada de laço de recargas.
    expect(listasPedidas(fetch).length).toBeLessThanOrEqual(3);

    mundo.falhaDaLista = null;
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(
      await screen.findByLabelText(new RegExp(`${textoDe(1)}$`)),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(textos.conversas.campo)).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.erro_servidor)).toBeNull();
  });

  it('conversa nova pelo "Conversar" com a lista caindo em 500 depois do POST: nunca "indisponível"; ao voltar a lista, a conversa abre', async () => {
    const mundo = criarMundo({ conversaAberta: false });
    const fetch = criarFetchDoMundo(mundo);
    const { getPathname } = await abrirApp('/conversas', {
      fetch,
      token: FREELA.token,
    });
    await screen.findByText(textos.conversas.vazio);
    await irPara('/trampos/t1');
    mundo.falhaDaLista = ERRO_500;
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheServico.conversar,
      }),
    );
    await avancar(8_000);
    for (let i = 0; i < 4; i += 1) {
      expect(
        screen.queryByText(textos.conversas.indisponivelTitulo),
      ).toBeNull();
      await avancar(2_000);
    }
    // A abertura segue para a conversa; sem lista, a tela oferece nova tentativa.
    expect(getPathname()).toBe(`/conversas/${CONVERSA}`);
    expect(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    ).toBeOnTheScreen();
    mundo.falhaDaLista = null;
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(
      await screen.findByText(textos.conversas.semMensagens),
    ).toBeOnTheScreen();
    expect(await screen.findByText(AUTOR.nome)).toBeOnTheScreen();
  });

  it('lista fresca (menos de 5 s) sem a conversa criada agora: recarrega a lista uma vez e abre a conversa', async () => {
    const mundo = criarMundo({ conversaAberta: false });
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp('/conversas', { fetch, token: FREELA.token });
    await screen.findByText(textos.conversas.vazio);
    const antes = listasPedidas(fetch).length;

    // A conversa passa a existir no servidor (aberta de outro aparelho).
    mundo.conversas.push({
      id: CONVERSA,
      participantes: [FREELA.id, AUTOR.id],
      criadaEm: new Date().toISOString(),
    });
    mundo.gravarMensagem(AUTOR.id, textoDe('oi'));
    await irPara(`/conversas/${CONVERSA}`);

    expect(
      await screen.findByLabelText(new RegExp(`${textoDe('oi')}$`)),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.conversas.indisponivelTitulo)).toBeNull();
    expect(await screen.findByText(AUTOR.nome)).toBeOnTheScreen();
    expect(listasPedidas(fetch).length - antes).toBe(1);
  });

  it('conversa que não existe (lista sem ela e 404 nas mensagens): "Conversa indisponível", sem campo, e sem laço de buscas', async () => {
    const mundo = criarMundo({ conversaAberta: false });
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });

    expect(
      await screen.findByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.conversas.campo)).toBeNull();
    const listas = listasPedidas(fetch).length;
    const mensagens = GETS_DAS_MENSAGENS(fetch).length;
    await avancar(40_000);
    expect(listasPedidas(fetch).length).toBe(listas);
    expect(GETS_DAS_MENSAGENS(fetch).length).toBe(mensagens);
    expect(listas).toBeLessThanOrEqual(2);
    expect(
      screen.getByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();
  });

  it('conversa de outras duas pessoas (a lista não a traz e as mensagens dão 404): "Conversa indisponível" para o estranho', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe('segredo') }],
    });
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, {
      fetch,
      token: ESTRANHO.token,
    });
    expect(
      await screen.findByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(new RegExp(textoDe('segredo')))).toBeNull();
    expect(screen.queryByLabelText(textos.conversas.campo)).toBeNull();
  });
});

describe('teto de 500 mensagens no cache (S1)', () => {
  function mundoCom(n: number) {
    return criarMundo({
      mensagens: Array.from({ length: n }, (_, i) => ({
        autor: i % 2 === 0 ? AUTOR : FREELA,
        texto: textoDe(i + 1),
      })),
    });
  }

  it('520 mensagens no servidor: a tela guarda só as últimas 500, em ordem, e o cursor do polling é a última fora da janela de 60 s (D48)', async () => {
    const mundo = mundoCom(520);
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
    await screen.findByLabelText(textos.conversas.campo);
    await avancar(100);

    const dados = dadosDaLista();
    expect(dados).toHaveLength(500);
    expect(dados[0]?.texto).toBe(textoDe(21));
    expect(dados[499]?.texto).toBe(textoDe(520));

    fetch.limparRequisicoes();
    await avancar(5_200);
    const gets = GETS_DAS_MENSAGENS(fetch);
    expect(gets).toHaveLength(1);
    // As mensagens do mundo vêm de 60 em 60 s: a última com 60 s ou mais
    // antes de `m520` é `m519` (D48 relê a janela).
    expect(gets[0]?.query).toEqual({ depoisDe: 'm519' });
    expect(dadosDaLista()).toHaveLength(500);
  });

  it('pendente criada com o cache no teto, cuja mensagem chega no servidor: a tela casa pelo texto, fica uma só e o cache segue em 500', async () => {
    const mundo = mundoCom(520);
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
    await screen.findByLabelText(textos.conversas.campo);
    await avancar(100);

    mundo.modoDoPost = 'perdida';
    await enviarTexto(textoDe('nova'));
    await avancar(100);
    let dados = dadosDaLista();
    // 500 confirmadas e mais a pendente que falhou (a resposta se perdeu).
    expect(dados).toHaveLength(501);
    expect(dados[500]?.situacao).toBe('falhou');

    await avancar(5_200);
    dados = dadosDaLista();
    expect(dados.filter((d) => d.texto === textoDe('nova'))).toHaveLength(1);
    expect(dados.every((d) => d.situacao === 'enviada')).toBe(true);
    expect(dados).toHaveLength(500);
    expect(dados[499]?.texto).toBe(textoDe('nova'));
    expect(dados[0]?.texto).toBe(textoDe(22));
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(1);
  });

  it('pendentes em envio não contam no teto: 500 confirmadas e as duas pendentes na tela, na ordem', async () => {
    const mundo = mundoCom(520);
    mundo.demoraDoPostMs = 30_000;
    mundo.modoDoPost = 'falha';
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
    await screen.findByLabelText(textos.conversas.campo);
    await avancar(100);

    await enviarTexto(textoDe('p1'));
    await avancar(50);
    await enviarTexto(textoDe('p2'));
    await avancar(50);
    const dados = dadosDaLista();
    expect(dados).toHaveLength(502);
    expect(dados.slice(500).map((d) => [d.texto, d.situacao])).toEqual([
      [textoDe('p1'), 'enviando'],
      [textoDe('p2'), 'enviando'],
    ]);
    expect(dados[0]?.texto).toBe(textoDe(21));
    // Mais ciclos de polling não derrubam as pendentes nem tiram confirmadas.
    await avancar(10_500);
    expect(dadosDaLista()).toHaveLength(502);
  });

  it('"Tentar de novo" com a âncora já cortada do cache: a mensagem que chegou é reconhecida e não é reenviada', async () => {
    const mundo = mundoCom(520);
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
    await screen.findByLabelText(textos.conversas.campo);
    await avancar(100);

    // O polling passa a falhar e o envio nunca chega ao servidor.
    mundo.falhaDoGet = ERRO_500;
    mundo.modoDoPost = 'falha';
    await enviarTexto(textoDe('nova'));
    await avancar(100);
    const falhada = dadosDaLista().at(-1);
    expect(falhada?.situacao).toBe('falhou');
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(1);

    // Mais de 500 mensagens do outro depois, e só então a minha entra no servidor
    // (como o POST que a rede segurou): a âncora (m520) fica de fora do corte.
    for (let i = 0; i < 505; i += 1) {
      mundo.gravarMensagem(AUTOR.id, textoDe(`outra-${i}`));
    }
    mundo.gravarMensagem(FREELA.id, textoDe('nova'));
    mundo.falhaDoGet = null;

    await tentarDeNovoDa(falhada?.chave ?? '');
    await avancar(1_000);

    const dados = dadosDaLista();
    expect(dados).toHaveLength(500);
    expect(dados.filter((d) => d.texto === textoDe('nova'))).toHaveLength(1);
    expect(dados.at(-1)?.situacao).toBe('enviada');
    expect(dados.some((d) => d.situacao !== 'enviada')).toBe(false);
    // Nenhum reenvio: continua o POST que falhou.
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(1);
    expect(
      mundo.mensagens.filter((m) => m.texto === textoDe('nova')),
    ).toHaveLength(1);
  });

  it('"Tentar de novo" com a âncora cortada e a mensagem que realmente não chegou: reenvia uma vez só', async () => {
    const mundo = mundoCom(520);
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
    await screen.findByLabelText(textos.conversas.campo);
    await avancar(100);

    mundo.falhaDoGet = ERRO_500;
    mundo.modoDoPost = 'falha';
    await enviarTexto(textoDe('nova'));
    await avancar(100);
    const falhada = dadosDaLista().at(-1);
    for (let i = 0; i < 505; i += 1) {
      mundo.gravarMensagem(AUTOR.id, textoDe(`outra-${i}`));
    }
    mundo.falhaDoGet = null;
    mundo.modoDoPost = 'ok';

    await tentarDeNovoDa(falhada?.chave ?? '');
    await avancar(1_000);
    await avancar(6_000);

    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(2);
    expect(
      mundo.mensagens.filter((m) => m.texto === textoDe('nova')),
    ).toHaveLength(1);
    const dados = dadosDaLista();
    expect(dados.filter((d) => d.texto === textoDe('nova'))).toHaveLength(1);
    expect(dados.some((d) => d.situacao !== 'enviada')).toBe(false);
  });
});

describe('reconciliação em duas passadas (R3/S2)', () => {
  it('P1 "Não enviada" e P2 no ar com o mesmo texto, GET antes do 201: a mensagem do servidor é da P2 e a P1 continua "Não enviada"', async () => {
    const mundo = criarMundo();
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
    await screen.findByText(textos.conversas.semMensagens);

    mundo.modoDoPost = 'falha';
    await enviarTexto(textoDe('igual'));
    await avancar(100);
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();

    mundo.modoDoPost = 'ok';
    mundo.demoraDoPostMs = 9_000;
    await enviarTexto(textoDe('igual'));
    expect(bolhasCom('igual')).toHaveLength(2);

    // O ciclo de 5 s lê a mensagem da P2 (gravada na hora) antes do 201.
    await avancar(5_200);
    expect(mundo.mensagens).toHaveLength(1);
    expect(dadosDaLista().map((d) => d.situacao)).toEqual([
      'enviada',
      'falhou',
    ]);
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
    expect(screen.queryByText(textos.conversas.rotuloEnviando)).toBeNull();

    // O 201 chega e vários ciclos depois: nada muda, a P1 não some como entregue.
    await avancar(5_000);
    await avancar(10_000);
    expect(dadosDaLista().map((d) => d.situacao)).toEqual([
      'enviada',
      'falhou',
    ]);
    expect(bolhasCom('igual')).toHaveLength(2);
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(2);
  });

  it('depois disso, "Tentar de novo" da P1 envia uma vez e ficam duas mensagens confirmadas', async () => {
    const mundo = criarMundo();
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
    await screen.findByText(textos.conversas.semMensagens);

    mundo.modoDoPost = 'falha';
    await enviarTexto(textoDe('igual'));
    await avancar(100);
    mundo.modoDoPost = 'ok';
    mundo.demoraDoPostMs = 9_000;
    await enviarTexto(textoDe('igual'));
    await avancar(5_200);
    mundo.demoraDoPostMs = 0;

    await fireEvent.press(
      screen.getByRole('button', {
        name: new RegExp(
          `${textos.conversas.rotuloNaoEnviada}\\. ${textoDe('igual')}$`,
        ),
      }),
    );
    await avancar(6_000);
    await avancar(10_000);

    expect(mundo.mensagens).toHaveLength(2);
    expect(screen.queryByText(textos.conversas.naoEnviada)).toBeNull();
    expect(dadosDaLista().map((d) => d.situacao)).toEqual([
      'enviada',
      'enviada',
    ]);
    expect(POSTS_DAS_MENSAGENS(fetch)).toHaveLength(3);
  });

  it('P1 no ar e P2 que falhou, mesmo texto, uma só chegou: a que chegou é a que estava no ar', async () => {
    const mundo = criarMundo();
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
    await screen.findByText(textos.conversas.semMensagens);

    mundo.modoDoPost = 'ok';
    mundo.demoraDoPostMs = 12_000;
    await enviarTexto(textoDe('igual'));
    mundo.modoDoPost = 'falha';
    mundo.demoraDoPostMs = 0;
    await enviarTexto(textoDe('igual'));
    await avancar(200);
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();

    await avancar(5_200);
    expect(dadosDaLista().map((d) => d.situacao)).toEqual([
      'enviada',
      'falhou',
    ]);
    await avancar(10_000);
    expect(dadosDaLista().map((d) => d.situacao)).toEqual([
      'enviada',
      'falhou',
    ]);
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
  });
});

describe('rótulo da linha da lista de conversas (D7/D8)', () => {
  function gravarEm(
    mundo: ReturnType<typeof criarMundo>,
    autorId: string,
    texto: string,
    enviadaEm: string,
  ) {
    const nova = mundo.gravarMensagem(autorId, texto);
    mundo.mensagens[mundo.mensagens.length - 1] = { ...nova, enviadaEm };
  }

  it('com prévia: nome, "Última mensagem:", a prévia numa linha só e a hora de hoje (HH:MM)', async () => {
    const mundo = criarMundo();
    mundo.gravarMensagem(AUTOR.id, `${textoDe('a')}\n\n   ${textoDe('b')}`);
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp('/conversas', { fetch, token: FREELA.token });

    const linha = await screen.findByLabelText(
      linhaDaListaCom(
        AUTOR.nome,
        `${textoDe('a')} ${textoDe('b')}`,
        String.raw`\d{2}:\d{2}`,
      ),
    );
    expect(linha).toBeOnTheScreen();
    expect(String(linha.props.accessibilityLabel)).toContain(
      `Abrir conversa com ${AUTOR.nome}. Última mensagem: `,
    );
  });

  it('sem mensagem: "Nenhuma mensagem ainda" e nada de hora no rótulo', async () => {
    const mundo = criarMundo();
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp('/conversas', { fetch, token: FREELA.token });

    const linha = await screen.findByLabelText(
      linhaDaListaCom(AUTOR.nome, null),
    );
    expect(String(linha.props.accessibilityLabel)).toBe(
      `Abrir conversa com ${AUTOR.nome}. ${textos.conversas.previaVazia}`,
    );
    expect(String(linha.props.accessibilityLabel)).not.toMatch(/\d{2}:\d{2}/);
  });

  it('perfil do outro em 404: "esta pessoa" no rótulo, com a prévia e a hora, e o título da conversa "Perfil indisponível"', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe('oi') }],
    });
    const fetch = criarFetchDoMundo(mundo).responder(
      `GET /perfis/${AUTOR.id}`,
      { status: 404, corpo: { erro: 'nao_encontrado' } },
    );
    await abrirApp('/conversas', { fetch, token: FREELA.token });

    const linha = await screen.findByLabelText(
      linhaDaListaCom(null, textoDe('oi')),
    );
    expect(String(linha.props.accessibilityLabel)).toMatch(
      /^Abrir conversa com esta pessoa\. Última mensagem: /,
    );
    expect(screen.queryByLabelText(new RegExp(AUTOR.nome))).toBeNull();

    await fireEvent.press(linha);
    await screen.findByLabelText(new RegExp(`${textoDe('oi')}$`));
    expect(
      screen.getAllByText(textos.conversas.perfilIndisponivel).length,
    ).toBeGreaterThan(0);
  });

  it('hora: mesmo ano e outro dia vira "dd/mm HH:MM"; outro ano vira "dd/mm/aaaa"', async () => {
    const agora = new Date();
    const ano = agora.getFullYear();
    // Dia do mesmo ano que não é hoje.
    const outroDia =
      agora.getMonth() === 0 && agora.getDate() === 2
        ? new Date(ano, 1, 3, 9, 5)
        : new Date(ano, 0, 2, 9, 5);
    const outroAno = new Date(ano - 1, 5, 15, 14, 32);
    const dd = String(outroDia.getDate()).padStart(2, '0');
    const mm = String(outroDia.getMonth() + 1).padStart(2, '0');
    const mundo = criarMundo({ conversaAberta: false });
    mundo.conversas.push(
      {
        id: 'c1',
        participantes: [FREELA.id, AUTOR.id],
        criadaEm: outroDia.toISOString(),
      },
      {
        id: 'c2',
        participantes: [FREELA.id, ESTRANHO.id],
        criadaEm: outroAno.toISOString(),
      },
    );
    gravarEm(mundo, AUTOR.id, textoDe('dia'), outroDia.toISOString());
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp('/conversas', { fetch, token: FREELA.token });

    expect(
      await screen.findByLabelText(
        linhaDaListaCom(AUTOR.nome, textoDe('dia'), `${dd}/${mm} 09:05`),
      ),
    ).toBeOnTheScreen();
    // Sem mensagem a linha não tem hora, mas a conversa antiga não quebra a lista.
    expect(
      screen.getByLabelText(linhaDaListaCom(ESTRANHO.nome, null)),
    ).toBeOnTheScreen();
  });

  it('mensagem de outro ano: a hora do rótulo é a data completa', async () => {
    const ano = new Date().getFullYear();
    const antiga = new Date(ano - 1, 5, 15, 14, 32);
    const mundo = criarMundo();
    gravarEm(mundo, AUTOR.id, textoDe('antiga'), antiga.toISOString());
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp('/conversas', { fetch, token: FREELA.token });

    expect(
      await screen.findByLabelText(
        linhaDaListaCom(AUTOR.nome, textoDe('antiga'), `15/06/${ano - 1}`),
      ),
    ).toBeOnTheScreen();
  });
});

describe('conversa com o perfil do outro em 404 (R4/D4)', () => {
  it('as bolhas do outro dizem "Outra pessoa", o anúncio da região viva é "Nova mensagem de outra pessoa" e a dele não vaza nome', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const fetch = criarFetchDoMundo(mundo).responder(
      `GET /perfis/${AUTOR.id}`,
      { status: 404, corpo: { erro: 'nao_encontrado' } },
    );
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });

    const bolha = await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));
    expect(String(bolha.props.accessibilityLabel)).toMatch(/^Outra pessoa, /);
    expect(
      screen.getAllByText(textos.conversas.perfilIndisponivel).length,
    ).toBeGreaterThan(0);

    mundo.gravarMensagem(AUTOR.id, textoDe(2));
    await avancar(5_200);
    expect(
      await screen.findByText(textos.conversas.novaMensagemDe(null)),
    ).toBeOnTheScreen();
    expect(textos.conversas.novaMensagemDe(null)).toBe(
      'Nova mensagem de outra pessoa',
    );
  });

  it('com o perfil carregado, o anúncio usa o nome e a mensagem minha não gera anúncio', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));

    await enviarTexto(textoDe('minha'));
    await avancar(5_200);
    expect(
      screen.queryByText(textos.conversas.novaMensagemDe(AUTOR.nome)),
    ).toBeNull();

    mundo.gravarMensagem(AUTOR.id, textoDe(2));
    await avancar(5_200);
    expect(
      await screen.findByText(textos.conversas.novaMensagemDe(AUTOR.nome)),
    ).toBeOnTheScreen();
  });
});

describe('Q2 (prévia da lista) com o envio concluído sem esperar a lista', () => {
  it('enviar e voltar logo: a lista pede de novo e mostra a mensagem enviada na linha', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp('/conversas', { fetch, token: FREELA.token });
    await fireEvent.press(
      await screen.findByLabelText(linhaDaListaCom(AUTOR.nome, textoDe(1))),
    );
    await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));
    const antes = listasPedidas(fetch).length;

    await enviarTexto(textoDe('ok'));
    await avancar(300);
    expect(listasPedidas(fetch).length).toBe(antes + 1);
    await act(async () => router.back());
    await avancar(500);
    expect(
      screen.getByLabelText(linhaDaListaCom(AUTOR.nome, textoDe('ok'))),
    ).toBeOnTheScreen();
  });
});
