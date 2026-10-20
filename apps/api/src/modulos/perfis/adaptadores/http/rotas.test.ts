import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarLogger } from '../../../../compartilhado/http/logger.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import { criarCasosDeUsoDePerfis } from '../../aplicacao/casos-de-uso.js';
import type { RepositorioDePerfis } from '../../dominio/portas.js';
import { RepositorioDePerfisEmMemoria } from '../memoria/repositorio-memoria.js';
import { criarRotasDePerfis, RESPOSTA_DO_PERFIL_PUBLICO } from './rotas.js';

const MARIA = 'conta-maria';
const JOAO = 'conta-joao';

/** Token → conta, como a fachada de `contas` responderia. */
const SESSOES: Readonly<Record<string, string>> = {
  'token-maria': MARIA,
  'token-joao': JOAO,
};

const NOME = 'Maria Aparecida Souza';
const CIDADE = 'São José dos Campos';
const DESCRICAO = 'Pintora com dez anos de experiência.';

const PERFIL_VALIDO = {
  nome: NOME,
  cidade: CIDADE,
  descricao: DESCRICAO,
  habilidades: ['Pintura', 'Gesso'],
};

interface Montagem {
  readonly app: FastifyInstance;
  readonly repositorio: RepositorioDePerfisEmMemoria;
  /** Linhas JSON escritas pelo logger (nível trace), quando ligado. */
  readonly linhasDoLog: string[];
}

let m: Montagem;

const validarSessao = vi.fn(
  async (token: string): Promise<string | null> => SESSOES[token] ?? null,
);

function montar(
  opcoes: { comLog?: boolean; repositorio?: RepositorioDePerfis } = {},
): Montagem {
  validarSessao.mockClear();
  const repositorio = new RepositorioDePerfisEmMemoria();
  const casos = criarCasosDeUsoDePerfis({
    repositorio: opcoes.repositorio ?? repositorio,
    relogio: new RelogioFixo('2026-10-20T12:00:00.000Z'),
  });
  const linhasDoLog: string[] = [];
  const app = criarServidor({
    logger: opcoes.comLog
      ? criarLogger({
          nivel: 'trace',
          destino: { write: (linha) => linhasDoLog.push(linha) },
        })
      : false,
  });
  app.register(criarRotasDePerfis(casos), { validarSessao });
  return { app, repositorio, linhasDoLog };
}

afterEach(async () => {
  await m?.app.close();
});

function comToken(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function salvar(corpo: unknown, token = 'token-maria') {
  return m.app.inject({
    method: 'PUT',
    url: '/perfis/eu',
    headers: comToken(token),
    payload: corpo as Record<string, unknown>,
  });
}

async function obter(url: string, token = 'token-maria') {
  return m.app.inject({ method: 'GET', url, headers: comToken(token) });
}

describe('CA14 — rotas de perfis exigem token', () => {
  const ROTAS = [
    { method: 'GET', url: '/perfis/eu' },
    { method: 'PUT', url: '/perfis/eu', payload: PERFIL_VALIDO },
    { method: 'GET', url: `/perfis/${MARIA}` },
  ] as const;

  it.each(ROTAS)(
    'CA14 — $method $url sem token responde 401 sem dados',
    async (rota) => {
      m = montar();
      await salvar(PERFIL_VALIDO);

      const resposta = await m.app.inject({ ...rota });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
      expect(resposta.body).not.toContain(NOME);
    },
  );

  it.each(ROTAS)(
    'CA14 — $method $url com token desconhecido responde 401 sem dados',
    async (rota) => {
      m = montar();
      await salvar(PERFIL_VALIDO);

      const resposta = await m.app.inject({
        ...rota,
        headers: comToken('token-que-nao-existe'),
      });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
      expect(resposta.body).not.toContain(NOME);
    },
  );

  it('CA14 — PUT sem token é recusado antes de validar o corpo e nada é salvo', async () => {
    m = montar();

    const resposta = await m.app.inject({
      method: 'PUT',
      url: '/perfis/eu',
      payload: { nome: 1, extra: true },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
    expect(m.repositorio.tamanho).toBe(0);
  });
});

describe('PUT /perfis/eu', () => {
  it('CA3 — perfil com nome, cidade e habilidade responde 200 completo', async () => {
    m = montar();

    const resposta = await salvar({
      ...PERFIL_VALIDO,
      nome: `  ${NOME} `,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      nome: NOME,
      cidade: CIDADE,
      descricao: DESCRICAO,
      habilidades: ['Pintura', 'Gesso'],
      completo: true,
    });
    expect((await m.repositorio.buscarPorConta(MARIA))?.cidadeNormalizada).toBe(
      'sao jose dos campos',
    );
  });

  it('CA3 — sem descrição (ausente ou nula) responde descricao null', async () => {
    m = montar();
    const { descricao: _descricao, ...semDescricao } = PERFIL_VALIDO;

    const ausente = await salvar(semDescricao);
    const nula = await salvar({ ...PERFIL_VALIDO, descricao: null });

    expect(ausente.statusCode).toBe(200);
    expect(ausente.json().descricao).toBeNull();
    expect(nula.statusCode).toBe(200);
    expect(nula.json().descricao).toBeNull();
  });

  it('CA3 — salvar de novo substitui o perfil da própria conta', async () => {
    m = montar();
    await salvar(PERFIL_VALIDO);

    const resposta = await salvar({
      nome: 'Maria Souza',
      cidade: 'Recife',
      habilidades: ['Elétrica'],
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      nome: 'Maria Souza',
      cidade: 'Recife',
      descricao: null,
      habilidades: ['Elétrica'],
      completo: true,
    });
    expect(m.repositorio.tamanho).toBe(1);
  });

  it('CA3 — dados inválidos respondem 400 com todos os campos apontados e nada é salvo', async () => {
    m = montar();

    const resposta = await salvar({
      nome: 'M',
      cidade: '',
      descricao: 'x'.repeat(301),
      habilidades: ['Pintura', 'p', ' pintura '],
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [
        { campo: 'nome', motivo: 'tamanho' },
        { campo: 'cidade', motivo: 'obrigatorio' },
        { campo: 'descricao', motivo: 'tamanho' },
        { campo: 'habilidades.1', motivo: 'tamanho' },
        { campo: 'habilidades.2', motivo: 'invalido' },
      ],
    });
    expect(m.repositorio.tamanho).toBe(0);
  });

  it('CA3 — corpo vazio ou com nulos responde 400 com os três obrigatórios', async () => {
    m = montar();
    const esperado = {
      erro: 'dados_invalidos',
      campos: [
        { campo: 'nome', motivo: 'obrigatorio' },
        { campo: 'cidade', motivo: 'obrigatorio' },
        { campo: 'habilidades', motivo: 'obrigatorio' },
      ],
    };

    const vazio = await salvar({});
    const nulos = await salvar({ nome: null, cidade: null, habilidades: null });
    const listaVazia = await salvar({ nome: '', cidade: ' ', habilidades: [] });

    for (const resposta of [vazio, nulos, listaVazia]) {
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual(esperado);
    }
    expect(m.repositorio.tamanho).toBe(0);
  });

  it('mais de 10 habilidades responde 400 tamanho', async () => {
    m = montar();
    const onze = Array.from({ length: 11 }, (_, i) => `Habilidade ${i}`);

    const resposta = await salvar({ ...PERFIL_VALIDO, habilidades: onze });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'habilidades', motivo: 'tamanho' }],
    });
  });

  it('item de habilidade com tipo errado responde 400 apontando o item, sem ecoar o valor', async () => {
    m = montar();

    const resposta = await salvar({
      ...PERFIL_VALIDO,
      habilidades: ['Pintura', { texto: 'valor-que-nao-pode-voltar' }],
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'habilidades.1', motivo: 'invalido' }],
    });
    expect(resposta.body).not.toContain('valor-que-nao-pode-voltar');
  });

  it('nome com tipo errado responde 400 sem ecoar o valor', async () => {
    m = montar();

    const resposta = await salvar({ ...PERFIL_VALIDO, nome: { nome: NOME } });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'nome', motivo: 'invalido' }],
    });
    expect(resposta.body).not.toContain(NOME);
  });

  it.each([
    ['contaId', JOAO],
    ['email', 'maria@exemplo.com'],
    ['completo', true],
  ])(
    'chave extra no corpo (%s) responde 400 e nada é salvo',
    async (chave, valor) => {
      m = montar();

      const resposta = await salvar({ ...PERFIL_VALIDO, [chave]: valor });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().erro).toBe('dados_invalidos');
      expect(m.repositorio.tamanho).toBe(0);
    },
  );

  it('corpo que não é objeto responde 400', async () => {
    m = montar();

    const resposta = await m.app.inject({
      method: 'PUT',
      url: '/perfis/eu',
      headers: {
        ...comToken('token-maria'),
        'content-type': 'application/json',
      },
      payload: '["Maria"]',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe('dados_invalidos');
  });
});

describe('GET /perfis/eu', () => {
  it('CA3 — responde 404 antes de a conta salvar o perfil', async () => {
    m = montar();

    const resposta = await obter('/perfis/eu');

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: 'nao_encontrado' });
  });

  it('CA3 — depois de salvar, responde 200 com o perfil da própria conta', async () => {
    m = montar();
    await salvar(PERFIL_VALIDO);
    await salvar({ ...PERFIL_VALIDO, nome: 'João Pedro' }, 'token-joao');

    const resposta = await obter('/perfis/eu');

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      nome: NOME,
      cidade: CIDADE,
      descricao: DESCRICAO,
      habilidades: ['Pintura', 'Gesso'],
      completo: true,
    });
  });
});

describe('GET /perfis/:contaId (perfil público)', () => {
  it('CA3/D10 — outro usuário vê nome, cidade, descrição e habilidades, sem e-mail nem dado de conta', async () => {
    m = montar();
    await salvar(PERFIL_VALIDO);

    const resposta = await obter(`/perfis/${MARIA}`, 'token-joao');

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo).toEqual({
      contaId: MARIA,
      nome: NOME,
      cidade: CIDADE,
      descricao: DESCRICAO,
      habilidades: ['Pintura', 'Gesso'],
    });
    expect(Object.keys(corpo).sort()).toEqual(
      ['cidade', 'contaId', 'descricao', 'habilidades', 'nome'].sort(),
    );
    expect(resposta.body).not.toMatch(/email|senha|token|cidadeNormalizada/i);
  });

  it('CA3 — perfil sem descrição sai com descricao null', async () => {
    m = montar();
    await salvar({ ...PERFIL_VALIDO, descricao: undefined });

    const resposta = await obter(`/perfis/${MARIA}`, 'token-joao');

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().descricao).toBeNull();
  });

  it.each([
    ['conta sem perfil', `/perfis/${JOAO}`],
    ['id que não existe', '/perfis/00000000-0000-4000-8000-000000000000'],
    ['id fora do formato', '/perfis/%27%20or%201%3D1'],
  ])('%s responde 404 sem dados', async (_rotulo, url) => {
    m = montar();
    await salvar(PERFIL_VALIDO);

    const resposta = await obter(url);

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: 'nao_encontrado' });
  });

  it('D10 — o schema de resposta público descarta qualquer chave fora da lista (ex.: email)', async () => {
    m = montar();
    // Rota de prova com o mesmo schema, devolvendo um objeto com chaves a mais,
    // como se o mapeamento um dia vazasse a entidade de conta.
    m.app.get(
      '/prova-do-schema-publico',
      { schema: { response: { 200: RESPOSTA_DO_PERFIL_PUBLICO } } },
      async () => ({
        contaId: MARIA,
        nome: NOME,
        cidade: CIDADE,
        descricao: null,
        habilidades: ['Pintura'],
        email: 'maria@exemplo.com',
        senhaHash: 'hash-secreto',
        cidadeNormalizada: 'sao jose dos campos',
      }),
    );

    const resposta = await m.app.inject({
      method: 'GET',
      url: '/prova-do-schema-publico',
    });

    expect(resposta.statusCode).toBe(200);
    expect(Object.keys(resposta.json()).sort()).toEqual(
      ['cidade', 'contaId', 'descricao', 'habilidades', 'nome'].sort(),
    );
    expect(resposta.body).not.toContain('maria@exemplo.com');
    expect(resposta.body).not.toContain('hash-secreto');
  });
});

describe('CA15 — o log do servidor não contém dado do perfil', () => {
  const DADOS_PESSOAIS = [NOME, CIDADE, DESCRICAO, 'Pintura', 'Gesso'];

  function semDadoPessoal(linhas: readonly string[]): void {
    const tudo = linhas.join('\n');
    for (const valor of DADOS_PESSOAIS) {
      expect(tudo).not.toContain(valor);
    }
  }

  it('CA15 — salvar, consultar e errar não registram nome, cidade, descrição nem habilidades', async () => {
    m = montar({ comLog: true });

    expect((await salvar(PERFIL_VALIDO)).statusCode).toBe(200);
    expect((await obter('/perfis/eu')).statusCode).toBe(200);
    expect((await obter(`/perfis/${MARIA}`, 'token-joao')).statusCode).toBe(
      200,
    );
    // 400 do domínio, 400 do schema e 404, com os dados pessoais no corpo.
    expect(
      (
        await salvar({
          ...PERFIL_VALIDO,
          descricao: `${DESCRICAO}${'x'.repeat(300)}`,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await salvar({ ...PERFIL_VALIDO, habilidades: [{ nome: NOME }] }))
        .statusCode,
    ).toBe(400);
    expect((await obter('/perfis/eu', 'token-joao')).statusCode).toBe(404);

    // O destino recebeu o log das requisições e das recusas.
    expect(m.linhasDoLog.length).toBeGreaterThan(0);
    expect(m.linhasDoLog.join('\n')).toContain('requisição recusada');
    semDadoPessoal(m.linhasDoLog);
  });

  it('CA15 — falha do banco (500) não registra o valor que o driver põe no erro', async () => {
    // Simula o erro do `pg`: o `detail` traz os valores da linha.
    const falha = Object.assign(
      new Error('duplicate key value violates unique constraint "perfis_pkey"'),
      { code: '23505', detail: `Key (nome)=(${NOME}) em ${CIDADE}` },
    );
    m = montar({
      comLog: true,
      repositorio: {
        salvar: async () => {
          throw falha;
        },
        buscarPorConta: async () => null,
      },
    });

    const resposta = await salvar(PERFIL_VALIDO);

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: 'interno' });
    expect(m.linhasDoLog.join('\n')).toContain('erro interno não tratado');
    semDadoPessoal(m.linhasDoLog);
  });
});
