import type { Categoria, ItemDaBusca } from '../api/tipos';
import { paraItemParaExibir } from './item-para-exibir';

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
