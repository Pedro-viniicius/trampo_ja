/**
 * Fachada pública do módulo `avaliacoes` (ADR-011): o único arquivo que outro
 * módulo (ou a composição) pode importar. Expõe as rotas e a parte de
 * `avaliacoes` na exclusão e na exportação da conta (ADR-005, CA93).
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Kysely } from 'kysely';
import {
  type Relogio,
  relogioDoSistema,
} from '../../compartilhado/dominio/relogio.js';
import type { ValidarSessao } from '../../compartilhado/http/autenticacao.js';
import { criarRotasDeAvaliacoes } from './adaptadores/http/rotas.js';
import {
  excluirDadosDaConta,
  exportarDadosDaConta,
  medirExportacao,
  type ParteDeAvaliacoesNaExportacao,
  RepositorioDeAvaliacoesPostgres,
} from './adaptadores/postgres/repositorio-postgres.js';
import type { TabelasDeAvaliacoes } from './adaptadores/postgres/tabelas.js';
import { criarCasosDeUsoDeAvaliacoes } from './aplicacao/casos-de-uso.js';
import type {
  VerificadorDeVinculo,
  VinculoDeAvaliacao,
} from './dominio/portas.js';

export type {
  AvaliacaoFeitaExportada,
  AvaliacaoRecebidaExportada,
  FavoritoExportado,
  ParteDeAvaliacoesNaExportacao,
} from './adaptadores/postgres/repositorio-postgres.js';
export type {
  TransacaoEmCurso,
  VerificadorDeVinculo,
  VinculoDeAvaliacao,
  VinculoParaAvaliacao,
} from './dominio/portas.js';

export interface OpcoesDoModuloDeAvaliacoes {
  /** Conexão com o banco; o módulo só usa `avaliacoes` e `favoritos`. */
  readonly db: Kysely<TabelasDeAvaliacoes>;
  /**
   * CA87: na composição, `trampos.vinculoParaAvaliacao`. Na gravação, recebe
   * a transação do insert (`Kysely<TabelasDeAvaliacoes>`, já com a trava
   * compartilhada das duas contas), que a composição repassa a `trampos`.
   */
  readonly vinculoDeAvaliacao: VinculoDeAvaliacao;
  /**
   * CA92 (D4): na composição, `trampos.existeVinculoEntre`, com a mesma
   * transação na gravação do favorito.
   */
  readonly verificadorDeVinculo: VerificadorDeVinculo;
  /** Padrão: relógio do sistema. */
  readonly relogio?: Relogio;
}

export interface ModuloDeAvaliacoes {
  /**
   * `POST /avaliacoes`, `GET /avaliacoes`, `GET /avaliacoes/resumos`,
   * `GET /avaliacoes/feitas`, `GET /favoritos`, `PUT /favoritos/:contaId` e
   * `DELETE /favoritos/:contaId`, todas com token (CA14).
   */
  readonly rotas: (opcoes: {
    readonly validarSessao: ValidarSessao;
  }) => FastifyPluginAsync;
  /**
   * Parte de `avaliacoes` em `DadosDaConta.excluirTudo` (D25, CA93), na
   * transação recebida, aberta pela composição: pega a trava exclusiva da
   * conta e apaga as avaliações feitas e recebidas e os favoritos dos dois
   * lados. Lança se `contaId` não for uuid ou se `trx` não for uma transação.
   */
  readonly excluirDadosDaConta: (
    trx: Kysely<TabelasDeAvaliacoes>,
    contaId: string,
  ) => Promise<void>;
  /**
   * Parte de `avaliacoes` na exportação (D26, CA93): as avaliações feitas
   * (com o comentário), as recebidas (só nota, destaques e data, sem
   * comentário e sem avaliador) e os favoritos da conta.
   */
  readonly exportarDadosDaConta: (
    contaId: string,
  ) => Promise<ParteDeAvaliacoesNaExportacao>;
  /**
   * Tamanho estimado, em bytes, da parte de `avaliacoes` na exportação
   * (CA48, CA93), medido no banco antes de coletar. Id que não seja uuid: 0.
   */
  readonly medirExportacao: (contaId: string) => Promise<number>;
}

export function criarModuloDeAvaliacoes(
  opcoes: OpcoesDoModuloDeAvaliacoes,
): ModuloDeAvaliacoes {
  const casos = criarCasosDeUsoDeAvaliacoes({
    repositorio: new RepositorioDeAvaliacoesPostgres(opcoes.db),
    vinculoDeAvaliacao: opcoes.vinculoDeAvaliacao,
    verificadorDeVinculo: opcoes.verificadorDeVinculo,
    relogio: opcoes.relogio ?? relogioDoSistema,
  });
  const plugin = criarRotasDeAvaliacoes(casos);
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
