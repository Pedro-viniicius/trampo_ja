import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { down } from '../../../../../migracoes/0005_conversas.js';
import {
  bancoDeTeste,
  truncarTabelas,
} from '../../../../../test/banco-teste.js';
import { ErroTabelaNaoVazia } from '../../../../compartilhado/banco/migrador.js';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarCasosDeUsoDeConversas } from '../../aplicacao/casos-de-uso.js';
import { Conversa } from '../../dominio/conversa.js';
import { criarMensagem, type Mensagem } from '../../dominio/mensagem.js';
import { VerificadorDeVinculoEmMemoria } from '../memoria/verificador-vinculo-memoria.js';
import { RepositorioDeConversasPostgres } from './repositorio-postgres.js';
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
  expect(await repositorio.inserirConversa(conversa)).toBe('inserida');
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

    expect(await repositorio.inserirConversa(repetida)).toBe('par_ja_existe');
    expect((await repositorio.buscarConversaDoPar(A, B))?.id).toBe(primeira.id);
  });

  it('corrida: duas inserções simultâneas do mesmo par → uma inserida, uma par_ja_existe', async () => {
    const resultados = await Promise.allSettled([
      repositorio.inserirConversa(
        Conversa.criar(A, B, { id: randomUUID(), agora: INICIO }),
      ),
      repositorio.inserirConversa(
        Conversa.criar(B, A, { id: randomUUID(), agora: INICIO }),
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
    await repositorio.inserirConversa(menor);
    await repositorio.inserirConversa(maior);

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
