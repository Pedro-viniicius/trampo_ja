/**
 * Fachada pública do módulo `contas`: o único arquivo que outro módulo (ou a
 * composição) pode importar. Expõe só a validação de sessão e as rotas.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Kysely } from 'kysely';
import type { Relogio } from '../../compartilhado/dominio/relogio.js';
import { criarRotasDeContas } from './adaptadores/http/rotas.js';
import {
  RepositorioDeContasPostgres,
  RepositorioDeSessoesPostgres,
} from './adaptadores/postgres/repositorios-postgres.js';
import type { TabelasDeContas } from './adaptadores/postgres/tabelas.js';
import { criarCasosDeUsoDeContas } from './aplicacao/casos-de-uso.js';
import { HasherScrypt } from './dominio/hasher.js';
import type { HasherDeSenha } from './dominio/portas.js';

export interface OpcoesDoModuloDeContas {
  /** Conexão com o banco; o módulo só usa as tabelas `contas` e `sessoes`. */
  readonly db: Kysely<TabelasDeContas>;
  /** Padrão: scrypt com os parâmetros de produção (N=2^17, r=8, p=1). */
  readonly hasher?: HasherDeSenha;
  /** Padrão: relógio do sistema. */
  readonly relogio?: Relogio;
}

export interface ModuloDeContas {
  /** Conta dona do token, ou `null` se ausente, desconhecido ou expirado. */
  readonly validarSessao: (token: string) => Promise<string | null>;
  /** `POST /contas`, `POST /sessoes` e `DELETE /sessoes`. */
  readonly rotas: FastifyPluginAsync;
}

export function criarModuloDeContas(
  opcoes: OpcoesDoModuloDeContas,
): ModuloDeContas {
  const casos = criarCasosDeUsoDeContas({
    contas: new RepositorioDeContasPostgres(opcoes.db),
    sessoes: new RepositorioDeSessoesPostgres(opcoes.db),
    hasher: opcoes.hasher ?? new HasherScrypt(),
    relogio: opcoes.relogio,
  });
  return {
    validarSessao: casos.validarSessao,
    rotas: criarRotasDeContas(casos),
  };
}
