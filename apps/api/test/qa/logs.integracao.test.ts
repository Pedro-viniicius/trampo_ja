/**
 * QA — CA15: varredura extra dos logs, com o logger de produção em nível
 * `trace` num coletor em memória. Complementa `test/e2e/logs-sem-dado-pessoal`
 * com entradas hostis: caractere nulo (que hoje vira 500 do Postgres), dado
 * pessoal no caminho da URL, no cursor, no cabeçalho `Authorization`, em
 * `Content-Type` errado e em JSON quebrado.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarLogger } from '../../src/compartilhado/http/logger.js';
import type { Aplicacao } from '../../src/composicao.js';
import {
  candidatar,
  criarUsuario,
  limparBanco,
  montar,
  pedir,
  publicarTrampo,
  SERVICO_VALIDO,
  TRAMPO_VALIDO,
} from './apoio.js';

const escritas: string[] = [];
const destino = {
  write(linha: string): void {
    escritas.push(linha);
  },
};

const EMAIL = 'sentinela.qa@exemplo.test';
const NOME = 'NomeSentinelaQA';
const CIDADE = 'CidadeSentinelaQA';
const TEXTO = 'TextoSentinelaQA';

let app: Aplicacao;

beforeAll(async () => {
  await limparBanco();
  app = await montar({ logger: criarLogger({ nivel: 'trace', destino }) });
});

afterAll(async () => {
  await app?.fechar();
  await limparBanco();
});

function log(): string {
  return escritas.join('');
}

describe('CA15 — logs com entradas hostis', () => {
  it('nenhum log traz e-mail, nome, cidade, texto livre, cursor nem token, mesmo nos caminhos que dão erro', async () => {
    const dono = await criarUsuario(app, {
      nome: NOME,
      cidade: CIDADE,
      descricao: TEXTO,
      habilidades: [TEXTO],
    });
    const outro = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, dono, {
      titulo: `Titulo ${TEXTO}`,
      descricao: TEXTO,
      cidade: CIDADE,
    });
    await candidatar(app, outro, trampoId, { mensagem: TEXTO });
    const cursor = Buffer.from(
      JSON.stringify({ t: { c: 'ontem', id: EMAIL } }),
    ).toString('base64url');

    const requisicoes = [
      // Caractere nulo: erro do Postgres (hoje 500) com o valor na mensagem.
      pedir(app, 'PUT', '/perfis/eu', {
        token: dono.token,
        corpo: { nome: `${NOME}\u0000`, cidade: CIDADE, habilidades: [TEXTO] },
      }),
      pedir(app, 'POST', '/trampos', {
        token: dono.token,
        corpo: { ...TRAMPO_VALIDO, titulo: `${TEXTO}\u0000`, cidade: CIDADE },
      }),
      pedir(app, 'POST', '/servicos', {
        token: dono.token,
        corpo: {
          ...SERVICO_VALIDO,
          descricao: `${TEXTO}\u0000`,
          cidade: CIDADE,
        },
      }),
      pedir(app, 'POST', `/trampos/${trampoId}/candidaturas`, {
        token: dono.token,
        corpo: { mensagem: `${TEXTO}\u0000`, valorPropostoCentavos: 10 },
      }),
      pedir(app, 'GET', `/busca?texto=${TEXTO}%00&cidade=${CIDADE}`, {
        token: dono.token,
      }),
      pedir(app, 'GET', `/busca?antesDe=${cursor}&texto=${TEXTO}`, {
        token: dono.token,
      }),
      // Cabeçalho e corpo hostis.
      pedir(app, 'GET', '/categorias', {
        cabecalhos: { authorization: `Bearer ${EMAIL}` },
      }),
      pedir(app, 'POST', '/contas', {
        corpoBruto: JSON.stringify({ email: EMAIL, senha: TEXTO }),
        contentType: 'application/xml',
      }),
      pedir(app, 'POST', '/contas', {
        corpoBruto: `{"email":"${EMAIL}","senha":"${TEXTO}`,
      }),
      pedir(app, 'POST', '/contas', {
        corpo: { email: EMAIL, senha: 'x', nome: NOME },
      }),
    ];
    await Promise.all(requisicoes);

    const todo = log();
    expect(todo.length).toBeGreaterThan(0);
    for (const sentinela of [
      EMAIL,
      NOME,
      CIDADE,
      TEXTO,
      dono.token,
      outro.token,
      dono.email,
      cursor,
    ]) {
      expect(todo, `vazou: ${sentinela.slice(0, 30)}`).not.toContain(sentinela);
    }
  });

  it('dado pessoal digitado no caminho da URL (id inválido, rota inexistente) não vai para o log', async () => {
    const u = await criarUsuario(app);
    const antes = escritas.length;

    await Promise.all([
      pedir(app, 'GET', `/perfis/${EMAIL}`, { token: u.token }),
      pedir(app, 'GET', `/trampos/${NOME}`, { token: u.token }),
      pedir(app, 'GET', `/conversas/${EMAIL}/mensagens`, { token: u.token }),
      pedir(app, 'GET', `/rota-que-nao-existe/${EMAIL}?nome=${NOME}`),
    ]);

    const novo = escritas.slice(antes).join('');
    expect(novo.length).toBeGreaterThan(0);
    expect(novo).not.toContain(EMAIL);
    expect(novo).not.toContain(NOME);
  });

  it('toda linha do log é JSON e nenhuma linha traz o corpo da requisição', async () => {
    for (const linha of log()
      .split('\n')
      .filter((l) => l.trim() !== '')) {
      const objeto = JSON.parse(linha) as Record<string, unknown>;
      expect(objeto).not.toHaveProperty('body');
      expect(objeto.req ? Object.keys(objeto.req as object) : []).not.toContain(
        'headers',
      );
    }
  });
});
