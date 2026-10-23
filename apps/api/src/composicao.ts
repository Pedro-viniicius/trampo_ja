/**
 * Composition root da API: o único lugar que conhece todos os módulos.
 *
 * Instancia cada módulo pela fachada (`src/modulos/<modulo>/index.ts`), liga as
 * portas entre eles e registra as rotas numa instância criada por
 * `criarServidor`:
 * - `perfis.perfilEstaCompleto` → `VerificadorDePerfil` de `trampos` e
 *   `servicos` (D9);
 * - `trampos.existeVinculoEntre` → `VerificadorDeVinculo` de `conversas` (CA13),
 *   inclusive na transação da abertura de conversa (Q1);
 * - `trampos.buscarTrampos` e `servicos.buscarServicos` → `busca` (CA7);
 * - `contas.validarSessao` → hook de autenticação de todas as rotas, exceto
 *   `POST /contas` e `POST /sessoes` (CA14);
 * - `excluirDadosDaConta`, `exportarDadosDaConta` e `medirExportacao` de cada
 *   módulo → `DadosDaConta` de `contas` (D25, D26, D41), com a exclusão numa
 *   transação só, que grava também a lápide da conta (ADR-007);
 * - `contas.limparRegistrosVencidos` → `Aplicacao.limparRegistrosVencidos`,
 *   que o entrypoint agenda (D40);
 * - limite de entrada (D31) → `preValidation` de `POST /sessoes`, com o
 *   contador por e-mail+IP em memória (`limite-de-entrada.ts`); o teto por
 *   conta é contado no banco pelo módulo `contas` (`limitePorEmail` →
 *   `tetoDeTentativas`);
 * - limite por conta (D29) → `preHandler` de toda rota autenticada, menos
 *   `DELETE /sessoes`, que passa sem contar (S8).
 *
 * Não abre nem fecha a conexão com o banco: quem cria a conexão (o entrypoint
 * `src/servidor.ts` ou o teste) é quem a fecha.
 */
import rateLimit from '@fastify/rate-limit';
import type {
  FastifyInstance,
  preHandlerHookHandler,
  preValidationHookHandler,
  RouteOptions,
} from 'fastify';
import { Kysely } from 'kysely';
import type { BancoBase } from './compartilhado/banco/conexao.js';
import { travarContaComExclusividade } from './compartilhado/banco/travas-de-conta.js';
import {
  type Relogio,
  relogioDoSistema,
} from './compartilhado/dominio/relogio.js';
import {
  criarLimiteDeEntrada,
  LIMITE_PADRAO_POR_EMAIL_E_IP,
  type LimiteDeTentativas,
} from './compartilhado/http/limite-de-entrada.js';
import {
  criarLimitePorConta,
  LIMITES_PADRAO_POR_CONTA,
  type LimitesPorConta,
} from './compartilhado/http/limite-por-conta.js';
import type { OpcoesDoLoggerFastify } from './compartilhado/http/logger.js';
import { criarServidor } from './compartilhado/http/servidor.js';
import { criarModuloDeBusca } from './modulos/busca/index.js';
import {
  criarModuloDeContas,
  type DadosDaConta,
  type ModuloDeContas,
  type OpcoesDoModuloDeContas,
  type ResultadoDaLimpeza,
  type TetoDeTentativas,
} from './modulos/contas/index.js';
import {
  criarModuloDeConversas,
  type ModuloDeConversas,
  type OpcoesDoModuloDeConversas,
} from './modulos/conversas/index.js';
import {
  criarModuloDePerfis,
  type ModuloDePerfis,
  type OpcoesDoModuloDePerfis,
} from './modulos/perfis/index.js';
import {
  criarModuloDeServicos,
  type ModuloDeServicos,
  type OpcoesDoModuloDeServicos,
} from './modulos/servicos/index.js';
import {
  criarModuloDeTrampos,
  type DependenciasDoModuloDeTrampos,
  type ModuloDeTrampos,
} from './modulos/trampos/index.js';

/** Limite de requisições por IP numa janela de tempo (D2). */
export interface LimiteDeRequisicoes {
  readonly max: number;
  readonly janelaMs: number;
}

/**
 * D2: até 10 cadastros e 10 entradas por minuto, por IP, com contadores
 * separados para cada rota. É uma constante, não variável de ambiente: mudar
 * o limite é decisão de produto e passa por revisão.
 */
export const LIMITE_PADRAO_DAS_ROTAS_PUBLICAS: LimiteDeRequisicoes = {
  max: 10,
  janelaMs: 60_000,
};

/**
 * A rota de entrada, que além do limite por IP tem o limite de entrada por
 * e-mail+IP (D31).
 */
const ROTA_DE_ENTRADA = { metodo: 'POST', url: '/sessoes' } as const;

/**
 * Tamanho do LRU do limite por IP da rota de entrada (o padrão do plugin é
 * 5000). O IPv6 conta por /64, e quem tem um /48 tem 65 536 prefixos. O LRU
 * grande só evita que o despejo zere os contadores que já existem (com 5000
 * chaves, trocar de prefixo apagaria o contador; achado S1 da rodada 1 da L3).
 * Ele não limita quem tem um /48: são 65 536 prefixos de 10 pedidos por
 * minuto cada. A barreira contra força bruta numa conta é o teto por conta no
 * banco (D31); contra *password spraying* (uma senha em muitas contas), vale
 * só o limite por IP (D2). São bytes por chave, poucos MiB no pior caso.
 */
export const CHAVES_DO_LIMITE_POR_IP_NA_ENTRADA = 100_000;

export interface RotaRegistrada {
  readonly metodo: string;
  readonly url: string;
}

/** As únicas rotas sem token (CA14); são também as que têm rate limit (D2). */
export const ROTAS_PUBLICAS: readonly RotaRegistrada[] = [
  { metodo: 'POST', url: '/contas' },
  { metodo: 'POST', url: '/sessoes' },
];

export interface OpcoesDaAplicacao {
  /** Conexão com o banco; cada módulo recebe a visão das próprias tabelas. */
  readonly db: Kysely<BancoBase>;
  /** Opções de `criarLogger` ou `false` (padrão) para não registrar nada. */
  readonly logger?: OpcoesDoLoggerFastify | false;
  /** Padrão: relógio do sistema (de cada módulo). */
  readonly relogio?: Relogio;
  /**
   * Rate limit de `POST /contas` e `POST /sessoes`, por IP. Padrão:
   * `LIMITE_PADRAO_DAS_ROTAS_PUBLICAS`; `false` desliga este e o limite de
   * entrada por e-mail+IP (testes que não são sobre o limite). O teto por
   * conta (`limitePorEmail`) continua.
   */
  readonly rateLimit?: LimiteDeRequisicoes | false;
  /**
   * Limite de `POST /sessoes` por e-mail+IP (D31), em memória, no
   * `preValidation`. Padrão: `LIMITE_PADRAO_POR_EMAIL_E_IP` (10 a cada
   * 15 min). Ignorado com `rateLimit: false`.
   */
  readonly limitePorEmailEIp?: LimiteDeTentativas;
  /**
   * Teto de entrada por conta, de qualquer IP (D31), contado no banco pelo
   * caso de uso `entrar` de `contas`, antes do scrypt; a recusa do limite por
   * e-mail+IP não chega lá. Padrão: `TETO_PADRAO_POR_EMAIL` (100 por hora).
   * É regra do caso de uso: `rateLimit: false` não o desliga. Inválido (não
   * inteiro positivo, janela acima de um dia), recusa a montagem.
   */
  readonly limitePorEmail?: TetoDeTentativas;
  /**
   * Limite por conta de cada grupo de rotas autenticadas (D29). Padrão:
   * `LIMITES_PADRAO_POR_CONTA`; `false` desliga. `rateLimit: false` também
   * desliga este limite (testes que não são sobre limites).
   */
  readonly limitesPorConta?: LimitesPorConta | false;
  /** `trustProxy` de `criarServidor` (padrão `false`: o IP da conexão). */
  readonly trustProxy?: string | boolean;
}

export interface Aplicacao {
  /** Instância pronta (`ready`), com todas as rotas; falta só o `listen`. */
  readonly app: FastifyInstance;
  /** Método e caminho de cada rota registrada, na ordem de registro. */
  readonly rotas: readonly RotaRegistrada[];
  /**
   * Uma rodada da limpeza periódica (D40, ADR-007): sessões expiradas e
   * contas excluídas há 10 min ou mais. Idempotente; quem agenda é o
   * entrypoint. Rejeita com o primeiro erro da rodada.
   */
  limparRegistrosVencidos(): Promise<ResultadoDaLimpeza>;
  /** Fecha o servidor HTTP. A conexão com o banco fica com quem a criou. */
  fechar(): Promise<void>;
}

/**
 * Cada fachada pede `Kysely<TabelasDoModulo>`, e o tipo das tabelas não sai do
 * módulo. A conexão é uma só (`Kysely<BancoBase>`, sem tabelas no tipo); aqui
 * ela é apresentada a cada módulo como a visão das tabelas dele. A conversão é
 * só de tipo, e é a única deste arquivo: cada módulo continua sem enxergar, no
 * tipo, as tabelas dos outros.
 */
function visaoDoModulo<TabelasDoModulo>(
  db: Kysely<BancoBase>,
): TabelasDoModulo {
  return db as unknown as TabelasDoModulo;
}

/**
 * Teto da parte de `perfis` na medida da exportação (D41): o perfil tem
 * tamanho limitado (nome e cidade até 80, descrição até 300 e até 10
 * habilidades de 30 caracteres, até 4 bytes cada em UTF-8), bem abaixo disso.
 * Por isso não é medido no banco.
 */
export const BYTES_DO_PERFIL_NA_MEDIDA = 8 * 1024;

/** Fachadas que guardam dados da conta fora de `contas`, mais a de `contas`. */
interface ModulosComDadosDaConta {
  readonly conversas: Pick<
    ModuloDeConversas,
    'excluirDadosDaConta' | 'exportarDadosDaConta' | 'medirExportacao'
  >;
  readonly trampos: Pick<
    ModuloDeTrampos,
    'excluirDadosDaConta' | 'exportarDadosDaConta' | 'medirExportacao'
  >;
  readonly servicos: Pick<
    ModuloDeServicos,
    'excluirDadosDaConta' | 'exportarDadosDaConta' | 'medirExportacao'
  >;
  readonly perfis: Pick<
    ModuloDePerfis,
    'excluirDadosDaConta' | 'exportarDadosDaConta'
  >;
  readonly contas: Pick<ModuloDeContas, 'excluirRegistrosDaConta'>;
}

/**
 * A transação que `conversas` repassa ao `VerificadorDeVinculo` é opaca para o
 * domínio dele; aqui ela volta a ser a transação do Kysely. Qualquer outra
 * coisa é erro de ligação, não um "sem vínculo".
 */
function transacaoDoKysely(transacao: unknown): Kysely<BancoBase> {
  if (!(transacao instanceof Kysely) || !transacao.isTransaction) {
    throw new TypeError(
      'composição: a conferência do vínculo exige a transação',
    );
  }
  return transacao;
}

/**
 * Porta `DadosDaConta` de `contas` (ADR-005).
 *
 * A exclusão (D25) abre **uma** transação e passa a mesma a cada módulo, na
 * ordem conversas → trampos → serviços → perfis → contas. Antes de tudo, pega
 * a trava exclusiva da conta (`travas-de-conta.ts`): a abertura de conversa
 * com ela, que pega a compartilhada, ou já terminou ou espera esta transação
 * (Q1). Depois vêm as travas (`for update`) de conversas e trampos, e as
 * sessões caem por último, junto com a conta e a gravação da lápide com a
 * hora do `relogio` (ADR-007). Qualquer falha desfaz tudo; repetir é seguro
 * (é o que a limpeza periódica faz com cada lápide).
 *
 * A exportação (D26) junta as partes de cada módulo campo a campo, para nada
 * além do contrato v1 sair daqui. A medida (D41) soma a de conversas, trampos
 * e serviços, feita no banco, e o teto fixo do perfil.
 */
function criarDadosDaConta(
  db: Kysely<BancoBase>,
  modulos: ModulosComDadosDaConta,
  relogio: Relogio,
): DadosDaConta {
  const { conversas, trampos, servicos, perfis, contas } = modulos;
  return {
    excluirTudo: (contaId) =>
      db.transaction().execute(async (trx) => {
        await travarContaComExclusividade(trx, contaId);
        await conversas.excluirDadosDaConta(
          visaoDoModulo<OpcoesDoModuloDeConversas['db']>(trx),
          contaId,
        );
        await trampos.excluirDadosDaConta(
          visaoDoModulo<DependenciasDoModuloDeTrampos['db']>(trx),
          contaId,
        );
        await servicos.excluirDadosDaConta(
          visaoDoModulo<OpcoesDoModuloDeServicos['db']>(trx),
          contaId,
        );
        await perfis.excluirDadosDaConta(
          visaoDoModulo<OpcoesDoModuloDePerfis['db']>(trx),
          contaId,
        );
        await contas.excluirRegistrosDaConta(
          visaoDoModulo<OpcoesDoModuloDeContas['db']>(trx),
          contaId,
          relogio.agora(),
        );
      }),
    coletarDosOutrosModulos: async (contaId) => {
      const [deConversas, deTrampos, deServicos, dePerfis] = await Promise.all([
        conversas.exportarDadosDaConta(contaId),
        trampos.exportarDadosDaConta(contaId),
        servicos.exportarDadosDaConta(contaId),
        perfis.exportarDadosDaConta(contaId),
      ]);
      return {
        perfil: dePerfis.perfil,
        trampos: deTrampos.trampos,
        servicos: deServicos.servicos,
        candidaturas: deTrampos.candidaturas,
        conversas: deConversas.conversas,
      };
    },
    medirDosOutrosModulos: async (contaId) => {
      const medidas = await Promise.all([
        conversas.medirExportacao(contaId),
        trampos.medirExportacao(contaId),
        servicos.medirExportacao(contaId),
      ]);
      return (
        medidas.reduce((soma, bytes) => soma + bytes, 0) +
        BYTES_DO_PERFIL_NA_MEDIDA
      );
    },
  };
}

function ehRotaPublica(metodo: string, url: string): boolean {
  return ROTAS_PUBLICAS.some(
    (publica) => publica.metodo === metodo && publica.url === url,
  );
}

function metodosDa(rota: RouteOptions): string[] {
  return Array.isArray(rota.method) ? [...rota.method] : [rota.method];
}

function paraLista<T>(valor: T | T[] | undefined): T[] {
  if (valor === undefined) {
    return [];
  }
  return Array.isArray(valor) ? [...valor] : [valor];
}

/** Monta a API inteira: módulos, portas entre eles, rate limit e rotas. */
export async function montarAplicacao(
  opcoes: OpcoesDaAplicacao,
): Promise<Aplicacao> {
  const { db, relogio } = opcoes;
  const limite =
    opcoes.rateLimit === undefined
      ? LIMITE_PADRAO_DAS_ROTAS_PUBLICAS
      : opcoes.rateLimit;
  const limitesPorConta =
    opcoes.limitesPorConta === undefined
      ? LIMITES_PADRAO_POR_CONTA
      : opcoes.limitesPorConta;

  const perfis = criarModuloDePerfis({
    db: visaoDoModulo<OpcoesDoModuloDePerfis['db']>(db),
    relogio,
  });
  const verificadorDePerfil = {
    perfilEstaCompleto: perfis.perfilEstaCompleto,
  };
  const trampos = criarModuloDeTrampos({
    db: visaoDoModulo<DependenciasDoModuloDeTrampos['db']>(db),
    verificadorDePerfil,
    relogio,
  });
  const servicos = criarModuloDeServicos({
    db: visaoDoModulo<OpcoesDoModuloDeServicos['db']>(db),
    verificadorDePerfil,
    relogio,
  });
  const conversas = criarModuloDeConversas({
    db: visaoDoModulo<OpcoesDoModuloDeConversas['db']>(db),
    verificadorDeVinculo: {
      existeVinculoEntre: (a, b, transacao) =>
        trampos.existeVinculoEntre(
          a,
          b,
          transacao === undefined
            ? undefined
            : visaoDoModulo<DependenciasDoModuloDeTrampos['db']>(
                transacaoDoKysely(transacao),
              ),
        ),
    },
    relogio,
  });
  // Criado depois dos outros: a porta `DadosDaConta` usa as fachadas deles.
  const contas = criarModuloDeContas({
    db: visaoDoModulo<OpcoesDoModuloDeContas['db']>(db),
    relogio,
    ...(opcoes.limitePorEmail !== undefined
      ? { tetoDeTentativas: opcoes.limitePorEmail }
      : {}),
    dadosDaConta: criarDadosDaConta(
      db,
      {
        conversas,
        trampos,
        servicos,
        perfis,
        // Função pura da fachada (não usa o estado do módulo); a referência
        // é resolvida só na hora da exclusão, quando `contas` já existe.
        contas: {
          excluirRegistrosDaConta: (trx, contaId, agora) =>
            contas.excluirRegistrosDaConta(trx, contaId, agora),
        },
      },
      relogio ?? relogioDoSistema,
    ),
  });
  const busca = criarModuloDeBusca({ trampos, servicos });

  const app = criarServidor({
    logger: opcoes.logger ?? false,
    ...(opcoes.trustProxy !== undefined
      ? { trustProxy: opcoes.trustProxy }
      : {}),
  });
  const rotas: RotaRegistrada[] = [];
  // Criados depois do registro do `@fastify/rate-limit`, antes das rotas.
  let limitarEntrada: preValidationHookHandler | undefined;
  let limitarPorConta: preHandlerHookHandler | undefined;

  // Registrado antes de qualquer plugin, este `onRoute` roda antes do
  // `onRoute` do `@fastify/rate-limit`: as rotas públicas são definidas dentro
  // do módulo `contas`, então o `config.rateLimit` é posto aqui, de fora.
  app.addHook('onRoute', (rota) => {
    for (const metodo of metodosDa(rota)) {
      rotas.push({ metodo, url: rota.url });
    }
    const ehEntrada =
      rota.url === ROTA_DE_ENTRADA.url &&
      metodosDa(rota).includes(ROTA_DE_ENTRADA.metodo);
    if (
      limite !== false &&
      metodosDa(rota).some((metodo) => ehRotaPublica(metodo, rota.url))
    ) {
      rota.config = {
        ...rota.config,
        rateLimit: {
          max: limite.max,
          timeWindow: limite.janelaMs,
          ...(ehEntrada ? { cache: CHAVES_DO_LIMITE_POR_IP_NA_ENTRADA } : {}),
        },
      };
    }
    if (limitarEntrada !== undefined && ehEntrada) {
      // `preValidation`: o corpo já foi lido (o e-mail está nele) e o
      // schema ainda não rodou, então corpo inválido também conta.
      rota.preValidation = [...paraLista(rota.preValidation), limitarEntrada];
    }
    if (
      limitarPorConta !== undefined &&
      !metodosDa(rota).some((metodo) => ehRotaPublica(metodo, rota.url))
    ) {
      // `preHandler`: depois da autenticação (o `contaId` já existe) e do
      // schema. Um hook só para todas as rotas; ele escolhe os contadores
      // pelos grupos da rota (`gruposDaRota`; o envio de mensagem soma o teto
      // diário), rota sem grupo previsto cai em `escrita` e `DELETE /sessoes`
      // passa sem contar (S8). A rota HEAD automática passa por aqui por conta
      // própria.
      const preHandler = paraLista(rota.preHandler);
      if (!preHandler.includes(limitarPorConta)) {
        rota.preHandler = [limitarPorConta, ...preHandler];
      }
    }
  });

  if (limite !== false) {
    // `global: false`: só as rotas com `config.rateLimit` são limitadas por
    // IP, cada uma com o próprio contador. Os limites de entrada e por conta
    // usam contadores próprios (`createRateLimit`) no mesmo store. O 429 sai
    // como `{"erro":"muitas_requisicoes"}` pelo tratador compartilhado.
    await app.register(rateLimit, { global: false });
    try {
      // Os dois lançam se algum limite não for inteiro positivo.
      limitarEntrada = criarLimiteDeEntrada(app, {
        porEmailEIp: opcoes.limitePorEmailEIp ?? LIMITE_PADRAO_POR_EMAIL_E_IP,
      });
      if (limitesPorConta !== false) {
        limitarPorConta = criarLimitePorConta(app, limitesPorConta);
      }
    } catch (erro) {
      await app.close();
      throw erro;
    }
  }

  const { validarSessao } = contas;
  await app.register(contas.rotas);
  await app.register(perfis.rotas({ validarSessao }));
  await app.register(trampos.rotas({ validarSessao }));
  await app.register(servicos.rotas({ validarSessao }));
  await app.register(conversas.rotas({ validarSessao }));
  await app.register(busca.rotas({ validarSessao }));
  await app.ready();

  if (limite !== false) {
    const semLimite = ROTAS_PUBLICAS.filter(
      (publica) =>
        !rotas.some(
          (rota) => rota.metodo === publica.metodo && rota.url === publica.url,
        ),
    );
    if (semLimite.length > 0) {
      await app.close();
      throw new Error(
        `rate limit sem rota: ${semLimite.map((r) => `${r.metodo} ${r.url}`).join(', ')}`,
      );
    }
  }

  return {
    app,
    rotas,
    limparRegistrosVencidos: () => contas.limparRegistrosVencidos(),
    fechar: () => app.close(),
  };
}
