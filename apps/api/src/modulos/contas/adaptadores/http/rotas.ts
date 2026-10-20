import type { FastifyPluginAsync } from 'fastify';
import { ErroDeRegra } from '../../../../compartilhado/dominio/erros.js';
import {
  exigirAutenticacao,
  extrairToken,
} from '../../../../compartilhado/http/autenticacao.js';
import type {
  CasosDeUsoDeContas,
  Credenciais,
} from '../../aplicacao/casos-de-uso.js';

const CREDENCIAIS_INVALIDAS = 'credenciais_invalidas';

/**
 * Formato do corpo de `POST /contas` e `POST /sessoes`. Os limites (tamanho do
 * e-mail e da senha) ficam no domínio, para o erro apontar o campo.
 *
 * O Ajv do Fastify vem com `removeAdditional: true`: com `additionalProperties:
 * false` sozinho, a chave extra seria apagada em silêncio. `propertyNames` faz
 * a requisição com chave extra ser recusada com 400.
 */
const CORPO_DE_CREDENCIAIS = {
  type: 'object',
  required: ['email', 'senha'],
  additionalProperties: false,
  propertyNames: { enum: ['email', 'senha'] },
  properties: {
    email: { type: 'string' },
    senha: { type: 'string' },
  },
} as const;

/** A resposta de sucesso só pode levar o token, nada da conta. */
const RESPOSTA_COM_TOKEN = {
  type: 'object',
  required: ['token'],
  additionalProperties: false,
  properties: { token: { type: 'string' } },
} as const;

/**
 * Rotas do módulo `contas`:
 * - `POST /contas {email,senha}` → 201 `{token}`; 400 campos; 409 `email_em_uso`;
 * - `POST /sessoes {email,senha}` → 200 `{token}`; 401 `credenciais_invalidas`;
 * - `DELETE /sessoes` (exige `Authorization: Bearer`) → 204; sem sessão, 401.
 *
 * Os demais erros seguem para o tratador compartilhado (`tratarErro`).
 */
export function criarRotasDeContas(
  casos: CasosDeUsoDeContas,
): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Body: Credenciais }>(
      '/contas',
      {
        schema: {
          body: CORPO_DE_CREDENCIAIS,
          response: { 201: RESPOSTA_COM_TOKEN },
        },
      },
      async (requisicao, resposta) => {
        const sessao = await casos.criarConta(requisicao.body);
        return resposta.code(201).send({ token: sessao.token });
      },
    );

    app.post<{ Body: Credenciais }>(
      '/sessoes',
      {
        schema: {
          body: CORPO_DE_CREDENCIAIS,
          response: { 200: RESPOSTA_COM_TOKEN },
        },
      },
      async (requisicao, resposta) => {
        try {
          const sessao = await casos.entrar(requisicao.body);
          return resposta.code(200).send({ token: sessao.token });
        } catch (erro) {
          // Recusa genérica: não diz se foi o e-mail ou a senha.
          if (
            erro instanceof ErroDeRegra &&
            erro.codigo === CREDENCIAIS_INVALIDAS
          ) {
            requisicao.log.info(
              { erro: CREDENCIAIS_INVALIDAS },
              'entrada recusada',
            );
            return resposta.code(401).send({ erro: CREDENCIAIS_INVALIDAS });
          }
          throw erro;
        }
      },
    );

    // Escopo próprio: o hook de autenticação vale só para as rotas daqui.
    await app.register(async (autenticadas) => {
      autenticadas.addHook(
        'onRequest',
        exigirAutenticacao(casos.validarSessao),
      );

      autenticadas.delete('/sessoes', async (requisicao, resposta) => {
        // O hook já validou o cabeçalho, então o token existe.
        const token = extrairToken(requisicao.headers.authorization);
        if (token !== null) {
          await casos.sair(token);
        }
        return resposta.code(204).send();
      });
    });
  };
}
