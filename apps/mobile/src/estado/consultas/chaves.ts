import type { FiltrosDaBusca } from '../../api/tipos';

/** Filtros que identificam uma busca: sem a paginação, que é do cursor. */
export type FiltrosDeConsulta = Omit<FiltrosDaBusca, 'antesDe' | 'limite'>;

/**
 * Tira espaços das pontas e descarta o que está vazio, numa ordem fixa. Assim
 * `{ texto: ' pintor ' }` e `{ texto: 'pintor', cidade: '' }` caem na mesma
 * chave e na mesma requisição (sem campo vazio na query, CA7).
 */
export function normalizarFiltros(
  filtros: FiltrosDeConsulta,
): FiltrosDeConsulta {
  const { texto, categoria, cidade, tipo } = filtros;
  const t = texto?.trim();
  const ca = categoria?.trim();
  const ci = cidade?.trim();
  return {
    ...(t !== undefined && t !== '' && { texto: t }),
    ...(ca !== undefined && ca !== '' && { categoria: ca }),
    ...(ci !== undefined && ci !== '' && { cidade: ci }),
    ...(tipo !== undefined && { tipo }),
  };
}

/** Chaves de consulta do app, num lugar só para invalidar sem errar o nome. */
export const chaves = {
  meuPerfil: () => ['meuPerfil'] as const,
  perfil: (contaId: string) => ['perfil', contaId] as const,
  categorias: () => ['categorias'] as const,
  busca: (filtros: FiltrosDeConsulta) =>
    ['busca', normalizarFiltros(filtros)] as const,
  recentes: (tipo: 'trampos' | 'servicos') => ['recentes', tipo] as const,
  trampo: (id: string) => ['trampo', id] as const,
  servico: (id: string) => ['servico', id] as const,
};
