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
 * - `excluirDadosDaConta` e `exportarDadosDaConta` de cada módulo →
 *   `DadosDaConta` de `contas` (D25, D26), com a exclusão numa transação só;
 * - limite por conta (D29) → `preHandler` de toda rota autenticada, menos
 *   `DELETE /sessoes`, que passa sem contar (S8).
 *
 * Não abre nem fecha a conexão com o banco: quem cria a conexão (o entrypoint
 * `src/servidor.ts` ou o teste) é quem a fecha.
 */
import { createHash } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type {
  FastifyInstance,
  FastifyRequest,
  preHandlerHookHandler,
  preValidationHookHandler,
  RouteOptions,
} from 'fastify';
import { Kysely } from 'kysely';
import type { BancoBase } from './compartilhado/banco/conexao.js';
import { travarContaComExclusividade } from './compartilhado/banco/travas-de-conta.js';
import type { Relogio } from './compartilhado/dominio/relogio.js';
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
 * S1: segundo freio do login, por conta. O limite por IP não segura quem tenta
 * senhas de uma mesma conta a partir de muitos IPs; este conta as tentativas
 * de `POST /sessoes` por e-mail, venham de onde vierem.
 */
export const LIMITE_PADRAO_DE_ENTRADAS_POR_EMAIL: LimiteDeRequisicoes = {
  max: 10,
  janelaMs: 15 * 60_000,
};

/** A rota de entrada, que além do limite por IP tem o limite por e-mail. */
const ROTA_DE_ENTRADA = { metodo: 'POST', url: '/sessoes' } as const;

// Maior e-mail que faz sentido contar (RFC 5321); acima disso, vale o IP.
const TAMANHO_MAXIMO_DO_EMAIL = 320;

/**
 * Chave do limite por e-mail. O e-mail é normalizado como no cadastro
 * (aparado e em minúsculas) e guardado só como SHA-256, para que o contador em
 * memória nunca tenha o e-mail. Corpo sem e-mail utilizável cai na chave do
 * IP, que não dá para contornar trocando o texto do e-mail.
 */
export function chaveDoLimitePorEmail(requisicao: FastifyRequest): string {
  const corpo = requisicao.body;
  const bruto =
    typeof corpo === 'object' && corpo !== null && !Array.isArray(corpo)
      ? (corpo as Record<string, unknown>).email
      : undefined;
  if (typeof bruto === 'string') {
    const email = bruto.trim().toLowerCase();
    if (email !== '' && email.length <= TAMANHO_MAXIMO_DO_EMAIL) {
      const hash = createHash('sha256').update(email, 'utf8').digest('hex');
      return `email:${hash}`;
    }
  }
  return `ip:${requisicao.ip}`;
}

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
   * `LIMITE_PADRAO_DAS_ROTAS_PUBLICAS`; `false` desliga este e o limite por
   * e-mail (testes que não são sobre o limite).
   */
  readonly rateLimit?: LimiteDeRequisicoes | false;
  /**
   * Limite de `POST /sessoes` por e-mail (S1). Padrão:
   * `LIMITE_PADRAO_DE_ENTRADAS_POR_EMAIL`. Ignorado com `rateLimit: false`.
   */
  readonly limitePorEmail?: LimiteDeRequisicoes;
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

/** Fachadas que guardam dados da conta fora de `contas`, mais a de `contas`. */
interface ModulosComDadosDaConta {
  readonly conversas: Pick<
    ModuloDeConversas,
    'excluirDadosDaConta' | 'exportarDadosDaConta'
  >;
  readonly trampos: Pick<
    ModuloDeTrampos,
    'excluirDadosDaConta' | 'exportarDadosDaConta'
  >;
  readonly servicos: Pick<
    ModuloDeServicos,
    'excluirDadosDaConta' | 'exportarDadosDaConta'
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
 * sessões caem por último, junto com a conta. Qualquer falha desfaz tudo;
 * repetir é seguro.
 *
 * A exportação (D26) junta as partes de cada módulo campo a campo, para nada
 * além do contrato v1 sair daqui.
 */
function criarDadosDaConta(
  db: Kysely<BancoBase>,
  modulos: ModulosComDadosDaConta,
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

/**
 * Hook do limite por e-mail (S1), com contador próprio no store em memória do
 * `@fastify/rate-limit` (chave: hash do e-mail, nunca o e-mail). Acima do
 * limite, 429 genérico pelo tratador compartilhado; nem o e-mail nem o hash
 * entram na resposta ou no log.
 */
function criarLimitePorEmail(
  app: FastifyInstance,
  limite: LimiteDeRequisicoes,
): preValidationHookHandler {
  const verificar = app.createRateLimit({
    max: limite.max,
    timeWindow: limite.janelaMs,
    keyGenerator: chaveDoLimitePorEmail,
  });
  return async function limitarEntradaPorEmail(requisicao, resposta) {
    const resultado = await verificar(requisicao);
    if (!resultado.isAllowed && resultado.isExceeded) {
      resposta.header('retry-after', resultado.ttlInSeconds);
      throw Object.assign(new Error('limite de entradas por conta'), {
        statusCode: 429,
      });
    }
  };
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
    dadosDaConta: criarDadosDaConta(db, {
      conversas,
      trampos,
      servicos,
      perfis,
      // Função pura da fachada (não usa o estado do módulo); a referência é
      // resolvida só na hora da exclusão, quando `contas` já existe.
      contas: {
        excluirRegistrosDaConta: (trx, contaId) =>
          contas.excluirRegistrosDaConta(trx, contaId),
      },
    }),
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
  let limitarPorEmail: preValidationHookHandler | undefined;
  let limitarPorConta: preHandlerHookHandler | undefined;

  // Registrado antes de qualquer plugin, este `onRoute` roda antes do
  // `onRoute` do `@fastify/rate-limit`: as rotas públicas são definidas dentro
  // do módulo `contas`, então o `config.rateLimit` é posto aqui, de fora.
  app.addHook('onRoute', (rota) => {
    for (const metodo of metodosDa(rota)) {
      rotas.push({ metodo, url: rota.url });
    }
    if (
      limite !== false &&
      metodosDa(rota).some((metodo) => ehRotaPublica(metodo, rota.url))
    ) {
      rota.config = {
        ...rota.config,
        rateLimit: { max: limite.max, timeWindow: limite.janelaMs },
      };
    }
    if (
      limitarPorEmail !== undefined &&
      rota.url === ROTA_DE_ENTRADA.url &&
      metodosDa(rota).includes(ROTA_DE_ENTRADA.metodo)
    ) {
      // `preValidation`: o corpo já foi lido (o e-mail está nele) e o
      // schema ainda não rodou, então corpo inválido também conta.
      rota.preValidation = [...paraLista(rota.preValidation), limitarPorEmail];
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
    // IP, cada uma com o próprio contador. Os limites por e-mail e por conta
    // usam contadores próprios (`createRateLimit`) no mesmo store. O 429 sai
    // como `{"erro":"muitas_requisicoes"}` pelo tratador compartilhado.
    await app.register(rateLimit, { global: false });
    limitarPorEmail = criarLimitePorEmail(
      app,
      opcoes.limitePorEmail ?? LIMITE_PADRAO_DE_ENTRADAS_POR_EMAIL,
    );
    if (limitesPorConta !== false) {
      try {
        // Lança se algum limite não for inteiro positivo.
        limitarPorConta = criarLimitePorConta(app, limitesPorConta);
      } catch (erro) {
        await app.close();
        throw erro;
      }
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
    fechar: () => app.close(),
  };
}
