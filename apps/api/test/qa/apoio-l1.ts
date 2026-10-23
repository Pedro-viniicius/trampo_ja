/**
 * Apoio dos testes de QA da entrega L1 (exclusão, exportação e limites).
 *
 * O hash de produção (scrypt N=2^17) leva ~0,6 s por conferência. Aqui as
 * contas são gravadas direto no banco com um hash do mesmo formato, mas de
 * custo mínimo: `verificar` lê os parâmetros do próprio hash, então a rota real
 * confere a senha de verdade, só que em milissegundos.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import { HasherScrypt } from '../../src/modulos/contas/dominio/hasher.js';
import { bancoDeTeste } from '../banco-teste.js';
import { PERFIL_VALIDO, pedir, type Usuario } from './apoio.js';

export const SENHA_PADRAO = 'senha-correta-l1-123';

const hashes = new Map<string, Promise<string>>();

/** Hash da senha com custo `N` (padrão mínimo), calculado uma vez por par. */
function hashDe(senha: string, N = 2 ** 4): Promise<string> {
  const chave = `${N}:${senha}`;
  let hash = hashes.get(chave);
  if (hash === undefined) {
    hash = new HasherScrypt({ N, r: 8, p: 1 }).gerarHash(senha);
    hashes.set(chave, hash);
  }
  return hash;
}

export interface UsuarioComSenha extends Usuario {
  readonly senha: string;
}

/** Conta com senha conhecida e sessão aberta (sem perfil). */
export async function criarUsuarioComSenhaSemPerfil(
  senha = SENHA_PADRAO,
  email?: string,
  custoN?: number,
): Promise<UsuarioComSenha> {
  const db = bancoDeTeste<Record<string, Record<string, unknown>>>();
  const contaId = randomUUID();
  const emailFinal = email ?? `qa-l1-${contaId}@exemplo.test`;
  const token = randomBytes(32).toString('base64url');
  const agora = new Date();
  await db
    .insertInto('contas' as never)
    .values({
      id: contaId,
      email: emailFinal,
      senha_hash: await hashDe(senha, custoN),
      criada_em: agora,
    } as never)
    .execute();
  await db
    .insertInto('sessoes' as never)
    .values({
      token_hash: createHash('sha256').update(token, 'utf8').digest('hex'),
      conta_id: contaId,
      expira_em: new Date(agora.getTime() + 24 * 60 * 60 * 1000),
    } as never)
    .execute();
  return { contaId, token, email: emailFinal, senha };
}

/** Abre outra sessão (outro aparelho) para a mesma conta. */
export async function abrirOutraSessao(contaId: string): Promise<string> {
  const db = bancoDeTeste<Record<string, Record<string, unknown>>>();
  const token = randomBytes(32).toString('base64url');
  await db
    .insertInto('sessoes' as never)
    .values({
      token_hash: createHash('sha256').update(token, 'utf8').digest('hex'),
      conta_id: contaId,
      expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000),
    } as never)
    .execute();
  return token;
}

/** Conta com senha conhecida, sessão e perfil completo. */
export async function criarUsuarioComSenha(
  aplicacao: Aplicacao,
  senha = SENHA_PADRAO,
  perfil: Record<string, unknown> = PERFIL_VALIDO,
): Promise<UsuarioComSenha> {
  const usuario = await criarUsuarioComSenhaSemPerfil(senha);
  const salvo = await pedir(aplicacao, 'PUT', '/perfis/eu', {
    token: usuario.token,
    corpo: perfil,
  });
  expect(salvo.status, salvo.texto).toBe(200);
  return usuario;
}

export function excluir(
  aplicacao: Aplicacao,
  usuario: Usuario,
  senha: unknown,
) {
  return pedir(aplicacao, 'POST', '/contas/eu/exclusao', {
    token: usuario.token,
    corpo: { senha },
  });
}

export function exportar(
  aplicacao: Aplicacao,
  usuario: Usuario,
  senha: unknown,
) {
  return pedir(aplicacao, 'POST', '/contas/eu/exportacao', {
    token: usuario.token,
    corpo: { senha },
  });
}

/** Linhas de cada tabela ligadas ao id (conta). */
export async function linhasDe(
  contaId: string,
): Promise<Record<string, number>> {
  const { sql } = await import('kysely');
  const donos: Record<string, string[]> = {
    contas: ['id'],
    sessoes: ['conta_id'],
    perfis: ['conta_id'],
    trampos: ['autor_id'],
    servicos: ['autor_id'],
    candidaturas: ['freelancer_id'],
    conversas: ['usuario_a_id', 'usuario_b_id'],
    mensagens: ['autor_id'],
  };
  const resultado: Record<string, number> = {};
  for (const [tabela, colunas] of Object.entries(donos)) {
    const { rows } = await sql<{ n: number }>`select count(*)::int as n
      from ${sql.table(tabela)}
      where ${contaId}::uuid in (${sql.join(colunas.map((c) => sql.ref(c)))})`.execute(
      bancoDeTeste(),
    );
    resultado[tabela] = rows[0]?.n ?? -1;
  }
  return resultado;
}

export const NADA = {
  contas: 0,
  sessoes: 0,
  perfis: 0,
  trampos: 0,
  servicos: 0,
  candidaturas: 0,
  conversas: 0,
  mensagens: 0,
};

/** Espera de alguns milissegundos para espalhar pedidos concorrentes. */
export function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}
