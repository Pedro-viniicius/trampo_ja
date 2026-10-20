import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATEGORIAS } from '../../../../compartilhado/dominio/categorias.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import { criarCasosDeUsoDeBusca } from '../../aplicacao/buscar.js';
import { FachadasDeBuscaEmMemoria } from '../memoria/fachadas-memoria.js';
import { criarRotasDeBusca } from './rotas.js';

const SESSOES: Readonly<Record<string, string>> = {
  'token-valido': 'conta-1',
};

let app: FastifyInstance;
let fachadas: FachadasDeBuscaEmMemoria;
const validarSessao = vi.fn(
  async (token: string): Promise<string | null> => SESSOES[token] ?? null,
);

beforeEach(() => {
  validarSessao.mockClear();
  fachadas = new FachadasDeBuscaEmMemoria();
  app = criarServidor({ logger: false });
  app.register(criarRotasDeBusca(criarCasosDeUsoDeBusca(fachadas)), {
    validarSessao,
  });
});

afterEach(async () => {
  await app.close();
});

const autenticado = { authorization: 'Bearer token-valido' };

function adicionarTrampos(quantidade: number): void {
  for (let i = 1; i <= quantidade; i += 1) {
    fachadas.adicionarTrampo({
      id: `t${String(i).padStart(2, '0')}`,
      autorId: 'autor',
      titulo: `Trampo ${i}`,
      categoria: 'ti',
      cidade: 'Natal',
      valorCentavos: 10_000,
      criadoEm: new Date(Date.UTC(2026, 9, 1, 12, i)),
    });
  }
}

describe('CA14 — rotas de busca exigem token', () => {
  it.each(['/busca', '/busca?texto=abc', '/categorias'])(
    'CA14 — Dado GET %s sem token, quando chama, então 401 sem dados',
    async (url) => {
      fachadas.adicionarServico({
        id: 's1',
        autorId: 'a',
        titulo: 'abc',
        categoria: 'ti',
        precoBaseCentavos: 100,
        criadoEm: new Date(),
      });
      const resposta = await app.inject({ method: 'GET', url });
      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
      expect(fachadas.chamadasDeTrampos).toHaveLength(0);
    },
  );

  it('CA14 — Dado token inválido, quando chama, então 401', async () => {
    for (const url of ['/busca', '/categorias']) {
      const resposta = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: 'Bearer token-errado' },
      });
      expect(resposta.statusCode, url).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
    }
  });
});

describe('GET /busca', () => {
  it('CA7 — Dado itens e filtros, quando busca, então 200 com itens no formato único e proximoCursor nulo', async () => {
    adicionarTrampos(1);
    fachadas.adicionarServico({
      id: 's1',
      autorId: 'autor-s',
      titulo: 'Suporte de TI',
      categoria: 'ti',
      precoBaseCentavos: 8000,
      criadoEm: new Date(Date.UTC(2026, 9, 2)),
    });

    const resposta = await app.inject({
      method: 'GET',
      url: '/busca?categoria=ti&texto=suporte',
      headers: autenticado,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      itens: [
        {
          tipo: 'servico',
          id: 's1',
          autorId: 'autor-s',
          titulo: 'Suporte de TI',
          categoria: 'ti',
          cidade: null,
          precoBaseCentavos: 8000,
          criadoEm: '2026-10-02T00:00:00.000Z',
        },
      ],
      proximoCursor: null,
    });
  });

  it('CA7 — Dado tipo=trampos, quando busca, então devolve só trampos', async () => {
    adicionarTrampos(1);
    fachadas.adicionarServico({
      id: 's1',
      autorId: 'a',
      titulo: 'Serviço',
      categoria: 'ti',
      precoBaseCentavos: 100,
      criadoEm: new Date(Date.UTC(2026, 9, 2)),
    });
    const resposta = await app.inject({
      method: 'GET',
      url: '/busca?tipo=trampos',
      headers: autenticado,
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().itens.map((i: { tipo: string }) => i.tipo)).toEqual([
      'trampo',
    ]);
  });

  it('CA7 — Dado mais itens que o limite, quando segue o proximoCursor, então a segunda página continua sem repetir', async () => {
    adicionarTrampos(5);

    const primeira = await app.inject({
      method: 'GET',
      url: '/busca?limite=3',
      headers: autenticado,
    });
    expect(primeira.statusCode).toBe(200);
    const corpo1 = primeira.json();
    expect(corpo1.itens.map((i: { id: string }) => i.id)).toEqual([
      't05',
      't04',
      't03',
    ]);
    expect(typeof corpo1.proximoCursor).toBe('string');

    const segunda = await app.inject({
      method: 'GET',
      url: `/busca?limite=3&antesDe=${encodeURIComponent(corpo1.proximoCursor)}`,
      headers: autenticado,
    });
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json()).toMatchObject({ proximoCursor: null });
    expect(segunda.json().itens.map((i: { id: string }) => i.id)).toEqual([
      't02',
      't01',
    ]);
  });

  it.each([
    ['tipo inválido', '/busca?tipo=outro', 'tipo'],
    ['cursor malformado', '/busca?antesDe=lixo', 'antesDe'],
    ['limite não numérico', '/busca?limite=abc', 'limite'],
    ['limite zero', '/busca?limite=0', 'limite'],
    ['limite acima do máximo', '/busca?limite=50', 'limite'],
    ['categoria inexistente', '/busca?categoria=nada', 'categoria'],
  ])(
    'CA7 — Dado %s, quando busca, então 400 apontando o campo',
    async (_nome, url, campo) => {
      const resposta = await app.inject({
        method: 'GET',
        url,
        headers: autenticado,
      });
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo, motivo: 'invalido' }],
      });
    },
  );

  it('CA7 — Dado o mesmo filtro repetido na querystring, quando busca, então 400 sem ecoar o valor', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/busca?texto=um&texto=dois',
      headers: autenticado,
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.body).not.toContain('dois');
  });
});

describe('GET /categorias', () => {
  it('CA7 — Dado token válido, quando consulta, então 200 com as 10 categorias {id, rotulo}', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/categorias',
      headers: autenticado,
    });
    expect(resposta.statusCode).toBe(200);
    const categorias = resposta.json();
    expect(categorias).toHaveLength(10);
    expect(categorias).toEqual(
      CATEGORIAS.map(({ id, rotulo }) => ({ id, rotulo })),
    );
  });
});
