/**
 * Apoio dos testes de QA da API montada (`test/qa/*.integracao.test.ts`).
 *
 * A API sobe pela composição (`montarAplicacao`) com o Postgres de teste. O
 * hash de produção (scrypt N=2^17) leva ~0,6 s por conta; por isso os usuários
 * dos testes são gravados direto no banco, com a sessão já aberta, e só os
 * testes de CA1/CA2 passam pelo cadastro de verdade.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { Relogio } from '../../src/compartilhado/dominio/relogio.js';
import {
  type Aplicacao,
  montarAplicacao,
  type OpcoesDaAplicacao,
} from '../../src/composicao.js';
import { bancoDeTeste, truncarTabelas } from '../banco-teste.js';

export const TABELAS = [
  'mensagens',
  'conversas',
  'candidaturas',
  'trampos',
  'servicos',
  'perfis',
  'tentativas_de_entrada',
  'sessoes',
  'contas',
];

/** Tempo para testes que passam pelo scrypt de produção. */
export const TEMPO_COM_HASH = 60_000;

export async function limparBanco(): Promise<void> {
  await truncarTabelas(TABELAS);
}

export async function montar(
  opcoes: Omit<OpcoesDaAplicacao, 'db'> = {},
): Promise<Aplicacao> {
  return montarAplicacao({ db: bancoDeTeste(), rateLimit: false, ...opcoes });
}

export interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
  readonly texto: string;
  readonly cabecalhos: Record<string, unknown>;
}

export interface OpcoesDoPedido {
  readonly token?: string;
  readonly corpo?: unknown;
  /** Corpo como texto, com o `content-type` informado (padrão JSON). */
  readonly corpoBruto?: string;
  readonly contentType?: string;
  readonly cabecalhos?: Record<string, string>;
  readonly ip?: string;
}

export async function pedir(
  aplicacao: Aplicacao,
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH',
  url: string,
  opcoes: OpcoesDoPedido = {},
): Promise<Resposta> {
  const headers: Record<string, string> = { ...opcoes.cabecalhos };
  if (opcoes.token !== undefined) {
    headers.authorization = `Bearer ${opcoes.token}`;
  }
  if (opcoes.corpoBruto !== undefined) {
    headers['content-type'] = opcoes.contentType ?? 'application/json';
  }
  const resposta = await aplicacao.app.inject({
    method: metodo,
    url,
    headers,
    ...(opcoes.ip ? { remoteAddress: opcoes.ip } : {}),
    ...(opcoes.corpoBruto !== undefined
      ? { payload: opcoes.corpoBruto }
      : opcoes.corpo !== undefined
        ? { payload: opcoes.corpo as Record<string, unknown> }
        : {}),
  });
  let corpo: unknown;
  try {
    corpo = resposta.body === '' ? undefined : resposta.json();
  } catch {
    corpo = undefined;
  }
  return {
    status: resposta.statusCode,
    corpo,
    texto: resposta.body,
    cabecalhos: resposta.headers,
  };
}

export interface Usuario {
  readonly contaId: string;
  readonly token: string;
  readonly email: string;
}

/** Conta com sessão aberta, gravada direto no banco (sem scrypt). */
export async function criarUsuarioSemPerfil(): Promise<Usuario> {
  const db = bancoDeTeste<Record<string, Record<string, unknown>>>();
  const contaId = randomUUID();
  const email = `qa-${contaId}@exemplo.test`;
  const token = randomBytes(32).toString('base64url');
  const agora = new Date();
  await db
    .insertInto('contas' as never)
    .values({
      id: contaId,
      email,
      senha_hash: 'hash-que-nunca-confere',
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
  return { contaId, token, email };
}

export const PERFIL_VALIDO = {
  nome: 'Fulano de Tal',
  cidade: 'Lavras',
  descricao: 'Faço de tudo um pouco.',
  habilidades: ['pintura', 'reparos'],
};

/** Conta com sessão e perfil completo (D9), pronta para publicar e candidatar. */
export async function criarUsuario(
  aplicacao: Aplicacao,
  perfil: Record<string, unknown> = PERFIL_VALIDO,
): Promise<Usuario> {
  const usuario = await criarUsuarioSemPerfil();
  const salvo = await pedir(aplicacao, 'PUT', '/perfis/eu', {
    token: usuario.token,
    corpo: perfil,
  });
  expect(salvo.status).toBe(200);
  return usuario;
}

export const TRAMPO_VALIDO = {
  titulo: 'Pintura de muro externo',
  descricao: 'Pintura de um muro de 10 metros, tinta inclusa.',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 35_000,
};

export const SERVICO_VALIDO = {
  titulo: 'Pintura residencial',
  descricao: 'Pintura de paredes internas e externas.',
  categoria: 'reformas',
  cidade: 'Lavras',
  precoBaseCentavos: 20_000,
};

export async function publicarTrampo(
  aplicacao: Aplicacao,
  autor: Usuario,
  campos: Record<string, unknown> = {},
): Promise<string> {
  const resposta = await pedir(aplicacao, 'POST', '/trampos', {
    token: autor.token,
    corpo: { ...TRAMPO_VALIDO, ...campos },
  });
  expect(resposta.status, resposta.texto).toBe(201);
  return (resposta.corpo as { id: string }).id;
}

export async function ofertarServico(
  aplicacao: Aplicacao,
  autor: Usuario,
  campos: Record<string, unknown> = {},
): Promise<string> {
  const resposta = await pedir(aplicacao, 'POST', '/servicos', {
    token: autor.token,
    corpo: { ...SERVICO_VALIDO, ...campos },
  });
  expect(resposta.status, resposta.texto).toBe(201);
  return (resposta.corpo as { id: string }).id;
}

export async function candidatar(
  aplicacao: Aplicacao,
  freelancer: Usuario,
  trampoId: string,
  campos: Record<string, unknown> = {},
): Promise<Resposta> {
  return pedir(aplicacao, 'POST', `/trampos/${trampoId}/candidaturas`, {
    token: freelancer.token,
    corpo: {
      mensagem: 'Posso fazer amanhã.',
      valorPropostoCentavos: 30_000,
      ...campos,
    },
  });
}

/** Relógio que avança `passoMs` a cada leitura: datas distintas e crescentes. */
export function relogioQueAvanca(passoMs = 1000): Relogio {
  let instante = Date.UTC(2026, 0, 1);
  return {
    agora: () => {
      instante += passoMs;
      return new Date(instante);
    },
  };
}

/** Relógio parado: todos os registros caem no mesmo milissegundo. */
export function relogioParado(): Relogio {
  const instante = Date.UTC(2026, 5, 1);
  return { agora: () => new Date(instante) };
}
