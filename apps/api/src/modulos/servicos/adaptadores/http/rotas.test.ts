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
  ] as const;

  it.each(ROTAS)(
    'CA14 — $method $url sem token responde 401 sem dados',
    async (rota) => {
      await ofertar(OFERTA_VALIDA);
      const resposta = await app.inject({ ...rota });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
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
