import { createHash, randomUUID } from 'node:crypto';
import { type Kysely, type KyselyPlugin, sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { down, up } from '../../../../../migracoes/0001_contas.js';
import {
  down as down0007,
  up as up0007,
} from '../../../../../migracoes/0007_contas_excluidas.js';
import {
  down as down0008,
  up as up0008,
} from '../../../../../migracoes/0008_tentativas_de_entrada.js';
import {
  bancoDeTeste,
  truncarTabelas,
} from '../../../../../test/banco-teste.js';
import { ErroTabelaNaoVazia } from '../../../../compartilhado/banco/migrador.js';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarLogger } from '../../../../compartilhado/http/logger.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import {
  ESPERA_DA_LAPIDE_MS,
  SESSOES_POR_LOTE,
} from '../../aplicacao/casos-de-uso.js';
import { Conta } from '../../dominio/conta.js';
import { Email } from '../../dominio/email.js';
import { HasherScrypt } from '../../dominio/hasher.js';
import {
  type DadosDaConta,
  ErroDeEmailDuplicado,
  type HasherDeSenha,
} from '../../dominio/portas.js';
import { criarModuloDeContas, type ModuloDeContas } from '../../index.js';
import { PARTES_VAZIAS } from '../memoria/repositorios-memoria.js';
import {
  excluirRegistrosDaConta,
  RepositorioDeContasExcluidasPostgres,
  RepositorioDeContasPostgres,
  RepositorioDeSessoesPostgres,
  RepositorioDeTentativasDeEntradaPostgres,
} from './repositorios-postgres.js';
import type { TabelasDeContas } from './tabelas.js';

const EMAIL = 'maria.silva@exemplo.com';
const SENHA = 'segredo-123';
const AGORA = new Date('2026-10-20T12:00:00.000Z');
const UM_DIA_MS = 24 * 60 * 60 * 1000;

function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

function novaConta(email = EMAIL): Conta {
  return Conta.criar({
    email: Email.criar(email),
    senhaHash: 'scrypt$16$8$1$c2FsdA==$aGFzaA==',
    criadaEm: AGORA,
  });
}

/** Captura o erro lançado pela promessa (falha se ela resolver). */
async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('era esperada uma recusa');
}

async function tabelasExistem(db: Kysely<unknown>): Promise<string[]> {
  const { rows } = await sql<{ nome: string }>`
    select table_name as nome from information_schema.tables
    where table_schema = current_schema()
      and table_name in ('contas', 'sessoes')
    order by table_name`.execute(db);
  return rows.map((r) => r.nome);
}

/** Repete `condicao` até ela valer (no máximo ~5 s). */
async function esperarAte(condicao: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 500; i += 1) {
    if (await condicao()) {
      return;
    }
    await new Promise((resolver) => setTimeout(resolver, 10));
  }
  throw new Error('a condição não chegou a valer');
}

describe('contas no Postgres', () => {
  const db = () => bancoDeTeste<TabelasDeContas>();
  // As migrações recebem `Kysely<unknown>`, como no migrador.
  const dbDaMigracao = () => bancoDeTeste<unknown>();
  let contas: RepositorioDeContasPostgres;
  let sessoes: RepositorioDeSessoesPostgres;

  beforeEach(async () => {
    await truncarTabelas([
      'tentativas_de_entrada',
      'sessoes',
      'contas',
      'contas_excluidas',
    ]);
    contas = new RepositorioDeContasPostgres(db());
    sessoes = new RepositorioDeSessoesPostgres(db());
  });

  describe('RepositorioDeContasPostgres', () => {
    it('ida e volta: grava e lê a conta pelo e-mail', async () => {
      const conta = novaConta();
      await contas.salvar(conta);

      const lida = await contas.buscarPorEmail(Email.criar(EMAIL));

      expect(lida?.id).toBe(conta.id);
      expect(lida?.email.valor).toBe(EMAIL);
      expect(lida?.senhaHash).toBe(conta.senhaHash);
      expect(lida?.criadaEm.toISOString()).toBe(AGORA.toISOString());
      expect(await contas.existeEmail(Email.criar(EMAIL))).toBe(true);
    });

    it('e-mail sem conta: buscarPorEmail devolve null e existeEmail, false', async () => {
      await contas.salvar(novaConta());
      const outro = Email.criar('outra.pessoa@exemplo.com');

      expect(await contas.buscarPorEmail(outro)).toBeNull();
      expect(await contas.existeEmail(outro)).toBe(false);
    });

    it('CA2/CA15 — o 23505 em contas_email_key vira ErroDeEmailDuplicado, sem o e-mail nem o erro do driver', async () => {
      await contas.salvar(novaConta());

      const erro = await erroDe(
        contas.salvar(novaConta(' Maria.Silva@EXEMPLO.com')),
      );

      expect(erro).toBeInstanceOf(ErroDeEmailDuplicado);
      const duplicado = erro as ErroDeEmailDuplicado;
      expect(duplicado.cause).toBeUndefined();
      // Só o `name`: nada de `detail`, `code`, `constraint` do driver.
      expect(Object.keys(duplicado)).toEqual(['name']);
      expect(duplicado.message).not.toContain(EMAIL);
      expect(JSON.stringify(duplicado)).not.toContain(EMAIL);
      expect(duplicado.stack ?? '').not.toContain(EMAIL);
      expect(await contas.existeEmail(Email.criar(EMAIL))).toBe(true);
    });

    describe('S7 — conta e sessão inicial numa transação (CA44)', () => {
      const inicial = {
        tokenHash: sha256('token-do-cadastro'),
        expiraEm: new Date(AGORA.getTime() + UM_DIA_MS),
      };

      it('CA44 — grava a conta e a sessão inicial juntas', async () => {
        const conta = novaConta();

        await contas.salvar(conta, inicial);

        expect(await contas.existeEmail(Email.criar(EMAIL))).toBe(true);
        expect(
          await sessoes.buscarContaIdPorTokenHash(inicial.tokenHash, AGORA),
        ).toBe(conta.id);
      });

      it('CA44 — Dada uma falha ao gravar a sessão, então nada fica gravado: zero contas e zero sessões', async () => {
        const erro = await erroDe(
          contas.salvar(novaConta(), {
            tokenHash: 'token-em-texto-puro',
            expiraEm: inicial.expiraEm,
          }),
        );

        expect(erro).toMatchObject({ constraint: 'sessoes_token_hash_sha256' });
        expect(await db().selectFrom('contas').select('id').execute()).toEqual(
          [],
        );
        expect(
          await db().selectFrom('sessoes').select('token_hash').execute(),
        ).toEqual([]);
      });

      it('CA44 — e-mail repetido com sessão inicial: ErroDeEmailDuplicado, e a sessão nova não fica', async () => {
        const primeira = novaConta();
        await contas.salvar(primeira);

        const erro = await erroDe(
          contas.salvar(novaConta(' Maria.Silva@EXEMPLO.com'), inicial),
        );

        expect(erro).toBeInstanceOf(ErroDeEmailDuplicado);
        expect(
          await db().selectFrom('sessoes').select('token_hash').execute(),
        ).toEqual([]);
        expect(await db().selectFrom('contas').select('id').execute()).toEqual([
          { id: primeira.id },
        ]);
      });
    });

    it('buscarPorId: ida e volta pelo id; id desconhecido ou fora do formato devolve null sem erro do banco', async () => {
      const conta = novaConta();
      await contas.salvar(conta);
      await contas.salvar(novaConta('outra.pessoa@exemplo.com'));

      const lida = await contas.buscarPorId(conta.id);

      expect(lida?.id).toBe(conta.id);
      expect(lida?.email.valor).toBe(EMAIL);
      expect(lida?.senhaHash).toBe(conta.senhaHash);
      expect(lida?.criadaEm.toISOString()).toBe(AGORA.toISOString());
      expect(await contas.buscarPorId(randomUUID())).toBeNull();
      for (const invalido of ['nao-e-uuid', '', `${conta.id}x`, "' or 1=1"]) {
        expect(await contas.buscarPorId(invalido)).toBeNull();
      }
    });

    it('S6 — buscarPorId lê um e-mail gravado que a regra de formato atual recusaria, sem lançar', async () => {
      // Conta gravada por uma regra antiga: o e-mail não passa em `Email.criar`.
      const conta = novaConta();
      const antigo = 'maria silva@exemplo';
      expect(Email.validar(antigo)).not.toBeNull();
      await db()
        .insertInto('contas')
        .values({
          id: conta.id,
          email: antigo,
          senha_hash: conta.senhaHash,
          criada_em: AGORA,
        })
        .execute();

      const lida = await contas.buscarPorId(conta.id);

      expect(lida?.id).toBe(conta.id);
      expect(lida?.email.valor).toBe(antigo);
    });

    it('outra violação de unicidade (id repetido) sobe como está', async () => {
      const conta = novaConta();
      await contas.salvar(conta);
      const mesmoId = Conta.reconstituir({
        id: conta.id,
        email: Email.criar('outra.pessoa@exemplo.com'),
        senhaHash: conta.senhaHash,
        criadaEm: AGORA,
      });

      const erro = await erroDe(contas.salvar(mesmoId));

      expect(erro).not.toBeInstanceOf(ErroDeEmailDuplicado);
      expect(erro).toMatchObject({ code: '23505', constraint: 'contas_pkey' });
    });
  });

  describe('RepositorioDeSessoesPostgres', () => {
    let contaId: string;
    const hash = sha256('token-de-teste');

    beforeEach(async () => {
      const conta = novaConta();
      await contas.salvar(conta);
      contaId = conta.id;
    });

    it('grava só o hash e devolve a conta enquanto a sessão vale', async () => {
      await sessoes.salvar(
        hash,
        contaId,
        new Date(AGORA.getTime() + UM_DIA_MS),
      );

      expect(await sessoes.buscarContaIdPorTokenHash(hash, AGORA)).toBe(
        contaId,
      );
      const linhas = await db().selectFrom('sessoes').selectAll().execute();
      expect(linhas).toHaveLength(1);
      expect(linhas[0]?.token_hash).toBe(hash);
      expect(linhas[0]?.criada_em).toBeInstanceOf(Date);
    });

    it('sessão expirada (ou expirando agora) não é devolvida', async () => {
      await sessoes.salvar(hash, contaId, AGORA);

      expect(await sessoes.buscarContaIdPorTokenHash(hash, AGORA)).toBeNull();
      expect(
        await sessoes.buscarContaIdPorTokenHash(
          hash,
          new Date(AGORA.getTime() + 1),
        ),
      ).toBeNull();
      expect(
        await sessoes.buscarContaIdPorTokenHash(
          hash,
          new Date(AGORA.getTime() - 1),
        ),
      ).toBe(contaId);
    });

    it('hash desconhecido: null', async () => {
      expect(
        await sessoes.buscarContaIdPorTokenHash(sha256('outro'), AGORA),
      ).toBeNull();
    });

    it('remover apaga a sessão e é idempotente', async () => {
      const outro = sha256('outro-token');
      const expiraEm = new Date(AGORA.getTime() + UM_DIA_MS);
      await sessoes.salvar(hash, contaId, expiraEm);
      await sessoes.salvar(outro, contaId, expiraEm);

      await sessoes.remover(hash);
      await sessoes.remover(hash);
      await sessoes.remover(sha256('nunca-existiu'));

      expect(await sessoes.buscarContaIdPorTokenHash(hash, AGORA)).toBeNull();
      expect(await sessoes.buscarContaIdPorTokenHash(outro, AGORA)).toBe(
        contaId,
      );
    });

    it('listarDaConta: todas as sessões da conta (inclusive a expirada), da mais antiga à mais nova, só com as datas', async () => {
      const outra = novaConta('outra.pessoa@exemplo.com');
      await contas.salvar(outra);
      const primeira = new Date(AGORA.getTime() + UM_DIA_MS);
      const expirada = new Date(AGORA.getTime() - UM_DIA_MS);
      await sessoes.salvar(hash, contaId, primeira);
      await sessoes.salvar(sha256('segundo'), contaId, expirada);
      await sessoes.salvar(sha256('da-outra'), outra.id, primeira);

      const lista = await sessoes.listarDaConta(contaId);

      expect(lista.map((s) => s.expiraEm.toISOString())).toEqual([
        primeira.toISOString(),
        expirada.toISOString(),
      ]);
      for (const sessao of lista) {
        expect(Object.keys(sessao)).toEqual(['criadaEm', 'expiraEm']);
        expect(sessao.criadaEm).toBeInstanceOf(Date);
      }
      expect(lista[0]?.criadaEm.getTime()).toBeLessThanOrEqual(
        lista[1]?.criadaEm.getTime() ?? 0,
      );
      expect(await sessoes.listarDaConta(randomUUID())).toEqual([]);
      expect(await sessoes.listarDaConta('nao-e-uuid')).toEqual([]);
    });

    it('o banco recusa gravar algo que não é um SHA-256 em hex', async () => {
      const erro = await erroDe(
        sessoes.salvar('token-em-texto-puro', contaId, AGORA),
      );

      expect(erro).toMatchObject({
        code: '23514',
        constraint: 'sessoes_token_hash_sha256',
      });
    });
  });

  describe('excluirRegistrosDaConta (D25)', () => {
    let alvo: Conta;
    let outra: Conta;
    const expiraEm = new Date(AGORA.getTime() + UM_DIA_MS);

    beforeEach(async () => {
      alvo = novaConta();
      outra = novaConta('outra.pessoa@exemplo.com');
      await contas.salvar(alvo);
      await contas.salvar(outra);
      await sessoes.salvar(sha256('alvo-1'), alvo.id, expiraEm);
      await sessoes.salvar(sha256('alvo-2'), alvo.id, expiraEm);
      await sessoes.salvar(sha256('outra-1'), outra.id, expiraEm);
    });

    async function contasGravadas(): Promise<string[]> {
      const linhas = await db().selectFrom('contas').select('id').execute();
      return linhas.map((l) => l.id).sort();
    }

    async function sessoesGravadas(): Promise<string[]> {
      const linhas = await db()
        .selectFrom('sessoes')
        .select('conta_id')
        .execute();
      return linhas.map((l) => l.conta_id).sort();
    }

    it('CA17 — dentro da transação, apaga a conta e todas as sessões dela; a outra conta e as sessões dela ficam', async () => {
      await db()
        .transaction()
        .execute((trx) => excluirRegistrosDaConta(trx, alvo.id, AGORA));

      expect(await contasGravadas()).toEqual([outra.id]);
      expect(await sessoesGravadas()).toEqual([outra.id]);
      expect(
        await sessoes.buscarContaIdPorTokenHash(sha256('alvo-1'), AGORA),
      ).toBeNull();
      expect(
        await sessoes.buscarContaIdPorTokenHash(sha256('outra-1'), AGORA),
      ).toBe(outra.id);
    });

    it('não abre transação própria: se a transação de fora desfaz, nada é apagado', async () => {
      const desfazer = new Error('desfazer');

      const erro = await erroDe(
        db()
          .transaction()
          .execute(async (trx) => {
            await excluirRegistrosDaConta(trx, alvo.id, AGORA);
            throw desfazer;
          }),
      );

      expect(erro).toBe(desfazer);
      expect(await contasGravadas()).toEqual([alvo.id, outra.id].sort());
      expect(await sessoesGravadas()).toHaveLength(3);
    });

    it.each(['nao-e-uuid', '', "' or 1=1 --"])(
      'contaId fora do formato (%j): lança TypeError e não apaga nada',
      async (invalido) => {
        const erro = await erroDe(
          db()
            .transaction()
            .execute((trx) => excluirRegistrosDaConta(trx, invalido, AGORA)),
        );

        expect(erro).toBeInstanceOf(TypeError);
        expect(await contasGravadas()).toHaveLength(2);
        expect(await sessoesGravadas()).toHaveLength(3);
      },
    );

    it('fora de uma transação: lança TypeError e não apaga nada', async () => {
      const erro = await erroDe(excluirRegistrosDaConta(db(), alvo.id, AGORA));

      expect(erro).toBeInstanceOf(TypeError);
      expect(await contasGravadas()).toHaveLength(2);
      expect(await sessoesGravadas()).toHaveLength(3);
    });

    it('CA17 — duas transações concorrentes: a segunda espera a trava, encontra tudo vazio e termina sem erro', async () => {
      const resultados = await Promise.allSettled([
        db()
          .transaction()
          .execute((trx) => excluirRegistrosDaConta(trx, alvo.id, AGORA)),
        db()
          .transaction()
          .execute((trx) => excluirRegistrosDaConta(trx, alvo.id, AGORA)),
      ]);

      expect(resultados.map((r) => r.status)).toEqual([
        'fulfilled',
        'fulfilled',
      ]);
      expect(await contasGravadas()).toEqual([outra.id]);
      expect(await sessoesGravadas()).toEqual([outra.id]);
    });

    it('conta que não existe: resolve sem erro e não apaga nada', async () => {
      await db()
        .transaction()
        .execute((trx) => excluirRegistrosDaConta(trx, randomUUID(), AGORA));

      expect(await contasGravadas()).toHaveLength(2);
      expect(await sessoesGravadas()).toHaveLength(3);
    });
  });

  describe('S5 — sessões expiradas e lápides no Postgres (CA46, CA47)', () => {
    const lapides = () => new RepositorioDeContasExcluidasPostgres(db());

    async function gravarSessoes(
      contaId: string,
      quantas: number,
      expiraEm: Date,
      prefixo: string,
    ): Promise<void> {
      await db()
        .insertInto('sessoes')
        .values(
          Array.from({ length: quantas }, (_, i) => ({
            token_hash: sha256(`${prefixo}-${i}`),
            conta_id: contaId,
            expira_em: expiraEm,
          })),
        )
        .execute();
    }

    async function lapidesGravadas(): Promise<
      { id: string; excluida_em: string }[]
    > {
      const linhas = await db()
        .selectFrom('contas_excluidas')
        .select(['id', 'excluida_em'])
        .orderBy('id')
        .execute();
      return linhas.map((l) => ({
        id: l.id,
        excluida_em: l.excluida_em.toISOString(),
      }));
    }

    it('CA46 — apagarExpiradas apaga em lotes só as sessões com expira_em <= agora (inclusive a que expira agora) e devolve quantas apagou', async () => {
      const conta = novaConta();
      await contas.salvar(conta);
      await gravarSessoes(conta.id, 4, new Date(AGORA.getTime() - 1), 'v');
      await gravarSessoes(conta.id, 1, AGORA, 'agora');
      await gravarSessoes(conta.id, 3, new Date(AGORA.getTime() + 1), 'ok');

      const lotes = [
        await sessoes.apagarExpiradas(AGORA, 2),
        await sessoes.apagarExpiradas(AGORA, 2),
        await sessoes.apagarExpiradas(AGORA, 2),
        await sessoes.apagarExpiradas(AGORA, 2),
      ];

      expect(lotes).toEqual([2, 2, 1, 0]);
      const restantes = await db()
        .selectFrom('sessoes')
        .select('token_hash')
        .execute();
      expect(restantes.map((r) => r.token_hash).sort()).toEqual(
        [0, 1, 2].map((i) => sha256(`ok-${i}`)).sort(),
      );
      expect(
        await sessoes.buscarContaIdPorTokenHash(sha256('ok-0'), AGORA),
      ).toBe(conta.id);
    });

    it(`CA46 — um lote de ${SESSOES_POR_LOTE} com mais expiradas que isso apaga exatamente o lote`, async () => {
      const conta = novaConta();
      await contas.salvar(conta);
      await gravarSessoes(
        conta.id,
        SESSOES_POR_LOTE + 5,
        new Date(AGORA.getTime() - UM_DIA_MS),
        'v',
      );

      expect(await sessoes.apagarExpiradas(AGORA, SESSOES_POR_LOTE)).toBe(
        SESSOES_POR_LOTE,
      );
      expect(await sessoes.contarDaConta(conta.id)).toBe(5);
    });

    it.each([0, -1, 1.5, Number.NaN])(
      'apagarExpiradas com lote inválido (%s) lança RangeError sem apagar',
      async (lote) => {
        const conta = novaConta();
        await contas.salvar(conta);
        await gravarSessoes(conta.id, 1, new Date(AGORA.getTime() - 1), 'v');

        expect(
          await erroDe(sessoes.apagarExpiradas(AGORA, lote)),
        ).toBeInstanceOf(RangeError);
        expect(await sessoes.contarDaConta(conta.id)).toBe(1);
      },
    );

    it('contarDaConta conta todas as sessões da conta (inclusive as expiradas), só dela; id fora do formato dá 0', async () => {
      const conta = novaConta();
      const outra = novaConta('outra.pessoa@exemplo.com');
      await contas.salvar(conta);
      await contas.salvar(outra);
      await gravarSessoes(conta.id, 2, new Date(AGORA.getTime() - 1), 'v');
      await gravarSessoes(conta.id, 1, new Date(AGORA.getTime() + 1), 'ok');
      await gravarSessoes(outra.id, 4, AGORA, 'outra');

      expect(await sessoes.contarDaConta(conta.id)).toBe(3);
      expect(await sessoes.contarDaConta(randomUUID())).toBe(0);
      expect(await sessoes.contarDaConta('nao-e-uuid')).toBe(0);
    });

    it('CA47 — excluirRegistrosDaConta grava a lápide (só id e data) na mesma transação; repetir guarda a data original', async () => {
      const conta = novaConta();
      await contas.salvar(conta);

      await db()
        .transaction()
        .execute((trx) => excluirRegistrosDaConta(trx, conta.id, AGORA));
      await db()
        .transaction()
        .execute((trx) =>
          excluirRegistrosDaConta(
            trx,
            conta.id,
            new Date(AGORA.getTime() + UM_DIA_MS),
          ),
        );

      expect(await lapidesGravadas()).toEqual([
        { id: conta.id, excluida_em: AGORA.toISOString() },
      ]);
      const { rows } = await sql<{ coluna: string }>`
        select column_name as coluna from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'contas_excluidas'
        order by ordinal_position`.execute(db());
      expect(rows.map((r) => r.coluna)).toEqual(['id', 'excluida_em']);
    });

    it('CA47 — se a transação da exclusão desfaz, a lápide some junto', async () => {
      const conta = novaConta();
      await contas.salvar(conta);
      const desfazer = new Error('desfazer');

      const erro = await erroDe(
        db()
          .transaction()
          .execute(async (trx) => {
            await excluirRegistrosDaConta(trx, conta.id, AGORA);
            throw desfazer;
          }),
      );

      expect(erro).toBe(desfazer);
      expect(await lapidesGravadas()).toEqual([]);
    });

    it.each([new Date(Number.NaN), '2026-10-20' as unknown as Date])(
      'excluirRegistrosDaConta com data inválida (%s) lança TypeError e não apaga nada',
      async (data) => {
        const conta = novaConta();
        await contas.salvar(conta);

        const erro = await erroDe(
          db()
            .transaction()
            .execute((trx) => excluirRegistrosDaConta(trx, conta.id, data)),
        );

        expect(erro).toBeInstanceOf(TypeError);
        expect(await contas.buscarPorId(conta.id)).not.toBeNull();
        expect(await lapidesGravadas()).toEqual([]);
      },
    );

    it('CA47 — listarAntesDe devolve as lápides com excluida_em <= limite, das mais antigas para as mais novas, no máximo o lote; esquecer apaga e é idempotente', async () => {
      const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await db()
        .insertInto('contas_excluidas')
        .values([
          { id: ids[0] ?? '', excluida_em: new Date(AGORA.getTime() - 3000) },
          { id: ids[1] ?? '', excluida_em: new Date(AGORA.getTime() - 1000) },
          { id: ids[2] ?? '', excluida_em: AGORA },
          { id: ids[3] ?? '', excluida_em: new Date(AGORA.getTime() + 1) },
        ])
        .execute();

      expect(await lapides().listarAntesDe(AGORA, 10)).toEqual([
        ids[0],
        ids[1],
        ids[2],
      ]);
      expect(await lapides().listarAntesDe(AGORA, 2)).toEqual([ids[0], ids[1]]);

      await lapides().esquecer(ids[0] ?? '');
      await lapides().esquecer(ids[0] ?? '');
      await lapides().esquecer('nao-e-uuid');
      expect(await lapides().listarAntesDe(AGORA, 10)).toEqual([
        ids[1],
        ids[2],
      ]);
      expect(await erroDe(lapides().listarAntesDe(AGORA, 0))).toBeInstanceOf(
        RangeError,
      );
    });

    it('CA46/CA47 — Dado um órfão gravado direto no banco com o id da conta excluída, quando a limpeza roda 10 min depois, então ele some e a lápide também; antes disso, nada muda', async () => {
      const conexao = bancoDeTeste<unknown>();
      // Tabela de outro "módulo", só deste teste; os arquivos de integração
      // rodam em série e ela é apagada no fim (e antes, se sobrou).
      await sql`drop table if exists orfaos_da_limpeza_teste`.execute(conexao);
      await sql`create table orfaos_da_limpeza_teste (conta_id uuid not null)`.execute(
        conexao,
      );
      const relogio = new RelogioFixo(AGORA);
      const linhasDoLog: string[] = [];
      const app = criarServidor({
        logger: criarLogger({
          nivel: 'trace',
          destino: { write: (linha) => linhasDoLog.push(linha) },
        }),
      });
      let modulo: ModuloDeContas | undefined;
      const fachada = (): ModuloDeContas => {
        if (!modulo) {
          throw new Error('módulo ainda não criado');
        }
        return modulo;
      };
      modulo = criarModuloDeContas({
        db: db(),
        hasher: new HasherScrypt({ N: 2 ** 4, r: 8, p: 1 }),
        relogio,
        dadosDaConta: {
          // Como a composição: os outros módulos e depois `contas`, numa
          // transação só.
          excluirTudo: (contaId) =>
            db()
              .transaction()
              .execute(async (trx) => {
                await sql`delete from orfaos_da_limpeza_teste
                  where conta_id = ${contaId}::uuid`.execute(trx);
                await fachada().excluirRegistrosDaConta(
                  trx,
                  contaId,
                  relogio.agora(),
                );
              }),
          coletarDosOutrosModulos: async () => PARTES_VAZIAS,
          medirDosOutrosModulos: async () => 0,
        },
      });
      app.register(modulo.rotas);
      const orfaosDe = async (contaId: string) => {
        const { rows } = await sql<{ n: number }>`
          select count(*)::int as n from orfaos_da_limpeza_teste
          where conta_id = ${contaId}::uuid`.execute(conexao);
        return rows[0]?.n;
      };

      try {
        const cadastro = await app.inject({
          method: 'POST',
          url: '/contas',
          payload: { email: EMAIL, senha: SENHA },
        });
        const token = cadastro.json().token as string;
        const contaId = (await modulo.validarSessao(token)) ?? '';
        const outraConta = randomUUID();
        const exclusao = await app.inject({
          method: 'POST',
          url: '/contas/eu/exclusao',
          headers: { authorization: `Bearer ${token}` },
          payload: { senha: SENHA },
        });
        expect(exclusao.statusCode).toBe(204);
        expect(await lapidesGravadas()).toEqual([
          { id: contaId, excluida_em: AGORA.toISOString() },
        ]);
        // Escrita em voo que terminou depois da exclusão, e o registro de
        // uma conta que não foi excluída (não pode sumir).
        await sql`insert into orfaos_da_limpeza_teste (conta_id)
          values (${contaId}::uuid), (${outraConta}::uuid)`.execute(conexao);
        // Sessão vencida de outra conta: a mesma rodada a apaga.
        const viva = novaConta('outra.pessoa@exemplo.com');
        await contas.salvar(viva);
        await sessoes.salvar(sha256('vencida'), viva.id, AGORA);

        relogio.avancar(ESPERA_DA_LAPIDE_MS - 1);
        expect(await modulo.limparRegistrosVencidos()).toEqual({
          sessoes: 1,
          contasRevarridas: 0,
        });
        expect(await orfaosDe(contaId)).toBe(1);
        expect(await lapidesGravadas()).toHaveLength(1);

        relogio.avancar(1);
        expect(await modulo.limparRegistrosVencidos()).toEqual({
          sessoes: 0,
          contasRevarridas: 1,
        });
        expect(await orfaosDe(contaId)).toBe(0);
        expect(await orfaosDe(outraConta)).toBe(1);
        expect(await lapidesGravadas()).toEqual([]);
        expect(await contas.buscarPorId(viva.id)).not.toBeNull();

        const log = linhasDoLog.join('\n');
        expect(log).not.toContain(contaId);
        expect(log.toLowerCase()).not.toContain('maria.silva');
        expect(log).not.toContain(SENHA);
      } finally {
        await app.close();
        await sql`drop table if exists orfaos_da_limpeza_teste`.execute(
          conexao,
        );
      }
    });
  });

  describe('S1 (D31) — teto de entrada por conta no Postgres (CA42)', () => {
    const HORA_MS = 60 * 60 * 1000;
    let tentativas: RepositorioDeTentativasDeEntradaPostgres;
    let conta: Conta;

    beforeEach(async () => {
      tentativas = new RepositorioDeTentativasDeEntradaPostgres(db());
      conta = novaConta();
      await contas.salvar(conta);
    });

    async function linhas() {
      return db()
        .selectFrom('tentativas_de_entrada')
        .selectAll()
        .orderBy('conta_id')
        .execute();
    }

    it('a 1ª tentativa abre a janela em agora; as seguintes somam na mesma janela', async () => {
      expect(await tentativas.registrar(conta.id, AGORA, HORA_MS)).toEqual({
        tentativas: 1,
        inicioDaJanela: AGORA,
      });
      const depois = new Date(AGORA.getTime() + HORA_MS - 1);
      expect(await tentativas.registrar(conta.id, depois, HORA_MS)).toEqual({
        tentativas: 2,
        inicioDaJanela: AGORA,
      });
      expect(await linhas()).toEqual([
        { conta_id: conta.id, inicio_da_janela: AGORA, tentativas: 2 },
      ]);
    });

    it('com a janela vencida (início + janela <= agora), recomeça em agora com 1', async () => {
      await tentativas.registrar(conta.id, AGORA, HORA_MS);
      await tentativas.registrar(conta.id, AGORA, HORA_MS);
      const vencida = new Date(AGORA.getTime() + HORA_MS);

      expect(await tentativas.registrar(conta.id, vencida, HORA_MS)).toEqual({
        tentativas: 1,
        inicioDaJanela: vencida,
      });
      expect(await linhas()).toHaveLength(1);
    });

    it('CA42 — 60 tentativas simultâneas no pool real não perdem contagem: cada uma recebe um número diferente, de 1 a 60', async () => {
      const quantas = 60;

      const resultados = await Promise.all(
        Array.from({ length: quantas }, () =>
          tentativas.registrar(conta.id, AGORA, HORA_MS),
        ),
      );

      expect(
        resultados
          .map((r) => r?.tentativas)
          .sort((a, b) => (a ?? 0) - (b ?? 0)),
      ).toEqual(Array.from({ length: quantas }, (_, i) => i + 1));
      expect((await linhas())[0]?.tentativas).toBe(quantas);
    });

    it('conta inexistente ou id fora do formato: null, sem gravar nada e sem o erro do driver', async () => {
      expect(await tentativas.registrar(randomUUID(), AGORA, HORA_MS)).toBe(
        null,
      );
      for (const id of ['nao-e-uuid', '', `${conta.id}' or true --`]) {
        expect(await tentativas.registrar(id, AGORA, HORA_MS)).toBeNull();
      }
      expect(await linhas()).toEqual([]);
    });

    it('a contagem satura no maior integer do Postgres em vez de estourar', async () => {
      await db()
        .insertInto('tentativas_de_entrada')
        .values({
          conta_id: conta.id,
          inicio_da_janela: AGORA,
          tentativas: 2_147_483_647,
        })
        .execute();

      const contagem = await tentativas.registrar(conta.id, AGORA, HORA_MS);

      expect(contagem?.tentativas).toBe(2_147_483_647);
    });

    it('CA46 — apagarVencidas apaga só as janelas com início <= limite, devolve quantas e é idempotente', async () => {
      const outra = novaConta('outra.pessoa@exemplo.com');
      const terceira = novaConta('terceira@exemplo.com');
      await contas.salvar(outra);
      await contas.salvar(terceira);
      const limite = new Date(AGORA.getTime() - HORA_MS);
      await tentativas.registrar(
        conta.id,
        new Date(limite.getTime() - 1),
        HORA_MS,
      );
      await tentativas.registrar(outra.id, limite, HORA_MS);
      await tentativas.registrar(
        terceira.id,
        new Date(limite.getTime() + 1),
        HORA_MS,
      );

      expect(await tentativas.apagarVencidas(limite)).toBe(2);
      expect((await linhas()).map((l) => l.conta_id)).toEqual([terceira.id]);
      expect(await tentativas.apagarVencidas(limite)).toBe(0);
    });

    it('CA17 — a exclusão da conta apaga o contador dela (cascade) e deixa o da outra', async () => {
      const outra = novaConta('outra.pessoa@exemplo.com');
      await contas.salvar(outra);
      await tentativas.registrar(conta.id, AGORA, HORA_MS);
      await tentativas.registrar(outra.id, AGORA, HORA_MS);

      await db()
        .transaction()
        .execute((trx) => excluirRegistrosDaConta(trx, conta.id, AGORA));

      expect((await linhas()).map((l) => l.conta_id)).toEqual([outra.id]);
    });

    it('Dada a conta excluída enquanto a contagem espera a trava dela, então registrar devolve null (FK) e não grava nada', async () => {
      // A exclusão apaga a conta e segura a transação aberta; a contagem
      // chega no meio e espera a trava da linha.
      let soltar = () => {};
      const segurar = new Promise<void>((resolver) => {
        soltar = resolver;
      });
      let apagou = () => {};
      const apagada = new Promise<void>((resolver) => {
        apagou = resolver;
      });
      const exclusao = db()
        .transaction()
        .execute(async (trx) => {
          await excluirRegistrosDaConta(trx, conta.id, AGORA);
          apagou();
          await segurar;
        });
      await apagada;
      const contagem = tentativas.registrar(conta.id, AGORA, HORA_MS);
      await esperarAte(async () => {
        const { rows } = await sql<{ n: number }>`
          select count(*)::int as n from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`.execute(
          db(),
        );
        return (rows[0]?.n ?? 0) > 0;
      });
      soltar();
      await exclusao;

      expect(await contagem).toBeNull();
      expect(await linhas()).toEqual([]);
    });
  });

  describe('migração 0007', () => {
    async function lapideExiste(conexao: Kysely<unknown>): Promise<boolean> {
      const { rows } = await sql<{ t: string | null }>`
        select to_regclass('contas_excluidas')::text as t`.execute(conexao);
      return rows[0]?.t === 'contas_excluidas';
    }

    it('o down aborta se houver lápide e não remove nada', async () => {
      await db()
        .insertInto('contas_excluidas')
        .values({ id: randomUUID(), excluida_em: AGORA })
        .execute();

      const erro = await erroDe(
        dbDaMigracao()
          .transaction()
          .execute((trx) => down0007(trx)),
      );

      expect(erro).toBeInstanceOf(ErroTabelaNaoVazia);
      expect(await lapideExiste(dbDaMigracao())).toBe(true);
    });

    it('com a tabela vazia, o down a remove e o up recria (desfeito no fim)', async () => {
      const desfazer = new Error('desfazer');
      const erro = await erroDe(
        dbDaMigracao()
          .transaction()
          .execute(async (trx) => {
            await down0007(trx);
            expect(await lapideExiste(trx)).toBe(false);
            await up0007(trx);
            expect(await lapideExiste(trx)).toBe(true);
            throw desfazer;
          }),
      );

      expect(erro).toBe(desfazer);
      expect(await lapideExiste(dbDaMigracao())).toBe(true);
    });
  });

  describe('migração 0008', () => {
    async function tabelaExiste(conexao: Kysely<unknown>): Promise<boolean> {
      const { rows } = await sql<{ t: string | null }>`
        select to_regclass('tentativas_de_entrada')::text as t`.execute(
        conexao,
      );
      return rows[0]?.t === 'tentativas_de_entrada';
    }

    it('o banco recusa contagem menor que 1 e conta inexistente (FK)', async () => {
      const conta = novaConta();
      await contas.salvar(conta);

      const zero = await erroDe(
        db()
          .insertInto('tentativas_de_entrada')
          .values({
            conta_id: conta.id,
            inicio_da_janela: AGORA,
            tentativas: 0,
          })
          .execute(),
      );
      const semConta = await erroDe(
        db()
          .insertInto('tentativas_de_entrada')
          .values({
            conta_id: randomUUID(),
            inicio_da_janela: AGORA,
            tentativas: 1,
          })
          .execute(),
      );

      expect((zero as { code?: string }).code).toBe('23514');
      expect((semConta as { code?: string }).code).toBe('23503');
    });

    it('o down remove a tabela mesmo com contadores (só metadado de segurança) e o up recria (desfeito no fim)', async () => {
      const conta = novaConta();
      await contas.salvar(conta);
      await new RepositorioDeTentativasDeEntradaPostgres(db()).registrar(
        conta.id,
        AGORA,
        60_000,
      );
      const desfazer = new Error('desfazer');

      const erro = await erroDe(
        dbDaMigracao()
          .transaction()
          .execute(async (trx) => {
            await down0008(trx);
            expect(await tabelaExiste(trx)).toBe(false);
            // A conta e as sessões não são tocadas.
            const { rows } = await sql<{ n: number }>`
              select count(*)::int as n from contas`.execute(trx);
            expect(rows[0]?.n).toBe(1);
            await up0008(trx);
            expect(await tabelaExiste(trx)).toBe(true);
            throw desfazer;
          }),
      );

      expect(erro).toBe(desfazer);
      expect(await tabelaExiste(dbDaMigracao())).toBe(true);
    });
  });

  describe('migração 0001', () => {
    it('o down aborta se houver linhas e não remove nada', async () => {
      await contas.salvar(novaConta());

      const erro = await erroDe(
        dbDaMigracao()
          .transaction()
          .execute((trx) => down(trx)),
      );

      expect(erro).toBeInstanceOf(ErroTabelaNaoVazia);
      expect(await tabelasExistem(dbDaMigracao())).toEqual([
        'contas',
        'sessoes',
      ]);
    });

    it('com as tabelas vazias, o down remove as duas e o up recria (desfeito no fim)', async () => {
      const desfazer = new Error('desfazer');
      const erro = await erroDe(
        dbDaMigracao()
          .transaction()
          .execute(async (trx) => {
            // A 0008 referencia `contas`: desce antes, como no migrador.
            await down0008(trx);
            await down(trx);
            expect(await tabelasExistem(trx)).toEqual([]);
            await up(trx);
            expect(await tabelasExistem(trx)).toEqual(['contas', 'sessoes']);
            await up0008(trx);
            throw desfazer;
          }),
      );

      expect(erro).toBe(desfazer);
      expect(await tabelasExistem(dbDaMigracao())).toEqual([
        'contas',
        'sessoes',
      ]);
    });
  });

  describe('fachada criarModuloDeContas', () => {
    it('CA1/CA14/CA15 — cadastro, entrada e saída de ponta a ponta no Postgres, sem dado pessoal no log', async () => {
      const linhasDoLog: string[] = [];
      const app = criarServidor({
        logger: criarLogger({
          nivel: 'trace',
          destino: { write: (linha) => linhasDoLog.push(linha) },
        }),
      });
      const modulo = criarModuloDeContas({
        db: db(),
        hasher: new HasherScrypt({ N: 2 ** 4, r: 8, p: 1 }),
      });
      app.register(modulo.rotas);

      try {
        const cadastro = await app.inject({
          method: 'POST',
          url: '/contas',
          payload: { email: EMAIL, senha: SENHA },
        });
        expect(cadastro.statusCode).toBe(201);
        const { token } = cadastro.json();

        // A senha só como hash; o token só como SHA-256.
        const conta = await db()
          .selectFrom('contas')
          .selectAll()
          .executeTakeFirstOrThrow();
        expect(conta.senha_hash).toMatch(/^scrypt\$/);
        expect(conta.senha_hash).not.toContain(SENHA);
        const sessao = await db()
          .selectFrom('sessoes')
          .selectAll()
          .executeTakeFirstOrThrow();
        expect(sessao.token_hash).toBe(sha256(token));
        expect(await modulo.validarSessao(token)).toBe(conta.id);

        const duplicado = await app.inject({
          method: 'POST',
          url: '/contas',
          payload: { email: EMAIL.toUpperCase(), senha: SENHA },
        });
        expect(duplicado.statusCode).toBe(409);
        expect(duplicado.json()).toEqual({ erro: 'email_em_uso' });

        const entrada = await app.inject({
          method: 'POST',
          url: '/sessoes',
          payload: { email: EMAIL, senha: SENHA },
        });
        expect(entrada.statusCode).toBe(200);

        const saida = await app.inject({
          method: 'DELETE',
          url: '/sessoes',
          headers: { authorization: `Bearer ${token}` },
        });
        expect(saida.statusCode).toBe(204);
        expect(await modulo.validarSessao(token)).toBeNull();
        expect(await modulo.validarSessao(entrada.json().token)).toBe(conta.id);

        const log = linhasDoLog.join('\n');
        expect(log).toContain('requisição recusada');
        expect(log.toLowerCase()).not.toContain('maria.silva');
        expect(log).not.toContain(SENHA);
        expect(log).not.toContain(token);
      } finally {
        await app.close();
      }
    });

    /**
     * `DadosDaConta` como a composição vai ligar (ADR-005): uma transação que
     * chama a parte de `contas` (aqui sem os outros módulos).
     */
    function dadosComoNaComposicao(modulo: () => ModuloDeContas): DadosDaConta {
      return {
        excluirTudo: (contaId) =>
          db()
            .transaction()
            .execute((trx) =>
              modulo().excluirRegistrosDaConta(trx, contaId, new Date()),
            ),
        coletarDosOutrosModulos: async () => PARTES_VAZIAS,
        medirDosOutrosModulos: async () => 0,
      };
    }

    /** Segura cada `verificar` até `participantes` pedidos chegarem a ele. */
    function hasherComBarreira(
      base: HasherDeSenha,
      participantes: number,
    ): HasherDeSenha {
      let chegaram = 0;
      let liberar = () => {};
      const barreira = new Promise<void>((resolver) => {
        liberar = resolver;
      });
      return {
        gerarHash: (senha) => base.gerarHash(senha),
        verificar: async (senha, hashArmazenado) => {
          chegaram += 1;
          if (chegaram >= participantes) {
            liberar();
          }
          await barreira;
          return base.verificar(senha, hashArmazenado);
        },
      };
    }

    async function montarComPorta(hasher: HasherDeSenha) {
      const linhasDoLog: string[] = [];
      const app = criarServidor({
        logger: criarLogger({
          nivel: 'trace',
          destino: { write: (linha) => linhasDoLog.push(linha) },
        }),
      });
      let modulo: ModuloDeContas | undefined;
      modulo = criarModuloDeContas({
        db: db(),
        hasher,
        dadosDaConta: dadosComoNaComposicao(() => {
          if (!modulo) {
            throw new Error('módulo ainda não criado');
          }
          return modulo;
        }),
      });
      app.register(modulo.rotas);
      const entrar = async (email: string) => {
        const resposta = await app.inject({
          method: 'POST',
          url: '/contas',
          payload: { email, senha: SENHA },
        });
        expect(resposta.statusCode).toBe(201);
        return resposta.json().token as string;
      };
      return { app, modulo, linhasDoLog, entrar };
    }

    const hasherRapido = () => new HasherScrypt({ N: 2 ** 4, r: 8, p: 1 });

    it('CA17/CA19/CA24 — exportação e exclusão de ponta a ponta no Postgres: o JSON v1 traz conta e sessões, a exclusão apaga tudo da conta e derruba as duas sessões', async () => {
      const { app, modulo, linhasDoLog, entrar } = await montarComPorta(
        hasherRapido(),
      );
      try {
        const token = await entrar(EMAIL);
        const outroAparelho = (
          await app.inject({
            method: 'POST',
            url: '/sessoes',
            payload: { email: EMAIL, senha: SENHA },
          })
        ).json().token as string;
        const daOutra = await entrar('outra.pessoa@exemplo.com');
        const contaId = await modulo.validarSessao(token);
        const pedir = (url: string, senha: string, t = token) =>
          app.inject({
            method: 'POST',
            url,
            headers: { authorization: `Bearer ${t}` },
            payload: { senha },
          });

        const exportacao = await pedir('/contas/eu/exportacao', SENHA);
        expect(exportacao.statusCode).toBe(200);
        expect(exportacao.headers['cache-control']).toBe('no-store');
        const corpo = exportacao.json();
        expect(corpo).toMatchObject({
          formato: 'trampo-ja.exportacao.v1',
          conta: { id: contaId, email: EMAIL },
          ...PARTES_VAZIAS,
        });
        expect(corpo.sessoes).toHaveLength(2);
        const linha = await db()
          .selectFrom('contas')
          .select('senha_hash')
          .where('id', '=', contaId ?? '')
          .executeTakeFirstOrThrow();
        expect(exportacao.body).not.toContain(linha.senha_hash);
        expect(exportacao.body).not.toContain(sha256(token));

        const errada = await pedir('/contas/eu/exclusao', 'senha-errada-1');
        expect(errada.statusCode).toBe(403);
        expect(errada.json()).toEqual({ erro: 'senha_incorreta' });
        expect(await modulo.validarSessao(token)).toBe(contaId);

        const exclusao = await pedir('/contas/eu/exclusao', SENHA);
        expect(exclusao.statusCode).toBe(204);
        expect(exclusao.headers['cache-control']).toBe('no-store');
        expect(await modulo.validarSessao(token)).toBeNull();
        expect(await modulo.validarSessao(outroAparelho)).toBeNull();
        expect(await modulo.validarSessao(daOutra)).not.toBeNull();
        const restantes = await db()
          .selectFrom('contas')
          .select('email')
          .execute();
        expect(restantes).toEqual([{ email: 'outra.pessoa@exemplo.com' }]);
        // O outro aparelho recebe 401 no próximo pedido.
        expect(
          (await pedir('/contas/eu/exportacao', SENHA, outroAparelho))
            .statusCode,
        ).toBe(401);

        const log = linhasDoLog.join('\n');
        expect(log).toContain('/contas/eu/exclusao');
        expect(log).not.toContain(SENHA);
        expect(log).not.toContain('senha-errada-1');
        expect(log.toLowerCase()).not.toContain('maria.silva');
      } finally {
        await app.close();
      }
    });

    it('CA17 — dois pedidos de exclusão concorrentes, os dois já com a senha conferida: os dois respondem 204 e a conta some', async () => {
      const { app, entrar } = await montarComPorta(
        hasherComBarreira(hasherRapido(), 2),
      );
      try {
        // O cadastro não passa por `verificar`; a barreira só segura a exclusão.
        const token = await entrar(EMAIL);
        const outra = await entrar('outra.pessoa@exemplo.com');
        const excluir = () =>
          app.inject({
            method: 'POST',
            url: '/contas/eu/exclusao',
            headers: { authorization: `Bearer ${token}` },
            payload: { senha: SENHA },
          });

        const respostas = await Promise.all([excluir(), excluir()]);

        expect(respostas.map((r) => r.statusCode)).toEqual([204, 204]);
        expect(
          await db().selectFrom('contas').select('email').execute(),
        ).toEqual([{ email: 'outra.pessoa@exemplo.com' }]);
        expect(
          await db().selectFrom('sessoes').select('token_hash').execute(),
        ).toEqual([{ token_hash: sha256(outra) }]);
      } finally {
        await app.close();
      }
    });

    it('CA44 — POST /contas com o INSERT da sessão falhando no banco: 500 interno, zero contas no banco e nada do e-mail no log', async () => {
      // Falha só no INSERT em `sessoes`; a transação aberta pelo repositório
      // herda o plugin.
      const falharNaSessao: KyselyPlugin = {
        transformQuery({ node }) {
          if (
            node.kind === 'InsertQueryNode' &&
            JSON.stringify(node).includes('"name":"sessoes"')
          ) {
            throw new Error('falha forjada na sessão');
          }
          return node;
        },
        transformResult: async ({ result }) => result,
      };
      const linhasDoLog: string[] = [];
      const app = criarServidor({
        logger: criarLogger({
          nivel: 'trace',
          destino: { write: (linha) => linhasDoLog.push(linha) },
        }),
      });
      const modulo = criarModuloDeContas({
        db: db().withPlugin(falharNaSessao),
        hasher: hasherRapido(),
      });
      app.register(modulo.rotas);
      try {
        const resposta = await app.inject({
          method: 'POST',
          url: '/contas',
          payload: { email: EMAIL, senha: SENHA },
        });

        expect(resposta.statusCode).toBe(500);
        expect(resposta.json()).toEqual({ erro: 'interno' });
        expect(await db().selectFrom('contas').select('id').execute()).toEqual(
          [],
        );
        expect(
          await db().selectFrom('sessoes').select('token_hash').execute(),
        ).toEqual([]);
        const log = linhasDoLog.join('\n');
        expect(log).toContain('erro interno não tratado');
        expect(log).not.toContain(EMAIL);
        expect(log).not.toContain(SENHA);
      } finally {
        await app.close();
      }
    });

    it('sem a porta DadosDaConta, as rotas de exclusão e exportação não existem e nada é apagado', async () => {
      const app = criarServidor({ logger: false });
      const modulo = criarModuloDeContas({ db: db(), hasher: hasherRapido() });
      app.register(modulo.rotas);
      try {
        const cadastro = await app.inject({
          method: 'POST',
          url: '/contas',
          payload: { email: EMAIL, senha: SENHA },
        });
        const { token } = cadastro.json();

        for (const url of ['/contas/eu/exclusao', '/contas/eu/exportacao']) {
          const resposta = await app.inject({
            method: 'POST',
            url,
            headers: { authorization: `Bearer ${token}` },
            payload: { senha: SENHA },
          });
          expect(resposta.statusCode, url).toBe(404);
        }
        expect(await modulo.validarSessao(token)).not.toBeNull();
      } finally {
        await app.close();
      }
    });
  });
});
