import { type Kysely, sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { down } from '../../../../../migracoes/0003_servicos.js';
import {
  bancoDeTeste,
  truncarTabelas,
} from '../../../../../test/banco-teste.js';
import { ErroTabelaNaoVazia } from '../../../../compartilhado/banco/migrador.js';
import { ErroDeValidacao } from '../../../../compartilhado/dominio/erros.js';
import type { FiltrosDeBusca } from '../../dominio/portas.js';
import {
  criarServico,
  type EntradaDeServico,
  type Servico,
} from '../../dominio/servico.js';
import { criarModuloDeServicos } from '../../index.js';
import { VerificadorDePerfilEmMemoria } from '../memoria/verificador-perfil-memoria.js';
import {
  excluirDadosDaConta,
  RepositorioDeServicosPostgres,
} from './repositorio-postgres.js';
import type { TabelasDeServicos } from './tabelas.js';

const AUTOR = '7d3c2f0e-0b4f-4a57-9f7a-2a4c1d9e8b10';
const OUTRO_AUTOR = '1f9e8d7c-6b5a-4c3d-8e2f-0a1b2c3d4e5f';
const INICIO = new Date('2026-10-20T12:00:00.000Z');

const ENTRADA: EntradaDeServico = {
  titulo: 'Eletricista residencial',
  descricao: 'Instalação e conserto de tomadas, chuveiros e quadros.',
  categoria: 'reformas',
  cidade: 'São Paulo',
  precoBaseCentavos: 15000,
};

/** Id previsível e ordenável: `…0001`, `…0002`… */
function idDe(numero: number): string {
  return `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`;
}

function servico(
  numero: number,
  dados: Partial<Record<keyof EntradaDeServico, unknown>> = {},
  opcoes: { minutos?: number; autorId?: string } = {},
): Servico {
  return criarServico(
    { ...ENTRADA, ...dados },
    {
      id: idDe(numero),
      autorId: opcoes.autorId ?? AUTOR,
      agora: new Date(INICIO.getTime() + (opcoes.minutos ?? numero) * 60_000),
    },
  );
}

const db = () => bancoDeTeste<TabelasDeServicos>();
let repositorio: RepositorioDeServicosPostgres;

async function salvarTodos(...servicos: Servico[]): Promise<void> {
  for (const s of servicos) {
    await repositorio.salvar(s);
  }
}

async function idsDaBusca(
  filtros: Partial<FiltrosDeBusca> = {},
): Promise<string[]> {
  const achados = await repositorio.buscar({ limite: 50, ...filtros });
  return achados.map((s) => s.id);
}

beforeEach(async () => {
  await truncarTabelas(['servicos']);
  repositorio = new RepositorioDeServicosPostgres(db());
});

describe('RepositorioDeServicosPostgres — ida e volta', () => {
  it('CA6 — salva e lê de volta um serviço com cidade, igual ao do domínio', async () => {
    const original = servico(1);
    await repositorio.salvar(original);

    expect(await repositorio.buscarPorId(original.id)).toEqual(original);
  });

  it('D7 — salva e lê de volta um serviço sem cidade, sem as propriedades de cidade', async () => {
    const original = servico(1, { cidade: undefined });
    await repositorio.salvar(original);

    const lido = await repositorio.buscarPorId(original.id);
    expect(lido).toEqual(original);
    expect(lido).not.toHaveProperty('cidade');
    expect(lido).not.toHaveProperty('cidadeNormalizada');
    const { rows } = await sql<{
      cidade: string | null;
      cidade_normalizada: string | null;
    }>`select cidade, cidade_normalizada from servicos`.execute(db());
    expect(rows).toEqual([{ cidade: null, cidade_normalizada: null }]);
  });

  it('buscarPorId devolve null para id inexistente e para id fora do formato uuid', async () => {
    await repositorio.salvar(servico(1));

    expect(await repositorio.buscarPorId(idDe(99))).toBeNull();
    expect(await repositorio.buscarPorId('nao-existe')).toBeNull();
    expect(await repositorio.buscarPorId('')).toBeNull();
  });

  it('listarDoAutor traz só os do autor, mais recentes primeiro', async () => {
    await salvarTodos(
      servico(1),
      servico(2, {}, { autorId: OUTRO_AUTOR }),
      servico(3),
    );

    expect((await repositorio.listarDoAutor(AUTOR)).map((s) => s.id)).toEqual([
      idDe(3),
      idDe(1),
    ]);
    expect(await repositorio.listarDoAutor(idDe(42))).toEqual([]);
    expect(await repositorio.listarDoAutor('conta-qualquer')).toEqual([]);
  });
});

describe('RepositorioDeServicosPostgres — busca (CA7)', () => {
  it('CA6 — o serviço salvo aparece na busca sem filtros', async () => {
    const original = servico(1);
    await repositorio.salvar(original);

    expect(await repositorio.buscar({ limite: 20 })).toEqual([original]);
  });

  it('CA7 — combina texto, categoria e cidade com E lógico', async () => {
    await salvarTodos(
      servico(1),
      servico(2, { categoria: 'limpeza' }),
      servico(3, { cidade: 'Recife' }),
      servico(4, { titulo: 'Pintor de paredes', descricao: 'Pintura.' }),
      servico(5, { titulo: 'Eletricista predial' }),
    );

    expect(await idsDaBusca({ texto: 'eletricista' })).toEqual([
      idDe(5),
      idDe(3),
      idDe(2),
      idDe(1),
    ]);
    expect(
      await idsDaBusca({ texto: 'eletricista', categoria: 'reformas' }),
    ).toEqual([idDe(5), idDe(3), idDe(1)]);
    expect(
      await idsDaBusca({
        texto: 'eletricista',
        categoria: 'reformas',
        cidade: 'sao paulo',
      }),
    ).toEqual([idDe(5), idDe(1)]);
    expect(
      await idsDaBusca({
        texto: 'predial',
        categoria: 'reformas',
        cidade: 'sao paulo',
      }),
    ).toEqual([idDe(5)]);
    expect(await idsDaBusca({ categoria: 'ti' })).toEqual([]);
  });

  it('CA7 — o texto casa em qualquer parte do título ou da descrição', async () => {
    await salvarTodos(servico(1), servico(2, { titulo: 'Pintor de paredes' }));

    expect(await idsDaBusca({ texto: 'chuveiros' })).toEqual([
      idDe(2),
      idDe(1),
    ]);
    expect(await idsDaBusca({ texto: 'tricista resid' })).toEqual([idDe(1)]);
  });

  it('D7 — serviço sem cidade não aparece com filtro de cidade, mas aparece sem ele', async () => {
    await salvarTodos(
      servico(1, { cidade: undefined }),
      servico(2, { cidade: 'São Paulo' }),
    );

    expect(await idsDaBusca({ cidade: 'sao paulo' })).toEqual([idDe(2)]);
    expect(await idsDaBusca()).toEqual([idDe(2), idDe(1)]);
  });

  it('CA7 — ordena por criado_em desc e desempata por id desc', async () => {
    await salvarTodos(
      servico(1, {}, { minutos: 10 }),
      servico(3, {}, { minutos: 5 }),
      servico(2, {}, { minutos: 10 }),
      servico(4, {}, { minutos: 1 }),
    );

    expect(await idsDaBusca()).toEqual([idDe(2), idDe(1), idDe(3), idDe(4)]);
  });

  it('CA7 — o cursor traz só os estritamente anteriores e o limite corta a página', async () => {
    await salvarTodos(
      servico(1, {}, { minutos: 10 }),
      servico(2, {}, { minutos: 10 }),
      servico(3, {}, { minutos: 10 }),
      servico(4, {}, { minutos: 5 }),
      servico(5, {}, { minutos: 20 }),
    );

    const vistos: string[] = [];
    let pagina = await repositorio.buscar({ limite: 2 });
    while (pagina.length > 0) {
      vistos.push(...pagina.map((s) => s.id));
      const ultimo = pagina[pagina.length - 1] as Servico;
      pagina = await repositorio.buscar({
        limite: 2,
        antesDe: { criadoEm: ultimo.criadoEm, id: ultimo.id },
      });
    }

    // Sem pular nem repetir, mesmo com três itens no mesmo instante.
    expect(vistos).toEqual([idDe(5), idDe(3), idDe(2), idDe(1), idDe(4)]);
    expect(
      await idsDaBusca({
        antesDe: {
          criadoEm: new Date(INICIO.getTime() + 10 * 60_000),
          id: idDe(2),
        },
      }),
    ).toEqual([idDe(1), idDe(4)]);
  });

  it('CA7 — o cursor combina com os filtros', async () => {
    await salvarTodos(
      servico(1),
      servico(2, { categoria: 'limpeza' }),
      servico(3),
      servico(4),
    );
    const terceiro = (await repositorio.buscarPorId(idDe(3))) as Servico;

    expect(
      await idsDaBusca({
        categoria: 'reformas',
        antesDe: { criadoEm: terceiro.criadoEm, id: terceiro.id },
      }),
    ).toEqual([idDe(1)]);
  });

  it('recusa cursor com id fora do formato uuid, sem consultar o banco', async () => {
    await expect(
      repositorio.buscar({
        limite: 20,
        antesDe: { criadoEm: INICIO, id: "x' or 1=1 --" },
      }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
  });

  it.each([
    ['%', 'Desconto de 50% à vista', 'Desconto de 500 reais', '50%'],
    ['_', 'Arquivo nome_curto', 'Arquivo nomeXcurto', 'nome_curto'],
    ['\\', 'Pasta c:\\dados', 'Pasta c:dados', 'c:\\d'],
  ])(
    'CA7 — "%s" no texto buscado é literal, não curinga',
    async (_caractere, comCaractere, semCaractere, texto) => {
      await salvarTodos(
        servico(1, { titulo: comCaractere }),
        servico(2, { titulo: semCaractere }),
      );

      expect(await idsDaBusca({ texto })).toEqual([idDe(1)]);
    },
  );

  it('CA7 — texto só com curingas não casa tudo', async () => {
    await salvarTodos(servico(1), servico(2));

    expect(await idsDaBusca({ texto: '%' })).toEqual([]);
    expect(await idsDaBusca({ texto: '_' })).toEqual([]);
  });
});

describe('migração 0003_servicos', () => {
  async function inserirLinha(
    alteracao: Record<string, unknown>,
  ): Promise<unknown> {
    const linha = {
      id: idDe(1),
      autor_id: AUTOR,
      titulo: 'Eletricista',
      descricao: 'Tomadas.',
      categoria: 'reformas',
      cidade: null,
      cidade_normalizada: null,
      texto_busca: 'eletricista tomadas.',
      preco_base_centavos: 100,
      status: 'ativo',
      criado_em: INICIO,
      ...alteracao,
    };
    try {
      await (db() as unknown as Kysely<Record<string, Record<string, unknown>>>)
        .insertInto('servicos')
        .values(linha)
        .execute();
    } catch (erro) {
      return erro;
    }
    return undefined;
  }

  it.each([
    [
      'preço zero',
      { preco_base_centavos: 0 },
      'servicos_preco_base_centavos_check',
    ],
    [
      'preço negativo',
      { preco_base_centavos: -1 },
      'servicos_preco_base_centavos_check',
    ],
    ['status desconhecido', { status: 'pausado' }, 'servicos_status_check'],
    ['cidade sem a normalizada', { cidade: 'Recife' }, 'servicos_cidade_check'],
    [
      'normalizada sem a cidade',
      { cidade_normalizada: 'recife' },
      'servicos_cidade_check',
    ],
  ])('o banco recusa %s', async (_nome, alteracao, restricao) => {
    const erro = await inserirLinha(alteracao);
    expect(erro).toMatchObject({ code: '23514', constraint: restricao });
  });

  it('o banco aceita a linha válida, com e sem cidade', async () => {
    expect(await inserirLinha({})).toBeUndefined();
    expect(
      await inserirLinha({
        id: idDe(2),
        cidade: 'Recife',
        cidade_normalizada: 'recife',
      }),
    ).toBeUndefined();
  });

  it('o down aborta com a tabela cheia e não apaga nada', async () => {
    await repositorio.salvar(servico(1));

    await expect(
      db()
        .transaction()
        .execute((trx) => down(trx as unknown as Kysely<unknown>)),
    ).rejects.toBeInstanceOf(ErroTabelaNaoVazia);
    expect(await repositorio.buscarPorId(idDe(1))).not.toBeNull();
  });

  it('o down remove a tabela vazia (dentro de uma transação desfeita)', async () => {
    class Desfazer extends Error {}
    let existiaDepoisDoDown: unknown;

    await expect(
      db()
        .transaction()
        .execute(async (trx) => {
          await down(trx as unknown as Kysely<unknown>);
          const { rows } = await sql<{
            existe: string | null;
          }>`select to_regclass('servicos')::text as existe`.execute(trx);
          existiaDepoisDoDown = rows[0]?.existe;
          throw new Desfazer();
        }),
    ).rejects.toBeInstanceOf(Desfazer);

    expect(existiaDepoisDoDown).toBeNull();
    expect(await idsDaBusca()).toEqual([]);
  });
});

describe('exclusão e exportação da conta (D25, D26, ADR-005)', () => {
  const modulo = () =>
    criarModuloDeServicos({
      db: db(),
      verificadorDePerfil: new VerificadorDePerfilEmMemoria(),
    });

  async function contarLinhas(): Promise<number> {
    const { rows } = await sql<{
      total: number;
    }>`select count(*)::int as total from servicos`.execute(db());
    return rows[0]?.total ?? -1;
  }

  /** Captura o erro lançado pela promessa (falha se ela resolver). */
  async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
    try {
      await promessa;
    } catch (erro) {
      return erro;
    }
    throw new Error('era esperada uma recusa');
  }

  it('CA17/CA18 — apaga só os serviços da conta-alvo, na transação recebida; os da outra conta ficam e continuam na busca', async () => {
    await salvarTodos(
      servico(1),
      servico(2, {}, { autorId: OUTRO_AUTOR }),
      servico(3, { cidade: undefined }),
    );

    await db()
      .transaction()
      .execute((trx) => modulo().excluirDadosDaConta(trx, AUTOR));

    expect(await repositorio.listarDoAutor(AUTOR)).toEqual([]);
    expect(await repositorio.buscarPorId(idDe(1))).toBeNull();
    expect(await idsDaBusca()).toEqual([idDe(2)]);
    expect(await contarLinhas()).toBe(1);
  });

  it('não abre transação própria: se a transação da composição desfaz, os serviços continuam', async () => {
    await salvarTodos(servico(1));
    class Desfazer extends Error {}

    await expect(
      db()
        .transaction()
        .execute(async (trx) => {
          await excluirDadosDaConta(trx, AUTOR);
          throw new Desfazer();
        }),
    ).rejects.toBeInstanceOf(Desfazer);

    expect(await contarLinhas()).toBe(1);
  });

  it('recusa conexão fora de transação e contaId fora do formato uuid, sem apagar nada', async () => {
    await salvarTodos(servico(1), servico(2, {}, { autorId: OUTRO_AUTOR }));

    expect(await erroDe(excluirDadosDaConta(db(), AUTOR))).toBeInstanceOf(
      TypeError,
    );
    for (const invalido of ['', 'nao-e-uuid', "' or 1=1 --"]) {
      const erro = await erroDe(
        db()
          .transaction()
          .execute((trx) => excluirDadosDaConta(trx, invalido)),
      );
      expect(erro).toBeInstanceOf(TypeError);
    }
    expect(await contarLinhas()).toBe(2);
  });

  it('conta sem serviços (ou segundo pedido): resolve sem erro e não mexe na outra', async () => {
    await salvarTodos(servico(2, {}, { autorId: OUTRO_AUTOR }));

    await db()
      .transaction()
      .execute((trx) => excluirDadosDaConta(trx, AUTOR));

    expect(await contarLinhas()).toBe(1);
  });

  it('CA19 — exporta só os serviços da conta, do mais antigo ao mais novo, sem colunas derivadas', async () => {
    await salvarTodos(
      servico(3, { cidade: undefined }),
      servico(1),
      servico(2, { titulo: 'TEXTO-DE-TERCEIRO' }, { autorId: OUTRO_AUTOR }),
    );

    const exportado = await modulo().exportarDadosDaConta(AUTOR);

    expect(exportado).toEqual({
      servicos: [
        {
          id: idDe(1),
          titulo: 'Eletricista residencial',
          descricao: 'Instalação e conserto de tomadas, chuveiros e quadros.',
          categoria: 'reformas',
          cidade: 'São Paulo',
          precoBaseCentavos: 15000,
          status: 'ativo',
          criadoEm: '2026-10-20T12:01:00.000Z',
        },
        {
          id: idDe(3),
          titulo: 'Eletricista residencial',
          descricao: 'Instalação e conserto de tomadas, chuveiros e quadros.',
          categoria: 'reformas',
          cidade: null,
          precoBaseCentavos: 15000,
          status: 'ativo',
          criadoEm: '2026-10-20T12:03:00.000Z',
        },
      ],
    });
    const json = JSON.stringify(exportado);
    expect(json).not.toContain('TEXTO-DE-TERCEIRO');
    expect(json).not.toContain('sao paulo');
    expect(json).not.toContain(OUTRO_AUTOR);
  });

  it('CA19 — conta sem serviços e id fora do formato exportam lista vazia', async () => {
    await salvarTodos(servico(2, {}, { autorId: OUTRO_AUTOR }));

    expect(await modulo().exportarDadosDaConta(AUTOR)).toEqual({
      servicos: [],
    });
    expect(await modulo().exportarDadosDaConta('nao-e-uuid')).toEqual({
      servicos: [],
    });
  });
});
