/**
 * Fachada pública do módulo `servicos`: o único arquivo que outro módulo (ou a
 * composição) pode importar. Expõe só as rotas e a busca (contrato entre
 * módulos do plano: `buscarServicos(filtros)`, usada pelo módulo `busca`).
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Kysely } from 'kysely';
import {
  type Relogio,
  relogioDoSistema,
} from '../../compartilhado/dominio/relogio.js';
import type { ValidarSessao } from '../../compartilhado/http/autenticacao.js';
import { criarRotasDeServicos } from './adaptadores/http/rotas.js';
import { RepositorioDeServicosPostgres } from './adaptadores/postgres/repositorio-postgres.js';
import type { TabelasDeServicos } from './adaptadores/postgres/tabelas.js';
import {
  criarCasosDeUsoDeServicos,
  type PedidoDeBusca,
} from './aplicacao/casos-de-uso.js';
import type { VerificadorDePerfil } from './dominio/portas.js';
import type { Servico } from './dominio/servico.js';

export interface OpcoesDoModuloDeServicos {
  /** Conexão com o banco; o módulo só usa a tabela `servicos`. */
  readonly db: Kysely<TabelasDeServicos>;
  /** D9: ligado a `perfis.perfilEstaCompleto` na composição. */
  readonly verificadorDePerfil: VerificadorDePerfil;
  /** Padrão: relógio do sistema. */
  readonly relogio?: Relogio;
}

export interface ModuloDeServicos {
  /** `POST /servicos`, `GET /servicos/meus` e `GET /servicos/:id`, com token. */
  readonly rotas: (opcoes: {
    readonly validarSessao: ValidarSessao;
  }) => FastifyPluginAsync;
  /**
   * CA7 (parte de serviços): filtros com E lógico, mais recentes primeiro.
   * Pedido inválido lança `ErroDeValidacao`.
   */
  readonly buscarServicos: (
    pedido?: PedidoDeBusca,
  ) => Promise<readonly Servico[]>;
}

export function criarModuloDeServicos(
  opcoes: OpcoesDoModuloDeServicos,
): ModuloDeServicos {
  const casos = criarCasosDeUsoDeServicos({
    repositorio: new RepositorioDeServicosPostgres(opcoes.db),
    verificadorDePerfil: opcoes.verificadorDePerfil,
    relogio: opcoes.relogio ?? relogioDoSistema,
  });
  const plugin = criarRotasDeServicos(casos);
  return {
    rotas:
      ({ validarSessao }) =>
      async (app) => {
        await app.register(plugin, { validarSessao });
      },
    buscarServicos: casos.buscarServicos,
  };
}
