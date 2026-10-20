import { beforeEach, describe, expect, it } from 'vitest';
import {
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import { RepositorioDeServicosEmMemoria } from '../adaptadores/memoria/repositorio-memoria.js';
import { VerificadorDePerfilEmMemoria } from '../adaptadores/memoria/verificador-perfil-memoria.js';
import type { EntradaDeServico } from '../dominio/servico.js';
import {
  type CasosDeUsoDeServicos,
  criarCasosDeUsoDeServicos,
} from './casos-de-uso.js';

const FREELANCER = 'conta-freelancer';
const OUTRO = 'conta-outro';
const SEM_PERFIL = 'conta-sem-perfil';

const SERVICO_VALIDO: EntradaDeServico = {
  titulo: 'Eletricista residencial',
  descricao: 'Instalação e conserto de tomadas, chuveiros e quadros.',
  categoria: 'reformas',
  cidade: 'São Paulo',
  precoBaseCentavos: 15000,
};

let repositorio: RepositorioDeServicosEmMemoria;
let verificador: VerificadorDePerfilEmMemoria;
let relogio: RelogioFixo;
let contador: number;
let casos: CasosDeUsoDeServicos;

beforeEach(() => {
  repositorio = new RepositorioDeServicosEmMemoria();
  verificador = new VerificadorDePerfilEmMemoria([FREELANCER, OUTRO]);
  relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
  contador = 0;
  casos = criarCasosDeUsoDeServicos({
    repositorio,
    verificadorDePerfil: verificador,
    relogio,
    gerarId: () => {
      contador += 1;
      return `id-${String(contador).padStart(3, '0')}`;
    },
  });
});

/** Oferta um serviço e avança o relógio 1 minuto, para ordenar por criação. */
async function ofertar(
  dados: Partial<Record<keyof EntradaDeServico, unknown>> = {},
  autorId = FREELANCER,
): Promise<string> {
  const { id } = await casos.ofertarServico(autorId, {
    ...SERVICO_VALIDO,
    ...dados,
  });
  relogio.avancar(60_000);
  return id;
}

async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava um erro');
}

describe('CA6 — ofertar serviço', () => {
  it('CA6 — Dado um usuário autenticado, quando ele oferta um serviço com título, descrição, categoria e preço base maior que zero, então o serviço fica ativo e aparece na busca', async () => {
    const resultado = await casos.ofertarServico(FREELANCER, SERVICO_VALIDO);

    expect(resultado).toEqual({ id: 'id-001', status: 'ativo' });
    const servico = await casos.obterServico(resultado.id);
    expect(servico).toMatchObject({
      autorId: FREELANCER,
      titulo: 'Eletricista residencial',
      categoria: 'reformas',
      precoBaseCentavos: 15000,
      status: 'ativo',
      criadoEm: new Date('2026-10-20T12:00:00.000Z'),
    });
    const achados = await casos.buscarServicos({ texto: 'eletricista' });
    expect(achados.map((s) => s.id)).toEqual([resultado.id]);
  });

  it('CA6 — o serviço ofertado aparece em "meus serviços" do autor e não no de outro', async () => {
    const id = await ofertar();
    expect(
      (await casos.listarMeusServicos(FREELANCER)).map((s) => s.id),
    ).toEqual([id]);
    expect(await casos.listarMeusServicos(OUTRO)).toEqual([]);
  });

  it('CA6 — obter um serviço inexistente falha com não encontrado', async () => {
    expect(await erroDe(casos.obterServico('nao-existe'))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
  });
});

describe('CA6 — validação dos dados', () => {
  it.each([
    ['titulo', { titulo: 'abc' }, 'tamanho'],
    ['titulo', { titulo: undefined }, 'obrigatorio'],
    ['descricao', { descricao: '' }, 'obrigatorio'],
    ['descricao', { descricao: 'd'.repeat(2001) }, 'tamanho'],
    ['categoria', { categoria: 'jardinagem' }, 'invalido'],
    ['categoria', { categoria: undefined }, 'obrigatorio'],
    ['precoBaseCentavos', { precoBaseCentavos: 0 }, 'invalido'],
    ['precoBaseCentavos', { precoBaseCentavos: 9.99 }, 'invalido'],
    ['cidade', { cidade: 'S' }, 'tamanho'],
  ] as const)(
    'Dado %s inválido, quando oferta, então a API aponta o campo (%j → %s) e nada é salvo',
    async (campo, alteracao, motivo) => {
      const erro = await erroDe(
        casos.ofertarServico(FREELANCER, { ...SERVICO_VALIDO, ...alteracao }),
      );
      expect(erro).toBeInstanceOf(ErroDeValidacao);
      expect((erro as ErroDeValidacao).campos).toEqual([{ campo, motivo }]);
      expect(await casos.listarMeusServicos(FREELANCER)).toEqual([]);
    },
  );

  it('Dado vários campos inválidos, quando oferta, então todos são apontados de uma vez', async () => {
    const erro = await erroDe(casos.ofertarServico(FREELANCER, {}));
    expect((erro as ErroDeValidacao).campos.map((c) => c.campo)).toEqual([
      'titulo',
      'descricao',
      'categoria',
      'precoBaseCentavos',
    ]);
  });
});

describe('D9 — perfil completo para ofertar', () => {
  it('D9 — Dado um usuário com perfil incompleto, quando oferta um serviço, então a API recusa com perfil_incompleto e nada é salvo', async () => {
    const erro = await erroDe(casos.ofertarServico(SEM_PERFIL, SERVICO_VALIDO));

    expect(erro).toBeInstanceOf(ErroDeRegra);
    expect((erro as ErroDeRegra).codigo).toBe('perfil_incompleto');
    expect(await casos.listarMeusServicos(SEM_PERFIL)).toEqual([]);
    expect(await casos.buscarServicos()).toEqual([]);
  });

  it('D9 — a checagem de perfil vem antes da validação dos dados', async () => {
    const erro = await erroDe(casos.ofertarServico(SEM_PERFIL, {}));
    expect(erro).toBeInstanceOf(ErroDeRegra);
    expect((erro as ErroDeRegra).codigo).toBe('perfil_incompleto');
  });

  it('D9 — Dado que o usuário completa o perfil, quando oferta, então o serviço é aceito', async () => {
    verificador.completar(SEM_PERFIL);
    const resultado = await casos.ofertarServico(SEM_PERFIL, SERVICO_VALIDO);
    expect(resultado.status).toBe('ativo');
  });
});

describe('D7 — cidade opcional', () => {
  it('D7 — Dado um serviço sem cidade, quando ofertado, então é aceito e aparece na busca sem filtro de cidade', async () => {
    const id = await ofertar({ cidade: undefined });
    const servico = await casos.obterServico(id);
    expect(servico.cidade).toBeUndefined();
    expect(servico.cidadeNormalizada).toBeUndefined();
    expect((await casos.buscarServicos()).map((s) => s.id)).toEqual([id]);
  });

  it('D7 — Dado um serviço sem cidade, quando se filtra por cidade, então ele não entra no resultado', async () => {
    await ofertar({ cidade: undefined });
    const comCidade = await ofertar({ cidade: 'São Paulo' });
    await ofertar({ cidade: 'Recife' });

    const achados = await casos.buscarServicos({ cidade: 'SAO  paulo' });
    expect(achados.map((s) => s.id)).toEqual([comCidade]);
  });
});

describe('CA7 — busca de serviços', () => {
  it('Dado texto acentuado e em maiúsculas, quando busca, então acha pelo texto normalizado do título e da descrição', async () => {
    const id = await ofertar({
      titulo: 'Instalação de Chuveiro',
      descricao: 'Troca de resistência',
    });
    await ofertar({ titulo: 'Aulas de violão', descricao: 'Iniciantes' });

    for (const texto of [
      'INSTALAÇÃO',
      'instalacao',
      'resistencia',
      'Instalação   DE  chuveiro',
    ]) {
      const achados = await casos.buscarServicos({ texto });
      expect(
        achados.map((s) => s.id),
        texto,
      ).toEqual([id]);
    }
    expect(await casos.buscarServicos({ texto: 'violao' })).toHaveLength(1);
    expect(await casos.buscarServicos({ texto: 'encanador' })).toEqual([]);
  });

  it('Dado um filtro de categoria, quando busca, então só traz a categoria igual', async () => {
    const ti = await ofertar({ categoria: 'ti' });
    await ofertar({ categoria: 'design' });
    expect(
      (await casos.buscarServicos({ categoria: 'ti' })).map((s) => s.id),
    ).toEqual([ti]);
  });

  it('Dado vários filtros, quando busca, então combina com E lógico', async () => {
    const alvo = await ofertar({
      titulo: 'Site institucional',
      categoria: 'ti',
      cidade: 'Recife',
    });
    await ofertar({
      titulo: 'Site institucional',
      categoria: 'design',
      cidade: 'Recife',
    });
    await ofertar({
      titulo: 'Site institucional',
      categoria: 'ti',
      cidade: 'Natal',
    });
    await ofertar({
      titulo: 'Loja virtual',
      categoria: 'ti',
      cidade: 'Recife',
    });

    const achados = await casos.buscarServicos({
      texto: 'site',
      categoria: 'ti',
      cidade: 'recife',
    });
    expect(achados.map((s) => s.id)).toEqual([alvo]);
  });

  it('Dado vários serviços, quando busca, então os mais recentes vêm primeiro, com desempate por id decrescente', async () => {
    const antigo = await ofertar({ titulo: 'Serviço antigo' });
    const meio = await ofertar({ titulo: 'Serviço do meio' });
    // Mesmo instante (sem avançar o relógio entre os dois): desempata pelo id.
    const { id: empateA } = await casos.ofertarServico(
      FREELANCER,
      SERVICO_VALIDO,
    );
    const { id: empateB } = await casos.ofertarServico(
      FREELANCER,
      SERVICO_VALIDO,
    );

    const achados = await casos.buscarServicos();
    expect(achados.map((s) => s.id)).toEqual([empateB, empateA, meio, antigo]);
  });

  it('Dado o cursor antesDe, quando busca, então devolve só os mais antigos e sem repetir ou pular nenhum', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(await ofertar({ titulo: `Serviço número ${i}` }));
    }
    // Dois no mesmo instante, para o cursor também desempatar por id.
    const { id: gemeoA } = await casos.ofertarServico(
      FREELANCER,
      SERVICO_VALIDO,
    );
    const { id: gemeoB } = await casos.ofertarServico(
      FREELANCER,
      SERVICO_VALIDO,
    );
    const esperado = [gemeoB, gemeoA, ...[...ids].reverse()];

    const coletados: string[] = [];
    let cursor: { criadoEm: Date; id: string } | undefined;
    for (let pagina = 0; pagina < 10; pagina += 1) {
      const itens = await casos.buscarServicos({
        limite: 3,
        ...(cursor ? { antesDe: cursor } : {}),
      });
      if (itens.length === 0) break;
      coletados.push(...itens.map((s) => s.id));
      const ultimo = itens[itens.length - 1];
      if (!ultimo) break;
      cursor = { criadoEm: ultimo.criadoEm, id: ultimo.id };
    }
    expect(coletados).toEqual(esperado);
  });

  it('Dado mais de 20 serviços, quando busca sem limite, então traz no máximo 20', async () => {
    for (let i = 0; i < 25; i += 1) {
      await ofertar({ titulo: `Serviço número ${i}` });
    }
    expect(await casos.buscarServicos()).toHaveLength(20);
  });

  it.each([
    ['texto', { texto: 'a'.repeat(101) }, 'tamanho'],
    ['texto', { texto: 'pin\u0000tura' }, 'invalido'],
    ['cidade', { cidade: 'a'.repeat(81) }, 'tamanho'],
    ['cidade', { cidade: 'Lav\u0000ras' }, 'invalido'],
    ['categoria', { categoria: 'jardinagem' }, 'invalido'],
    ['limite', { limite: 0 }, 'invalido'],
    ['limite', { limite: 51 }, 'invalido'],
    ['limite', { limite: 2.5 }, 'invalido'],
    ['antesDe', { antesDe: { criadoEm: new Date('x'), id: 'a' } }, 'invalido'],
  ] as const)(
    'Dado filtro %s inválido, quando busca, então recusa',
    async (campo, pedido, motivo) => {
      const erro = await erroDe(casos.buscarServicos(pedido));
      expect(erro).toBeInstanceOf(ErroDeValidacao);
      expect((erro as ErroDeValidacao).campos).toEqual([{ campo, motivo }]);
    },
  );

  it('Dado texto e cidade nos limites depois de normalizar, quando busca, então aceita', async () => {
    await ofertar();
    await expect(
      casos.buscarServicos({
        texto: `a${' '.repeat(150)}b`,
        cidade: `${'a'.repeat(80)}   `,
      }),
    ).resolves.toEqual([]);
  });

  it('Dado filtros em branco, quando busca, então equivale a sem filtro', async () => {
    const id = await ofertar();
    const achados = await casos.buscarServicos({
      texto: '  ',
      categoria: '',
      cidade: ' ',
    });
    expect(achados.map((s) => s.id)).toEqual([id]);
  });
});
