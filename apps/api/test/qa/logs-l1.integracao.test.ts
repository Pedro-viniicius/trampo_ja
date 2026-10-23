/**
 * QA da L1 — CA24 nos caminhos hostis das rotas com senha: a senha (certa,
 * errada, longa demais, em tipo errado, na query, em JSON quebrado), o
 * conteúdo exportado e o e-mail nunca aparecem no log, em nenhum status
 * (200, 204, 400, 403, 429 e 500).
 */
import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type BancoBase,
  criarConexao,
} from '../../src/compartilhado/banco/conexao.js';
import { criarLogger } from '../../src/compartilhado/http/logger.js';
import { type Aplicacao, montarAplicacao } from '../../src/composicao.js';
import { lerUrlDoBancoDeTeste } from '../../src/config.js';
import {
  candidatar,
  limparBanco,
  montar,
  pedir,
  publicarTrampo,
} from './apoio.js';
import { criarUsuarioComSenha, excluir, exportar } from './apoio-l1.js';

const escritas: string[] = [];
const destino = {
  write(linha: string): void {
    escritas.push(linha);
  },
};

const SENHA_CERTA = 'CertaSentinelaL1#2026';
const SENHA_ERRADA = 'ErradaSentinelaL1#2026';
const SENHA_LONGA = `LongaSentinelaL1${'x'.repeat(140)}`;
const SENHA_NA_URL = 'NaUrlSentinelaL1#2026';
const SENHA_EM_JSON_QUEBRADO = 'QuebradoSentinelaL1#2026';
const NOME = 'NomeSentinelaL1';
const MENSAGEM = 'MensagemSentinelaL1';
const TITULO = 'TituloSentinelaL1 de um trampo';

let app: Aplicacao;
const tokens: string[] = [];

beforeAll(async () => {
  await limparBanco();
  app = await montar({
    logger: criarLogger({ nivel: 'trace', destino }),
    rateLimit: undefined,
    limitesPorConta: {
      leitura: { max: 100_000, janelaMs: 60_000 },
      mensagens: { max: 100_000, janelaMs: 60_000 },
      mensagens_dia: { max: 100_000, janelaMs: 60_000 },
      publicacao: { max: 100_000, janelaMs: 60_000 },
      escrita: { max: 100_000, janelaMs: 60_000 },
      senha: { max: 6, janelaMs: 60_000 },
    },
  });
});

afterAll(async () => {
  await app?.fechar();
  await limparBanco();
});

function log(): string {
  return escritas.join('');
}

describe('CA24 — logs das rotas com senha em caminhos hostis', () => {
  it('nenhuma linha traz senha, e-mail, conteúdo exportado nem token, em nenhum status', async () => {
    const ana = await criarUsuarioComSenha(app, SENHA_CERTA, {
      nome: NOME,
      cidade: 'Lavras',
      habilidades: ['pintura'],
    });
    const bruno = await criarUsuarioComSenha(app, SENHA_CERTA);
    tokens.push(ana.token, bruno.token);
    await publicarTrampo(app, ana, { titulo: TITULO });
    const trampoDoBruno = await publicarTrampo(app, bruno);
    await candidatar(app, ana, trampoDoBruno, { mensagem: MENSAGEM });
    const aberta = await pedir(app, 'POST', '/conversas', {
      token: bruno.token,
      corpo: { outroUsuarioId: ana.contaId },
    });
    const conversaId = (aberta.corpo as { conversaId: string }).conversaId;
    await pedir(app, 'POST', `/conversas/${conversaId}/mensagens`, {
      token: ana.token,
      corpo: { texto: MENSAGEM },
    });

    // 400: chave a mais, tipo errado, JSON quebrado, formulário.
    const respostas = [
      await pedir(app, 'POST', '/contas/eu/exportacao', {
        token: ana.token,
        corpo: { senha: SENHA_ERRADA, extra: true },
      }),
      await pedir(app, 'POST', '/contas/eu/exclusao', {
        token: ana.token,
        corpo: { senha: 123456789 },
      }),
      await pedir(app, 'POST', '/contas/eu/exclusao', {
        token: ana.token,
        corpoBruto: `{"senha":"${SENHA_EM_JSON_QUEBRADO}"`,
      }),
      await pedir(app, 'POST', '/contas/eu/exportacao', {
        token: ana.token,
        corpoBruto: `senha=${SENHA_EM_JSON_QUEBRADO}`,
        contentType: 'application/x-www-form-urlencoded',
      }),
      // 403 (conta): errada, longa demais e senha na URL com corpo vazio.
      await exportar(app, ana, SENHA_ERRADA),
      await excluir(app, ana, SENHA_LONGA),
      await pedir(
        app,
        'POST',
        `/contas/eu/exclusao?senha=${encodeURIComponent(SENHA_NA_URL)}`,
        { token: ana.token, corpo: {} },
      ),
      // 200 e 204.
      await exportar(app, ana, SENHA_CERTA),
    ];
    const status = respostas.map((r) => r.status);
    expect(status.slice(0, 3)).toEqual([400, 400, 400]);
    expect([400, 415]).toContain(status[3]);
    expect(status.slice(4)).toEqual([403, 403, 403, 200]);
    const exportada = respostas[7];

    // 429: o contador `senha` da Ana (max 6) já gastou 4 (403, 403, 403, 200).
    for (let i = 0; i < 2; i++) {
      await exportar(app, ana, SENHA_ERRADA);
    }
    const limitada = await exportar(app, ana, SENHA_CERTA);
    expect(limitada.status).toBe(429);
    expect((await excluir(app, bruno, SENHA_CERTA)).status).toBe(204);

    // 500: pool fechado; a senha certa vai no corpo.
    const db: Kysely<BancoBase> = criarConexao(lerUrlDoBancoDeTeste(), {
      maximoDeConexoes: 1,
    });
    const semBanco = await montarAplicacao({
      db,
      logger: criarLogger({ nivel: 'trace', destino }),
      rateLimit: false,
    });
    try {
      expect(
        (await pedir(semBanco, 'GET', '/categorias', { token: ana.token }))
          .status,
      ).toBe(200);
      await db.destroy();
      const falha = await pedir(semBanco, 'POST', '/contas/eu/exclusao', {
        token: ana.token,
        corpo: { senha: SENHA_CERTA },
      });
      expect(falha.status).toBe(500);
      expect(falha.texto).toBe('{"erro":"interno"}');
    } finally {
      await semBanco.fechar();
    }

    const linhas = escritas.join('').split('\n').filter(Boolean);
    expect(linhas.length).toBeGreaterThan(20);
    for (const linha of linhas) {
      expect(() => JSON.parse(linha), linha.slice(0, 80)).not.toThrow();
    }
    const texto = log();
    const minusculo = texto.toLowerCase();
    for (const sentinela of [
      SENHA_CERTA,
      SENHA_ERRADA,
      SENHA_LONGA,
      SENHA_NA_URL,
      SENHA_EM_JSON_QUEBRADO,
      NOME,
      MENSAGEM,
      TITULO,
      ana.email,
      bruno.email,
    ]) {
      for (const forma of [
        sentinela,
        encodeURIComponent(sentinela),
        Buffer.from(sentinela, 'utf8').toString('base64'),
      ]) {
        expect(
          minusculo.includes(forma.toLowerCase()),
          `no log: ${forma.slice(0, 8)}…`,
        ).toBe(false);
      }
    }
    for (const pedaco of ['sentinela', '@exemplo.test']) {
      expect(minusculo, pedaco).not.toContain(pedaco);
    }
    for (const token of tokens) {
      expect(texto).not.toContain(token);
      expect(texto).not.toContain(
        createHash('sha256').update(token, 'utf8').digest('hex'),
      );
    }
    // A exportação tem as sentinelas (é o pior caso); nada dela vai ao log.
    expect(exportada?.texto).toContain(NOME);
    expect(exportada?.texto).toContain(MENSAGEM);
  }, 60_000);
});
