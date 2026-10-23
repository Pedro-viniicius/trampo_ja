import { type ClienteHttp, segmentoDaUrl } from './cliente';
import type {
  Criado,
  EntradaDeServico,
  Servico,
  StatusDoServico,
} from './tipos';

/** `GET /servicos/:id`. Inexistente: `ErroDaApi` 404 `nao_encontrado`. */
export async function obterServico(
  cliente: ClienteHttp,
  id: string,
): Promise<Servico> {
  return cliente.get<Servico>(`/servicos/${segmentoDaUrl(id)}`);
}

/**
 * `POST /servicos` (CA6). Só manda as chaves aceitas: a API recusa chave
 * extra com 400. `cidade` vazia não vai (D7: serviço sem cidade). 400
 * `dados_invalidos` traz os `campos`; 409 `perfil_incompleto` (D9).
 */
export async function ofertarServico(
  cliente: ClienteHttp,
  { titulo, descricao, categoria, cidade, precoBaseCentavos }: EntradaDeServico,
): Promise<Criado<StatusDoServico>> {
  return cliente.post<Criado<StatusDoServico>>('/servicos', {
    titulo,
    descricao,
    categoria,
    ...(!estaVazio(cidade) && { cidade }),
    precoBaseCentavos,
  });
}

/**
 * `PUT /servicos/:id` (CA32, D33). Só manda as chaves aceitas e a `versao`
 * lida: a API recusa chave extra com 400. `cidade` vazia não vai, e a API a
 * trata como "sem cidade" (D7). Resolve em 204. 400 `dados_invalidos` traz os
 * `campos`; 404 para quem não é o autor; 409 `conflito_de_versao`.
 */
export async function editarServico(
  cliente: ClienteHttp,
  id: string,
  {
    titulo,
    descricao,
    categoria,
    cidade,
    precoBaseCentavos,
    versao,
  }: EntradaDeServico & { readonly versao: number },
): Promise<void> {
  await cliente.put<void>(`/servicos/${segmentoDaUrl(id)}`, {
    titulo,
    descricao,
    categoria,
    ...(!estaVazio(cidade) && { cidade }),
    precoBaseCentavos,
    versao,
  });
}

/**
 * `DELETE /servicos/:id` (CA33). Resolve em 204; 404 para quem não é o autor.
 */
export async function excluirServico(
  cliente: ClienteHttp,
  id: string,
): Promise<void> {
  await cliente.delete<void>(`/servicos/${segmentoDaUrl(id)}`);
}

/** `GET /servicos/meus`: os serviços da conta, mais recentes primeiro. */
export async function listarMeusServicos(
  cliente: ClienteHttp,
): Promise<readonly Servico[]> {
  return cliente.get<readonly Servico[]>('/servicos/meus');
}

function estaVazio(texto: string | null | undefined): boolean {
  return texto === undefined || texto === null || texto.trim() === '';
}
