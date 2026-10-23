/**
 * Fachada pública do módulo `conversas`: o único arquivo que outro módulo (ou
 * a composição) pode importar. Expõe as rotas e a parte de `conversas` na
 * exclusão e na exportação da conta (ADR-005).
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Kysely } from 'kysely';
import {
  type Relogio,
  relogioDoSistema,
} from '../../compartilhado/dominio/relogio.js';
import type { ValidarSessao } from '../../compartilhado/http/autenticacao.js';
import { criarRotasDeConversas } from './adaptadores/http/rotas.js';
import {
  excluirDadosDaConta,
  exportarDadosDaConta,
  medirExportacao,
  type ParteDeConversasNaExportacao,
  RepositorioDeConversasPostgres,
} from './adaptadores/postgres/repositorio-postgres.js';
import type { TabelasDeConversas } from './adaptadores/postgres/tabelas.js';
import { criarCasosDeUsoDeConversas } from './aplicacao/casos-de-uso.js';
import type { VerificadorDeVinculo } from './dominio/portas.js';

export type {
  ConversaExportada,
  MensagemExportada,
  ParteDeConversasNaExportacao,
} from './adaptadores/postgres/repositorio-postgres.js';
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
  /**
   * Parte de `conversas` em `DadosDaConta.excluirTudo` (D25), na transação
   * recebida, aberta pela composição: trava (`for update`) as conversas da
   * conta e as apaga inteiras, com as mensagens dos dois lados. Lança se
   * `contaId` não for uuid ou se `trx` não for uma transação.
   */
  readonly excluirDadosDaConta: (
    trx: Kysely<TabelasDeConversas>,
    contaId: string,
  ) => Promise<void>;
  /**
   * Parte de `conversas` na exportação (D26): cada conversa com o
   * `outroUsuarioId` e só as mensagens escritas pela conta.
   */
  readonly exportarDadosDaConta: (
    contaId: string,
  ) => Promise<ParteDeConversasNaExportacao>;
  /**
   * Tamanho estimado, em bytes, da parte de `conversas` na exportação
   * (CA48), medido no banco antes de coletar: só as mensagens escritas pela
   * conta. Id que não seja uuid: 0.
   */
  readonly medirExportacao: (contaId: string) => Promise<number>;
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
    excluirDadosDaConta,
    exportarDadosDaConta: (contaId) => exportarDadosDaConta(opcoes.db, contaId),
    medirExportacao: (contaId) => medirExportacao(opcoes.db, contaId),
  };
}
