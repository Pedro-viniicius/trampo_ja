/**
 * Fachada pública do módulo `perfis`: o único arquivo que outro módulo (ou a
 * composição) pode importar. Expõe as rotas, `perfilEstaCompleto` (contrato
 * entre módulos do plano, D9), que a composição liga como
 * `VerificadorDePerfil` de `trampos` e `servicos`, e a parte de `perfis` na
 * exclusão e na exportação da conta (ADR-005).
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Kysely } from 'kysely';
import {
  type Relogio,
  relogioDoSistema,
} from '../../compartilhado/dominio/relogio.js';
import type { ValidarSessao } from '../../compartilhado/http/autenticacao.js';
import { criarRotasDePerfis } from './adaptadores/http/rotas.js';
import {
  excluirDadosDaConta,
  exportarDadosDaConta,
  type ParteDePerfisNaExportacao,
  RepositorioDePerfisPostgres,
} from './adaptadores/postgres/repositorio-postgres.js';
import type { TabelasDePerfis } from './adaptadores/postgres/tabelas.js';
import { criarCasosDeUsoDePerfis } from './aplicacao/casos-de-uso.js';

export type {
  ParteDePerfisNaExportacao,
  PerfilExportado,
} from './adaptadores/postgres/repositorio-postgres.js';

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
  /**
   * Parte de `perfis` em `DadosDaConta.excluirTudo` (D25): apaga o perfil na
   * transação recebida, aberta pela composição. Lança se `contaId` não for
   * uuid ou se `trx` não for uma transação. Sem perfil, resolve sem erro.
   */
  readonly excluirDadosDaConta: (
    trx: Kysely<TabelasDePerfis>,
    contaId: string,
  ) => Promise<void>;
  /**
   * Parte de `perfis` na exportação (D26): o perfil da conta, sem a coluna
   * derivada `cidade_normalizada`; `null` sem perfil.
   */
  readonly exportarDadosDaConta: (
    contaId: string,
  ) => Promise<ParteDePerfisNaExportacao>;
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
    excluirDadosDaConta,
    exportarDadosDaConta: (contaId) => exportarDadosDaConta(opcoes.db, contaId),
  };
}
