import type {
  CandidaturaRecebida,
  Mensagem,
  MinhaCandidatura,
  PerfilPublico,
  ResumoDeConversa,
  StatusDaCandidatura,
  Trampo,
} from '../api/tipos';
import { textos } from '../textos/pt-BR';
import {
  mesclarPagina,
  TETO_DE_MENSAGENS_NO_CACHE,
} from './consultas/conversas';
import {
  conversaParaExibir,
  criarPendente,
  MAXIMO_DA_MENSAGEM,
  mensagensParaExibir,
  type Pendente,
  reconciliar,
  temRespostasRapidas,
  textoEnviavel,
  type VinculoDaConversa,
  vinculoDaConversa,
} from './conversa';

// Sentinelas genéricas (CA15): nenhum texto parece dado de gente de verdade.
const EU = 'conta-eu';
const OUTRO = 'conta-outro';
const TEXTO_A = 'sentinela-texto-a';
const TEXTO_B = 'sentinela-texto-b';

// Instantes montados no fuso local: o teste independe do fuso da máquina.
const AGORA = new Date(2026, 9, 21, 15, 0);
const HOJE_1432 = new Date(2026, 9, 21, 14, 32).toISOString();
const ONTEM_0905 = new Date(2026, 9, 20, 9, 5).toISOString();
const HOJE = textos.conversas.diaHoje;
const ONTEM = textos.conversas.diaOntem;

function msg(
  id: string,
  autorId: string,
  texto: string,
  enviadaEm: string = HOJE_1432,
): Mensagem {
  return { id, autorId, texto, enviadaEm };
}

function pendente(parcial: Partial<Pendente> & { chave: string }): Pendente {
  return {
    texto: TEXTO_A,
    situacao: 'enviando',
    id: null,
    enviadaEm: null,
    ancora: null,
    ...parcial,
  };
}

const chaves = (lista: readonly { chave: string }[]) =>
  lista.map((item) => item.chave);

describe('textoEnviavel', () => {
  it('apara espaços e quebras de linha das pontas', () => {
    expect(textoEnviavel(`  \n${TEXTO_A}\t `)).toBe(TEXTO_A);
  });

  it('mantém as quebras de linha do meio', () => {
    expect(textoEnviavel(`${TEXTO_A}\n\n${TEXTO_B}`)).toBe(
      `${TEXTO_A}\n\n${TEXTO_B}`,
    );
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['só quebras e tabulações', '\n\t \r\n'],
  ])('%s vira null', (_nome, texto) => {
    expect(textoEnviavel(texto)).toBeNull();
  });

  it('aceita um caractere', () => {
    expect(textoEnviavel('x')).toBe('x');
  });

  it('conta pontos de código: 2000 emojis passam, 2001 não', () => {
    const emoji = '\u{1F600}';
    const limite = emoji.repeat(MAXIMO_DA_MENSAGEM);
    expect(MAXIMO_DA_MENSAGEM).toBe(2000);
    expect(limite.length).toBe(4000);
    expect(textoEnviavel(limite)).toBe(limite);
    expect(textoEnviavel(limite + emoji)).toBeNull();
  });

  it('2000 letras passam, 2001 não', () => {
    expect(textoEnviavel('a'.repeat(2000))).toBe('a'.repeat(2000));
    expect(textoEnviavel('a'.repeat(2001))).toBeNull();
  });

  it('conta depois de aparar', () => {
    const limite = 'a'.repeat(2000);
    expect(textoEnviavel(`   ${limite}   `)).toBe(limite);
  });

  it.each([
    ['no meio', `${TEXTO_A}\0${TEXTO_B}`],
    ['no começo', `\0${TEXTO_A}`],
    ['no fim, depois de espaço', `${TEXTO_A} \0`],
    ['sozinho', '\0'],
  ])('caractere nulo %s vira null', (_nome, texto) => {
    expect(textoEnviavel(texto)).toBeNull();
  });
});

describe('criarPendente', () => {
  it('cria em enviando, sem id nem hora, com chave local-<n> e a âncora', () => {
    const confirmadas = [
      msg('m1', OUTRO, TEXTO_B),
      msg('m2', EU, TEXTO_B),
      msg('m3', OUTRO, TEXTO_B),
    ];
    expect(criarPendente(7, TEXTO_A, confirmadas)).toEqual({
      chave: 'local-7',
      texto: TEXTO_A,
      situacao: 'enviando',
      id: null,
      enviadaEm: null,
      ancora: 'm3',
    });
  });
});

describe('reconciliar', () => {
  // Em cada caso: confirmadas do GET, pendentes (ordem de criação) e as
  // chaves das que ficam.
  it.each<
    [string, readonly Mensagem[], readonly Pendente[], readonly string[]]
  >([
    [
      'sem confirmadas, todas ficam',
      [],
      [
        pendente({ chave: 'local-1' }),
        pendente({ chave: 'local-2', id: 'm9', situacao: 'enviada' }),
      ],
      ['local-1', 'local-2'],
    ],
    [
      'sai a pendente cujo id já veio no GET',
      [msg('m1', EU, TEXTO_A)],
      [pendente({ chave: 'local-1', id: 'm1', situacao: 'enviada' })],
      [],
    ],
    [
      'pendente com id que ainda não veio fica',
      [msg('m1', EU, TEXTO_A)],
      [pendente({ chave: 'local-1', id: 'm2', situacao: 'enviada' })],
      ['local-1'],
    ],
    [
      'pendente com id sai pelo id mesmo antes da âncora',
      [msg('m1', EU, TEXTO_A), msg('m2', OUTRO, TEXTO_B)],
      [
        pendente({
          chave: 'local-1',
          id: 'm1',
          situacao: 'enviada',
          ancora: 'm2',
        }),
      ],
      [],
    ],
    [
      'pendente sem id sai com uma confirmada minha de mesmo texto depois da âncora',
      [msg('m1', OUTRO, TEXTO_B), msg('m2', EU, TEXTO_A)],
      [pendente({ chave: 'local-1', ancora: 'm1' })],
      [],
    ],
    [
      'pendente que falhou também sai se a mensagem chegou',
      [msg('m1', EU, TEXTO_A)],
      [pendente({ chave: 'local-1', situacao: 'falhou' })],
      [],
    ],
    [
      'confirmada de mesmo texto antes da âncora não casa',
      [msg('m1', EU, TEXTO_A), msg('m2', OUTRO, TEXTO_B)],
      [pendente({ chave: 'local-1', ancora: 'm1' })],
      ['local-1'],
    ],
    [
      'a confirmada logo depois da âncora casa',
      [msg('m1', EU, TEXTO_B), msg('m2', EU, TEXTO_A)],
      [pendente({ chave: 'local-1', ancora: 'm1' })],
      [],
    ],
    [
      'âncora que o corte do cache já tirou conta como anterior a todas (S1)',
      [msg('m7', OUTRO, TEXTO_B), msg('m8', EU, TEXTO_A)],
      [pendente({ chave: 'local-1', ancora: 'm2', situacao: 'falhou' })],
      [],
    ],
    [
      'mensagem do outro com o mesmo texto não casa',
      [msg('m1', OUTRO, TEXTO_A)],
      [pendente({ chave: 'local-1' })],
      ['local-1'],
    ],
    [
      'confirmada minha de outro texto não casa',
      [msg('m1', EU, TEXTO_B)],
      [pendente({ chave: 'local-1' })],
      ['local-1'],
    ],
    [
      'compara o texto aparado',
      [msg('m1', EU, TEXTO_A)],
      [pendente({ chave: 'local-1', texto: `  ${TEXTO_A}\n` })],
      [],
    ],
    [
      'confirmada com o id de outra pendente não casa',
      [msg('m1', EU, TEXTO_A)],
      [
        pendente({ chave: 'local-1', id: 'm1', situacao: 'enviada' }),
        pendente({ chave: 'local-2', situacao: 'falhou' }),
      ],
      ['local-2'],
    ],
    [
      'confirmada com o id de uma pendente criada depois também não casa',
      [msg('m1', EU, TEXTO_A)],
      [
        pendente({ chave: 'local-1', situacao: 'falhou' }),
        pendente({ chave: 'local-2', id: 'm1', situacao: 'enviada' }),
      ],
      ['local-1'],
    ],
    [
      'duas pendentes de texto igual casam duas confirmadas',
      [msg('m1', EU, TEXTO_A), msg('m2', EU, TEXTO_A)],
      [pendente({ chave: 'local-1' }), pendente({ chave: 'local-2' })],
      [],
    ],
    [
      'duas pendentes de texto igual e uma confirmada: sai só a primeira criada',
      [msg('m1', EU, TEXTO_A)],
      [pendente({ chave: 'local-1' }), pendente({ chave: 'local-2' })],
      ['local-2'],
    ],
    [
      'cada pendente casa pelo próprio texto',
      [msg('m1', EU, TEXTO_B), msg('m2', EU, TEXTO_A)],
      [
        pendente({ chave: 'local-1', texto: TEXTO_A }),
        pendente({ chave: 'local-2', texto: TEXTO_B }),
        pendente({ chave: 'local-3', texto: TEXTO_A }),
      ],
      ['local-3'],
    ],
  ])('%s', (_nome, confirmadas, pendentes, ficam) => {
    expect(chaves(reconciliar(confirmadas, pendentes, OUTRO))).toEqual(ficam);
  });

  // R3/S2: a confirmada vai primeiro para quem está em envio (o POST está no
  // ar e vai chegar), e só a que sobrar para quem falhou. Ao contrário, a que
  // falhou de verdade sumiria como entregue.
  it.each<
    [string, readonly Mensagem[], readonly Pendente[], readonly string[]]
  >([
    [
      'a que falhou não casa a confirmada da que está em envio, mesmo criada antes',
      [msg('m1', EU, TEXTO_A)],
      [
        pendente({ chave: 'local-1', situacao: 'falhou' }),
        pendente({ chave: 'local-2', situacao: 'enviando' }),
      ],
      ['local-1'],
    ],
    [
      'com duas confirmadas iguais, as duas saem',
      [msg('m1', EU, TEXTO_A), msg('m2', EU, TEXTO_A)],
      [
        pendente({ chave: 'local-1', situacao: 'falhou' }),
        pendente({ chave: 'local-2', situacao: 'enviando' }),
      ],
      [],
    ],
    [
      'a que falhou casa a confirmada que a em envio não pode casar (âncora)',
      [msg('m1', EU, TEXTO_A)],
      [
        pendente({ chave: 'local-1', situacao: 'falhou' }),
        pendente({ chave: 'local-2', situacao: 'enviando', ancora: 'm1' }),
      ],
      ['local-2'],
    ],
    [
      'a que falhou casa a confirmada de texto que nenhuma em envio tem',
      [msg('m1', EU, TEXTO_A)],
      [
        pendente({ chave: 'local-1', situacao: 'falhou' }),
        pendente({ chave: 'local-2', texto: TEXTO_B }),
      ],
      ['local-2'],
    ],
    [
      'entre as que falharam, casa a primeira criada',
      [msg('m1', EU, TEXTO_A)],
      [
        pendente({ chave: 'local-1', situacao: 'falhou' }),
        pendente({ chave: 'local-2', situacao: 'falhou' }),
      ],
      ['local-2'],
    ],
    [
      'as que ficam saem na ordem de criação, misturando as situações',
      [msg('m1', EU, TEXTO_A)],
      [
        pendente({ chave: 'local-1', situacao: 'falhou' }),
        pendente({ chave: 'local-2', texto: TEXTO_B }),
        pendente({ chave: 'local-3' }),
        pendente({ chave: 'local-4', texto: TEXTO_B, situacao: 'falhou' }),
      ],
      ['local-1', 'local-2', 'local-4'],
    ],
  ])(
    'em envio antes das que falharam: %s',
    (_nome, confirmadas, pendentes, ficam) => {
      expect(chaves(reconciliar(confirmadas, pendentes, OUTRO))).toEqual(ficam);
    },
  );

  it('mantém a ordem de criação das que ficam', () => {
    const pendentes = [
      pendente({ chave: 'local-3', texto: TEXTO_B }),
      pendente({ chave: 'local-1', texto: TEXTO_A }),
      pendente({ chave: 'local-2', texto: TEXTO_B, situacao: 'falhou' }),
    ];
    expect(
      chaves(reconciliar([msg('m1', EU, TEXTO_A)], pendentes, OUTRO)),
    ).toEqual(['local-3', 'local-2']);
  });

  it('não altera as listas recebidas', () => {
    const confirmadas = [msg('m1', EU, TEXTO_A)];
    const pendentes = [pendente({ chave: 'local-1', texto: TEXTO_B })];
    const copiaC = structuredClone(confirmadas);
    const copiaP = structuredClone(pendentes);
    reconciliar(confirmadas, pendentes, OUTRO);
    expect(confirmadas).toEqual(copiaC);
    expect(pendentes).toEqual(copiaP);
  });

  it('a pendente sem id que fica avança a âncora para a última confirmada', () => {
    const confirmadas = [msg('m1', OUTRO, TEXTO_A), msg('m2', EU, TEXTO_B)];
    const [semId, comId] = reconciliar(
      confirmadas,
      [
        pendente({ chave: 'local-1', situacao: 'falhou' }),
        pendente({
          chave: 'local-2',
          id: 'm9',
          situacao: 'enviada',
          ancora: 'm1',
        }),
      ],
      OUTRO,
    );
    expect(semId).toEqual(
      pendente({ chave: 'local-1', situacao: 'falhou', ancora: 'm2' }),
    );
    // A com id só sai pelo id: a âncora dela não muda.
    expect(comId?.ancora).toBe('m1');
  });

  it('a confirmada da pendente que saiu pelo id não casa na resposta seguinte', () => {
    const confirmadas = [msg('m1', EU, TEXTO_A)];
    const primeira = reconciliar(
      confirmadas,
      [
        pendente({ chave: 'local-1', id: 'm1', situacao: 'enviada' }),
        pendente({ chave: 'local-2', situacao: 'falhou' }),
      ],
      OUTRO,
    );
    expect(chaves(primeira)).toEqual(['local-2']);
    // Próximo ciclo do polling, sem mensagem nova: a que falhou continua.
    expect(chaves(reconciliar(confirmadas, primeira, OUTRO))).toEqual([
      'local-2',
    ]);
  });

  it('a confirmada já casada não casa outra pendente na resposta seguinte', () => {
    const confirmadas = [msg('m1', EU, TEXTO_A)];
    const primeira = reconciliar(
      confirmadas,
      [pendente({ chave: 'local-1' }), pendente({ chave: 'local-2' })],
      OUTRO,
    );
    expect(chaves(primeira)).toEqual(['local-2']);
    expect(chaves(reconciliar(confirmadas, primeira, OUTRO))).toEqual([
      'local-2',
    ]);
    // Quando a mensagem dela chega, ela sai.
    const depois = [...confirmadas, msg('m2', EU, TEXTO_A)];
    expect(reconciliar(depois, primeira, OUTRO)).toEqual([]);
  });

  it('é idempotente: reconciliar de novo a mesma resposta não muda nada', () => {
    const confirmadas = [
      msg('m1', EU, TEXTO_A),
      msg('m2', OUTRO, TEXTO_A),
      msg('m3', EU, TEXTO_B),
    ];
    const pendentes = [
      pendente({ chave: 'local-1', texto: TEXTO_B }),
      pendente({ chave: 'local-2', texto: TEXTO_A, situacao: 'falhou' }),
      pendente({ chave: 'local-3', texto: TEXTO_A, ancora: 'm1' }),
      pendente({ chave: 'local-4', id: 'm7', situacao: 'enviada' }),
    ];
    const uma = reconciliar(confirmadas, pendentes, OUTRO);
    expect(chaves(uma)).toEqual(['local-3', 'local-4']);
    expect(reconciliar(confirmadas, uma, OUTRO)).toEqual(uma);
  });
});

// S1: o cache guarda só as últimas `TETO_DE_MENSAGENS_NO_CACHE` mensagens. O
// corte tira as do começo a cada página nova; a pendente continua casando a
// mensagem dela, que sempre chega depois da âncora.
describe('reconciliar com o cache no teto (S1)', () => {
  function cheia(): Mensagem[] {
    return Array.from({ length: TETO_DE_MENSAGENS_NO_CACHE }, (_, i) =>
      msg(`m${i + 1}`, i % 2 === 0 ? OUTRO : EU, TEXTO_B),
    );
  }

  it.each(['enviando', 'falhou'] as const)(
    'a pendente em %s sai quando a mensagem dela chega e o corte tira a mais antiga',
    (situacao) => {
      const antes = cheia();
      const criada = {
        ...criarPendente(1, TEXTO_A, antes),
        situacao,
      };
      const depois = mesclarPagina(antes, [msg('m-nova', EU, TEXTO_A)]);
      expect(depois).toHaveLength(TETO_DE_MENSAGENS_NO_CACHE);
      expect(depois[0]?.id).toBe('m2');

      expect(reconciliar(depois, [criada], OUTRO)).toEqual([]);
      expect(
        mensagensParaExibir(depois, [criada], OUTRO, AGORA).filter(
          (m) => m.texto === TEXTO_A,
        ),
      ).toHaveLength(1);
    },
  );

  it('a que ficou sem par casa a mensagem dela depois de vários cortes', () => {
    const antes = cheia();
    const [ficou] = reconciliar(
      antes,
      [{ ...criarPendente(1, TEXTO_A, antes), situacao: 'falhou' }],
      OUTRO,
    );
    if (ficou === undefined) {
      throw new Error('a pendente devia ficar');
    }
    // Chegam 3 do outro (o corte tira 3) e só depois a minha.
    let lista = mesclarPagina(antes, [
      msg('o1', OUTRO, TEXTO_A),
      msg('o2', OUTRO, TEXTO_A),
      msg('o3', OUTRO, TEXTO_A),
    ]);
    const [aindaFica] = reconciliar(lista, [ficou], OUTRO);
    expect(aindaFica?.chave).toBe('local-1');
    lista = mesclarPagina(lista, [msg('m-nova', EU, TEXTO_A)]);
    expect(reconciliar(lista, aindaFica ? [aindaFica] : [], OUTRO)).toEqual([]);
  });

  it('as pendentes não contam no teto: a tela mostra as confirmadas e mais elas', () => {
    const lista = cheia();
    const pendentes = [
      criarPendente(1, TEXTO_A, lista),
      { ...criarPendente(2, TEXTO_A, lista), situacao: 'falhou' as const },
    ];
    const exibidas = mensagensParaExibir(lista, pendentes, OUTRO, AGORA);
    expect(exibidas).toHaveLength(TETO_DE_MENSAGENS_NO_CACHE + 2);
    expect(exibidas.slice(-2).map((m) => m.chave)).toEqual([
      'local-1',
      'local-2',
    ]);
  });

  it('mensagem minha antiga de mesmo texto, ainda no cache, não casa', () => {
    const antes = [...cheia().slice(1), msg('m-velha', EU, TEXTO_A)];
    const criada = {
      ...criarPendente(1, TEXTO_A, antes),
      situacao: 'falhou' as const,
    };
    const depois = mesclarPagina(antes, [msg('o1', OUTRO, TEXTO_B)]);
    expect(chaves(reconciliar(depois, [criada], OUTRO))).toEqual(['local-1']);
  });
});

describe('mensagensParaExibir', () => {
  it('lista vazia sem confirmadas nem pendentes', () => {
    expect(mensagensParaExibir([], [], OUTRO, AGORA)).toEqual([]);
  });

  it('confirmadas na ordem do GET, minha = autor diferente do outro (ADR-003)', () => {
    const confirmadas = [
      msg('m2', OUTRO, TEXTO_A, ONTEM_0905),
      msg('m1', EU, TEXTO_B),
      msg('m3', 'conta-qualquer', TEXTO_A),
    ];
    expect(mensagensParaExibir(confirmadas, [], OUTRO, AGORA)).toEqual([
      {
        chave: 'm2',
        minha: false,
        texto: TEXTO_A,
        horaFormatada: '20/10 09:05',
        situacao: 'enviada',
        diaFormatado: ONTEM,
      },
      {
        chave: 'm1',
        minha: true,
        texto: TEXTO_B,
        horaFormatada: '14:32',
        situacao: 'enviada',
        diaFormatado: HOJE,
      },
      {
        chave: 'm3',
        minha: true,
        texto: TEXTO_A,
        horaFormatada: '14:32',
        situacao: 'enviada',
        diaFormatado: HOJE,
      },
    ]);
  });

  it('pendentes depois das confirmadas, na ordem de criação, com chave local', () => {
    const confirmadas = [msg('m1', OUTRO, TEXTO_A)];
    const pendentes = [
      pendente({ chave: 'local-1', texto: TEXTO_B, situacao: 'falhou' }),
      pendente({
        chave: 'local-2',
        texto: TEXTO_A,
        situacao: 'enviada',
        id: 'm9',
        enviadaEm: HOJE_1432,
      }),
      pendente({ chave: 'local-3', texto: TEXTO_B, ancora: 'm1' }),
    ];
    expect(mensagensParaExibir(confirmadas, pendentes, OUTRO, AGORA)).toEqual([
      {
        chave: 'm1',
        minha: false,
        texto: TEXTO_A,
        horaFormatada: '14:32',
        situacao: 'enviada',
        diaFormatado: HOJE,
      },
      {
        chave: 'local-1',
        minha: true,
        texto: TEXTO_B,
        horaFormatada: null,
        situacao: 'falhou',
        diaFormatado: HOJE,
      },
      {
        chave: 'local-2',
        minha: true,
        texto: TEXTO_A,
        horaFormatada: '14:32',
        situacao: 'enviada',
        diaFormatado: HOJE,
      },
      {
        chave: 'local-3',
        minha: true,
        texto: TEXTO_B,
        horaFormatada: null,
        situacao: 'enviando',
        diaFormatado: HOJE,
      },
    ]);
  });

  it('não repete a mensagem que já veio no GET (por id ou por texto)', () => {
    const confirmadas = [msg('m1', EU, TEXTO_A), msg('m2', EU, TEXTO_B)];
    const pendentes = [
      pendente({ chave: 'local-1', id: 'm1', situacao: 'enviada' }),
      pendente({ chave: 'local-2', texto: TEXTO_B, situacao: 'falhou' }),
      pendente({ chave: 'local-3', texto: TEXTO_A }),
    ];
    expect(
      chaves(mensagensParaExibir(confirmadas, pendentes, OUTRO, AGORA)),
    ).toEqual(['m1', 'm2', 'local-3']);
  });

  it('as chaves nunca são o texto (CA15)', () => {
    const lista = mensagensParaExibir(
      [msg('m1', OUTRO, TEXTO_A)],
      [pendente({ chave: 'local-1', texto: TEXTO_B })],
      OUTRO,
      AGORA,
    );
    for (const item of lista) {
      expect(item.chave).not.toContain('sentinela');
    }
  });
});

describe('mensagensParaExibir: dia do separador', () => {
  it('virada de dia: 23:59 de ontem é "Ontem", 00:00 de hoje é "Hoje"', () => {
    const agora = new Date(2026, 9, 21, 0, 5);
    const lista = mensagensParaExibir(
      [
        msg('m1', OUTRO, TEXTO_A, new Date(2026, 9, 20, 23, 59).toISOString()),
        msg('m2', EU, TEXTO_B, new Date(2026, 9, 21, 0, 0).toISOString()),
      ],
      [],
      OUTRO,
      agora,
    );
    expect(lista.map((m) => m.diaFormatado)).toEqual([ONTEM, HOJE]);
  });

  it('mais antiga que ontem vira a data (dd/mm/aaaa), no fuso do aparelho', () => {
    const lista = mensagensParaExibir(
      [
        msg('m1', OUTRO, TEXTO_A, new Date(2026, 9, 19, 23, 59).toISOString()),
        msg('m2', OUTRO, TEXTO_A, new Date(2025, 11, 31, 8, 0).toISOString()),
      ],
      [],
      OUTRO,
      AGORA,
    );
    expect(lista.map((m) => m.diaFormatado)).toEqual([
      '19/10/2026',
      '31/12/2025',
    ]);
  });

  it('pendente sem hora confirmada conta como de hoje', () => {
    const lista = mensagensParaExibir(
      [msg('m1', OUTRO, TEXTO_A, ONTEM_0905)],
      [pendente({ chave: 'local-1', texto: TEXTO_B })],
      OUTRO,
      AGORA,
    );
    expect(lista.map((m) => m.diaFormatado)).toEqual([ONTEM, HOJE]);
  });

  it('instante inválido não ganha separador', () => {
    const lista = mensagensParaExibir(
      [msg('m1', OUTRO, TEXTO_A, 'sem-data')],
      [],
      OUTRO,
      AGORA,
    );
    expect(lista[0]?.diaFormatado).toBeNull();
  });
});

describe('vinculoDaConversa e temRespostasRapidas', () => {
  function trampo(
    id: string,
    autorId: string,
    parcial: Partial<Trampo> = {},
  ): Trampo {
    return {
      id,
      autorId,
      titulo: `sentinela-titulo-${id}`,
      descricao: 'sentinela-descricao',
      categoria: 'outros',
      cidade: 'sentinela-cidade',
      valorCentavos: 12000,
      prazo: null,
      status: 'aberto',
      criadoEm: '2026-10-01T10:00:00.000Z',
      ...parcial,
    };
  }

  function minha(
    id: string,
    trampoId: string,
    status: StatusDaCandidatura,
    criadaEm = '2026-10-10T10:00:00.000Z',
  ): MinhaCandidatura {
    return {
      id,
      trampoId,
      freelancerId: EU,
      mensagem: 'sentinela-mensagem',
      valorPropostoCentavos: 10000,
      status,
      criadaEm,
    };
  }

  function recebida(
    id: string,
    freelancerId: string,
    status: StatusDaCandidatura,
  ): CandidaturaRecebida {
    return {
      id,
      freelancerId,
      mensagem: 'sentinela-mensagem',
      valorPropostoCentavos: 10000,
      status,
      criadaEm: '2026-10-10T10:00:00.000Z',
    };
  }

  const semDados = {
    minhasCandidaturas: undefined,
    recebidas: new Map<string, readonly CandidaturaRecebida[]>(),
    trampo: () => undefined,
  };

  it('sem nada em cache: sem vínculo e sem respostas rápidas', () => {
    expect(vinculoDaConversa(semDados, OUTRO)).toBeNull();
    expect(temRespostasRapidas(null)).toBe(false);
  });

  it('freela: a candidatura aceita no trampo do outro', () => {
    const trampos = new Map([
      ['t1', trampo('t1', OUTRO)],
      ['t2', trampo('t2', OUTRO, { valorCentavos: 9000 })],
      ['t3', trampo('t3', 'conta-terceira')],
    ]);
    const vinculo = vinculoDaConversa(
      {
        ...semDados,
        minhasCandidaturas: [
          minha('c1', 't1', 'pendente', '2026-10-12T10:00:00.000Z'),
          minha('c2', 't2', 'aceita', '2026-10-05T10:00:00.000Z'),
          minha('c3', 't3', 'aceita'),
        ],
        trampo: (id) => trampos.get(id),
      },
      OUTRO,
    );
    expect(vinculo).toEqual<VinculoDaConversa>({
      trampoId: 't2',
      titulo: 'sentinela-titulo-t2',
      valorCentavos: 9000,
      statusDaCandidatura: 'aceita',
      statusDoTrampo: 'aberto',
      papel: 'candidato',
    });
    expect(temRespostasRapidas(vinculo)).toBe(true);
  });

  it('freela: com o mesmo status, vale a mais recente', () => {
    const trampos = new Map([
      ['t1', trampo('t1', OUTRO)],
      ['t2', trampo('t2', OUTRO)],
    ]);
    const vinculo = vinculoDaConversa(
      {
        ...semDados,
        minhasCandidaturas: [
          minha('c1', 't1', 'pendente', '2026-10-05T10:00:00.000Z'),
          minha('c2', 't2', 'pendente', '2026-10-12T10:00:00.000Z'),
        ],
        trampo: (id) => trampos.get(id),
      },
      OUTRO,
    );
    expect(vinculo?.trampoId).toBe('t2');
    // Em análise: tem contexto, mas não respostas rápidas.
    expect(temRespostasRapidas(vinculo)).toBe(false);
  });

  it('freela: trampo ainda não lido não liga a conversa', () => {
    expect(
      vinculoDaConversa(
        { ...semDados, minhasCandidaturas: [minha('c1', 't1', 'aceita')] },
        OUTRO,
      ),
    ).toBeNull();
  });

  it.each([
    ['recusada', 'recusada', 'aberto'],
    ['trampo encerrado', 'aceita', 'encerrado'],
  ] as const)(
    'freela, %s: sem respostas rápidas',
    (_nome, status, statusDoTrampo) => {
      const vinculo = vinculoDaConversa(
        {
          ...semDados,
          minhasCandidaturas: [minha('c1', 't1', status)],
          trampo: () => trampo('t1', OUTRO, { status: statusDoTrampo }),
        },
        OUTRO,
      );
      expect(vinculo?.statusDaCandidatura).toBe(status);
      expect(temRespostasRapidas(vinculo)).toBe(false);
    },
  );

  it('contratante: a candidatura do outro num trampo meu, sem respostas rápidas', () => {
    const vinculo = vinculoDaConversa(
      {
        ...semDados,
        recebidas: new Map([
          [
            't9',
            [
              recebida('r1', 'conta-terceira', 'aceita'),
              recebida('r2', OUTRO, 'aceita'),
            ],
          ],
        ]),
        trampo: (id) => (id === 't9' ? trampo('t9', EU) : undefined),
      },
      OUTRO,
    );
    expect(vinculo).toEqual(
      expect.objectContaining({
        trampoId: 't9',
        papel: 'autor',
        statusDaCandidatura: 'aceita',
      }),
    );
    expect(temRespostasRapidas(vinculo)).toBe(false);
  });
});

describe('conversaParaExibir', () => {
  const NOME = 'sentinela-nome';

  function perfil(contaId: string): PerfilPublico {
    return {
      contaId,
      nome: NOME,
      cidade: 'sentinela-cidade',
      descricao: null,
      habilidades: [],
    };
  }

  function resumo(parcial: Partial<ResumoDeConversa> = {}): ResumoDeConversa {
    return {
      conversaId: 'c1',
      outroUsuarioId: OUTRO,
      criadaEm: ONTEM_0905,
      ultimaMensagem: { texto: TEXTO_A, enviadaEm: HOJE_1432 },
      ...parcial,
    };
  }

  it('nome do perfil, prévia e hora da última mensagem', () => {
    expect(
      conversaParaExibir(resumo(), new Map([[OUTRO, perfil(OUTRO)]]), AGORA),
    ).toEqual({
      id: 'c1',
      nome: NOME,
      previa: TEXTO_A,
      horaFormatada: '14:32',
    });
  });

  it.each([
    ['perfil em 404', new Map([[OUTRO, null]])],
    ['perfil ainda carregando', new Map()],
    ['só o perfil de outra conta', new Map([[EU, perfil(EU)]])],
  ])('%s: nome null (Perfil indisponível)', (_nome, perfis) => {
    expect(conversaParaExibir(resumo(), perfis, AGORA).nome).toBeNull();
  });

  it('sem mensagem: prévia null e a hora da criação da conversa', () => {
    const item = conversaParaExibir(
      resumo({ ultimaMensagem: null }),
      new Map(),
      AGORA,
    );
    expect(item.previa).toBeNull();
    expect(item.horaFormatada).toBe('20/10 09:05');
  });

  it('a prévia vem numa linha só', () => {
    const item = conversaParaExibir(
      resumo({
        ultimaMensagem: {
          texto: `${TEXTO_A}\n\n  ${TEXTO_B}\t`,
          enviadaEm: HOJE_1432,
        },
      }),
      new Map(),
      AGORA,
    );
    expect(item.previa).toBe(`${TEXTO_A} ${TEXTO_B}`);
  });
});
