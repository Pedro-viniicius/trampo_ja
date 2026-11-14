import type { FiltrosDaBusca, PapelDoAvaliado } from '../../api/tipos';

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
  /** Prefixo de toda `candidaturasRecebidas(...)`, de qualquer trampo. */
  todasAsCandidaturasRecebidas: () => ['candidaturasRecebidas'] as const,
  /** `GET /conversas`: as conversas da conta da sessão. */
  conversas: () => ['conversas'] as const,
  /**
   * `GET /conversas/:id/mensagens`, acumuladas pelo polling incremental de
   * `useMensagens` (o único que escreve nesta chave).
   */
  mensagens: (conversaId: string) => ['mensagens', conversaId] as const,
  /** `GET /avaliacoes` de uma conta num papel, paginada por cursor. */
  avaliacoesRecebidas: (contaId: string, papel: PapelDoAvaliado) =>
    ['avaliacoesRecebidas', contaId, papel] as const,
  /** Prefixo de toda `avaliacoesRecebidas(...)`, de qualquer conta. */
  todasAsAvaliacoesRecebidas: () => ['avaliacoesRecebidas'] as const,
  /**
   * `GET /avaliacoes/resumos` da lista inteira de contas, na ordem pedida
   * (até 50 por requisição, em lotes dentro da mesma consulta). A chave é uma
   * só para a lista: quando ela cresce, a chave muda e todos os lotes são
   * refeitos.
   */
  resumosDeAvaliacoes: (contaIds: readonly string[]) =>
    ['resumosDeAvaliacoes', contaIds] as const,
  /** Prefixo de todo `resumosDeAvaliacoes(...)`. */
  todosOsResumosDeAvaliacoes: () => ['resumosDeAvaliacoes'] as const,
  /** `GET /avaliacoes/feitas` da lista inteira de trampos (lotes de até 50 na mesma chave). */
  avaliacoesFeitas: (trampoIds: readonly string[]) =>
    ['avaliacoesFeitas', trampoIds] as const,
  /** Prefixo de toda `avaliacoesFeitas(...)`. */
  todasAsAvaliacoesFeitas: () => ['avaliacoesFeitas'] as const,
  /** `GET /favoritos`: a equipe favorita da conta da sessão. */
  favoritos: () => ['favoritos'] as const,
};
