import { randomUUID } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { DatabaseError } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { down } from '../../../../../migracoes/0005_conversas.js';
import {
  bancoDeTeste,
  truncarTabelas,
} from '../../../../../test/banco-teste.js';
import { ErroTabelaNaoVazia } from '../../../../compartilhado/banco/migrador.js';
import { travarContaComExclusividade } from '../../../../compartilhado/banco/travas-de-conta.js';
import { ErroNaoEncontrado } from '../../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarCasosDeUsoDeConversas } from '../../aplicacao/casos-de-uso.js';
import { Conversa } from '../../dominio/conversa.js';
import { criarMensagem, type Mensagem } from '../../dominio/mensagem.js';
import type { ConferirVinculo } from '../../dominio/portas.js';
import {
  criarModuloDeConversas,
  type ParteDeConversasNaExportacao,
} from '../../index.js';
import { VerificadorDeVinculoEmMemoria } from '../memoria/verificador-vinculo-memoria.js';
import {
  excluirDadosDaConta,
  RepositorioDeConversasPostgres,
} from './repositorio-postgres.js';
import type { TabelasDeConversas } from './tabelas.js';

// Ids ordenáveis à mão: A < B < C.
const A = '10000000-0000-4000-8000-00000000000a';
const B = '20000000-0000-4000-8000-00000000000b';
const C = '30000000-0000-4000-8000-00000000000c';
const INICIO = new Date('2026-10-20T12:00:00.000Z');

/** Id previsível e ordenável: `…0001`, `…0002`… */
function idDe(numero: number): string {
  return `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`;
}

function minutos(n: number): Date {
  return new Date(INICIO.getTime() + n * 60_000);
}

const db = () => bancoDeTeste<TabelasDeConversas>();
let repositorio: RepositorioDeConversasPostgres;

/** Conferência do vínculo que sempre confirma (testes que não são sobre ela). */
const COM_VINCULO: ConferirVinculo = async () => true;

async function rejeicao(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava uma rejeição');
}

async function abrir(
  usuario1: string,
  usuario2: string,
  quando = INICIO,
): Promise<Conversa> {
  const conversa = Conversa.criar(usuario1, usuario2, {
    id: randomUUID(),
    agora: quando,
  });
  expect(await repositorio.inserirConversa(conversa, COM_VINCULO)).toBe(
    'inserida',
  );
  return conversa;
}

async function escrever(
  conversa: Conversa,
  autorId: string,
  texto: string,
  quando: Date,
  id: string = randomUUID(),
): Promise<Mensagem> {
  const mensagem = criarMensagem(texto, {
    id,
    conversaId: conversa.id,
    autorId,
    agora: quando,
  });
  await repositorio.salvarMensagem(mensagem);
  return mensagem;
}

beforeEach(async () => {
  await truncarTabelas(['mensagens', 'conversas']);
  repositorio = new RepositorioDeConversasPostgres(db());
});

describe('migração 0005 — restrições', () => {
  async function inserirCru(a: string, b: string) {
    await sql`insert into conversas (id, usuario_a_id, usuario_b_id, criada_em)
      values (${randomUUID()}, ${a}, ${b}, now())`.execute(db());
  }

  it('check: usuario_a_id tem de ser menor que usuario_b_id (e diferente)', async () => {
    expect(await rejeicao(inserirCru(B, A))).toMatchObject({
      code: '23514',
      constraint: 'conversas_par_ordenado',
    });
    expect(await rejeicao(inserirCru(A, A))).toMatchObject({
      code: '23514',
      constraint: 'conversas_par_ordenado',
    });
  });

  it('unique: o mesmo par não tem duas conversas', async () => {
    await inserirCru(A, B);
    expect(await rejeicao(inserirCru(A, B))).toMatchObject({
      code: '23505',
      constraint: 'conversas_par_unico',
    });
  });

  it('FK: mensagem só em conversa existente; check do tamanho do texto', async () => {
    const conversa = await abrir(A, B);
    const inserir = (conversaId: string, texto: string) =>
      sql`insert into mensagens (id, conversa_id, autor_id, texto, enviada_em)
        values (${randomUUID()}, ${conversaId}, ${A}, ${texto}, now())`.execute(
        db(),
      );

    expect(await rejeicao(inserir(randomUUID(), 'oi'))).toMatchObject({
      code: '23503',
    });
    expect(await rejeicao(inserir(conversa.id, ''))).toMatchObject({
      code: '23514',
      constraint: 'mensagens_texto_tamanho',
    });
    expect(
      await rejeicao(inserir(conversa.id, 'a'.repeat(2001))),
    ).toMatchObject({ code: '23514', constraint: 'mensagens_texto_tamanho' });
    // 2000 emojis: 2000 pontos de código, como conta o domínio.
    await inserir(conversa.id, '😀'.repeat(2000));
  });

  it('o down recusa remover tabela com linhas e remove as vazias (mensagens antes de conversas)', async () => {
    const conversa = await abrir(A, B);
    await escrever(conversa, A, 'oi', INICIO);
    const desfazer = new Error('desfazer');
    const base = bancoDeTeste<unknown>();

    // Cada `down` roda numa transação que termina desfeita: as tabelas ficam.
    const comLinhas = await rejeicao(
      base.transaction().execute(async (trx) => {
        await down(trx);
      }),
    );
    expect(comLinhas).toBeInstanceOf(ErroTabelaNaoVazia);
    expect(await repositorio.buscarConversaPorId(conversa.id)).not.toBeNull();

    // Só `mensagens` vazia: o down remove `mensagens` e para em `conversas`.
    await truncarTabelas(['mensagens']);
    const soConversas = await rejeicao(
      base.transaction().execute(async (trx) => {
        await down(trx);
      }),
    );
    expect(soConversas).toBeInstanceOf(ErroTabelaNaoVazia);
    expect((soConversas as Error).message).toContain('conversas');

    await truncarTabelas(['mensagens', 'conversas']);
    const vazias = await rejeicao(
      base.transaction().execute(async (trx) => {
        await down(trx);
        const { rows } = await sql<{
          conversas: string | null;
          mensagens: string | null;
        }>`select to_regclass('conversas')::text as conversas,
            to_regclass('mensagens')::text as mensagens`.execute(trx);
        expect(rows[0]).toEqual({ conversas: null, mensagens: null });
        throw desfazer;
      }),
    );
    expect(vazias).toBe(desfazer);
    expect(await repositorio.listarConversasDoUsuario(A)).toEqual([]);
  });
});

describe('conversas', () => {
  it('insere e lê de volta pelo id e pelo par, em qualquer ordem', async () => {
    const conversa = await abrir(B, A);

    expect(
      (await repositorio.buscarConversaPorId(conversa.id))?.dados(),
    ).toEqual(conversa.dados());
    expect((await repositorio.buscarConversaDoPar(A, B))?.id).toBe(conversa.id);
    expect((await repositorio.buscarConversaDoPar(B, A))?.id).toBe(conversa.id);
    expect(
      (await repositorio.buscarConversaDoPar(B.toUpperCase(), A))?.id,
    ).toBe(conversa.id);
    expect(await repositorio.buscarConversaDoPar(A, C)).toBeNull();
  });

  it('ids fora do formato uuid ou par consigo mesmo → null/[] sem ir ao banco com erro', async () => {
    await abrir(A, B);

    expect(await repositorio.buscarConversaPorId('nao-existe')).toBeNull();
    expect(await repositorio.buscarConversaDoPar('x', A)).toBeNull();
    expect(await repositorio.buscarConversaDoPar(A, A)).toBeNull();
    expect(await repositorio.listarConversasDoUsuario('x')).toEqual([]);
    expect(await repositorio.buscarMensagemDaConversa('x', 'y')).toBeNull();
    expect(await repositorio.listarMensagens('x', { limite: 50 })).toEqual([]);
  });

  it('o mesmo par inserido de novo devolve par_ja_existe, sem lançar', async () => {
    const primeira = await abrir(A, B);
    const repetida = Conversa.criar(B, A, { id: randomUUID(), agora: INICIO });

    expect(await repositorio.inserirConversa(repetida, COM_VINCULO)).toBe(
      'par_ja_existe',
    );
    expect((await repositorio.buscarConversaDoPar(A, B))?.id).toBe(primeira.id);
  });

  it('corrida: duas inserções simultâneas do mesmo par → uma inserida, uma par_ja_existe', async () => {
    const resultados = await Promise.allSettled([
      repositorio.inserirConversa(
        Conversa.criar(A, B, { id: randomUUID(), agora: INICIO }),
        COM_VINCULO,
      ),
      repositorio.inserirConversa(
        Conversa.criar(B, A, { id: randomUUID(), agora: INICIO }),
        COM_VINCULO,
      ),
    ]);

    expect(resultados.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(
      resultados
        .map((r) => (r.status === 'fulfilled' ? r.value : r.reason))
        .sort(),
    ).toEqual(['inserida', 'par_ja_existe']);
    const { rows } = await sql<{
      n: string;
    }>`select count(*)::text as n from conversas`.execute(db());
    expect(rows[0]?.n).toBe('1');
  });

  it('CA12 — corrida pelo caso de uso: duas aberturas simultâneas devolvem a mesma conversa', async () => {
    const casos = criarCasosDeUsoDeConversas({
      repositorio,
      verificadorDeVinculo: new VerificadorDeVinculoEmMemoria([[A, B]]),
      relogio: new RelogioFixo(INICIO),
    });

    const resultados = await Promise.allSettled([
      casos.abrirConversa(A, B),
      casos.abrirConversa(B, A),
      casos.abrirConversa(A, B),
    ]);

    const valores = resultados.map((r) => {
      if (r.status !== 'fulfilled') {
        throw r.reason;
      }
      return r.value;
    });
    expect(new Set(valores.map((v) => v.conversaId)).size).toBe(1);
    expect(valores.filter((v) => v.nova)).toHaveLength(1);
  });
});

describe('listarConversasDoUsuario', () => {
  it('CA12 — pela última atividade desc, com a última mensagem; sem mensagem, pela criação', async () => {
    const ab = await abrir(A, B, minutos(0));
    const ac = await abrir(C, A, minutos(1));
    const bc = await abrir(B, C, minutos(2));

    // Sem mensagens: a criada por último primeiro.
    expect(
      (await repositorio.listarConversasDoUsuario(A)).map((i) => i.conversa.id),
    ).toEqual([ac.id, ab.id]);

    await escrever(ab, B, 'primeira', minutos(3));
    await escrever(ab, A, 'última de ab', minutos(4));

    const deA = await repositorio.listarConversasDoUsuario(A);
    expect(deA.map((i) => [i.conversa.id, i.ultimaMensagem])).toEqual([
      [ab.id, { texto: 'última de ab', enviadaEm: minutos(4) }],
      [ac.id, null],
    ]);
    expect(deA[0]?.conversa.dados()).toEqual(ab.dados());

    const deC = await repositorio.listarConversasDoUsuario(C);
    expect(deC.map((i) => i.conversa.id)).toEqual([bc.id, ac.id]);
    expect(await repositorio.listarConversasDoUsuario(randomUUID())).toEqual(
      [],
    );
  });

  it('empate de atividade: desempate por id desc', async () => {
    const menor = Conversa.criar(A, B, { id: idDe(1), agora: INICIO });
    const maior = Conversa.criar(A, C, { id: idDe(2), agora: INICIO });
    await repositorio.inserirConversa(menor, COM_VINCULO);
    await repositorio.inserirConversa(maior, COM_VINCULO);

    expect(
      (await repositorio.listarConversasDoUsuario(A)).map((i) => i.conversa.id),
    ).toEqual([idDe(2), idDe(1)]);
  });
});

describe('mensagens', () => {
  it('CA12 — ordem cronológica (enviada_em asc), desempate pela ordem de gravação (não pelo id), gravadas fora de ordem', async () => {
    const conversa = await abrir(A, B);
    await escrever(conversa, A, 'terceira', minutos(2), idDe(3));
    await escrever(
      conversa,
      B,
      'segunda (gravada antes, id maior)',
      minutos(1),
      idDe(9),
    );
    await escrever(conversa, A, 'primeira', minutos(0), idDe(5));
    await escrever(
      conversa,
      B,
      'segunda (gravada depois, id menor)',
      minutos(1),
      idDe(2),
    );

    const lidas = await repositorio.listarMensagens(conversa.id, {
      limite: 50,
    });
    expect(lidas.map((m) => m.texto)).toEqual([
      'primeira',
      'segunda (gravada antes, id maior)',
      'segunda (gravada depois, id menor)',
      'terceira',
    ]);
    expect(lidas[0]).toEqual({
      id: idDe(5),
      conversaId: conversa.id,
      autorId: A,
      texto: 'primeira',
      enviadaEm: minutos(0),
    });
  });

  it('cursor (enviada_em, ordem) e limite: não pula nem repete no empate de instante, com ids decrescentes', async () => {
    const conversa = await abrir(A, B);
    await escrever(conversa, A, 'm1', minutos(0), idDe(9));
    await escrever(conversa, A, 'm2', minutos(1), idDe(8));
    await escrever(conversa, B, 'm3', minutos(1), idDe(7));
    await escrever(conversa, B, 'm4', minutos(2), idDe(6));

    const pagina1 = await repositorio.listarMensagens(conversa.id, {
      limite: 2,
    });
    expect(pagina1.map((m) => m.texto)).toEqual(['m1', 'm2']);
    const ultima = pagina1.at(-1);
    if (!ultima) {
      throw new Error('página vazia');
    }
    const pagina2 = await repositorio.listarMensagens(conversa.id, {
      limite: 2,
      depoisDe: { enviadaEm: ultima.enviadaEm, id: ultima.id },
    });
    expect(pagina2.map((m) => m.texto)).toEqual(['m3', 'm4']);
  });

  it('CA12 — na lista de conversas, a última mensagem no empate de instante é a última gravada', async () => {
    const conversa = await abrir(A, B);
    await escrever(conversa, A, 'antes', minutos(1), idDe(2));
    await escrever(conversa, B, 'depois', minutos(1), idDe(1));

    const [item] = await repositorio.listarConversasDoUsuario(A);
    expect(item?.ultimaMensagem?.texto).toBe('depois');
  });

  it('buscarMensagemDaConversa só acha a mensagem na conversa dela', async () => {
    const ab = await abrir(A, B);
    const ac = await abrir(A, C);
    const mensagem = await escrever(ab, A, 'oi', INICIO);

    expect(
      await repositorio.buscarMensagemDaConversa(ab.id, mensagem.id),
    ).toEqual(mensagem);
    expect(
      await repositorio.buscarMensagemDaConversa(ac.id, mensagem.id),
    ).toBeNull();
  });

  it('listagem de uma conversa não traz mensagens de outra', async () => {
    const ab = await abrir(A, B);
    const ac = await abrir(A, C);
    await escrever(ab, A, 'para B', INICIO);
    await escrever(ac, A, 'para C', INICIO);

    expect(
      (await repositorio.listarMensagens(ac.id, { limite: 50 })).map(
        (m) => m.texto,
      ),
    ).toEqual(['para C']);
  });
});

describe('salvarMensagem com a conversa apagada (D25)', () => {
  it('CA18 — conversa inexistente: a FK (23503) vira ErroNaoEncontrado, sem o erro do driver', async () => {
    const mensagem = criarMensagem('TEXTO-SENTINELA', {
      id: randomUUID(),
      conversaId: randomUUID(),
      autorId: A,
      agora: INICIO,
    });

    const erro = await rejeicao(repositorio.salvarMensagem(mensagem));

    expect(erro).toBeInstanceOf(ErroNaoEncontrado);
    expect((erro as Error).cause).toBeUndefined();
    expect(JSON.stringify(erro)).not.toContain(mensagem.conversaId);
    expect(String((erro as Error).message)).not.toContain('TEXTO-SENTINELA');
  });

  it('outras recusas do banco não viram 404 (ex.: check do texto)', async () => {
    const conversa = await abrir(A, B);

    const erro = await rejeicao(
      repositorio.salvarMensagem({
        id: randomUUID(),
        conversaId: conversa.id,
        autorId: A,
        texto: '',
        enviadaEm: INICIO,
      }),
    );

    expect(erro).toBeInstanceOf(DatabaseError);
    expect(erro).toMatchObject({ code: '23514' });
  });
});

describe('exclusão e exportação da conta (D25, D26, ADR-005)', () => {
  const verificador = () =>
    new VerificadorDeVinculoEmMemoria([
      [A, B],
      [B, C],
      [A, C],
    ]);
  const modulo = () =>
    criarModuloDeConversas({
      db: db(),
      verificadorDeVinculo: verificador(),
      relogio: new RelogioFixo(INICIO),
    });
  const casos = () =>
    criarCasosDeUsoDeConversas({
      repositorio,
      verificadorDeVinculo: verificador(),
      relogio: new RelogioFixo(minutos(30)),
    });

  type Desfecho = { ok: true; valor: unknown } | { ok: false; erro: unknown };

  /** Resultado de uma promessa sem deixar rejeição solta enquanto se espera. */
  function acompanhar(promessa: Promise<unknown>): Promise<Desfecho> {
    return promessa.then(
      (valor) => ({ ok: true as const, valor }),
      (erro: unknown) => ({ ok: false as const, erro }),
    );
  }

  /** Espera até alguma conexão do banco de teste ficar parada numa trava. */
  async function esperarAlguemNaTrava(): Promise<void> {
    for (let tentativa = 0; tentativa < 120; tentativa += 1) {
      const { rows } = await sql<{ total: number }>`
        select count(*)::int as total from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
      `.execute(db());
      if ((rows[0]?.total ?? 0) > 0) {
        return;
      }
      await new Promise((resolver) => setTimeout(resolver, 25));
    }
    throw new Error('nenhuma consulta ficou esperando a trava');
  }

  /**
   * A transação `trx` com uma pausa logo depois da consulta `for update` da
   * exclusão: ali roda `durante()`, e só então a exclusão segue para os
   * `delete`.
   */
  function pausarDepoisDaTrava<T>(
    trx: Kysely<T>,
    durante: () => Promise<void>,
  ): Kysely<T> {
    let consultaDaPausa: string | undefined;
    return trx.withPlugin({
      transformQuery({ node, queryId }) {
        if (
          consultaDaPausa === undefined &&
          node.kind === 'SelectQueryNode' &&
          JSON.stringify(node).includes('"ForUpdate"')
        ) {
          consultaDaPausa = queryId.queryId;
        }
        return node;
      },
      async transformResult({ queryId, result }) {
        if (queryId.queryId === consultaDaPausa) {
          await durante();
        }
        return result;
      },
    });
  }

  async function linhas() {
    const conversas = await db()
      .selectFrom('conversas')
      .select(['usuario_a_id', 'usuario_b_id'])
      .orderBy('usuario_a_id')
      .orderBy('usuario_b_id')
      .execute();
    const mensagens = await db()
      .selectFrom('mensagens')
      .select(['texto'])
      .orderBy('texto')
      .execute();
    return { conversas, mensagens: mensagens.map((m) => m.texto) };
  }

  /**
   * B (a conta-alvo) conversa com A (B é `usuario_b`) e com C (B é
   * `usuario_a`). A conversa A–C não envolve B.
   */
  async function cenario() {
    const ab = await abrir(A, B, minutos(1));
    const bc = await abrir(B, C, minutos(2));
    const ac = await abrir(A, C, minutos(3));
    const deB1 = await escrever(ab, B, 'B para A, primeira', minutos(4));
    await escrever(ab, A, 'TEXTO-DE-A', minutos(5));
    const deB2 = await escrever(ab, B, 'B para A, segunda', minutos(6));
    await escrever(bc, C, 'TEXTO-DE-C', minutos(7));
    await escrever(ac, A, 'TEXTO-A-PARA-C', minutos(8));
    return { ab, bc, ac, deB1, deB2 };
  }

  const excluir = (contaId: string) =>
    db()
      .transaction()
      .execute((trx) => modulo().excluirDadosDaConta(trx, contaId));

  it('CA17/CA18 — apaga as conversas inteiras de que a conta participa (mensagens dos dois lados); a conversa entre outros fica intacta', async () => {
    await cenario();

    await excluir(B);

    expect(await linhas()).toEqual({
      conversas: [{ usuario_a_id: A, usuario_b_id: C }],
      mensagens: ['TEXTO-A-PARA-C'],
    });
    // Para quem conversava com B: a conversa some da lista.
    expect(
      (await casos().listarConversas(A)).map((c) => c.outroUsuarioId),
    ).toEqual([C]);
    expect(
      (await casos().listarConversas(C)).map((c) => c.outroUsuarioId),
    ).toEqual([A]);
  });

  it('CA18 — com a conversa aberta, depois da exclusão: ler (inclusive com cursor) e escrever dão 404, nunca 400', async () => {
    const { ab, deB1 } = await cenario();
    await excluir(B);

    // Uma de cada vez: promessa criada antes da hora rejeitaria sem dono.
    for (const pedir of [
      () => casos().listarMensagens(A, ab.id),
      () => casos().listarMensagens(A, ab.id, { depoisDe: deB1.id }),
      () => casos().enviarMensagem(A, ab.id, 'ainda está aí?'),
    ]) {
      expect(await rejeicao(pedir())).toBeInstanceOf(ErroNaoEncontrado);
    }
  });

  it('CA18 — Dado a exclusão com a trava das conversas já tomada, quando o outro participante envia mensagem ao mesmo tempo, então ele espera a trava e recebe 404, sem mensagem órfã', async () => {
    const { ab } = await cenario();
    let concorrente: Promise<Desfecho> | undefined;

    await db()
      .transaction()
      .execute((trx) =>
        modulo().excluirDadosDaConta(
          pausarDepoisDaTrava(trx, async () => {
            concorrente = acompanhar(
              casos().enviarMensagem(A, ab.id, 'TEXTO-CONCORRENTE'),
            );
            await esperarAlguemNaTrava();
          }),
          B,
        ),
      );

    const resultado = await concorrente;
    expect(resultado?.ok).toBe(false);
    expect(resultado?.ok === false && resultado.erro).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect((await linhas()).mensagens).toEqual(['TEXTO-A-PARA-C']);
  });

  it('Dado os dois participantes se excluindo ao mesmo tempo, então o segundo espera a trava do primeiro e os dois terminam', async () => {
    await cenario();
    let deA: Promise<Desfecho> | undefined;

    await db()
      .transaction()
      .execute((trx) =>
        modulo().excluirDadosDaConta(
          pausarDepoisDaTrava(trx, async () => {
            deA = acompanhar(excluir(A));
            await esperarAlguemNaTrava();
          }),
          B,
        ),
      );

    expect(await deA).toEqual({ ok: true, valor: undefined });
    expect(await linhas()).toEqual({ conversas: [], mensagens: [] });
  });

  it('não abre transação própria: se a transação da composição desfaz, nada é apagado', async () => {
    await cenario();
    const antes = await linhas();
    class Desfazer extends Error {}

    await expect(
      db()
        .transaction()
        .execute(async (trx) => {
          await excluirDadosDaConta(trx, B);
          throw new Desfazer();
        }),
    ).rejects.toBeInstanceOf(Desfazer);

    expect(await linhas()).toEqual(antes);
  });

  it('recusa conexão fora de transação e contaId fora do formato uuid, sem apagar nada', async () => {
    await cenario();
    const antes = await linhas();

    expect(await rejeicao(excluirDadosDaConta(db(), B))).toBeInstanceOf(
      TypeError,
    );
    for (const invalido of ['', 'nao-e-uuid', "' or 1=1 --"]) {
      const erro = await rejeicao(
        db()
          .transaction()
          .execute((trx) => excluirDadosDaConta(trx, invalido)),
      );
      expect(erro).toBeInstanceOf(TypeError);
    }
    expect(await linhas()).toEqual(antes);
  });

  it('conta sem conversas (ou segundo pedido): resolve sem erro e não mexe em nada', async () => {
    await cenario();
    const antes = await linhas();

    await excluir(randomUUID());

    expect(await linhas()).toEqual(antes);
  });

  it('CA19 — exporta as conversas da conta com o outroUsuarioId e só as mensagens dela, sem texto de terceiros', async () => {
    const { ab, bc, deB1, deB2 } = await cenario();

    const exportado = await modulo().exportarDadosDaConta(B);

    expect(exportado).toEqual({
      conversas: [
        {
          id: ab.id,
          outroUsuarioId: A,
          criadaEm: minutos(1).toISOString(),
          minhasMensagens: [
            {
              id: deB1.id,
              texto: 'B para A, primeira',
              enviadaEm: minutos(4).toISOString(),
            },
            {
              id: deB2.id,
              texto: 'B para A, segunda',
              enviadaEm: minutos(6).toISOString(),
            },
          ],
        },
        {
          id: bc.id,
          outroUsuarioId: C,
          criadaEm: minutos(2).toISOString(),
          minhasMensagens: [],
        },
      ],
    });
    const json = JSON.stringify(exportado);
    for (const deTerceiro of ['TEXTO-DE-A', 'TEXTO-DE-C', 'TEXTO-A-PARA-C']) {
      expect(json).not.toContain(deTerceiro);
    }
    // Id em maiúsculas é a mesma conta (uuid canônico minúsculo no banco).
    expect(await modulo().exportarDadosDaConta(B.toUpperCase())).toEqual(
      exportado,
    );
  });

  /** Inserção de uma conversa nova entre A e B com a conferência dada. */
  const abrirAB = (conferir: ConferirVinculo) =>
    repositorio.inserirConversa(
      Conversa.criar(A, B, { id: randomUUID(), agora: INICIO }),
      conferir,
    );

  it('Q1 — Dado a exclusão de B com a trava exclusiva da conta, quando A abre conversa com B, então a inserção espera o commit, confere o vínculo depois dele e não grava nada (sem_vinculo)', async () => {
    let vinculo = true;
    let abertura: Promise<Desfecho> | undefined;

    await db()
      .transaction()
      .execute(async (trx) => {
        await travarContaComExclusividade(trx, B);
        abertura = acompanhar(abrirAB(async () => vinculo));
        await esperarAlguemNaTrava();
        await modulo().excluirDadosDaConta(trx, B);
        // A exclusão também apaga o vínculo (as candidaturas, em `trampos`).
        vinculo = false;
      });

    expect(await abertura).toEqual({ ok: true, valor: 'sem_vinculo' });
    expect((await linhas()).conversas).toEqual([]);
  });

  it('Q1 — Dado A abrindo conversa com B e já na conferência do vínculo, quando B se exclui, então a exclusão espera o commit da abertura e apaga a conversa nova', async () => {
    let exclusao: Promise<Desfecho> | undefined;

    const resultado = await abrirAB(async () => {
      exclusao = acompanhar(
        db()
          .transaction()
          .execute(async (trx) => {
            await travarContaComExclusividade(trx, B);
            await modulo().excluirDadosDaConta(trx, B);
          }),
      );
      await esperarAlguemNaTrava();
      return true;
    });

    expect(resultado).toBe('inserida');
    expect(await exclusao).toEqual({ ok: true, valor: undefined });
    expect((await linhas()).conversas).toEqual([]);
  });

  it('Q1 — a conferência do vínculo recebe a transação do insert, já com a trava compartilhada das duas contas', async () => {
    const vistas: { transacao: boolean; travas: number }[] = [];

    const resultado = await abrirAB(async (transacao) => {
      const trx = transacao as Kysely<TabelasDeConversas>;
      // Na mesma conexão: as travas são do próprio processo do backend.
      const { rows } = await sql<{ n: number }>`
        select count(*)::int as n from pg_locks
        where locktype = 'advisory' and mode = 'ShareLock' and granted
          and pid = pg_backend_pid()
      `.execute(trx);
      vistas.push({ transacao: trx.isTransaction, travas: rows[0]?.n ?? -1 });
      return true;
    });

    expect(resultado).toBe('inserida');
    expect(vistas).toEqual([{ transacao: true, travas: 2 }]);
    // As travas caem com o commit.
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from pg_locks
      where locktype = 'advisory'
        and database = (select oid from pg_database where datname = current_database())
    `.execute(db());
    expect(rows[0]?.n).toBe(0);
  });

  it('Q1 — conferência negativa: sem_vinculo, nada gravado; falha na conferência: desfaz e sobe o erro', async () => {
    expect(await abrirAB(async () => false)).toBe('sem_vinculo');

    const erro = await rejeicao(
      abrirAB(async () => {
        throw new Error('trampos fora');
      }),
    );

    expect((erro as Error).message).toBe('trampos fora');
    expect((await linhas()).conversas).toEqual([]);
  });

  it('CA19 — conta sem conversas e id fora do formato exportam lista vazia', async () => {
    await cenario();

    expect(await modulo().exportarDadosDaConta(randomUUID())).toEqual({
      conversas: [],
    });
    expect(await modulo().exportarDadosDaConta('nao-e-uuid')).toEqual({
      conversas: [],
    });
  });

  /**
   * O que a medida deve dar, calculado sobre o que a exportação devolve:
   * bytes UTF-8 do texto de cada mensagem da conta mais 256 por mensagem e
   * 256 por conversa.
   */
  function bytesEsperados(parte: ParteDeConversasNaExportacao): number {
    return parte.conversas
      .flatMap((conversa) => conversa.minhasMensagens)
      .reduce(
        (total, m) => total + Buffer.byteLength(m.texto) + 256,
        parte.conversas.length * 256,
      );
  }

  it('CA48 — mede no banco os bytes das mensagens da conta mais 256 por mensagem e por conversa, e cresce com o texto', async () => {
    expect(await modulo().medirExportacao(B)).toBe(0);
    const { ab, bc } = await cenario();

    const antes = await modulo().medirExportacao(B);
    // B está em duas conversas (com A e com C) e escreveu duas mensagens.
    expect(antes).toBe(
      Buffer.byteLength('B para A, primeira') +
        Buffer.byteLength('B para A, segunda') +
        2 * 256 +
        2 * 256,
    );
    expect(antes).toBe(bytesEsperados(await modulo().exportarDadosDaConta(B)));
    // O banco guarda o uuid em minúsculas: a mesma conta, a mesma medida.
    expect(await modulo().medirExportacao(B.toUpperCase())).toBe(antes);

    // Dois mil caracteres de dois bytes: a medida é em bytes, não em
    // caracteres.
    await escrever(bc, B, 'ã'.repeat(2000), minutos(9));
    expect(await modulo().medirExportacao(B)).toBe(antes + 4000 + 256);

    await escrever(ab, B, 'mais uma', minutos(10));
    expect(await modulo().medirExportacao(B)).toBe(
      bytesEsperados(await modulo().exportarDadosDaConta(B)),
    );
  });

  it('CA48 — ignora o texto de terceiros: as mensagens do outro participante e as conversas entre outros não contam', async () => {
    const { ab, bc, ac } = await cenario();
    const antes = await modulo().medirExportacao(B);

    await escrever(ab, A, 'TEXTO-DE-A '.repeat(150), minutos(9));
    await escrever(bc, C, 'TEXTO-DE-C '.repeat(150), minutos(10));
    await escrever(ac, A, 'TEXTO-A-PARA-C '.repeat(100), minutos(11));

    expect(await modulo().medirExportacao(B)).toBe(antes);
    for (const conta of [A, C]) {
      expect(await modulo().medirExportacao(conta)).toBe(
        bytesEsperados(await modulo().exportarDadosDaConta(conta)),
      );
    }
  });

  it('R2 — cada conversa da conta entra na medida, mesmo sem mensagem dela, e a medida nunca fica abaixo do JSON exportado', async () => {
    const { ab } = await cenario();
    const D = randomUUID();

    // D abre uma conversa com A e não escreve nada: só a linha da conversa.
    await abrir(D, A, minutos(9));
    expect(await modulo().medirExportacao(D)).toBe(256);
    // C só escreveu numa das duas conversas; a outra também conta.
    expect(await modulo().medirExportacao(C)).toBe(
      Buffer.byteLength('TEXTO-DE-C') + 256 + 2 * 256,
    );
    await escrever(ab, B, 'mais uma de B', minutos(10));

    for (const conta of [A, B, C, D]) {
      const parte = await modulo().exportarDadosDaConta(conta);
      const medida = await modulo().medirExportacao(conta);
      expect(medida, conta).toBe(bytesEsperados(parte));
      expect(medida, conta).toBeGreaterThanOrEqual(
        Buffer.byteLength(JSON.stringify(parte.conversas)),
      );
    }
  });

  it('CA48 — conta sem conversas mede 0, e id fora do formato uuid também', async () => {
    await cenario();

    expect(await modulo().medirExportacao(randomUUID())).toBe(0);
    for (const id of ['nao-e-uuid', '', `${B}' or true --`]) {
      expect(await modulo().medirExportacao(id)).toBe(0);
    }
  });
});
