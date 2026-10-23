/**
 * Migrador do banco, sobre o `Migrator` do Kysely.
 *
 * - As migrações ficam em `apps/api/migracoes/`, nomeadas `NNNN_<modulo>.ts`
 *   (ex.: `0001_contas.ts`), e exportam `up(db)` e `down(db)`. Rodam em ordem
 *   alfabética; cada execução do migrador roda numa única transação
 *   (Postgres tem DDL transacional): se uma falha, nenhuma do lote fica aplicada.
 * - Regra do `down`: reverter nunca apaga nem converte dados; se não der para
 *   desfazer sem isso, o `down` aborta antes de mudar qualquer coisa.
 *   - Migração que cria tabela: use `removerTabelaSeVazia`, que só remove
 *     tabela **vazia** e aborta se houver linhas.
 *   - Migração que altera tabela (ex.: `0006_anuncios.ts`): trave a tabela e
 *     aborte se houver linha que o esquema antigo não aceita ou cujo dado se
 *     perderia, com um erro de `code` próprio e mensagem fixa, sem valor de
 *     linha. Só derrube sem conferir a coluna que não guarda dado de pessoa
 *     (ex.: o contador `servicos.versao`).
 * - Cada módulo cria só as próprias tabelas; não há FK entre módulos.
 * - Para reverter localmente a última migração: `pnpm --filter api migrar -- --baixar`.
 *
 * Erros saem como `ErroDeMigracao`, cuja mensagem traz só o nome da migração e o
 * código SQLSTATE: a mensagem do driver `pg` pode conter valores de linhas.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Kysely, sql } from 'kysely';
// No Kysely 0.29 o migrador saiu da raiz do pacote e fica em `kysely/migration`.
import {
  FileMigrationProvider,
  type MigrationProvider,
  type MigrationResultSet,
  Migrator,
} from 'kysely/migration';

/** Pasta `apps/api/migracoes/` (vale para `src/` com tsx e para `dist/src/` após o build). */
export const PASTA_MIGRACOES = fileURLToPath(
  new URL('../../../migracoes/', import.meta.url),
);

export interface MigracaoExecutada {
  readonly nome: string;
  readonly direcao: 'subiu' | 'desceu';
}

export interface OpcoesDoMigrador {
  /** Fonte das migrações; padrão: os arquivos de `PASTA_MIGRACOES`. */
  readonly provedor?: MigrationProvider;
  /** Esquema da tabela de controle `kysely_migration`; padrão: `public`. */
  readonly esquema?: string;
}

export class ErroDeMigracao extends Error {
  readonly migracao: string | undefined;
  readonly codigo: string | undefined;

  constructor(migracao: string | undefined, codigo: string | undefined) {
    super(
      `falha na migração ${migracao ?? '(antes de escolher a migração)'}` +
        (codigo ? ` (código ${codigo})` : ''),
    );
    this.name = 'ErroDeMigracao';
    this.migracao = migracao;
    this.codigo = codigo;
  }
}

/** Erro lançado por `removerTabelaSeVazia`: a mensagem traz só o nome da tabela. */
export class ErroTabelaNaoVazia extends Error {
  readonly code = 'tabela_nao_vazia';

  constructor(tabela: string) {
    super(`a tabela ${tabela} tem linhas; o down só remove tabela vazia`);
    this.name = 'ErroTabelaNaoVazia';
  }
}

/** Aplica todas as migrações pendentes. Devolve as que rodaram (vazio se nada pendente). */
export async function migrarParaOFim<T>(
  db: Kysely<T>,
  opcoes: OpcoesDoMigrador = {},
): Promise<MigracaoExecutada[]> {
  return interpretar(await criarMigrador(db, opcoes).migrateToLatest());
}

/** Reverte só a última migração aplicada. Devolve vazio se nenhuma estava aplicada. */
export async function reverterUma<T>(
  db: Kysely<T>,
  opcoes: OpcoesDoMigrador = {},
): Promise<MigracaoExecutada[]> {
  return interpretar(await criarMigrador(db, opcoes).migrateDown());
}

/**
 * Para o `down` das migrações: trava a tabela, confere que está vazia e a remove.
 * Se houver linhas, lança `ErroTabelaNaoVazia` e a transação da migração desfaz tudo.
 * Fora de transação (o `LOCK` exige uma), abre a própria.
 */
export async function removerTabelaSeVazia<T>(
  db: Kysely<T>,
  tabela: string,
): Promise<void> {
  if (!db.isTransaction) {
    await db.transaction().execute((trx) => removerTabelaSeVazia(trx, tabela));
    return;
  }
  await sql`lock table ${sql.table(tabela)} in access exclusive mode`.execute(
    db,
  );
  const { rows } = await sql<{
    tem_linhas: boolean;
  }>`select exists (select 1 from ${sql.table(tabela)}) as tem_linhas`.execute(
    db,
  );
  if (rows[0]?.tem_linhas) {
    throw new ErroTabelaNaoVazia(tabela);
  }
  await sql`drop table ${sql.table(tabela)}`.execute(db);
}

function criarMigrador<T>(db: Kysely<T>, opcoes: OpcoesDoMigrador): Migrator {
  return new Migrator({
    db,
    provider:
      opcoes.provedor ??
      new FileMigrationProvider({
        fs,
        path,
        migrationFolder: PASTA_MIGRACOES,
        import: (arquivo: string) => import(pathToFileURL(arquivo).href),
      }),
    ...(opcoes.esquema ? { migrationTableSchema: opcoes.esquema } : {}),
  });
}

function interpretar({
  error,
  results,
}: MigrationResultSet): MigracaoExecutada[] {
  if (error !== undefined) {
    const falhou = results?.find((r) => r.status === 'Error');
    throw new ErroDeMigracao(falhou?.migrationName, codigoDoErro(error));
  }
  return (results ?? []).map((r) => ({
    nome: r.migrationName,
    direcao: r.direction === 'Up' ? 'subiu' : 'desceu',
  }));
}

function codigoDoErro(erro: unknown): string | undefined {
  if (typeof erro === 'object' && erro !== null && 'code' in erro) {
    const { code } = erro as { code: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
