import type { FastifyPluginAsync } from 'fastify';
import {
  exigirAutenticacao,
  type ValidarSessao,
} from '../../../../compartilhado/http/autenticacao.js';
import type {
  AvaliacaoRecebida,
  CasosDeUsoDeAvaliacoes,
  FavoritoDaConta,
} from '../../aplicacao/casos-de-uso.js';
import type { EntradaDeAvaliacao } from '../../dominio/avaliacao.js';
import type { AvaliacaoFeita } from '../../dominio/portas.js';
import type {
  ResumoDeAvaliacoes,
  ResumoDoPapel,
} from '../../dominio/resumo.js';

export interface OpcoesDasRotasDeAvaliacoes {
  /** Porta para a fachada de `contas` (CA14). */
  readonly validarSessao: ValidarSessao;
}

/*
 * Os schemas de entrada são fechados por `propertyNames` (o Ajv do Fastify vem
 * com `removeAdditional: true`: com `additionalProperties: false` sozinho, a
 * chave extra seria apagada em silêncio, e não recusada com 400).
 *
 * No corpo do `POST /avaliacoes`, o schema só recusa chave desconhecida e
 * corpo que não é objeto: as propriedades não declaram `type`. Tipo,
 * obrigatoriedade, faixa, lista fechada e tamanho são regra do domínio, que
 * aponta todos os campos inválidos de uma vez (CA88) e nunca o valor
 * recebido. Com `type` aqui, o Ajv (`allErrors: false`) pararia no primeiro
 * campo de tipo errado e o 400 apontaria só ele.
 *
 * Querystring e parâmetros chegam como texto (`coerceTypes: false`): o
 * `limite` é convertido aqui, como na busca.
 */
const CAMPOS_DA_AVALIACAO = [
  'trampoId',
  'nota',
  'destaques',
  'comentario',
] as const;

const CORPO_DA_AVALIACAO = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: CAMPOS_DA_AVALIACAO },
  // Sem `type`: o domínio confere cada campo, de qualquer tipo (CA88). As
  // chaves continuam aqui para o `removeAdditional` não apagá-las.
  properties: {
    trampoId: {},
    nota: {},
    destaques: {},
    comentario: {},
  },
} as const;

const CAMPOS_DA_LISTA = ['contaId', 'papel', 'antesDe', 'limite'] as const;

/** Querystring de `GET /avaliacoes` (CA90); chave repetida (lista) dá 400. */
const QUERY_DA_LISTA = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: CAMPOS_DA_LISTA },
  properties: {
    contaId: { type: 'string' },
    papel: { type: 'string' },
    antesDe: { type: 'string' },
    limite: { type: 'string' },
  },
} as const;

/**
 * Lote de ids (CA89, CA91): texto separado por vírgulas ou a chave repetida
 * (lista de textos). O caso de uso recusa mais de 50 e ignora o que não é
 * uuid. `anyOf` com dois schemas, e não `type: ['string', 'array']`: o Ajv em
 * modo estrito só aceita união de tipos com `allowUnionTypes`.
 */
const LOTE_DE_IDS = {
  anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
} as const;

const QUERY_DOS_RESUMOS = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: ['contas'] },
  properties: { contas: LOTE_DE_IDS },
} as const;

const QUERY_DAS_FEITAS = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: ['trampos'] },
  properties: { trampos: LOTE_DE_IDS },
} as const;

/**
 * `:contaId` de `/favoritos/:contaId`. O nome do parâmetro faz parte da url
 * modelo que o limite por conta usa: não troque.
 */
const PARAMETROS_DO_FAVORITO = {
  type: 'object',
  required: ['contaId'],
  additionalProperties: false,
  properties: { contaId: { type: 'string' } },
} as const;

/*
 * Schemas de resposta: o `fast-json-stringify` só serializa as chaves
 * listadas, então nada além do contrato sai (nem o avaliado, nem o id da
 * avaliação na lista, nem o papel), mesmo que o objeto de resposta traga mais.
 */
const RESPOSTA_DA_AVALIACAO = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string' } },
} as const;

const AVALIACAO_RECEBIDA = {
  type: 'object',
  required: ['nota', 'destaques', 'comentario', 'avaliadorId', 'criadaEm'],
  additionalProperties: false,
  properties: {
    nota: { type: 'integer' },
    destaques: { type: 'array', items: { type: 'string' } },
    comentario: { type: ['string', 'null'] },
    avaliadorId: { type: 'string' },
    criadaEm: { type: 'string' },
  },
} as const;

const RESPOSTA_DA_LISTA = {
  type: 'object',
  required: ['itens', 'proximoCursor'],
  additionalProperties: false,
  properties: {
    itens: { type: 'array', items: AVALIACAO_RECEBIDA },
    proximoCursor: { type: ['string', 'null'] },
  },
} as const;

const RESUMO_DO_PAPEL = {
  type: 'object',
  required: ['media', 'total', 'destaques'],
  additionalProperties: false,
  properties: {
    media: { type: ['number', 'null'] },
    total: { type: 'integer' },
    destaques: { type: 'array', items: { type: 'string' } },
  },
} as const;

const RESPOSTA_DOS_RESUMOS = {
  type: 'array',
  items: {
    type: 'object',
    required: ['contaId', 'comoFreela', 'comoContratante'],
    additionalProperties: false,
    properties: {
      contaId: { type: 'string' },
      comoFreela: RESUMO_DO_PAPEL,
      comoContratante: RESUMO_DO_PAPEL,
    },
  },
} as const;

const RESPOSTA_DAS_FEITAS = {
  type: 'array',
  items: {
    type: 'object',
    required: ['trampoId', 'nota', 'criadaEm'],
    additionalProperties: false,
    properties: {
      trampoId: { type: 'string' },
      nota: { type: 'integer' },
      criadaEm: { type: 'string' },
    },
  },
} as const;

const RESPOSTA_DOS_FAVORITOS = {
  type: 'array',
  items: {
    type: 'object',
    required: ['contaId', 'criadoEm'],
    additionalProperties: false,
    properties: {
      contaId: { type: 'string' },
      criadoEm: { type: 'string' },
    },
  },
} as const;

interface QueryDaLista {
  contaId?: string;
  papel?: string;
  antesDe?: string;
  limite?: string;
}

interface ParametrosDoFavorito {
  contaId: string;
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

function recebidaParaResposta(avaliacao: AvaliacaoRecebida) {
  return {
    nota: avaliacao.nota,
    destaques: [...avaliacao.destaques],
    comentario: avaliacao.comentario,
    avaliadorId: avaliacao.avaliadorId,
    criadaEm: avaliacao.criadaEm.toISOString(),
  };
}

function papelParaResposta(resumo: ResumoDoPapel) {
  return {
    media: resumo.media,
    total: resumo.total,
    destaques: [...resumo.destaques],
  };
}

function resumoParaResposta(resumo: ResumoDeAvaliacoes) {
  return {
    contaId: resumo.contaId,
    comoFreela: papelParaResposta(resumo.comoFreela),
    comoContratante: papelParaResposta(resumo.comoContratante),
  };
}

function feitaParaResposta(feita: AvaliacaoFeita) {
  return {
    trampoId: feita.trampoId,
    nota: feita.nota,
    criadaEm: feita.criadaEm.toISOString(),
  };
}

function favoritoParaResposta(favorito: FavoritoDaConta) {
  return {
    contaId: favorito.contaId,
    criadoEm: favorito.criadoEm.toISOString(),
  };
}

/**
 * Rotas do módulo `avaliacoes`, todas autenticadas (CA14):
 * - `POST /avaliacoes {trampoId, nota, destaques?, comentario?}` → 201 `{id}`;
 *   400 com os campos (CA88); 404 para quem não é parte (CA87); 409
 *   `trampo_nao_encerrado` e `avaliacao_ja_feita`;
 * - `GET /avaliacoes?contaId&papel&antesDe&limite` → 200
 *   `{itens, proximoCursor}` (CA90); 400 para filtro inválido;
 * - `GET /avaliacoes/resumos?contas=` → 200, um resumo por conta (CA89);
 * - `GET /avaliacoes/feitas?trampos=` → 200, só as da conta da sessão (CA91);
 * - `GET /favoritos` → 200 `[{contaId, criadoEm}]`, os da conta da sessão;
 * - `PUT /favoritos/:contaId` → 204, também se já era favorito; 404 sem
 *   vínculo ou id fora do formato; 409 `favorito_invalido` e
 *   `limite_de_favoritos` (CA92);
 * - `DELETE /favoritos/:contaId` → 204, idempotente; 404 com id fora do
 *   formato.
 *
 * O comentário nunca vai para log (o Fastify não registra o corpo, e o logger
 * registra só o modelo da url) nem para erro (o domínio só aponta o campo).
 * Os erros seguem para o tratador compartilhado (`tratarErro`).
 */
export function criarRotasDeAvaliacoes(
  casos: CasosDeUsoDeAvaliacoes,
): FastifyPluginAsync<OpcoesDasRotasDeAvaliacoes> {
  return async (app, opcoes) => {
    // `onRequest`: recusa sem sessão antes de ler e validar o corpo.
    app.addHook('onRequest', exigirAutenticacao(opcoes.validarSessao));

    app.post(
      '/avaliacoes',
      {
        schema: {
          body: CORPO_DA_AVALIACAO,
          response: { 201: RESPOSTA_DA_AVALIACAO },
        },
      },
      async (requisicao, resposta) => {
        const criada = await casos.avaliar(
          requisicao.contaId,
          (requisicao.body ?? {}) as EntradaDeAvaliacao,
        );
        return resposta.code(201).send({ id: criada.id });
      },
    );

    app.get<{ Querystring: QueryDaLista }>(
      '/avaliacoes',
      {
        schema: {
          querystring: QUERY_DA_LISTA,
          response: { 200: RESPOSTA_DA_LISTA },
        },
      },
      async (requisicao) => {
        const { limite, ...filtros } = requisicao.query;
        const limiteNumerico = lerLimite(limite);
        const pagina = await casos.listarRecebidas({
          ...filtros,
          ...(limiteNumerico !== undefined && { limite: limiteNumerico }),
        });
        return {
          itens: pagina.itens.map(recebidaParaResposta),
          proximoCursor: pagina.proximoCursor,
        };
      },
    );

    app.get<{ Querystring: { contas?: string | string[] } }>(
      '/avaliacoes/resumos',
      {
        schema: {
          querystring: QUERY_DOS_RESUMOS,
          response: { 200: RESPOSTA_DOS_RESUMOS },
        },
      },
      async (requisicao) => {
        const resumos = await casos.resumir(requisicao.query.contas);
        return resumos.map(resumoParaResposta);
      },
    );

    app.get<{ Querystring: { trampos?: string | string[] } }>(
      '/avaliacoes/feitas',
      {
        schema: {
          querystring: QUERY_DAS_FEITAS,
          response: { 200: RESPOSTA_DAS_FEITAS },
        },
      },
      async (requisicao) => {
        const feitas = await casos.listarFeitas(
          requisicao.contaId,
          requisicao.query.trampos,
        );
        return feitas.map(feitaParaResposta);
      },
    );

    app.get(
      '/favoritos',
      { schema: { response: { 200: RESPOSTA_DOS_FAVORITOS } } },
      async (requisicao) => {
        const favoritos = await casos.listarFavoritos(requisicao.contaId);
        return favoritos.map(favoritoParaResposta);
      },
    );

    app.put<{ Params: ParametrosDoFavorito }>(
      '/favoritos/:contaId',
      { schema: { params: PARAMETROS_DO_FAVORITO } },
      async (requisicao, resposta) => {
        await casos.favoritar(requisicao.contaId, requisicao.params.contaId);
        return resposta.code(204).send();
      },
    );

    app.delete<{ Params: ParametrosDoFavorito }>(
      '/favoritos/:contaId',
      { schema: { params: PARAMETROS_DO_FAVORITO } },
      async (requisicao, resposta) => {
        await casos.desfavoritar(requisicao.contaId, requisicao.params.contaId);
        return resposta.code(204).send();
      },
    );
  };
}
