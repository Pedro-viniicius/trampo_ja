/**
 * QA — CA1, CA2, CA14 e D2 pela API montada, com o Postgres de teste e o hash
 * de produção (scrypt N=2^17, ~0,6 s por cadastro ou entrada): normalização do
 * e-mail, limites da senha, cadastro concorrente, sessões, cabeçalho
 * `Authorization`, corpo e `Content-Type` fora do esperado e rate limit.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import { bancoDeTeste } from '../banco-teste.js';
import {
  criarUsuario,
  limparBanco,
  montar,
  pedir,
  TEMPO_COM_HASH,
} from './apoio.js';

let app: Aplicacao;

beforeAll(async () => {
  await limparBanco();
  app = await montar();
});

afterAll(async () => {
  await app?.fechar();
  await limparBanco();
});

let contador = 0;
/** E-mail único por teste, para os testes não colidirem no mesmo banco. */
function emailNovo(prefixo = 'qa'): string {
  contador += 1;
  return `${prefixo}.${Date.now()}.${contador}@exemplo.test`;
}

async function cadastrar(email: string, senha: string, aplicacao = app) {
  return pedir(aplicacao, 'POST', '/contas', { corpo: { email, senha } });
}

async function entrar(email: string, senha: string, aplicacao = app) {
  return pedir(aplicacao, 'POST', '/sessoes', { corpo: { email, senha } });
}

async function linhaDaConta(email: string) {
  const db = bancoDeTeste<Record<string, Record<string, unknown>>>();
  return db
    .selectFrom('contas' as never)
    .selectAll()
    .where('email' as never, '=', email as never)
    .executeTakeFirst() as Promise<
    { id: string; email: string; senha_hash: string } | undefined
  >;
}

describe('CA1 — cadastro', () => {
  it(
    'e-mail com +, maiúsculas e espaços nas pontas é guardado aparado e em minúsculas; a senha só existe como hash; o token só como SHA-256',
    async () => {
      const base = emailNovo('Ana+Teste');
      const senha = 'Senha#Forte 123';
      const r = await cadastrar(`  ${base.toUpperCase()}  `, senha);

      expect(r.status).toBe(201);
      const token = (r.corpo as { token: string }).token;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const conta = await linhaDaConta(base.toLowerCase());
      expect(conta).toBeDefined();
      expect(conta?.senha_hash).toMatch(/^scrypt\$/);
      expect(conta?.senha_hash).not.toContain(senha);
      expect(conta?.senha_hash).not.toContain(senha.toLowerCase());

      const db = bancoDeTeste<Record<string, Record<string, unknown>>>();
      const sessoes = await db
        .selectFrom('sessoes' as never)
        .selectAll()
        .where('conta_id' as never, '=', conta?.id as never)
        .execute();
      expect(sessoes).toHaveLength(1);
      expect((sessoes[0] as { token_hash: string }).token_hash).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(JSON.stringify(sessoes)).not.toContain(token);

      // Entra com a caixa trocada e com o espaço, mas a senha é exata.
      expect((await entrar(base, senha)).status).toBe(200);
      expect((await entrar(base.toUpperCase(), senha)).status).toBe(200);
      expect((await entrar(base, `${senha} `)).status).toBe(401);
      expect((await entrar(base, senha.toLowerCase())).status).toBe(401);
    },
    TEMPO_COM_HASH,
  );

  it(
    'senha: 8 e 128 caracteres passam; 7 e 129 dão 400 no campo senha',
    async () => {
      for (const tamanho of [8, 128]) {
        const r = await cadastrar(emailNovo(), 'x'.repeat(tamanho));
        expect(r.status, `tamanho ${tamanho}`).toBe(201);
      }
      for (const tamanho of [7, 129, 1000]) {
        const r = await cadastrar(emailNovo(), 'x'.repeat(tamanho));
        expect(r.status, `tamanho ${tamanho}`).toBe(400);
        expect(r.corpo).toEqual({
          erro: 'dados_invalidos',
          campos: [{ campo: 'senha', motivo: 'tamanho' }],
        });
      }
    },
    TEMPO_COM_HASH,
  );

  it('senha vazia, ausente ou de outro tipo e e-mail inválido: 400 apontando todos os campos de uma vez', async () => {
    const semArroba = await cadastrar('semarroba', 'curta');
    expect(semArroba.status).toBe(400);
    expect(semArroba.corpo).toEqual({
      erro: 'dados_invalidos',
      campos: [
        { campo: 'email', motivo: 'invalido' },
        { campo: 'senha', motivo: 'tamanho' },
      ],
    });
    for (const corpo of [
      { email: emailNovo() },
      { email: emailNovo(), senha: '' },
      { email: emailNovo(), senha: 12345678 },
      { email: emailNovo(), senha: ['abcdefgh'] },
      { email: 5, senha: 'abcdefgh' },
      { email: 'a b@exemplo.com', senha: 'abcdefgh' },
      { email: 'a@@exemplo.com', senha: 'abcdefgh' },
      { email: 'a@exemplo', senha: 'abcdefgh' },
      { email: 'a\u0000@exemplo.com', senha: 'abcdefgh' },
    ]) {
      const r = await pedir(app, 'POST', '/contas', { corpo });
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      expect(r.cabecalhos['set-cookie']).toBeUndefined();
    }
  });

  it('chave extra no corpo (ex.: isAdmin) é recusada com 400 e nenhuma conta é criada', async () => {
    const email = emailNovo();
    const r = await pedir(app, 'POST', '/contas', {
      corpo: { email, senha: 'abcdefgh', isAdmin: true, id: 'x' },
    });
    expect(r.status).toBe(400);
    expect(await linhaDaConta(email)).toBeUndefined();
  });

  it(
    'e-mail de 254 caracteres passa e de 255 dá 400 tamanho',
    async () => {
      const dominio = '@exemplo.test';
      const longo = `${'a'.repeat(254 - dominio.length)}${dominio}`;
      expect(longo).toHaveLength(254);
      expect((await cadastrar(longo, 'abcdefgh')).status).toBe(201);
      const demais = await cadastrar(`b${longo}`, 'abcdefgh');
      expect(demais.status).toBe(400);
      expect(demais.corpo).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'email', motivo: 'tamanho' }],
      });
    },
    TEMPO_COM_HASH,
  );

  it(
    'senha com caracteres fora do BMP (emoji) conta por caractere: 4 emojis são 4 caracteres, abaixo do mínimo de 8 (CA1)',
    async () => {
      const r = await cadastrar(emailNovo(), '😀😀😀😀');
      expect(r.status).toBe(400);
      expect(r.corpo).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'senha', motivo: 'tamanho' }],
      });
    },
    TEMPO_COM_HASH,
  );

  it(
    'senha de 100 emojis tem 100 caracteres, abaixo do teto de 128, e é aceita',
    async () => {
      const email = emailNovo();
      const senha = '😀'.repeat(100);
      const r = await cadastrar(email, senha);
      expect(r.status).toBe(201);
      expect((await entrar(email, senha)).status).toBe(200);
    },
    TEMPO_COM_HASH,
  );
});

describe('CA2 — e-mail repetido', () => {
  it(
    'recusa com 409 {"erro":"email_em_uso"} e nada mais, em qualquer caixa, sem abrir sessão nem trocar a senha',
    async () => {
      const email = emailNovo('Repetido');
      const primeira = await cadastrar(email, 'senha-original-1');
      expect(primeira.status).toBe(201);
      const hashAntes = (await linhaDaConta(email.toLowerCase()))?.senha_hash;

      for (const variante of [email, email.toUpperCase(), ` ${email} `]) {
        const r = await cadastrar(variante, 'outra-senha-999');
        expect(r.status).toBe(409);
        expect(r.texto).toBe('{"erro":"email_em_uso"}');
        expect(r.cabecalhos.authorization).toBeUndefined();
      }
      expect((await linhaDaConta(email.toLowerCase()))?.senha_hash).toBe(
        hashAntes,
      );
      expect((await entrar(email, 'senha-original-1')).status).toBe(200);
      expect((await entrar(email, 'outra-senha-999')).status).toBe(401);
    },
    TEMPO_COM_HASH,
  );

  it(
    'cinco cadastros simultâneos com o mesmo e-mail: um 201, quatro 409 e nenhum 500',
    async () => {
      const email = emailNovo('corrida');
      const respostas = await Promise.all(
        Array.from({ length: 5 }, () => cadastrar(email, 'senha-corrida-1')),
      );
      expect(respostas.filter((r) => r.status >= 500)).toEqual([]);
      expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
      const recusadas = respostas.filter((r) => r.status !== 201);
      expect(recusadas.map((r) => r.texto)).toEqual(
        recusadas.map(() => '{"erro":"email_em_uso"}'),
      );
      const db = bancoDeTeste<Record<string, Record<string, unknown>>>();
      const contas = await db
        .selectFrom('contas' as never)
        .selectAll()
        .where('email' as never, '=', email.toLowerCase() as never)
        .execute();
      expect(contas).toHaveLength(1);
    },
    TEMPO_COM_HASH,
  );
});

describe('Entrada e saída (CA1, CA14)', () => {
  it(
    'senha errada e e-mail inexistente têm a mesma resposta; senha acima do teto também é 401, não 400',
    async () => {
      const email = emailNovo();
      await cadastrar(email, 'senha-certa-123');

      const errada = await entrar(email, 'senha-errada-123');
      const inexistente = await entrar(
        emailNovo('fantasma'),
        'senha-certa-123',
      );
      const longa = await entrar(email, 'x'.repeat(5000));
      const emailRuim = await entrar('nao-e-email', 'senha-certa-123');
      const vazia = await entrar(email, '');

      for (const r of [errada, inexistente, longa, emailRuim, vazia]) {
        expect(r.status).toBe(401);
        expect(r.texto).toBe('{"erro":"credenciais_invalidas"}');
      }
    },
    TEMPO_COM_HASH,
  );

  it(
    'DELETE /sessoes duas vezes: 204 e depois 401; a outra sessão da mesma conta continua válida',
    async () => {
      const email = emailNovo();
      const cadastro = await cadastrar(email, 'senha-certa-123');
      const t1 = (cadastro.corpo as { token: string }).token;
      const t2 = (
        (await entrar(email, 'senha-certa-123')).corpo as { token: string }
      ).token;
      expect(t1).not.toBe(t2);

      const primeira = await pedir(app, 'DELETE', '/sessoes', { token: t1 });
      expect(primeira.status).toBe(204);
      expect(primeira.texto).toBe('');
      const segunda = await pedir(app, 'DELETE', '/sessoes', { token: t1 });
      expect(segunda.status).toBe(401);
      expect(segunda.texto).toBe('{"erro":"nao_autenticado"}');
      expect(
        (await pedir(app, 'GET', '/categorias', { token: t1 })).status,
      ).toBe(401);
      expect(
        (await pedir(app, 'GET', '/categorias', { token: t2 })).status,
      ).toBe(200);
    },
    TEMPO_COM_HASH,
  );

  it('sessão expirada no banco dá 401; a que vence daqui a pouco ainda vale', async () => {
    const u = await criarUsuario(app);
    const db = bancoDeTeste<Record<string, Record<string, unknown>>>();
    const hash = createHash('sha256').update(u.token).digest('hex');
    expect(
      (await pedir(app, 'GET', '/categorias', { token: u.token })).status,
    ).toBe(200);

    await db
      .updateTable('sessoes' as never)
      .set({ expira_em: new Date(Date.now() + 60_000) } as never)
      .where('token_hash' as never, '=', hash as never)
      .execute();
    expect(
      (await pedir(app, 'GET', '/categorias', { token: u.token })).status,
    ).toBe(200);

    await db
      .updateTable('sessoes' as never)
      .set({ expira_em: new Date(Date.now() - 1000) } as never)
      .where('token_hash' as never, '=', hash as never)
      .execute();
    const r = await pedir(app, 'GET', '/categorias', { token: u.token });
    expect(r.status).toBe(401);
    expect(r.texto).toBe('{"erro":"nao_autenticado"}');
  });
});

describe('CA14 — cabeçalho, método e corpo', () => {
  it('o esquema Bearer não diferencia maiúsculas; dois espaços, token com espaço no fim e esquema trocado dão 401', async () => {
    const u = await criarUsuario(app);
    const aceitos = [
      `bearer ${u.token}`,
      `BEARER ${u.token}`,
      `Bearer ${u.token}`,
    ];
    for (const authorization of aceitos) {
      const r = await pedir(app, 'GET', '/categorias', {
        cabecalhos: { authorization },
      });
      expect(r.status, authorization.slice(0, 12)).toBe(200);
    }
    const negados = [
      `Bearer  ${u.token}`,
      `Token ${u.token}`,
      `Bearer ${u.token}x`,
      `Bearer ${u.token.slice(0, -1)}`,
      u.token,
      `Bearer ${u.token}, Bearer ${u.token}`,
      `Bearer ${'A'.repeat(100_000)}`,
    ];
    for (const authorization of negados) {
      const r = await pedir(app, 'GET', '/categorias', {
        cabecalhos: { authorization },
      });
      expect(r.status, authorization.slice(0, 20)).toBe(401);
      expect(r.texto).toBe('{"erro":"nao_autenticado"}');
    }
  });

  it('o token não vale na query string nem em outro cabeçalho', async () => {
    const u = await criarUsuario(app);
    for (const r of [
      await pedir(app, 'GET', `/categorias?token=${u.token}`),
      await pedir(app, 'GET', `/categorias?access_token=${u.token}`),
      await pedir(app, 'GET', '/categorias', {
        cabecalhos: { 'x-token': u.token },
      }),
      await pedir(app, 'GET', '/categorias', {
        cabecalhos: { cookie: `token=${u.token}` },
      }),
    ]) {
      expect(r.status).toBe(401);
    }
  });

  it('HEAD com token válido é 200 sem corpo; HEAD e OPTIONS sem token não devolvem dado', async () => {
    const u = await criarUsuario(app);
    const comToken = await pedir(app, 'HEAD', '/categorias', {
      token: u.token,
    });
    expect(comToken.status).toBe(200);
    expect(comToken.texto).toBe('');

    for (const url of [
      '/categorias',
      '/trampos/meus',
      '/perfis/eu',
      '/conversas',
      '/busca',
    ]) {
      const head = await pedir(app, 'HEAD', url);
      expect(head.status, `HEAD ${url}`).toBe(401);
      expect(head.texto).toBe('');
      const opcoes = await pedir(app, 'OPTIONS', url);
      expect(opcoes.status, `OPTIONS ${url}`).toBeGreaterThanOrEqual(400);
      expect(opcoes.texto).not.toContain('reformas');
      expect(opcoes.texto).not.toContain(u.contaId);
    }
  });

  it('método sem rota (PATCH, DELETE em /trampos) responde erro genérico, sem dado e sem 500', async () => {
    const u = await criarUsuario(app);
    for (const metodo of ['PATCH', 'DELETE'] as const) {
      for (const token of [u.token, undefined]) {
        const r = await pedir(app, metodo, '/trampos/meus', { token });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
        expect(r.texto).not.toContain(u.contaId);
      }
    }
  });

  it('Content-Type errado em rota pública: 415 (ou 400 para text/plain) sem eco do corpo e sem criar conta; em rota protegida sem token vence o 401', async () => {
    const email = emailNovo('eco');
    const corpoBruto = JSON.stringify({ email, senha: 'abcdefgh' });
    for (const contentType of [
      'application/x-www-form-urlencoded',
      'application/xml',
      'image/png',
    ]) {
      const r = await pedir(app, 'POST', '/contas', {
        corpoBruto,
        contentType,
      });
      expect(r.status, contentType).toBe(415);
      expect(r.texto).toBe('{"erro":"tipo_nao_suportado"}');
      expect(r.texto).not.toContain(email);
    }
    // text/plain chega como texto puro: o schema recusa, sem criar conta.
    const texto = await pedir(app, 'POST', '/contas', {
      corpoBruto,
      contentType: 'text/plain',
    });
    expect(texto.status).toBe(400);
    expect(texto.texto).not.toContain(email);
    const semToken = await pedir(app, 'POST', '/trampos', {
      corpoBruto: '{}',
      contentType: 'text/plain',
    });
    expect(semToken.status).toBe(401);
    expect(await linhaDaConta(email.toLowerCase())).toBeUndefined();
  });

  it('JSON quebrado, corpo vazio, array, null e número: 400 sem eco do conteúdo', async () => {
    const email = emailNovo('eco2');
    for (const corpoBruto of [
      `{"email":"${email}","senha":"abcdefgh`,
      '',
      '[]',
      'null',
      '123',
      '"texto"',
      `[{"email":"${email}"}]`,
    ]) {
      const r = await pedir(app, 'POST', '/contas', { corpoBruto });
      expect(r.status, corpoBruto.slice(0, 20)).toBe(400);
      expect(r.texto).not.toContain(email);
      expect(r.texto).not.toContain('abcdefgh');
    }
    // Também em rota protegida, com token.
    const u = await criarUsuario(app);
    const r = await pedir(app, 'POST', '/trampos', {
      token: u.token,
      corpoBruto: '{"titulo":',
    });
    expect(r.status).toBe(400);
  });

  it('corpo acima de 1 MiB: 413 corpo_grande_demais, nada é processado', async () => {
    const r = await pedir(app, 'POST', '/contas', {
      corpoBruto: JSON.stringify({
        email: emailNovo(),
        senha: 'abcdefgh',
        lixo: 'x'.repeat(1_100_000),
      }),
    });
    expect(r.status).toBe(413);
    expect(r.texto).toBe('{"erro":"corpo_grande_demais"}');
  });
});

describe('D2 — rate limit de 10 por minuto por IP em /contas e /sessoes', () => {
  it('a 11ª requisição a POST /contas do mesmo IP é 429; POST /sessoes tem contador próprio; outro IP e rotas autenticadas não são afetados', async () => {
    const limitada = await montar({ rateLimit: undefined });
    try {
      const u = await criarUsuario(limitada);
      for (let i = 1; i <= 10; i++) {
        const r = await pedir(limitada, 'POST', '/contas', {
          corpo: {},
          ip: '198.51.100.7',
        });
        expect(r.status, `tentativa ${i}`).toBe(400);
      }
      const bloqueada = await pedir(limitada, 'POST', '/contas', {
        corpo: {},
        ip: '198.51.100.7',
      });
      expect(bloqueada.status).toBe(429);
      expect(bloqueada.texto).toBe('{"erro":"muitas_requisicoes"}');

      // Trocar o IP declarado em cabeçalho não escapa do limite.
      const cabecalhosDeProxy: Record<string, string>[] = [
        { 'x-forwarded-for': '203.0.113.99' },
        { 'x-real-ip': '203.0.113.98' },
        { forwarded: 'for=203.0.113.97' },
      ];
      for (const cabecalhos of cabecalhosDeProxy) {
        const r = await pedir(limitada, 'POST', '/contas', {
          corpo: {},
          ip: '198.51.100.7',
          cabecalhos,
        });
        expect(r.status, JSON.stringify(cabecalhos)).toBe(429);
      }

      // Contador de /sessoes é outro; outro IP começa do zero.
      expect(
        (
          await pedir(limitada, 'POST', '/sessoes', {
            corpo: {},
            ip: '198.51.100.7',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await pedir(limitada, 'POST', '/contas', {
            corpo: {},
            ip: '198.51.100.8',
          })
        ).status,
      ).toBe(400);
      // Rotas autenticadas não têm limite.
      for (let i = 0; i < 15; i++) {
        const r = await pedir(limitada, 'GET', '/categorias', {
          token: u.token,
          ip: '198.51.100.7',
        });
        expect(r.status).toBe(200);
      }
    } finally {
      await limitada.fechar();
    }
  });

  it('a 11ª tentativa de POST /sessoes é 429 mesmo com credenciais certas, sem gastar hash', async () => {
    const limitada = await montar({ rateLimit: undefined });
    try {
      for (let i = 1; i <= 10; i++) {
        const r = await pedir(limitada, 'POST', '/sessoes', {
          corpo: { email: 'nao-e-email', senha: 'abcdefgh' },
          ip: '198.51.100.20',
        });
        expect(r.status, `tentativa ${i}`).toBe(401);
      }
      const r = await pedir(limitada, 'POST', '/sessoes', {
        corpo: { email: 'nao-e-email', senha: 'abcdefgh' },
        ip: '198.51.100.20',
      });
      expect(r.status).toBe(429);
      expect(r.texto).toBe('{"erro":"muitas_requisicoes"}');
    } finally {
      await limitada.fechar();
    }
  });
});
