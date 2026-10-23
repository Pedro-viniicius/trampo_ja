/**
 * Limite de tentativas de login por e-mail+IP (D31, CA42).
 *
 * O `POST /sessoes` passa por este contador no hook `preValidation`
 * (`porEmailEIp`, padrão 10 a cada 15 min): segura quem tenta senhas de uma
 * conta a partir de um endereço, sem travar a dona da conta que entra de
 * outro lugar.
 *
 * O teto por conta (100 por hora, de qualquer IP) não fica aqui: ele é
 * contado no banco pelo caso de uso `entrar` do módulo `contas`, depois de
 * achar a conta e antes do scrypt (achado S1 da rodada 1 da L3: num LRU em
 * memória, pedidos com e-mails de lixo despejavam o contador da vítima). A
 * tentativa recusada aqui não chega ao caso de uso, então não gasta o teto.
 *
 * Chaves: o e-mail é normalizado como no cadastro (aparado e em minúsculas) e
 * entra só como SHA-256, para que o contador em memória nunca tenha o e-mail.
 * O IP passa pelo `normalizeIP` do `@fastify/rate-limit`: no IPv6 vale o
 * prefixo /64 (quem tem um /64 troca de endereço à vontade), e o IPv4 mapeado
 * em IPv6 vira IPv4. Corpo sem e-mail utilizável cai na chave do IP
 * normalizado, que não dá para contornar trocando o texto do e-mail.
 *
 * Acima do limite, 429 `{"erro":"muitas_requisicoes"}` (pelo tratador
 * compartilhado) com `retry-after`. Nem o e-mail nem o hash entram na
 * resposta, na mensagem do erro ou no log.
 *
 * O contador fica no store em memória do plugin, um por processo (D2).
 */
import { createHash } from 'node:crypto';
import { normalizeIP } from '@fastify/rate-limit';
import type {
  FastifyInstance,
  FastifyRequest,
  preValidationHookHandler,
} from 'fastify';

/** Quantas tentativas cabem numa janela de tempo. */
export interface LimiteDeTentativas {
  readonly max: number;
  readonly janelaMs: number;
}

export interface LimitesDeEntrada {
  /** Contador por e-mail+IP. */
  readonly porEmailEIp: LimiteDeTentativas;
}

const MINUTO_MS = 60_000;

/**
 * D31: 10 tentativas por e-mail+IP a cada 15 min. É constante, não
 * variável de ambiente: mudar o limite é decisão de produto.
 */
export const LIMITE_PADRAO_POR_EMAIL_E_IP: LimiteDeTentativas = {
  max: 10,
  janelaMs: 15 * MINUTO_MS,
};

// Maior e-mail que faz sentido contar (RFC 5321); acima disso, vale o IP.
const TAMANHO_MAXIMO_DO_EMAIL = 320;

/**
 * Tamanho do LRU do contador (o padrão do plugin é 5000), como em
 * `limite-por-conta.ts`. Quando enche, a chave usada há mais tempo perde o
 * contador: isso afrouxa este limite (falha aberta), nunca bloqueia ninguém.
 * Quem despeja de propósito ainda esbarra no teto por conta, que fica no
 * banco.
 */
const CHAVES_POR_CONTADOR = 20_000;

/**
 * IP de quem não tem `request.ip` (socket já fechado). Todos caem no mesmo
 * contador, o que só aperta o limite para esse caso raro.
 */
const IP_DESCONHECIDO = 'desconhecido';

/**
 * Opções do `createRateLimit` com o tamanho do LRU. O `.d.ts` do
 * `@fastify/rate-limit` 11 não declara `cache` aqui, mas o plugin repassa as
 * opções ao `child` do `LocalStore`, que o usa; um teste prova o efeito.
 */
type OpcoesDoLimitador = Parameters<FastifyInstance['createRateLimit']>[0] & {
  readonly cache: number;
};

type Limitador = ReturnType<FastifyInstance['createRateLimit']>;

/** SHA-256 do e-mail normalizado, ou `null` se o corpo não tem e-mail útil. */
function hashDoEmail(requisicao: FastifyRequest): string | null {
  const corpo = requisicao.body;
  const bruto =
    typeof corpo === 'object' && corpo !== null && !Array.isArray(corpo)
      ? (corpo as Record<string, unknown>).email
      : undefined;
  if (typeof bruto !== 'string') {
    return null;
  }
  const email = bruto.trim().toLowerCase();
  if (email === '' || email.length > TAMANHO_MAXIMO_DO_EMAIL) {
    return null;
  }
  return createHash('sha256').update(email, 'utf8').digest('hex');
}

/** IP da requisição normalizado: prefixo /64 no IPv6, IPv4 mapeado vira IPv4. */
function ipNormalizado(requisicao: FastifyRequest): string {
  const ip: unknown = requisicao.ip;
  return typeof ip === 'string' && ip !== ''
    ? normalizeIP(ip)
    : IP_DESCONHECIDO;
}

/** Chave do contador por e-mail+IP; sem e-mail, só o IP normalizado. */
function chaveDoLimitePorEmailEIp(requisicao: FastifyRequest): string {
  const ip = ipNormalizado(requisicao);
  const hash = hashDoEmail(requisicao);
  return hash === null ? `ip:${ip}` : `email-ip:${hash}:${ip}`;
}

function validarLimite(
  nome: keyof LimitesDeEntrada,
  limite: LimiteDeTentativas | undefined,
): asserts limite is LimiteDeTentativas {
  // Sem esta checagem, o plugin troca número inválido pelo padrão dele
  // (1000 por minuto) em silêncio.
  if (limite === undefined) {
    throw new Error(`limite de entrada inválido: falta ${nome}`);
  }
  if (!Number.isSafeInteger(limite.max) || limite.max < 1) {
    throw new Error(`limite de entrada inválido: max de ${nome}`);
  }
  if (!Number.isSafeInteger(limite.janelaMs) || limite.janelaMs < 1) {
    throw new Error(`limite de entrada inválido: janelaMs de ${nome}`);
  }
}

/**
 * Cria o hook `preValidation` do limite de login por e-mail+IP (D31), com
 * contador próprio. `preValidation` porque o corpo já foi lido (o e-mail está
 * nele) e o schema ainda não rodou, então corpo inválido também conta.
 *
 * Chame depois de `await app.register(rateLimit, …)` (o hook usa o
 * `createRateLimit` do plugin). Lança erro na criação se o plugin não estiver
 * registrado ou se o limite não for inteiro positivo.
 *
 * @example
 * await app.register(rateLimit, { global: false });
 * const limitar = criarLimiteDeEntrada(app, {
 *   porEmailEIp: LIMITE_PADRAO_POR_EMAIL_E_IP,
 * });
 * // na rota POST /sessoes: preValidation: [limitar]
 */
export function criarLimiteDeEntrada(
  app: FastifyInstance,
  limites: LimitesDeEntrada,
): preValidationHookHandler {
  if (typeof app.createRateLimit !== 'function') {
    throw new Error(
      'limite de entrada: registre o @fastify/rate-limit antes de criar o hook',
    );
  }
  const limite: LimiteDeTentativas | undefined = limites.porEmailEIp;
  validarLimite('porEmailEIp', limite);
  const opcoes: OpcoesDoLimitador = {
    max: limite.max,
    timeWindow: limite.janelaMs,
    keyGenerator: chaveDoLimitePorEmailEIp,
    cache: CHAVES_POR_CONTADOR,
  };
  const conferir: Limitador = app.createRateLimit(opcoes);

  return async function limitarEntrada(requisicao, resposta) {
    const resultado = await conferir(requisicao);
    if (!resultado.isAllowed && resultado.isExceeded) {
      resposta.header('retry-after', resultado.ttlInSeconds);
      // Sem o e-mail, o hash nem a chave na mensagem: o tratador registra o
      // erro no log.
      throw Object.assign(new Error('limite de tentativas de entrada'), {
        statusCode: 429,
      });
    }
  };
}
