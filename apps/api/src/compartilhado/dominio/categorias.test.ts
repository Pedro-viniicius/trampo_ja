import { describe, expect, it } from 'vitest';
import { CATEGORIAS, ehCategoriaValida } from './categorias.js';

describe('CATEGORIAS', () => {
  it('tem os 10 pares id e rótulo da D5, nesta ordem', () => {
    expect(CATEGORIAS).toEqual([
      { id: 'reformas', rotulo: 'Reformas e reparos' },
      { id: 'design', rotulo: 'Design' },
      { id: 'aulas', rotulo: 'Aulas e reforço' },
      { id: 'entregas', rotulo: 'Entregas e transporte' },
      { id: 'ti', rotulo: 'Tecnologia (TI)' },
      { id: 'eventos', rotulo: 'Eventos' },
      { id: 'limpeza', rotulo: 'Limpeza e serviços domésticos' },
      { id: 'beleza', rotulo: 'Beleza e bem-estar' },
      { id: 'fotografia', rotulo: 'Fotografia e vídeo' },
      { id: 'outros', rotulo: 'Outros' },
    ]);
  });

  it('é imutável', () => {
    expect(Object.isFrozen(CATEGORIAS)).toBe(true);
    for (const categoria of CATEGORIAS) {
      expect(Object.isFrozen(categoria)).toBe(true);
    }
  });
});

describe('ehCategoriaValida', () => {
  it('aceita todos os ids da lista', () => {
    for (const { id } of CATEGORIAS) {
      expect(ehCategoriaValida(id)).toBe(true);
    }
  });

  it.each([
    ['Reformas'],
    ['reformas '],
    ['Reformas e reparos'],
    ['pintura'],
    [''],
    [null],
    [undefined],
    [1],
    ['toString'],
  ])('recusa %j', (valor) => {
    expect(ehCategoriaValida(valor)).toBe(false);
  });
});
