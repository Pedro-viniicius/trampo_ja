import type { FastifyPluginAsync } from 'fastify';
import {
  exigirAutenticacao,
  type ValidarSessao,
} from '../../../../compartilhado/http/autenticacao.js';
import type { CasosDeUsoDePerfis } from '../../aplicacao/casos-de-uso.js';
import type { EntradaDePerfil, Perfil } from '../../dominio/perfil.js';

export interface OpcoesDasRotasDePerfis {
  /** Porta para a fachada de `contas` (CA14). */
  readonly validarSessao: ValidarSessao;
}

const CAMPOS_DO_PERFIL = [
  'nome',
  'cidade',
  'descricao',
  'habilidades',
] as const;

/**
 * Formato do corpo de `PUT /perfis/eu`: só os tipos. Obrigatoriedade, tamanhos
 * e duplicadas ficam no domínio, que aponta todos os campos de uma vez.
 *
 * - `null` é aceito em todos para o domínio responder `obrigatorio` (nome,
 *   cidade, habilidades) ou "sem descrição"; sem isso o Ajv converteria
 *   `null` em `""`.
 * - O Ajv do Fastify vem com `removeAdditional: true`: `additionalProperties:
 *   false` sozinho apagaria a chave extra (ex.: `contaId`, `email`) em
 *   silêncio. `propertyNames` faz a requisição com chave extra ser recusada.
 */
const CORPO_DO_PERFIL = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: CAMPOS_DO_PERFIL },
  properties: {
    nome: { type: ['string', 'null'] },
    cidade: { type: ['string', 'null'] },
    descricao: { type: ['string', 'null'] },
    habilidades: { type: ['array', 'null'], items: { type: 'string' } },
  },
} as const;

const PARAMETROS_COM_CONTA = {
  type: 'object',
  required: ['contaId'],
  additionalProperties: false,
  properties: { contaId: { type: 'string' } },
} as const;

/** `GET` e `PUT /perfis/eu`: o perfil da própria conta. */
const RESPOSTA_DO_MEU_PERFIL = {
  type: 'object',
  required: ['nome', 'cidade', 'descricao', 'habilidades', 'completo'],
  additionalProperties: false,
  properties: {
    nome: { type: 'string' },
    cidade: { type: 'string' },
    descricao: { type: ['string', 'null'] },
    habilidades: { type: 'array', items: { type: 'string' } },
    completo: { type: 'boolean' },
  },
} as const;

/**
 * `GET /perfis/:contaId` (D8, só com login): nome, cidade, descrição e
 * habilidades, nunca e-mail nem outro dado de conta. `additionalProperties:
 * false` é a segunda barreira: o serializador do Fastify descarta qualquer
 * chave fora da lista, mesmo que um dia o mapeamento passe a mais.
 */
export const RESPOSTA_DO_PERFIL_PUBLICO = {
  type: 'object',
  required: ['contaId', 'nome', 'cidade', 'descricao', 'habilidades'],
  additionalProperties: false,
  properties: {
    contaId: { type: 'string' },
    nome: { type: 'string' },
    cidade: { type: 'string' },
    descricao: { type: ['string', 'null'] },
    habilidades: { type: 'array', items: { type: 'string' } },
  },
} as const;

interface MeuPerfil {
  readonly nome: string;
  readonly cidade: string;
  readonly descricao: string | null;
  readonly habilidades: readonly string[];
  readonly completo: boolean;
}

interface PerfilPublico {
  readonly contaId: string;
  readonly nome: string;
  readonly cidade: string;
  readonly descricao: string | null;
  readonly habilidades: readonly string[];
}

function paraMeuPerfil(perfil: Perfil): MeuPerfil {
  return {
    nome: perfil.nome,
    cidade: perfil.cidade,
    descricao: perfil.descricao ?? null,
    habilidades: perfil.habilidades,
    completo: perfil.completo,
  };
}

function paraPerfilPublico(perfil: Perfil): PerfilPublico {
  return {
    contaId: perfil.contaId,
    nome: perfil.nome,
    cidade: perfil.cidade,
    descricao: perfil.descricao ?? null,
    habilidades: perfil.habilidades,
  };
}

/**
 * Rotas do módulo `perfis`, todas autenticadas (CA14):
 * - `GET /perfis/eu` → 200 `{nome,cidade,descricao,habilidades,completo}`;
 *   404 se a conta ainda não salvou o perfil;
 * - `PUT /perfis/eu` → 200 no mesmo formato (cria ou substitui); 400 campos;
 * - `GET /perfis/:contaId` → 200 perfil público; 404 se não existir, estiver
 *   incompleto ou o id for inválido.
 *
 * Os erros seguem para o tratador compartilhado (`tratarErro`).
 */
export function criarRotasDePerfis(
  casos: CasosDeUsoDePerfis,
): FastifyPluginAsync<OpcoesDasRotasDePerfis> {
  return async (app, opcoes) => {
    // `onRequest`: recusa sem sessão antes de ler e validar o corpo.
    app.addHook('onRequest', exigirAutenticacao(opcoes.validarSessao));

    app.get(
      '/perfis/eu',
      { schema: { response: { 200: RESPOSTA_DO_MEU_PERFIL } } },
      async (requisicao) => {
        const perfil = await casos.obterMeuPerfil(requisicao.contaId);
        return paraMeuPerfil(perfil);
      },
    );

    app.put<{ Body: EntradaDePerfil }>(
      '/perfis/eu',
      {
        schema: {
          body: CORPO_DO_PERFIL,
          response: { 200: RESPOSTA_DO_MEU_PERFIL },
        },
      },
      async (requisicao) => {
        const perfil = await casos.salvarMeuPerfil(
          requisicao.contaId,
          requisicao.body,
        );
        return paraMeuPerfil(perfil);
      },
    );

    // `/perfis/eu` é estático e o roteador do Fastify o prioriza sobre este.
    app.get<{ Params: { contaId: string } }>(
      '/perfis/:contaId',
      {
        schema: {
          params: PARAMETROS_COM_CONTA,
          response: { 200: RESPOSTA_DO_PERFIL_PUBLICO },
        },
      },
      async (requisicao) => {
        const perfil = await casos.obterPerfilPublico(
          requisicao.params.contaId,
        );
        return paraPerfilPublico(perfil);
      },
    );
  };
}
