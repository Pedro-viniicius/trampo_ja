/**
 * QA — CA12 e CA13 pela API montada: vínculo (candidatura em qualquer estado),
 * conversa aberta nos dois sentidos, ordem cronológica, paginação e
 * isolamento entre participantes e terceiros.
 */
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
  relogioParado,
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

/** Empregador e freelancer ligados por uma candidatura pendente. */
async function parComVinculo() {
  const empregador = await criarUsuario(app);
  const freelancer = await criarUsuario(app);
  const trampoId = await publicarTrampo(app, empregador);
  expect((await candidatar(app, freelancer, trampoId)).status).toBe(201);
  return { empregador, freelancer, trampoId };
}

async function abrir(de: Usuario, com: string, aplicacao = app) {
  return pedir(aplicacao, 'POST', '/conversas', {
    token: de.token,
    corpo: { outroUsuarioId: com },
  });
}

async function enviar(
  de: Usuario,
  conversaId: string,
  texto: unknown,
  aplicacao = app,
) {
  return pedir(aplicacao, 'POST', `/conversas/${conversaId}/mensagens`, {
    token: de.token,
    corpo: { texto },
  });
}

async function ler(
  de: Usuario,
  conversaId: string,
  query = '',
  aplicacao = app,
) {
  const r = await pedir(
    aplicacao,
    'GET',
    `/conversas/${conversaId}/mensagens${query}`,
    { token: de.token },
  );
  return {
    ...r,
    mensagens: (r.corpo ?? []) as {
      id: string;
      texto: string;
      autorId: string;
    }[],
  };
}

describe('CA13 — conversa só com vínculo', () => {
  it('sem nenhuma relação: 403 sem_vinculo, e a resposta é igual para conta real e para id que não existe', async () => {
    const a = await criarUsuario(app);
    const b = await criarUsuario(app);

    const real = await abrir(a, b.contaId);
    const fantasma = await abrir(a, '00000000-0000-4000-8000-000000000000');
    const lixo = await abrir(a, 'nao-e-uuid');

    for (const r of [real, fantasma, lixo]) {
      expect(r.status).toBe(403);
      expect(r.texto).toBe('{"erro":"sem_vinculo"}');
    }
  });

  it('dois freelancers que se candidataram ao mesmo trampo não têm vínculo entre si', async () => {
    const empregador = await criarUsuario(app);
    const f1 = await criarUsuario(app);
    const f2 = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, empregador);
    await candidatar(app, f1, trampoId);
    await candidatar(app, f2, trampoId);

    expect((await abrir(f1, f2.contaId)).status).toBe(403);
    expect((await abrir(f2, f1.contaId)).status).toBe(403);
    // Mas cada um tem com o empregador.
    expect((await abrir(f1, empregador.contaId)).status).toBe(201);
    expect((await abrir(f2, empregador.contaId)).status).toBe(201);
  });

  it('quem achou um serviço do freelancer não abre conversa com ele (D4), nem ele com quem o achou', async () => {
    const freela = await criarUsuario(app);
    const cliente = await criarUsuario(app);
    await ofertarServico(app, freela);

    expect((await abrir(cliente, freela.contaId)).status).toBe(403);
    expect((await abrir(freela, cliente.contaId)).status).toBe(403);
  });

  it('o vínculo vale mesmo com a candidatura recusada e em trampo já em andamento', async () => {
    const empregador = await criarUsuario(app);
    const aceito = await criarUsuario(app);
    const recusado = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, empregador);
    await candidatar(app, aceito, trampoId);
    await candidatar(app, recusado, trampoId);
    const lista = await pedir(app, 'GET', `/trampos/${trampoId}/candidaturas`, {
      token: empregador.token,
    });
    const cand = (lista.corpo as { id: string; freelancerId: string }[]).find(
      (c) => c.freelancerId === aceito.contaId,
    );
    await pedir(
      app,
      'POST',
      `/trampos/${trampoId}/candidaturas/${cand?.id}/aceitar`,
      {
        token: empregador.token,
      },
    );

    expect((await abrir(recusado, empregador.contaId)).status).toBe(201);
    expect((await abrir(empregador, aceito.contaId)).status).toBe(201);
  });

  it('conversa consigo mesmo: 409 conversa_consigo_mesmo, também com o id em maiúsculas', async () => {
    const a = await criarUsuario(app);
    for (const id of [a.contaId, a.contaId.toUpperCase()]) {
      const r = await abrir(a, id);
      expect(r.status).toBe(409);
      expect(r.texto).toBe('{"erro":"conversa_consigo_mesmo"}');
    }
  });

  it('outroUsuarioId ausente, nulo, vazio ou de outro tipo: 400 apontando o campo', async () => {
    const a = await criarUsuario(app);
    for (const corpo of [
      {},
      { outroUsuarioId: null },
      { outroUsuarioId: '' },
      { outroUsuarioId: 5 },
    ]) {
      const r = await pedir(app, 'POST', '/conversas', {
        token: a.token,
        corpo,
      });
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      expect(
        (r.corpo as { campos: { campo: string }[] }).campos[0]?.campo,
      ).toBe('outroUsuarioId');
    }
  });

  it('o erro de CA13 não deixa conversa criada: a lista de conversas segue vazia', async () => {
    const a = await criarUsuario(app);
    const b = await criarUsuario(app);
    await abrir(a, b.contaId);
    expect(
      (await pedir(app, 'GET', '/conversas', { token: a.token })).corpo,
    ).toEqual([]);
    expect(
      (await pedir(app, 'GET', '/conversas', { token: b.token })).corpo,
    ).toEqual([]);
  });
});

describe('CA12 — conversa e mensagens', () => {
  it('aberta nos dois sentidos, em sequência e em paralelo, resulta na mesma conversa', async () => {
    const { empregador, freelancer } = await parComVinculo();

    const [r1, r2] = await Promise.all([
      abrir(freelancer, empregador.contaId),
      abrir(empregador, freelancer.contaId),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    const id1 = (r1.corpo as { conversaId: string }).conversaId;
    const id2 = (r2.corpo as { conversaId: string }).conversaId;
    expect(id1).toBe(id2);

    const de3 = await abrir(freelancer, empregador.contaId.toUpperCase());
    expect(de3.status).toBe(200);
    expect((de3.corpo as { conversaId: string }).conversaId).toBe(id1);
    expect(
      (await pedir(app, 'GET', '/conversas', { token: empregador.token }))
        .corpo as unknown[],
    ).toHaveLength(1);
  });

  it('várias aberturas simultâneas do mesmo par não geram 500 nem conversas duplicadas', async () => {
    const { empregador, freelancer } = await parComVinculo();
    const respostas = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        i % 2 === 0
          ? abrir(freelancer, empregador.contaId)
          : abrir(empregador, freelancer.contaId),
      ),
    );
    expect(respostas.filter((r) => r.status >= 500)).toEqual([]);
    expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
    const ids = new Set(
      respostas.map((r) => (r.corpo as { conversaId: string }).conversaId),
    );
    expect(ids.size).toBe(1);
  });

  it('as mensagens aparecem para os dois em ordem cronológica, com autor correto', async () => {
    const { empregador, freelancer } = await parComVinculo();
    const { conversaId } = (await abrir(freelancer, empregador.contaId))
      .corpo as {
      conversaId: string;
    };
    const roteiro: [Usuario, string][] = [
      [freelancer, 'um'],
      [empregador, 'dois'],
      [freelancer, 'três'],
      [empregador, 'quatro'],
    ];
    for (const [quem, texto] of roteiro) {
      expect((await enviar(quem, conversaId, texto)).status).toBe(201);
    }
    for (const lado of [freelancer, empregador]) {
      const { mensagens } = await ler(lado, conversaId);
      expect(mensagens.map((m) => m.texto)).toEqual(roteiro.map(([, t]) => t));
      expect(mensagens.map((m) => m.autorId)).toEqual(
        roteiro.map(([q]) => q.contaId),
      );
    }
  });

  it('mensagens que caem no mesmo milissegundo mantêm a ordem de envio (desempate determinístico)', async () => {
    const parado = await montar({ relogio: relogioParado() });
    try {
      const empregador = await criarUsuario(parado);
      const freelancer = await criarUsuario(parado);
      const trampoId = await publicarTrampo(parado, empregador);
      await candidatar(parado, freelancer, trampoId);
      const { conversaId } = (
        await abrir(freelancer, empregador.contaId, parado)
      ).corpo as {
        conversaId: string;
      };
      const textos = Array.from({ length: 12 }, (_, i) => `msg ${i}`);
      for (const texto of textos) {
        expect(
          (await enviar(freelancer, conversaId, texto, parado)).status,
        ).toBe(201);
      }
      const { mensagens } = await ler(empregador, conversaId, '', parado);
      expect(mensagens.map((m) => m.texto)).toEqual(textos);
    } finally {
      await parado.fechar();
    }
  });

  it('texto: espaços nas pontas são removidos; vazio, só espaços, nulo, número e objeto são 400; 2000 passa e 2001 não; emoji conta como 1', async () => {
    const { empregador, freelancer } = await parComVinculo();
    const { conversaId } = (await abrir(freelancer, empregador.contaId))
      .corpo as {
      conversaId: string;
    };

    expect((await enviar(freelancer, conversaId, '  oi  ')).status).toBe(201);
    expect((await ler(freelancer, conversaId)).mensagens[0]?.texto).toBe('oi');

    for (const texto of ['', '   ', '\n\t', null, 5, {}, [], false]) {
      const r = await enviar(freelancer, conversaId, texto);
      expect(r.status, JSON.stringify(texto)).toBe(400);
    }
    expect(
      (await enviar(freelancer, conversaId, 'a'.repeat(2000))).status,
    ).toBe(201);
    expect(
      (await enviar(freelancer, conversaId, '😀'.repeat(2000))).status,
    ).toBe(201);
    const longa = await enviar(freelancer, conversaId, 'a'.repeat(2001));
    expect(longa.status).toBe(400);
    expect(longa.corpo).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'texto', motivo: 'tamanho' }],
    });
    // Nenhuma recusa gravou mensagem: 3 válidas (oi, 2000 a, 2000 emojis).
    expect((await ler(freelancer, conversaId)).mensagens).toHaveLength(3);
  });

  it('o texto volta intacto: acentos, emoji, quebra de linha, aspas, HTML e barra invertida', async () => {
    const { empregador, freelancer } = await parComVinculo();
    const { conversaId } = (await abrir(freelancer, empregador.contaId))
      .corpo as {
      conversaId: string;
    };
    const textos = [
      'Olá, até às 8h! 😀',
      'linha 1\nlinha 2',
      'aspas \' e " e \\ barra',
      '<script>alert(1)</script> & <b>negrito</b>',
      "'; drop table mensagens; --",
    ];
    for (const t of textos) {
      expect((await enviar(freelancer, conversaId, t)).status).toBe(201);
    }
    const { mensagens } = await ler(empregador, conversaId);
    expect(mensagens.map((m) => m.texto)).toEqual(textos);
  });

  it('paginação: a primeira página traz 50 e depoisDe devolve só as seguintes, sem repetir', async () => {
    const { empregador, freelancer } = await parComVinculo();
    const { conversaId } = (await abrir(freelancer, empregador.contaId))
      .corpo as {
      conversaId: string;
    };
    const textos = Array.from(
      { length: 55 },
      (_, i) => `m${String(i).padStart(2, '0')}`,
    );
    for (const t of textos) {
      await enviar(freelancer, conversaId, t);
    }
    const p1 = await ler(empregador, conversaId);
    expect(p1.mensagens).toHaveLength(50);
    const ultimo = p1.mensagens[49];
    const p2 = await ler(empregador, conversaId, `?depoisDe=${ultimo?.id}`);
    expect(p2.mensagens.map((m) => m.texto)).toEqual(textos.slice(50));
    const p3 = await ler(
      empregador,
      conversaId,
      `?depoisDe=${p2.mensagens[4]?.id}`,
    );
    expect(p3.mensagens).toEqual([]);
  });

  it('id da conversa em maiúsculas na URL acha a mesma conversa para ler e escrever', async () => {
    const { empregador, freelancer } = await parComVinculo();
    const { conversaId } = (await abrir(freelancer, empregador.contaId))
      .corpo as {
      conversaId: string;
    };
    const maiusculo = conversaId.toUpperCase();
    expect((await enviar(freelancer, maiusculo, 'oi')).status).toBe(201);
    const lidas = await ler(empregador, maiusculo);
    expect(lidas.status).toBe(200);
    expect(lidas.mensagens.map((m) => m.texto)).toEqual(['oi']);
  });

  it('depoisDe de outra conversa, inexistente ou fora do formato: 400, sem vazar a outra conversa', async () => {
    const um = await parComVinculo();
    const dois = await parComVinculo();
    const c1 = (
      (await abrir(um.freelancer, um.empregador.contaId)).corpo as {
        conversaId: string;
      }
    ).conversaId;
    const c2 = (
      (await abrir(dois.freelancer, dois.empregador.contaId)).corpo as {
        conversaId: string;
      }
    ).conversaId;
    const alheia = await enviar(
      dois.freelancer,
      c2,
      'SEGREDO-DA-OUTRA-CONVERSA',
    );
    const idAlheio = (alheia.corpo as { id: string }).id;
    await enviar(um.freelancer, c1, 'da minha');

    for (const depoisDe of [
      idAlheio,
      idAlheio.toUpperCase(),
      '00000000-0000-4000-8000-000000000000',
      'xyz',
    ]) {
      const r = await ler(um.empregador, c1, `?depoisDe=${depoisDe}`);
      expect(r.status, depoisDe).toBe(400);
      expect(r.texto).not.toContain('SEGREDO');
    }
    // Em branco vale como "sem cursor".
    expect((await ler(um.empregador, c1, '?depoisDe=')).mensagens).toHaveLength(
      1,
    );
    // Parâmetro desconhecido na query é recusado.
    expect((await ler(um.empregador, c1, '?outro=1')).status).toBe(400);
  });

  it('terceiro, mesmo conhecendo o id da conversa, não lê, não escreve e recebe o mesmo 404 de conversa inexistente', async () => {
    const { empregador, freelancer } = await parComVinculo();
    const terceiro = await criarUsuario(app);
    const { conversaId } = (await abrir(freelancer, empregador.contaId))
      .corpo as {
      conversaId: string;
    };
    await enviar(freelancer, conversaId, 'privado');

    const inexistente = '00000000-0000-4000-8000-000000000000';
    const leitura = await ler(terceiro, conversaId);
    const leituraFantasma = await ler(terceiro, inexistente);
    expect(leitura.status).toBe(404);
    expect(leitura.texto).toBe(leituraFantasma.texto);
    expect(leitura.texto).not.toContain('privado');
    expect((await enviar(terceiro, conversaId, 'intruso')).status).toBe(404);
    expect((await enviar(terceiro, 'nao-e-uuid', 'x')).status).toBe(404);
    // E nada do intruso foi gravado.
    expect(
      (await ler(freelancer, conversaId)).mensagens.map((m) => m.texto),
    ).toEqual(['privado']);
    expect(
      (await pedir(app, 'GET', '/conversas', { token: terceiro.token })).corpo,
    ).toEqual([]);
  });

  it('GET /conversas traz a última mensagem e ordena pela atividade mais recente', async () => {
    const empregador = await criarUsuario(app);
    const f1 = await criarUsuario(app);
    const f2 = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, empregador);
    await candidatar(app, f1, trampoId);
    await candidatar(app, f2, trampoId);
    const c1 = (
      (await abrir(empregador, f1.contaId)).corpo as { conversaId: string }
    ).conversaId;
    const c2 = (
      (await abrir(empregador, f2.contaId)).corpo as { conversaId: string }
    ).conversaId;
    await enviar(f1, c1, 'primeira');
    await new Promise((r) => setTimeout(r, 5));
    await enviar(f2, c2, 'segunda');
    await new Promise((r) => setTimeout(r, 5));
    await enviar(empregador, c1, 'terceira');

    const lista = await pedir(app, 'GET', '/conversas', {
      token: empregador.token,
    });
    const itens = lista.corpo as {
      conversaId: string;
      outroUsuarioId: string;
      ultimaMensagem: { texto: string } | null;
    }[];
    expect(itens.map((i) => i.conversaId)).toEqual([c1, c2]);
    expect(itens.map((i) => i.ultimaMensagem?.texto)).toEqual([
      'terceira',
      'segunda',
    ]);
    expect(itens.map((i) => i.outroUsuarioId)).toEqual([
      f1.contaId,
      f2.contaId,
    ]);
  });
});
