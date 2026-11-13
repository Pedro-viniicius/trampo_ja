/**
 * QA da V2b (trilha da API, etapas B1 a B5): avaliações e equipe favorita pela
 * aplicação montada (`montarAplicacao`) com o Postgres de teste. Cobre o que os
 * testes do módulo provam só com adaptadores em memória ou com o módulo
 * isolado: o vínculo real de `trampos` em cada estado do trampo (CA87), as
 * checks do banco com o texto aparado (CA88), resumos, lista e feitas lidos do
 * Postgres pela rota (CA89 a CA91), favoritos com o vínculo real (CA92), a
 * limpeza pela lápide (ADR-007) e o log (CA93) e os limites por grupo pela
 * composição (CA94).
 *
 * Linhas de leitura (resumos, lista, feitas, favoritos no teto) são gravadas
 * direto no banco: só a gravação passa pela rota quando é ela que se testa.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RelogioFixo } from '../../src/compartilhado/dominio/relogio.js';
import {
  LIMITES_PADRAO_POR_CONTA,
  type LimitesPorConta,
} from '../../src/compartilhado/http/limite-por-conta.js';
import { criarLogger } from '../../src/compartilhado/http/logger.js';
import type { Aplicacao } from '../../src/composicao.js';
import { bancoDeTeste, truncarTabelas } from '../banco-teste.js';
import {
  candidatar,
  criarUsuario,
  criarUsuarioSemPerfil,
  montar,
  pedir,
  publicarTrampo,
  type Resposta,
  TABELAS,
  type Usuario,
} from './apoio.js';
import { gravarLapide, MINUTO } from './apoio-l3.js';

const TABELAS_V2B = [...TABELAS, 'contas_excluidas'];
const INICIO = '2026-11-13T12:00:00.000Z';

let aplicacao: Aplicacao | undefined;

function app(): Aplicacao {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao;
}

beforeEach(async () => {
  await truncarTabelas(TABELAS_V2B);
});

afterEach(async () => {
  await aplicacao?.fechar();
  aplicacao = undefined;
  await truncarTabelas(TABELAS_V2B);
});

function avaliar(usuario: Usuario, corpo: unknown): Promise<Resposta> {
  return pedir(app(), 'POST', '/avaliacoes', {
    token: usuario.token,
    corpo,
  });
}

async function aceitar(
  autor: Usuario,
  trampoId: string,
  candidaturaId: string,
): Promise<void> {
  const r = await pedir(
    app(),
    'POST',
    `/trampos/${trampoId}/candidaturas/${candidaturaId}/aceitar`,
    { token: autor.token },
  );
  expect(r.status, r.texto).toBe(200);
}

async function encerrar(autor: Usuario, trampoId: string): Promise<void> {
  const r = await pedir(app(), 'POST', `/trampos/${trampoId}/encerrar`, {
    token: autor.token,
  });
  expect(r.status, r.texto).toBe(204);
}

async function idDaCandidatura(
  freela: Usuario,
  trampoId: string,
): Promise<string> {
  const r = await candidatar(app(), freela, trampoId);
  expect(r.status, r.texto).toBe(201);
  return (r.corpo as { id: string }).id;
}

/** Avaliação gravada direto no banco (para os testes de leitura). */
async function avaliacaoDireta(campos: {
  avaliador: string;
  avaliado: string;
  papel: 'freela' | 'contratante';
  nota: number;
  destaques?: readonly string[];
  comentario?: string | null;
  criadaEm?: string;
  id?: string;
  trampo?: string;
}): Promise<string> {
  const id = campos.id ?? randomUUID();
  await sql`insert into avaliacoes (id, trampo_id, avaliador_id, avaliado_id,
      papel_do_avaliado, nota, destaques, comentario, criada_em)
    values (${id}::uuid, ${campos.trampo ?? randomUUID()}::uuid,
      ${campos.avaliador}::uuid, ${campos.avaliado}::uuid, ${campos.papel},
      ${campos.nota}, ${[...(campos.destaques ?? [])]}::text[],
      ${campos.comentario ?? null}, ${campos.criadaEm ?? INICIO}::timestamptz)`.execute(
    bancoDeTeste(),
  );
  return id;
}

async function favoritoDireto(
  dono: string,
  favorito: string,
  criadoEm = INICIO,
): Promise<void> {
  await sql`insert into favoritos (dono_id, favorito_id, criado_em)
    values (${dono}::uuid, ${favorito}::uuid, ${criadoEm}::timestamptz)`.execute(
    bancoDeTeste(),
  );
}

async function contarLinhas(
  tabela: 'avaliacoes' | 'favoritos',
  onde = sql`true`,
): Promise<number> {
  const { rows } = await sql<{
    n: number;
  }>`select count(*)::int as n from ${sql.table(tabela)} where ${onde}`.execute(
    bancoDeTeste(),
  );
  return rows[0]?.n ?? -1;
}

describe('CA87 — quem pode avaliar, pelo vínculo real de trampos', () => {
  it('Dado um trampo que passa de aberto a em andamento e a encerrado, quando cada pessoa avalia em cada estado, então quem não é parte recebe sempre o mesmo 404 e as partes recebem 409 até o encerramento e 201 depois', async () => {
    aplicacao = await montar();
    const autor = await criarUsuario(app());
    const freela = await criarUsuario(app());
    const pendente = await criarUsuario(app());
    const terceiro = await criarUsuario(app());
    const trampoId = await publicarTrampo(app(), autor);
    const aceita = await idDaCandidatura(freela, trampoId);
    await idDaCandidatura(pendente, trampoId);

    const inexistente = await avaliar(autor, {
      trampoId: randomUUID(),
      nota: 5,
    });
    expect(inexistente.status).toBe(404);
    const corpo404 = inexistente.texto;

    const naoEhParte = async (estado: string) => {
      for (const quem of [pendente, terceiro]) {
        const r = await avaliar(quem, { trampoId, nota: 1 });
        expect(r.status, `${estado}`).toBe(404);
        expect(r.texto, `${estado}`).toBe(corpo404);
      }
    };

    // aberto: o autor é parte e recebe 409; o freela ainda não é parte.
    await naoEhParte('aberto');
    expect((await avaliar(autor, { trampoId, nota: 5 })).corpo).toEqual({
      erro: 'trampo_nao_encerrado',
    });
    expect((await avaliar(freela, { trampoId, nota: 5 })).status).toBe(404);

    await aceitar(autor, trampoId, aceita);
    await naoEhParte('em_andamento');
    for (const parte of [autor, freela]) {
      const r = await avaliar(parte, { trampoId, nota: 5 });
      expect(r.status).toBe(409);
      expect(r.corpo).toEqual({ erro: 'trampo_nao_encerrado' });
    }
    expect(await contarLinhas('avaliacoes')).toBe(0);

    // encerrado: a candidatura pendente vira recusada e continua sem acesso.
    await encerrar(autor, trampoId);
    await naoEhParte('encerrado');
    const doAutor = await avaliar(autor, {
      trampoId,
      nota: 5,
      destaques: ['pontual'],
    });
    expect(doAutor.status, doAutor.texto).toBe(201);
    expect(Object.keys(doAutor.corpo as object)).toEqual(['id']);
    const doFreela = await avaliar(freela, {
      trampoId,
      nota: 4,
      destaques: ['pagamento_em_dia'],
    });
    expect(doFreela.status, doFreela.texto).toBe(201);

    const { rows } = await sql<{
      avaliador_id: string;
      avaliado_id: string;
      papel_do_avaliado: string;
    }>`select avaliador_id, avaliado_id, papel_do_avaliado from avaliacoes
      order by nota desc`.execute(bancoDeTeste());
    expect(rows).toEqual([
      {
        avaliador_id: autor.contaId,
        avaliado_id: freela.contaId,
        papel_do_avaliado: 'freela',
      },
      {
        avaliador_id: freela.contaId,
        avaliado_id: autor.contaId,
        papel_do_avaliado: 'contratante',
      },
    ]);

    // Repetir (inclusive com outra nota e o id em maiúsculas) é 409.
    for (const [parte, id] of [
      [autor, trampoId],
      [freela, trampoId.toUpperCase()],
    ] as const) {
      const r = await avaliar(parte, { trampoId: id, nota: 1 });
      expect(r.status).toBe(409);
      expect(r.corpo).toEqual({ erro: 'avaliacao_ja_feita' });
    }
    expect(await contarLinhas('avaliacoes')).toBe(2);
  });

  it('Dado um trampo encerrado sem candidatura aceita, quando o autor avalia, então recebe 404 (não há a quem avaliar) e nada é gravado', async () => {
    aplicacao = await montar();
    const autor = await criarUsuario(app());
    const freela = await criarUsuario(app());
    const trampoId = await publicarTrampo(app(), autor);
    await idDaCandidatura(freela, trampoId);
    await encerrar(autor, trampoId);

    expect((await avaliar(autor, { trampoId, nota: 5 })).status).toBe(404);
    expect((await avaliar(freela, { trampoId, nota: 5 })).status).toBe(404);
    expect(await contarLinhas('avaliacoes')).toBe(0);
  });

  it('Dado um trampo encerrado, quando autor e freela mandam 20 POST cada, todos ao mesmo tempo pela aplicação montada, então grava 1 de cada lado (2 × 201) e os outros 38 são 409 avaliacao_ja_feita, sem 500', async () => {
    aplicacao = await montar();
    const autor = await criarUsuario(app());
    const freela = await criarUsuario(app());
    const trampoId = await publicarTrampo(app(), autor);
    await aceitar(autor, trampoId, await idDaCandidatura(freela, trampoId));
    await encerrar(autor, trampoId);

    const respostas = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        avaliar(i % 2 === 0 ? autor : freela, {
          trampoId,
          nota: (i % 5) + 1,
          comentario: `rajada ${i}`,
        }),
      ),
    );

    const status = respostas.map((r) => r.status);
    expect(status.filter((s) => s === 201)).toHaveLength(2);
    expect(status.filter((s) => s === 409)).toHaveLength(38);
    for (const r of respostas.filter((x) => x.status === 409)) {
      expect(r.corpo).toEqual({ erro: 'avaliacao_ja_feita' });
    }
    const { rows } = await sql<{ avaliador_id: string; n: number }>`
      select avaliador_id, count(*)::int as n from avaliacoes
      group by avaliador_id order by avaliador_id`.execute(bancoDeTeste());
    expect(rows).toEqual(
      [autor.contaId, freela.contaId].sort().map((id) => ({
        avaliador_id: id,
        n: 1,
      })),
    );
  });
});

describe('CA88 — validação, com as checks do Postgres', () => {
  async function trampoEncerrado(): Promise<{
    autor: Usuario;
    freela: Usuario;
    trampoId: string;
  }> {
    const autor = await criarUsuario(app());
    const freela = await criarUsuario(app());
    const trampoId = await publicarTrampo(app(), autor);
    await aceitar(autor, trampoId, await idDaCandidatura(freela, trampoId));
    await encerrar(autor, trampoId);
    return { autor, freela, trampoId };
  }

  it('Dado um comentário de 500 emojis (4 bytes cada) com espaços e quebras nas pontas, quando avalia, então grava aparado com 500 pontos de código e a lista o devolve igual', async () => {
    aplicacao = await montar();
    const { autor, freela, trampoId } = await trampoEncerrado();
    const comentario = '🛠'.repeat(250) + '🎉'.repeat(250);

    const r = await avaliar(autor, {
      trampoId,
      nota: 3,
      comentario: `  \n\t${comentario}\n  `,
    });
    expect(r.status, r.texto).toBe(201);

    const { rows } = await sql<{
      tamanho: number;
      comentario: string;
    }>`select char_length(comentario)::int as tamanho, comentario
      from avaliacoes`.execute(bancoDeTeste());
    expect(rows).toEqual([{ tamanho: 500, comentario }]);

    const lista = await pedir(
      app(),
      'GET',
      `/avaliacoes?contaId=${freela.contaId}&papel=freela`,
      { token: freela.token },
    );
    expect(lista.status).toBe(200);
    expect(
      (lista.corpo as { itens: { comentario: string }[] }).itens[0]?.comentario,
    ).toBe(comentario);
  });

  it('Dado um corpo com todos os campos inválidos por tipo (trampoId número, nota texto, destaques texto, comentário número), quando avalia, então o 400 lista os quatro campos e não ecoa nenhum valor', async () => {
    aplicacao = await montar();
    const { autor } = await trampoEncerrado();
    const SENTINELA = 'SentinelaQaV2bTipo';

    const r = await avaliar(autor, {
      trampoId: 123_456,
      nota: SENTINELA,
      destaques: SENTINELA,
      comentario: 987_654,
    });

    expect(r.status).toBe(400);
    expect(r.texto).not.toContain(SENTINELA);
    expect(r.texto).not.toContain('123456');
    expect(r.texto).not.toContain('987654');
    const campos = (r.corpo as { campos?: { campo: string }[] }).campos ?? [];
    expect(campos.map((c) => c.campo).sort()).toEqual([
      'comentario',
      'destaques',
      'nota',
      'trampoId',
    ]);
    expect(await contarLinhas('avaliacoes')).toBe(0);
  });

  it('Dado uma nota em texto ("5") junto de um comentário com 501 pontos de código, quando avalia, então o 400 aponta os dois campos', async () => {
    aplicacao = await montar();
    const { autor, trampoId } = await trampoEncerrado();

    const r = await avaliar(autor, {
      trampoId,
      nota: '5',
      comentario: 'x'.repeat(501),
    });

    expect(r.status).toBe(400);
    const campos = (r.corpo as { campos?: { campo: string }[] }).campos ?? [];
    expect(campos.map((c) => c.campo).sort()).toEqual(['comentario', 'nota']);
  });

  it('Dado uma nota fracionária representável como inteiro (5.0) e destaques nulos, quando avalia, então grava nota 5 sem destaques', async () => {
    aplicacao = await montar();
    const { autor, trampoId } = await trampoEncerrado();

    const r = await pedir(app(), 'POST', '/avaliacoes', {
      token: autor.token,
      corpoBruto: `{"trampoId":"${trampoId}","nota":5.0,"destaques":null}`,
    });

    expect(r.status, r.texto).toBe(201);
    const { rows } = await sql<{
      nota: number;
      destaques: string[];
      comentario: string | null;
    }>`select nota, destaques, comentario from avaliacoes`.execute(
      bancoDeTeste(),
    );
    expect(rows).toEqual([{ nota: 5, destaques: [], comentario: null }]);
  });
});

describe('CA89 — resumos lidos do Postgres pela rota', () => {
  it('Dado notas 5, 4 e 4 como freela e 2 e 3 como contratante, quando pede os resumos, então vem média 4,3 e 2,5, o total e os 3 destaques mais frequentes; conta sem avaliação vem com média nula', async () => {
    aplicacao = await montar();
    const leitor = await criarUsuarioSemPerfil();
    const avaliado = randomUUID();
    const semNada = randomUUID();
    const outro = randomUUID();
    await avaliacaoDireta({
      avaliador: outro,
      avaliado,
      papel: 'freela',
      nota: 5,
      destaques: ['rapido', 'educado', 'pontual'],
    });
    await avaliacaoDireta({
      avaliador: randomUUID(),
      avaliado,
      papel: 'freela',
      nota: 4,
      destaques: ['rapido', 'educado', 'proativo'],
    });
    await avaliacaoDireta({
      avaliador: randomUUID(),
      avaliado,
      papel: 'freela',
      nota: 4,
      destaques: ['rapido', 'organizado'],
    });
    await avaliacaoDireta({
      avaliador: randomUUID(),
      avaliado,
      papel: 'contratante',
      nota: 2,
      destaques: ['respeitoso'],
    });
    await avaliacaoDireta({
      avaliador: randomUUID(),
      avaliado,
      papel: 'contratante',
      nota: 3,
    });

    const r = await pedir(
      app(),
      'GET',
      `/avaliacoes/resumos?contas=${semNada},${avaliado.toUpperCase()},nao-e-uuid`,
      { token: leitor.token },
    );

    expect(r.status, r.texto).toBe(200);
    expect(r.corpo).toEqual([
      {
        contaId: semNada,
        comoFreela: { media: null, total: 0, destaques: [] },
        comoContratante: { media: null, total: 0, destaques: [] },
      },
      {
        contaId: avaliado,
        // 13 / 3 = 4,33 → 4,3. Empate de 1 entre pontual, organizado e
        // proativo: vale a ordem da lista do papel (pontual).
        comoFreela: {
          media: 4.3,
          total: 3,
          destaques: ['rapido', 'educado', 'pontual'],
        },
        comoContratante: { media: 2.5, total: 2, destaques: ['respeitoso'] },
      },
    ]);
  });

  it('Dado 50 ids, quando pede os resumos, então responde 200 com 50 itens; com 51, 400 no campo contas', async () => {
    aplicacao = await montar();
    const leitor = await criarUsuarioSemPerfil();
    const ids = Array.from({ length: 51 }, () => randomUUID());

    const cinquenta = await pedir(
      app(),
      'GET',
      `/avaliacoes/resumos?contas=${ids.slice(0, 50).join(',')}`,
      { token: leitor.token },
    );
    expect(cinquenta.status).toBe(200);
    expect(cinquenta.corpo).toHaveLength(50);

    const cinquentaEUm = await pedir(
      app(),
      'GET',
      `/avaliacoes/resumos?${ids.map((id) => `contas=${id}`).join('&')}`,
      { token: leitor.token },
    );
    expect(cinquentaEUm.status).toBe(400);
    expect(cinquentaEUm.corpo).toMatchObject({
      erro: 'dados_invalidos',
      campos: [{ campo: 'contas' }],
    });
  });
});

describe('CA90 — avaliações recebidas, paginadas pela rota no Postgres', () => {
  it('Dado 45 avaliações no mesmo instante, quando pagina sem limite, então vêm 20, 20 e 5, por id decrescente, sem repetir nem pular, e cada item só com os cinco campos', async () => {
    aplicacao = await montar();
    const leitor = await criarUsuarioSemPerfil();
    const avaliado = randomUUID();
    const ids: string[] = [];
    for (let i = 0; i < 45; i += 1) {
      ids.push(
        await avaliacaoDireta({
          avaliador: randomUUID(),
          avaliado,
          papel: 'freela',
          nota: (i % 5) + 1,
          comentario: `Comentário ${i}`,
        }),
      );
    }
    // Uma no outro papel, que não pode aparecer.
    await avaliacaoDireta({
      avaliador: randomUUID(),
      avaliado,
      papel: 'contratante',
      nota: 1,
    });
    const esperados = await sql<{ comentario: string }>`
      select comentario from avaliacoes
      where papel_do_avaliado = 'freela' order by id desc`.execute(
      bancoDeTeste(),
    );

    const vistos: string[] = [];
    const tamanhos: number[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/avaliacoes?contaId=${avaliado}&papel=freela${
        cursor ? `&antesDe=${cursor}` : ''
      }`;
      const r = await pedir(app(), 'GET', url, { token: leitor.token });
      expect(r.status, r.texto).toBe(200);
      const pagina = r.corpo as {
        itens: Record<string, unknown>[];
        proximoCursor: string | null;
      };
      tamanhos.push(pagina.itens.length);
      for (const item of pagina.itens) {
        expect(Object.keys(item).sort()).toEqual([
          'avaliadorId',
          'comentario',
          'criadaEm',
          'destaques',
          'nota',
        ]);
        expect(item.criadaEm).toBe(INICIO);
        vistos.push(item.comentario as string);
      }
      cursor = pagina.proximoCursor;
    } while (cursor !== null && tamanhos.length < 10);

    expect(tamanhos).toEqual([20, 20, 5]);
    expect(vistos).toEqual(esperados.rows.map((l) => l.comentario));
    expect(new Set(vistos).size).toBe(45);
  });

  it('Dado 51 avaliações, quando pede limite 50, então vêm 50 com cursor; limite 51 ou 0 responde 400 limite', async () => {
    aplicacao = await montar();
    const leitor = await criarUsuarioSemPerfil();
    const avaliado = randomUUID();
    for (let i = 0; i < 51; i += 1) {
      await avaliacaoDireta({
        avaliador: randomUUID(),
        avaliado,
        papel: 'contratante',
        nota: 5,
        criadaEm: new Date(Date.parse(INICIO) + i * 1000).toISOString(),
      });
    }
    const base = `/avaliacoes?contaId=${avaliado}&papel=contratante`;

    const cheia = await pedir(app(), 'GET', `${base}&limite=50`, {
      token: leitor.token,
    });
    expect(cheia.status).toBe(200);
    const pagina = cheia.corpo as {
      itens: { criadaEm: string }[];
      proximoCursor: string | null;
    };
    expect(pagina.itens).toHaveLength(50);
    expect(pagina.proximoCursor).not.toBeNull();
    const datas = pagina.itens.map((i) => i.criadaEm);
    expect(datas).toEqual([...datas].sort().reverse());

    for (const limite of ['51', '0']) {
      const r = await pedir(app(), 'GET', `${base}&limite=${limite}`, {
        token: leitor.token,
      });
      expect(r.status, `limite=${limite}`).toBe(400);
      expect(r.corpo).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'limite', motivo: 'invalido' }],
      });
    }
  });
});

describe('CA91 — feitas, só da conta da sessão', () => {
  it('Dado avaliações minhas e de outra conta nos mesmos trampos, quando pede as feitas, então vêm só as minhas, com trampoId, nota e criadaEm', async () => {
    aplicacao = await montar();
    const eu = await criarUsuarioSemPerfil();
    const outra = randomUUID();
    const t1 = randomUUID();
    const t2 = randomUUID();
    const t3 = randomUUID();
    await avaliacaoDireta({
      avaliador: eu.contaId,
      avaliado: outra,
      papel: 'freela',
      nota: 4,
      trampo: t1,
      comentario: 'meu comentário',
    });
    await avaliacaoDireta({
      avaliador: outra,
      avaliado: eu.contaId,
      papel: 'contratante',
      nota: 2,
      trampo: t1,
    });
    await avaliacaoDireta({
      avaliador: outra,
      avaliado: randomUUID(),
      papel: 'freela',
      nota: 1,
      trampo: t2,
    });

    const r = await pedir(
      app(),
      'GET',
      `/avaliacoes/feitas?trampos=${t1},${t2},${t3}`,
      { token: eu.token },
    );

    expect(r.status, r.texto).toBe(200);
    expect(r.corpo).toEqual([{ trampoId: t1, nota: 4, criadaEm: INICIO }]);
  });
});

describe('CA92 — favoritos pelo vínculo real de trampos', () => {
  it('Dado uma candidatura pendente entre as duas contas, quando cada uma favorita a outra, então responde 204, repetir não muda o criadoEm e a lista sai do mais recente ao mais antigo; sem vínculo, 404; a si mesmo, 409', async () => {
    const relogio = new RelogioFixo(INICIO);
    aplicacao = await montar({ relogio });
    const contratante = await criarUsuario(app());
    const freela1 = await criarUsuario(app());
    const freela2 = await criarUsuario(app());
    const estranho = await criarUsuario(app());
    const trampoId = await publicarTrampo(app(), contratante);
    await idDaCandidatura(freela1, trampoId);
    await idDaCandidatura(freela2, trampoId);
    const favoritar = (de: Usuario, contaId: string) =>
      pedir(app(), 'PUT', `/favoritos/${contaId}`, { token: de.token });

    expect((await favoritar(contratante, freela1.contaId)).status).toBe(204);
    relogio.avancar(MINUTO);
    // Id em maiúsculas é o mesmo favorito.
    expect(
      (await favoritar(contratante, freela2.contaId.toUpperCase())).status,
    ).toBe(204);
    relogio.avancar(MINUTO);
    expect((await favoritar(contratante, freela1.contaId)).status).toBe(204);
    expect((await favoritar(contratante, freela2.contaId)).status).toBe(204);
    // O freela também pode favoritar o contratante (o vínculo vale dos dois lados).
    expect((await favoritar(freela1, contratante.contaId)).status).toBe(204);

    const semVinculo = await favoritar(contratante, estranho.contaId);
    expect(semVinculo.status).toBe(404);
    const contaInexistente = await favoritar(contratante, randomUUID());
    expect(contaInexistente.status).toBe(404);
    expect(contaInexistente.texto).toBe(semVinculo.texto);
    const aSiMesmo = await favoritar(contratante, contratante.contaId);
    expect(aSiMesmo.status).toBe(409);
    expect(aSiMesmo.corpo).toEqual({ erro: 'favorito_invalido' });

    const lista = await pedir(app(), 'GET', '/favoritos', {
      token: contratante.token,
    });
    expect(lista.status).toBe(200);
    expect(lista.corpo).toEqual([
      {
        contaId: freela2.contaId,
        criadoEm: new Date(Date.parse(INICIO) + MINUTO).toISOString(),
      },
      { contaId: freela1.contaId, criadoEm: INICIO },
    ]);

    // Quem foi favoritado não vê quem o favoritou.
    const doFreela2 = await pedir(app(), 'GET', '/favoritos', {
      token: freela2.token,
    });
    expect(doFreela2.corpo).toEqual([]);
  });

  it('D61 — Dado um favorito já gravado sem vínculo em trampos (o vínculo sumiu), quando a conta favorita de novo, então responde 204 e a lista não muda; um novo sem vínculo segue 404', async () => {
    const relogio = new RelogioFixo(INICIO);
    aplicacao = await montar({ relogio });
    const contratante = await criarUsuario(app());
    const antigo = await criarUsuario(app());
    const estranho = await criarUsuario(app());
    await favoritoDireto(contratante.contaId, antigo.contaId);
    relogio.avancar(MINUTO);
    const favoritar = (contaId: string) =>
      pedir(app(), 'PUT', `/favoritos/${contaId}`, {
        token: contratante.token,
      });

    const repetido = await favoritar(antigo.contaId);
    expect(repetido.status).toBe(204);
    expect((await favoritar(estranho.contaId)).status).toBe(404);

    const lista = await pedir(app(), 'GET', '/favoritos', {
      token: contratante.token,
    });
    expect(lista.corpo).toEqual([
      { contaId: antigo.contaId, criadoEm: INICIO },
    ]);
  });

  it('Dado 200 favoritos, quando favorita mais um com vínculo, então 409 limite_de_favoritos; o já favorito segue 204; depois de desfavoritar um (duas vezes, 204), o novo entra', async () => {
    aplicacao = await montar();
    const contratante = await criarUsuario(app());
    const freela = await criarUsuario(app());
    const trampoId = await publicarTrampo(app(), contratante);
    await idDaCandidatura(freela, trampoId);
    const primeiro = randomUUID();
    await favoritoDireto(contratante.contaId, primeiro);
    for (let i = 1; i < 200; i += 1) {
      await favoritoDireto(contratante.contaId, randomUUID());
    }
    const favoritar = (contaId: string) =>
      pedir(app(), 'PUT', `/favoritos/${contaId}`, {
        token: contratante.token,
      });
    const desfavoritar = (contaId: string) =>
      pedir(app(), 'DELETE', `/favoritos/${contaId}`, {
        token: contratante.token,
      });

    const noTeto = await favoritar(freela.contaId);
    expect(noTeto.status).toBe(409);
    expect(noTeto.corpo).toEqual({ erro: 'limite_de_favoritos' });
    expect(await contarLinhas('favoritos')).toBe(200);

    expect((await desfavoritar(primeiro)).status).toBe(204);
    expect((await desfavoritar(primeiro)).status).toBe(204);
    expect((await favoritar(freela.contaId)).status).toBe(204);
    expect((await favoritar(freela.contaId)).status).toBe(204);
    expect(await contarLinhas('favoritos')).toBe(200);
  });
});

describe('CA93 — LGPD: lápide (ADR-007) e log', () => {
  it('Dado a lápide de uma conta com avaliações e favoritos órfãos dos dois lados (escrita em voo depois da exclusão), quando a limpeza roda, então tudo dela some e o que não a envolve fica', async () => {
    const relogio = new RelogioFixo(new Date());
    aplicacao = await montar({ relogio });
    const excluida = randomUUID();
    const outra = randomUUID();
    const terceira = randomUUID();
    await gravarLapide(
      excluida,
      new Date(relogio.agora().getTime() - 30 * MINUTO),
    );
    await avaliacaoDireta({
      avaliador: excluida,
      avaliado: outra,
      papel: 'freela',
      nota: 5,
      comentario: 'feita pela excluída',
    });
    await avaliacaoDireta({
      avaliador: outra,
      avaliado: excluida,
      papel: 'contratante',
      nota: 4,
    });
    await favoritoDireto(excluida, outra);
    await favoritoDireto(outra, excluida);
    // Não envolve a conta excluída: fica.
    await avaliacaoDireta({
      avaliador: outra,
      avaliado: terceira,
      papel: 'freela',
      nota: 3,
    });
    await favoritoDireto(outra, terceira);

    await app().limparRegistrosVencidos();

    const daExcluida = (colA: string, colB: string) =>
      sql`${sql.ref(colA)} = ${excluida}::uuid or ${sql.ref(colB)} = ${excluida}::uuid`;
    expect(
      await contarLinhas(
        'avaliacoes',
        daExcluida('avaliador_id', 'avaliado_id'),
      ),
    ).toBe(0);
    expect(
      await contarLinhas('favoritos', daExcluida('dono_id', 'favorito_id')),
    ).toBe(0);
    expect(await contarLinhas('avaliacoes')).toBe(1);
    expect(await contarLinhas('favoritos')).toBe(1);
  });

  it('Dado o logger em trace, quando avalia com comentário (201, 400 por tamanho, 409 repetida e 404 de terceiro) e lista, então o comentário nunca aparece no log nem nas respostas de erro', async () => {
    const linhas: string[] = [];
    aplicacao = await montar({
      logger: criarLogger({
        nivel: 'trace',
        destino: { write: (linha: string) => void linhas.push(linha) },
      }),
    });
    const SENTINELA = 'ComentarioSentinelaQaV2b';
    const autor = await criarUsuario(app());
    const freela = await criarUsuario(app());
    const terceiro = await criarUsuario(app());
    const trampoId = await publicarTrampo(app(), autor);
    await aceitar(autor, trampoId, await idDaCandidatura(freela, trampoId));
    await encerrar(autor, trampoId);

    const respostas = [
      await avaliar(autor, { trampoId, nota: 5, comentario: SENTINELA }),
      await avaliar(freela, {
        trampoId,
        nota: 5,
        comentario: SENTINELA.repeat(30),
      }),
      await avaliar(autor, { trampoId, nota: 5, comentario: SENTINELA }),
      await avaliar(terceiro, { trampoId, nota: 5, comentario: SENTINELA }),
    ];
    expect(respostas.map((r) => r.status)).toEqual([201, 400, 409, 404]);
    for (const r of respostas.slice(1)) {
      expect(r.texto).not.toContain(SENTINELA);
    }
    const lista = await pedir(
      app(),
      'GET',
      `/avaliacoes?contaId=${freela.contaId}&papel=freela`,
      { token: freela.token },
    );
    expect(lista.texto).toContain(SENTINELA);

    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.join('')).not.toContain(SENTINELA);
  });
});

describe('CA94 — limites por grupo pela aplicação montada', () => {
  function limitesCom(grupo: keyof LimitesPorConta): LimitesPorConta {
    return {
      ...LIMITES_PADRAO_POR_CONTA,
      [grupo]: { max: 1, janelaMs: 60_000 },
    };
  }

  it('Dado publicacao com 1 pedido, quando a conta avalia, então o próximo POST /trampos dá 429; favoritar e ler seguem livres', async () => {
    aplicacao = await montar({
      rateLimit: undefined,
      limitesPorConta: limitesCom('publicacao'),
    });
    const conta = await criarUsuario(app());

    const avaliada = await avaliar(conta, { trampoId: randomUUID(), nota: 5 });
    expect(avaliada.status).toBe(404);
    const publicar = await pedir(app(), 'POST', '/trampos', {
      token: conta.token,
      corpo: { titulo: 'x' },
    });
    expect(publicar.status).toBe(429);
    expect(
      (
        await pedir(app(), 'PUT', `/favoritos/${randomUUID()}`, {
          token: conta.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (await pedir(app(), 'GET', '/favoritos', { token: conta.token })).status,
    ).toBe(200);
  });

  it('Dado escrita com 1 pedido, quando a conta favorita, então o DELETE seguinte dá 429 e avaliar segue livre', async () => {
    aplicacao = await montar({
      rateLimit: undefined,
      limitesPorConta: limitesCom('escrita'),
    });
    const conta = await criarUsuarioSemPerfil();
    const alvo = randomUUID();

    expect(
      (await pedir(app(), 'PUT', `/favoritos/${alvo}`, { token: conta.token }))
        .status,
    ).toBe(404);
    expect(
      (
        await pedir(app(), 'DELETE', `/favoritos/${alvo}`, {
          token: conta.token,
        })
      ).status,
    ).toBe(429);
    expect(
      (await avaliar(conta, { trampoId: randomUUID(), nota: 5 })).status,
    ).toBe(404);
  });

  it('Dado leitura com 1 pedido, quando a conta lê os resumos, então GET /avaliacoes, /feitas e /favoritos dão 429', async () => {
    aplicacao = await montar({
      rateLimit: undefined,
      limitesPorConta: limitesCom('leitura'),
    });
    const conta = await criarUsuarioSemPerfil();
    const id = randomUUID();

    expect(
      (
        await pedir(app(), 'GET', `/avaliacoes/resumos?contas=${id}`, {
          token: conta.token,
        })
      ).status,
    ).toBe(200);
    for (const url of [
      `/avaliacoes?contaId=${id}&papel=freela`,
      `/avaliacoes/feitas?trampos=${id}`,
      '/favoritos',
    ]) {
      expect(
        (await pedir(app(), 'GET', url, { token: conta.token })).status,
        url,
      ).toBe(429);
    }
  });
});
