import { type ClienteHttp, segmentoDaUrl } from './cliente';
import type { Servico } from './tipos';

/** `GET /servicos/:id`. Inexistente: `ErroDaApi` 404 `nao_encontrado`. */
export async function obterServico(
  cliente: ClienteHttp,
  id: string,
): Promise<Servico> {
  return cliente.get<Servico>(`/servicos/${segmentoDaUrl(id)}`);
}
