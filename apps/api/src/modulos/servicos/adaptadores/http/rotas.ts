import type { FastifyPluginAsync } from 'fastify';
import {
  exigirAutenticacao,
  type ValidarSessao,
} from '../../../../compartilhado/http/autenticacao.js';
import type {
  CasosDeUsoDeServicos,
  VisaoDoServico,
} from '../../aplicacao/casos-de-uso.js';
import type {
  EntradaDeEdicaoDeServico,
  EntradaDeServico,
} from '../../dominio/servico.js';

export interface OpcoesDasRotasDeServicos {
  /** Porta para a fachada de `contas` (CA14). */
  readonly validarSessao: ValidarSessao;
}

const CAMPOS_DA_OFERTA = [
  'titulo',
  'descricao',
  'categoria',
  'cidade',
  'precoBaseCentavos',
] as const;

/**
 * Formato do corpo de `POST /servicos`: só os tipos. Obrigatoriedade, tamanhos
 * e valores ficam no domínio, que aponta todos os campos de uma vez. O `null`
 * é aceito para o domínio responder `obrigatorio`, e não `invalido`, como em
 * `trampos`.
 *
 * O Ajv do Fastify vem com `removeAdditional: true`: com `additionalProperties:
 * false` sozinho, a chave extra (ex.: `autorId`) seria apagada em silêncio.
 * `propertyNames` faz a requisição com chave extra ser recusada com 400.
 */
const CORPO_DA_OFERTA = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: CAMPOS_DA_OFERTA },
  properties: {
    titulo: { type: ['string', 'null'] },
    descricao: { type: ['string', 'null'] },
    categoria: { type: ['string', 'null'] },
    // D7: cidade opcional; `null` ou ausente significa "sem cidade".
    cidade: { type: ['string', 'null'] },
    precoBaseCentavos: { type: ['number', 'null'] },
  },
} as const;

const CAMPOS_DA_EDICAO = [...CAMPOS_DA_OFERTA, 'versao'] as const;

/**
 * Corpo de `PUT /servicos/:id` (CA26): os campos da oferta e a `versao` lida
 * (D33). Fechado como o da oferta, então não há como trocar autor, status nem
 * data. A `versao` só aceita inteiro a partir de 1; ausente ou nula, o caso
 * de uso responde `obrigatorio` antes de ler o serviço (o 400 vem antes do
 * 404). Sem `required` aqui, como nos outros corpos: o domínio aponta o campo.
 */
const CORPO_DA_EDICAO = {
  ...CORPO_DA_OFERTA,
  propertyNames: { enum: CAMPOS_DA_EDICAO },
  properties: {
    ...CORPO_DA_OFERTA.properties,
    versao: { type: ['integer', 'null'], minimum: 1 },
  },
} as const;

const PARAMETROS_COM_ID = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string' } },
} as const;

const RESPOSTA_DA_OFERTA = {
  type: 'object',
  required: ['id', 'status'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, status: { type: 'string' } },
} as const;

/**
 * Serviço como sai na API: sem as colunas internas da busca. A `versao` é
 * opcional: só sai na visão do autor (D33).
 */
const SERVICO_PUBLICO = {
  type: 'object',
  required: [
    'id',
    'autorId',
    'titulo',
    'descricao',
    'categoria',
    'cidade',
    'precoBaseCentavos',
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
    cidade: { type: ['string', 'null'] },
    precoBaseCentavos: { type: 'integer' },
    status: { type: 'string' },
    criadoEm: { type: 'string' },
    versao: { type: 'integer' },
  },
} as const;

interface ServicoPublico {
  readonly id: string;
  readonly autorId: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly categoria: string;
  readonly cidade: string | null;
  readonly precoBaseCentavos: number;
  readonly status: string;
  readonly criadoEm: string;
  readonly versao?: number;
}

function paraResposta(servico: VisaoDoServico): ServicoPublico {
  return {
    id: servico.id,
    autorId: servico.autorId,
    titulo: servico.titulo,
    descricao: servico.descricao,
    categoria: servico.categoria,
    cidade: servico.cidade ?? null,
    precoBaseCentavos: servico.precoBaseCentavos,
    status: servico.status,
    criadoEm: servico.criadoEm.toISOString(),
    ...(servico.versao !== undefined ? { versao: servico.versao } : {}),
  };
}

/**
 * Rotas do módulo `servicos`, todas autenticadas (CA14, D8):
 * - `POST /servicos` → 201 `{id,status:"ativo"}`; 400 campos;
 *   409 `perfil_incompleto` (D9);
 * - `GET /servicos/meus` → 200 lista dos serviços da conta, mais recentes
 *   primeiro, com `versao`;
 * - `GET /servicos/:id` → 200 serviço, com `versao` só para o autor (D33);
 *   404 se não existir;
 * - `PUT /servicos/:id {titulo, descricao, categoria, cidade?,
 *   precoBaseCentavos, versao}` → 204; 400 `dados_invalidos`; 404 se não
 *   existir ou for de outra conta; 409 `conflito_de_versao` (CA26);
 * - `DELETE /servicos/:id` → 204; 404 se não existir ou for de outra conta.
 *
 * Inexistente, de outra conta ou com id fora do formato uuid dão o mesmo 404.
 * Os limites por conta (`PUT` em `publicacao`, `DELETE` em `escrita`, D36)
 * casam pela url modelo `/servicos/:id`: não troque o nome do parâmetro.
 *
 * Os erros seguem para o tratador compartilhado (`tratarErro`).
 */
export function criarRotasDeServicos(
  casos: CasosDeUsoDeServicos,
): FastifyPluginAsync<OpcoesDasRotasDeServicos> {
  return async (app, opcoes) => {
    // `onRequest`: recusa sem sessão antes de ler e validar o corpo.
    app.addHook('onRequest', exigirAutenticacao(opcoes.validarSessao));

    app.post<{ Body: EntradaDeServico }>(
      '/servicos',
      {
        schema: {
          body: CORPO_DA_OFERTA,
          response: { 201: RESPOSTA_DA_OFERTA },
        },
      },
      async (requisicao, resposta) => {
        const ofertado = await casos.ofertarServico(
          requisicao.contaId,
          requisicao.body,
        );
        return resposta.code(201).send(ofertado);
      },
    );

    // Declarada antes de `/servicos/:id` para deixar a intenção explícita
    // (o roteador do Fastify já prioriza o trecho estático).
    app.get(
      '/servicos/meus',
      {
        schema: {
          response: { 200: { type: 'array', items: SERVICO_PUBLICO } },
        },
      },
      async (requisicao) => {
        const servicos = await casos.listarMeusServicos(requisicao.contaId);
        return servicos.map(paraResposta);
      },
    );

    app.get<{ Params: { id: string } }>(
      '/servicos/:id',
      {
        schema: {
          params: PARAMETROS_COM_ID,
          response: { 200: SERVICO_PUBLICO },
        },
      },
      async (requisicao) => {
        const servico = await casos.obterServico(
          requisicao.params.id,
          requisicao.contaId,
        );
        return paraResposta(servico);
      },
    );

    app.put<{ Params: { id: string }; Body: EntradaDeEdicaoDeServico }>(
      '/servicos/:id',
      { schema: { params: PARAMETROS_COM_ID, body: CORPO_DA_EDICAO } },
      async (requisicao, resposta) => {
        await casos.editarServico(
          requisicao.contaId,
          requisicao.params.id,
          requisicao.body,
        );
        return resposta.code(204).send();
      },
    );

    app.delete<{ Params: { id: string } }>(
      '/servicos/:id',
      { schema: { params: PARAMETROS_COM_ID } },
      async (requisicao, resposta) => {
        await casos.excluirServico(requisicao.contaId, requisicao.params.id);
        return resposta.code(204).send();
      },
    );
  };
}
