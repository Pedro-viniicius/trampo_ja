/** Lista fechada de categorias de trampos e serviços (D5 em `docs/produto/decisoes.md`). */
export const CATEGORIAS = Object.freeze([
  Object.freeze({ id: 'reformas', rotulo: 'Reformas e reparos' }),
  Object.freeze({ id: 'design', rotulo: 'Design' }),
  Object.freeze({ id: 'aulas', rotulo: 'Aulas e reforço' }),
  Object.freeze({ id: 'entregas', rotulo: 'Entregas e transporte' }),
  Object.freeze({ id: 'ti', rotulo: 'Tecnologia (TI)' }),
  Object.freeze({ id: 'eventos', rotulo: 'Eventos' }),
  Object.freeze({ id: 'limpeza', rotulo: 'Limpeza e serviços domésticos' }),
  Object.freeze({ id: 'beleza', rotulo: 'Beleza e bem-estar' }),
  Object.freeze({ id: 'fotografia', rotulo: 'Fotografia e vídeo' }),
  Object.freeze({ id: 'outros', rotulo: 'Outros' }),
] as const);

export type IdCategoria = (typeof CATEGORIAS)[number]['id'];

const IDS: ReadonlySet<string> = new Set(CATEGORIAS.map((c) => c.id));

/** Verdadeiro só para um id da lista fechada (sensível a maiúsculas). */
export function ehCategoriaValida(id: unknown): id is IdCategoria {
  return typeof id === 'string' && IDS.has(id);
}
