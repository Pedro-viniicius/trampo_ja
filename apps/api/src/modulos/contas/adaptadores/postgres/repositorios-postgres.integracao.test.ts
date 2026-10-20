import { createHash } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { down, up } from '../../../../../migracoes/0001_contas.js';
import {
  bancoDeTeste,
  truncarTabelas,
} from '../../../../../test/banco-teste.js';
import { ErroTabelaNaoVazia } from '../../../../compartilhado/banco/migrador.js';
import { criarLogger } from '../../../../compartilhado/http/logger.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import { Conta } from '../../dominio/conta.js';
import { Email } from '../../dominio/email.js';
import { HasherScrypt } from '../../dominio/hasher.js';
import { ErroDeEmailDuplicado } from '../../dominio/portas.js';
import { criarModuloDeContas } from '../../index.js';
import {
  RepositorioDeContasPostgres,
  RepositorioDeSessoesPostgres,
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

describe('contas no Postgres', () => {
  const db = () => bancoDeTeste<TabelasDeContas>();
  // As migrações recebem `Kysely<unknown>`, como no migrador.
  const dbDaMigracao = () => bancoDeTeste<unknown>();
  let contas: RepositorioDeContasPostgres;
  let sessoes: RepositorioDeSessoesPostgres;

  beforeEach(async () => {
    await truncarTabelas(['sessoes', 'contas']);
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
            await down(trx);
            expect(await tabelasExistem(trx)).toEqual([]);
            await up(trx);
            expect(await tabelasExistem(trx)).toEqual(['contas', 'sessoes']);
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
  });
});
