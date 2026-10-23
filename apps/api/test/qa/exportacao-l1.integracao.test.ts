/**
 * QA da L1 — exportação (CA19, D26): conta vazia, conta completa, campos
 * opcionais nulos, texto estranho, conversas longas, repetição e cabeçalhos.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import {
  candidatar,
  limparBanco,
  montar,
  ofertarServico,
  pedir,
  publicarTrampo,
  relogioQueAvanca,
} from './apoio.js';
import {
  criarUsuarioComSenha,
  criarUsuarioComSenhaSemPerfil,
  exportar,
  SENHA_PADRAO,
  type UsuarioComSenha,
} from './apoio-l1.js';

let aplicacao: Aplicacao | undefined;

beforeEach(async () => {
  await limparBanco();
  aplicacao = await montar({ relogio: relogioQueAvanca(1000) });
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

const DATA_ISO = expect.stringMatching(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
);

async function enviar(
  quem: UsuarioComSenha,
  conversaId: string,
  texto: string,
): Promise<string> {
  const r = await pedir(app(), 'POST', `/conversas/${conversaId}/mensagens`, {
    token: quem.token,
    corpo: { texto },
  });
  expect(r.status, r.texto).toBe(201);
  return (r.corpo as { id: string }).id;
}

/** Cria o vínculo (candidatura do `de` no trampo do `para`) e abre a conversa. */
async function abrirConversa(
  de: UsuarioComSenha,
  para: UsuarioComSenha,
): Promise<string> {
  const trampoId = await publicarTrampo(app(), para);
  expect((await candidatar(app(), de, trampoId)).status).toBe(201);
  const r = await pedir(app(), 'POST', '/conversas', {
    token: de.token,
    corpo: { outroUsuarioId: para.contaId },
  });
  expect(r.status, r.texto).toBe(201);
  return (r.corpo as { conversaId: string }).conversaId;
}

describe('CA19 — conta sem nada e campos opcionais', () => {
  it('Dado uma conta só com sessão, então o JSON tem o formato v1 exato, com perfil nulo e listas vazias', async () => {
    const vazia = await criarUsuarioComSenhaSemPerfil();

    const resposta = await exportar(app(), vazia, vazia.senha);

    expect(resposta.status, resposta.texto).toBe(200);
    expect(resposta.corpo).toStrictEqual({
      formato: 'trampo-ja.exportacao.v1',
      geradoEm: DATA_ISO,
      conta: { id: vazia.contaId, email: vazia.email, criadaEm: DATA_ISO },
      sessoes: [{ criadaEm: DATA_ISO, expiraEm: DATA_ISO }],
      perfil: null,
      trampos: [],
      servicos: [],
      candidaturas: [],
      conversas: [],
    });
  });

  it('Dado perfil sem descrição, trampo sem prazo e serviço sem cidade, então saem como null, sem quebrar o schema fechado', async () => {
    const ana = await criarUsuarioComSenha(app(), SENHA_PADRAO, {
      nome: 'Ana Sem Descrição',
      cidade: 'Lavras',
      habilidades: ['pintura'],
    });
    const trampoId = await publicarTrampo(app(), ana);
    const servicoId = await ofertarServico(app(), ana, { cidade: undefined });

    const resposta = await exportar(app(), ana, ana.senha);

    expect(resposta.status, resposta.texto).toBe(200);
    const corpo = resposta.corpo as {
      perfil: { descricao: string | null };
      trampos: { id: string; prazo: string | null }[];
      servicos: { id: string; cidade: string | null }[];
    };
    expect(corpo.perfil.descricao).toBeNull();
    expect(corpo.trampos).toMatchObject([{ id: trampoId, prazo: null }]);
    expect(corpo.servicos).toMatchObject([{ id: servicoId, cidade: null }]);
  });

  it('Dado trampo em andamento com candidaturas aceita, recusada e pendente, então status e contagem saem certos e o texto dos candidatos fica de fora', async () => {
    const bruno = await criarUsuarioComSenha(app());
    const ana = await criarUsuarioComSenha(app());
    const carla = await criarUsuarioComSenha(app());
    const trampoId = await publicarTrampo(app(), bruno);
    const idAna = (
      (await candidatar(app(), ana, trampoId, { mensagem: 'MsgDaAnaXyz' }))
        .corpo as { id: string }
    ).id;
    await candidatar(app(), carla, trampoId, { mensagem: 'MsgDaCarlaXyz' });
    const aceite = await pedir(
      app(),
      'POST',
      `/trampos/${trampoId}/candidaturas/${idAna}/aceitar`,
      { token: bruno.token },
    );
    expect(aceite.status, aceite.texto).toBe(200);

    const doBruno = await exportar(app(), bruno, bruno.senha);
    const daAna = await exportar(app(), ana, ana.senha);
    const daCarla = await exportar(app(), carla, carla.senha);

    expect(doBruno.corpo).toMatchObject({
      trampos: [
        { id: trampoId, status: 'em_andamento', candidaturasRecebidas: 2 },
      ],
      candidaturas: [],
    });
    expect(doBruno.texto).not.toContain('MsgDaAnaXyz');
    expect(doBruno.texto).not.toContain('MsgDaCarlaXyz');
    expect(daAna.corpo).toMatchObject({
      candidaturas: [{ id: idAna, status: 'aceita', mensagem: 'MsgDaAnaXyz' }],
    });
    expect(daAna.texto).not.toContain('MsgDaCarlaXyz');
    expect(daCarla.corpo).toMatchObject({
      candidaturas: [{ status: 'recusada', mensagem: 'MsgDaCarlaXyz' }],
    });
  });
});

describe('CA19 — conversas, texto estranho e tamanho', () => {
  it('Dado mensagens com emoji, aspas, quebra de linha e separadores Unicode, então o texto volta idêntico', async () => {
    const ana = await criarUsuarioComSenha(app());
    const bruno = await criarUsuarioComSenha(app());
    const conversaId = await abrirConversa(ana, bruno);
    const textos = [
      'Olá 👩🏽‍🔧 "aspas" e \'simples\'',
      'linha 1\nlinha 2\r\nlinha 3\ttab',
      'separador   e   e </script><b>x</b>',
      'barra \\ invertida e {"json": "dentro"}',
      'ç'.repeat(1000),
    ];
    for (const texto of textos) {
      await enviar(ana, conversaId, texto);
    }

    const resposta = await exportar(app(), ana, ana.senha);

    const conversas = (
      resposta.corpo as {
        conversas: { minhasMensagens: { texto: string }[] }[];
      }
    ).conversas;
    expect(conversas[0]?.minhasMensagens.map((m) => m.texto)).toEqual(
      textos.map((t) => t.trim()),
    );
  });

  it('Dado 120 mensagens minhas intercaladas com 120 do outro, então saem só as minhas, em ordem de envio', async () => {
    const ana = await criarUsuarioComSenha(app());
    const bruno = await criarUsuarioComSenha(app());
    const conversaId = await abrirConversa(ana, bruno);
    const minhas: string[] = [];
    for (let i = 0; i < 120; i++) {
      minhas.push(await enviar(ana, conversaId, `da-ana-${i}`));
      await enviar(bruno, conversaId, `do-bruno-${i}`);
    }

    const resposta = await exportar(app(), ana, ana.senha);

    expect(resposta.status).toBe(200);
    const mensagens = (
      resposta.corpo as {
        conversas: { minhasMensagens: { id: string; texto: string }[] }[];
      }
    ).conversas[0]?.minhasMensagens;
    expect(mensagens?.map((m) => m.id)).toEqual(minhas);
    expect(resposta.texto).not.toContain('do-bruno-');
  });

  it('Dado duas conversas, então saem da mais antiga para a mais nova, cada uma com o id do outro e nada além', async () => {
    const ana = await criarUsuarioComSenha(app());
    const bruno = await criarUsuarioComSenha(app(), SENHA_PADRAO, {
      nome: 'NomeDoBrunoQxz',
      cidade: 'Lavras',
      habilidades: ['eletrica'],
    });
    const carla = await criarUsuarioComSenha(app());
    const primeira = await abrirConversa(ana, bruno);
    const segunda = await abrirConversa(carla, ana);

    const resposta = await exportar(app(), ana, ana.senha);

    expect(resposta.corpo).toMatchObject({
      conversas: [
        { id: primeira, outroUsuarioId: bruno.contaId, minhasMensagens: [] },
        { id: segunda, outroUsuarioId: carla.contaId, minhasMensagens: [] },
      ],
    });
    expect(resposta.texto).not.toContain('NomeDoBrunoQxz');
    expect(resposta.texto).not.toContain(bruno.email);
  });
});

describe('CA19/CA24 — repetição, segredos e cabeçalhos', () => {
  it('Dado duas exportações seguidas, então o conteúdo é o mesmo (só geradoEm muda) e as sessões não crescem', async () => {
    const ana = await criarUsuarioComSenha(app());
    await publicarTrampo(app(), ana);

    const a = await exportar(app(), ana, ana.senha);
    const b = await exportar(app(), ana, ana.senha);

    const semData = (r: { corpo: unknown }) => ({
      ...(r.corpo as Record<string, unknown>),
      geradoEm: 'x',
    });
    expect(semData(b)).toEqual(semData(a));
    expect((b.corpo as { sessoes: unknown[] }).sessoes).toHaveLength(1);
  });

  it('Dado a exportação completa, então não há hash de senha, token, hash de token nem colunas derivadas no texto', async () => {
    const ana = await criarUsuarioComSenha(app());
    await publicarTrampo(app(), ana);
    await ofertarServico(app(), ana);

    const resposta = await exportar(app(), ana, ana.senha);

    const sha = createHash('sha256').update(ana.token, 'utf8').digest('hex');
    for (const proibido of [
      ana.token,
      sha,
      'scrypt$',
      'senha_hash',
      'token_hash',
      'cidade_normalizada',
      'texto_busca',
      'versao',
      SENHA_PADRAO,
    ]) {
      expect(resposta.texto, proibido).not.toContain(proibido);
    }
  });

  it.each([
    ['200', 200, async (a: UsuarioComSenha) => exportar(app(), a, a.senha)],
    [
      '403',
      403,
      async (a: UsuarioComSenha) => exportar(app(), a, 'errada-123456'),
    ],
    [
      '400',
      400,
      async (a: UsuarioComSenha) =>
        pedir(app(), 'POST', '/contas/eu/exportacao', {
          token: a.token,
          corpo: { senha: a.senha, extra: 1 },
        }),
    ],
    [
      '401',
      401,
      async () =>
        pedir(app(), 'POST', '/contas/eu/exportacao', {
          corpo: { senha: SENHA_PADRAO },
        }),
    ],
  ])(
    'a resposta %s das duas rotas com senha leva Cache-Control: no-store',
    async (_, status, chamar) => {
      const ana = await criarUsuarioComSenha(app());

      const resposta = await chamar(ana);

      expect(resposta.status).toBe(status);
      expect(resposta.cabecalhos['cache-control']).toBe('no-store');
      const exclusao400 = await pedir(app(), 'POST', '/contas/eu/exclusao', {
        token: ana.token,
        corpo: { senha: ana.senha, extra: 1 },
      });
      expect(exclusao400.status).toBe(400);
      expect(exclusao400.cabecalhos['cache-control']).toBe('no-store');
    },
  );

  it('a exportação só serve a própria conta: o token do Bruno nunca devolve o e-mail da Ana', async () => {
    const ana = await criarUsuarioComSenha(app());
    const bruno = await criarUsuarioComSenha(app(), 'senha-do-bruno-999');

    const comSenhaDaAna = await exportar(app(), bruno, ana.senha);
    const dele = await exportar(app(), bruno, bruno.senha);

    expect(comSenhaDaAna.status).toBe(403);
    expect(comSenhaDaAna.texto).not.toContain(ana.email);
    expect(dele.texto).toContain(bruno.email);
    expect(dele.texto).not.toContain(ana.email);
  });
});
