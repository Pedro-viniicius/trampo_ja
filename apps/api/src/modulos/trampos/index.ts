import type { FastifyPluginAsync } from 'fastify';
import type { Kysely } from 'kysely';
import {
  type Relogio,
  relogioDoSistema,
} from '../../compartilhado/dominio/relogio.js';
import type { ValidarSessao } from '../../compartilhado/http/autenticacao.js';
import { rotasDeTrampos } from './adaptadores/http/rotas.js';
import {
  excluirDadosDaConta,
  exportarDadosDaConta,
  medirExportacao,
  type ParteDeTramposNaExportacao,
  RepositorioDeTramposPostgres,
} from './adaptadores/postgres/repositorio-postgres.js';
import type { TabelasDeTrampos } from './adaptadores/postgres/tabelas.js';
import {
  criarCasosDeUsoDeTrampos,
  type EntradaDeBusca,
} from './aplicacao/casos-de-uso.js';
import type {
  VerificadorDePerfil,
  VinculoParaAvaliacao,
} from './dominio/portas.js';
import type { TrampoResumo } from './dominio/trampo.js';

export type {
  CandidaturaExportada,
  ParteDeTramposNaExportacao,
  TrampoExportado,
} from './adaptadores/postgres/repositorio-postgres.js';
export type { VinculoParaAvaliacao } from './dominio/portas.js';

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
  /**
   * Para `conversas`: há candidatura, em qualquer estado, entre os dois? Com
   * `trx`, a consulta roda nessa transação (a da abertura de conversa, que
   * segura a trava das contas contra a exclusão); sem, na conexão do módulo.
   */
  readonly existeVinculoEntre: (
    a: string,
    b: string,
    trx?: Kysely<TabelasDeTrampos>,
  ) => Promise<boolean>;
  /**
   * Para `avaliacoes` (CA87, ADR-011): quem `contaId` pode avaliar no trampo.
   * O autor avalia o freelancer aceito (`'freela'`) e o freelancer aceito
   * avalia o autor (`'contratante'`), só com o trampo encerrado; parte com o
   * trampo aberto ou em andamento recebe `'nao_encerrado'`. Terceiro, trampo
   * inexistente, id fora do formato ou encerrado sem aceita: `null`, sem
   * revelar o estado do trampo. Leitura sem trava; com `trx`, roda nessa
   * transação (a da gravação da avaliação), senão na conexão do módulo.
   */
  readonly vinculoParaAvaliacao: (
    trampoId: string,
    contaId: string,
    trx?: Kysely<TabelasDeTrampos>,
  ) => Promise<VinculoParaAvaliacao>;
  /** Para `busca` (CA7): trampos abertos que atendem aos filtros. */
  readonly buscarTrampos: (filtros?: EntradaDeBusca) => Promise<TrampoResumo[]>;
  /**
   * Parte de `trampos` em `DadosDaConta.excluirTudo` (D25), na transação
   * recebida, aberta pela composição: trava (`for update`) os trampos da
   * conta e as candidaturas a apagar, e apaga as candidaturas recebidas, as
   * feitas pela conta e os trampos dela. Lança se `contaId` não for uuid ou
   * se `trx` não for uma transação.
   */
  readonly excluirDadosDaConta: (
    trx: Kysely<TabelasDeTrampos>,
    contaId: string,
  ) => Promise<void>;
  /**
   * Parte de `trampos` na exportação (D26): os trampos da conta, com só a
   * contagem `candidaturasRecebidas` (o texto delas é de terceiros), e as
   * candidaturas que a conta fez.
   */
  readonly exportarDadosDaConta: (
    contaId: string,
  ) => Promise<ParteDeTramposNaExportacao>;
  /**
   * Tamanho estimado, em bytes, da parte de `trampos` na exportação (CA48),
   * medido no banco antes de coletar: os trampos da conta e as candidaturas
   * que ela fez, sem o texto das recebidas. Id que não seja uuid: 0.
   */
  readonly medirExportacao: (contaId: string) => Promise<number>;
}

/** Fachada do módulo `trampos`: único ponto que outro módulo pode importar. */
export function criarModuloDeTrampos(
  deps: DependenciasDoModuloDeTrampos,
): ModuloDeTrampos {
  const repositorio = new RepositorioDeTramposPostgres(deps.db);
  const casos = criarCasosDeUsoDeTrampos({
    repositorio,
    verificadorDePerfil: deps.verificadorDePerfil,
    relogio: deps.relogio ?? relogioDoSistema,
  });
  return {
    rotas: (opcoes) => rotasDeTrampos(casos, opcoes),
    existeVinculoEntre: (a, b, trx) =>
      trx === undefined
        ? casos.existeVinculoEntre(a, b)
        : // Mesma consulta do caso de uso, na conexão de quem chamou.
          new RepositorioDeTramposPostgres(trx).existeCandidaturaEntre(a, b),
    vinculoParaAvaliacao: (trampoId, contaId, trx) =>
      (trx === undefined
        ? repositorio
        : new RepositorioDeTramposPostgres(trx)
      ).vinculoParaAvaliacao(trampoId, contaId),
    buscarTrampos: (filtros) => casos.buscarTrampos(filtros),
    excluirDadosDaConta,
    exportarDadosDaConta: (contaId) => exportarDadosDaConta(deps.db, contaId),
    medirExportacao: (contaId) => medirExportacao(deps.db, contaId),
  };
}
