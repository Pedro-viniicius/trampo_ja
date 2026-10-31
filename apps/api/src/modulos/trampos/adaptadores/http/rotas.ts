import type { FastifyPluginAsync } from 'fastify';
import {
  exigirAutenticacao,
  type ValidarSessao,
} from '../../../../compartilhado/http/autenticacao.js';
import type {
  CandidaturaDoFreelancer,
  CandidaturaVisao,
  CasosDeUsoDeTrampos,
  EntradaDeEdicaoDeTrampo,
  VisaoDoTrampo,
} from '../../aplicacao/casos-de-uso.js';
import type { EntradaDeCandidatura } from '../../dominio/candidatura.js';
import type { EntradaDeTrampo } from '../../dominio/trampo.js';

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

const CAMPOS_DA_EDICAO = [...CAMPOS_DO_TRAMPO, 'versao'] as const;

/**
 * Corpo de `PUT /trampos/:id` (CA25): os campos do trampo e a `versao` lida
 * (D33). Fechado como o da publicação, então não há como trocar autor,
 * status nem data. A `versao` só aceita inteiro a partir de 1; ausente ou
 * nula, o caso de uso responde `obrigatorio` antes de ler o trampo (o 400 vem
 * antes do 404). Fica fora de `required`, como os outros campos: com ela lá,
 * o `{}` da varredura de limites daria 400 antes do limite por conta.
 */
const corpoDaEdicao = {
  ...corpoDoTrampo,
  propertyNames: { enum: CAMPOS_DA_EDICAO },
  properties: {
    ...corpoDoTrampo.properties,
    versao: { type: ['integer', 'null'], minimum: 1 },
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

const CAMPOS_DA_LISTA_DO_AUTOR = [
  'limite',
  'antesDeCriadoEm',
  'antesDeId',
] as const;

/**
 * Querystring de `GET /trampos/meus` (D47): só os tipos, fechada como os
 * corpos (`propertyNames`), então chave extra dá 400 antes do limite por
 * conta. Com `coerceTypes: false`, chave repetida (array) também dá 400.
 * Valores, faixa e o par do cursor são regra do caso de uso.
 */
const QUERY_DA_LISTA_DO_AUTOR = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: CAMPOS_DA_LISTA_DO_AUTOR },
  properties: {
    limite: { type: 'string' },
    antesDeCriadoEm: { type: 'string' },
    antesDeId: { type: 'string' },
  },
} as const;

interface QueryDaListaDoAutor {
  limite?: string;
  antesDeCriadoEm?: string;
  antesDeId?: string;
}

/**
 * `limite` da querystring como na busca: texto de 1 a 3 dígitos vira número;
 * qualquer outro texto vira `NaN`, que o caso de uso recusa.
 */
function lerLimite(limite: string | undefined): number | undefined {
  if (limite === undefined) {
    return undefined;
  }
  return /^\d{1,3}$/.test(limite) ? Number(limite) : Number.NaN;
}

/*
 * Schemas de resposta: o `fast-json-stringify` só serializa as chaves
 * listadas, então uma coluna interna (`textoBusca`, `cidadeNormalizada`) nunca
 * sai na API mesmo que alguém a ponha no objeto de resposta. `versao` e
 * `candidaturasRecebidas` são opcionais: só o caso de uso as põe, e só na
 * visão do autor (D33).
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
    versao: { type: 'integer' },
    candidaturasRecebidas: { type: 'integer' },
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

/**
 * Trampo como sai na API: sem as colunas internas de busca. `versao` e
 * `candidaturasRecebidas` só saem quando o caso de uso as trouxe (autor).
 */
function trampoParaResposta(trampo: VisaoDoTrampo) {
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
    ...(trampo.versao !== undefined && { versao: trampo.versao }),
    ...(trampo.candidaturasRecebidas !== undefined && {
      candidaturasRecebidas: trampo.candidaturasRecebidas,
    }),
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
 *
 * `GET /trampos/meus?limite&antesDeCriadoEm&antesDeId` (D47, CA66): uma
 * página dos trampos da conta da sessão, na visão do autor; 400 para página
 * inválida ou chave extra.
 *
 * Rotas da L2 (CA25, CA27 a CA29), todas com 204 no sucesso:
 * - `PUT /trampos/:id` → 400; 404; 409 `trampo_nao_editavel`,
 *   `conflito_de_versao`;
 * - `POST /trampos/:id/encerrar` (sem corpo) → 404; 204 também se já estava
 *   encerrado;
 * - `DELETE /trampos/:id` → 404; 409 `trampo_nao_aberto`;
 * - `DELETE /candidaturas/:id` → 404; 409 `candidatura_nao_pendente`.
 *
 * Inexistente, de outra conta ou com id fora do formato uuid dão o mesmo 404.
 * Os limites por conta (`PUT` em `publicacao`; encerrar e os `DELETE` em
 * `escrita`, D36) casam pela url modelo: não troque o nome do parâmetro.
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
    app.get<{ Querystring: QueryDaListaDoAutor }>(
      '/trampos/meus',
      {
        schema: {
          querystring: QUERY_DA_LISTA_DO_AUTOR,
          response: { 200: { type: 'array', items: TRAMPO_PUBLICO } },
        },
      },
      async (requisicao) => {
        const { limite, ...cursor } = requisicao.query;
        const limiteNumerico = lerLimite(limite);
        const trampos = await casos.listarMeusTrampos(requisicao.contaId, {
          ...cursor,
          ...(limiteNumerico !== undefined && { limite: limiteNumerico }),
        });
        return trampos.map(trampoParaResposta);
      },
    );

    app.get<{ Params: ParametrosDoTrampo }>(
      '/trampos/:id',
      { schema: { response: { 200: TRAMPO_PUBLICO } } },
      async (requisicao) => {
        return trampoParaResposta(
          await casos.obterTrampo(requisicao.params.id, requisicao.contaId),
        );
      },
    );

    // CA25: só o autor (404 para os demais).
    app.put<{ Params: ParametrosDoTrampo }>(
      '/trampos/:id',
      { schema: { body: corpoDaEdicao } },
      async (requisicao, resposta) => {
        await casos.editarTrampo(
          requisicao.contaId,
          requisicao.params.id,
          requisicao.body as EntradaDeEdicaoDeTrampo,
        );
        return resposta.code(204).send();
      },
    );

    // CA27: só o autor; encerrar de novo também dá 204 (D34).
    app.post<{ Params: ParametrosDoTrampo }>(
      '/trampos/:id/encerrar',
      async (requisicao, resposta) => {
        await casos.encerrarTrampo(requisicao.contaId, requisicao.params.id);
        return resposta.code(204).send();
      },
    );

    // CA28: só o autor e só trampo aberto.
    app.delete<{ Params: ParametrosDoTrampo }>(
      '/trampos/:id',
      async (requisicao, resposta) => {
        await casos.excluirTrampo(requisicao.contaId, requisicao.params.id);
        return resposta.code(204).send();
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

    // CA29: só a candidatura pendente do próprio freelancer.
    app.delete<{ Params: ParametrosDoTrampo }>(
      '/candidaturas/:id',
      async (requisicao, resposta) => {
        await casos.retirarCandidatura(
          requisicao.contaId,
          requisicao.params.id,
        );
        return resposta.code(204).send();
      },
    );
  };
}
