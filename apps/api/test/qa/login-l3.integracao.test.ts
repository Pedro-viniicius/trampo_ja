/**
 * QA da L3 — login: D31 (CA42), senha em NFC (CA43) e fila do scrypt com 503
 * (CA45), com a API montada pela composição, o hasher de produção e o
 * Postgres de teste.
 *
 * O `scrypt` do `node:crypto` é embrulhado para contar derivações e, quando
 * pedido, segurar a conclusão (ocupa as 2 vagas do semáforo do processo).
 * O hash fictício do e-mail inexistente usa o custo de produção (~0,6 s).
 */
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarLogger } from '../../src/compartilhado/http/logger.js';
import {
  type Aplicacao,
  montarAplicacao,
  type OpcoesDaAplicacao,
} from '../../src/composicao.js';
import { bancoDeTeste } from '../banco-teste.js';
import { pedir, TEMPO_COM_HASH } from './apoio.js';
import { criarUsuarioComSenhaSemPerfil, esperar } from './apoio-l1.js';
import { contar, limparBancoL3 } from './apoio-l3.js';

const porta = vi.hoisted(() => ({
  chamadas: 0,
  segurar: false,
  presas: [] as Array<() => void>,
}));

vi.mock('node:crypto', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('node:crypto')>();
  const scrypt = (...args: unknown[]) => {
    porta.chamadas += 1;
    const executar = () =>
      (original.scrypt as (...a: unknown[]) => void)(...args);
    if (porta.segurar) {
      porta.presas.push(executar);
      return;
    }
    executar();
  };
  return { ...original, default: { ...original, scrypt }, scrypt };
});

/** Libera as derivações presas (cada uma roda o scrypt de verdade). */
function soltarPresas(): void {
  porta.segurar = false;
  for (const executar of porta.presas.splice(0)) {
    executar();
  }
}

const SEM_LIMITE_POR_IP = { max: 10_000, janelaMs: 60_000 };
const SENHA = 'SenhaDaDonaL3#2026';

let aplicacao: Aplicacao | undefined;
let linhasDoLog: string[] = [];

beforeEach(async () => {
  await limparBancoL3();
  linhasDoLog = [];
  porta.chamadas = 0;
  porta.segurar = false;
  porta.presas.length = 0;
});

afterEach(async () => {
  soltarPresas();
  await aplicacao?.fechar();
  aplicacao = undefined;
});

async function montar(
  opcoes: Omit<OpcoesDaAplicacao, 'db' | 'logger'> = {},
): Promise<Aplicacao> {
  aplicacao = await montarAplicacao({
    db: bancoDeTeste(),
    logger: criarLogger({
      nivel: 'trace',
      destino: { write: (linha) => void linhasDoLog.push(linha) },
    }),
    rateLimit: SEM_LIMITE_POR_IP,
    ...opcoes,
  });
  // Termina o hash fictício da partida (e o primeiro login) antes de medir.
  await pedir(aplicacao, 'POST', '/sessoes', {
    corpo: { email: 'aquecimento@exemplo.test', senha: 'qualquer-senha-123' },
    ip: '198.51.100.250',
  });
  porta.chamadas = 0;
  return aplicacao;
}

function app(): Aplicacao {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao;
}

function entrar(email: string, senha: string, ip = '203.0.113.1') {
  return pedir(app(), 'POST', '/sessoes', { corpo: { email, senha }, ip });
}

function emailUnico(): string {
  return `l3-${randomUUID()}@exemplo.test`;
}

describe('CA42 (D31) — limite de entrada nas bordas', () => {
  it('Dadas 10 senhas erradas do e-mail num IP, então a 11ª (mesmo com a senha certa) é 429 sem derivar, e a dona entra de outro IP', async () => {
    await montar();
    const email = emailUnico();
    await criarUsuarioComSenhaSemPerfil(SENHA, email);
    for (let i = 0; i < 10; i += 1) {
      expect(
        (await entrar(email, 'senha-errada-123', '203.0.113.10')).status,
      ).toBe(401);
    }
    porta.chamadas = 0;

    const bloqueada = await entrar(email, SENHA, '203.0.113.10');
    const deOutroIp = await entrar(email, SENHA, '203.0.113.99');

    expect(bloqueada.status).toBe(429);
    expect(bloqueada.corpo).toEqual({ erro: 'muitas_requisicoes' });
    expect(Number(bloqueada.cabecalhos['retry-after'])).toBeGreaterThan(0);
    expect(Number(bloqueada.cabecalhos['retry-after'])).toBeLessThanOrEqual(
      900,
    );
    expect(deOutroIp.status, deOutroIp.texto).toBe(200);
    // Só a tentativa do outro IP gastou o scrypt: o 429 saiu antes dele.
    expect(porta.chamadas).toBe(1);
  });

  it('Dados endereços IPv6 escritos de formas diferentes, então o mesmo /64 divide o contador e outro /64 tem o seu', async () => {
    await montar();
    const email = emailUnico();
    await criarUsuarioComSenhaSemPerfil(SENHA, email);
    const mesmoPrefixo = [
      '2001:db8:0:1::1',
      '2001:0db8:0000:0001:ffff:ffff:ffff:ffff',
      '2001:DB8:0:1:abcd::',
    ];
    // 10 tentativas, cada uma de um endereço do mesmo /64.
    for (let i = 0; i < 10; i += 1) {
      const ip = mesmoPrefixo[i % mesmoPrefixo.length] as string;
      expect((await entrar(email, 'senha-errada-123', ip)).status).toBe(401);
    }

    const mesmoSessenta = await entrar(email, SENHA, '2001:db8:0:1:1:2:3:4');
    const outroSessenta = await entrar(email, SENHA, '2001:db8:0:2::1');

    expect(mesmoSessenta.status).toBe(429);
    expect(outroSessenta.status, outroSessenta.texto).toBe(200);
  });

  it('Dado o teto da conta (baixado para 3) esgotado por senhas erradas de 3 IPs, então a 4ª de um IP novo é 429 sem derivar, mesmo com a senha certa, e o teto de outra conta não é afetado', async () => {
    // Desde o S1 da rodada 1 da L3, o teto é por conta existente, no banco,
    // e só conta o que chega ao caso de uso (corpo válido). Com o teto de
    // produção (100), seriam 100 scrypts: o número é baixado pela composição.
    await montar({ limitePorEmail: { max: 3, janelaMs: 60 * 60_000 } });
    const alvo = emailUnico();
    const outro = emailUnico();
    await criarUsuarioComSenhaSemPerfil(SENHA, alvo);
    await criarUsuarioComSenhaSemPerfil(SENHA, outro);
    for (let i = 0; i < 3; i += 1) {
      const r = await entrar(alvo, 'senha-errada-123', `203.0.0.${i + 1}`);
      expect(r.status).toBe(401);
    }
    porta.chamadas = 0;

    const alvoBloqueado = await entrar(alvo, SENHA, '198.51.100.7');
    const derivacoesDoBloqueio = porta.chamadas;
    const outroLivre = await entrar(outro, SENHA, '198.51.100.7');

    expect(alvoBloqueado.status).toBe(429);
    expect(alvoBloqueado.corpo).toEqual({ erro: 'muitas_requisicoes' });
    expect(Number(alvoBloqueado.cabecalhos['retry-after'])).toBeLessThanOrEqual(
      3600,
    );
    expect(derivacoesDoBloqueio).toBe(0);
    expect(outroLivre.status, outroLivre.texto).toBe(200);
  });

  it('Dado corpo sem e-mail utilizável (ausente, número, vazio, 400 caracteres), então trocar o texto do e-mail não escapa do limite do IP', async () => {
    await montar();
    const ip = '203.0.113.77';
    const corpos: unknown[] = [
      { senha: 'senha-qualquer-123' },
      { email: 42, senha: 'senha-qualquer-123' },
      { email: '', senha: 'senha-qualquer-123' },
      { email: '   ', senha: 'senha-qualquer-123' },
      { email: `${'a'.repeat(400)}@exemplo.test`, senha: 'senha-qualquer-123' },
      { email: `${'b'.repeat(400)}@exemplo.test`, senha: 'senha-qualquer-123' },
      null,
      [],
      { email: ['a@b.co'], senha: 'senha-qualquer-123' },
      { email: { x: 1 }, senha: 'senha-qualquer-123' },
    ];
    for (const corpo of corpos) {
      const r = await pedir(app(), 'POST', '/sessoes', {
        corpoBruto: JSON.stringify(corpo),
        ip,
      });
      expect([400, 401], r.texto).toContain(r.status);
    }

    const onze = await pedir(app(), 'POST', '/sessoes', {
      corpoBruto: JSON.stringify({
        email: `${'c'.repeat(400)}@exemplo.test`,
        senha: 'x',
      }),
      ip,
    });

    expect(onze.status).toBe(429);
  });

  it('Dado o 429, então a resposta e o log não trazem o e-mail, a senha nem o hash dele', async () => {
    await montar();
    const email = emailUnico();
    for (let i = 0; i < 10; i += 1) {
      // Corpo recusado pelo schema (chave extra): conta sem rodar o scrypt.
      await pedir(app(), 'POST', '/sessoes', {
        corpo: { email, senha: `senha-errada-l3-${i}`, extra: i },
        ip: '203.0.113.5',
      });
    }

    const bloqueada = await entrar(
      email,
      'senha-errada-l3-final',
      '203.0.113.5',
    );

    expect(bloqueada.status).toBe(429);
    expect(bloqueada.texto).toBe('{"erro":"muitas_requisicoes"}');
    const log = linhasDoLog.join('');
    expect(log.length).toBeGreaterThan(0);
    expect(log).not.toContain(email);
    expect(log).not.toContain('senha-errada-l3');
    expect(log).not.toMatch(/[0-9a-f]{64}/);
  });
});

describe('CA43 (S8) — senha em NFC', () => {
  const NFC = 'Café-ação-Ünico-123';
  const NFD = NFC.normalize('NFD');

  it('as duas grafias são mesmo diferentes para o JavaScript', () => {
    expect(NFD).not.toBe(NFC);
    expect(NFD.normalize('NFC')).toBe(NFC);
  });

  it(
    'Dada a conta cadastrada pela API com a senha em NFD, então entra com NFC e com NFD, exporta com NFC e exclui com NFD',
    async () => {
      await montar();
      const email = emailUnico();
      const cadastro = await pedir(app(), 'POST', '/contas', {
        corpo: { email, senha: NFD },
        ip: '203.0.113.20',
      });
      expect(cadastro.status, cadastro.texto).toBe(201);

      const comNfc = await entrar(email, NFC, '203.0.113.21');
      const comNfd = await entrar(email, NFD, '203.0.113.22');
      const token = (comNfc.corpo as { token: string }).token;
      const exportada = await pedir(app(), 'POST', '/contas/eu/exportacao', {
        token,
        corpo: { senha: NFC },
      });
      const excluida = await pedir(app(), 'POST', '/contas/eu/exclusao', {
        token,
        corpo: { senha: NFD },
      });

      expect(comNfc.status, comNfc.texto).toBe(200);
      expect(comNfd.status, comNfd.texto).toBe(200);
      expect(exportada.status, exportada.texto.slice(0, 200)).toBe(200);
      expect(excluida.status, excluida.texto).toBe(204);
      expect(await contar('contas')).toBe(0);
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dada a conta cadastrada pela API com NFC, então entra digitando NFD, e senha com outra letra continua recusada',
    async () => {
      await montar();
      const email = emailUnico();
      const cadastro = await pedir(app(), 'POST', '/contas', {
        corpo: { email, senha: NFC },
        ip: '203.0.113.30',
      });
      expect(cadastro.status, cadastro.texto).toBe(201);

      const comNfd = await entrar(email, NFD, '203.0.113.31');
      const outraLetra = await entrar(
        email,
        NFC.replace('ç', 'c').normalize('NFD'),
        '203.0.113.32',
      );

      expect(comNfd.status, comNfd.texto).toBe(200);
      expect(outraLetra.status).toBe(401);
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dada a conta antiga com o hash sobre a forma crua em NFD, então entra com NFD (2 derivações); com NFC não entra (o hash é da forma crua)',
    async () => {
      await montar();
      const email = emailUnico();
      await criarUsuarioComSenhaSemPerfil(NFD, email);
      porta.chamadas = 0; // o hash da conta antiga também passou pelo scrypt

      const comNfd = await entrar(email, NFD, '203.0.113.40');
      const derivacoesDoNfd = porta.chamadas;
      porta.chamadas = 0;
      const comNfc = await entrar(email, NFC, '203.0.113.41');

      expect(comNfd.status, comNfd.texto).toBe(200);
      expect(derivacoesDoNfd).toBe(2);
      expect(comNfc.status).toBe(401);
      expect(porta.chamadas).toBe(1);
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dada senha errada, então e-mail inexistente e e-mail existente derivam o mesmo número de vezes (1 em NFC, 2 em NFD)',
    async () => {
      await montar();
      const existente = emailUnico();
      await criarUsuarioComSenhaSemPerfil(SENHA, existente);
      const inexistente = emailUnico();
      const casos: [string, string, number][] = [
        ['existente NFC', existente, 1],
        ['inexistente NFC', inexistente, 1],
        ['existente NFD', existente, 2],
        ['inexistente NFD', inexistente, 2],
      ];
      const medido: Record<string, number> = {};
      for (const [nome, email, esperado] of casos) {
        porta.chamadas = 0;
        const senha =
          esperado === 1
            ? 'SenhaErrada-Ünica-1'
            : 'SenhaErrada-Ünica-1'.normalize('NFD');
        const r = await entrar(email, senha, '203.0.113.50');
        expect(r.status, nome).toBe(401);
        medido[nome] = porta.chamadas;
      }

      expect(medido).toEqual({
        'existente NFC': 1,
        'inexistente NFC': 1,
        'existente NFD': 2,
        'inexistente NFD': 2,
      });
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dada senha de 129 pontos de código (que viraria 65 em NFC), então o teto vale na forma crua: login 401 sem derivar e cadastro 400; com 128 pontos o cadastro passa',
    async () => {
      await montar();
      const email = emailUnico();
      await criarUsuarioComSenhaSemPerfil(SENHA, email);
      const acentuada = 'é'.normalize('NFD'); // 2 pontos de código
      const crua129 = `a${acentuada.repeat(64)}`;
      const crua128 = acentuada.repeat(64);
      expect([...crua129]).toHaveLength(129);
      expect([...crua128]).toHaveLength(128);

      porta.chamadas = 0;
      const login = await entrar(email, crua129, '203.0.113.60');
      const derivacoes = porta.chamadas;
      const cadastroLongo = await pedir(app(), 'POST', '/contas', {
        corpo: { email: emailUnico(), senha: crua129 },
        ip: '203.0.113.61',
      });
      const cadastroNoTeto = await pedir(app(), 'POST', '/contas', {
        corpo: { email: emailUnico(), senha: crua128 },
        ip: '203.0.113.62',
      });

      expect(login.status).toBe(401);
      expect(derivacoes).toBe(0);
      expect(cadastroLongo.status).toBe(400);
      expect(cadastroLongo.corpo).toMatchObject({
        campos: [{ campo: 'senha', motivo: 'tamanho' }],
      });
      expect(cadastroNoTeto.status, cadastroNoTeto.texto).toBe(201);
    },
    TEMPO_COM_HASH,
  );
});

describe('CA43 (S3 da revisão) — o mínimo de 8 é medido na forma NFC', () => {
  const E = 'é';

  it.each([
    [
      '4 "é" em NFD (8 pontos de código crus, 4 em NFC)',
      E.repeat(4).normalize('NFD'),
    ],
    ['7 "é" em NFD (14 crus, 7 em NFC)', E.repeat(7).normalize('NFD')],
    ['7 "é" em NFC', E.repeat(7)],
    [
      '3 "é" e 4 "x" em NFD (10 crus, 7 em NFC)',
      `${E.repeat(3)}xxxx`.normalize('NFD'),
    ],
  ])(
    'Dada a senha de %s, então o cadastro é 400 por tamanho, sem derivar e sem gravar conta',
    async (_nome, senha) => {
      await montar();
      porta.chamadas = 0;

      const r = await pedir(app(), 'POST', '/contas', {
        corpo: { email: emailUnico(), senha },
        ip: '203.0.113.70',
      });

      expect(r.status, r.texto).toBe(400);
      expect(r.corpo).toMatchObject({
        campos: [{ campo: 'senha', motivo: 'tamanho' }],
      });
      expect(porta.chamadas).toBe(0);
      expect(await contar('contas')).toBe(0);
    },
  );

  it(
    'Dada a senha de exatamente 8 "é" em NFD (16 crus, 8 em NFC), então o cadastro passa e a conta entra digitando NFC e NFD',
    async () => {
      await montar();
      const email = emailUnico();
      const nfd = E.repeat(8).normalize('NFD');
      expect([...nfd]).toHaveLength(16);

      const cadastro = await pedir(app(), 'POST', '/contas', {
        corpo: { email, senha: nfd },
        ip: '203.0.113.71',
      });
      const comNfc = await entrar(email, E.repeat(8), '203.0.113.72');
      const comNfd = await entrar(email, nfd, '203.0.113.73');

      expect(cadastro.status, cadastro.texto).toBe(201);
      expect(comNfc.status, comNfc.texto).toBe(200);
      expect(comNfd.status, comNfd.texto).toBe(200);
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dada a conta antiga cuja senha crua em NFD tem 8 pontos mas só 4 em NFC, então o login (que não impõe mínimo) ainda entra com a forma crua e com a NFC não',
    async () => {
      await montar();
      const email = emailUnico();
      const curta = E.repeat(4).normalize('NFD');
      await criarUsuarioComSenhaSemPerfil(curta, email);

      const comCrua = await entrar(email, curta, '203.0.113.74');
      const comNfc = await entrar(email, E.repeat(4), '203.0.113.75');

      expect(comCrua.status, comCrua.texto).toBe(200);
      expect(comNfc.status).toBe(401);
    },
    TEMPO_COM_HASH,
  );
});

describe('CA45 (S3) — fila do scrypt cheia: 503, retry-after e conexão caída', () => {
  it('Dada a conexão que cai com o cadastro na fila, então, quando as vagas saem antes dos 10 s, o pedido que desistiu não deriva nem grava a conta e quem ficou na fila passa na frente dele', async () => {
    await montar();
    const dono = emailUnico();
    await criarUsuarioComSenhaSemPerfil(SENHA, dono);
    await app().app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app().app.server.address() as AddressInfo;
    const enviar = (caminho: string, corpo: unknown, sinal?: AbortSignal) =>
      fetch(`http://127.0.0.1:${port}${caminho}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: sinal,
      });
    porta.chamadas = 0;
    porta.segurar = true;
    const primeira = enviar('/sessoes', {
      email: dono,
      senha: 'senha-errada-123',
    });
    const segunda = enviar('/sessoes', {
      email: dono,
      senha: 'senha-errada-123',
    });
    await vi.waitFor(() => expect(porta.presas.length).toBe(2), {
      timeout: 5000,
    });

    // Na fila, nesta ordem: o cadastro que vai desistir e depois um login.
    const emailDoDesistente = emailUnico();
    const desistente = new AbortController();
    const aoDesistir = enviar(
      '/contas',
      { email: emailDoDesistente, senha: SENHA },
      desistente.signal,
    ).catch((erro: unknown) => erro);
    await esperar(300);
    const loginNaFila = enviar('/sessoes', {
      email: emailUnico(),
      senha: 'senha-qualquer-123',
    });
    await esperar(300);
    desistente.abort();
    expect(await aoDesistir).toBeInstanceOf(Error);
    await esperar(300); // o servidor percebe o fim da conexão

    soltarPresas();
    const [a, b, naFila] = await Promise.all([primeira, segunda, loginNaFila]);

    expect([a.status, b.status, naFila.status]).toEqual([401, 401, 401]);
    // 2 derivações das vagas + 1 do login que esperou; a do cadastro não nasceu.
    expect(porta.chamadas).toBe(3);
    expect(await contar('contas')).toBe(1);
    expect(linhasDoLog.join('')).not.toContain(emailDoDesistente);
  }, 30_000);

  it('Dadas as 2 vagas ocupadas por mais de 10 s, então entrar, cadastrar e excluir recebem 503 servico_ocupado com retry-after 10, nada é derivado nem gravado, e depois de soltar tudo a fila volta a andar', async () => {
    await montar();
    const donoDoEmail = emailUnico();
    const dona = await criarUsuarioComSenhaSemPerfil(SENHA, donoDoEmail);
    await app().app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app().app.server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    const enviar = (
      caminho: string,
      corpo: unknown,
      cabecalhos: Record<string, string> = {},
      sinal?: AbortSignal,
    ) =>
      fetch(`${base}${caminho}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...cabecalhos },
        body: JSON.stringify(corpo),
        signal: sinal,
      });

    // Duas tentativas de login (senha errada) seguram as 2 vagas.
    porta.segurar = true;
    const seguras = [1, 2].map(() =>
      enviar('/sessoes', { email: donoDoEmail, senha: 'senha-errada-123' }),
    );
    await vi.waitFor(() => expect(porta.presas.length).toBe(2), {
      timeout: 5000,
    });
    const derivacoesComAsVagasCheias = porta.chamadas;

    // Quem chega agora espera na fila; uma delas desiste (conexão cai).
    const desistente = new AbortController();
    const emailDoDesistente = emailUnico();
    const aoDesistir = enviar(
      '/contas',
      { email: emailDoDesistente, senha: SENHA },
      {},
      desistente.signal,
    ).catch((erro: unknown) => erro);
    const login = enviar('/sessoes', {
      email: emailUnico(),
      senha: 'senha-qualquer-123',
    });
    const cadastro = enviar('/contas', {
      email: emailUnico(),
      senha: SENHA,
    });
    const exclusao = enviar(
      '/contas/eu/exclusao',
      { senha: SENHA },
      { authorization: `Bearer ${dona.token}` },
    );
    await esperar(500);
    desistente.abort();
    expect(await aoDesistir).toBeInstanceOf(Error);

    const [rLogin, rCadastro, rExclusao] = await Promise.all([
      login,
      cadastro,
      exclusao,
    ]);

    for (const r of [rLogin, rCadastro, rExclusao]) {
      expect(r.status).toBe(503);
      expect(r.headers.get('retry-after')).toBe('10');
      expect(await r.json()).toEqual({ erro: 'servico_ocupado' });
    }
    expect(rExclusao.headers.get('cache-control')).toBe('no-store');
    // Nenhuma derivação nova nasceu para quem esperou ou desistiu.
    expect(porta.chamadas).toBe(derivacoesComAsVagasCheias);
    expect(await contar('contas')).toBe(1);
    expect(await contar('contas_excluidas')).toBe(0);

    // Solta as 2 vagas: as tentativas seguradas terminam em 401 e a fila anda.
    soltarPresas();
    const seguradas = await Promise.all(seguras);
    expect(seguradas.map((r) => r.status)).toEqual([401, 401]);
    const depois = await enviar('/sessoes', {
      email: donoDoEmail,
      senha: SENHA,
    });
    expect(depois.status).toBe(200);
    expect(await contar('contas')).toBe(1);

    const log = linhasDoLog.join('');
    expect(log).not.toContain(donoDoEmail);
    expect(log).not.toContain(emailDoDesistente);
    expect(log).not.toContain(SENHA);
  }, 60_000);

  it(
    'Dado quem espera na fila e a vaga que sai antes dos 10 s, então ele é atendido normalmente (200) e o temporizador de espera não derruba nada depois',
    async () => {
      await montar();
      const email = emailUnico();
      await criarUsuarioComSenhaSemPerfil(SENHA, email);
      porta.segurar = true;
      const primeiraSegura = entrar(email, 'senha-errada-123', '203.0.113.150');
      const segundaSegura = entrar(email, 'senha-errada-123', '203.0.113.150');
      await vi.waitFor(() => expect(porta.presas.length).toBe(2), {
        timeout: 5000,
      });

      const esperando = entrar(email, SENHA, '203.0.113.201');
      await esperar(300);
      soltarPresas();
      const [primeira, segunda, atendida] = await Promise.all([
        primeiraSegura,
        segundaSegura,
        esperando,
      ]);

      expect([primeira.status, segunda.status]).toEqual([401, 401]);
      expect(atendida.status, atendida.texto).toBe(200);
      // A sessão do cadastro direto e a do login atendido; nenhuma a mais.
      const { rows } = await sql<{
        n: number;
      }>`select count(*)::int as n from sessoes`.execute(bancoDeTeste());
      expect(rows[0]?.n).toBe(2);
    },
    TEMPO_COM_HASH,
  );
});
