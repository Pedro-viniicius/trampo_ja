/**
 * QA — CA3 a CA6, D7, D9 e D10 pela API montada: bordas de tamanho e unicode,
 * valores fora do `integer`, caracteres que o Postgres não guarda, campos que
 * o cliente não pode escolher (autor, status) e perfil público.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import {
  criarUsuario,
  criarUsuarioSemPerfil,
  limparBanco,
  montar,
  ofertarServico,
  PERFIL_VALIDO,
  pedir,
  publicarTrampo,
  relogioQueAvanca,
  SERVICO_VALIDO,
  TRAMPO_VALIDO,
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

function campos(r: { corpo: unknown }): { campo: string; motivo: string }[] {
  return (r.corpo as { campos: { campo: string; motivo: string }[] }).campos;
}

describe('CA3 e D10 — perfil', () => {
  it('perfil público: só contaId, nome, cidade, descricao e habilidades, nunca e-mail', async () => {
    const dono = await criarUsuario(app);
    const outro = await criarUsuario(app);

    const r = await pedir(app, 'GET', `/perfis/${dono.contaId}`, {
      token: outro.token,
    });
    expect(r.status).toBe(200);
    expect(Object.keys(r.corpo as object).sort()).toEqual([
      'cidade',
      'contaId',
      'descricao',
      'habilidades',
      'nome',
    ]);
    expect(r.texto).not.toContain(dono.email);
    expect(r.texto).not.toContain('@');
  });

  it('perfil público de conta sem perfil e de id inválido: 404 igual, sem 400 nem 500', async () => {
    const semPerfil = await criarUsuarioSemPerfil();
    const leitor = await criarUsuario(app);

    for (const id of [
      semPerfil.contaId,
      '00000000-0000-4000-8000-000000000000',
      'nao-e-uuid',
      '12345',
    ]) {
      const r = await pedir(app, 'GET', `/perfis/${id}`, {
        token: leitor.token,
      });
      expect(r.status, id).toBe(404);
      expect(r.texto).toBe('{"erro":"nao_encontrado"}');
    }
  });

  it('id da conta em maiúsculas acha o mesmo perfil público', async () => {
    const dono = await criarUsuario(app);
    const r = await pedir(app, 'GET', `/perfis/${dono.contaId.toUpperCase()}`, {
      token: dono.token,
    });
    expect(r.status).toBe(200);
    expect((r.corpo as { contaId: string }).contaId).toBe(dono.contaId);
  });

  it('GET /perfis/eu sem perfil salvo é 404; depois do PUT, 200 com completo true', async () => {
    const u = await criarUsuarioSemPerfil();
    expect(
      (await pedir(app, 'GET', '/perfis/eu', { token: u.token })).status,
    ).toBe(404);
    const salvo = await pedir(app, 'PUT', '/perfis/eu', {
      token: u.token,
      corpo: PERFIL_VALIDO,
    });
    expect(salvo.status).toBe(200);
    expect(salvo.corpo).toEqual({ ...PERFIL_VALIDO, completo: true });
  });

  it('PUT repetido substitui o perfil inteiro (idempotente) e descrição omitida volta como null', async () => {
    const u = await criarUsuarioSemPerfil();
    const primeiro = await pedir(app, 'PUT', '/perfis/eu', {
      token: u.token,
      corpo: PERFIL_VALIDO,
    });
    expect(primeiro.status).toBe(200);
    const corpo = {
      nome: 'Novo Nome',
      cidade: 'Ijaci',
      habilidades: ['eletrica'],
    };
    for (let i = 0; i < 2; i++) {
      const r = await pedir(app, 'PUT', '/perfis/eu', {
        token: u.token,
        corpo,
      });
      expect(r.status).toBe(200);
      expect(r.corpo).toEqual({ ...corpo, descricao: null, completo: true });
    }
  });

  it('o corpo não escolhe a conta: contaId, email e chaves extras dão 400 e nada é gravado', async () => {
    const u = await criarUsuarioSemPerfil();
    const vitima = await criarUsuario(app);
    for (const extra of [
      { contaId: vitima.contaId },
      { email: 'alguem@exemplo.test' },
      { completo: false },
    ]) {
      const r = await pedir(app, 'PUT', '/perfis/eu', {
        token: u.token,
        corpo: { ...PERFIL_VALIDO, ...extra },
      });
      expect(r.status, JSON.stringify(Object.keys(extra))).toBe(400);
    }
    const perfilDaVitima = await pedir(app, 'GET', '/perfis/eu', {
      token: vitima.token,
    });
    expect((perfilDaVitima.corpo as { nome: string }).nome).toBe(
      PERFIL_VALIDO.nome,
    );
    expect(
      (await pedir(app, 'GET', '/perfis/eu', { token: u.token })).status,
    ).toBe(404);
  });

  it('CA3 — nome sem habilidade, habilidades vazia, 11 habilidades e habilidade repetida são recusados apontando o campo', async () => {
    const u = await criarUsuarioSemPerfil();
    const casos: [Record<string, unknown>, string][] = [
      [{ habilidades: [] }, 'habilidades'],
      [{ habilidades: null }, 'habilidades'],
      [
        { habilidades: Array.from({ length: 11 }, (_, i) => `hab${i}x`) },
        'habilidades',
      ],
      [{ habilidades: ['Pintura', ' pintura '] }, 'habilidades.1'],
      [{ habilidades: ['a'] }, 'habilidades.0'],
      [{ nome: 'A' }, 'nome'],
      [{ cidade: '   ' }, 'cidade'],
    ];
    for (const [alteracao, campoEsperado] of casos) {
      const r = await pedir(app, 'PUT', '/perfis/eu', {
        token: u.token,
        corpo: { ...PERFIL_VALIDO, ...alteracao },
      });
      expect(r.status, campoEsperado).toBe(400);
      expect(campos(r).map((c) => c.campo)).toContain(campoEsperado);
    }
    // Nenhuma das tentativas deixou perfil gravado.
    expect(
      (await pedir(app, 'GET', '/perfis/eu', { token: u.token })).status,
    ).toBe(404);
  });

  it('nome de 80 caracteres acentuados passa; 81 não', async () => {
    const u = await criarUsuarioSemPerfil();
    const ok = await pedir(app, 'PUT', '/perfis/eu', {
      token: u.token,
      corpo: { ...PERFIL_VALIDO, nome: 'ã'.repeat(80) },
    });
    expect(ok.status).toBe(200);
    const demais = await pedir(app, 'PUT', '/perfis/eu', {
      token: u.token,
      corpo: { ...PERFIL_VALIDO, nome: 'ã'.repeat(81) },
    });
    expect(demais.status).toBe(400);
    expect(campos(demais)).toEqual([{ campo: 'nome', motivo: 'tamanho' }]);
  });

  it('caractere nulo (\\u0000) no perfil é recusado com 400, não vira 500 do Postgres', async () => {
    const u = await criarUsuarioSemPerfil();
    for (const alteracao of [
      { nome: 'Fulano\u0000Silva' },
      { cidade: 'Lav\u0000ras' },
      { descricao: 'texto\u0000' },
      { habilidades: ['pin\u0000tura'] },
    ]) {
      const r = await pedir(app, 'PUT', '/perfis/eu', {
        token: u.token,
        corpo: { ...PERFIL_VALIDO, ...alteracao },
      });
      expect(r.status, JSON.stringify(Object.keys(alteracao))).toBe(400);
    }
  });
});

describe('CA4 e CA5 — trampo', () => {
  it('título de 80 caracteres acentuados passa, com emoji também (conta pontos de código); 81 e 4 não', async () => {
    const autor = await criarUsuario(app);
    for (const titulo of ['ç'.repeat(80), '😀'.repeat(80), '  abcde  ']) {
      const r = await pedir(app, 'POST', '/trampos', {
        token: autor.token,
        corpo: { ...TRAMPO_VALIDO, titulo },
      });
      expect(r.status, titulo.slice(0, 10)).toBe(201);
    }
    for (const titulo of ['ç'.repeat(81), '😀'.repeat(81), 'abcd', ' abcd ']) {
      const r = await pedir(app, 'POST', '/trampos', {
        token: autor.token,
        corpo: { ...TRAMPO_VALIDO, titulo },
      });
      expect(r.status, titulo.slice(0, 10)).toBe(400);
      expect(campos(r)).toEqual([{ campo: 'titulo', motivo: 'tamanho' }]);
    }
  });

  it('CA5 — sem título, categoria e cidade a resposta aponta os três campos de uma vez', async () => {
    const autor = await criarUsuario(app);
    const r = await pedir(app, 'POST', '/trampos', {
      token: autor.token,
      corpo: { descricao: 'x', valorCentavos: 100 },
    });
    expect(r.status).toBe(400);
    expect(campos(r)).toEqual([
      { campo: 'titulo', motivo: 'obrigatorio' },
      { campo: 'categoria', motivo: 'obrigatorio' },
      { campo: 'cidade', motivo: 'obrigatorio' },
    ]);
  });

  it('CA5 — valor zero, negativo, fracionário, texto, notação científica fora do inteiro e acima do integer: 400 em valorCentavos', async () => {
    const autor = await criarUsuario(app);
    for (const valor of [
      0,
      -1,
      -0.5,
      0.5,
      1.5,
      '100',
      2_147_483_648,
      1e21,
      [],
      {},
    ]) {
      const r = await pedir(app, 'POST', '/trampos', {
        token: autor.token,
        corpo: { ...TRAMPO_VALIDO, valorCentavos: valor },
      });
      expect(r.status, JSON.stringify(valor)).toBe(400);
      expect(campos(r).map((c) => c.campo)).toContain('valorCentavos');
    }
    for (const valor of [1, 2_147_483_647]) {
      const r = await pedir(app, 'POST', '/trampos', {
        token: autor.token,
        corpo: { ...TRAMPO_VALIDO, valorCentavos: valor },
      });
      expect(r.status, String(valor)).toBe(201);
    }
  });

  it('valor 1e2 no JSON (inteiro 100) e 100.0 são aceitos como 100 centavos', async () => {
    const autor = await criarUsuario(app);
    for (const bruto of ['1e2', '100.0']) {
      const r = await pedir(app, 'POST', '/trampos', {
        token: autor.token,
        corpoBruto: JSON.stringify(TRAMPO_VALIDO).replace('35000', bruto),
      });
      expect(r.status, bruto).toBe(201);
      const detalhe = await pedir(
        app,
        'GET',
        `/trampos/${(r.corpo as { id: string }).id}`,
        { token: autor.token },
      );
      expect((detalhe.corpo as { valorCentavos: number }).valorCentavos).toBe(
        100,
      );
    }
  });

  it('prazo: data válida é guardada; formato errado, data impossível e tipo errado dão 400 em prazo', async () => {
    const autor = await criarUsuario(app);
    const ok = await pedir(app, 'POST', '/trampos', {
      token: autor.token,
      corpo: { ...TRAMPO_VALIDO, prazo: '2030-02-28' },
    });
    expect(ok.status).toBe(201);
    const detalhe = await pedir(
      app,
      'GET',
      `/trampos/${(ok.corpo as { id: string }).id}`,
      { token: autor.token },
    );
    expect((detalhe.corpo as { prazo: string }).prazo).toBe('2030-02-28');

    for (const prazo of [
      '2030-02-30',
      '30/02/2030',
      '2030-2-3',
      '',
      20300228,
      '2030-13-01',
      '0000-01-01',
    ]) {
      const r = await pedir(app, 'POST', '/trampos', {
        token: autor.token,
        corpo: { ...TRAMPO_VALIDO, prazo },
      });
      expect(r.status, JSON.stringify(prazo)).toBe(400);
      expect(campos(r)).toEqual([{ campo: 'prazo', motivo: 'invalido' }]);
    }
  });

  it('o corpo não escolhe autor, status, id nem versão: chave extra dá 400 e nada é gravado; o trampo sai aberto e do usuário autenticado', async () => {
    const autor = await criarUsuario(app);
    const outro = await criarUsuario(app);
    for (const extra of [
      { autorId: outro.contaId },
      { autor_id: outro.contaId },
      { status: 'em_andamento' },
      { versao: 99 },
      { id: '11111111-1111-4111-8111-111111111111' },
    ]) {
      const recusado = await pedir(app, 'POST', '/trampos', {
        token: autor.token,
        corpo: { ...TRAMPO_VALIDO, ...extra },
      });
      expect(recusado.status, Object.keys(extra)[0]).toBe(400);
      expect((recusado.corpo as { erro: string }).erro).toBe('dados_invalidos');
    }
    for (const usuario of [autor, outro]) {
      const meus = await pedir(app, 'GET', '/trampos/meus', {
        token: usuario.token,
      });
      expect(meus.corpo).toEqual([]);
    }

    // Só com as chaves válidas: autor e status vêm da sessão e da regra.
    const r = await pedir(app, 'POST', '/trampos', {
      token: autor.token,
      corpo: TRAMPO_VALIDO,
    });
    expect(r.status).toBe(201);
    const id = (r.corpo as { id: string }).id;
    expect(id).not.toBe('11111111-1111-4111-8111-111111111111');
    const detalhe = await pedir(app, 'GET', `/trampos/${id}`, {
      token: outro.token,
    });
    expect(detalhe.corpo).toMatchObject({
      autorId: autor.contaId,
      status: 'aberto',
    });
    const meusDoOutro = await pedir(app, 'GET', '/trampos/meus', {
      token: outro.token,
    });
    expect(meusDoOutro.corpo).toEqual([]);
  });

  it('caractere nulo (\\u0000) em título, descrição e cidade é recusado com 400, não vira 500', async () => {
    const autor = await criarUsuario(app);
    for (const alteracao of [
      { titulo: 'Pintura\u0000muro' },
      { descricao: 'texto\u0000texto' },
      { cidade: 'Lav\u0000ras' },
    ]) {
      const r = await pedir(app, 'POST', '/trampos', {
        token: autor.token,
        corpo: { ...TRAMPO_VALIDO, ...alteracao },
      });
      expect(r.status, JSON.stringify(Object.keys(alteracao))).toBe(400);
    }
  });

  it('caractere nulo (\\u0000) na mensagem da candidatura é recusado com 400, não vira 500', async () => {
    const autor = await criarUsuario(app);
    const trampoId = await publicarTrampo(app, autor);
    const freela = await criarUsuario(app);
    const r = await pedir(app, 'POST', `/trampos/${trampoId}/candidaturas`, {
      token: freela.token,
      corpo: { mensagem: 'oi\u0000oi', valorPropostoCentavos: 100 },
    });
    expect(r.status).toBe(400);
  });

  it('D9 — perfil incompleto vence a validação: corpo inválido de quem não tem perfil recebe 409, não 400', async () => {
    const semPerfil = await criarUsuarioSemPerfil();
    const r = await pedir(app, 'POST', '/trampos', {
      token: semPerfil.token,
      corpo: {},
    });
    expect(r.status).toBe(409);
    expect(r.texto).toBe('{"erro":"perfil_incompleto"}');
    const s = await pedir(app, 'POST', '/servicos', {
      token: semPerfil.token,
      corpo: {},
    });
    expect(s.status).toBe(409);
    expect(s.texto).toBe('{"erro":"perfil_incompleto"}');
  });

  it('GET /trampos/meus lista só os do usuário, mais recentes primeiro', async () => {
    const rel = await montar({ relogio: relogioQueAvanca() });
    try {
      const a = await criarUsuario(rel);
      const b = await criarUsuario(rel);
      const primeiro = await publicarTrampo(rel, a);
      const segundo = await publicarTrampo(rel, a);
      await publicarTrampo(rel, b);
      const r = await pedir(rel, 'GET', '/trampos/meus', { token: a.token });
      expect((r.corpo as { id: string }[]).map((t) => t.id)).toEqual([
        segundo,
        primeiro,
      ]);
    } finally {
      await rel.fechar();
    }
  });
});

describe('CA6 e D7 — serviço', () => {
  it('serviço sem cidade (ausente, null ou em branco) é aceito e vem com cidade null', async () => {
    const freela = await criarUsuario(app);
    const { cidade: _cidade, ...semCidade } = SERVICO_VALIDO;
    for (const corpo of [
      semCidade,
      { ...semCidade, cidade: null },
      { ...semCidade, cidade: '   ' },
    ]) {
      const r = await pedir(app, 'POST', '/servicos', {
        token: freela.token,
        corpo,
      });
      expect(r.status, JSON.stringify(corpo)).toBe(201);
      expect(r.corpo).toEqual({ id: expect.any(String), status: 'ativo' });
      const detalhe = await pedir(
        app,
        'GET',
        `/servicos/${(r.corpo as { id: string }).id}`,
        { token: freela.token },
      );
      expect(detalhe.corpo).toMatchObject({ cidade: null });
    }
  });

  it('preço zero, negativo, fracionário, texto e acima do integer: 400 em precoBaseCentavos', async () => {
    const freela = await criarUsuario(app);
    for (const preco of [0, -1, 0.1, 1.5, '200', 2_147_483_648, 1e21]) {
      const r = await pedir(app, 'POST', '/servicos', {
        token: freela.token,
        corpo: { ...SERVICO_VALIDO, precoBaseCentavos: preco },
      });
      expect(r.status, JSON.stringify(preco)).toBe(400);
      expect(campos(r).map((c) => c.campo)).toContain('precoBaseCentavos');
    }
  });

  it('sem título, descrição, categoria ou preço: 400 apontando o campo', async () => {
    const freela = await criarUsuario(app);
    for (const campo of [
      'titulo',
      'descricao',
      'categoria',
      'precoBaseCentavos',
    ]) {
      const { [campo]: _removido, ...resto } = SERVICO_VALIDO as Record<
        string,
        unknown
      >;
      const r = await pedir(app, 'POST', '/servicos', {
        token: freela.token,
        corpo: resto,
      });
      expect(r.status, campo).toBe(400);
      expect(campos(r).map((c) => c.campo)).toContain(campo);
    }
  });

  it('título de serviço: 80 passa, 81 e 4 não; chave extra (autorId) dá 400', async () => {
    const freela = await criarUsuario(app);
    expect(
      (await ofertarServico(app, freela, { titulo: 'é'.repeat(80) })).length,
    ).toBeGreaterThan(0);
    for (const titulo of ['é'.repeat(81), 'abcd']) {
      const r = await pedir(app, 'POST', '/servicos', {
        token: freela.token,
        corpo: { ...SERVICO_VALIDO, titulo },
      });
      expect(r.status).toBe(400);
    }
    const extra = await pedir(app, 'POST', '/servicos', {
      token: freela.token,
      corpo: { ...SERVICO_VALIDO, autorId: freela.contaId },
    });
    expect(extra.status).toBe(400);
  });

  it('caractere nulo (\\u0000) no serviço é recusado com 400, não vira 500', async () => {
    const freela = await criarUsuario(app);
    for (const alteracao of [
      { titulo: 'Pintura\u0000casa' },
      { descricao: 'x\u0000y' },
      { cidade: 'La\u0000vras' },
    ]) {
      const r = await pedir(app, 'POST', '/servicos', {
        token: freela.token,
        corpo: { ...SERVICO_VALIDO, ...alteracao },
      });
      expect(r.status, JSON.stringify(Object.keys(alteracao))).toBe(400);
    }
  });

  it('GET /servicos/:id com id inexistente, fora do formato ou em maiúsculas', async () => {
    const freela = await criarUsuario(app);
    const id = await ofertarServico(app, freela);
    for (const inexistente of ['00000000-0000-4000-8000-000000000000', 'xyz']) {
      const r = await pedir(app, 'GET', `/servicos/${inexistente}`, {
        token: freela.token,
      });
      expect(r.status).toBe(404);
    }
    const maiusculo = await pedir(app, 'GET', `/servicos/${id.toUpperCase()}`, {
      token: freela.token,
    });
    expect(maiusculo.status).toBe(200);
  });
});
