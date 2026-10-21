// QA da entrega 2b: publicar trampo e ofertar serviço, pelas rotas reais
// (`ROTAS_REAIS`), com bordas de valor, prazo e texto, duplo toque, D9 e
// jornadas que cruzam telas.
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { TextInput } from 'react-native';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
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

const t = textos.formularioDeAnuncio;
const BUSCA_VAZIA = { corpo: { itens: [], proximoCursor: null } };

function criarFake(): FetchFalso {
  return criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /busca', BUSCA_VAZIA)
    .responder('GET /trampos/meus', { corpo: [] })
    .responder('GET /servicos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', { corpo: [] });
}

const posts = (fetch: FetchFalso, caminho: string) =>
  fetch.requisicoes.filter((r) => r.metodo === 'POST' && r.caminho === caminho);

const avancar = (ms = 50) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

async function digitar(rotulo: string, texto: string) {
  await fireEvent.changeText(screen.getByLabelText(rotulo), texto);
}

async function sair(rotulo: string) {
  await fireEvent(screen.getByLabelText(rotulo), 'blur');
}

async function escolherCategoria(rotulo = 'Reformas e reparos') {
  await fireEvent.press(
    screen.getByRole('button', {
      name: `${t.categoria}: ${t.escolherCategoria}`,
    }),
  );
  await fireEvent.press(await screen.findByRole('button', { name: rotulo }));
}

async function preencherTrampo(
  campos: {
    titulo?: string;
    descricao?: string;
    cidade?: string;
    valor?: string;
    prazo?: string;
  } = {},
) {
  await screen.findByDisplayValue('Lavras');
  await digitar(t.titulo, campos.titulo ?? 'Pintar a sala');
  await digitar(t.descricao, campos.descricao ?? 'Duas demãos de tinta.');
  if (campos.cidade !== undefined) await digitar(t.cidade, campos.cidade);
  await escolherCategoria();
  await digitar(t.valor, campos.valor ?? '1.500,00');
  if (campos.prazo !== undefined) await digitar(t.prazo, campos.prazo);
}

const botaoPublicar = () =>
  screen.getByRole('button', { name: t.publicarTrampo });

function corpoDoPost(fetch: FetchFalso) {
  return posts(fetch, '/trampos')[0]?.corpo as Record<string, unknown>;
}

function fakeQuePublica(): FetchFalso {
  return criarFake().responder('POST /trampos', {
    status: 201,
    corpo: { id: 't-novo', status: 'aberto' },
  });
}

describe('valor digitado (CA4)', () => {
  it.each([
    ['0,50', 50],
    ['1.234.567,89', 123456789],
    ['21474836,47', 2147483647],
    ['R$ 1.500,00', 150000],
    ['150', 15000],
    ['1,5', 150],
  ])('"%s" vai como %i centavos', async (digitado, centavos) => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ valor: digitado });
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);
    expect(corpoDoPost(fetch).valorCentavos).toBe(centavos);
  });

  it('"21474836,48" (acima do teto do banco) não envia e aponta o valor', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ valor: '21474836,48' });
    await fireEvent.press(botaoPublicar());

    expect(await screen.findByText(textos.erros.valor_alto)).toBeOnTheScreen();
    expect(posts(fetch, '/trampos')).toHaveLength(0);
  });

  it.each(['0', '0,00', 'abc', '1,234', '-5'])(
    '"%s" não envia e mostra "valor precisa ser maior que zero"',
    async (digitado) => {
      const fetch = fakeQuePublica();
      await abrirApp('/trampos/novo', { fetch });
      await preencherTrampo({ valor: digitado });
      await fireEvent.press(botaoPublicar());

      expect(
        await screen.findByText(textos.erros.valor_invalido),
      ).toBeOnTheScreen();
      expect(posts(fetch, '/trampos')).toHaveLength(0);
    },
  );

  it('valor de 30 dígitos não quebra: aponta "valor alto" e não envia', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ valor: '9'.repeat(30) });
    await fireEvent.press(botaoPublicar());

    expect(await screen.findByText(textos.erros.valor_alto)).toBeOnTheScreen();
    expect(posts(fetch, '/trampos')).toHaveLength(0);
  });

  it('valor acima do teto ao sair do campo mostra o erro e não reformata', async () => {
    await abrirApp('/trampos/novo', { fetch: fakeQuePublica() });
    await screen.findByDisplayValue('Lavras');
    await digitar(t.valor, '99999999999');
    await sair(t.valor);

    expect(await screen.findByText(textos.erros.valor_alto)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.valor).props.value).toBe('99999999999');
  });
});

describe('prazo digitado (CA4)', () => {
  it('"31122026" é reformatado e vai como ISO', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ prazo: '31122026' });
    await sair(t.prazo);
    expect(screen.getByLabelText(t.prazo).props.value).toBe('31/12/2026');
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);
    expect(corpoDoPost(fetch).prazo).toBe('2026-12-31');
  });

  it('prazo só de espaços conta como vazio: a chave `prazo` não vai', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ prazo: '   ' });
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);
    expect(corpoDoPost(fetch)).not.toHaveProperty('prazo');
  });

  it.each([
    '29/02/2027',
    '01/01/1899',
    '31/04/2026',
    '1/1/2026',
    '2026-12-31',
    '00/00/0000',
  ])('"%s" não envia e mostra o erro de prazo', async (digitado) => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ prazo: digitado });
    await fireEvent.press(botaoPublicar());

    expect(
      await screen.findByText(textos.erros.prazo_invalido),
    ).toBeOnTheScreen();
    expect(posts(fetch, '/trampos')).toHaveLength(0);
  });

  it('29/02/2028 (bissexto) vale', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ prazo: '29/02/2028' });
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);
    expect(corpoDoPost(fetch).prazo).toBe('2028-02-29');
  });
});

describe('texto do anúncio (CA4, CA5)', () => {
  it('apara título, descrição e cidade antes de enviar', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({
      titulo: '   Pintar a sala   ',
      descricao: '\n Duas demãos \n',
      cidade: '  Perdões ',
    });
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);
    expect(corpoDoPost(fetch)).toMatchObject({
      titulo: 'Pintar a sala',
      descricao: 'Duas demãos',
      cidade: 'Perdões',
    });
  });

  it('título com 80 emojis (80 pontos de código) vale; com 81 não envia', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ titulo: '🔨'.repeat(81) });
    await fireEvent.press(botaoPublicar());
    expect(
      await screen.findByText(textos.erros.titulo_tamanho),
    ).toBeOnTheScreen();
    expect(posts(fetch, '/trampos')).toHaveLength(0);

    await digitar(t.titulo, '🔨'.repeat(80));
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);
    expect(corpoDoPost(fetch).titulo).toBe('🔨'.repeat(80));
  });

  it('título só de espaços, descrição só de espaços e cidade apagada apontam os três', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ titulo: '      ', descricao: '   ', cidade: ' ' });
    await fireEvent.press(botaoPublicar());

    expect(
      await screen.findByText(textos.erros.titulo_tamanho),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.erros.descricao_trampo_obrigatoria),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.erros.cidade_anuncio_obrigatoria),
    ).toBeOnTheScreen();
    expect(posts(fetch, '/trampos')).toHaveLength(0);
  });

  it('descrição de 2001 caracteres não envia; de 2000 envia', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ descricao: 'a'.repeat(2001) });
    await fireEvent.press(botaoPublicar());
    expect(
      await screen.findByText(textos.erros.descricao_anuncio_tamanho),
    ).toBeOnTheScreen();
    expect(posts(fetch, '/trampos')).toHaveLength(0);

    await digitar(t.descricao, 'a'.repeat(2000));
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);
  });

  it('caractere nulo na descrição é recusado localmente', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ descricao: 'texto\u0000escondido' });
    await fireEvent.press(botaoPublicar());
    expect(
      await screen.findByText(textos.erros.descricao_anuncio_tamanho),
    ).toBeOnTheScreen();
    expect(posts(fetch, '/trampos')).toHaveLength(0);
  });

  it('trocar a categoria depois do erro limpa o erro da categoria', async () => {
    await abrirApp('/trampos/novo', { fetch: fakeQuePublica() });
    await screen.findByDisplayValue('Lavras');
    await fireEvent.press(botaoPublicar());
    expect(
      await screen.findByText(textos.erros.categoria_obrigatoria),
    ).toBeOnTheScreen();

    await escolherCategoria('Aulas e reforço');
    expect(screen.queryByText(textos.erros.categoria_obrigatoria)).toBeNull();
  });

  it('o foco vai ao primeiro campo com erro, não sempre ao título', async () => {
    await abrirApp('/trampos/novo', { fetch: fakeQuePublica() });
    await preencherTrampo({ valor: '0' });
    const foco = jest.spyOn(TextInput.prototype, 'focus');
    foco.mockClear();
    await fireEvent.press(botaoPublicar());
    await screen.findByText(textos.erros.valor_invalido);

    expect(foco).toHaveBeenCalled();
    expect(foco.mock.contexts[0]).toHaveProperty(
      'props.accessibilityLabel',
      t.valor,
    );
    foco.mockRestore();
  });
});

describe('rascunho e confirmação (CA4)', () => {
  it('"Publicar outro" permite publicar um segundo trampo com outro corpo (dois POSTs, cada um com o seu)', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ titulo: 'Primeiro trampo' });
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);
    await fireEvent.press(
      screen.getByRole('button', { name: t.publicarOutro }),
    );

    await preencherTrampo({ titulo: 'Segundo trampo', valor: '0,50' });
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);

    const enviados = posts(fetch, '/trampos');
    expect(enviados.map((p) => (p.corpo as { titulo: string }).titulo)).toEqual(
      ['Primeiro trampo', 'Segundo trampo'],
    );
    expect(enviados[1]?.corpo).toMatchObject({ valorCentavos: 50 });
    expect(enviados[1]?.corpo).not.toHaveProperty('prazo');
  });

  it('o perfil que chega depois da primeira digitação preenche a cidade sem apagar o que já foi digitado', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', {
      corpo: PERFIL_COMPLETO,
      demoraMs: 800,
    });
    await abrirApp('/trampos/novo', { fetch });
    await digitar(t.titulo, 'Pintar a sala');
    expect(screen.getByLabelText(t.cidade).props.value).toBe('');

    await avancar(900);
    expect(await screen.findByDisplayValue('Lavras')).toBeOnTheScreen();
    expect(screen.getByLabelText(t.titulo).props.value).toBe('Pintar a sala');
  });

  it('cidade apagada pela pessoa não volta sozinha quando o perfil recarrega', async () => {
    await abrirApp('/trampos/novo', { fetch: fakeQuePublica() });
    await screen.findByDisplayValue('Lavras');
    await digitar(t.cidade, '');
    await avancar(200);
    expect(screen.getByLabelText(t.cidade).props.value).toBe('');
  });
});

/** Deixa `GET /trampos/meus` no cache (uma recarga só acontece para consulta que já existe). */
async function abrirFormularioComMeusTrampos(fetch: FetchFalso) {
  await abrirApp('/', { fetch });
  await screen.findByText(textos.inicio.trampos);
  await act(async () => router.push('/meus-anuncios'));
  await screen.findByText(textos.meusAnuncios.vazioTrampos);
  await act(async () => router.push('/trampos/novo'));
}

describe('máscara do prazo e recarga que falha (R2, D3)', () => {
  it.each([
    ['31', '31'],
    ['3112', '31/12'],
    ['31122026', '31/12/2026'],
    ['31/12/2026', '31/12/2026'],
    ['31ab12', '31/12'],
    ['311220269999', '31/12/2026'],
  ])('digitar "%s" no prazo mostra "%s"', async (digitado, mostrado) => {
    await abrirApp('/trampos/novo', { fetch: fakeQuePublica() });
    await screen.findByDisplayValue('Lavras');
    await digitar(t.prazo, digitado);
    expect(screen.getByLabelText(t.prazo).props.value).toBe(mostrado);
  });

  it('prazo digitado com a máscara vai como ISO', async () => {
    const fetch = fakeQuePublica();
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo({ prazo: '31122026' });
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);
    expect(corpoDoPost(fetch).prazo).toBe('2026-12-31');
  });

  it('se Meus trampos falha na recarga depois do POST, a confirmação aparece e o botão não fica em "Enviando…"', async () => {
    let publicado = false;
    const fetch = criarFake()
      .responder('POST /trampos', () => {
        publicado = true;
        return { status: 201, corpo: { id: 't-novo', status: 'aberto' } };
      })
      .responder('GET /trampos/meus', () =>
        publicado ? { status: 500, corpo: { erro: 'interno' } } : { corpo: [] },
      );
    await abrirFormularioComMeusTrampos(fetch);
    await preencherTrampo();
    await fireEvent.press(botaoPublicar());

    expect(await screen.findByText(t.publicadoTrampo)).toBeOnTheScreen();
    expect(screen.queryByText(t.enviando)).toBeNull();
    // A recarga que falhou aconteceu de verdade (a consulta existia).
    expect(
      fetch.requisicoes.filter((r) => r.caminho === '/trampos/meus').length,
    ).toBeGreaterThanOrEqual(2);
    expect(posts(fetch, '/trampos')).toHaveLength(1);
  });

  it('se Meus trampos demora demais na recarga, a confirmação aparece em até 5 s', async () => {
    let publicado = false;
    const fetch = criarFake()
      .responder('POST /trampos', () => {
        publicado = true;
        return { status: 201, corpo: { id: 't-novo', status: 'aberto' } };
      })
      .responder('GET /trampos/meus', () =>
        publicado ? { corpo: [], demoraMs: 60_000 } : { corpo: [] },
      );
    await abrirFormularioComMeusTrampos(fetch);
    await preencherTrampo();
    await fireEvent.press(botaoPublicar());
    await avancar(100);
    expect(screen.queryByText(t.publicadoTrampo)).toBeNull();

    await avancar(5200);
    expect(await screen.findByText(t.publicadoTrampo)).toBeOnTheScreen();
  });
});

describe('duplo toque em "Publicar" (CA4)', () => {
  it('dois toques espaçados (o app já redesenhou) mandam um só POST', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 201,
      corpo: { id: 't-novo', status: 'aberto' },
      demoraMs: 200,
    });
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo();

    const botao = botaoPublicar();
    await fireEvent.press(botao);
    await avancar(50);
    await fireEvent.press(botao);
    await screen.findByText(t.publicadoTrampo);

    expect(posts(fetch, '/trampos')).toHaveLength(1);
  });

  it('dois toques no mesmo quadro (antes de o botão virar "Enviando…") mandam um só POST', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 201,
      corpo: { id: 't-novo', status: 'aberto' },
      demoraMs: 200,
    });
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo();

    await tocarDuasVezes(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);

    expect(posts(fetch, '/trampos')).toHaveLength(1);
  });

  it('dois toques no mesmo quadro em "Ofertar serviço" mandam um só POST', async () => {
    const fetch = criarFake().responder('POST /servicos', {
      status: 201,
      corpo: { id: 's-novo', status: 'ativo' },
      demoraMs: 200,
    });
    await abrirApp('/servicos/novo', { fetch });
    await screen.findByDisplayValue('Lavras');
    await digitar(t.titulo, 'Faço limpeza pós-obra');
    await digitar(t.descricao, 'Equipe própria.');
    await escolherCategoria();
    await digitar(t.precoBase, '80');

    await tocarDuasVezes(
      screen.getByRole('button', { name: t.ofertarServico }),
    );
    await screen.findByText(t.publicadoServico);

    expect(posts(fetch, '/servicos')).toHaveLength(1);
  });
});

interface Fibra {
  readonly memoizedProps?: { readonly onPress?: unknown } | null;
  readonly return: Fibra | null;
}

/** Chama o `onPress` do botão duas vezes num só `act` (como dois toques no mesmo quadro). */
async function tocarDuasVezes(elemento: object) {
  let fibra = (elemento as { unstable_fiber?: Fibra }).unstable_fiber ?? null;
  while (fibra !== null && typeof fibra.memoizedProps?.onPress !== 'function') {
    fibra = fibra.return;
  }
  const onPress = fibra?.memoizedProps?.onPress;
  if (typeof onPress !== 'function') {
    throw new Error('botão sem onPress');
  }
  await act(async () => {
    onPress();
    onPress();
  });
}

describe('serviço sem cidade e com cidade (CA6, D7)', () => {
  it('cidade só de espaços vai sem a chave `cidade`', async () => {
    const fetch = criarFake().responder('POST /servicos', {
      status: 201,
      corpo: { id: 's-novo', status: 'ativo' },
    });
    await abrirApp('/servicos/novo', { fetch });
    await screen.findByDisplayValue('Lavras');
    await digitar(t.titulo, 'Faço limpeza pós-obra');
    await digitar(t.descricao, 'Equipe própria.');
    await escolherCategoria();
    await digitar(t.precoBase, '80,00');
    await digitar(t.cidadeOpcional, '   ');
    await fireEvent.press(
      screen.getByRole('button', { name: t.ofertarServico }),
    );
    await screen.findByText(t.publicadoServico);

    const corpo = posts(fetch, '/servicos')[0]?.corpo as Record<
      string,
      unknown
    >;
    expect(corpo).not.toHaveProperty('cidade');
    expect(corpo).toEqual({
      titulo: 'Faço limpeza pós-obra',
      descricao: 'Equipe própria.',
      categoria: 'reformas',
      precoBaseCentavos: 8000,
    });
  });

  it('cidade de 1 letra no serviço não envia', async () => {
    const fetch = criarFake();
    await abrirApp('/servicos/novo', { fetch });
    await screen.findByDisplayValue('Lavras');
    await digitar(t.titulo, 'Faço limpeza pós-obra');
    await digitar(t.descricao, 'Equipe própria.');
    await escolherCategoria();
    await digitar(t.precoBase, '80,00');
    await digitar(t.cidadeOpcional, 'L');
    await fireEvent.press(
      screen.getByRole('button', { name: t.ofertarServico }),
    );
    expect(
      await screen.findByText(textos.erros.cidade_tamanho),
    ).toBeOnTheScreen();
    expect(posts(fetch, '/servicos')).toHaveLength(0);
  });
});

describe('D9 em publicar e ofertar', () => {
  it('409 perfil_incompleto com o perfil já salvo avisa sem a lista "Falta: …"', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 409,
      corpo: { erro: 'perfil_incompleto' },
    });
    await abrirApp('/trampos/novo', { fetch });
    await preencherTrampo();
    await fireEvent.press(botaoPublicar());

    expect(
      await screen.findByText(textos.avisoPerfil.mensagem([])),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Falta:/)).toBeNull();
    expect(
      screen.getByRole('button', { name: textos.avisoPerfil.completar }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.avisoPerfil.agoraNao }),
    ).toBeOnTheScreen();
  });

  it('completar o perfil a partir do formulário devolve a pessoa ao formulário (spec: "volta à tela de origem ao salvar")', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    fetch.responder('PUT /perfis/eu', { corpo: PERFIL_COMPLETO });
    await abrirApp('/trampos/novo', { fetch });
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.avisoPerfil.completar,
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfil/editar'));

    // O perfil passa a existir quando a pessoa salva.
    fetch.responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO });
    await fireEvent.changeText(
      await screen.findByLabelText(textos.editarPerfil.nome),
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

    expect(
      await screen.findByText(textos.editarPerfil.sucesso),
    ).toBeOnTheScreen();
    await avancar(8000);

    await waitFor(() => expect(screen).not.toHavePathname('/perfil/editar'));
    expect(screen).toHavePathname('/trampos/novo');
  });
});

describe('jornada: publicar e ver o trampo em todo lugar (CA4)', () => {
  const NOVO = {
    id: 't-novo',
    autorId: 'c-eu',
    titulo: 'Pintar a sala',
    descricao: 'Duas demãos de tinta.',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 150000,
    prazo: '2026-12-31',
    status: 'aberto',
    criadoEm: '2026-10-21T12:00:00.000Z',
  };
  const ITEM_DA_BUSCA = {
    tipo: 'trampo',
    id: 't-novo',
    autorId: 'c-eu',
    titulo: 'Pintar a sala',
    categoria: 'reformas',
    cidade: 'Lavras',
    criadoEm: '2026-10-21T12:00:00.000Z',
    valorCentavos: 150000,
  };

  it('depois de publicar: "Ver trampo" reconhece o autor e o anúncio aparece em Meus trampos, no Início e na Buscar', async () => {
    let publicado = false;
    const fetch = criarFake()
      .responder('POST /trampos', () => {
        publicado = true;
        return { status: 201, corpo: { id: 't-novo', status: 'aberto' } };
      })
      .responder('GET /trampos/meus', () => ({
        corpo: publicado ? [NOVO] : [],
      }))
      .responder('GET /busca', (r) => ({
        corpo: {
          itens:
            publicado && r.query.tipo !== 'servicos' ? [ITEM_DA_BUSCA] : [],
          proximoCursor: null,
        },
      }))
      .responder('GET /trampos/t-novo', { corpo: NOVO })
      .responder('GET /trampos/t-novo/candidaturas', { corpo: [] })
      .responder('GET /perfis/c-eu', {
        corpo: { contaId: 'c-eu', ...PERFIL_COMPLETO },
      });
    await abrirApp('/', { fetch });
    await screen.findByText(textos.inicio.trampos);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.abas.publicar }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: `${textos.escolhaDePublicacao.trampo}. ${textos.escolhaDePublicacao.trampoAjuda}`,
      }),
    );
    await preencherTrampo({ prazo: '31/12/2026' });
    await fireEvent.press(botaoPublicar());
    await screen.findByText(t.publicadoTrampo);

    await fireEvent.press(screen.getByRole('button', { name: t.verTrampo }));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t-novo'));
    // O autor reconhecido logo: nada de "Candidatar-se" no próprio trampo.
    expect(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.verCandidaturas(0),
      }),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.detalheTrampo.candidatar }),
    ).toBeNull();

    // Meus trampos (pelo Perfil).
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.abas.perfil }),
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.meusTrampos }),
    );
    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
  });
});
