// Etapa 11 da V2b (plano visual-v2): as rotas Avaliar e Avaliações e a ligação
// das telas da V2b nas listas e nos perfis (CA96 a CA98), com o app inteiro e
// o fake de `fetch`.
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { AvaliacaoRecebida } from '../../api/tipos';
import RotaDasAvaliacoes from '../../app/(app)/avaliacoes/[contaId]';
import RotaDeAvaliar from '../../app/(app)/avaliar/[trampoId]';
import { formatarNota } from '../../componentes/Estrelas';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import type { Modo } from '../../estado/modo';
import { textos } from '../../textos/pt-BR';
import type { FetchFalso, RespostaFalsa } from '../fetch-falso';
import { fakeComCategorias, ROTAS_REAIS, vigiarConsole } from '../qa/apoio-qa';
import { type MapaDeRotas, renderizarRotas, TOKEN_DE_TESTE } from './apoio';

vigiarConsole();

const ROTAS: MapaDeRotas = {
  ...ROTAS_REAIS,
  '(app)/avaliar/[trampoId]': RotaDeAvaliar,
  '(app)/avaliacoes/[contaId]': RotaDasAvaliacoes,
};

// --- Dados ---

const EU = 'conta-eu';
const AUTOR = 'conta-autor';

const PERFIL_DE_EU = {
  contaId: EU,
  nome: 'Maria Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

function perfil(contaId: string, nome: string) {
  return { contaId, nome, cidade: 'Lavras', descricao: null, habilidades: [] };
}

/** Meio-dia UTC: a data local é a mesma em qualquer fuso do Brasil. */
function trampo(
  id: string,
  status: 'aberto' | 'em_andamento' | 'encerrado',
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    autorId: AUTOR,
    titulo: `Trampo ${id}`,
    descricao: 'Descrição.',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 15000,
    prazo: null,
    status,
    criadoEm: '2026-10-20T12:00:00.000Z',
    ...extra,
  };
}

/** Visão do autor: a conta é `EU` e o trampo traz a `versao`. */
function meuTrampo(
  id: string,
  status: 'aberto' | 'em_andamento' | 'encerrado',
  extra: Record<string, unknown> = {},
) {
  return trampo(id, status, { autorId: EU, versao: 1, ...extra });
}

function candidatura(
  id: string,
  freelancerId: string,
  status: 'pendente' | 'aceita' | 'recusada',
) {
  return {
    id,
    freelancerId,
    mensagem: 'Posso ir amanhã.',
    valorPropostoCentavos: 12000,
    status,
    criadaEm: '2026-10-21T12:00:00.000Z',
  };
}

function resumo(
  contaId: string,
  comoFreela: { media: number | null; total: number } | null,
  comoContratante: { media: number | null; total: number } | null = null,
) {
  const vazio = { media: null, total: 0, destaques: [] };
  return {
    contaId,
    comoFreela: comoFreela ? { ...comoFreela, destaques: [] } : vazio,
    comoContratante: comoContratante
      ? { ...comoContratante, destaques: [] }
      : vazio,
  };
}

function feita(trampoId: string, nota: number) {
  return { trampoId, nota, criadaEm: '2026-11-01T12:00:00.000Z' };
}

const SEM_CONTEUDO: RespostaFalsa = { status: 204 };

function fake(): FetchFalso {
  return fakeComCategorias()
    .responder('GET /perfis/eu', { corpo: PERFIL_DE_EU })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('GET /trampos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', { corpo: [] })
    .responder('GET /conversas', { corpo: [] })
    .responder('GET /favoritos', { corpo: [] })
    .responder('GET /avaliacoes/feitas', { corpo: [] })
    .responder('GET /avaliacoes/resumos', { corpo: [] });
}

async function abrir(
  url: string,
  { fetch = fake(), modo = null }: { fetch?: FetchFalso; modo?: Modo | null },
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

/** Rótulo falado da nota num cartão ou perfil (com o total de avaliações). */
function rotuloDaNota(media: number, total: number): string {
  return `${textos.gerais.nota(formatarNota(media))}, ${textos.avaliacoes.recebidas(total)}`;
}

function idsDoPedido(
  requisicoes: readonly { query: Record<string, string> }[],
) {
  return requisicoes.map((r) => r.query.trampos ?? r.query.contas);
}

// --- CA96: "Avaliar" nas listas ---

describe('CA96: "Avaliar" em Demandas › Encerradas', () => {
  const TRAMPOS = [
    meuTrampo('t1', 'encerrado', { candidaturasRecebidas: 1 }),
    meuTrampo('t2', 'encerrado', { candidaturasRecebidas: 2 }),
    meuTrampo('t3', 'encerrado', { candidaturasRecebidas: 0 }),
    meuTrampo('t4', 'aberto', { candidaturasRecebidas: 1 }),
  ];

  async function abrirEncerradas(fetch: FetchFalso) {
    const resultado = await abrir('/demandas', { modo: 'contratante', fetch });
    await screen.findByText('Trampo t4');
    await fireEvent.press(
      screen.getByRole('tab', { name: textos.demandas.abaEncerradas }),
    );
    return resultado;
  }

  it('"Avaliar profissional" no que não foi avaliado, "Avaliado com N ★" no avaliado e nada sem candidatos, com um pedido de feitas só', async () => {
    const fetch = fake()
      .responder('GET /trampos/meus', { corpo: TRAMPOS })
      .responder('GET /avaliacoes/feitas', { corpo: [feita('t2', 5)] });
    await abrirEncerradas(fetch);

    expect(
      await screen.findByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t1'),
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(textos.avaliar.avaliadoComFalado(5)),
    ).toBeOnTheScreen();
    // Sem candidatura nenhuma, não há a quem avaliar.
    expect(
      screen.queryByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t3'),
      }),
    ).toBeNull();
    expect(
      screen.getAllByText(textos.avaliar.avaliarProfissional),
    ).toHaveLength(1);

    // CA97: um pedido para a lista inteira, nunca um por item; só os encerrados
    // com candidatura entram.
    const pedidos = chamadas(fetch, 'GET', '/avaliacoes/feitas');
    expect(pedidos).toHaveLength(1);
    expect(idsDoPedido(pedidos)).toEqual(['t1,t2']);
  });

  it('o toque leva a /avaliar/t1', async () => {
    await abrirEncerradas(
      fake().responder('GET /trampos/meus', { corpo: TRAMPOS }),
    );

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t1'),
      }),
    );

    await waitFor(() => expect(screen).toHavePathname('/avaliar/t1'));
  });

  it('enquanto as avaliações feitas não chegam, não oferece "Avaliar" (a ausência ainda não prova nada)', async () => {
    const fetch = fake()
      .responder('GET /trampos/meus', { corpo: TRAMPOS })
      .responder('GET /avaliacoes/feitas', {
        corpo: [feita('t1', 4)],
        demoraMs: 300,
      });
    await abrirEncerradas(fetch);

    await screen.findByText('Trampo t1');
    expect(
      screen.queryByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t1'),
      }),
    ).toBeNull();
    expect(
      await screen.findByLabelText(textos.avaliar.avaliadoComFalado(4)),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t1'),
      }),
    ).toBeNull();
  });

  it('se as avaliações feitas falham, não oferece "Avaliar"', async () => {
    const fetch = fake()
      .responder('GET /trampos/meus', { corpo: TRAMPOS })
      .responder('GET /avaliacoes/feitas', { status: 500 });
    await abrirEncerradas(fetch);

    await screen.findByText('Trampo t1');
    await waitFor(() =>
      expect(
        chamadas(fetch, 'GET', '/avaliacoes/feitas').length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByText(textos.avaliar.avaliarProfissional)).toBeNull();
  });
});

describe('CA96: "Avaliar" em Meus trampos › Encerrados', () => {
  function fakeDoFreela(): FetchFalso {
    return fake()
      .responder('GET /candidaturas/minhas', {
        corpo: [
          { ...candidatura('k1', EU, 'aceita'), trampoId: 't1' },
          { ...candidatura('k2', EU, 'aceita'), trampoId: 't2' },
          { ...candidatura('k3', EU, 'aceita'), trampoId: 't3' },
        ],
      })
      .responder('GET /trampos/t1', { corpo: trampo('t1', 'encerrado') })
      .responder('GET /trampos/t2', { corpo: trampo('t2', 'encerrado') })
      .responder('GET /trampos/t3', { corpo: trampo('t3', 'em_andamento') })
      .responder('GET /perfis/conta-autor', {
        corpo: perfil(AUTOR, 'Carla Souza'),
      })
      .responder('GET /avaliacoes/feitas', { corpo: [feita('t2', 3)] });
  }

  async function abrirEncerrados(fetch: FetchFalso) {
    const resultado = await abrir('/meus-trampos', { fetch });
    await screen.findByRole('tab', { name: textos.meusTrampos.abaEncerrados });
    await fireEvent.press(
      screen.getByRole('tab', { name: textos.meusTrampos.abaEncerrados }),
    );
    return resultado;
  }

  it('só a candidatura aceita de trampo encerrado: "Avaliar" ou "Avaliado com N ★", num pedido só', async () => {
    const fetch = fakeDoFreela();
    await abrirEncerrados(fetch);

    expect(
      await screen.findByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t1'),
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(textos.avaliar.avaliadoComFalado(3)),
    ).toBeOnTheScreen();
    // O trampo em andamento nem entra no segmento nem no pedido.
    expect(screen.queryByText('Trampo t3')).toBeNull();
    const pedidos = chamadas(fetch, 'GET', '/avaliacoes/feitas');
    expect(idsDoPedido(pedidos).at(-1)).toBe('t1,t2');
    expect(idsDoPedido(pedidos).every((ids) => !ids?.includes('t3'))).toBe(
      true,
    );
  });

  it('o toque leva a /avaliar/t1', async () => {
    await abrirEncerrados(fakeDoFreela());

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t1'),
      }),
    );

    await waitFor(() => expect(screen).toHavePathname('/avaliar/t1'));
  });
});

// --- CA96: a tela Avaliar ---

describe('CA96: tela Avaliar', () => {
  /** O autor (`EU`) de um trampo encerrado, com `f1` na candidatura aceita. */
  function fakeDoAutor(): FetchFalso {
    let avaliada = false;
    return fake()
      .responder('GET /trampos/meus', {
        corpo: [
          meuTrampo('t4', 'aberto'),
          meuTrampo('t1', 'encerrado', {
            candidaturasRecebidas: 2,
            criadoEm: '2026-10-19T12:00:00.000Z',
          }),
        ],
      })
      .responder('GET /trampos/t1', {
        corpo: meuTrampo('t1', 'encerrado', { candidaturasRecebidas: 2 }),
      })
      .responder('GET /trampos/t1/candidaturas', {
        corpo: [
          candidatura('k0', 'f0', 'recusada'),
          candidatura('k1', 'f1', 'aceita'),
        ],
      })
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'João Pereira') })
      .responder('GET /avaliacoes/feitas', () => ({
        corpo: avaliada ? [feita('t1', 4)] : [],
      }))
      .responder('POST /avaliacoes', () => {
        avaliada = true;
        return { status: 201, corpo: { id: 'a1' } };
      })
      .responder('PUT /favoritos/f1', SEM_CONTEUDO);
  }

  async function preencher({ favoritar }: { favoritar: boolean }) {
    await fireEvent.press(
      await screen.findByRole('radio', { name: '4 estrelas' }),
    );
    await fireEvent.press(screen.getByText('Pontual'));
    await fireEvent.press(screen.getByText('Educado'));
    await fireEvent.changeText(
      screen.getByLabelText(textos.avaliar.comentario),
      'Capricho no acabamento.',
    );
    if (favoritar) {
      await fireEvent.press(
        screen.getByRole('switch', { name: textos.avaliar.favoritar }),
      );
    }
  }

  it('o autor avalia o freela: Enviar só com nota, um só POST e o "Favoritar", e volta a Demandas com o aviso e o "Avaliado com N ★"', async () => {
    const fetch = fakeDoAutor();
    await abrir('/demandas', { modo: 'contratante', fetch });
    await screen.findByText('Trampo t4');
    await fireEvent.press(
      screen.getByRole('tab', { name: textos.demandas.abaEncerradas }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t1'),
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/avaliar/t1'));

    // Título do freela e o alvo, com o nome do perfil.
    expect(
      (await screen.findAllByText(textos.avaliar.titulo)).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText('João Pereira')).toBeOnTheScreen();
    expect(screen.getByText('Trampo t1 · 20/10/2026')).toBeOnTheScreen();
    // Sem nota, o Enviar fica desabilitado e diz por quê.
    const enviar = () =>
      screen.getByRole('button', { name: textos.avaliar.enviar });
    expect(enviar()).toBeDisabled();
    expect(screen.getByText(textos.avaliar.escolhaNota)).toBeOnTheScreen();

    await preencher({ favoritar: true });
    expect(enviar()).toBeEnabled();
    // Toque duplo: um pedido só.
    const botao = enviar();
    await fireEvent.press(botao);
    await fireEvent.press(botao);

    await waitFor(() => expect(screen).toHavePathname('/demandas'));
    expect(await screen.findByText(textos.avaliar.enviada)).toBeOnTheScreen();
    expect(
      await screen.findByLabelText(textos.avaliar.avaliadoComFalado(4)),
    ).toBeOnTheScreen();

    const envios = chamadas(fetch, 'POST', '/avaliacoes');
    expect(envios).toHaveLength(1);
    expect(envios[0]?.corpo).toEqual({
      trampoId: 't1',
      nota: 4,
      destaques: ['pontual', 'educado'],
      comentario: 'Capricho no acabamento.',
    });
    expect(chamadas(fetch, 'PUT', '/favoritos/f1')).toHaveLength(1);
    // O comentário nunca vai para a URL.
    expect(fetch.requisicoes.every((r) => !r.url.includes('Capricho'))).toBe(
      true,
    );
  });

  it('sem "Favoritar" ligado, nada é favoritado; comentário e destaques em branco não vão no corpo', async () => {
    const fetch = fakeDoAutor();
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });

    await fireEvent.press(
      await screen.findByRole('radio', { name: '5 estrelas' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliar.enviar }),
    );

    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1),
    );
    expect(chamadas(fetch, 'POST', '/avaliacoes')[0]?.corpo).toEqual({
      trampoId: 't1',
      nota: 5,
    });
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(chamadas(fetch, 'PUT', '/favoritos/f1')).toHaveLength(0);
  });

  it('quem já está na equipe favorita começa com o "Favoritar" ligado e não manda outro PUT', async () => {
    const fetch = fakeDoAutor().responder('GET /favoritos', {
      corpo: [{ contaId: 'f1', criadoEm: '2026-11-02T12:00:00.000Z' }],
    });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });

    const interruptor = () =>
      screen.getByRole('switch', { name: textos.avaliar.favoritar });
    await screen.findByText('João Pereira');
    await waitFor(() => expect(interruptor()).toBeChecked());

    await fireEvent.press(
      await screen.findByRole('radio', { name: '5 estrelas' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliar.enviar }),
    );

    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1),
    );
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(chamadas(fetch, 'PUT', '/favoritos/f1')).toHaveLength(0);
  });

  it('quem ainda não está na equipe começa com o "Favoritar" desligado', async () => {
    await abrir('/avaliar/t1', { modo: 'contratante', fetch: fakeDoAutor() });

    await screen.findByText('João Pereira');
    expect(
      screen.getByRole('switch', { name: textos.avaliar.favoritar }),
    ).not.toBeChecked();
  });

  it('quem não é o autor avalia o contratante: título e destaques do contratante e sem "Favoritar"', async () => {
    const fetch = fake()
      .responder('GET /trampos/t1', { corpo: trampo('t1', 'encerrado') })
      .responder('GET /perfis/conta-autor', {
        corpo: perfil(AUTOR, 'Carla Souza'),
      })
      .responder('POST /avaliacoes', {
        status: 201,
        corpo: { id: 'a2' },
      });
    await abrir('/avaliar/t1', { fetch });

    expect(await screen.findByText('Carla Souza')).toBeOnTheScreen();
    expect(
      screen.getAllByText(textos.avaliar.tituloContratante).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Pagamento em dia')).toBeOnTheScreen();
    expect(screen.queryByText('Proativo')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    // O autor não é consultado: a lista de candidaturas é só dele.
    expect(chamadas(fetch, 'GET', '/trampos/t1/candidaturas')).toHaveLength(0);

    await fireEvent.press(screen.getByRole('radio', { name: '2 estrelas' }));
    await fireEvent.press(screen.getByText('Respeitoso'));
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliar.enviar }),
    );

    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1),
    );
    expect(chamadas(fetch, 'POST', '/avaliacoes')[0]?.corpo).toEqual({
      trampoId: 't1',
      nota: 2,
      destaques: ['respeitoso'],
    });
  });

  it('409 avaliacao_ja_feita: "Você já avaliou este trampo" no lugar do formulário', async () => {
    const fetch = fakeDoAutor().responder('POST /avaliacoes', {
      status: 409,
      corpo: { erro: 'avaliacao_ja_feita' },
    });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });

    await fireEvent.press(
      await screen.findByRole('radio', { name: '3 estrelas' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliar.enviar }),
    );

    expect(
      await screen.findByText(textos.avaliar.jaAvaliado),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.avaliar.comentario)).toBeNull();
    expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1);
  });

  it('409 trampo_nao_encerrado: o texto do erro aparece e dá para tentar de novo', async () => {
    const fetch = fakeDoAutor().responder('POST /avaliacoes', [
      { status: 409, corpo: { erro: 'trampo_nao_encerrado' } },
      { status: 201, corpo: { id: 'a3' } },
    ]);
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });

    await fireEvent.press(
      await screen.findByRole('radio', { name: '3 estrelas' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliar.enviar }),
    );

    expect(
      await screen.findByText(textos.erros.trampo_nao_encerrado),
    ).toBeOnTheScreen();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: textos.avaliar.enviar }),
      ).toBeEnabled(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliar.enviar }),
    );
    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(2),
    );
    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('o favorito que a API recusa não segura a volta: o aviso diz que a avaliação foi enviada', async () => {
    const fetch = fakeDoAutor().responder('PUT /favoritos/f1', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });

    await preencher({ favoritar: true });
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliar.enviar }),
    );

    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(
      await screen.findByText(textos.avaliar.enviadaSemFavorito),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.favoritos.erro)).not.toBeOnTheScreen();
    expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1);
    expect(chamadas(fetch, 'PUT', '/favoritos/f1')).toHaveLength(1);
  });

  it('autor sem candidatura aceita: "encerrado sem profissional contratado", sem formulário', async () => {
    const fetch = fakeDoAutor().responder('GET /trampos/t1/candidaturas', {
      corpo: [candidatura('k0', 'f0', 'recusada')],
    });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });

    expect(
      await screen.findByText(textos.avaliar.semProfissional),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.nao_encontrado)).toBeNull();
    expect(screen.queryByLabelText(textos.avaliar.notaRotulo)).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.avaliar.enviar }),
    ).toBeNull();
    expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(0);
  });

  it('autor de trampo ainda aberto, por link direto: "não encontrado", e não "encerrado sem profissional" (R11)', async () => {
    const fetch = fakeDoAutor()
      .responder('GET /trampos/t1', {
        corpo: meuTrampo('t1', 'aberto', { candidaturasRecebidas: 1 }),
      })
      .responder('GET /trampos/t1/candidaturas', {
        corpo: [candidatura('k0', 'f0', 'pendente')],
      });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.avaliar.semProfissional)).toBeNull();
    expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(0);
  });

  it('enquanto o trampo carrega, o título vem de ?papel= e depois do papel de fato', async () => {
    const fetch = fakeDoAutor().responder('GET /trampos/t1', {
      corpo: meuTrampo('t1', 'encerrado', { candidaturasRecebidas: 2 }),
      demoraMs: 200,
    });
    await abrir('/avaliar/t1?papel=contratante', {
      modo: 'contratante',
      fetch,
    });

    expect(
      (await screen.findAllByText(textos.avaliar.tituloContratante)).length,
    ).toBeGreaterThan(0);
    // O autor avalia o freela, seja qual for a dica da URL.
    expect(
      (await screen.findAllByText(textos.avaliar.titulo)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(textos.avaliar.tituloContratante)).toBeNull();
  });

  it('trampo inexistente: "não encontrado"', async () => {
    await abrir('/avaliar/t9', { fetch: fake() });

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
  });
});

// --- CA97: a nota nas listas e nos perfis ---

describe('CA97: nota (média e total)', () => {
  it('perfil público: a nota do papel, e "Avaliações recebidas" abre a lista com os nomes, a data, o comentário e a página seguinte', async () => {
    const pagina1: AvaliacaoRecebida[] = Array.from({ length: 20 }, (_, i) => ({
      nota: 5,
      destaques: [],
      comentario: null,
      avaliadorId: 'a1',
      criadaEm: `2026-10-${String(28 - (i % 20)).padStart(2, '0')}T12:00:00.000Z`,
    }));
    pagina1[0] = {
      nota: 4,
      destaques: ['pontual', 'codigo_desconhecido'],
      comentario: 'Chegou na hora.',
      avaliadorId: 'a1',
      criadaEm: '2026-10-29T12:00:00.000Z',
    };
    const fetch = fake()
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'João Pereira') })
      .responder('GET /perfis/a1', { corpo: perfil('a1', 'Carla Souza') })
      .responder('GET /avaliacoes/resumos', {
        corpo: [resumo('f1', { media: 4.5, total: 21 })],
      })
      .responder('GET /avaliacoes', [
        { corpo: { itens: pagina1, proximoCursor: 'cursor-2' } },
        {
          corpo: {
            itens: [
              {
                nota: 2,
                destaques: [],
                comentario: 'Atrasou.',
                avaliadorId: 'a1',
                criadaEm: '2026-09-01T12:00:00.000Z',
              },
            ],
            proximoCursor: null,
          },
        },
      ]);
    await abrir('/perfis/f1', { fetch });

    expect(
      await screen.findByLabelText(rotuloDaNota(4.5, 21)),
    ).toBeOnTheScreen();
    expect(chamadas(fetch, 'GET', '/avaliacoes/resumos')).toHaveLength(1);
    expect(chamadas(fetch, 'GET', '/avaliacoes/resumos')[0]?.query).toEqual({
      contas: 'f1',
    });

    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliacoes.recebidasTitulo }),
    );
    await waitFor(() => expect(screen).toHavePathname('/avaliacoes/f1'));
    expect(
      await screen.findByText('Chegou na hora.', { exact: false }),
    ).toBeOnTheScreen();
    expect((await screen.findAllByText('Carla Souza')).length).toBeGreaterThan(
      0,
    );
    // Código de destaque que o app não conhece não vira texto cru.
    expect(
      screen.queryByText('codigo_desconhecido', { exact: false }),
    ).toBeNull();
    expect(screen.getByLabelText(rotuloDaNota(4.5, 21))).toBeOnTheScreen();

    const primeira = chamadas(fetch, 'GET', '/avaliacoes')[0];
    expect(primeira?.query).toEqual({
      contaId: 'f1',
      papel: 'freela',
      limite: '20',
    });
    // O resumo e os nomes: um pedido de resumos, um perfil por avaliador (cache).
    expect(chamadas(fetch, 'GET', '/perfis/a1')).toHaveLength(1);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.carregarMais }),
    );
    expect(
      await screen.findByText('Atrasou.', { exact: false }),
    ).toBeOnTheScreen();
    expect(chamadas(fetch, 'GET', '/avaliacoes')[1]?.query).toEqual({
      contaId: 'f1',
      papel: 'freela',
      antesDe: 'cursor-2',
      limite: '20',
    });
  });

  it('perfil público de contratante (?papel=contratante): usa a nota e a lista do papel de contratante', async () => {
    const fetch = fake()
      .responder('GET /perfis/c9', { corpo: perfil('c9', 'Carla Souza') })
      .responder('GET /avaliacoes/resumos', {
        corpo: [resumo('c9', { media: 1, total: 1 }, { media: 4, total: 3 })],
      })
      .responder('GET /avaliacoes', {
        corpo: { itens: [], proximoCursor: null },
      });
    await abrir('/perfis/c9?papel=contratante', { fetch });

    expect(await screen.findByLabelText(rotuloDaNota(4, 3))).toBeOnTheScreen();
    // Sem a conta ser freela: nada de "Favoritar" no perfil de contratante.
    expect(screen.queryByRole('switch')).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliacoes.recebidasTitulo }),
    );
    await waitFor(() => expect(screen).toHavePathname('/avaliacoes/c9'));
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/avaliacoes')[0]?.query).toEqual({
        contaId: 'c9',
        papel: 'contratante',
        limite: '20',
      }),
    );
  });

  it('conta sem avaliações: o perfil não mostra nota nem o botão da lista', async () => {
    const fetch = fake()
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'João Pereira') })
      .responder('GET /avaliacoes/resumos', { corpo: [resumo('f1', null)] });
    await abrir('/perfis/f1', { fetch });

    await screen.findByText('João Pereira');
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/avaliacoes/resumos')).toHaveLength(1),
    );
    expect(screen.queryByLabelText(/^Nota /)).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.avaliacoes.recebidasTitulo }),
    ).toBeNull();
  });

  it('a falha do resumo só deixa a nota de fora', async () => {
    const fetch = fake()
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'João Pereira') })
      .responder('GET /avaliacoes/resumos', { status: 500 });
    await abrir('/perfis/f1', { fetch });

    expect(await screen.findByText('João Pereira')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Nota /)).toBeNull();
  });

  it('lista de avaliações sem nenhuma: o estado vazio', async () => {
    const fetch = fake().responder('GET /avaliacoes', {
      corpo: { itens: [], proximoCursor: null },
    });
    await abrir('/avaliacoes/f1', { fetch });

    expect(
      await screen.findByText(textos.avaliacoes.semAvaliacoes),
    ).toBeOnTheScreen();
  });

  it('Perfil do freela: a nota da própria conta, pedida com o id das candidaturas', async () => {
    const fetch = fake()
      .responder('GET /candidaturas/minhas', {
        corpo: [{ ...candidatura('k1', EU, 'pendente'), trampoId: 't1' }],
      })
      .responder('GET /avaliacoes/resumos', {
        corpo: [resumo(EU, { media: 4.8, total: 5 })],
      });
    await abrir('/perfil', { fetch });

    expect(
      await screen.findByLabelText(rotuloDaNota(4.8, 5)),
    ).toBeOnTheScreen();
    const pedidos = chamadas(fetch, 'GET', '/avaliacoes/resumos');
    expect(pedidos.map((r) => r.query.contas)).toEqual([EU]);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliacoes.recebidasTitulo }),
    );
    await waitFor(() => expect(screen).toHavePathname(`/avaliacoes/${EU}`));
  });

  it('Perfil da empresa: a nota como contratante e a linha "Avaliações recebidas"', async () => {
    const fetch = fake()
      .responder('GET /trampos/meus', { corpo: [meuTrampo('t1', 'aberto')] })
      .responder('GET /avaliacoes/resumos', {
        corpo: [resumo(EU, { media: 1, total: 1 }, { media: 4.2, total: 6 })],
      });
    await abrir('/perfil', { modo: 'contratante', fetch });

    expect(
      await screen.findByLabelText(rotuloDaNota(4.2, 6)),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: new RegExp(textos.avaliacoes.recebidasTitulo),
      }),
    );
    await waitFor(() => expect(screen).toHavePathname(`/avaliacoes/${EU}`));
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/avaliacoes')[0]?.query.papel).toBe(
        'contratante',
      ),
    );
  });

  it('Perfil da empresa sem trampos: sem id, sem pedido de resumo e sem a linha', async () => {
    const fetch = fake();
    await abrir('/perfil', { modo: 'contratante', fetch });

    await screen.findByText(PERFIL_DE_EU.nome);
    expect(chamadas(fetch, 'GET', '/avaliacoes/resumos')).toHaveLength(0);
    expect(
      screen.queryByRole('button', {
        name: new RegExp(textos.avaliacoes.recebidasTitulo),
      }),
    ).toBeNull();
  });

  it('detalhe do trampo: a nota do autor, como contratante', async () => {
    const fetch = fake()
      .responder('GET /trampos/t1', { corpo: trampo('t1', 'aberto') })
      .responder('GET /perfis/conta-autor', {
        corpo: perfil(AUTOR, 'Carla Souza'),
      })
      .responder('GET /avaliacoes/resumos', {
        corpo: [
          resumo(AUTOR, { media: 1, total: 1 }, { media: 4.6, total: 12 }),
        ],
      });
    await abrir('/trampos/t1', { fetch });

    // O cartão do autor é um botão só, com a nota no rótulo composto.
    expect(
      await screen.findByLabelText(rotuloDaNota(4.6, 12), { exact: false }),
    ).toBeOnTheScreen();
    expect(
      chamadas(fetch, 'GET', '/avaliacoes/resumos').map((r) => r.query.contas),
    ).toEqual([AUTOR]);
  });

  it('candidatos: um pedido de resumos para todos os cartões', async () => {
    const fetch = fake()
      .responder('GET /trampos/t1', { corpo: meuTrampo('t1', 'aberto') })
      .responder('GET /trampos/t1/candidaturas', {
        corpo: [
          candidatura('k1', 'f1', 'pendente'),
          candidatura('k2', 'f2', 'pendente'),
          candidatura('k3', 'f3', 'pendente'),
        ],
      })
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'Ana Lima') })
      .responder('GET /perfis/f2', { corpo: perfil('f2', 'Bia Rocha') })
      .responder('GET /perfis/f3', { corpo: perfil('f3', 'Caio Dias') })
      .responder('GET /avaliacoes/resumos', {
        corpo: [
          resumo('f1', { media: 4.5, total: 8 }),
          resumo('f2', null),
          resumo('f3', { media: 3, total: 2 }),
        ],
      });
    await abrir('/candidaturas/t1', { fetch });

    expect(
      await screen.findByLabelText(rotuloDaNota(4.5, 8)),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(rotuloDaNota(3, 2))).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/^Nota /)).toHaveLength(2);
    const pedidos = chamadas(fetch, 'GET', '/avaliacoes/resumos');
    expect(pedidos.map((r) => r.query.contas)).toEqual(['f1,f2,f3']);
  });

  it('Busca de trampos: a nota do contratante de cada item, num pedido só', async () => {
    const itens = [
      {
        tipo: 'trampo',
        id: 't1',
        autorId: 'a1',
        titulo: 'Pintar a sala',
        categoria: 'reformas',
        cidade: 'Lavras',
        criadoEm: '2026-10-20T12:00:00.000Z',
        valorCentavos: 15000,
      },
      {
        tipo: 'trampo',
        id: 't2',
        autorId: 'a2',
        titulo: 'Montar estante',
        categoria: 'reformas',
        cidade: 'Lavras',
        criadoEm: '2026-10-19T12:00:00.000Z',
        valorCentavos: 9000,
      },
    ];
    const fetch = fake()
      .responder('GET /busca', { corpo: { itens, proximoCursor: null } })
      .responder('GET /perfis/a1', { corpo: perfil('a1', 'Carla Souza') })
      .responder('GET /perfis/a2', { corpo: perfil('a2', 'Davi Alves') })
      .responder('GET /avaliacoes/resumos', {
        corpo: [
          resumo('a1', null, { media: 4.4, total: 9 }),
          resumo('a2', { media: 1, total: 1 }),
        ],
      });
    await abrir('/buscar-trampos?tipo=trampos', { fetch });

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(
      await screen.findByLabelText(rotuloDaNota(4.4, 9), { exact: false }),
    ).toBeOnTheScreen();
    // a2 só tem nota como freela: o trampo mostra a de contratante, que não existe.
    expect(screen.getAllByLabelText(/Nota \d/)).toHaveLength(1);
    expect(
      chamadas(fetch, 'GET', '/avaliacoes/resumos').map((r) => r.query.contas),
    ).toEqual(['a1,a2']);
  });

  it('Busca de serviços: a nota é a de freela do autor', async () => {
    const fetch = fake()
      .responder('GET /busca', {
        corpo: {
          itens: [
            {
              tipo: 'servico',
              id: 's1',
              autorId: 'f1',
              titulo: 'Pintura residencial',
              categoria: 'reformas',
              cidade: 'Lavras',
              criadoEm: '2026-10-20T12:00:00.000Z',
              precoBaseCentavos: 8000,
            },
          ],
          proximoCursor: null,
        },
      })
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'João Pereira') })
      .responder('GET /avaliacoes/resumos', {
        corpo: [resumo('f1', { media: 4.9, total: 30 })],
      });
    await abrir('/buscar?tipo=servicos', { modo: 'contratante', fetch });

    expect(await screen.findByText('Pintura residencial')).toBeOnTheScreen();
    expect(
      await screen.findByLabelText(rotuloDaNota(4.9, 30), { exact: false }),
    ).toBeOnTheScreen();
    expect(
      chamadas(fetch, 'GET', '/avaliacoes/resumos').map((r) => r.query.contas),
    ).toEqual(['f1']);
  });
});

// --- CA98: equipe favorita ---

describe('CA98: equipe favorita', () => {
  const FAVORITOS = [
    { contaId: 'f1', criadoEm: '2026-11-02T12:00:00.000Z' },
    { contaId: 'f2', criadoEm: '2026-11-01T12:00:00.000Z' },
    { contaId: 'f3', criadoEm: '2026-10-30T12:00:00.000Z' },
  ];

  function fakeDaEquipe(): FetchFalso {
    return (
      fake()
        .responder('GET /favoritos', { corpo: FAVORITOS })
        .responder('GET /perfis/f1', { corpo: perfil('f1', 'Ana Lima') })
        .responder('GET /perfis/f2', { corpo: perfil('f2', 'Bia Rocha') })
        // f3 já não tem perfil: não há com quem conversar.
        .responder('GET /perfis/f3', {
          status: 404,
          corpo: { erro: 'nao_encontrado' },
        })
        .responder('GET /avaliacoes/resumos', {
          corpo: [
            resumo('f1', { media: 4.5, total: 8 }),
            resumo('f2', null),
            resumo('f3', null),
          ],
        })
    );
  }

  it('o Início do contratante mostra a equipe (sem quem não tem perfil), com a nota e um pedido de resumos só', async () => {
    const fetch = fakeDaEquipe();
    await abrir('/', { modo: 'contratante', fetch });

    expect(
      await screen.findByText(textos.inicioContratante.equipe),
    ).toBeOnTheScreen();
    expect(await screen.findByText('Ana Lima')).toBeOnTheScreen();
    expect(screen.getByText('Bia Rocha')).toBeOnTheScreen();
    // O cartão da equipe mostra a média (sem o total).
    expect(
      await screen.findByLabelText(textos.gerais.nota('4,5')),
    ).toBeOnTheScreen();
    expect(
      screen.getAllByRole('button', { name: /^Recontratar / }),
    ).toHaveLength(2);
    expect(
      chamadas(fetch, 'GET', '/avaliacoes/resumos').map((r) => r.query.contas),
    ).toEqual(['f1,f2,f3']);
  });

  it('a equipe passa de 20: só as 20 mais recentes pedem perfil e nota', async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => ({
      contaId: `g${i + 1}`,
      // Da mais recente para a mais antiga, como a API devolve.
      criadoEm: new Date(Date.UTC(2026, 10, 25 - i, 12)).toISOString(),
    }));
    let fetch = fake().responder('GET /favoritos', { corpo: muitos });
    for (const { contaId } of muitos) {
      fetch = fetch.responder(`GET /perfis/${contaId}`, {
        corpo: perfil(contaId, `Pessoa ${contaId}`),
      });
    }
    await abrir('/', { modo: 'contratante', fetch });

    expect(await screen.findByText('Pessoa g1')).toBeOnTheScreen();
    expect(screen.getByText('Pessoa g20')).toBeOnTheScreen();
    expect(screen.queryByText('Pessoa g21')).toBeNull();
    const pedidosDeResumos = chamadas(fetch, 'GET', '/avaliacoes/resumos');
    expect(pedidosDeResumos).toHaveLength(1);
    expect(pedidosDeResumos[0]?.query.contas?.split(',')).toHaveLength(20);
    expect(pedidosDeResumos[0]?.query.contas).not.toContain('g21');
    const pedidosDePerfil = fetch.requisicoes.filter(
      (r) => r.metodo === 'GET' && r.caminho.startsWith('/perfis/g'),
    );
    expect(pedidosDePerfil).toHaveLength(20);
  });

  it('sem favoritos a seção some, sem estado vazio', async () => {
    const fetch = fake().responder('GET /trampos/meus', {
      corpo: [meuTrampo('t1', 'aberto')],
    });
    await abrir('/', { modo: 'contratante', fetch });

    await screen.findByText('Trampo t1');
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/favoritos').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(textos.inicioContratante.equipe)).toBeNull();
    expect(chamadas(fetch, 'GET', '/avaliacoes/resumos')).toHaveLength(0);
  });

  it('o Início do freela não consulta a equipe', async () => {
    const fetch = fakeDaEquipe();
    await abrir('/', { fetch });

    await screen.findByText(PERFIL_DE_EU.nome, { exact: false });
    expect(chamadas(fetch, 'GET', '/favoritos')).toHaveLength(0);
  });

  it('"Recontratar" abre a conversa com a pessoa', async () => {
    const fetch = fakeDaEquipe().responder('POST /conversas', {
      status: 201,
      corpo: { conversaId: 'cv1' },
    });
    await abrir('/', { modo: 'contratante', fetch });

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.inicioContratante.recontratarCom('Ana Lima'),
      }),
    );

    await waitFor(() => expect(screen).toHavePathname('/conversas/cv1'));
    expect(chamadas(fetch, 'POST', '/conversas')).toHaveLength(1);
    expect(chamadas(fetch, 'POST', '/conversas')[0]?.corpo).toEqual({
      outroUsuarioId: 'f1',
    });
  });

  it('"Recontratar" recusado pela API (sem vínculo): o aviso diz o motivo e não navega', async () => {
    const fetch = fakeDaEquipe().responder('POST /conversas', {
      status: 403,
      corpo: { erro: 'sem_vinculo' },
    });
    await abrir('/', { modo: 'contratante', fetch });

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.inicioContratante.recontratarCom('Ana Lima'),
      }),
    );

    expect(await screen.findByText(textos.erros.sem_vinculo)).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });

  it('"Ver perfil" abre o perfil público da pessoa', async () => {
    await abrir('/', { modo: 'contratante', fetch: fakeDaEquipe() });

    await fireEvent.press(
      await screen.findByRole('button', {
        name: `${textos.inicioContratante.verPerfil} Ana Lima`,
      }),
    );

    await waitFor(() => expect(screen).toHavePathname('/perfis/f1'));
  });
});

describe('CA98: favoritar no perfil público', () => {
  const interruptor = () =>
    screen.getByRole('switch', {
      name: textos.favoritos.favoritar('João Pereira'),
    });

  function fakeDoPerfil(favoritos: readonly unknown[] = []): FetchFalso {
    return fake()
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'João Pereira') })
      .responder('GET /favoritos', { corpo: favoritos });
  }

  it('favoritar muda na hora (antes da resposta) e fica', async () => {
    const fetch = fakeDoPerfil().responder('PUT /favoritos/f1', {
      ...SEM_CONTEUDO,
      demoraMs: 300,
    });
    await abrir('/perfis/f1', { modo: 'contratante', fetch });
    await screen.findByText('João Pereira');
    await waitFor(() => expect(interruptor()).not.toBeChecked());

    await fireEvent.press(interruptor());

    // O PUT ainda está no ar: a tela já mostra a pessoa na equipe.
    await waitFor(() => expect(interruptor()).toBeChecked());
    expect(chamadas(fetch, 'PUT', '/favoritos/f1')).toHaveLength(1);
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/favoritos').length).toBeGreaterThan(1),
    );
    expect(interruptor()).toBeChecked();
  });

  it('o erro da API desfaz a mudança e avisa', async () => {
    const fetch = fakeDoPerfil().responder('PUT /favoritos/f1', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
      demoraMs: 300,
    });
    await abrir('/perfis/f1', { modo: 'contratante', fetch });
    await screen.findByText('João Pereira');
    await waitFor(() => expect(interruptor()).not.toBeChecked());

    await fireEvent.press(interruptor());
    await waitFor(() => expect(interruptor()).toBeChecked());

    expect(
      await screen.findByText(textos.favoritos.semVinculo),
    ).toBeOnTheScreen();
    expect(interruptor()).not.toBeChecked();
  });

  it('o teto de 200 favoritos tem o texto próprio', async () => {
    const fetch = fakeDoPerfil().responder('PUT /favoritos/f1', {
      status: 409,
      corpo: { erro: 'limite_de_favoritos' },
    });
    await abrir('/perfis/f1', { modo: 'contratante', fetch });
    await screen.findByText('João Pereira');
    await waitFor(() => expect(interruptor()).not.toBeChecked());

    await fireEvent.press(interruptor());

    expect(
      await screen.findByText(textos.erros.limite_de_favoritos),
    ).toBeOnTheScreen();
    await waitFor(() => expect(interruptor()).not.toBeChecked());
  });

  it('desfavoritar manda o DELETE e desliga na hora', async () => {
    const fetch = fakeDoPerfil([
      { contaId: 'f1', criadoEm: '2026-11-02T12:00:00.000Z' },
    ]).responder('DELETE /favoritos/f1', { ...SEM_CONTEUDO, demoraMs: 300 });
    await abrir('/perfis/f1', { modo: 'contratante', fetch });
    await screen.findByText('João Pereira');
    await waitFor(() => expect(interruptor()).toBeChecked());

    await fireEvent.press(interruptor());

    await waitFor(() => expect(interruptor()).not.toBeChecked());
    expect(chamadas(fetch, 'DELETE', '/favoritos/f1')).toHaveLength(1);
  });

  it('no modo freela, o perfil de freela não oferece "Favoritar"', async () => {
    const fetch = fakeDoPerfil();
    await abrir('/perfis/f1', { modo: 'freela', fetch });

    expect(await screen.findByText('João Pereira')).toBeOnTheScreen();
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/favoritos').length).toBeGreaterThan(0),
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('o perfil da própria conta (?propria=1) não oferece "Favoritar", mesmo no modo contratante', async () => {
    const fetch = fakeDoPerfil();
    await abrir('/perfis/f1?propria=1', { modo: 'contratante', fetch });

    expect(await screen.findByText('João Pereira')).toBeOnTheScreen();
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/favoritos').length).toBeGreaterThan(0),
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('o autor do serviço que abre o próprio perfil não vê "Favoritar", mesmo no modo contratante (Q1)', async () => {
    const servico = {
      id: 's1',
      autorId: EU,
      titulo: 'Pinto paredes',
      descricao: 'Equipe própria.',
      categoria: 'reformas',
      cidade: 'Lavras',
      precoBaseCentavos: 8000,
      status: 'ativo',
      criadoEm: '2026-10-01T12:00:00.000Z',
      versao: 1,
    };
    const fetch = fake()
      .responder('GET /servicos/s1', { corpo: servico })
      .responder('GET /servicos/meus', { corpo: [servico] })
      .responder(`GET /perfis/${EU}`, { corpo: perfil(EU, 'Maria Souza') });
    await abrir('/servicos/s1', { modo: 'contratante', fetch });

    await fireEvent.press(await screen.findByText('Maria Souza'));
    await waitFor(() => expect(screen).toHavePathname(`/perfis/${EU}`));
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/favoritos').length).toBeGreaterThan(0),
    );
    // Dá tempo de a equipe favorita chegar: é ela que liberaria o interruptor.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('sem a lista dos meus serviços (falhou), o autor que abre o próprio perfil não vê "Favoritar" (R12)', async () => {
    const servico = {
      id: 's1',
      autorId: EU,
      titulo: 'Pinto paredes',
      descricao: 'Equipe própria.',
      categoria: 'reformas',
      cidade: 'Lavras',
      precoBaseCentavos: 8000,
      status: 'ativo',
      criadoEm: '2026-10-01T12:00:00.000Z',
      versao: 1,
    };
    const fetch = fake()
      .responder('GET /servicos/s1', { corpo: servico })
      .responder('GET /servicos/meus', { status: 500 })
      .responder(`GET /perfis/${EU}`, { corpo: perfil(EU, 'Maria Souza') });
    await abrir('/servicos/s1', { modo: 'contratante', fetch });

    await fireEvent.press(await screen.findByText('Maria Souza'));
    await waitFor(() => expect(screen).toHavePathname(`/perfis/${EU}`));
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/favoritos').length).toBeGreaterThan(0),
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('o serviço de outra pessoa leva ao perfil com "Favoritar" no modo contratante', async () => {
    const fetch = fake()
      .responder('GET /servicos/s2', {
        corpo: {
          id: 's2',
          autorId: 'f1',
          titulo: 'Pintura',
          descricao: 'Pinto.',
          categoria: 'reformas',
          cidade: 'Lavras',
          precoBaseCentavos: 8000,
          status: 'ativo',
          criadoEm: '2026-10-01T12:00:00.000Z',
        },
      })
      .responder('GET /servicos/meus', { corpo: [] })
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'João Pereira') });
    await abrir('/servicos/s2', { modo: 'contratante', fetch });

    // Sem a lista dos meus serviços, o perfil abriria sem "Favoritar" (R12).
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/servicos/meus').length).toBeGreaterThan(
        0,
      ),
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    await fireEvent.press(await screen.findByText('João Pereira'));
    await waitFor(() => expect(screen).toHavePathname('/perfis/f1'));
    expect(await screen.findByRole('switch')).toBeOnTheScreen();
  });

  it('sem a lista de favoritos carregada, o interruptor não aparece', async () => {
    const fetch = fakeDoPerfil().responder('GET /favoritos', { status: 500 });
    await abrir('/perfis/f1', { modo: 'contratante', fetch });

    expect(await screen.findByText('João Pereira')).toBeOnTheScreen();
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/favoritos').length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
