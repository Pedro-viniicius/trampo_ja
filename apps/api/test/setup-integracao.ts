/**
 * Setup dos testes de integração (carregado por `vitest.integracao.config.ts`).
 * Antes de cada arquivo de teste: conecta ao banco de teste (`DATABASE_URL_TESTE`)
 * e aplica as migrações pendentes. Depois: fecha a conexão.
 * Sem nenhuma migração ainda, só conecta e segue.
 */
import type { Kysely } from 'kysely';
import { afterAll, beforeAll } from 'vitest';
import {
  type BancoBase,
  criarConexao,
} from '../src/compartilhado/banco/conexao.js';
import { migrarParaOFim } from '../src/compartilhado/banco/migrador.js';
import { carregarArquivoEnv, lerUrlDoBancoDeTeste } from '../src/config.js';
import { definirBancoDeTeste } from './banco-teste.js';

let db: Kysely<BancoBase> | undefined;

beforeAll(async () => {
  carregarArquivoEnv();
  db = criarConexao(lerUrlDoBancoDeTeste());
  definirBancoDeTeste(db);
  await migrarParaOFim(db);
});

afterAll(async () => {
  definirBancoDeTeste(undefined);
  await db?.destroy();
  db = undefined;
});
