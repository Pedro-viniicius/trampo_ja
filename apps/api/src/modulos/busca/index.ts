/**
 * Fachada pública do módulo `busca` (só leitura): compõe as fachadas de
 * `trampos` e `servicos` e expõe `GET /busca` e `GET /categorias`.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { ValidarSessao } from '../../compartilhado/http/autenticacao.js';
import type { ModuloDeServicos } from '../servicos/index.js';
import type { ModuloDeTrampos } from '../trampos/index.js';
import { criarRotasDeBusca } from './adaptadores/http/rotas.js';
import { criarCasosDeUsoDeBusca } from './aplicacao/buscar.js';

export interface DependenciasDoModuloDeBusca {
  /** Fachada de `trampos` (só `buscarTrampos` é usada). */
  readonly trampos: Pick<ModuloDeTrampos, 'buscarTrampos'>;
  /** Fachada de `servicos` (só `buscarServicos` é usada). */
  readonly servicos: Pick<ModuloDeServicos, 'buscarServicos'>;
}

export interface ModuloDeBusca {
  /** `GET /busca` e `GET /categorias`, ambas com token (CA14). */
  readonly rotas: (opcoes: {
    readonly validarSessao: ValidarSessao;
  }) => FastifyPluginAsync;
}

export function criarModuloDeBusca(
  deps: DependenciasDoModuloDeBusca,
): ModuloDeBusca {
  const casos = criarCasosDeUsoDeBusca({
    buscarTrampos: (filtros) => deps.trampos.buscarTrampos(filtros),
    buscarServicos: (filtros) => deps.servicos.buscarServicos(filtros),
  });
  const plugin = criarRotasDeBusca(casos);
  return {
    rotas:
      ({ validarSessao }) =>
      async (app) => {
        await app.register(plugin, { validarSessao });
      },
  };
}
