/**
 * Fachada pública do módulo `conversas`: o único arquivo que outro módulo (ou
 * a composição) pode importar. Expõe só as rotas.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Kysely } from 'kysely';
import {
  type Relogio,
  relogioDoSistema,
} from '../../compartilhado/dominio/relogio.js';
import type { ValidarSessao } from '../../compartilhado/http/autenticacao.js';
import { criarRotasDeConversas } from './adaptadores/http/rotas.js';
import { RepositorioDeConversasPostgres } from './adaptadores/postgres/repositorio-postgres.js';
import type { TabelasDeConversas } from './adaptadores/postgres/tabelas.js';
import { criarCasosDeUsoDeConversas } from './aplicacao/casos-de-uso.js';
import type { VerificadorDeVinculo } from './dominio/portas.js';

export type { VerificadorDeVinculo } from './dominio/portas.js';

export interface OpcoesDoModuloDeConversas {
  /** Conexão com o banco; o módulo só usa `conversas` e `mensagens`. */
  readonly db: Kysely<TabelasDeConversas>;
  /** CA13: na composição, `trampos.existeVinculoEntre`. */
  readonly verificadorDeVinculo: VerificadorDeVinculo;
  /** Padrão: relógio do sistema. */
  readonly relogio?: Relogio;
}

export interface ModuloDeConversas {
  /**
   * `POST /conversas`, `GET /conversas`, `GET /conversas/:id/mensagens` e
   * `POST /conversas/:id/mensagens`, todas com token (CA14).
   */
  readonly rotas: (opcoes: {
    readonly validarSessao: ValidarSessao;
  }) => FastifyPluginAsync;
}

export function criarModuloDeConversas(
  opcoes: OpcoesDoModuloDeConversas,
): ModuloDeConversas {
  const casos = criarCasosDeUsoDeConversas({
    repositorio: new RepositorioDeConversasPostgres(opcoes.db),
    verificadorDeVinculo: opcoes.verificadorDeVinculo,
    relogio: opcoes.relogio ?? relogioDoSistema,
  });
  const plugin = criarRotasDeConversas(casos);
  return {
    rotas:
      ({ validarSessao }) =>
      async (app) => {
        await app.register(plugin, { validarSessao });
      },
  };
}
