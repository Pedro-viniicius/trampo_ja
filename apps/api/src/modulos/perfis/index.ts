/**
 * Fachada pública do módulo `perfis`: o único arquivo que outro módulo (ou a
 * composição) pode importar. Expõe só as rotas e `perfilEstaCompleto`
 * (contrato entre módulos do plano, D9), que a composição liga como
 * `VerificadorDePerfil` de `trampos` e `servicos`.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Kysely } from 'kysely';
import {
  type Relogio,
  relogioDoSistema,
} from '../../compartilhado/dominio/relogio.js';
import type { ValidarSessao } from '../../compartilhado/http/autenticacao.js';
import { criarRotasDePerfis } from './adaptadores/http/rotas.js';
import { RepositorioDePerfisPostgres } from './adaptadores/postgres/repositorio-postgres.js';
import type { TabelasDePerfis } from './adaptadores/postgres/tabelas.js';
import { criarCasosDeUsoDePerfis } from './aplicacao/casos-de-uso.js';

export interface OpcoesDoModuloDePerfis {
  /** Conexão com o banco; o módulo só usa a tabela `perfis`. */
  readonly db: Kysely<TabelasDePerfis>;
  /** Padrão: relógio do sistema. */
  readonly relogio?: Relogio;
}

export interface ModuloDePerfis {
  /** `GET` e `PUT /perfis/eu` e `GET /perfis/:contaId`, com token. */
  readonly rotas: (opcoes: {
    readonly validarSessao: ValidarSessao;
  }) => FastifyPluginAsync;
  /**
   * D9: verdadeiro só com nome, cidade e ao menos uma habilidade; falso
   * quando a conta não tem perfil (ou o id não é um uuid).
   */
  readonly perfilEstaCompleto: (contaId: string) => Promise<boolean>;
}

export function criarModuloDePerfis(
  opcoes: OpcoesDoModuloDePerfis,
): ModuloDePerfis {
  const casos = criarCasosDeUsoDePerfis({
    repositorio: new RepositorioDePerfisPostgres(opcoes.db),
    relogio: opcoes.relogio ?? relogioDoSistema,
  });
  const plugin = criarRotasDePerfis(casos);
  return {
    rotas:
      ({ validarSessao }) =>
      async (app) => {
        await app.register(plugin, { validarSessao });
      },
    perfilEstaCompleto: casos.perfilEstaCompleto,
  };
}
