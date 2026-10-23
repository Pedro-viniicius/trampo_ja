/**
 * Contas e sessões. Como em todo `src/api/*`, cada função recebe o
 * `ClienteHttp` como primeiro parâmetro (o contêiner ou o hook de consulta
 * pega o cliente da sessão).
 */
import type { ClienteHttp } from './cliente';
import { ErroDaApi } from './erros';
import type {
  ConfirmacaoComSenha,
  Credenciais,
  DadosExportados,
  Sessao,
} from './tipos';

/** `POST /contas`, sem token. 409 `email_em_uso` sai como `ErroDaApi`. */
export async function cadastrar(
  cliente: ClienteHttp,
  { email, senha }: Credenciais,
): Promise<Sessao> {
  return cliente.post<Sessao>(
    '/contas',
    { email, senha },
    { autenticar: false },
  );
}

/** `POST /sessoes`, sem token. Senha errada: `credenciais_invalidas`. */
export async function entrar(
  cliente: ClienteHttp,
  { email, senha }: Credenciais,
): Promise<Sessao> {
  return cliente.post<Sessao>(
    '/sessoes',
    { email, senha },
    { autenticar: false },
  );
}

/** `DELETE /sessoes`: revoga só a sessão do token enviado. */
export async function sair(cliente: ClienteHttp): Promise<void> {
  await cliente.delete<void>('/sessoes');
}

/**
 * `POST /contas/eu/exclusao` (CA17), com token. O corpo leva só `{senha}`.
 * 204 apaga a conta e derruba todas as sessões. 403 `senha_incorreta`, 429
 * `muitas_requisicoes` e 401 (sessão expirada, que chama `aoExpirar`) saem
 * como `ErroDaApi`, sem a senha (CA24).
 */
export async function excluirConta(
  cliente: ClienteHttp,
  senha: string,
): Promise<void> {
  const corpo: ConfirmacaoComSenha = { senha };
  await cliente.post<void>('/contas/eu/exclusao', corpo);
}

/**
 * `POST /contas/eu/exportacao` (CA19), com token. O corpo leva só `{senha}`;
 * os erros são os da exclusão. Resposta que não seja um objeto com `formato`
 * em texto (vazia, 204, lista) vira `ErroDaApi(200, 'interno')`, sem nada do
 * corpo (CA24).
 */
export async function exportarDados(
  cliente: ClienteHttp,
  senha: string,
): Promise<DadosExportados> {
  const corpo: ConfirmacaoComSenha = { senha };
  const dados = await cliente.post<unknown>('/contas/eu/exportacao', corpo);
  if (!ehDadosExportados(dados)) {
    throw new ErroDaApi(200, 'interno');
  }
  return dados;
}

function ehDadosExportados(dados: unknown): dados is DadosExportados {
  return (
    typeof dados === 'object' &&
    dados !== null &&
    !Array.isArray(dados) &&
    typeof (dados as { formato?: unknown }).formato === 'string'
  );
}
