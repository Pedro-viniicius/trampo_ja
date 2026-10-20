import type { FastifyPluginAsync } from 'fastify';
import { CATEGORIAS } from '../../../../compartilhado/dominio/categorias.js';
import {
  exigirAutenticacao,
  type ValidarSessao,
} from '../../../../compartilhado/http/autenticacao.js';
import type { CasosDeUsoDeBusca } from '../../aplicacao/buscar.js';

export interface OpcoesDasRotasDeBusca {
  /** Porta para a fachada de `contas` (CA14). */
  readonly validarSessao: ValidarSessao;
}

/**
 * Só os tipos: o domínio valida valores e tamanhos. `limite` chega como texto
 * numérico e é convertido na rota.
 */
const QUERY_DA_BUSCA = {
  type: 'object',
  properties: {
    texto: { type: 'string' },
    categoria: { type: 'string' },
    cidade: { type: 'string' },
    tipo: { type: 'string' },
    antesDe: { type: 'string' },
    limite: { type: 'string' },
  },
} as const;

const ITEM_DA_BUSCA = {
  type: 'object',
  required: [
    'tipo',
    'id',
    'autorId',
    'titulo',
    'categoria',
    'cidade',
    'criadoEm',
  ],
  additionalProperties: false,
  properties: {
    tipo: { type: 'string' },
    id: { type: 'string' },
    autorId: { type: 'string' },
    titulo: { type: 'string' },
    categoria: { type: 'string' },
    cidade: { type: ['string', 'null'] },
    valorCentavos: { type: 'integer' },
    precoBaseCentavos: { type: 'integer' },
    criadoEm: { type: 'string' },
  },
} as const;

const RESPOSTA_DA_BUSCA = {
  type: 'object',
  required: ['itens', 'proximoCursor'],
  additionalProperties: false,
  properties: {
    itens: { type: 'array', items: ITEM_DA_BUSCA },
    proximoCursor: { type: ['string', 'null'] },
  },
} as const;

const RESPOSTA_DAS_CATEGORIAS = {
  type: 'array',
  items: {
    type: 'object',
    required: ['id', 'rotulo'],
    additionalProperties: false,
    properties: { id: { type: 'string' }, rotulo: { type: 'string' } },
  },
} as const;

interface QueryDaBusca {
  texto?: string;
  categoria?: string;
  cidade?: string;
  tipo?: string;
  antesDe?: string;
  limite?: string;
}

/** Texto numérico → número; qualquer outra coisa vira `NaN` (o caso de uso recusa). */
function lerLimite(limite: string | undefined): number | undefined {
  if (limite === undefined) {
    return undefined;
  }
  return /^\d{1,3}$/.test(limite) ? Number(limite) : Number.NaN;
}

/**
 * Rotas do módulo `busca`, só leitura e todas autenticadas (CA14):
 * - `GET /busca?texto&categoria&cidade&tipo&antesDe&limite` → 200
 *   `{itens, proximoCursor}`; 400 para filtro inválido;
 * - `GET /categorias` → 200 `[{id, rotulo}]`.
 *
 * Os erros seguem para o tratador compartilhado (`tratarErro`).
 */
export function criarRotasDeBusca(
  casos: CasosDeUsoDeBusca,
): FastifyPluginAsync<OpcoesDasRotasDeBusca> {
  return async (app, opcoes) => {
    // `onRequest`: recusa sem sessão antes de validar a querystring.
    app.addHook('onRequest', exigirAutenticacao(opcoes.validarSessao));

    app.get<{ Querystring: QueryDaBusca }>(
      '/busca',
      {
        schema: {
          querystring: QUERY_DA_BUSCA,
          response: { 200: RESPOSTA_DA_BUSCA },
        },
      },
      async (requisicao) => {
        const { limite, ...filtros } = requisicao.query;
        const limiteNumerico = lerLimite(limite);
        return casos.buscar({
          ...filtros,
          ...(limiteNumerico !== undefined && { limite: limiteNumerico }),
        });
      },
    );

    app.get(
      '/categorias',
      { schema: { response: { 200: RESPOSTA_DAS_CATEGORIAS } } },
      async () => CATEGORIAS.map(({ id, rotulo }) => ({ id, rotulo })),
    );
  };
}
