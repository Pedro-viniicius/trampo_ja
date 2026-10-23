import { createHash, randomUUID } from 'node:crypto';
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
import {
  type DadosDaConta,
  ErroDeEmailDuplicado,
  type HasherDeSenha,
} from '../../dominio/portas.js';
import { criarModuloDeContas, type ModuloDeContas } from '../../index.js';
import { PARTES_VAZIAS } from '../memoria/repositorios-memoria.js';
import {
  excluirRegistrosDaConta,
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
        .execute((trx) => excluirRegistrosDaConta(trx, alvo.id));

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
            await excluirRegistrosDaConta(trx, alvo.id);
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
            .execute((trx) => excluirRegistrosDaConta(trx, invalido)),
        );

        expect(erro).toBeInstanceOf(TypeError);
        expect(await contasGravadas()).toHaveLength(2);
        expect(await sessoesGravadas()).toHaveLength(3);
      },
    );

    it('fora de uma transação: lança TypeError e não apaga nada', async () => {
      const erro = await erroDe(excluirRegistrosDaConta(db(), alvo.id));

      expect(erro).toBeInstanceOf(TypeError);
      expect(await contasGravadas()).toHaveLength(2);
      expect(await sessoesGravadas()).toHaveLength(3);
    });

    it('CA17 — duas transações concorrentes: a segunda espera a trava, encontra tudo vazio e termina sem erro', async () => {
      const resultados = await Promise.allSettled([
        db()
          .transaction()
          .execute((trx) => excluirRegistrosDaConta(trx, alvo.id)),
        db()
          .transaction()
          .execute((trx) => excluirRegistrosDaConta(trx, alvo.id)),
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
        .execute((trx) => excluirRegistrosDaConta(trx, randomUUID()));

      expect(await contasGravadas()).toHaveLength(2);
      expect(await sessoesGravadas()).toHaveLength(3);
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

    /**
     * `DadosDaConta` como a composição vai ligar (ADR-005): uma transação que
     * chama a parte de `contas` (aqui sem os outros módulos).
     */
    function dadosComoNaComposicao(modulo: () => ModuloDeContas): DadosDaConta {
      return {
        excluirTudo: (contaId) =>
          db()
            .transaction()
            .execute((trx) => modulo().excluirRegistrosDaConta(trx, contaId)),
        coletarDosOutrosModulos: async () => PARTES_VAZIAS,
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
