import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import { criarCasosDeUsoDeServicos } from '../../aplicacao/casos-de-uso.js';
import { RepositorioDeServicosEmMemoria } from '../memoria/repositorio-memoria.js';
import { VerificadorDePerfilEmMemoria } from '../memoria/verificador-perfil-memoria.js';
import { criarRotasDeServicos } from './rotas.js';

const FREELANCER = 'conta-freelancer';
const OUTRO = 'conta-outro';
const SEM_PERFIL = 'conta-sem-perfil';

/** Token → conta, como a fachada de `contas` responderia. */
const SESSOES: Readonly<Record<string, string>> = {
  'token-freelancer': FREELANCER,
  'token-outro': OUTRO,
  'token-sem-perfil': SEM_PERFIL,
};

const OFERTA_VALIDA = {
  titulo: 'Eletricista residencial',
  descricao: 'Instalação e conserto de tomadas, chuveiros e quadros.',
  categoria: 'reformas',
  cidade: 'São Paulo',
  precoBaseCentavos: 15000,
};

let app: FastifyInstance;
let repositorio: RepositorioDeServicosEmMemoria;
let relogio: RelogioFixo;
let contador: number;
const validarSessao = vi.fn(
  async (token: string): Promise<string | null> => SESSOES[token] ?? null,
);

beforeEach(() => {
  validarSessao.mockClear();
  repositorio = new RepositorioDeServicosEmMemoria();
  relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
  contador = 0;
  const casos = criarCasosDeUsoDeServicos({
    repositorio,
    verificadorDePerfil: new VerificadorDePerfilEmMemoria([FREELANCER, OUTRO]),
    relogio,
    gerarId: () => {
      contador += 1;
      return `id-${String(contador).padStart(3, '0')}`;
    },
  });
  app = criarServidor({ logger: false });
  app.register(criarRotasDeServicos(casos), { validarSessao });
});

afterEach(async () => {
  await app.close();
});

function comToken(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function ofertar(corpo: unknown, token = 'token-freelancer') {
  const resposta = await app.inject({
    method: 'POST',
    url: '/servicos',
    headers: comToken(token),
    payload: corpo as Record<string, unknown>,
  });
  relogio.avancar(60_000);
  return resposta;
}

describe('CA14 — rotas de serviços exigem token', () => {
  const ROTAS = [
    { method: 'POST', url: '/servicos', payload: OFERTA_VALIDA },
    { method: 'GET', url: '/servicos/meus' },
    { method: 'GET', url: '/servicos/id-001' },
    {
      method: 'PUT',
      url: '/servicos/id-001',
      payload: { ...OFERTA_VALIDA, titulo: 'Título trocado', versao: 1 },
    },
    { method: 'DELETE', url: '/servicos/id-001' },
  ] as const;

  it.each(ROTAS)(
    'CA14 — $method $url sem token responde 401 sem dados',
    async (rota) => {
      await ofertar(OFERTA_VALIDA);
      const resposta = await app.inject({ ...rota });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
      // CA31: nem a edição nem a exclusão passam sem sessão.
      expect(await repositorio.buscarPorId('id-001')).toMatchObject({
        titulo: OFERTA_VALIDA.titulo,
        versao: 1,
      });
    },
  );

  it.each(ROTAS)(
    'CA14 — $method $url com token desconhecido responde 401 sem dados',
    async (rota) => {
      await ofertar(OFERTA_VALIDA);
      const resposta = await app.inject({
        ...rota,
        headers: comToken('token-que-nao-existe'),
      });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
    },
  );

  it('CA14 — POST sem token é recusado antes de validar o corpo e nada é salvo', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/servicos',
      payload: { titulo: 1, extra: true },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
    expect(await repositorio.buscar({ limite: 50 })).toEqual([]);
  });
});

describe('POST /servicos', () => {
  it('CA6 — oferta com perfil completo responde 201 {id,status:"ativo"} e o serviço aparece na busca', async () => {
    const resposta = await ofertar(OFERTA_VALIDA);

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ id: 'id-001', status: 'ativo' });
    const salvos = await repositorio.buscar({ limite: 50 });
    expect(salvos.map((s) => [s.id, s.autorId])).toEqual([
      ['id-001', FREELANCER],
    ]);
  });

  it('D7 — aceita oferta sem cidade e com cidade nula', async () => {
    const { cidade: _cidade, ...semCidade } = OFERTA_VALIDA;

    expect((await ofertar(semCidade)).statusCode).toBe(201);
    expect((await ofertar({ ...OFERTA_VALIDA, cidade: null })).statusCode).toBe(
      201,
    );
  });

  it('CA6 — dados inválidos respondem 400 com todos os campos apontados e nada é salvo', async () => {
    const resposta = await ofertar({
      titulo: 'abc',
      categoria: 'jardinagem',
      precoBaseCentavos: 0,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [
        { campo: 'titulo', motivo: 'tamanho' },
        { campo: 'descricao', motivo: 'obrigatorio' },
        { campo: 'categoria', motivo: 'invalido' },
        { campo: 'precoBaseCentavos', motivo: 'invalido' },
      ],
    });
    expect(await repositorio.buscar({ limite: 50 })).toEqual([]);
  });

  it('campos obrigatórios nulos respondem 400 obrigatorio, como em trampos', async () => {
    const resposta = await ofertar({
      titulo: null,
      descricao: null,
      categoria: null,
      cidade: null,
      precoBaseCentavos: null,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [
        { campo: 'titulo', motivo: 'obrigatorio' },
        { campo: 'descricao', motivo: 'obrigatorio' },
        { campo: 'categoria', motivo: 'obrigatorio' },
        { campo: 'precoBaseCentavos', motivo: 'obrigatorio' },
      ],
    });
  });

  it('corpo vazio responde 400 com os obrigatórios', async () => {
    const resposta = await ofertar({});

    expect(resposta.statusCode).toBe(400);
    expect(
      resposta.json().campos.map((c: { campo: string }) => c.campo),
    ).toEqual(['titulo', 'descricao', 'categoria', 'precoBaseCentavos']);
  });

  it('campo com tipo errado responde 400 apontando o campo, sem ecoar o valor', async () => {
    const resposta = await ofertar({
      ...OFERTA_VALIDA,
      titulo: { valor: 'texto-que-nao-pode-voltar' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'titulo', motivo: 'invalido' }],
    });
    expect(resposta.body).not.toContain('texto-que-nao-pode-voltar');
  });

  it('chave extra no corpo (ex.: autorId) responde 400 e nada é salvo', async () => {
    const resposta = await ofertar({ ...OFERTA_VALIDA, autorId: OUTRO });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe('dados_invalidos');
    expect(await repositorio.buscar({ limite: 50 })).toEqual([]);
  });

  it('corpo que não é objeto responde 400', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/servicos',
      headers: {
        ...comToken('token-freelancer'),
        'content-type': 'application/json',
      },
      payload: '[1,2]',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe('dados_invalidos');
  });

  it('D9 — perfil incompleto responde 409 perfil_incompleto e nada é salvo', async () => {
    const resposta = await ofertar(OFERTA_VALIDA, 'token-sem-perfil');

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toEqual({ erro: 'perfil_incompleto' });
    expect(await repositorio.buscar({ limite: 50 })).toEqual([]);
  });

  it('D9 — com perfil incompleto, 409 vem antes da validação dos dados', async () => {
    const resposta = await ofertar({}, 'token-sem-perfil');

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toEqual({ erro: 'perfil_incompleto' });
  });
});

describe('GET /servicos/meus', () => {
  it('CA6 — lista só os serviços da conta, mais recentes primeiro, sem colunas internas', async () => {
    await ofertar(OFERTA_VALIDA);
    await ofertar(
      { ...OFERTA_VALIDA, titulo: 'Pintor de paredes' },
      'token-outro',
    );
    await ofertar({ ...OFERTA_VALIDA, cidade: undefined });

    const resposta = await app.inject({
      method: 'GET',
      url: '/servicos/meus',
      headers: comToken('token-freelancer'),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      {
        id: 'id-003',
        autorId: FREELANCER,
        titulo: 'Eletricista residencial',
        descricao: OFERTA_VALIDA.descricao,
        categoria: 'reformas',
        cidade: null,
        precoBaseCentavos: 15000,
        status: 'ativo',
        criadoEm: '2026-10-20T12:02:00.000Z',
        versao: 1,
      },
      {
        id: 'id-001',
        autorId: FREELANCER,
        titulo: 'Eletricista residencial',
        descricao: OFERTA_VALIDA.descricao,
        categoria: 'reformas',
        cidade: 'São Paulo',
        precoBaseCentavos: 15000,
        status: 'ativo',
        criadoEm: '2026-10-20T12:00:00.000Z',
        versao: 1,
      },
    ]);
    expect(resposta.body).not.toContain('textoBusca');
    expect(resposta.body).not.toContain('cidadeNormalizada');
  });

  it('responde lista vazia para quem não ofertou nada', async () => {
    await ofertar(OFERTA_VALIDA);

    const resposta = await app.inject({
      method: 'GET',
      url: '/servicos/meus',
      headers: comToken('token-outro'),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([]);
  });
});

describe('GET /servicos/:id', () => {
  it('CA6 — qualquer conta autenticada vê o serviço (D8)', async () => {
    await ofertar(OFERTA_VALIDA);

    const resposta = await app.inject({
      method: 'GET',
      url: '/servicos/id-001',
      headers: comToken('token-outro'),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: 'id-001',
      autorId: FREELANCER,
      titulo: 'Eletricista residencial',
      descricao: OFERTA_VALIDA.descricao,
      categoria: 'reformas',
      cidade: 'São Paulo',
      precoBaseCentavos: 15000,
      status: 'ativo',
      criadoEm: '2026-10-20T12:00:00.000Z',
    });
  });

  it('CA31 — o autor recebe também a versao (D33); o terceiro, acima, não', async () => {
    await ofertar(OFERTA_VALIDA);

    const resposta = await app.inject({
      method: 'GET',
      url: '/servicos/id-001',
      headers: comToken('token-freelancer'),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ id: 'id-001', versao: 1 });
  });

  it('id inexistente responde 404 nao_encontrado', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/servicos/nao-existe',
      headers: comToken('token-freelancer'),
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: 'nao_encontrado' });
  });
});

/** Corpo de edição válido, lido na `versao` dada. */
function corpoDaEdicao(
  versao: unknown,
  alteracao: Record<string, unknown> = {},
) {
  return {
    titulo: 'Encanador de plantão',
    descricao: 'Vazamentos e desentupimento.',
    categoria: 'limpeza',
    cidade: 'Recife',
    precoBaseCentavos: 9900,
    ...alteracao,
    versao,
  };
}

async function editar(id: string, corpo: unknown, token = 'token-freelancer') {
  return app.inject({
    method: 'PUT',
    url: `/servicos/${id}`,
    headers: comToken(token),
    payload: corpo as Record<string, unknown>,
  });
}

async function detalhe(id: string, token = 'token-freelancer') {
  return app.inject({
    method: 'GET',
    url: `/servicos/${id}`,
    headers: comToken(token),
  });
}

/** O serviço `id-001` continua como foi ofertado. */
async function esperarIntacto(): Promise<void> {
  expect(await repositorio.buscarPorId('id-001')).toMatchObject({
    titulo: OFERTA_VALIDA.titulo,
    cidade: OFERTA_VALIDA.cidade,
    versao: 1,
  });
}

describe('PUT /servicos/:id (CA26)', () => {
  it('CA26 — o autor edita com a versão lida: 204 sem corpo; o detalhe mostra os campos novos e a versão 2 só para ele', async () => {
    await ofertar(OFERTA_VALIDA);

    const resposta = await editar('id-001', corpoDaEdicao(1));

    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe('');
    const doAutor = await detalhe('id-001');
    expect(doAutor.json()).toEqual({
      id: 'id-001',
      autorId: FREELANCER,
      titulo: 'Encanador de plantão',
      descricao: 'Vazamentos e desentupimento.',
      categoria: 'limpeza',
      cidade: 'Recife',
      precoBaseCentavos: 9900,
      status: 'ativo',
      criadoEm: '2026-10-20T12:00:00.000Z',
      versao: 2,
    });
    const deTerceiro = await detalhe('id-001', 'token-outro');
    expect(deTerceiro.statusCode).toBe(200);
    expect(deTerceiro.json()).not.toHaveProperty('versao');
    expect(deTerceiro.json()).toMatchObject({ titulo: 'Encanador de plantão' });
    const salvos = await repositorio.buscar({
      texto: 'desentupimento',
      limite: 50,
    });
    expect(salvos.map((s) => s.id)).toEqual(['id-001']);
  });

  it.each([
    ['sem a chave cidade', undefined],
    ['com cidade nula', null],
  ])('D7 — edição %s deixa o serviço sem cidade', async (_nome, cidade) => {
    await ofertar(OFERTA_VALIDA);
    const { cidade: _cidade, ...semCidade } = corpoDaEdicao(1);

    const resposta = await editar(
      'id-001',
      cidade === undefined ? semCidade : { ...semCidade, cidade },
    );

    expect(resposta.statusCode).toBe(204);
    expect((await detalhe('id-001')).json()).toMatchObject({
      cidade: null,
      versao: 2,
    });
  });

  it('CA26 — serviço de outra conta responde 404, igual ao inexistente, e nada muda', async () => {
    await ofertar(OFERTA_VALIDA);

    const deOutra = await editar('id-001', corpoDaEdicao(1), 'token-outro');
    const inexistente = await editar('id-999', corpoDaEdicao(1));
    const foraDoFormato = await editar('nao-e-uuid', corpoDaEdicao(1));

    for (const resposta of [deOutra, inexistente, foraDoFormato]) {
      expect(resposta.statusCode).toBe(404);
      expect(resposta.body).toBe('{"erro":"nao_encontrado"}');
    }
    await esperarIntacto();
  });

  it('D33 — versão velha responde 409 conflito_de_versao e nada muda', async () => {
    await ofertar(OFERTA_VALIDA);
    expect(
      (await editar('id-001', corpoDaEdicao(1, { titulo: 'Primeira' })))
        .statusCode,
    ).toBe(204);

    const resposta = await editar(
      'id-001',
      corpoDaEdicao(1, { titulo: 'Velha' }),
    );

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toEqual({ erro: 'conflito_de_versao' });
    expect(await repositorio.buscarPorId('id-001')).toMatchObject({
      titulo: 'Primeira',
      versao: 2,
    });
  });

  it.each(['autorId', 'status', 'criadoEm', 'id', 'textoBusca'])(
    'CA31 — chave extra %s no corpo responde 400 dados_invalidos e nada muda',
    async (chave) => {
      await ofertar(OFERTA_VALIDA);

      const resposta = await editar('id-001', {
        ...corpoDaEdicao(1),
        [chave]: chave === 'autorId' ? OUTRO : 'pausado',
      });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().erro).toBe('dados_invalidos');
      await esperarIntacto();
    },
  );

  it.each([
    ['ausente', undefined, 'obrigatorio'],
    ['nula', null, 'obrigatorio'],
  ])(
    'versao %s responde 400 obrigatorio em versao',
    async (_nome, versao, motivo) => {
      await ofertar(OFERTA_VALIDA);
      const { versao: _v, ...semVersao } = corpoDaEdicao(1);

      const resposta = await editar(
        'id-001',
        versao === undefined ? semVersao : { ...semVersao, versao },
      );

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'versao', motivo }],
      });
      await esperarIntacto();
    },
  );

  it.each([
    ['zero', 0],
    ['negativa', -1],
    ['fracionada', 1.5],
    ['em texto', '1'],
    ['booleana', true],
  ])('versao %s responde 400 e nada muda', async (_nome, versao) => {
    await ofertar(OFERTA_VALIDA);

    const resposta = await editar('id-001', corpoDaEdicao(versao));

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe('dados_invalidos');
    await esperarIntacto();
  });

  it('Ordem — o 400 do corpo vem antes do 404: outra conta, inexistente e id inválido com corpo ruim dão 400', async () => {
    await ofertar(OFERTA_VALIDA);

    for (const [id, token] of [
      ['id-001', 'token-outro'],
      ['id-999', 'token-freelancer'],
      ['nao-e-uuid', 'token-freelancer'],
    ] as const) {
      const comChaveExtra = await editar(
        id,
        { ...corpoDaEdicao(1), autorId: OUTRO },
        token,
      );
      const semVersao = await editar(id, { titulo: 'x' }, token);
      expect(comChaveExtra.statusCode, id).toBe(400);
      expect(semVersao.statusCode, id).toBe(400);
    }
  });

  it('Ordem — outra conta com versão velha e campos inválidos dá 404; o autor dá 409; com a versão certa, 400 com os campos', async () => {
    await ofertar(OFERTA_VALIDA);
    await editar('id-001', corpoDaEdicao(1));
    const invalidos = { titulo: 'ab', precoBaseCentavos: 0 };

    const deOutra = await editar(
      'id-001',
      corpoDaEdicao(1, invalidos),
      'token-outro',
    );
    const velha = await editar('id-001', corpoDaEdicao(1, invalidos));
    const certa = await editar('id-001', corpoDaEdicao(2, invalidos));

    expect(deOutra.statusCode).toBe(404);
    expect(velha.statusCode).toBe(409);
    expect(velha.json()).toEqual({ erro: 'conflito_de_versao' });
    expect(certa.statusCode).toBe(400);
    expect(certa.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [
        { campo: 'titulo', motivo: 'tamanho' },
        { campo: 'precoBaseCentavos', motivo: 'invalido' },
      ],
    });
  });

  it('CA6 — campos inválidos não ecoam o valor no 400', async () => {
    await ofertar(OFERTA_VALIDA);

    const resposta = await editar(
      'id-001',
      corpoDaEdicao(1, {
        titulo: 'ab',
        descricao: { x: 'texto-que-nao-volta' },
      }),
    );

    expect(resposta.statusCode).toBe(400);
    expect(resposta.body).not.toContain('texto-que-nao-volta');
    await esperarIntacto();
  });

  it('corpo que não é objeto responde 400', async () => {
    await ofertar(OFERTA_VALIDA);

    const resposta = await app.inject({
      method: 'PUT',
      url: '/servicos/id-001',
      headers: {
        ...comToken('token-freelancer'),
        'content-type': 'application/json',
      },
      payload: '[1]',
    });

    expect(resposta.statusCode).toBe(400);
    await esperarIntacto();
  });
});

describe('DELETE /servicos/:id (CA26)', () => {
  async function excluir(id: string, token = 'token-freelancer') {
    return app.inject({
      method: 'DELETE',
      url: `/servicos/${id}`,
      headers: comToken(token),
    });
  }

  it('CA26 — o autor exclui: 204 sem corpo; o detalhe passa a dar 404 e o serviço sai da busca', async () => {
    await ofertar(OFERTA_VALIDA);
    await ofertar({ ...OFERTA_VALIDA, titulo: 'Aulas de violão' });

    const resposta = await excluir('id-001');

    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe('');
    expect((await detalhe('id-001')).statusCode).toBe(404);
    expect((await detalhe('id-001', 'token-outro')).statusCode).toBe(404);
    const restantes = await repositorio.buscar({ limite: 50 });
    expect(restantes.map((s) => s.id)).toEqual(['id-002']);
  });

  it('CA26 — de outra conta, inexistente, fora do formato ou já excluído: o mesmo 404', async () => {
    await ofertar(OFERTA_VALIDA);
    await ofertar(OFERTA_VALIDA, 'token-outro');

    const deOutra = await excluir('id-001', 'token-outro');
    expect(await repositorio.buscarPorId('id-001')).not.toBeNull();
    // A outra conta exclui o próprio serviço; a segunda vez já é 404.
    expect((await excluir('id-002', 'token-outro')).statusCode).toBe(204);
    const respostas = [
      deOutra,
      await excluir('id-999'),
      await excluir('nao-e-uuid'),
      await excluir('id-002', 'token-outro'),
    ];

    for (const resposta of respostas) {
      expect(resposta.statusCode).toBe(404);
      expect(resposta.body).toBe('{"erro":"nao_encontrado"}');
    }
    await esperarIntacto();
  });
});
