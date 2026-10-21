import { onlineManager } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import LayoutDaArea from '../../app/(app)/_layout';
import InicioRota from '../../app/(app)/(abas)/index';
import RotaDoMeuPerfil from '../../app/(app)/(abas)/perfil';
import RotaDosMeusAnuncios from '../../app/(app)/meus-anuncios';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { renderizarRotas, TOKEN_DE_TESTE } from './apoio';

function stub(nome: string) {
  return function Stub() {
    return <Text>{nome}</Text>;
  };
}

function DetalheDoTrampo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`Detalhe do trampo ${id}`}</Text>;
}

function DetalheDoServico() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`Detalhe do serviço ${id}`}</Text>;
}

const ROTAS = {
  '(app)/_layout': LayoutDaArea,
  '(app)/(abas)/index': InicioRota,
  '(app)/(abas)/perfil': RotaDoMeuPerfil,
  '(app)/(abas)/buscar': stub('Tela de busca'),
  '(app)/meus-anuncios': RotaDosMeusAnuncios,
  '(app)/trampos/novo': stub('Formulário de trampo'),
  '(app)/servicos/novo': stub('Formulário de serviço'),
  '(app)/candidaturas/index': stub('Tela de candidaturas'),
  '(app)/perfil/editar': stub('Tela de editar perfil'),
  '(app)/trampos/[id]': DetalheDoTrampo,
  '(app)/servicos/[id]': DetalheDoServico,
};

const CATEGORIAS = [
  { id: 'reformas', rotulo: 'Reformas e reparos' },
  { id: 'aulas', rotulo: 'Aulas e reforço' },
];

const MEU_PERFIL = {
  contaId: 'c1',
  nome: 'Maria Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

/** Meio-dia UTC: a data local é a mesma em qualquer fuso do Brasil. */
const MEUS_TRAMPOS = [
  {
    id: 't1',
    autorId: 'c1',
    titulo: 'Pintar a sala',
    descricao: 'Descrição.',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 150000,
    prazo: null,
    status: 'aberto',
    criadoEm: '2026-10-18T12:00:00.000Z',
  },
  {
    id: 't2',
    autorId: 'c1',
    titulo: 'Trocar o telhado',
    descricao: 'Descrição.',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 800000,
    prazo: null,
    status: 'em_andamento',
    criadoEm: '2026-10-20T12:00:00.000Z',
  },
  {
    id: 't3',
    autorId: 'c1',
    titulo: 'Montar estante',
    descricao: 'Descrição.',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 25050,
    prazo: null,
    status: 'aberto',
    criadoEm: '2026-10-19T12:00:00.000Z',
  },
];

const MEUS_SERVICOS = [
  {
    id: 's1',
    autorId: 'c1',
    titulo: 'Aulas de matemática',
    descricao: 'Descrição.',
    categoria: 'aulas',
    cidade: null,
    precoBaseCentavos: 8000,
    status: 'ativo',
    criadoEm: '2026-10-19T12:00:00.000Z',
  },
];

function criarFake() {
  return criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: MEU_PERFIL })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('GET /trampos/meus', { corpo: MEUS_TRAMPOS })
    .responder('GET /servicos/meus', { corpo: MEUS_SERVICOS });
}

async function abrir(url: string, fetch: FetchFalso = criarFake()) {
  return renderizarRotas(ROTAS, {
    initialUrl: url,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
    fetch,
  });
}

function chamadas(fetch: FetchFalso, caminho: string) {
  return fetch.requisicoes.filter((r) => r.caminho === caminho);
}

describe('atalhos do Início (CA16)', () => {
  it('"Publicar trampo" abre o formulário de trampo', async () => {
    await abrir('/');

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.inicio.publicarTrampo }),
    );

    expect(await screen.findByText('Formulário de trampo')).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/novo');
  });

  it('"Ofertar serviço" abre o formulário de serviço', async () => {
    await abrir('/');

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.inicio.ofertarServico }),
    );

    expect(await screen.findByText('Formulário de serviço')).toBeOnTheScreen();
    expect(screen).toHavePathname('/servicos/novo');
  });

  it('"Minhas candidaturas" abre a lista de candidaturas', async () => {
    await abrir('/');

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.inicio.minhasCandidaturas,
      }),
    );

    expect(await screen.findByText('Tela de candidaturas')).toBeOnTheScreen();
    expect(screen).toHavePathname('/candidaturas');
  });

  it('sem perfil (404) o aviso lista os três campos do perfil novo', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', { status: 404 });
    await abrir('/', fetch);

    expect(
      await screen.findByText(/Falta: nome, cidade e habilidades/),
    ).toBeOnTheScreen();
  });
});

describe('atalhos do Perfil (CA16)', () => {
  it('"Minhas candidaturas" abre a lista de candidaturas', async () => {
    await abrir('/perfil');

    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.perfil.minhasCandidaturas,
      }),
    );

    expect(await screen.findByText('Tela de candidaturas')).toBeOnTheScreen();
    expect(screen).toHavePathname('/candidaturas');
  });

  it('"Meus trampos" abre Meus anúncios com tipo=trampo', async () => {
    await abrir('/perfil');

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.meusTrampos }),
    );

    await waitFor(() => expect(screen).toHavePathname('/meus-anuncios'));
    expect(screen).toHaveSearchParams({ tipo: 'trampo' });
    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
  });

  it('"Meus serviços" abre Meus anúncios com tipo=servico', async () => {
    await abrir('/perfil');

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.perfil.meusServicos }),
    );

    await waitFor(() => expect(screen).toHavePathname('/meus-anuncios'));
    expect(screen).toHaveSearchParams({ tipo: 'servico' });
    expect(await screen.findByText('Aulas de matemática')).toBeOnTheScreen();
  });
});

describe('Meus trampos (CA4)', () => {
  it('lista os trampos com status, categoria e valor, do mais recente ao mais antigo', async () => {
    const fetch = criarFake();
    await abrir('/meus-anuncios?tipo=trampo', fetch);

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(
      screen.getByText(textos.meusAnuncios.tituloTrampos),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.emAndamento)).toBeOnTheScreen();
    expect(screen.getAllByText(textos.selos.aberto)).toHaveLength(2);
    expect(screen.getAllByText('Reformas e reparos · Lavras')).toHaveLength(3);
    expect(screen.getByText('R$ 8.000,00')).toBeOnTheScreen();
    expect(screen.getByText('R$ 250,50')).toBeOnTheScreen();

    const botoes = screen.getAllByRole('button', { name: /Trampo/ });
    const rotulos = botoes.map((b) => b.props.accessibilityLabel as string);
    expect(rotulos[0]).toContain('Trocar o telhado'); // 20/10
    expect(rotulos[1]).toContain('Montar estante'); // 19/10
    expect(rotulos[2]).toContain('Pintar a sala'); // 18/10

    // Só a lista de trampos é pedida.
    expect(chamadas(fetch, '/servicos/meus')).toHaveLength(0);
  });

  it('manda o Bearer da sessão', async () => {
    const fetch = criarFake();
    await abrir('/meus-anuncios?tipo=trampo', fetch);
    await screen.findByText('Pintar a sala');

    expect(chamadas(fetch, '/trampos/meus')[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN_DE_TESTE}`,
    );
  });

  it('tocar num trampo abre o detalhe dele', async () => {
    await abrir('/meus-anuncios?tipo=trampo');
    await screen.findByText('Trocar o telhado');

    await fireEvent.press(screen.getByText('Trocar o telhado'));

    await waitFor(() => expect(screen).toHavePathname('/trampos/t2'));
    expect(await screen.findByText('Detalhe do trampo t2')).toBeOnTheScreen();
  });

  it('sem `tipo`, ou com `tipo` inválido, vira Meus trampos', async () => {
    const fetch = criarFake();
    await abrir('/meus-anuncios?tipo=outra-coisa', fetch);

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(
      screen.getByText(textos.meusAnuncios.tituloTrampos),
    ).toBeOnTheScreen();
    expect(chamadas(fetch, '/servicos/meus')).toHaveLength(0);
  });

  it('sem `tipo` na URL também vira Meus trampos', async () => {
    await abrir('/meus-anuncios');

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(
      screen.getByText(textos.meusAnuncios.tituloTrampos),
    ).toBeOnTheScreen();
  });

  it('vazio leva ao formulário de trampo', async () => {
    const fetch = criarFake().responder('GET /trampos/meus', { corpo: [] });
    await abrir('/meus-anuncios?tipo=trampo', fetch);

    expect(
      await screen.findByText(textos.meusAnuncios.vazioTrampos),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.meusAnuncios.publicarTrampo }),
    );

    expect(await screen.findByText('Formulário de trampo')).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/novo');
  });

  it('falha do servidor mostra o erro e "Tentar de novo" recarrega', async () => {
    const fetch = criarFake().responder('GET /trampos/meus', [
      { status: 500, corpo: { erro: 'interno' } },
      { corpo: MEUS_TRAMPOS },
    ]);
    await abrir('/meus-anuncios?tipo=trampo', fetch);

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.gerais.tentarDeNovo }),
    ).toBeNull();
    expect(chamadas(fetch, '/trampos/meus').length).toBeGreaterThanOrEqual(2);
  });

  it('"Voltar" sem histórico leva ao início', async () => {
    await abrir('/meus-anuncios?tipo=trampo');
    await screen.findByText('Pintar a sala');

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );

    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('401 volta ao login com o aviso de sessão expirada', async () => {
    const fetch = criarFake().responder('GET /trampos/meus', {
      status: 401,
      corpo: { erro: 'sessao_expirada' },
    });
    const { armazenamento } = await abrir('/meus-anuncios?tipo=trampo', fetch);

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

    it('mostra a faixa e não confunde a consulta pausada com "vazio"', async () => {
      onlineManager.setOnline(false);
      await abrir('/meus-anuncios?tipo=trampo');

      expect(
        await screen.findByText(textos.gerais.semConexaoFaixa),
      ).toBeOnTheScreen();
      expect(screen.queryByText(textos.meusAnuncios.vazioTrampos)).toBeNull();
    });
  });
});

describe('Meus serviços (CA6)', () => {
  it('lista os serviços com "Ativo", categoria e preço', async () => {
    const fetch = criarFake();
    await abrir('/meus-anuncios?tipo=servico', fetch);

    expect(await screen.findByText('Aulas de matemática')).toBeOnTheScreen();
    expect(
      screen.getByText(textos.meusAnuncios.tituloServicos),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.ativo)).toBeOnTheScreen();
    expect(screen.getByText('Aulas e reforço')).toBeOnTheScreen(); // sem cidade
    expect(screen.getByText('R$ 80,00')).toBeOnTheScreen();
    expect(chamadas(fetch, '/trampos/meus')).toHaveLength(0);
    expect(chamadas(fetch, '/servicos/meus')[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN_DE_TESTE}`,
    );
  });

  it('tocar num serviço abre o detalhe dele', async () => {
    await abrir('/meus-anuncios?tipo=servico');
    await screen.findByText('Aulas de matemática');

    await fireEvent.press(screen.getByText('Aulas de matemática'));

    await waitFor(() => expect(screen).toHavePathname('/servicos/s1'));
    expect(await screen.findByText('Detalhe do serviço s1')).toBeOnTheScreen();
  });

  it('vazio leva ao formulário de serviço', async () => {
    const fetch = criarFake().responder('GET /servicos/meus', { corpo: [] });
    await abrir('/meus-anuncios?tipo=servico', fetch);

    expect(
      await screen.findByText(textos.meusAnuncios.vazioServicos),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.meusAnuncios.ofertarServico }),
    );

    expect(await screen.findByText('Formulário de serviço')).toBeOnTheScreen();
    expect(screen).toHavePathname('/servicos/novo');
  });

  it('falha do servidor mostra o erro e "Tentar de novo" recarrega', async () => {
    const fetch = criarFake().responder('GET /servicos/meus', [
      { status: 500, corpo: { erro: 'interno' } },
      { corpo: MEUS_SERVICOS },
    ]);
    await abrir('/meus-anuncios?tipo=servico', fetch);

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );

    expect(await screen.findByText('Aulas de matemática')).toBeOnTheScreen();
  });

  it('401 volta ao login', async () => {
    const fetch = criarFake().responder('GET /servicos/meus', {
      status: 401,
      corpo: { erro: 'sessao_expirada' },
    });
    const { armazenamento } = await abrir('/meus-anuncios?tipo=servico', fetch);

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/entrar');
    expect(armazenamento.atual()).toBeNull();
  });
});
