// QA da entrega 2b: candidatar-se, candidaturas recebidas e aceite, minhas
// candidaturas e meus anúncios, pelas rotas reais (`ROTAS_REAIS`): jornadas
// que cruzam telas, bordas de valor e mensagem, segurança e queda de rede.
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { TextInput } from 'react-native';
import type {
  CandidaturaRecebida,
  MinhaCandidatura,
  StatusDaCandidatura,
} from '../../api/tipos';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { ACEITAR_QUALQUER } from '../rotas/apoio';
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

function candidatura(
  id: string,
  freelancerId: string,
  status: StatusDaCandidatura = 'pendente',
  mensagem = `Mensagem de ${id}`,
): CandidaturaRecebida {
  return {
    id,
    freelancerId,
    mensagem,
    valorPropostoCentavos: 15000,
    status,
    criadaEm: '2026-10-02T12:00:00.000Z',
  };
}

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
    .responder('GET /candidaturas/minhas', { corpo: [] });
}

/** Autor do t1 com duas pendentes (Maria e João); o aceite muda o que a API devolve. */
function mundoDoAutor(mensagemDaMaria = 'Mensagem de k1') {
  const estado = { vencedora: null as string | null };
  const fetch = criarFake()
    .responder('GET /trampos/meus', { corpo: [TRAMPO] })
    .responder('GET /trampos/t1', () => ({
      corpo: {
        ...TRAMPO,
        status: estado.vencedora === null ? 'aberto' : 'em_andamento',
      },
    }))
    .responder('GET /trampos/t1/candidaturas', () => ({
      corpo: [
        ['k1', 'f1', mensagemDaMaria],
        ['k2', 'f2', 'Mensagem de k2'],
      ].map(([id = '', conta = '', mensagem = '']) =>
        candidatura(
          id,
          conta,
          estado.vencedora === null
            ? 'pendente'
            : estado.vencedora === id
              ? 'aceita'
              : 'recusada',
          mensagem,
        ),
      ),
    }))
    .responder('GET /perfis/f1', { corpo: PERFIL('f1', 'Maria Souza') })
    .responder('GET /perfis/f2', { corpo: PERFIL('f2', 'João Pereira') })
    .responder('POST /trampos/t1/candidaturas/k2/aceitar', () => {
      estado.vencedora = 'k2';
      return { corpo: { status: 'aceita' } };
    });
  return { fetch, estado };
}

const requisicoes = (fetch: FetchFalso, metodo: string, caminho: string) =>
  fetch.requisicoes.filter((r) => r.metodo === metodo && r.caminho === caminho);

const avancar = (ms = 50) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

const botoesAceitar = () =>
  screen.queryAllByRole('button', { name: ACEITAR_QUALQUER });

async function abrirFolha() {
  await fireEvent.press(
    await screen.findByRole('button', {
      name: textos.detalheTrampo.candidatar,
    }),
  );
  return screen.findByLabelText(textos.candidatar.mensagem);
}

async function preencherFolha(mensagem: string, valor: string) {
  await fireEvent.changeText(
    screen.getByLabelText(textos.candidatar.mensagem),
    mensagem,
  );
  await fireEvent.changeText(
    screen.getByLabelText(textos.candidatar.valor),
    valor,
  );
}

const botaoEnviar = () =>
  screen.getByRole('button', { name: textos.candidatar.enviar });

async function confirmarSaida() {
  const botoes = screen.getAllByRole('button', {
    name: textos.perfil.sairConfirmar,
  });
  await fireEvent.press(botoes[botoes.length - 1] as (typeof botoes)[number]);
}

async function irPara(rota: Parameters<typeof router.push>[0]) {
  await act(async () => router.push(rota));
}

describe('jornada do candidato (CA8, CA9)', () => {
  it('mensagem só de espaços e valor zero não enviam; o envio válido troca o botão pelo selo e Minhas candidaturas já lista a nova', async () => {
    let enviada = false;
    const fetch = criarFake()
      .responder('GET /candidaturas/minhas', () => ({
        corpo: enviada
          ? [
              {
                ...candidatura('m1', 'eu', 'pendente', 'Posso fazer.'),
                trampoId: 't1',
              } satisfies MinhaCandidatura,
            ]
          : [],
      }))
      .responder('POST /trampos/t1/candidaturas', () => {
        enviada = true;
        return { status: 201, corpo: { id: 'm1', status: 'pendente' } };
      });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();

    await preencherFolha('     ', '0');
    await fireEvent.press(botaoEnviar());
    expect(
      await screen.findByText(textos.erros.mensagem_obrigatoria),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.erros.valor_proposto_invalido),
    ).toBeOnTheScreen();
    expect(requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')).toEqual([]);

    await preencherFolha('  Posso fazer.  ', 'R$ 150');
    await fireEvent.press(botaoEnviar());
    expect(
      await screen.findByText(textos.candidatar.enviada),
    ).toBeOnTheScreen();
    expect(
      requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')[0]?.corpo,
    ).toEqual({ mensagem: 'Posso fazer.', valorPropostoCentavos: 15000 });
    expect(
      screen.getByText(textos.detalheTrampo.jaCandidatou),
    ).toBeOnTheScreen();

    await irPara('/candidaturas');
    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.pendente)).toBeOnTheScreen();
    expect(screen.getByText(/R\$ 150,00/)).toBeOnTheScreen();

    // "Voltar" leva de novo ao detalhe, que segue com o selo.
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
    expect(
      screen.getByText(textos.detalheTrampo.jaCandidatou),
    ).toBeOnTheScreen();
  });

  it.each([
    ['21474836,48', textos.erros.valor_alto],
    ['0,00', textos.erros.valor_proposto_invalido],
    ['1,234', textos.erros.valor_proposto_invalido],
  ])('valor proposto "%s" não envia e mostra o erro', async (valor, erro) => {
    const fetch = criarFake();
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('Posso fazer.', valor);
    await fireEvent.press(botaoEnviar());

    expect(await screen.findByText(erro)).toBeOnTheScreen();
    expect(requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')).toEqual([]);
  });

  it('valor proposto no teto (21474836,47) vai como 2147483647 centavos', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      status: 201,
      corpo: { id: 'm1', status: 'pendente' },
    });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('Posso fazer.', '21474836,47');
    await fireEvent.press(botaoEnviar());
    await screen.findByText(textos.candidatar.enviada);
    expect(
      requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')[0]?.corpo,
    ).toEqual({ mensagem: 'Posso fazer.', valorPropostoCentavos: 2147483647 });
  });

  it('mensagem de 2001 caracteres não envia; de 2000 envia', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      status: 201,
      corpo: { id: 'm1', status: 'pendente' },
    });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('a'.repeat(2001), '100');
    await fireEvent.press(botaoEnviar());
    expect(
      await screen.findByText(textos.erros.mensagem_tamanho),
    ).toBeOnTheScreen();
    expect(requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')).toEqual([]);

    await fireEvent.changeText(
      screen.getByLabelText(textos.candidatar.mensagem),
      'a'.repeat(2000),
    );
    await fireEvent.press(botaoEnviar());
    await screen.findByText(textos.candidatar.enviada);
  });

  it('se Minhas candidaturas falha na recarga depois do POST, a folha fecha com o toast e não fica em "Enviando…"', async () => {
    let enviada = false;
    const fetch = criarFake()
      .responder('GET /candidaturas/minhas', () =>
        enviada ? { status: 500, corpo: { erro: 'interno' } } : { corpo: [] },
      )
      .responder('POST /trampos/t1/candidaturas', () => {
        enviada = true;
        return { status: 201, corpo: { id: 'm1', status: 'pendente' } };
      });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('Posso fazer.', '150');
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.candidatar.enviada),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.candidatar.mensagem)).toBeNull();
    expect(screen.queryByText(textos.candidatar.enviando)).toBeNull();
    expect(requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')).toHaveLength(
      1,
    );
  });

  it('o foco da folha vai ao primeiro campo com erro (valor, quando a mensagem está certa)', async () => {
    await abrirApp('/trampos/t1', { fetch: criarFake() });
    await abrirFolha();
    await preencherFolha('Posso fazer.', '0');
    const foco = jest.spyOn(TextInput.prototype, 'focus');
    foco.mockClear();
    await fireEvent.press(botaoEnviar());
    await screen.findByText(textos.erros.valor_proposto_invalido);

    expect(foco).toHaveBeenCalled();
    expect(foco.mock.contexts[0]).toHaveProperty(
      'props.accessibilityLabel',
      textos.candidatar.valor,
    );
    foco.mockRestore();
  });

  it('o 409 candidatura_duplicada mostra o texto na folha e o rascunho fica', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      status: 409,
      corpo: { erro: 'candidatura_duplicada' },
    });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('Posso fazer.', '150');
    await fireEvent.press(botaoEnviar());

    expect(
      await screen.findByText(textos.erros.candidatura_duplicada),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(textos.candidatar.mensagem).props.value).toBe(
      'Posso fazer.',
    );
  });

  it('D9: "Completar perfil" na folha leva ao Editar perfil e, ao salvar, volta ao trampo', async () => {
    const fetch = criarFake()
      .responder('GET /perfis/eu', { status: 404, corpo: { erro: 'x' } })
      .responder('PUT /perfis/eu', { corpo: PERFIL_COMPLETO });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.avisoPerfil.completar,
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfil/editar'));

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
    await screen.findByText(textos.editarPerfil.sucesso);
    await avancar(8000);

    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
  });

  it('dois toques no mesmo quadro em "Enviar candidatura" mandam um só POST', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      status: 201,
      corpo: { id: 'm1', status: 'pendente' },
      demoraMs: 200,
    });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('Posso fazer.', '150');
    await tocarDuasVezes(botaoEnviar());
    await screen.findByText(textos.candidatar.enviada);
    expect(requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')).toHaveLength(
      1,
    );
  });
});

describe('rodapé desatualizado depois de um 409 (CA9)', () => {
  it('candidatura_duplicada: a lista "minha" falhou na carga, o servidor diz que já existe e o rodapé passa a mostrar o selo', async () => {
    let existe = false;
    const fetch = criarFake()
      .responder('GET /candidaturas/minhas', () =>
        existe
          ? {
              corpo: [
                {
                  ...candidatura('m1', 'eu', 'pendente', 'Posso fazer.'),
                  trampoId: 't1',
                },
              ],
            }
          : { status: 500, corpo: { erro: 'interno' } },
      )
      .responder('POST /trampos/t1/candidaturas', () => {
        existe = true;
        return { status: 409, corpo: { erro: 'candidatura_duplicada' } };
      });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('Posso fazer.', '150');
    await fireEvent.press(botaoEnviar());
    await screen.findByText(textos.erros.candidatura_duplicada);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatar.fecharFolha }),
    );

    expect(
      await screen.findByText(textos.detalheTrampo.jaCandidatou),
    ).toBeOnTheScreen();
  });

  it('autor_nao_pode_candidatar: a lista "meus trampos" falhou na carga e, depois do 409, o rodapé passa a mostrar "Ver candidaturas"', async () => {
    let ehMeu = false;
    const fetch = criarFake()
      .responder('GET /trampos/meus', () =>
        ehMeu
          ? { corpo: [TRAMPO] }
          : { status: 500, corpo: { erro: 'interno' } },
      )
      .responder('GET /trampos/t1/candidaturas', { corpo: [] })
      .responder('POST /trampos/t1/candidaturas', () => {
        ehMeu = true;
        return { status: 409, corpo: { erro: 'autor_nao_pode_candidatar' } };
      });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('Posso fazer.', '150');
    await fireEvent.press(botaoEnviar());
    await screen.findByText(textos.erros.autor_nao_pode_candidatar);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatar.fecharFolha }),
    );

    expect(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.verCandidaturas(0),
      }),
    ).toBeOnTheScreen();
  });
});

interface Fibra {
  readonly memoizedProps?: { readonly onPress?: unknown } | null;
  readonly return: Fibra | null;
}

/** Chama o `onPress` do botão duas vezes num só `act` (dois toques no mesmo quadro). */
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

describe('jornada do autor: ver, aceitar e conferir em todo lugar (CA9, CA10)', () => {
  it('detalhe -> recebidas -> aceita o João -> detalhe e Meus trampos mostram "Em andamento" e a busca recarrega', async () => {
    const { fetch } = mundoDoAutor();
    // Começa no Início para os "recentes" ficarem no cache (e depois inativos).
    await abrirApp('/', { fetch });
    await screen.findByText(textos.inicio.trampos);
    await irPara('/trampos/t1');

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.verCandidaturas(2),
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/candidaturas/t1'));
    expect(await screen.findByText('Maria Souza')).toBeOnTheScreen();
    expect(screen.getByText('João Pereira')).toBeOnTheScreen();

    const buscasAntes = requisicoes(fetch, 'GET', '/busca').length;
    // O segundo "Aceitar" é o do João.
    await fireEvent.press(botoesAceitar()[1] as never);
    expect(await screen.findByText('Aceitar João Pereira?')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.confirmar,
      }),
    );
    await screen.findByText(textos.candidaturasRecebidas.aceitaToast);

    const aceites = requisicoes(
      fetch,
      'POST',
      '/trampos/t1/candidaturas/k2/aceitar',
    );
    expect(aceites).toHaveLength(1);
    expect(aceites[0]?.corpo).toBeUndefined();
    expect(aceites[0]?.cabecalhos).not.toHaveProperty('content-type');
    expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.recusada)).toBeOnTheScreen();
    expect(botoesAceitar()).toHaveLength(0);
    // CA10: os caches de busca foram invalidados e recarregados.
    expect(requisicoes(fetch, 'GET', '/busca').length).toBeGreaterThan(
      buscasAntes,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
    expect(
      await screen.findByText(textos.detalheTrampo.seloEmAndamento),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: textos.detalheTrampo.verCandidaturas(2),
      }),
    ).toBeOnTheScreen();
  });

  it('rodapé do autor com a lista de recebidas falhando mostra "Ver candidaturas" sem número, e a tela recebidas mostra o erro com "Tentar de novo"', async () => {
    const { fetch } = mundoDoAutor();
    fetch.responder('GET /trampos/t1/candidaturas', [
      { status: 500, corpo: { erro: 'interno' } },
      { status: 500, corpo: { erro: 'interno' } },
      {
        corpo: [candidatura('k1', 'f1')],
      },
    ]);
    await abrirApp('/trampos/t1', { fetch });

    const botao = await screen.findByRole('button', {
      name: textos.candidatar.verCandidaturas(null),
    });
    await fireEvent.press(botao);
    await waitFor(() => expect(screen).toHavePathname('/candidaturas/t1'));
    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    expect(botoesAceitar()).toHaveLength(0);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(await screen.findByText('Maria Souza')).toBeOnTheScreen();
    expect(botoesAceitar()).toHaveLength(1);
  });

  it('aceite com 404 (candidatura sumiu) mostra "não encontrado", não recarrega e deixa tentar de novo', async () => {
    const { fetch } = mundoDoAutor();
    fetch.responder('POST /trampos/t1/candidaturas/k2/aceitar', [
      { status: 404, corpo: { erro: 'nao_encontrado' } },
      { corpo: { status: 'aceita' } },
    ]);
    await abrirApp('/candidaturas/t1', { fetch });
    await screen.findByText('João Pereira');

    const aceitarOJoao = async () => {
      await fireEvent.press(botoesAceitar()[1] as never);
      await fireEvent.press(
        await screen.findByRole('button', {
          name: textos.candidaturasRecebidas.confirmar,
        }),
      );
    };
    await aceitarOJoao();
    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    // Os botões voltam e um novo aceite sai.
    expect(botoesAceitar()).toHaveLength(2);
    await aceitarOJoao();
    expect(
      requisicoes(fetch, 'POST', '/trampos/t1/candidaturas/k2/aceitar'),
    ).toHaveLength(2);
    // Sucesso limpa o erro anterior.
    await waitFor(() =>
      expect(screen.queryByText(textos.erros.nao_encontrado)).toBeNull(),
    );
  });

  it('"Voltar" nas recebidas devolve ao detalhe do trampo', async () => {
    const { fetch } = mundoDoAutor();
    await abrirApp('/trampos/t1', { fetch });
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.verCandidaturas(2),
      }),
    );
    await screen.findByText('Maria Souza');
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
  });

  it('"Ver perfil" abre o perfil só com o id na rota; o caminho e a query das recebidas não carregam texto de terceiros', async () => {
    const { fetch } = mundoDoAutor('Mensagem secreta da Maria');
    await abrirApp('/candidaturas/t1', { fetch });
    await screen.findByText('Maria Souza');

    expect(screen).toHavePathname('/candidaturas/t1');
    expect(screen).toHaveSearchParams({ trampoId: 't1' });

    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.verPerfil('Maria Souza'),
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfis/f1'));
    expect(screen).toHaveSearchParams({ contaId: 'f1', trampoId: 't1' });
  });

  it('mensagem com marcação aparece como texto literal', async () => {
    const { fetch } = mundoDoAutor('<script>alert(1)</script> **negrito**');
    await abrirApp('/candidaturas/t1', { fetch });
    expect(
      await screen.findByText('<script>alert(1)</script> **negrito**'),
    ).toBeOnTheScreen();
  });

  it('o 409 trampo_nao_aberto na folha de quem já perdeu a vaga mostra o texto da spec', async () => {
    const fetch = criarFake()
      .responder('GET /trampos/t1', {
        corpo: { ...TRAMPO, status: 'aberto' },
      })
      .responder('POST /trampos/t1/candidaturas', {
        status: 409,
        corpo: { erro: 'trampo_nao_aberto' },
      });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('Posso fazer.', '150');
    await fireEvent.press(botaoEnviar());
    expect(
      await screen.findByText(textos.erros.trampo_nao_aberto),
    ).toBeOnTheScreen();
  });
});

describe('minhas candidaturas e meus anúncios', () => {
  it('trampo que falha com 500 também vira "Trampo indisponível" e as outras linhas seguem', async () => {
    const fetch = criarFake()
      .responder('GET /candidaturas/minhas', {
        corpo: [
          { ...candidatura('m1', 'eu'), trampoId: 't1' },
          { ...candidatura('m2', 'eu'), trampoId: 't2' },
        ],
      })
      .responder('GET /trampos/t2', { status: 500, corpo: { erro: 'x' } });
    await abrirApp('/candidaturas', { fetch });
    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(
      await screen.findByText(textos.minhasCandidaturas.trampoIndisponivel),
    ).toBeOnTheScreen();
  });

  it('"Voltar" de Minhas candidaturas e de Meus anúncios devolve à tela anterior', async () => {
    const fetch = criarFake();
    await abrirApp('/', { fetch });
    await screen.findByText(textos.inicio.trampos);
    await irPara('/meus-anuncios');
    await screen.findByText(textos.meusAnuncios.vazioTrampos);
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen).toHavePathname('/'));

    await irPara('/candidaturas');
    await screen.findByText(textos.minhasCandidaturas.vazio);
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('`tipo` repetido (?tipo=servico&tipo=trampo) cai em Meus trampos', async () => {
    const fetch = criarFake();
    await abrirApp('/meus-anuncios?tipo=servico&tipo=trampo', { fetch });
    expect(
      await screen.findByText(textos.meusAnuncios.vazioTrampos),
    ).toBeOnTheScreen();
    expect(requisicoes(fetch, 'GET', '/servicos/meus')).toEqual([]);
  });
});

describe('sem conexão (CA14)', () => {
  afterEach(async () => {
    await act(async () => onlineManager.setOnline(true));
  });

  it('folha: "Enviar candidatura" desabilitado com o motivo e nenhum POST sai', async () => {
    const fetch = criarFake();
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('Posso fazer.', '150');
    await act(async () => onlineManager.setOnline(false));

    expect(
      await screen.findAllByText(textos.candidatar.semConexaoMotivo),
    ).not.toHaveLength(0);
    expect(botaoEnviar()).toBeDisabled();
    await fireEvent.press(botaoEnviar());
    await avancar();
    expect(requisicoes(fetch, 'POST', '/trampos/t1/candidaturas')).toEqual([]);
    expect(screen.getByLabelText(textos.candidatar.mensagem).props.value).toBe(
      'Posso fazer.',
    );
  });

  it('recebidas: os "Aceitar" ficam desabilitados com o motivo e nenhum aceite sai', async () => {
    const { fetch } = mundoDoAutor();
    await abrirApp('/candidaturas/t1', { fetch });
    await screen.findByText('Maria Souza');
    await act(async () => onlineManager.setOnline(false));

    // O motivo aparece embaixo de cada "Aceitar" (Maria e João).
    expect(
      await screen.findAllByText(textos.candidaturasRecebidas.semConexaoMotivo),
    ).toHaveLength(2);
    expect(botoesAceitar()).toHaveLength(2);
    for (const botao of botoesAceitar()) {
      expect(botao).toBeDisabled();
      await fireEvent.press(botao);
    }
    await avancar();
    expect(fetch.requisicoes.filter((r) => r.metodo === 'POST')).toEqual([]);
  });

  it('queda de rede no envio da candidatura mostra "sem conexão" e o rascunho fica', async () => {
    const fetch = criarFake().responder('POST /trampos/t1/candidaturas', {
      falhaDeRede: true,
    });
    await abrirApp('/trampos/t1', { fetch });
    await abrirFolha();
    await preencherFolha('Posso fazer.', '150');
    await fireEvent.press(botaoEnviar());

    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    expect(screen.getByLabelText(textos.candidatar.mensagem).props.value).toBe(
      'Posso fazer.',
    );
    expect(screen.getByLabelText(textos.candidatar.valor).props.value).toBe(
      '150',
    );
  });
});

describe('segurança (CA14, CA15)', () => {
  it.each([
    '/publicar',
    '/trampos/novo',
    '/servicos/novo',
    '/candidaturas',
    '/candidaturas/t1',
    '/meus-anuncios',
    '/meus-anuncios?tipo=servico',
  ])(
    '%s sem sessão vai para o acesso público e não chama a API autenticada',
    async (url) => {
      const fetch = criarFake();
      await abrirApp(url, { fetch, token: null });

      await waitFor(() => expect(screen).toHavePathname('/entrada'));
      const autenticadas = fetch.requisicoes.filter(
        (r) => r.cabecalhos.authorization !== undefined,
      );
      expect(autenticadas).toEqual([]);
      const dados = fetch.requisicoes.filter((r) =>
        /^\/(trampos|servicos|candidaturas|perfis)/.test(r.caminho),
      );
      expect(dados).toEqual([]);
    },
  );

  it('401 ao carregar as candidaturas recebidas leva ao login com o aviso', async () => {
    const { fetch } = mundoDoAutor();
    fetch.responder('GET /trampos/t1/candidaturas', {
      status: 401,
      corpo: { erro: 'sessao_invalida' },
    });
    const { armazenamento } = await abrirApp('/candidaturas/t1', { fetch });

    await waitFor(() => expect(screen).toHavePathname('/entrar'));
    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    expect(armazenamento.atual()).toBeNull();
  });

  it('sair apaga do cache as candidaturas recebidas, os nomes e as mensagens de terceiros', async () => {
    const { fetch } = mundoDoAutor('Mensagem secreta da Maria');
    fetch.responder('DELETE /sessoes', { status: 204 });
    const { queryClient, armazenamento } = await abrirApp('/candidaturas/t1', {
      fetch,
    });
    await screen.findByText('Maria Souza');
    await screen.findByText('Mensagem secreta da Maria');
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.abas.perfil }),
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.sair }),
    );
    await confirmarSaida();

    await waitFor(() => expect(armazenamento.atual()).toBeNull());
    await waitFor(() =>
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0),
    );
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(screen.queryByText('Maria Souza')).toBeNull();
    expect(screen.queryByText('Mensagem secreta da Maria')).toBeNull();
  });

  it('sair com um aceite no ar não deixa nada da conta anterior voltar ao cache', async () => {
    const { fetch, estado } = mundoDoAutor('Mensagem secreta da Maria');
    fetch.responder('DELETE /sessoes', { status: 204 });
    fetch.responder('POST /trampos/t1/candidaturas/k2/aceitar', () => {
      estado.vencedora = 'k2';
      return { corpo: { status: 'aceita' }, demoraMs: 5000 };
    });
    const { queryClient, armazenamento } = await abrirApp('/candidaturas/t1', {
      fetch,
    });
    await screen.findByText('João Pereira');
    await fireEvent.press(botoesAceitar()[1] as never);
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.candidaturasRecebidas.confirmar,
      }),
    );
    await avancar(100);
    expect(
      requisicoes(fetch, 'POST', '/trampos/t1/candidaturas/k2/aceitar'),
    ).toHaveLength(1);

    // A pessoa sai da conta enquanto o aceite ainda está no ar.
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.abas.perfil }),
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.sair }),
    );
    await confirmarSaida();
    await waitFor(() => expect(armazenamento.atual()).toBeNull());
    await avancar(8000);

    const cache = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data ?? null),
    );
    expect(cache).not.toContain('Mensagem secreta da Maria');
    expect(cache).not.toContain('Maria Souza');
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
