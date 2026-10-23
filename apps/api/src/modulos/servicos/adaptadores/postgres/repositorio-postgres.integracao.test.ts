import { type Kysely, sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { down } from '../../../../../migracoes/0003_servicos.js';
import {
  bancoDeTeste,
  truncarTabelas,
} from '../../../../../test/banco-teste.js';
import { ErroTabelaNaoVazia } from '../../../../compartilhado/banco/migrador.js';
import {
  ErroDeRegra,
  ErroDeValidacao,
} from '../../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarCasosDeUsoDeServicos } from '../../aplicacao/casos-de-uso.js';
import type {
  FiltrosDeBusca,
  RepositorioDeServicos,
} from '../../dominio/portas.js';
import {
  criarServico,
  type EntradaDeServico,
  editarServico,
  type Servico,
} from '../../dominio/servico.js';
import { criarModuloDeServicos, type ServicoExportado } from '../../index.js';
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

describe('RepositorioDeServicosPostgres — edição e exclusão (CA26, ADR-006)', () => {
  const EDICAO: EntradaDeServico = {
    titulo: 'Encanador de plantão',
    descricao: 'Vazamentos e DESENTUPIMENTO.',
    categoria: 'limpeza',
    cidade: 'Belo Horizonte',
    precoBaseCentavos: 9900,
  };

  async function linhaCrua(id: string) {
    const { rows } = await sql<{
      titulo: string;
      cidade: string | null;
      cidade_normalizada: string | null;
      texto_busca: string;
      status: string;
      criado_em: Date;
      versao: number;
    }>`select titulo, cidade, cidade_normalizada, texto_busca, status,
         criado_em, versao from servicos where id = ${id}`.execute(db());
    return rows[0];
  }

  it('CA26 — atualizar regrava os campos, o texto de busca, a cidade normalizada e a versão; a busca acha o texto novo e não o velho', async () => {
    const original = servico(1);
    await salvarTodos(original, servico(2, { titulo: 'Aulas de violão' }));

    const editado = editarServico(original, EDICAO);
    expect(await repositorio.atualizar(editado)).toBe(true);

    expect(await repositorio.buscarPorId(original.id)).toEqual(editado);
    expect(await linhaCrua(original.id)).toEqual({
      titulo: 'Encanador de plantão',
      cidade: 'Belo Horizonte',
      cidade_normalizada: 'belo horizonte',
      texto_busca: 'encanador de plantao vazamentos e desentupimento.',
      status: 'ativo',
      criado_em: original.criadoEm,
      versao: 2,
    });
    expect(await idsDaBusca({ texto: 'desentupimento' })).toEqual([idDe(1)]);
    expect(await idsDaBusca({ texto: 'eletricista' })).toEqual([]);
    expect(await idsDaBusca({ cidade: 'belo horizonte' })).toEqual([idDe(1)]);
    expect(await idsDaBusca({ cidade: 'sao paulo' })).toEqual([idDe(2)]);
    // A posição na busca segue o `criado_em`, que não muda.
    expect(await idsDaBusca()).toEqual([idDe(2), idDe(1)]);
  });

  it('D7 — editar sem cidade grava as duas colunas de cidade nulas', async () => {
    const original = servico(1);
    await repositorio.salvar(original);

    const { cidade: _cidade, ...semCidade } = EDICAO;
    expect(
      await repositorio.atualizar(editarServico(original, semCidade)),
    ).toBe(true);

    expect(await linhaCrua(original.id)).toMatchObject({
      cidade: null,
      cidade_normalizada: null,
      versao: 2,
    });
    expect(await idsDaBusca({ cidade: 'sao paulo' })).toEqual([]);
  });

  it('D33 — com a versão lida velha, de outro autor ou com id fora do formato, atualizar devolve false e nada muda', async () => {
    const original = servico(1);
    await repositorio.salvar(original);
    expect(await repositorio.atualizar(editarServico(original, EDICAO))).toBe(
      true,
    );

    const comVersaoVelha = editarServico(original, {
      ...EDICAO,
      titulo: 'Versão velha',
    });
    const deOutroAutor = editarServico(
      { ...original, autorId: OUTRO_AUTOR, versao: 2 },
      { ...EDICAO, titulo: 'De outro autor' },
    );
    const foraDoFormato = editarServico(
      { ...original, id: 'nao-e-uuid', versao: 2 },
      EDICAO,
    );
    for (const tentativa of [comVersaoVelha, deOutroAutor, foraDoFormato]) {
      expect(await repositorio.atualizar(tentativa)).toBe(false);
    }

    expect(await linhaCrua(original.id)).toMatchObject({
      titulo: 'Encanador de plantão',
      versao: 2,
    });
  });

  it('ADR-006 — dois UPDATE simultâneos com a mesma versão lida: um grava e o outro não afeta nada', async () => {
    const original = servico(1);
    await repositorio.salvar(original);

    const resultados = await Promise.all([
      repositorio.atualizar(
        editarServico(original, { ...EDICAO, titulo: 'Edição A' }),
      ),
      repositorio.atualizar(
        editarServico(original, { ...EDICAO, titulo: 'Edição B' }),
      ),
    ]);

    expect([...resultados].sort()).toEqual([false, true]);
    const linha = await linhaCrua(original.id);
    expect(linha?.versao).toBe(2);
    expect(linha?.titulo).toBe(resultados[0] ? 'Edição A' : 'Edição B');
  });

  it('D33 — duas edições simultâneas pelo caso de uso, as duas lidas na versão 1: uma vence e a outra leva conflito_de_versao', async () => {
    await repositorio.salvar(servico(1));
    // Barreira: as duas edições leem o serviço antes de qualquer gravação,
    // então só a trava do `UPDATE` separa a vencedora da perdedora.
    let leituras = 0;
    let liberar: () => void = () => undefined;
    const ambasLeram = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    const comBarreira: RepositorioDeServicos = {
      salvar: (s) => repositorio.salvar(s),
      atualizar: (s) => repositorio.atualizar(s),
      excluir: (id, autorId) => repositorio.excluir(id, autorId),
      listarDoAutor: (autorId) => repositorio.listarDoAutor(autorId),
      buscar: (filtros) => repositorio.buscar(filtros),
      buscarPorId: async (id) => {
        const lido = await repositorio.buscarPorId(id);
        leituras += 1;
        if (leituras >= 2) {
          liberar();
        }
        await ambasLeram;
        return lido;
      },
    };
    const casos = criarCasosDeUsoDeServicos({
      repositorio: comBarreira,
      verificadorDePerfil: new VerificadorDePerfilEmMemoria([AUTOR]),
      relogio: new RelogioFixo(INICIO),
    });

    const resultados = await Promise.allSettled([
      casos.editarServico(AUTOR, idDe(1), {
        ...EDICAO,
        titulo: 'Edição A',
        versao: 1,
      }),
      casos.editarServico(AUTOR, idDe(1), {
        ...EDICAO,
        titulo: 'Edição B',
        versao: 1,
      }),
    ]);

    const perdedoras = resultados.filter((r) => r.status === 'rejected');
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(perdedoras).toHaveLength(1);
    const motivo = (perdedoras[0] as PromiseRejectedResult).reason;
    expect(motivo).toBeInstanceOf(ErroDeRegra);
    expect(motivo).toMatchObject({ codigo: 'conflito_de_versao' });
    expect((await linhaCrua(idDe(1)))?.versao).toBe(2);
  });

  it('CA26 — excluir apaga só o serviço do autor e o tira da busca; repetir, outro autor e id fora do formato devolvem false', async () => {
    await salvarTodos(
      servico(1),
      servico(2),
      servico(3, {}, { autorId: OUTRO_AUTOR }),
    );

    expect(await repositorio.excluir(idDe(1), AUTOR)).toBe(true);

    expect(await repositorio.buscarPorId(idDe(1))).toBeNull();
    expect(await idsDaBusca()).toEqual([idDe(3), idDe(2)]);
    expect(await idsDaBusca({ texto: 'eletricista' })).toEqual([
      idDe(3),
      idDe(2),
    ]);
    expect(await repositorio.excluir(idDe(1), AUTOR)).toBe(false);
    expect(await repositorio.excluir(idDe(3), AUTOR)).toBe(false);
    expect(await repositorio.excluir('nao-e-uuid', AUTOR)).toBe(false);
    expect(await repositorio.excluir(idDe(2), 'nao-e-uuid')).toBe(false);
    expect(await idsDaBusca()).toEqual([idDe(3), idDe(2)]);
  });

  it('CA30 — a exportação traz os textos da última edição e não traz a versao', async () => {
    const original = servico(1);
    await repositorio.salvar(original);
    await repositorio.atualizar(editarServico(original, EDICAO));

    const exportado = await criarModuloDeServicos({
      db: db(),
      verificadorDePerfil: new VerificadorDePerfilEmMemoria(),
    }).exportarDadosDaConta(AUTOR);

    expect(exportado).toEqual({
      servicos: [
        {
          id: idDe(1),
          titulo: 'Encanador de plantão',
          descricao: 'Vazamentos e DESENTUPIMENTO.',
          categoria: 'limpeza',
          cidade: 'Belo Horizonte',
          precoBaseCentavos: 9900,
          status: 'ativo',
          criadoEm: original.criadoEm.toISOString(),
        },
      ],
    });
    expect(JSON.stringify(exportado)).not.toContain('Eletricista');
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

  /**
   * O que a medida deve dar, calculado sobre o que a exportação devolve:
   * bytes UTF-8 de cada texto exportado mais 256 por serviço.
   */
  function bytesEsperados(servicos: readonly ServicoExportado[]): number {
    return servicos.reduce(
      (total, s) =>
        total +
        Buffer.byteLength(s.titulo) +
        Buffer.byteLength(s.descricao) +
        Buffer.byteLength(s.cidade ?? '') +
        Buffer.byteLength(s.categoria) +
        Buffer.byteLength(s.status) +
        256,
      0,
    );
  }

  it('CA48 — mede no banco os bytes dos textos exportados mais 256 por serviço, e cresce com o texto', async () => {
    expect(await modulo().medirExportacao(AUTOR)).toBe(0);

    await salvarTodos(servico(1), servico(3, { cidade: undefined }));
    const { servicos } = await modulo().exportarDadosDaConta(AUTOR);
    const antes = await modulo().medirExportacao(AUTOR);
    expect(antes).toBe(bytesEsperados(servicos));
    // O banco guarda o uuid em minúsculas: a mesma conta, a mesma medida.
    expect(await modulo().medirExportacao(AUTOR.toUpperCase())).toBe(antes);

    // Mil caracteres de dois bytes: a medida é em bytes, não em caracteres.
    await salvarTodos(servico(4, { descricao: 'é'.repeat(1000) }));
    const depois = await modulo().medirExportacao(AUTOR);
    expect(depois - antes).toBe(
      bytesEsperados((await modulo().exportarDadosDaConta(AUTOR)).servicos) -
        bytesEsperados(servicos),
    );
    expect(depois - antes).toBeGreaterThanOrEqual(2000 + 256);
  });

  it('CA48 — ignora os serviços de outra conta', async () => {
    await salvarTodos(servico(1));
    const sozinho = await modulo().medirExportacao(AUTOR);

    await salvarTodos(
      servico(
        2,
        { titulo: 'TEXTO-DE-TERCEIRO', descricao: 'x'.repeat(2000) },
        { autorId: OUTRO_AUTOR },
      ),
    );

    expect(await modulo().medirExportacao(AUTOR)).toBe(sozinho);
    expect(await modulo().medirExportacao(OUTRO_AUTOR)).toBe(
      bytesEsperados(
        (await modulo().exportarDadosDaConta(OUTRO_AUTOR)).servicos,
      ),
    );
  });

  it('CA48 — id fora do formato uuid mede 0', async () => {
    await salvarTodos(servico(1));

    for (const id of ['nao-e-uuid', '', `${AUTOR}' or true --`]) {
      expect(await modulo().medirExportacao(id)).toBe(0);
    }
  });
});
