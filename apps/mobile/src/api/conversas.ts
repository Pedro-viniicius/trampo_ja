import { type ClienteHttp, segmentoDaUrl } from './cliente';
import type {
  ConversaAberta,
  Mensagem,
  MensagemEnviada,
  ResumoDeConversa,
} from './tipos';

/**
 * `POST /conversas` (CA13). O corpo leva só `{outroUsuarioId}`: a API recusa
 * chave extra com 400. 201 (conversa nova) e 200 (o par já tinha conversa)
 * devolvem o mesmo `{conversaId}`. 403 `sem_vinculo` sem candidatura em
 * comum; 409 `conversa_consigo_mesmo`; 404 `nao_encontrado`; 400
 * `dados_invalidos`.
 */
export async function abrirConversa(
  cliente: ClienteHttp,
  outroUsuarioId: string,
): Promise<ConversaAberta> {
  return cliente.post<ConversaAberta>('/conversas', { outroUsuarioId });
}

/** `GET /conversas`: as conversas da conta, última atividade primeiro. */
export async function listarConversas(
  cliente: ClienteHttp,
): Promise<readonly ResumoDeConversa[]> {
  return cliente.get<readonly ResumoDeConversa[]>('/conversas');
}

/**
 * `GET /conversas/:id/mensagens` (CA12): até 50, na ordem de envio. Sem
 * `depoisDe` (ausente, `null` ou em branco), a consulta não vai na URL e vem
 * a primeira página; com ele, só as mensagens enviadas depois daquele id.
 * Quem não participa recebe 404 `nao_encontrado`.
 */
export async function listarMensagens(
  cliente: ClienteHttp,
  conversaId: string,
  depoisDe?: string | null,
): Promise<readonly Mensagem[]> {
  return cliente.get<readonly Mensagem[]>(
    `/conversas/${segmentoDaUrl(conversaId)}/mensagens`,
    { query: { depoisDe } },
  );
}

/**
 * `POST /conversas/:id/mensagens` (CA12). O corpo leva só `{texto}`, como
 * veio: aparar e limitar é do estado. 400 `dados_invalidos` para texto vazio;
 * 404 `nao_encontrado` para quem não participa. O texto nunca entra no erro
 * (CA15).
 */
export async function enviarMensagem(
  cliente: ClienteHttp,
  conversaId: string,
  texto: string,
): Promise<MensagemEnviada> {
  return cliente.post<MensagemEnviada>(
    `/conversas/${segmentoDaUrl(conversaId)}/mensagens`,
    { texto },
  );
}
