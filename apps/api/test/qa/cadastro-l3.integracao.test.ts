/**
 * QA da L3 — cadastro com a conta e a sessão na mesma transação (CA44, S7):
 * cadastros simultâneos do mesmo e-mail e o token repetido (a sessão falha
 * depois de a conta ser inserida).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RelogioFixo } from '../../src/compartilhado/dominio/relogio.js';
import type { Aplicacao } from '../../src/composicao.js';
import { PARTES_VAZIAS } from '../../src/modulos/contas/adaptadores/memoria/repositorios-memoria.js';
import {
  RepositorioDeContasExcluidasPostgres,
  RepositorioDeContasPostgres,
  RepositorioDeSessoesPostgres,
  RepositorioDeTentativasDeEntradaPostgres,
} from '../../src/modulos/contas/adaptadores/postgres/repositorios-postgres.js';
import { criarCasosDeUsoDeContas } from '../../src/modulos/contas/aplicacao/casos-de-uso.js';
import { HasherScrypt } from '../../src/modulos/contas/dominio/hasher.js';
import { bancoDeTeste } from '../banco-teste.js';
import { montar, pedir, TEMPO_COM_HASH } from './apoio.js';
import { contar, limparBancoL3 } from './apoio-l3.js';

let aplicacao: Aplicacao | undefined;

beforeEach(async () => {
  await limparBancoL3();
  aplicacao = await montar();
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

describe('CA44 (S7) — conta e primeira sessão juntas', () => {
  it(
    'Dados 6 cadastros simultâneos do mesmo e-mail (com caixa e espaços diferentes), então um só vence (201) e os outros dão 409 email_em_uso: uma conta, uma sessão, e só o token do vencedor vale',
    async () => {
      const base = `corrida-${randomUUID()}@exemplo.test`;
      const variantes = [
        base,
        ` ${base.toUpperCase()}`,
        `${base} `,
        base,
        base.toUpperCase(),
        ` ${base} `,
      ];

      const respostas = await Promise.all(
        variantes.map((email) =>
          pedir(app(), 'POST', '/contas', {
            corpo: { email, senha: 'SenhaDaCorrida#1' },
          }),
        ),
      );

      const status = respostas.map((r) => r.status).sort();
      expect(status).toEqual([201, 409, 409, 409, 409, 409]);
      for (const r of respostas.filter((x) => x.status === 409)) {
        expect(r.corpo).toEqual({ erro: 'email_em_uso' });
      }
      expect(await contar('contas')).toBe(1);
      expect(await contar('sessoes')).toBe(1);
      const vencedora = respostas.find((r) => r.status === 201);
      const token = (vencedora?.corpo as { token: string } | undefined)?.token;
      expect(token).toBeDefined();
      const perfil = await pedir(app(), 'GET', '/perfis/eu', {
        token: token ?? '',
      });
      expect([200, 404]).toContain(perfil.status);
      expect(perfil.status).not.toBe(401);
    },
    TEMPO_COM_HASH,
  );

  it('Dado o mesmo token sorteado para duas contas (a sessão colide), então a segunda conta não fica gravada e o erro não traz e-mail nem token', async () => {
    const db = bancoDeTeste();
    const tokenFixo = 'token-repetido-do-qa-l3-000000000000000000';
    const casos = criarCasosDeUsoDeContas({
      contas: new RepositorioDeContasPostgres(db as never),
      sessoes: new RepositorioDeSessoesPostgres(db as never),
      contasExcluidas: new RepositorioDeContasExcluidasPostgres(db as never),
      tentativasDeEntrada: new RepositorioDeTentativasDeEntradaPostgres(
        db as never,
      ),
      hasher: new HasherScrypt({ N: 2 ** 4, r: 8, p: 1 }),
      geradorDeToken: { gerar: () => tokenFixo },
      relogio: new RelogioFixo(new Date()),
      dadosDaConta: {
        excluirTudo: async () => undefined,
        coletarDosOutrosModulos: async () => PARTES_VAZIAS,
        medirDosOutrosModulos: async () => 0,
      },
    });
    const primeiro = `um-${randomUUID()}@exemplo.test`;
    const segundo = `dois-${randomUUID()}@exemplo.test`;

    await casos.criarConta({ email: primeiro, senha: 'SenhaDoPrimeiro#1' });
    const erro = await casos
      .criarConta({ email: segundo, senha: 'SenhaDoSegundo#1' })
      .then(() => null)
      .catch((e: unknown) => e as Error);

    expect(erro).toBeInstanceOf(Error);
    const textoDoErro = `${(erro as Error).message}${JSON.stringify(erro)}${(erro as Error).stack}`;
    expect(textoDoErro).not.toContain(segundo);
    expect(textoDoErro).not.toContain('SenhaDoSegundo');
    const { rows } = await sql<{
      email: string;
    }>`select email from contas`.execute(db);
    expect(rows.map((r) => r.email)).toEqual([primeiro]);
    expect(await contar('sessoes')).toBe(1);
  });
});
