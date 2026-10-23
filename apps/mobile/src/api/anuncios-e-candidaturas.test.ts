import { criarFetchFalso, type FetchFalso } from '../testes/fetch-falso';
import { type ClienteHttp, criarCliente } from './cliente';
import { ErroDaApi } from './erros';
import {
  editarServico,
  excluirServico,
  listarMeusServicos,
  ofertarServico,
} from './servicos';
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
  editarTrampo,
  encerrarTrampo,
  excluirTrampo,
  listarCandidaturasDoTrampo,
  listarMeusTrampos,
  listarMinhasCandidaturas,
  publicarTrampo,
  retirarCandidatura,
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

/** Sentinelas do que a pessoa digita ao editar: nunca na URL nem no erro. */
const TITULO_EDITADO = 'Sentinela-título editado';
const DESCRICAO_EDITADA = 'Sentinela-descrição editada, ligue 35 98888-7777';

describe('editarTrampo (CA32)', () => {
  const ENTRADA = {
    ...ENTRADA_DO_TRAMPO,
    titulo: TITULO_EDITADO,
    descricao: DESCRICAO_EDITADA,
    prazo: '2026-12-31',
    versao: 3,
  };

  it('faz PUT /trampos/:id com o id codificado, token, só as chaves aceitas e a versão, e resolve em 204', async () => {
    const { cliente, falso } = montar();
    falso.responder(`PUT /trampos/${ID_ESPECIAL_CODIFICADO}`, { status: 204 });

    const resultado = await editarTrampo(cliente, ID_ESPECIAL, {
      ...ENTRADA,
      autorId: 'outra-conta',
      status: 'encerrado',
      criadoEm: '2020-01-01T00:00:00.000Z',
    } as never);

    expect(resultado).toBeUndefined();
    expect(falso.requisicoes).toHaveLength(1);
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('PUT');
    expect(requisicao.url).toBe(
      `${URL_BASE}/trampos/${ID_ESPECIAL_CODIFICADO}`,
    );
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.cabecalhos['content-type']).toBe('application/json');
    expect(requisicao.corpo).toEqual({
      titulo: TITULO_EDITADO,
      descricao: DESCRICAO_EDITADA,
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 15000,
      prazo: '2026-12-31',
      versao: 3,
    });
  });

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['vazio', ''],
    ['em branco', '  '],
  ])('omite o prazo %s: a API remove o prazo', async (_nome, prazo) => {
    const { cliente, falso } = montar();
    falso.responder('PUT /trampos/t1', { status: 204 });

    await editarTrampo(cliente, 't1', { ...ENTRADA, prazo });

    expect(falso.ultima().corpo).toEqual({
      titulo: TITULO_EDITADO,
      descricao: DESCRICAO_EDITADA,
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 15000,
      versao: 3,
    });
    expect(falso.ultima().corpo).not.toHaveProperty('prazo');
  });

  it('o texto digitado não vai para a URL', async () => {
    const { cliente, falso } = montar();
    falso.responder('PUT /trampos/t1', { status: 204 });

    await editarTrampo(cliente, 't1', ENTRADA);

    expect(falso.ultima().url).toBe(`${URL_BASE}/trampos/t1`);
  });

  it('400 traz os campos, sem o que foi digitado', async () => {
    const { cliente, falso } = montar();
    falso.responder('PUT /trampos/t1', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'valorCentavos', motivo: 'invalido' }],
      },
    });

    const erro = await capturar(
      editarTrampo(cliente, 't1', { ...ENTRADA, valorCentavos: -1 }),
    );

    expect(erro).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
      campos: [{ campo: 'valorCentavos', motivo: 'invalido' }],
    });
    esperarSemDadoDigitado(erro, [TITULO_EDITADO, DESCRICAO_EDITADA]);
  });

  it('404 sobe como ErroDaApi nao_encontrado', async () => {
    const { cliente, falso } = montar();
    falso.responder('PUT /trampos/t1', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    const erro = await capturar(editarTrampo(cliente, 't1', ENTRADA));

    expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
    esperarSemDadoDigitado(erro, [TITULO_EDITADO, DESCRICAO_EDITADA]);
  });

  it.each(['trampo_nao_editavel', 'conflito_de_versao'])(
    '409 %s sobe como ErroDaApi',
    async (codigo) => {
      const { cliente, falso, aoExpirar } = montar();
      falso.responder('PUT /trampos/t1', {
        status: 409,
        corpo: { erro: codigo },
      });

      const erro = await capturar(editarTrampo(cliente, 't1', ENTRADA));

      expect(erro).toMatchObject({ status: 409, codigo, campos: [] });
      expect(aoExpirar).not.toHaveBeenCalled();
      esperarSemDadoDigitado(erro, [TITULO_EDITADO, DESCRICAO_EDITADA]);
    },
  );

  it('id ".." lança nao_encontrado sem requisição', async () => {
    const { cliente, falso } = montar();

    const erro = await capturar(editarTrampo(cliente, '..', ENTRADA));

    expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
    expect(falso.requisicoes).toHaveLength(0);
  });
});

describe('encerrarTrampo (CA33)', () => {
  it('faz POST /trampos/:id/encerrar com o id codificado, sem corpo e sem Content-Type, e resolve em 204', async () => {
    const { cliente, falso } = montar();
    falso.responder(`POST /trampos/${ID_ESPECIAL_CODIFICADO}/encerrar`, {
      status: 204,
    });

    const resultado = await encerrarTrampo(cliente, ID_ESPECIAL);

    expect(resultado).toBeUndefined();
    expect(falso.requisicoes).toHaveLength(1);
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('POST');
    expect(requisicao.url).toBe(
      `${URL_BASE}/trampos/${ID_ESPECIAL_CODIFICADO}/encerrar`,
    );
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.corpo).toBeUndefined();
    expect(requisicao.cabecalhos).not.toHaveProperty('content-type');
  });

  it('404 sobe como ErroDaApi nao_encontrado', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /trampos/t1/encerrar', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    await expect(
      capturar(encerrarTrampo(cliente, 't1')),
    ).resolves.toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });

  it('id ".." lança nao_encontrado sem requisição', async () => {
    const { cliente, falso } = montar();

    await expect(
      capturar(encerrarTrampo(cliente, '..')),
    ).resolves.toMatchObject({ status: 404, codigo: 'nao_encontrado' });
    expect(falso.requisicoes).toHaveLength(0);
  });
});

describe('excluirTrampo (CA33)', () => {
  it('faz DELETE /trampos/:id com o id codificado, sem corpo e sem Content-Type, e resolve em 204', async () => {
    const { cliente, falso } = montar();
    falso.responder(`DELETE /trampos/${ID_ESPECIAL_CODIFICADO}`, {
      status: 204,
    });

    const resultado = await excluirTrampo(cliente, ID_ESPECIAL);

    expect(resultado).toBeUndefined();
    expect(falso.requisicoes).toHaveLength(1);
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('DELETE');
    expect(requisicao.url).toBe(
      `${URL_BASE}/trampos/${ID_ESPECIAL_CODIFICADO}`,
    );
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.corpo).toBeUndefined();
    expect(requisicao.cabecalhos).not.toHaveProperty('content-type');
  });

  it('404 sobe como ErroDaApi nao_encontrado', async () => {
    const { cliente, falso } = montar();
    falso.responder('DELETE /trampos/t1', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    await expect(capturar(excluirTrampo(cliente, 't1'))).resolves.toMatchObject(
      { status: 404, codigo: 'nao_encontrado' },
    );
  });

  it('409 trampo_nao_aberto sobe como ErroDaApi', async () => {
    const { cliente, falso } = montar();
    falso.responder('DELETE /trampos/t1', {
      status: 409,
      corpo: { erro: 'trampo_nao_aberto' },
    });

    await expect(capturar(excluirTrampo(cliente, 't1'))).resolves.toMatchObject(
      {
        status: 409,
        codigo: 'trampo_nao_aberto',
        campos: [],
      },
    );
  });

  it('id ".." lança nao_encontrado sem requisição', async () => {
    const { cliente, falso } = montar();

    await expect(capturar(excluirTrampo(cliente, '..'))).resolves.toMatchObject(
      { status: 404, codigo: 'nao_encontrado' },
    );
    expect(falso.requisicoes).toHaveLength(0);
  });
});

describe('retirarCandidatura (CA34)', () => {
  it('faz DELETE /candidaturas/:id com o id codificado, sem corpo e sem Content-Type, e resolve em 204', async () => {
    const { cliente, falso } = montar();
    falso.responder(`DELETE /candidaturas/${ID_ESPECIAL_CODIFICADO}`, {
      status: 204,
    });

    const resultado = await retirarCandidatura(cliente, ID_ESPECIAL);

    expect(resultado).toBeUndefined();
    expect(falso.requisicoes).toHaveLength(1);
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('DELETE');
    expect(requisicao.url).toBe(
      `${URL_BASE}/candidaturas/${ID_ESPECIAL_CODIFICADO}`,
    );
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.corpo).toBeUndefined();
    expect(requisicao.cabecalhos).not.toHaveProperty('content-type');
  });

  it('404 sobe como ErroDaApi nao_encontrado', async () => {
    const { cliente, falso } = montar();
    falso.responder('DELETE /candidaturas/c1', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    await expect(
      capturar(retirarCandidatura(cliente, 'c1')),
    ).resolves.toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });

  it('409 candidatura_nao_pendente sobe como ErroDaApi', async () => {
    const { cliente, falso } = montar();
    falso.responder('DELETE /candidaturas/c1', {
      status: 409,
      corpo: { erro: 'candidatura_nao_pendente' },
    });

    await expect(
      capturar(retirarCandidatura(cliente, 'c1')),
    ).resolves.toMatchObject({
      status: 409,
      codigo: 'candidatura_nao_pendente',
      campos: [],
    });
  });

  it.each(['..', '.', ''])(
    'id "%s" lança nao_encontrado sem requisição',
    async (id) => {
      const { cliente, falso } = montar();

      await expect(
        capturar(retirarCandidatura(cliente, id)),
      ).resolves.toMatchObject({ status: 404, codigo: 'nao_encontrado' });
      expect(falso.requisicoes).toHaveLength(0);
    },
  );
});

describe('editarServico (CA32)', () => {
  const ENTRADA = {
    ...ENTRADA_DO_SERVICO,
    titulo: TITULO_EDITADO,
    descricao: DESCRICAO_EDITADA,
    cidade: 'Lavras',
    versao: 2,
  };

  it('faz PUT /servicos/:id com o id codificado, token, só as chaves aceitas e a versão, e resolve em 204', async () => {
    const { cliente, falso } = montar();
    falso.responder(`PUT /servicos/${ID_ESPECIAL_CODIFICADO}`, {
      status: 204,
    });

    const resultado = await editarServico(cliente, ID_ESPECIAL, {
      ...ENTRADA,
      autorId: 'outra-conta',
      status: 'ativo',
      prazo: '2026-12-31',
    } as never);

    expect(resultado).toBeUndefined();
    expect(falso.requisicoes).toHaveLength(1);
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('PUT');
    expect(requisicao.url).toBe(
      `${URL_BASE}/servicos/${ID_ESPECIAL_CODIFICADO}`,
    );
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.cabecalhos['content-type']).toBe('application/json');
    expect(requisicao.corpo).toEqual({
      titulo: TITULO_EDITADO,
      descricao: DESCRICAO_EDITADA,
      categoria: 'aulas',
      cidade: 'Lavras',
      precoBaseCentavos: 8000,
      versao: 2,
    });
  });

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['vazia', ''],
    ['em branco', '  '],
  ])(
    'omite a cidade %s: a API deixa o serviço sem cidade (D7)',
    async (_nome, cidade) => {
      const { cliente, falso } = montar();
      falso.responder('PUT /servicos/s1', { status: 204 });

      await editarServico(cliente, 's1', { ...ENTRADA, cidade });

      expect(falso.ultima().corpo).toEqual({
        titulo: TITULO_EDITADO,
        descricao: DESCRICAO_EDITADA,
        categoria: 'aulas',
        precoBaseCentavos: 8000,
        versao: 2,
      });
      expect(falso.ultima().corpo).not.toHaveProperty('cidade');
    },
  );

  it('400 traz os campos, sem o que foi digitado', async () => {
    const { cliente, falso } = montar();
    falso.responder('PUT /servicos/s1', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'precoBaseCentavos', motivo: 'invalido' }],
      },
    });

    const erro = await capturar(
      editarServico(cliente, 's1', { ...ENTRADA, precoBaseCentavos: -1 }),
    );

    expect(erro).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
      campos: [{ campo: 'precoBaseCentavos', motivo: 'invalido' }],
    });
    esperarSemDadoDigitado(erro, [TITULO_EDITADO, DESCRICAO_EDITADA]);
  });

  it('404 sobe como ErroDaApi nao_encontrado', async () => {
    const { cliente, falso } = montar();
    falso.responder('PUT /servicos/s1', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    const erro = await capturar(editarServico(cliente, 's1', ENTRADA));

    expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
    esperarSemDadoDigitado(erro, [TITULO_EDITADO, DESCRICAO_EDITADA]);
  });

  it('409 conflito_de_versao sobe como ErroDaApi', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('PUT /servicos/s1', {
      status: 409,
      corpo: { erro: 'conflito_de_versao' },
    });

    const erro = await capturar(editarServico(cliente, 's1', ENTRADA));

    expect(erro).toMatchObject({
      status: 409,
      codigo: 'conflito_de_versao',
      campos: [],
    });
    expect(aoExpirar).not.toHaveBeenCalled();
    esperarSemDadoDigitado(erro, [TITULO_EDITADO, DESCRICAO_EDITADA]);
  });

  it('id ".." lança nao_encontrado sem requisição', async () => {
    const { cliente, falso } = montar();

    await expect(
      capturar(editarServico(cliente, '..', ENTRADA)),
    ).resolves.toMatchObject({ status: 404, codigo: 'nao_encontrado' });
    expect(falso.requisicoes).toHaveLength(0);
  });
});

describe('excluirServico (CA33)', () => {
  it('faz DELETE /servicos/:id com o id codificado, sem corpo e sem Content-Type, e resolve em 204', async () => {
    const { cliente, falso } = montar();
    falso.responder(`DELETE /servicos/${ID_ESPECIAL_CODIFICADO}`, {
      status: 204,
    });

    const resultado = await excluirServico(cliente, ID_ESPECIAL);

    expect(resultado).toBeUndefined();
    expect(falso.requisicoes).toHaveLength(1);
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('DELETE');
    expect(requisicao.url).toBe(
      `${URL_BASE}/servicos/${ID_ESPECIAL_CODIFICADO}`,
    );
    expect(requisicao.cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requisicao.corpo).toBeUndefined();
    expect(requisicao.cabecalhos).not.toHaveProperty('content-type');
  });

  it('404 sobe como ErroDaApi nao_encontrado', async () => {
    const { cliente, falso } = montar();
    falso.responder('DELETE /servicos/s1', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    await expect(
      capturar(excluirServico(cliente, 's1')),
    ).resolves.toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });

  it('id ".." lança nao_encontrado sem requisição', async () => {
    const { cliente, falso } = montar();

    await expect(
      capturar(excluirServico(cliente, '..')),
    ).resolves.toMatchObject({ status: 404, codigo: 'nao_encontrado' });
    expect(falso.requisicoes).toHaveLength(0);
  });
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

  it('a visão do autor traz versao, candidaturasRecebidas e o status encerrado (D33, D34)', async () => {
    const { cliente, falso } = montar();
    const trampo: Trampo = {
      ...TRAMPO,
      status: 'encerrado',
      versao: 4,
      candidaturasRecebidas: 2,
    };
    const servico: Servico = { ...SERVICO, versao: 3 };
    falso.responder('GET /trampos/meus', { corpo: [trampo] });
    falso.responder('GET /servicos/meus', { corpo: [servico] });

    await expect(listarMeusTrampos(cliente)).resolves.toEqual([trampo]);
    await expect(listarMeusServicos(cliente)).resolves.toEqual([servico]);
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
    [
      'PUT /trampos/t1',
      (c) => editarTrampo(c, 't1', { ...ENTRADA_DO_TRAMPO, versao: 1 }),
    ],
    ['POST /trampos/t1/encerrar', (c) => encerrarTrampo(c, 't1')],
    ['DELETE /trampos/t1', (c) => excluirTrampo(c, 't1')],
    ['DELETE /candidaturas/c1', (c) => retirarCandidatura(c, 'c1')],
    [
      'PUT /servicos/s1',
      (c) => editarServico(c, 's1', { ...ENTRADA_DO_SERVICO, versao: 1 }),
    ],
    ['DELETE /servicos/s1', (c) => excluirServico(c, 's1')],
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
