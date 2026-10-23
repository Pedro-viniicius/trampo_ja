/**
 * QA da L2 (CA25 a CA31) pela API montada: o que a suíte do dev não cobre.
 *
 * Foco: matriz de validação do `PUT`, ordem das checagens (400, 404, regra,
 * versão, campos), encadeamento de estados (editar depois de retirar, encerrar
 * duas vezes, retirar em trampo encerrado), visão do autor em toda rota que
 * devolve anúncio, e `servicos` (editar e excluir).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import {
  candidatar,
  criarUsuario,
  limparBanco,
  montar,
  ofertarServico,
  pedir,
  publicarTrampo,
  type Resposta,
  relogioQueAvanca,
  type Usuario,
} from './apoio.js';

let app: Aplicacao;

beforeAll(async () => {
  await limparBanco();
  app = await montar({ relogio: relogioQueAvanca() });
});

afterAll(async () => {
  await app?.fechar();
  await limparBanco();
});

type Objeto = Record<string, unknown>;

const put = (id: string, quem: Usuario, corpo: unknown) =>
  pedir(app, 'PUT', `/trampos/${id}`, { token: quem.token, corpo });
const encerrar = (id: string, quem: Usuario) =>
  pedir(app, 'POST', `/trampos/${id}/encerrar`, { token: quem.token });
const excluir = (id: string, quem: Usuario) =>
  pedir(app, 'DELETE', `/trampos/${id}`, { token: quem.token });
const retirar = (id: string, quem: Usuario) =>
  pedir(app, 'DELETE', `/candidaturas/${id}`, { token: quem.token });
const aceitar = (trampoId: string, candidaturaId: string, quem: Usuario) =>
  pedir(
    app,
    'POST',
    `/trampos/${trampoId}/candidaturas/${candidaturaId}/aceitar`,
    {
      token: quem.token,
    },
  );

async function ler(id: string, quem: Usuario): Promise<Objeto> {
  const r = await pedir(app, 'GET', `/trampos/${id}`, { token: quem.token });
  expect(r.status, r.texto).toBe(200);
  return r.corpo as Objeto;
}

async function meus(quem: Usuario): Promise<Objeto[]> {
  const r = await pedir(app, 'GET', '/trampos/meus', { token: quem.token });
  expect(r.status, r.texto).toBe(200);
  return r.corpo as Objeto[];
}

async function naBusca(quem: Usuario, texto: string): Promise<string[]> {
  const r = await pedir(
    app,
    'GET',
    `/busca?tipo=trampos&texto=${encodeURIComponent(texto)}`,
    { token: quem.token },
  );
  expect(r.status, r.texto).toBe(200);
  return (r.corpo as { itens: { id: string }[] }).itens.map((i) => i.id);
}

function corpoDeEdicao(versao: unknown, extra: Objeto = {}): Objeto {
  return {
    titulo: 'Titulo editado pela QA',
    descricao: 'Descricao editada pela QA com algum detalhe.',
    categoria: 'reformas',
    cidade: 'Perdoes',
    valorCentavos: 71_000,
    versao,
    ...extra,
  };
}

function erro(r: Resposta, status: number, codigo: string): void {
  expect(r.status, r.texto).toBe(status);
  expect((r.corpo as Objeto).erro).toBe(codigo);
}

async function par() {
  const autor = await criarUsuario(app);
  const outro = await criarUsuario(app);
  return { autor, outro };
}

describe('CA25 — PUT /trampos/:id: matriz de validação e ordem das checagens', () => {
  it('rejeita cada versao inválida com 400 dados_invalidos e não altera o trampo', async () => {
    const { autor } = await par();
    const id = await publicarTrampo(app, autor);
    const antes = await ler(id, autor);
    for (const versao of [0, -1, 1.5, '1', true, [], {}, 2 ** 53, 1e308]) {
      const r = await put(id, autor, corpoDeEdicao(versao));
      erro(r, 400, 'dados_invalidos');
    }
    for (const versao of [undefined, null]) {
      const corpo = corpoDeEdicao(versao);
      if (versao === undefined) {
        delete corpo.versao;
      }
      const r = await put(id, autor, corpo);
      erro(r, 400, 'dados_invalidos');
    }
    expect(await ler(id, autor)).toEqual(antes);
  });

  it('versao inválida dá 400 até para quem não é o autor (o schema vem antes do 404, sem revelar existência)', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    erro(await put(id, outro, corpoDeEdicao(0)), 400, 'dados_invalidos');
    erro(
      await put(randomUUID(), outro, corpoDeEdicao(0)),
      400,
      'dados_invalidos',
    );
  });

  it('campos inválidos de terceiro dão 404 (a regra de existência vem antes dos campos) e do autor dão 400 com todos os campos apontados', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    const ruim = corpoDeEdicao(1, {
      titulo: 'abc',
      descricao: '',
      categoria: 'inexistente',
      cidade: 'x',
      valorCentavos: 0,
      prazo: '2026-02-30',
    });
    erro(await put(id, outro, ruim), 404, 'nao_encontrado');
    const r = await put(id, autor, ruim);
    erro(r, 400, 'dados_invalidos');
    const campos = ((r.corpo as Objeto).campos as { campo: string }[]).map(
      (c) => c.campo,
    );
    expect(campos.sort()).toEqual(
      [
        'categoria',
        'cidade',
        'descricao',
        'prazo',
        'titulo',
        'valorCentavos',
      ].sort(),
    );
    // Nenhum valor enviado volta na resposta (CA15).
    expect(r.texto).not.toContain('2026-02-30');
    expect(r.texto).not.toContain('inexistente');
  });

  it('com versão velha E campo inválido, responde 409 conflito (regra antes dos campos)', async () => {
    const { autor } = await par();
    const id = await publicarTrampo(app, autor);
    erro(
      await put(id, autor, corpoDeEdicao(7, { titulo: 'abc' })),
      409,
      'conflito_de_versao',
    );
  });

  it('com candidatura, a regra de não editável vem antes da versão: versão errada também dá trampo_nao_editavel', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    expect((await candidatar(app, outro, id)).status).toBe(201);
    erro(await put(id, autor, corpoDeEdicao(1)), 409, 'trampo_nao_editavel');
    erro(await put(id, autor, corpoDeEdicao(99)), 409, 'trampo_nao_editavel');
    // E campo inválido também: o 409 da regra vem antes do 400 dos campos.
    erro(
      await put(id, autor, corpoDeEdicao(1, { titulo: 'abc' })),
      409,
      'trampo_nao_editavel',
    );
  });

  it('rejeita chave extra (autorId, status, criadoEm, versao duplicada em texto, id) e nada muda', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    const antes = await ler(id, autor);
    for (const extra of [
      { autorId: outro.contaId },
      { status: 'em_andamento' },
      { criadoEm: '2000-01-01T00:00:00.000Z' },
      { id: randomUUID() },
      { candidaturasRecebidas: 9 },
    ]) {
      erro(
        await put(id, autor, corpoDeEdicao(1, extra)),
        400,
        'dados_invalidos',
      );
    }
    expect(await ler(id, autor)).toEqual(antes);
  });

  it('rejeita corpo ausente, vazio, lista e texto solto com 400 sem 500', async () => {
    const { autor } = await par();
    const id = await publicarTrampo(app, autor);
    for (const corpoBruto of ['{}', '[]', '"texto"', 'null', '{"versao":']) {
      const r = await pedir(app, 'PUT', `/trampos/${id}`, {
        token: autor.token,
        corpoBruto,
      });
      expect([400], `${corpoBruto} -> ${r.texto}`).toContain(r.status);
    }
    const semCorpo = await pedir(app, 'PUT', `/trampos/${id}`, {
      token: autor.token,
    });
    expect(semCorpo.status, semCorpo.texto).toBe(400);
  });

  it('caractere nulo, espaços de sobra e texto longo: nulo e 81 caracteres dão 400; espaços nas pontas são aparados', async () => {
    const { autor } = await par();
    const id = await publicarTrampo(app, autor);
    erro(
      await put(id, autor, corpoDeEdicao(1, { titulo: 'Titulo\u0000nulo' })),
      400,
      'dados_invalidos',
    );
    erro(
      await put(id, autor, corpoDeEdicao(1, { titulo: 'a'.repeat(81) })),
      400,
      'dados_invalidos',
    );
    const ok = await put(
      id,
      autor,
      corpoDeEdicao(1, { titulo: '   Titulo com folga   ' }),
    );
    expect(ok.status, ok.texto).toBe(204);
    expect((await ler(id, autor)).titulo).toBe('Titulo com folga');
  });

  it('prazo ausente ou null remove o prazo; prazo válido é gravado', async () => {
    const { autor } = await par();
    const id = await publicarTrampo(app, autor, { prazo: '2027-05-05' });
    expect((await ler(id, autor)).prazo).toBe('2027-05-05');
    expect((await put(id, autor, corpoDeEdicao(1))).status).toBe(204);
    expect((await ler(id, autor)).prazo).toBeNull();
    expect(
      (await put(id, autor, corpoDeEdicao(2, { prazo: '2028-01-31' }))).status,
    ).toBe(204);
    expect((await ler(id, autor)).prazo).toBe('2028-01-31');
    expect(
      (await put(id, autor, corpoDeEdicao(3, { prazo: null }))).status,
    ).toBe(204);
    expect((await ler(id, autor)).prazo).toBeNull();
  });

  it('a edição sobe a versão de 1 em 1 e só a versão lida mais recente serve', async () => {
    const { autor } = await par();
    const id = await publicarTrampo(app, autor);
    for (let v = 1; v <= 4; v += 1) {
      expect((await ler(id, autor)).versao).toBe(v);
      expect(
        (
          await put(
            id,
            autor,
            corpoDeEdicao(v, { titulo: `Titulo numero ${v}` }),
          )
        ).status,
      ).toBe(204);
    }
    erro(await put(id, autor, corpoDeEdicao(4)), 409, 'conflito_de_versao');
    expect((await ler(id, autor)).titulo).toBe('Titulo numero 4');
  });

  it('o id em maiúsculas e o id fora do formato: maiúsculas edita, fora do formato dá 404', async () => {
    const { autor } = await par();
    const id = await publicarTrampo(app, autor);
    expect((await put(id.toUpperCase(), autor, corpoDeEdicao(1))).status).toBe(
      204,
    );
    for (const lixo of ['x', '1', '%00', "'; drop table trampos; --"]) {
      const r = await pedir(
        app,
        'PUT',
        `/trampos/${encodeURIComponent(lixo)}`,
        { token: autor.token, corpo: corpoDeEdicao(1) },
      );
      erro(r, 404, 'nao_encontrado');
    }
  });

  it('a edição troca a cidade e o texto da busca: o texto novo acha e o antigo não acha mais; criadoEm e a ordem na busca não mudam', async () => {
    const { autor, outro } = await par();
    const antigo = await publicarTrampo(app, autor, {
      titulo: 'Zebrazul primeiro anuncio',
      descricao: 'Texto antigo exclusivo zebrazul.',
    });
    const maisNovo = await publicarTrampo(app, autor, {
      titulo: 'Anuncio mais novo tucanolaranja',
      descricao: 'Texto tucanolaranja.',
    });
    const criadoAntes = (await ler(antigo, autor)).criadoEm;
    expect(await naBusca(outro, 'zebrazul')).toEqual([antigo]);

    const r = await put(
      antigo,
      autor,
      corpoDeEdicao(1, {
        titulo: 'Gaivotaverde reformado',
        descricao: 'Texto novo gaivotaverde.',
      }),
    );
    expect(r.status, r.texto).toBe(204);

    expect(await naBusca(outro, 'zebrazul')).toEqual([]);
    expect(await naBusca(outro, 'gaivotaverde')).toEqual([antigo]);
    expect((await ler(antigo, autor)).criadoEm).toBe(criadoAntes);
    // Os dois na mesma cidade (única do teste): o mais novo segue na frente.
    const cidade = `Cidade${randomUUID().slice(0, 8)}`;
    expect(
      (await put(maisNovo, autor, corpoDeEdicao(1, { cidade }))).status,
    ).toBe(204);
    expect(
      (await put(antigo, autor, corpoDeEdicao(2, { cidade }))).status,
    ).toBe(204);
    const porCidade = await pedir(
      app,
      'GET',
      `/busca?tipo=trampos&cidade=${encodeURIComponent(cidade)}`,
      { token: outro.token },
    );
    expect(
      (porCidade.corpo as { itens: { id: string }[] }).itens.map((i) => i.id),
    ).toEqual([maisNovo, antigo]);
  });
});

describe('CA25/CA29 — editar depois de retirar candidatura', () => {
  it('trampo que voltou a ter zero candidaturas é editável, mas só com a versão nova', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    const c = await candidatar(app, outro, id);
    expect(c.status).toBe(201);
    const versaoComCandidatura = (await ler(id, autor)).versao as number;
    expect(versaoComCandidatura).toBe(2);
    expect((await retirar((c.corpo as { id: string }).id, outro)).status).toBe(
      204,
    );
    const depois = await ler(id, autor);
    expect(depois.candidaturasRecebidas).toBe(0);
    expect(depois.versao).toBe(3);
    // Quem leu a versão com a candidatura (2) está velho.
    erro(
      await put(id, autor, corpoDeEdicao(versaoComCandidatura)),
      409,
      'conflito_de_versao',
    );
    expect((await put(id, autor, corpoDeEdicao(3))).status).toBe(204);
  });
});

describe('CA27 — encerrar', () => {
  it('encerrar duas vezes dá 204 duas vezes e a versão sobe uma vez só', async () => {
    const { autor } = await par();
    const id = await publicarTrampo(app, autor);
    expect((await encerrar(id, autor)).status).toBe(204);
    const v = (await ler(id, autor)).versao;
    expect((await encerrar(id, autor)).status).toBe(204);
    expect((await ler(id, autor)).versao).toBe(v);
    expect((await ler(id, autor)).status).toBe('encerrado');
  });

  it('terceiro, id inexistente e id fora do formato dão 404, e o trampo do outro continua aberto', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    erro(await encerrar(id, outro), 404, 'nao_encontrado');
    erro(await encerrar(randomUUID(), autor), 404, 'nao_encontrado');
    erro(await encerrar('nao-e-uuid', autor), 404, 'nao_encontrado');
    expect((await ler(id, autor)).status).toBe('aberto');
  });

  it('o trampo encerrado sai da busca, continua em /trampos/meus e o detalhe segue visível para terceiros', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor, {
      titulo: 'Corujaprata encerravel',
    });
    expect(await naBusca(outro, 'corujaprata')).toEqual([id]);
    expect((await encerrar(id, autor)).status).toBe(204);
    expect(await naBusca(outro, 'corujaprata')).toEqual([]);
    expect((await meus(autor)).map((t) => [t.id, t.status])).toContainEqual([
      id,
      'encerrado',
    ]);
    expect((await ler(id, outro)).status).toBe('encerrado');
  });

  it('encerrar trampo em andamento mantém a aceita e recusa as demais; aceitar de novo e candidatar dão 409 trampo_nao_aberto', async () => {
    const { autor } = await par();
    const ana = await criarUsuario(app);
    const bia = await criarUsuario(app);
    const cris = await criarUsuario(app);
    const id = await publicarTrampo(app, autor);
    const ca = (await candidatar(app, ana, id)).corpo as { id: string };
    const cb = (await candidatar(app, bia, id)).corpo as { id: string };
    expect((await aceitar(id, ca.id, autor)).status).toBe(200);
    expect((await encerrar(id, autor)).status).toBe(204);
    const lista = await pedir(app, 'GET', `/trampos/${id}/candidaturas`, {
      token: autor.token,
    });
    const status = Object.fromEntries(
      (lista.corpo as { id: string; status: string }[]).map((c) => [
        c.id,
        c.status,
      ]),
    );
    expect(status).toEqual({ [ca.id]: 'aceita', [cb.id]: 'recusada' });
    erro(await aceitar(id, cb.id, autor), 409, 'trampo_nao_aberto');
    erro(await candidatar(app, cris, id), 409, 'trampo_nao_aberto');
  });

  it('o encerrado não é editável nem excluível, e retirar a candidatura (recusada pelo encerramento) dá 409', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    const c = (await candidatar(app, outro, id)).corpo as { id: string };
    expect((await encerrar(id, autor)).status).toBe(204);
    erro(await put(id, autor, corpoDeEdicao(3)), 409, 'trampo_nao_editavel');
    erro(await excluir(id, autor), 409, 'trampo_nao_aberto');
    erro(await retirar(c.id, outro), 409, 'candidatura_nao_pendente');
    // A candidatura segue em Minhas candidaturas, recusada.
    const minhas = await pedir(app, 'GET', '/candidaturas/minhas', {
      token: outro.token,
    });
    expect(
      (minhas.corpo as { id: string; status: string }[]).find(
        (m) => m.id === c.id,
      )?.status,
    ).toBe('recusada');
  });

  it('o mesmo freelancer que já se candidatou e tenta de novo num trampo encerrado recebe candidatura_duplicada (a duplicada vem antes), e quem nunca se candidatou recebe trampo_nao_aberto', async () => {
    const { autor, outro } = await par();
    const estranho = await criarUsuario(app);
    const id = await publicarTrampo(app, autor);
    expect((await candidatar(app, outro, id)).status).toBe(201);
    expect((await encerrar(id, autor)).status).toBe(204);
    erro(await candidatar(app, outro, id), 409, 'candidatura_duplicada');
    erro(await candidatar(app, estranho, id), 409, 'trampo_nao_aberto');
  });
});

describe('CA28 — excluir trampo', () => {
  it('apaga o trampo e as candidaturas; as candidaturas somem de Minhas candidaturas e o freelancer pode candidatar de novo em outro; segunda exclusão dá 404', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    const c = (await candidatar(app, outro, id)).corpo as { id: string };
    expect((await excluir(id, autor)).status).toBe(204);
    erro(await excluir(id, autor), 404, 'nao_encontrado');
    erro(
      await pedir(app, 'GET', `/trampos/${id}`, { token: autor.token }),
      404,
      'nao_encontrado',
    );
    const minhas = await pedir(app, 'GET', '/candidaturas/minhas', {
      token: outro.token,
    });
    expect((minhas.corpo as { id: string }[]).some((m) => m.id === c.id)).toBe(
      false,
    );
    // Retirar a candidatura de um trampo que sumiu: 404.
    erro(await retirar(c.id, outro), 404, 'nao_encontrado');
    // Candidatar a trampo excluído: 404.
    erro(await candidatar(app, outro, id), 404, 'nao_encontrado');
    // Aceitar e editar também.
    erro(await aceitar(id, c.id, autor), 404, 'nao_encontrado');
    erro(await put(id, autor, corpoDeEdicao(1)), 404, 'nao_encontrado');
    erro(await encerrar(id, autor), 404, 'nao_encontrado');
  });

  it('terceiro e id fora do formato dão 404 e o trampo continua; em andamento dá 409 trampo_nao_aberto', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    erro(await excluir(id, outro), 404, 'nao_encontrado');
    erro(await excluir('lixo', autor), 404, 'nao_encontrado');
    expect((await ler(id, autor)).status).toBe('aberto');
    const c = (await candidatar(app, outro, id)).corpo as { id: string };
    expect((await aceitar(id, c.id, autor)).status).toBe(200);
    erro(await excluir(id, autor), 409, 'trampo_nao_aberto');
    expect((await ler(id, autor)).status).toBe('em_andamento');
  });
});

describe('CA29 — retirar candidatura', () => {
  it('de outra conta, do autor do trampo, inexistente e fora do formato dão 404; a candidatura continua pendente', async () => {
    const { autor, outro } = await par();
    const intruso = await criarUsuario(app);
    const id = await publicarTrampo(app, autor);
    const c = (await candidatar(app, outro, id)).corpo as { id: string };
    erro(await retirar(c.id, intruso), 404, 'nao_encontrado');
    erro(await retirar(c.id, autor), 404, 'nao_encontrado');
    erro(await retirar(randomUUID(), outro), 404, 'nao_encontrado');
    erro(await retirar('nao-e-uuid', outro), 404, 'nao_encontrado');
    const lista = await pedir(app, 'GET', `/trampos/${id}/candidaturas`, {
      token: autor.token,
    });
    expect(
      (lista.corpo as { id: string; status: string }[]).map((x) => x.status),
    ).toEqual(['pendente']);
  });

  it('aceita e recusada (pelo aceite de outra) dão 409 candidatura_nao_pendente e a linha fica', async () => {
    const { autor } = await par();
    const ana = await criarUsuario(app);
    const bia = await criarUsuario(app);
    const id = await publicarTrampo(app, autor);
    const ca = (await candidatar(app, ana, id)).corpo as { id: string };
    const cb = (await candidatar(app, bia, id)).corpo as { id: string };
    expect((await aceitar(id, ca.id, autor)).status).toBe(200);
    erro(await retirar(ca.id, ana), 409, 'candidatura_nao_pendente');
    erro(await retirar(cb.id, bia), 409, 'candidatura_nao_pendente');
    const lista = await pedir(app, 'GET', `/trampos/${id}/candidaturas`, {
      token: autor.token,
    });
    expect((lista.corpo as unknown[]).length).toBe(2);
  });

  it('retirar duas vezes: 204 e depois 404; candidatar de novo gera outra candidatura com outro id', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    const c1 = (await candidatar(app, outro, id)).corpo as { id: string };
    expect((await retirar(c1.id, outro)).status).toBe(204);
    erro(await retirar(c1.id, outro), 404, 'nao_encontrado');
    const c2 = await candidatar(app, outro, id, {
      mensagem: 'Segunda tentativa.',
    });
    expect(c2.status, c2.texto).toBe(201);
    expect((c2.corpo as { id: string }).id).not.toBe(c1.id);
    const lista = await pedir(app, 'GET', `/trampos/${id}/candidaturas`, {
      token: autor.token,
    });
    const itens = lista.corpo as { mensagem: string }[];
    expect(itens.map((i) => i.mensagem)).toEqual(['Segunda tentativa.']);
  });

  it('a candidatura retirada some de /candidaturas/minhas e a contagem do autor cai', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor);
    const c = (await candidatar(app, outro, id)).corpo as { id: string };
    expect((await ler(id, autor)).candidaturasRecebidas).toBe(1);
    expect((await retirar(c.id, outro)).status).toBe(204);
    expect((await ler(id, autor)).candidaturasRecebidas).toBe(0);
    const minhas = await pedir(app, 'GET', '/candidaturas/minhas', {
      token: outro.token,
    });
    expect(minhas.corpo).toEqual([]);
    const doAutor = (await meus(autor)).find((t) => t.id === id);
    expect(doAutor?.candidaturasRecebidas).toBe(0);
  });
});

describe('CA31 — versao e candidaturasRecebidas só na visão do autor, em toda rota', () => {
  it('nenhuma rota de leitura entrega versao ou candidaturasRecebidas a quem não é o autor', async () => {
    const { autor, outro } = await par();
    const trampo = await publicarTrampo(app, autor, {
      titulo: 'Pavaoroxo visibilidade',
    });
    const servico = await ofertarServico(app, autor, {
      titulo: 'Pavaoroxo servico visivel',
    });
    expect((await candidatar(app, outro, trampo)).status).toBe(201);

    const respostas: [string, Resposta][] = [
      [
        'GET /trampos/:id',
        await pedir(app, 'GET', `/trampos/${trampo}`, { token: outro.token }),
      ],
      [
        'GET /servicos/:id',
        await pedir(app, 'GET', `/servicos/${servico}`, { token: outro.token }),
      ],
      [
        'GET /busca (outro)',
        await pedir(app, 'GET', '/busca?texto=pavaoroxo', {
          token: outro.token,
        }),
      ],
      [
        'GET /busca (o próprio autor)',
        await pedir(app, 'GET', '/busca?texto=pavaoroxo', {
          token: autor.token,
        }),
      ],
      [
        'GET /candidaturas/minhas',
        await pedir(app, 'GET', '/candidaturas/minhas', { token: outro.token }),
      ],
      [
        'GET /trampos/meus (outro)',
        await pedir(app, 'GET', '/trampos/meus', { token: outro.token }),
      ],
      [
        'GET /servicos/meus (outro)',
        await pedir(app, 'GET', '/servicos/meus', { token: outro.token }),
      ],
      [
        'GET /perfis/:id (autor)',
        await pedir(app, 'GET', `/perfis/${autor.contaId}`, {
          token: outro.token,
        }),
      ],
    ];
    for (const [rota, r] of respostas) {
      expect(r.status, `${rota}: ${r.texto}`).toBe(200);
      expect(r.texto, rota).not.toMatch(/"versao"|candidaturasRecebidas/);
    }
    // O autor vê nas listas dele e nos detalhes.
    expect((await ler(trampo, autor)).versao).toBe(2);
    expect((await ler(trampo, autor)).candidaturasRecebidas).toBe(1);
    const dosAutor = await pedir(app, 'GET', '/servicos/meus', {
      token: autor.token,
    });
    expect((dosAutor.corpo as Objeto[])[0]?.versao).toBe(1);
  });

  it('o 409 e o 404 do PUT não carregam versao nem texto do trampo', async () => {
    const { autor, outro } = await par();
    const id = await publicarTrampo(app, autor, {
      titulo: 'Segredo do titulo secreto',
    });
    const conflito = await put(id, autor, corpoDeEdicao(5));
    expect(conflito.texto).toBe(JSON.stringify({ erro: 'conflito_de_versao' }));
    const naoAchou = await put(id, outro, corpoDeEdicao(1));
    expect(naoAchou.texto).toBe(JSON.stringify({ erro: 'nao_encontrado' }));
  });
});

describe('CA26 — serviço: editar e excluir', () => {
  const edicaoDoServico = (versao: unknown, extra: Objeto = {}): Objeto => ({
    titulo: 'Servico editado pela QA',
    descricao: 'Descricao do servico editado.',
    categoria: 'reformas',
    cidade: 'Perdoes',
    precoBaseCentavos: 55_000,
    versao,
    ...extra,
  });
  const putServico = (id: string, quem: Usuario, corpo: unknown) =>
    pedir(app, 'PUT', `/servicos/${id}`, { token: quem.token, corpo });
  const deleteServico = (id: string, quem: Usuario) =>
    pedir(app, 'DELETE', `/servicos/${id}`, { token: quem.token });
  const lerServico = (id: string, quem: Usuario) =>
    pedir(app, 'GET', `/servicos/${id}`, { token: quem.token });

  it('versao inválida ou ausente dá 400; chave extra dá 400; nada muda', async () => {
    const { autor } = await par();
    const id = await ofertarServico(app, autor);
    const antes = (await lerServico(id, autor)).corpo;
    for (const versao of [0, -3, 1.2, '1', null]) {
      erro(
        await putServico(id, autor, edicaoDoServico(versao)),
        400,
        'dados_invalidos',
      );
    }
    const semVersao = edicaoDoServico(1);
    delete semVersao.versao;
    erro(await putServico(id, autor, semVersao), 400, 'dados_invalidos');
    for (const extra of [
      { autorId: randomUUID() },
      { status: 'inativo' },
      { criadoEm: '2000-01-01T00:00:00.000Z' },
    ]) {
      erro(
        await putServico(id, autor, edicaoDoServico(1, extra)),
        400,
        'dados_invalidos',
      );
    }
    expect((await lerServico(id, autor)).corpo).toEqual(antes);
  });

  it('terceiro, inexistente e id fora do formato dão 404 no PUT e no DELETE, e o serviço fica', async () => {
    const { autor, outro } = await par();
    const id = await ofertarServico(app, autor);
    for (const alvo of [id, randomUUID(), 'nao-e-uuid']) {
      erro(
        await putServico(alvo, outro, edicaoDoServico(1)),
        404,
        'nao_encontrado',
      );
      erro(await deleteServico(alvo, outro), 404, 'nao_encontrado');
    }
    expect((await lerServico(id, autor)).status).toBe(200);
  });

  it('campos inválidos: 400 para o autor com todos os campos; terceiro recebe 404; versão velha com campo inválido dá 409', async () => {
    const { autor, outro } = await par();
    const id = await ofertarServico(app, autor);
    const ruim = edicaoDoServico(1, {
      titulo: 'ab',
      descricao: '',
      categoria: 'nada',
      precoBaseCentavos: 0,
      cidade: 'x',
    });
    erro(await putServico(id, outro, ruim), 404, 'nao_encontrado');
    const r = await putServico(id, autor, ruim);
    erro(r, 400, 'dados_invalidos');
    const campos = ((r.corpo as Objeto).campos as { campo: string }[])
      .map((c) => c.campo)
      .sort();
    expect(campos).toEqual(
      [
        'categoria',
        'cidade',
        'descricao',
        'precoBaseCentavos',
        'titulo',
      ].sort(),
    );
    erro(
      await putServico(id, autor, { ...ruim, versao: 9 }),
      409,
      'conflito_de_versao',
    );
  });

  it('sem cidade (D7): cidade ausente, null e em branco viram "sem cidade"; versão sobe; busca acha o texto novo', async () => {
    const { autor, outro } = await par();
    const id = await ofertarServico(app, autor, {
      titulo: 'Capivaralilas antigo',
    });
    const corpo = edicaoDoServico(1, { titulo: 'Tamanduaverde novo' });
    delete corpo.cidade;
    expect((await putServico(id, autor, corpo)).status).toBe(204);
    const depois = (await lerServico(id, autor)).corpo as Objeto;
    expect(depois.cidade).toBeNull();
    expect(depois.versao).toBe(2);
    expect(
      (await putServico(id, autor, edicaoDoServico(2, { cidade: null })))
        .status,
    ).toBe(204);
    expect(
      (await putServico(id, autor, edicaoDoServico(3, { cidade: '   ' })))
        .status,
    ).toBe(204);
    const achados = await pedir(
      app,
      'GET',
      '/busca?tipo=servicos&texto=servico%20editado',
      {
        token: outro.token,
      },
    );
    expect(
      (achados.corpo as { itens: { id: string }[] }).itens.map((i) => i.id),
    ).toContain(id);
    const antigo = await pedir(
      app,
      'GET',
      '/busca?tipo=servicos&texto=capivaralilas',
      {
        token: outro.token,
      },
    );
    expect((antigo.corpo as { itens: unknown[] }).itens).toEqual([]);
  });

  it('excluir: 204, some da busca e do /servicos/meus, detalhe dá 404 e a segunda exclusão dá 404; o PUT depois também', async () => {
    const { autor, outro } = await par();
    const id = await ofertarServico(app, autor, {
      titulo: 'Gaviotarosa excluivel',
    });
    expect(
      (
        (
          await pedir(app, 'GET', '/busca?tipo=servicos&texto=gaviotarosa', {
            token: outro.token,
          })
        ).corpo as { itens: unknown[] }
      ).itens.length,
    ).toBe(1);
    expect((await deleteServico(id, autor)).status).toBe(204);
    erro(await lerServico(id, outro), 404, 'nao_encontrado');
    erro(await lerServico(id, autor), 404, 'nao_encontrado');
    erro(await deleteServico(id, autor), 404, 'nao_encontrado');
    erro(
      await putServico(id, autor, edicaoDoServico(1)),
      404,
      'nao_encontrado',
    );
    expect(
      (
        (
          await pedir(app, 'GET', '/busca?tipo=servicos&texto=gaviotarosa', {
            token: outro.token,
          })
        ).corpo as { itens: unknown[] }
      ).itens,
    ).toEqual([]);
    expect(
      (
        (await pedir(app, 'GET', '/servicos/meus', { token: autor.token }))
          .corpo as Objeto[]
      ).some((s) => s.id === id),
    ).toBe(false);
  });

  it('sem sessão: PUT e DELETE de serviço e de trampo, encerrar e retirar dão 401', async () => {
    const id = randomUUID();
    const rotas: [string, string][] = [
      ['PUT', `/servicos/${id}`],
      ['DELETE', `/servicos/${id}`],
      ['PUT', `/trampos/${id}`],
      ['DELETE', `/trampos/${id}`],
      ['POST', `/trampos/${id}/encerrar`],
      ['DELETE', `/candidaturas/${id}`],
    ];
    for (const [metodo, url] of rotas) {
      const r = await pedir(app, metodo as 'PUT', url, {
        corpo: metodo === 'PUT' ? edicaoDoServico(1) : undefined,
      });
      expect(r.status, `${metodo} ${url}: ${r.texto}`).toBe(401);
    }
    // Token inválido também.
    const r = await pedir(app, 'DELETE', `/candidaturas/${id}`, {
      token: 'token-que-nao-existe',
    });
    expect(r.status).toBe(401);
  });
});
