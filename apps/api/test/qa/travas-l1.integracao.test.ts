/**
 * QA da L1, rodada 2: as travas consultivas por conta (Q1) não criam espera
 * longa nem deadlock. Aberturas de conversa durante exclusão grande, aberturas
 * cruzadas, exclusões cruzadas com aberturas e mais aberturas simultâneas do
 * que conexões no pool (10).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import {
  candidatar,
  limparBanco,
  montar,
  pedir,
  publicarTrampo,
} from './apoio.js';
import {
  criarUsuarioComSenha,
  esperar,
  excluir,
  linhasDe,
  NADA,
  type UsuarioComSenha,
} from './apoio-l1.js';

let aplicacao: Aplicacao | undefined;

beforeEach(async () => {
  await limparBanco();
  aplicacao = await montar();
});

afterEach(async () => {
  await aplicacao?.fechar();
  aplicacao = undefined;
});

function app(): Aplicacao {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao;
}

function abrir(de: UsuarioComSenha, para: UsuarioComSenha) {
  return pedir(app(), 'POST', '/conversas', {
    token: de.token,
    corpo: { outroUsuarioId: para.contaId },
  });
}

/** Vínculo: o `candidato` se candidata a um trampo do `autor`. */
async function vincular(autor: UsuarioComSenha, candidato: UsuarioComSenha) {
  const trampoId = await publicarTrampo(app(), autor);
  expect((await candidatar(app(), candidato, trampoId)).status).toBe(201);
}

describe('travas por conta — espera e deadlock', () => {
  it('abertura de conversa durante exclusão grande: termina logo depois dela, sem 500 e sem conversa sobrando', async () => {
    const ana = await criarUsuarioComSenha(app());
    const outros = await Promise.all(
      Array.from({ length: 6 }, () => criarUsuarioComSenha(app())),
    );
    for (let i = 0; i < 40; i++) {
      const trampoId = await publicarTrampo(app(), ana);
      for (const outro of outros) {
        expect((await candidatar(app(), outro, trampoId)).status).toBe(201);
      }
    }
    for (const outro of outros.slice(0, 3)) {
      const conversa = (await abrir(outro, ana)).corpo as {
        conversaId: string;
      };
      for (let i = 0; i < 30; i++) {
        await pedir(
          app(),
          'POST',
          `/conversas/${conversa.conversaId}/mensagens`,
          {
            token: outro.token,
            corpo: { texto: `m${i}` },
          },
        );
      }
    }
    const novos = outros.slice(3);
    const inicio = Date.now();

    const [exclusao, ...aberturas] = await Promise.all([
      excluir(app(), ana, ana.senha),
      ...novos.map(async (outro, i) => {
        await esperar(i);
        const r = await abrir(outro, ana);
        return { ...r, ms: Date.now() - inicio };
      }),
    ]);

    expect(exclusao.status, exclusao.texto).toBe(204);
    for (const abertura of aberturas) {
      expect([201, 200, 403, 404], abertura.texto).toContain(abertura.status);
      expect(abertura.ms).toBeLessThan(10_000);
    }
    expect(await linhasDe(ana.contaId)).toEqual(NADA);
  }, 60_000);

  it('duas aberturas cruzadas (A abre com B e B abre com A) terminam sempre, dão 201 e 200 e deixam uma conversa só', async () => {
    for (let i = 0; i < 15; i++) {
      await limparBanco();
      const ana = await criarUsuarioComSenha(app());
      const bruno = await criarUsuarioComSenha(app());
      await vincular(ana, bruno);

      const inicio = Date.now();
      const [a, b] = await Promise.all([abrir(ana, bruno), abrir(bruno, ana)]);

      expect(Date.now() - inicio, `rodada ${i}`).toBeLessThan(5_000);
      expect([a.status, b.status].sort(), `rodada ${i}`).toEqual([200, 201]);
      expect(
        (a.corpo as { conversaId: string }).conversaId,
        `rodada ${i}`,
      ).toBe((b.corpo as { conversaId: string }).conversaId);
      expect((await linhasDe(ana.contaId)).conversas).toBe(1);
    }
  }, 60_000);

  it('exclusões cruzadas com aberturas nos dois sentidos ao mesmo tempo: nenhum 500, nenhum travamento e nada sobra', async () => {
    for (let i = 0; i < 10; i++) {
      await limparBanco();
      const ana = await criarUsuarioComSenha(app());
      const bruno = await criarUsuarioComSenha(app());
      await vincular(ana, bruno);
      await vincular(bruno, ana);

      const inicio = Date.now();
      const respostas = await Promise.all([
        excluir(app(), ana, ana.senha),
        excluir(app(), bruno, bruno.senha),
        (async () => {
          await esperar(i % 3);
          return abrir(ana, bruno);
        })(),
        (async () => {
          await esperar((i + 1) % 3);
          return abrir(bruno, ana);
        })(),
      ]);

      expect(Date.now() - inicio, `rodada ${i}`).toBeLessThan(10_000);
      const [exA, exB, abA, abB] = respostas;
      expect([exA?.status, exB?.status], `rodada ${i}`).toEqual([204, 204]);
      for (const abertura of [abA, abB]) {
        expect(
          [200, 201, 401, 403, 404],
          `rodada ${i}: ${abertura?.texto}`,
        ).toContain(abertura?.status);
      }
      expect(await linhasDe(ana.contaId), `rodada ${i}`).toEqual(NADA);
      expect(await linhasDe(bruno.contaId), `rodada ${i}`).toEqual(NADA);
    }
  }, 60_000);

  it('40 aberturas simultâneas contra uma conta que está sendo excluída (mais que as 10 conexões do pool): todas terminam e as outras rotas continuam respondendo', async () => {
    const ana = await criarUsuarioComSenha(app());
    const candidatos = await Promise.all(
      Array.from({ length: 40 }, () => criarUsuarioComSenha(app())),
    );
    const trampoId = await publicarTrampo(app(), ana);
    for (const c of candidatos) {
      expect((await candidatar(app(), c, trampoId)).status).toBe(201);
    }
    const inicio = Date.now();

    const [exclusao, ...aberturas] = await Promise.all([
      excluir(app(), ana, ana.senha),
      ...candidatos.map(async (c, i) => {
        await esperar(i % 5);
        return abrir(c, ana);
      }),
    ]);
    const leitura = await pedir(app(), 'GET', '/categorias', {
      token: candidatos[0]?.token,
    });

    expect(Date.now() - inicio).toBeLessThan(15_000);
    expect(exclusao.status, exclusao.texto).toBe(204);
    for (const abertura of aberturas) {
      expect([200, 201, 403, 404], abertura.texto).toContain(abertura.status);
    }
    expect(leitura.status).toBe(200);
    expect(await linhasDe(ana.contaId)).toEqual(NADA);
  }, 60_000);

  it('uma exclusão não espera as aberturas de outras contas entre si: aberturas sem relação com a conta excluída seguem normais', async () => {
    const ana = await criarUsuarioComSenha(app());
    const par1 = await criarUsuarioComSenha(app());
    const par2 = await criarUsuarioComSenha(app());
    await vincular(par1, par2);
    const [exclusao, abertura] = await Promise.all([
      excluir(app(), ana, ana.senha),
      abrir(par2, par1),
    ]);
    expect(exclusao.status).toBe(204);
    expect(abertura.status).toBe(201);
  });
});
