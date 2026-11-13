import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import { RepositorioDeAvaliacoesEmMemoria } from '../adaptadores/memoria/repositorio-memoria.js';
import {
  VerificadorDeVinculoEmMemoria,
  VinculoDeAvaliacaoEmMemoria,
} from '../adaptadores/memoria/vinculos-memoria.js';
import {
  type CasosDeUsoDeAvaliacoes,
  criarCasosDeUsoDeAvaliacoes,
  MAXIMO_DE_IDS_POR_LOTE,
} from './casos-de-uso.js';
import { codificarCursor } from './cursor.js';

/** Uuid determinístico a partir de um número (prefixo identifica o tipo). */
function uuid(prefixo: string, n: number): string {
  return `${prefixo}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const AUTOR = uuid('aaaaaaaa', 1);
const FREELA = uuid('aaaaaaaa', 2);
const ESTRANHO = uuid('aaaaaaaa', 3);
const CANDIDATO_RECUSADO = uuid('aaaaaaaa', 4);
const TRAMPO = uuid('bbbbbbbb', 1);
const TRAMPO_ABERTO = uuid('bbbbbbbb', 2);
const TRAMPO_INEXISTENTE = uuid('bbbbbbbb', 99);

let repositorio: RepositorioDeAvaliacoesEmMemoria;
let vinculos: VinculoDeAvaliacaoEmMemoria;
let verificador: VerificadorDeVinculoEmMemoria;
let relogio: RelogioFixo;
let contador: number;
let casos: CasosDeUsoDeAvaliacoes;

beforeEach(() => {
  repositorio = new RepositorioDeAvaliacoesEmMemoria();
  vinculos = new VinculoDeAvaliacaoEmMemoria();
  vinculos.registrar(TRAMPO, {
    autorId: AUTOR,
    freelaAceitoId: FREELA,
    status: 'encerrado',
  });
  vinculos.registrar(TRAMPO_ABERTO, {
    autorId: AUTOR,
    freelaAceitoId: FREELA,
    status: 'em_andamento',
  });
  verificador = new VerificadorDeVinculoEmMemoria([
    [AUTOR, FREELA],
    [AUTOR, CANDIDATO_RECUSADO],
  ]);
  relogio = new RelogioFixo('2026-11-13T12:00:00.000Z');
  contador = 0;
  casos = criarCasosDeUsoDeAvaliacoes({
    repositorio,
    vinculoDeAvaliacao: vinculos,
    verificadorDeVinculo: verificador,
    relogio,
    gerarId: () => {
      contador += 1;
      return uuid('cccccccc', contador);
    },
  });
});

async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava um erro');
}

/** Registra um trampo encerrado entre `autor` e `freela`. */
function trampoEncerrado(n: number, autor: string, freela: string): string {
  const id = uuid('dddddddd', n);
  vinculos.registrar(id, {
    autorId: autor,
    freelaAceitoId: freela,
    status: 'encerrado',
  });
  return id;
}

async function recebidas(contaId: string, papel: string) {
  return (await casos.listarRecebidas({ contaId, papel })).itens;
}

describe('CA87 — quem pode avaliar', () => {
  it('CA87 — Dado um trampo encerrado com candidatura aceita, quando o autor avalia, então a avaliação do freela aceito é gravada no papel freela', async () => {
    const { id } = await casos.avaliar(AUTOR, {
      trampoId: TRAMPO,
      nota: 5,
      destaques: ['pontual'],
      comentario: 'Mandou bem',
    });

    expect(id).toBe(uuid('cccccccc', 1));
    expect(await recebidas(FREELA, 'freela')).toEqual([
      {
        nota: 5,
        destaques: ['pontual'],
        comentario: 'Mandou bem',
        avaliadorId: AUTOR,
        criadaEm: new Date('2026-11-13T12:00:00.000Z'),
      },
    ]);
    expect(await recebidas(FREELA, 'contratante')).toEqual([]);
  });

  it('CA87 — Dado o mesmo trampo, quando o freela aceito avalia, então a avaliação do autor é gravada no papel contratante', async () => {
    await casos.avaliar(FREELA, {
      trampoId: TRAMPO,
      nota: 4,
      destaques: ['pagamento_em_dia'],
    });

    expect(await recebidas(AUTOR, 'contratante')).toMatchObject([
      { nota: 4, destaques: ['pagamento_em_dia'], avaliadorId: FREELA },
    ]);
    expect(await recebidas(AUTOR, 'freela')).toEqual([]);
  });

  it('CA87 — Dado quem não é parte (terceiro, candidato não aceito) ou um trampo inexistente, quando avalia, então recebe o mesmo 404 e nada é gravado', async () => {
    const tentativas = [
      casos.avaliar(ESTRANHO, { trampoId: TRAMPO, nota: 5 }),
      casos.avaliar(CANDIDATO_RECUSADO, { trampoId: TRAMPO, nota: 5 }),
      casos.avaliar(AUTOR, { trampoId: TRAMPO_INEXISTENTE, nota: 5 }),
      // Terceiro num trampo não encerrado: o mesmo 404, sem revelar o estado.
      casos.avaliar(ESTRANHO, { trampoId: TRAMPO_ABERTO, nota: 5 }),
    ];

    for (const tentativa of tentativas) {
      const erro = await erroDe(tentativa);
      expect(erro).toBeInstanceOf(ErroNaoEncontrado);
      expect((erro as ErroNaoEncontrado).codigo).toBe('nao_encontrado');
    }
    expect(await recebidas(FREELA, 'freela')).toEqual([]);
    expect(await recebidas(AUTOR, 'contratante')).toEqual([]);
  });

  it('CA87 — Dado um trampo ainda não encerrado, quando uma das partes avalia, então recebe 409 trampo_nao_encerrado e nada é gravado', async () => {
    for (const parte of [AUTOR, FREELA]) {
      const erro = await erroDe(
        casos.avaliar(parte, { trampoId: TRAMPO_ABERTO, nota: 5 }),
      );
      expect(erro).toEqual(new ErroDeRegra('trampo_nao_encerrado'));
    }
    expect(await recebidas(FREELA, 'freela')).toEqual([]);
  });

  it('CA87 — Dado uma avaliação já feita, quando a mesma conta avalia de novo o trampo, então recebe 409 avaliacao_ja_feita e a primeira fica como está', async () => {
    await casos.avaliar(AUTOR, { trampoId: TRAMPO, nota: 5 });
    relogio.avancar(60_000);

    const erro = await erroDe(
      casos.avaliar(AUTOR, { trampoId: TRAMPO.toUpperCase(), nota: 1 }),
    );

    expect(erro).toEqual(new ErroDeRegra('avaliacao_ja_feita'));
    expect(await recebidas(FREELA, 'freela')).toMatchObject([{ nota: 5 }]);
    // A outra parte ainda avalia o mesmo trampo.
    await expect(
      casos.avaliar(FREELA, { trampoId: TRAMPO, nota: 3 }),
    ).resolves.toEqual({ id: expect.any(String) });
  });

  it('CA87 — Dado uma rajada de 20 pedidos iguais, quando chegam juntos, então só 1 grava e os outros 19 recebem avaliacao_ja_feita', async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        casos.avaliar(AUTOR, { trampoId: TRAMPO, nota: 5 }),
      ),
    );

    const gravados = resultados.filter((r) => r.status === 'fulfilled');
    const recusados = resultados.filter((r) => r.status === 'rejected');
    expect(gravados).toHaveLength(1);
    expect(recusados).toHaveLength(19);
    for (const recusado of recusados) {
      expect((recusado as PromiseRejectedResult).reason).toEqual(
        new ErroDeRegra('avaliacao_ja_feita'),
      );
    }
    expect(await recebidas(FREELA, 'freela')).toHaveLength(1);
  });

  it('CA87 — Dado que o vínculo some entre a leitura e a gravação (exclusão de conta), quando avalia, então recebe 404 e nada é gravado', async () => {
    const obter = vi.spyOn(vinculos, 'obter');
    obter.mockResolvedValueOnce({
      avaliadoId: FREELA,
      papelDoAvaliado: 'freela',
    });
    vinculos.remover(TRAMPO);

    const erro = await erroDe(
      casos.avaliar(AUTOR, { trampoId: TRAMPO, nota: 5 }),
    );

    expect(erro).toBeInstanceOf(ErroNaoEncontrado);
    expect(obter).toHaveBeenCalledTimes(2);
    expect(await recebidas(FREELA, 'freela')).toEqual([]);
  });

  it('CA87 — Dado um vínculo incoerente que aponta a própria conta como avaliada, quando avalia, então recebe 404, nunca um 500', async () => {
    vi.spyOn(vinculos, 'obter').mockResolvedValue({
      avaliadoId: AUTOR,
      papelDoAvaliado: 'freela',
    });

    expect(
      await erroDe(casos.avaliar(AUTOR, { trampoId: TRAMPO, nota: 5 })),
    ).toBeInstanceOf(ErroNaoEncontrado);
  });
});

describe('CA88 — validação da avaliação', () => {
  it('CA88 — Dado um corpo inválido, quando qualquer conta avalia, então recebe 400 com os campos antes de qualquer leitura do trampo', async () => {
    const obter = vi.spyOn(vinculos, 'obter');

    const erro = await erroDe(
      casos.avaliar(ESTRANHO, {
        trampoId: TRAMPO,
        nota: 0,
        destaques: ['pontual', 'pontual'],
        comentario: 'x'.repeat(501),
      }),
    );

    expect(erro).toBeInstanceOf(ErroDeValidacao);
    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'nota', motivo: 'invalido' },
      { campo: 'destaques', motivo: 'invalido' },
      { campo: 'comentario', motivo: 'tamanho' },
    ]);
    expect(obter).not.toHaveBeenCalled();
  });

  it.each([
    ['nota fracionária', { nota: 4.5 }, 'nota', 'invalido'],
    ['nota 6', { nota: 6 }, 'nota', 'invalido'],
    ['nota ausente', { nota: undefined }, 'nota', 'obrigatorio'],
    [
      'mais de 5 destaques',
      {
        nota: 5,
        destaques: [
          'pontual',
          'organizado',
          'rapido',
          'educado',
          'proativo',
          'respeitoso',
        ],
      },
      'destaques',
      'tamanho',
    ],
    [
      'comentário com caractere nulo',
      { nota: 5, comentario: 'a\u0000b' },
      'comentario',
      'invalido',
    ],
  ])(
    'CA88 — Dado %s, quando o autor avalia, então recebe 400 só com o campo e o motivo',
    async (_caso, corpo, campo, motivo) => {
      const erro = await erroDe(
        casos.avaliar(AUTOR, { trampoId: TRAMPO, ...corpo }),
      );
      expect((erro as ErroDeValidacao).campos).toEqual([{ campo, motivo }]);
    },
  );

  it('CA88 — Dado um destaque da lista do outro papel, quando a parte avalia, então recebe 400 destaques e nada é gravado', async () => {
    const doAutor = await erroDe(
      casos.avaliar(AUTOR, {
        trampoId: TRAMPO,
        nota: 5,
        destaques: ['pagamento_em_dia'],
      }),
    );
    const doFreela = await erroDe(
      casos.avaliar(FREELA, {
        trampoId: TRAMPO,
        nota: 5,
        destaques: ['rapido'],
      }),
    );

    for (const erro of [doAutor, doFreela]) {
      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'destaques', motivo: 'invalido' },
      ]);
    }
    expect(await recebidas(FREELA, 'freela')).toEqual([]);
    expect(await recebidas(AUTOR, 'contratante')).toEqual([]);
  });

  it('CA88 — Dado um comentário com espaços nas pontas e 500 pontos de código, quando o autor avalia, então ele é gravado aparado', async () => {
    const comentario = `  ${'é'.repeat(499)}😀\n`;

    await casos.avaliar(AUTOR, { trampoId: TRAMPO, nota: 5, comentario });

    expect(await recebidas(FREELA, 'freela')).toMatchObject([
      { comentario: `${'é'.repeat(499)}😀` },
    ]);
  });

  it('CA88 — Dado um comentário só de espaços, quando o autor avalia, então a avaliação fica sem comentário', async () => {
    await casos.avaliar(AUTOR, {
      trampoId: TRAMPO,
      nota: 5,
      comentario: '   ',
    });

    expect(await recebidas(FREELA, 'freela')).toMatchObject([
      { comentario: null },
    ]);
  });

  it('CA88 — Dado um 400, então o erro nunca devolve o valor recebido', async () => {
    const comentario = `meu-comentario-pessoal-${'z'.repeat(600)}`;

    const erro = await erroDe(
      casos.avaliar(AUTOR, { trampoId: TRAMPO, nota: 5, comentario }),
    );

    const serializado = `${(erro as Error).message} ${JSON.stringify(erro)}`;
    expect(serializado).not.toContain('meu-comentario-pessoal');
  });
});

describe('CA89 — resumos em lote', () => {
  it('CA89 — Dado avaliações recebidas nos dois papéis, quando pede os resumos, então cada conta vem na ordem pedida com média de 1 casa, total e até 3 destaques por papel', async () => {
    const notas = [5, 4, 4, 4];
    const destaques = [
      ['educado', 'pontual'],
      ['educado', 'rapido'],
      ['educado', 'pontual', 'organizado'],
      ['proativo'],
    ];
    // O FREELA recebe 4 avaliações como freela, de 4 trampos com autores diferentes.
    for (const [i, nota] of notas.entries()) {
      const autor = uuid('eeeeeeee', i + 1);
      const trampo = trampoEncerrado(i + 1, autor, FREELA);
      await casos.avaliar(autor, {
        trampoId: trampo,
        nota,
        destaques: destaques[i],
      });
    }
    // O AUTOR recebe uma como contratante.
    await casos.avaliar(FREELA, { trampoId: TRAMPO, nota: 3 });
    // E o FREELA também contrata: recebe uma como contratante.
    const trampoDoFreela = trampoEncerrado(50, FREELA, ESTRANHO);
    await casos.avaliar(ESTRANHO, {
      trampoId: trampoDoFreela,
      nota: 2,
      destaques: ['respeitoso'],
    });

    const resumos = await casos.resumir(
      [ESTRANHO.toUpperCase(), FREELA, AUTOR].join(','),
    );

    expect(resumos).toEqual([
      {
        contaId: ESTRANHO,
        comoFreela: { media: null, total: 0, destaques: [] },
        comoContratante: { media: null, total: 0, destaques: [] },
      },
      {
        contaId: FREELA,
        comoFreela: {
          media: 4.3,
          total: 4,
          destaques: ['educado', 'pontual', 'organizado'],
        },
        comoContratante: { media: 2, total: 1, destaques: ['respeitoso'] },
      },
      {
        contaId: AUTOR,
        comoFreela: { media: null, total: 0, destaques: [] },
        comoContratante: { media: 3, total: 1, destaques: [] },
      },
    ]);
  });

  it('CA89 — Dado ids repetidos e ids fora do formato, quando pede os resumos, então os inválidos são ignorados sem erro e cada conta vem uma vez', async () => {
    const contar = vi.spyOn(repositorio, 'contarRecebidas');

    const resumos = await casos.resumir(
      [FREELA, 'nao-e-uuid', '', FREELA.toUpperCase(), "1' or 1=1"].join(','),
    );

    expect(resumos.map((r) => r.contaId)).toEqual([FREELA]);
    expect(contar).toHaveBeenCalledWith([FREELA]);
  });

  it('CA89 — Dado só ids inválidos, quando pede os resumos, então a lista vem vazia sem consultar o repositório', async () => {
    const contar = vi.spyOn(repositorio, 'contarRecebidas');

    expect(await casos.resumir('x,y')).toEqual([]);
    expect(await casos.resumir([])).toEqual([]);
    expect(contar).not.toHaveBeenCalled();
  });

  it('CA89 — Dado mais de 50 ids ou o lote ausente, quando pede os resumos, então recebe 400 no campo contas', async () => {
    const lote = Array.from({ length: MAXIMO_DE_IDS_POR_LOTE + 1 }, (_, i) =>
      uuid('ffffffff', i),
    );

    for (const [bruto, motivo] of [
      [lote.join(','), 'tamanho'],
      [lote, 'tamanho'],
      ['a'.repeat(5000), 'tamanho'],
      [undefined, 'obrigatorio'],
      [42, 'invalido'],
    ] as const) {
      const erro = await erroDe(casos.resumir(bruto));
      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'contas', motivo },
      ]);
    }
    await expect(
      casos.resumir(lote.slice(0, 50).join(',')),
    ).resolves.toHaveLength(50);
  });
});

describe('CA90 — avaliações recebidas, paginadas', () => {
  /** O FREELA recebe `n` avaliações, uma por minuto. */
  async function receber(n: number): Promise<void> {
    for (let i = 1; i <= n; i += 1) {
      const autor = uuid('eeeeeeee', i);
      await casos.avaliar(autor, {
        trampoId: trampoEncerrado(i, autor, FREELA),
        nota: (i % 5) + 1,
        comentario: `comentário ${i}`,
      });
      relogio.avancar(60_000);
    }
  }

  it('CA90 — Dado 45 avaliações, quando pagina sem limite, então vêm 20 por vez, das mais recentes para as mais antigas, até a última página sem cursor', async () => {
    await receber(45);

    const primeira = await casos.listarRecebidas({
      contaId: FREELA,
      papel: 'freela',
    });
    const segunda = await casos.listarRecebidas({
      contaId: FREELA,
      papel: 'freela',
      antesDe: primeira.proximoCursor,
    });
    const terceira = await casos.listarRecebidas({
      contaId: FREELA,
      papel: 'freela',
      antesDe: segunda.proximoCursor,
    });

    expect(primeira.itens).toHaveLength(20);
    expect(segunda.itens).toHaveLength(20);
    expect(terceira.itens).toHaveLength(5);
    expect(terceira.proximoCursor).toBeNull();
    const comentarios = [
      ...primeira.itens,
      ...segunda.itens,
      ...terceira.itens,
    ].map((item) => item.comentario);
    expect(comentarios).toEqual(
      Array.from({ length: 45 }, (_, i) => `comentário ${45 - i}`),
    );
  });

  it('CA90 — Dado um limite de 50, quando pagina, então vêm até 50; acima de 50 ou fora de inteiro recebe 400 limite', async () => {
    await receber(51);

    const pagina = await casos.listarRecebidas({
      contaId: FREELA,
      papel: 'freela',
      limite: 50,
    });
    expect(pagina.itens).toHaveLength(50);
    expect(pagina.proximoCursor).not.toBeNull();

    for (const limite of [0, 51, 2.5, '10', Number.NaN]) {
      const erro = await erroDe(
        casos.listarRecebidas({ contaId: FREELA, papel: 'freela', limite }),
      );
      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'limite', motivo: 'invalido' },
      ]);
    }
  });

  it('CA90 — Dado uma página exatamente cheia, quando não há mais nada, então o cursor vem nulo', async () => {
    await receber(20);

    const pagina = await casos.listarRecebidas({
      contaId: FREELA,
      papel: 'freela',
    });

    expect(pagina.itens).toHaveLength(20);
    expect(pagina.proximoCursor).toBeNull();
  });

  it('CA90 — Dado avaliações criadas no mesmo instante, quando pagina de 1 em 1, então o id desempata e nenhuma se repete nem some', async () => {
    for (let i = 1; i <= 3; i += 1) {
      const autor = uuid('eeeeeeee', i);
      await casos.avaliar(autor, {
        trampoId: trampoEncerrado(i, autor, FREELA),
        nota: i,
      });
    }

    const notas: number[] = [];
    let antesDe: string | null = null;
    do {
      const pagina: Awaited<ReturnType<typeof casos.listarRecebidas>> =
        await casos.listarRecebidas({
          contaId: FREELA,
          papel: 'freela',
          limite: 1,
          ...(antesDe !== null && { antesDe }),
        });
      notas.push(...pagina.itens.map((item) => item.nota));
      antesDe = pagina.proximoCursor;
    } while (antesDe !== null);

    // Ids gerados em ordem crescente: o maior id (a última) vem primeiro.
    expect(notas).toEqual([3, 2, 1]);
  });

  it('CA90 — Dado uma avaliação recebida, então o item traz só nota, destaques, comentario, avaliadorId e criadaEm', async () => {
    await casos.avaliar(AUTOR, {
      trampoId: TRAMPO,
      nota: 5,
      destaques: ['rapido'],
      comentario: 'ok',
    });

    const [item] = await recebidas(FREELA, 'freela');

    expect(Object.keys(item ?? {}).sort()).toEqual([
      'avaliadorId',
      'comentario',
      'criadaEm',
      'destaques',
      'nota',
    ]);
  });

  it('CA90 — Dado filtros inválidos, quando lista, então recebe 400 com todos os campos e sem consultar o repositório', async () => {
    const listar = vi.spyOn(repositorio, 'listarRecebidas');

    const erro = await erroDe(
      casos.listarRecebidas({
        contaId: 'nao-e-uuid',
        papel: 'chefe',
        antesDe: 'lixo!',
        limite: 99,
      }),
    );
    const semNada = await erroDe(casos.listarRecebidas({}));

    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'contaId', motivo: 'invalido' },
      { campo: 'papel', motivo: 'invalido' },
      { campo: 'limite', motivo: 'invalido' },
      { campo: 'antesDe', motivo: 'invalido' },
    ]);
    expect((semNada as ErroDeValidacao).campos).toEqual([
      { campo: 'contaId', motivo: 'obrigatorio' },
      { campo: 'papel', motivo: 'obrigatorio' },
    ]);
    expect(listar).not.toHaveBeenCalled();
  });

  it.each([
    ['base64 de algo que não é JSON', Buffer.from('oi').toString('base64url')],
    [
      'campo a mais',
      Buffer.from(
        JSON.stringify({ c: '2026-11-13T12:00:00.000Z', id: TRAMPO, x: 1 }),
      ).toString('base64url'),
    ],
    [
      'id fora do formato',
      Buffer.from(
        JSON.stringify({ c: '2026-11-13T12:00:00.000Z', id: '1 or 1=1' }),
      ).toString('base64url'),
    ],
    [
      'data fora do ISO',
      Buffer.from(JSON.stringify({ c: '13/11/2026', id: TRAMPO })).toString(
        'base64url',
      ),
    ],
    [
      'data antes de 1970',
      codificarCursor({
        criadaEm: new Date('1969-12-31T00:00:00.000Z'),
        id: TRAMPO,
      }),
    ],
    ['texto longo', 'a'.repeat(300)],
    ['outro tipo', 12],
  ])(
    'CA90 — Dado um cursor com %s, quando lista, então recebe 400 antesDe',
    async (_caso, antesDe) => {
      const erro = await erroDe(
        casos.listarRecebidas({ contaId: FREELA, papel: 'freela', antesDe }),
      );
      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'antesDe', motivo: 'invalido' },
      ]);
    },
  );

  it('CA90 — Dado uma conta sem avaliações (ou inexistente), quando lista, então vem vazia, sem dizer se a conta existe', async () => {
    expect(
      await casos.listarRecebidas({
        contaId: uuid('99999999', 1),
        papel: 'freela',
      }),
    ).toEqual({ itens: [], proximoCursor: null });
  });
});

describe('CA91 — avaliações feitas pela própria conta', () => {
  it('CA91 — Dado avaliações minhas e de outros nos mesmos trampos, quando pede as feitas, então vêm só as minhas, com trampoId, nota e criadaEm', async () => {
    const outroTrampo = trampoEncerrado(1, AUTOR, ESTRANHO);
    await casos.avaliar(AUTOR, { trampoId: TRAMPO, nota: 5, comentario: 'x' });
    relogio.avancar(60_000);
    await casos.avaliar(FREELA, { trampoId: TRAMPO, nota: 2 });
    await casos.avaliar(ESTRANHO, { trampoId: outroTrampo, nota: 1 });

    const feitas = await casos.listarFeitas(
      AUTOR,
      [TRAMPO, outroTrampo, TRAMPO_ABERTO].join(','),
    );

    expect(feitas).toEqual([
      {
        trampoId: TRAMPO,
        nota: 5,
        criadaEm: new Date('2026-11-13T12:00:00.000Z'),
      },
    ]);
    expect(await casos.listarFeitas(FREELA, TRAMPO)).toEqual([
      {
        trampoId: TRAMPO,
        nota: 2,
        criadaEm: new Date('2026-11-13T12:01:00.000Z'),
      },
    ]);
  });

  it('CA91 — Dado ids inválidos, repetidos ou mais de 50, quando pede as feitas, então ignora os inválidos e recusa o lote grande com 400', async () => {
    await casos.avaliar(AUTOR, { trampoId: TRAMPO, nota: 5 });

    expect(
      await casos.listarFeitas(AUTOR, [TRAMPO.toUpperCase(), TRAMPO, 'x']),
    ).toHaveLength(1);
    const lote = Array.from({ length: 51 }, (_, i) => uuid('ffffffff', i));
    const erro = await erroDe(casos.listarFeitas(AUTOR, lote.join(',')));
    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'trampos', motivo: 'tamanho' },
    ]);
  });
});

describe('CA92 — equipe favorita', () => {
  it('CA92 — Dado um vínculo, quando o contratante favorita o freela, então ele aparece na lista; repetir não muda nada', async () => {
    await casos.favoritar(AUTOR, FREELA);
    relogio.avancar(60_000);
    await expect(casos.favoritar(AUTOR, FREELA.toUpperCase())).resolves.toBe(
      undefined,
    );

    expect(await casos.listarFavoritos(AUTOR)).toEqual([
      { contaId: FREELA, criadoEm: new Date('2026-11-13T12:00:00.000Z') },
    ]);
  });

  it('CA92 — Dado nenhum vínculo, quando favorita, então recebe 404 e nada é gravado', async () => {
    const erro = await erroDe(casos.favoritar(AUTOR, ESTRANHO));

    expect(erro).toBeInstanceOf(ErroNaoEncontrado);
    expect(await casos.listarFavoritos(AUTOR)).toEqual([]);
  });

  it('CA92 — Dado um id fora do formato uuid, quando favorita ou desfavorita, então recebe 404', async () => {
    for (const promessa of [
      casos.favoritar(AUTOR, 'nao-e-uuid'),
      casos.desfavoritar(AUTOR, 'nao-e-uuid'),
    ]) {
      expect(await erroDe(promessa)).toBeInstanceOf(ErroNaoEncontrado);
    }
  });

  it('CA92 — Dado a própria conta, quando favorita a si mesmo, então recebe 409 favorito_invalido', async () => {
    expect(await erroDe(casos.favoritar(AUTOR, AUTOR.toUpperCase()))).toEqual(
      new ErroDeRegra('favorito_invalido'),
    );
  });

  it('CA92 — Dado 200 favoritos, quando favorita mais um, então recebe 409 limite_de_favoritos; repetir um que já existe continua 204', async () => {
    for (let i = 1; i <= 200; i += 1) {
      const freela = uuid('12345678', i);
      verificador.vincular(AUTOR, freela);
      await casos.favoritar(AUTOR, freela);
    }
    const novo = uuid('12345678', 201);
    verificador.vincular(AUTOR, novo);

    expect(await erroDe(casos.favoritar(AUTOR, novo))).toEqual(
      new ErroDeRegra('limite_de_favoritos'),
    );
    await expect(
      casos.favoritar(AUTOR, uuid('12345678', 1)),
    ).resolves.toBeUndefined();
    expect(await casos.listarFavoritos(AUTOR)).toHaveLength(200);

    await casos.desfavoritar(AUTOR, uuid('12345678', 1));
    await expect(casos.favoritar(AUTOR, novo)).resolves.toBeUndefined();
  });

  it('CA92 — Dado 199 favoritos, quando dois pedidos chegam juntos, então só um passa do teto', async () => {
    for (let i = 1; i <= 199; i += 1) {
      const freela = uuid('12345678', i);
      verificador.vincular(AUTOR, freela);
      await casos.favoritar(AUTOR, freela);
    }
    const [a, b] = [uuid('12345678', 300), uuid('12345678', 301)];
    verificador.vincular(AUTOR, a);
    verificador.vincular(AUTOR, b);

    const resultados = await Promise.allSettled([
      casos.favoritar(AUTOR, a),
      casos.favoritar(AUTOR, b),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await casos.listarFavoritos(AUTOR)).toHaveLength(200);
  });

  it('CA92 — Dado que a conferência do vínculo dentro da gravação dá negativo, quando favorita, então recebe 404 e nada é gravado', async () => {
    const existe = vi.spyOn(verificador, 'existeVinculoEntre');
    existe.mockResolvedValueOnce(false);

    expect(await erroDe(casos.favoritar(AUTOR, FREELA))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect(existe).toHaveBeenCalledTimes(1);
    expect(await casos.listarFavoritos(AUTOR)).toEqual([]);
  });

  it('D61 — Dado um favorito já gravado e o vínculo perdido, quando favorita de novo, então responde 204 sem conferir o vínculo e a lista não muda', async () => {
    await casos.favoritar(AUTOR, FREELA);
    verificador.desvincular(AUTOR, FREELA);
    relogio.avancar(60_000);
    const existe = vi.spyOn(verificador, 'existeVinculoEntre');

    await expect(casos.favoritar(AUTOR, FREELA)).resolves.toBeUndefined();

    expect(existe).not.toHaveBeenCalled();
    expect(await casos.listarFavoritos(AUTOR)).toEqual([
      { contaId: FREELA, criadoEm: new Date('2026-11-13T12:00:00.000Z') },
    ]);
  });

  it('D61 — Dado 200 favoritos, quando favorita um novo sem vínculo, então recebe 404 (o vínculo vem antes do teto); um já gravado sem vínculo continua 204', async () => {
    for (let i = 1; i <= 200; i += 1) {
      const freela = uuid('12345678', i);
      verificador.vincular(AUTOR, freela);
      await casos.favoritar(AUTOR, freela);
    }
    verificador.desvincular(AUTOR, uuid('12345678', 1));

    expect(await erroDe(casos.favoritar(AUTOR, ESTRANHO))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    await expect(
      casos.favoritar(AUTOR, uuid('12345678', 1)),
    ).resolves.toBeUndefined();
    expect(await casos.listarFavoritos(AUTOR)).toHaveLength(200);
  });

  it('CA92 — Dado um favorito, quando desfavorita duas vezes, então as duas respondem sem erro e ele some da lista', async () => {
    await casos.favoritar(AUTOR, FREELA);

    await casos.desfavoritar(AUTOR, FREELA.toUpperCase());
    await expect(casos.desfavoritar(AUTOR, FREELA)).resolves.toBeUndefined();
    // Nunca favoritado também responde sem erro.
    await expect(casos.desfavoritar(AUTOR, ESTRANHO)).resolves.toBeUndefined();

    expect(await casos.listarFavoritos(AUTOR)).toEqual([]);
  });

  it('CA92 — Dado vários favoritos, quando lista, então vêm do mais recente para o mais antigo', async () => {
    await casos.favoritar(AUTOR, FREELA);
    relogio.avancar(60_000);
    await casos.favoritar(AUTOR, CANDIDATO_RECUSADO);

    expect((await casos.listarFavoritos(AUTOR)).map((f) => f.contaId)).toEqual([
      CANDIDATO_RECUSADO,
      FREELA,
    ]);
  });

  it('CA92 — Dado que fui favoritado, quando listo os meus favoritos, então não vejo quem me favoritou', async () => {
    await casos.favoritar(AUTOR, FREELA);

    expect(await casos.listarFavoritos(FREELA)).toEqual([]);
  });
});
