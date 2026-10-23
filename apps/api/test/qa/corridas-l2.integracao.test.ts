/**
 * QA da L2: corridas entre as escritas do autor, dos candidatos e da exclusão
 * de conta, pela API montada (HTTP real, Postgres de teste).
 *
 * Cada cenário roda várias vezes com atrasos diferentes (0, 1, 3, 7 ms) entre
 * os pedidos, para cair nas duas ordens possíveis. Como o resultado de cada
 * rodada é não determinístico, os testes afirmam invariantes: o conjunto de
 * respostas permitido e o estado final coerente com ele. Nenhuma resposta pode
 * ser 5xx e nunca sobra candidatura órfã nem candidatura que "volta".
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import { bancoDeTeste } from '../banco-teste.js';
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
import {
  criarUsuarioComSenha,
  excluir as excluirConta,
  linhasDe,
  type UsuarioComSenha,
} from './apoio-l1.js';

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

const RODADAS = 8;
const ATRASOS_MS = [0, 1, 3, 7];

const esperar = (ms: number) =>
  new Promise<void>((resolver) => setTimeout(resolver, ms));

/** Dispara `a` e, `atraso` ms depois, `b`; devolve as duas respostas. */
async function correr<A, B>(
  a: () => Promise<A>,
  b: () => Promise<B>,
  atraso: number,
  primeiro: 'a' | 'b' = 'a',
): Promise<[A, B]> {
  const pa = primeiro === 'a' ? a() : esperar(atraso).then(a);
  const pb = primeiro === 'b' ? b() : esperar(atraso).then(b);
  return Promise.all([pa, pb]);
}

function sem5xx(...respostas: Resposta[]): void {
  for (const r of respostas) {
    expect(r.status, r.texto).toBeLessThan(500);
  }
}

const codigo = (r: Resposta) => (r.corpo as Objeto | undefined)?.erro;

const put = (id: string, quem: Usuario, versao: number, titulo: string) =>
  pedir(app, 'PUT', `/trampos/${id}`, {
    token: quem.token,
    corpo: {
      titulo,
      descricao: 'Descricao da corrida com detalhes.',
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 12_300,
      versao,
    },
  });
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
    { token: quem.token },
  );

async function candidaturasDoTrampo(
  trampoId: string,
): Promise<{ freelancer_id: string; status: string; id: string }[]> {
  const { rows } = await sql<{
    freelancer_id: string;
    status: string;
    id: string;
  }>`select id, freelancer_id, status from candidaturas
     where trampo_id = ${trampoId}::uuid order by criada_em, id`.execute(
    bancoDeTeste(),
  );
  return rows;
}

async function linhaDoTrampo(
  trampoId: string,
): Promise<{ status: string; titulo: string; versao: number } | undefined> {
  const { rows } = await sql<{
    status: string;
    titulo: string;
    versao: number;
  }>`select status, titulo, versao from trampos where id = ${trampoId}::uuid`.execute(
    bancoDeTeste(),
  );
  return rows[0];
}

async function orfas(): Promise<number> {
  const { rows } = await sql<{ n: number }>`select count(*)::int as n
    from candidaturas c left join trampos t on t.id = c.trampo_id
    where t.id is null`.execute(bancoDeTeste());
  return rows[0]?.n ?? -1;
}

async function novoTrampo() {
  const autor = await criarUsuario(app);
  const id = await publicarTrampo(app, autor);
  return { autor, id };
}

const rodadas = Array.from({ length: RODADAS }, (_, i) => ({
  i,
  atraso: ATRASOS_MS[i % ATRASOS_MS.length] as number,
  primeiro: (i % 2 === 0 ? 'a' : 'b') as 'a' | 'b',
}));

describe('editar x candidatar', () => {
  it.each(rodadas)(
    'rodada $i: a candidatura sempre entra; a edição vence ou recebe trampo_nao_editavel, e o título bate com o resultado',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const freela = await criarUsuario(app);
      const titulo = `Titulo da corrida ${randomUUID().slice(0, 8)}`;
      const [edicao, cand] = await correr(
        () => put(id, autor, 1, titulo),
        () => candidatar(app, freela, id),
        atraso,
        primeiro,
      );
      sem5xx(edicao, cand);
      expect(cand.status, cand.texto).toBe(201);
      const linha = await linhaDoTrampo(id);
      if (edicao.status === 204) {
        expect(linha?.titulo).toBe(titulo);
        expect(linha?.versao).toBe(3);
      } else {
        expect(edicao.status, edicao.texto).toBe(409);
        expect(codigo(edicao)).toBe('trampo_nao_editavel');
        expect(linha?.titulo).not.toBe(titulo);
        expect(linha?.versao).toBe(2);
      }
      expect((await candidaturasDoTrampo(id)).map((c) => c.status)).toEqual([
        'pendente',
      ]);
    },
  );
});

describe('editar x editar, editar x encerrar e editar x excluir', () => {
  it.each(rodadas)(
    'rodada $i: duas edições com a mesma versão: uma vence (204) e a outra leva conflito_de_versao',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const [a, b] = await correr(
        () => put(id, autor, 1, 'Edicao A da corrida'),
        () => put(id, autor, 1, 'Edicao B da corrida'),
        atraso,
        primeiro,
      );
      sem5xx(a, b);
      expect([a.status, b.status].sort()).toEqual([204, 409]);
      const perdedora = a.status === 409 ? a : b;
      expect(codigo(perdedora)).toBe('conflito_de_versao');
      const linha = await linhaDoTrampo(id);
      expect(linha?.versao).toBe(2);
      expect(linha?.titulo).toBe(
        a.status === 204 ? 'Edicao A da corrida' : 'Edicao B da corrida',
      );
    },
  );

  it.each(rodadas)(
    'rodada $i: editar e encerrar: encerrar sempre dá 204; a edição só vale se veio antes',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const [edicao, enc] = await correr(
        () => put(id, autor, 1, 'Edicao antes do encerrar'),
        () => encerrar(id, autor),
        atraso,
        primeiro,
      );
      sem5xx(edicao, enc);
      expect(enc.status, enc.texto).toBe(204);
      const linha = await linhaDoTrampo(id);
      expect(linha?.status).toBe('encerrado');
      if (edicao.status === 204) {
        expect(linha?.titulo).toBe('Edicao antes do encerrar');
      } else {
        expect(edicao.status, edicao.texto).toBe(409);
        expect(codigo(edicao)).toBe('trampo_nao_editavel');
        expect(linha?.titulo).not.toBe('Edicao antes do encerrar');
      }
    },
  );

  it.each(rodadas)(
    'rodada $i: editar e excluir: excluir sempre dá 204 e o trampo some; a edição dá 204 (veio antes) ou 404',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const [edicao, exc] = await correr(
        () => put(id, autor, 1, 'Edicao contra a exclusao'),
        () => excluir(id, autor),
        atraso,
        primeiro,
      );
      sem5xx(edicao, exc);
      expect(exc.status, exc.texto).toBe(204);
      expect([204, 404]).toContain(edicao.status);
      expect(await linhaDoTrampo(id)).toBeUndefined();
    },
  );
});

describe('excluir trampo x candidatar', () => {
  it.each(rodadas)(
    'rodada $i: o candidato recebe 201 (e a candidatura é apagada junto) ou 404; nunca 500 nem candidatura órfã',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const freela = await criarUsuario(app);
      const [exc, cand] = await correr(
        () => excluir(id, autor),
        () => candidatar(app, freela, id),
        atraso,
        primeiro,
      );
      sem5xx(exc, cand);
      expect(exc.status, exc.texto).toBe(204);
      expect([201, 404]).toContain(cand.status);
      expect(await linhaDoTrampo(id)).toBeUndefined();
      expect(await candidaturasDoTrampo(id)).toEqual([]);
      expect(await orfas()).toBe(0);
      // A candidatura que respondeu 201 não aparece em Minhas candidaturas.
      const minhas = await pedir(app, 'GET', '/candidaturas/minhas', {
        token: freela.token,
      });
      expect(minhas.corpo).toEqual([]);
    },
  );

  it('com 9 candidatos ao mesmo tempo: a exclusão termina e cada candidato recebe 201 ou 404', async () => {
    const { autor, id } = await novoTrampo();
    const candidatos = await Promise.all(
      Array.from({ length: 9 }, () => criarUsuario(app)),
    );
    const respostas = await Promise.all([
      excluir(id, autor),
      ...candidatos.map((c) => candidatar(app, c, id)),
    ]);
    sem5xx(...respostas);
    expect(respostas[0]?.status, respostas[0]?.texto).toBe(204);
    for (const r of respostas.slice(1)) {
      expect([201, 404], r.texto).toContain(r.status);
    }
    expect(await candidaturasDoTrampo(id)).toEqual([]);
    expect(await orfas()).toBe(0);
  });
});

describe('retirar x aceitar', () => {
  it.each(rodadas)(
    'rodada $i: a mesma candidatura: ou retirar 204 e aceitar 404, ou aceitar 200 e retirar 409; o estado final concorda',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const freela = await criarUsuario(app);
      const c = (await candidatar(app, freela, id)).corpo as { id: string };
      const [ret, ace] = await correr(
        () => retirar(c.id, freela),
        () => aceitar(id, c.id, autor),
        atraso,
        primeiro,
      );
      sem5xx(ret, ace);
      const final = await candidaturasDoTrampo(id);
      const linha = await linhaDoTrampo(id);
      if (ret.status === 204) {
        expect(ace.status, ace.texto).toBe(404);
        expect(final).toEqual([]);
        expect(linha?.status).toBe('aberto');
      } else {
        expect(ret.status, ret.texto).toBe(409);
        expect(codigo(ret)).toBe('candidatura_nao_pendente');
        expect(ace.status, ace.texto).toBe(200);
        expect(final.map((x) => x.status)).toEqual(['aceita']);
        expect(linha?.status).toBe('em_andamento');
      }
    },
  );

  it.each(rodadas)(
    'rodada $i: candidaturas diferentes: o aceite da Ana sempre vence; a retirada do Bruno é 204 (e ele não volta) ou 409 (já recusado)',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const ana = await criarUsuario(app);
      const bruno = await criarUsuario(app);
      const ca = (await candidatar(app, ana, id)).corpo as { id: string };
      const cb = (await candidatar(app, bruno, id)).corpo as { id: string };
      const [ace, ret] = await correr(
        () => aceitar(id, ca.id, autor),
        () => retirar(cb.id, bruno),
        atraso,
        primeiro,
      );
      sem5xx(ace, ret);
      expect(ace.status, ace.texto).toBe(200);
      const final = await candidaturasDoTrampo(id);
      if (ret.status === 204) {
        expect(final.map((x) => [x.freelancer_id, x.status])).toEqual([
          [ana.contaId, 'aceita'],
        ]);
      } else {
        expect(ret.status, ret.texto).toBe(409);
        expect(codigo(ret)).toBe('candidatura_nao_pendente');
        expect(final.map((x) => [x.freelancer_id, x.status]).sort()).toEqual(
          [
            [ana.contaId, 'aceita'],
            [bruno.contaId, 'recusada'],
          ].sort(),
        );
      }
    },
  );

  it.each(rodadas)(
    'rodada $i: retirar duas vezes ao mesmo tempo: um 204 e um 404',
    async ({ atraso }) => {
      const { id } = await novoTrampo();
      const freela = await criarUsuario(app);
      const c = (await candidatar(app, freela, id)).corpo as { id: string };
      const [a, b] = await correr(
        () => retirar(c.id, freela),
        () => retirar(c.id, freela),
        atraso,
      );
      sem5xx(a, b);
      expect([a.status, b.status].sort()).toEqual([204, 404]);
      expect(await candidaturasDoTrampo(id)).toEqual([]);
    },
  );
});

describe('encerrar x aceitar e encerrar x excluir', () => {
  it.each(rodadas)(
    'rodada $i: encerrar x aceitar: termina encerrado, sem pendente; aceita só se o aceite veio antes',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const ana = await criarUsuario(app);
      const bia = await criarUsuario(app);
      const ca = (await candidatar(app, ana, id)).corpo as { id: string };
      await candidatar(app, bia, id);
      const [enc, ace] = await correr(
        () => encerrar(id, autor),
        () => aceitar(id, ca.id, autor),
        atraso,
        primeiro,
      );
      sem5xx(enc, ace);
      expect(enc.status, enc.texto).toBe(204);
      expect((await linhaDoTrampo(id))?.status).toBe('encerrado');
      const final = (await candidaturasDoTrampo(id)).map((c) => c.status);
      expect(final).not.toContain('pendente');
      if (ace.status === 200) {
        expect(final.sort()).toEqual(['aceita', 'recusada']);
      } else {
        expect(ace.status, ace.texto).toBe(409);
        expect(codigo(ace)).toBe('trampo_nao_aberto');
        expect(final).toEqual(['recusada', 'recusada']);
      }
    },
  );

  it.each(rodadas)(
    'rodada $i: encerrar x candidatar: a candidatura entra e fica recusada, ou leva trampo_nao_aberto; nunca pendente em trampo encerrado',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const freela = await criarUsuario(app);
      const [enc, cand] = await correr(
        () => encerrar(id, autor),
        () => candidatar(app, freela, id),
        atraso,
        primeiro,
      );
      sem5xx(enc, cand);
      expect(enc.status, enc.texto).toBe(204);
      const final = (await candidaturasDoTrampo(id)).map((c) => c.status);
      if (cand.status === 201) {
        expect(final).toEqual(['recusada']);
      } else {
        expect(cand.status, cand.texto).toBe(409);
        expect(codigo(cand)).toBe('trampo_nao_aberto');
        expect(final).toEqual([]);
      }
    },
  );

  it.each(rodadas)(
    'rodada $i: encerrar x excluir: ou excluir 204 e encerrar 404, ou encerrar 204 e excluir 409 trampo_nao_aberto',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const [enc, exc] = await correr(
        () => encerrar(id, autor),
        () => excluir(id, autor),
        atraso,
        primeiro,
      );
      sem5xx(enc, exc);
      if (exc.status === 204) {
        expect(enc.status, enc.texto).toBe(404);
        expect(await linhaDoTrampo(id)).toBeUndefined();
      } else {
        expect(exc.status, exc.texto).toBe(409);
        expect(codigo(exc)).toBe('trampo_nao_aberto');
        expect(enc.status, enc.texto).toBe(204);
        expect((await linhaDoTrampo(id))?.status).toBe('encerrado');
      }
    },
  );

  it.each(rodadas)(
    'rodada $i: excluir duas vezes ao mesmo tempo: um 204 e um 404',
    async ({ atraso }) => {
      const { autor, id } = await novoTrampo();
      const [a, b] = await correr(
        () => excluir(id, autor),
        () => excluir(id, autor),
        atraso,
      );
      sem5xx(a, b);
      expect([a.status, b.status].sort()).toEqual([204, 404]);
    },
  );
});

describe('exclusão de conta x escritas de anúncio', () => {
  async function contaComSenha(): Promise<UsuarioComSenha> {
    return criarUsuarioComSenha(app);
  }

  it.each(rodadas)(
    'rodada $i: o autor encerra enquanto um candidato exclui a conta: nada do candidato volta e a outra candidatura fica recusada',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const x = await contaComSenha();
      const y = await criarUsuario(app);
      await candidatar(app, x, id, { mensagem: 'MENSAGEM-SECRETA-DE-X' });
      await candidatar(app, y, id);
      const [enc, del] = await correr(
        () => encerrar(id, autor),
        () => excluirConta(app, x, x.senha),
        atraso,
        primeiro,
      );
      sem5xx(enc, del);
      expect(enc.status, enc.texto).toBe(204);
      expect(del.status, del.texto).toBe(204);
      expect(await linhasDe(x.contaId)).toEqual({
        contas: 0,
        sessoes: 0,
        perfis: 0,
        trampos: 0,
        servicos: 0,
        candidaturas: 0,
        conversas: 0,
        mensagens: 0,
      });
      expect((await candidaturasDoTrampo(id)).map((c) => c.status)).toEqual([
        'recusada',
      ]);
      const { rows } = await sql<{ n: number }>`select count(*)::int as n
      from candidaturas where mensagem = 'MENSAGEM-SECRETA-DE-X'`.execute(
        bancoDeTeste(),
      );
      expect(rows[0]?.n).toBe(0);
    },
  );

  it.each(rodadas)(
    'rodada $i: o autor aceita Y enquanto X exclui a conta: o aceite dá 200 e X não volta',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const x = await contaComSenha();
      const y = await criarUsuario(app);
      await candidatar(app, x, id, { mensagem: 'MENSAGEM-SECRETA-DE-X2' });
      const cy = (await candidatar(app, y, id)).corpo as { id: string };
      const [ace, del] = await correr(
        () => aceitar(id, cy.id, autor),
        () => excluirConta(app, x, x.senha),
        atraso,
        primeiro,
      );
      sem5xx(ace, del);
      expect(ace.status, ace.texto).toBe(200);
      expect(del.status, del.texto).toBe(204);
      expect(
        (await candidaturasDoTrampo(id)).map((c) => c.freelancer_id),
      ).toEqual([y.contaId]);
    },
  );

  it.each(rodadas)(
    'rodada $i: o candidato retira enquanto o autor exclui a conta: sem 5xx, sem órfã, tudo do autor some',
    async ({ atraso, primeiro }) => {
      const autor = await contaComSenha();
      const id = await publicarTrampo(app, autor);
      const y = await criarUsuario(app);
      const c = (await candidatar(app, y, id)).corpo as { id: string };
      const [ret, del] = await correr(
        () => retirar(c.id, y),
        () => excluirConta(app, autor, autor.senha),
        atraso,
        primeiro,
      );
      sem5xx(ret, del);
      expect(del.status, del.texto).toBe(204);
      expect([204, 404]).toContain(ret.status);
      expect(await orfas()).toBe(0);
      expect(await linhaDoTrampo(id)).toBeUndefined();
      expect((await linhasDe(autor.contaId)).trampos).toBe(0);
    },
  );

  it.each(rodadas)(
    'rodada $i: o autor edita e excluir a conta ao mesmo tempo: sem 5xx e o texto editado não sobra',
    async ({ atraso, primeiro }) => {
      const autor = await contaComSenha();
      const id = await publicarTrampo(app, autor);
      const sentinela = `TEXTO-EDITADO-${randomUUID()}`;
      const [edicao, del] = await correr(
        () => put(id, autor, 1, sentinela),
        () => excluirConta(app, autor, autor.senha),
        atraso,
        primeiro,
      );
      sem5xx(edicao, del);
      expect(del.status, del.texto).toBe(204);
      expect([204, 401, 404]).toContain(edicao.status);
      const { rows } = await sql<{ n: number }>`select count(*)::int as n
      from trampos where titulo = ${sentinela}`.execute(bancoDeTeste());
      expect(rows[0]?.n).toBe(0);
    },
  );
});

describe('exclusão de conta x escritas de anúncio: combinações que poderiam travar', () => {
  it.each(rodadas)(
    'rodada $i: o candidato exclui a conta e retira a própria candidatura ao mesmo tempo: sem 5xx e nada dele sobra',
    async ({ atraso, primeiro }) => {
      const { id } = await novoTrampo();
      const x = await criarUsuarioComSenha(app);
      const c = (await candidatar(app, x, id)).corpo as { id: string };
      const [ret, del] = await correr(
        () => retirar(c.id, x),
        () => excluirConta(app, x, x.senha),
        atraso,
        primeiro,
      );
      sem5xx(ret, del);
      expect(del.status, del.texto).toBe(204);
      expect([204, 401, 404]).toContain(ret.status);
      expect(await candidaturasDoTrampo(id)).toEqual([]);
      expect((await linhasDe(x.contaId)).candidaturas).toBe(0);
    },
  );

  it.each(rodadas)(
    'rodada $i: o candidato exclui a conta e o autor exclui o trampo ao mesmo tempo: os dois terminam sem 5xx e sem órfã',
    async ({ atraso, primeiro }) => {
      const { autor, id } = await novoTrampo();
      const x = await criarUsuarioComSenha(app);
      await candidatar(app, x, id);
      const [exc, del] = await correr(
        () => excluir(id, autor),
        () => excluirConta(app, x, x.senha),
        atraso,
        primeiro,
      );
      sem5xx(exc, del);
      expect(exc.status, exc.texto).toBe(204);
      expect(del.status, del.texto).toBe(204);
      expect(await orfas()).toBe(0);
      expect(await linhaDoTrampo(id)).toBeUndefined();
    },
  );

  it.each(rodadas)(
    'rodada $i: duas contas com candidaturas cruzadas excluem as contas enquanto cada uma encerra o próprio trampo: sem deadlock nem 5xx',
    async ({ atraso, primeiro }) => {
      const x = await criarUsuarioComSenha(app);
      const y = await criarUsuarioComSenha(app);
      const tx = await publicarTrampo(app, x);
      const ty = await publicarTrampo(app, y);
      await candidatar(app, y, tx);
      await candidatar(app, x, ty);
      const respostas = await Promise.all([
        encerrar(tx, x),
        encerrar(ty, y),
        correr(
          () => excluirConta(app, x, x.senha),
          () => excluirConta(app, y, y.senha),
          atraso,
          primeiro,
        ),
      ]);
      const [e1, e2, [d1, d2]] = respostas;
      sem5xx(e1, e2, d1, d2);
      expect(d1.status, d1.texto).toBe(204);
      expect(d2.status, d2.texto).toBe(204);
      expect(await orfas()).toBe(0);
      expect(await linhaDoTrampo(tx)).toBeUndefined();
      expect(await linhaDoTrampo(ty)).toBeUndefined();
    },
  );
});

describe('serviço: editar e excluir ao mesmo tempo', () => {
  const putServico = (
    id: string,
    quem: Usuario,
    versao: number,
    titulo: string,
  ) =>
    pedir(app, 'PUT', `/servicos/${id}`, {
      token: quem.token,
      corpo: {
        titulo,
        descricao: 'Descricao do servico em corrida.',
        categoria: 'reformas',
        precoBaseCentavos: 10_000,
        versao,
      },
    });

  it.each(rodadas)(
    'rodada $i: duas edições com a mesma versão: 204 e 409 conflito_de_versao',
    async ({ atraso, primeiro }) => {
      const autor = await criarUsuario(app);
      const id = await ofertarServico(app, autor);
      const [a, b] = await correr(
        () => putServico(id, autor, 1, 'Servico corrida A'),
        () => putServico(id, autor, 1, 'Servico corrida B'),
        atraso,
        primeiro,
      );
      sem5xx(a, b);
      expect([a.status, b.status].sort()).toEqual([204, 409]);
      expect(codigo(a.status === 409 ? a : b)).toBe('conflito_de_versao');
      const lido = await pedir(app, 'GET', `/servicos/${id}`, {
        token: autor.token,
      });
      expect((lido.corpo as Objeto).versao).toBe(2);
    },
  );

  it.each(rodadas)(
    'rodada $i: editar e excluir: excluir 204 sempre; a edição 204 ou 404 e o serviço some',
    async ({ atraso, primeiro }) => {
      const autor = await criarUsuario(app);
      const id = await ofertarServico(app, autor);
      const [edicao, exc] = await correr(
        () => putServico(id, autor, 1, 'Servico contra exclusao'),
        () => pedir(app, 'DELETE', `/servicos/${id}`, { token: autor.token }),
        atraso,
        primeiro,
      );
      sem5xx(edicao, exc);
      expect(exc.status, exc.texto).toBe(204);
      expect([204, 404]).toContain(edicao.status);
      const lido = await pedir(app, 'GET', `/servicos/${id}`, {
        token: autor.token,
      });
      expect(lido.status).toBe(404);
    },
  );
});

describe('pico de candidaturas contra o autor (limite de tentativas)', () => {
  it('com 9 candidatos simultâneos, encerrar termina com 204 e todas as candidaturas gravadas ficam recusadas', async () => {
    const { autor, id } = await novoTrampo();
    const candidatos = await Promise.all(
      Array.from({ length: 9 }, () => criarUsuario(app)),
    );
    const respostas = await Promise.all([
      encerrar(id, autor),
      ...candidatos.map((c) => candidatar(app, c, id)),
    ]);
    sem5xx(...respostas);
    expect(respostas[0]?.status, respostas[0]?.texto).toBe(204);
    for (const r of respostas.slice(1)) {
      expect([201, 409], r.texto).toContain(r.status);
    }
    const final = (await candidaturasDoTrampo(id)).map((c) => c.status);
    expect(final.every((s) => s === 'recusada')).toBe(true);
    expect(final.length).toBe(
      respostas.slice(1).filter((r) => r.status === 201).length,
    );
  });
});
