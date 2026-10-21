import { criarFetchFalso, type FetchFalso } from '../testes/fetch-falso';
import { buscar, listarCategorias } from './busca';
import { type ClienteHttp, criarCliente } from './cliente';
import { cadastrar, entrar, sair } from './contas';
import { ErroDaApi } from './erros';
import { obterMeuPerfil, obterPerfilPublico, salvarMeuPerfil } from './perfis';
import { obterServico } from './servicos';
import type {
  Categoria,
  ItemDaBusca,
  MeuPerfil,
  PaginaDaBusca,
  PerfilPublico,
  Servico,
  Trampo,
} from './tipos';
import { obterTrampo } from './trampos';

const URL_BASE = 'http://192.168.0.10:3000';
const TOKEN = 'token-da-sessao';
const EMAIL = 'joao.souza@exemplo.com';
const SENHA = 'segredo-do-joao';

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

const MEU_PERFIL: MeuPerfil = {
  nome: 'João Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura', 'reboco'],
  completo: true,
};

describe('contas (CA1, CA2)', () => {
  it('cadastrar faz POST /contas sem token, só com e-mail e senha, e devolve o token', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /contas', { status: 201, corpo: { token: 'novo' } });

    const sessao = await cadastrar(cliente, {
      email: EMAIL,
      senha: SENHA,
      extra: 'não vai',
    } as never);

    expect(sessao).toEqual({ token: 'novo' });
    const requisicao = falso.ultima();
    expect(requisicao.metodo).toBe('POST');
    expect(requisicao.url).toBe(`${URL_BASE}/contas`);
    expect(requisicao.corpo).toEqual({ email: EMAIL, senha: SENHA });
    expect(requisicao.cabecalhos).not.toHaveProperty('authorization');
  });

  it('cadastrar com e-mail em uso lança email_em_uso sem o e-mail no erro (CA2)', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /contas', {
      status: 409,
      corpo: { erro: 'email_em_uso' },
    });

    const erro = await capturar(
      cadastrar(cliente, { email: EMAIL, senha: SENHA }),
    );

    expect(erro).toMatchObject({ status: 409, codigo: 'email_em_uso' });
    expect(JSON.stringify(erro)).not.toContain(EMAIL);
    expect(erro.message).not.toContain(EMAIL);
    expect(aoExpirar).not.toHaveBeenCalled();
  });

  it('entrar faz POST /sessoes sem token e devolve o token', async () => {
    const { cliente, falso } = montar();
    falso.responder('POST /sessoes', { corpo: { token: 'outro' } });

    await expect(
      entrar(cliente, { email: EMAIL, senha: SENHA }),
    ).resolves.toEqual({ token: 'outro' });
    expect(falso.ultima().url).toBe(`${URL_BASE}/sessoes`);
    expect(falso.ultima().corpo).toEqual({ email: EMAIL, senha: SENHA });
    expect(falso.ultima().cabecalhos).not.toHaveProperty('authorization');
  });

  it('entrar com senha errada lança credenciais_invalidas sem chamar aoExpirar (CA14)', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('POST /sessoes', {
      status: 401,
      corpo: { erro: 'credenciais_invalidas' },
    });

    const erro = await capturar(
      entrar(cliente, { email: EMAIL, senha: SENHA }),
    );

    expect(erro).toMatchObject({
      status: 401,
      codigo: 'credenciais_invalidas',
    });
    expect(aoExpirar).not.toHaveBeenCalled();
    expect(JSON.stringify(erro)).not.toContain(SENHA);
  });

  it('sair faz DELETE /sessoes com o token e resolve com o 204', async () => {
    const { cliente, falso } = montar();
    falso.responder('DELETE /sessoes', { status: 204 });

    await expect(sair(cliente)).resolves.toBeUndefined();
    expect(falso.ultima().metodo).toBe('DELETE');
    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe('perfis (CA3)', () => {
  it('obterMeuPerfil faz GET /perfis/eu com token e devolve o perfil', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /perfis/eu', { corpo: MEU_PERFIL });

    await expect(obterMeuPerfil(cliente)).resolves.toEqual(MEU_PERFIL);
    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('obterMeuPerfil devolve null no 404 (perfil ainda não salvo)', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /perfis/eu', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    await expect(obterMeuPerfil(cliente)).resolves.toBeNull();
  });

  it('obterMeuPerfil repassa os outros erros', async () => {
    const { cliente, falso, aoExpirar } = montar();
    falso.responder('GET /perfis/eu', [
      { status: 500, corpo: { erro: 'interno' } },
      { status: 401, corpo: { erro: 'nao_autenticado' } },
    ]);

    await expect(capturar(obterMeuPerfil(cliente))).resolves.toMatchObject({
      codigo: 'interno',
    });
    await expect(capturar(obterMeuPerfil(cliente))).resolves.toMatchObject({
      codigo: 'sessao_expirada',
    });
    expect(aoExpirar).toHaveBeenCalledTimes(1);
  });

  it('salvarMeuPerfil faz PUT /perfis/eu só com as chaves aceitas', async () => {
    const { cliente, falso } = montar();
    falso.responder('PUT /perfis/eu', { corpo: MEU_PERFIL });

    const salvo = await salvarMeuPerfil(cliente, {
      nome: 'João Souza',
      cidade: 'Lavras',
      habilidades: ['pintura', 'reboco'],
    });

    expect(salvo).toEqual(MEU_PERFIL);
    expect(falso.ultima().metodo).toBe('PUT');
    expect(falso.ultima().corpo).toEqual({
      nome: 'João Souza',
      cidade: 'Lavras',
      habilidades: ['pintura', 'reboco'],
    });
    expect(falso.ultima().corpo).not.toHaveProperty('descricao');
  });

  it('salvarMeuPerfil manda a descrição quando informada, inclusive null', async () => {
    const { cliente, falso } = montar();
    falso.responder('PUT /perfis/eu', { corpo: MEU_PERFIL });

    await salvarMeuPerfil(cliente, {
      nome: 'João',
      cidade: 'Lavras',
      descricao: 'Pintor há 10 anos',
      habilidades: ['pintura'],
    });
    expect(falso.ultima().corpo).toMatchObject({
      descricao: 'Pintor há 10 anos',
    });

    await salvarMeuPerfil(cliente, {
      nome: 'João',
      cidade: 'Lavras',
      descricao: null,
      habilidades: ['pintura'],
    });
    expect(falso.ultima().corpo).toMatchObject({ descricao: null });
  });

  it('salvarMeuPerfil recusado devolve os campos sem os valores digitados', async () => {
    const { cliente, falso } = montar();
    falso.responder('PUT /perfis/eu', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'nome', motivo: 'tamanho' }],
      },
    });

    const erro = await capturar(
      salvarMeuPerfil(cliente, {
        nome: 'J',
        cidade: 'Lavras',
        habilidades: ['pintura'],
      }),
    );

    expect(erro).toMatchObject({
      codigo: 'dados_invalidos',
      campos: [{ campo: 'nome', motivo: 'tamanho' }],
    });
    expect(JSON.stringify(erro)).not.toContain('Lavras');
  });

  it('obterPerfilPublico faz GET /perfis/:contaId e devolve o perfil público', async () => {
    const { cliente, falso } = montar();
    const perfil: PerfilPublico = {
      contaId: 'c1',
      nome: 'Ana',
      cidade: 'Lavras',
      descricao: 'Diarista',
      habilidades: ['limpeza'],
    };
    falso.responder('GET /perfis/c1', { corpo: perfil });

    await expect(obterPerfilPublico(cliente, 'c1')).resolves.toEqual(perfil);
    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('obterPerfilPublico codifica o id na URL', async () => {
    const { cliente, falso } = montar();

    await capturar(obterPerfilPublico(cliente, 'eu/../../busca?x=1#y'));

    expect(falso.ultima().url).toBe(
      `${URL_BASE}/perfis/eu%2F..%2F..%2Fbusca%3Fx%3D1%23y`,
    );
  });

  it('obterPerfilPublico no 404 lança nao_encontrado (não vira null)', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /perfis/c2', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });

    const erro = await capturar(obterPerfilPublico(cliente, 'c2'));

    expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });

  it('obterPerfilPublico com id "..", "." ou vazio lança nao_encontrado sem requisição', async () => {
    const { cliente, falso } = montar();

    for (const id of ['..', '.', '']) {
      const erro = await capturar(obterPerfilPublico(cliente, id));
      expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
    }
    expect(falso.requisicoes).toHaveLength(0);
  });
});

describe('busca (CA7)', () => {
  const PAGINA: PaginaDaBusca = {
    itens: [
      {
        tipo: 'trampo',
        id: 't1',
        autorId: 'a1',
        titulo: 'Pintar muro',
        categoria: 'reformas',
        cidade: 'Lavras',
        criadoEm: '2026-10-20T12:00:00.000Z',
        valorCentavos: 15000,
      },
      {
        tipo: 'servico',
        id: 's1',
        autorId: 'a2',
        titulo: 'Aulas de violão',
        categoria: 'aulas',
        cidade: null,
        criadoEm: '2026-10-19T12:00:00.000Z',
        precoBaseCentavos: 8000,
      },
    ],
    proximoCursor: 'cursor-2',
  };

  it('buscar faz GET /busca com os filtros na query e devolve a página na ordem da API', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /busca', { corpo: PAGINA });

    const pagina = await buscar(cliente, {
      texto: 'pintar muro',
      categoria: 'reformas',
      cidade: 'Lavras',
      tipo: 'trampos',
      antesDe: 'cursor-1',
      limite: 20,
    });

    expect(pagina).toEqual(PAGINA);
    expect(pagina.itens.map((item) => item.id)).toEqual(['t1', 's1']);
    expect(falso.ultima().query).toEqual({
      texto: 'pintar muro',
      categoria: 'reformas',
      cidade: 'Lavras',
      tipo: 'trampos',
      antesDe: 'cursor-1',
      limite: '20',
    });
    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('buscar omite filtros vazios e indefinidos', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /busca', { corpo: PAGINA });

    await buscar(cliente, { texto: '', cidade: '  ', tipo: 'servicos' });
    expect(falso.ultima().url).toBe(`${URL_BASE}/busca?tipo=servicos`);

    await buscar(cliente);
    expect(falso.ultima().url).toBe(`${URL_BASE}/busca`);
  });

  it('buscar não manda chaves fora da lista de filtros', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /busca', { corpo: PAGINA });

    await buscar(cliente, { tipo: 'todos', email: EMAIL } as never);

    expect(falso.ultima().query).toEqual({ tipo: 'todos' });
  });

  it('o item da busca é uma união discriminada por tipo', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /busca', { corpo: PAGINA });

    const { itens } = await buscar(cliente, {});
    const valores = itens.map((item: ItemDaBusca) =>
      item.tipo === 'trampo' ? item.valorCentavos : item.precoBaseCentavos,
    );

    expect(valores).toEqual([15000, 8000]);
  });

  it('buscar com filtro inválido lança dados_invalidos', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /busca', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'limite', motivo: 'invalido' }],
      },
    });

    const erro = await capturar(buscar(cliente, { limite: 99 }));

    expect(erro).toMatchObject({
      codigo: 'dados_invalidos',
      campos: [{ campo: 'limite', motivo: 'invalido' }],
    });
  });

  it('listarCategorias faz GET /categorias e devolve [{id, rotulo}]', async () => {
    const { cliente, falso } = montar();
    const categorias: Categoria[] = [
      { id: 'reformas', rotulo: 'Reformas e reparos' },
      { id: 'aulas', rotulo: 'Aulas' },
    ];
    falso.responder('GET /categorias', { corpo: categorias });

    await expect(listarCategorias(cliente)).resolves.toEqual(categorias);
    expect(falso.ultima().url).toBe(`${URL_BASE}/categorias`);
  });
});

describe('detalhes de trampo e serviço', () => {
  it('obterTrampo faz GET /trampos/:id com o id codificado', async () => {
    const { cliente, falso } = montar();
    const trampo: Trampo = {
      id: 'a b/c',
      autorId: 'a1',
      titulo: 'Pintar muro',
      descricao: 'Muro de 10 m',
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 15000,
      prazo: '2026-11-01',
      status: 'aberto',
      criadoEm: '2026-10-20T12:00:00.000Z',
    };
    falso.responder('GET /trampos/a%20b%2Fc', { corpo: trampo });

    await expect(obterTrampo(cliente, 'a b/c')).resolves.toEqual(trampo);
    expect(falso.ultima().url).toBe(`${URL_BASE}/trampos/a%20b%2Fc`);
    expect(falso.ultima().cabecalhos.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('obterTrampo inexistente lança nao_encontrado', async () => {
    const { cliente } = montar();

    const erro = await capturar(obterTrampo(cliente, 'nao-existe'));

    expect(erro).toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });

  it('obterServico faz GET /servicos/:id com o id codificado e aceita cidade null', async () => {
    const { cliente, falso } = montar();
    const servico: Servico = {
      id: 's?1',
      autorId: 'a2',
      titulo: 'Aulas de violão',
      descricao: 'Online',
      categoria: 'aulas',
      cidade: null,
      precoBaseCentavos: 8000,
      status: 'ativo',
      criadoEm: '2026-10-19T12:00:00.000Z',
    };
    falso.responder('GET /servicos/s%3F1', { corpo: servico });

    await expect(obterServico(cliente, 's?1')).resolves.toEqual(servico);
    expect(falso.ultima().url).toBe(`${URL_BASE}/servicos/s%3F1`);
  });
});

describe('fetch falso', () => {
  it('escolhe a rota com query mais específica e cai na rota sem query', async () => {
    const { cliente, falso } = montar();
    falso
      .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
      .responder('GET /busca?tipo=trampos', {
        corpo: { itens: [], proximoCursor: 'so-trampos' },
      });

    await expect(
      buscar(cliente, { tipo: 'trampos', limite: 10 }),
    ).resolves.toMatchObject({ proximoCursor: 'so-trampos' });
    await expect(buscar(cliente, { tipo: 'servicos' })).resolves.toMatchObject({
      proximoCursor: null,
    });
  });

  it('com uma lista, devolve uma resposta por chamada e repete a última', async () => {
    const { cliente, falso } = montar();
    falso.responder('GET /categorias', [{ status: 500 }, { corpo: [] }]);

    await expect(capturar(listarCategorias(cliente))).resolves.toMatchObject({
      status: 500,
    });
    await expect(listarCategorias(cliente)).resolves.toEqual([]);
    await expect(listarCategorias(cliente)).resolves.toEqual([]);
    expect(falso.requisicoes).toHaveLength(3);
  });
});
