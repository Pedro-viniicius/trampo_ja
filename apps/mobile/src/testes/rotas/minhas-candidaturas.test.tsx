import { onlineManager } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import LayoutDaArea from '../../app/(app)/_layout';
import RotaDasMinhasCandidaturas from '../../app/(app)/candidaturas/index';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso } from '../fetch-falso';
import { renderizarRotas, TOKEN_DE_TESTE } from './apoio';

function Inicio() {
  return <Text>Tela de início</Text>;
}

function Buscar() {
  return <Text>Tela de busca</Text>;
}

function DetalheDoTrampo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`Detalhe do trampo ${id}`}</Text>;
}

const ROTAS = {
  '(app)/_layout': LayoutDaArea,
  '(app)/index': Inicio,
  '(app)/buscar': Buscar,
  '(app)/trampos/[id]': DetalheDoTrampo,
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

function trampo(id: string, titulo: string) {
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
  };
}

function criarFake() {
  return criarFetchFalso()
    .responder('GET /candidaturas/minhas', { corpo: CANDIDATURAS })
    .responder('GET /trampos/t1', { corpo: trampo('t1', 'Pintar a sala') })
    .responder('GET /trampos/t2', { corpo: trampo('t2', 'Limpar o quintal') })
    .responder('GET /trampos/t3', { corpo: trampo('t3', 'Montar estante') });
}

async function abrir(fetch = criarFake()) {
  return renderizarRotas(ROTAS, {
    initialUrl: '/candidaturas',
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
    fetch,
  });
}

describe('Minhas candidaturas', () => {
  it('lista as candidaturas com título do trampo, selo, valor e data (CA8, CA10)', async () => {
    await abrir();

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(await screen.findByText('Limpar o quintal')).toBeOnTheScreen();
    expect(await screen.findByText('Montar estante')).toBeOnTheScreen();
    // CA8: a candidatura enviada aparece como pendente; CA10: aceita e recusada.
    expect(screen.getByText(textos.selos.pendente)).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.recusada)).toBeOnTheScreen();
    expect(screen.getByText('R$ 1.500,00')).toBeOnTheScreen();
    expect(screen.getByText('R$ 80,00')).toBeOnTheScreen();
    expect(screen.getByText('R$ 250,50')).toBeOnTheScreen();
    expect(
      screen.getByText(textos.minhasCandidaturas.enviadaEm('18/10/2026')),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.minhasCandidaturas.enviadaEm('19/10/2026')),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.minhasCandidaturas.enviadaEm('17/10/2026')),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText(textos.minhasCandidaturas.trampoIndisponivel),
    ).toBeNull();
  });

  it('ordena da mais recente para a mais antiga', async () => {
    await abrir();
    await screen.findByText('Montar estante');

    const botoes = screen.getAllByRole('button', { name: /Enviada em/ });
    const rotulos = botoes.map((b) => b.props.accessibilityLabel as string);
    expect(rotulos).toHaveLength(3);
    expect(rotulos[0]).toContain('Limpar o quintal'); // 19/10
    expect(rotulos[1]).toContain('Pintar a sala'); // 18/10
    expect(rotulos[2]).toContain('Montar estante'); // 17/10
  });

  it('manda o Bearer da sessão nas duas consultas', async () => {
    const fetch = criarFake();
    await abrir(fetch);
    await screen.findByText('Pintar a sala');

    const minhas = fetch.requisicoes.find(
      (r) => r.caminho === '/candidaturas/minhas',
    );
    expect(minhas?.cabecalhos.authorization).toBe(`Bearer ${TOKEN_DE_TESTE}`);
    const detalhe = fetch.requisicoes.find((r) => r.caminho === '/trampos/t1');
    expect(detalhe?.cabecalhos.authorization).toBe(`Bearer ${TOKEN_DE_TESTE}`);
  });

  it('trampo 404 vira "Trampo indisponível" e o resto da lista segue', async () => {
    const fetch = criarFake().responder('GET /trampos/t2', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir(fetch);

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(await screen.findByText('Montar estante')).toBeOnTheScreen();
    expect(
      await screen.findByText(textos.minhasCandidaturas.trampoIndisponivel),
    ).toBeOnTheScreen();
    // O 404 de um trampo não vira erro da tela.
    expect(
      screen.queryByRole('button', { name: textos.gerais.tentarDeNovo }),
    ).toBeNull();
    expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
  });

  it('sem candidaturas mostra o vazio e "Buscar trampos" abre a busca', async () => {
    const fetch = criarFetchFalso().responder('GET /candidaturas/minhas', {
      corpo: [],
    });
    await abrir(fetch);

    expect(
      await screen.findByText(textos.minhasCandidaturas.vazio),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.minhasCandidaturas.buscarTrampos,
      }),
    );
    expect(await screen.findByText('Tela de busca')).toBeOnTheScreen();
    expect(screen).toHavePathname('/buscar');
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
    await screen.findByText('Limpar o quintal');

    await fireEvent.press(screen.getByText('Limpar o quintal'));

    await waitFor(() => expect(screen).toHavePathname('/trampos/t2'));
    expect(await screen.findByText('Detalhe do trampo t2')).toBeOnTheScreen();
  });

  it('"Voltar" sem histórico leva ao início', async () => {
    await abrir();
    await screen.findByText('Pintar a sala');

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );

    expect(await screen.findByText('Tela de início')).toBeOnTheScreen();
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
      expect(screen.queryByText(textos.minhasCandidaturas.vazio)).toBeNull();
    });
  });
});
