import { type ClienteHttp, segmentoDaUrl } from './cliente';
import type {
  CandidaturaRecebida,
  Criado,
  EntradaDeCandidatura,
  EntradaDeTrampo,
  MinhaCandidatura,
  ResultadoDoAceite,
  StatusDaCandidatura,
  StatusDoTrampo,
  Trampo,
} from './tipos';

/** `GET /trampos/:id`. Inexistente: `ErroDaApi` 404 `nao_encontrado`. */
export async function obterTrampo(
  cliente: ClienteHttp,
  id: string,
): Promise<Trampo> {
  return cliente.get<Trampo>(`/trampos/${segmentoDaUrl(id)}`);
}

/**
 * `POST /trampos` (CA4). Só manda as chaves aceitas: a API recusa chave extra
 * com 400. `prazo` vazio não vai. 400 `dados_invalidos` traz os `campos`;
 * 409 `perfil_incompleto` (D9).
 */
export async function publicarTrampo(
  cliente: ClienteHttp,
  {
    titulo,
    descricao,
    categoria,
    cidade,
    valorCentavos,
    prazo,
  }: EntradaDeTrampo,
): Promise<Criado<StatusDoTrampo>> {
  return cliente.post<Criado<StatusDoTrampo>>('/trampos', {
    titulo,
    descricao,
    categoria,
    cidade,
    valorCentavos,
    ...(!estaVazio(prazo) && { prazo }),
  });
}

/**
 * `PUT /trampos/:id` (CA32, D33). Só manda as chaves aceitas e a `versao`
 * lida: a API recusa chave extra com 400. `prazo` vazio não vai, e a API o
 * trata como "sem prazo". Resolve em 204. 400 `dados_invalidos` traz os
 * `campos`; 404 para quem não é o autor; 409 `trampo_nao_editavel` ou
 * `conflito_de_versao`.
 */
export async function editarTrampo(
  cliente: ClienteHttp,
  id: string,
  {
    titulo,
    descricao,
    categoria,
    cidade,
    valorCentavos,
    prazo,
    versao,
  }: EntradaDeTrampo & { readonly versao: number },
): Promise<void> {
  await cliente.put<void>(`/trampos/${segmentoDaUrl(id)}`, {
    titulo,
    descricao,
    categoria,
    cidade,
    valorCentavos,
    ...(!estaVazio(prazo) && { prazo }),
    versao,
  });
}

/**
 * `POST /trampos/:id/encerrar` (CA33). Vai sem corpo e, portanto, sem
 * `Content-Type`: a API recusa corpo JSON vazio com 400. Resolve em 204,
 * inclusive se o trampo já estava encerrado; 404 para quem não é o autor.
 */
export async function encerrarTrampo(
  cliente: ClienteHttp,
  id: string,
): Promise<void> {
  await cliente.post<void>(`/trampos/${segmentoDaUrl(id)}/encerrar`);
}

/**
 * `DELETE /trampos/:id` (CA33). Resolve em 204; 404 para quem não é o autor;
 * 409 `trampo_nao_aberto`.
 */
export async function excluirTrampo(
  cliente: ClienteHttp,
  id: string,
): Promise<void> {
  await cliente.delete<void>(`/trampos/${segmentoDaUrl(id)}`);
}

/**
 * Cursor de `GET /trampos/meus` (D47): o `criadoEm` e o `id` do último
 * trampo da página anterior, como vieram da API.
 */
export interface CursorDeMeusTrampos {
  readonly criadoEm: string;
  readonly id: string;
}

/** Página pedida a `GET /trampos/meus`. */
export interface PaginaDeMeusTrampos {
  /** De 1 a 50; sem ele, a API assume 20. */
  readonly limite?: number;
  /** Sem cursor, vem a primeira página. */
  readonly antesDe?: CursorDeMeusTrampos;
}

/**
 * `GET /trampos/meus` (D47): uma página dos trampos da conta, na visão do
 * autor, dos mais recentes para os mais antigos. O cursor vai em
 * `antesDeCriadoEm` e `antesDeId`, sempre os dois juntos (a API recusa um só
 * com 400). Sem opções, vem a primeira página, com o limite da API.
 */
export async function listarMeusTrampos(
  cliente: ClienteHttp,
  { limite, antesDe }: PaginaDeMeusTrampos = {},
): Promise<readonly Trampo[]> {
  return cliente.get<readonly Trampo[]>('/trampos/meus', {
    query: {
      limite,
      ...(antesDe !== undefined && {
        antesDeCriadoEm: antesDe.criadoEm,
        antesDeId: antesDe.id,
      }),
    },
  });
}

/**
 * `POST /trampos/:id/candidaturas` (CA8). 409: `perfil_incompleto`,
 * `autor_nao_pode_candidatar`, `candidatura_duplicada`, `trampo_nao_aberto`
 * ou `conflito_de_versao`; 404 se o trampo não existe.
 */
export async function candidatar(
  cliente: ClienteHttp,
  trampoId: string,
  { mensagem, valorPropostoCentavos }: EntradaDeCandidatura,
): Promise<Criado<StatusDaCandidatura>> {
  return cliente.post<Criado<StatusDaCandidatura>>(
    `/trampos/${segmentoDaUrl(trampoId)}/candidaturas`,
    { mensagem, valorPropostoCentavos },
  );
}

/**
 * `GET /trampos/:id/candidaturas`: só o autor vê; para os demais (e para o
 * trampo inexistente), 404 `nao_encontrado`.
 */
export async function listarCandidaturasDoTrampo(
  cliente: ClienteHttp,
  trampoId: string,
): Promise<readonly CandidaturaRecebida[]> {
  return cliente.get<readonly CandidaturaRecebida[]>(
    `/trampos/${segmentoDaUrl(trampoId)}/candidaturas`,
  );
}

/**
 * `POST /trampos/:id/candidaturas/:cid/aceitar` (CA10). Vai sem corpo e,
 * portanto, sem `Content-Type`: a API recusa corpo JSON vazio com 400. 404
 * para quem não é o autor; 409 `trampo_nao_aberto` (inclusive o aceite que
 * perdeu a disputa), `candidatura_nao_pendente` ou `conflito_de_versao`.
 */
export async function aceitarCandidatura(
  cliente: ClienteHttp,
  trampoId: string,
  candidaturaId: string,
): Promise<ResultadoDoAceite> {
  return cliente.post<ResultadoDoAceite>(
    `/trampos/${segmentoDaUrl(trampoId)}/candidaturas/${segmentoDaUrl(candidaturaId)}/aceitar`,
  );
}

/** `GET /candidaturas/minhas`: as candidaturas da conta, com o `trampoId`. */
export async function listarMinhasCandidaturas(
  cliente: ClienteHttp,
): Promise<readonly MinhaCandidatura[]> {
  return cliente.get<readonly MinhaCandidatura[]>('/candidaturas/minhas');
}

/**
 * `DELETE /candidaturas/:id` (CA34). Resolve em 204; 404 para quem não é
 * dono da candidatura; 409 `candidatura_nao_pendente`.
 */
export async function retirarCandidatura(
  cliente: ClienteHttp,
  candidaturaId: string,
): Promise<void> {
  await cliente.delete<void>(`/candidaturas/${segmentoDaUrl(candidaturaId)}`);
}

function estaVazio(texto: string | null | undefined): boolean {
  return texto === undefined || texto === null || texto.trim() === '';
}
