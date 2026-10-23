/**
 * L3 (endurecimento de segurança) de ponta a ponta, com a API montada pela
 * composição e o Postgres de teste:
 * - CA42 (D31): o limite de entrada em `POST /sessoes` por HTTP: 10 por
 *   e-mail+IP a cada 15 min (em memória), teto de 100 por conta a cada hora
 *   (no banco, `tentativas_de_entrada`), a recusa do primeiro sem gastar o
 *   segundo, o /64 do IPv6 e, contra o achado S1, o teto que não sai com o
 *   despejo do LRU por e-mails de lixo;
 * - CA47 (S5): trampo, serviço e perfil gravados direto no banco com o id de
 *   uma conta já excluída (escrita em voo) somem na primeira limpeza depois
 *   de 10 min de relógio, e a lápide vai junto;
 * - CA46 (S5): a limpeza apaga as sessões expiradas em lotes e deixa as
 *   válidas;
 * - CA41 (D42): o pool de `criarConexao` tem `statement_timeout` de 10 s;
 * - a exportação normal continua igual ao contrato v1;
 * - CA54: os logs (logger de produção, nível `trace`) de cada cenário não
 *   trazem e-mail, senha, token, o hash do e-mail nem o id da conta excluída.
 */
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarConexao } from '../../src/compartilhado/banco/conexao.js';
import { RelogioFixo } from '../../src/compartilhado/dominio/relogio.js';
import { criarLogger } from '../../src/compartilhado/http/logger.js';
import {
  type Aplicacao,
  montarAplicacao,
  type OpcoesDaAplicacao,
} from '../../src/composicao.js';
import { lerUrlDoBancoDeTeste } from '../../src/config.js';
import { bancoDeTeste, truncarTabelas } from '../banco-teste.js';
import {
  criarUsuario,
  pedir,
  type Resposta,
  TEMPO_COM_HASH,
} from '../qa/apoio.js';

// `contas_excluidas` entra porque outros e2e deixam lápides no banco;
// `tentativas_de_entrada` tem FK para `contas`.
const TABELAS = [
  'tentativas_de_entrada',
  'mensagens',
  'conversas',
  'candidaturas',
  'trampos',
  'servicos',
  'perfis',
  'sessoes',
  'contas',
  'contas_excluidas',
];

const EMAIL = 'ana.endurecimento@exemplo.test';
const SENHA = 'SenhaDaAnaL3#2026';
const SENHA_ERRADA = 'SenhaErradaL3#2026';
const HASH_DO_EMAIL = createHash('sha256').update(EMAIL).digest('hex');

const IP_A = '203.0.113.10';
const IP_B = '203.0.113.20';

const MINUTO = 60_000;
const INSTANTE = '2026-06-01T12:00:00.000Z';

/** Limite por IP (D2) alto: os cenários de login são sobre a D31. */
const SEM_LIMITE_POR_IP = { max: 10_000, janelaMs: MINUTO };

let aplicacao: Aplicacao | undefined;
let linhasDoLog: string[] = [];

beforeEach(async () => {
  linhasDoLog = [];
  await truncarTabelas(TABELAS);
});

afterEach(async () => {
  await aplicacao?.fechar();
  aplicacao = undefined;
});

/** Monta com o logger de produção escrevendo em `linhasDoLog`. */
async function montar(
  opcoes: Omit<OpcoesDaAplicacao, 'db' | 'logger'> = {},
): Promise<Aplicacao> {
  aplicacao = await montarAplicacao({
    db: bancoDeTeste(),
    logger: criarLogger({
      nivel: 'trace',
      destino: { write: (linha) => void linhasDoLog.push(linha) },
    }),
    ...opcoes,
  });
  return aplicacao;
}

function app(): Aplicacao {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao;
}

function esperarStatus(resposta: Resposta, status: number): void {
  expect(resposta.status, resposta.texto).toBe(status);
}

/** Cadastro real (scrypt de produção); devolve o token. */
async function cadastrar(email = EMAIL, senha = SENHA): Promise<string> {
  const resposta = await pedir(app(), 'POST', '/contas', {
    corpo: { email, senha },
    ip: '192.0.2.250',
  });
  esperarStatus(resposta, 201);
  return (resposta.corpo as { token: string }).token;
}

/** Nenhuma rota devolve o id da própria conta: lido do banco. */
async function idDaConta(email = EMAIL): Promise<string> {
  const { rows } = await sql<{ id: string }>`
    select id from contas where email = ${email}`.execute(bancoDeTeste());
  const id = rows[0]?.id;
  expect(id).toBeDefined();
  return id ?? '';
}

/** Toda linha é JSON e nenhuma traz as sentinelas (CA54). */
function esperarLogSemVazamento(sentinelas: readonly string[]): void {
  expect(linhasDoLog.length).toBeGreaterThan(0);
  for (const linha of linhasDoLog) {
    expect(() => JSON.parse(linha), linha).not.toThrow();
  }
  const log = linhasDoLog.join('');
  for (const sentinela of [EMAIL, HASH_DO_EMAIL, SENHA, SENHA_ERRADA]) {
    expect(log, 'sentinela fixa no log').not.toContain(sentinela);
  }
  for (const sentinela of sentinelas) {
    expect(log, 'sentinela do cenário no log').not.toContain(sentinela);
  }
}

describe('CA42 (D31) — limite de entrada por HTTP', () => {
  const HORA = 60 * MINUTO;

  /** Tentativa recusada pelo schema (chave extra): conta, sem rodar o scrypt. */
  function tentativaInvalida(ip: string): Promise<Resposta> {
    return pedir(app(), 'POST', '/sessoes', {
      corpo: { email: EMAIL, senha: SENHA_ERRADA, extra: true },
      ip,
    });
  }

  function entrar(senha: string, ip: string): Promise<Resposta> {
    return pedir(app(), 'POST', '/sessoes', {
      corpo: { email: EMAIL, senha },
      ip,
    });
  }

  function segundos(cabecalho: unknown): number {
    expect(cabecalho).toMatch(/^\d+$/);
    return Number(cabecalho);
  }

  /** Um IP diferente por tentativa (nunca IP_A nem IP_B). */
  function ipDaVez(i: number): string {
    return `198.51.100.${i + 1}`;
  }

  /** Contagem gravada no teto da conta (`null` sem linha). */
  async function contagemNoBanco(contaId: string): Promise<number | null> {
    const { rows } = await sql<{ tentativas: number }>`
      select tentativas from tentativas_de_entrada
      where conta_id = ${contaId}::uuid`.execute(bancoDeTeste());
    return rows[0]?.tentativas ?? null;
  }

  it(
    'Dadas 10 senhas erradas do mesmo IP, então até a senha certa recebe 429 genérico ali; de outro IP ela entra; as recusas do 1º contador não chegam ao teto da conta',
    async () => {
      await montar({ rateLimit: SEM_LIMITE_POR_IP });
      await cadastrar();
      const contaId = await idDaConta();

      for (let i = 0; i < 10; i++) {
        const errada = await entrar(SENHA_ERRADA, IP_A);
        expect(errada.status, `tentativa ${i + 1}`).toBe(401);
      }
      const bloqueada = await entrar(SENHA, IP_A);
      expect(bloqueada.status).toBe(429);
      expect(bloqueada.texto).toBe('{"erro":"muitas_requisicoes"}');
      // A janela de 15 min começou na 1ª tentativa (o scrypt leva tempo).
      expect(segundos(bloqueada.cabecalhos['retry-after'])).toBeGreaterThan(
        800,
      );
      expect(segundos(bloqueada.cabecalhos['retry-after'])).toBeLessThanOrEqual(
        900,
      );
      expect(JSON.stringify(bloqueada.cabecalhos)).not.toContain(EMAIL);
      expect(JSON.stringify(bloqueada.cabecalhos)).not.toContain(HASH_DO_EMAIL);

      // A dona entra de outro lugar: o bloqueio é por e-mail+IP.
      esperarStatus(await entrar(SENHA, IP_B), 200);

      // Mais 20 do IP_A, recusadas pelo 1º contador, e 30 com corpo
      // inválido de outros IPs: nenhuma chega ao caso de uso.
      for (let i = 0; i < 20; i++) {
        expect((await tentativaInvalida(IP_A)).status).toBe(429);
      }
      for (let i = 0; i < 30; i++) {
        expect((await tentativaInvalida(ipDaVez(i))).status).toBe(400);
      }
      // O teto contou só as 11 que passaram pelo 1º contador e pelo schema.
      expect(await contagemNoBanco(contaId)).toBe(11);

      // Outro e-mail, de um IP que já tentou: contador próprio, e e-mail
      // inexistente não grava teto.
      esperarStatus(
        await pedir(app(), 'POST', '/sessoes', {
          corpo: { email: 'outra.pessoa@exemplo.test', senha: SENHA_ERRADA },
          ip: ipDaVez(0),
        }),
        401,
      );
      const { rows } = await sql<{ n: number }>`
        select count(*)::int as n from tentativas_de_entrada`.execute(
        bancoDeTeste(),
      );
      expect(rows[0]?.n).toBe(1);

      const recusas = linhasDoLog.filter((linha) =>
        linha.includes('muitas_requisicoes'),
      );
      expect(recusas.length).toBeGreaterThanOrEqual(21);
      esperarLogSemVazamento([contaId]);
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dada a conta com 99 tentativas na hora (padrão de produção), então a 100ª ainda confere a senha e a 101ª, de outro IP e com a senha certa, é 429 genérico com o retry-after da janela de 1 h',
    async () => {
      await montar({ rateLimit: SEM_LIMITE_POR_IP });
      await cadastrar();
      const contaId = await idDaConta();
      // As 99 primeiras, de IPs variados, gravadas direto (cada uma levaria
      // ~0,6 s de scrypt). A janela começou agora.
      await sql`insert into tentativas_de_entrada
          (conta_id, inicio_da_janela, tentativas)
        values (${contaId}::uuid, now(), 99)`.execute(bancoDeTeste());

      esperarStatus(await entrar(SENHA_ERRADA, ipDaVez(0)), 401);
      const noTeto = await entrar(SENHA, ipDaVez(1));

      expect(noTeto.status).toBe(429);
      expect(noTeto.texto).toBe('{"erro":"muitas_requisicoes"}');
      // Janela de 1 h do teto, não a de 15 min do 1º contador.
      expect(segundos(noTeto.cabecalhos['retry-after'])).toBeGreaterThan(3500);
      expect(segundos(noTeto.cabecalhos['retry-after'])).toBeLessThanOrEqual(
        3600,
      );
      expect(await contagemNoBanco(contaId)).toBe(101);
      esperarLogSemVazamento([contaId]);
    },
    TEMPO_COM_HASH,
  );

  it('S1 — Dado o teto da conta esgotado, quando chegam 20 001 pedidos com e-mails de lixo, cada um de um /64 de um mesmo /48, então os LRUs em memória enchem e a vítima continua bloqueada; a janela vencida a libera', async () => {
    const relogio = new RelogioFixo(new Date());
    await montar({
      relogio,
      // Limite por IP de produção (10/min por /64) e teto baixado para 3,
      // para não pagar 100 scrypts.
      limitePorEmail: { max: 3, janelaMs: HORA },
    });
    await cadastrar();
    const contaId = await idDaConta();
    for (let i = 0; i < 3; i++) {
      esperarStatus(await entrar(SENHA_ERRADA, ipDaVez(i)), 401);
    }
    const antes = await entrar(SENHA, ipDaVez(3));
    expect(antes.status).toBe(429);
    expect(segundos(antes.cabecalhos['retry-after'])).toBe(3600);

    // O ataque do S1: e-mails de lixo que não passam do schema (não chegam
    // ao scrypt nem ao banco), cada um de um /64 diferente, mais chaves do
    // que o LRU do e-mail+IP (20 000) guarda.
    const do48 = (i: number) => `2001:db8:4800:${i.toString(16)}::1`;
    const lixo = 20_001;
    for (let i = 0; i < lixo; i++) {
      const resposta = await pedir(app(), 'POST', '/sessoes', {
        corpo: { email: `lixo-${i}@lixo.test`, senha: 'x', extra: i },
        ip: do48(i),
      });
      if (resposta.status !== 400) {
        expect(resposta.status, `lixo ${i}`).toBe(400);
      }
    }

    const depois = await entrar(SENHA, do48(lixo + 1));
    expect(depois.status).toBe(429);
    expect(depois.texto).toBe('{"erro":"muitas_requisicoes"}');
    // Do IP do início também: o contador da vítima está no banco.
    expect((await entrar(SENHA, ipDaVez(3))).status).toBe(429);
    expect(await contagemNoBanco(contaId)).toBe(6);

    // Passada a janela da conta, ela entra.
    relogio.avancar(HORA);
    esperarStatus(await entrar(SENHA, ipDaVez(4)), 200);
    expect(await contagemNoBanco(contaId)).toBe(1);
    esperarLogSemVazamento([contaId]);
  }, 120_000);

  it(
    'a exclusão da conta apaga o contador do teto, e a limpeza apaga o de janela vencida',
    async () => {
      const relogio = new RelogioFixo(new Date());
      await montar({ relogio, rateLimit: SEM_LIMITE_POR_IP });
      const token = await cadastrar();
      const contaId = await idDaConta();
      const outra = 'outra.l3@exemplo.test';
      await cadastrar(outra);
      const outraId = await idDaConta(outra);
      esperarStatus(await entrar(SENHA_ERRADA, IP_A), 401);
      esperarStatus(
        await pedir(app(), 'POST', '/sessoes', {
          corpo: { email: outra, senha: SENHA_ERRADA },
          ip: IP_A,
        }),
        401,
      );
      expect(await contagemNoBanco(contaId)).toBe(1);

      esperarStatus(
        await pedir(app(), 'POST', '/contas/eu/exclusao', {
          token,
          corpo: { senha: SENHA },
        }),
        204,
      );
      expect(await contagemNoBanco(contaId)).toBeNull();
      expect(await contagemNoBanco(outraId)).toBe(1);

      relogio.avancar(HORA - 1);
      await app().limparRegistrosVencidos();
      expect(await contagemNoBanco(outraId)).toBe(1);
      relogio.avancar(1);
      await app().limparRegistrosVencidos();
      expect(await contagemNoBanco(outraId)).toBeNull();
      esperarLogSemVazamento([contaId, outraId, token, outra]);
    },
    TEMPO_COM_HASH,
  );

  it('no IPv6, endereços do mesmo /64 dividem o contador por e-mail+IP; outro /64 tem o próprio', async () => {
    await montar({ rateLimit: SEM_LIMITE_POR_IP });

    for (let i = 0; i < 10; i++) {
      const resposta = await tentativaInvalida(
        `2001:db8:5:6:${(i + 1).toString(16)}::1`,
      );
      expect(resposta.status, `tentativa ${i + 1}`).toBe(400);
    }
    expect((await tentativaInvalida('2001:db8:5:6:ffff::ffff')).status).toBe(
      429,
    );
    expect((await tentativaInvalida('2001:db8:5:7::1')).status).toBe(400);
    esperarLogSemVazamento([]);
  });
});

describe('CA47 (S5) — órfão de escrita em voo apagado pela limpeza', () => {
  it(
    'Dado trampo, serviço e perfil gravados com o id de uma conta já excluída, então a primeira limpeza depois de 10 min os apaga e esquece a lápide; os dados de outra conta ficam',
    async () => {
      const relogio = new RelogioFixo(INSTANTE);
      await montar({ relogio, rateLimit: false });
      const token = await cadastrar();
      const excluida = await idDaConta();
      const bruno = await criarUsuario(app());
      const trampoDoBruno = await pedir(app(), 'POST', '/trampos', {
        token: bruno.token,
        corpo: {
          titulo: 'Conserto do telhado do Bruno',
          descricao: 'Trocar as telhas quebradas.',
          categoria: 'reformas',
          cidade: 'Lavras',
          valorCentavos: 20_000,
        },
      });
      esperarStatus(trampoDoBruno, 201);

      esperarStatus(
        await pedir(app(), 'POST', '/contas/eu/exclusao', {
          token,
          corpo: { senha: SENHA },
        }),
        204,
      );

      // Escrita em voo: chegou depois da exclusão, com o id da conta.
      const db = bancoDeTeste();
      await sql`insert into trampos (id, autor_id, titulo, descricao,
          categoria, cidade, cidade_normalizada, texto_busca, valor_centavos,
          status, versao, criado_em)
        values (gen_random_uuid(), ${excluida}::uuid, 'Trampo órfão',
          'Gravado depois da exclusão', 'reformas', 'Lavras', 'lavras',
          'trampo orfao', 10000, 'aberto', 1, ${INSTANTE}::timestamptz)`.execute(
        db,
      );
      await sql`insert into servicos (id, autor_id, titulo, descricao,
          categoria, texto_busca, preco_base_centavos, status, criado_em)
        values (gen_random_uuid(), ${excluida}::uuid, 'Serviço órfão',
          'Gravado depois da exclusão', 'reformas', 'servico orfao', 5000,
          'ativo', ${INSTANTE}::timestamptz)`.execute(db);
      await sql`insert into perfis (conta_id, nome, cidade,
          cidade_normalizada, habilidades, atualizado_em)
        values (${excluida}::uuid, 'Perfil Órfão', 'Lavras', 'lavras',
          array['pintura'], ${INSTANTE}::timestamptz)`.execute(db);

      async function contagens() {
        const { rows } = await sql<{
          trampos: number;
          servicos: number;
          perfis: number;
          lapides: number;
          doBruno: number;
        }>`select
            (select count(*)::int from trampos
              where autor_id = ${excluida}::uuid) as trampos,
            (select count(*)::int from servicos
              where autor_id = ${excluida}::uuid) as servicos,
            (select count(*)::int from perfis
              where conta_id = ${excluida}::uuid) as perfis,
            (select count(*)::int from contas_excluidas) as lapides,
            (select count(*)::int from trampos
              where autor_id = ${bruno.contaId}::uuid) +
            (select count(*)::int from perfis
              where conta_id = ${bruno.contaId}::uuid) +
            (select count(*)::int from sessoes
              where conta_id = ${bruno.contaId}::uuid) as "doBruno"`.execute(
          db,
        );
        return rows[0];
      }

      const comOrfaos = {
        trampos: 1,
        servicos: 1,
        perfis: 1,
        lapides: 1,
        doBruno: 3,
      };
      expect(await contagens()).toEqual(comOrfaos);

      relogio.avancar(10 * MINUTO - 1);
      expect(await app().limparRegistrosVencidos()).toEqual({
        sessoes: 0,
        contasRevarridas: 0,
      });
      expect(await contagens()).toEqual(comOrfaos);

      relogio.avancar(1);
      expect(await app().limparRegistrosVencidos()).toEqual({
        sessoes: 0,
        contasRevarridas: 1,
      });
      expect(await contagens()).toEqual({
        trampos: 0,
        servicos: 0,
        perfis: 0,
        lapides: 0,
        doBruno: 3,
      });

      // O Bruno segue usando a conta e o trampo continua público.
      esperarStatus(
        await pedir(app(), 'GET', `/trampos/${idDe(trampoDoBruno)}`, {
          token: bruno.token,
        }),
        200,
      );
      esperarLogSemVazamento([excluida, token]);
    },
    TEMPO_COM_HASH,
  );
});

function idDe(resposta: Resposta): string {
  const id = (resposta.corpo as { id?: unknown } | undefined)?.id;
  expect(typeof id, resposta.texto).toBe('string');
  return id as string;
}

describe('CA46 (S5) — sessões expiradas apagadas pela limpeza', () => {
  it('Dadas 2500 sessões expiradas (mais de dois lotes de 1000) e uma no limite exato, então a limpeza apaga todas e deixa as válidas funcionando', async () => {
    const agora = new Date();
    const relogio = new RelogioFixo(agora);
    await montar({ relogio, rateLimit: false });
    const valida = await criarUsuario(app());
    const db = bancoDeTeste();

    // `token_hash` precisa ser um SHA-256 em hex (check da tabela).
    const hash = (texto: string) =>
      createHash('sha256').update(texto).digest('hex');
    await sql`insert into sessoes (token_hash, conta_id, expira_em)
      select encode(sha256(('expirada-' || n)::bytea), 'hex'),
        ${valida.contaId}::uuid,
        ${agora}::timestamptz - make_interval(secs => n)
      from generate_series(1, 2500) as n`.execute(db);
    await sql`insert into sessoes (token_hash, conta_id, expira_em) values
      (${hash('no-limite')}, ${valida.contaId}::uuid, ${agora}::timestamptz),
      (${hash('um-ms-depois')}, ${valida.contaId}::uuid,
        ${new Date(agora.getTime() + 1)}::timestamptz)`.execute(db);

    expect(await app().limparRegistrosVencidos()).toEqual({
      sessoes: 2501,
      contasRevarridas: 0,
    });
    const { rows } = await sql<{ token_hash: string }>`
      select token_hash from sessoes`.execute(db);
    expect(rows.map((r) => r.token_hash).sort()).toEqual(
      [hash(valida.token), hash('um-ms-depois')].sort(),
    );

    // A sessão válida continua abrindo as rotas autenticadas.
    esperarStatus(
      await pedir(app(), 'GET', '/perfis/eu', { token: valida.token }),
      200,
    );
    // Uma rodada sem nada vencido não apaga nada.
    expect(await app().limparRegistrosVencidos()).toEqual({
      sessoes: 0,
      contasRevarridas: 0,
    });
    esperarLogSemVazamento([valida.token, valida.email]);
  });
});

describe('CA41 (D42) — tempo máximo de consulta no pool', () => {
  it("o pool de criarConexao responde current_setting('statement_timeout') = '10s'", async () => {
    const db = criarConexao(lerUrlDoBancoDeTeste());
    try {
      const { rows } = await sql<{ consulta: string; ociosa: string }>`
        select current_setting('statement_timeout') as consulta,
          current_setting('idle_in_transaction_session_timeout') as ociosa`.execute(
        db,
      );
      expect(rows).toEqual([{ consulta: '10s', ociosa: '30s' }]);
    } finally {
      await db.destroy();
    }
  });
});

describe('Exportação normal depois da L3 (contrato v1)', () => {
  it(
    'Dado perfil, trampo, serviço, candidatura e conversa, então a exportação devolve exatamente o JSON trampo-ja.exportacao.v1, com no-store e application/json',
    async () => {
      await montar({ relogio: new RelogioFixo(INSTANTE), rateLimit: false });
      const token = await cadastrar();
      const contaId = await idDaConta();
      const bruno = await criarUsuario(app());
      // `criada_em` vem do `default now()` do banco: fixado para comparar.
      await sql`update sessoes set criada_em = ${INSTANTE}::timestamptz
        where conta_id = ${contaId}::uuid`.execute(bancoDeTeste());

      esperarStatus(
        await pedir(app(), 'PUT', '/perfis/eu', {
          token,
          corpo: {
            nome: 'Ana Endurecimento',
            cidade: 'Lavras',
            descricao: 'Pinto paredes.',
            habilidades: ['pintura'],
          },
        }),
        200,
      );
      const trampoId = idDe(
        await pedir(app(), 'POST', '/trampos', {
          token,
          corpo: {
            titulo: 'Pintura da sala',
            descricao: 'Sala de 20 m².',
            categoria: 'reformas',
            cidade: 'Lavras',
            valorCentavos: 30_000,
            prazo: '2026-12-31',
          },
        }),
      );
      const servicoId = idDe(
        await pedir(app(), 'POST', '/servicos', {
          token,
          corpo: {
            titulo: 'Pintura residencial',
            descricao: 'Paredes internas.',
            categoria: 'reformas',
            precoBaseCentavos: 15_000,
          },
        }),
      );
      const trampoDoBruno = idDe(
        await pedir(app(), 'POST', '/trampos', {
          token: bruno.token,
          corpo: {
            titulo: 'Conserto do portão',
            descricao: 'Portão de ferro.',
            categoria: 'reformas',
            cidade: 'Lavras',
            valorCentavos: 10_000,
          },
        }),
      );
      const candidaturaId = idDe(
        await pedir(app(), 'POST', `/trampos/${trampoDoBruno}/candidaturas`, {
          token,
          corpo: { mensagem: 'Posso amanhã.', valorPropostoCentavos: 9_000 },
        }),
      );
      const aberta = await pedir(app(), 'POST', '/conversas', {
        token: bruno.token,
        corpo: { outroUsuarioId: contaId },
      });
      esperarStatus(aberta, 201);
      const conversaId = (aberta.corpo as { conversaId: string }).conversaId;
      const mensagemId = idDe(
        await pedir(app(), 'POST', `/conversas/${conversaId}/mensagens`, {
          token,
          corpo: { texto: 'Combinado.' },
        }),
      );
      esperarStatus(
        await pedir(app(), 'POST', `/conversas/${conversaId}/mensagens`, {
          token: bruno.token,
          corpo: { texto: 'Texto do Bruno.' },
        }),
        201,
      );

      const exportada = await pedir(app(), 'POST', '/contas/eu/exportacao', {
        token,
        corpo: { senha: SENHA },
      });

      esperarStatus(exportada, 200);
      expect(exportada.cabecalhos['cache-control']).toBe('no-store');
      expect(exportada.cabecalhos['content-type']).toBe(
        'application/json; charset=utf-8',
      );
      expect(exportada.corpo).toStrictEqual({
        formato: 'trampo-ja.exportacao.v1',
        geradoEm: INSTANTE,
        conta: { id: contaId, email: EMAIL, criadaEm: INSTANTE },
        sessoes: [{ criadaEm: INSTANTE, expiraEm: '2026-07-01T12:00:00.000Z' }],
        perfil: {
          nome: 'Ana Endurecimento',
          cidade: 'Lavras',
          descricao: 'Pinto paredes.',
          habilidades: ['pintura'],
          atualizadoEm: INSTANTE,
        },
        trampos: [
          {
            id: trampoId,
            titulo: 'Pintura da sala',
            descricao: 'Sala de 20 m².',
            categoria: 'reformas',
            cidade: 'Lavras',
            valorCentavos: 30_000,
            prazo: '2026-12-31',
            status: 'aberto',
            criadoEm: INSTANTE,
            candidaturasRecebidas: 0,
          },
        ],
        servicos: [
          {
            id: servicoId,
            titulo: 'Pintura residencial',
            descricao: 'Paredes internas.',
            categoria: 'reformas',
            cidade: null,
            precoBaseCentavos: 15_000,
            status: 'ativo',
            criadoEm: INSTANTE,
          },
        ],
        candidaturas: [
          {
            id: candidaturaId,
            trampoId: trampoDoBruno,
            mensagem: 'Posso amanhã.',
            valorPropostoCentavos: 9_000,
            status: 'pendente',
            criadaEm: INSTANTE,
          },
        ],
        conversas: [
          {
            id: conversaId,
            outroUsuarioId: bruno.contaId,
            criadaEm: INSTANTE,
            minhasMensagens: [
              { id: mensagemId, texto: 'Combinado.', enviadaEm: INSTANTE },
            ],
          },
        ],
      });
      expect(exportada.texto).not.toContain('Texto do Bruno.');
      expect(exportada.texto).not.toContain(bruno.email);
      esperarLogSemVazamento([
        token,
        'Ana Endurecimento',
        'Pinto paredes.',
        'Posso amanhã.',
        'Combinado.',
      ]);
    },
    TEMPO_COM_HASH,
  );
});
