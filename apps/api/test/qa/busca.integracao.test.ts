/**
 * QA — CA7 pela API montada: filtros combinados com E, texto com acento e
 * curingas do LIKE, limites de página, cursor reutilizado e cursor forjado.
 * O relógio avança 1 s a cada leitura, então "mais recentes primeiro" não
 * depende da velocidade da máquina.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Aplicacao } from '../../src/composicao.js';
import {
  criarUsuario,
  limparBanco,
  montar,
  ofertarServico,
  pedir,
  publicarTrampo,
  relogioQueAvanca,
  type Usuario,
} from './apoio.js';

let app: Aplicacao;
let autor: Usuario;
let leitor: Usuario;

beforeAll(async () => {
  await limparBanco();
  app = await montar({ relogio: relogioQueAvanca() });
  autor = await criarUsuario(app);
  leitor = await criarUsuario(app);
});

afterAll(async () => {
  await app?.fechar();
  await limparBanco();
});

beforeEach(async () => {
  const db = (await import('../banco-teste.js')).bancoDeTeste();
  await db.deleteFrom('candidaturas' as never).execute();
  await db.deleteFrom('trampos' as never).execute();
  await db.deleteFrom('servicos' as never).execute();
});

interface Item {
  tipo: 'trampo' | 'servico';
  id: string;
  cidade: string | null;
  categoria: string;
}

async function buscar(query: string, token = leitor.token) {
  const r = await pedir(app, 'GET', `/busca${query}`, { token });
  return {
    ...r,
    itens: ((r.corpo as { itens?: Item[] })?.itens ?? []) as Item[],
    proximoCursor: (r.corpo as { proximoCursor?: string | null })
      ?.proximoCursor,
  };
}

describe('CA7 — filtros combinados com E', () => {
  it('só traz o item que atende texto, categoria e cidade ao mesmo tempo', async () => {
    const t1 = await publicarTrampo(app, autor, {
      titulo: 'Pintar muro',
      categoria: 'reformas',
      cidade: 'Lavras',
    });
    await publicarTrampo(app, autor, {
      titulo: 'Pintar muro',
      categoria: 'reformas',
      cidade: 'Ijaci',
    });
    await publicarTrampo(app, autor, {
      titulo: 'Pintar muro',
      categoria: 'design',
      cidade: 'Lavras',
    });
    await publicarTrampo(app, autor, {
      titulo: 'Consertar telhado',
      categoria: 'reformas',
      cidade: 'Lavras',
    });
    const s1 = await ofertarServico(app, autor, {
      titulo: 'Pintar paredes',
      categoria: 'reformas',
      cidade: 'Lavras',
    });
    await ofertarServico(app, autor, {
      titulo: 'Pintar paredes',
      categoria: 'reformas',
      cidade: undefined,
    });

    const r = await buscar('?texto=pintar&categoria=reformas&cidade=Lavras');

    expect(r.status).toBe(200);
    expect(r.itens.map((i) => i.id)).toEqual([s1, t1]);
  });

  it('serviço sem cidade (D7) não aparece quando há filtro de cidade, mas aparece sem ele', async () => {
    const sem = await ofertarServico(app, autor, {
      titulo: 'Aulas de violão',
      categoria: 'aulas',
      cidade: null,
    });
    const com = await ofertarServico(app, autor, {
      titulo: 'Aulas de piano',
      categoria: 'aulas',
      cidade: 'Lavras',
    });

    expect((await buscar('?cidade=lavras')).itens.map((i) => i.id)).toEqual([
      com,
    ]);
    expect(
      (await buscar('?categoria=aulas')).itens.map((i) => i.id).sort(),
    ).toEqual([sem, com].sort());
  });

  it('ignora maiúsculas, acentos e espaços repetidos no texto e na cidade', async () => {
    const id = await publicarTrampo(app, autor, {
      titulo: 'Instalação elétrica',
      descricao: 'Trocar fiação da cozinha',
      cidade: 'São   João del Rei',
    });

    for (const q of [
      '?texto=INSTALACAO%20ELETRICA',
      '?texto=instalação%20elétrica',
      '?texto=%20%20fiacao%20',
      '?cidade=sao%20joao%20DEL%20rei',
      '?cidade=S%C3%A3o%20Jo%C3%A3o%20del%20Rei',
    ]) {
      expect(
        (await buscar(q)).itens.map((i) => i.id),
        q,
      ).toEqual([id]);
    }
  });

  it('% e _ e \\ no texto são literais, não curingas', async () => {
    await publicarTrampo(app, autor, {
      titulo: 'Desconto de 50 por cento',
      descricao: 'Serviço comum sem símbolos',
    });
    const literal = await publicarTrampo(app, autor, {
      titulo: 'Promoção 50% off',
      descricao: 'fio_terra e caminho c:\\pasta',
    });

    for (const q of [
      '%25',
      '_',
      '50%25',
      '%25%25',
      'o_o',
      '%5C',
      '%27%20or%201%3D1%20--',
    ]) {
      const r = await buscar(`?texto=${q}`);
      expect(r.status, q).toBe(200);
      if (q === '%25' || q === '50%25') {
        expect(
          r.itens.map((i) => i.id),
          q,
        ).toEqual([literal]);
      }
      if (q === '_') {
        expect(
          r.itens.map((i) => i.id),
          q,
        ).toEqual([literal]);
      }
      if (['%25%25', 'o_o', '%27%20or%201%3D1%20--'].includes(q)) {
        expect(r.itens, q).toEqual([]);
      }
    }
    expect((await buscar('?texto=%5C')).itens.map((i) => i.id)).toEqual([
      literal,
    ]);
  });

  it('texto de 100 caracteres passa e 101 dá 400 no campo texto', async () => {
    expect((await buscar(`?texto=${'a'.repeat(100)}`)).status).toBe(200);
    const r = await buscar(`?texto=${'a'.repeat(101)}`);
    expect(r.status).toBe(400);
    expect(r.corpo).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'texto', motivo: 'tamanho' }],
    });
  });

  it('texto com caractere nulo (%00) não derruba a busca com 500', async () => {
    const r = await buscar('?texto=pin%00tura');
    expect(r.status).toBeLessThan(500);
  });

  it('categoria inexistente e tipo inválido: 400; categoria em branco vale como sem filtro', async () => {
    await publicarTrampo(app, autor);
    const categoria = await buscar('?categoria=inexistente');
    expect(categoria.status).toBe(400);
    expect(categoria.corpo).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'categoria', motivo: 'invalido' }],
    });
    expect((await buscar('?tipo=tudo')).status).toBe(400);
    expect((await buscar('?categoria=')).itens).toHaveLength(1);
  });

  it('parâmetro repetido (texto=a&texto=b) é recusado com 400, não vira 500', async () => {
    const r = await buscar('?texto=a&texto=b');
    expect(r.status).toBe(400);
  });

  it('tipo=trampos e tipo=servicos separam as duas listas', async () => {
    const t = await publicarTrampo(app, autor);
    const s = await ofertarServico(app, autor);
    expect((await buscar('?tipo=trampos')).itens.map((i) => i.id)).toEqual([t]);
    expect((await buscar('?tipo=servicos')).itens.map((i) => i.id)).toEqual([
      s,
    ]);
    expect((await buscar('?tipo=todos')).itens.map((i) => i.id)).toEqual([
      s,
      t,
    ]);
  });

  it('trampo em andamento sai da busca e continua no detalhe', async () => {
    const t = await publicarTrampo(app, autor);
    const f = await criarUsuario(app);
    const c = await pedir(app, 'POST', `/trampos/${t}/candidaturas`, {
      token: f.token,
      corpo: { mensagem: 'topo', valorPropostoCentavos: 100 },
    });
    const id = (c.corpo as { id: string }).id;
    await pedir(app, 'POST', `/trampos/${t}/candidaturas/${id}/aceitar`, {
      token: autor.token,
    });
    expect((await buscar('')).itens).toEqual([]);
    expect(
      (await pedir(app, 'GET', `/trampos/${t}`, { token: leitor.token }))
        .status,
    ).toBe(200);
  });
});

describe('CA7 — limite da página', () => {
  it('limite 0, negativo, decimal, texto, vazio, 50 e 1000 são recusados; 1 e 49 passam', async () => {
    await publicarTrampo(app, autor);
    for (const limite of ['0', '-1', '1.5', 'abc', '', '50', '1000', '1e1']) {
      const r = await buscar(`?limite=${limite}`);
      expect(r.status, `limite=${limite}`).toBe(400);
      expect(r.corpo).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'limite', motivo: 'invalido' }],
      });
    }
    for (const limite of ['1', '49']) {
      expect((await buscar(`?limite=${limite}`)).status, limite).toBe(200);
    }
  });

  it('o padrão é 20 por página; com 25 itens há próxima página', async () => {
    for (let i = 0; i < 25; i++) {
      await publicarTrampo(app, autor, { titulo: `Trampo número ${i}` });
    }
    const r = await buscar('');
    expect(r.itens).toHaveLength(20);
    expect(r.proximoCursor).toEqual(expect.any(String));
  });

  it('limite 49 devolve até 49 itens', async () => {
    for (let i = 0; i < 50; i++) {
      await publicarTrampo(app, autor, { titulo: `Trampo número ${i}` });
    }
    const r = await buscar('?limite=49');
    expect(r.itens).toHaveLength(49);
    expect(r.proximoCursor).toEqual(expect.any(String));
  });
});

describe('CA7 — paginação por cursor', () => {
  it('percorre trampos e serviços misturados sem repetir nem pular, do mais recente ao mais antigo', async () => {
    const criados: string[] = [];
    for (let i = 0; i < 7; i++) {
      criados.push(
        await publicarTrampo(app, autor, { titulo: `Trampo ${i} abc` }),
      );
      if (i % 2 === 0) {
        criados.push(
          await ofertarServico(app, autor, { titulo: `Serviço ${i} abc` }),
        );
      }
    }
    const esperado = [...criados].reverse();

    const vistos: string[] = [];
    let cursor: string | null | undefined;
    let paginas = 0;
    do {
      const q: string = cursor ? `?limite=3&antesDe=${cursor}` : '?limite=3';
      const r = await buscar(q);
      expect(r.status).toBe(200);
      expect(r.itens.length).toBeLessThanOrEqual(3);
      vistos.push(...r.itens.map((i) => i.id));
      cursor = r.proximoCursor;
      paginas++;
    } while (cursor && paginas < 20);

    expect(vistos).toEqual(esperado);
    expect(paginas).toBe(Math.ceil(esperado.length / 3));
  });

  it('cursor guardado continua válido depois de itens novos: a segunda página não repete nem perde nada', async () => {
    const antigos: string[] = [];
    for (let i = 0; i < 5; i++) {
      antigos.push(
        await publicarTrampo(app, autor, { titulo: `Antigo ${i} xyz` }),
      );
    }
    const pagina1 = await buscar('?limite=2');
    expect(pagina1.itens.map((i) => i.id)).toEqual([antigos[4], antigos[3]]);

    // Entra um trampo mais novo depois da primeira página.
    const novoTrampo = await publicarTrampo(app, autor, { titulo: 'Novo xyz' });

    const pagina2 = await buscar(`?limite=2&antesDe=${pagina1.proximoCursor}`);
    expect(pagina2.itens.map((i) => i.id)).toEqual([antigos[2], antigos[1]]);
    const pagina3 = await buscar(`?limite=2&antesDe=${pagina2.proximoCursor}`);
    expect(pagina3.itens.map((i) => i.id)).toEqual([antigos[0]]);
    expect(pagina3.proximoCursor).toBeNull();

    const tudo = await buscar('?limite=49');
    expect(tudo.itens[0]?.id).toBe(novoTrampo);
  });

  it('serviço criado depois da 1ª página, numa lista que ainda não tinha posição no cursor, não duplica nem faz perder item antigo', async () => {
    const antigos: string[] = [];
    for (let i = 0; i < 4; i++) {
      antigos.push(
        await publicarTrampo(app, autor, { titulo: `Antigo ${i} xyz` }),
      );
    }
    const pagina1 = await buscar('?limite=2');
    await ofertarServico(app, autor, { titulo: 'Novo servico xyz' });

    const vistos = pagina1.itens.map((i) => i.id);
    let cursor = pagina1.proximoCursor;
    for (let i = 0; cursor && i < 10; i++) {
      const p = await buscar(`?limite=2&antesDe=${cursor}`);
      vistos.push(...p.itens.map((x) => x.id));
      cursor = p.proximoCursor;
    }
    expect(new Set(vistos).size).toBe(vistos.length);
    for (const antigo of antigos) {
      expect(vistos).toContain(antigo);
    }
  });

  it('o mesmo cursor usado duas vezes devolve a mesma página (sem estado no servidor)', async () => {
    for (let i = 0; i < 4; i++) {
      await publicarTrampo(app, autor, { titulo: `Repetido ${i} qqq` });
    }
    const p1 = await buscar('?limite=2');
    const a = await buscar(`?limite=2&antesDe=${p1.proximoCursor}`);
    const b = await buscar(`?limite=2&antesDe=${p1.proximoCursor}`);
    expect(a.itens).toEqual(b.itens);
    expect(a.itens).toHaveLength(2);
  });

  it('cursor trocado de filtro não vaza item que o novo filtro exclui', async () => {
    for (let i = 0; i < 3; i++) {
      await publicarTrampo(app, autor, {
        titulo: `Pintura ${i} yyy`,
        categoria: 'reformas',
      });
      await publicarTrampo(app, autor, {
        titulo: `Logo ${i} yyy`,
        categoria: 'design',
      });
    }
    const p1 = await buscar('?limite=2');
    const r = await buscar(
      `?categoria=design&limite=10&antesDe=${p1.proximoCursor}`,
    );
    expect(r.status).toBe(200);
    expect(r.itens.every((i) => i.categoria === 'design')).toBe(true);
  });

  it('cursor forjado: lixo, base64 de JSON errado, id fora do formato e data absurda dão 400, nunca 500', async () => {
    await publicarTrampo(app, autor);
    const codificar = (o: unknown) =>
      Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
    const cursores = [
      'lixo',
      '!!!',
      codificar({}),
      codificar([]),
      codificar({ t: { c: 'ontem', id: '1' } }),
      codificar({ t: { c: new Date().toISOString(), id: 'nao-e-uuid' } }),
      codificar({ s: { c: new Date().toISOString(), id: "' or 1=1 --" } }),
      codificar({ t: { c: new Date().toISOString(), id: 'x'.repeat(200) } }),
      'a'.repeat(600),
    ];
    for (const cursor of cursores) {
      const r = await buscar(`?antesDe=${cursor}`);
      expect(r.status, cursor.slice(0, 30)).toBe(400);
      expect(r.corpo).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'antesDe', motivo: 'invalido' }],
      });
    }
  });

  it('cursor com data nos extremos do Date (ano 275760 ou -271821) não vira 500', async () => {
    await publicarTrampo(app, autor);
    const id = '00000000-0000-4000-8000-000000000000';
    for (const data of [
      new Date(8.64e15).toISOString(),
      new Date(-8.64e15).toISOString(),
      '0000-01-01T00:00:00.000Z',
    ]) {
      const cursor = Buffer.from(
        JSON.stringify({ t: { c: data, id }, s: { c: data, id } }),
      ).toString('base64url');
      const r = await buscar(`?antesDe=${cursor}`);
      expect(r.status, data).toBeLessThan(500);
    }
  });
});
