import type { FastifyRequest, FastifyServerOptions, LogLevel } from 'fastify';
import {
  type CampoInvalido,
  ErroDeDominio,
  ErroDeValidacao,
} from '../dominio/erros.js';

/**
 * Logger da API: as opções do pino que o Fastify cria (`criarServidor`).
 *
 * Regra de LGPD (CA15): nenhum log traz e-mail, senha, telefone, nome, o token
 * nem os textos livres do usuário (cidade, descrição, habilidades, mensagem).
 * São três defesas, porque cada uma cobre um buraco da outra:
 * 1. `redact` troca por `[redigido]` as chaves sensíveis em qualquer objeto logado
 *    (`req`, `body`, `headers`, `err`…), até `PROFUNDIDADE_DO_REDACT` níveis.
 * 2. O serializer de `err` é uma lista de permissão: copia só tipo, código,
 *    mensagem e pilha. Nunca copia as outras propriedades do erro, onde o driver
 *    `pg` põe `detail` (`Key (email)=(...)`), `where`, `hint` etc.
 * 3. O serializer de `req` registra o modelo da rota (ex.: `/perfis/:contaId`),
 *    nunca o caminho cru: o caminho e a query string podem trazer texto
 *    digitado pelo usuário (ex.: `GET /perfis/<e-mail>`, `GET /busca?texto=...`).
 */

/**
 * Chaves cujo valor nunca vai para o log, em qualquer objeto. Além das
 * credenciais e dos dados de contato, os textos livres que o usuário digita
 * (perfil, trampos, serviços e mensagens) também são dado pessoal (LGPD).
 */
export const CHAVES_SENSIVEIS = [
  'authorization',
  'senha',
  'email',
  'nome',
  'telefone',
  'token',
  'cidade',
  'descricao',
  'habilidades',
  'texto',
  'mensagem',
  'titulo',
] as const;

/**
 * Quantos níveis de objeto o `redact` cobre abaixo da raiz do log. O pino não
 * tem curinga recursivo, então geramos `chave`, `*.chave`, `*.*.chave`… até aqui.
 * Ex.: `req.body.perfil.contato.email` está no nível 4.
 */
export const PROFUNDIDADE_DO_REDACT = 6;

export const CENSURA = '[redigido]';

/** Caminhos do `redact` do pino para todas as chaves sensíveis. */
export function caminhosDoRedact(): string[] {
  const caminhos: string[] = [];
  for (let nivel = 0; nivel <= PROFUNDIDADE_DO_REDACT; nivel++) {
    for (const chave of CHAVES_SENSIVEIS) {
      caminhos.push(`${'*.'.repeat(nivel)}${chave}`);
    }
  }
  return caminhos;
}

/** Destino do log (ex.: `process.stdout` ou um coletor em memória nos testes). */
export interface DestinoDoLog {
  write(linha: string): void;
}

export interface OpcoesDoLogger {
  readonly nivel: LogLevel;
  /** Sem destino, o pino escreve em `process.stdout`. */
  readonly destino?: DestinoDoLog;
}

/** Opções de logger aceitas por `fastify({ logger })`, sem o atalho `true`. */
export type OpcoesDoLoggerFastify = Exclude<
  FastifyServerOptions['logger'],
  boolean | undefined
>;

export function criarLogger(opcoes: OpcoesDoLogger): OpcoesDoLoggerFastify {
  return {
    level: opcoes.nivel,
    redact: { paths: caminhosDoRedact(), censor: CENSURA },
    serializers: {
      req: serializarRequisicao,
      err: serializarErro,
    },
    ...(opcoes.destino ? { stream: opcoes.destino } : {}),
  };
}

// `type`, e não `interface`: o tipo do Fastify exige assinatura de índice.
export type RequisicaoSerializada = {
  method: string;
  url: string;
  host?: string;
  remoteAddress?: string;
  remotePort?: number;
};

/** Marcador do `url` no log quando nenhuma rota casou com o caminho (404). */
export const URL_DE_ROTA_INEXISTENTE = '/(rota inexistente)';

/**
 * Como o serializer padrão do Fastify, mas o `url` é o modelo da rota que
 * casou (ex.: `/trampos/:id`), sem os valores dos parâmetros nem a query
 * string. Sem rota (404), sai o marcador fixo `URL_DE_ROTA_INEXISTENTE`.
 */
export function serializarRequisicao(
  req: FastifyRequest,
): RequisicaoSerializada {
  return {
    method: req.method,
    url: req.routeOptions?.url ?? URL_DE_ROTA_INEXISTENTE,
    host: req.host,
    remoteAddress: req.ip,
    remotePort: req.socket?.remotePort,
  };
}

export type ErroSerializado = {
  type: string;
  message: string;
  stack: string;
  code?: string;
  statusCode?: number;
  codigo?: string;
  campos?: readonly CampoInvalido[];
  cause?: ErroSerializado;
};

const PROFUNDIDADE_DA_CAUSA = 3;
// SQLSTATE do Postgres: 5 caracteres, dígitos e letras maiúsculas (ex.: 23505).
const FORMATO_SQLSTATE = /^[0-9A-Z]{5}$/;
// Códigos de erro do Node e do Fastify (ex.: ECONNREFUSED, FST_ERR_VALIDATION).
const FORMATO_CODIGO_DE_ERRO = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Serializer de `err` do pino. Lista de permissão, nunca cópia das propriedades:
 * - `ErroDeDominio`: classe, `codigo` e `campos` (nome e motivo, nunca o valor);
 * - erro do driver `pg`: classe e `code` (SQLSTATE). Descarta a mensagem, que
 *   pode citar o valor recusado (ex.: `invalid input syntax for type uuid: "..."`),
 *   e a primeira linha da pilha, que repete a mensagem;
 * - qualquer outro erro: classe, mensagem, pilha, `code` e `statusCode`.
 */
export function serializarErro(erro: unknown): ErroSerializado {
  return serializar(erro, 0);
}

function serializar(erro: unknown, profundidade: number): ErroSerializado {
  if (!(erro instanceof Error)) {
    // Valor lançado que não é Error: nunca registramos o conteúdo.
    return {
      type: typeof erro,
      message: '[valor lançado não é Error]',
      stack: '',
    };
  }

  const type = nomeDaClasse(erro);

  if (erro instanceof ErroDeDominio) {
    return {
      type,
      message: erro.codigo,
      stack: erro.stack ?? '',
      codigo: erro.codigo,
      ...(erro instanceof ErroDeValidacao ? { campos: erro.campos } : {}),
    };
  }

  const code = lerCodigo(erro);

  if (ehErroDoBanco(erro)) {
    return {
      type,
      message: `[omitido: erro do banco${code ? ` ${code}` : ''}]`,
      stack: pilhaSemMensagem(erro),
      ...(code ? { code } : {}),
    };
  }

  const serializado: ErroSerializado = {
    type,
    message: erro.message,
    stack: erro.stack ?? '',
  };
  if (code) {
    serializado.code = code;
  }
  const statusCode = (erro as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number') {
    serializado.statusCode = statusCode;
  }
  if (erro.cause !== undefined && profundidade < PROFUNDIDADE_DA_CAUSA) {
    serializado.cause = serializar(erro.cause, profundidade + 1);
  }
  return serializado;
}

function nomeDaClasse(erro: Error): string {
  const nome = erro.constructor?.name;
  return typeof nome === 'string' && nome !== '' ? nome : 'Error';
}

function lerCodigo(erro: Error): string | undefined {
  const code = (erro as { code?: unknown }).code;
  return typeof code === 'string' && FORMATO_CODIGO_DE_ERRO.test(code)
    ? code
    : undefined;
}

/**
 * O `DatabaseError` do `pg` sempre tem `severity` e um `code` SQLSTATE. Por pato,
 * para não acoplar esta camada ao driver e pegar também erros reempacotados.
 */
function ehErroDoBanco(erro: Error): boolean {
  const { code } = erro as { code?: unknown };
  if (typeof code !== 'string' || !FORMATO_SQLSTATE.test(code)) {
    return false;
  }
  return 'severity' in erro || 'detail' in erro || 'routine' in erro;
}

/** A pilha começa com `Nome: mensagem`; fica só a lista de chamadas. */
function pilhaSemMensagem(erro: Error): string {
  const pilha = erro.stack ?? '';
  const indice = pilha.indexOf('\n    at ');
  return indice === -1 ? '' : pilha.slice(indice + 1);
}
