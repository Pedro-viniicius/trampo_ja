// QA da V2a do app (CA71 a CA86, etapas 0 a 8 e 7b): bordas e regressões que
// os testes do dev não cobrem. Rotas reais com o fake de `fetch`; as partes
// puras (vínculo da conversa, separador de dia, textos) sem rota.
import { render } from '@testing-library/react-native';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';
import type {
  CandidaturaRecebida,
  MinhaCandidatura,
  StatusDaCandidatura,
  StatusDoTrampo,
  Trampo,
} from '../../api/tipos';
import RotaDaLeituraDeDica from '../../app/(app)/dicas/[id]';
import RotaDasDicas from '../../app/(app)/dicas/index';
import { Selo, type VarianteDoSelo } from '../../componentes/Selo';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { chaves } from '../../estado/consultas/chaves';
import {
  type DadosDoVinculo,
  mensagensParaExibir,
  temRespostasRapidas,
  vinculoDaConversa,
} from '../../estado/conversa';
import { formatarDiaDaMensagem } from '../../estado/formatacao';
import {
  type ArmazenamentoDoModo,
  criarArmazenamentoDoModoEmMemoria,
  type Modo,
} from '../../estado/modo';
import { DICAS } from '../../textos/dicas';
import { textos } from '../../textos/pt-BR';
import type { FetchFalso } from '../fetch-falso';
import { criarQueryClientDeTeste } from '../renderizar';
import {
  type MapaDeRotas,
  renderizarRotas,
  TOKEN_DE_TESTE,
} from '../rotas/apoio';
import { fakeComCategorias, ROTAS_REAIS, vigiarConsole } from './apoio-qa';

vigiarConsole();

const ROTAS: MapaDeRotas = {
  ...ROTAS_REAIS,
  '(app)/dicas/index': RotaDasDicas,
  '(app)/dicas/[id]': RotaDaLeituraDeDica,
};

const PERFIL = {
  contaId: 'conta-eu',
  nome: 'Maria Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

function fake(): FetchFalso {
  return fakeComCategorias()
    .responder('GET /perfis/eu', { corpo: PERFIL })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('GET /trampos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', { corpo: [] })
    .responder('GET /conversas', { corpo: [] });
}

function trampo(
  id: string,
  status: StatusDoTrampo,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    autorId: 'conta-autor',
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

function candidatura(
  id: string,
  trampoId: string,
  status: StatusDaCandidatura,
  criadaEm = '2026-10-20T12:00:00.000Z',
) {
  return {
    id,
    trampoId,
    freelancerId: 'conta-eu',
    mensagem: null,
    valorPropostoCentavos: 12000,
    status,
    criadaEm,
  };
}

async function abrir(
  url: string,
  {
    modo = null,
    fetch = fake(),
    armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria(modo),
    token = TOKEN_DE_TESTE,
  }: {
    modo?: Modo | null;
    fetch?: FetchFalso;
    armazenamentoDoModo?: ArmazenamentoDoModo;
    token?: string | null;
  } = {},
) {
  const resultado = await renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(token ?? undefined),
    armazenamentoDoModo: armazenamentoDoModo as ReturnType<
      typeof criarArmazenamentoDoModoEmMemoria
    >,
  });
  return { ...resultado, fetch };
}

const TODOS_OS_ROTULOS: readonly string[] = [
  textos.abas.inicio,
  textos.abas.meusTrampos,
  textos.abas.conversas,
  textos.abas.demandas,
  textos.abas.buscar,
  textos.abas.mensagens,
  textos.abas.perfil,
];

function abasNaBarra(): string[] {
  return screen
    .queryAllByRole('button')
    .map((b) => b.props.accessibilityLabel as string | undefined)
    .filter(
      (nome): nome is string =>
        nome !== undefined && TODOS_OS_ROTULOS.includes(nome),
    );
}

const ABAS_DO_FREELA = [
  textos.abas.inicio,
  textos.abas.meusTrampos,
  textos.abas.conversas,
  textos.abas.perfil,
];
const ABAS_DO_CONTRATANTE = [
  textos.abas.inicio,
  textos.abas.demandas,
  textos.abas.buscar,
  textos.abas.mensagens,
  textos.abas.perfil,
];

const escritas = (fetch: FetchFalso) =>
  fetch.requisicoes.filter((r) => r.metodo !== 'GET');

// ---------------------------------------------------------------- CA75: modo

describe('CA75: o secure-store do modo falhando', () => {
  function armazenamentoQueFalha(
    falhas: { ler?: boolean; gravar?: boolean } = { ler: true, gravar: true },
  ) {
    const gravacoes: Modo[] = [];
    const armazenamento: ArmazenamentoDoModo = {
      ler: () =>
        falhas.ler
          ? Promise.reject(new Error('keychain indisponivel'))
          : Promise.resolve('contratante'),
      gravar: (modo) => {
        gravacoes.push(modo);
        return falhas.gravar
          ? Promise.reject(new Error('keychain cheio'))
          : Promise.resolve();
      },
    };
    return { armazenamento, gravacoes };
  }

  it('falha ao ler: o app abre em freela, com as abas do freela', async () => {
    const { armazenamento } = armazenamentoQueFalha({ ler: true });
    await abrir('/', { armazenamentoDoModo: armazenamento });

    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_FREELA));
  });

  it('falha ao gravar: a troca vale na sessão, o app não quebra e nada vai ao console', async () => {
    const { armazenamento, gravacoes } = armazenamentoQueFalha({
      ler: false,
      gravar: true,
    });
    // Lê "contratante", troca para freela pelo Perfil da empresa.
    const { fetch } = await abrir('/perfil', {
      armazenamentoDoModo: armazenamento,
    });
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.modo.trocarParaFreela }),
    );

    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_FREELA));
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(gravacoes).toEqual(['freela']);
    expect(escritas(fetch)).toEqual([]);
  });

  it('leitura lenta: nada aparece antes do modo, e o link para aba do outro modo ainda vence', async () => {
    let resolver: (modo: Modo | null) => void = () => undefined;
    const lida = new Promise<Modo | null>((r) => {
      resolver = r;
    });
    const armazenamento: ArmazenamentoDoModo = {
      ler: () => lida,
      gravar: () => Promise.resolve(),
    };
    await abrir('/demandas', {
      armazenamentoDoModo: armazenamento,
      fetch: fake(),
    });

    // Enquanto o modo não chega, nenhuma aba é desenhada (nada de piscar).
    expect(abasNaBarra()).toEqual([]);

    await act(async () => {
      resolver('freela');
    });

    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE));
    expect(screen).toHavePathname('/demandas');
  });

  it('troca de modo durante a carga: a resposta que chega depois não derruba a tela nova', async () => {
    const fetch = fake().responder('GET /candidaturas/minhas', {
      corpo: [candidatura('c1', 't1', 'aceita')],
      demoraMs: 5_000,
    });
    await abrir('/perfil', { fetch });
    await fireEvent.press(
      await screen.findByRole('button', {
        name: textos.modo.trocarParaContratante,
      }),
    );
    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE));

    await act(async () => {
      jest.advanceTimersByTime(6_000);
    });

    expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE);
    expect(
      await screen.findByText(textos.inicioContratante.precisa),
    ).toBeOnTheScreen();
    expect(escritas(fetch)).toEqual([]);
  });
});

describe('CA77: links sem sessão e redirecionamentos', () => {
  it('aba exclusiva do outro modo sem sessão não troca nem grava o modo', async () => {
    const armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria('freela');
    await abrir('/demandas', { armazenamentoDoModo, token: null });

    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(armazenamentoDoModo.atual()).toBe('freela');
    expect(abasNaBarra()).toEqual([]);
  });

  it.each([
    ['/meus-anuncios?tipo=', 'vazio'],
    ['/meus-anuncios?tipo=SERVICO', 'caixa diferente'],
    ['/meus-anuncios?tipo=servico&tipo=servico', 'repetido'],
    ['/meus-anuncios?tipo=servico&tipo=trampo', 'repetido e misto'],
    ['/meus-anuncios?tipo=trampo&tipo=servico', 'repetido, servico por último'],
    ['/meus-anuncios?tipo=%73ervico%20', 'com espaço no fim'],
    ['/meus-anuncios?tipo[]=servico', 'em lista'],
    ['/meus-anuncios?outro=servico', 'outro parâmetro'],
  ])('%s (%s) leva a /demandas, sem lançar', async (url) => {
    await abrir(url, { modo: 'contratante' });

    await waitFor(() => expect(screen).toHavePathname('/demandas'));
    expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE);
  });

  it('/meus-anuncios sem tipo aberto por quem está em freela leva a /demandas e troca o modo (o link vence)', async () => {
    const armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria('freela');
    await abrir('/meus-anuncios', { armazenamentoDoModo });

    await waitFor(() => expect(screen).toHavePathname('/demandas'));
    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_CONTRATANTE));
    await waitFor(() =>
      expect(armazenamentoDoModo.atual()).toBe('contratante'),
    );
  });

  it('/candidaturas no modo contratante leva a /meus-trampos e troca para freela', async () => {
    const armazenamentoDoModo =
      criarArmazenamentoDoModoEmMemoria('contratante');
    await abrir('/candidaturas', { armazenamentoDoModo });

    await waitFor(() => expect(screen).toHavePathname('/meus-trampos'));
    await waitFor(() => expect(abasNaBarra()).toEqual(ABAS_DO_FREELA));
  });
});

// ---------------------------------------------------------------- CA78: segmentos

describe('CA78: Meus trampos, bordas dos segmentos', () => {
  const abaConfirmados = () =>
    screen.getByRole('tab', {
      name: new RegExp(textos.meusTrampos.abaConfirmados),
    });
  const abaEncerrados = () =>
    screen.getByRole('tab', { name: textos.meusTrampos.abaEncerrados });

  it('aceita com o trampo ainda não carregado fica em um segmento só e muda para Encerrados quando o trampo chega encerrado', async () => {
    const fetch = fake()
      .responder('GET /candidaturas/minhas', {
        corpo: [candidatura('c1', 't1', 'aceita')],
      })
      .responder('GET /trampos/t1', {
        corpo: trampo('t1', 'encerrado'),
        demoraMs: 5_000,
      })
      .responder('GET /perfis/conta-autor', {
        corpo: { ...PERFIL, contaId: 'conta-autor', nome: 'Padaria Sol' },
      });
    await abrir('/meus-trampos', { fetch });

    // Antes do trampo: está em Confirmados e em nenhum outro.
    await fireEvent.press(abaConfirmados());
    expect(
      await screen.findByText(textos.minhasCandidaturas.trampoIndisponivel),
    ).toBeOnTheScreen();
    await fireEvent.press(abaEncerrados());
    expect(
      screen.queryByText(textos.minhasCandidaturas.trampoIndisponivel),
    ).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(6_000);
    });

    // Com o trampo encerrado: sai de Confirmados e aparece em Encerrados.
    expect(await screen.findByText('Trampo t1')).toBeOnTheScreen();
    await fireEvent.press(abaConfirmados());
    expect(screen.queryByText('Trampo t1')).toBeNull();
  });

  it('o contador de Confirmados acompanha os cartões do segmento', async () => {
    const fetch = fake()
      .responder('GET /candidaturas/minhas', {
        corpo: [
          candidatura('c1', 't1', 'aceita', '2026-10-24T12:00:00.000Z'),
          candidatura('c2', 't2', 'aceita', '2026-10-23T12:00:00.000Z'),
          candidatura('c3', 't3', 'aceita', '2026-10-22T12:00:00.000Z'),
        ],
      })
      .responder('GET /trampos/t1', { corpo: trampo('t1', 'em_andamento') })
      .responder('GET /trampos/t2', { corpo: trampo('t2', 'em_andamento') })
      .responder('GET /trampos/t3', { corpo: trampo('t3', 'encerrado') });
    await abrir('/meus-trampos', { fetch });
    await fireEvent.press(
      await screen.findByRole('tab', {
        name: new RegExp(textos.meusTrampos.abaConfirmados),
      }),
    );

    // Dois em andamento: o contador diz 2 e há 2 cartões.
    expect(await screen.findByText('Trampo t1')).toBeOnTheScreen();
    expect(screen.getByText('Trampo t2')).toBeOnTheScreen();
    expect(screen.queryByText('Trampo t3')).toBeNull();
    expect(
      screen.getByRole('tab', {
        name: `${textos.meusTrampos.abaConfirmados}, 2`,
      }),
    ).toBeOnTheScreen();
  });

  it('candidatura aceita de um trampo que não existe mais (404) não quebra a lista e mostra o título indisponível', async () => {
    const fetch = fake().responder('GET /candidaturas/minhas', {
      corpo: [candidatura('c1', 't1', 'aceita')],
    });
    // `GET /trampos/t1` cai no 404 padrão do fake.
    await abrir('/meus-trampos', { fetch });

    await fireEvent.press(
      await screen.findByRole('tab', {
        name: new RegExp(textos.meusTrampos.abaConfirmados),
      }),
    );
    expect(
      await screen.findByText(textos.minhasCandidaturas.trampoIndisponivel),
    ).toBeOnTheScreen();
  });

  it('"Mensagem" numa confirmada cujo trampo não carregou não é oferecida (seria um botão que não faz nada)', async () => {
    const fetch = fake().responder('GET /candidaturas/minhas', {
      corpo: [candidatura('c1', 't1', 'aceita')],
    });
    await abrir('/meus-trampos', { fetch });
    await fireEvent.press(
      await screen.findByRole('tab', {
        name: new RegExp(textos.meusTrampos.abaConfirmados),
      }),
    );
    await screen.findByText(textos.minhasCandidaturas.trampoIndisponivel);

    expect(screen.queryByRole('button', { name: /Mensagem/ })).toBeNull();
  });
});

// ---------------------------------------------------------------- CA79: Demandas

describe('CA79: Demandas, carregar mais com aba vazia', () => {
  it('na aba Encerradas, "Carregar mais" traz da página 2 o trampo encerrado e ele aparece nela', async () => {
    const pagina1 = Array.from({ length: 20 }, (_, i) =>
      trampo(`p${i}`, 'aberto', {
        criadoEm: `2026-10-${String(28 - i).padStart(2, '0')}T12:00:00.000Z`,
      }),
    );
    const antigo = trampo('antigo', 'encerrado', {
      criadoEm: '2026-08-01T12:00:00.000Z',
    });
    const fetch = fake().responder('GET /trampos/meus', (requisicao) => ({
      corpo:
        requisicao.query.antesDeCriadoEm === undefined
          ? [...pagina1, antigo]
          : [antigo],
    }));
    await abrir('/demandas', { modo: 'contratante', fetch });
    await screen.findByText('Trampo p0');

    await fireEvent.press(
      screen.getByRole('tab', { name: textos.demandas.abaEncerradas }),
    );
    // A aba está vazia, mas ainda há página: o botão está lá.
    expect(screen.queryByText('Trampo antigo')).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.carregarMais }),
    );

    expect(await screen.findByText('Trampo antigo')).toBeOnTheScreen();
    // Sem mais páginas, o botão some.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: textos.gerais.carregarMais }),
      ).toBeNull(),
    );
  });
});

// ---------------------------------------------------------------- CA80: Candidatura enviada

describe('CA80: Candidatura enviada, parâmetros estranhos', () => {
  it.each([
    ['/candidatura-enviada', 'sem trampoId'],
    ['/candidatura-enviada?trampoId=', 'trampoId vazio'],
    ['/candidatura-enviada?trampoId=a&trampoId=b', 'trampoId repetido'],
    [
      '/candidatura-enviada?trampoId=..%2F..%2Fperfis%2Feu',
      'trampoId com barra',
    ],
  ])('%s (%s) mostra a tela, sem nenhuma requisição', async (url) => {
    const { fetch } = await abrir(url);

    expect(
      await screen.findByText(textos.candidaturaEnviada.titulo),
    ).toBeOnTheScreen();
    expect(
      fetch.requisicoes.filter((r) =>
        /^\/(trampos|candidaturas|perfis\/(?!eu))/.test(r.caminho),
      ),
    ).toEqual([]);
  });

  it('sem trampoId, voltar leva ao Início (não a /trampos/)', async () => {
    await abrir('/candidatura-enviada');
    await screen.findByText(textos.candidaturaEnviada.titulo);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );

    await waitFor(() => expect(screen).toHavePathname('/'));
  });
});

// ---------------------------------------------------------------- CA81: Dicas

describe('CA81: conteúdo das Dicas', () => {
  it('ids únicos, categoria que existe, sem texto vazio e tempo de leitura positivo', () => {
    const ids = DICAS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DICAS.length).toBeGreaterThan(0);
    for (const dica of DICAS) {
      expect(Object.keys(textos.dicas.categoria)).toContain(dica.categoria);
      expect(dica.minutos).toBeGreaterThan(0);
      expect(dica.titulo.trim()).not.toBe('');
      expect(dica.resumo.trim()).not.toBe('');
      expect(dica.paragrafos.length).toBeGreaterThan(0);
      for (const p of [...dica.paragrafos, ...dica.lembrar]) {
        expect(p.trim()).not.toBe('');
      }
    }
  });

  it.each([
    '/dicas/ab%20c%2Fd',
    '/dicas/entrevista%00',
    `/dicas/${'x'.repeat(500)}`,
  ])('%s abre "não encontrado" sem requisição', async (url) => {
    const { fetch } = await abrir(url);

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    expect(
      fetch.requisicoes.filter(
        (r) => !['/categorias', '/perfis/eu'].includes(r.caminho),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------- CA85: fora do escopo

describe('CA85: nada fora do escopo em textos/pt-BR.ts', () => {
  const PROIBIDOS =
    /ganho|extrato|faturamento|dist[âa]ncia|notifica|convite|esqueceu sua senha|esqueci minha senha/i;

  function varrer(no: unknown, caminho: string, achados: string[]) {
    if (typeof no === 'string') {
      if (PROIBIDOS.test(no)) achados.push(`${caminho} = ${no}`);
      return;
    }
    if (typeof no === 'function') {
      // Textos com parâmetro: avalia com valores de exemplo.
      try {
        const saida = (no as (...a: unknown[]) => unknown)(1, 'x', 'x');
        varrer(saida, `${caminho}()`, achados);
      } catch {
        // função que não é de texto
      }
      return;
    }
    if (typeof no === 'object' && no !== null) {
      for (const [chave, valor] of Object.entries(no)) {
        if (PROIBIDOS.test(chave)) achados.push(`chave ${caminho}.${chave}`);
        varrer(valor, `${caminho}.${chave}`, achados);
      }
    }
  }

  it('nenhuma chave nem texto de ganhos, extrato, faturamento, distância, notificação, convite ou "Esqueceu sua senha"', () => {
    const achados: string[] = [];
    varrer(textos, 'textos', achados);
    expect(achados).toEqual([]);
  });

  it('não existe selo de não lidas nos textos', () => {
    const achados: string[] = [];
    const procurar = (no: unknown, caminho: string) => {
      if (typeof no === 'object' && no !== null) {
        for (const [chave, valor] of Object.entries(no)) {
          if (/n[ãa]o_?lid|naoLid|unread/i.test(chave)) {
            achados.push(`${caminho}.${chave}`);
          }
          procurar(valor, `${caminho}.${chave}`);
        }
      }
    };
    procurar(textos, 'textos');
    expect(achados).toEqual([]);
  });

  it('a lista de conversas não desenha selo de não lidas', async () => {
    const fetch = fake().responder('GET /conversas', {
      corpo: [
        {
          conversaId: 'c1',
          outroUsuarioId: 'conta-x',
          criadaEm: '2026-10-01T09:00:00.000Z',
          ultimaMensagem: {
            texto: 'oi',
            enviadaEm: '2026-10-20T12:00:00.000Z',
            autorId: 'conta-x',
          },
        },
      ],
    });
    await abrir('/conversas', { fetch });
    await screen.findByText(/oi/);
    expect(screen.queryByLabelText(/n[ãa]o lida/i)).toBeNull();
  });
});

// ---------------------------------------------------------------- 7b: vínculo da conversa

describe('7b: vínculo da conversa com mais de um trampo entre o mesmo par', () => {
  const OUTRO = 'conta-outra';

  function t(
    id: string,
    status: StatusDoTrampo,
    autorId = OUTRO,
    valorCentavos = 10000,
  ): Trampo {
    return {
      id,
      autorId,
      titulo: `Titulo ${id}`,
      descricao: 'd',
      categoria: 'outros',
      cidade: 'c',
      valorCentavos,
      prazo: null,
      status,
      criadoEm: '2026-10-01T10:00:00.000Z',
    } as Trampo;
  }

  function minha(
    id: string,
    trampoId: string,
    status: StatusDaCandidatura,
    criadaEm: string,
  ): MinhaCandidatura {
    return {
      id,
      trampoId,
      freelancerId: 'conta-eu',
      mensagem: 'msg',
      valorPropostoCentavos: 1,
      status,
      criadaEm,
    } as MinhaCandidatura;
  }

  function dados(
    minhas: MinhaCandidatura[],
    trampos: Trampo[],
    recebidas: [string, CandidaturaRecebida[]][] = [],
  ): DadosDoVinculo {
    return {
      minhasCandidaturas: minhas,
      recebidas: new Map(recebidas),
      trampo: (id) => trampos.find((x) => x.id === id),
    };
  }

  it('aceita ganha de pendente e de recusada, em qualquer ordem de chegada', () => {
    const trampos = [
      t('a', 'aberto'),
      t('b', 'em_andamento'),
      t('c', 'aberto'),
    ];
    const minhas = [
      minha('1', 'a', 'recusada', '2026-10-05T10:00:00.000Z'),
      minha('2', 'c', 'pendente', '2026-10-04T10:00:00.000Z'),
      minha('3', 'b', 'aceita', '2026-10-01T10:00:00.000Z'),
    ];
    expect(vinculoDaConversa(dados(minhas, trampos), OUTRO)?.trampoId).toBe(
      'b',
    );
    expect(
      vinculoDaConversa(dados([...minhas].reverse(), trampos), OUTRO)?.trampoId,
    ).toBe('b');
  });

  it('só liga pelo cache: trampo não lido ou de outro autor não liga', () => {
    const minhas = [minha('1', 'a', 'aceita', '2026-10-05T10:00:00.000Z')];
    expect(vinculoDaConversa(dados(minhas, []), OUTRO)).toBeNull();
    expect(
      vinculoDaConversa(
        dados(minhas, [t('a', 'aberto', 'conta-terceira')]),
        OUTRO,
      ),
    ).toBeNull();
    expect(
      vinculoDaConversa(
        {
          minhasCandidaturas: undefined,
          recebidas: new Map(),
          trampo: () => undefined,
        },
        OUTRO,
      ),
    ).toBeNull();
  });

  it('com duas aceitas, a do trampo ainda em andamento vale mais que a de um trampo encerrado, mesmo mais antiga', () => {
    // O freela já fechou o trampo A com o contratante (encerrado) e agora
    // combina o B, que está em andamento. As respostas rápidas do chat
    // ("Estou a caminho") são para o B.
    const trampos = [t('a', 'encerrado'), t('b', 'em_andamento')];
    const minhas = [
      minha('1', 'a', 'aceita', '2026-10-20T10:00:00.000Z'),
      minha('2', 'b', 'aceita', '2026-10-10T10:00:00.000Z'),
    ];
    const vinculo = vinculoDaConversa(dados(minhas, trampos), OUTRO);

    expect(vinculo?.trampoId).toBe('b');
    expect(temRespostasRapidas(vinculo)).toBe(true);
  });

  it('com a aceita encerrada e uma pendente de outro trampo, não oferece respostas rápidas', () => {
    const trampos = [t('a', 'encerrado'), t('b', 'aberto')];
    const minhas = [
      minha('1', 'a', 'aceita', '2026-10-20T10:00:00.000Z'),
      minha('2', 'b', 'pendente', '2026-10-21T10:00:00.000Z'),
    ];
    const vinculo = vinculoDaConversa(dados(minhas, trampos), OUTRO);

    expect(temRespostasRapidas(vinculo)).toBe(false);
  });

  it('o outro candidato a um trampo meu (papel autor) nunca tem respostas rápidas, mesmo aceita', () => {
    const recebida = {
      id: 'r1',
      freelancerId: OUTRO,
      mensagem: 'msg',
      valorPropostoCentavos: 1,
      status: 'aceita',
      criadaEm: '2026-10-10T10:00:00.000Z',
    } as CandidaturaRecebida;
    const vinculo = vinculoDaConversa(
      dados([], [t('a', 'em_andamento', 'conta-eu')], [['a', [recebida]]]),
      OUTRO,
    );

    expect(vinculo?.papel).toBe('autor');
    expect(temRespostasRapidas(vinculo)).toBe(false);
  });

  it('data de candidatura inválida não lança e não impede o vínculo', () => {
    const trampos = [t('a', 'aberto')];
    const minhas = [minha('1', 'a', 'pendente', 'ontem')];
    expect(vinculoDaConversa(dados(minhas, trampos), OUTRO)?.trampoId).toBe(
      'a',
    );
  });
});

describe('7b: separador de dia na virada do dia e do ano', () => {
  const rotulos = { hoje: 'Hoje', ontem: 'Ontem' };
  const iso = (...partes: [number, number, number, number, number, number?]) =>
    new Date(...partes).toISOString();

  it('1.º de janeiro: 31/12 vira "Ontem", 30/12 vira a data completa com o ano anterior', () => {
    const agora = new Date(2027, 0, 1, 10, 0);
    expect(
      formatarDiaDaMensagem(iso(2026, 11, 31, 23, 59, 59), agora, rotulos),
    ).toBe('Ontem');
    expect(
      formatarDiaDaMensagem(iso(2026, 11, 30, 23, 59), agora, rotulos),
    ).toBe('30/12/2026');
    expect(formatarDiaDaMensagem(iso(2027, 0, 1, 0, 0), agora, rotulos)).toBe(
      'Hoje',
    );
  });

  it('um segundo antes da meia-noite é de ontem; à meia-noite em ponto é de hoje', () => {
    const agora = new Date(2026, 9, 21, 0, 0, 1);
    expect(
      formatarDiaDaMensagem(iso(2026, 9, 20, 23, 59, 59), agora, rotulos),
    ).toBe('Ontem');
    expect(
      formatarDiaDaMensagem(iso(2026, 9, 21, 0, 0, 0), agora, rotulos),
    ).toBe('Hoje');
  });

  it('29 de fevereiro: no 1.º de março de um ano bissexto, 29/02 é "Ontem" e 28/02 é a data', () => {
    const agora = new Date(2028, 2, 1, 9, 0);
    expect(formatarDiaDaMensagem(iso(2028, 1, 29, 12, 0), agora, rotulos)).toBe(
      'Ontem',
    );
    expect(formatarDiaDaMensagem(iso(2028, 1, 28, 12, 0), agora, rotulos)).toBe(
      '28/02/2028',
    );
  });

  it('mensagem do futuro (relógio do aparelho atrasado) mostra a data, sem lançar', () => {
    const agora = new Date(2026, 9, 21, 12, 0);
    expect(formatarDiaDaMensagem(iso(2026, 9, 25, 12, 0), agora, rotulos)).toBe(
      '25/10/2026',
    );
  });

  it.each(['', 'ontem', '2026-10-20', '2026-13-45T00:00:00Z'])(
    'instante inválido %j não gera separador',
    (valor) => {
      expect(
        formatarDiaDaMensagem(valor, new Date(2026, 9, 21, 12, 0), rotulos),
      ).toBeNull();
    },
  );

  it('a pendente ainda sem hora confirmada fica sob "Hoje", mesmo depois de a virada do dia passar', () => {
    const agora = new Date(2026, 9, 21, 0, 5);
    const exibidas = mensagensParaExibir(
      [
        {
          id: 'm1',
          autorId: 'outro',
          texto: 'oi',
          enviadaEm: new Date(2026, 9, 20, 23, 58).toISOString(),
        },
      ],
      [
        {
          chave: 'p1',
          texto: 'resposta',
          situacao: 'enviando',
          id: null,
          enviadaEm: null,
          ancora: 'm1',
        },
      ],
      'outro',
      agora,
    );

    expect(exibidas.map((m) => m.diaFormatado)).toEqual(['Ontem', 'Hoje']);
  });
});

describe('7b: respostas rápidas na conversa, pela rota', () => {
  const OUTRO = 'conta-autor';

  async function abrirConversaComVinculo() {
    const fetch = fake()
      .responder('GET /conversas', {
        corpo: [
          {
            conversaId: 'c1',
            outroUsuarioId: OUTRO,
            criadaEm: '2026-10-01T09:00:00.000Z',
            ultimaMensagem: null,
          },
        ],
      })
      .responder(`GET /perfis/${OUTRO}`, {
        corpo: { ...PERFIL, contaId: OUTRO, nome: 'Padaria Sol' },
      })
      .responder('GET /conversas/c1/mensagens', { corpo: [] })
      .responder('POST /conversas/c1/mensagens', {
        status: 201,
        corpo: { id: 'm1', enviadaEm: '2026-10-21T12:00:00.000Z' },
      });
    const queryClient = criarQueryClientDeTeste();
    const aberto = await renderizarRotas(ROTAS, {
      initialUrl: '/conversas/c1',
      fetch,
      queryClient,
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
    });
    await screen.findByLabelText(textos.conversas.campo);
    await act(async () => {
      queryClient.setQueryData(chaves.minhasCandidaturas(), [
        candidatura('c1', 't1', 'aceita'),
      ]);
      queryClient.setQueryData(
        chaves.trampo('t1'),
        trampo('t1', 'em_andamento'),
      );
    });
    return { ...aberto, fetch };
  }

  const posts = (fetch: FetchFalso) =>
    fetch.requisicoes.filter(
      (r) => r.metodo === 'POST' && r.caminho === '/conversas/c1/mensagens',
    );

  it('tocar numa resposta rápida só preenche o campo: mesmo depois de esperar, nada é enviado; o envio é só pelo botão Enviar', async () => {
    const { fetch } = await abrirConversaComVinculo();
    const [primeira] = textos.conversas.respostasRapidas;
    await fireEvent.press(await screen.findByText(primeira as string));

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByLabelText(textos.conversas.campo).props.value).toBe(
      primeira,
    );
    expect(posts(fetch)).toHaveLength(0);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.conversas.enviar }),
    );
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(posts(fetch)[0]?.corpo).toEqual({ texto: primeira });
  });

  it('com o trampo encerrado depois (cache atualizado), as respostas rápidas somem', async () => {
    const { queryClient } = await abrirConversaComVinculo();
    const [primeira] = textos.conversas.respostasRapidas;
    expect(await screen.findByText(primeira as string)).toBeOnTheScreen();

    await act(async () => {
      queryClient.setQueryData(chaves.trampo('t1'), trampo('t1', 'encerrado'));
    });

    await waitFor(() =>
      expect(screen.queryByText(primeira as string)).toBeNull(),
    );
  });
});

describe('CA82: Início do contratante, limite e erro', () => {
  it('com 5 demandas abertas e 1 em andamento, mostra só 3 abertas e nenhuma em andamento', async () => {
    const fetch = fake().responder('GET /trampos/meus', {
      corpo: [
        trampo('t1', 'aberto'),
        trampo('t2', 'em_andamento'),
        trampo('t3', 'aberto'),
        trampo('t4', 'aberto'),
        trampo('t5', 'aberto'),
        trampo('t6', 'aberto'),
      ],
    });
    await abrir('/', { modo: 'contratante', fetch });

    expect(await screen.findByText('Trampo t1')).toBeOnTheScreen();
    expect(screen.getByText('Trampo t3')).toBeOnTheScreen();
    expect(screen.getByText('Trampo t4')).toBeOnTheScreen();
    expect(screen.queryByText('Trampo t2')).toBeNull();
    expect(screen.queryByText('Trampo t5')).toBeNull();
    expect(screen.queryByText('Trampo t6')).toBeNull();
    // Não há Aceitar nem Recusar no Início.
    expect(screen.queryByRole('button', { name: /^Aceitar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Recusar/ })).toBeNull();
  });

  it('erro em /trampos/meus mostra o erro com "Tentar de novo", e tentar de novo carrega as demandas', async () => {
    const fetch = fake().responder('GET /trampos/meus', [
      { status: 500, corpo: { codigo: 'erro_interno' } },
      { corpo: [trampo('t1', 'aberto')] },
    ]);
    await abrir('/', { modo: 'contratante', fetch });

    await fireEvent.press(
      await screen.findByRole('button', { name: textos.gerais.tentarDeNovo }),
    );

    expect(await screen.findByText('Trampo t1')).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------- CA74: contraste do que é desenhado

function canal(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return (
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255)
  );
}
function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro as number) + 0.05) / ((escuro as number) + 0.05);
}

describe('CA74: contraste do Selo como é desenhado (não só a tabela da spec)', () => {
  const VARIANTES: VarianteDoSelo[] = [
    'aberto',
    'em_andamento',
    'pendente',
    'aceita',
    'recusada',
    'encerrado',
    'neutro',
    'alerta',
    'informacao',
    'roxo',
    'urgente',
    'nova',
  ];

  it.each(VARIANTES)(
    'selo %s: texto sobre o fundo passa 4,5:1',
    async (variante) => {
      await render(<Selo variante={variante} texto="Rótulo" />);

      const texto = screen.getByText('Rótulo');
      const cor = StyleSheet.flatten(texto.props.style).color as string;
      const fundo = StyleSheet.flatten(texto.parent?.props.style)
        .backgroundColor as string;
      expect(cor).toMatch(/^#/);
      expect(fundo).toMatch(/^#/);
      expect(contraste(cor, fundo)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
