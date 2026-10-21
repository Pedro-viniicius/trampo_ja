import { type ClienteHttp, segmentoDaUrl } from './cliente';
import { ehErroDaApi } from './erros';
import type { EntradaDePerfil, MeuPerfil, PerfilPublico } from './tipos';

/**
 * `GET /perfis/eu`. A API responde 404 enquanto a conta não salvou o perfil,
 * o que no app significa "perfil incompleto": vira `null`.
 */
export async function obterMeuPerfil(
  cliente: ClienteHttp,
): Promise<MeuPerfil | null> {
  try {
    return await cliente.get<MeuPerfil>('/perfis/eu');
  } catch (erro) {
    if (ehErroDaApi(erro) && erro.status === 404) {
      return null;
    }
    throw erro;
  }
}

/** `PUT /perfis/eu`: cria ou substitui o perfil. Só manda as chaves aceitas. */
export async function salvarMeuPerfil(
  cliente: ClienteHttp,
  { nome, cidade, descricao, habilidades }: EntradaDePerfil,
): Promise<MeuPerfil> {
  return cliente.put<MeuPerfil>('/perfis/eu', {
    nome,
    cidade,
    ...(descricao !== undefined && { descricao }),
    habilidades,
  });
}

/** `GET /perfis/:contaId`. 404 (inexistente ou incompleto): `nao_encontrado`. */
export async function obterPerfilPublico(
  cliente: ClienteHttp,
  contaId: string,
): Promise<PerfilPublico> {
  return cliente.get<PerfilPublico>(`/perfis/${segmentoDaUrl(contaId)}`);
}
