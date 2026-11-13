/**
 * CA20 (D29) de ponta a ponta: o limite por conta ligado pela composição, com
 * sessões reais no Postgres de teste.
 *
 * - Com os limites padrão, a 31ª mensagem no minuto dá 429 com `retry-after`,
 *   e a outra conta segue enviando.
 * - Varredura: cada rota autenticada registrada (inclusive os HEAD
 *   automáticos) consome os contadores dos grupos de `gruposDaRota`, e só os
 *   dela; o teto diário (`mensagens_dia`) é só do envio de mensagem.
 * - O teto diário de mensagens (S1 da L1) soma-se aos 30/min, por conta.
 * - As rotas públicas ficam sem limite por conta; `limitesPorConta: false` e
 *   `rateLimit: false` desligam o limite, inclusive o teto diário.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type GrupoDeLimite,
  gruposDaRota,
  LIMITES_PADRAO_POR_CONTA,
  type LimitesPorConta,
} from '../../src/compartilhado/http/limite-por-conta.js';
import {
  type Aplicacao,
  ROTAS_PUBLICAS,
  type RotaRegistrada,
} from '../../src/composicao.js';
import {
  candidatar,
  criarUsuario,
  criarUsuarioSemPerfil,
  limparBanco,
  montar,
  pedir,
  publicarTrampo,
  type Resposta,
  TEMPO_COM_HASH,
  type Usuario,
} from '../qa/apoio.js';

let aplicacao: Aplicacao | undefined;

beforeEach(async () => {
  await limparBanco();
});

afterEach(async () => {
  await aplicacao?.fechar();
  aplicacao = undefined;
});

const MUITAS_REQUISICOES = '{"erro":"muitas_requisicoes"}';

/** Um pedido por grupo e por conta: o segundo do mesmo grupo dá 429. */
const UM_POR_GRUPO: LimitesPorConta = {
  leitura: { max: 1, janelaMs: 60_000 },
  mensagens: { max: 1, janelaMs: 60_000 },
  mensagens_dia: { max: 1, janelaMs: 60_000 },
  publicacao: { max: 1, janelaMs: 60_000 },
  senha: { max: 1, janelaMs: 60_000 },
  escrita: { max: 1, janelaMs: 60_000 },
};

function app(): Aplicacao {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao;
}

function ehPublica(rota: RotaRegistrada): boolean {
  return ROTAS_PUBLICAS.some(
    (publica) => publica.metodo === rota.metodo && publica.url === rota.url,
  );
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';

/**
 * Chama a rota com `:id`, `:cid`… trocados por uuids e corpo `{}` em
 * POST/PUT: tudo passa pelo schema e chega ao `preHandler` do limite (o
 * domínio responde depois com 400, 403 ou 404, sem efeito).
 */
function chamar(rota: RotaRegistrada, usuario: Usuario): Promise<Resposta> {
  return pedir(
    app(),
    rota.metodo as Metodo,
    rota.url.replace(/:[A-Za-z]+/g, () => randomUUID()),
    {
      token: usuario.token,
      ...(['POST', 'PUT'].includes(rota.metodo) ? { corpo: {} } : {}),
    },
  );
}

/** Uma rota de cada grupo, para gastar o contador daquele grupo. */
const SONDA_DO_GRUPO: Readonly<Record<GrupoDeLimite, RotaRegistrada>> = {
  leitura: { metodo: 'GET', url: '/categorias' },
  mensagens: { metodo: 'POST', url: '/conversas/:id/mensagens' },
  // Gasta também o de `mensagens`: depois dela, uma rota só dá 429 se tiver
  // um dos dois, e só o envio de mensagem tem.
  mensagens_dia: { metodo: 'POST', url: '/conversas/:id/mensagens' },
  publicacao: { metodo: 'POST', url: '/trampos' },
  senha: { metodo: 'POST', url: '/contas/eu/exportacao' },
  escrita: { metodo: 'PUT', url: '/perfis/eu' },
};

const GRUPOS = Object.keys(SONDA_DO_GRUPO) as GrupoDeLimite[];

describe('CA20 — limite por conta com os números padrão (D29)', () => {
  it('Dado 30 mensagens da conta no minuto, quando ela envia a 31ª, então 429 muitas_requisicoes com retry-after; a outra conta da conversa segue enviando e a leitura não é afetada', async () => {
    // Sem `limitesPorConta` nem `rateLimit`: os padrões da produção.
    aplicacao = await montar({ rateLimit: undefined });
    const ana = await criarUsuario(app());
    const bruno = await criarUsuario(app());
    const trampoId = await publicarTrampo(app(), ana);
    expect((await candidatar(app(), bruno, trampoId)).status).toBe(201);
    const aberta = await pedir(app(), 'POST', '/conversas', {
      token: bruno.token,
      corpo: { outroUsuarioId: ana.contaId },
    });
    expect(aberta.status).toBe(201);
    const url = `/conversas/${(aberta.corpo as { conversaId: string }).conversaId}/mensagens`;
    const enviar = (usuario: Usuario, i: number) =>
      pedir(app(), 'POST', url, {
        token: usuario.token,
        corpo: { texto: `Mensagem ${i}` },
      });

    for (let i = 1; i <= 30; i++) {
      const enviada = await enviar(ana, i);
      expect(enviada.status, `mensagem ${i}`).toBe(201);
    }
    const bloqueada = await enviar(ana, 31);

    expect(bloqueada.status).toBe(429);
    expect(bloqueada.texto).toBe(MUITAS_REQUISICOES);
    const retryAfter = Number(bloqueada.cabecalhos['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);

    // A chave é o contaId: o Bruno, no mesmo IP e na mesma conversa, envia.
    expect((await enviar(bruno, 1)).status).toBe(201);
    // `leitura` tem contador próprio: a Ana ainda lê a conversa, e a 31ª
    // mensagem não foi gravada.
    const lidas = await pedir(app(), 'GET', url, { token: ana.token });
    expect(lidas.status).toBe(200);
    const autores = (lidas.corpo as { autorId: string }[]).map(
      (m) => m.autorId,
    );
    expect(autores.filter((id) => id === ana.contaId)).toHaveLength(30);
  });
});

describe('CA20 — cada rota autenticada registrada consome o contador do próprio grupo', () => {
  it(
    'Dado uma conta nova que gastou o único pedido de um grupo, então cada rota autenticada dá 429 se, e só se, é daquele grupo',
    async () => {
      aplicacao = await montar({
        rateLimit: undefined,
        limitesPorConta: UM_POR_GRUPO,
      });
      const autenticadas = app().rotas.filter((rota) => !ehPublica(rota));
      // As 35 rotas autenticadas (28 até a L2 e 7 da V2b) e os HEAD
      // automáticos dos GET.
      expect(autenticadas.filter((r) => r.metodo !== 'HEAD')).toHaveLength(35);
      expect(autenticadas.some((r) => r.metodo === 'HEAD')).toBe(true);

      for (const rota of autenticadas) {
        const gruposDaRotaRegistrada = gruposDaRota(rota.metodo, rota.url);
        for (const grupo of GRUPOS) {
          const contexto = `${rota.metodo} ${rota.url} depois de gastar ${grupo}`;
          // Conta nova a cada par: contadores zerados.
          const usuario = await criarUsuarioSemPerfil();
          const sonda = await chamar(SONDA_DO_GRUPO[grupo], usuario);
          expect(sonda.status, `sonda de ${grupo}`).not.toBe(429);

          const resposta = await chamar(rota, usuario);
          if (gruposDaRotaRegistrada.includes(grupo)) {
            expect(resposta.status, contexto).toBe(429);
            expect(resposta.cabecalhos['retry-after'], contexto).toBe('60');
          } else {
            expect(resposta.status, contexto).not.toBe(429);
            expect(resposta.status, contexto).not.toBe(401);
          }
        }
      }
    },
    TEMPO_COM_HASH,
  );
});

describe('S1 (L1) — teto diário de mensagens por conta, somado aos 30/min', () => {
  const DIA_MS = 24 * 60 * 60_000;

  it(
    'Dado o teto diário esgotado, quando a conta envia mais uma, então 429 com retry-after da janela de 24 h; o 400 do schema e o 401 não gastam o teto, a outra conta segue e abrir conversa e editar o perfil não são afetados',
    async () => {
      aplicacao = await montar({
        rateLimit: undefined,
        limitesPorConta: {
          ...LIMITES_PADRAO_POR_CONTA,
          mensagens_dia: { max: 3, janelaMs: DIA_MS },
        },
      });
      const ana = await criarUsuario(app());
      const bruno = await criarUsuario(app());
      const trampoId = await publicarTrampo(app(), ana);
      expect((await candidatar(app(), bruno, trampoId)).status).toBe(201);
      const abrir = (de: Usuario, com: Usuario) =>
        pedir(app(), 'POST', '/conversas', {
          token: de.token,
          corpo: { outroUsuarioId: com.contaId },
        });
      const aberta = await abrir(bruno, ana);
      expect(aberta.status).toBe(201);
      const url = `/conversas/${(aberta.corpo as { conversaId: string }).conversaId}/mensagens`;
      const enviar = (usuario: Usuario, corpo: unknown) =>
        pedir(app(), 'POST', url, { token: usuario.token, corpo });

      for (let i = 0; i < 5; i++) {
        const invalida = await enviar(ana, { texto: 'oi', extra: 1 });
        expect(invalida.status, `corpo inválido ${i}`).toBe(400);
        const semToken = await pedir(app(), 'POST', url, {
          corpo: { texto: 'oi' },
        });
        expect(semToken.status, `sem token ${i}`).toBe(401);
      }
      for (let i = 1; i <= 3; i++) {
        const enviada = await enviar(ana, { texto: `Mensagem ${i}` });
        expect(enviada.status, `mensagem ${i}`).toBe(201);
      }
      const bloqueada = await enviar(ana, { texto: 'Mensagem 4' });

      expect(bloqueada.status).toBe(429);
      expect(bloqueada.texto).toBe(MUITAS_REQUISICOES);
      // Bem acima do minuto: é a janela de 24 h, aberta há poucos segundos.
      const retryAfter = Number(bloqueada.cabecalhos['retry-after']);
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThan(DIA_MS / 1000 - 60);
      expect(retryAfter).toBeLessThanOrEqual(DIA_MS / 1000);

      expect((await enviar(bruno, { texto: 'Oi, Ana' })).status).toBe(201);
      expect((await abrir(ana, bruno)).status).not.toBe(429);
      expect(
        (
          await pedir(app(), 'PUT', '/perfis/eu', {
            token: ana.token,
            corpo: {},
          })
        ).status,
      ).toBe(400);
      const lidas = await pedir(app(), 'GET', url, { token: ana.token });
      expect(lidas.status).toBe(200);
      const autores = (lidas.corpo as { autorId: string }[]).map(
        (m) => m.autorId,
      );
      expect(autores.filter((id) => id === ana.contaId)).toHaveLength(3);
    },
    TEMPO_COM_HASH,
  );
});

describe('CA20 — rotas públicas e desligamento', () => {
  it(
    'as rotas públicas ficam sem limite por conta, mesmo com um token válido no pedido, e não gastam o contador da conta',
    async () => {
      aplicacao = await montar({
        rateLimit: { max: 100, janelaMs: 60_000 },
        limitePorEmail: { max: 100, janelaMs: 60_000 },
        limitesPorConta: UM_POR_GRUPO,
      });
      const usuario = await criarUsuarioSemPerfil();

      for (let i = 0; i < 3; i++) {
        // Recusado pelo domínio (depois do `preHandler`), sem rodar o scrypt.
        const cadastro = await pedir(app(), 'POST', '/contas', {
          token: usuario.token,
          corpo: { email: 'sem-arroba', senha: 'senha-forte-123' },
        });
        expect(cadastro.status, `cadastro ${i}`).toBe(400);
        const entrada = await pedir(app(), 'POST', '/sessoes', {
          token: usuario.token,
          corpo: { email: usuario.email, senha: 'senha-errada-123' },
        });
        expect(entrada.status, `entrada ${i}`).toBe(401);
      }

      // O único pedido de `leitura` e o de `escrita` ainda estão livres.
      expect(
        (await pedir(app(), 'GET', '/categorias', { token: usuario.token }))
          .status,
      ).toBe(200);
      expect(
        (
          await pedir(app(), 'PUT', '/perfis/eu', {
            token: usuario.token,
            corpo: {},
          })
        ).status,
      ).not.toBe(429);
    },
    TEMPO_COM_HASH,
  );

  it.each([
    ['limitesPorConta: false', { limitesPorConta: false } as const],
    [
      'rateLimit: false (testes de QA)',
      { rateLimit: false, limitesPorConta: UM_POR_GRUPO } as const,
    ],
  ])(
    'com %s, nenhuma rota autenticada é limitada por conta',
    async (_, opcoes) => {
      aplicacao = await montar({ rateLimit: undefined, ...opcoes });
      const usuario = await criarUsuarioSemPerfil();

      for (let i = 0; i < 5; i++) {
        const categorias = await pedir(app(), 'GET', '/categorias', {
          token: usuario.token,
        });
        expect(categorias.status, `leitura ${i}`).toBe(200);
        const perfil = await pedir(app(), 'PUT', '/perfis/eu', {
          token: usuario.token,
          corpo: {},
        });
        expect(perfil.status, `escrita ${i}`).toBe(400);
        // Conversa inexistente: passa pelo `preHandler` e para no domínio.
        const mensagem = await pedir(
          app(),
          'POST',
          `/conversas/${randomUUID()}/mensagens`,
          { token: usuario.token, corpo: { texto: 'oi' } },
        );
        expect(mensagem.status, `mensagem ${i}`).toBe(404);
      }
    },
  );
});
