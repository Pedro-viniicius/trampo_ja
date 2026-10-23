import type { FastifyPluginAsync, onSendHookHandler } from 'fastify';
import { ErroDeRegra } from '../../../../compartilhado/dominio/erros.js';
import {
  exigirAutenticacao,
  extrairToken,
} from '../../../../compartilhado/http/autenticacao.js';
import { sinalDaConexao } from '../../../../compartilhado/http/sinal-da-conexao.js';
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
 * Corpo de `POST /contas/eu/exclusao` e `/exportacao`: só `senha`, fechado
 * com `propertyNames` (chave extra é 400). Sem `required` e com `null` aceito:
 * senha ausente chega ao caso de uso e vira 403 `senha_incorreta` (CA17), não
 * 400. O teto de 128 fica no caso de uso, antes do scrypt.
 */
const CORPO_COM_SENHA = {
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: ['senha'] },
  properties: { senha: { type: ['string', 'null'] } },
} as const;

/** Objeto fechado: todos os campos obrigatórios e nenhum outro (CA19). */
function objetoFechado<P extends Record<string, unknown>>(propriedades: P) {
  return {
    type: 'object',
    required: Object.keys(propriedades),
    additionalProperties: false,
    properties: propriedades,
  } as const;
}

const TEXTO = { type: 'string' } as const;
const TEXTO_OU_NULO = { type: ['string', 'null'] } as const;
const INTEIRO = { type: 'integer' } as const;

function listaDe<I>(item: I) {
  return { type: 'array', items: item } as const;
}

/**
 * Schema da resposta de `POST /contas/eu/exportacao` (`trampo-ja.exportacao.v1`),
 * fechado em todos os níveis: um campo a mais vindo de um módulo (ex.:
 * `senha_hash`, `texto_busca`) não é serializado, e um a menos dá 500.
 */
export const RESPOSTA_DA_EXPORTACAO = objetoFechado({
  formato: TEXTO,
  geradoEm: TEXTO,
  conta: objetoFechado({ id: TEXTO, email: TEXTO, criadaEm: TEXTO }),
  sessoes: listaDe(objetoFechado({ criadaEm: TEXTO, expiraEm: TEXTO })),
  // `type` com `null`, e não `anyOf`: no `anyOf`, o fast-json-stringify
  // valida o objeto contra o ramo fechado e uma chave a mais vira 500.
  perfil: {
    ...objetoFechado({
      nome: TEXTO,
      cidade: TEXTO,
      descricao: TEXTO_OU_NULO,
      habilidades: listaDe(TEXTO),
      atualizadoEm: TEXTO,
    }),
    type: ['object', 'null'],
  },
  trampos: listaDe(
    objetoFechado({
      id: TEXTO,
      titulo: TEXTO,
      descricao: TEXTO,
      categoria: TEXTO,
      cidade: TEXTO,
      valorCentavos: INTEIRO,
      prazo: TEXTO_OU_NULO,
      status: TEXTO,
      criadoEm: TEXTO,
      candidaturasRecebidas: INTEIRO,
    }),
  ),
  servicos: listaDe(
    objetoFechado({
      id: TEXTO,
      titulo: TEXTO,
      descricao: TEXTO,
      categoria: TEXTO,
      cidade: TEXTO_OU_NULO,
      precoBaseCentavos: INTEIRO,
      status: TEXTO,
      criadoEm: TEXTO,
    }),
  ),
  candidaturas: listaDe(
    objetoFechado({
      id: TEXTO,
      trampoId: TEXTO,
      mensagem: TEXTO,
      valorPropostoCentavos: INTEIRO,
      status: TEXTO,
      criadaEm: TEXTO,
    }),
  ),
  conversas: listaDe(
    objetoFechado({
      id: TEXTO,
      outroUsuarioId: TEXTO,
      criadaEm: TEXTO,
      minhasMensagens: listaDe(
        objetoFechado({ id: TEXTO, texto: TEXTO, enviadaEm: TEXTO }),
      ),
    }),
  ),
});

/**
 * `Cache-Control: no-store` em toda resposta das rotas com senha, inclusive
 * nos erros (CA24): nem a exportação nem a recusa ficam em cache.
 */
const semCache: onSendHookHandler = async (_requisicao, resposta, corpo) => {
  resposta.header('cache-control', 'no-store');
  return corpo;
};

interface CorpoComSenha {
  readonly senha?: unknown;
}

export interface OpcoesDasRotasDeContas {
  /**
   * Registra `POST /contas/eu/exclusao` e `POST /contas/eu/exportacao`.
   * Padrão `true`. A fachada desliga enquanto a composição não liga a porta
   * `DadosDaConta`.
   */
  readonly exclusaoEExportacao?: boolean;
}

/**
 * Rotas do módulo `contas`:
 * - `POST /contas {email,senha}` → 201 `{token}`; 400 campos; 409 `email_em_uso`;
 * - `POST /sessoes {email,senha}` → 200 `{token}`; 401 `credenciais_invalidas`;
 *   429 `muitas_requisicoes` com `retry-after` acima do limite por e-mail+IP
 *   (antes do caso de uso) ou do teto por conta no banco (D31, sem rodar o
 *   scrypt, mesmo com a senha certa);
 * - `DELETE /sessoes` (exige `Authorization: Bearer`) → 204; sem sessão, 401.
 * - `POST /contas/eu/exclusao {senha}` (autenticada) → 204; 400 corpo; 403
 *   `senha_incorreta`; 404 conta inexistente (D25, CA17);
 * - `POST /contas/eu/exportacao {senha}` (autenticada) → 200 com o JSON
 *   `trampo-ja.exportacao.v1`; mesmos erros (D26, CA19) e 409
 *   `exportacao_grande` acima do teto (D41).
 *
 * As duas últimas respondem sempre com `Cache-Control: no-store`. As quatro
 * com senha respondem 503 `servico_ocupado` com `retry-after` quando a fila do
 * scrypt (ou da exportação) passa da espera máxima, e saem da fila sem rodar
 * se a conexão cair (`sinalDaConexao`, D42). Os demais erros seguem para o
 * tratador compartilhado (`tratarErro`).
 */
export function criarRotasDeContas(
  casos: CasosDeUsoDeContas,
  opcoes: OpcoesDasRotasDeContas = {},
): FastifyPluginAsync {
  const { exclusaoEExportacao = true } = opcoes;
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
        const sessao = await casos.criarConta(
          requisicao.body,
          sinalDaConexao(resposta),
        );
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
          const sessao = await casos.entrar(
            requisicao.body,
            sinalDaConexao(resposta),
          );
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

      if (!exclusaoEExportacao) {
        return;
      }

      // A senha só chega pelo corpo, nunca pela URL (CA24).
      autenticadas.post<{ Body: CorpoComSenha | undefined }>(
        '/contas/eu/exclusao',
        { schema: { body: CORPO_COM_SENHA }, onSend: semCache },
        async (requisicao, resposta) => {
          await casos.excluirConta(
            requisicao.contaId,
            requisicao.body?.senha,
            sinalDaConexao(resposta),
          );
          return resposta.code(204).send();
        },
      );

      autenticadas.post<{ Body: CorpoComSenha | undefined }>(
        '/contas/eu/exportacao',
        {
          schema: {
            body: CORPO_COM_SENHA,
            response: { 200: RESPOSTA_DA_EXPORTACAO },
          },
          onSend: semCache,
        },
        async (requisicao, resposta) => {
          // O serializador compilado do schema fechado da resposta (CA19).
          // Roda dentro da vaga da exportação (S1-R); a string pronta sai
          // como está, sem serializar de novo.
          const serializar = resposta.getSerializationFunction('200');
          if (serializar === undefined) {
            throw new Error('exportação: rota sem schema de resposta 200');
          }
          const corpo = await casos.exportarDados(
            requisicao.contaId,
            requisicao.body?.senha,
            {
              serializar: (exportacao) => serializar({ ...exportacao }),
              sinal: sinalDaConexao(resposta),
            },
          );
          return resposta
            .code(200)
            .type('application/json; charset=utf-8')
            .send(corpo);
        },
      );
    });
  };
}
