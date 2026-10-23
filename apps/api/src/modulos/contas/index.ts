/**
 * Fachada pública do módulo `contas`: o único arquivo que outro módulo (ou a
 * composição) pode importar. Expõe a validação de sessão, as rotas, a parte
 * de `contas` na exclusão da conta e os tipos da porta `DadosDaConta`
 * (ADR-005), que a composição implementa.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Kysely } from 'kysely';
import type { Relogio } from '../../compartilhado/dominio/relogio.js';
import { criarRotasDeContas } from './adaptadores/http/rotas.js';
import {
  excluirRegistrosDaConta,
  RepositorioDeContasPostgres,
  RepositorioDeSessoesPostgres,
} from './adaptadores/postgres/repositorios-postgres.js';
import type { TabelasDeContas } from './adaptadores/postgres/tabelas.js';
import { criarCasosDeUsoDeContas } from './aplicacao/casos-de-uso.js';
import { HasherScrypt } from './dominio/hasher.js';
import type { DadosDaConta, HasherDeSenha } from './dominio/portas.js';

export {
  type CandidaturaExportada,
  type ConversaExportada,
  type DadosDaConta,
  type ExportacaoV1,
  FORMATO_DA_EXPORTACAO,
  type MensagemExportada,
  type PartesExportadas,
  type PerfilExportado,
  type ServicoExportado,
  type TrampoExportado,
} from './dominio/portas.js';

export interface OpcoesDoModuloDeContas {
  /** Conexão com o banco; o módulo só usa as tabelas `contas` e `sessoes`. */
  readonly db: Kysely<TabelasDeContas>;
  /** Padrão: scrypt com os parâmetros de produção (N=2^17, r=8, p=1). */
  readonly hasher?: HasherDeSenha;
  /** Padrão: relógio do sistema. */
  readonly relogio?: Relogio;
  /**
   * Dados da conta nos outros módulos (ADR-005), implementados pela
   * composição. Sem a porta, `POST /contas/eu/exclusao` e
   * `POST /contas/eu/exportacao` não são registradas: nunca há exclusão só
   * de parte dos dados.
   */
  readonly dadosDaConta?: DadosDaConta;
}

export interface ModuloDeContas {
  /** Conta dona do token, ou `null` se ausente, desconhecido ou expirado. */
  readonly validarSessao: (token: string) => Promise<string | null>;
  /**
   * `POST /contas`, `POST /sessoes` e `DELETE /sessoes`; com `dadosDaConta`,
   * também `POST /contas/eu/exclusao` e `POST /contas/eu/exportacao`.
   */
  readonly rotas: FastifyPluginAsync;
  /**
   * Parte de `contas` em `DadosDaConta.excluirTudo`: apaga as sessões e
   * depois a conta, na transação recebida (a mesma dos outros módulos, e por
   * último na ordem da D25). Lança se `contaId` não for uuid ou se `trx` não
   * for uma transação. Não usa o estado do módulo: a composição pode
   * referenciá-la ao montar a porta que passa a `criarModuloDeContas`.
   */
  readonly excluirRegistrosDaConta: (
    trx: Kysely<TabelasDeContas>,
    contaId: string,
  ) => Promise<void>;
}

/** Porta ausente: falha fechada, sem apagar nada (as rotas nem existem). */
const DADOS_DA_CONTA_NAO_LIGADOS: DadosDaConta = Object.freeze({
  excluirTudo: async () => {
    throw new Error('contas: porta DadosDaConta não ligada');
  },
  coletarDosOutrosModulos: async () => {
    throw new Error('contas: porta DadosDaConta não ligada');
  },
});

export function criarModuloDeContas(
  opcoes: OpcoesDoModuloDeContas,
): ModuloDeContas {
  const casos = criarCasosDeUsoDeContas({
    contas: new RepositorioDeContasPostgres(opcoes.db),
    sessoes: new RepositorioDeSessoesPostgres(opcoes.db),
    hasher: opcoes.hasher ?? new HasherScrypt(),
    relogio: opcoes.relogio,
    dadosDaConta: opcoes.dadosDaConta ?? DADOS_DA_CONTA_NAO_LIGADOS,
  });
  return {
    validarSessao: casos.validarSessao,
    rotas: criarRotasDeContas(casos, {
      exclusaoEExportacao: opcoes.dadosDaConta !== undefined,
    }),
    excluirRegistrosDaConta,
  };
}
