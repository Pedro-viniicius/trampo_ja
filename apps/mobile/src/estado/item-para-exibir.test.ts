import type { Categoria, ItemDaBusca, Servico, Trampo } from '../api/tipos';
import { meuAnuncioParaExibir, paraItemParaExibir } from './item-para-exibir';

const CATEGORIAS: Categoria[] = [
  { id: 'reformas', rotulo: 'Reformas e reparos' },
  { id: 'aulas', rotulo: 'Aulas e reforço' },
];

const TRAMPO: ItemDaBusca = {
  tipo: 'trampo',
  id: 't1',
  autorId: 'conta-1',
  titulo: 'Pintar a sala',
  categoria: 'reformas',
  cidade: 'Lavras',
  // Meio-dia UTC: o mesmo dia em qualquer fuso do Brasil.
  criadoEm: '2026-10-20T12:00:00.000Z',
  valorCentavos: 150000,
};

const SERVICO: ItemDaBusca = {
  tipo: 'servico',
  id: 's1',
  autorId: 'conta-2',
  titulo: 'Aulas de violão',
  categoria: 'aulas',
  cidade: null,
  criadoEm: '2026-10-19T12:00:00.000Z',
  precoBaseCentavos: 8000,
};

describe('paraItemParaExibir', () => {
  it('trampo: rótulo da categoria, valor em reais e data dd/mm/aaaa', () => {
    expect(paraItemParaExibir(TRAMPO, CATEGORIAS)).toEqual({
      tipo: 'trampo',
      id: 't1',
      titulo: 'Pintar a sala',
      categoria: 'Reformas e reparos',
      cidade: 'Lavras',
      valorFormatado: 'R$ 1.500,00',
      dataFormatada: '20/10/2026',
    });
  });

  it('serviço: usa o preço base e mantém a cidade nula', () => {
    expect(paraItemParaExibir(SERVICO, CATEGORIAS)).toEqual({
      tipo: 'servico',
      id: 's1',
      titulo: 'Aulas de violão',
      categoria: 'Aulas e reforço',
      cidade: null,
      valorFormatado: 'R$ 80,00',
      dataFormatada: '19/10/2026',
    });
  });

  it('sem a lista de categorias, mostra o id da categoria', () => {
    expect(paraItemParaExibir(TRAMPO, []).categoria).toBe('reformas');
  });

  it('não leva campos fora do contrato da tela (autorId, centavos, ISO)', () => {
    expect(Object.keys(paraItemParaExibir(SERVICO, CATEGORIAS)).sort()).toEqual(
      [
        'categoria',
        'cidade',
        'dataFormatada',
        'id',
        'tipo',
        'titulo',
        'valorFormatado',
      ],
    );
  });
});

const MEU_TRAMPO: Trampo = {
  id: 't9',
  autorId: 'conta-eu',
  titulo: 'Trocar o chuveiro',
  descricao: 'Chuveiro elétrico novo.',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 12050,
  prazo: '2026-12-31',
  status: 'aberto',
  criadoEm: '2026-10-20T12:00:00.000Z',
};

const MEU_SERVICO: Servico = {
  id: 's9',
  autorId: 'conta-eu',
  titulo: 'Aulas de violão',
  descricao: 'Aulas para iniciantes.',
  categoria: 'aulas',
  cidade: null,
  precoBaseCentavos: 8000,
  status: 'ativo',
  criadoEm: '2026-10-19T12:00:00.000Z',
};

describe('meuAnuncioParaExibir', () => {
  it('trampo: rótulo, valor, data e status', () => {
    expect(meuAnuncioParaExibir(MEU_TRAMPO, CATEGORIAS)).toEqual({
      tipo: 'trampo',
      id: 't9',
      titulo: 'Trocar o chuveiro',
      categoria: 'Reformas e reparos',
      cidade: 'Lavras',
      valorFormatado: 'R$ 120,50',
      dataFormatada: '20/10/2026',
      status: 'aberto',
    });
  });

  it('trampo em andamento mantém o status', () => {
    expect(
      meuAnuncioParaExibir(
        { ...MEU_TRAMPO, status: 'em_andamento' },
        CATEGORIAS,
      ).status,
    ).toBe('em_andamento');
  });

  it('serviço sem cidade: preço base, cidade null e status ativo', () => {
    expect(meuAnuncioParaExibir(MEU_SERVICO, CATEGORIAS)).toEqual({
      tipo: 'servico',
      id: 's9',
      titulo: 'Aulas de violão',
      categoria: 'Aulas e reforço',
      cidade: null,
      valorFormatado: 'R$ 80,00',
      dataFormatada: '19/10/2026',
      status: 'ativo',
    });
  });

  it('serviço com cidade', () => {
    expect(
      meuAnuncioParaExibir({ ...MEU_SERVICO, cidade: 'Lavras' }, CATEGORIAS)
        .cidade,
    ).toBe('Lavras');
  });

  it('sem a lista de categorias usa o id', () => {
    expect(meuAnuncioParaExibir(MEU_TRAMPO, []).categoria).toBe('reformas');
  });

  it('não leva a descrição nem o autor ao item', () => {
    for (const anuncio of [MEU_TRAMPO, MEU_SERVICO]) {
      const item = meuAnuncioParaExibir(anuncio, CATEGORIAS);
      expect(item).not.toHaveProperty('descricao');
      expect(item).not.toHaveProperty('autorId');
      expect(item).not.toHaveProperty('prazo');
    }
  });
});
