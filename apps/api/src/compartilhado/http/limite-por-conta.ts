/**
 * Limite de volume por conta (D29, CA20).
 *
 * Toda rota autenticada pertence a um grupo, e cada grupo tem um contador
 * próprio por conta no store em memória do `@fastify/rate-limit` (como na D2:
 * um processo, um contador). A chave é `conta:<grupo>:<contaId>`, então outra
 * conta atrás do mesmo IP não é afetada. Acima do limite, 429
 * `{"erro":"muitas_requisicoes"}` (pelo tratador compartilhado) com
 * `retry-after` em segundos.
 *
 * O hook roda no `preHandler`, depois da autenticação (`onRequest`), quando o
 * `contaId` já existe. Com `contaId` vazio (rota pública), não faz nada: lá
 * valem os limites por IP e por e-mail da composição. `DELETE /sessoes` (sair)
 * fica fora de todo grupo (S8): o logout nunca recebe 429.
 *
 * Uma rota pode somar tetos ao próprio grupo (`gruposDaRota`): enviar
 * mensagem conta em `mensagens` (por minuto) e em `mensagens_dia` (por dia).
 */
import type {
  FastifyInstance,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify';

export type GrupoDeLimite =
  | 'leitura'
  | 'mensagens'
  | 'mensagens_dia'
  | 'publicacao'
  | 'senha'
  | 'escrita';

/** Quantas requisições cabem numa janela de tempo. */
export interface LimiteDoGrupo {
  readonly max: number;
  readonly janelaMs: number;
}

export type LimitesPorConta = Readonly<Record<GrupoDeLimite, LimiteDoGrupo>>;

const MINUTO_MS = 60_000;
const DIA_MS = 24 * 60 * MINUTO_MS;

/**
 * D29: números de cada grupo. São constantes, não variáveis de ambiente: mudar
 * um limite é decisão de produto e passa por revisão.
 * - `leitura` 600/min: o pior caso legítimo é a carga de uma conversa longa
 *   (20 páginas a cada 5 s, ou 240/min);
 * - `mensagens` 30/min; `publicacao` 30/h; `senha` 5 a cada 15 min;
 * - `escrita` 60/min;
 * - `mensagens_dia` 1000 a cada 24 h, somado aos 30/min de `mensagens` (nota
 *   de 2026-10-23 na D29): sem ele, uma conta enviaria 43 200 mensagens por
 *   dia e incharia a própria exportação.
 */
export const LIMITES_PADRAO_POR_CONTA: LimitesPorConta = {
  leitura: { max: 600, janelaMs: MINUTO_MS },
  mensagens: { max: 30, janelaMs: MINUTO_MS },
  mensagens_dia: { max: 1000, janelaMs: DIA_MS },
  publicacao: { max: 30, janelaMs: 60 * MINUTO_MS },
  senha: { max: 5, janelaMs: 15 * MINUTO_MS },
  escrita: { max: 60, janelaMs: MINUTO_MS },
};

/** Rotas `POST` com grupo próprio; as demais escritas caem em `escrita`. */
const GRUPO_DO_POST: ReadonlyMap<string, GrupoDeLimite> = new Map([
  ['/conversas/:id/mensagens', 'mensagens'],
  ['/trampos', 'publicacao'],
  ['/servicos', 'publicacao'],
  ['/trampos/:id/candidaturas', 'publicacao'],
  ['/contas/eu/exclusao', 'senha'],
  ['/contas/eu/exportacao', 'senha'],
]);

/**
 * Rotas autenticadas sem limite por conta, como `<MÉTODO> <url modelo>` (S8):
 * sair (`DELETE /sessoes`) só apaga a própria sessão, e um 429 ali deixaria a
 * sessão viva no servidor depois de o app esquecer o token.
 */
const ROTAS_SEM_LIMITE: ReadonlySet<string> = new Set(['DELETE /sessoes']);

/**
 * Tetos somados ao grupo da rota, por `<MÉTODO> <url modelo>`. Cada um tem
 * contador próprio e só vale para a rota da tabela.
 */
const TETOS_DA_ROTA: ReadonlyMap<string, readonly GrupoDeLimite[]> = new Map([
  ['POST /conversas/:id/mensagens', ['mensagens_dia']],
]);

/**
 * Grupo de limite de uma rota, pelo método e pelo modelo da URL (o `url` do
 * `onRoute` ou `request.routeOptions.url`, ex.: `/conversas/:id/mensagens`).
 *
 * `GET` e `HEAD` são `leitura`; os `POST` da tabela têm grupo próprio; as
 * rotas de `ROTAS_SEM_LIMITE` dão `null` (sem limite por conta); todo o resto é
 * `escrita`, inclusive método ou rota que ninguém previu: na dúvida, o limite
 * apertado de escrita, nunca o de leitura nem nenhum.
 */
export function grupoDaRota(
  metodo: string,
  urlModelo: string,
): GrupoDeLimite | null {
  const verbo = metodo.toUpperCase();
  if (ROTAS_SEM_LIMITE.has(`${verbo} ${urlModelo}`)) {
    return null;
  }
  if (verbo === 'GET' || verbo === 'HEAD') {
    return 'leitura';
  }
  if (verbo === 'POST') {
    return GRUPO_DO_POST.get(urlModelo) ?? 'escrita';
  }
  return 'escrita';
}

/**
 * Todos os contadores que uma rota consome, na ordem em que são conferidos: o
 * grupo de `grupoDaRota` e, depois, os tetos de `TETOS_DA_ROTA`. Lista vazia
 * para rota sem limite por conta (S8).
 *
 * @example
 * gruposDaRota('POST', '/conversas/:id/mensagens'); // ['mensagens', 'mensagens_dia']
 * gruposDaRota('POST', '/conversas'); // ['escrita']
 */
export function gruposDaRota(
  metodo: string,
  urlModelo: string,
): readonly GrupoDeLimite[] {
  const grupo = grupoDaRota(metodo, urlModelo);
  if (grupo === null) {
    return [];
  }
  const tetos = TETOS_DA_ROTA.get(`${metodo.toUpperCase()} ${urlModelo}`);
  return [grupo, ...(tetos ?? [])];
}

/**
 * Tamanho do LRU de cada grupo (o padrão do plugin é 5000). Quando enche, a
 * conta usada há mais tempo perde o contador, o que afrouxa o limite em vez de
 * bloquear alguém. Cada entrada tem a chave e três números: no pior caso
 * (20 mil por grupo, nos seis grupos), algo na casa de 25 MB.
 */
const CONTAS_POR_GRUPO = 20_000;

/**
 * Opções do `createRateLimit` com o tamanho do LRU. O `.d.ts` do
 * `@fastify/rate-limit` 11 não declara `cache` aqui, mas o plugin repassa as
 * opções ao `child` do `LocalStore`, que o usa; um teste prova o efeito. Se
 * uma atualização do plugin parar de repassar, aquele teste falha.
 */
type OpcoesDoLimitador = Parameters<FastifyInstance['createRateLimit']>[0] & {
  readonly cache: number;
};

type Limitador = ReturnType<FastifyInstance['createRateLimit']>;

function validarLimite(
  grupo: GrupoDeLimite,
  limite: LimiteDoGrupo | undefined,
): asserts limite is LimiteDoGrupo {
  // Sem esta checagem, o plugin troca número inválido pelo padrão dele
  // (1000 por minuto) em silêncio.
  if (limite === undefined) {
    throw new Error(`limite por conta inválido: falta o grupo ${grupo}`);
  }
  if (!Number.isSafeInteger(limite.max) || limite.max < 1) {
    throw new Error(`limite por conta inválido: max do grupo ${grupo}`);
  }
  if (!Number.isSafeInteger(limite.janelaMs) || limite.janelaMs < 1) {
    throw new Error(`limite por conta inválido: janelaMs do grupo ${grupo}`);
  }
}

/**
 * Cria o hook `preHandler` do limite por conta, com um contador por grupo.
 * Confere os grupos de `gruposDaRota` em ordem e para no primeiro estourado:
 * a mensagem recusada pelo limite por minuto não gasta o teto diário.
 * Chame depois de `await app.register(rateLimit, …)` (o hook usa o
 * `createRateLimit` do plugin) e ponha o hook nas rotas autenticadas.
 *
 * Lança erro na criação se o plugin não estiver registrado ou se algum limite
 * não for inteiro positivo.
 *
 * @example
 * await app.register(rateLimit, { global: false });
 * const limitar = criarLimitePorConta(app, LIMITES_PADRAO_POR_CONTA);
 * // no onRoute: rota.preHandler = [...paraLista(rota.preHandler), limitar];
 */
export function criarLimitePorConta(
  app: FastifyInstance,
  limites: LimitesPorConta,
): preHandlerHookHandler {
  if (typeof app.createRateLimit !== 'function') {
    throw new Error(
      'limite por conta: registre o @fastify/rate-limit antes de criar o hook',
    );
  }
  const criar = (grupo: GrupoDeLimite): Limitador => {
    const limite: LimiteDoGrupo | undefined = limites[grupo];
    validarLimite(grupo, limite);
    const opcoes: OpcoesDoLimitador = {
      max: limite.max,
      timeWindow: limite.janelaMs,
      keyGenerator: (requisicao: FastifyRequest) =>
        `conta:${grupo}:${requisicao.contaId}`,
      cache: CONTAS_POR_GRUPO,
    };
    return app.createRateLimit(opcoes);
  };
  const limitadores: Readonly<Record<GrupoDeLimite, Limitador>> = {
    leitura: criar('leitura'),
    mensagens: criar('mensagens'),
    mensagens_dia: criar('mensagens_dia'),
    publicacao: criar('publicacao'),
    senha: criar('senha'),
    escrita: criar('escrita'),
  };

  return async function limitarPorConta(requisicao, resposta) {
    const urlModelo = requisicao.routeOptions.url;
    if (requisicao.contaId === '' || urlModelo === undefined) {
      return;
    }
    for (const grupo of gruposDaRota(requisicao.method, urlModelo)) {
      const resultado = await limitadores[grupo](requisicao);
      if (!resultado.isAllowed && resultado.isExceeded) {
        resposta.header('retry-after', resultado.ttlInSeconds);
        // Sem o contaId nem o grupo na mensagem: o tratador registra o erro.
        throw Object.assign(new Error('limite de requisições por conta'), {
          statusCode: 429,
        });
      }
    }
  };
}
