/**
 * QA da L1 — limite por conta (CA20, D29): cada grupo no limiar com os números
 * padrão, concorrência, sessões da mesma conta, o que não gasta o contador
 * (400 de corpo, 401), o que gasta (403 de senha), `retry-after` e a janela.
 *
 * Contas e anúncios de preparo são criados numa aplicação sem limite
 * (`preparar`); a aplicação sob teste sobe depois, com os contadores zerados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LimitesPorConta } from '../../src/compartilhado/http/limite-por-conta.js';
import type { Aplicacao } from '../../src/composicao.js';
import {
  candidatar,
  limparBanco,
  montar,
  ofertarServico,
  pedir,
  publicarTrampo,
  type Resposta,
  SERVICO_VALIDO,
  TRAMPO_VALIDO,
} from './apoio.js';
import {
  abrirOutraSessao,
  criarUsuarioComSenha,
  excluir,
  exportar,
  linhasDe,
  type UsuarioComSenha,
} from './apoio-l1.js';

let aplicacao: Aplicacao | undefined;

beforeEach(async () => {
  await limparBanco();
});

afterEach(async () => {
  vi.useRealTimers();
  await aplicacao?.fechar();
  aplicacao = undefined;
});

function app(): Aplicacao {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao;
}

type OpcoesDeMontagem = Parameters<typeof montar>[0];

/** Prepara os dados sem limite e sobe a aplicação sob teste, com contadores zerados. */
async function preparar<T>(
  criar: (livre: Aplicacao) => Promise<T>,
  opcoes: OpcoesDeMontagem = { rateLimit: undefined },
): Promise<T> {
  const livre = await montar();
  const dados = await criar(livre);
  await livre.fechar();
  aplicacao = await montar(opcoes);
  return dados;
}

const MUITAS = '{"erro":"muitas_requisicoes"}';

function limites(parcial: Partial<LimitesPorConta>): LimitesPorConta {
  const livre = { max: 100_000, janelaMs: 60_000 };
  return {
    leitura: livre,
    mensagens: livre,
    mensagens_dia: livre,
    publicacao: livre,
    senha: livre,
    escrita: livre,
    ...parcial,
  };
}

function esperar429(
  resposta: Resposta,
  contexto: string,
  tetoSegundos: number,
): void {
  expect(resposta.status, `${contexto}: ${resposta.texto}`).toBe(429);
  expect(resposta.texto, contexto).toBe(MUITAS);
  const retry = Number(resposta.cabecalhos['retry-after']);
  expect(Number.isInteger(retry), `${contexto}: retry-after`).toBe(true);
  expect(retry, `${contexto}: retry-after`).toBeGreaterThan(0);
  expect(retry, `${contexto}: retry-after`).toBeLessThanOrEqual(tetoSegundos);
}

const PERFIL_NOVO = {
  nome: 'Nome Novo',
  cidade: 'Lavras',
  habilidades: ['pintura'],
};

describe('CA20 — cada grupo no limiar dos números padrão (D29)', () => {
  it('leitura: 600 GET no minuto passam e o 601º dá 429; a escrita não é afetada', async () => {
    const ana = await preparar((livre) => criarUsuarioComSenha(livre));
    for (let i = 1; i <= 600; i++) {
      const r = await pedir(app(), 'GET', '/categorias', { token: ana.token });
      if (r.status !== 200) {
        throw new Error(`leitura ${i}: ${r.status} ${r.texto}`);
      }
    }

    esperar429(
      await pedir(app(), 'GET', '/categorias', { token: ana.token }),
      'leitura 601',
      60,
    );
    const escrita = await pedir(app(), 'PUT', '/perfis/eu', {
      token: ana.token,
      corpo: PERFIL_NOVO,
    });
    expect(escrita.status).toBe(200);
  }, 60_000);

  it('escrita: 60 por minuto e o 61º dá 429, sem gravar', async () => {
    const ana = await preparar((livre) => criarUsuarioComSenha(livre));
    for (let i = 1; i <= 60; i++) {
      const r = await pedir(app(), 'PUT', '/perfis/eu', {
        token: ana.token,
        corpo: { ...PERFIL_NOVO, nome: `Nome ${i}` },
      });
      expect(r.status, `escrita ${i}: ${r.texto}`).toBe(200);
    }

    esperar429(
      await pedir(app(), 'PUT', '/perfis/eu', {
        token: ana.token,
        corpo: { ...PERFIL_NOVO, nome: 'Nome 61' },
      }),
      'escrita 61',
      60,
    );
    const perfil = await pedir(app(), 'GET', '/perfis/eu', {
      token: ana.token,
    });
    expect((perfil.corpo as { nome: string }).nome).toBe('Nome 60');
  });

  it('publicacao: trampos, serviços e candidaturas dividem o teto de 30 por hora', async () => {
    const { candidata, alvos } = await preparar(async (livre) => {
      const autor = await criarUsuarioComSenha(livre);
      const candidata = await criarUsuarioComSenha(livre);
      const alvos: string[] = [];
      for (let i = 0; i < 10; i++) {
        alvos.push(await publicarTrampo(livre, autor));
      }
      return { candidata, alvos };
    });
    for (let i = 0; i < 10; i++) {
      await publicarTrampo(app(), candidata);
      await ofertarServico(app(), candidata);
      const c = await candidatar(app(), candidata, alvos[i] as string);
      expect(c.status, `candidatura ${i}: ${c.texto}`).toBe(201);
    }

    esperar429(
      await pedir(app(), 'POST', '/trampos', {
        token: candidata.token,
        corpo: TRAMPO_VALIDO,
      }),
      'trampo 31',
      3600,
    );
    esperar429(
      await pedir(app(), 'POST', '/servicos', {
        token: candidata.token,
        corpo: SERVICO_VALIDO,
      }),
      'serviço 31',
      3600,
    );
    // A candidatura 31 também é barrada, e nada é gravado.
    const outroAlvo = await pedir(app(), 'GET', '/trampos/meus', {
      token: candidata.token,
    });
    expect(outroAlvo.corpo as unknown[]).toHaveLength(10);
  }, 60_000);

  it('senha: 5 tentativas (as erradas contam) e a 6ª, mesmo com a senha certa, dá 429 com no-store; exclusão e exportação dividem o contador', async () => {
    const ana = await preparar((livre) => criarUsuarioComSenha(livre));
    const tentativas = [
      () => exportar(app(), ana, 'errada-1-123456'),
      () => exportar(app(), ana, 'errada-2-123456'),
      () => excluir(app(), ana, 'errada-3-123456'),
      () => excluir(app(), ana, 'errada-4-123456'),
      () => exportar(app(), ana, ana.senha),
    ];
    for (const chamar of tentativas) {
      const r = await chamar();
      expect([200, 403], r.texto).toContain(r.status);
    }

    const bloqueada = await excluir(app(), ana, ana.senha);

    esperar429(bloqueada, 'exclusão 6', 15 * 60);
    expect(bloqueada.cabecalhos['cache-control']).toBe('no-store');
    expect((await linhasDe(ana.contaId)).contas).toBe(1);
    esperar429(await exportar(app(), ana, ana.senha), 'exportação 7', 15 * 60);
    expect(
      (await pedir(app(), 'GET', '/perfis/eu', { token: ana.token })).status,
    ).toBe(200);
  });
});

describe('CA20 — o que gasta e o que não gasta o contador', () => {
  it('o 400 do schema (chave a mais no corpo) não gasta o limite, e o 429 não executa a ação', async () => {
    const ana = await preparar((livre) => criarUsuarioComSenha(livre), {
      rateLimit: undefined,
      limitesPorConta: limites({
        escrita: { max: 2, janelaMs: 60_000 },
        publicacao: { max: 1, janelaMs: 60_000 },
      }),
    });
    for (let i = 0; i < 8; i++) {
      const perfil = await pedir(app(), 'PUT', '/perfis/eu', {
        token: ana.token,
        corpo: { ...PERFIL_NOVO, autorId: 'x' },
      });
      expect(perfil.status, `perfil inválido ${i}`).toBe(400);
      const trampo = await pedir(app(), 'POST', '/trampos', {
        token: ana.token,
        corpo: { ...TRAMPO_VALIDO, status: 'em_andamento' },
      });
      expect(trampo.status, `trampo inválido ${i}`).toBe(400);
    }

    const validos = [
      await pedir(app(), 'PUT', '/perfis/eu', {
        token: ana.token,
        corpo: PERFIL_NOVO,
      }),
      await pedir(app(), 'PUT', '/perfis/eu', {
        token: ana.token,
        corpo: PERFIL_NOVO,
      }),
      await pedir(app(), 'POST', '/trampos', {
        token: ana.token,
        corpo: TRAMPO_VALIDO,
      }),
    ];
    expect(validos.map((r) => r.status)).toEqual([200, 200, 201]);
    esperar429(
      await pedir(app(), 'PUT', '/perfis/eu', {
        token: ana.token,
        corpo: PERFIL_NOVO,
      }),
      'escrita 3',
      60,
    );
    esperar429(
      await pedir(app(), 'POST', '/trampos', {
        token: ana.token,
        corpo: TRAMPO_VALIDO,
      }),
      'publicação 2',
      60,
    );
    const meus = await pedir(app(), 'GET', '/trampos/meus', {
      token: ana.token,
    });
    expect(meus.corpo as unknown[]).toHaveLength(1);
  });

  it('pedidos sem sessão ou com token falso dão 401 e não gastam o contador de ninguém', async () => {
    const ana = await preparar((livre) => criarUsuarioComSenha(livre), {
      rateLimit: undefined,
      limitesPorConta: limites({ leitura: { max: 1, janelaMs: 60_000 } }),
    });
    for (let i = 0; i < 5; i++) {
      const semToken = await pedir(app(), 'GET', '/categorias');
      const falso = await pedir(app(), 'GET', '/categorias', {
        token: 'token-que-nao-existe-nenhum-1234567890',
      });
      expect([semToken.status, falso.status]).toEqual([401, 401]);
    }

    expect(
      (await pedir(app(), 'GET', '/categorias', { token: ana.token })).status,
    ).toBe(200);
    esperar429(
      await pedir(app(), 'GET', '/categorias', { token: ana.token }),
      'segunda leitura',
      60,
    );
  });

  it('dois aparelhos da mesma conta dividem o contador (a chave é a conta, não a sessão)', async () => {
    const ana = await preparar((livre) => criarUsuarioComSenha(livre), {
      rateLimit: undefined,
      limitesPorConta: limites({ escrita: { max: 2, janelaMs: 60_000 } }),
    });
    const outroAparelho = await abrirOutraSessao(ana.contaId);
    const escrever = (token: string) =>
      pedir(app(), 'PUT', '/perfis/eu', { token, corpo: PERFIL_NOVO });

    expect((await escrever(ana.token)).status).toBe(200);
    expect((await escrever(outroAparelho)).status).toBe(200);

    esperar429(await escrever(outroAparelho), 'terceira do aparelho 2', 60);
    esperar429(await escrever(ana.token), 'terceira do aparelho 1', 60);
  });

  it('a conta sem token não tem contador: a outra conta no mesmo IP segue livre quando a primeira estoura', async () => {
    const [ana, bruno] = await preparar(
      async (livre) =>
        [
          await criarUsuarioComSenha(livre),
          await criarUsuarioComSenha(livre),
        ] as const,
      {
        rateLimit: undefined,
        limitesPorConta: limites({ leitura: { max: 2, janelaMs: 60_000 } }),
      },
    );
    const ler = (u: UsuarioComSenha) =>
      pedir(app(), 'GET', '/categorias', { token: u.token, ip: '10.9.9.9' });

    await ler(ana);
    await ler(ana);
    esperar429(await ler(ana), 'terceira da Ana', 60);

    expect((await ler(bruno)).status).toBe(200);
    expect((await ler(bruno)).status).toBe(200);
  });
});

describe('CA20 — concorrência e janela', () => {
  it('Dado 40 mensagens simultâneas da mesma conta, então exatamente 30 dão 201 e 10 dão 429, e só 30 são gravadas', async () => {
    const { ana, conversaId } = await preparar(async (livre) => {
      const ana = await criarUsuarioComSenha(livre);
      const bruno = await criarUsuarioComSenha(livre);
      const trampoId = await publicarTrampo(livre, ana);
      await candidatar(livre, bruno, trampoId);
      const aberta = await pedir(livre, 'POST', '/conversas', {
        token: bruno.token,
        corpo: { outroUsuarioId: ana.contaId },
      });
      return {
        ana,
        conversaId: (aberta.corpo as { conversaId: string }).conversaId,
      };
    });

    const respostas = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        pedir(app(), 'POST', `/conversas/${conversaId}/mensagens`, {
          token: ana.token,
          corpo: { texto: `m${i}` },
        }),
      ),
    );

    const porStatus = (status: number) =>
      respostas.filter((r) => r.status === status).length;
    expect([porStatus(201), porStatus(429)]).toEqual([30, 10]);
    const lidas = await pedir(
      app(),
      'GET',
      `/conversas/${conversaId}/mensagens`,
      {
        token: ana.token,
      },
    );
    expect(lidas.corpo as unknown[]).toHaveLength(30);
  });

  it('Dado o limite estourado, quando a janela passa, então a conta volta a escrever; antes disso o retry-after encolhe com o tempo', async () => {
    const ana = await preparar((livre) => criarUsuarioComSenha(livre), {
      rateLimit: undefined,
      limitesPorConta: limites({ escrita: { max: 1, janelaMs: 60_000 } }),
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'));
    const escrever = () =>
      pedir(app(), 'PUT', '/perfis/eu', {
        token: ana.token,
        corpo: PERFIL_NOVO,
      });

    expect((await escrever()).status).toBe(200);
    const logo = await escrever();
    esperar429(logo, 'logo depois', 60);
    expect(Number(logo.cabecalhos['retry-after'])).toBe(60);

    vi.setSystemTime(new Date('2026-03-01T12:00:45.000Z'));
    const depoisDe45 = await escrever();
    esperar429(depoisDe45, 'depois de 45 s', 15);
    expect(Number(depoisDe45.cabecalhos['retry-after'])).toBe(15);

    vi.setSystemTime(new Date('2026-03-01T12:01:00.001Z'));
    expect((await escrever()).status).toBe(200);
  });
});
