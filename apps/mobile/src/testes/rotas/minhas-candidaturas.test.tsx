import { onlineManager } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import LayoutDaArea from '../../app/(app)/_layout';
import RotaDeMeusTrampos from '../../app/(app)/(abas)/meus-trampos';
import RotaDasMinhasCandidaturas from '../../app/(app)/candidaturas/index';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso } from '../fetch-falso';
import { renderizarRotas, TOKEN_DE_TESTE } from './apoio';

function Inicio() {
  return <Text>Tela de início</Text>;
}

function BuscarTrampos() {
  return <Text>Tela de busca de trampos</Text>;
}

function DetalheDoTrampo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`Detalhe do trampo ${id}`}</Text>;
}

function Conversa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`Conversa ${id}`}</Text>;
}

const ROTAS = {
  '(app)/_layout': LayoutDaArea,
  '(app)/index': Inicio,
  '(app)/buscar-trampos': BuscarTrampos,
  '(app)/trampos/[id]': DetalheDoTrampo,
  '(app)/conversas/[id]': Conversa,
  '(app)/(abas)/meus-trampos': RotaDeMeusTrampos,
  '(app)/candidaturas/index': RotaDasMinhasCandidaturas,
};

/** Meio-dia UTC: a data local é a mesma em qualquer fuso do Brasil. */
const CANDIDATURAS = [
  {
    id: 'k1',
    trampoId: 't1',
    freelancerId: 'c9',
    mensagem: 'Posso fazer.',
    valorPropostoCentavos: 150000,
    status: 'pendente',
    criadaEm: '2026-10-18T12:00:00.000Z',
  },
  {
    id: 'k2',
    trampoId: 't2',
    freelancerId: 'c9',
    mensagem: 'Tenho equipe.',
    valorPropostoCentavos: 8000,
    status: 'aceita',
    criadaEm: '2026-10-19T12:00:00.000Z',
  },
  {
    id: 'k3',
    trampoId: 't3',
    freelancerId: 'c9',
    mensagem: 'Faço rápido.',
    valorPropostoCentavos: 25050,
    status: 'recusada',
    criadaEm: '2026-10-17T12:00:00.000Z',
  },
];

function trampo(
  id: string,
  titulo: string,
  extra: { status?: string; prazo?: string | null } = {},
) {
  return {
    id,
    autorId: 'c1',
    titulo,
    descricao: 'Descrição.',
    categoria: 'pintura',
    cidade: 'Lavras',
    valorCentavos: 100000,
    prazo: null,
    status: 'aberto',
    criadoEm: '2026-10-01T12:00:00.000Z',
    ...extra,
  };
}

const AUTOR = {
  contaId: 'c1',
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
};

function criarFake() {
  return criarFetchFalso()
    .responder('GET /candidaturas/minhas', { corpo: CANDIDATURAS })
    .responder('GET /trampos/t1', { corpo: trampo('t1', 'Pintar a sala') })
    .responder('GET /trampos/t2', {
      corpo: trampo('t2', 'Limpar o quintal', { status: 'em_andamento' }),
    })
    .responder('GET /trampos/t3', { corpo: trampo('t3', 'Montar estante') })
    .responder('GET /perfis/c1', { corpo: AUTOR });
}

async function abrir(fetch = criarFake(), url = '/meus-trampos') {
  return renderizarRotas(ROTAS, {
    initialUrl: url,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
    fetch,
  });
}

/** O segmento pelo rótulo; Confirmados fala também o contador ("Confirmados, 1"). */
async function abrirSegmento(rotulo: string) {
  await fireEvent.press(
    screen.getByRole('tab', { name: new RegExp(`^${rotulo}(, \\d+)?$`) }),
  );
}

describe('Meus trampos (aba do freela)', () => {
  it('cada candidatura no seu segmento, com título do trampo, selo e valor (CA8, CA10, CA78)', async () => {
    await abrir();

    // Em análise (padrão): a pendente (CA8).
    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.pendente)).toBeOnTheScreen();
    expect(screen.getByText('R$ 1.500,00')).toBeOnTheScreen();
    expect(screen.queryByText('Limpar o quintal')).toBeNull();
    expect(screen.queryByText('Montar estante')).toBeNull();

    // Confirmados: a aceita com o trampo em andamento (CA10).
    await abrirSegmento(textos.meusTrampos.abaConfirmados);
    expect(await screen.findByText('Limpar o quintal')).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
    expect(screen.getByText('R$ 80,00')).toBeOnTheScreen();
    expect(screen.queryByText('Pintar a sala')).toBeNull();

    // Encerrados: a recusada (CA10).
    await abrirSegmento(textos.meusTrampos.abaEncerrados);
    expect(await screen.findByText('Montar estante')).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.recusada)).toBeOnTheScreen();
    expect(screen.getByText('R$ 250,50')).toBeOnTheScreen();
    expect(
      screen.queryByText(textos.minhasCandidaturas.trampoIndisponivel),
    ).toBeNull();
  });

  it('ordena da mais recente para a mais antiga dentro do segmento', async () => {
    const pendentes = CANDIDATURAS.map((c) => ({ ...c, status: 'pendente' }));
    const fetch = criarFake().responder('GET /candidaturas/minhas', {
      corpo: pendentes,
    });
    await abrir(fetch);
    await screen.findByText('Montar estante');

    const botoes = screen.getAllByRole('button', {
      name: new RegExp(textos.minhasCandidaturas.valorProposto),
    });
    const rotulos = botoes.map((b) => b.props.accessibilityLabel as string);
    expect(rotulos).toHaveLength(3);
    expect(rotulos[0]).toContain('Limpar o quintal'); // 19/10
    expect(rotulos[1]).toContain('Pintar a sala'); // 18/10
    expect(rotulos[2]).toContain('Montar estante'); // 17/10
  });

  it('manda o Bearer da sessão nas consultas', async () => {
    const fetch = criarFake();
    await abrir(fetch);
    await screen.findByText('Pintar a sala');

    const minhas = fetch.requisicoes.find(
      (r) => r.caminho === '/candidaturas/minhas',
    );
    expect(minhas?.cabecalhos.authorization).toBe(`Bearer ${TOKEN_DE_TESTE}`);
    const detalhe = fetch.requisicoes.find((r) => r.caminho === '/trampos/t1');
    expect(detalhe?.cabecalhos.authorization).toBe(`Bearer ${TOKEN_DE_TESTE}`);
    await waitFor(() =>
      expect(
        fetch.requisicoes.find((r) => r.caminho === '/perfis/c1')?.cabecalhos
          .authorization,
      ).toBe(`Bearer ${TOKEN_DE_TESTE}`),
    );
  });

  it('trampo 404 vira "Trampo indisponível" e o resto da lista segue', async () => {
    const fetch = criarFake().responder('GET /trampos/t2', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir(fetch);

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    // Sem o trampo, a aceita fica em Confirmados (CA78).
    await abrirSegmento(textos.meusTrampos.abaConfirmados);
    expect(
      await screen.findByText(textos.minhasCandidaturas.trampoIndisponivel),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
    // O 404 de um trampo não vira erro da tela.
    expect(
      screen.queryByRole('button', { name: textos.gerais.tentarDeNovo }),
    ).toBeNull();
    await abrirSegmento(textos.meusTrampos.abaEncerrados);
    expect(await screen.findByText('Montar estante')).toBeOnTheScreen();
  });

  it('sem candidaturas mostra o vazio e "Ver trampos abertos" abre a busca de trampos (CA84)', async () => {
    const fetch = criarFetchFalso().responder('GET /candidaturas/minhas', {
      corpo: [],
    });
    await abrir(fetch);

    expect(
      await screen.findByText(textos.meusTrampos.vazioAnalise),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.meusTrampos.verTrampos }),
    );
    expect(
      await screen.findByText('Tela de busca de trampos'),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/buscar-trampos');
  });

  it('falha do servidor mostra o erro traduzido e "Tentar de novo" recarrega', async () => {
    const fetch = criarFake().responder('GET /candidaturas/minhas', [
      { status: 500, corpo: { erro: 'interno' } },
      { corpo: CANDIDATURAS },
    ]);
    await abrir(fetch);

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(
      fetch.requisicoes.filter((r) => r.caminho === '/candidaturas/minhas')
        .length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('tocar numa candidatura abre o detalhe do trampo dela', async () => {
    await abrir();
    await screen.findByText('Pintar a sala');
    await abrirSegmento(textos.meusTrampos.abaConfirmados);

    await fireEvent.press(await screen.findByText('Limpar o quintal'));

    await waitFor(() => expect(screen).toHavePathname('/trampos/t2'));
    expect(await screen.findByText('Detalhe do trampo t2')).toBeOnTheScreen();
  });

  it('é aba: título "Meus trampos" e sem "Voltar"; `/candidaturas` leva até ela (CA77)', async () => {
    await abrir(criarFake(), '/candidaturas');

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(screen).toHavePathname('/meus-trampos');
    expect(screen.getByText(textos.meusTrampos.titulo)).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.gerais.voltar }),
    ).toBeNull();
  });

  it('401 volta ao login com o aviso de sessão expirada', async () => {
    const fetch = criarFake().responder('GET /candidaturas/minhas', {
      status: 401,
      corpo: { erro: 'sessao_expirada' },
    });
    const { armazenamento } = await abrir(fetch);

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/entrar');
    expect(armazenamento.atual()).toBeNull();
  });

  describe('sem conexão', () => {
    afterEach(async () => {
      await act(async () => onlineManager.setOnline(true));
    });

    it('mostra a faixa de sem conexão', async () => {
      onlineManager.setOnline(false);
      await abrir();

      expect(
        await screen.findByText(textos.gerais.semConexaoFaixa),
      ).toBeOnTheScreen();
      // Consulta pausada: não vira "vazio" por engano.
      expect(screen.queryByText(textos.meusTrampos.vazioAnalise)).toBeNull();
    });
  });
});

describe('Meus trampos: segmentos, autor e mensagem (CA78)', () => {
  const ACEITAS = [
    {
      id: 'a1',
      trampoId: 'ta',
      freelancerId: 'c9',
      mensagem: 'Posso.',
      valorPropostoCentavos: 10000,
      status: 'aceita',
      criadaEm: '2026-10-18T12:00:00.000Z',
    },
    {
      id: 'a2',
      trampoId: 'tb',
      freelancerId: 'c9',
      mensagem: 'Posso.',
      valorPropostoCentavos: 20000,
      status: 'aceita',
      criadaEm: '2026-10-17T12:00:00.000Z',
    },
  ];

  function fakeDasAceitas() {
    return criarFetchFalso()
      .responder('GET /candidaturas/minhas', { corpo: ACEITAS })
      .responder('GET /trampos/ta', {
        corpo: trampo('ta', 'Pintar o muro', {
          status: 'em_andamento',
          prazo: '2026-12-31',
        }),
      })
      .responder('GET /trampos/tb', {
        corpo: trampo('tb', 'Lavar o carro', { status: 'encerrado' }),
      })
      .responder('GET /perfis/c1', { corpo: AUTOR });
  }

  it('aceita com trampo em andamento vai a Confirmados e com trampo encerrado a Encerrados, com autor e prazo', async () => {
    const fetch = fakeDasAceitas();
    await abrir(fetch);

    expect(
      await screen.findByText(textos.meusTrampos.vazioAnalise),
    ).toBeOnTheScreen();
    await abrirSegmento(textos.meusTrampos.abaConfirmados);
    expect(await screen.findByText('Pintar o muro')).toBeOnTheScreen();
    expect(
      await screen.findByText(textos.meusTrampos.publicadoPor('Ana Lima')),
    ).toBeOnTheScreen();
    expect(screen.getByText('31/12/2026')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText('Lavar o carro')).toBeNull());

    await abrirSegmento(textos.meusTrampos.abaEncerrados);
    expect(await screen.findByText('Lavar o carro')).toBeOnTheScreen();
    expect(screen.queryByText('Pintar o muro')).toBeNull();
    // Uma consulta por autor, mesmo com dois trampos dele (cache).
    expect(
      fetch.requisicoes.filter((r) => r.caminho === '/perfis/c1'),
    ).toHaveLength(1);
  });

  it('"Mensagem" na aceita abre a conversa com o autor do trampo', async () => {
    const fetch = fakeDasAceitas().responder('POST /conversas', {
      status: 201,
      corpo: { conversaId: 'conv-1' },
    });
    await abrir(fetch);
    await screen.findByText(textos.meusTrampos.vazioAnalise);
    await abrirSegmento(textos.meusTrampos.abaConfirmados);

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.meusTrampos.mensagemPara('Ana Lima'),
      }),
    );

    await waitFor(() => expect(screen).toHavePathname('/conversas/conv-1'));
    const posts = fetch.requisicoes.filter(
      (r) => r.metodo === 'POST' && r.caminho === '/conversas',
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]?.corpo).toEqual({ outroUsuarioId: 'c1' });
  });
});
