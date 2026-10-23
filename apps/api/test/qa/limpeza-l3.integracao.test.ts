/**
 * QA da L3 — limpeza periódica e lápide (CA46, CA47, ADR-007): todos os tipos
 * de órfão, a conta recadastrada com o mesmo e-mail, a lápide repetida, o
 * teto de 100 por rodada, rodadas simultâneas (réplicas) e a limpeza contra
 * escritas em voo que ainda seguram a trava da conta.
 *
 * Contas gravadas direto no banco com hash barato (`apoio-l1.ts`); o órfão é
 * gravado direto no banco com o id da conta já excluída.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  travarContaComExclusividade,
  travarContasEmModoCompartilhado,
} from '../../src/compartilhado/banco/travas-de-conta.js';
import { RelogioFixo } from '../../src/compartilhado/dominio/relogio.js';
import type { Aplicacao } from '../../src/composicao.js';
import { bancoDeTeste } from '../banco-teste.js';
import { montar, pedir } from './apoio.js';
import {
  abrirOutraSessao,
  criarUsuarioComSenha,
  criarUsuarioComSenhaSemPerfil,
  esperar,
  excluir,
} from './apoio-l1.js';
import {
  candidaturaDireta,
  contar,
  conversaDireta,
  gravarLapide,
  lapides,
  limparBancoL3,
  MINUTO,
  mensagemDireta,
  perfilDireto,
  restosDa,
  SEM_RESTOS,
  servicoDireto,
  trampoDireto,
} from './apoio-l3.js';

let aplicacao: Aplicacao | undefined;
let relogio: RelogioFixo;

beforeEach(async () => {
  await limparBancoL3();
  relogio = new RelogioFixo(new Date());
  aplicacao = await montar({ relogio });
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

describe('CA47 — a limpeza apaga todo tipo de órfão e só o da conta excluída', () => {
  it('Dada a conta excluída com trampo, serviço, perfil, candidatura (nos dois sentidos) e conversa com mensagens dos dois lados gravados depois, então a limpeza de 10 min apaga tudo isso e preserva o resto da outra conta', async () => {
    const x = await criarUsuarioComSenha(app());
    const b = await criarUsuarioComSenha(app());
    const c = await criarUsuarioComSenha(app());
    const trampoDeB = await trampoDireto(b.contaId, 'Trampo da B');
    const conversaBC = await conversaDireta(b.contaId, c.contaId);
    await mensagemDireta(conversaBC, b.contaId, 'B para C');
    await mensagemDireta(conversaBC, c.contaId, 'C para B');

    expect((await excluir(app(), x, x.senha)).status).toBe(204);
    expect(await restosDa(x.contaId)).toEqual(SEM_RESTOS);
    expect(await lapides()).toHaveLength(1);

    // Escrita em voo: tudo chegou depois da exclusão, com o id da conta.
    const trampoOrfao = await trampoDireto(x.contaId, 'Trampo órfão');
    await candidaturaDireta(trampoOrfao, b.contaId); // de B no trampo da X
    await candidaturaDireta(trampoDeB, x.contaId); // da X no trampo de B
    await servicoDireto(x.contaId);
    await perfilDireto(x.contaId);
    const conversaXB = await conversaDireta(x.contaId, b.contaId);
    await mensagemDireta(conversaXB, x.contaId, 'Da X, órfã');
    await mensagemDireta(conversaXB, b.contaId, 'Da B, na conversa órfã');

    expect(await restosDa(x.contaId)).toEqual({
      contas: 0,
      sessoes: 0,
      perfis: 1,
      trampos: 1,
      servicos: 1,
      candidaturas: 2,
      conversas: 1,
      mensagens: 2,
    });

    relogio.avancar(10 * MINUTO - 1);
    expect(await app().limparRegistrosVencidos()).toEqual({
      sessoes: 0,
      contasRevarridas: 0,
    });
    expect((await restosDa(x.contaId)).trampos).toBe(1);

    relogio.avancar(1);
    expect(await app().limparRegistrosVencidos()).toEqual({
      sessoes: 0,
      contasRevarridas: 1,
    });
    expect(await restosDa(x.contaId)).toEqual(SEM_RESTOS);
    expect(await lapides()).toEqual([]);

    // O que é da B e da C continua: perfil, sessão, trampo e a conversa B-C.
    const restosB = await restosDa(b.contaId);
    expect(restosB).toMatchObject({
      contas: 1,
      sessoes: 1,
      perfis: 1,
      trampos: 1,
      candidaturas: 0,
      conversas: 1,
      mensagens: 2,
    });
    expect(await contar('mensagens')).toBe(2);
    const doTrampo = await pedir(app(), 'GET', `/trampos/${trampoDeB}`, {
      token: b.token,
    });
    expect(doTrampo.status, doTrampo.texto).toBe(200);
  });
});

describe('ADR-007 — lápide e exclusão repetidas', () => {
  it('Dados dois pedidos de exclusão simultâneos da mesma conta (duas sessões), então fica uma lápide só, com a data do primeiro, e a limpeza a esquece uma vez', async () => {
    const x = await criarUsuarioComSenha(app());
    const outraSessao = await abrirOutraSessao(x.contaId);

    const respostas = await Promise.all([
      pedir(app(), 'POST', '/contas/eu/exclusao', {
        token: x.token,
        corpo: { senha: x.senha },
      }),
      pedir(app(), 'POST', '/contas/eu/exclusao', {
        token: outraSessao,
        corpo: { senha: x.senha },
      }),
    ]);

    // Quem chega depois da exclusão já encontra a sessão apagada (401) ou a
    // conta sumida (404); nenhum dos dois é 5xx.
    for (const resposta of respostas) {
      expect([204, 401, 404], resposta.texto).toContain(resposta.status);
    }
    expect(respostas.some((r) => r.status === 204)).toBe(true);
    const gravadas = await lapides();
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]?.id).toBe(x.contaId);

    relogio.avancar(10 * MINUTO);
    expect(await app().limparRegistrosVencidos()).toEqual({
      sessoes: 0,
      contasRevarridas: 1,
    });
    // Segunda rodada: nada a refazer.
    expect(await app().limparRegistrosVencidos()).toEqual({
      sessoes: 0,
      contasRevarridas: 0,
    });
    expect(await lapides()).toEqual([]);
  });

  it('Dada a mesma conta excluída de novo com o token velho depois da primeira exclusão, então 401 e a lápide original (data e id) não muda', async () => {
    const x = await criarUsuarioComSenha(app());
    expect((await excluir(app(), x, x.senha)).status).toBe(204);
    const antes = await lapides();

    relogio.avancar(5 * MINUTO);
    const segunda = await excluir(app(), x, x.senha);

    expect(segunda.status).toBe(401);
    expect(await lapides()).toEqual(antes);
  });

  it('Dada a limpeza que refaz a exclusão de uma lápide sem dado nenhum, então só esquece a lápide e não lança nem apaga nada de outra conta', async () => {
    const outra = await criarUsuarioComSenha(app());
    await gravarLapide(
      randomUUID(),
      new Date(relogio.agora().getTime() - 11 * MINUTO),
    );

    expect(await app().limparRegistrosVencidos()).toEqual({
      sessoes: 0,
      contasRevarridas: 1,
    });

    expect(await lapides()).toEqual([]);
    expect(await restosDa(outra.contaId)).toMatchObject({
      contas: 1,
      sessoes: 1,
      perfis: 1,
    });
  });

  it('Dada a conta excluída e o mesmo e-mail recadastrado (id novo), então a limpeza da lápide velha não toca na conta nova', async () => {
    const velha = await criarUsuarioComSenha(app());
    expect((await excluir(app(), velha, velha.senha)).status).toBe(204);

    const nova = await criarUsuarioComSenhaSemPerfil(
      'outra-senha-l3-456',
      velha.email,
    );
    const salvo = await pedir(app(), 'PUT', '/perfis/eu', {
      token: nova.token,
      corpo: { nome: 'Nova dona', cidade: 'Lavras', habilidades: ['pintura'] },
    });
    expect(salvo.status, salvo.texto).toBe(200);
    const trampoDaNova = await trampoDireto(nova.contaId, 'Trampo da nova');
    expect(nova.contaId).not.toBe(velha.contaId);

    relogio.avancar(10 * MINUTO);
    expect(await app().limparRegistrosVencidos()).toEqual({
      sessoes: 0,
      contasRevarridas: 1,
    });

    expect(await restosDa(nova.contaId)).toMatchObject({
      contas: 1,
      sessoes: 1,
      perfis: 1,
      trampos: 1,
    });
    const doTrampo = await pedir(app(), 'GET', `/trampos/${trampoDaNova}`, {
      token: nova.token,
    });
    expect(doTrampo.status, doTrampo.texto).toBe(200);
  });
});

describe('CA47 — limites da rodada e rodadas simultâneas', () => {
  it('Dadas 250 lápides vencidas, então cada rodada revarre no máximo 100 e três rodadas esvaziam a tabela', async () => {
    const antiga = new Date(relogio.agora().getTime() - 30 * MINUTO);
    await sql`insert into contas_excluidas (id, excluida_em)
      select gen_random_uuid(), ${antiga.toISOString()}::timestamptz
      from generate_series(1, 250)`.execute(bancoDeTeste());

    const rodadas = [];
    for (let i = 0; i < 4; i += 1) {
      rodadas.push((await app().limparRegistrosVencidos()).contasRevarridas);
    }

    expect(rodadas).toEqual([100, 100, 50, 0]);
    expect(await contar('contas_excluidas')).toBe(0);
  });

  it('Dadas lápides com a mais nova em 9 min e 59 s, então só as de 10 min ou mais saem, em ordem da mais antiga', async () => {
    const agora = relogio.agora().getTime();
    const velha = randomUUID();
    const limite = randomUUID();
    const nova = randomUUID();
    await gravarLapide(velha, new Date(agora - 60 * MINUTO));
    await gravarLapide(limite, new Date(agora - 10 * MINUTO));
    await gravarLapide(nova, new Date(agora - 10 * MINUTO + 1000));

    expect((await app().limparRegistrosVencidos()).contasRevarridas).toBe(2);

    expect((await lapides()).map((l) => l.id)).toEqual([nova]);
  });

  it('Dadas 150 lápides com órfãos e 3 rodadas simultâneas (réplicas), então nenhuma falha, tudo some e nenhuma lápide fica', async () => {
    const donas = Array.from({ length: 150 }, () => randomUUID());
    const antiga = new Date(relogio.agora().getTime() - 30 * MINUTO);
    for (const id of donas) {
      await gravarLapide(id, antiga);
    }
    const b = await criarUsuarioComSenha(app());
    for (const id of donas.slice(0, 40)) {
      await trampoDireto(id);
      await servicoDireto(id);
      const conversa = await conversaDireta(id, b.contaId);
      await mensagemDireta(conversa, id, 'órfã');
      await mensagemDireta(conversa, b.contaId, 'da B na conversa órfã');
    }

    const resultados = await Promise.allSettled([
      app().limparRegistrosVencidos(),
      app().limparRegistrosVencidos(),
      app().limparRegistrosVencidos(),
    ]);
    // Cada rodada pega até 100; as simultâneas pegam as mesmas e a sobra fica
    // para a seguinte. Uma rodada a mais fecha o que faltar.
    const falhas = resultados.filter((r) => r.status === 'rejected');
    expect(falhas).toEqual([]);
    await app().limparRegistrosVencidos();
    await app().limparRegistrosVencidos();

    expect(await contar('contas_excluidas')).toBe(0);
    expect(await contar('trampos')).toBe(0);
    expect(await contar('servicos')).toBe(0);
    expect(await contar('conversas')).toBe(0);
    expect(await contar('mensagens')).toBe(0);
    expect(await restosDa(b.contaId)).toMatchObject({ contas: 1, sessoes: 1 });
  });

  it('Dada a limpeza de uma lápide enquanto a outra conta da conversa órfã se exclui, então as duas terminam sem erro nem deadlock e nada fica', async () => {
    const x = randomUUID();
    const b = await criarUsuarioComSenha(app());
    await gravarLapide(x, new Date(relogio.agora().getTime() - 30 * MINUTO));
    const conversa = await conversaDireta(x, b.contaId);
    await mensagemDireta(conversa, x, 'órfã da X');
    await mensagemDireta(conversa, b.contaId, 'da B');

    const [limpeza, exclusao] = await Promise.allSettled([
      app().limparRegistrosVencidos(),
      excluir(app(), b, b.senha),
    ]);

    expect(limpeza.status).toBe('fulfilled');
    expect(exclusao.status).toBe('fulfilled');
    if (exclusao.status === 'fulfilled') {
      expect(exclusao.value.status, exclusao.value.texto).toBe(204);
    }
    expect(await contar('conversas')).toBe(0);
    expect(await contar('mensagens')).toBe(0);
    expect(await restosDa(b.contaId)).toEqual(SEM_RESTOS);
    // Cada exclusão deixa a sua lápide; a da B nasce na hora e só sai em 10 min.
    expect((await lapides()).map((l) => l.id)).toEqual([b.contaId]);
  });
});

describe('CA47 — a limpeza respeita quem ainda segura a trava da conta', () => {
  it('Dada uma escrita em voo (trava compartilhada) com a conversa ainda não confirmada, então a limpeza espera o commit e depois apaga a conversa que acabou de entrar', async () => {
    const x = randomUUID();
    const b = await criarUsuarioComSenha(app());
    await gravarLapide(x, new Date(relogio.agora().getTime() - 30 * MINUTO));
    const db = bancoDeTeste();

    let limpezaTerminou = false;
    let limpeza: Promise<unknown> = Promise.resolve();
    await db.transaction().execute(async (trx) => {
      await travarContasEmModoCompartilhado(trx, [x, b.contaId]);
      const conversa = randomUUID();
      const [a, c] = [x, b.contaId].sort();
      await sql`insert into conversas (id, usuario_a_id, usuario_b_id, criada_em)
        values (${conversa}::uuid, ${a}::uuid, ${c}::uuid, now())`.execute(trx);
      await sql`insert into mensagens (id, conversa_id, autor_id, texto, enviada_em)
        values (gen_random_uuid(), ${conversa}::uuid, ${x}::uuid, 'em voo', now())`.execute(
        trx,
      );

      limpeza = app()
        .limparRegistrosVencidos()
        .finally(() => {
          limpezaTerminou = true;
        });
      await esperar(400);
      // A limpeza não passa por cima de quem segura a trava compartilhada.
      expect(limpezaTerminou).toBe(false);
      expect(await contar('conversas')).toBe(0); // invisível a quem está fora
    });

    await expect(limpeza).resolves.toEqual({ sessoes: 0, contasRevarridas: 1 });
    expect(await contar('conversas')).toBe(0);
    expect(await contar('mensagens')).toBe(0);
    expect(await lapides()).toEqual([]);
  });

  it('Dada uma exclusão em andamento da própria lápide (trava exclusiva), então a limpeza espera e, passada a espera, apaga o que a transação gravou antes de confirmar', async () => {
    const x = randomUUID();
    await gravarLapide(x, new Date(relogio.agora().getTime() - 30 * MINUTO));
    const db = bancoDeTeste();

    let limpezaTerminou = false;
    let limpeza: Promise<unknown> = Promise.resolve();
    await db.transaction().execute(async (trx) => {
      await travarContaComExclusividade(trx, x);
      await sql`insert into servicos (id, autor_id, titulo, descricao, categoria,
          texto_busca, preco_base_centavos, status, criado_em)
        values (gen_random_uuid(), ${x}::uuid, 'Em voo', 'd', 'reformas',
          'busca', 5000, 'ativo', now())`.execute(trx);
      limpeza = app()
        .limparRegistrosVencidos()
        .finally(() => {
          limpezaTerminou = true;
        });
      await esperar(400);
      expect(limpezaTerminou).toBe(false);
    });

    await expect(limpeza).resolves.toEqual({ sessoes: 0, contasRevarridas: 1 });
    expect(await contar('servicos')).toBe(0);
    expect(await lapides()).toEqual([]);
  });
});

describe('CA46 — sessões expiradas', () => {
  it('Dadas sessões expiradas de duas contas e uma válida de cada, então a limpeza apaga só as expiradas e a conta continua entrando com a sessão válida', async () => {
    const a = await criarUsuarioComSenha(app());
    const b = await criarUsuarioComSenha(app());
    const agora = relogio.agora();
    const hashes = ['a1', 'a2', 'b1'].map((p) => `${p}${'0'.repeat(62)}`);
    const donos = [a.contaId, a.contaId, b.contaId];
    for (let i = 0; i < hashes.length; i += 1) {
      await sql`insert into sessoes (token_hash, conta_id, expira_em)
        values (${hashes[i]}, ${donos[i]}::uuid,
          ${new Date(agora.getTime() - (i + 1) * MINUTO).toISOString()}::timestamptz)`.execute(
        bancoDeTeste(),
      );
    }
    expect(await contar('sessoes')).toBe(5);

    expect(await app().limparRegistrosVencidos()).toEqual({
      sessoes: 3,
      contasRevarridas: 0,
    });

    expect(await contar('sessoes')).toBe(2);
    for (const usuario of [a, b]) {
      const perfil = await pedir(app(), 'GET', '/perfis/eu', {
        token: usuario.token,
      });
      expect(perfil.status, perfil.texto).toBe(200);
    }
  });

  it('Dada a sessão que expira exatamente agora, então a limpeza e a validação concordam: ela já não vale e é apagada', async () => {
    const a = await criarUsuarioComSenha(app());
    const agora = relogio.agora();
    const hash = `${'f'.repeat(64)}`;
    await sql`insert into sessoes (token_hash, conta_id, expira_em)
      values (${hash}, ${a.contaId}::uuid, ${agora.toISOString()}::timestamptz)`.execute(
      bancoDeTeste(),
    );

    expect((await app().limparRegistrosVencidos()).sessoes).toBe(1);
    expect(await contar('sessoes')).toBe(1);
  });
});
