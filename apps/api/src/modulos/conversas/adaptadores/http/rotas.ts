import type { FastifyPluginAsync } from 'fastify';
import {
  exigirAutenticacao,
  type ValidarSessao,
} from '../../../../compartilhado/http/autenticacao.js';
import type {
  CasosDeUsoDeConversas,
  ResumoDeConversa,
} from '../../aplicacao/casos-de-uso.js';
import type { Mensagem } from '../../dominio/mensagem.js';

export interface OpcoesDasRotasDeConversas {
  /** Porta para a fachada de `contas` (CA14). */
  readonly validarSessao: ValidarSessao;
}

/*
 * Os schemas só conferem formato e tipo; obrigatoriedade e tamanho são regras
 * do domínio. O `null` é aceito para o domínio responder `obrigatorio`.
 *
 * O Ajv do Fastify vem com `removeAdditional: true`: com `additionalProperties:
 * false` sozinho, a chave extra (ex.: `autorId`) seria apagada em silêncio.
 * `propertyNames` faz a requisição com chave extra ser recusada com 400.
 */
const CORPO_DA_ABERTURA = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: ['outroUsuarioId'] },
  properties: {
    outroUsuarioId: { type: ['string', 'null'] },
  },
} as const;

const CORPO_DA_MENSAGEM = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: ['texto'] },
  properties: {
    texto: { type: ['string', 'null'] },
  },
} as const;

const PARAMETROS_COM_ID = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string' } },
} as const;

const CONSULTA_DAS_MENSAGENS = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: ['depoisDe'] },
  properties: { depoisDe: { type: 'string' } },
} as const;

const RESPOSTA_DA_ABERTURA = {
  type: 'object',
  required: ['conversaId'],
  additionalProperties: false,
  properties: { conversaId: { type: 'string' } },
} as const;

const RESUMO_DE_CONVERSA = {
  type: 'object',
  required: ['conversaId', 'outroUsuarioId', 'criadaEm', 'ultimaMensagem'],
  additionalProperties: false,
  properties: {
    conversaId: { type: 'string' },
    outroUsuarioId: { type: 'string' },
    criadaEm: { type: 'string' },
    ultimaMensagem: {
      anyOf: [
        {
          type: 'object',
          required: ['texto', 'enviadaEm'],
          additionalProperties: false,
          properties: {
            texto: { type: 'string' },
            enviadaEm: { type: 'string' },
          },
        },
        { type: 'null' },
      ],
    },
  },
} as const;

const MENSAGEM_PUBLICA = {
  type: 'object',
  required: ['id', 'autorId', 'texto', 'enviadaEm'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    autorId: { type: 'string' },
    texto: { type: 'string' },
    enviadaEm: { type: 'string' },
  },
} as const;

const RESPOSTA_DO_ENVIO = {
  type: 'object',
  required: ['id', 'enviadaEm'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, enviadaEm: { type: 'string' } },
} as const;

interface ParametrosComId {
  id: string;
}

function resumoParaResposta(resumo: ResumoDeConversa) {
  return {
    conversaId: resumo.conversaId,
    outroUsuarioId: resumo.outroUsuarioId,
    criadaEm: resumo.criadaEm.toISOString(),
    ultimaMensagem: resumo.ultimaMensagem
      ? {
          texto: resumo.ultimaMensagem.texto,
          enviadaEm: resumo.ultimaMensagem.enviadaEm.toISOString(),
        }
      : null,
  };
}

function mensagemParaResposta(mensagem: Mensagem) {
  return {
    id: mensagem.id,
    autorId: mensagem.autorId,
    texto: mensagem.texto,
    enviadaEm: mensagem.enviadaEm.toISOString(),
  };
}

/**
 * Rotas do módulo `conversas`, todas autenticadas (CA14):
 * - `POST /conversas {outroUsuarioId}` → 201 `{conversaId}` se nova, 200 se o
 *   par já tinha conversa; 403 `sem_vinculo` (CA13); 409
 *   `conversa_consigo_mesmo`;
 * - `GET /conversas` → 200 conversas de quem pede, última atividade primeiro;
 * - `GET /conversas/:id/mensagens?depoisDe=<id>` → 200 em ordem cronológica,
 *   até 50 por página; 404 para quem não participa (CA12);
 * - `POST /conversas/:id/mensagens {texto}` → 201 `{id,enviadaEm}`; 400 texto
 *   vazio; 404 para quem não participa.
 *
 * O texto da mensagem nunca vai para log (o Fastify não registra o corpo) nem
 * para erro (o domínio só aponta o campo). Os erros seguem para o tratador
 * compartilhado (`tratarErro`).
 */
export function criarRotasDeConversas(
  casos: CasosDeUsoDeConversas,
): FastifyPluginAsync<OpcoesDasRotasDeConversas> {
  return async (app, opcoes) => {
    // `onRequest`: recusa sem sessão antes de ler e validar o corpo.
    app.addHook('onRequest', exigirAutenticacao(opcoes.validarSessao));

    app.post<{ Body: { outroUsuarioId?: string | null } }>(
      '/conversas',
      {
        schema: {
          body: CORPO_DA_ABERTURA,
          response: { 200: RESPOSTA_DA_ABERTURA, 201: RESPOSTA_DA_ABERTURA },
        },
      },
      async (requisicao, resposta) => {
        const { conversaId, nova } = await casos.abrirConversa(
          requisicao.contaId,
          requisicao.body?.outroUsuarioId,
        );
        return resposta.code(nova ? 201 : 200).send({ conversaId });
      },
    );

    app.get(
      '/conversas',
      {
        schema: {
          response: { 200: { type: 'array', items: RESUMO_DE_CONVERSA } },
        },
      },
      async (requisicao) => {
        const conversas = await casos.listarConversas(requisicao.contaId);
        return conversas.map(resumoParaResposta);
      },
    );

    app.get<{ Params: ParametrosComId; Querystring: { depoisDe?: string } }>(
      '/conversas/:id/mensagens',
      {
        schema: {
          params: PARAMETROS_COM_ID,
          querystring: CONSULTA_DAS_MENSAGENS,
          response: { 200: { type: 'array', items: MENSAGEM_PUBLICA } },
        },
      },
      async (requisicao) => {
        const mensagens = await casos.listarMensagens(
          requisicao.contaId,
          requisicao.params.id,
          { depoisDe: requisicao.query.depoisDe },
        );
        return mensagens.map(mensagemParaResposta);
      },
    );

    app.post<{ Params: ParametrosComId; Body: { texto?: string | null } }>(
      '/conversas/:id/mensagens',
      {
        schema: {
          params: PARAMETROS_COM_ID,
          body: CORPO_DA_MENSAGEM,
          response: { 201: RESPOSTA_DO_ENVIO },
        },
      },
      async (requisicao, resposta) => {
        const enviada = await casos.enviarMensagem(
          requisicao.contaId,
          requisicao.params.id,
          requisicao.body?.texto,
        );
        return resposta.code(201).send({
          id: enviada.id,
          enviadaEm: enviada.enviadaEm.toISOString(),
        });
      },
    );
  };
}
