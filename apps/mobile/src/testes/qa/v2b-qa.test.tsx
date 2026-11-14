// QA da V2b no app (etapas 9 a 11 do plano visual-v2, CA96 a CA98): bordas e
// regressões além do que o dev já cobriu em `testes/rotas/avaliacoes.test.tsx`.
// Rotas reais com o fake de `fetch`; nenhum serviço externo.
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import RotaDasAvaliacoes from '../../app/(app)/avaliacoes/[contaId]';
import RotaDeAvaliar from '../../app/(app)/avaliar/[trampoId]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import type { Modo } from '../../estado/modo';
import { textos } from '../../textos/pt-BR';
import type { FetchFalso, RespostaFalsa } from '../fetch-falso';
import {
  type MapaDeRotas,
  renderizarRotas,
  TOKEN_DE_TESTE,
} from '../rotas/apoio';
import { fakeComCategorias, ROTAS_REAIS, vigiarConsole } from './apoio-qa';

vigiarConsole();

const ROTAS: MapaDeRotas = {
  ...ROTAS_REAIS,
  '(app)/avaliar/[trampoId]': RotaDeAvaliar,
  '(app)/avaliacoes/[contaId]': RotaDasAvaliacoes,
};

// --- Dados ---

const EU = 'conta-eu';
const AUTOR = 'conta-autor';
const COMENTARIO_SECRETO =
  'Ele mora na Rua das Flores 123 e o CPF é 000.000.000-00';

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

/** O autor (`EU`) de `t1` encerrado, com `f1` na candidatura aceita. */
function fakeDoAutor(): FetchFalso {
  return fake()
    .responder('GET /trampos/meus', {
      corpo: [
        meuTrampo('t4', 'aberto'),
        meuTrampo('t1', 'encerrado', { candidaturasRecebidas: 2 }),
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
    .responder('POST /avaliacoes', { status: 201, corpo: { id: 'a1' } })
    .responder('PUT /favoritos/f1', SEM_CONTEUDO);
}

/** O freela (`EU`) com aceite em `t1` encerrado, de um trampo de `AUTOR`. */
function fakeDoFreela(): FetchFalso {
  return fake()
    .responder('GET /candidaturas/minhas', {
      corpo: [{ ...candidatura('k1', EU, 'aceita'), trampoId: 't1' }],
    })
    .responder('GET /trampos/t1', { corpo: trampo('t1', 'encerrado') })
    .responder('GET /perfis/conta-autor', {
      corpo: perfil(AUTOR, 'Carla Souza'),
    })
    .responder('POST /avaliacoes', { status: 201, corpo: { id: 'a1' } });
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

const botaoEnviar = () =>
  screen.getByRole('button', { name: textos.avaliar.enviar });
const campoDoComentario = () =>
  screen.getByLabelText(textos.avaliar.comentario);

async function escolherNota(n: number) {
  await fireEvent.press(
    await screen.findByRole('radio', { name: textos.avaliar.rotuloEstrela(n) }),
  );
}

afterEach(async () => {
  await act(async () => onlineManager.setOnline(true));
});

// --- CA96: tela Avaliar, estrelas, destaques e comentário ---

describe('CA96: estrelas, destaques e comentário', () => {
  it('as estrelas são um radiogroup de 5 radios; só a escolhida fica marcada e tocar de novo não zera a nota', async () => {
    await abrir('/avaliar/t1', { modo: 'contratante', fetch: fakeDoAutor() });

    const grupo = await screen.findByLabelText(textos.avaliar.notaRotulo);
    expect(grupo.props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    await escolherNota(3);
    for (const n of [1, 2, 4, 5]) {
      expect(
        screen.getByRole('radio', { name: textos.avaliar.rotuloEstrela(n) }),
      ).not.toBeChecked();
    }
    expect(
      screen.getByRole('radio', { name: textos.avaliar.rotuloEstrela(3) }),
    ).toBeChecked();
    expect(
      screen.getByText(textos.avaliar.notas[2] as string),
    ).toBeOnTheScreen();

    await escolherNota(3);
    expect(botaoEnviar()).toBeEnabled();
    expect(
      screen.getByRole('radio', { name: textos.avaliar.rotuloEstrela(3) }),
    ).toBeChecked();

    // Mudar para 1 também vale.
    await escolherNota(1);
    expect(
      screen.getByRole('radio', { name: textos.avaliar.rotuloEstrela(1) }),
    ).toBeChecked();
  });

  it('o comentário passa de 500 pontos de código: corta em 500 e o POST nunca leva mais (emoji conta como 1)', async () => {
    const fetch = fakeDoAutor();
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(5);

    // 499 letras + 3 emojis (2 unidades cada): 502 pontos, 505 unidades.
    await fireEvent.changeText(campoDoComentario(), `${'a'.repeat(499)}😀😀😀`);
    await fireEvent.press(botaoEnviar());

    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1),
    );
    const corpo = chamadas(fetch, 'POST', '/avaliacoes')[0]?.corpo as {
      comentario: string;
    };
    expect([...corpo.comentario]).toHaveLength(500);
    // Sem metade de emoji (substituto solto) no fim do texto.
    expect(corpo.comentario.endsWith('😀')).toBe(true);
    expect(corpo.comentario).toBe(`${'a'.repeat(499)}😀`);
  });

  it('comentário só de espaços não vai no corpo; com espaços nas pontas, vai aparado', async () => {
    const fetch = fakeDoAutor();
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(4);
    await fireEvent.changeText(campoDoComentario(), '   \n  ');
    await fireEvent.press(botaoEnviar());
    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1),
    );
    expect(chamadas(fetch, 'POST', '/avaliacoes')[0]?.corpo).toEqual({
      trampoId: 't1',
      nota: 4,
    });
  });

  it('o comentário com espaços nas pontas vai aparado', async () => {
    const fetch = fakeDoAutor();
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(4);
    await fireEvent.changeText(campoDoComentario(), '  ótimo trabalho \n');
    await fireEvent.press(botaoEnviar());
    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1),
    );
    expect(chamadas(fetch, 'POST', '/avaliacoes')[0]?.corpo).toEqual({
      trampoId: 't1',
      nota: 4,
      comentario: 'ótimo trabalho',
    });
  });

  it('destaque marcado e desmarcado não vai no corpo; os cinco juntos vão na ordem dos códigos da API', async () => {
    const fetch = fakeDoAutor();
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(5);
    await fireEvent.press(await screen.findByText('Pontual'));
    await fireEvent.press(screen.getByText('Pontual'));
    await fireEvent.press(botaoEnviar());
    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1),
    );
    expect(chamadas(fetch, 'POST', '/avaliacoes')[0]?.corpo).toEqual({
      trampoId: 't1',
      nota: 5,
    });
  });

  it('os cinco destaques do freela vão no corpo (o teto da API é 5)', async () => {
    const fetch = fakeDoAutor();
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(5);
    for (const rotulo of Object.values(textos.avaliar.destaquesFreela)) {
      await fireEvent.press(await screen.findByText(rotulo));
    }
    await fireEvent.press(botaoEnviar());
    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1),
    );
    const corpo = chamadas(fetch, 'POST', '/avaliacoes')[0]?.corpo as {
      destaques: string[];
    };
    expect(corpo.destaques.sort()).toEqual(
      Object.keys(textos.avaliar.destaquesFreela).sort(),
    );
  });

  it('o freela que avalia o contratante manda só destaques do contratante', async () => {
    const fetch = fakeDoFreela();
    await abrir('/avaliar/t1', { fetch });
    await escolherNota(4);
    await fireEvent.press(
      await screen.findByText(
        textos.avaliar.destaquesContratante.pagamento_em_dia,
      ),
    );
    await fireEvent.press(botaoEnviar());
    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1),
    );
    expect(chamadas(fetch, 'POST', '/avaliacoes')[0]?.corpo).toEqual({
      trampoId: 't1',
      nota: 4,
      destaques: ['pagamento_em_dia'],
    });
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

// --- CA96: erros do envio ---

describe('CA96: erros do envio', () => {
  it('falha de rede: avisa, mantém o digitado, libera o botão e o novo toque manda de novo (e só então volta)', async () => {
    const fetch = fakeDoAutor().responder('POST /avaliacoes', [
      { falhaDeRede: true },
      { status: 201, corpo: { id: 'a1' } },
    ]);
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(5);
    await fireEvent.changeText(campoDoComentario(), 'Muito bom.');
    await fireEvent.press(botaoEnviar());

    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    expect(screen).toHavePathname('/avaliar/t1');
    expect(campoDoComentario().props.value).toBe('Muito bom.');
    expect(botaoEnviar()).toBeEnabled();

    await fireEvent.press(botaoEnviar());
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(2);
  });

  it('404 (não é parte do trampo): texto próprio, nunca o código nem o texto da API', async () => {
    const fetch = fakeDoAutor().responder('POST /avaliacoes', {
      status: 404,
      corpo: { erro: 'nao_encontrado', mensagem: COMENTARIO_SECRETO },
    });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(5);
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    expect(screen.queryByText(COMENTARIO_SECRETO, { exact: false })).toBeNull();
    expect(screen.queryByText('nao_encontrado')).toBeNull();
  });

  it('429 do limite de publicação: diz para esperar e deixa tentar de novo', async () => {
    const fetch = fakeDoAutor().responder('POST /avaliacoes', {
      status: 429,
      corpo: { erro: 'muitas_requisicoes' },
    });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(5);
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    ).toBeOnTheScreen();
    expect(botaoEnviar()).toBeEnabled();
  });

  it('400 com o comentário digitado: o erro não repete o comentário nem o código cru, e o comentário não vai para URL, console nem armazenamento', async () => {
    const fetch = fakeDoAutor().responder('POST /avaliacoes', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'comentario', codigo: 'invalido' }],
      },
    });
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN_DE_TESTE);
    await renderizarRotas(ROTAS, {
      initialUrl: '/avaliar/t1',
      fetch,
      modo: 'contratante',
      armazenamento,
    });
    await escolherNota(2);
    await fireEvent.changeText(campoDoComentario(), COMENTARIO_SECRETO);
    await fireEvent.press(botaoEnviar());

    await waitFor(() =>
      expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1),
    );
    await screen.findByText(textos.erros.erro_servidor);
    // O comentário só existe dentro do campo.
    expect(screen.queryByText(COMENTARIO_SECRETO)).toBeNull();
    expect(screen.queryByText('dados_invalidos')).toBeNull();
    expect(fetch.requisicoes.every((r) => !r.url.includes('Flores'))).toBe(
      true,
    );
    expect(JSON.stringify(await armazenamento.ler())).not.toContain('Flores');
  });

  it('409 avaliacao_ja_feita com "Favoritar" ligado: não favorita e o "Avaliar" some da lista ao voltar', async () => {
    let avaliada = false;
    const fetch = fakeDoAutor()
      .responder('GET /avaliacoes/feitas', () => ({
        corpo: avaliada ? [feita('t1', 5)] : [],
      }))
      .responder('POST /avaliacoes', () => {
        avaliada = true;
        return { status: 409, corpo: { erro: 'avaliacao_ja_feita' } };
      });
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
    await escolherNota(5);
    await fireEvent.press(
      screen.getByRole('switch', { name: textos.avaliar.favoritar }),
    );
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.avaliar.jaAvaliado),
    ).toBeOnTheScreen();
    expect(chamadas(fetch, 'PUT', '/favoritos/f1')).toHaveLength(0);

    await fireEvent.press(
      screen.getAllByRole('button', { name: textos.gerais.voltar })[0] as never,
    );
    await waitFor(() => expect(screen).toHavePathname('/demandas'));
    expect(
      await screen.findByLabelText(textos.avaliar.avaliadoComFalado(5)),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t1'),
      }),
    ).toBeNull();
  });

  it('sem conexão: Enviar desabilitado com o motivo, nada é enviado, e ao voltar a rede o botão libera', async () => {
    const fetch = fakeDoAutor();
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(5);
    await act(async () => onlineManager.setOnline(false));

    await waitFor(() => expect(botaoEnviar()).toBeDisabled());
    expect(screen.getByText(textos.avaliar.semConexaoMotivo)).toBeOnTheScreen();
    await fireEvent.press(botaoEnviar());
    expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(0);

    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(botaoEnviar()).toBeEnabled());
  });

  it('sair da tela com o pedido no ar: quando ele termina, não navega por cima', async () => {
    const fetch = fakeDoAutor().responder('POST /avaliacoes', {
      status: 201,
      corpo: { id: 'a1' },
      demoraMs: 400,
    });
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
    await escolherNota(5);
    await fireEvent.press(botaoEnviar());
    // A pessoa desiste e volta para Demandas com o pedido ainda no ar.
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/demandas'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });

    expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1);
    // O fim do pedido não volta mais uma tela (para fora de Demandas).
    expect(screen).toHavePathname('/demandas');
  });
});

// --- CA96: "Avaliar" nas listas ---

describe('CA96: "Avaliar" nas listas (bordas)', () => {
  it('toque duplo em "Avaliar profissional" empilha uma tela só', async () => {
    await abrir('/demandas', { modo: 'contratante', fetch: fakeDoAutor() });
    await screen.findByText('Trampo t4');
    await fireEvent.press(
      screen.getByRole('tab', { name: textos.demandas.abaEncerradas }),
    );
    const botao = await screen.findByRole('button', {
      name: textos.avaliar.avaliarDe('Trampo t1'),
    });
    await fireEvent.press(botao);
    await fireEvent.press(botao);
    await waitFor(() => expect(screen).toHavePathname('/avaliar/t1'));

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.gerais.voltar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/demandas'));
  });

  it('Demandas: o trampo encerrado de candidatura que nunca foi aceita oferece "Avaliar" e cai em "encerrado sem profissional contratado" (R1)', async () => {
    const fetch = fake()
      .responder('GET /trampos/meus', {
        corpo: [
          meuTrampo('t4', 'aberto'),
          meuTrampo('t5', 'encerrado', { candidaturasRecebidas: 1 }),
        ],
      })
      .responder('GET /trampos/t5', {
        corpo: meuTrampo('t5', 'encerrado', { candidaturasRecebidas: 1 }),
      })
      .responder('GET /trampos/t5/candidaturas', {
        corpo: [candidatura('k1', 'f1', 'pendente')],
      });
    await abrir('/demandas', { modo: 'contratante', fetch });
    await screen.findByText('Trampo t4');
    await fireEvent.press(
      screen.getByRole('tab', { name: textos.demandas.abaEncerradas }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t5'),
      }),
    );

    await waitFor(() => expect(screen).toHavePathname('/avaliar/t5'));
    expect(
      await screen.findByText(textos.avaliar.semProfissional),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.nao_encontrado)).toBeNull();
    expect(screen.queryByLabelText(textos.avaliar.notaRotulo)).toBeNull();
  });

  it('R1: o "Voltar" do estado "sem profissional contratado" leva de volta a Demandas, sem enviar nada', async () => {
    const fetch = fake()
      .responder('GET /trampos/meus', {
        corpo: [meuTrampo('t5', 'encerrado', { candidaturasRecebidas: 1 })],
      })
      .responder('GET /trampos/t5', {
        corpo: meuTrampo('t5', 'encerrado', { candidaturasRecebidas: 1 }),
      })
      .responder('GET /trampos/t5/candidaturas', {
        corpo: [candidatura('k1', 'f1', 'recusada')],
      });
    await abrir('/demandas', { modo: 'contratante', fetch });
    await fireEvent.press(
      await screen.findByRole('tab', { name: textos.demandas.abaEncerradas }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t5'),
      }),
    );
    await screen.findByText(textos.avaliar.semProfissional);

    await fireEvent.press(
      screen
        .getAllByRole('button', { name: textos.gerais.voltar })
        .at(0) as never,
    );

    await waitFor(() => expect(screen).toHavePathname('/demandas'));
    expect(
      screen.queryByText(textos.avaliar.semProfissional),
    ).not.toBeOnTheScreen();
    expect(fetch.requisicoes.filter((r) => r.metodo === 'POST')).toHaveLength(
      0,
    );
  });

  it('Meus trampos do freela: avaliar o contratante volta com o aviso e o cartão passa a "Avaliado com N ★"', async () => {
    let avaliada = false;
    const fetch = fakeDoFreela()
      .responder('GET /avaliacoes/feitas', () => ({
        corpo: avaliada ? [feita('t1', 4)] : [],
      }))
      .responder('POST /avaliacoes', () => {
        avaliada = true;
        return { status: 201, corpo: { id: 'a1' } };
      });
    await abrir('/meus-trampos', { fetch });
    await fireEvent.press(
      await screen.findByRole('tab', {
        name: new RegExp(textos.meusTrampos.abaEncerrados),
      }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo t1'),
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/avaliar/t1'));
    await escolherNota(4);
    await fireEvent.press(botaoEnviar());

    await waitFor(() => expect(screen).toHavePathname('/meus-trampos'));
    expect(await screen.findByText(textos.avaliar.enviada)).toBeOnTheScreen();
    expect(
      await screen.findByLabelText(textos.avaliar.avaliadoComFalado(4)),
    ).toBeOnTheScreen();
    expect(chamadas(fetch, 'POST', '/avaliacoes')[0]?.corpo).toEqual({
      trampoId: 't1',
      nota: 4,
    });
  });

  it('Meus trampos do freela: candidatura recusada de trampo encerrado e aceita de trampo em andamento não oferecem "Avaliar"', async () => {
    const fetch = fakeDoFreela()
      .responder('GET /candidaturas/minhas', {
        corpo: [
          { ...candidatura('k1', EU, 'recusada'), trampoId: 't1' },
          { ...candidatura('k2', EU, 'aceita'), trampoId: 't2' },
        ],
      })
      .responder('GET /trampos/t2', { corpo: trampo('t2', 'em_andamento') });
    await abrir('/meus-trampos', { fetch });
    await fireEvent.press(
      await screen.findByRole('tab', {
        name: new RegExp(textos.meusTrampos.abaEncerrados),
      }),
    );
    await screen.findByText('Trampo t1');
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/trampos/t2').length).toBeGreaterThan(0),
    );
    expect(
      screen.queryByRole('button', {
        name: new RegExp(textos.avaliar.avaliar),
      }),
    ).toBeNull();
    // Ninguém é avaliável: a tela nem pergunta pelas avaliações feitas.
    expect(chamadas(fetch, 'GET', '/avaliacoes/feitas')).toHaveLength(0);
  });

  it('com mais de 50 encerrados, as avaliações feitas vão em lotes de até 50 ids, sem repetir id', async () => {
    const ids = Array.from({ length: 55 }, (_, i) => `e${i}`);
    const fetch = fake().responder('GET /candidaturas/minhas', {
      corpo: ids.map((id, i) => ({
        ...candidatura(`k${i}`, EU, 'aceita'),
        trampoId: id,
      })),
    });
    for (const id of ids) {
      fetch.responder(`GET /trampos/${id}`, { corpo: trampo(id, 'encerrado') });
    }
    fetch.responder('GET /perfis/conta-autor', {
      corpo: perfil(AUTOR, 'Carla Souza'),
    });
    await abrir('/meus-trampos', { fetch });
    await fireEvent.press(
      await screen.findByRole('tab', {
        name: new RegExp(textos.meusTrampos.abaEncerrados),
      }),
    );
    await waitFor(() => {
      const pedidos = chamadas(fetch, 'GET', '/avaliacoes/feitas');
      const todos = pedidos.flatMap((p) => (p.query.trampos ?? '').split(','));
      expect(new Set(todos).size).toBe(55);
    });
    for (const pedido of chamadas(fetch, 'GET', '/avaliacoes/feitas')) {
      expect(
        (pedido.query.trampos ?? '').split(',').length,
      ).toBeLessThanOrEqual(50);
    }
  });
});

// --- CA96: autor com cache velho de candidaturas ---

describe('CA96: cache velho no Avaliar do autor', () => {
  it('candidaturas em cache sem aceite (aceite feito em outro aparelho): a tela acaba no formulário quando a recarga chega', async () => {
    let aceita = false;
    const fetch = fakeDoAutor().responder(
      'GET /trampos/t1/candidaturas',
      () => ({
        corpo: aceita
          ? [candidatura('k1', 'f1', 'aceita')]
          : [candidatura('k1', 'f1', 'pendente')],
      }),
    );
    await abrir('/candidaturas/t1', { modo: 'contratante', fetch });
    await screen.findByText('João Pereira');
    aceita = true;
    await act(async () => router.push('/avaliar/t1'));

    expect(
      await screen.findByLabelText(textos.avaliar.notaRotulo),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.nao_encontrado)).toBeNull();
  });
});

// --- CA97: nota ---

describe('CA97: nota (bordas)', () => {
  it('o perfil de ?papel=contratante ignora a nota de freela da mesma conta', async () => {
    const fetch = fake()
      .responder('GET /perfis/c1', { corpo: perfil('c1', 'Empresa Boa') })
      .responder('GET /avaliacoes/resumos', {
        corpo: [resumo('c1', { media: 4.8, total: 12 }, null)],
      });
    await abrir('/perfis/c1?papel=contratante', { fetch });
    await screen.findByText('Empresa Boa');
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/avaliacoes/resumos').length).toBe(1),
    );
    expect(screen.queryByLabelText(/^Nota /)).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: textos.avaliacoes.recebidasTitulo,
      }),
    ).toBeNull();
  });

  it('média 5 e uma única avaliação: "Nota 5,0 de 5, 1 avaliação recebida" (singular, uma casa)', async () => {
    const fetch = fake()
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'João Pereira') })
      .responder('GET /avaliacoes/resumos', {
        corpo: [resumo('f1', { media: 5, total: 1 })],
      });
    await abrir('/perfis/f1', { fetch });

    expect(
      await screen.findByLabelText(
        `${textos.gerais.nota('5,0')}, ${textos.avaliacoes.recebidas(1)}`,
      ),
    ).toBeOnTheScreen();
    expect(textos.avaliacoes.recebidas(1)).toBe('1 avaliação recebida');
  });

  it('resumo da API sem a conta pedida ou com media nula e total > 0: nenhuma nota e nenhuma falha', async () => {
    const fetch = fake()
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'João Pereira') })
      .responder('GET /avaliacoes/resumos', {
        corpo: [resumo('f1', { media: null, total: 3 })],
      });
    await abrir('/perfis/f1', { fetch });
    await screen.findByText('João Pereira');
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/avaliacoes/resumos').length).toBe(1),
    );
    expect(screen.queryByLabelText(/^Nota /)).toBeNull();
  });

  it('lista de avaliações: avaliador sem perfil aparece como indisponível, sem mostrar o id da conta', async () => {
    const fetch = fake()
      .responder('GET /avaliacoes?contaId=f1', {
        corpo: {
          itens: [
            {
              nota: 4,
              destaques: ['pontual'],
              comentario: 'Gostei.',
              avaliadorId: 'conta-sumida-123',
              criadaEm: '2026-11-01T12:00:00.000Z',
            },
          ],
          proximoCursor: null,
        },
      })
      .responder('GET /perfis/conta-sumida-123', {
        status: 404,
        corpo: { erro: 'nao_encontrado' },
      })
      .responder('GET /avaliacoes/resumos', {
        corpo: [resumo('f1', { media: 4, total: 1 })],
      });
    await abrir('/avaliacoes/f1?papel=freela', { fetch });

    expect(await screen.findByText('Gostei.')).toBeOnTheScreen();
    expect(
      screen.getAllByText(textos.conversas.perfilIndisponivel, { exact: false })
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('conta-sumida-123', { exact: false })).toBeNull();
    expect(
      screen.queryByLabelText('conta-sumida-123', { exact: false }),
    ).toBeNull();
  });

  it('lista de avaliações: duas do mesmo avaliador na mesma data não geram aviso de chave repetida', async () => {
    const igual = {
      nota: 3,
      destaques: [],
      comentario: null,
      avaliadorId: 'f9',
      criadaEm: '2026-11-01T12:00:00.000Z',
    };
    const fetch = fake()
      .responder('GET /avaliacoes?contaId=f1', {
        corpo: {
          itens: [igual, { ...igual, nota: 5 }],
          proximoCursor: null,
        },
      })
      .responder('GET /perfis/f9', { corpo: perfil('f9', 'Ana Lima') })
      .responder('GET /avaliacoes/resumos', {
        corpo: [resumo('f1', { media: 4, total: 2 })],
      });
    await abrir('/avaliacoes/f1?papel=freela', { fetch });

    expect((await screen.findAllByText('Ana Lima')).length).toBe(2);
  });

  it('?papel= repetido ou desconhecido em /avaliacoes vale freela', async () => {
    const fetch = fake().responder('GET /avaliacoes?contaId=f1', {
      corpo: { itens: [], proximoCursor: null },
    });
    await abrir('/avaliacoes/f1?papel=admin', { fetch });
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/avaliacoes').length).toBe(1),
    );
    expect(chamadas(fetch, 'GET', '/avaliacoes')[0]?.query.papel).toBe(
      'freela',
    );
  });
});

// --- CA98: equipe favorita ---

describe('CA98: equipe favorita (bordas)', () => {
  const FAVORITOS = [{ contaId: 'f1', criadoEm: '2026-11-02T12:00:00.000Z' }];

  function fakeDaEquipe(): FetchFalso {
    return fake()
      .responder('GET /favoritos', { corpo: FAVORITOS })
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'Ana Lima') })
      .responder('GET /trampos/meus', { corpo: [meuTrampo('t1', 'aberto')] });
  }

  it('GET /favoritos com erro: o Início segue com as demandas, sem a seção e sem esqueleto preso', async () => {
    const fetch = fakeDaEquipe().responder('GET /favoritos', { status: 500 });
    await abrir('/', { modo: 'contratante', fetch });

    expect(await screen.findByText('Trampo t1')).toBeOnTheScreen();
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/favoritos').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(textos.inicioContratante.equipe)).toBeNull();
  });

  it('todos os favoritos sem perfil: a seção não aparece', async () => {
    const fetch = fakeDaEquipe().responder('GET /perfis/f1', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir('/', { modo: 'contratante', fetch });

    await screen.findByText('Trampo t1');
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/perfis/f1').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(textos.inicioContratante.equipe)).toBeNull();
  });

  it('"Recontratar" com toque duplo abre uma conversa só', async () => {
    const fetch = fakeDaEquipe().responder('POST /conversas', {
      status: 201,
      corpo: { conversaId: 'cv1' },
      demoraMs: 200,
    });
    await abrir('/', { modo: 'contratante', fetch });
    const botao = await screen.findByRole('button', {
      name: textos.inicioContratante.recontratarCom('Ana Lima'),
    });
    await fireEvent.press(botao);
    await fireEvent.press(botao);

    await waitFor(() => expect(screen).toHavePathname('/conversas/cv1'));
    expect(chamadas(fetch, 'POST', '/conversas')).toHaveLength(1);
  });

  it('desfavoritar no perfil e voltar ao Início: a pessoa já saiu da equipe; favoritar de novo traz de volta', async () => {
    let favoritos: unknown[] = [...FAVORITOS];
    const fetch = fakeDaEquipe()
      .responder('GET /favoritos', () => ({ corpo: favoritos }))
      .responder('DELETE /favoritos/f1', () => {
        favoritos = [];
        return SEM_CONTEUDO;
      })
      .responder('PUT /favoritos/f1', () => {
        favoritos = [...FAVORITOS];
        return SEM_CONTEUDO;
      });
    await abrir('/', { modo: 'contratante', fetch });
    await fireEvent.press(
      await screen.findByRole('button', {
        name: `${textos.inicioContratante.verPerfil} Ana Lima`,
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfis/f1'));
    const interruptor = () =>
      screen.getByRole('switch', {
        name: textos.favoritos.favoritar('Ana Lima'),
      });
    await waitFor(() => expect(interruptor()).toBeChecked());

    await fireEvent.press(interruptor());
    await waitFor(() => expect(interruptor()).not.toBeChecked());
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/'));
    await waitFor(() =>
      expect(screen.queryByText(textos.inicioContratante.equipe)).toBeNull(),
    );
  });

  it('DELETE recusado: o interruptor volta a ligado, a pessoa continua na equipe e o aviso aparece', async () => {
    const fetch = fakeDaEquipe().responder('DELETE /favoritos/f1', {
      status: 500,
      corpo: { erro: 'erro_interno' },
      demoraMs: 200,
    });
    await abrir('/perfis/f1', { modo: 'contratante', fetch });
    const interruptor = () =>
      screen.getByRole('switch', {
        name: textos.favoritos.favoritar('Ana Lima'),
      });
    await waitFor(() => expect(interruptor()).toBeChecked());

    await fireEvent.press(interruptor());
    await waitFor(() => expect(interruptor()).not.toBeChecked());

    expect(await screen.findByText(textos.favoritos.erro)).toBeOnTheScreen();
    await waitFor(() => expect(interruptor()).toBeChecked());
  });

  it('toque duplo no interruptor com o pedido no ar manda um pedido só', async () => {
    const fetch = fakeDaEquipe()
      .responder('GET /favoritos', { corpo: [] })
      .responder('PUT /favoritos/f1', { ...SEM_CONTEUDO, demoraMs: 300 });
    await abrir('/perfis/f1', { modo: 'contratante', fetch });
    const interruptor = () =>
      screen.getByRole('switch', {
        name: textos.favoritos.favoritar('Ana Lima'),
      });
    await waitFor(() => expect(interruptor()).not.toBeChecked());

    await fireEvent.press(interruptor());
    // Um instante depois (a tela já mostrou o pedido no ar), o segundo toque.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    await fireEvent.press(interruptor());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });

    expect(chamadas(fetch, 'PUT', '/favoritos/f1')).toHaveLength(1);
    expect(chamadas(fetch, 'DELETE', '/favoritos/f1')).toHaveLength(0);
  });

  it('o perfil de contratante (?papel=contratante) não oferece "Favoritar"', async () => {
    const fetch = fakeDaEquipe();
    await abrir('/perfis/f1?papel=contratante', { fetch });
    await screen.findByText('Ana Lima');
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/favoritos').length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('o perfil próprio (Perfil) nunca oferece "Favoritar"', async () => {
    await abrir('/perfil', { fetch: fake() });
    await screen.findByText(PERFIL_DE_EU.nome);
    expect(screen.queryByRole('switch', { name: /Favoritar/ })).toBeNull();
  });
});

// --- Segurança: sem sessão ---

describe('V2b sem sessão', () => {
  it('abrir /avaliar/t1 sem token não consulta o trampo nem envia avaliação', async () => {
    const fetch = fakeDoAutor();
    await renderizarRotas(ROTAS, {
      initialUrl: '/avaliar/t1',
      fetch,
      modo: 'contratante',
      armazenamento: criarArmazenamentoEmMemoria(null),
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });

    expect(screen.queryByLabelText(textos.avaliar.notaRotulo)).toBeNull();
    expect(
      fetch.requisicoes.filter(
        (r) =>
          r.caminho.startsWith('/trampos') ||
          r.caminho.startsWith('/avaliacoes') ||
          r.caminho.startsWith('/favoritos'),
      ),
    ).toEqual([]);
  });
});

// --- CA98: o próprio perfil público ---

describe('CA98: o autor abrindo o próprio perfil público', () => {
  it('pelo serviço próprio, o perfil público não oferece "Favoritar" na própria conta (a API recusaria com favorito_invalido)', async () => {
    const fetch = fake()
      .responder('GET /servicos/s1', {
        corpo: {
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
        },
      })
      .responder('GET /servicos/meus', {
        corpo: [
          {
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
          },
        ],
      })
      .responder(`GET /perfis/${EU}`, { corpo: perfil(EU, 'Maria Souza') });
    await abrir('/servicos/s1', { fetch });

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
});

// --- Integração entre telas e entradas hostis ---

describe('V2b: integração e entradas hostis', () => {
  it('avaliar e favoritar: o Início do contratante já mostra a pessoa na equipe', async () => {
    let favoritos: unknown[] = [];
    const fetch = fakeDoAutor()
      .responder('GET /favoritos', () => ({ corpo: favoritos }))
      .responder('PUT /favoritos/f1', () => {
        favoritos = [{ contaId: 'f1', criadoEm: '2026-11-02T12:00:00.000Z' }];
        return SEM_CONTEUDO;
      });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(5);
    await fireEvent.press(
      await screen.findByRole('switch', { name: textos.avaliar.favoritar }),
    );
    await fireEvent.press(botaoEnviar());

    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(
      await screen.findByText(textos.inicioContratante.equipe),
    ).toBeOnTheScreen();
    expect(await screen.findByText('João Pereira')).toBeOnTheScreen();
  });

  it('id da rota com "&" e "=": o pedido leva o id inteiro em contaId e o papel segue freela', async () => {
    const fetch = fake().responder('GET /avaliacoes?contaId=x', {
      corpo: { itens: [], proximoCursor: null },
    });
    await abrir('/avaliacoes/x%26papel%3Dcontratante', { fetch });
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/avaliacoes').length).toBe(1),
    );
    const { query } = chamadas(fetch, 'GET', '/avaliacoes')[0] as {
      query: Record<string, string>;
    };
    expect(query.papel).toBe('freela');
    expect(query.contaId).toBe('x&papel=contratante');
  });

  it('Busca de trampos: o autor sem perfil (404) não derruba o item nem mostra "undefined" ou o id', async () => {
    const fetch = fake()
      .responder('GET /busca', {
        corpo: {
          itens: [
            {
              tipo: 'trampo',
              id: 'tb1',
              autorId: 'autor-sumido',
              titulo: 'Capinar quintal',
              categoria: 'reformas',
              cidade: 'Lavras',
              valorCentavos: 5000,
              criadoEm: '2026-10-20T12:00:00.000Z',
            },
          ],
          proximoCursor: null,
        },
      })
      .responder('GET /perfis/autor-sumido', {
        status: 404,
        corpo: { erro: 'nao_encontrado' },
      });
    await abrir('/buscar-trampos?tipo=trampos', { fetch });

    expect(await screen.findByText('Capinar quintal')).toBeOnTheScreen();
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/perfis/autor-sumido').length).toBe(1),
    );
    expect(screen.queryByText('undefined', { exact: false })).toBeNull();
    expect(screen.queryByText('autor-sumido', { exact: false })).toBeNull();
  });
});

// --- Rodada 2: correções de Q1, Q2 e dos achados do revisor (decisões 70 a 72) ---

/** `n` favoritos, do mais recente (`p01`) ao mais antigo, cada um com perfil. */
function fakeComEquipeDe(n: number): FetchFalso {
  const ids = Array.from(
    { length: n },
    (_, i) => `p${String(i + 1).padStart(2, '0')}`,
  );
  const base = Date.parse('2026-11-10T12:00:00.000Z');
  let fetch = fake()
    .responder('GET /trampos/meus', { corpo: [meuTrampo('t1', 'aberto')] })
    .responder('GET /favoritos', {
      corpo: ids.map((contaId, i) => ({
        contaId,
        criadoEm: new Date(base - i * 60_000).toISOString(),
      })),
    });
  for (const id of ids) {
    fetch = fetch.responder(`GET /perfis/${id}`, {
      corpo: perfil(id, `Pessoa ${id}`),
    });
  }
  return fetch;
}

function contasPedidasNosResumos(fetch: FetchFalso): string[] {
  return chamadas(fetch, 'GET', '/avaliacoes/resumos').flatMap((r) =>
    (r.query.contas ?? '').split(','),
  );
}

describe('Rodada 2 — R2: equipe no Início limitada a 20', () => {
  it('com 20 favoritos, mostra os 20 e pede o perfil de cada um', async () => {
    const fetch = fakeComEquipeDe(20);
    await abrir('/', { modo: 'contratante', fetch });

    expect(await screen.findByText('Pessoa p01')).toBeOnTheScreen();
    expect(await screen.findByText('Pessoa p20')).toBeOnTheScreen();
    for (let i = 1; i <= 20; i++) {
      const id = `p${String(i).padStart(2, '0')}`;
      expect(chamadas(fetch, 'GET', `/perfis/${id}`).length).toBeGreaterThan(0);
    }
  });

  it('com 21 favoritos, mostra só os 20 mais recentes: o 21º não aparece e não tem perfil nem resumo pedido', async () => {
    const fetch = fakeComEquipeDe(21);
    await abrir('/', { modo: 'contratante', fetch });

    expect(await screen.findByText('Pessoa p20')).toBeOnTheScreen();
    expect(screen.getByText('Pessoa p01')).toBeOnTheScreen();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByText('Pessoa p21')).toBeNull();
    expect(chamadas(fetch, 'GET', '/perfis/p21')).toHaveLength(0);
    const contas = contasPedidasNosResumos(fetch);
    expect(contas).not.toContain('p21');
    expect(new Set(contas.filter((c) => c.startsWith('p'))).size).toBe(20);
  });
});

describe('Rodada 2 — Avaliar com a pessoa já na equipe (R4)', () => {
  const NA_EQUIPE = [{ contaId: 'f1', criadoEm: '2026-11-02T12:00:00.000Z' }];

  it('desligar o "Favoritar" na tela Avaliar não manda DELETE nem PUT, e a pessoa continua na equipe', async () => {
    const fetch = fakeDoAutor().responder('GET /favoritos', {
      corpo: NA_EQUIPE,
    });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    const interruptor = () =>
      screen.getByRole('switch', { name: textos.avaliar.favoritar });
    await screen.findByText('João Pereira');
    await waitFor(() => expect(interruptor()).toBeChecked());

    await fireEvent.press(interruptor());
    await waitFor(() => expect(interruptor()).not.toBeChecked());
    await escolherNota(4);
    await fireEvent.press(botaoEnviar());

    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1);
    expect(chamadas(fetch, 'PUT', '/favoritos/f1')).toHaveLength(0);
    expect(chamadas(fetch, 'DELETE', '/favoritos/f1')).toHaveLength(0);
    expect(
      await screen.findByText(textos.inicioContratante.equipe),
    ).toBeOnTheScreen();
  });

  it('a equipe chega depois da tela: o interruptor liga sozinho quando a lista carrega', async () => {
    const fetch = fakeDoAutor().responder('GET /favoritos', {
      corpo: NA_EQUIPE,
      demoraMs: 400,
    });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    const interruptor = () =>
      screen.getByRole('switch', { name: textos.avaliar.favoritar });
    await screen.findByText('João Pereira');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    await waitFor(() => expect(interruptor()).toBeChecked());
  });

  it('GET /favoritos com erro: o interruptor começa desligado e, ligado, manda o PUT depois da avaliação', async () => {
    const fetch = fakeDoAutor().responder('GET /favoritos', { status: 500 });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    const interruptor = () =>
      screen.getByRole('switch', { name: textos.avaliar.favoritar });
    await screen.findByText('João Pereira');
    expect(interruptor()).not.toBeChecked();

    await fireEvent.press(interruptor());
    await escolherNota(5);
    await fireEvent.press(botaoEnviar());

    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(chamadas(fetch, 'PUT', '/favoritos/f1')).toHaveLength(1);
  });
});

describe('Rodada 2 — 404 sem vínculo no favoritar (R4)', () => {
  it('no Avaliar: a avaliação vai, o PUT volta 404 e a origem diz "enviada, mas não foi possível favoritar" (sem o código)', async () => {
    const fetch = fakeDoAutor().responder('PUT /favoritos/f1', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir('/avaliar/t1', { modo: 'contratante', fetch });
    await escolherNota(5);
    await fireEvent.press(
      await screen.findByRole('switch', { name: textos.avaliar.favoritar }),
    );
    await fireEvent.press(botaoEnviar());

    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(
      await screen.findByText(textos.avaliar.enviadaSemFavorito),
    ).toBeOnTheScreen();
    expect(chamadas(fetch, 'POST', '/avaliacoes')).toHaveLength(1);
    expect(screen.queryByText(/nao_encontrado/)).toBeNull();
  });

  it('no perfil: depois do 404, um novo toque que dá certo apaga o aviso e deixa ligado', async () => {
    let favoritos: unknown[] = [];
    let puts = 0;
    const fetch = fake()
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'Ana Lima') })
      .responder('GET /favoritos', () => ({ corpo: favoritos }))
      .responder('PUT /favoritos/f1', () => {
        puts += 1;
        if (puts === 1) {
          return { status: 404, corpo: { erro: 'nao_encontrado' } };
        }
        favoritos = [{ contaId: 'f1', criadoEm: '2026-11-02T12:00:00.000Z' }];
        return SEM_CONTEUDO;
      });
    await abrir('/perfis/f1', { modo: 'contratante', fetch });
    const interruptor = () =>
      screen.getByRole('switch', {
        name: textos.favoritos.favoritar('Ana Lima'),
      });
    await waitFor(() => expect(interruptor()).not.toBeChecked());

    await fireEvent.press(interruptor());
    expect(
      await screen.findByText(textos.favoritos.semVinculo),
    ).toBeOnTheScreen();
    await waitFor(() => expect(interruptor()).not.toBeChecked());
    expect(screen.queryByText(/nao_encontrado/)).toBeNull();

    await fireEvent.press(interruptor());
    await waitFor(() =>
      expect(screen.queryByText(textos.favoritos.semVinculo)).toBeNull(),
    );
    await waitFor(() => expect(interruptor()).toBeChecked());
    expect(chamadas(fetch, 'PUT', '/favoritos/f1')).toHaveLength(2);
  });
});

describe('Rodada 2 — R1: trampo encerrado sem contratado (bordas)', () => {
  function fakeDoT5(candidaturas: unknown): FetchFalso {
    return fake()
      .responder('GET /trampos/t5', {
        corpo: meuTrampo('t5', 'encerrado', { candidaturasRecebidas: 0 }),
      })
      .responder('GET /trampos/t5/candidaturas', candidaturas as never);
  }

  it('encerrado sem nenhuma candidatura: "sem profissional contratado", sem formulário', async () => {
    await abrir('/avaliar/t5', {
      modo: 'contratante',
      fetch: fakeDoT5({ corpo: [] }),
    });
    expect(
      await screen.findByText(textos.avaliar.semProfissional),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.avaliar.notaRotulo)).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('falha ao listar as candidaturas: mostra o erro com "Tentar de novo" (não afirma "sem profissional"); a nova tentativa chega ao estado certo', async () => {
    const fetch = fakeDoT5([{ status: 500 }, { corpo: [] }]);
    await abrir('/avaliar/t5', { modo: 'contratante', fetch });

    const tentar = await screen.findByRole('button', {
      name: textos.gerais.tentarDeNovo,
    });
    expect(screen.queryByText(textos.avaliar.semProfissional)).toBeNull();
    await fireEvent.press(tentar);
    expect(
      await screen.findByText(textos.avaliar.semProfissional),
    ).toBeOnTheScreen();
  });

  it('o autor abrindo por link um trampo ainda aberto sem aceite: "não encontrado", não "encerrado sem profissional"', async () => {
    const fetch = fake()
      .responder('GET /trampos/t6', { corpo: meuTrampo('t6', 'aberto') })
      .responder('GET /trampos/t6/candidaturas', { corpo: [] });
    await abrir('/avaliar/t6', { modo: 'contratante', fetch });
    await waitFor(() =>
      expect(
        chamadas(fetch, 'GET', '/trampos/t6/candidaturas').length,
      ).toBeGreaterThan(0),
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByText(textos.avaliar.semProfissional)).toBeNull();
    expect(screen.queryByLabelText(textos.avaliar.notaRotulo)).toBeNull();
    expect(screen.getByText(textos.erros.nao_encontrado)).toBeOnTheScreen();
  });
});

describe('Rodada 2 — modo freela e Q1 no modo contratante', () => {
  const SERVICO = {
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

  it('Q1 no modo contratante: o autor que abre o próprio perfil pelo serviço não vê "Favoritar"', async () => {
    const fetch = fake()
      .responder('GET /servicos/s1', { corpo: SERVICO })
      .responder('GET /servicos/meus', { corpo: [SERVICO] })
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
    expect(chamadas(fetch, 'PUT', `/favoritos/${EU}`)).toHaveLength(0);
  });

  it('no modo contratante, o perfil de outra pessoa aberto pelo serviço dela oferece "Favoritar"', async () => {
    const outro = { ...SERVICO, id: 's2', autorId: 'f1' };
    delete (outro as Record<string, unknown>).versao;
    const fetch = fake()
      .responder('GET /servicos/s2', { corpo: outro })
      .responder('GET /servicos/meus', { corpo: [] })
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'Ana Lima') });
    await abrir('/servicos/s2', { modo: 'contratante', fetch });

    // A lista dos meus serviços precisa chegar: sem ela, o perfil abre sem
    // "Favoritar" (R12).
    await waitFor(() =>
      expect(chamadas(fetch, 'GET', '/servicos/meus').length).toBeGreaterThan(
        0,
      ),
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    await fireEvent.press(await screen.findByText('Ana Lima'));
    await waitFor(() => expect(screen).toHavePathname('/perfis/f1'));
    expect(
      await screen.findByRole('switch', {
        name: textos.favoritos.favoritar('Ana Lima'),
      }),
    ).toBeOnTheScreen();
  });

  it('modo freela: o perfil de outra pessoa favoritada não oferece "Favoritar" e nada é enviado', async () => {
    const fetch = fake()
      .responder('GET /perfis/f1', { corpo: perfil('f1', 'Ana Lima') })
      .responder('GET /favoritos', {
        corpo: [{ contaId: 'f1', criadoEm: '2026-11-02T12:00:00.000Z' }],
      });
    await abrir('/perfis/f1', { modo: 'freela', fetch });
    await screen.findByText('Ana Lima');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(textos.favoritos.favoritado)).toBeNull();
    expect(
      fetch.requisicoes.filter((r) => r.caminho.startsWith('/favoritos/')),
    ).toEqual([]);
  });

  it('modo freela: o Início não mostra a equipe favorita, mesmo com favoritos na conta', async () => {
    const fetch = fakeComEquipeDe(3);
    await abrir('/', { modo: 'freela', fetch });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(screen.queryByText(textos.inicioContratante.equipe)).toBeNull();
    expect(screen.queryByText('Pessoa p01')).toBeNull();
  });
});
