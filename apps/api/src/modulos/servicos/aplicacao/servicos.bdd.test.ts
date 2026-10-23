import { beforeEach, describe, expect, it } from 'vitest';
import {
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import { RepositorioDeServicosEmMemoria } from '../adaptadores/memoria/repositorio-memoria.js';
import { VerificadorDePerfilEmMemoria } from '../adaptadores/memoria/verificador-perfil-memoria.js';
import type { EntradaDeServico, Servico } from '../dominio/servico.js';
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
    const servico = await casos.obterServico(resultado.id, FREELANCER);
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
    expect(
      await erroDe(casos.obterServico('nao-existe', FREELANCER)),
    ).toBeInstanceOf(ErroNaoEncontrado);
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
    const servico = await casos.obterServico(id, FREELANCER);
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

/** Edição válida de um serviço lido na `versao` dada. */
function edicao(
  versao: unknown,
  dados: Partial<Record<keyof EntradaDeServico, unknown>> = {},
) {
  return {
    titulo: 'Encanador de plantão',
    descricao: 'Vazamentos e desentupimento.',
    categoria: 'limpeza',
    cidade: 'Recife',
    precoBaseCentavos: 9900,
    ...dados,
    versao,
  };
}

async function codigoDe(promessa: Promise<unknown>): Promise<string> {
  const erro = await erroDe(promessa);
  expect(erro).toHaveProperty('codigo');
  return (erro as { codigo: string }).codigo;
}

describe('CA26 — editar serviço', () => {
  it('CA26 — Dado o autor com a versão lida, quando edita, então os campos mudam, a versão sobe, a busca acha o texto novo e criadoEm e a posição ficam', async () => {
    const id = await ofertar();
    const outro = await ofertar({ titulo: 'Aulas de violão' });

    await casos.editarServico(FREELANCER, id, edicao(1));

    const editado = await casos.obterServico(id, FREELANCER);
    expect(editado).toMatchObject({
      id,
      autorId: FREELANCER,
      titulo: 'Encanador de plantão',
      descricao: 'Vazamentos e desentupimento.',
      categoria: 'limpeza',
      cidade: 'Recife',
      cidadeNormalizada: 'recife',
      precoBaseCentavos: 9900,
      status: 'ativo',
      criadoEm: new Date('2026-10-20T12:00:00.000Z'),
      versao: 2,
    });
    expect(
      (await casos.buscarServicos({ texto: 'desentupimento' })).map(
        (s) => s.id,
      ),
    ).toEqual([id]);
    expect(await casos.buscarServicos({ texto: 'eletricista' })).toEqual([]);
    expect(
      (await casos.buscarServicos({ cidade: 'recife' })).map((s) => s.id),
    ).toEqual([id]);
    expect((await casos.buscarServicos()).map((s) => s.id)).toEqual([
      outro,
      id,
    ]);
  });

  it('CA26 — Dado duas edições seguidas, quando cada uma manda a versão que leu, então as duas passam', async () => {
    const id = await ofertar();
    await casos.editarServico(FREELANCER, id, edicao(1));
    await casos.editarServico(
      FREELANCER,
      id,
      edicao(2, { titulo: 'Terceira' }),
    );

    expect(await casos.obterServico(id, FREELANCER)).toMatchObject({
      titulo: 'Terceira',
      versao: 3,
    });
  });

  it.each([
    ['sem a chave', {}],
    ['nula', { cidade: null }],
    ['em branco', { cidade: '  ' }],
  ])(
    'D7 — Dado a cidade %s na edição, então o serviço fica sem cidade e sai do filtro de cidade',
    async (_nome, dados) => {
      const id = await ofertar();
      const { cidade: _cidade, ...semCidade } = edicao(1);

      await casos.editarServico(FREELANCER, id, { ...semCidade, ...dados });

      const servico = await casos.obterServico(id, FREELANCER);
      expect(servico).not.toHaveProperty('cidade');
      expect(servico).not.toHaveProperty('cidadeNormalizada');
      expect(await casos.buscarServicos({ cidade: 'sao paulo' })).toEqual([]);
      expect((await casos.buscarServicos()).map((s) => s.id)).toEqual([id]);
    },
  );

  it('CA26 — Dado outra conta, quando edita o serviço, então 404 e nada muda', async () => {
    const id = await ofertar();

    expect(
      await erroDe(casos.editarServico(OUTRO, id, edicao(1))),
    ).toBeInstanceOf(ErroNaoEncontrado);
    expect(await casos.obterServico(id, FREELANCER)).toMatchObject({
      titulo: 'Eletricista residencial',
      versao: 1,
    });
  });

  it('CA26 — Dado um id inexistente ou fora do formato, quando edita, então 404', async () => {
    await ofertar();
    for (const id of ['id-999', 'nao-e-uuid', '']) {
      expect(
        await erroDe(casos.editarServico(FREELANCER, id, edicao(1))),
        id,
      ).toBeInstanceOf(ErroNaoEncontrado);
    }
  });

  it('D33 — Dado a versão velha, quando edita, então 409 conflito_de_versao e nada muda', async () => {
    const id = await ofertar();
    await casos.editarServico(
      FREELANCER,
      id,
      edicao(1, { titulo: 'Primeira' }),
    );

    expect(
      await codigoDe(
        casos.editarServico(FREELANCER, id, edicao(1, { titulo: 'Velha' })),
      ),
    ).toBe('conflito_de_versao');
    expect(await casos.obterServico(id, FREELANCER)).toMatchObject({
      titulo: 'Primeira',
      versao: 2,
    });
  });

  it('D33 — Dado uma versão à frente da guardada, quando edita, então também é conflito', async () => {
    const id = await ofertar();
    expect(await codigoDe(casos.editarServico(FREELANCER, id, edicao(7)))).toBe(
      'conflito_de_versao',
    );
  });

  it.each([
    ['ausente', undefined, 'obrigatorio'],
    ['nula', null, 'obrigatorio'],
    ['zero', 0, 'invalido'],
    ['negativa', -1, 'invalido'],
    ['fracionada', 1.5, 'invalido'],
    ['em texto', '1', 'invalido'],
  ] as const)(
    'Dado a versão %s, quando edita, então 400 em versao, antes de olhar o serviço (mesmo de outra conta ou inexistente)',
    async (_nome, versao, motivo) => {
      const id = await ofertar();
      for (const [quem, alvo] of [
        [FREELANCER, id],
        [OUTRO, id],
        [FREELANCER, 'id-999'],
      ] as const) {
        const erro = await erroDe(
          casos.editarServico(quem, alvo, edicao(versao)),
        );
        expect(erro).toBeInstanceOf(ErroDeValidacao);
        expect((erro as ErroDeValidacao).campos).toEqual([
          { campo: 'versao', motivo },
        ]);
      }
    },
  );

  it('Ordem das checagens — outra conta com versão velha e campos inválidos dá 404; o autor com versão velha e campos inválidos dá 409', async () => {
    const id = await ofertar();
    await casos.editarServico(FREELANCER, id, edicao(1));
    const invalida = edicao(1, { titulo: 'ab', precoBaseCentavos: 0 });

    expect(
      await erroDe(casos.editarServico(OUTRO, id, invalida)),
    ).toBeInstanceOf(ErroNaoEncontrado);
    expect(await codigoDe(casos.editarServico(FREELANCER, id, invalida))).toBe(
      'conflito_de_versao',
    );
  });

  it('CA6 — Dado a versão certa e campos inválidos, quando edita, então todos os campos são apontados e nada muda', async () => {
    const id = await ofertar();

    const erro = await erroDe(
      casos.editarServico(
        FREELANCER,
        id,
        edicao(1, { titulo: 'ab', descricao: null, categoria: 'x' }),
      ),
    );

    expect(erro).toBeInstanceOf(ErroDeValidacao);
    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'titulo', motivo: 'tamanho' },
      { campo: 'descricao', motivo: 'obrigatorio' },
      { campo: 'categoria', motivo: 'invalido' },
    ]);
    expect(await casos.obterServico(id, FREELANCER)).toMatchObject({
      titulo: 'Eletricista residencial',
      versao: 1,
    });
  });

  it('D33 — Dado duas edições simultâneas com a mesma versão, então uma vence e a outra leva conflito_de_versao', async () => {
    const id = await ofertar();

    const resultados = await Promise.allSettled([
      casos.editarServico(FREELANCER, id, edicao(1, { titulo: 'Edição A' })),
      casos.editarServico(FREELANCER, id, edicao(1, { titulo: 'Edição B' })),
    ]);

    const vencedoras = resultados.filter((r) => r.status === 'fulfilled');
    const perdedoras = resultados.filter((r) => r.status === 'rejected');
    expect(vencedoras).toHaveLength(1);
    expect(perdedoras).toHaveLength(1);
    expect((perdedoras[0] as PromiseRejectedResult).reason).toMatchObject({
      codigo: 'conflito_de_versao',
    });
    const final = await casos.obterServico(id, FREELANCER);
    expect(final.versao).toBe(2);
    expect(['Edição A', 'Edição B']).toContain(final.titulo);
  });
});

describe('CA26 — gravação que perde a trava (releitura)', () => {
  /** Repositório em memória que roda `antes` entre a leitura e a gravação. */
  class RepositorioComIntervalo extends RepositorioDeServicosEmMemoria {
    antes: (() => Promise<void>) | undefined;

    override async atualizar(servico: Servico): Promise<boolean> {
      const antes = this.antes;
      this.antes = undefined;
      await antes?.();
      return super.atualizar(servico);
    }
  }

  let repo: RepositorioComIntervalo;
  let casosComIntervalo: CasosDeUsoDeServicos;

  beforeEach(() => {
    repo = new RepositorioComIntervalo();
    casosComIntervalo = criarCasosDeUsoDeServicos({
      repositorio: repo,
      verificadorDePerfil: verificador,
      relogio,
      gerarId: () => 'id-500',
    });
  });

  it('Dado que o serviço foi excluído entre a leitura e a gravação, então 404', async () => {
    await casosComIntervalo.ofertarServico(FREELANCER, SERVICO_VALIDO);
    repo.antes = async () => {
      await casosComIntervalo.excluirServico(FREELANCER, 'id-500');
    };

    expect(
      await erroDe(
        casosComIntervalo.editarServico(FREELANCER, 'id-500', edicao(1)),
      ),
    ).toBeInstanceOf(ErroNaoEncontrado);
    expect(await repo.buscarPorId('id-500')).toBeNull();
  });

  it('Dado que outra edição gravou entre a leitura e a gravação, então conflito_de_versao e fica a outra', async () => {
    await casosComIntervalo.ofertarServico(FREELANCER, SERVICO_VALIDO);
    repo.antes = async () => {
      await casosComIntervalo.editarServico(
        FREELANCER,
        'id-500',
        edicao(1, { titulo: 'A que venceu' }),
      );
    };

    expect(
      await codigoDe(
        casosComIntervalo.editarServico(
          FREELANCER,
          'id-500',
          edicao(1, { titulo: 'A que perdeu' }),
        ),
      ),
    ).toBe('conflito_de_versao');
    expect(await repo.buscarPorId('id-500')).toMatchObject({
      titulo: 'A que venceu',
      versao: 2,
    });
  });
});

describe('CA26 — excluir serviço', () => {
  it('CA26 — Dado o autor, quando exclui, então o serviço some da busca, de "meus serviços" e o detalhe dá 404', async () => {
    const id = await ofertar();
    const fica = await ofertar({ titulo: 'Aulas de violão' });

    await casos.excluirServico(FREELANCER, id);

    expect(await erroDe(casos.obterServico(id, FREELANCER))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect(await erroDe(casos.obterServico(id, OUTRO))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect((await casos.buscarServicos()).map((s) => s.id)).toEqual([fica]);
    expect(
      (await casos.listarMeusServicos(FREELANCER)).map((s) => s.id),
    ).toEqual([fica]);
  });

  it('CA26 — Dado outra conta, quando exclui, então 404 e o serviço continua', async () => {
    const id = await ofertar();

    expect(await erroDe(casos.excluirServico(OUTRO, id))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect((await casos.buscarServicos()).map((s) => s.id)).toEqual([id]);
  });

  it('CA26 — Dado um id inexistente ou já excluído, quando exclui, então 404', async () => {
    const id = await ofertar();
    await casos.excluirServico(FREELANCER, id);

    for (const alvo of [id, 'id-999', 'nao-e-uuid']) {
      expect(
        await erroDe(casos.excluirServico(FREELANCER, alvo)),
        alvo,
      ).toBeInstanceOf(ErroNaoEncontrado);
    }
  });

  it('CA26 — Dado um serviço excluído, quando o autor tenta editá-lo, então 404', async () => {
    const id = await ofertar();
    await casos.excluirServico(FREELANCER, id);

    expect(
      await erroDe(casos.editarServico(FREELANCER, id, edicao(1))),
    ).toBeInstanceOf(ErroNaoEncontrado);
  });
});

describe('D33 — versao só na visão do autor', () => {
  it('CA31 — Dado um terceiro, quando obtém o serviço, então a resposta não tem versao; o autor a recebe', async () => {
    const id = await ofertar();
    await casos.editarServico(FREELANCER, id, edicao(1));

    const deTerceiro = await casos.obterServico(id, OUTRO);
    expect(deTerceiro).not.toHaveProperty('versao');
    expect(deTerceiro).toMatchObject({ id, titulo: 'Encanador de plantão' });
    expect(await casos.obterServico(id, FREELANCER)).toHaveProperty(
      'versao',
      2,
    );
  });

  it('CA31 — "meus serviços" traz a versao de cada um', async () => {
    const id = await ofertar();
    await casos.editarServico(FREELANCER, id, edicao(1));
    await ofertar({ titulo: 'Aulas de violão' });

    expect(
      (await casos.listarMeusServicos(FREELANCER)).map((s) => s.versao),
    ).toEqual([1, 2]);
  });
});
