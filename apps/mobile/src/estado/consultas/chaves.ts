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
  /** Prefixo de toda `busca(...)`, com qualquer filtro (para invalidar). */
  todasAsBuscas: () => ['busca'] as const,
  recentes: (tipo: 'trampos' | 'servicos') => ['recentes', tipo] as const,
  trampo: (id: string) => ['trampo', id] as const,
  servico: (id: string) => ['servico', id] as const,
  /** `GET /trampos/meus`: os trampos da conta da sessão. */
  meusTrampos: () => ['meusTrampos'] as const,
  /** `GET /servicos/meus`: os serviços da conta da sessão. */
  meusServicos: () => ['meusServicos'] as const,
  /** `GET /candidaturas/minhas`: as candidaturas da conta da sessão. */
  minhasCandidaturas: () => ['minhasCandidaturas'] as const,
  /** `GET /trampos/:id/candidaturas`: só o autor do trampo vê. */
  candidaturasRecebidas: (trampoId: string) =>
    ['candidaturasRecebidas', trampoId] as const,
  /** `GET /conversas`: as conversas da conta da sessão. */
  conversas: () => ['conversas'] as const,
  /**
   * `GET /conversas/:id/mensagens`, acumuladas pelo polling incremental de
   * `useMensagens` (o único que escreve nesta chave).
   */
  mensagens: (conversaId: string) => ['mensagens', conversaId] as const,
};
