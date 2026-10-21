/**
 * Contas e sessões. Como em todo `src/api/*`, cada função recebe o
 * `ClienteHttp` como primeiro parâmetro (o contêiner ou o hook de consulta
 * pega o cliente da sessão).
 */
import type { ClienteHttp } from './cliente';
import type { Credenciais, Sessao } from './tipos';

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
