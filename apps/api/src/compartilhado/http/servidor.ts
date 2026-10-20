import Fastify, { type FastifyInstance } from 'fastify';
// Importado pelo efeito: traz a declaração de `FastifyRequest.contaId`.
import './autenticacao.js';
import { tratarErro, tratarRotaInexistente } from './erros.js';
import type { OpcoesDoLoggerFastify } from './logger.js';

export interface OpcoesDoServidor {
  /**
   * Opções criadas por `criarLogger` (com `redact` e serializers seguros) ou
   * `false` para não registrar nada. O atalho `true` do Fastify não é aceito,
   * porque usaria o logger sem as proteções do CA15.
   */
  readonly logger: OpcoesDoLoggerFastify | false;
  /**
   * `trustProxy` do Fastify, que decide de onde vem `request.ip` (e, com ele,
   * a chave do rate limit). Padrão `false`: o IP da conexão. Atrás de proxy,
   * passe os IPs/CIDRs do proxy (texto separado por vírgula); `true` confia em
   * qualquer `X-Forwarded-For` e só é seguro se só o proxy alcança a porta.
   * Número de saltos não é aceito: o Fastify 5 não confia em ninguém com ele.
   */
  readonly trustProxy?: string | boolean;
}

/**
 * Opções do Ajv que validam os schemas das rotas, por cima do padrão do
 * `@fastify/ajv-compiler` (que segue valendo no resto, inclusive
 * `allErrors: false`, que evita DoS na validação):
 * - `coerceTypes: false`: `type: 'string'` aceita só texto. O padrão (`'array'`)
 *   converteria número, booleano e `null` em texto e um valor solto em lista.
 *   Querystring e parâmetros de rota chegam sempre como texto: quem precisa de
 *   número converte na rota (ex.: `limite` da busca).
 * - `removeAdditional: true` (o padrão do Fastify): com
 *   `additionalProperties: false` sozinho, a chave fora do schema seria
 *   apagada em silêncio antes do handler. Por isso todo schema de corpo
 *   também declara `propertyNames: { enum: [...] }`, que recusa a chave extra
 *   com 400 `dados_invalidos` (ex.: `autorId` ou `status` no corpo de
 *   `POST /trampos`).
 */
export const OPCOES_DO_AJV = {
  coerceTypes: false,
  removeAdditional: true,
  allErrors: false,
} as const;

/**
 * Fábrica da instância Fastify: tratador de erros, 404 e `contaId` registrados,
 * sem rotas. Cada módulo registra as suas como plugin; o `listen` fica no
 * entrypoint `src/servidor.ts`.
 */
export function criarServidor(opcoes: OpcoesDoServidor): FastifyInstance {
  const servidor = Fastify({
    logger: opcoes.logger,
    ajv: { customOptions: OPCOES_DO_AJV },
    trustProxy: opcoes.trustProxy ?? false,
  });
  // Valor inicial nas rotas públicas; `exigirAutenticacao` sobrescreve.
  servidor.decorateRequest('contaId', '');
  servidor.setErrorHandler(tratarErro);
  servidor.setNotFoundHandler(tratarRotaInexistente);
  return servidor;
}
