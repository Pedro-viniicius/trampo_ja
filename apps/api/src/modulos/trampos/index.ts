import type { FastifyPluginAsync } from 'fastify';
import type { Kysely } from 'kysely';
import {
  type Relogio,
  relogioDoSistema,
} from '../../compartilhado/dominio/relogio.js';
import type { ValidarSessao } from '../../compartilhado/http/autenticacao.js';
import { rotasDeTrampos } from './adaptadores/http/rotas.js';
import { RepositorioDeTramposPostgres } from './adaptadores/postgres/repositorio-postgres.js';
import type { TabelasDeTrampos } from './adaptadores/postgres/tabelas.js';
import {
  criarCasosDeUsoDeTrampos,
  type EntradaDeBusca,
} from './aplicacao/casos-de-uso.js';
import type { VerificadorDePerfil } from './dominio/portas.js';
import type { TrampoResumo } from './dominio/trampo.js';

export interface DependenciasDoModuloDeTrampos {
  /** Conexão com a visão das tabelas deste módulo (`trampos`, `candidaturas`). */
  readonly db: Kysely<TabelasDeTrampos>;
  /** Porta da D9; na composição, a fachada de `perfis`. */
  readonly verificadorDePerfil: VerificadorDePerfil;
  /** Padrão: o relógio do sistema. */
  readonly relogio?: Relogio;
}

/** Contrato do módulo com o resto da aplicação. */
export interface ModuloDeTrampos {
  /** Plugin com as rotas de trampos e candidaturas, todas autenticadas. */
  readonly rotas: (opcoes: {
    readonly validarSessao: ValidarSessao;
  }) => FastifyPluginAsync;
  /** Para `conversas`: há candidatura, em qualquer estado, entre os dois? */
  readonly existeVinculoEntre: (a: string, b: string) => Promise<boolean>;
  /** Para `busca` (CA7): trampos abertos que atendem aos filtros. */
  readonly buscarTrampos: (filtros?: EntradaDeBusca) => Promise<TrampoResumo[]>;
}

/** Fachada do módulo `trampos`: único ponto que outro módulo pode importar. */
export function criarModuloDeTrampos(
  deps: DependenciasDoModuloDeTrampos,
): ModuloDeTrampos {
  const casos = criarCasosDeUsoDeTrampos({
    repositorio: new RepositorioDeTramposPostgres(deps.db),
    verificadorDePerfil: deps.verificadorDePerfil,
    relogio: deps.relogio ?? relogioDoSistema,
  });
  return {
    rotas: (opcoes) => rotasDeTrampos(casos, opcoes),
    existeVinculoEntre: (a, b) => casos.existeVinculoEntre(a, b),
    buscarTrampos: (filtros) => casos.buscarTrampos(filtros),
  };
}
