import type {
  FastifyReply,
  FastifyRequest,
  FastifySchemaValidationError,
} from 'fastify';
import {
  type CampoInvalido,
  ErroDeDominio,
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
  ErroProibido,
  type MotivoDeCampo,
} from '../dominio/erros.js';

/**
 * Tradução de erros para respostas HTTP.
 *
 * Formato único: `{"erro":"<codigo>","campos":[{"campo","motivo"}]}`, com `campos`
 * só quando houver. A resposta nunca traz a mensagem do erro: ela pode conter o
 * valor digitado (mensagens do Ajv, do driver `pg`) e o app traduz pelo código.
 *
 * Domínio → status:
 * - `ErroDeValidacao` → 400 `dados_invalidos` com campos;
 * - `ErroProibido` → 403; `ErroNaoEncontrado` → 404;
 * - `ErroDeRegra` → 409 (ex.: `perfil_incompleto`, `candidatura_duplicada`);
 * - outra subclasse de `ErroDeDominio` → 500: o código dela não passou pela
 *   validação de formato destas classes, então não sai na resposta.
 */

export interface CorpoDeErro {
  erro: string;
  campos?: CampoInvalido[];
}

export interface RespostaDeErro {
  status: number;
  corpo: CorpoDeErro;
}

const INTERNO: RespostaDeErro = { status: 500, corpo: { erro: 'interno' } };

/** Códigos para os 4xx que o próprio Fastify (ou um plugin) gera. */
const CODIGO_POR_STATUS: Readonly<Record<number, string>> = {
  400: 'requisicao_invalida',
  401: 'nao_autenticado',
  403: 'proibido',
  404: 'nao_encontrado',
  405: 'metodo_nao_permitido',
  406: 'requisicao_invalida',
  413: 'corpo_grande_demais',
  415: 'tipo_nao_suportado',
  429: 'muitas_requisicoes',
};

/** Decide status e corpo para qualquer valor lançado durante a requisição. */
export function respostaParaErro(erro: unknown): RespostaDeErro {
  if (erro instanceof ErroDeDominio) {
    return respostaDeDominio(erro);
  }
  if (!(erro instanceof Error)) {
    return INTERNO;
  }

  const validacao = (erro as { validation?: unknown }).validation;
  if (Array.isArray(validacao)) {
    const contexto = (erro as { validationContext?: unknown })
      .validationContext;
    return respostaDeValidacaoDoSchema(
      validacao as FastifySchemaValidationError[],
      typeof contexto === 'string' ? contexto : undefined,
    );
  }

  const status = statusDoErro(erro);
  if (status !== undefined && status >= 400 && status < 500) {
    return {
      status,
      corpo: { erro: CODIGO_POR_STATUS[status] ?? 'requisicao_invalida' },
    };
  }
  return INTERNO;
}

function respostaDeDominio(erro: ErroDeDominio): RespostaDeErro {
  if (erro instanceof ErroDeValidacao) {
    return {
      status: 400,
      corpo: { erro: erro.codigo, campos: erro.campos.map(copiarCampo) },
    };
  }
  if (erro instanceof ErroProibido) {
    return { status: 403, corpo: { erro: erro.codigo } };
  }
  if (erro instanceof ErroNaoEncontrado) {
    return { status: 404, corpo: { erro: erro.codigo } };
  }
  if (erro instanceof ErroDeRegra) {
    return { status: 409, corpo: { erro: erro.codigo } };
  }
  return INTERNO;
}

function copiarCampo({ campo, motivo }: CampoInvalido): CampoInvalido {
  return { campo, motivo };
}

function statusDoErro(erro: Error): number | undefined {
  const { statusCode, status } = erro as {
    statusCode?: unknown;
    status?: unknown;
  };
  if (typeof statusCode === 'number') {
    return statusCode;
  }
  return typeof status === 'number' ? status : undefined;
}

/**
 * Erro de JSON schema do Fastify → 400 `dados_invalidos`. Os campos saem do
 * caminho e da palavra-chave do Ajv; a mensagem do Ajv nunca é copiada.
 * Campo que não passa no formato de identificador do domínio é descartado.
 */
export function respostaDeValidacaoDoSchema(
  erros: readonly FastifySchemaValidationError[],
  contexto?: string,
): RespostaDeErro {
  const campos: CampoInvalido[] = [];
  const vistos = new Set<string>();
  for (const erro of erros) {
    const campo = campoSeguro(nomeDoCampo(erro, contexto), motivoDoAjv(erro));
    const chave = campo ? `${campo.campo}|${campo.motivo}` : '';
    if (campo && !vistos.has(chave)) {
      vistos.add(chave);
      campos.push(campo);
    }
  }
  return {
    status: 400,
    corpo:
      campos.length > 0
        ? { erro: 'dados_invalidos', campos }
        : { erro: 'dados_invalidos' },
  };
}

function nomeDoCampo(
  erro: FastifySchemaValidationError,
  contexto: string | undefined,
): string {
  const partes = (erro.instancePath ?? '')
    .split('/')
    .filter((parte) => parte !== '')
    .map((parte) => parte.replaceAll('~1', '/').replaceAll('~0', '~'));
  const faltando = erro.params?.missingProperty;
  if (erro.keyword === 'required' && typeof faltando === 'string') {
    partes.push(faltando);
  }
  // Erro na raiz (ex.: corpo que não é objeto): o campo é a parte da requisição.
  return partes.length > 0 ? partes.join('.') : (contexto ?? '');
}

function motivoDoAjv(erro: FastifySchemaValidationError): MotivoDeCampo {
  switch (erro.keyword) {
    case 'required':
      return 'obrigatorio';
    case 'minLength':
    case 'maxLength':
    case 'minimum':
    case 'maximum':
    case 'minItems':
    case 'maxItems':
      return 'tamanho';
    default:
      return 'invalido';
  }
}

/** Reaproveita a validação de formato do `ErroDeValidacao`; fora dele, descarta. */
function campoSeguro(
  campo: string,
  motivo: MotivoDeCampo,
): CampoInvalido | undefined {
  try {
    return ErroDeValidacao.doCampo(campo, motivo).campos[0];
  } catch {
    return undefined;
  }
}

/**
 * Tratador de erros do Fastify. Registra o erro pelo serializer seguro do logger
 * (nunca a mensagem como texto do log) e responde no formato da API.
 */
export function tratarErro(
  erro: unknown,
  requisicao: FastifyRequest,
  resposta: FastifyReply,
): FastifyReply {
  const { status, corpo } = respostaParaErro(erro);
  if (status >= 500) {
    requisicao.log.error({ err: erro }, 'erro interno não tratado');
  } else {
    requisicao.log.info({ err: erro, erro: corpo.erro }, 'requisição recusada');
  }
  return resposta.code(status).send(corpo);
}

/** Rota inexistente: 404 sem ecoar método nem caminho. */
export function tratarRotaInexistente(
  _requisicao: FastifyRequest,
  resposta: FastifyReply,
): FastifyReply {
  return resposta.code(404).send({ erro: 'nao_encontrado' });
}
