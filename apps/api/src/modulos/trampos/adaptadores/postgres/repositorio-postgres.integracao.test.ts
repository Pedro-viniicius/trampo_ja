import { randomUUID } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { down } from '../../../../../migracoes/0002_trampos.js';
import {
  bancoDeTeste,
  truncarTabelas,
} from '../../../../../test/banco-teste.js';
import { ErroTabelaNaoVazia } from '../../../../compartilhado/banco/migrador.js';
import {
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import {
  type CasosDeUsoDeTrampos,
  criarCasosDeUsoDeTrampos,
} from '../../aplicacao/casos-de-uso.js';
import { type EntradaDeTrampo, Trampo } from '../../dominio/trampo.js';
import {
  criarModuloDeTrampos,
  type ParteDeTramposNaExportacao,
} from '../../index.js';
import { VerificadorDePerfilEmMemoria } from '../memoria/verificador-perfil-memoria.js';
import {
  excluirDadosDaConta,
  RepositorioDeTramposPostgres,
} from './repositorio-postgres.js';
import type { TabelasDeTrampos } from './tabelas.js';

const EMPREGADOR = randomUUID();
const ANA = randomUUID();
const BRUNO = randomUUID();
const CARLA = randomUUID();

const trampoValido: EntradaDeTrampo = {
  titulo: 'Pintar a sala',
  descricao: 'Pintura de uma sala de 20 m², tinta inclusa.',
  categoria: 'reformas',
  cidade: 'São Paulo',
  valorCentavos: 50000,
};
const proposta = {
  mensagem: 'Posso fazer na semana que vem.',
  valorPropostoCentavos: 45000,
};

const db = () => bancoDeTeste<TabelasDeTrampos>();

/** Página que cabe todos os trampos de um autor nestes testes. */
const PAGINA_CHEIA = { limite: 50 } as const;

let repositorio: RepositorioDeTramposPostgres;
let relogio: RelogioFixo;
let casos: CasosDeUsoDeTrampos;

beforeEach(async () => {
  await truncarTabelas(['candidaturas', 'trampos']);
  repositorio = new RepositorioDeTramposPostgres(db());
  relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
  casos = criarCasosDeUsoDeTrampos({
    repositorio,
    verificadorDePerfil: new VerificadorDePerfilEmMemoria([
      EMPREGADOR,
      ANA,
      BRUNO,
      CARLA,
    ]),
    relogio,
  });
});

async function publicar(
  dados: Partial<EntradaDeTrampo> = {},
  autor = EMPREGADOR,
): Promise<string> {
  return (await casos.publicarTrampo(autor, { ...trampoValido, ...dados })).id;
}

async function carregar(id: string): Promise<Trampo> {
  const trampo = await repositorio.buscarPorId(id);
  if (!trampo) {
    throw new Error('trampo não encontrado no teste');
  }
  return trampo;
}

async function rejeicao(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava uma rejeição');
}

async function versaoNoBanco(id: string): Promise<number | undefined> {
  const linha = await db()
    .selectFrom('trampos')
    .select('versao')
    .where('id', '=', id)
    .executeTakeFirst();
  return linha?.versao;
}

type Desfecho = { ok: true; valor: unknown } | { ok: false; erro: unknown };

/** Resultado de uma promessa sem deixar rejeição solta enquanto se espera. */
function acompanhar(promessa: Promise<unknown>): Promise<Desfecho> {
  return promessa.then(
    (valor) => ({ ok: true as const, valor }),
    (erro: unknown) => ({ ok: false as const, erro }),
  );
}

/**
 * Espera até `minimo` conexões do banco de teste (uma, por padrão) ficarem
 * paradas numa trava.
 */
async function esperarAlguemNaTrava(minimo = 1): Promise<void> {
  for (let tentativa = 0; tentativa < 120; tentativa += 1) {
    const { rows } = await sql<{ total: number }>`
      select count(*)::int as total from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
    `.execute(db());
    if ((rows[0]?.total ?? 0) >= minimo) {
      return;
    }
    await new Promise((resolver) => setTimeout(resolver, 25));
  }
  throw new Error('nenhuma consulta ficou esperando a trava');
}

/**
 * A conexão `trx` com uma pausa logo depois da `ordem`-ésima consulta
 * `for update` (da exclusão de conta ou de trampo): ali roda `durante()`, e
 * só então a exclusão segue para os `delete`.
 */
function pausarDepoisDaTrava<T>(
  trx: Kysely<T>,
  ordem: number,
  durante: () => Promise<void>,
): Kysely<T> {
  let travasVistas = 0;
  let consultaDaPausa: string | undefined;
  return trx.withPlugin({
    transformQuery({ node, queryId }) {
      if (
        node.kind === 'SelectQueryNode' &&
        JSON.stringify(node).includes('"ForUpdate"')
      ) {
        travasVistas += 1;
        if (travasVistas === ordem) {
          consultaDaPausa = queryId.queryId;
        }
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

describe('migração 0002_trampos', () => {
  it('os checks recusam valor zero e status desconhecido', async () => {
    const inserir = (valor: number, status: string) =>
      sql`insert into trampos (id, autor_id, titulo, descricao, categoria,
        cidade, cidade_normalizada, texto_busca, valor_centavos, status,
        versao, criado_em)
        values (${randomUUID()}, ${EMPREGADOR}, 'titulo', 'descricao',
        'reformas', 'Cidade', 'cidade', 'titulo descricao', ${valor},
        ${status}, 1, now())`.execute(db());

    expect(await rejeicao(inserir(0, 'aberto'))).toMatchObject({
      code: '23514',
      constraint: 'trampos_valor_centavos_positivo',
    });
    expect(await rejeicao(inserir(100, 'fechado'))).toMatchObject({
      code: '23514',
      constraint: 'trampos_status_valido',
    });
  });

  it('o down recusa remover tabela com linhas e remove as vazias', async () => {
    const id = await publicar();
    const desfazer = new Error('desfazer');
    const base = bancoDeTeste<unknown>();

    // Cada `down` roda numa transação que termina desfeita: as tabelas ficam.
    const comLinhas = await rejeicao(
      base.transaction().execute(async (trx) => {
        await down(trx);
      }),
    );
    expect(comLinhas).toBeInstanceOf(ErroTabelaNaoVazia);
    expect(await repositorio.buscarPorId(id)).not.toBeNull();

    await truncarTabelas(['candidaturas', 'trampos']);
    const vazias = await rejeicao(
      base.transaction().execute(async (trx) => {
        await down(trx);
        const { rows } = await sql<{
          trampos: string | null;
          candidaturas: string | null;
        }>`select to_regclass('trampos')::text as trampos,
            to_regclass('candidaturas')::text as candidaturas`.execute(trx);
        expect(rows[0]).toEqual({ trampos: null, candidaturas: null });
        throw desfazer;
      }),
    );
    expect(vazias).toBe(desfazer);
    expect(await repositorio.listarDoAutor(EMPREGADOR, PAGINA_CHEIA)).toEqual(
      [],
    );
  });
});

describe('salvar e buscarPorId', () => {
  it('CA4 — grava o trampo novo com versão 1 e reconstitui todos os campos', async () => {
    const novo = Trampo.criar(
      EMPREGADOR,
      { ...trampoValido, prazo: '2026-12-31' },
      relogio,
    );

    await repositorio.salvar(novo);

    const lido = await carregar(novo.id);
    expect(lido.dados()).toEqual(novo.dados());
    expect(lido.dados()).toMatchObject({
      prazo: '2026-12-31',
      status: 'aberto',
      versao: 1,
      cidadeNormalizada: 'sao paulo',
      criadoEm: new Date('2026-10-20T12:00:00.000Z'),
      candidaturas: [],
    });
  });

  it('CA4 — sem prazo, lê null', async () => {
    const id = await publicar();
    expect((await carregar(id)).dados().prazo).toBeNull();
  });

  it('id inexistente ou fora do formato uuid → null', async () => {
    expect(await repositorio.buscarPorId(randomUUID())).toBeNull();
    expect(await repositorio.buscarPorId('nao-existe')).toBeNull();
    expect(await repositorio.buscarPorId("1' or '1'='1")).toBeNull();
  });

  it('CA8 — a candidatura fica gravada pendente, com todos os campos, e a versão sobe', async () => {
    const id = await publicar();

    const resultado = await casos.candidatar(ANA, id, proposta);

    const lido = await carregar(id);
    expect(lido.versao).toBe(2);
    expect(lido.candidaturas).toEqual([
      {
        id: resultado.id,
        trampoId: id,
        freelancerId: ANA,
        mensagem: proposta.mensagem,
        valorPropostoCentavos: proposta.valorPropostoCentavos,
        status: 'pendente',
        criadaEm: new Date('2026-10-20T12:00:00.000Z'),
      },
    ]);
  });

  it('CA10 — o aceite grava em_andamento, aceita e recusadas', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    relogio.avancar(1000);
    const bruno = await casos.candidatar(BRUNO, id, proposta);

    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);

    const lido = await carregar(id);
    expect(lido.status).toBe('em_andamento');
    expect(lido.versao).toBe(4);
    expect(lido.candidaturas.map((c) => [c.id, c.status])).toEqual([
      [ana.id, 'aceita'],
      [bruno.id, 'recusada'],
    ]);
  });

  it('CA11 — trampo em andamento lido do banco recusa nova candidatura', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);

    expect(await rejeicao(casos.candidatar(CARLA, id, proposta))).toEqual(
      new ErroDeRegra('trampo_nao_aberto'),
    );
  });

  it('trampo novo com id já gravado → conflito_de_versao', async () => {
    const novo = Trampo.criar(EMPREGADOR, trampoValido, relogio);
    await repositorio.salvar(novo);

    expect(await rejeicao(repositorio.salvar(novo))).toEqual(
      new ErroDeRegra('conflito_de_versao'),
    );
  });

  it('trampo com versão maior que 1 que não está no banco → conflito_de_versao', async () => {
    const novo = Trampo.criar(EMPREGADOR, trampoValido, relogio);
    novo.candidatar(ANA, proposta, relogio);

    expect(await rejeicao(repositorio.salvar(novo))).toEqual(
      new ErroDeRegra('conflito_de_versao'),
    );
    expect(await repositorio.buscarPorId(novo.id)).toBeNull();
  });
});

describe('concorrência no Postgres', () => {
  it('CA10 — Dado dois aceites concorrentes do mesmo trampo, quando ambos gravam, então só um vence e o outro recebe conflito_de_versao', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const bruno = await casos.candidatar(BRUNO, id, proposta);
    const primeiro = await carregar(id);
    const segundo = await carregar(id);
    primeiro.aceitar(ana.id, EMPREGADOR);
    segundo.aceitar(bruno.id, EMPREGADOR);

    const resultados = await Promise.allSettled([
      repositorio.salvar(primeiro),
      repositorio.salvar(segundo),
    ]);

    const vencedores = resultados.filter((r) => r.status === 'fulfilled');
    const perdedores = resultados.filter((r) => r.status === 'rejected');
    expect(vencedores).toHaveLength(1);
    expect(perdedores).toHaveLength(1);
    expect(perdedores[0]?.reason).toEqual(
      new ErroDeRegra('conflito_de_versao'),
    );

    const final = await carregar(id);
    expect(final.versao).toBe(4);
    expect(final.status).toBe('em_andamento');
    const status = final.candidaturas.map((c) => c.status).sort();
    expect(status).toEqual(['aceita', 'recusada']);
  });

  it('Dado duas candidaturas de freelancers distintos sobre a mesma versão, quando ambas gravam direto no repositório, então só uma entra e a outra recebe conflito_de_versao', async () => {
    const id = await publicar();
    const primeiro = await carregar(id);
    const segundo = await carregar(id);
    primeiro.candidatar(ANA, proposta, relogio);
    segundo.candidatar(BRUNO, proposta, relogio);

    const resultados = await Promise.allSettled([
      repositorio.salvar(primeiro),
      repositorio.salvar(segundo),
    ]);

    const perdedores = resultados.filter((r) => r.status === 'rejected');
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(perdedores).toHaveLength(1);
    expect(perdedores[0]?.reason).toEqual(
      new ErroDeRegra('conflito_de_versao'),
    );
    expect((await carregar(id)).candidaturas).toHaveLength(1);
  });

  it('CA8 — Dado freelancers distintos se candidatando ao mesmo tempo pelo caso de uso, quando a trava otimista barra um deles, então ele relê e todas as candidaturas são gravadas', async () => {
    const id = await publicar();

    const resultados = await Promise.allSettled([
      casos.candidatar(ANA, id, proposta),
      casos.candidatar(BRUNO, id, proposta),
      casos.candidatar(CARLA, id, proposta),
    ]);

    expect(resultados.map((r) => r.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
    const final = await carregar(id);
    expect(final.candidaturas.map((c) => c.freelancerId).sort()).toEqual(
      [ANA, BRUNO, CARLA].sort(),
    );
    expect(final.versao).toBe(4);
  });

  it('CA9 — Dado o mesmo freelancer se candidatando duas vezes ao mesmo tempo pelo caso de uso, então uma grava e a outra, ao reler, recebe candidatura_duplicada', async () => {
    const id = await publicar();

    const resultados = await Promise.allSettled([
      casos.candidatar(ANA, id, proposta),
      casos.candidatar(ANA, id, proposta),
    ]);

    const perdedores = resultados.filter((r) => r.status === 'rejected');
    expect(perdedores).toHaveLength(1);
    expect(perdedores[0]?.reason).toEqual(
      new ErroDeRegra('candidatura_duplicada'),
    );
    expect((await carregar(id)).candidaturas).toHaveLength(1);
  });

  it('CA9 — Dado uma candidatura gravada fora do agregado, quando o mesmo freelancer se candidata, então o índice único barra com candidatura_duplicada sem detalhe do banco', async () => {
    const id = await publicar();
    const lido = await carregar(id);
    // Simula uma escrita que escapou da trava otimista (não sobe a versão).
    await db()
      .insertInto('candidaturas')
      .values({
        id: randomUUID(),
        trampo_id: id,
        freelancer_id: ANA,
        mensagem: 'gravada direto',
        valor_proposto_centavos: 100,
        status: 'pendente',
        criada_em: relogio.agora(),
      })
      .execute();
    lido.candidatar(ANA, proposta, relogio);

    const erro = await rejeicao(repositorio.salvar(lido));

    expect(erro).toEqual(new ErroDeRegra('candidatura_duplicada'));
    expect((erro as Error).cause).toBeUndefined();
    expect(erro).not.toHaveProperty('detail');
    expect(erro).not.toHaveProperty('constraint');
    // A transação inteira foi desfeita: a versão não subiu.
    expect(await versaoNoBanco(id)).toBe(1);
  });
});

describe('busca (CA7)', () => {
  it('CA7 — Dado trampos variados, quando busca com filtros, então só os abertos que atendem a todos aparecem', async () => {
    const alvo = await publicar({
      titulo: 'Pintura de muro',
      cidade: 'Lavras',
    });
    await publicar({
      titulo: 'Pintura de muro',
      cidade: 'Lavras',
      categoria: 'limpeza',
    });
    await publicar({ titulo: 'Pintura de muro', cidade: 'Perdões' });
    await publicar({
      titulo: 'Conserto de cano',
      descricao: 'Troca de cano na cozinha.',
      cidade: 'Lavras',
    });
    const fechado = await publicar({
      titulo: 'Pintura de muro',
      cidade: 'Lavras',
    });
    const ana = await casos.candidatar(ANA, fechado, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, fechado, ana.id);

    const achados = await casos.buscarTrampos({
      texto: 'PINTURA',
      categoria: 'reformas',
      cidade: '  lavras ',
    });

    expect(achados.map((t) => t.id)).toEqual([alvo]);
    expect(achados[0]).not.toHaveProperty('versao');
    expect(achados[0]).not.toHaveProperty('candidaturas');
  });

  it('CA7 — Dado vários trampos, quando busca, então os mais recentes vêm primeiro, o empate sai por id decrescente e o cursor pagina sem repetir', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push(await publicar({ titulo: `Trampo antigo ${i}` }));
    }
    relogio.avancar(60_000);
    for (let i = 0; i < 2; i += 1) {
      ids.push(await publicar({ titulo: `Trampo recente ${i}` }));
    }
    const recentes = ids.slice(3).sort().reverse();
    const antigos = ids.slice(0, 3).sort().reverse();
    const esperado = [...recentes, ...antigos];

    const pagina1 = await repositorio.buscar({ limite: 2 });
    const ultimo = pagina1.at(-1);
    if (!ultimo) {
      throw new Error('página vazia');
    }
    const pagina2 = await repositorio.buscar({
      limite: 2,
      antesDe: { criadoEm: ultimo.criadoEm, id: ultimo.id },
    });
    const ultimo2 = pagina2.at(-1);
    if (!ultimo2) {
      throw new Error('página vazia');
    }
    const pagina3 = await repositorio.buscar({
      limite: 2,
      antesDe: { criadoEm: ultimo2.criadoEm, id: ultimo2.id },
    });

    expect([...pagina1, ...pagina2, ...pagina3].map((t) => t.id)).toEqual(
      esperado,
    );
    expect(pagina3).toHaveLength(1);
  });

  it('CA7 — `%`, `_` e `\\` no texto são literais, não curingas', async () => {
    const porcento = await publicar({ titulo: 'Desconto de 100% no frete' });
    await publicar({ titulo: 'Desconto de 1000 no frete' });
    const sublinhado = await publicar({ titulo: 'Arquivo nome_final' });
    await publicar({ titulo: 'Arquivo nomeXfinal' });
    const barra = await publicar({ titulo: 'Pasta C:\\obras' });
    await publicar({ titulo: 'Pasta C:obras' });

    const ids = async (texto: string) =>
      (await casos.buscarTrampos({ texto })).map((t) => t.id);

    expect(await ids('100%')).toEqual([porcento]);
    expect(await ids('%')).toEqual([porcento]);
    expect(await ids('e_f')).toEqual([sublinhado]);
    expect(await ids('_')).toEqual([sublinhado]);
    expect(await ids('c:\\o')).toEqual([barra]);
    expect(await ids('\\')).toEqual([barra]);
  });

  it('CA7 — texto com aspas e SQL é só texto (consulta parametrizada)', async () => {
    await publicar();
    expect(await casos.buscarTrampos({ texto: "' or 1=1 --" })).toEqual([]);
  });

  it('cursor com id fora do formato uuid → erro de validação em antesDe', async () => {
    expect(
      await rejeicao(
        repositorio.buscar({
          limite: 5,
          antesDe: { criadoEm: new Date(), id: 'abc' },
        }),
      ),
    ).toEqual(ErroDeValidacao.doCampo('antesDe', 'invalido'));
  });
});

describe('listagens e vínculo', () => {
  it('CA4 — listarDoAutor traz só os do autor, mais recentes primeiro, inclusive os em andamento', async () => {
    const antigo = await publicar();
    relogio.avancar(1000);
    const recente = await publicar();
    await publicar({}, ANA);
    const bruno = await casos.candidatar(BRUNO, antigo, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, antigo, bruno.id);

    expect(
      (await repositorio.listarDoAutor(EMPREGADOR, PAGINA_CHEIA)).map((t) => [
        t.id,
        t.status,
      ]),
    ).toEqual([
      [recente, 'aberto'],
      [antigo, 'em_andamento'],
    ]);
    expect(await repositorio.listarDoAutor('nao-uuid', PAGINA_CHEIA)).toEqual(
      [],
    );
  });

  it('CA8 — listarCandidaturasDoFreelancer traz as dele, em qualquer estado, mais recentes primeiro', async () => {
    const primeiro = await publicar();
    const segundo = await publicar({ titulo: 'Montar armário' });
    const antiga = await casos.candidatar(ANA, primeiro, proposta);
    relogio.avancar(1000);
    const recente = await casos.candidatar(ANA, segundo, proposta);
    await casos.candidatar(BRUNO, primeiro, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, primeiro, antiga.id);

    const minhas = await casos.listarMinhasCandidaturas(ANA);

    expect(minhas.map((c) => [c.id, c.trampoId, c.status])).toEqual([
      [recente.id, segundo, 'pendente'],
      [antiga.id, primeiro, 'aceita'],
    ]);
    expect(await repositorio.listarCandidaturasDoFreelancer('x')).toEqual([]);
  });

  it('existeCandidaturaEntre vale nos dois sentidos e em qualquer estado, e não liga candidatos entre si', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);

    expect(await casos.existeVinculoEntre(EMPREGADOR, ANA)).toBe(true);
    expect(await casos.existeVinculoEntre(ANA, EMPREGADOR)).toBe(true);
    expect(await casos.existeVinculoEntre(BRUNO, EMPREGADOR)).toBe(true);
    expect(await casos.existeVinculoEntre(ANA, BRUNO)).toBe(false);
    expect(await casos.existeVinculoEntre(EMPREGADOR, CARLA)).toBe(false);
    expect(await casos.existeVinculoEntre(EMPREGADOR, EMPREGADOR)).toBe(false);
    expect(await casos.existeVinculoEntre(EMPREGADOR, 'nao-uuid')).toBe(false);
  });

  it('Q1 — a fachada confere o vínculo na transação recebida (a da abertura de conversa), vendo o que só ela vê', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);
    const modulo = criarModuloDeTrampos({
      db: db(),
      verificadorDePerfil: new VerificadorDePerfilEmMemoria(),
    });
    class Desfazer extends Error {}
    const vistos: boolean[] = [];

    await db()
      .transaction()
      .execute(async (trx) => {
        // Apagada só dentro desta transação, ainda sem commit.
        await trx.deleteFrom('candidaturas').execute();
        vistos.push(await modulo.existeVinculoEntre(EMPREGADOR, ANA, trx));
        vistos.push(await modulo.existeVinculoEntre(EMPREGADOR, ANA));
        throw new Desfazer();
      })
      .catch((erro: unknown) => {
        if (!(erro instanceof Desfazer)) {
          throw erro;
        }
      });

    expect(vistos).toEqual([false, true]);
    expect(await modulo.existeVinculoEntre(EMPREGADOR, ANA)).toBe(true);
  });
});

describe('exclusão e exportação da conta (D25, D26, ADR-005)', () => {
  const modulo = () =>
    criarModuloDeTrampos({
      db: db(),
      verificadorDePerfil: new VerificadorDePerfilEmMemoria(),
    });

  /** Captura o erro lançado pela promessa (falha se ela resolver). */
  async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
    try {
      await promessa;
    } catch (erro) {
      return erro;
    }
    throw new Error('era esperada uma recusa');
  }

  async function linhas() {
    const trampos = await db()
      .selectFrom('trampos')
      .select(['id', 'autor_id'])
      .orderBy('id')
      .execute();
    const candidaturas = await db()
      .selectFrom('candidaturas')
      .select(['trampo_id', 'freelancer_id'])
      .orderBy('trampo_id')
      .orderBy('freelancer_id')
      .execute();
    return { trampos, candidaturas };
  }

  /**
   * EMPREGADOR é autor de T1 (com prazo) e T2; ANA se candidata a T1 e
   * BRUNO a T1 e T2. ANA é autora de T3, onde EMPREGADOR se candidata.
   * CARLA é autora de T4, onde BRUNO se candidata (fora de tudo).
   */
  async function cenario() {
    const t1 = await publicar({ prazo: '2026-11-30' });
    relogio.avancar(60_000);
    const t2 = await publicar();
    relogio.avancar(60_000);
    const t3 = await publicar({ titulo: 'Trocar o chuveiro' }, ANA);
    relogio.avancar(60_000);
    const t4 = await publicar({ titulo: 'Montar armário' }, CARLA);
    relogio.avancar(60_000);
    await casos.candidatar(ANA, t1, { ...proposta, mensagem: 'TEXTO-DA-ANA' });
    await casos.candidatar(BRUNO, t1, {
      ...proposta,
      mensagem: 'TEXTO-DO-BRUNO',
    });
    await casos.candidatar(BRUNO, t2, {
      ...proposta,
      mensagem: 'TEXTO-DO-BRUNO',
    });
    relogio.avancar(60_000);
    const doEmpregador = await casos.candidatar(EMPREGADOR, t3, {
      mensagem: 'Proposta do empregador para o chuveiro.',
      valorPropostoCentavos: 12000,
    });
    await casos.candidatar(BRUNO, t4, proposta);
    return { t1, t2, t3, t4, doEmpregador: doEmpregador.id };
  }

  const excluir = (contaId: string) =>
    db()
      .transaction()
      .execute((trx) => modulo().excluirDadosDaConta(trx, contaId));

  it('CA17/CA18 — apaga os trampos da conta com as candidaturas recebidas e as candidaturas que ela fez; o resto fica intacto', async () => {
    const { t3, t4 } = await cenario();

    await excluir(EMPREGADOR);

    expect(await linhas()).toEqual({
      trampos: [
        { id: t3, autor_id: ANA },
        { id: t4, autor_id: CARLA },
      ].sort((x, y) => (x.id < y.id ? -1 : 1)),
      candidaturas: [{ trampo_id: t4, freelancer_id: BRUNO }],
    });
    // Para quem interagiu: some das recebidas, das "minhas" e da busca.
    expect(await casos.listarCandidaturas(ANA, t3)).toEqual([]);
    expect(await repositorio.listarCandidaturasDoFreelancer(ANA)).toEqual([]);
    expect(
      (await repositorio.listarCandidaturasDoFreelancer(BRUNO)).map(
        (c) => c.trampoId,
      ),
    ).toEqual([t4]);
    expect((await casos.buscarTrampos()).map((t) => t.id).sort()).toEqual(
      [t3, t4].sort(),
    );
    expect(await repositorio.listarDoAutor(EMPREGADOR, PAGINA_CHEIA)).toEqual(
      [],
    );
  });

  it('CA18 — candidatura num trampo apagado dá 404', async () => {
    const { t1 } = await cenario();
    await excluir(EMPREGADOR);

    expect(await erroDe(casos.candidatar(CARLA, t1, proposta))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
  });

  it('CA18 — Dado a exclusão com a trava dos trampos já tomada, quando um terceiro se candidata ao mesmo tempo, então ele espera a trava e recebe 404, sem candidatura órfã', async () => {
    const { t1 } = await cenario();
    let concorrente: Promise<Desfecho> | undefined;

    await db()
      .transaction()
      .execute((trx) =>
        modulo().excluirDadosDaConta(
          pausarDepoisDaTrava(trx, 1, async () => {
            concorrente = acompanhar(casos.candidatar(CARLA, t1, proposta));
            await esperarAlguemNaTrava();
          }),
          EMPREGADOR,
        ),
      );

    const resultado = await concorrente;
    expect(resultado?.ok).toBe(false);
    expect(resultado?.ok === false && resultado.erro).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect(await repositorio.listarCandidaturasDoFreelancer(CARLA)).toEqual([]);
    expect(
      (await linhas()).trampos.some((t) => t.autor_id === EMPREGADOR),
    ).toBe(false);
  });

  it('Dado duas contas ligadas (cada uma candidata no trampo da outra), quando as duas se excluem ao mesmo tempo, então a segunda espera a trava da primeira e as duas terminam', async () => {
    const { t4 } = await cenario();
    let daAna: Promise<Desfecho> | undefined;

    await db()
      .transaction()
      .execute((trx) =>
        modulo().excluirDadosDaConta(
          pausarDepoisDaTrava(trx, 2, async () => {
            daAna = acompanhar(excluir(ANA));
            await esperarAlguemNaTrava();
          }),
          EMPREGADOR,
        ),
      );

    expect(await daAna).toEqual({ ok: true, valor: undefined });
    expect(await linhas()).toEqual({
      trampos: [{ id: t4, autor_id: CARLA }],
      candidaturas: [{ trampo_id: t4, freelancer_id: BRUNO }],
    });
  });

  it('não abre transação própria: se a transação da composição desfaz, nada é apagado', async () => {
    await cenario();
    const antes = await linhas();
    class Desfazer extends Error {}

    await expect(
      db()
        .transaction()
        .execute(async (trx) => {
          await excluirDadosDaConta(trx, EMPREGADOR);
          throw new Desfazer();
        }),
    ).rejects.toBeInstanceOf(Desfazer);

    expect(await linhas()).toEqual(antes);
  });

  it('recusa conexão fora de transação e contaId fora do formato uuid, sem apagar nada', async () => {
    await cenario();
    const antes = await linhas();

    expect(await erroDe(excluirDadosDaConta(db(), EMPREGADOR))).toBeInstanceOf(
      TypeError,
    );
    for (const invalido of ['', 'nao-e-uuid', "' or 1=1 --"]) {
      const erro = await erroDe(
        db()
          .transaction()
          .execute((trx) => excluirDadosDaConta(trx, invalido)),
      );
      expect(erro).toBeInstanceOf(TypeError);
    }
    expect(await linhas()).toEqual(antes);
  });

  it('conta sem trampos nem candidaturas (ou segundo pedido): resolve sem erro e não mexe em nada', async () => {
    await cenario();
    const antes = await linhas();

    await excluir(randomUUID());

    expect(await linhas()).toEqual(antes);
  });

  it('CA19 — exporta os trampos da conta com só a contagem das candidaturas recebidas e as candidaturas que ela fez, sem texto de terceiros nem colunas derivadas', async () => {
    const { t1, t2, t3, doEmpregador } = await cenario();

    const exportado = await modulo().exportarDadosDaConta(EMPREGADOR);

    const comum = {
      titulo: 'Pintar a sala',
      descricao: 'Pintura de uma sala de 20 m², tinta inclusa.',
      categoria: 'reformas',
      cidade: 'São Paulo',
      valorCentavos: 50000,
      status: 'aberto',
    };
    expect(exportado).toEqual({
      trampos: [
        {
          id: t1,
          ...comum,
          prazo: '2026-11-30',
          criadoEm: '2026-10-20T12:00:00.000Z',
          candidaturasRecebidas: 2,
        },
        {
          id: t2,
          ...comum,
          prazo: null,
          criadoEm: '2026-10-20T12:01:00.000Z',
          candidaturasRecebidas: 1,
        },
      ],
      candidaturas: [
        {
          id: doEmpregador,
          trampoId: t3,
          mensagem: 'Proposta do empregador para o chuveiro.',
          valorPropostoCentavos: 12000,
          status: 'pendente',
          criadaEm: '2026-10-20T12:05:00.000Z',
        },
      ],
    });
    const json = JSON.stringify(exportado);
    for (const deTerceiro of [
      'TEXTO-DA-ANA',
      'TEXTO-DO-BRUNO',
      ANA,
      BRUNO,
      CARLA,
      'Trocar o chuveiro',
      'sao paulo',
    ]) {
      expect(json).not.toContain(deTerceiro);
    }
  });

  it('CA19 — conta sem nada e id fora do formato exportam listas vazias', async () => {
    await cenario();

    expect(await modulo().exportarDadosDaConta(randomUUID())).toEqual({
      trampos: [],
      candidaturas: [],
    });
    expect(await modulo().exportarDadosDaConta('nao-e-uuid')).toEqual({
      trampos: [],
      candidaturas: [],
    });
  });

  /**
   * O que a medida deve dar, calculado sobre o que a exportação devolve:
   * bytes UTF-8 de cada texto exportado mais 256 por trampo e por
   * candidatura.
   */
  function bytesEsperados(parte: ParteDeTramposNaExportacao): number {
    const bytes = (...textos: string[]) =>
      textos.reduce((soma, texto) => soma + Buffer.byteLength(texto), 256);
    return (
      parte.trampos.reduce(
        (total, t) =>
          total + bytes(t.titulo, t.descricao, t.categoria, t.cidade, t.status),
        0,
      ) +
      parte.candidaturas.reduce(
        (total, c) => total + bytes(c.mensagem, c.status),
        0,
      )
    );
  }

  it('CA48 — mede no banco os bytes dos textos exportados mais 256 por linha, e cresce com o texto', async () => {
    expect(await modulo().medirExportacao(EMPREGADOR)).toBe(0);
    const { t4 } = await cenario();

    const antes = await modulo().medirExportacao(EMPREGADOR);
    expect(antes).toBe(
      bytesEsperados(await modulo().exportarDadosDaConta(EMPREGADOR)),
    );
    // O banco guarda o uuid em minúsculas: a mesma conta, a mesma medida.
    expect(await modulo().medirExportacao(EMPREGADOR.toUpperCase())).toBe(
      antes,
    );

    // Candidatura com dois mil caracteres de dois bytes: a medida é em
    // bytes, não em caracteres.
    await casos.candidatar(EMPREGADOR, t4, {
      ...proposta,
      mensagem: 'ç'.repeat(2000),
    });
    const comCandidatura = await modulo().medirExportacao(EMPREGADOR);
    expect(comCandidatura - antes).toBe(
      4000 + Buffer.byteLength('pendente') + 256,
    );

    await publicar({ descricao: 'd'.repeat(2000) });
    const comTrampo = await modulo().medirExportacao(EMPREGADOR);
    expect(comTrampo).toBeGreaterThan(comCandidatura + 2000);
    expect(comTrampo).toBe(
      bytesEsperados(await modulo().exportarDadosDaConta(EMPREGADOR)),
    );
  });

  it('CA48 — ignora o texto de terceiros: candidaturas recebidas e trampos de outras contas não contam', async () => {
    const { t1 } = await cenario();
    const antes = await modulo().medirExportacao(EMPREGADOR);

    await casos.candidatar(CARLA, t1, {
      ...proposta,
      mensagem: 'TEXTO-DA-CARLA '.repeat(100),
    });
    await publicar({ descricao: 'x'.repeat(2000) }, ANA);

    expect(await modulo().medirExportacao(EMPREGADOR)).toBe(antes);
    for (const conta of [ANA, BRUNO, CARLA]) {
      expect(await modulo().medirExportacao(conta)).toBe(
        bytesEsperados(await modulo().exportarDadosDaConta(conta)),
      );
    }
  });

  it('CA48 — conta sem nada mede 0, e id fora do formato uuid também', async () => {
    await cenario();

    expect(await modulo().medirExportacao(randomUUID())).toBe(0);
    for (const id of ['nao-e-uuid', '', `${EMPREGADOR}' or true --`]) {
      expect(await modulo().medirExportacao(id)).toBe(0);
    }
  });
});

describe('L2 — editar, encerrar, excluir e retirar no Postgres (CA25, CA27 a CA29, ADR-006)', () => {
  const modulo = () =>
    criarModuloDeTrampos({
      db: db(),
      verificadorDePerfil: new VerificadorDePerfilEmMemoria(),
    });

  const excluirConta = (contaId: string) =>
    db()
      .transaction()
      .execute((trx) => modulo().excluirDadosDaConta(trx, contaId));

  async function candidaturasNoBanco(trampoId: string) {
    return db()
      .selectFrom('candidaturas')
      .select(['freelancer_id', 'status', 'mensagem'])
      .where('trampo_id', '=', trampoId)
      .orderBy('criada_em')
      .orderBy('id')
      .execute();
  }

  const edicao = {
    titulo: 'Trocar o piso',
    descricao: 'Piso da cozinha, 12 m².',
    categoria: 'reformas',
    cidade: 'Belo Horizonte',
    valorCentavos: 90000,
    prazo: '2026-12-01',
  };

  describe('achado: candidatura apagada por outra transação não volta', () => {
    it('Dado a conta do candidato excluída entre a leitura e o aceite de outra candidatura, quando o aceite grava, então a candidatura apagada não é inserida de novo', async () => {
      const id = await publicar();
      const ana = await casos.candidatar(ANA, id, proposta);
      relogio.avancar(1000);
      await casos.candidatar(BRUNO, id, {
        ...proposta,
        mensagem: 'TEXTO-DO-BRUNO',
      });
      const lido = await carregar(id);

      // A exclusão da conta do Bruno não mexe na linha do trampo (versão igual).
      await excluirConta(BRUNO);
      lido.aceitar(ana.id, EMPREGADOR);
      await repositorio.salvar(lido);

      expect(await candidaturasNoBanco(id)).toEqual([
        { freelancer_id: ANA, status: 'aceita', mensagem: proposta.mensagem },
      ]);
      expect(await repositorio.listarCandidaturasDoFreelancer(BRUNO)).toEqual(
        [],
      );
      expect((await modulo().exportarDadosDaConta(BRUNO)).candidaturas).toEqual(
        [],
      );
      expect(await casos.existeVinculoEntre(EMPREGADOR, BRUNO)).toBe(false);
    });

    it('Dado a conta do candidato excluída entre a leitura e o encerrar, quando o encerrar grava, então a candidatura apagada não volta e as demais viram recusadas', async () => {
      const id = await publicar();
      await casos.candidatar(ANA, id, proposta);
      relogio.avancar(1000);
      await casos.candidatar(BRUNO, id, proposta);
      const lido = await carregar(id);

      await excluirConta(BRUNO);
      expect(lido.encerrar(EMPREGADOR)).toBe(true);
      await repositorio.salvar(lido);

      expect(await candidaturasNoBanco(id)).toEqual([
        { freelancer_id: ANA, status: 'recusada', mensagem: proposta.mensagem },
      ]);
    });

    it('Dado a exclusão da conta com a candidatura já travada, quando o aceite atualiza o status dela, então espera a trava, não afeta linha nenhuma e não a recria', async () => {
      const id = await publicar();
      const ana = await casos.candidatar(ANA, id, proposta);
      await casos.candidatar(BRUNO, id, proposta);
      let aceite: Promise<Desfecho> | undefined;

      await db()
        .transaction()
        .execute((trx) =>
          modulo().excluirDadosDaConta(
            // 1ª trava: trampos do Bruno (nenhum); 2ª: candidaturas dele.
            pausarDepoisDaTrava(trx, 2, async () => {
              aceite = acompanhar(
                casos.aceitarCandidatura(EMPREGADOR, id, ana.id),
              );
              await esperarAlguemNaTrava();
            }),
            BRUNO,
          ),
        );

      expect(await aceite).toEqual({ ok: true, valor: undefined });
      expect(await candidaturasNoBanco(id)).toEqual([
        { freelancer_id: ANA, status: 'aceita', mensagem: proposta.mensagem },
      ]);
    });

    it('CA29 — Dado duas leituras, quando uma retira a candidatura e a outra aceita a de outro, então a segunda perde a trava e a retirada não volta', async () => {
      const id = await publicar();
      const ana = await casos.candidatar(ANA, id, proposta);
      const bruno = await casos.candidatar(BRUNO, id, proposta);
      const retirada = await carregar(id);
      const aceite = await carregar(id);
      retirada.retirar(bruno.id, BRUNO);
      aceite.aceitar(ana.id, EMPREGADOR);

      await repositorio.salvar(retirada);
      expect(await rejeicao(repositorio.salvar(aceite))).toEqual(
        new ErroDeRegra('conflito_de_versao'),
      );

      expect(
        (await candidaturasNoBanco(id)).map((c) => c.freelancer_id),
      ).toEqual([ANA]);
      // Pelo caso de uso, o aceite relê e grava sem a retirada.
      await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);
      expect(await candidaturasNoBanco(id)).toEqual([
        { freelancer_id: ANA, status: 'aceita', mensagem: proposta.mensagem },
      ]);
    });
  });

  describe('CA25 — editar', () => {
    it('regrava os campos e as colunas de busca, sobe a versão e mantém autor e criado_em; a busca acha o texto novo', async () => {
      const id = await publicar({ prazo: '2026-11-30' });
      relogio.avancar(60_000);

      await casos.editarTrampo(EMPREGADOR, id, { ...edicao, versao: 1 });

      const linha = await db()
        .selectFrom('trampos')
        .select([
          'autor_id',
          'titulo',
          'descricao',
          'cidade',
          'cidade_normalizada',
          'texto_busca',
          'valor_centavos',
          sql<string>`to_char(prazo, 'YYYY-MM-DD')`.as('prazo'),
          'status',
          'versao',
          'criado_em',
        ])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(linha).toEqual({
        autor_id: EMPREGADOR,
        titulo: 'Trocar o piso',
        descricao: 'Piso da cozinha, 12 m².',
        cidade: 'Belo Horizonte',
        cidade_normalizada: 'belo horizonte',
        texto_busca: 'trocar o piso piso da cozinha, 12 m².',
        valor_centavos: 90000,
        prazo: '2026-12-01',
        status: 'aberto',
        versao: 2,
        criado_em: new Date('2026-10-20T12:00:00.000Z'),
      });
      expect(
        (await casos.buscarTrampos({ texto: 'cozinha' })).map((t) => t.id),
      ).toEqual([id]);
      expect(await casos.buscarTrampos({ texto: 'pintar' })).toEqual([]);

      const { prazo: _prazo, ...semPrazo } = edicao;
      await casos.editarTrampo(EMPREGADOR, id, { ...semPrazo, versao: 2 });
      expect((await carregar(id)).dados().prazo).toBeNull();
    });

    it('Dado duas edições com a mesma versão ao mesmo tempo, então uma vence e a outra recebe conflito_de_versao', async () => {
      const id = await publicar();

      const resultados = await Promise.allSettled([
        casos.editarTrampo(EMPREGADOR, id, { ...edicao, versao: 1 }),
        casos.editarTrampo(EMPREGADOR, id, {
          ...edicao,
          titulo: 'Outro título',
          versao: 1,
        }),
      ]);

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(
        1,
      );
      const perdedor = resultados.find((r) => r.status === 'rejected');
      expect((perdedor as PromiseRejectedResult).reason).toEqual(
        new ErroDeRegra('conflito_de_versao'),
      );
      expect(await versaoNoBanco(id)).toBe(2);
    });
  });

  describe('CA27 — encerrar', () => {
    it('grava encerrado e as pendentes como recusadas, tira da busca, e encerrar de novo não sobe a versão', async () => {
      const id = await publicar();
      await casos.candidatar(ANA, id, proposta);
      relogio.avancar(1000);
      await casos.candidatar(BRUNO, id, proposta);

      await casos.encerrarTrampo(EMPREGADOR, id);
      await casos.encerrarTrampo(EMPREGADOR, id);

      expect((await carregar(id)).status).toBe('encerrado');
      expect(await versaoNoBanco(id)).toBe(4);
      expect(
        (await candidaturasNoBanco(id)).map((c) => [c.freelancer_id, c.status]),
      ).toEqual([
        [ANA, 'recusada'],
        [BRUNO, 'recusada'],
      ]);
      expect(await casos.buscarTrampos()).toEqual([]);
      expect(await rejeicao(casos.candidatar(CARLA, id, proposta))).toEqual(
        new ErroDeRegra('trampo_nao_aberto'),
      );
      // Exportação sem mudança de esquema: só um valor novo de `status`.
      expect((await modulo().exportarDadosDaConta(EMPREGADOR)).trampos).toEqual(
        [expect.objectContaining({ id, status: 'encerrado' })],
      );
    });
  });

  describe('CA27 — encerrar com a trava tomada (S1)', () => {
    it('Dado o encerrar com a trava do trampo tomada, quando um freelancer se candidata ao mesmo tempo, então espera a trava e recebe trampo_nao_aberto, sem pendente', async () => {
      const id = await publicar();
      await casos.candidatar(ANA, id, proposta);
      let concorrente: Promise<Desfecho> | undefined;
      const repositorioQuePausa = new RepositorioDeTramposPostgres(
        pausarDepoisDaTrava(db(), 1, async () => {
          concorrente = acompanhar(casos.candidatar(BRUNO, id, proposta));
          await esperarAlguemNaTrava();
        }),
      );

      await criarCasosDeUsoDeTrampos({
        repositorio: repositorioQuePausa,
        verificadorDePerfil: new VerificadorDePerfilEmMemoria([EMPREGADOR]),
        relogio,
      }).encerrarTrampo(EMPREGADOR, id);

      const resultado = await concorrente;
      expect(resultado?.ok === false && resultado.erro).toEqual(
        new ErroDeRegra('trampo_nao_aberto'),
      );
      expect(
        (await candidaturasNoBanco(id)).map((c) => [c.freelancer_id, c.status]),
      ).toEqual([[ANA, 'recusada']]);
      expect(await versaoNoBanco(id)).toBe(3);
    });
  });

  describe('CA28 — excluir', () => {
    it('alterarSobTrava: decide sobre o estado atual (sem olhar versão), apaga o trampo e as candidaturas, e nada muda se decidir lança', async () => {
      const id = await publicar();
      await casos.candidatar(ANA, id, proposta);
      const vistas: number[] = [];

      expect(
        await rejeicao(
          repositorio.alterarSobTrava(id, (trampo) => {
            vistas.push(trampo.versao, trampo.candidaturas.length);
            throw new ErroDeRegra('trampo_nao_aberto');
          }),
        ),
      ).toEqual(new ErroDeRegra('trampo_nao_aberto'));
      expect(vistas).toEqual([2, 1]);
      expect(await candidaturasNoBanco(id)).toHaveLength(1);
      expect(await repositorio.alterarSobTrava(id, () => 'nada')).toBe(true);
      expect(await versaoNoBanco(id)).toBe(2);

      expect(await repositorio.alterarSobTrava(id, () => 'excluir')).toBe(true);
      expect(await repositorio.buscarPorId(id)).toBeNull();
      expect(await candidaturasNoBanco(id)).toEqual([]);
    });

    it('alterarSobTrava: id fora do formato ou inexistente dá false sem chamar decidir', async () => {
      let chamadas = 0;
      const decidir = () => {
        chamadas += 1;
        return 'excluir' as const;
      };

      expect(await repositorio.alterarSobTrava('nao-uuid', decidir)).toBe(
        false,
      );
      expect(await repositorio.alterarSobTrava(randomUUID(), decidir)).toBe(
        false,
      );
      expect(chamadas).toBe(0);
    });

    it('Dado a exclusão com a trava do trampo tomada, quando um freelancer se candidata ao mesmo tempo, então espera a trava e recebe 404, sem candidatura órfã', async () => {
      const id = await publicar();
      await casos.candidatar(ANA, id, proposta);
      let concorrente: Promise<Desfecho> | undefined;
      const repositorioQuePausa = new RepositorioDeTramposPostgres(
        pausarDepoisDaTrava(db(), 1, async () => {
          concorrente = acompanhar(casos.candidatar(BRUNO, id, proposta));
          await esperarAlguemNaTrava();
        }),
      );

      await criarCasosDeUsoDeTrampos({
        repositorio: repositorioQuePausa,
        verificadorDePerfil: new VerificadorDePerfilEmMemoria([EMPREGADOR]),
        relogio,
      }).excluirTrampo(EMPREGADOR, id);

      const resultado = await concorrente;
      expect(resultado?.ok === false && resultado.erro).toBeInstanceOf(
        ErroNaoEncontrado,
      );
      expect(await candidaturasNoBanco(id)).toEqual([]);
      expect(await repositorio.listarCandidaturasDoFreelancer(BRUNO)).toEqual(
        [],
      );
    });

    it('Dado 10 candidaturas chegando durante a exclusão, então cada candidato recebe 201 ou 404 (a gravada antes é apagada junto), a exclusão termina e não sobra candidatura órfã', async () => {
      const freelancers = Array.from({ length: 10 }, () => randomUUID());
      const casosDaCorrida = criarCasosDeUsoDeTrampos({
        repositorio,
        verificadorDePerfil: new VerificadorDePerfilEmMemoria([
          EMPREGADOR,
          ...freelancers,
        ]),
        relogio,
      });
      const id = await publicar();

      const candidaturas = freelancers.map((f) =>
        acompanhar(casosDaCorrida.candidatar(f, id, proposta)),
      );
      // Sem esperar, a exclusão vence sempre (os candidatos ainda conferem o
      // perfil): ela começa quando a primeira candidatura termina, e as
      // demais disputam a trava com ela.
      await Promise.race(candidaturas);
      const exclusao = acompanhar(casosDaCorrida.excluirTrampo(EMPREGADOR, id));
      const resultados = await Promise.all(candidaturas);

      expect(await exclusao).toEqual({ ok: true, valor: undefined });
      for (const [i, resultado] of resultados.entries()) {
        if (!resultado.ok) {
          expect(resultado.erro, `candidato ${i}`).toBeInstanceOf(
            ErroNaoEncontrado,
          );
        }
      }
      // Ao menos a primeira gravou (201) e foi apagada junto com o trampo.
      expect(resultados.filter((r) => r.ok).length).toBeGreaterThan(0);
      expect(await repositorio.buscarPorId(id)).toBeNull();
      const { rows } = await sql<{ total: number }>`
        select count(*)::int as total from candidaturas c
        where not exists (select 1 from trampos t where t.id = c.trampo_id)
           or c.trampo_id = ${id}
      `.execute(db());
      expect(rows[0]?.total).toBe(0);
    });
  });

  describe('S1 — rajada de candidaturas contra encerrar e excluir (D33)', () => {
    const RAJADA = 20;

    /** Dispara 20 candidaturas e, quando a primeira termina, a ação do autor. */
    async function rajadaContra(acao: 'encerrar' | 'excluir') {
      const freelancers = Array.from({ length: RAJADA }, () => randomUUID());
      const casosDaRajada = criarCasosDeUsoDeTrampos({
        repositorio,
        verificadorDePerfil: new VerificadorDePerfilEmMemoria([
          EMPREGADOR,
          ...freelancers,
        ]),
        relogio,
      });
      const id = await publicar();
      const candidaturas = freelancers.map((f) =>
        acompanhar(casosDaRajada.candidatar(f, id, proposta)),
      );
      await Promise.race(candidaturas);
      const doAutor = await acompanhar(
        acao === 'encerrar'
          ? casosDaRajada.encerrarTrampo(EMPREGADOR, id)
          : casosDaRajada.excluirTrampo(EMPREGADOR, id),
      );
      return { id, doAutor, candidatos: await Promise.all(candidaturas) };
    }

    it.each([1, 2, 3, 4, 5])(
      'rodada %i: encerrar sob 20 candidaturas simultâneas nunca dá conflito_de_versao e não sobra pendente',
      async () => {
        const { id, doAutor, candidatos } = await rajadaContra('encerrar');

        expect(doAutor).toEqual({ ok: true, valor: undefined });
        expect((await carregar(id)).status).toBe('encerrado');
        const gravadas = await candidaturasNoBanco(id);
        expect(gravadas.filter((c) => c.status === 'pendente')).toEqual([]);
        expect(gravadas.length).toBe(candidatos.filter((r) => r.ok).length);
      },
    );

    it.each([1, 2, 3, 4, 5])(
      'rodada %i: excluir sob 20 candidaturas simultâneas nunca dá conflito_de_versao e não sobra candidatura',
      async () => {
        const { id, doAutor } = await rajadaContra('excluir');

        expect(doAutor).toEqual({ ok: true, valor: undefined });
        expect(await repositorio.buscarPorId(id)).toBeNull();
        expect(await candidaturasNoBanco(id)).toEqual([]);
      },
    );
  });

  describe('CA29 — retirar', () => {
    it('apaga a linha e o freelancer se candidata de novo (o índice único não barra)', async () => {
      const id = await publicar();
      const ana = await casos.candidatar(ANA, id, proposta);

      expect(await repositorio.trampoDaCandidatura(ana.id)).toBe(id);
      await casos.retirarCandidatura(ANA, ana.id);
      expect(await candidaturasNoBanco(id)).toEqual([]);
      expect(await repositorio.trampoDaCandidatura(ana.id)).toBeNull();

      const deNovo = await casos.candidatar(ANA, id, {
        ...proposta,
        mensagem: 'Agora sim.',
      });
      expect(deNovo.id).not.toBe(ana.id);
      expect(await candidaturasNoBanco(id)).toEqual([
        { freelancer_id: ANA, status: 'pendente', mensagem: 'Agora sim.' },
      ]);
      expect(await versaoNoBanco(id)).toBe(4);
    });

    it('trampoDaCandidatura: id fora do formato ou inexistente dá null', async () => {
      expect(await repositorio.trampoDaCandidatura('nao-uuid')).toBeNull();
      expect(await repositorio.trampoDaCandidatura(randomUUID())).toBeNull();
    });
  });

  describe('CA65 — retirar sob a trava do trampo (D49)', () => {
    it('Dado a retirada com a trava do trampo tomada, quando um freelancer se candidata e o autor aceita ao mesmo tempo, então os dois esperam a trava: a candidatura grava depois e o aceite recebe 404', async () => {
      const id = await publicar();
      const ana = await casos.candidatar(ANA, id, proposta);
      let candidatura: Promise<Desfecho> | undefined;
      let aceite: Promise<Desfecho> | undefined;
      const repositorioQuePausa = new RepositorioDeTramposPostgres(
        pausarDepoisDaTrava(db(), 1, async () => {
          candidatura = acompanhar(casos.candidatar(BRUNO, id, proposta));
          aceite = acompanhar(casos.aceitarCandidatura(EMPREGADOR, id, ana.id));
          await esperarAlguemNaTrava(2);
        }),
      );

      await criarCasosDeUsoDeTrampos({
        repositorio: repositorioQuePausa,
        verificadorDePerfil: new VerificadorDePerfilEmMemoria(),
        relogio,
      }).retirarCandidatura(ANA, ana.id);

      expect((await candidatura)?.ok).toBe(true);
      const desfechoDoAceite = await aceite;
      expect(
        desfechoDoAceite?.ok === false && desfechoDoAceite.erro,
      ).toBeInstanceOf(ErroNaoEncontrado);
      expect(await candidaturasNoBanco(id)).toEqual([
        {
          freelancer_id: BRUNO,
          status: 'pendente',
          mensagem: proposta.mensagem,
        },
      ]);
      expect((await carregar(id)).status).toBe('aberto');
      expect(await repositorio.trampoDaCandidatura(ana.id)).toBeNull();
    });

    const RAJADA = 20;

    it.each([1, 2, 3, 4, 5])(
      'rodada %i: retirar no meio de 20 candidaturas simultâneas sempre dá certo (nunca conflito_de_versao), sem órfã e sem a retirada de volta',
      async () => {
        const freelancers = Array.from({ length: RAJADA }, () => randomUUID());
        const casosDaRajada = criarCasosDeUsoDeTrampos({
          repositorio,
          verificadorDePerfil: new VerificadorDePerfilEmMemoria(freelancers),
          relogio,
        });
        const id = await publicar();
        const ana = await casos.candidatar(ANA, id, proposta);

        const candidaturas = freelancers.map((f) =>
          acompanhar(casosDaRajada.candidatar(f, id, proposta)),
        );
        await Promise.race(candidaturas);
        const retirada = await acompanhar(
          casosDaRajada.retirarCandidatura(ANA, ana.id),
        );
        const candidatos = await Promise.all(candidaturas);

        expect(retirada).toEqual({ ok: true, valor: undefined });
        // Candidatar segue no retry otimista (até 10 vezes): quem perde todas
        // as rodadas recebe conflito_de_versao, nunca outro erro.
        for (const [i, resultado] of candidatos.entries()) {
          if (!resultado.ok) {
            expect(resultado.erro, `candidato ${i}`).toEqual(
              new ErroDeRegra('conflito_de_versao'),
            );
          }
        }
        const gravadas = await candidaturasNoBanco(id);
        expect(gravadas.map((c) => c.freelancer_id)).not.toContain(ANA);
        expect(gravadas.length).toBe(candidatos.filter((r) => r.ok).length);
        expect(gravadas.every((c) => c.status === 'pendente')).toBe(true);
        expect(await repositorio.trampoDaCandidatura(ana.id)).toBeNull();
        const { rows } = await sql<{ total: number }>`
          select count(*)::int as total from candidaturas c
          where not exists (select 1 from trampos t where t.id = c.trampo_id)
        `.execute(db());
        expect(rows[0]?.total).toBe(0);
      },
    );
  });

  describe('CA31 — listarDoAutor na visão do autor', () => {
    it('traz a versão e a contagem de candidaturas em qualquer estado, inclusive dos encerrados', async () => {
      const antigo = await publicar();
      relogio.avancar(1000);
      const meio = await publicar();
      relogio.avancar(1000);
      const recente = await publicar();
      await publicar({}, ANA);
      const ana = await casos.candidatar(ANA, antigo, proposta);
      await casos.candidatar(BRUNO, antigo, proposta);
      await casos.aceitarCandidatura(EMPREGADOR, antigo, ana.id);
      await casos.candidatar(CARLA, meio, proposta);
      await casos.encerrarTrampo(EMPREGADOR, meio);

      expect(
        (await repositorio.listarDoAutor(EMPREGADOR, PAGINA_CHEIA)).map((t) => [
          t.id,
          t.status,
          t.versao,
          t.candidaturasRecebidas,
        ]),
      ).toEqual([
        [recente, 'aberto', 1, 0],
        [meio, 'encerrado', 3, 1],
        [antigo, 'em_andamento', 4, 2],
      ]);
      const [primeiro] = await repositorio.listarDoAutor(
        EMPREGADOR,
        PAGINA_CHEIA,
      );
      expect(primeiro).toEqual((await carregar(recente)).resumoDoAutor());
    });
  });

  describe('CA66 — listarDoAutor paginado', () => {
    /** Ids de todas as páginas de 20, seguindo o cursor do último item. */
    async function paginasDoAutor(autor: string): Promise<string[][]> {
      const paginas: string[][] = [];
      let entrada: Parameters<CasosDeUsoDeTrampos['listarMeusTrampos']>[1] = {};
      for (let volta = 0; volta < 10; volta += 1) {
        const pagina = await casos.listarMeusTrampos(autor, entrada);
        paginas.push(pagina.map((t) => t.id));
        const ultimo = pagina.at(-1);
        if (pagina.length < 20 || ultimo === undefined) {
          return paginas;
        }
        entrada = {
          antesDeCriadoEm: ultimo.criadoEm.toISOString(),
          antesDeId: ultimo.id,
        };
      }
      throw new Error('paginação sem fim');
    }

    it('Dado 45 trampos, 30 deles no mesmo milissegundo, quando o autor pagina de 20 em 20, então vê 20, 20 e 5, sem repetir nem pular, na ordem (criadoEm, id) decrescente', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 45; i += 1) {
        // Os 15 primeiros em milissegundos distintos; os outros 30 empatam.
        if (i < 15) {
          relogio.avancar(1);
        }
        ids.push(await publicar({ titulo: `Trampo número ${i}` }));
        await publicar({ titulo: `Do outro ${i}` }, ANA);
      }
      // Ordem esperada calculada à parte: uuid em minúsculas compara como o
      // `uuid` do Postgres (byte a byte).
      const { rows: criados } = await sql<{ id: string; criado_em: Date }>`
        select id::text, criado_em from trampos where autor_id = ${EMPREGADOR}
      `.execute(db());
      const ordemEsperada = criados
        .sort((a, b) => {
          const diferenca = b.criado_em.getTime() - a.criado_em.getTime();
          return diferenca !== 0 ? diferenca : a.id > b.id ? -1 : 1;
        })
        .map((t) => t.id);
      expect([...ordemEsperada].sort()).toEqual([...ids].sort());

      const paginas = await paginasDoAutor(EMPREGADOR);

      expect(paginas.map((p) => p.length)).toEqual([20, 20, 5]);
      expect(paginas.flat()).toEqual(ordemEsperada);
      expect(new Set(paginas.flat()).size).toBe(45);
    });

    it('Dado o cursor de um trampo de outra conta, quando o autor pede a página, então só vem trampo dele, mais antigo que o cursor', async () => {
      const antigo = await publicar();
      relogio.avancar(1000);
      const doOutro = await publicar({}, ANA);
      relogio.avancar(1000);
      await publicar();
      const cursor = (await carregar(doOutro)).resumo();

      const pagina = await repositorio.listarDoAutor(EMPREGADOR, {
        limite: 20,
        antesDe: { criadoEm: cursor.criadoEm, id: cursor.id },
      });

      expect(pagina.map((t) => [t.id, t.autorId])).toEqual([
        [antigo, EMPREGADOR],
      ]);
      expect(pagina[0]).toEqual((await carregar(antigo)).resumoDoAutor());
    });

    it('Dado o limite, quando lista, então traz no máximo esse número, os mais recentes', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        relogio.avancar(1000);
        ids.push(await publicar());
      }

      expect(
        (await repositorio.listarDoAutor(EMPREGADOR, { limite: 2 })).map(
          (t) => t.id,
        ),
      ).toEqual([ids[2], ids[1]]);
    });

    it('Dado um cursor com id fora do formato uuid, quando lista, então recusa sem consultar (antesDe inválido)', async () => {
      await publicar();

      expect(
        await rejeicao(
          repositorio.listarDoAutor(EMPREGADOR, {
            limite: 20,
            antesDe: { criadoEm: new Date(), id: 'abc' },
          }),
        ),
      ).toEqual(ErroDeValidacao.doCampo('antesDe', 'invalido'));
    });
  });
});
