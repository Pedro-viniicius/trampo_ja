import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import RotaDoMeuPerfil from '../../app/(app)/(abas)/perfil';
import RotaDeEditarPerfil from '../../app/(app)/perfil/editar';
import RotaDoPerfilPublico from '../../app/(app)/perfis/[contaId]';
import RotaDoServico from '../../app/(app)/servicos/[id]';
import RotaDoTrampo from '../../app/(app)/trampos/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { useSessao } from '../../estado/sessao';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso } from '../fetch-falso';
import { renderRouter } from '../render-router';
import { criarProvedores } from '../renderizar';

const TOKEN = 'token-teste';

const CATEGORIAS = [
  { id: 'pintura', rotulo: 'Pintura e reparos' },
  { id: 'limpeza', rotulo: 'Limpeza' },
];

const TRAMPO = {
  id: 't1',
  autorId: 'c1',
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'pintura',
  cidade: 'Lavras',
  valorCentavos: 150000,
  prazo: '2026-11-15',
  status: 'aberto',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

const SERVICO = {
  id: 's1',
  autorId: 'c1',
  titulo: 'Faço limpeza pós-obra',
  descricao: 'Equipe própria.',
  categoria: 'limpeza',
  cidade: null,
  precoBaseCentavos: 8000,
  status: 'ativo',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

const AUTOR = {
  contaId: 'c1',
  nome: 'Carla Souza',
  cidade: 'Lavras',
  descricao: 'Pinto e reformo.',
  habilidades: ['pintura', 'reparos'],
};

const MEU_PERFIL = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura', 'pedreiro'],
  completo: true,
};

function Inicio() {
  return <Text>Tela de início</Text>;
}

function SondaDeSessao() {
  const { status } = useSessao();
  return <Text testID="status-da-sessao">{status}</Text>;
}

/** Mapa de rotas com os contêineres reais e o Início como tela de chegada. */
const ROTAS = {
  index: Inicio,
  'trampos/[id]': RotaDoTrampo,
  'servicos/[id]': RotaDoServico,
  'perfis/[contaId]': RotaDoPerfilPublico,
  perfil: RotaDoMeuPerfil,
  'perfil/editar': RotaDeEditarPerfil,
};

function criarFake() {
  return criarFetchFalso().responder('GET /categorias', { corpo: CATEGORIAS });
}

async function abrir(url: string, fetch = criarFake()) {
  const armazenamento = criarArmazenamentoEmMemoria(TOKEN);
  const provedores = criarProvedores({ armazenamento, fetch });
  await renderRouter(ROTAS, {
    initialUrl: url,
    wrapper: ({ children }) => (
      <provedores.wrapper>
        <SondaDeSessao />
        {children}
      </provedores.wrapper>
    ),
  });
  return { ...provedores, armazenamento };
}

describe('detalhe do trampo', () => {
  it('mostra valor, prazo, categoria pelo rótulo e o cartão do autor', async () => {
    const fetch = criarFake()
      .responder('GET /trampos/t1', { corpo: TRAMPO })
      .responder('GET /perfis/c1', { corpo: AUTOR });
    await abrir('/trampos/t1', fetch);

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(screen.getByText('R$ 1.500,00')).toBeOnTheScreen();
    expect(screen.getByText('15/11/2026')).toBeOnTheScreen();
    expect(await screen.findByText('Pintura e reparos')).toBeOnTheScreen();
    expect(await screen.findByText('Carla Souza')).toBeOnTheScreen();
    // O rodapé da 2a fica vazio: nada de candidatar-se.
    expect(screen.queryByText(textos.detalheTrampo.candidatar)).toBeNull();

    await fireEvent.press(screen.getByText('Carla Souza'));
    await waitFor(() => expect(screen).toHavePathname('/perfis/c1'));
    expect(await screen.findByText('Pinto e reformo.')).toBeOnTheScreen();
  });

  it('autor inexistente (404) não derruba o detalhe', async () => {
    const fetch = criarFake()
      .responder('GET /trampos/t1', { corpo: TRAMPO })
      .responder('GET /perfis/c1', {
        status: 404,
        corpo: { erro: 'nao_encontrado' },
      });
    const { queryClient } = await abrir('/trampos/t1', fetch);

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    // Espera a consulta do autor terminar (em erro) antes de olhar a tela.
    await waitFor(() =>
      expect(queryClient.getQueryState(['perfil', 'c1'])?.status).toBe('error'),
    );
    // O `renderRouter` liga os timers falsos; o TanStack avisa os componentes
    // num `setTimeout(0)`.
    await act(async () => {
      jest.advanceTimersByTime(20);
    });
    expect(screen.queryByText(textos.erros.nao_encontrado)).toBeNull();
    expect(screen.queryByText(textos.detalheTrampo.publicadoPor)).toBeNull();
    // 404 do autor é "vazio", não erro: nada de "Tentar de novo".
    expect(
      screen.queryByRole('button', { name: textos.gerais.tentarDeNovo }),
    ).toBeNull();
    expect(screen.getByText('R$ 1.500,00')).toBeOnTheScreen();
  });

  it('trampo inexistente (404) mostra "nao_encontrado" e volta', async () => {
    const fetch = criarFake().responder('GET /trampos/x', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir('/trampos/x', fetch);

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    // 404 é "não encontrado" com "Voltar", não erro com "Tentar de novo".
    expect(
      screen.queryByRole('button', { name: textos.gerais.tentarDeNovo }),
    ).toBeNull();
    // Sem autor: nenhuma busca de perfil.
    expect(fetch.requisicoes.some((r) => r.caminho === '/perfis/c1')).toBe(
      false,
    );
    const voltar = screen.getAllByRole('button', { name: 'Voltar' });
    await fireEvent.press(voltar[voltar.length - 1] as (typeof voltar)[number]);
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(await screen.findByText('Tela de início')).toBeOnTheScreen();
  });

  it('falha do servidor mostra erro traduzido e tenta de novo', async () => {
    const fetch = criarFake().responder('GET /trampos/t1', [
      { status: 500, corpo: { erro: 'interno' } },
      { corpo: TRAMPO },
    ]);
    await abrir('/trampos/t1', fetch);

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
  });
});

describe('detalhe do serviço', () => {
  it('serviço sem cidade não mostra a linha de cidade', async () => {
    const fetch = criarFake()
      .responder('GET /servicos/s1', { corpo: SERVICO })
      .responder('GET /perfis/c1', { corpo: AUTOR });
    await abrir('/servicos/s1', fetch);

    expect(await screen.findByText('Faço limpeza pós-obra')).toBeOnTheScreen();
    expect(screen.getByText('R$ 80,00')).toBeOnTheScreen();
    expect(await screen.findByText('Limpeza')).toBeOnTheScreen();
    expect(await screen.findByText('Carla Souza')).toBeOnTheScreen();
    expect(screen.queryByText(textos.buscar.cidade)).toBeNull();
  });

  it('serviço inexistente (404) mostra "nao_encontrado"', async () => {
    await abrir('/servicos/x');
    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
  });
});

describe('perfil de outra pessoa', () => {
  it('mostra os dados públicos sem editar, sair nem e-mail', async () => {
    const fetch = criarFake().responder('GET /perfis/c1', { corpo: AUTOR });
    await abrir('/perfis/c1', fetch);

    expect(await screen.findByText('Carla Souza')).toBeOnTheScreen();
    expect(screen.getByText('Pinto e reformo.')).toBeOnTheScreen();
    expect(screen.getByText('reparos')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.perfil.editar }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.perfil.sair }),
    ).toBeNull();
    expect(JSON.stringify(screen.toJSON())).not.toContain('@');
  });

  it('perfil inexistente (404) mostra "nao_encontrado"', async () => {
    await abrir('/perfis/zzz');
    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
  });
});

describe('meu perfil', () => {
  it('mostra os dados de GET /perfis/eu sem aviso quando está completo', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', {
      corpo: MEU_PERFIL,
    });
    await abrir('/perfil', fetch);

    expect(await screen.findByText('Ana Lima')).toBeOnTheScreen();
    expect(screen.getByText('pedreiro')).toBeOnTheScreen();
    expect(screen.queryByText(/Falta:/)).toBeNull();
    expect(
      screen.getByRole('button', { name: textos.perfil.editar }),
    ).toBeOnTheScreen();
  });

  it('404 mostra o aviso de perfil incompleto e leva a editar', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir('/perfil', fetch);

    expect(
      await screen.findByText(/Falta: nome, cidade e habilidades/),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.completar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfil/editar'));
  });

  it('sair confirma, chama DELETE /sessoes com Bearer e deixa a sessão anônima', async () => {
    const fetch = criarFake()
      .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
      .responder('DELETE /sessoes', { status: 204 });
    const { armazenamento } = await abrir('/perfil', fetch);

    await screen.findByText('Ana Lima');
    await waitFor(() =>
      expect(screen.getByTestId('status-da-sessao')).toHaveTextContent(
        'autenticado',
      ),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.sair }),
    );
    // Só o diálogo foi aberto: nada de requisição ainda.
    expect(screen.getByText(textos.perfil.sairTitulo)).toBeOnTheScreen();
    expect(fetch.requisicoes.some((r) => r.metodo === 'DELETE')).toBe(false);

    const botoes = screen.getAllByRole('button', {
      name: textos.perfil.sairConfirmar,
    });
    await fireEvent.press(botoes[botoes.length - 1] as (typeof botoes)[number]);

    await waitFor(() =>
      expect(screen.getByTestId('status-da-sessao')).toHaveTextContent(
        'anonimo',
      ),
    );
    const saida = fetch.requisicoes.find((r) => r.metodo === 'DELETE');
    expect(saida?.caminho).toBe('/sessoes');
    expect(saida?.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(armazenamento.atual()).toBeNull();
  });
});

describe('meu perfil sem conexão', () => {
  afterEach(async () => {
    await act(async () => onlineManager.setOnline(true));
  });

  it('offline sem perfil carregado não mostra o aviso de perfil incompleto (R1)', async () => {
    onlineManager.setOnline(false);
    const fetch = criarFake().responder('GET /perfis/eu', { status: 404 });
    await abrir('/perfil', fetch);

    expect(
      await screen.findByText(textos.gerais.semConexaoFaixa),
    ).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(50);
    });

    // A consulta fica pausada: nada foi pedido e nada diz "Falta: ...".
    expect(fetch.requisicoes.some((r) => r.caminho === '/perfis/eu')).toBe(
      false,
    );
    expect(screen.queryByText(/Falta:/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.perfil.completar }),
    ).toBeNull();
  });

  it('offline: confirmar sair deixa a sessão anônima e apaga o token (R2)', async () => {
    const fetch = criarFake()
      .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
      .responder('DELETE /sessoes', { falhaDeRede: true });
    const { armazenamento } = await abrir('/perfil', fetch);
    await screen.findByText('Ana Lima');
    await waitFor(() =>
      expect(screen.getByTestId('status-da-sessao')).toHaveTextContent(
        'autenticado',
      ),
    );

    await act(async () => onlineManager.setOnline(false));
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.sair }),
    );
    const botoes = screen.getAllByRole('button', {
      name: textos.perfil.sairConfirmar,
    });
    await fireEvent.press(botoes[botoes.length - 1] as (typeof botoes)[number]);

    await waitFor(() =>
      expect(screen.getByTestId('status-da-sessao')).toHaveTextContent(
        'anonimo',
      ),
    );
    expect(armazenamento.atual()).toBeNull();
  });
});

describe('editar perfil (CA3)', () => {
  const pressionarSalvar = () =>
    fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.salvar }),
    );

  it('erro local (nome vazio) aparece no campo e nada é enviado', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', {
      corpo: MEU_PERFIL,
    });
    await abrir('/perfil/editar', fetch);

    const nome = await screen.findByDisplayValue('Ana Lima');
    await fireEvent.changeText(nome, '   ');
    await pressionarSalvar();

    expect(
      await screen.findByText(textos.erros.nome_obrigatorio),
    ).toBeOnTheScreen();
    expect(fetch.requisicoes.some((r) => r.metodo === 'PUT')).toBe(false);
  });

  it('erro 400 da API por campo (habilidades.1) aparece no campo de habilidade', async () => {
    const fetch = criarFake()
      .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
      .responder('PUT /perfis/eu', {
        status: 400,
        corpo: {
          erro: 'dados_invalidos',
          campos: [{ campo: 'habilidades.1', motivo: 'invalido' }],
        },
      });
    await abrir('/perfil/editar', fetch);

    await screen.findByDisplayValue('Ana Lima');
    await pressionarSalvar();

    expect(
      await screen.findByText(textos.erros.habilidade_invalida),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.editarPerfil.sucesso)).toBeNull();
  });

  it('erro de rede mostra o aviso geral', async () => {
    const fetch = criarFake()
      .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
      .responder('PUT /perfis/eu', { falhaDeRede: true });
    await abrir('/perfil/editar', fetch);

    await screen.findByDisplayValue('Ana Lima');
    await pressionarSalvar();

    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
  });

  it('salvar envia o perfil, mostra o toast e volta ao perfil atualizado', async () => {
    const salvo = { ...MEU_PERFIL, nome: 'Ana Souza Lima' };
    const fetch = criarFake()
      .responder('GET /perfis/eu', [{ corpo: MEU_PERFIL }, { corpo: salvo }])
      .responder('PUT /perfis/eu', { corpo: salvo });
    await abrir('/perfil', fetch);

    await screen.findByText('Ana Lima');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.editar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfil/editar'));

    await fireEvent.changeText(
      await screen.findByDisplayValue('Ana Lima'),
      '  Ana Souza Lima ',
    );
    await pressionarSalvar();

    expect(
      await screen.findByText(textos.editarPerfil.sucesso),
    ).toBeOnTheScreen();
    const envio = fetch.requisicoes.find((r) => r.metodo === 'PUT');
    expect(envio?.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(envio?.corpo).toEqual({
      nome: 'Ana Souza Lima',
      cidade: 'Lavras',
      habilidades: ['pintura', 'pedreiro'],
    });

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.fechar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfil'));
    expect(await screen.findByText('Ana Souza Lima')).toBeOnTheScreen();
  });

  it('habilidade repetida é recusada; nova entra na lista', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', {
      corpo: MEU_PERFIL,
    });
    await abrir('/perfil/editar', fetch);

    await screen.findByDisplayValue('Ana Lima');
    const campo = screen.getByLabelText(
      textos.editarPerfil.adicionarHabilidade,
    );
    await fireEvent.changeText(campo, '  PINTURA ');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.adicionar }),
    );
    expect(
      await screen.findByText(textos.erros.habilidade_invalida),
    ).toBeOnTheScreen();

    await fireEvent.changeText(campo, 'Eletricista');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.adicionar }),
    );
    expect(await screen.findByText('Eletricista')).toBeOnTheScreen();
    expect(screen.queryByText('eletricista')).toBeNull();
    expect(screen.queryByText(textos.erros.habilidade_invalida)).toBeNull();
  });

  it('adicionar com o campo vazio pede ao menos uma habilidade e não muda a lista', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', {
      corpo: MEU_PERFIL,
    });
    await abrir('/perfil/editar', fetch);
    await screen.findByDisplayValue('Ana Lima');

    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.adicionarHabilidade),
      '   ',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.adicionar }),
    );

    expect(
      await screen.findByText(textos.erros.habilidade_obrigatoria),
    ).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/^Remover /)).toHaveLength(2);
  });

  it('espaços repetidos são colapsados e a caixa fica como foi digitada', async () => {
    const fetch = criarFake()
      .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
      .responder('PUT /perfis/eu', (r) => ({
        corpo: { ...(r.corpo as object), completo: true },
      }));
    await abrir('/perfil/editar', fetch);
    await screen.findByDisplayValue('Ana Lima');

    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.adicionarHabilidade),
      '  Instalação   Elétrica ',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.adicionar }),
    );
    await pressionarSalvar();

    expect(
      await screen.findByText(textos.editarPerfil.sucesso),
    ).toBeOnTheScreen();
    expect(
      fetch.requisicoes.find((r) => r.metodo === 'PUT')?.corpo,
    ).toMatchObject({
      habilidades: ['pintura', 'pedreiro', 'Instalação Elétrica'],
    });
  });

  it('modo completar: "Agora não" leva ao Início', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir('/perfil/editar?completar=1', fetch);

    expect(
      await screen.findByText(textos.editarPerfil.tituloCompletar),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.agoraNao }),
    );
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(await screen.findByText('Tela de início')).toBeOnTheScreen();
    expect(fetch.requisicoes.some((r) => r.metodo === 'PUT')).toBe(false);
  });

  it('modo completar: salvar, fechar o toast e chegar ao Início', async () => {
    const salvo = { ...MEU_PERFIL, descricao: 'Pinto casas.' };
    const fetch = criarFake()
      .responder('GET /perfis/eu', {
        status: 404,
        corpo: { erro: 'nao_encontrado' },
      })
      .responder('PUT /perfis/eu', { corpo: salvo });
    await abrir('/perfil/editar?completar=1', fetch);

    await fireEvent.changeText(
      await screen.findByLabelText(textos.editarPerfil.nome),
      'Ana Lima',
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.cidade),
      'Lavras',
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.descricao),
      'Pinto casas.',
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.adicionarHabilidade),
      'Pintura',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.adicionar }),
    );
    await pressionarSalvar();

    expect(
      await screen.findByText(textos.editarPerfil.sucesso),
    ).toBeOnTheScreen();
    expect(fetch.requisicoes.find((r) => r.metodo === 'PUT')?.corpo).toEqual({
      nome: 'Ana Lima',
      cidade: 'Lavras',
      descricao: 'Pinto casas.',
      // Como a pessoa digitou: a API guarda assim e só compara normalizado.
      habilidades: ['Pintura'],
    });
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.fechar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/'));
  });
});
