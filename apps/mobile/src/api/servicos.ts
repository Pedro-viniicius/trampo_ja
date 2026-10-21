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

/** `GET /servicos/meus`: os serviços da conta, mais recentes primeiro. */
export async function listarMeusServicos(
  cliente: ClienteHttp,
): Promise<readonly Servico[]> {
  return cliente.get<readonly Servico[]>('/servicos/meus');
}

function estaVazio(texto: string | null | undefined): boolean {
  return texto === undefined || texto === null || texto.trim() === '';
}
