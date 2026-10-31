/**
 * QA da L4 pela API montada (HTTP real, Postgres de teste):
 * - CA65: retirar candidatura sob a trava do trampo, em rajada, contra
 *   candidatar, aceitar, encerrar, excluir e a própria retirada repetida. Como
 *   o resultado de cada corrida não é determinístico, os testes afirmam
 *   invariantes: nenhuma retirada devolve `conflito_de_versao` nem 5xx, e o
 *   estado final no banco é coerente com as respostas.
 * - CA66: `GET /trampos/meus` paginado com o relógio parado (empate de
 *   `criado_em`), cursor de item excluído, trampo novo entre páginas e id em
 *   maiúsculas.
 */
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import { bancoDeTeste } from '../banco-teste.js';
import {
  candidatar,
  criarUsuario,
  limparBanco,
  montar,
  pedir,
  publicarTrampo,
  relogioParado,
  relogioQueAvanca,
  type Usuario,
} from './apoio.js';

type Objeto = Record<string, unknown>;

async function retirar(
  app: Aplicacao,
  freelancer: Usuario,
  candidaturaId: string,
) {
  return pedir(app, 'DELETE', `/candidaturas/${candidaturaId}`, {
    token: freelancer.token,
  });
}

async function candidaturasDo(trampoId: string): Promise<Objeto[]> {
  const { rows } = await sql<Objeto>`select id, freelancer_id, status
    from candidaturas where trampo_id = ${trampoId}::uuid`.execute(
    bancoDeTeste(),
  );
  return rows;
}

describe('CA65 — retirar candidatura sob a trava do trampo, pela API', () => {
  let app: Aplicacao;

  beforeAll(async () => {
    await limparBanco();
    app = await montar({ relogio: relogioQueAvanca() });
  });

  afterAll(async () => {
    await app?.fechar();
    await limparBanco();
  });

  /** Um autor, um trampo e `n` freelancers, cada um com a candidatura pendente. */
  async function cenario(n: number) {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const candidatos: { usuario: Usuario; candidaturaId: string }[] = [];
    for (let i = 0; i < n; i += 1) {
      const usuario = await criarUsuario(app);
      const resposta = await candidatar(app, usuario, trampoId);
      expect(resposta.status, resposta.texto).toBe(201);
      candidatos.push({
        usuario,
        candidaturaId: (resposta.corpo as { id: string }).id,
      });
    }
    return { autor, trampoId, candidatos };
  }

  it('20 retiradas ao mesmo tempo, de 20 candidatos: todas dão 204 e nenhuma candidatura sobra', async () => {
    const { trampoId, candidatos } = await cenario(20);

    const respostas = await Promise.all(
      candidatos.map((c) => retirar(app, c.usuario, c.candidaturaId)),
    );

    expect(respostas.map((r) => r.status)).toEqual(Array(20).fill(204));
    expect(await candidaturasDo(trampoId)).toEqual([]);
  }, 60_000);

  it('a mesma retirada duas vezes ao mesmo tempo: uma dá 204, a outra 404, e nunca conflito de versão', async () => {
    const { trampoId, candidatos } = await cenario(2);
    const alvo = candidatos[0];
    if (alvo === undefined) throw new Error('sem candidato');

    const respostas = await Promise.all([
      retirar(app, alvo.usuario, alvo.candidaturaId),
      retirar(app, alvo.usuario, alvo.candidaturaId),
    ]);

    expect(respostas.map((r) => r.status).sort()).toEqual([204, 404]);
    for (const r of respostas) {
      expect(r.texto).not.toContain('conflito_de_versao');
    }
    expect(await candidaturasDo(trampoId)).toHaveLength(1);
  });

  it('retiradas durante uma rajada de candidaturas novas: nenhuma retirada falha e a candidatura retirada não volta', async () => {
    const { trampoId, candidatos } = await cenario(10);
    const novos = await Promise.all(
      Array.from({ length: 10 }, () => criarUsuario(app)),
    );

    const [retiradas, novas] = await Promise.all([
      Promise.all(
        candidatos.map((c) => retirar(app, c.usuario, c.candidaturaId)),
      ),
      Promise.all(novos.map((u) => candidatar(app, u, trampoId))),
    ]);

    expect(retiradas.map((r) => r.status)).toEqual(Array(10).fill(204));
    // As candidaturas novas podem perder a corrida de versão (a regra delas
    // é a otimista, com teto); nunca 5xx e nunca duas do mesmo freelancer.
    for (const r of novas) {
      expect([201, 409]).toContain(r.status);
    }
    const restantes = await candidaturasDo(trampoId);
    const donos = restantes.map((c) => c.freelancer_id);
    expect(new Set(donos).size).toBe(donos.length);
    expect(restantes).toHaveLength(
      novas.filter((r) => r.status === 201).length,
    );
    const retirados = new Set(candidatos.map((c) => c.usuario.contaId));
    expect(donos.filter((d) => retirados.has(String(d)))).toEqual([]);
  }, 60_000);

  it.each([0, 1, 3, 7])(
    'retirar contra encerrar (atraso %i ms): 204 ou 409 candidatura_nao_pendente, nunca conflito de versão, e o estado final bate',
    async (atraso) => {
      const { autor, trampoId, candidatos } = await cenario(1);
      const alvo = candidatos[0];
      if (alvo === undefined) throw new Error('sem candidato');

      const encerrar = () =>
        pedir(app, 'POST', `/trampos/${trampoId}/encerrar`, {
          token: autor.token,
        });
      const [retirada, encerramento] = await Promise.all([
        retirar(app, alvo.usuario, alvo.candidaturaId),
        new Promise<void>((r) => setTimeout(r, atraso)).then(encerrar),
      ]);

      expect(encerramento.status).toBe(204);
      expect([204, 409]).toContain(retirada.status);
      if (retirada.status === 409) {
        expect((retirada.corpo as Objeto).erro).toBe(
          'candidatura_nao_pendente',
        );
        expect(await candidaturasDo(trampoId)).toMatchObject([
          { status: 'recusada' },
        ]);
      } else {
        expect(await candidaturasDo(trampoId)).toEqual([]);
      }
    },
  );

  it.each([0, 1, 3, 7])(
    'retirar contra excluir o trampo (atraso %i ms): 204 ou 404, o trampo some e nenhuma candidatura fica órfã',
    async (atraso) => {
      const { autor, trampoId, candidatos } = await cenario(1);
      const alvo = candidatos[0];
      if (alvo === undefined) throw new Error('sem candidato');

      const excluir = () =>
        pedir(app, 'DELETE', `/trampos/${trampoId}`, { token: autor.token });
      const [retirada, exclusao] = await Promise.all([
        retirar(app, alvo.usuario, alvo.candidaturaId),
        new Promise<void>((r) => setTimeout(r, atraso)).then(excluir),
      ]);

      expect(exclusao.status).toBe(204);
      expect([204, 404]).toContain(retirada.status);
      expect(await candidaturasDo(trampoId)).toEqual([]);
      const detalhe = await pedir(app, 'GET', `/trampos/${trampoId}`, {
        token: autor.token,
      });
      expect(detalhe.status).toBe(404);
    },
  );

  it('retirar a candidatura aceita dá 409 candidatura_nao_pendente e a candidatura continua', async () => {
    const { autor, trampoId, candidatos } = await cenario(2);
    const alvo = candidatos[0];
    if (alvo === undefined) throw new Error('sem candidato');
    const aceite = await pedir(
      app,
      'POST',
      `/trampos/${trampoId}/candidaturas/${alvo.candidaturaId}/aceitar`,
      { token: autor.token },
    );
    expect(aceite.status, aceite.texto).toBe(200);

    const resposta = await retirar(app, alvo.usuario, alvo.candidaturaId);

    expect(resposta.status).toBe(409);
    expect((resposta.corpo as Objeto).erro).toBe('candidatura_nao_pendente');
    expect(
      (await candidaturasDo(trampoId)).filter((c) => c.status === 'aceita'),
    ).toHaveLength(1);
  });
});

describe('CA66 — GET /trampos/meus paginado, pela API', () => {
  let app: Aplicacao;
  let autor: Usuario;
  let outro: Usuario;

  const pagina = (query: string, quem: Usuario = autor) =>
    pedir(app, 'GET', `/trampos/meus${query}`, { token: quem.token });

  function cursorDe(lista: Objeto[]): string {
    const ultimo = lista.at(-1);
    if (ultimo === undefined) throw new Error('página vazia');
    return `antesDeCriadoEm=${encodeURIComponent(String(ultimo.criadoEm))}&antesDeId=${String(ultimo.id)}`;
  }

  beforeAll(async () => {
    await limparBanco();
    // Relógio parado: todos os trampos nascem no mesmo milissegundo, então só
    // o `id` desempata a ordem (a pior borda do cursor `(criadoEm, id)`).
    app = await montar({ relogio: relogioParado() });
    autor = await criarUsuario(app);
    outro = await criarUsuario(app);
    for (let i = 0; i < 45; i += 1) {
      await publicarTrampo(app, autor, { titulo: `Trampo do autor ${i}` });
    }
    for (let i = 0; i < 5; i += 1) {
      await publicarTrampo(app, outro, { titulo: `Trampo do outro ${i}` });
    }
  }, 120_000);

  afterAll(async () => {
    await app?.fechar();
    await limparBanco();
  });

  it('45 trampos no mesmo milissegundo, de 20 em 20: 20, 20 e 5, sem repetir nem pular, e só os do autor', async () => {
    const p1 = await pagina('');
    expect(p1.status, p1.texto).toBe(200);
    const l1 = p1.corpo as Objeto[];
    const p2 = await pagina(`?${cursorDe(l1)}`);
    const l2 = p2.corpo as Objeto[];
    const p3 = await pagina(`?${cursorDe(l2)}`);
    const l3 = p3.corpo as Objeto[];

    expect([l1.length, l2.length, l3.length]).toEqual([20, 20, 5]);
    const ids = [...l1, ...l2, ...l3].map((t) => String(t.id));
    expect(new Set(ids).size).toBe(45);
    expect([...ids]).toEqual([...ids].sort().reverse());
    for (const t of [...l1, ...l2, ...l3]) {
      expect(String(t.titulo)).toMatch(/^Trampo do autor /);
      expect(typeof t.versao).toBe('number');
    }
    const p4 = await pagina(`?${cursorDe(l3)}`);
    expect(p4.corpo).toEqual([]);
  });

  it('limite 50 devolve 45 de uma vez e limite 1 devolve um só', async () => {
    const todos = await pagina('?limite=50');
    expect((todos.corpo as Objeto[]).length).toBe(45);
    const um = await pagina('?limite=1');
    expect((um.corpo as Objeto[]).length).toBe(1);
  });

  it('o id do cursor em maiúsculas dá a mesma página que em minúsculas', async () => {
    const l1 = (await pagina('?limite=10')).corpo as Objeto[];
    const ultimo = l1.at(-1) as Objeto;
    const base = `?limite=10&antesDeCriadoEm=${encodeURIComponent(String(ultimo.criadoEm))}`;
    const minusculo = await pagina(`${base}&antesDeId=${String(ultimo.id)}`);
    const maiusculo = await pagina(
      `${base}&antesDeId=${String(ultimo.id).toUpperCase()}`,
    );

    expect(maiusculo.status, maiusculo.texto).toBe(200);
    expect(maiusculo.corpo).toEqual(minusculo.corpo);
  });

  it('o item do cursor excluído entre as páginas não faz a página seguinte pular nem repetir ninguém', async () => {
    const l1 = (await pagina('?limite=10')).corpo as Objeto[];
    const ultimo = l1.at(-1) as Objeto;
    const cursor = cursorDe(l1);
    const sem = (await pagina(`?limite=10&${cursor}`)).corpo as Objeto[];

    const excluido = await pedir(
      app,
      'DELETE',
      `/trampos/${String(ultimo.id)}`,
      {
        token: autor.token,
      },
    );
    expect(excluido.status, excluido.texto).toBe(204);
    const depois = (await pagina(`?limite=10&${cursor}`)).corpo as Objeto[];

    expect(depois.map((t) => t.id)).toEqual(sem.map((t) => t.id));
  });

  it('trampo publicado entre as páginas não aparece na seguinte (é mais novo que o cursor)', async () => {
    const l1 = (await pagina('?limite=5')).corpo as Objeto[];
    const cursor = cursorDe(l1);
    const antes = (await pagina(`?limite=5&${cursor}`)).corpo as Objeto[];

    // Aplicação com relógio depois do dos trampos do cenário (junho de 2026) e antes do fim das sessões de teste (24 h a partir de agora):
    // o trampo novo nasce mais novo que o cursor, como no uso real. Com o
    // relógio parado ele empataria e o `id` aleatório decidiria o lado.
    const depoisDeTudo = await montar({
      relogio: { agora: () => new Date(Date.UTC(2026, 9, 1)) },
    });
    try {
      await publicarTrampo(depoisDeTudo, autor, {
        titulo: 'Publicado no meio',
      });
    } finally {
      await depoisDeTudo.fechar();
    }
    const depois = (await pagina(`?limite=5&${cursor}`)).corpo as Objeto[];

    expect(depois.map((t) => t.id)).toEqual(antes.map((t) => t.id));
    expect(depois.map((t) => t.titulo)).not.toContain('Publicado no meio');
    const primeira = (await pagina('?limite=1')).corpo as Objeto[];
    expect(primeira[0]?.titulo).toBe('Publicado no meio');
  });

  it('o cursor tirado de um trampo do outro só marca a posição: o autor nunca vê trampo alheio', async () => {
    const dele = (await pagina('?limite=1', outro)).corpo as Objeto[];
    const resposta = await pagina(`?limite=50&${cursorDe(dele)}`);

    expect(resposta.status, resposta.texto).toBe(200);
    for (const t of resposta.corpo as Objeto[]) {
      expect(String(t.titulo)).not.toMatch(/outro/);
    }
  });

  it.each([
    ['limite com sinal', '?limite=%2B5'],
    ['limite com zeros à esquerda demais', '?limite=0005'],
    ['limite vazio', '?limite='],
    ['limite decimal', '?limite=2.5'],
    ['limite em notação científica', '?limite=1e1'],
    [
      'data com fuso em vez de Z',
      '?antesDeCriadoEm=2026-06-01T00:00:00.000%2B00:00&antesDeId=00000000-0000-4000-8000-000000000000',
    ],
    [
      'data sem milissegundos',
      '?antesDeCriadoEm=2026-06-01T00:00:00Z&antesDeId=00000000-0000-4000-8000-000000000000',
    ],
    [
      'id que não é uuid',
      '?antesDeCriadoEm=2026-06-01T00:00:00.000Z&antesDeId=abc',
    ],
    [
      'data antes de 1970',
      '?antesDeCriadoEm=1969-12-31T23:59:59.999Z&antesDeId=00000000-0000-4000-8000-000000000000',
    ],
  ])('%s dá 400 dados_invalidos sem ecoar o valor', async (_nome, consulta) => {
    const resposta = await pagina(consulta);

    expect(resposta.status, resposta.texto).toBe(400);
    expect((resposta.corpo as Objeto).erro).toBe('dados_invalidos');
    expect(resposta.texto).not.toContain('abc');
    expect(resposta.texto).not.toContain('1969');
  });

  it('sem sessão, mesmo com a página inválida, dá 401 e não 400', async () => {
    const resposta = await pedir(app, 'GET', '/trampos/meus?limite=0');
    expect(resposta.status).toBe(401);
  });
});
