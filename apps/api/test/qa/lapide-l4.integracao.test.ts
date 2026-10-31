/**
 * QA da L4 (CA67, S5): a lápide cuja exclusão falha não segura as outras. A
 * falha é real, no Postgres de teste: um gatilho temporário recusa o
 * `DELETE` do perfil marcado com `FALHA-QA-L4`, então o `excluirTudo` da conta
 * marcada desfaz a transação e lança. O relógio é o `RelogioFixo` da aplicação.
 *
 * Mexe em DDL do banco de teste (cria e remove o gatilho): rode este arquivo
 * sozinho, nunca junto de outra suíte de integração.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { RelogioFixo } from '../../src/compartilhado/dominio/relogio.js';
import type { Aplicacao } from '../../src/composicao.js';
import { bancoDeTeste } from '../banco-teste.js';
import { montar } from './apoio.js';
import {
  contar,
  gravarLapide,
  lapides,
  limparBancoL3,
  MINUTO,
  restosDa,
  trampoDireto,
} from './apoio-l3.js';

const NOME_QUE_FALHA = 'FALHA-QA-L4';
const HORA = 60 * MINUTO;
const ESPERA_APOS_FALHA = 6 * HORA;
const POR_RODADA = 100;

let aplicacao: Aplicacao | undefined;
let relogio: RelogioFixo;

function app(): Aplicacao {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao;
}

async function ligarFalha(): Promise<void> {
  await sql`create or replace function qa_l4_falha() returns trigger
    language plpgsql as $$ begin raise exception 'falha-injetada-qa-l4'; end $$`.execute(
    bancoDeTeste(),
  );
  await sql`drop trigger if exists qa_l4_falha on perfis`.execute(
    bancoDeTeste(),
  );
  await sql`create trigger qa_l4_falha before delete on perfis
    for each row when (old.nome = ${sql.lit(NOME_QUE_FALHA)})
    execute function qa_l4_falha()`.execute(bancoDeTeste());
}

async function desligarFalha(): Promise<void> {
  await sql`drop trigger if exists qa_l4_falha on perfis`.execute(
    bancoDeTeste(),
  );
  await sql`drop function if exists qa_l4_falha()`.execute(bancoDeTeste());
}

/** Lápide de `minutos` atrás; com `quebra`, a conta tem um perfil que o gatilho recusa apagar. */
async function lapideComResto(
  minutos: number,
  quebra: boolean,
): Promise<string> {
  const id = randomUUID();
  await gravarLapide(
    id,
    new Date(relogio.agora().getTime() - minutos * MINUTO),
  );
  await sql`insert into perfis (conta_id, nome, cidade, cidade_normalizada,
      habilidades, atualizado_em)
    values (${id}::uuid, ${quebra ? NOME_QUE_FALHA : 'Perfil órfão'}, 'Lavras',
      'lavras', array['pintura'], now())`.execute(bancoDeTeste());
  await trampoDireto(id);
  return id;
}

beforeAll(async () => {
  await ligarFalha();
});

afterAll(async () => {
  await desligarFalha();
});

beforeEach(async () => {
  await limparBancoL3();
  relogio = new RelogioFixo(new Date());
  aplicacao = await montar({ relogio });
});

afterEach(async () => {
  await aplicacao?.fechar();
  aplicacao = undefined;
  await limparBancoL3();
});

describe('CA67 — a lápide que falha não segura as outras', () => {
  it('Dadas 3 lápides que falham e 3 que não, mais antigas as que falham, quando a limpeza roda, então as 3 boas saem na mesma rodada, as 3 ruins ficam e o erro não leva o id da conta', async () => {
    const ruins = [
      await lapideComResto(60, true),
      await lapideComResto(59, true),
      await lapideComResto(58, true),
    ];
    const boas = [
      await lapideComResto(30, false),
      await lapideComResto(29, false),
      await lapideComResto(28, false),
    ];

    const erro = await app()
      .limparRegistrosVencidos()
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(erro).toBeInstanceOf(Error);
    const texto = String((erro as Error).message);
    for (const id of [...ruins, ...boas]) {
      expect(texto).not.toContain(id);
    }
    expect((await lapides()).map((l) => l.id).sort()).toEqual(
      [...ruins].sort(),
    );
    for (const id of boas) {
      expect(await restosDa(id)).toMatchObject({ perfis: 0, trampos: 0 });
    }
    for (const id of ruins) {
      expect(await restosDa(id)).toMatchObject({ perfis: 1, trampos: 1 });
    }
  });

  it(`Dadas ${POR_RODADA} lápides que falham e uma boa mais nova, quando a limpeza roda duas vezes, então a segunda rodada pula as ruins, não lança e revarre a boa`, async () => {
    const ruins: string[] = [];
    for (let i = 0; i < POR_RODADA; i += 1) {
      ruins.push(await lapideComResto(600 - i, true));
    }
    const boa = await lapideComResto(20, false);

    const primeira = await app()
      .limparRegistrosVencidos()
      .then(
        () => 'resolveu',
        () => 'rejeitou',
      );
    expect(primeira).toBe('rejeitou');
    expect(await restosDa(boa)).toMatchObject({ perfis: 1 });

    const segunda = await app().limparRegistrosVencidos();
    expect(segunda).toEqual({ sessoes: 0, contasRevarridas: 1 });
    expect(await restosDa(boa)).toMatchObject({ perfis: 0, trampos: 0 });
    expect(await contar('contas_excluidas')).toBe(POR_RODADA);
    expect((await lapides()).map((l) => l.id).sort()).toEqual(
      [...ruins].sort(),
    );
  }, 120_000);

  it('Dada a lápide que falhou, quando a falha passa e as 6 h se completam, então ela é tentada de novo e some; 1 ms antes, continua em espera', async () => {
    const ruim = await lapideComResto(30, true);
    await app()
      .limparRegistrosVencidos()
      .catch(() => undefined);
    expect(await lapides()).toHaveLength(1);

    // O resto deixa de ser recusado (alguém limpou o perfil por fora).
    await sql`alter table perfis disable trigger qa_l4_falha`.execute(
      bancoDeTeste(),
    );
    try {
      relogio.avancar(ESPERA_APOS_FALHA - 1);
      expect(await app().limparRegistrosVencidos()).toEqual({
        sessoes: 0,
        contasRevarridas: 0,
      });
      expect(await lapides()).toHaveLength(1);

      relogio.avancar(1);
      expect(await app().limparRegistrosVencidos()).toEqual({
        sessoes: 0,
        contasRevarridas: 1,
      });
      expect(await lapides()).toEqual([]);
      expect(await restosDa(ruim)).toMatchObject({ perfis: 0, trampos: 0 });
    } finally {
      await sql`alter table perfis enable trigger qa_l4_falha`.execute(
        bancoDeTeste(),
      );
    }
  });

  it('Dada a lápide que falhou e voltou a falhar depois das 6 h, quando a limpeza roda, então ela espera outras 6 h a partir da nova falha', async () => {
    await lapideComResto(30, true);
    await app()
      .limparRegistrosVencidos()
      .catch(() => undefined);

    relogio.avancar(ESPERA_APOS_FALHA);
    // Volta a ser tentada, falha de novo e entra em nova espera.
    const volta = await app()
      .limparRegistrosVencidos()
      .then(
        () => 'resolveu',
        () => 'rejeitou',
      );
    expect(volta).toBe('rejeitou');

    relogio.avancar(ESPERA_APOS_FALHA - 1);
    expect(await app().limparRegistrosVencidos()).toEqual({
      sessoes: 0,
      contasRevarridas: 0,
    });
    relogio.avancar(1);
    const denovo = await app()
      .limparRegistrosVencidos()
      .then(
        () => 'resolveu',
        () => 'rejeitou',
      );
    expect(denovo).toBe('rejeitou');
  });

  it('Dada a espera da lápide, quando outra réplica (outra aplicação) roda a limpeza, então ela ainda tenta a lápide, e o que falhar lá fica em espera só lá', async () => {
    await lapideComResto(30, true);
    await app()
      .limparRegistrosVencidos()
      .catch(() => undefined);

    const outra = await montar({ relogio });
    try {
      const resultado = await outra.limparRegistrosVencidos().then(
        () => 'resolveu',
        () => 'rejeitou',
      );
      expect(resultado).toBe('rejeitou');
    } finally {
      await outra.fechar();
    }
    expect(await lapides()).toHaveLength(1);
  });
});
