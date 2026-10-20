/**
 * CA14 de ponta a ponta, com a API montada pela composição e o Postgres de
 * teste: toda rota registrada, exceto `POST /contas` e `POST /sessoes`, exige
 * sessão válida. A lista vem das rotas que o próprio Fastify registrou, então
 * uma rota nova sem o hook de autenticação faz este teste falhar.
 *
 * Também prova a D2 com token válido: o rate limit fica só nas rotas públicas.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Aplicacao,
  montarAplicacao,
  type OpcoesDaAplicacao,
  ROTAS_PUBLICAS,
  type RotaRegistrada,
} from '../../src/composicao.js';
import { bancoDeTeste, truncarTabelas } from '../banco-teste.js';

const TABELAS = [
  'mensagens',
  'conversas',
  'candidaturas',
  'trampos',
  'servicos',
  'perfis',
  'sessoes',
  'contas',
];

const NAO_AUTENTICADO = '{"erro":"nao_autenticado"}';
// O hash de produção (scrypt N=2^17) leva ~0,6 s por conta criada.
const TEMPO_LIMITE = 30_000;

let aplicacao: Aplicacao | undefined;

beforeEach(async () => {
  await truncarTabelas(TABELAS);
});

afterEach(async () => {
  await aplicacao?.fechar();
  aplicacao = undefined;
});

async function montar(
  opcoes: Omit<OpcoesDaAplicacao, 'db'> = { rateLimit: false },
): Promise<Aplicacao> {
  aplicacao = await montarAplicacao({ db: bancoDeTeste(), ...opcoes });
  return aplicacao;
}

function app() {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao.app;
}

async function criarConta(email: string): Promise<string> {
  const resposta = await app().inject({
    method: 'POST',
    url: '/contas',
    payload: { email, senha: 'senha-forte-123' },
  });
  expect(resposta.statusCode).toBe(201);
  return (resposta.json() as { token: string }).token;
}

function ehPublica(rota: RotaRegistrada): boolean {
  return ROTAS_PUBLICAS.some(
    (publica) => publica.metodo === rota.metodo && publica.url === rota.url,
  );
}

/** Troca `:id`, `:cid`, `:contaId`… por um uuid qualquer. */
function urlConcreta(url: string): string {
  return url.replace(/:[A-Za-z]+/g, randomUUID());
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';

async function chamar(rota: RotaRegistrada, authorization?: string) {
  return app().inject({
    method: rota.metodo as Metodo,
    url: urlConcreta(rota.url),
    headers: authorization ? { authorization } : {},
    ...(['POST', 'PUT'].includes(rota.metodo) ? { payload: {} } : {}),
  });
}

describe('CA14 — toda rota protegida exige sessão válida', () => {
  it(
    'Dado cada rota registrada, exceto as duas públicas, quando chega sem token, com token desconhecido, encerrado ou mal formado, então responde 401 {"erro":"nao_autenticado"} e nada mais',
    async () => {
      const { rotas } = await montar();
      const encerrado = await criarConta('encerrado@exemplo.com');
      const saida = await app().inject({
        method: 'DELETE',
        url: '/sessoes',
        headers: { authorization: `Bearer ${encerrado}` },
      });
      expect(saida.statusCode).toBe(204);

      const protegidas = rotas.filter((rota) => !ehPublica(rota));
      // Sanidade: as rotas dos seis módulos foram coletadas (GET + HEAD).
      expect(protegidas.filter((r) => r.metodo !== 'HEAD')).toHaveLength(20);

      const cabecalhosInvalidos: (string | undefined)[] = [
        undefined,
        `Bearer ${randomBytes(32).toString('base64url')}`,
        `Bearer ${encerrado}`,
        'Bearer',
        `Basic ${Buffer.from('a:b').toString('base64')}`,
        `Bearer ${'a'.repeat(300)}`,
      ];
      for (const rota of protegidas) {
        for (const authorization of cabecalhosInvalidos) {
          const resposta = await chamar(rota, authorization);
          const contexto = `${rota.metodo} ${rota.url} com ${authorization?.slice(0, 12) ?? 'nada'}`;

          expect(resposta.statusCode, contexto).toBe(401);
          // HEAD não tem corpo; nas demais, o corpo é exatamente o código.
          expect(resposta.body, contexto).toBe(
            rota.metodo === 'HEAD' ? '' : NAO_AUTENTICADO,
          );
        }
      }
    },
    TEMPO_LIMITE,
  );

  it(
    'Dado um token válido, então nenhuma rota protegida responde 401 (o 401 acima vem da sessão, não da rota)',
    async () => {
      const { rotas } = await montar();
      const token = await criarConta('valida@exemplo.com');

      // `DELETE /sessoes` encerra a sessão: fica por último.
      const protegidas = rotas
        .filter((rota) => !ehPublica(rota))
        .sort(
          (a, b) =>
            Number(a.metodo === 'DELETE') - Number(b.metodo === 'DELETE'),
        );
      for (const rota of protegidas) {
        const resposta = await chamar(rota, `Bearer ${token}`);
        expect(resposta.statusCode, `${rota.metodo} ${rota.url}`).not.toBe(401);
      }
    },
    TEMPO_LIMITE,
  );

  it(
    'as duas rotas públicas respondem sem token (não 401)',
    async () => {
      await montar();

      for (const url of ['/contas', '/sessoes']) {
        const resposta = await app().inject({
          method: 'POST',
          url,
          payload: {},
        });
        expect(resposta.statusCode, url).toBe(400);
        expect(resposta.json()).toEqual({
          erro: 'dados_invalidos',
          campos: [{ campo: 'email', motivo: 'obrigatorio' }],
        });
      }
    },
    TEMPO_LIMITE,
  );
});

describe('D2 — rate limit só no cadastro e no login', () => {
  it(
    'Dado o limite de 3, quando a 4ª requisição a POST /contas chega, então 429 {"erro":"muitas_requisicoes"}; GET /categorias com token segue sem limite',
    async () => {
      await montar({ rateLimit: { max: 3, janelaMs: 60_000 } });
      const email = 'limitada@exemplo.com';

      const token = await criarConta(email);
      for (let i = 0; i < 2; i++) {
        const resposta = await app().inject({
          method: 'POST',
          url: '/contas',
          payload: {},
        });
        expect(resposta.statusCode).toBe(400);
      }
      const bloqueada = await app().inject({
        method: 'POST',
        url: '/contas',
        payload: { email, senha: 'senha-forte-123' },
      });

      expect(bloqueada.statusCode).toBe(429);
      expect(bloqueada.body).toBe('{"erro":"muitas_requisicoes"}');
      expect(JSON.stringify(bloqueada.headers)).not.toContain(email);

      for (let i = 0; i < 6; i++) {
        const categorias = await app().inject({
          method: 'GET',
          url: '/categorias',
          headers: { authorization: `Bearer ${token}` },
        });
        expect(categorias.statusCode).toBe(200);
        expect(categorias.headers).not.toHaveProperty('x-ratelimit-limit');
      }

      // O login tem contador próprio: a 1ª entrada passa.
      const entrada = await app().inject({
        method: 'POST',
        url: '/sessoes',
        payload: { email, senha: 'senha-forte-123' },
      });
      expect(entrada.statusCode).toBe(200);
    },
    TEMPO_LIMITE,
  );
});
