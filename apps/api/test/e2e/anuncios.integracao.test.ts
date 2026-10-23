/**
 * CA25 a CA31 (L2, anúncios e candidaturas) de ponta a ponta: a API montada
 * pela composição, com o Postgres de teste e contas reais por HTTP.
 *
 * - Editar trampo e serviço com a `versao` lida, conflito com a versão velha,
 *   404 para terceiros e a visão do autor (D33).
 * - Encerrar (D34): pendentes recusadas, fora da busca, 409
 *   `trampo_nao_aberto` para candidatar e aceitar, conversa intacta (D35).
 * - D25 + encerrar: a contratada exclui a conta e o autor resolve o trampo em
 *   andamento sem contratado encerrando-o.
 * - Excluir trampo e retirar candidatura, com a conversa já aberta seguindo.
 * - Exportação e exclusão de conta (ADR-005) com trampo encerrado e anúncios
 *   editados.
 * - Limites (D36) e sessão obrigatória nas rotas novas.
 *
 * As contas que precisam da senha (exclusão e exportação) passam pelo
 * cadastro de verdade; as demais são gravadas direto no banco (`apoio.ts`).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LIMITES_PADRAO_POR_CONTA,
  type LimitesPorConta,
} from '../../src/compartilhado/http/limite-por-conta.js';
import { type Aplicacao, montarAplicacao } from '../../src/composicao.js';
import { bancoDeTeste } from '../banco-teste.js';
import {
  candidatar,
  criarUsuario,
  limparBanco,
  montar,
  ofertarServico,
  PERFIL_VALIDO,
  pedir,
  publicarTrampo,
  type Resposta,
  relogioQueAvanca,
  SERVICO_VALIDO,
  TEMPO_COM_HASH,
  TRAMPO_VALIDO,
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

function app(): Aplicacao {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao;
}

/** API com relógio que avança: datas distintas e ordem estável na busca. */
async function subir(): Promise<Aplicacao> {
  aplicacao = await montar({ relogio: relogioQueAvanca() });
  return aplicacao;
}

function esperarStatus(resposta: Resposta, status: number): void {
  expect(resposta.status, resposta.texto).toBe(status);
}

function esperarErro(resposta: Resposta, status: number, erro: string): void {
  expect(resposta.status, resposta.texto).toBe(status);
  expect(resposta.texto).toBe(JSON.stringify({ erro }));
}

const NAO_ENCONTRADO = 'nao_encontrado';

/** Chaves do trampo para quem não é o autor: as de antes da L2 (CA31). */
const CHAVES_PUBLICAS_DO_TRAMPO = [
  'autorId',
  'categoria',
  'cidade',
  'criadoEm',
  'descricao',
  'id',
  'prazo',
  'status',
  'titulo',
  'valorCentavos',
];

/** Chaves do serviço para quem não é o autor (CA31). */
const CHAVES_PUBLICAS_DO_SERVICO = [
  'autorId',
  'categoria',
  'cidade',
  'criadoEm',
  'descricao',
  'id',
  'precoBaseCentavos',
  'status',
  'titulo',
];

type Objeto = Record<string, unknown>;

async function lerTrampo(id: string, quem: Usuario): Promise<Objeto> {
  const resposta = await pedir(app(), 'GET', `/trampos/${id}`, {
    token: quem.token,
  });
  esperarStatus(resposta, 200);
  return resposta.corpo as Objeto;
}

async function lerServico(id: string, quem: Usuario): Promise<Objeto> {
  const resposta = await pedir(app(), 'GET', `/servicos/${id}`, {
    token: quem.token,
  });
  esperarStatus(resposta, 200);
  return resposta.corpo as Objeto;
}

function editarTrampo(
  id: string,
  quem: Usuario,
  corpo: Objeto,
): Promise<Resposta> {
  return pedir(app(), 'PUT', `/trampos/${id}`, { token: quem.token, corpo });
}

function editarServico(
  id: string,
  quem: Usuario,
  corpo: Objeto,
): Promise<Resposta> {
  return pedir(app(), 'PUT', `/servicos/${id}`, { token: quem.token, corpo });
}

function encerrar(id: string, quem: Usuario): Promise<Resposta> {
  return pedir(app(), 'POST', `/trampos/${id}/encerrar`, {
    token: quem.token,
  });
}

/** Ids da busca (`GET /busca`, com a querystring dada), na ordem. */
async function idsDaBusca(quem: Usuario, query = ''): Promise<string[]> {
  const resposta = await pedir(app(), 'GET', `/busca${query}`, {
    token: quem.token,
  });
  esperarStatus(resposta, 200);
  return (resposta.corpo as { itens: { id: string }[] }).itens.map(
    (item) => item.id,
  );
}

function idDe(resposta: Resposta): string {
  esperarStatus(resposta, 201);
  return (resposta.corpo as { id: string }).id;
}

interface CandidaturaListada {
  readonly id: string;
  readonly freelancerId: string;
  readonly status: string;
}

async function candidaturasRecebidas(
  trampoId: string,
  autor: Usuario,
): Promise<CandidaturaListada[]> {
  const resposta = await pedir(
    app(),
    'GET',
    `/trampos/${trampoId}/candidaturas`,
    { token: autor.token },
  );
  esperarStatus(resposta, 200);
  return resposta.corpo as CandidaturaListada[];
}

async function minhasCandidaturas(
  freelancer: Usuario,
): Promise<CandidaturaListada[]> {
  const resposta = await pedir(app(), 'GET', '/candidaturas/minhas', {
    token: freelancer.token,
  });
  esperarStatus(resposta, 200);
  return resposta.corpo as CandidaturaListada[];
}

async function abrirConversa(de: Usuario, para: Usuario): Promise<string> {
  const resposta = await pedir(app(), 'POST', '/conversas', {
    token: de.token,
    corpo: { outroUsuarioId: para.contaId },
  });
  esperarStatus(resposta, 201);
  return (resposta.corpo as { conversaId: string }).conversaId;
}

async function enviar(
  quem: Usuario,
  conversaId: string,
  texto: string,
): Promise<void> {
  esperarStatus(
    await pedir(app(), 'POST', `/conversas/${conversaId}/mensagens`, {
      token: quem.token,
      corpo: { texto },
    }),
    201,
  );
}

/**
 * A conversa segue viva para os dois (D35): aparece na lista de cada um,
 * os dois enviam e os dois leem todas as mensagens, na ordem.
 */
async function conversaContinua(
  conversaId: string,
  a: Usuario,
  b: Usuario,
  anteriores: readonly string[],
): Promise<void> {
  const depois = [`${anteriores.length + 1}ª de A`, 'e mais uma de B'];
  await enviar(a, conversaId, depois[0] as string);
  await enviar(b, conversaId, depois[1] as string);
  for (const quem of [a, b]) {
    const lista = await pedir(app(), 'GET', '/conversas', {
      token: quem.token,
    });
    esperarStatus(lista, 200);
    expect(
      (lista.corpo as { conversaId: string }[]).map((c) => c.conversaId),
    ).toEqual([conversaId]);
    const mensagens = await pedir(
      app(),
      'GET',
      `/conversas/${conversaId}/mensagens`,
      { token: quem.token },
    );
    esperarStatus(mensagens, 200);
    expect(
      (mensagens.corpo as { texto: string }[]).map((m) => m.texto),
    ).toEqual([...anteriores, ...depois]);
  }
}

/**
 * Conta criada pelo cadastro real (com senha, para excluir e exportar) e com
 * perfil completo (D9). O id vem do banco: nenhuma rota devolve o da própria
 * conta.
 */
async function cadastrarComSenha(
  email: string,
  senha: string,
): Promise<Usuario> {
  const criada = await pedir(app(), 'POST', '/contas', {
    corpo: { email, senha },
  });
  esperarStatus(criada, 201);
  const token = (criada.corpo as { token: string }).token;
  esperarStatus(
    await pedir(app(), 'PUT', '/perfis/eu', {
      token,
      corpo: PERFIL_VALIDO,
    }),
    200,
  );
  const { rows } = await sql<{ id: string }>`select id from contas
    where email = ${email}`.execute(bancoDeTeste());
  expect(rows).toHaveLength(1);
  return { contaId: rows[0]?.id ?? '', token, email };
}

describe('CA25 — editar trampo pela rota real', () => {
  it('Dado o autor com a versão lida, então 204 com os campos novos, criadoEm e posição na busca mantidos; versão velha dá 409 conflito_de_versao e nada muda; terceiro recebe 404 e não vê versao nem candidaturasRecebidas', async () => {
    await subir();
    const ana = await criarUsuario(app());
    const bruno = await criarUsuario(app());

    const trampo = await publicarTrampo(app(), ana, {
      titulo: 'Pintura do muro antigo',
      descricao: 'Muro de tijolo, tinta acrilica inclusa.',
      prazo: '2027-03-31',
    });
    const maisNovo = await publicarTrampo(app(), ana, {
      titulo: 'Troca de torneira',
      descricao: 'Torneira da cozinha pingando.',
    });

    // Visão do autor (D33) e do terceiro (CA31).
    const doAutor = await lerTrampo(trampo, ana);
    expect(doAutor).toMatchObject({ versao: 1, candidaturasRecebidas: 0 });
    const criadoEm = doAutor.criadoEm;
    const doTerceiro = await lerTrampo(trampo, bruno);
    expect(Object.keys(doTerceiro).sort()).toEqual(CHAVES_PUBLICAS_DO_TRAMPO);

    const novo = {
      titulo: 'Marcenaria do armario embutido',
      descricao: 'Armario de quarto com tres portas de correr.',
      categoria: 'reformas',
      cidade: 'Perdões',
      valorCentavos: 90_000,
    };

    // Terceiro: 404 com a versão certa, com id inexistente e com id que não é
    // uuid; nada muda.
    for (const id of [trampo, randomUUID(), 'nao-e-uuid']) {
      esperarErro(
        await editarTrampo(id, bruno, { ...novo, versao: 1 }),
        404,
        NAO_ENCONTRADO,
      );
    }
    expect(await lerTrampo(trampo, ana)).toEqual(doAutor);

    // Corpo fechado: não troca autor, status nem data.
    for (const extra of [
      { autorId: bruno.contaId },
      { status: 'encerrado' },
      { criadoEm: '2020-01-01T00:00:00.000Z' },
    ]) {
      const recusada = await editarTrampo(trampo, ana, {
        ...novo,
        versao: 1,
        ...extra,
      });
      esperarStatus(recusada, 400);
      expect(recusada.corpo).toMatchObject({ erro: 'dados_invalidos' });
    }
    expect(await lerTrampo(trampo, ana)).toEqual(doAutor);

    // Sem `prazo`, o prazo sai.
    esperarStatus(await editarTrampo(trampo, ana, { ...novo, versao: 1 }), 204);
    const editado = await lerTrampo(trampo, ana);
    expect(editado).toEqual({
      ...doAutor,
      ...novo,
      prazo: null,
      versao: 2,
      candidaturasRecebidas: 0,
    });
    expect(editado.criadoEm).toBe(criadoEm);

    // Versão velha: 409 e nada muda.
    esperarErro(
      await editarTrampo(trampo, ana, {
        ...novo,
        titulo: 'Outro titulo qualquer',
        versao: 1,
      }),
      409,
      'conflito_de_versao',
    );
    expect(await lerTrampo(trampo, ana)).toEqual(editado);

    // A busca acha o texto novo, não o velho, e a posição não muda: o
    // editado (mais antigo) continua depois do mais novo.
    expect(await idsDaBusca(bruno, '?texto=marcenaria')).toEqual([trampo]);
    expect(await idsDaBusca(bruno, '?texto=tijolo')).toEqual([]);
    expect(await idsDaBusca(bruno, '?tipo=trampos')).toEqual([
      maisNovo,
      trampo,
    ]);

    // O terceiro vê o texto novo, ainda sem os campos do autor.
    const editadoPeloTerceiro = await lerTrampo(trampo, bruno);
    expect(editadoPeloTerceiro).toMatchObject(novo);
    expect(Object.keys(editadoPeloTerceiro).sort()).toEqual(
      CHAVES_PUBLICAS_DO_TRAMPO,
    );

    // Com candidatura, não é mais editável, mesmo com a versão atual.
    esperarStatus(await candidatar(app(), bruno, trampo), 201);
    const comCandidatura = await lerTrampo(trampo, ana);
    expect(comCandidatura).toMatchObject({ candidaturasRecebidas: 1 });
    esperarErro(
      await editarTrampo(trampo, ana, {
        ...novo,
        versao: comCandidatura.versao,
      }),
      409,
      'trampo_nao_editavel',
    );
    expect(await lerTrampo(trampo, ana)).toEqual(comCandidatura);

    // `GET /trampos/meus` traz a visão do autor; o detalhe do terceiro, não.
    const meus = await pedir(app(), 'GET', '/trampos/meus', {
      token: ana.token,
    });
    esperarStatus(meus, 200);
    expect(meus.corpo).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: trampo,
          versao: comCandidatura.versao,
          candidaturasRecebidas: 1,
        }),
      ]),
    );
    expect(Object.keys(await lerTrampo(trampo, bruno)).sort()).toEqual(
      CHAVES_PUBLICAS_DO_TRAMPO,
    );
  });
});

describe('CA26 — editar e excluir serviço pela rota real', () => {
  it('Dado o autor com a versão lida, então 204 e a busca acha o texto novo; versão velha dá 409; terceiro recebe 404 e não vê versao; excluído some da busca e o detalhe dá 404', async () => {
    await subir();
    const ana = await criarUsuario(app());
    const bruno = await criarUsuario(app());

    const servico = await ofertarServico(app(), ana, {
      titulo: 'Pintura de fachada',
      descricao: 'Fachadas de casas com tinta acrilica.',
    });

    const doAutor = await lerServico(servico, ana);
    expect(doAutor).toMatchObject({ versao: 1 });
    expect(Object.keys(await lerServico(servico, bruno)).sort()).toEqual(
      CHAVES_PUBLICAS_DO_SERVICO,
    );

    // Sem `cidade`, fica sem cidade (D7).
    const novo = {
      titulo: 'Conserto de azulejo',
      descricao: 'Troca de azulejos quebrados em banheiro e cozinha.',
      categoria: 'reformas',
      precoBaseCentavos: 15_000,
    };

    for (const id of [servico, randomUUID(), 'nao-e-uuid']) {
      esperarErro(
        await editarServico(id, bruno, { ...novo, versao: 1 }),
        404,
        NAO_ENCONTRADO,
      );
      esperarErro(
        await pedir(app(), 'DELETE', `/servicos/${id}`, {
          token: bruno.token,
        }),
        404,
        NAO_ENCONTRADO,
      );
    }
    expect(await lerServico(servico, ana)).toEqual(doAutor);

    const comAutor = await editarServico(servico, ana, {
      ...novo,
      versao: 1,
      autorId: bruno.contaId,
    });
    esperarStatus(comAutor, 400);
    expect(await lerServico(servico, ana)).toEqual(doAutor);

    esperarStatus(
      await editarServico(servico, ana, { ...novo, versao: 1 }),
      204,
    );
    const editado = await lerServico(servico, ana);
    expect(editado).toEqual({ ...doAutor, ...novo, cidade: null, versao: 2 });

    esperarErro(
      await editarServico(servico, ana, {
        ...SERVICO_VALIDO,
        versao: 1,
      }),
      409,
      'conflito_de_versao',
    );
    expect(await lerServico(servico, ana)).toEqual(editado);

    expect(await idsDaBusca(bruno, '?texto=azulejo')).toEqual([servico]);
    expect(await idsDaBusca(bruno, '?texto=fachada')).toEqual([]);
    const peloTerceiro = await lerServico(servico, bruno);
    expect(peloTerceiro).toMatchObject({ ...novo, cidade: null });
    expect(Object.keys(peloTerceiro).sort()).toEqual(
      CHAVES_PUBLICAS_DO_SERVICO,
    );

    const meus = await pedir(app(), 'GET', '/servicos/meus', {
      token: ana.token,
    });
    esperarStatus(meus, 200);
    expect(meus.corpo).toEqual([expect.objectContaining({ versao: 2 })]);

    // Exclusão: some da busca, o detalhe dá 404 e tudo depois também.
    esperarStatus(
      await pedir(app(), 'DELETE', `/servicos/${servico}`, {
        token: ana.token,
      }),
      204,
    );
    expect(await idsDaBusca(bruno)).toEqual([]);
    for (const quem of [ana, bruno]) {
      esperarErro(
        await pedir(app(), 'GET', `/servicos/${servico}`, {
          token: quem.token,
        }),
        404,
        NAO_ENCONTRADO,
      );
    }
    esperarErro(
      await editarServico(servico, ana, { ...novo, versao: 2 }),
      404,
      NAO_ENCONTRADO,
    );
    esperarErro(
      await pedir(app(), 'DELETE', `/servicos/${servico}`, {
        token: ana.token,
      }),
      404,
      NAO_ENCONTRADO,
    );
    const meusDepois = await pedir(app(), 'GET', '/servicos/meus', {
      token: ana.token,
    });
    expect(meusDepois.corpo).toEqual([]);
  });
});

describe('CA27 — encerrar trampo pela rota real (D34)', () => {
  it('Dado um trampo aberto com duas pendentes e uma conversa, quando o autor encerra, então as pendentes viram recusadas, o trampo sai da busca, candidatar e aceitar dão 409 trampo_nao_aberto e a conversa continua; encerrar de novo dá 204 sem mudar nada', async () => {
    await subir();
    const ana = await criarUsuario(app());
    const bruno = await criarUsuario(app());
    const caio = await criarUsuario(app());
    const dora = await criarUsuario(app());

    const trampo = await publicarTrampo(app(), ana, {
      titulo: 'Jardinagem do quintal',
      descricao: 'Poda e limpeza de canteiros.',
    });
    const doBruno = idDe(await candidatar(app(), bruno, trampo));
    const doCaio = idDe(await candidatar(app(), caio, trampo));
    const conversa = await abrirConversa(bruno, ana);
    await enviar(bruno, conversa, 'Oi, posso amanhã');
    expect(await idsDaBusca(dora, '?texto=jardinagem')).toEqual([trampo]);

    // Terceiro e id fora do formato: 404, nada muda.
    for (const id of [trampo, 'nao-e-uuid', randomUUID()]) {
      esperarErro(await encerrar(id, dora), 404, NAO_ENCONTRADO);
    }
    expect((await lerTrampo(trampo, dora)).status).toBe('aberto');

    const encerrada = await encerrar(trampo, ana);
    esperarStatus(encerrada, 204);
    expect(encerrada.texto).toBe('');

    const doAutor = await lerTrampo(trampo, ana);
    expect(doAutor).toMatchObject({
      status: 'encerrado',
      candidaturasRecebidas: 2,
    });
    expect(
      (await candidaturasRecebidas(trampo, ana))
        .map((c) => [c.id, c.status])
        .sort(),
    ).toEqual(
      [
        [doBruno, 'recusada'],
        [doCaio, 'recusada'],
      ].sort(),
    );
    expect(await minhasCandidaturas(bruno)).toEqual([
      expect.objectContaining({ id: doBruno, status: 'recusada' }),
    ]);

    // Fora da busca, com ou sem texto; o detalhe segue para todos, com o
    // status novo e sem os campos do autor para o terceiro.
    expect(await idsDaBusca(dora)).toEqual([]);
    expect(await idsDaBusca(dora, '?texto=jardinagem')).toEqual([]);
    const peloTerceiro = await lerTrampo(trampo, dora);
    expect(peloTerceiro.status).toBe('encerrado');
    expect(Object.keys(peloTerceiro).sort()).toEqual(CHAVES_PUBLICAS_DO_TRAMPO);

    esperarErro(
      await candidatar(app(), dora, trampo),
      409,
      'trampo_nao_aberto',
    );
    esperarErro(
      await pedir(
        app(),
        'POST',
        `/trampos/${trampo}/candidaturas/${doBruno}/aceitar`,
        { token: ana.token },
      ),
      409,
      'trampo_nao_aberto',
    );
    // A recusada não pode ser retirada (CA29).
    esperarErro(
      await pedir(app(), 'DELETE', `/candidaturas/${doCaio}`, {
        token: caio.token,
      }),
      409,
      'candidatura_nao_pendente',
    );
    // Encerrado não é editado nem excluído (D34).
    esperarErro(
      await editarTrampo(trampo, ana, {
        ...TRAMPO_VALIDO,
        versao: doAutor.versao,
      }),
      409,
      'trampo_nao_editavel',
    );
    esperarErro(
      await pedir(app(), 'DELETE', `/trampos/${trampo}`, { token: ana.token }),
      409,
      'trampo_nao_aberto',
    );

    // Encerrar de novo: 204 e nada muda (nem a versão).
    esperarStatus(await encerrar(trampo, ana), 204);
    expect(await lerTrampo(trampo, ana)).toEqual(doAutor);

    // Continua em Meus anúncios.
    const meus = await pedir(app(), 'GET', '/trampos/meus', {
      token: ana.token,
    });
    expect(meus.corpo).toEqual([
      expect.objectContaining({ id: trampo, status: 'encerrado' }),
    ]);

    await conversaContinua(conversa, bruno, ana, ['Oi, posso amanhã']);
  });

  it('Dado um trampo em andamento, quando o autor encerra, então ele fica encerrado e a candidatura aceita continua aceita', async () => {
    await subir();
    const ana = await criarUsuario(app());
    const bruno = await criarUsuario(app());
    const caio = await criarUsuario(app());

    const trampo = await publicarTrampo(app(), ana);
    const doBruno = idDe(await candidatar(app(), bruno, trampo));
    const doCaio = idDe(await candidatar(app(), caio, trampo));
    esperarStatus(
      await pedir(
        app(),
        'POST',
        `/trampos/${trampo}/candidaturas/${doBruno}/aceitar`,
        { token: ana.token },
      ),
      200,
    );
    // O aceite já recusa as outras (CA10).
    const antes = Object.fromEntries(
      (await candidaturasRecebidas(trampo, ana)).map((c) => [c.id, c.status]),
    );
    expect(antes).toEqual({ [doBruno]: 'aceita', [doCaio]: 'recusada' });

    esperarStatus(await encerrar(trampo, ana), 204);

    expect((await lerTrampo(trampo, ana)).status).toBe('encerrado');
    expect(
      Object.fromEntries(
        (await candidaturasRecebidas(trampo, ana)).map((c) => [c.id, c.status]),
      ),
    ).toEqual(antes);
  });
});

describe('CA27 + D25 — a contratada exclui a conta e o autor encerra', () => {
  it(
    'Dado um trampo em andamento cuja contratada excluiu a conta, então ele fica em andamento sem contratado, não é editado nem excluído, e o autor o encerra com 204',
    async () => {
      await subir();
      const ana = await criarUsuario(app());
      const senhaDoBruno = 'senha-do-bruno-d25';
      const bruno = await cadastrarComSenha(
        'bruno.d25@exemplo.test',
        senhaDoBruno,
      );
      const caio = await criarUsuario(app());

      const trampo = await publicarTrampo(app(), ana, {
        titulo: 'Reboco da garagem',
        descricao: 'Reboco e massa corrida.',
      });
      const doBruno = idDe(await candidatar(app(), bruno, trampo));
      esperarStatus(
        await pedir(
          app(),
          'POST',
          `/trampos/${trampo}/candidaturas/${doBruno}/aceitar`,
          { token: ana.token },
        ),
        200,
      );
      const conversa = await abrirConversa(ana, bruno);
      await enviar(ana, conversa, 'Combinado para segunda');

      esperarStatus(
        await pedir(app(), 'POST', '/contas/eu/exclusao', {
          token: bruno.token,
          corpo: { senha: senhaDoBruno },
        }),
        204,
      );

      // Em andamento, sem contratado: a candidatura aceita e a conversa
      // foram junto com a conta (D25).
      const semContratado = await lerTrampo(trampo, ana);
      expect(semContratado).toMatchObject({
        status: 'em_andamento',
        candidaturasRecebidas: 0,
      });
      expect(await candidaturasRecebidas(trampo, ana)).toEqual([]);
      const conversas = await pedir(app(), 'GET', '/conversas', {
        token: ana.token,
      });
      expect(conversas.corpo).toEqual([]);

      // Não volta a receber candidatura, não é editado nem excluído.
      esperarErro(
        await candidatar(app(), caio, trampo),
        409,
        'trampo_nao_aberto',
      );
      esperarErro(
        await editarTrampo(trampo, ana, {
          ...TRAMPO_VALIDO,
          versao: semContratado.versao,
        }),
        409,
        'trampo_nao_editavel',
      );
      esperarErro(
        await pedir(app(), 'DELETE', `/trampos/${trampo}`, {
          token: ana.token,
        }),
        409,
        'trampo_nao_aberto',
      );
      // Só o autor encerra.
      esperarErro(await encerrar(trampo, caio), 404, NAO_ENCONTRADO);

      esperarStatus(await encerrar(trampo, ana), 204);
      const encerrado = await lerTrampo(trampo, ana);
      expect(encerrado).toMatchObject({
        status: 'encerrado',
        candidaturasRecebidas: 0,
      });
      esperarStatus(await encerrar(trampo, ana), 204);
      expect(await lerTrampo(trampo, ana)).toEqual(encerrado);

      const meus = await pedir(app(), 'GET', '/trampos/meus', {
        token: ana.token,
      });
      expect(meus.corpo).toEqual([
        expect.objectContaining({ id: trampo, status: 'encerrado' }),
      ]);
    },
    TEMPO_COM_HASH,
  );
});

describe('CA28 — excluir trampo pela rota real', () => {
  it('Dado um trampo aberto com candidatura e conversa, quando o autor exclui, então o detalhe dá 404, a candidatura some e a conversa continua; terceiro recebe 404', async () => {
    await subir();
    const ana = await criarUsuario(app());
    const bruno = await criarUsuario(app());
    const caio = await criarUsuario(app());

    const trampo = await publicarTrampo(app(), ana, {
      titulo: 'Limpeza de calha',
      descricao: 'Calhas do telhado entupidas.',
    });
    idDe(await candidatar(app(), bruno, trampo));
    const conversa = await abrirConversa(bruno, ana);
    await enviar(bruno, conversa, 'Tenho escada');

    for (const id of [trampo, 'nao-e-uuid', randomUUID()]) {
      esperarErro(
        await pedir(app(), 'DELETE', `/trampos/${id}`, { token: caio.token }),
        404,
        NAO_ENCONTRADO,
      );
    }
    expect(await candidaturasRecebidas(trampo, ana)).toHaveLength(1);

    const excluido = await pedir(app(), 'DELETE', `/trampos/${trampo}`, {
      token: ana.token,
    });
    esperarStatus(excluido, 204);
    expect(excluido.texto).toBe('');

    for (const quem of [ana, bruno]) {
      esperarErro(
        await pedir(app(), 'GET', `/trampos/${trampo}`, { token: quem.token }),
        404,
        NAO_ENCONTRADO,
      );
    }
    expect(await minhasCandidaturas(bruno)).toEqual([]);
    expect(await idsDaBusca(caio)).toEqual([]);
    const meus = await pedir(app(), 'GET', '/trampos/meus', {
      token: ana.token,
    });
    expect(meus.corpo).toEqual([]);
    esperarErro(await candidatar(app(), caio, trampo), 404, NAO_ENCONTRADO);
    esperarErro(
      await pedir(app(), 'DELETE', `/trampos/${trampo}`, { token: ana.token }),
      404,
      NAO_ENCONTRADO,
    );

    await conversaContinua(conversa, bruno, ana, ['Tenho escada']);
  });

  it('Dado um trampo em andamento, quando o autor tenta excluir, então 409 trampo_nao_aberto e nada muda', async () => {
    await subir();
    const ana = await criarUsuario(app());
    const bruno = await criarUsuario(app());

    const trampo = await publicarTrampo(app(), ana);
    const doBruno = idDe(await candidatar(app(), bruno, trampo));
    esperarStatus(
      await pedir(
        app(),
        'POST',
        `/trampos/${trampo}/candidaturas/${doBruno}/aceitar`,
        { token: ana.token },
      ),
      200,
    );
    const antes = await lerTrampo(trampo, ana);

    esperarErro(
      await pedir(app(), 'DELETE', `/trampos/${trampo}`, { token: ana.token }),
      409,
      'trampo_nao_aberto',
    );
    expect(await lerTrampo(trampo, ana)).toEqual(antes);
    expect(await minhasCandidaturas(bruno)).toEqual([
      expect.objectContaining({ id: doBruno, status: 'aceita' }),
    ]);
  });
});

describe('CA29 — retirar candidatura pela rota real', () => {
  it('Dado a candidatura pendente do freelancer, quando ele retira, então ela some, ele se candidata de novo e a conversa continua; de outra conta dá 404; aceita dá 409 candidatura_nao_pendente', async () => {
    await subir();
    const ana = await criarUsuario(app());
    const bruno = await criarUsuario(app());
    const caio = await criarUsuario(app());

    const trampo = await publicarTrampo(app(), ana);
    const primeira = idDe(
      await candidatar(app(), bruno, trampo, {
        mensagem: 'Primeira tentativa',
      }),
    );
    const conversa = await abrirConversa(bruno, ana);
    await enviar(ana, conversa, 'Pode vir sabado?');

    // De outra conta (inclusive o autor do trampo) ou fora do formato: 404.
    for (const [quem, id] of [
      [caio, primeira],
      [ana, primeira],
      [bruno, 'nao-e-uuid'],
      [bruno, randomUUID()],
    ] as const) {
      esperarErro(
        await pedir(app(), 'DELETE', `/candidaturas/${id}`, {
          token: quem.token,
        }),
        404,
        NAO_ENCONTRADO,
      );
    }
    expect(await minhasCandidaturas(bruno)).toHaveLength(1);

    const retirada = await pedir(app(), 'DELETE', `/candidaturas/${primeira}`, {
      token: bruno.token,
    });
    esperarStatus(retirada, 204);
    expect(retirada.texto).toBe('');

    expect(await minhasCandidaturas(bruno)).toEqual([]);
    expect(await candidaturasRecebidas(trampo, ana)).toEqual([]);
    expect(await lerTrampo(trampo, ana)).toMatchObject({
      candidaturasRecebidas: 0,
    });
    esperarErro(
      await pedir(app(), 'DELETE', `/candidaturas/${primeira}`, {
        token: bruno.token,
      }),
      404,
      NAO_ENCONTRADO,
    );

    await conversaContinua(conversa, ana, bruno, ['Pode vir sabado?']);

    // Candidata de novo: candidatura nova, pendente.
    const segunda = idDe(
      await candidatar(app(), bruno, trampo, { mensagem: 'Segunda tentativa' }),
    );
    expect(segunda).not.toBe(primeira);
    expect(await minhasCandidaturas(bruno)).toEqual([
      expect.objectContaining({ id: segunda, status: 'pendente' }),
    ]);

    // Aceita não pode ser retirada.
    esperarStatus(
      await pedir(
        app(),
        'POST',
        `/trampos/${trampo}/candidaturas/${segunda}/aceitar`,
        { token: ana.token },
      ),
      200,
    );
    esperarErro(
      await pedir(app(), 'DELETE', `/candidaturas/${segunda}`, {
        token: bruno.token,
      }),
      409,
      'candidatura_nao_pendente',
    );
    expect(await minhasCandidaturas(bruno)).toEqual([
      expect.objectContaining({ id: segunda, status: 'aceita' }),
    ]);
  });
});

const CONTAGEM_POR_CONTA = {
  contas: 'id',
  sessoes: 'conta_id',
  perfis: 'conta_id',
  trampos: 'autor_id',
  servicos: 'autor_id',
  candidaturas: 'freelancer_id',
  mensagens: 'autor_id',
} as const;

/** Linhas que a conta ainda tem em cada tabela (mais as conversas). */
async function linhasDaConta(contaId: string): Promise<Record<string, number>> {
  const db = bancoDeTeste();
  const contagem: Record<string, number> = {};
  for (const [tabela, coluna] of Object.entries(CONTAGEM_POR_CONTA)) {
    const { rows } = await sql<{ n: number }>`select count(*)::int as n
      from ${sql.table(tabela)} where ${sql.ref(coluna)} = ${contaId}::uuid`.execute(
      db,
    );
    contagem[tabela] = rows[0]?.n ?? -1;
  }
  const { rows } = await sql<{ n: number }>`select count(*)::int as n
    from conversas where ${contaId}::uuid in (usuario_a_id, usuario_b_id)`.execute(
    db,
  );
  contagem.conversas = rows[0]?.n ?? -1;
  return contagem;
}

describe('CA30 — exportação e exclusão de conta com trampo encerrado e anúncios editados (ADR-005)', () => {
  it(
    'Dado um trampo encerrado, um trampo e um serviço editados e uma candidatura recusada, então o JSON v1 traz status encerrado e só os textos editados, e a exclusão apaga tudo',
    async () => {
      await subir();
      const senhaDaAna = 'senha-da-ana-ca30';
      const emailDaAna = 'ana.ca30@exemplo.test';
      const ana = await cadastrarComSenha(emailDaAna, senhaDaAna);
      const bruno = await criarUsuario(app());

      // Trampo encerrado, com a candidatura do Bruno recusada.
      const encerrado = await publicarTrampo(app(), ana, {
        titulo: 'Conserto de portao',
        descricao: 'Portao de ferro emperrado.',
        prazo: '2027-05-10',
      });
      idDe(await candidatar(app(), bruno, encerrado));
      esperarStatus(await encerrar(encerrado, ana), 204);

      // Trampo editado (sem prazo) e serviço editado (sem cidade).
      const textosVelhos = {
        titulo: 'TITULO-VELHO-DO-TRAMPO',
        descricao: 'DESCRICAO-VELHA-DO-TRAMPO',
      };
      const editado = await publicarTrampo(app(), ana, {
        ...textosVelhos,
        prazo: '2027-06-01',
      });
      esperarStatus(
        await editarTrampo(editado, ana, {
          titulo: 'Titulo novo do trampo',
          descricao: 'Descricao nova do trampo editado.',
          categoria: 'reformas',
          cidade: 'Lavras',
          valorCentavos: 12_345,
          versao: 1,
        }),
        204,
      );
      const servicoVelho = {
        titulo: 'TITULO-VELHO-DO-SERVICO',
        descricao: 'DESCRICAO-VELHA-DO-SERVICO',
      };
      const servico = await ofertarServico(app(), ana, servicoVelho);
      esperarStatus(
        await editarServico(servico, ana, {
          titulo: 'Titulo novo do servico',
          descricao: 'Descricao nova do servico editado.',
          categoria: 'reformas',
          precoBaseCentavos: 7_000,
          versao: 1,
        }),
        204,
      );

      // A Ana se candidata ao trampo do Bruno, que encerra: a dela é recusada.
      const doBrunoTrampo = await publicarTrampo(app(), bruno);
      const daAna = idDe(
        await candidatar(app(), ana, doBrunoTrampo, {
          mensagem: 'Candidatura da Ana',
        }),
      );
      esperarStatus(await encerrar(doBrunoTrampo, bruno), 204);

      const exportada = await pedir(app(), 'POST', '/contas/eu/exportacao', {
        token: ana.token,
        corpo: { senha: senhaDaAna },
      });
      esperarStatus(exportada, 200);
      const json = exportada.corpo as Objeto;
      expect(json.formato).toBe('trampo-ja.exportacao.v1');
      expect(json.trampos).toStrictEqual([
        {
          id: encerrado,
          titulo: 'Conserto de portao',
          descricao: 'Portao de ferro emperrado.',
          categoria: 'reformas',
          cidade: 'Lavras',
          valorCentavos: TRAMPO_VALIDO.valorCentavos,
          prazo: '2027-05-10',
          status: 'encerrado',
          criadoEm: (await lerTrampo(encerrado, ana)).criadoEm,
          candidaturasRecebidas: 1,
        },
        {
          id: editado,
          titulo: 'Titulo novo do trampo',
          descricao: 'Descricao nova do trampo editado.',
          categoria: 'reformas',
          cidade: 'Lavras',
          valorCentavos: 12_345,
          prazo: null,
          status: 'aberto',
          criadoEm: (await lerTrampo(editado, ana)).criadoEm,
          candidaturasRecebidas: 0,
        },
      ]);
      expect(json.servicos).toStrictEqual([
        {
          id: servico,
          titulo: 'Titulo novo do servico',
          descricao: 'Descricao nova do servico editado.',
          categoria: 'reformas',
          cidade: null,
          precoBaseCentavos: 7_000,
          status: 'ativo',
          criadoEm: (await lerServico(servico, ana)).criadoEm,
        },
      ]);
      expect(json.candidaturas).toStrictEqual([
        expect.objectContaining({
          id: daAna,
          trampoId: doBrunoTrampo,
          mensagem: 'Candidatura da Ana',
          status: 'recusada',
        }),
      ]);
      // A edição substitui: nenhum texto velho fica na exportação, nem
      // `versao`, que é contador interno.
      for (const velho of [
        ...Object.values(textosVelhos),
        ...Object.values(servicoVelho),
        'versao',
      ]) {
        expect(exportada.texto, velho).not.toContain(velho);
      }

      expect(await linhasDaConta(ana.contaId)).toEqual({
        contas: 1,
        sessoes: 1,
        perfis: 1,
        trampos: 2,
        servicos: 1,
        candidaturas: 1,
        mensagens: 0,
        conversas: 0,
      });

      esperarStatus(
        await pedir(app(), 'POST', '/contas/eu/exclusao', {
          token: ana.token,
          corpo: { senha: senhaDaAna },
        }),
        204,
      );

      expect(await linhasDaConta(ana.contaId)).toEqual({
        contas: 0,
        sessoes: 0,
        perfis: 0,
        trampos: 0,
        servicos: 0,
        candidaturas: 0,
        mensagens: 0,
        conversas: 0,
      });
      // A candidatura do Bruno no trampo encerrado da Ana foi junto; o
      // trampo do Bruno fica, encerrado, sem a candidatura da Ana.
      expect(await minhasCandidaturas(bruno)).toEqual([]);
      expect(await lerTrampo(doBrunoTrampo, bruno)).toMatchObject({
        status: 'encerrado',
        candidaturasRecebidas: 0,
      });
      for (const url of [
        `/trampos/${encerrado}`,
        `/trampos/${editado}`,
        `/servicos/${servico}`,
      ]) {
        esperarErro(
          await pedir(app(), 'GET', url, { token: bruno.token }),
          404,
          NAO_ENCONTRADO,
        );
      }
    },
    TEMPO_COM_HASH,
  );
});

describe('CA31 — sessão e limites das rotas novas (D36)', () => {
  it('sem sessão, toda rota nova dá 401 nao_autenticado', async () => {
    await subir();
    const ana = await criarUsuario(app());
    const trampo = await publicarTrampo(app(), ana);
    const servico = await ofertarServico(app(), ana);
    const candidatura = idDe(
      await candidatar(app(), await criarUsuario(app()), trampo),
    );

    for (const [metodo, url, corpo] of [
      ['PUT', `/trampos/${trampo}`, { ...TRAMPO_VALIDO, versao: 1 }],
      ['POST', `/trampos/${trampo}/encerrar`, undefined],
      ['DELETE', `/trampos/${trampo}`, undefined],
      ['DELETE', `/candidaturas/${candidatura}`, undefined],
      ['PUT', `/servicos/${servico}`, { ...SERVICO_VALIDO, versao: 1 }],
      ['DELETE', `/servicos/${servico}`, undefined],
    ] as const) {
      esperarErro(
        await pedir(app(), metodo, url, corpo ? { corpo } : {}),
        401,
        'nao_autenticado',
      );
    }
    expect((await lerTrampo(trampo, ana)).status).toBe('aberto');
    expect(await lerServico(servico, ana)).toMatchObject({ versao: 1 });
  });

  it('os PUT contam em publicacao junto com publicar; encerrar e os DELETE contam em escrita', async () => {
    const limites: LimitesPorConta = {
      ...LIMITES_PADRAO_POR_CONTA,
      publicacao: { max: 3, janelaMs: 60 * 60_000 },
    };
    aplicacao = await montarAplicacao({
      db: bancoDeTeste(),
      relogio: relogioQueAvanca(),
      limitesPorConta: limites,
    });
    const ana = await criarUsuario(app());

    const trampo = await publicarTrampo(app(), ana);
    const servico = await ofertarServico(app(), ana);
    esperarStatus(
      await editarTrampo(trampo, ana, { ...TRAMPO_VALIDO, versao: 1 }),
      204,
    );
    // 4ª de `publicacao` na hora: o `PUT` do serviço dá 429, e nada muda.
    const barrada = await editarServico(servico, ana, {
      ...SERVICO_VALIDO,
      titulo: 'Nao deve gravar',
      versao: 1,
    });
    esperarErro(barrada, 429, 'muitas_requisicoes');
    expect(barrada.cabecalhos['retry-after']).toBeDefined();
    expect(await lerServico(servico, ana)).toMatchObject({
      titulo: SERVICO_VALIDO.titulo,
      versao: 1,
    });

    // `escrita` segue livre.
    esperarStatus(await encerrar(trampo, ana), 204);
    esperarStatus(
      await pedir(app(), 'DELETE', `/servicos/${servico}`, {
        token: ana.token,
      }),
      204,
    );
  });
});
