import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErroDeRegra } from '../../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import { criarCasosDeUsoDeTrampos } from '../../aplicacao/casos-de-uso.js';
import type { Trampo } from '../../dominio/trampo.js';
import { RepositorioDeTramposEmMemoria } from '../memoria/repositorio-memoria.js';
import { VerificadorDePerfilEmMemoria } from '../memoria/verificador-perfil-memoria.js';
import {
  CANDIDATURA_PUBLICA,
  rotasDeTrampos,
  TRAMPO_PUBLICO,
} from './rotas.js';

const EMPREGADOR = 'conta-empregador';
const ANA = 'conta-ana';
const BRUNO = 'conta-bruno';
const CARLA = 'conta-carla';
const SEM_PERFIL = 'conta-sem-perfil';

const TOKENS: Readonly<Record<string, string>> = {
  'token-empregador': EMPREGADOR,
  'token-ana': ANA,
  'token-bruno': BRUNO,
  'token-carla': CARLA,
  'token-sem-perfil': SEM_PERFIL,
};

const trampoValido = {
  titulo: 'Pintar a sala',
  descricao: 'Pintura de uma sala de 20 m², tinta inclusa.',
  categoria: 'reformas',
  cidade: 'São Paulo',
  valorCentavos: 50000,
};
const proposta = {
  mensagem: 'Posso fazer na semana que vem.',
  valorPropostoCentavos: 45000,
};

let app: FastifyInstance;
let repositorio: RepositorioDeTramposEmMemoria;
let sessoesConsultadas: string[];

async function montar(repo = new RepositorioDeTramposEmMemoria()) {
  repositorio = repo;
  sessoesConsultadas = [];
  const casos = criarCasosDeUsoDeTrampos({
    repositorio,
    verificadorDePerfil: new VerificadorDePerfilEmMemoria([
      EMPREGADOR,
      ANA,
      BRUNO,
      CARLA,
    ]),
    relogio: new RelogioFixo('2026-10-20T12:00:00.000Z'),
  });
  app = criarServidor({ logger: false });
  await app.register(
    rotasDeTrampos(casos, {
      validarSessao: async (token) => {
        sessoesConsultadas.push(token);
        return TOKENS[token] ?? null;
      },
    }),
  );
  await app.ready();
}

beforeEach(async () => {
  await montar();
});

afterEach(async () => {
  await app.close();
});

type Metodo = 'GET' | 'POST';

async function pedir(
  metodo: Metodo,
  url: string,
  token?: string,
  corpo?: unknown,
) {
  const resposta = await app.inject({
    method: metodo,
    url,
    ...(token !== undefined && {
      headers: { authorization: `Bearer ${token}` },
    }),
    ...(corpo !== undefined && { payload: corpo as object }),
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? undefined : resposta.json(),
  };
}

async function publicar(token = 'token-empregador', dados = {}) {
  const { status, corpo } = await pedir('POST', '/trampos', token, {
    ...trampoValido,
    ...dados,
  });
  expect(status).toBe(201);
  return corpo.id as string;
}

async function candidatar(trampoId: string, token: string) {
  return pedir('POST', `/trampos/${trampoId}/candidaturas`, token, proposta);
}

describe('CA14 — todas as rotas exigem token', () => {
  const rotas = (id: string, cid: string): [Metodo, string, unknown?][] => [
    ['POST', '/trampos', trampoValido],
    ['GET', '/trampos/meus'],
    ['GET', `/trampos/${id}`],
    ['POST', `/trampos/${id}/candidaturas`, proposta],
    ['GET', `/trampos/${id}/candidaturas`],
    ['POST', `/trampos/${id}/candidaturas/${cid}/aceitar`],
    ['GET', '/candidaturas/minhas'],
  ];

  it('CA14 — Dado uma requisição sem token ou com token inválido, quando chama qualquer rota, então recebe 401 sem dados e nada muda', async () => {
    const id = await publicar();
    const ana = await candidatar(id, 'token-ana');
    const antes = (await repositorio.buscarPorId(id))?.dados();

    for (const [metodo, url, corpo] of rotas(id, ana.corpo.id)) {
      for (const token of [undefined, 'token-desconhecido']) {
        const resposta = await pedir(metodo, url, token, corpo);
        expect({ metodo, url, token, ...resposta }).toEqual({
          metodo,
          url,
          token,
          status: 401,
          corpo: { erro: 'nao_autenticado' },
        });
      }
    }
    expect((await repositorio.buscarPorId(id))?.dados()).toEqual(antes);
  });

  it('CA14 — Dado um cabeçalho fora do formato Bearer, quando chama uma rota, então recebe 401 sem consultar a sessão', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/trampos/meus',
      headers: { authorization: 'Basic dXN1YXJpbzpzZW5oYQ==' },
    });
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
    expect(sessoesConsultadas).toEqual([]);
  });
});

describe('POST /trampos (CA4, CA5, D9)', () => {
  it('CA4 — Dado um corpo válido, quando publica, então recebe 201 com id e status aberto, e o detalhe traz o resumo sem campos internos', async () => {
    const { status, corpo } = await pedir(
      'POST',
      '/trampos',
      'token-empregador',
      {
        ...trampoValido,
        prazo: '2026-12-31',
      },
    );

    expect(status).toBe(201);
    expect(corpo).toEqual({ id: expect.any(String), status: 'aberto' });
    const detalhe = await pedir('GET', `/trampos/${corpo.id}`, 'token-ana');
    expect(detalhe).toEqual({
      status: 200,
      corpo: {
        id: corpo.id,
        autorId: EMPREGADOR,
        titulo: 'Pintar a sala',
        descricao: trampoValido.descricao,
        categoria: 'reformas',
        cidade: 'São Paulo',
        valorCentavos: 50000,
        prazo: '2026-12-31',
        status: 'aberto',
        criadoEm: '2026-10-20T12:00:00.000Z',
      },
    });
  });

  it('CA4 — Dado campos extras no corpo (autor, status, versão), quando publica, então recebe 400 dados_invalidos e nada é criado', async () => {
    for (const extra of [
      { autorId: ANA },
      { status: 'em_andamento' },
      { versao: 99 },
      { id: 'id-escolhido' },
    ]) {
      const resposta = await pedir('POST', '/trampos', 'token-empregador', {
        ...trampoValido,
        ...extra,
      });

      expect(resposta.status, Object.keys(extra)[0]).toBe(400);
      expect(resposta.corpo.erro).toBe('dados_invalidos');
    }
    expect(await repositorio.listarDoAutor(EMPREGADOR)).toEqual([]);
    expect(await repositorio.listarDoAutor(ANA)).toEqual([]);
  });

  it('CA8 — Dado campos extras no corpo da candidatura, quando candidata, então recebe 400 dados_invalidos e nada é gravado', async () => {
    const id = await publicar();

    const resposta = await pedir(
      'POST',
      `/trampos/${id}/candidaturas`,
      'token-ana',
      { ...proposta, freelancerId: BRUNO, status: 'aceita' },
    );

    expect(resposta.status).toBe(400);
    expect(resposta.corpo.erro).toBe('dados_invalidos');
    expect((await repositorio.buscarPorId(id))?.candidaturas).toEqual([]);
  });

  it('CA4 — Dado um corpo só com chaves válidas, quando publica, então o autor é o da sessão e o trampo sai aberto', async () => {
    const id = await publicar('token-empregador');

    const { corpo } = await pedir('GET', `/trampos/${id}`, 'token-ana');
    expect(corpo).toMatchObject({ autorId: EMPREGADOR, status: 'aberto' });
    expect((await repositorio.buscarPorId(id))?.versao).toBe(1);
  });

  it('os schemas de resposta descartam qualquer chave fora da lista (ex.: colunas internas)', async () => {
    const prova = criarServidor({ logger: false });
    const trampo = {
      id: 'id-1',
      autorId: EMPREGADOR,
      titulo: 'Pintar a sala',
      descricao: 'Pintura',
      categoria: 'reformas',
      cidade: 'São Paulo',
      valorCentavos: 100,
      prazo: null,
      status: 'aberto',
      criadoEm: '2026-10-20T12:00:00.000Z',
      textoBusca: 'segredo-interno',
      versao: 7,
    };
    const candidatura = {
      id: 'c-1',
      freelancerId: ANA,
      mensagem: 'oi',
      valorPropostoCentavos: 100,
      status: 'pendente',
      criadaEm: '2026-10-20T12:00:00.000Z',
      email: 'ana@exemplo.com',
    };
    prova.get(
      '/prova-trampo',
      { schema: { response: { 200: TRAMPO_PUBLICO } } },
      async () => trampo,
    );
    prova.get(
      '/prova-candidatura',
      { schema: { response: { 200: CANDIDATURA_PUBLICA } } },
      async () => candidatura,
    );
    await prova.ready();

    const t = await prova.inject({ method: 'GET', url: '/prova-trampo' });
    const c = await prova.inject({ method: 'GET', url: '/prova-candidatura' });
    await prova.close();

    expect(Object.keys(t.json()).sort()).toEqual(
      Object.keys(trampo)
        .filter((k) => k !== 'textoBusca' && k !== 'versao')
        .sort(),
    );
    expect(t.body).not.toContain('segredo-interno');
    expect(Object.keys(c.json()).sort()).toEqual(
      Object.keys(candidatura)
        .filter((k) => k !== 'email')
        .sort(),
    );
    expect(c.body).not.toContain('ana@exemplo.com');
  });

  it('CA5 — Dado campos faltando ou inválidos, quando publica, então recebe 400 apontando todos os campos', async () => {
    const { status, corpo } = await pedir(
      'POST',
      '/trampos',
      'token-empregador',
      {
        titulo: 'abc',
        descricao: 'Algo',
        cidade: null,
        valorCentavos: 0,
      },
    );

    expect(status).toBe(400);
    expect(corpo).toEqual({
      erro: 'dados_invalidos',
      campos: [
        { campo: 'titulo', motivo: 'tamanho' },
        { campo: 'categoria', motivo: 'obrigatorio' },
        { campo: 'cidade', motivo: 'obrigatorio' },
        { campo: 'valorCentavos', motivo: 'invalido' },
      ],
    });
    expect(await pedir('GET', '/trampos/meus', 'token-empregador')).toEqual({
      status: 200,
      corpo: [],
    });
  });

  it('CA5 — Dado um tipo errado no corpo, quando publica, então recebe 400 apontando o campo, sem ecoar o valor', async () => {
    const { status, corpo } = await pedir(
      'POST',
      '/trampos',
      'token-empregador',
      {
        ...trampoValido,
        valorCentavos: 'cinquenta reais',
      },
    );

    expect(status).toBe(400);
    expect(corpo).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'valorCentavos', motivo: 'invalido' }],
    });
  });

  it('CA5 — Dado um corpo que não é objeto, quando publica, então recebe 400', async () => {
    const { status, corpo } = await pedir(
      'POST',
      '/trampos',
      'token-empregador',
      [trampoValido],
    );
    expect(status).toBe(400);
    expect(corpo.erro).toBe('dados_invalidos');
  });

  it('D9 — Dado um usuário com perfil incompleto, quando publica, então recebe 409 perfil_incompleto e nada é criado', async () => {
    expect(
      await pedir('POST', '/trampos', 'token-sem-perfil', trampoValido),
    ).toEqual({ status: 409, corpo: { erro: 'perfil_incompleto' } });
    expect(await pedir('GET', '/trampos/meus', 'token-sem-perfil')).toEqual({
      status: 200,
      corpo: [],
    });
  });
});

describe('GET /trampos/meus e /trampos/:id', () => {
  it('CA4 — Dado trampos de autores diferentes, quando lista os meus, então vê só os dele', async () => {
    const meu = await publicar();
    await publicar('token-ana');

    const { status, corpo } = await pedir(
      'GET',
      '/trampos/meus',
      'token-empregador',
    );

    expect(status).toBe(200);
    expect(corpo.map((t: { id: string }) => t.id)).toEqual([meu]);
    expect(corpo[0]).not.toHaveProperty('textoBusca');
  });

  it('Dado um id inexistente, quando busca o detalhe, então recebe 404', async () => {
    expect(await pedir('GET', '/trampos/nao-existe', 'token-ana')).toEqual({
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
  });
});

describe('candidaturas (CA8, CA9, CA10, CA11, D9)', () => {
  it('CA8–CA11 — Dado um trampo aberto, quando candidatam, o autor lista, aceita e outro tenta depois, então cada passo responde conforme o contrato', async () => {
    const id = await publicar();

    const ana = await candidatar(id, 'token-ana');
    expect(ana).toEqual({
      status: 201,
      corpo: { id: expect.any(String), status: 'pendente' },
    });
    const bruno = await candidatar(id, 'token-bruno');
    expect(bruno.status).toBe(201);

    // CA8: o autor vê; os demais recebem 404.
    const lista = await pedir(
      'GET',
      `/trampos/${id}/candidaturas`,
      'token-empregador',
    );
    expect(lista.status).toBe(200);
    expect(lista.corpo).toEqual([
      {
        id: ana.corpo.id,
        freelancerId: ANA,
        mensagem: proposta.mensagem,
        valorPropostoCentavos: 45000,
        status: 'pendente',
        criadaEm: '2026-10-20T12:00:00.000Z',
      },
      expect.objectContaining({ id: bruno.corpo.id, freelancerId: BRUNO }),
    ]);
    expect(
      await pedir('GET', `/trampos/${id}/candidaturas`, 'token-ana'),
    ).toEqual({
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    // CA10: só o autor aceita; os demais recebem 404.
    const aceitar = `/trampos/${id}/candidaturas/${ana.corpo.id}/aceitar`;
    expect(await pedir('POST', aceitar, 'token-ana')).toEqual({
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    expect(await pedir('POST', aceitar, 'token-empregador')).toEqual({
      status: 200,
      corpo: { status: 'aceita' },
    });
    expect(
      (await pedir('GET', `/trampos/${id}`, 'token-ana')).corpo.status,
    ).toBe('em_andamento');
    const depois = await pedir(
      'GET',
      `/trampos/${id}/candidaturas`,
      'token-empregador',
    );
    expect(
      depois.corpo.map((c: { freelancerId: string; status: string }) => [
        c.freelancerId,
        c.status,
      ]),
    ).toEqual([
      [ANA, 'aceita'],
      [BRUNO, 'recusada'],
    ]);

    // CA10: aceitar de novo; CA11: candidatar a trampo que não está aberto.
    expect(await pedir('POST', aceitar, 'token-empregador')).toEqual({
      status: 409,
      corpo: { erro: 'trampo_nao_aberto' },
    });
    expect(await candidatar(id, 'token-carla')).toEqual({
      status: 409,
      corpo: { erro: 'trampo_nao_aberto' },
    });
  });

  it('CA9 — Dado o próprio autor ou uma segunda candidatura, quando candidata, então recebe 409 com o código da regra', async () => {
    const id = await publicar();
    await candidatar(id, 'token-ana');

    expect(await candidatar(id, 'token-empregador')).toEqual({
      status: 409,
      corpo: { erro: 'autor_nao_pode_candidatar' },
    });
    expect(await candidatar(id, 'token-ana')).toEqual({
      status: 409,
      corpo: { erro: 'candidatura_duplicada' },
    });
  });

  it('CA8 — Dado mensagem vazia e valor zero, quando candidata, então recebe 400 apontando os dois campos', async () => {
    const id = await publicar();

    expect(
      await pedir('POST', `/trampos/${id}/candidaturas`, 'token-ana', {
        mensagem: '   ',
        valorPropostoCentavos: 0,
      }),
    ).toEqual({
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [
          { campo: 'mensagem', motivo: 'obrigatorio' },
          { campo: 'valorPropostoCentavos', motivo: 'invalido' },
        ],
      },
    });
  });

  it('D9 — Dado um freelancer com perfil incompleto, quando candidata, então recebe 409 perfil_incompleto', async () => {
    const id = await publicar();
    expect(await candidatar(id, 'token-sem-perfil')).toEqual({
      status: 409,
      corpo: { erro: 'perfil_incompleto' },
    });
    expect(
      (await pedir('GET', `/trampos/${id}/candidaturas`, 'token-empregador'))
        .corpo,
    ).toEqual([]);
  });

  it('Dado um trampo ou uma candidatura inexistente, quando candidata ou aceita, então recebe 404', async () => {
    const id = await publicar();
    expect((await candidatar('nao-existe', 'token-ana')).status).toBe(404);
    expect(
      await pedir(
        'POST',
        `/trampos/${id}/candidaturas/nao-existe/aceitar`,
        'token-empregador',
      ),
    ).toEqual({ status: 404, corpo: { erro: 'nao_encontrado' } });
  });

  it('CA10 — Dado um aceite concorrente, quando a gravação perde a trava, então recebe 409 conflito_de_versao', async () => {
    class RepositorioQuePerde extends RepositorioDeTramposEmMemoria {
      perder = false;
      override async salvar(trampo: Trampo): Promise<void> {
        if (this.perder) {
          throw new ErroDeRegra('conflito_de_versao');
        }
        return super.salvar(trampo);
      }
    }
    await app.close();
    const repo = new RepositorioQuePerde();
    await montar(repo);
    const id = await publicar();
    const ana = await candidatar(id, 'token-ana');
    repo.perder = true;

    expect(
      await pedir(
        'POST',
        `/trampos/${id}/candidaturas/${ana.corpo.id}/aceitar`,
        'token-empregador',
      ),
    ).toEqual({ status: 409, corpo: { erro: 'conflito_de_versao' } });
  });
});

describe('GET /candidaturas/minhas', () => {
  it('CA8 — Dado candidaturas de vários freelancers, quando um lista as suas, então vê só as dele, com o trampo e o status', async () => {
    const id = await publicar();
    const ana = await candidatar(id, 'token-ana');
    await candidatar(id, 'token-bruno');
    await pedir(
      'POST',
      `/trampos/${id}/candidaturas/${ana.corpo.id}/aceitar`,
      'token-empregador',
    );

    expect(await pedir('GET', '/candidaturas/minhas', 'token-ana')).toEqual({
      status: 200,
      corpo: [
        {
          id: ana.corpo.id,
          trampoId: id,
          freelancerId: ANA,
          mensagem: proposta.mensagem,
          valorPropostoCentavos: 45000,
          status: 'aceita',
          criadaEm: '2026-10-20T12:00:00.000Z',
        },
      ],
    });
    expect(
      (await pedir('GET', '/candidaturas/minhas', 'token-bruno')).corpo.map(
        (c: { status: string }) => c.status,
      ),
    ).toEqual(['recusada']);
    expect(await pedir('GET', '/candidaturas/minhas', 'token-carla')).toEqual({
      status: 200,
      corpo: [],
    });
  });
});
