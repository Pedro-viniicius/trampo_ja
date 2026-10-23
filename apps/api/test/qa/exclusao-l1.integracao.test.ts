/**
 * QA da L1 — exclusão de conta (CA17, CA18, D25): concorrência com outras
 * ações, dupla exclusão, recadastro do mesmo e-mail, trampo `em_andamento`
 * sem a candidatura aceita e a senha em casos de borda.
 *
 * As contas são gravadas direto no banco com hash barato (veja `apoio-l1.ts`);
 * só o recadastro passa pelo cadastro e pelo scrypt de produção.
 */
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import { bancoDeTeste } from '../banco-teste.js';
import {
  candidatar,
  limparBanco,
  montar,
  pedir,
  publicarTrampo,
  SERVICO_VALIDO,
  TEMPO_COM_HASH,
} from './apoio.js';
import {
  abrirOutraSessao,
  criarUsuarioComSenha,
  esperar,
  excluir,
  linhasDe,
  NADA,
  SENHA_PADRAO,
  type UsuarioComSenha,
} from './apoio-l1.js';

let aplicacao: Aplicacao | undefined;

beforeEach(async () => {
  await limparBanco();
  aplicacao = await montar();
});

afterEach(async () => {
  await aplicacao?.fechar();
  aplicacao = undefined;
});

function app(): Aplicacao {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao;
}

async function contar(tabela: string): Promise<number> {
  const { rows } = await sql<{
    n: number;
  }>`select count(*)::int as n from ${sql.table(tabela)}`.execute(
    bancoDeTeste(),
  );
  return rows[0]?.n ?? -1;
}

/** Ana autora de um trampo; Bruno candidato dele (vínculo para conversar). */
async function parAnaBruno(): Promise<{
  ana: UsuarioComSenha;
  bruno: UsuarioComSenha;
  trampoId: string;
}> {
  const ana = await criarUsuarioComSenha(app());
  const bruno = await criarUsuarioComSenha(app());
  const trampoId = await publicarTrampo(app(), ana);
  expect((await candidatar(app(), bruno, trampoId)).status).toBe(201);
  return { ana, bruno, trampoId };
}

describe('CA17 — dupla exclusão', () => {
  it('Dado a conta já excluída, quando o mesmo pedido é repetido com o mesmo token ou o de outro aparelho, então 401 e nada é recriado', async () => {
    const { ana } = await parAnaBruno();
    const outroAparelho = await abrirOutraSessao(ana.contaId);

    expect((await excluir(app(), ana, ana.senha)).status).toBe(204);
    const repetida = await excluir(app(), ana, ana.senha);
    const doOutroAparelho = await excluir(
      app(),
      { ...ana, token: outroAparelho },
      ana.senha,
    );

    expect(repetida.status).toBe(401);
    expect(repetida.texto).toBe('{"erro":"nao_autenticado"}');
    expect(doOutroAparelho.status).toBe(401);
    expect(await linhasDe(ana.contaId)).toEqual(NADA);
  });

  it('Dado dois pedidos de exclusão simultâneos com a senha certa, então nenhum dá 500 e a conta some por inteiro', async () => {
    for (let i = 0; i < 6; i++) {
      const { ana } = await parAnaBruno();
      const outroAparelho = await abrirOutraSessao(ana.contaId);

      const [a, b] = await Promise.all([
        excluir(app(), ana, ana.senha),
        excluir(app(), { ...ana, token: outroAparelho }, ana.senha),
      ]);

      for (const resposta of [a, b]) {
        expect(
          [204, 401, 404],
          `rodada ${i}: ${resposta.status} ${resposta.texto}`,
        ).toContain(resposta.status);
      }
      expect([a.status, b.status], `rodada ${i}`).toContain(204);
      expect(await linhasDe(ana.contaId)).toEqual(NADA);
    }
  });

  it('Dado duas contas ligadas (candidaturas cruzadas e conversa) excluídas ao mesmo tempo, então nenhuma dá 500, nada trava e as tabelas ficam vazias', async () => {
    for (let i = 0; i < 8; i++) {
      await limparBanco();
      const { ana, bruno, trampoId } = await parAnaBruno();
      const trampoDoBruno = await publicarTrampo(app(), bruno);
      expect((await candidatar(app(), ana, trampoDoBruno)).status).toBe(201);
      const aberta = await pedir(app(), 'POST', '/conversas', {
        token: bruno.token,
        corpo: { outroUsuarioId: ana.contaId },
      });
      expect(aberta.status).toBe(201);
      const conversaId = (aberta.corpo as { conversaId: string }).conversaId;
      for (const autor of [ana, bruno]) {
        const enviada = await pedir(
          app(),
          'POST',
          `/conversas/${conversaId}/mensagens`,
          { token: autor.token, corpo: { texto: `Oi ${i}` } },
        );
        expect(enviada.status).toBe(201);
      }
      expect(trampoId).not.toBe(trampoDoBruno);

      const [a, b] = await Promise.all([
        excluir(app(), ana, ana.senha),
        excluir(app(), bruno, bruno.senha),
      ]);

      expect([a.status, b.status], `rodada ${i}`).toEqual([204, 204]);
      for (const tabela of [
        'contas',
        'sessoes',
        'perfis',
        'trampos',
        'candidaturas',
        'conversas',
        'mensagens',
      ]) {
        expect(await contar(tabela), `rodada ${i}: ${tabela}`).toBe(0);
      }
    }
  }, 30_000);
});

describe('CA17/CA18 — exclusão concorrente com ações do outro participante', () => {
  it('Dado o Bruno enviando mensagens enquanto a Ana exclui a conta, então cada envio dá 201 ou 404 (nunca 500) e nenhuma mensagem sobra', async () => {
    for (let i = 0; i < 6; i++) {
      const { ana, bruno } = await parAnaBruno();
      const aberta = await pedir(app(), 'POST', '/conversas', {
        token: bruno.token,
        corpo: { outroUsuarioId: ana.contaId },
      });
      const conversaId = (aberta.corpo as { conversaId: string }).conversaId;
      const enviar = async (n: number) => {
        await esperar(n);
        return pedir(app(), 'POST', `/conversas/${conversaId}/mensagens`, {
          token: bruno.token,
          corpo: { texto: `msg ${i}-${n}` },
        });
      };

      const [exclusao, ...envios] = await Promise.all([
        excluir(app(), ana, ana.senha),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map(enviar),
      ]);

      expect(exclusao.status, `rodada ${i}`).toBe(204);
      for (const envio of envios) {
        expect([201, 404], `rodada ${i}: ${envio.texto}`).toContain(
          envio.status,
        );
      }
      expect(await contar('mensagens'), `rodada ${i}`).toBe(0);
      expect(await contar('conversas'), `rodada ${i}`).toBe(0);
    }
  });

  it('Dado vários candidatos se candidatando ao trampo da Ana enquanto ela exclui a conta, então cada um dá 201 ou 404 (nunca 500) e nenhuma candidatura sobra', async () => {
    for (let i = 0; i < 5; i++) {
      const ana = await criarUsuarioComSenha(app());
      const trampoId = await publicarTrampo(app(), ana);
      const candidatos = await Promise.all(
        [0, 1, 2, 3, 4, 5].map(() => criarUsuarioComSenha(app())),
      );

      const [exclusao, ...respostas] = await Promise.all([
        excluir(app(), ana, ana.senha),
        ...candidatos.map(async (candidato, n) => {
          await esperar(n);
          return candidatar(app(), candidato, trampoId);
        }),
      ]);

      expect(exclusao.status, `rodada ${i}`).toBe(204);
      for (const resposta of respostas) {
        expect([201, 404], `rodada ${i}: ${resposta.texto}`).toContain(
          resposta.status,
        );
      }
      expect(await contar('candidaturas'), `rodada ${i}`).toBe(0);
      expect(await contar('trampos'), `rodada ${i}`).toBe(0);
    }
  });

  it('Dado o Bruno abrindo a conversa com a Ana enquanto ela exclui a conta, então o resultado é 201, 200, 403 ou 404 (nunca 500) e nenhuma conversa com a Ana sobra', async () => {
    const sobras: string[] = [];
    for (let i = 0; i < 12; i++) {
      const { ana, bruno } = await parAnaBruno();

      const [exclusao, abertura] = await Promise.all([
        excluir(app(), ana, ana.senha),
        (async () => {
          await esperar(i % 4);
          return pedir(app(), 'POST', '/conversas', {
            token: bruno.token,
            corpo: { outroUsuarioId: ana.contaId },
          });
        })(),
      ]);

      expect(exclusao.status, `rodada ${i}`).toBe(204);
      expect([200, 201, 403, 404], `rodada ${i}: ${abertura.texto}`).toContain(
        abertura.status,
      );
      if ((await linhasDe(ana.contaId)).conversas !== 0) {
        sobras.push(`rodada ${i} (abertura ${abertura.status})`);
      }
    }
    expect(sobras, 'conversas órfãs com a conta excluída').toEqual([]);
  });

  it('Dado exportação e exclusão da mesma conta ao mesmo tempo, então nenhuma dá 500 e a conta some', async () => {
    for (let i = 0; i < 5; i++) {
      const { ana } = await parAnaBruno();

      const [exportada, exclusao] = await Promise.all([
        pedir(app(), 'POST', '/contas/eu/exportacao', {
          token: ana.token,
          corpo: { senha: ana.senha },
        }),
        excluir(app(), ana, ana.senha),
      ]);

      expect([200, 401, 404], `rodada ${i}: ${exportada.texto}`).toContain(
        exportada.status,
      );
      expect(exclusao.status, `rodada ${i}`).toBe(204);
      expect(await linhasDe(ana.contaId)).toEqual(NADA);
    }
  });
});

describe('CA17 — conta com muito volume', () => {
  it('Dado 30 trampos com 4 candidaturas cada, 10 serviços e 4 conversas com 25 mensagens de cada lado, então a exclusão apaga tudo numa vez e os outros ficam intactos', async () => {
    const ana = await criarUsuarioComSenha(app());
    const outros = await Promise.all(
      Array.from({ length: 4 }, () => criarUsuarioComSenha(app())),
    );
    for (let i = 0; i < 30; i++) {
      const trampoId = await publicarTrampo(app(), ana);
      for (const outro of outros) {
        expect((await candidatar(app(), outro, trampoId)).status).toBe(201);
      }
    }
    for (let i = 0; i < 10; i++) {
      expect(
        (
          await pedir(app(), 'POST', '/servicos', {
            token: ana.token,
            corpo: { ...SERVICO_VALIDO, titulo: `Serviço ${i} da Ana` },
          })
        ).status,
      ).toBe(201);
    }
    const conversas: string[] = [];
    for (const outro of outros) {
      const aberta = await pedir(app(), 'POST', '/conversas', {
        token: outro.token,
        corpo: { outroUsuarioId: ana.contaId },
      });
      const id = (aberta.corpo as { conversaId: string }).conversaId;
      conversas.push(id);
      for (let i = 0; i < 25; i++) {
        for (const autor of [ana, outro]) {
          const enviada = await pedir(
            app(),
            'POST',
            `/conversas/${id}/mensagens`,
            { token: autor.token, corpo: { texto: `m${i}` } },
          );
          expect(enviada.status).toBe(201);
        }
      }
    }
    const antesDosOutros = await Promise.all(
      outros.map((o) => linhasDe(o.contaId)),
    );

    const resposta = await excluir(app(), ana, ana.senha);

    expect(resposta.status, resposta.texto).toBe(204);
    expect(await linhasDe(ana.contaId)).toEqual(NADA);
    expect(await contar('mensagens')).toBe(0);
    expect(await contar('conversas')).toBe(0);
    expect(await contar('candidaturas')).toBe(0);
    for (const [i, outro] of outros.entries()) {
      const depois = await linhasDe(outro.contaId);
      expect(depois, `outro ${i}`).toEqual({
        ...(antesDosOutros[i] ?? {}),
        candidaturas: 0,
        conversas: 0,
        mensagens: 0,
      });
      expect(
        (await pedir(app(), 'GET', '/perfis/eu', { token: outro.token }))
          .status,
      ).toBe(200);
    }
  }, 60_000);
});

describe('CA18 — trampo em_andamento cuja candidatura aceita foi apagada (D25)', () => {
  it('Dado a candidata aceita excluindo a conta, então o autor segue vendo o trampo (em_andamento, sem candidaturas), a busca o omite e nenhuma rota dá 500', async () => {
    const bruno = await criarUsuarioComSenha(app());
    const ana = await criarUsuarioComSenha(app());
    const carla = await criarUsuarioComSenha(app());
    const trampoId = await publicarTrampo(app(), bruno);
    const candidaturaDaAna = (
      (await candidatar(app(), ana, trampoId)).corpo as { id: string }
    ).id;
    expect((await candidatar(app(), carla, trampoId)).status).toBe(201);
    const aceite = await pedir(
      app(),
      'POST',
      `/trampos/${trampoId}/candidaturas/${candidaturaDaAna}/aceitar`,
      { token: bruno.token },
    );
    expect(aceite.status, aceite.texto).toBe(200);
    expect((await excluir(app(), ana, ana.senha)).status).toBe(204);

    const detalhe = await pedir(app(), 'GET', `/trampos/${trampoId}`, {
      token: bruno.token,
    });
    expect(detalhe.status).toBe(200);
    expect(detalhe.corpo).toMatchObject({
      id: trampoId,
      status: 'em_andamento',
    });
    const meus = await pedir(app(), 'GET', '/trampos/meus', {
      token: bruno.token,
    });
    expect(meus.status).toBe(200);
    expect(
      (meus.corpo as { id: string; status: string }[]).map((t) => [
        t.id,
        t.status,
      ]),
    ).toEqual([[trampoId, 'em_andamento']]);
    const recebidas = await pedir(
      app(),
      'GET',
      `/trampos/${trampoId}/candidaturas`,
      { token: bruno.token },
    );
    expect(recebidas.status).toBe(200);
    // A da Carla (recusada pelo aceite) segue; a da Ana, aceita, sumiu.
    expect(
      (recebidas.corpo as { status: string }[]).map((c) => c.status),
    ).toEqual(['recusada']);
    const busca = await pedir(app(), 'GET', '/busca', { token: bruno.token });
    expect(busca.status).toBe(200);
    expect((busca.corpo as { itens: unknown[] }).itens).toEqual([]);

    // Repetir o aceite da candidatura apagada: erro de cliente, não 500.
    const repetido = await pedir(
      app(),
      'POST',
      `/trampos/${trampoId}/candidaturas/${candidaturaDaAna}/aceitar`,
      { token: bruno.token },
    );
    expect(repetido.status).toBeGreaterThanOrEqual(400);
    expect(repetido.status).toBeLessThan(500);
    // Outra pessoa não consegue entrar num trampo que já está em andamento.
    const dora = await criarUsuarioComSenha(app());
    const tardia = await candidatar(app(), dora, trampoId);
    expect(tardia.status).toBeGreaterThanOrEqual(400);
    expect(tardia.status).toBeLessThan(500);
    // O vínculo com a Ana foi com a conta apagada: abrir conversa não dá 500.
    const conversa = await pedir(app(), 'POST', '/conversas', {
      token: bruno.token,
      corpo: { outroUsuarioId: ana.contaId },
    });
    expect(conversa.status).toBeGreaterThanOrEqual(400);
    expect(conversa.status).toBeLessThan(500);
  });
});

describe('CA17 — recadastro do mesmo e-mail', () => {
  it(
    'Dado a conta excluída, quando o e-mail se cadastra de novo (com outra caixa e espaços), então o token antigo continua 401 e a conta nova tem outro id',
    async () => {
      const email = `recadastro-${randomUUID()}@exemplo.test`;
      const primeiro = await pedir(app(), 'POST', '/contas', {
        corpo: { email, senha: SENHA_PADRAO },
      });
      expect(primeiro.status).toBe(201);
      const tokenAntigo = (primeiro.corpo as { token: string }).token;
      const duplicado = await pedir(app(), 'POST', '/contas', {
        corpo: { email: `  ${email.toUpperCase()} `, senha: SENHA_PADRAO },
      });
      expect(duplicado.status).toBe(409);
      expect(
        (await excluir(app(), { token: tokenAntigo } as never, SENHA_PADRAO))
          .status,
      ).toBe(204);

      const segundo = await pedir(app(), 'POST', '/contas', {
        corpo: { email: `  ${email.toUpperCase()} `, senha: 'outra-senha-456' },
      });
      expect(segundo.status, segundo.texto).toBe(201);
      const tokenNovo = (segundo.corpo as { token: string }).token;

      expect(
        (await pedir(app(), 'GET', '/perfis/eu', { token: tokenAntigo }))
          .status,
      ).toBe(401);
      // A senha antiga não abre a conta nova; a nova sim.
      const antiga = await pedir(app(), 'POST', '/sessoes', {
        corpo: { email, senha: SENHA_PADRAO },
      });
      expect(antiga.status).toBe(401);
      const nova = await pedir(app(), 'POST', '/sessoes', {
        corpo: { email, senha: 'outra-senha-456' },
      });
      expect(nova.status).toBe(200);
      const exportada = await pedir(app(), 'POST', '/contas/eu/exportacao', {
        token: tokenNovo,
        corpo: { senha: 'outra-senha-456' },
      });
      expect(exportada.status).toBe(200);
      expect(
        (exportada.corpo as { conta: { email: string } }).conta.email,
      ).toBe(email);
    },
    TEMPO_COM_HASH,
  );
});

describe('CA17 — a senha em casos de borda (nada muda sem a senha certa)', () => {
  const SENHA_COM_EMOJI = '😀'.repeat(128);

  it('Dado uma senha de 128 pontos de código (emoji), então a exclusão confere e dá 204; com 129, 403 e a conta fica', async () => {
    const longa = await criarUsuarioComSenha(app(), SENHA_COM_EMOJI);
    const demais = await excluir(app(), longa, `${SENHA_COM_EMOJI}😀`);
    expect(demais.status).toBe(403);
    expect(demais.texto).toBe('{"erro":"senha_incorreta"}');
    expect((await linhasDe(longa.contaId)).contas).toBe(1);

    expect((await excluir(app(), longa, SENHA_COM_EMOJI)).status).toBe(204);
    expect(await linhasDe(longa.contaId)).toEqual(NADA);
  });

  it.each([
    ['vazia', ''],
    ['só espaços', '        '],
    ['com espaço a mais no fim', `${SENHA_PADRAO} `],
    ['com outra caixa', SENHA_PADRAO.toUpperCase()],
    ['muito longa (10 mil caracteres)', 'x'.repeat(10_000)],
    ['nula', null],
  ])(
    'Dado a senha %s, então 403 senha_incorreta e nada muda',
    async (_, senha) => {
      const { ana } = await parAnaBruno();
      const antes = await linhasDe(ana.contaId);

      const resposta = await excluir(app(), ana, senha);

      expect(resposta.status).toBe(403);
      expect(resposta.texto).toBe('{"erro":"senha_incorreta"}');
      expect(await linhasDe(ana.contaId)).toEqual(antes);
    },
  );

  it.each([
    ['número', { senha: 12345678 }],
    ['lista', { senha: [SENHA_PADRAO] }],
    ['objeto', { senha: { valor: SENHA_PADRAO } }],
    [
      'com chave a mais, mesmo com a senha certa',
      { senha: SENHA_PADRAO, confirmar: true },
    ],
  ])(
    'Dado o corpo com senha %s, então 400, a resposta não repete a senha e nada muda',
    async (_, corpo) => {
      const { ana } = await parAnaBruno();
      const antes = await linhasDe(ana.contaId);

      const resposta = await pedir(app(), 'POST', '/contas/eu/exclusao', {
        token: ana.token,
        corpo,
      });

      expect(resposta.status).toBe(400);
      expect(resposta.texto).not.toContain(SENHA_PADRAO);
      expect(await linhasDe(ana.contaId)).toEqual(antes);
    },
  );

  it('Dado o pedido sem corpo ou com corpo que não é JSON, então 400 (sem apagar nada)', async () => {
    const { ana } = await parAnaBruno();
    const antes = await linhasDe(ana.contaId);

    const semCorpo = await pedir(app(), 'POST', '/contas/eu/exclusao', {
      token: ana.token,
    });
    const quebrado = await pedir(app(), 'POST', '/contas/eu/exclusao', {
      token: ana.token,
      corpoBruto: `{"senha": "${SENHA_PADRAO}"`,
    });
    const texto = await pedir(app(), 'POST', '/contas/eu/exclusao', {
      token: ana.token,
      corpoBruto: `senha=${SENHA_PADRAO}`,
      contentType: 'application/x-www-form-urlencoded',
    });

    expect(semCorpo.status).toBe(400);
    expect(quebrado.status).toBe(400);
    expect(quebrado.texto).not.toContain(SENHA_PADRAO);
    expect([400, 415]).toContain(texto.status);
    expect(texto.texto).not.toContain(SENHA_PADRAO);
    expect(await linhasDe(ana.contaId)).toEqual(antes);
  });

  it('Dado a senha na URL (query), então ela é ignorada: com corpo vazio, 403 e nada muda', async () => {
    const { ana } = await parAnaBruno();

    const resposta = await pedir(
      app(),
      'POST',
      `/contas/eu/exclusao?senha=${encodeURIComponent(ana.senha)}`,
      { token: ana.token, corpo: {} },
    );

    expect(resposta.status).toBe(403);
    expect((await linhasDe(ana.contaId)).contas).toBe(1);
  });

  it('Dado o token da Ana e a senha do Bruno, então 403 e as duas contas ficam intactas', async () => {
    const { ana, bruno } = await parAnaBruno();

    const resposta = await excluir(
      app(),
      ana,
      bruno.senha === ana.senha ? 'outra-senha-xyz-1' : bruno.senha,
    );

    expect(resposta.status).toBe(403);
    expect((await linhasDe(ana.contaId)).contas).toBe(1);
    expect((await linhasDe(bruno.contaId)).contas).toBe(1);
  });

  it('Dado o pedido sem sessão ou com token falso, então 401 antes de olhar o corpo', async () => {
    const semToken = await pedir(app(), 'POST', '/contas/eu/exclusao', {
      corpo: { senha: SENHA_PADRAO },
    });
    const falso = await pedir(app(), 'POST', '/contas/eu/exclusao', {
      token: createHash('sha256').update('x').digest('base64url'),
      corpo: { senha: SENHA_PADRAO },
    });
    const semSessaoEmExportacao = await pedir(
      app(),
      'POST',
      '/contas/eu/exportacao',
      { corpo: { senha: SENHA_PADRAO } },
    );

    expect(semToken.status).toBe(401);
    expect(falso.status).toBe(401);
    expect(semSessaoEmExportacao.status).toBe(401);
  });
});
