import { type ClienteHttp, segmentoDaUrl } from './cliente';
import type {
  AvaliacaoCriada,
  AvaliacaoFeita,
  DestaqueDeContratante,
  DestaqueDeFreela,
  EntradaDeAvaliacao,
  Favorito,
  FiltrosDeAvaliacoes,
  PaginaDeAvaliacoes,
  ResumoDeAvaliacoes,
} from './tipos';

/** Ids por pedido de `resumos` e `feitas` (a API recusa mais com 400). */
export const MAXIMO_DE_IDS_POR_PEDIDO = 50;

/** Notas aceitas pela API. */
export const NOTA_MINIMA = 1;
export const NOTA_MAXIMA = 5;

/** Maior comentário aceito pela API, em caracteres. */
export const LIMITE_DO_COMENTARIO = 500;

/**
 * Destaques que a API aceita por papel de quem é avaliado, na ordem em que a
 * tela os mostra. O texto de cada código fica em `textos`.
 */
export const DESTAQUES_POR_PAPEL: {
  readonly freela: readonly DestaqueDeFreela[];
  readonly contratante: readonly DestaqueDeContratante[];
} = {
  freela: ['pontual', 'organizado', 'rapido', 'educado', 'proativo'],
  contratante: [
    'pagamento_em_dia',
    'ambiente_organizado',
    'instrucoes_claras',
    'respeitoso',
    'pontual',
  ],
};

/**
 * `POST /avaliacoes` (CA87, CA88). Só os quatro campos do contrato vão no
 * corpo (a API recusa chave extra com 400); `destaques` e `comentario`
 * ausentes não vão. 201 `{id}`; 400 `dados_invalidos` com os `campos`; 404
 * `nao_encontrado` para quem não é parte do trampo (ou trampo inexistente);
 * 409 `trampo_nao_encerrado` e `avaliacao_ja_feita`. O comentário nunca entra
 * no erro (CA15).
 */
export async function enviarAvaliacao(
  cliente: ClienteHttp,
  { trampoId, nota, destaques, comentario }: EntradaDeAvaliacao,
): Promise<AvaliacaoCriada> {
  return cliente.post<AvaliacaoCriada>('/avaliacoes', {
    trampoId,
    nota,
    ...(destaques !== undefined && { destaques }),
    ...(comentario !== undefined && { comentario }),
  });
}

/**
 * `GET /avaliacoes?contaId&papel&antesDe&limite` (CA90): as avaliações
 * recebidas pela conta no papel, das mais recentes para as mais antigas. A
 * próxima página usa `antesDe` com o `proximoCursor` da anterior.
 */
export async function listarAvaliacoesRecebidas(
  cliente: ClienteHttp,
  { contaId, papel, antesDe, limite }: FiltrosDeAvaliacoes,
): Promise<PaginaDeAvaliacoes> {
  return cliente.get<PaginaDeAvaliacoes>('/avaliacoes', {
    query: { contaId, papel, antesDe, limite },
  });
}

/**
 * `GET /avaliacoes/resumos?contas=` (CA89): um resumo por conta, até
 * `MAXIMO_DE_IDS_POR_PEDIDO`. Sem ids não há requisição (a API responderia
 * 400 `obrigatorio`); com mais, a API responde 400 `tamanho`: quem chama
 * divide em lotes.
 */
export async function listarResumosDeAvaliacoes(
  cliente: ClienteHttp,
  contaIds: readonly string[],
): Promise<readonly ResumoDeAvaliacoes[]> {
  if (contaIds.length === 0) {
    return [];
  }
  return cliente.get<readonly ResumoDeAvaliacoes[]>('/avaliacoes/resumos', {
    query: { contas: contaIds.join(',') },
  });
}

/**
 * `GET /avaliacoes/feitas?trampos=` (CA91): as avaliações que a conta da
 * sessão fez nos trampos pedidos, até `MAXIMO_DE_IDS_POR_PEDIDO`. Sem ids não
 * há requisição.
 */
export async function listarAvaliacoesFeitas(
  cliente: ClienteHttp,
  trampoIds: readonly string[],
): Promise<readonly AvaliacaoFeita[]> {
  if (trampoIds.length === 0) {
    return [];
  }
  return cliente.get<readonly AvaliacaoFeita[]>('/avaliacoes/feitas', {
    query: { trampos: trampoIds.join(',') },
  });
}

/** `GET /favoritos` (CA92): a equipe favorita da conta, mais recentes primeiro. */
export async function listarFavoritos(
  cliente: ClienteHttp,
): Promise<readonly Favorito[]> {
  return cliente.get<readonly Favorito[]>('/favoritos');
}

/**
 * `PUT /favoritos/:contaId` (CA92): 204, também se já era favorito. 404 sem
 * vínculo com a conta; 409 `favorito_invalido` (a própria conta) e
 * `limite_de_favoritos`.
 */
export async function favoritar(
  cliente: ClienteHttp,
  contaId: string,
): Promise<void> {
  return cliente.put<void>(`/favoritos/${segmentoDaUrl(contaId)}`);
}

/** `DELETE /favoritos/:contaId` (CA92): 204, também se não era favorito. */
export async function desfavoritar(
  cliente: ClienteHttp,
  contaId: string,
): Promise<void> {
  return cliente.delete<void>(`/favoritos/${segmentoDaUrl(contaId)}`);
}
