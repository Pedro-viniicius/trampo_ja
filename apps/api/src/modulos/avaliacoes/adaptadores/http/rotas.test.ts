import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarLogger } from '../../../../compartilhado/http/logger.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import { criarCasosDeUsoDeAvaliacoes } from '../../aplicacao/casos-de-uso.js';
import { LIMITE_DE_FAVORITOS } from '../../dominio/favorito.js';
import type { RepositorioDeAvaliacoes } from '../../dominio/portas.js';
import { RepositorioDeAvaliacoesEmMemoria } from '../memoria/repositorio-memoria.js';
import {
  VerificadorDeVinculoEmMemoria,
  VinculoDeAvaliacaoEmMemoria,
} from '../memoria/vinculos-memoria.js';
import { criarRotasDeAvaliacoes } from './rotas.js';

/** Uuid determinístico a partir de um número (prefixo identifica o tipo). */
function uuid(prefixo: string, n: number): string {
  return `${prefixo}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const AUTOR = uuid('aaaaaaaa', 1);
const FREELA = uuid('aaaaaaaa', 2);
const ESTRANHO = uuid('aaaaaaaa', 3);
const TRAMPO = uuid('bbbbbbbb', 1);
const TRAMPO_EM_ANDAMENTO = uuid('bbbbbbbb', 2);
const TRAMPO_INEXISTENTE = uuid('bbbbbbbb', 99);
const INICIO = '2026-11-13T12:00:00.000Z';

/** Token → conta, como a fachada de `contas` responderia. */
const SESSOES: Readonly<Record<string, string>> = {
  'token-autor': AUTOR,
  'token-freela': FREELA,
  'token-estranho': ESTRANHO,
};

let app: FastifyInstance;
let repositorio: RepositorioDeAvaliacoesEmMemoria;
let vinculos: VinculoDeAvaliacaoEmMemoria;
let verificador: VerificadorDeVinculoEmMemoria;
let relogio: RelogioFixo;
let contador: number;
/** Linhas JSON escritas pelo logger (nível trace). */
let linhasDoLog: string[];
const validarSessao = vi.fn(
  async (token: string): Promise<string | null> => SESSOES[token] ?? null,
);

function montar(repositorioUsado?: RepositorioDeAvaliacoes): FastifyInstance {
  const casos = criarCasosDeUsoDeAvaliacoes({
    repositorio: repositorioUsado ?? repositorio,
    vinculoDeAvaliacao: vinculos,
    verificadorDeVinculo: verificador,
    relogio,
    gerarId: () => {
      contador += 1;
      return uuid('cccccccc', contador);
    },
  });
  const servidor = criarServidor({
    logger: criarLogger({
      nivel: 'trace',
      destino: { write: (linha) => void linhasDoLog.push(linha) },
    }),
  });
  servidor.register(criarRotasDeAvaliacoes(casos), { validarSessao });
  return servidor;
}

beforeEach(() => {
  validarSessao.mockClear();
  repositorio = new RepositorioDeAvaliacoesEmMemoria();
  vinculos = new VinculoDeAvaliacaoEmMemoria();
  vinculos.registrar(TRAMPO, {
    autorId: AUTOR,
    freelaAceitoId: FREELA,
    status: 'encerrado',
  });
  vinculos.registrar(TRAMPO_EM_ANDAMENTO, {
    autorId: AUTOR,
    freelaAceitoId: FREELA,
    status: 'em_andamento',
  });
  verificador = new VerificadorDeVinculoEmMemoria([[AUTOR, FREELA]]);
  relogio = new RelogioFixo(INICIO);
  contador = 0;
  linhasDoLog = [];
  app = montar();
});

afterEach(async () => {
  await app.close();
});

function comToken(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function avaliar(corpo: unknown, token = 'token-autor') {
  const resposta = await app.inject({
    method: 'POST',
    url: '/avaliacoes',
    headers: comToken(token),
    payload: corpo as Record<string, unknown>,
  });
  relogio.avancar(60_000);
  return resposta;
}

async function obter(url: string, token = 'token-autor') {
  return app.inject({ method: 'GET', url, headers: comToken(token) });
}

async function favoritar(contaId: string, token = 'token-autor') {
  const resposta = await app.inject({
    method: 'PUT',
    url: `/favoritos/${contaId}`,
    headers: comToken(token),
  });
  relogio.avancar(60_000);
  return resposta;
}

async function desfavoritar(contaId: string, token = 'token-autor') {
  return app.inject({
    method: 'DELETE',
    url: `/favoritos/${contaId}`,
    headers: comToken(token),
  });
}

describe('CA14 — rotas de avaliações e favoritos exigem token', () => {
  const ROTAS: readonly InjectOptions[] = [
    {
      method: 'POST',
      url: '/avaliacoes',
      payload: { trampoId: TRAMPO, nota: 5 },
    },
    { method: 'GET', url: `/avaliacoes?contaId=${FREELA}&papel=freela` },
    { method: 'GET', url: `/avaliacoes/resumos?contas=${FREELA}` },
    { method: 'GET', url: `/avaliacoes/feitas?trampos=${TRAMPO}` },
    { method: 'GET', url: '/favoritos' },
    { method: 'PUT', url: `/favoritos/${FREELA}` },
    { method: 'DELETE', url: `/favoritos/${FREELA}` },
  ];

  it.each(ROTAS)(
    'CA14 — $method $url sem token ou com token desconhecido responde 401 sem dados',
    async (rota) => {
      await avaliar({ trampoId: TRAMPO, nota: 5, comentario: 'Não vaza' });
      await favoritar(FREELA);

      const sem = await app.inject(rota);
      const desconhecido = await app.inject({
        ...rota,
        headers: comToken('token-que-nao-existe'),
      });

      for (const resposta of [sem, desconhecido]) {
        expect(resposta.statusCode).toBe(401);
        expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
      }
    },
  );

  it('CA14 — POST sem token é recusado antes de validar o corpo e nada é gravado', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/avaliacoes',
      payload: { trampoId: TRAMPO, nota: 5, extra: true },
    });

    expect(resposta.statusCode).toBe(401);
    expect(
      await repositorio.listarRecebidas(FREELA, 'freela', { limite: 50 }),
    ).toEqual([]);
  });
});

describe('POST /avaliacoes', () => {
  it('CA87 — o autor avalia o freela aceito de um trampo encerrado: 201 só com o id', async () => {
    const resposta = await avaliar({
      trampoId: TRAMPO,
      nota: 5,
      destaques: ['pontual', 'educado'],
      comentario: '  Mandou bem  ',
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ id: uuid('cccccccc', 1) });
    const lista = await obter(`/avaliacoes?contaId=${FREELA}&papel=freela`);
    expect(lista.json().itens).toEqual([
      {
        nota: 5,
        destaques: ['pontual', 'educado'],
        comentario: 'Mandou bem',
        avaliadorId: AUTOR,
        criadaEm: INICIO,
      },
    ]);
  });

  it('CA87 — o freela aceito avalia o autor no papel contratante', async () => {
    const resposta = await avaliar(
      { trampoId: TRAMPO, nota: 4, destaques: ['pagamento_em_dia'] },
      'token-freela',
    );

    expect(resposta.statusCode).toBe(201);
    const lista = await obter(
      `/avaliacoes?contaId=${AUTOR}&papel=contratante`,
      'token-freela',
    );
    expect(lista.json().itens).toEqual([
      {
        nota: 4,
        destaques: ['pagamento_em_dia'],
        comentario: null,
        avaliadorId: FREELA,
        criadaEm: INICIO,
      },
    ]);
  });

  it('CA87 — quem não é parte recebe 404, igual ao trampo inexistente e ao em andamento visto por terceiro', async () => {
    const respostas = [
      await avaliar({ trampoId: TRAMPO, nota: 5 }, 'token-estranho'),
      await avaliar(
        { trampoId: TRAMPO_EM_ANDAMENTO, nota: 5 },
        'token-estranho',
      ),
      await avaliar({ trampoId: TRAMPO_INEXISTENTE, nota: 5 }),
    ];

    for (const resposta of respostas) {
      expect(resposta.statusCode).toBe(404);
      expect(resposta.json()).toEqual({ erro: 'nao_encontrado' });
    }
  });

  it('CA87 — parte de trampo ainda não encerrado recebe 409 trampo_nao_encerrado', async () => {
    const resposta = await avaliar({ trampoId: TRAMPO_EM_ANDAMENTO, nota: 5 });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toEqual({ erro: 'trampo_nao_encerrado' });
  });

  it('CA87 — repetir responde 409 avaliacao_ja_feita e a primeira fica', async () => {
    await avaliar({ trampoId: TRAMPO, nota: 5 });
    const repetida = await avaliar({ trampoId: TRAMPO, nota: 1 });

    expect(repetida.statusCode).toBe(409);
    expect(repetida.json()).toEqual({ erro: 'avaliacao_ja_feita' });
    const lista = await obter(`/avaliacoes?contaId=${FREELA}&papel=freela`);
    expect(lista.json().itens.map((i: { nota: number }) => i.nota)).toEqual([
      5,
    ]);
  });

  it('CA88 — corpo inválido responde 400 com todos os campos, sem o valor recebido', async () => {
    const SEGREDO = 'valor-recebido-7a1c';
    const resposta = await avaliar({
      trampoId: SEGREDO,
      nota: 4.5,
      destaques: [SEGREDO],
      comentario: `${SEGREDO}\u0000`,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'dados_invalidos',
      campos: [
        { campo: 'trampoId', motivo: 'invalido' },
        { campo: 'nota', motivo: 'invalido' },
        { campo: 'destaques', motivo: 'invalido' },
        { campo: 'comentario', motivo: 'invalido' },
      ],
    });
    expect(resposta.body).not.toContain(SEGREDO);
  });

  it.each([
    ['nota ausente', { trampoId: TRAMPO }, 'nota', 'obrigatorio'],
    ['nota 0', { trampoId: TRAMPO, nota: 0 }, 'nota', 'invalido'],
    ['nota 6', { trampoId: TRAMPO, nota: 6 }, 'nota', 'invalido'],
    ['trampoId nulo', { trampoId: null, nota: 5 }, 'trampoId', 'obrigatorio'],
    [
      'seis destaques',
      {
        trampoId: TRAMPO,
        nota: 5,
        destaques: [
          'pontual',
          'organizado',
          'rapido',
          'educado',
          'proativo',
          'pagamento_em_dia',
        ],
      },
      'destaques',
      'tamanho',
    ],
    [
      'destaque repetido',
      { trampoId: TRAMPO, nota: 5, destaques: ['pontual', 'pontual'] },
      'destaques',
      'invalido',
    ],
    [
      'destaque do outro papel',
      { trampoId: TRAMPO, nota: 5, destaques: ['pagamento_em_dia'] },
      'destaques',
      'invalido',
    ],
    [
      'comentário com 501 pontos de código',
      { trampoId: TRAMPO, nota: 5, comentario: '😀'.repeat(501) },
      'comentario',
      'tamanho',
    ],
  ])(
    'CA88 — %s responde 400 apontando o campo',
    async (_caso, corpo, campo, motivo) => {
      const resposta = await avaliar(corpo);

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo, motivo }],
      });
    },
  );

  it('CA88 — 500 pontos de código e comentário só de espaços (vira nulo) são aceitos', async () => {
    expect(
      (
        await avaliar({
          trampoId: TRAMPO,
          nota: 5,
          comentario: '😀'.repeat(500),
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await avaliar(
          { trampoId: TRAMPO, nota: 3, comentario: '   ' },
          'token-freela',
        )
      ).statusCode,
    ).toBe(201);
  });

  it('CA88 — tipo errado e chave extra (ex.: avaliadoId) respondem 400 e nada é gravado', async () => {
    const respostas = [
      await avaliar({ trampoId: TRAMPO, nota: '5' }),
      await avaliar({ trampoId: TRAMPO, nota: 5, destaques: 'pontual' }),
      await avaliar({ trampoId: TRAMPO, nota: 5, avaliadoId: ESTRANHO }),
      await avaliar({ trampoId: TRAMPO, nota: 5, papelDoAvaliado: 'freela' }),
    ];

    for (const resposta of respostas) {
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().erro).toBe('dados_invalidos');
    }
    expect(
      await repositorio.listarRecebidas(FREELA, 'freela', { limite: 50 }),
    ).toEqual([]);
  });

  it('corpo que não é objeto responde 400', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/avaliacoes',
      headers: {
        ...comToken('token-autor'),
        'content-type': 'application/json',
      },
      payload: '[1,2]',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe('dados_invalidos');
  });
});

describe('GET /avaliacoes (CA90)', () => {
  /** `n` trampos encerrados entre AUTOR e FREELA, cada um avaliado pelo autor. */
  async function avaliacoesRecebidasPeloFreela(n: number): Promise<void> {
    for (let i = 1; i <= n; i += 1) {
      const trampoId = uuid('dddddddd', i);
      vinculos.registrar(trampoId, {
        autorId: AUTOR,
        freelaAceitoId: FREELA,
        status: 'encerrado',
      });
      expect((await avaliar({ trampoId, nota: (i % 5) + 1 })).statusCode).toBe(
        201,
      );
    }
  }

  it('CA90 — 20 por página, das mais recentes às mais antigas, com cursor opaco até a última', async () => {
    await avaliacoesRecebidasPeloFreela(25);

    const primeira = await obter(
      `/avaliacoes?contaId=${FREELA}&papel=freela`,
      'token-estranho',
    );
    expect(primeira.statusCode).toBe(200);
    const corpo1 = primeira.json();
    expect(corpo1.itens).toHaveLength(20);
    expect(typeof corpo1.proximoCursor).toBe('string');

    const segunda = await obter(
      `/avaliacoes?contaId=${FREELA}&papel=freela&antesDe=${corpo1.proximoCursor}`,
      'token-estranho',
    );
    const corpo2 = segunda.json();
    expect(corpo2.itens).toHaveLength(5);
    expect(corpo2.proximoCursor).toBeNull();

    const datas = [...corpo1.itens, ...corpo2.itens].map(
      (item: { criadaEm: string }) => item.criadaEm,
    );
    expect(datas).toEqual([...datas].sort().reverse());
    expect(new Set(datas).size).toBe(25);
  });

  it('CA90 — cada item traz só nota, destaques, comentario, avaliadorId e criadaEm', async () => {
    await avaliar({ trampoId: TRAMPO, nota: 5, comentario: 'ok' });

    const resposta = await obter(`/avaliacoes?contaId=${FREELA}&papel=freela`);

    expect(Object.keys(resposta.json())).toEqual(['itens', 'proximoCursor']);
    expect(Object.keys(resposta.json().itens[0]).sort()).toEqual([
      'avaliadorId',
      'comentario',
      'criadaEm',
      'destaques',
      'nota',
    ]);
  });

  it('CA90 — limite de 1 a 50; fora disso, 400 limite', async () => {
    await avaliacoesRecebidasPeloFreela(3);

    const umaSo = await obter(
      `/avaliacoes?contaId=${FREELA}&papel=freela&limite=1`,
    );
    expect(umaSo.json().itens).toHaveLength(1);
    expect(umaSo.json().proximoCursor).not.toBeNull();

    for (const limite of ['0', '51', 'abc', '1.5', '-1', '1000']) {
      const resposta = await obter(
        `/avaliacoes?contaId=${FREELA}&papel=freela&limite=${limite}`,
      );
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'limite', motivo: 'invalido' }],
      });
    }
  });

  it('CA90 — contaId e papel ausentes ou inválidos, e cursor quebrado, respondem 400 com os campos', async () => {
    const ausentes = await obter('/avaliacoes');
    expect(ausentes.statusCode).toBe(400);
    expect(ausentes.json().campos).toEqual([
      { campo: 'contaId', motivo: 'obrigatorio' },
      { campo: 'papel', motivo: 'obrigatorio' },
    ]);

    const invalidos = await obter(
      '/avaliacoes?contaId=nao-e-uuid&papel=chefe&antesDe=%%%',
    );
    expect(invalidos.statusCode).toBe(400);
    expect(invalidos.body).not.toContain('nao-e-uuid');
    expect(invalidos.body).not.toContain('chefe');
  });

  it('CA90 — chave extra ou repetida na querystring responde 400', async () => {
    const extra = await obter(
      `/avaliacoes?contaId=${FREELA}&papel=freela&avaliadoId=${AUTOR}`,
    );
    const repetida = await obter(
      `/avaliacoes?contaId=${FREELA}&contaId=${AUTOR}&papel=freela`,
    );

    expect(extra.statusCode).toBe(400);
    expect(repetida.statusCode).toBe(400);
  });

  it('CA90 — conta sem avaliação (ou inexistente) devolve lista vazia', async () => {
    const resposta = await obter(
      `/avaliacoes?contaId=${uuid('eeeeeeee', 1)}&papel=contratante`,
    );

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ itens: [], proximoCursor: null });
  });
});

describe('GET /avaliacoes/resumos (CA89)', () => {
  it('CA89 — um resumo por conta pedida, na ordem, com média de 1 casa, total e destaques por papel', async () => {
    await avaliar({ trampoId: TRAMPO, nota: 5, destaques: ['pontual'] });
    await avaliar({ trampoId: TRAMPO, nota: 4 }, 'token-freela');
    const semAvaliacao = uuid('eeeeeeee', 1);

    const resposta = await obter(
      `/avaliacoes/resumos?contas=${semAvaliacao},${FREELA},${AUTOR}`,
      'token-estranho',
    );

    expect(resposta.statusCode).toBe(200);
    const vazio = { media: null, total: 0, destaques: [] };
    expect(resposta.json()).toEqual([
      { contaId: semAvaliacao, comoFreela: vazio, comoContratante: vazio },
      {
        contaId: FREELA,
        comoFreela: { media: 5, total: 1, destaques: ['pontual'] },
        comoContratante: vazio,
      },
      {
        contaId: AUTOR,
        comoFreela: vazio,
        comoContratante: { media: 4, total: 1, destaques: [] },
      },
    ]);
  });

  it('CA89 — aceita a chave repetida; ids que não são uuid são ignorados, sem 500', async () => {
    const resposta = await obter(
      `/avaliacoes/resumos?contas=${FREELA}&contas=nao-e-uuid`,
    );

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().map((r: { contaId: string }) => r.contaId)).toEqual([
      FREELA,
    ]);
  });

  it('CA89 — até 50 ids; 51 respondem 400 tamanho; sem contas, 400 obrigatorio; chave extra, 400', async () => {
    const ids = (n: number) =>
      Array.from({ length: n }, (_, i) => uuid('eeeeeeee', i + 1)).join(',');

    expect(
      (await obter(`/avaliacoes/resumos?contas=${ids(50)}`)).statusCode,
    ).toBe(200);
    const muitos = await obter(`/avaliacoes/resumos?contas=${ids(51)}`);
    expect(muitos.statusCode).toBe(400);
    expect(muitos.json().campos).toEqual([
      { campo: 'contas', motivo: 'tamanho' },
    ]);
    const sem = await obter('/avaliacoes/resumos');
    expect(sem.json().campos).toEqual([
      { campo: 'contas', motivo: 'obrigatorio' },
    ]);
    expect(
      (await obter(`/avaliacoes/resumos?contas=${FREELA}&extra=1`)).statusCode,
    ).toBe(400);
  });
});

describe('GET /avaliacoes/feitas (CA91)', () => {
  it('CA91 — só as avaliações da conta da sessão, com trampoId, nota e criadaEm', async () => {
    await avaliar({ trampoId: TRAMPO, nota: 5, comentario: 'privado' });
    await avaliar({ trampoId: TRAMPO, nota: 3 }, 'token-freela');

    const doAutor = await obter(
      `/avaliacoes/feitas?trampos=${TRAMPO},${TRAMPO_EM_ANDAMENTO}`,
    );
    const doEstranho = await obter(
      `/avaliacoes/feitas?trampos=${TRAMPO}`,
      'token-estranho',
    );

    expect(doAutor.statusCode).toBe(200);
    expect(doAutor.json()).toEqual([
      { trampoId: TRAMPO, nota: 5, criadaEm: INICIO },
    ]);
    expect(doEstranho.json()).toEqual([]);
  });

  it('CA91 — 51 ids respondem 400; sem trampos, 400', async () => {
    const ids = Array.from({ length: 51 }, (_, i) =>
      uuid('dddddddd', i + 1),
    ).join(',');

    expect(
      (await obter(`/avaliacoes/feitas?trampos=${ids}`)).json().campos,
    ).toEqual([{ campo: 'trampos', motivo: 'tamanho' }]);
    expect((await obter('/avaliacoes/feitas')).statusCode).toBe(400);
  });
});

describe('favoritos (CA92)', () => {
  it('CA92 — PUT com vínculo responde 204, também quando já é favorito; GET lista do mais recente ao mais antigo', async () => {
    const outro = uuid('aaaaaaaa', 10);
    verificador.vincular(AUTOR, outro);

    expect((await favoritar(FREELA)).statusCode).toBe(204);
    expect((await favoritar(outro)).statusCode).toBe(204);
    const repetido = await favoritar(FREELA);
    expect(repetido.statusCode).toBe(204);
    expect(repetido.body).toBe('');

    const lista = await obter('/favoritos');
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toEqual([
      { contaId: outro, criadoEm: '2026-11-13T12:01:00.000Z' },
      { contaId: FREELA, criadoEm: INICIO },
    ]);
  });

  it('CA92 — sem vínculo ou com id fora do formato, 404; a si mesmo, 409 favorito_invalido', async () => {
    const semVinculo = await favoritar(ESTRANHO);
    const foraDoFormato = await favoritar('nao-e-uuid');
    const aSiMesmo = await favoritar(AUTOR);

    expect(semVinculo.statusCode).toBe(404);
    expect(semVinculo.json()).toEqual({ erro: 'nao_encontrado' });
    expect(foraDoFormato.statusCode).toBe(404);
    expect(aSiMesmo.statusCode).toBe(409);
    expect(aSiMesmo.json()).toEqual({ erro: 'favorito_invalido' });
    expect((await obter('/favoritos')).json()).toEqual([]);
  });

  it('D61 — favorito já gravado e vínculo perdido: PUT responde 204 e a lista não muda', async () => {
    expect((await favoritar(FREELA)).statusCode).toBe(204);
    verificador.desvincular(AUTOR, FREELA);
    relogio.avancar(60_000);

    const repetido = await favoritar(FREELA);

    expect(repetido.statusCode).toBe(204);
    expect(repetido.body).toBe('');
    expect((await obter('/favoritos')).json()).toEqual([
      { contaId: FREELA, criadoEm: INICIO },
    ]);
  });

  it(`CA92 — com ${LIMITE_DE_FAVORITOS} favoritos, o seguinte responde 409 limite_de_favoritos`, async () => {
    for (let i = 1; i <= LIMITE_DE_FAVORITOS; i += 1) {
      const conta = uuid('ffffffff', i);
      verificador.vincular(AUTOR, conta);
      expect((await favoritar(conta)).statusCode).toBe(204);
    }
    verificador.vincular(AUTOR, ESTRANHO);

    const alem = await favoritar(ESTRANHO);

    expect(alem.statusCode).toBe(409);
    expect(alem.json()).toEqual({ erro: 'limite_de_favoritos' });
    expect((await obter('/favoritos')).json()).toHaveLength(
      LIMITE_DE_FAVORITOS,
    );
  });

  it('CA92 — DELETE responde 204, idempotente; id fora do formato, 404', async () => {
    await favoritar(FREELA);

    expect((await desfavoritar(FREELA)).statusCode).toBe(204);
    expect((await desfavoritar(FREELA)).statusCode).toBe(204);
    expect((await desfavoritar(ESTRANHO)).statusCode).toBe(204);
    expect((await desfavoritar('nao-e-uuid')).statusCode).toBe(404);
    expect((await obter('/favoritos')).json()).toEqual([]);
  });

  it('CA92 — a lista é privada: a pessoa favoritada não a vê, e cada conta vê só a sua', async () => {
    await favoritar(FREELA);

    expect((await obter('/favoritos', 'token-freela')).json()).toEqual([]);
    expect((await obter('/favoritos', 'token-estranho')).json()).toEqual([]);
  });

  it('CA92 — GET /favoritos com querystring desconhecida não muda a resposta', async () => {
    await favoritar(FREELA);

    const resposta = await obter(`/favoritos?dono=${FREELA}`, 'token-freela');

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([]);
  });
});

describe('CA93 — o comentário nunca vai para o log nem para o erro', () => {
  const SEGREDO = 'segredo-do-comentario-9b2e';

  function logTodo(): string {
    return linhasDoLog.join('\n');
  }

  it('CA93 — avaliação aceita, recusada (400, 404, 409, 401) e listagem não registram o comentário', async () => {
    await avaliar({ trampoId: TRAMPO, nota: 5, comentario: `Oi ${SEGREDO}` });
    await avaliar({ trampoId: TRAMPO, nota: 5, comentario: SEGREDO });
    await avaliar({
      trampoId: TRAMPO,
      nota: 5,
      comentario: `${SEGREDO}${'a'.repeat(501)}`,
    });
    await avaliar({
      trampoId: TRAMPO,
      nota: 5,
      comentario: `${SEGREDO}\u0000`,
    });
    await avaliar({
      trampoId: TRAMPO,
      nota: 5,
      comentario: SEGREDO,
      x: SEGREDO,
    });
    await avaliar(
      { trampoId: TRAMPO, nota: 5, comentario: SEGREDO },
      'token-estranho',
    );
    await app.inject({
      method: 'POST',
      url: '/avaliacoes',
      payload: { trampoId: TRAMPO, nota: 5, comentario: SEGREDO },
    });
    const lista = await obter(`/avaliacoes?contaId=${FREELA}&papel=freela`);
    expect(lista.body).toContain(SEGREDO);

    expect(linhasDoLog.length).toBeGreaterThan(10);
    expect(logTodo()).toContain('requisição recusada');
    expect(logTodo()).not.toContain(SEGREDO);
  });

  it('CA93 — falha do banco ao gravar (500) não registra nem devolve o comentário, nem pelo detail do driver', async () => {
    await app.close();
    const falho = new RepositorioDeAvaliacoesEmMemoria();
    falho.inserirAvaliacao = async (avaliacao) => {
      // Imita o `DatabaseError` do `pg`, que pode citar o valor no `detail`.
      throw Object.assign(new Error(`falhou: ${avaliacao.comentario}`), {
        code: '23514',
        severity: 'ERROR',
        detail: `Failing row contains (${avaliacao.comentario}).`,
      });
    };
    app = montar(falho);

    const resposta = await avaliar({
      trampoId: TRAMPO,
      nota: 5,
      comentario: `Oi ${SEGREDO}`,
    });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: 'interno' });
    expect(logTodo()).toContain('erro interno não tratado');
    expect(logTodo()).not.toContain(SEGREDO);
  });
});
