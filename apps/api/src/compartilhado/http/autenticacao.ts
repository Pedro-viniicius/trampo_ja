import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Conta dona da sessão. Preenchido por `exigirAutenticacao`; nas rotas
     * públicas fica com o valor inicial `''` (veja `criarServidor`).
     */
    contaId: string;
  }
}

/** Porta para a fachada de `contas`: devolve o id da conta ou `null`. */
export type ValidarSessao = (token: string) => Promise<string | null>;

export type HookDeAutenticacao = (
  requisicao: FastifyRequest,
  resposta: FastifyReply,
) => Promise<FastifyReply | undefined>;

// `Authorization: Bearer <token>` no formato b64token da RFC 6750. O esquema
// não diferencia maiúsculas (RFC 9110). Um espaço só e nada depois do token.
const FORMATO_BEARER = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i;
// O token real tem 32 bytes; o limite evita hash e consulta com texto enorme.
const TAMANHO_MAXIMO_DO_TOKEN = 256;

/** Extrai o token do cabeçalho; `null` se ausente ou fora do formato. */
export function extrairToken(cabecalho: unknown): string | null {
  if (typeof cabecalho !== 'string') {
    return null;
  }
  const token = FORMATO_BEARER.exec(cabecalho)?.[1];
  if (!token || token.length > TAMANHO_MAXIMO_DO_TOKEN) {
    return null;
  }
  return token;
}

/**
 * Hook que exige sessão válida (CA14). Registre como `onRequest`, para recusar
 * antes de ler e validar o corpo: sem sessão, a resposta é sempre
 * `401 {"erro":"nao_autenticado"}`, sem nenhum outro dado.
 *
 * Se `validarSessao` falhar (ex.: banco fora do ar), o erro segue para o
 * tratador de erros e a resposta é 500 `{"erro":"interno"}`.
 *
 * @example
 * app.addHook('onRequest', exigirAutenticacao(contas.validarSessao));
 */
export function exigirAutenticacao(
  validarSessao: ValidarSessao,
): HookDeAutenticacao {
  return async (requisicao, resposta) => {
    const token = extrairToken(requisicao.headers.authorization);
    const contaId = token === null ? null : await validarSessao(token);
    if (typeof contaId !== 'string' || contaId === '') {
      return resposta
        .code(401)
        .header('www-authenticate', 'Bearer')
        .send({ erro: 'nao_autenticado' });
    }
    requisicao.contaId = contaId;
    return undefined;
  };
}
