/**
 * QA — CA8 a CA11 pela API montada, com o Postgres de teste: validação, regras
 * de repetição, trampo que não está aberto e, principalmente, concorrência
 * pelas rotas HTTP (e não só pelo repositório).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import {
  candidatar,
  criarUsuario,
  criarUsuarioSemPerfil,
  limparBanco,
  montar,
  pedir,
  publicarTrampo,
  type Usuario,
} from './apoio.js';

let app: Aplicacao;

beforeAll(async () => {
  await limparBanco();
  app = await montar();
});

afterAll(async () => {
  await app?.fechar();
  await limparBanco();
});

function corpoDe(r: { corpo: unknown }): Record<string, unknown> {
  return r.corpo as Record<string, unknown>;
}

async function listar(autor: Usuario, trampoId: string) {
  const r = await pedir(app, 'GET', `/trampos/${trampoId}/candidaturas`, {
    token: autor.token,
  });
  expect(r.status).toBe(200);
  return r.corpo as {
    id: string;
    freelancerId: string;
    status: string;
  }[];
}

describe('CA8 — candidatura: validação dos campos', () => {
  it('recusa valor proposto zero, negativo, fracionário, texto e acima do integer, apontando o campo', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const freela = await criarUsuario(app);

    for (const valor of [0, -1, 1.5, '300', 2_147_483_648, 1e21, true]) {
      const r = await candidatar(app, freela, trampoId, {
        valorPropostoCentavos: valor,
      });
      expect(r.status, `valor ${String(valor)}`).toBe(400);
      expect(corpoDe(r).erro).toBe('dados_invalidos');
      expect(
        (corpoDe(r).campos as { campo: string }[]).map((c) => c.campo),
      ).toContain('valorPropostoCentavos');
    }
    expect(await listar(autor, trampoId)).toEqual([]);
  });

  it('aceita o valor máximo do integer (2147483647) e recusa o seguinte', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const freela = await criarUsuario(app);

    const ok = await candidatar(app, freela, trampoId, {
      valorPropostoCentavos: 2_147_483_647,
    });
    expect(ok.status).toBe(201);
    expect(corpoDe(ok).status).toBe('pendente');
  });

  it('mensagem vazia, só espaços ou ausente: 400 no campo mensagem; 2000 caracteres passa e 2001 não', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const freela = await criarUsuario(app);

    for (const mensagem of ['', '   ', null]) {
      const r = await candidatar(app, freela, trampoId, { mensagem });
      expect(r.status).toBe(400);
      expect(corpoDe(r).campos).toEqual([
        { campo: 'mensagem', motivo: 'obrigatorio' },
      ]);
    }
    const longa = await candidatar(app, freela, trampoId, {
      mensagem: 'a'.repeat(2001),
    });
    expect(longa.status).toBe(400);
    expect(corpoDe(longa).campos).toEqual([
      { campo: 'mensagem', motivo: 'tamanho' },
    ]);
    const limite = await candidatar(app, freela, trampoId, {
      mensagem: '😀'.repeat(2000),
    });
    expect(limite.status).toBe(201);
  });

  it('trampo inexistente ou com id fora do formato: 404, nunca 500', async () => {
    const freela = await criarUsuario(app);
    for (const id of [
      '00000000-0000-4000-8000-000000000000',
      'nao-e-uuid',
      '123',
    ]) {
      const r = await candidatar(app, freela, id);
      expect(r.status, id).toBe(404);
      expect(r.texto).toBe('{"erro":"nao_encontrado"}');
    }
  });

  it('id do trampo em maiúsculas acha o mesmo trampo', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const freela = await criarUsuario(app);

    const r = await candidatar(app, freela, trampoId.toUpperCase());
    expect(r.status).toBe(201);
    const detalhe = await pedir(
      app,
      'GET',
      `/trampos/${trampoId.toUpperCase()}`,
      { token: freela.token },
    );
    expect(detalhe.status).toBe(200);
    expect(corpoDe(detalhe).id).toBe(trampoId);
  });
});

describe('CA9 e D9 — ordem das checagens e repetição', () => {
  it('perfil incompleto vem antes de tudo: até o autor sem perfil recebe perfil_incompleto', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const semPerfil = await criarUsuarioSemPerfil();

    const r = await candidatar(app, semPerfil, trampoId, {
      valorPropostoCentavos: -5,
    });
    expect(r.status).toBe(409);
    expect(r.texto).toBe('{"erro":"perfil_incompleto"}');
  });

  it('o autor não se candidata ao próprio trampo e a recusa não grava nada', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);

    const r = await candidatar(app, autor, trampoId);
    expect(r.status).toBe(409);
    expect(r.texto).toBe('{"erro":"autor_nao_pode_candidatar"}');
    expect(await listar(autor, trampoId)).toEqual([]);
  });

  it('o mesmo freelancer, repetido em série, tem exatamente uma candidatura', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const freela = await criarUsuario(app);

    expect((await candidatar(app, freela, trampoId)).status).toBe(201);
    for (let i = 0; i < 3; i++) {
      const r = await candidatar(app, freela, trampoId);
      expect(r.status).toBe(409);
      expect(r.texto).toBe('{"erro":"candidatura_duplicada"}');
    }
    expect(await listar(autor, trampoId)).toHaveLength(1);
  });
});

describe('CA10 e CA11 — aceite pela API', () => {
  it('aceitar uma candidatura recusa as demais, deixa o trampo em andamento e bloqueia novas candidaturas (CA11)', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const f1 = await criarUsuario(app);
    const f2 = await criarUsuario(app);
    const f3 = await criarUsuario(app);
    const tardio = await criarUsuario(app);
    for (const f of [f1, f2, f3]) {
      expect((await candidatar(app, f, trampoId)).status).toBe(201);
    }
    const lista = await listar(autor, trampoId);
    const escolhida = lista.find((c) => c.freelancerId === f2.contaId);

    const aceite = await pedir(
      app,
      'POST',
      `/trampos/${trampoId}/candidaturas/${escolhida?.id}/aceitar`,
      { token: autor.token },
    );
    expect(aceite.status).toBe(200);

    const depois = await listar(autor, trampoId);
    expect(
      Object.fromEntries(depois.map((c) => [c.freelancerId, c.status])),
    ).toEqual({
      [f1.contaId]: 'recusada',
      [f2.contaId]: 'aceita',
      [f3.contaId]: 'recusada',
    });
    const trampo = await pedir(app, 'GET', `/trampos/${trampoId}`, {
      token: f1.token,
    });
    expect(corpoDe(trampo).status).toBe('em_andamento');

    // CA11: quem chega depois, e também quem já foi recusado.
    const novo = await candidatar(app, tardio, trampoId);
    expect(novo.status).toBe(409);
    expect(novo.texto).toBe('{"erro":"trampo_nao_aberto"}');
    const recusadoDeNovo = await candidatar(app, f1, trampoId);
    expect(recusadoDeNovo.status).toBe(409);
    // A lista não ganhou ninguém.
    expect(await listar(autor, trampoId)).toHaveLength(3);

    // A visão do freelancer recusado e a do aceito.
    const minhasF1 = await pedir(app, 'GET', '/candidaturas/minhas', {
      token: f1.token,
    });
    expect(minhasF1.corpo).toEqual([
      expect.objectContaining({ trampoId, status: 'recusada' }),
    ]);
  });

  it('aceitar duas vezes a mesma candidatura: 200 e depois 409 trampo_nao_aberto, sem mudar o estado', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const f1 = await criarUsuario(app);
    await candidatar(app, f1, trampoId);
    const [cand] = await listar(autor, trampoId);
    const url = `/trampos/${trampoId}/candidaturas/${cand?.id}/aceitar`;

    expect((await pedir(app, 'POST', url, { token: autor.token })).status).toBe(
      200,
    );
    const segunda = await pedir(app, 'POST', url, { token: autor.token });
    expect(segunda.status).toBe(409);
    expect(segunda.texto).toBe('{"erro":"trampo_nao_aberto"}');
    expect((await listar(autor, trampoId))[0]?.status).toBe('aceita');
  });

  it('ids em maiúsculas na URL do aceite (trampo e candidatura) acham os mesmos registros', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const f1 = await criarUsuario(app);
    await candidatar(app, f1, trampoId);
    const [cand] = await listar(autor, trampoId);

    const r = await pedir(
      app,
      'POST',
      `/trampos/${trampoId.toUpperCase()}/candidaturas/${cand?.id.toUpperCase()}/aceitar`,
      { token: autor.token },
    );
    expect(r.status).toBe(200);
    expect((await listar(autor, trampoId))[0]?.status).toBe('aceita');
  });

  it('só o autor aceita: outro usuário, mesmo com candidatura, recebe 404 e nada muda', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const f1 = await criarUsuario(app);
    await candidatar(app, f1, trampoId);
    const [cand] = await listar(autor, trampoId);

    const r = await pedir(
      app,
      'POST',
      `/trampos/${trampoId}/candidaturas/${cand?.id}/aceitar`,
      { token: f1.token },
    );
    expect(r.status).toBe(404);
    expect((await listar(autor, trampoId))[0]?.status).toBe('pendente');
  });

  it('candidatura de outro trampo na URL, id inexistente e ids fora do formato: 404, nunca 500', async () => {
    const autor = await criarUsuario(app);
    const trampoA = await publicarTrampo(app, autor);
    const trampoB = await publicarTrampo(app, autor);
    const f1 = await criarUsuario(app);
    await candidatar(app, f1, trampoB);
    const [candDeB] = await listar(autor, trampoB);

    for (const url of [
      `/trampos/${trampoA}/candidaturas/${candDeB?.id}/aceitar`,
      `/trampos/${trampoA}/candidaturas/00000000-0000-4000-8000-000000000000/aceitar`,
      `/trampos/${trampoA}/candidaturas/nao-e-uuid/aceitar`,
      `/trampos/nao-e-uuid/candidaturas/${candDeB?.id}/aceitar`,
    ]) {
      const r = await pedir(app, 'POST', url, { token: autor.token });
      expect(r.status, url).toBe(404);
      expect(r.texto).toBe('{"erro":"nao_encontrado"}');
    }
    // A candidatura de B segue pendente e o trampo B, aberto.
    expect((await listar(autor, trampoB))[0]?.status).toBe('pendente');
  });
});

describe('Concorrência pela API (CA8, CA9, CA10)', () => {
  it('CA9 — o mesmo freelancer dispara 6 candidaturas ao mesmo tempo: exatamente uma é gravada e nenhuma resposta é 500', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const freela = await criarUsuario(app);

    const respostas = await Promise.all(
      Array.from({ length: 6 }, () => candidatar(app, freela, trampoId)),
    );

    const status = respostas.map((r) => r.status).sort();
    expect(status.filter((s) => s === 201)).toHaveLength(1);
    expect(status.filter((s) => s >= 500)).toEqual([]);
    for (const r of respostas.filter((x) => x.status !== 201)) {
      expect(r.status).toBe(409);
    }
    expect(await listar(autor, trampoId)).toHaveLength(1);
  });

  it('CA8 — vários freelancers distintos se candidatam ao mesmo tempo: cada candidatura válida é gravada', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const freelancers = await Promise.all(
      Array.from({ length: 6 }, () => criarUsuario(app)),
    );

    const respostas = await Promise.all(
      freelancers.map((f) => candidatar(app, f, trampoId)),
    );

    expect(respostas.map((r) => r.status)).toEqual(freelancers.map(() => 201));
    expect(await listar(autor, trampoId)).toHaveLength(6);
  });

  it('CA10 — dois aceites concorrentes de candidaturas diferentes: só um vence, sem 500, e o estado final é coerente', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const fs = [];
    for (let i = 0; i < 4; i++) {
      const f = await criarUsuario(app);
      fs.push(f);
      expect((await candidatar(app, f, trampoId)).status).toBe(201);
    }
    const lista = await listar(autor, trampoId);

    const respostas = await Promise.all(
      lista.map((c) =>
        pedir(
          app,
          'POST',
          `/trampos/${trampoId}/candidaturas/${c.id}/aceitar`,
          {
            token: autor.token,
          },
        ),
      ),
    );

    expect(respostas.filter((r) => r.status === 200)).toHaveLength(1);
    expect(respostas.filter((r) => r.status >= 500)).toEqual([]);
    for (const r of respostas.filter((x) => x.status !== 200)) {
      expect(r.status).toBe(409);
      expect(['conflito_de_versao', 'trampo_nao_aberto']).toContain(
        corpoDe(r).erro,
      );
    }
    const finais = await listar(autor, trampoId);
    expect(finais.filter((c) => c.status === 'aceita')).toHaveLength(1);
    expect(finais.filter((c) => c.status === 'pendente')).toHaveLength(0);
    expect(finais.filter((c) => c.status === 'recusada')).toHaveLength(3);
  });

  it('CA10 e CA11 — candidaturas chegando durante o aceite nunca deixam uma candidatura pendente num trampo em andamento', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const primeiro = await criarUsuario(app);
    expect((await candidatar(app, primeiro, trampoId)).status).toBe(201);
    const [cand] = await listar(autor, trampoId);
    const retardatarios = await Promise.all(
      Array.from({ length: 5 }, () => criarUsuario(app)),
    );

    const [aceite, ...candidaturas] = await Promise.all([
      pedir(
        app,
        'POST',
        `/trampos/${trampoId}/candidaturas/${cand?.id}/aceitar`,
        { token: autor.token },
      ),
      ...retardatarios.map((f) => candidatar(app, f, trampoId)),
    ]);

    // O aceite pode perder a corrida para uma candidatura (409); o que nunca
    // pode acontecer é um estado incoerente ou um 500.
    expect([200, 409]).toContain(aceite.status);
    expect(candidaturas.filter((r) => r.status >= 500)).toEqual([]);
    const finais = await listar(autor, trampoId);
    const trampo = await pedir(app, 'GET', `/trampos/${trampoId}`, {
      token: autor.token,
    });
    if (aceite.status === 200) {
      // Invariante do agregado: com o trampo em andamento, não sobra pendente.
      expect(corpoDe(trampo).status).toBe('em_andamento');
      expect(finais.filter((c) => c.status === 'pendente')).toEqual([]);
      expect(finais.filter((c) => c.status === 'aceita')).toHaveLength(1);
    } else {
      expect(corpoDe(trampo).status).toBe('aberto');
      expect(finais.filter((c) => c.status !== 'pendente')).toEqual([]);
    }
    // Toda candidatura que a API confirmou com 201 está gravada.
    expect(finais).toHaveLength(
      1 + candidaturas.filter((r) => r.status === 201).length,
    );
  });

  it('rodada 2 — com retry, o aceite concorrente com 5 candidaturas novas sempre dá 200 e cada candidatura vira 201 (e recusada) ou 409 trampo_nao_aberto', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const primeiro = await criarUsuario(app);
    expect((await candidatar(app, primeiro, trampoId)).status).toBe(201);
    const [cand] = await listar(autor, trampoId);
    const retardatarios = await Promise.all(
      Array.from({ length: 5 }, () => criarUsuario(app)),
    );

    const [aceite, ...candidaturas] = await Promise.all([
      pedir(
        app,
        'POST',
        `/trampos/${trampoId}/candidaturas/${cand?.id}/aceitar`,
        { token: autor.token },
      ),
      ...retardatarios.map((f) => candidatar(app, f, trampoId)),
    ]);

    expect(aceite.status, aceite.texto).toBe(200);
    for (const r of candidaturas) {
      expect([201, 409], r.texto).toContain(r.status);
      if (r.status === 409) {
        expect(r.texto).toBe('{"erro":"trampo_nao_aberto"}');
      }
    }
    const finais = await listar(autor, trampoId);
    expect(finais.filter((c) => c.status === 'pendente')).toEqual([]);
    expect(finais.filter((c) => c.status === 'aceita')).toHaveLength(1);
    expect(finais.find((c) => c.id === cand?.id)?.status).toBe('aceita');
    expect(finais).toHaveLength(
      1 + candidaturas.filter((r) => r.status === 201).length,
    );
  });
});
