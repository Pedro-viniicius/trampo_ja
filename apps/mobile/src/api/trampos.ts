import { type ClienteHttp, segmentoDaUrl } from './cliente';
import type { Trampo } from './tipos';

/** `GET /trampos/:id`. Inexistente: `ErroDaApi` 404 `nao_encontrado`. */
export async function obterTrampo(
  cliente: ClienteHttp,
  id: string,
): Promise<Trampo> {
  return cliente.get<Trampo>(`/trampos/${segmentoDaUrl(id)}`);
}
