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

/** Página que cabe todos os trampos de um autor nestes testes. */
const PAGINA_CHEIA = { limite: 50 } as const;

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

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

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
    ['PUT', `/trampos/${id}`, { ...trampoValido, versao: 1 }],
    ['POST', `/trampos/${id}/encerrar`],
    ['DELETE', `/trampos/${id}`],
    ['DELETE', `/candidaturas/${cid}`],
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
    expect(await repositorio.listarDoAutor(EMPREGADOR, PAGINA_CHEIA)).toEqual(
      [],
    );
    expect(await repositorio.listarDoAutor(ANA, PAGINA_CHEIA)).toEqual([]);
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
      // Campos da visão do autor (D33): o schema os aceita; quem decide se
      // saem é o caso de uso (testes de CA31 abaixo).
      versao: 7,
      candidaturasRecebidas: 2,
      textoBusca: 'segredo-interno',
      cidadeNormalizada: 'segredo-interno-2',
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
        .filter((k) => k !== 'textoBusca' && k !== 'cidadeNormalizada')
        .sort(),
    );
    expect(t.body).not.toContain('segredo-interno');
    expect(t.json()).toMatchObject({ versao: 7, candidaturasRecebidas: 2 });
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

describe('CA66 — GET /trampos/meus paginado (D47)', () => {
  type TrampoDaLista = { id: string; autorId: string; criadoEm: string };

  async function publicarVarios(quantos: number, token = 'token-empregador') {
    const ids: string[] = [];
    for (let i = 0; i < quantos; i += 1) {
      ids.push(await publicar(token));
    }
    return ids;
  }

  function query(campos: Record<string, string>): string {
    return new URLSearchParams(campos).toString();
  }

  async function meus(token: string, campos: Record<string, string> = {}) {
    const busca = query(campos);
    return pedir('GET', `/trampos/meus${busca ? `?${busca}` : ''}`, token);
  }

  it('CA66 — Dado 25 trampos, quando o autor lista sem parâmetros e segue o cursor do último, então recebe 20 e depois 5, sem repetir, na visão do autor', async () => {
    const ids = await publicarVarios(25);

    const primeira = await meus('token-empregador');
    expect(primeira.status).toBe(200);
    expect(primeira.corpo).toHaveLength(20);
    const ultimo = primeira.corpo.at(-1) as TrampoDaLista;
    const segunda = await meus('token-empregador', {
      antesDeCriadoEm: ultimo.criadoEm,
      antesDeId: ultimo.id,
    });

    expect(segunda.status).toBe(200);
    expect(segunda.corpo).toHaveLength(5);
    const vistos = [...primeira.corpo, ...segunda.corpo].map(
      (t: TrampoDaLista) => t.id,
    );
    expect(new Set(vistos).size).toBe(25);
    expect([...vistos].sort()).toEqual([...ids].sort());
    expect(vistos).toEqual([...vistos].sort().reverse());
    for (const trampo of [...primeira.corpo, ...segunda.corpo]) {
      expect(trampo).toMatchObject({ versao: 1, candidaturasRecebidas: 0 });
    }
  });

  it('CA66 — Dado limite 1 ou 50, quando lista, então recebe no máximo esse número', async () => {
    await publicarVarios(51);

    expect(
      (await meus('token-empregador', { limite: '1' })).corpo,
    ).toHaveLength(1);
    expect(
      (await meus('token-empregador', { limite: '50' })).corpo,
    ).toHaveLength(50);
  });

  it('CA66 — Dado limite 0, 51 ou fora de inteiro, quando lista, então recebe 400 dados_invalidos no limite', async () => {
    await publicar();

    for (const limite of [
      '0',
      '51',
      '1000',
      '-1',
      '1.5',
      'abc',
      '',
      '1e1',
      '0x10',
      '10.0',
      ' 5',
    ]) {
      expect(await meus('token-empregador', { limite }), limite).toEqual({
        status: 400,
        corpo: {
          erro: 'dados_invalidos',
          campos: [{ campo: 'limite', motivo: 'invalido' }],
        },
      });
    }
  });

  it('CA66 — Dado o cursor pela metade, quando lista, então recebe 400 com o campo que falta', async () => {
    const [id] = await publicarVarios(1);

    expect(
      await meus('token-empregador', {
        antesDeCriadoEm: '2026-10-20T12:00:00.000Z',
      }),
    ).toEqual({
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'antesDeId', motivo: 'obrigatorio' }],
      },
    });
    expect(await meus('token-empregador', { antesDeId: id as string })).toEqual(
      {
        status: 400,
        corpo: {
          erro: 'dados_invalidos',
          campos: [{ campo: 'antesDeCriadoEm', motivo: 'obrigatorio' }],
        },
      },
    );
  });

  it('CA66 — Dado o cursor fora do formato, quando lista, então recebe 400 sem ecoar o valor', async () => {
    const [id] = await publicarVarios(1);

    const resposta = await app.inject({
      method: 'GET',
      url: `/trampos/meus?${query({
        antesDeCriadoEm: '2026-10-20T09:00:00-03:00',
        antesDeId: 'id-qualquer-fulano',
      })}`,
      headers: { authorization: 'Bearer token-empregador' },
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [
        { campo: 'antesDeCriadoEm', motivo: 'invalido' },
        { campo: 'antesDeId', motivo: 'invalido' },
      ],
    });
    expect(resposta.body).not.toContain('fulano');
    expect(resposta.body).not.toContain('-03:00');
    expect(
      await meus('token-empregador', {
        antesDeCriadoEm: 'ontem',
        antesDeId: id as string,
      }),
    ).toMatchObject({ status: 400 });
  });

  it('CA66 — Dado uma chave extra ou repetida na querystring, quando lista, então recebe 400 dados_invalidos', async () => {
    await publicar();

    for (const busca of [
      `autorId=${ANA}`,
      'status=aberto',
      'antesDe=abc',
      'limite=10&pagina=2',
      'limite=1&limite=2',
    ]) {
      const resposta = await pedir(
        'GET',
        `/trampos/meus?${busca}`,
        'token-empregador',
      );
      expect(resposta.status, busca).toBe(400);
      expect(resposta.corpo.erro, busca).toBe('dados_invalidos');
    }
  });

  it('CA66 — Dado uma querystring inválida sem sessão, quando lista, então recebe 401 antes do 400', async () => {
    expect(await meus('token-desconhecido', { limite: '0' })).toEqual({
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });
  });

  it('CA66 — Dado o cursor de um trampo de outra conta, quando um terceiro pagina, então nunca vê trampo de outro', async () => {
    const doEmpregador = await publicarVarios(22);
    const daAna = await publicarVarios(3, 'token-ana');
    const deTodos = [...doEmpregador, ...daAna].sort().reverse();

    for (const cursorId of deTodos) {
      const resposta = await meus('token-ana', {
        antesDeCriadoEm: '2026-10-20T12:00:00.000Z',
        antesDeId: cursorId,
        limite: '50',
      });
      expect(resposta.status).toBe(200);
      for (const trampo of resposta.corpo as TrampoDaLista[]) {
        expect(trampo.autorId).toBe(ANA);
        expect(daAna).toContain(trampo.id);
        expect(trampo.id < cursorId).toBe(true);
      }
    }
    const daPrimeiraPagina = (await meus('token-ana')).corpo as TrampoDaLista[];
    expect(daPrimeiraPagina.map((t) => t.id).sort()).toEqual([...daAna].sort());
  });

  it('CA66 e D46 — Dado um trampo fora da primeira página, quando o autor abre o detalhe, então recebe a visão do autor; o terceiro, não', async () => {
    await publicarVarios(21);
    const primeira = (await meus('token-empregador')).corpo as TrampoDaLista[];
    const ultimo = primeira.at(-1) as TrampoDaLista;
    const [foraDaPrimeira] = (
      await meus('token-empregador', {
        antesDeCriadoEm: ultimo.criadoEm,
        antesDeId: ultimo.id,
      })
    ).corpo as TrampoDaLista[];
    if (foraDaPrimeira === undefined) {
      throw new Error('esperava um trampo na segunda página');
    }
    expect(primeira.map((t) => t.id)).not.toContain(foraDaPrimeira.id);

    const doAutor = await pedir(
      'GET',
      `/trampos/${foraDaPrimeira.id}`,
      'token-empregador',
    );
    expect(doAutor.corpo).toMatchObject({
      versao: 1,
      candidaturasRecebidas: 0,
    });
    const doTerceiro = await pedir(
      'GET',
      `/trampos/${foraDaPrimeira.id}`,
      'token-ana',
    );
    expect(Object.keys(doTerceiro.corpo).sort()).toEqual(CHAVES_DE_TERCEIRO);
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

/** Corpo de terceiro: exatamente o de antes da L2 (sem versao nem contagem). */
const CHAVES_DE_TERCEIRO = [
  'autorId',
  'categoria',
  'cidade',
  'criadoEm',
  'descricao',
  'id',
  'prazo',
  'status',
  'titulo',
  'valorCentavos',
];

const edicao = {
  titulo: 'Trocar o piso',
  descricao: 'Piso da cozinha, 12 m².',
  categoria: 'reformas',
  cidade: 'Belo Horizonte',
  valorCentavos: 90000,
  prazo: '2026-12-01',
};

describe('CA31 — visão do autor em GET /trampos/:id e /trampos/meus', () => {
  it('CA31 — Dado o autor, quando lê, então vê versao e candidaturasRecebidas; terceiro e candidato recebem o corpo de antes', async () => {
    const id = await publicar();
    await candidatar(id, 'token-ana');

    const doAutor = await pedir('GET', `/trampos/${id}`, 'token-empregador');
    expect(doAutor.corpo).toMatchObject({
      versao: 2,
      candidaturasRecebidas: 1,
    });
    const meus = await pedir('GET', '/trampos/meus', 'token-empregador');
    expect(meus.corpo).toEqual([doAutor.corpo]);

    for (const token of ['token-ana', 'token-carla']) {
      const visao = await pedir('GET', `/trampos/${id}`, token);
      expect(visao.status).toBe(200);
      expect(Object.keys(visao.corpo).sort()).toEqual(CHAVES_DE_TERCEIRO);
      const { versao: _v, candidaturasRecebidas: _c, ...resto } = doAutor.corpo;
      expect(visao.corpo).toEqual(resto);
    }
  });
});

describe('PUT /trampos/:id (CA25)', () => {
  it('CA25 — Dado o autor com a versão lida, quando edita, então recebe 204 sem corpo e o detalhe traz os campos novos com o mesmo criadoEm', async () => {
    const id = await publicar();

    const resposta = await app.inject({
      method: 'PUT',
      url: `/trampos/${id}`,
      headers: { authorization: 'Bearer token-empregador' },
      payload: { ...edicao, versao: 1 },
    });

    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe('');
    expect((await pedir('GET', `/trampos/${id}`, 'token-ana')).corpo).toEqual({
      id,
      autorId: EMPREGADOR,
      ...edicao,
      status: 'aberto',
      criadoEm: '2026-10-20T12:00:00.000Z',
    });
  });

  it('CA25 — Dado chaves extras (autor, status, data, id), quando edita, então recebe 400 e nada muda', async () => {
    const id = await publicar();
    const antes = (await repositorio.buscarPorId(id))?.dados();

    for (const extra of [
      { autorId: ANA },
      { status: 'encerrado' },
      { criadoEm: '2020-01-01T00:00:00.000Z' },
      { id: 'outro-id' },
      { candidaturasRecebidas: 0 },
    ]) {
      const resposta = await pedir(
        'PUT',
        `/trampos/${id}`,
        'token-empregador',
        {
          ...edicao,
          versao: 1,
          ...extra,
        },
      );
      expect(resposta.status, Object.keys(extra)[0]).toBe(400);
      expect(resposta.corpo.erro).toBe('dados_invalidos');
    }
    expect((await repositorio.buscarPorId(id))?.dados()).toEqual(antes);
  });

  it('CA25 — Dado versão ausente, nula, zero ou texto, quando edita um trampo que nem existe, então recebe 400 em versao (antes do 404)', async () => {
    for (const versao of [undefined, null]) {
      expect(
        await pedir('PUT', '/trampos/nao-existe', 'token-carla', {
          ...edicao,
          versao,
        }),
      ).toEqual({
        status: 400,
        corpo: {
          erro: 'dados_invalidos',
          campos: [{ campo: 'versao', motivo: 'obrigatorio' }],
        },
      });
    }
    for (const versao of [0, '1', 1.5]) {
      const resposta = await pedir(
        'PUT',
        '/trampos/nao-existe',
        'token-carla',
        {
          ...edicao,
          versao,
        },
      );
      expect(resposta.status, String(versao)).toBe(400);
      expect(resposta.corpo.erro).toBe('dados_invalidos');
    }
  });

  it('CA25 — Dado outra conta, id inexistente ou fora do formato, quando edita, então recebe 404', async () => {
    const id = await publicar();
    for (const [url, token] of [
      [`/trampos/${id}`, 'token-ana'],
      ['/trampos/nao-existe', 'token-empregador'],
      ['/trampos/00000000-0000-4000-8000-000000000000', 'token-empregador'],
    ] as const) {
      expect(await pedir('PUT', url, token, { ...edicao, versao: 1 })).toEqual({
        status: 404,
        corpo: { erro: 'nao_encontrado' },
      });
    }
  });

  it('CA25 — Dado um trampo com candidatura, quando o autor edita, então recebe 409 trampo_nao_editavel; com versão velha, 409 conflito_de_versao', async () => {
    const comCandidatura = await publicar();
    await candidatar(comCandidatura, 'token-ana');
    const semCandidatura = await publicar();

    expect(
      await pedir('PUT', `/trampos/${comCandidatura}`, 'token-empregador', {
        ...edicao,
        versao: 2,
      }),
    ).toEqual({ status: 409, corpo: { erro: 'trampo_nao_editavel' } });
    expect(
      await pedir('PUT', `/trampos/${semCandidatura}`, 'token-empregador', {
        ...edicao,
        versao: 7,
      }),
    ).toEqual({ status: 409, corpo: { erro: 'conflito_de_versao' } });
  });

  it('CA25 e CA5 — Dado campos inválidos, quando o autor edita, então recebe 400 apontando os campos, sem ecoar o valor', async () => {
    const id = await publicar();

    const resposta = await pedir('PUT', `/trampos/${id}`, 'token-empregador', {
      ...edicao,
      titulo: 'SEG',
      cidade: null,
      versao: 1,
    });

    expect(resposta).toEqual({
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [
          { campo: 'titulo', motivo: 'tamanho' },
          { campo: 'cidade', motivo: 'obrigatorio' },
        ],
      },
    });
  });
});

describe('POST /trampos/:id/encerrar (CA27)', () => {
  it('CA27 — Dado o autor, quando encerra, então 204; de novo, 204; candidatar e aceitar dão 409 trampo_nao_aberto', async () => {
    const id = await publicar();
    const ana = await candidatar(id, 'token-ana');

    for (let vez = 1; vez <= 2; vez += 1) {
      expect(
        await pedir('POST', `/trampos/${id}/encerrar`, 'token-empregador'),
        `vez ${vez}`,
      ).toEqual({ status: 204, corpo: undefined });
    }
    expect(
      (await pedir('GET', `/trampos/${id}`, 'token-ana')).corpo.status,
    ).toBe('encerrado');
    expect(await candidatar(id, 'token-carla')).toEqual({
      status: 409,
      corpo: { erro: 'trampo_nao_aberto' },
    });
    expect(
      await pedir(
        'POST',
        `/trampos/${id}/candidaturas/${ana.corpo.id}/aceitar`,
        'token-empregador',
      ),
    ).toEqual({ status: 409, corpo: { erro: 'trampo_nao_aberto' } });
    expect(
      (await pedir('GET', '/candidaturas/minhas', 'token-ana')).corpo[0].status,
    ).toBe('recusada');
  });

  it('CA27 — Dado outra conta ou trampo inexistente, quando encerra, então 404 e nada muda', async () => {
    const id = await publicar();
    for (const [url, token] of [
      [`/trampos/${id}/encerrar`, 'token-ana'],
      ['/trampos/nao-existe/encerrar', 'token-empregador'],
    ] as const) {
      expect(await pedir('POST', url, token)).toEqual({
        status: 404,
        corpo: { erro: 'nao_encontrado' },
      });
    }
    expect((await repositorio.buscarPorId(id))?.status).toBe('aberto');
  });
});

describe('DELETE /trampos/:id (CA28)', () => {
  it('CA28 — Dado o autor e um trampo aberto com candidatura, quando exclui, então 204 e o detalhe passa a dar 404', async () => {
    const id = await publicar();
    await candidatar(id, 'token-ana');

    expect(await pedir('DELETE', `/trampos/${id}`, 'token-empregador')).toEqual(
      { status: 204, corpo: undefined },
    );
    expect(await pedir('GET', `/trampos/${id}`, 'token-empregador')).toEqual({
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    expect(await pedir('GET', '/candidaturas/minhas', 'token-ana')).toEqual({
      status: 200,
      corpo: [],
    });
  });

  it('CA28 — Dado um trampo encerrado, quando o autor exclui, então 409 trampo_nao_aberto; de outra conta ou inexistente, 404', async () => {
    const id = await publicar();
    await pedir('POST', `/trampos/${id}/encerrar`, 'token-empregador');

    expect(await pedir('DELETE', `/trampos/${id}`, 'token-empregador')).toEqual(
      { status: 409, corpo: { erro: 'trampo_nao_aberto' } },
    );
    const aberto = await publicar();
    for (const [url, token] of [
      [`/trampos/${aberto}`, 'token-ana'],
      ['/trampos/nao-existe', 'token-empregador'],
    ] as const) {
      expect(await pedir('DELETE', url, token)).toEqual({
        status: 404,
        corpo: { erro: 'nao_encontrado' },
      });
    }
    expect(await repositorio.buscarPorId(aberto)).not.toBeNull();
  });
});

describe('DELETE /candidaturas/:id (CA29)', () => {
  it('CA29 — Dado a candidatura pendente do próprio freelancer, quando retira, então 204 e ele pode se candidatar de novo', async () => {
    const id = await publicar();
    const ana = await candidatar(id, 'token-ana');

    expect(
      await pedir('DELETE', `/candidaturas/${ana.corpo.id}`, 'token-ana'),
    ).toEqual({ status: 204, corpo: undefined });
    expect(await pedir('GET', '/candidaturas/minhas', 'token-ana')).toEqual({
      status: 200,
      corpo: [],
    });
    expect((await candidatar(id, 'token-ana')).status).toBe(201);
  });

  it('CA29 — Dado candidatura aceita, 409 candidatura_nao_pendente; de outra conta ou inexistente, 404', async () => {
    const id = await publicar();
    const ana = await candidatar(id, 'token-ana');
    await pedir(
      'POST',
      `/trampos/${id}/candidaturas/${ana.corpo.id}/aceitar`,
      'token-empregador',
    );

    expect(
      await pedir('DELETE', `/candidaturas/${ana.corpo.id}`, 'token-ana'),
    ).toEqual({ status: 409, corpo: { erro: 'candidatura_nao_pendente' } });
    for (const [url, token] of [
      [`/candidaturas/${ana.corpo.id}`, 'token-empregador'],
      [`/candidaturas/${ana.corpo.id}`, 'token-bruno'],
      ['/candidaturas/nao-existe', 'token-ana'],
    ] as const) {
      expect(await pedir('DELETE', url, token)).toEqual({
        status: 404,
        corpo: { erro: 'nao_encontrado' },
      });
    }
  });
});
