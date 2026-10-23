/**
 * QA da L3 — teto de entrada por conta no banco (CA42, D31, correção S1 da
 * rodada 1): concorrência, borda da janela, conta excluída no meio, o teto de
 * produção (100/h), a ordem dos dois limites, a limpeza das janelas vencidas e
 * o 429 sem dado pessoal.
 *
 * As contas são gravadas direto no banco com hash barato (`apoio-l1.ts`): a
 * senha é conferida de verdade pela rota, em milissegundos.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RelogioFixo } from '../../src/compartilhado/dominio/relogio.js';
import { criarLogger } from '../../src/compartilhado/http/logger.js';
import {
  type Aplicacao,
  montarAplicacao,
  type OpcoesDaAplicacao,
} from '../../src/composicao.js';
import { RepositorioDeTentativasDeEntradaPostgres } from '../../src/modulos/contas/adaptadores/postgres/repositorios-postgres.js';
import { bancoDeTeste } from '../banco-teste.js';
import { pedir } from './apoio.js';
import {
  criarUsuarioComSenhaSemPerfil,
  excluir,
  type UsuarioComSenha,
} from './apoio-l1.js';
import { contar, limparBancoL3, MINUTO } from './apoio-l3.js';

const HORA = 60 * MINUTO;
const SENHA = 'SenhaDaDonaTeto#2026';
const ERRADA = 'senha-errada-do-teto-123';

let aplicacao: Aplicacao | undefined;
let linhasDoLog: string[] = [];
let relogio: RelogioFixo;

beforeEach(async () => {
  await limparBancoL3();
  linhasDoLog = [];
  relogio = new RelogioFixo(new Date());
});

afterEach(async () => {
  await aplicacao?.fechar();
  aplicacao = undefined;
});

async function montar(
  opcoes: Omit<OpcoesDaAplicacao, 'db' | 'logger' | 'relogio'> = {},
): Promise<Aplicacao> {
  aplicacao = await montarAplicacao({
    db: bancoDeTeste(),
    logger: criarLogger({
      nivel: 'trace',
      destino: { write: (linha) => void linhasDoLog.push(linha) },
    }),
    relogio,
    rateLimit: false,
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

function entrar(email: string, senha: string, ip: string) {
  return pedir(app(), 'POST', '/sessoes', { corpo: { email, senha }, ip });
}

function emailUnico(): string {
  return `teto-${randomUUID()}@exemplo.test`;
}

interface LinhaDoTeto {
  conta_id: string;
  inicio_da_janela: Date;
  tentativas: number;
}

async function linhasDoTeto(): Promise<LinhaDoTeto[]> {
  const { rows } = await sql<LinhaDoTeto>`select conta_id, inicio_da_janela,
      tentativas from tentativas_de_entrada order by conta_id`.execute(
    bancoDeTeste(),
  );
  return rows;
}

async function gravarTeto(
  contaId: string,
  inicio: Date,
  tentativas: number,
): Promise<void> {
  await sql`insert into tentativas_de_entrada (conta_id, inicio_da_janela, tentativas)
    values (${contaId}::uuid, ${inicio.toISOString()}::timestamptz, ${tentativas})
    on conflict (conta_id) do update set
      inicio_da_janela = excluded.inicio_da_janela,
      tentativas = excluded.tentativas`.execute(bancoDeTeste());
}

async function conta(email = emailUnico()): Promise<UsuarioComSenha> {
  return criarUsuarioComSenhaSemPerfil(SENHA, email);
}

describe('CA42 (D31) — o teto por conta no banco, com concorrência', () => {
  it('Dadas 24 tentativas simultâneas de 24 IPs contra uma conta com teto 5, então só 5 chegam à senha (401), as outras 19 são 429 e o contador soma exatamente 24 numa linha só', async () => {
    await montar({ limitePorEmail: { max: 5, janelaMs: HORA } });
    const alvo = await conta();

    const respostas = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        entrar(alvo.email, ERRADA, `198.51.100.${i + 1}`),
      ),
    );

    const status = respostas.map((r) => r.status);
    expect(status.filter((s) => s === 401)).toHaveLength(5);
    expect(status.filter((s) => s === 429)).toHaveLength(19);
    expect(status.filter((s) => s !== 401 && s !== 429)).toEqual([]);
    const linhas = await linhasDoTeto();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.tentativas).toBe(24);
    expect(linhas[0]?.conta_id).toBe(alvo.contaId);
  });

  it('Dado o teto esgotado, então a senha certa também é 429, e a janela fixa não anda com as tentativas recusadas', async () => {
    await montar({ limitePorEmail: { max: 3, janelaMs: HORA } });
    const alvo = await conta();
    for (let i = 0; i < 3; i += 1) {
      expect((await entrar(alvo.email, ERRADA, '203.0.113.1')).status).toBe(
        401,
      );
    }
    const inicio = (await linhasDoTeto())[0]?.inicio_da_janela;
    relogio.avancar(20 * MINUTO);

    const comSenhaCerta = await entrar(alvo.email, SENHA, '203.0.113.2');
    const maisUma = await entrar(alvo.email, ERRADA, '203.0.113.3');

    expect(comSenhaCerta.status).toBe(429);
    expect(maisUma.status).toBe(429);
    const linhas = await linhasDoTeto();
    expect(linhas[0]?.inicio_da_janela.getTime()).toBe(inicio?.getTime());
    expect(linhas[0]?.tentativas).toBe(5);
    // 40 min restantes, sem dizer a contagem.
    expect(Number(comSenhaCerta.cabecalhos['retry-after'])).toBe(40 * 60);
    expect(comSenhaCerta.texto).toBe('{"erro":"muitas_requisicoes"}');
  });

  it('Dada a borda da janela, então 1 s antes de fechar ainda é 429 (retry-after 1) e, no instante exato, a janela recomeça: a conta entra e o contador volta a 1', async () => {
    await montar({ limitePorEmail: { max: 2, janelaMs: HORA } });
    const alvo = await conta();
    const abertura = relogio.agora();
    await entrar(alvo.email, ERRADA, '203.0.113.1');
    await entrar(alvo.email, ERRADA, '203.0.113.1');
    expect((await entrar(alvo.email, SENHA, '203.0.113.1')).status).toBe(429);

    relogio.avancar(HORA - 1000);
    const quaseLa = await entrar(alvo.email, SENHA, '203.0.113.9');
    relogio.avancar(1000);
    const noInstante = await entrar(alvo.email, SENHA, '203.0.113.9');

    expect(quaseLa.status).toBe(429);
    expect(quaseLa.cabecalhos['retry-after']).toBe('1');
    expect(noInstante.status, noInstante.texto).toBe(200);
    const linhas = await linhasDoTeto();
    expect(linhas[0]?.tentativas).toBe(1);
    expect(linhas[0]?.inicio_da_janela.getTime()).toBe(
      abertura.getTime() + HORA,
    );
  });

  it('Dado o fim da janela com duas tentativas simultâneas, então só uma recomeça a janela e a outra soma nela (total 2, nunca 1 duas vezes)', async () => {
    await montar({ limitePorEmail: { max: 5, janelaMs: HORA } });
    const alvo = await conta();
    await gravarTeto(
      alvo.contaId,
      new Date(relogio.agora().getTime() - HORA),
      5,
    );

    await Promise.all([
      entrar(alvo.email, ERRADA, '203.0.113.1'),
      entrar(alvo.email, ERRADA, '203.0.113.2'),
    ]);

    const linhas = await linhasDoTeto();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.tentativas).toBe(2);
  });

  it('Dado o e-mail inexistente, então nada é gravado (nem IP nem e-mail), o 401 é igual ao de senha errada e a tabela só tem colunas sem dado pessoal', async () => {
    await montar({ limitePorEmail: { max: 1, janelaMs: HORA } });
    const existente = await conta();

    const inexistentes = [];
    for (let i = 0; i < 3; i += 1) {
      inexistentes.push(await entrar(emailUnico(), ERRADA, '203.0.113.1'));
    }
    const existenteErrada = await entrar(
      existente.email,
      ERRADA,
      '203.0.113.1',
    );

    for (const r of inexistentes) {
      expect(r.status).toBe(401);
      expect(r.texto).toBe(existenteErrada.texto);
    }
    expect((await linhasDoTeto()).map((l) => l.conta_id)).toEqual([
      existente.contaId,
    ]);
    const { rows } = await sql<{
      column_name: string;
    }>`select column_name from information_schema.columns
      where table_name = 'tentativas_de_entrada' order by column_name`.execute(
      bancoDeTeste(),
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'conta_id',
      'inicio_da_janela',
      'tentativas',
    ]);
  }, 30_000);

  it('Dado e-mail com caixa e espaços diferentes, então é o mesmo contador da conta', async () => {
    await montar({ limitePorEmail: { max: 2, janelaMs: HORA } });
    const alvo = await conta(`caixa-${randomUUID()}@exemplo.test`);

    await entrar(alvo.email.toUpperCase(), ERRADA, '203.0.113.1');
    await entrar(` ${alvo.email} `, ERRADA, '203.0.113.2');
    const terceira = await entrar(alvo.email, SENHA, '203.0.113.3');

    expect(terceira.status).toBe(429);
    expect(await linhasDoTeto()).toHaveLength(1);
  });

  it('Dada uma conta com muitas tentativas, então o teto de outra conta não é afetado e cada uma tem a sua linha', async () => {
    await montar({ limitePorEmail: { max: 2, janelaMs: HORA } });
    const a = await conta();
    const b = await conta();
    for (let i = 0; i < 4; i += 1) {
      await entrar(a.email, ERRADA, `203.0.113.${i + 1}`);
    }

    const deB = await entrar(b.email, SENHA, '203.0.113.50');

    expect(deB.status, deB.texto).toBe(200);
    expect(await linhasDoTeto()).toHaveLength(2);
  });
});

describe('CA42 (D31) — o teto de produção (100 por hora)', () => {
  it('Dado o contador em 99, então a 100ª tentativa ainda chega à senha (200 com a certa) e a 101ª é 429 mesmo com a certa', async () => {
    await montar();
    const alvo = await conta();
    await gravarTeto(alvo.contaId, relogio.agora(), 99);

    const centesima = await entrar(alvo.email, SENHA, '203.0.113.1');
    const centeEUma = await entrar(alvo.email, SENHA, '203.0.113.2');

    expect(centesima.status, centesima.texto).toBe(200);
    expect(centeEUma.status).toBe(429);
    expect(Number(centeEUma.cabecalhos['retry-after'])).toBe(3600);
    expect((await linhasDoTeto())[0]?.tentativas).toBe(101);
  });

  it('Dado o contador em 100 com a janela de 59 min 59 s atrás, então 429; com 60 min atrás, a janela recomeçou', async () => {
    await montar();
    const alvo = await conta();
    const agora = relogio.agora().getTime();

    await gravarTeto(alvo.contaId, new Date(agora - HORA + 1000), 100);
    const dentro = await entrar(alvo.email, SENHA, '203.0.113.1');
    await gravarTeto(alvo.contaId, new Date(agora - HORA), 100);
    const fora = await entrar(alvo.email, SENHA, '203.0.113.2');

    expect(dentro.status).toBe(429);
    expect(dentro.cabecalhos['retry-after']).toBe('1');
    expect(fora.status, fora.texto).toBe(200);
  });
});

describe('CA42 (D31) — a ordem dos dois limites', () => {
  it('Dada a recusa pelo limite de e-mail+IP, então ela não gasta o teto da conta; só as que passaram contam', async () => {
    await montar({
      rateLimit: { max: 10_000, janelaMs: 60_000 },
      limitePorEmailEIp: { max: 2, janelaMs: 15 * MINUTO },
      limitePorEmail: { max: 3, janelaMs: HORA },
    });
    const alvo = await conta();

    const doMesmoIp = [];
    for (let i = 0; i < 6; i += 1) {
      doMesmoIp.push(await entrar(alvo.email, ERRADA, '203.0.113.1'));
    }

    expect(doMesmoIp.map((r) => r.status)).toEqual([
      401, 401, 429, 429, 429, 429,
    ]);
    expect((await linhasDoTeto())[0]?.tentativas).toBe(2);
    // A dona entra de outro IP: o teto ainda tem folga (3ª tentativa).
    const dona = await entrar(alvo.email, SENHA, '203.0.113.200');
    expect(dona.status, dona.texto).toBe(200);
    expect((await linhasDoTeto())[0]?.tentativas).toBe(3);
  });
});

describe('CA42 (D31) — conta excluída no meio', () => {
  it('Dado o repositório e um id de conta que não existe (excluída entre a busca e a contagem), então devolve null sem lançar e sem gravar', async () => {
    const repo = new RepositorioDeTentativasDeEntradaPostgres(
      bancoDeTeste() as never,
    );

    const resultado = await repo.registrar(randomUUID(), new Date(), HORA);
    const naoUuid = await repo.registrar('nao-e-uuid', new Date(), HORA);

    expect(resultado).toBeNull();
    expect(naoUuid).toBeNull();
    expect(await linhasDoTeto()).toEqual([]);
  });

  it('Dada a exclusão da conta, então a linha do teto sai junto (cascade) e a lápide fica', async () => {
    await montar({ limitePorEmail: { max: 5, janelaMs: HORA } });
    const alvo = await conta();
    await entrar(alvo.email, ERRADA, '203.0.113.1');
    expect(await linhasDoTeto()).toHaveLength(1);

    const exclusao = await excluir(app(), alvo, SENHA);

    expect(exclusao.status, exclusao.texto).toBe(204);
    expect(await linhasDoTeto()).toEqual([]);
    expect(await contar('contas_excluidas')).toBe(1);
  });

  it('Dadas 12 tentativas de entrada correndo contra a exclusão da conta, então nenhuma dá 500, a conta some e não sobra linha do teto nem de sessão', async () => {
    await montar({ limitePorEmail: { max: 50, janelaMs: HORA } });
    const alvo = await conta();

    const [exclusao, ...entradas] = await Promise.all([
      excluir(app(), alvo, SENHA),
      ...Array.from({ length: 12 }, (_, i) =>
        entrar(alvo.email, i % 2 === 0 ? SENHA : ERRADA, `203.0.113.${i + 1}`),
      ),
    ]);

    expect(exclusao.status, exclusao.texto).toBe(204);
    for (const r of entradas) {
      expect([200, 401], r.texto).toContain(r.status);
    }
    expect(await contar('contas')).toBe(0);
    expect(await linhasDoTeto()).toEqual([]);
    // Uma sessão aberta por um login que correu à frente da exclusão também
    // sai com ela (a exclusão apaga as sessões na mesma transação).
    expect(await contar('sessoes')).toBe(0);
  });
});

describe('CA42/CA46 — a limpeza das janelas vencidas', () => {
  it('Dadas janelas de 61 min, de exatamente 60 min e de 30 min, então a limpeza apaga as duas vencidas e preserva a ativa com o contador intacto', async () => {
    await montar();
    const velha = await conta();
    const naBorda = await conta();
    const ativa = await conta();
    const agora = relogio.agora().getTime();
    await gravarTeto(velha.contaId, new Date(agora - 61 * MINUTO), 40);
    await gravarTeto(naBorda.contaId, new Date(agora - HORA), 41);
    await gravarTeto(ativa.contaId, new Date(agora - 30 * MINUTO), 42);

    await app().limparRegistrosVencidos();

    const linhas = await linhasDoTeto();
    expect(linhas.map((l) => [l.conta_id, l.tentativas])).toEqual([
      [ativa.contaId, 42],
    ]);
    expect(await contar('contas')).toBe(3);
  });

  it('Dada a janela apagada pela limpeza, então a conta recomeça do zero (a próxima tentativa conta 1) e a limpeza repetida é idempotente', async () => {
    await montar({ limitePorEmail: { max: 2, janelaMs: HORA } });
    const alvo = await conta();
    await entrar(alvo.email, ERRADA, '203.0.113.1');
    await entrar(alvo.email, ERRADA, '203.0.113.1');
    expect((await entrar(alvo.email, SENHA, '203.0.113.1')).status).toBe(429);
    relogio.avancar(HORA + MINUTO);

    await app().limparRegistrosVencidos();
    await app().limparRegistrosVencidos();
    const depois = await entrar(alvo.email, SENHA, '203.0.113.1');

    expect(depois.status, depois.texto).toBe(200);
    expect((await linhasDoTeto())[0]?.tentativas).toBe(1);
  });
});

describe('CA42/CA54 — o 429 do teto não vaza dado pessoal', () => {
  it('Dado o 429 do teto por conta, então a resposta é só o código e o log não traz e-mail, senha, id da conta nem o hash do e-mail', async () => {
    await montar({ limitePorEmail: { max: 2, janelaMs: HORA } });
    const alvo = await conta();
    await entrar(alvo.email, 'senha-errada-vazamento-1', '203.0.113.1');
    await entrar(alvo.email, 'senha-errada-vazamento-2', '203.0.113.1');
    linhasDoLog.length = 0;

    const bloqueada = await entrar(
      alvo.email,
      'senha-errada-vazamento-3',
      '203.0.113.7',
    );

    expect(bloqueada.status).toBe(429);
    expect(bloqueada.texto).toBe('{"erro":"muitas_requisicoes"}');
    const log = linhasDoLog.join('');
    expect(log.length).toBeGreaterThan(0);
    expect(log).not.toContain(alvo.email);
    expect(log).not.toContain(alvo.contaId);
    expect(log).not.toContain('senha-errada-vazamento');
    expect(log).not.toMatch(/[0-9a-f]{64}/);
  });
});
