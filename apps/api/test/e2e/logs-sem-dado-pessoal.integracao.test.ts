/**
 * CA15 de ponta a ponta: varredura dos logs da API montada pela composição.
 *
 * A aplicação roda com o logger de produção (`criarLogger`, nível `trace`)
 * escrevendo num coletor em memória e com o Postgres de teste. Os cenários
 * forçam os caminhos de erro que mais costumam vazar dado pessoal: e-mail
 * duplicado (inclusive a corrida que chega ao 23505 do Postgres, cujo `detail`
 * traz o e-mail), senha errada, token inválido, validação com campos, regras de
 * domínio, rota inexistente, JSON malformado e falhas de banco (um erro do
 * driver forjado com o dado no `detail` e um pool já fechado).
 *
 * Também exporta e exclui uma conta com a senha (CA24): senha errada,
 * exportação com o JSON cheio de sentinelas e exclusão.
 *
 * No fim, o log inteiro é varrido: nenhuma sentinela (e-mail, senha, nome,
 * cidade, descrição, habilidade, título, texto de mensagem), nenhum texto do
 * JSON exportado nem o token de sessão ou o SHA-256 dele podem aparecer, e
 * toda linha precisa ser JSON.
 *
 * Os passos dependem uns dos outros e rodam em ordem, no mesmo banco.
 */
import { createHash } from 'node:crypto';
import type { Kysely, KyselyPlugin } from 'kysely';
import { DatabaseError } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type BancoBase,
  criarConexao,
} from '../../src/compartilhado/banco/conexao.js';
import { CENSURA, criarLogger } from '../../src/compartilhado/http/logger.js';
import { type Aplicacao, montarAplicacao } from '../../src/composicao.js';
import { lerUrlDoBancoDeTeste } from '../../src/config.js';
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

// O hash de produção (scrypt N=2^17) leva ~0,6 s por cadastro ou entrada.
const TEMPO_LIMITE = 30_000;

// Dados fictícios bem marcados: se qualquer um aparecer no log, é vazamento.
const EMAIL = 'sentinela.vazamento@exemplo.test';
const SENHA = 'SenhaSentinela#2026';
const SENHA_ERRADA = 'SenhaErradaSentinela#2026';
const NOME = 'Sentinela Vazamento';
const CIDADE = 'Cidadela Sentinela';
const DESCRICAO = 'DESCRICAO-SENTINELA-456';
const HABILIDADE = 'HABILIDADE-SENTINELA-789';
const TITULO = 'TITULO-SENTINELA-321 conserto';
const TITULO_CURTO = 'Zq#9';
const TEXTO_DA_MENSAGEM = 'MENSAGEM-SENTINELA-123';
const MENSAGEM_DA_CANDIDATURA = 'CANDIDATURA-SENTINELA-654';
const TOKEN_FALSO = 'TokenFalsoSentinela0123456789abcdefABCDEF_-';
const EMAIL_DO_OUTRO = 'outra.sentinela@exemplo.test';
const NOME_DO_OUTRO = 'Outra Sentinela';
const MENSAGEM_EXPORTADA = 'EXPORTADA-SENTINELA-852';

/** Coletor do stream do pino: guarda cada `write` do logger. */
const escritas: string[] = [];
const destino = {
  write(linha: string): void {
    escritas.push(linha);
  },
};

/**
 * Falha de banco forjada sob demanda: quando ligada, toda escrita
 * (`insert`/`update`) na tabela indicada lança um `DatabaseError` do `pg` com
 * o pior conteúdo possível em `message`, `detail`, `where` e `hint`, como o
 * Postgres faz numa violação de restrição (`Failing row contains (...)`).
 */
let tabelaQueFalha: string | null = null;

function erroDoBancoForjado(): DatabaseError {
  const erro = new DatabaseError(
    `new row for relation "mensagens" violates check constraint: ${TEXTO_DA_MENSAGEM} ${EMAIL}`,
    120,
    'error',
  );
  erro.severity = 'ERROR';
  erro.code = '23514';
  erro.detail = `Failing row contains (${TEXTO_DA_MENSAGEM}, ${EMAIL}, ${NOME}).`;
  erro.where = `SQL statement with ${CIDADE}`;
  erro.hint = `Confira ${SENHA}`;
  erro.table = 'mensagens';
  return erro;
}

const pluginQueFalha: KyselyPlugin = {
  transformQuery({ node }) {
    if (
      tabelaQueFalha !== null &&
      (node.kind === 'InsertQueryNode' || node.kind === 'UpdateQueryNode') &&
      JSON.stringify(node).includes(`"name":"${tabelaQueFalha}"`)
    ) {
      throw erroDoBancoForjado();
    }
    return node;
  },
  async transformResult({ result }) {
    return result;
  },
};

let aplicacao: Aplicacao;

interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
  readonly texto: string;
}

async function pedir(
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  opcoes: {
    token?: string;
    corpo?: Record<string, unknown>;
    corpoBruto?: string;
    app?: Aplicacao;
  } = {},
): Promise<Resposta> {
  const { token, corpo, corpoBruto, app = aplicacao } = opcoes;
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers.authorization = `Bearer ${token}`;
  }
  if (corpoBruto !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const resposta = await app.app.inject({
    method: metodo,
    url,
    headers,
    ...(corpo ? { payload: corpo } : {}),
    ...(corpoBruto !== undefined ? { payload: corpoBruto } : {}),
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? undefined : resposta.json(),
    texto: resposta.body,
  };
}

function lerToken(resposta: Resposta): string {
  return (resposta.corpo as { token: string }).token;
}

function sha256(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

/**
 * Todos os valores de texto de um JSON com 6+ caracteres (as chaves, como
 * `sessoes`, são nomes de rota e de campo que o log já tem).
 */
function textosDoJson(valor: unknown): string[] {
  if (typeof valor === 'string') {
    return valor.length >= 6 ? [valor] : [];
  }
  if (Array.isArray(valor)) {
    return valor.flatMap(textosDoJson);
  }
  if (typeof valor === 'object' && valor !== null) {
    return Object.values(valor).flatMap(textosDoJson);
  }
  return [];
}

function linhasDoLog(): string[] {
  return escritas
    .join('')
    .split('\n')
    .filter((linha) => linha.trim() !== '');
}

// Estado dos cenários, preenchido passo a passo.
const tokens: string[] = [];
let tokenSentinela = '';
let tokenOutro = '';
let contaSentinela = '';
let contaOutro = '';
let trampoId = '';
let conversaId = '';
/** Corpo da exportação (CA24): nenhum texto dele pode ir para o log. */
let jsonExportado = '';

beforeAll(async () => {
  await truncarTabelas(TABELAS);
  aplicacao = await montarAplicacao({
    db: bancoDeTeste<BancoBase>().withPlugin(pluginQueFalha),
    logger: criarLogger({ nivel: 'trace', destino }),
    rateLimit: false,
  });
});

afterAll(async () => {
  tabelaQueFalha = null;
  await aplicacao?.fechar();
  await truncarTabelas(TABELAS);
});

describe('CA15 — varredura dos logs da API com erros forçados', () => {
  it(
    'cadastro ok e cadastro duplicado (409), também em maiúsculas',
    async () => {
      const criada = await pedir('POST', '/contas', {
        corpo: { email: EMAIL, senha: SENHA },
      });
      expect(criada.status).toBe(201);
      tokenSentinela = lerToken(criada);
      tokens.push(tokenSentinela);

      const repetida = await pedir('POST', '/contas', {
        corpo: { email: EMAIL.toUpperCase(), senha: SENHA },
      });
      expect(repetida.status).toBe(409);
      expect(repetida.texto).toBe('{"erro":"email_em_uso"}');
    },
    TEMPO_LIMITE,
  );

  it(
    'cadastros simultâneos do mesmo e-mail chegam ao 23505 do Postgres (detail com o e-mail) e um recebe 409',
    async () => {
      const corpo = { email: EMAIL_DO_OUTRO, senha: SENHA };
      const [a, b] = await Promise.all([
        pedir('POST', '/contas', { corpo }),
        pedir('POST', '/contas', { corpo }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const criada = a.status === 201 ? a : b;
      tokenOutro = lerToken(criada);
      tokens.push(tokenOutro);
    },
    TEMPO_LIMITE,
  );

  it(
    'senha errada (401), e-mail inexistente (401) e token inválido (401)',
    async () => {
      const errada = await pedir('POST', '/sessoes', {
        corpo: { email: EMAIL, senha: SENHA_ERRADA },
      });
      expect(errada.status).toBe(401);
      expect(errada.texto).toBe('{"erro":"credenciais_invalidas"}');

      const inexistente = await pedir('POST', '/sessoes', {
        corpo: { email: `nao.${EMAIL}`, senha: SENHA },
      });
      expect(inexistente.status).toBe(401);

      const entrada = await pedir('POST', '/sessoes', {
        corpo: { email: EMAIL, senha: SENHA },
      });
      expect(entrada.status).toBe(200);
      tokens.push(lerToken(entrada));

      const tokenInvalido = await pedir('GET', '/perfis/eu', {
        token: TOKEN_FALSO,
      });
      expect(tokenInvalido.status).toBe(401);
      expect(tokenInvalido.texto).toBe('{"erro":"nao_autenticado"}');
    },
    TEMPO_LIMITE,
  );

  it('validação com campos (400) no cadastro e em PUT /perfis/eu; depois os perfis completos', async () => {
    const cadastroInvalido = await pedir('POST', '/contas', {
      corpo: { email: `${NOME} sem arroba`, senha: 'curta' },
    });
    expect(cadastroInvalido.status).toBe(400);

    const perfilInvalido = await pedir('PUT', '/perfis/eu', {
      token: tokenSentinela,
      corpo: {
        nome: 'S',
        cidade: CIDADE,
        descricao: DESCRICAO,
        habilidades: [`${HABILIDADE}-longa-demais-para-o-limite`],
      },
    });
    expect(perfilInvalido.status).toBe(400);
    expect(perfilInvalido.corpo).toMatchObject({ erro: 'dados_invalidos' });

    const chaveExtra = await pedir('PUT', '/perfis/eu', {
      token: tokenSentinela,
      corpo: { nome: NOME, email: EMAIL },
    });
    expect(chaveExtra.status).toBe(400);

    const salvo = await pedir('PUT', '/perfis/eu', {
      token: tokenSentinela,
      corpo: {
        nome: NOME,
        cidade: CIDADE,
        descricao: DESCRICAO,
        habilidades: [HABILIDADE],
      },
    });
    expect(salvo.status).toBe(200);

    const doOutro = await pedir('PUT', '/perfis/eu', {
      token: tokenOutro,
      corpo: {
        nome: NOME_DO_OUTRO,
        cidade: CIDADE,
        habilidades: [HABILIDADE],
      },
    });
    expect(doOutro.status).toBe(200);
  });

  it('POST /trampos com título curto (400), depois publicado; candidatura ao próprio trampo (409)', async () => {
    const curto = await pedir('POST', '/trampos', {
      token: tokenSentinela,
      corpo: {
        titulo: TITULO_CURTO,
        descricao: DESCRICAO,
        categoria: 'reformas',
        cidade: CIDADE,
        valorCentavos: 10_000,
      },
    });
    expect(curto.status).toBe(400);
    expect(curto.corpo).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'titulo', motivo: 'tamanho' }],
    });

    const longo = await pedir('POST', '/trampos', {
      token: tokenSentinela,
      corpo: {
        titulo: TITULO.repeat(4),
        descricao: DESCRICAO,
        categoria: 'categoria-sentinela',
        cidade: CIDADE,
        valorCentavos: -1,
      },
    });
    expect(longo.status).toBe(400);

    const publicado = await pedir('POST', '/trampos', {
      token: tokenSentinela,
      corpo: {
        titulo: TITULO,
        descricao: DESCRICAO,
        categoria: 'reformas',
        cidade: CIDADE,
        valorCentavos: 10_000,
      },
    });
    expect(publicado.status).toBe(201);
    trampoId = (publicado.corpo as { id: string }).id;

    const detalhe = await pedir('GET', `/trampos/${trampoId}`, {
      token: tokenSentinela,
    });
    contaSentinela = (detalhe.corpo as { autorId: string }).autorId;

    const proprio = await pedir('POST', `/trampos/${trampoId}/candidaturas`, {
      token: tokenSentinela,
      corpo: {
        mensagem: MENSAGEM_DA_CANDIDATURA,
        valorPropostoCentavos: 9_000,
      },
    });
    expect(proprio.status).toBe(409);
    expect(proprio.corpo).toEqual({ erro: 'autor_nao_pode_candidatar' });
  });

  it('conversa consigo mesmo (409), candidatura, conversa, mensagem vazia e longa demais (400)', async () => {
    const consigo = await pedir('POST', '/conversas', {
      token: tokenSentinela,
      corpo: { outroUsuarioId: contaSentinela },
    });
    expect(consigo.status).toBe(409);

    const candidatura = await pedir(
      'POST',
      `/trampos/${trampoId}/candidaturas`,
      {
        token: tokenOutro,
        corpo: {
          mensagem: MENSAGEM_DA_CANDIDATURA,
          valorPropostoCentavos: 9_000,
        },
      },
    );
    expect(candidatura.status).toBe(201);

    const lista = await pedir('GET', `/trampos/${trampoId}/candidaturas`, {
      token: tokenSentinela,
    });
    contaOutro =
      (lista.corpo as { freelancerId: string }[])[0]?.freelancerId ?? '';
    expect(contaOutro).not.toBe('');

    const aberta = await pedir('POST', '/conversas', {
      token: tokenOutro,
      corpo: { outroUsuarioId: contaSentinela },
    });
    expect(aberta.status).toBe(201);
    conversaId = (aberta.corpo as { conversaId: string }).conversaId;

    const enviada = await pedir('POST', `/conversas/${conversaId}/mensagens`, {
      token: tokenOutro,
      corpo: { texto: TEXTO_DA_MENSAGEM },
    });
    expect(enviada.status).toBe(201);

    const vazia = await pedir('POST', `/conversas/${conversaId}/mensagens`, {
      token: tokenSentinela,
      corpo: { texto: '   ' },
    });
    expect(vazia.status).toBe(400);

    const longa = await pedir('POST', `/conversas/${conversaId}/mensagens`, {
      token: tokenSentinela,
      corpo: { texto: `${TEXTO_DA_MENSAGEM} `.repeat(120) },
    });
    expect(longa.status).toBe(400);
  });

  it(
    'CA13 — conversa sem vínculo dá 403 sem_vinculo',
    async () => {
      const terceiro = await pedir('POST', '/contas', {
        corpo: { email: `terceira.${EMAIL}`, senha: SENHA },
      });
      expect(terceiro.status).toBe(201);
      const tokenTerceiro = lerToken(terceiro);
      tokens.push(tokenTerceiro);

      const semVinculo = await pedir('POST', '/conversas', {
        token: tokenTerceiro,
        corpo: { outroUsuarioId: contaSentinela },
      });
      expect(semVinculo.status).toBe(403);
      expect(semVinculo.texto).toBe('{"erro":"sem_vinculo"}');
    },
    TEMPO_LIMITE,
  );

  it('busca com texto e cidade na query string (200 e 400)', async () => {
    const busca = await pedir(
      'GET',
      `/busca?texto=${encodeURIComponent(TITULO)}&cidade=${encodeURIComponent(CIDADE)}`,
      { token: tokenOutro },
    );
    expect(busca.status).toBe(200);

    const invalida = await pedir(
      'GET',
      `/busca?texto=${encodeURIComponent(EMAIL)}&limite=${encodeURIComponent(SENHA)}`,
      { token: tokenOutro },
    );
    expect(invalida.status).toBe(400);
  });

  it('rota inexistente (404) e corpo JSON malformado (400)', async () => {
    const inexistente = await pedir('POST', '/rota-que-nao-existe', {
      corpo: { email: EMAIL, senha: SENHA },
    });
    expect(inexistente.status).toBe(404);
    expect(inexistente.texto).toBe('{"erro":"nao_encontrado"}');

    for (const corpoBruto of [
      `{"email":"${EMAIL}","senha":"${SENHA}"`,
      `{"email":${EMAIL},"senha":"${SENHA}"}`,
      `${NOME} ${SENHA}`,
    ]) {
      const malformado = await pedir('POST', '/contas', { corpoBruto });
      expect(malformado.status).toBe(400);
      expect(malformado.texto).not.toContain(EMAIL);
    }
  });

  it('falha de banco com o dado no detail do driver: 500 interno', async () => {
    tabelaQueFalha = 'mensagens';
    try {
      const falha = await pedir('POST', `/conversas/${conversaId}/mensagens`, {
        token: tokenSentinela,
        corpo: { texto: TEXTO_DA_MENSAGEM },
      });
      expect(falha.status).toBe(500);
      expect(falha.texto).toBe('{"erro":"interno"}');
    } finally {
      tabelaQueFalha = null;
    }

    tabelaQueFalha = 'perfis';
    try {
      const falha = await pedir('PUT', '/perfis/eu', {
        token: tokenSentinela,
        corpo: { nome: NOME, cidade: CIDADE, habilidades: [HABILIDADE] },
      });
      expect(falha.status).toBe(500);
    } finally {
      tabelaQueFalha = null;
    }
  });

  it('falha de banco com o pool fechado: 500 interno', async () => {
    const db: Kysely<BancoBase> = criarConexao(lerUrlDoBancoDeTeste(), {
      maximoDeConexoes: 1,
    });
    const semBanco = await montarAplicacao({
      db,
      logger: criarLogger({ nivel: 'trace', destino }),
      rateLimit: false,
    });
    try {
      // O Kysely só abre o driver na primeira consulta; antes disso, o
      // `destroy` não fecha nada. Por isso uma requisição ok primeiro.
      const antes = await pedir('GET', '/categorias', {
        app: semBanco,
        token: tokenSentinela,
      });
      expect(antes.status).toBe(200);
      await db.destroy();
      const falha = await pedir('PUT', '/perfis/eu', {
        app: semBanco,
        token: tokenSentinela,
        corpo: { nome: NOME, cidade: CIDADE, habilidades: [HABILIDADE] },
      });
      expect(falha.status).toBe(500);
      expect(falha.texto).toBe('{"erro":"interno"}');

      const cadastro = await pedir('POST', '/contas', {
        app: semBanco,
        corpo: { email: EMAIL, senha: SENHA },
      });
      expect(cadastro.status).toBe(500);
    } finally {
      await semBanco.fechar();
    }
  });

  it(
    'CA24 — exportação e exclusão com a senha: senha errada (403), exportação (200) e exclusão (204)',
    async () => {
      const enviada = await pedir(
        'POST',
        `/conversas/${conversaId}/mensagens`,
        { token: tokenSentinela, corpo: { texto: MENSAGEM_EXPORTADA } },
      );
      expect(enviada.status).toBe(201);

      const errada = await pedir('POST', '/contas/eu/exportacao', {
        token: tokenSentinela,
        corpo: { senha: SENHA_ERRADA },
      });
      expect(errada.status).toBe(403);
      expect(errada.texto).toBe('{"erro":"senha_incorreta"}');

      const exportada = await pedir('POST', '/contas/eu/exportacao', {
        token: tokenSentinela,
        corpo: { senha: SENHA },
      });
      expect(exportada.status).toBe(200);
      jsonExportado = exportada.texto;
      // O JSON traz as sentinelas: é o pior caso para o log.
      for (const sentinela of [
        EMAIL,
        NOME,
        CIDADE,
        DESCRICAO,
        HABILIDADE,
        TITULO,
        MENSAGEM_EXPORTADA,
      ]) {
        expect(jsonExportado).toContain(sentinela);
      }

      const exclusaoErrada = await pedir('POST', '/contas/eu/exclusao', {
        token: tokenOutro,
        corpo: { senha: SENHA_ERRADA },
      });
      expect(exclusaoErrada.status).toBe(403);
      const excluida = await pedir('POST', '/contas/eu/exclusao', {
        token: tokenOutro,
        corpo: { senha: SENHA },
      });
      expect(excluida.status).toBe(204);
      expect(
        (await pedir('GET', '/perfis/eu', { token: tokenOutro })).status,
      ).toBe(401);
    },
    TEMPO_LIMITE,
  );

  it('controle: um objeto logado de propósito com dado pessoal sai como [redigido]', () => {
    aplicacao.app.log.info(
      {
        email: EMAIL,
        senha: SENHA,
        nome: NOME,
        cidade: CIDADE,
        texto: TEXTO_DA_MENSAGEM,
        descricao: DESCRICAO,
        habilidades: [HABILIDADE],
        token: tokenSentinela,
        // Não `req`: essa chave passa pelo serializer da requisição do Fastify.
        requisicao: {
          headers: { authorization: `Bearer ${tokenSentinela}` },
          body: { perfil: { contato: { email: EMAIL } } },
        },
      },
      'controle de redact',
    );

    const linha = linhasDoLog()
      .map((texto) => JSON.parse(texto) as Record<string, unknown>)
      .find((registro) => registro.msg === 'controle de redact');
    expect(linha).toMatchObject({
      email: CENSURA,
      senha: CENSURA,
      nome: CENSURA,
      cidade: CENSURA,
      texto: CENSURA,
      descricao: CENSURA,
      habilidades: CENSURA,
      token: CENSURA,
      requisicao: {
        headers: { authorization: CENSURA },
        body: { perfil: { contato: { email: CENSURA } } },
      },
    });
  });

  it('CA15 — nenhuma linha do log traz e-mail, senha, nome, cidade, textos livres nem token; toda linha é JSON', () => {
    const linhas = linhasDoLog();
    // Prova que o coletor recebeu os logs das requisições e dos erros.
    expect(linhas.length).toBeGreaterThan(50);
    for (const linha of linhas) {
      expect(() => JSON.parse(linha), linha.slice(0, 80)).not.toThrow();
    }
    const registros = linhas.map(
      (linha) => JSON.parse(linha) as Record<string, unknown>,
    );
    expect(registros.some((r) => r.msg === 'erro interno não tratado')).toBe(
      true,
    );
    expect(registros.some((r) => r.msg === 'requisição recusada')).toBe(true);

    const log = linhas.join('\n');
    const logMinusculo = log.toLowerCase();
    const sentinelas = [
      EMAIL,
      EMAIL_DO_OUTRO,
      SENHA,
      SENHA_ERRADA,
      NOME,
      NOME_DO_OUTRO,
      CIDADE,
      DESCRICAO,
      HABILIDADE,
      TITULO,
      TITULO_CURTO,
      TEXTO_DA_MENSAGEM,
      MENSAGEM_DA_CANDIDATURA,
      TOKEN_FALSO,
      MENSAGEM_EXPORTADA,
      'categoria-sentinela',
    ];
    for (const sentinela of sentinelas) {
      for (const forma of [
        sentinela,
        encodeURIComponent(sentinela),
        Buffer.from(sentinela, 'utf8').toString('base64'),
      ]) {
        expect(
          logMinusculo.includes(forma.toLowerCase()),
          `sentinela no log: ${forma.slice(0, 6)}…`,
        ).toBe(false);
      }
    }
    // Pedaços que sobrariam de um corte ou de uma normalização.
    for (const pedaco of ['sentinela', 'vazamento', '@exemplo.test']) {
      expect(logMinusculo, pedaco).not.toContain(pedaco);
    }

    // CA24: nenhum texto do JSON exportado (nem a marca do formato, que
    // denunciaria o corpo da resposta no log).
    expect(jsonExportado).not.toBe('');
    for (const texto of textosDoJson(JSON.parse(jsonExportado))) {
      expect(
        log.includes(texto),
        `texto da exportação no log: ${texto.slice(0, 6)}…`,
      ).toBe(false);
    }

    expect(tokens.length).toBeGreaterThanOrEqual(3);
    for (const token of tokens) {
      expect(log).not.toContain(token);
      expect(log).not.toContain(sha256(token));
    }
    expect(log).not.toContain(sha256(TOKEN_FALSO));
  });
});
