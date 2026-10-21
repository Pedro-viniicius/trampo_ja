import { criarFetchFalso, type FetchFalso } from '../testes/fetch-falso';
import { type ClienteHttp, criarCliente } from './cliente';
import { ErroDaApi } from './erros';
import { listarMeusServicos, ofertarServico } from './servicos';
import type {
  CandidaturaRecebida,
  EntradaDeCandidatura,
  EntradaDeServico,
  EntradaDeTrampo,
  MinhaCandidatura,
  Servico,
  Trampo,
} from './tipos';
import {
  aceitarCandidatura,
  candidatar,
  listarCandidaturasDoTrampo,
  listarMeusTrampos,
  listarMinhasCandidaturas,
  publicarTrampo,
} from './trampos';

const URL_BASE = 'http://192.168.0.10:3000';
const TOKEN = 'token-da-sessao';

/** Id com caracteres que mudariam o caminho ou a query se fossem crus. */
const ID_ESPECIAL = 'a b/c?d#e';
const ID_ESPECIAL_CODIFICADO = 'a%20b%2Fc%3Fd%23e';
const OUTRO_ID_ESPECIAL = 'x/../y';
const OUTRO_ID_ESPECIAL_CODIFICADO = 'x%2F..%2Fy';

/** Sentinelas do texto livre e do valor: nunca podem aparecer num erro. */
const MENSAGEM =
  'Sentinela-mensagem: faço o serviço amanhã, ligue 35 99999-0000';
const VALOR_PROPOSTO = 987_654_321;

interface Montagem {
  readonly cliente: ClienteHttp;
  readonly falso: FetchFalso;
  readonly aoExpirar: jest.Mock;
}

function montar(): Montagem {
  const falso = criarFetchFalso();
  const aoExpirar = jest.fn();
  const cliente = criarCliente({
    fetch: falso.fetch,
    urlBase: URL_BASE,
    obterToken: async () => TOKEN,
    aoExpirar,
  });
  return { cliente, falso, aoExpirar };
}

async function capturar(promessa: Promise<unknown>): Promise<ErroDaApi> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof ErroDaApi) {
      return erro;
    }
    throw erro;
  }
  throw new Error('a promessa deveria ter falhado');
}

/** O erro não pode carregar nada do que a pessoa digitou (CA15). */
function esperarSemDadoDigitado(
  erro: ErroDaApi,
  sentinelas: readonly string[],
): void {
  for (const sentinela of sentinelas) {
    expect(erro.message).not.toContain(sentinela);
    expect(JSON.stringify(erro)).not.toContain(sentinela);
    expect(String(erro)).not.toContain(sentinela);
  }
}

const TRAMPO: Trampo = {
  id: 't1',
  autorId: 'a1',
  titulo: 'Pintar muro',
  descricao: 'Muro de 10 m',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 15000,
  prazo: null,
  status: 'aberto',
  criadoEm: '2026-10-20T12:00:00.000Z',
};

const SERVICO: Servico = {
  id: 's1',
  autorId: 'a1',
  titulo: 'Aulas de violão',
  descricao: 'Online ou presencial',
  categoria: 'aulas',
  cidade: null,
  precoBaseCentavos: 8000,
  status: 'ativo',
  criadoEm: '2026-10-19T12:00:00.000Z',
};

const CANDIDATURA: CandidaturaRecebida = {
  id: 'c1',
  freelancerId: 'f1',
  mensagem: 'Posso amanhã',
  valorPropostoCentavos: 14000,
  status: 'pendente',
  criadaEm: '2026-10-21T09:00:00.000Z',
};

const ENTRADA_DO_TRAMPO: EntradaDeTrampo = {
  titulo: 'Pintar muro',
  descricao: 'Muro de 10 m',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 15000,
};

const ENTRADA_DO_SERVICO: EntradaDeServico = {
  titulo: 'Aulas de violão',
  descricao: 'Online ou presencial',
  categoria: 'aulas',
  precoBaseCentavos: 8000,
};

const ENTRADA_DA_CANDIDATURA: EntradaDeCandidatura = {
  mensagem: MENSAGEM,
  valorPropostoCentavos: VALOR_PROPOSTO,
};

describe('publicarTrampo (CA4, CA5)', () => {
  it('faz POST /trampos com token, só com as chaves aceitas, e devolve {id, status}', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /trampos', {
      status: 201,
      corpo: { id: 't9', status: 'aberto' },
    });

    const criado = await publicarTrampo(cliente, {
      ...ENTRADA_DO_TRAMPO,
      prazo: '2026-12-31',
      autorId: 'outra-conta',
      status: 'em_andamento',
    } as never);

    expect(criado).toEqual({ id: 't9', status: 'aberto' });
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('POST');
    expect(requisicao.url).toBe(`${URL_BASE}/trampos`);
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.cabecalhos['content-type']).toBe('application/json');
    expect(requisicao.corpo).toEqual({
      titulo: 'Pintar muro',
      descricao: 'Muro de 10 m',
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 15000,
      prazo: '2026-12-31',
    });
  });

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['vazio', ''],
    ['em branco', '   '],
  ])('omite o prazo %s', async (_nome, prazo) => {
    const { cliente, falso } = montar();
    falso.responder('POST /trampos', {
      status: 201,
      corpo: { id: 't9', status: 'aberto' },
    });

    await publicarTrampo(cliente, { ...ENTRADA_DO_TRAMPO, prazo });

    expect(falso.ultima().corpo).toEqual({
      titulo: 'Pintar muro',
      descricao: 'Muro de 10 m',
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 15000,
    });
    expect(falso.ultima().corpo).not.toHaveProperty('prazo');
  });

  it('manda a cidade e os demais campos mesmo vazios, para a API apontar o campo (CA5)', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /trampos', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [
          { campo: 'titulo', motivo: 'tamanho' },
          { campo: 'cidade', motivo: 'obrigatorio' },
          { campo: 'valorCentavos', motivo: 'invalido' },
        ],
      },
    });

    const erro = await capturar(
      publicarTrampo(cliente, {
        ...ENTRADA_DO_TRAMPO,
        titulo: 'Sentinela-título',
        cidade: '',
        valorCentavos: 0,
      }),
    );

    expect(falso.ultima().corpo).toMatchObject({
      cidade: '',
      valorCentavos: 0,
    });
    expect(erro).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
      campos: [
        { campo: 'titulo', motivo: 'tamanho' },
        { campo: 'cidade', motivo: 'obrigatorio' },
        { campo: 'valorCentavos', motivo: 'invalido' },
      ],
    });
    esperarSemDadoDigitado(erro, ['Sentinela-título', 'Muro de 10 m']);
  });

  it('409 perfil_incompleto sobe como ErroDaApi (D9)', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /trampos', {
      status: 409,
      corpo: { erro: 'perfil_incompleto' },
    });

    const erro = await capturar(publicarTrampo(cliente, ENTRADA_DO_TRAMPO));

    expect(erro).toMatchObject({ status: 409, codigo: 'perfil_incompleto' });
    expect(erro.campos).toEqual([]);
    expect(aoExpirar).not.toHaveBeenCalled();
  });
});

describe('ofertarServico (CA6)', () => {
  it('faz POST /servicos com token, só com as chaves aceitas, e devolve {id, status}', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /servicos', {
      status: 201,
      corpo: { id: 's9', status: 'ativo' },
    });

    const criado = await ofertarServico(cliente, {
      ...ENTRADA_DO_SERVICO,
      cidade: 'Lavras',
      autorId: 'outra-conta',
      prazo: '2026-12-31',
    } as never);

    expect(criado).toEqual({ id: 's9', status: 'ativo' });
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('POST');
    expect(requisicao.url).toBe(`${URL_BASE}/servicos`);
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.corpo).toEqual({
      titulo: 'Aulas de violão',
      descricao: 'Online ou presencial',
      categoria: 'aulas',
      cidade: 'Lavras',
      precoBaseCentavos: 8000,
    });
  });

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['vazia', ''],
    ['em branco', '  '],
  ])('omite a cidade %s (D7)', async (_nome, cidade) => {
    const { cliente, falso } = montar();
    falso.responder('POST /servicos', {
      status: 201,
      corpo: { id: 's9', status: 'ativo' },
    });

    await ofertarServico(cliente, { ...ENTRADA_DO_SERVICO, cidade });

    expect(falso.ultima().corpo).toEqual({
      titulo: 'Aulas de violão',
      descricao: 'Online ou presencial',
      categoria: 'aulas',
      precoBaseCentavos: 8000,
    });
    expect(falso.ultima().corpo).not.toHaveProperty('cidade');
  });

  it('400 traz os campos, sem o que foi digitado', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /servicos', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'precoBaseCentavos', motivo: 'invalido' }],
      },
    });

    const erro = await capturar(
      ofertarServico(cliente, {
        ...ENTRADA_DO_SERVICO,
        descricao: 'Sentinela-descrição',
        precoBaseCentavos: -1,
      }),
    );

    expect(erro).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
      campos: [{ campo: 'precoBaseCentavos', motivo: 'invalido' }],
    });
    esperarSemDadoDigitado(erro, ['Sentinela-descrição', 'Aulas de violão']);
  });

  it('409 perfil_incompleto sobe como ErroDaApi (D9)', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /servicos', {
      status: 409,
      corpo: { erro: 'perfil_incompleto' },
    });

    await expect(
      capturar(ofertarServico(cliente, ENTRADA_DO_SERVICO)),
    ).resolves.toMatchObject({ status: 409, codigo: 'perfil_incompleto' });
  });
});

describe('candidatar (CA8, CA9, CA11)', () => {
  it('faz POST /trampos/:id/candidaturas com o id codificado e só {mensagem, valorPropostoCentavos}', async () => {
    const { cliente, falso } = montar();
    falso.responder(`POST /trampos/${ID_ESPECIAL_CODIFICADO}/candidaturas`, {
      status: 201,
      corpo: { id: 'c9', status: 'pendente' },
    });

    const criada = await candidatar(cliente, ID_ESPECIAL, {
      ...ENTRADA_DA_CANDIDATURA,
      status: 'aceita',
      freelancerId: 'outra-conta',
    } as never);

    expect(criada).toEqual({ id: 'c9', status: 'pendente' });
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('POST');
    expect(requisicao.url).toBe(
      `${URL_BASE}/trampos/${ID_ESPECIAL_CODIFICADO}/candidaturas`,
    );
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.corpo).toEqual({
      mensagem: MENSAGEM,
      valorPropostoCentavos: VALOR_PROPOSTO,
    });
  });

  it.each([
    'perfil_incompleto',
    'candidatura_duplicada',
    'autor_nao_pode_candidatar',
    'trampo_nao_aberto',
    'conflito_de_versao',
  ])(
    '409 %s sobe com o código e sem a mensagem nem o valor',
    async (codigo) => {
      const { cliente, falso, aoExpirar } = montar();
      // Mesmo que a resposta ecoasse o texto, ele não entra no erro.
      falso.responder('POST /trampos/t1/candidaturas', {
        status: 409,
        corpo: {
          erro: codigo,
          mensagem: MENSAGEM,
          valorPropostoCentavos: VALOR_PROPOSTO,
        },
      });

      const erro = await capturar(
        candidatar(cliente, 't1', ENTRADA_DA_CANDIDATURA),
      );

      expect(erro).toBeInstanceOf(ErroDaApi);
      expect(erro).toMatchObject({ status: 409, codigo, campos: [] });
      esperarSemDadoDigitado(erro, [MENSAGEM, String(VALOR_PROPOSTO)]);
      expect(aoExpirar).not.toHaveBeenCalled();
    },
  );

  it('400 traz os campos, sem a mensagem nem o valor', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /trampos/t1/candidaturas', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [
          { campo: 'mensagem', motivo: 'tamanho' },
          { campo: 'valorPropostoCentavos', motivo: 'invalido' },
        ],
      },
    });

    const erro = await capturar(
      candidatar(cliente, 't1', ENTRADA_DA_CANDIDATURA),
    );

    expect(erro).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
      campos: [
        { campo: 'mensagem', motivo: 'tamanho' },
        { campo: 'valorPropostoCentavos', motivo: 'invalido' },
      ],
    });
    esperarSemDadoDigitado(erro, [MENSAGEM, String(VALOR_PROPOSTO)]);
  });

  it('trampo inexistente lança nao_encontrado', async () => {
    const { cliente } = montar();

    const erro = await capturar(
      candidatar(cliente, 'nao-existe', ENTRADA_DA_CANDIDATURA),
    );

    expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });

  it('id "..", "." ou vazio lança nao_encontrado sem requisição', async () => {
    const { cliente, falso } = montar();

    for (const id of ['..', '.', '']) {
      const erro = await capturar(
        candidatar(cliente, id, ENTRADA_DA_CANDIDATURA),
      );
      expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
    }
    expect(falso.requisicoes).toHaveLength(0);
  });
});

describe('listarCandidaturasDoTrampo (CA8)', () => {
  it('faz GET /trampos/:id/candidaturas com o id codificado e devolve a lista', async () => {
    const { cliente, falso } = montar();
    const recusada: CandidaturaRecebida = {
      ...CANDIDATURA,
      id: 'c2',
      freelancerId: 'f2',
      status: 'recusada',
    };
    falso.responder(`GET /trampos/${ID_ESPECIAL_CODIFICADO}/candidaturas`, {
      corpo: [CANDIDATURA, recusada],
    });

    await expect(
      listarCandidaturasDoTrampo(cliente, ID_ESPECIAL),
    ).resolves.toEqual([CANDIDATURA, recusada]);
    expect(falso.ultima().metodo).toBe('GET');
    expect(falso.ultima().url).toBe(
      `${URL_BASE}/trampos/${ID_ESPECIAL_CODIFICADO}/candidaturas`,
    );
    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('quem não é o autor recebe nao_encontrado', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /trampos/t1/candidaturas', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    const erro = await capturar(listarCandidaturasDoTrampo(cliente, 't1'));

    expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });
});

describe('aceitarCandidatura (CA10)', () => {
  const ROTA = `POST /trampos/${ID_ESPECIAL_CODIFICADO}/candidaturas/${OUTRO_ID_ESPECIAL_CODIFICADO}/aceitar`;

  it('faz POST com os dois ids codificados, sem corpo e sem Content-Type, e devolve {status: "aceita"}', async () => {
    const { cliente, falso } = montar();
    falso.responder(ROTA, { corpo: { status: 'aceita' } });

    const resultado = await aceitarCandidatura(
      cliente,
      ID_ESPECIAL,
      OUTRO_ID_ESPECIAL,
    );

    expect(resultado).toEqual({ status: 'aceita' });
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('POST');
    expect(requisicao.url).toBe(
      `${URL_BASE}/trampos/${ID_ESPECIAL_CODIFICADO}/candidaturas/${OUTRO_ID_ESPECIAL_CODIFICADO}/aceitar`,
    );
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.corpo).toBeUndefined();
    expect(requisicao.cabecalhos).not.toHaveProperty('content-type');
  });

  it.each([
    'trampo_nao_aberto',
    'candidatura_nao_pendente',
    'conflito_de_versao',
  ])('409 %s sobe como ErroDaApi', async (codigo) => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /trampos/t1/candidaturas/c1/aceitar', {
      status: 409,
      corpo: { erro: codigo },
    });

    const erro = await capturar(aceitarCandidatura(cliente, 't1', 'c1'));

    expect(erro).toMatchObject({ status: 409, codigo, campos: [] });
    expect(aoExpirar).not.toHaveBeenCalled();
  });

  it('quem não é o autor recebe nao_encontrado', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /trampos/t1/candidaturas/c1/aceitar', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    const erro = await capturar(aceitarCandidatura(cliente, 't1', 'c1'));

    expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });

  it.each([
    ['..', 'c1'],
    ['t1', '..'],
    ['', 'c1'],
    ['t1', '.'],
  ])(
    'ids ("%s", "%s") que mudariam o caminho lançam nao_encontrado sem requisição',
    async (trampoId, candidaturaId) => {
      const { cliente, falso } = montar();

      const erro = await capturar(
        aceitarCandidatura(cliente, trampoId, candidaturaId),
      );

      expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
      expect(falso.requisicoes).toHaveLength(0);
    },
  );
});

describe('listas "minhas"', () => {
  it('listarMeusTrampos faz GET /trampos/meus e devolve os trampos com status', async () => {
    const { cliente, falso } = montar();
    const emAndamento: Trampo = { ...TRAMPO, id: 't2', status: 'em_andamento' };
    falso.responder('GET /trampos/meus', { corpo: [TRAMPO, emAndamento] });

    const trampos = await listarMeusTrampos(cliente);

    expect(trampos).toEqual([TRAMPO, emAndamento]);
    expect(trampos.map((trampo) => trampo.status)).toEqual([
      'aberto',
      'em_andamento',
    ]);
    expect(falso.ultima().metodo).toBe('GET');
    expect(falso.ultima().url).toBe(`${URL_BASE}/trampos/meus`);
  });

  it('listarMinhasCandidaturas faz GET /candidaturas/minhas e devolve as candidaturas com trampoId', async () => {
    const { cliente, falso } = montar();
    const minhas: MinhaCandidatura[] = [
      { ...CANDIDATURA, trampoId: 't1' },
      { ...CANDIDATURA, id: 'c2', trampoId: 't2', status: 'aceita' },
      { ...CANDIDATURA, id: 'c3', trampoId: 't3', status: 'recusada' },
    ];
    falso.responder('GET /candidaturas/minhas', { corpo: minhas });

    await expect(listarMinhasCandidaturas(cliente)).resolves.toEqual(minhas);
    expect(falso.ultima().metodo).toBe('GET');
    expect(falso.ultima().url).toBe(`${URL_BASE}/candidaturas/minhas`);
  });

  it('listarMeusServicos faz GET /servicos/meus e devolve os serviços', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /servicos/meus', { corpo: [SERVICO] });

    await expect(listarMeusServicos(cliente)).resolves.toEqual([SERVICO]);
    expect(falso.ultima().metodo).toBe('GET');
    expect(falso.ultima().url).toBe(`${URL_BASE}/servicos/meus`);
  });

  it('listas vazias chegam vazias', async () => {
    const { cliente, falso } = montar();
    falso
      .responder('GET /trampos/meus', { corpo: [] })
      .responder('GET /candidaturas/minhas', { corpo: [] })
      .responder('GET /servicos/meus', { corpo: [] });

    await expect(listarMeusTrampos(cliente)).resolves.toEqual([]);
    await expect(listarMinhasCandidaturas(cliente)).resolves.toEqual([]);
    await expect(listarMeusServicos(cliente)).resolves.toEqual([]);
  });
});

describe('autenticação (CA14)', () => {
  type Chamada = readonly [
    rota: string,
    chamar: (cliente: ClienteHttp) => Promise<unknown>,
  ];

  const CHAMADAS: readonly Chamada[] = [
    ['POST /trampos', (c) => publicarTrampo(c, ENTRADA_DO_TRAMPO)],
    ['GET /trampos/meus', (c) => listarMeusTrampos(c)],
    [
      'POST /trampos/t1/candidaturas',
      (c) => candidatar(c, 't1', ENTRADA_DA_CANDIDATURA),
    ],
    [
      'GET /trampos/t1/candidaturas',
      (c) => listarCandidaturasDoTrampo(c, 't1'),
    ],
    [
      'POST /trampos/t1/candidaturas/c1/aceitar',
      (c) => aceitarCandidatura(c, 't1', 'c1'),
    ],
    ['GET /candidaturas/minhas', (c) => listarMinhasCandidaturas(c)],
    ['POST /servicos', (c) => ofertarServico(c, ENTRADA_DO_SERVICO)],
    ['GET /servicos/meus', (c) => listarMeusServicos(c)],
  ];

  it.each(CHAMADAS)('%s leva o Bearer', async (rota, chamar) => {
    const { cliente, falso } = montar();
    falso.responder(rota, { corpo: {} });

    await chamar(cliente);

    expect(falso.requisicoes).toHaveLength(1);
    expect(`${falso.ultima().metodo} ${falso.ultima().caminho}`).toBe(rota);
    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it.each(CHAMADAS)(
    '%s com 401 vira sessao_expirada e chama aoExpirar',
    async (rota, chamar) => {
      const { cliente, falso, aoExpirar } = montar();
      falso.responder(rota, {
        status: 401,
        corpo: { erro: 'nao_autenticado' },
      });

      const erro = await capturar(chamar(cliente));

      expect(erro).toMatchObject({ status: 401, codigo: 'sessao_expirada' });
      expect(aoExpirar).toHaveBeenCalledWith(TOKEN);
    },
  );
});
