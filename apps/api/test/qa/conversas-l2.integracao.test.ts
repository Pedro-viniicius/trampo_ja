/**
 * QA da L2 (CA28, CA29, D35): a conversa já aberta continua depois que a
 * candidatura é retirada ou o trampo é excluído.
 *
 * "Continua" vale para listar, ler e enviar mensagem (testes verdes). O que
 * falha hoje é reabrir pelo par: `POST /conversas` confere o vínculo ANTES de
 * procurar a conversa que já existe (`conversas/aplicacao/casos-de-uso.ts`,
 * `abrirConversa`), então quem tenta "Conversar" de novo recebe 403
 * `sem_vinculo` mesmo tendo a conversa na lista. A conversa NOVA, sem outro
 * vínculo, continua recusada (D35).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import {
  candidatar,
  criarUsuario,
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

const abrir = (de: Usuario, com: string) =>
  pedir(app, 'POST', '/conversas', {
    token: de.token,
    corpo: { outroUsuarioId: com },
  });

async function comConversaAberta() {
  const empregador = await criarUsuario(app);
  const freelancer = await criarUsuario(app);
  const trampoId = await publicarTrampo(app, empregador);
  const candidatura = (await candidatar(app, freelancer, trampoId)).corpo as {
    id: string;
  };
  const aberta = await abrir(freelancer, empregador.contaId);
  expect(aberta.status, aberta.texto).toBe(201);
  const conversaId = (aberta.corpo as { conversaId: string }).conversaId;
  const msg = await pedir(app, 'POST', `/conversas/${conversaId}/mensagens`, {
    token: empregador.token,
    corpo: { texto: 'Combinado, pode começar na segunda.' },
  });
  expect(msg.status, msg.texto).toBe(201);
  return {
    empregador,
    freelancer,
    trampoId,
    candidaturaId: candidatura.id,
    conversaId,
  };
}

async function conversaSegueUsavel(
  conversaId: string,
  a: Usuario,
  b: Usuario,
): Promise<void> {
  for (const quem of [a, b]) {
    const lista = await pedir(app, 'GET', '/conversas', { token: quem.token });
    expect(
      (lista.corpo as { conversaId: string }[]).map((c) => c.conversaId),
    ).toContain(conversaId);
  }
  const lidas = await pedir(app, 'GET', `/conversas/${conversaId}/mensagens`, {
    token: a.token,
  });
  expect(lidas.status, lidas.texto).toBe(200);
  expect((lidas.corpo as unknown[]).length).toBeGreaterThanOrEqual(1);
  const nova = await pedir(app, 'POST', `/conversas/${conversaId}/mensagens`, {
    token: a.token,
    corpo: { texto: 'Ainda dá para falar por aqui?' },
  });
  expect(nova.status, nova.texto).toBe(201);
}

describe('D35 — a conversa já aberta continua depois de retirar ou excluir', () => {
  it('retirar a candidatura: a conversa continua na lista, legível e com envio, para os dois', async () => {
    const { empregador, freelancer, candidaturaId, conversaId } =
      await comConversaAberta();
    expect(
      (
        await pedir(app, 'DELETE', `/candidaturas/${candidaturaId}`, {
          token: freelancer.token,
        })
      ).status,
    ).toBe(204);
    await conversaSegueUsavel(conversaId, freelancer, empregador);
    await conversaSegueUsavel(conversaId, empregador, freelancer);
  });

  it('excluir o trampo: a conversa continua na lista, legível e com envio, para os dois', async () => {
    const { empregador, freelancer, trampoId, conversaId } =
      await comConversaAberta();
    expect(
      (
        await pedir(app, 'DELETE', `/trampos/${trampoId}`, {
          token: empregador.token,
        })
      ).status,
    ).toBe(204);
    await conversaSegueUsavel(conversaId, freelancer, empregador);
    await conversaSegueUsavel(conversaId, empregador, freelancer);
  });
});

describe('D35 — conversa NOVA sem vínculo continua recusada', () => {
  it('retirar sem nunca ter aberto conversa: abrir conversa dá 403 sem_vinculo nos dois sentidos', async () => {
    const empregador = await criarUsuario(app);
    const outro = await criarUsuario(app);
    const trampo2 = await publicarTrampo(app, empregador);
    const c2 = (await candidatar(app, outro, trampo2)).corpo as { id: string };
    expect(
      (
        await pedir(app, 'DELETE', `/candidaturas/${c2.id}`, {
          token: outro.token,
        })
      ).status,
    ).toBe(204);
    for (const [de, para] of [
      [outro, empregador],
      [empregador, outro],
    ] as const) {
      const r = await abrir(de, para.contaId);
      expect(r.status, r.texto).toBe(403);
      expect(r.texto).toBe('{"erro":"sem_vinculo"}');
    }
  });

  it('outra candidatura entre o mesmo par mantém o vínculo: retirar uma não impede reabrir a conversa', async () => {
    const { empregador, freelancer, candidaturaId, conversaId } =
      await comConversaAberta();
    const outroTrampo = await publicarTrampo(app, empregador);
    expect((await candidatar(app, freelancer, outroTrampo)).status).toBe(201);
    await pedir(app, 'DELETE', `/candidaturas/${candidaturaId}`, {
      token: freelancer.token,
    });
    const r = await abrir(freelancer, empregador.contaId);
    expect(r.status, r.texto).toBe(200);
    expect((r.corpo as { conversaId: string }).conversaId).toBe(conversaId);
  });
});

describe('Q1 (L2) — reabrir pelo par uma conversa que já existe, sem vínculo restante', () => {
  it('depois de retirar a candidatura, POST /conversas devolve a conversa existente (200, nova:false) em vez de 403 sem_vinculo', async () => {
    const { empregador, freelancer, candidaturaId, conversaId } =
      await comConversaAberta();
    await pedir(app, 'DELETE', `/candidaturas/${candidaturaId}`, {
      token: freelancer.token,
    });
    for (const [de, para] of [
      [freelancer, empregador],
      [empregador, freelancer],
    ] as const) {
      const r = await abrir(de, para.contaId);
      expect(r.status, r.texto).toBe(200);
      expect((r.corpo as { conversaId: string }).conversaId).toBe(conversaId);
    }
  });

  it('depois de o trampo ser excluído, POST /conversas devolve a conversa existente em vez de 403 sem_vinculo', async () => {
    const { empregador, freelancer, trampoId, conversaId } =
      await comConversaAberta();
    await pedir(app, 'DELETE', `/trampos/${trampoId}`, {
      token: empregador.token,
    });
    for (const [de, para] of [
      [freelancer, empregador],
      [empregador, freelancer],
    ] as const) {
      const r = await abrir(de, para.contaId);
      expect(r.status, r.texto).toBe(200);
      expect((r.corpo as { conversaId: string }).conversaId).toBe(conversaId);
    }
  });
});
