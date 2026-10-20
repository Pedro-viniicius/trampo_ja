import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bancoDeTeste, truncarTabelas } from '../../../test/banco-teste.js';
import { RelogioFixo } from '../../compartilhado/dominio/relogio.js';
import { criarServidor } from '../../compartilhado/http/servidor.js';
import { VerificadorDePerfilEmMemoria } from './adaptadores/memoria/verificador-perfil-memoria.js';
import { criarModuloDeServicos, type ModuloDeServicos } from './index.js';

const FREELANCER = '7d3c2f0e-0b4f-4a57-9f7a-2a4c1d9e8b10';
const TOKEN = 'token-freelancer';

let app: FastifyInstance;
let modulo: ModuloDeServicos;

beforeEach(async () => {
  await truncarTabelas(['servicos']);
  modulo = criarModuloDeServicos({
    db: bancoDeTeste(),
    verificadorDePerfil: new VerificadorDePerfilEmMemoria([FREELANCER]),
    relogio: new RelogioFixo('2026-10-20T12:00:00.000Z'),
  });
  app = criarServidor({ logger: false });
  app.register(
    modulo.rotas({
      validarSessao: async (token) => (token === TOKEN ? FREELANCER : null),
    }),
  );
});

afterEach(async () => {
  await app.close();
});

describe('fachada do módulo servicos (Postgres)', () => {
  it('CA6 e CA7 — serviço ofertado pela rota fica ativo, aparece em "meus" e na busca', async () => {
    const oferta = await app.inject({
      method: 'POST',
      url: '/servicos',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: {
        titulo: 'Desconto de 50% em instalações',
        descricao: 'Eletricista residencial.',
        categoria: 'reformas',
        cidade: 'São Paulo',
        precoBaseCentavos: 15000,
      },
    });
    expect(oferta.statusCode).toBe(201);
    const { id, status } = oferta.json();
    expect(status).toBe('ativo');

    const detalhe = await app.inject({
      method: 'GET',
      url: `/servicos/${id}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(detalhe.statusCode).toBe(200);
    expect(detalhe.json()).toMatchObject({ id, autorId: FREELANCER });

    const meus = await app.inject({
      method: 'GET',
      url: '/servicos/meus',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(meus.json().map((s: { id: string }) => s.id)).toEqual([id]);

    // A fachada normaliza os filtros antes do repositório.
    const achados = await modulo.buscarServicos({
      texto: ' 50%  EM ',
      categoria: 'reformas',
      cidade: 'SAO PAULO',
    });
    expect(achados.map((s) => s.id)).toEqual([id]);
    expect(await modulo.buscarServicos({ cidade: 'Recife' })).toEqual([]);
  });

  it('CA14 — as rotas da fachada exigem token', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/servicos/meus' });
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
  });

  it('GET /servicos/:id com id fora do formato uuid responde 404, não 500', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/servicos/nao-e-uuid',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: 'nao_encontrado' });
  });
});
