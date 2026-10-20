import type { FastifyPluginAsync } from 'fastify';
import {
  exigirAutenticacao,
  type ValidarSessao,
} from '../../../../compartilhado/http/autenticacao.js';
import type {
  CandidaturaDoFreelancer,
  CandidaturaVisao,
  CasosDeUsoDeTrampos,
} from '../../aplicacao/casos-de-uso.js';
import type { EntradaDeCandidatura } from '../../dominio/candidatura.js';
import type { EntradaDeTrampo, TrampoResumo } from '../../dominio/trampo.js';

export interface OpcoesDasRotasDeTrampos {
  /** Fachada de `contas`: devolve a conta dona do token ou `null`. */
  readonly validarSessao: ValidarSessao;
}

const CAMPOS_DO_TRAMPO = [
  'titulo',
  'descricao',
  'categoria',
  'cidade',
  'valorCentavos',
  'prazo',
] as const;

const CAMPOS_DA_CANDIDATURA = ['mensagem', 'valorPropostoCentavos'] as const;

/*
 * Os schemas só conferem formato e tipo; tamanho, obrigatoriedade e valor são
 * regras do domínio (que aponta todos os campos de uma vez, CA5). O `null` é
 * aceito para o domínio responder `obrigatorio`, e não `invalido`.
 *
 * O Ajv do Fastify vem com `removeAdditional: true`: com `additionalProperties:
 * false` sozinho, a chave extra (ex.: `autorId`, `status`) seria apagada em
 * silêncio. `propertyNames` faz a requisição com chave extra ser recusada com
 * 400 `dados_invalidos`: o corpo não escolhe autor nem status.
 */
const corpoDoTrampo = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: CAMPOS_DO_TRAMPO },
  properties: {
    titulo: { type: ['string', 'null'] },
    descricao: { type: ['string', 'null'] },
    categoria: { type: ['string', 'null'] },
    cidade: { type: ['string', 'null'] },
    valorCentavos: { type: ['integer', 'null'] },
    prazo: { type: ['string', 'null'] },
  },
} as const;

const corpoDaCandidatura = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: CAMPOS_DA_CANDIDATURA },
  properties: {
    mensagem: { type: ['string', 'null'] },
    valorPropostoCentavos: { type: ['integer', 'null'] },
  },
} as const;

/*
 * Schemas de resposta: o `fast-json-stringify` só serializa as chaves
 * listadas, então uma coluna interna (`textoBusca`, `versao`) nunca sai na API
 * mesmo que alguém a ponha no objeto de resposta.
 */
const RESPOSTA_DE_CRIACAO = {
  type: 'object',
  required: ['id', 'status'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, status: { type: 'string' } },
} as const;

const RESPOSTA_DO_ACEITE = {
  type: 'object',
  required: ['status'],
  additionalProperties: false,
  properties: { status: { type: 'string' } },
} as const;

export const TRAMPO_PUBLICO = {
  type: 'object',
  required: [
    'id',
    'autorId',
    'titulo',
    'descricao',
    'categoria',
    'cidade',
    'valorCentavos',
    'prazo',
    'status',
    'criadoEm',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    autorId: { type: 'string' },
    titulo: { type: 'string' },
    descricao: { type: 'string' },
    categoria: { type: 'string' },
    cidade: { type: 'string' },
    valorCentavos: { type: 'integer' },
    prazo: { type: ['string', 'null'] },
    status: { type: 'string' },
    criadoEm: { type: 'string' },
  },
} as const;

const PROPRIEDADES_DA_CANDIDATURA = {
  id: { type: 'string' },
  freelancerId: { type: 'string' },
  mensagem: { type: 'string' },
  valorPropostoCentavos: { type: 'integer' },
  status: { type: 'string' },
  criadaEm: { type: 'string' },
} as const;

export const CANDIDATURA_PUBLICA = {
  type: 'object',
  required: Object.keys(PROPRIEDADES_DA_CANDIDATURA),
  additionalProperties: false,
  properties: PROPRIEDADES_DA_CANDIDATURA,
} as const;

const MINHA_CANDIDATURA = {
  type: 'object',
  required: [...Object.keys(PROPRIEDADES_DA_CANDIDATURA), 'trampoId'],
  additionalProperties: false,
  properties: { ...PROPRIEDADES_DA_CANDIDATURA, trampoId: { type: 'string' } },
} as const;

interface ParametrosDoTrampo {
  id: string;
}

interface ParametrosDaCandidatura {
  id: string;
  cid: string;
}

/** Visão pública do trampo: sem as colunas internas de busca. */
function trampoParaResposta(trampo: TrampoResumo) {
  return {
    id: trampo.id,
    autorId: trampo.autorId,
    titulo: trampo.titulo,
    descricao: trampo.descricao,
    categoria: trampo.categoria,
    cidade: trampo.cidade,
    valorCentavos: trampo.valorCentavos,
    prazo: trampo.prazo,
    status: trampo.status,
    criadoEm: trampo.criadoEm.toISOString(),
  };
}

function candidaturaParaResposta(candidatura: CandidaturaVisao) {
  return {
    id: candidatura.id,
    freelancerId: candidatura.freelancerId,
    mensagem: candidatura.mensagem,
    valorPropostoCentavos: candidatura.valorPropostoCentavos,
    status: candidatura.status,
    criadaEm: candidatura.criadaEm.toISOString(),
  };
}

function minhaCandidaturaParaResposta(candidatura: CandidaturaDoFreelancer) {
  return {
    ...candidaturaParaResposta(candidatura),
    trampoId: candidatura.trampoId,
  };
}

/**
 * Rotas de trampos e candidaturas (plugin Fastify). Todas exigem sessão
 * (CA14): o hook roda no `onRequest`, antes de ler o corpo. Os erros de
 * domínio viram 400/404/409 no tratador compartilhado.
 */
export function rotasDeTrampos(
  casos: CasosDeUsoDeTrampos,
  opcoes: OpcoesDasRotasDeTrampos,
): FastifyPluginAsync {
  return async (app) => {
    app.addHook('onRequest', exigirAutenticacao(opcoes.validarSessao));

    // CA4, CA5 e D9.
    app.post(
      '/trampos',
      {
        schema: {
          body: corpoDoTrampo,
          response: { 201: RESPOSTA_DE_CRIACAO },
        },
      },
      async (requisicao, resposta) => {
        const criado = await casos.publicarTrampo(
          requisicao.contaId,
          requisicao.body as EntradaDeTrampo,
        );
        return resposta.code(201).send(criado);
      },
    );

    // Antes de `/trampos/:id`, para "meus" não ser lido como id.
    app.get(
      '/trampos/meus',
      {
        schema: {
          response: { 200: { type: 'array', items: TRAMPO_PUBLICO } },
        },
      },
      async (requisicao) => {
        const trampos = await casos.listarMeusTrampos(requisicao.contaId);
        return trampos.map(trampoParaResposta);
      },
    );

    app.get<{ Params: ParametrosDoTrampo }>(
      '/trampos/:id',
      { schema: { response: { 200: TRAMPO_PUBLICO } } },
      async (requisicao) => {
        return trampoParaResposta(
          await casos.obterTrampo(requisicao.params.id),
        );
      },
    );

    // CA8, CA9, CA11 e D9.
    app.post<{ Params: ParametrosDoTrampo }>(
      '/trampos/:id/candidaturas',
      {
        schema: {
          body: corpoDaCandidatura,
          response: { 201: RESPOSTA_DE_CRIACAO },
        },
      },
      async (requisicao, resposta) => {
        const criada = await casos.candidatar(
          requisicao.contaId,
          requisicao.params.id,
          requisicao.body as EntradaDeCandidatura,
        );
        return resposta.code(201).send(criada);
      },
    );

    // CA8: só o autor; para os demais, 404.
    app.get<{ Params: ParametrosDoTrampo }>(
      '/trampos/:id/candidaturas',
      {
        schema: {
          response: { 200: { type: 'array', items: CANDIDATURA_PUBLICA } },
        },
      },
      async (requisicao) => {
        const candidaturas = await casos.listarCandidaturas(
          requisicao.contaId,
          requisicao.params.id,
        );
        return candidaturas.map(candidaturaParaResposta);
      },
    );

    // CA10: só o autor (404 para os demais); concorrência → 409.
    app.post<{ Params: ParametrosDaCandidatura }>(
      '/trampos/:id/candidaturas/:cid/aceitar',
      { schema: { response: { 200: RESPOSTA_DO_ACEITE } } },
      async (requisicao) => {
        await casos.aceitarCandidatura(
          requisicao.contaId,
          requisicao.params.id,
          requisicao.params.cid,
        );
        return { status: 'aceita' as const };
      },
    );

    app.get(
      '/candidaturas/minhas',
      {
        schema: {
          response: { 200: { type: 'array', items: MINHA_CANDIDATURA } },
        },
      },
      async (requisicao) => {
        const candidaturas = await casos.listarMinhasCandidaturas(
          requisicao.contaId,
        );
        return candidaturas.map(minhaCandidaturaParaResposta);
      },
    );
  };
}
