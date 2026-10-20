import { beforeEach, describe, expect, it } from 'vitest';
import { ErroDeValidacao } from '../../../compartilhado/dominio/erros.js';
import { FachadasDeBuscaEmMemoria } from '../adaptadores/memoria/fachadas-memoria.js';
import {
  type CasosDeUsoDeBusca,
  criarCasosDeUsoDeBusca,
  type ItemDeBusca,
  type PedidoDeBuscaGeral,
} from './buscar.js';
import { codificarCursor, decodificarCursor } from './cursor.js';

const BASE = Date.parse('2026-10-01T12:00:00.000Z');

let fachadas: FachadasDeBuscaEmMemoria;
let casos: CasosDeUsoDeBusca;
let minuto: number;

beforeEach(() => {
  fachadas = new FachadasDeBuscaEmMemoria();
  casos = criarCasosDeUsoDeBusca(fachadas);
  minuto = 0;
});

/** Cada item criado é 1 minuto mais novo que o anterior. */
function proximaData(): Date {
  minuto += 1;
  return new Date(BASE + minuto * 60_000);
}

function trampo(
  id: string,
  dados: {
    titulo?: string;
    descricao?: string;
    categoria?: string;
    cidade?: string;
  } = {},
): void {
  fachadas.adicionarTrampo({
    id,
    autorId: 'autor-t',
    titulo: dados.titulo ?? `Trampo ${id}`,
    descricao: dados.descricao ?? '',
    categoria: dados.categoria ?? 'reformas',
    cidade: dados.cidade ?? 'São Paulo',
    valorCentavos: 50_000,
    criadoEm: proximaData(),
  });
}

function servico(
  id: string,
  dados: {
    titulo?: string;
    descricao?: string;
    categoria?: string;
    cidade?: string;
  } = {},
): void {
  fachadas.adicionarServico({
    id,
    autorId: 'autor-s',
    titulo: dados.titulo ?? `Serviço ${id}`,
    descricao: dados.descricao ?? '',
    categoria: dados.categoria ?? 'reformas',
    ...(dados.cidade !== undefined && { cidade: dados.cidade }),
    precoBaseCentavos: 15_000,
    criadoEm: proximaData(),
  });
}

const ids = (itens: readonly ItemDeBusca[]) => itens.map((i) => i.id);

async function rejeicaoDe(pedido: PedidoDeBuscaGeral) {
  const erro = await casos.buscar(pedido).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(ErroDeValidacao);
  return (erro as ErroDeValidacao).campos;
}

describe('CA7 — busca de trampos e serviços', () => {
  it('CA7 — Dado trampos e serviços, quando busca sem filtro, então traz os dois tipos, os mais recentes primeiro', async () => {
    trampo('t1');
    servico('s1');
    trampo('t2');
    servico('s2');

    const { itens, proximoCursor } = await casos.buscar();

    expect(ids(itens)).toEqual(['s2', 't2', 's1', 't1']);
    expect(itens.map((i) => i.tipo)).toEqual([
      'servico',
      'trampo',
      'servico',
      'trampo',
    ]);
    expect(proximoCursor).toBeNull();
  });

  it('CA7 — Dado texto, categoria e cidade, quando busca, então só os itens que atendem a todos os filtros aparecem', async () => {
    trampo('t-ok', {
      titulo: 'Instalação de chuveiro',
      categoria: 'reformas',
      cidade: 'São Paulo',
    });
    trampo('t-outra-cidade', {
      titulo: 'Instalação de chuveiro',
      categoria: 'reformas',
      cidade: 'Curitiba',
    });
    trampo('t-outra-categoria', {
      titulo: 'Instalação de chuveiro',
      categoria: 'ti',
      cidade: 'São Paulo',
    });
    trampo('t-outro-texto', {
      titulo: 'Pintura de parede',
      categoria: 'reformas',
      cidade: 'São Paulo',
    });
    servico('s-ok', {
      titulo: 'INSTALAÇÃO elétrica',
      categoria: 'reformas',
      cidade: 'sao paulo',
    });
    servico('s-sem-cidade', {
      titulo: 'Instalação elétrica',
      categoria: 'reformas',
    });

    const todos = await casos.buscar({
      texto: 'instalacao',
      categoria: 'reformas',
      cidade: 'São Paulo',
    });

    expect(ids(todos.itens)).toEqual(['s-ok', 't-ok']);
    expect(ids((await casos.buscar({ texto: 'instalacao' })).itens)).toEqual([
      's-sem-cidade',
      's-ok',
      't-outra-categoria',
      't-outra-cidade',
      't-ok',
    ]);
    expect(ids((await casos.buscar({ categoria: 'ti' })).itens)).toEqual([
      't-outra-categoria',
    ]);
    expect(ids((await casos.buscar({ cidade: 'curitiba' })).itens)).toEqual([
      't-outra-cidade',
    ]);
    expect(await casos.buscar({ texto: 'encanador' })).toEqual({
      itens: [],
      proximoCursor: null,
    });
  });

  it('CA7 — Dado filtros em branco, quando busca, então equivale a não filtrar', async () => {
    trampo('t1');
    servico('s1');
    const { itens } = await casos.buscar({
      texto: '',
      categoria: '  ',
      cidade: '',
    });
    expect(ids(itens)).toEqual(['s1', 't1']);
  });

  it('CA7 — Dado tipo, quando busca, então só consulta e devolve a fonte pedida', async () => {
    trampo('t1');
    servico('s1');

    const soTrampos = await casos.buscar({ tipo: 'trampos' });
    expect(ids(soTrampos.itens)).toEqual(['t1']);
    expect(fachadas.chamadasDeServicos).toHaveLength(0);

    const soServicos = await casos.buscar({ tipo: 'servicos' });
    expect(ids(soServicos.itens)).toEqual(['s1']);
    expect(fachadas.chamadasDeTrampos).toHaveLength(1);

    expect(ids((await casos.buscar({ tipo: 'todos' })).itens)).toEqual([
      's1',
      't1',
    ]);
  });

  it('CA7 — Dado um trampo e um serviço sem cidade, quando busca, então cada item sai no formato único com o valor do seu tipo', async () => {
    trampo('t1', { titulo: 'Pintar sala' });
    servico('s1', { titulo: 'Eletricista' });

    const { itens } = await casos.buscar();

    expect(itens).toEqual([
      {
        tipo: 'servico',
        id: 's1',
        autorId: 'autor-s',
        titulo: 'Eletricista',
        categoria: 'reformas',
        cidade: null,
        precoBaseCentavos: 15_000,
        criadoEm: new Date(BASE + 2 * 60_000).toISOString(),
      },
      {
        tipo: 'trampo',
        id: 't1',
        autorId: 'autor-t',
        titulo: 'Pintar sala',
        categoria: 'reformas',
        cidade: 'São Paulo',
        valorCentavos: 50_000,
        criadoEm: new Date(BASE + 60_000).toISOString(),
      },
    ]);
  });

  it('CA7 — Dado itens com o mesmo instante, quando busca, então desempata por id decrescente', async () => {
    const mesmoInstante = new Date(BASE);
    for (const id of ['a', 'c', 'b']) {
      fachadas.adicionarTrampo({
        id,
        autorId: 'x',
        titulo: `Trampo ${id}`,
        categoria: 'ti',
        cidade: 'Natal',
        valorCentavos: 1000,
        criadoEm: mesmoInstante,
      });
    }
    expect(ids((await casos.buscar()).itens)).toEqual(['c', 'b', 'a']);
  });

  it('CA7 — Dado 25 itens intercalados, quando pagina com limite 20, então avança sem repetir nem pular', async () => {
    const criados: string[] = [];
    for (let i = 1; i <= 25; i += 1) {
      // Intercala, com sequências de dois trampos de vez em quando.
      const id = i % 3 === 0 ? `s${i}` : `t${i}`;
      if (id.startsWith('s')) {
        servico(id);
      } else {
        trampo(id);
      }
      criados.push(id);
    }
    const esperado = [...criados].reverse();

    const primeira = await casos.buscar();
    expect(primeira.itens).toHaveLength(20);
    expect(primeira.proximoCursor).not.toBeNull();

    const segunda = await casos.buscar({
      antesDe: primeira.proximoCursor as string,
    });
    expect(segunda.itens).toHaveLength(5);
    expect(segunda.proximoCursor).toBeNull();

    expect([...ids(primeira.itens), ...ids(segunda.itens)]).toEqual(esperado);
  });

  it('CA7 — Dado páginas pequenas, quando segue o cursor até o fim, então percorre todos os itens uma vez só', async () => {
    const criados: string[] = [];
    // Uma lista fica toda na frente da outra: o cursor de uma lista que não
    // aparece na página precisa ser preservado.
    for (let i = 1; i <= 7; i += 1) {
      servico(`s${i}`);
      criados.push(`s${i}`);
    }
    for (let i = 1; i <= 6; i += 1) {
      trampo(`t${i}`);
      criados.push(`t${i}`);
    }
    for (let i = 8; i <= 9; i += 1) {
      servico(`s${i}`);
      criados.push(`s${i}`);
    }

    const vistos: string[] = [];
    let cursor: string | undefined;
    let paginas = 0;
    do {
      const pagina = await casos.buscar({
        limite: 4,
        ...(cursor && { antesDe: cursor }),
      });
      vistos.push(...ids(pagina.itens));
      cursor = pagina.proximoCursor ?? undefined;
      paginas += 1;
    } while (cursor && paginas < 20);

    expect(vistos).toEqual([...criados].reverse());
    expect(paginas).toBe(4);
  });

  it('CA7 — Dado a paginação, quando consulta as fachadas, então pede limite + 1 e cada fachada só recebe o próprio cursor', async () => {
    for (let i = 1; i <= 6; i += 1) {
      if (i % 2 === 0) {
        servico(`s${i}`);
      } else {
        trampo(`t${i}`);
      }
    }
    const primeira = await casos.buscar({ limite: 3 });
    await casos.buscar({
      limite: 3,
      antesDe: primeira.proximoCursor as string,
    });

    expect(fachadas.chamadasDeTrampos[0]).toEqual({ limite: 4 });
    expect(fachadas.chamadasDeServicos[0]).toEqual({ limite: 4 });
    const cursorDaPrimeira = decodificarCursor(
      primeira.proximoCursor as string,
    );
    expect(fachadas.chamadasDeTrampos[1]?.antesDe).toEqual(
      cursorDaPrimeira.trampos,
    );
    expect(fachadas.chamadasDeServicos[1]?.antesDe).toEqual(
      cursorDaPrimeira.servicos,
    );
    // Itens mostrados: s6, t5, s4 → o cursor guarda t5 e s4, cada um na sua lista.
    expect(cursorDaPrimeira.trampos?.id).toBe('t5');
    expect(cursorDaPrimeira.servicos?.id).toBe('s4');
  });

  it('CA7 — Dado exatamente `limite` itens, quando busca, então não há próxima página', async () => {
    for (let i = 1; i <= 3; i += 1) {
      trampo(`t${i}`);
    }
    const { itens, proximoCursor } = await casos.buscar({ limite: 3 });
    expect(itens).toHaveLength(3);
    expect(proximoCursor).toBeNull();
  });

  it('CA7 — Dado tipo único, quando pagina, então o cursor só guarda a posição daquela lista', async () => {
    for (let i = 1; i <= 3; i += 1) {
      trampo(`t${i}`);
      servico(`s${i}`);
    }
    const pagina = await casos.buscar({ tipo: 'servicos', limite: 2 });
    expect(ids(pagina.itens)).toEqual(['s3', 's2']);
    const cursor = decodificarCursor(pagina.proximoCursor as string);
    expect(cursor.trampos).toBeUndefined();
    expect(cursor.servicos?.id).toBe('s2');
  });

  it('CA7 — Dado limite fora de 1 a 49, quando busca, então recusa o campo limite', async () => {
    for (const limite of [0, -1, 50, 1.5, Number.NaN]) {
      expect(await rejeicaoDe({ limite }), String(limite)).toEqual([
        { campo: 'limite', motivo: 'invalido' },
      ]);
    }
    expect((await casos.buscar({ limite: 49 })).itens).toEqual([]);
    expect((await casos.buscar({ limite: 1 })).itens).toEqual([]);
  });

  it('CA7 — Dado tipo inválido, quando busca, então recusa o campo tipo', async () => {
    for (const tipo of ['outro', 'TRAMPOS', '']) {
      expect(await rejeicaoDe({ tipo }), tipo).toEqual([
        { campo: 'tipo', motivo: 'invalido' },
      ]);
    }
    expect(fachadas.chamadasDeTrampos).toHaveLength(0);
  });

  it('CA7 — Dado cursor malformado, quando busca, então recusa o campo antesDe sem consultar as fachadas', async () => {
    const codificar = (texto: string) =>
      Buffer.from(texto).toString('base64url');
    const maus = [
      'isto não é base64url',
      'abc',
      codificar('não é json'),
      codificar('[]'),
      codificar('null'),
      codificar('{}'),
      codificar('{"x":{"c":"2026-10-01T12:00:00.000Z","id":"a"}}'),
      codificar('{"t":"texto"}'),
      codificar('{"t":{"c":"ontem","id":"a"}}'),
      codificar('{"t":{"c":"2026-10-01","id":"a"}}'),
      codificar('{"t":{"c":"2026-10-01T12:00:00.000Z","id":""}}'),
      codificar('{"t":{"c":"2026-10-01T12:00:00.000Z","id":7}}'),
      codificar('{"t":{"c":"2026-10-01T12:00:00.000Z","id":"a","extra":true}}'),
      'A'.repeat(600),
    ];
    for (const antesDe of maus) {
      expect(await rejeicaoDe({ antesDe }), antesDe.slice(0, 30)).toEqual([
        { campo: 'antesDe', motivo: 'invalido' },
      ]);
    }
    expect(fachadas.chamadasDeTrampos).toHaveLength(0);
    expect(fachadas.chamadasDeServicos).toHaveLength(0);
  });

  it('CA7 — Dado cursor com data fora de 1970 a 9999, quando busca, então recusa o campo antesDe (o Postgres recusaria a data)', async () => {
    const comData = (c: string) =>
      Buffer.from(JSON.stringify({ t: { c, id: 'a' } })).toString('base64url');
    for (const c of [
      new Date(8.64e15).toISOString(),
      new Date(-8.64e15).toISOString(),
      '0000-01-01T00:00:00.000Z',
      '1969-12-31T23:59:59.999Z',
      '+010000-01-01T00:00:00.000Z',
    ]) {
      expect(await rejeicaoDe({ antesDe: comData(c) }), c).toEqual([
        { campo: 'antesDe', motivo: 'invalido' },
      ]);
    }
    for (const c of ['1970-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z']) {
      expect(
        decodificarCursor(comData(c)).trampos?.criadoEm.toISOString(),
      ).toBe(c);
    }
    expect(fachadas.chamadasDeTrampos).toHaveLength(0);
  });

  it('CA7 — Dado vários filtros inválidos, quando busca, então aponta todos os campos de uma vez', async () => {
    expect(
      await rejeicaoDe({ tipo: 'x', limite: 0, antesDe: 'lixo!' }),
    ).toEqual([
      { campo: 'tipo', motivo: 'invalido' },
      { campo: 'limite', motivo: 'invalido' },
      { campo: 'antesDe', motivo: 'invalido' },
    ]);
  });

  it('CA7 — Dado categoria inexistente ou texto grande demais, quando busca, então o erro de validação da fachada sobe', async () => {
    expect(await rejeicaoDe({ categoria: 'inexistente' })).toEqual([
      { campo: 'categoria', motivo: 'invalido' },
    ]);
    expect(await rejeicaoDe({ texto: 'x'.repeat(101) })).toEqual([
      { campo: 'texto', motivo: 'tamanho' },
    ]);
    expect(await rejeicaoDe({ cidade: 'x'.repeat(81) })).toEqual([
      { campo: 'cidade', motivo: 'tamanho' },
    ]);
  });

  it('CA7 — Dado um cursor válido, quando codifica e decodifica, então devolve as mesmas posições', () => {
    const cursor = {
      trampos: { criadoEm: new Date(BASE), id: 'abc' },
      servicos: { criadoEm: new Date(BASE + 1), id: 'def' },
    };
    const texto = codificarCursor(cursor);
    expect(texto).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodificarCursor(texto)).toEqual(cursor);
  });
});
