import { type UseMutationResult, useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import type { ClienteHttp } from '../../api/cliente';
import {
  cadastrar,
  entrar,
  excluirConta,
  exportarDados,
} from '../../api/contas';
import type { Credenciais, Sessao } from '../../api/tipos';
import {
  compartilharExportacao,
  type ResultadoDoCompartilhamento,
} from '../exportacao';
import { useCliente, useSessao } from '../sessao';

/**
 * Tempo, em ms, que a mutação fica no cache sem ninguém olhando. Zero tira as
 * credenciais (`variables`) da memória assim que a tela deixa de observar.
 */
const SEM_CACHE = 0;

/** Função da API que troca credenciais por um token de sessão. */
type FuncaoDeSessao = (
  cliente: ClienteHttp,
  credenciais: Credenciais,
) => Promise<Sessao>;

/**
 * Limpa `variables` (credenciais, senha) e `data` depois do sucesso. Não é no
 * `onSuccess` do hook porque `reset()` ali descartaria o `onSuccess` do
 * `mutate(...)` que a rota passar. Este efeito roda depois de todos os
 * callbacks.
 */
function useLimparDepoisDoSucesso({
  isSuccess,
  reset,
}: Pick<UseMutationResult<unknown, Error, never>, 'isSuccess' | 'reset'>) {
  useEffect(() => {
    if (isSuccess) {
      reset();
    }
  }, [isSuccess, reset]);
}

/**
 * Entrar e cadastrar rodam sem conexão (`networkMode: 'always'`) e falham na
 * hora com `ErroDeRede` (CA58): o padrão do TanStack pausaria a mutação com a
 * senha em `variables` e a enviaria sozinha quando a rede voltasse. Sem nova
 * tentativa (`retry: 0`): repetir o login gastaria o limite de tentativas.
 */
function useMutacaoDeSessao(
  chamar: FuncaoDeSessao,
): UseMutationResult<void, Error, Credenciais> {
  const cliente = useCliente();
  const sessao = useSessao();
  const mutacao = useMutation<void, Error, Credenciais>({
    networkMode: 'always',
    retry: 0,
    gcTime: SEM_CACHE,
    mutationFn: async (credenciais) => {
      const { token } = await chamar(cliente, credenciais);
      // O e-mail só vira a impressão da conta (D43), dentro da sessão.
      await sessao.entrar(token, credenciais.email);
    },
  });
  useLimparDepoisDoSucesso(mutacao);
  return mutacao;
}

/**
 * Cria a conta (`POST /contas`) e, no sucesso, entrega o token e o e-mail à
 * sessão (CA1; o e-mail vira a impressão da conta, D43). O token não sai da mutação: `data` é sempre `undefined` (CA15). As
 * credenciais ficam só em `variables` até a mutação terminar; no sucesso o
 * hook faz `reset()`. Erros sobem como `ErroDaApi`/`ErroDeRede`.
 */
export function useCadastrar() {
  return useMutacaoDeSessao(cadastrar);
}

/** Como `useCadastrar`, com `POST /sessoes`. */
export function useEntrar() {
  return useMutacaoDeSessao(entrar);
}

/**
 * Saída local (token, impressão e cache apagados) sem esperar a rede, e
 * `DELETE /sessoes` em segundo plano (S6; ver `Sessao.sair`). A sessão nunca
 * rejeita, então a mutação também não. Roda mesmo sem conexão
 * (`networkMode: 'always'`): o padrão do TanStack pausaria a mutação e a
 * pessoa não conseguiria sair offline.
 */
export function useSair() {
  const sessao = useSessao();
  return useMutation<void, Error, void>({
    mutationFn: () => sessao.sair(),
    networkMode: 'always',
  });
}

/** Geração da sessão em que a exclusão começou (ver `Sessao.geracao`). */
export interface ContextoDaExclusao {
  readonly geracao: number;
}

/**
 * `POST /contas/eu/exclusao` com a senha (CA17, D25). A senha vai em
 * `variables` (`mutate(senha)`) e sai do cache de mutações com o `reset()`
 * depois do sucesso e com `gcTime: 0` quando a tela deixa de observar
 * (CA24). Roda sem conexão (`networkMode: 'always'`, falha na hora com
 * `ErroDeRede`) e sem nova tentativa (`retry: 0`): repetir sozinho gastaria o
 * limite de 5 tentativas de senha.
 *
 * No sucesso, se a sessão ainda é a mesma em que o pedido começou, chama
 * `sessao.encerrarPorExclusao()`: token e cache apagados sem `DELETE
 * /sessoes`, e o login mostra `conta_excluida`. Erros sobem crus para a rota
 * traduzir com `chaveDoErro(erro, 'nenhum')`: 403 `senha_incorreta`, 429
 * (`muitas_tentativas_acao`), `ErroDeRede`; o 401 já expira a sessão pelo
 * cliente HTTP.
 */
export function useExcluirConta(): UseMutationResult<
  void,
  Error,
  string,
  ContextoDaExclusao
> {
  const cliente = useCliente();
  const sessao = useSessao();
  const mutacao = useMutation<void, Error, string, ContextoDaExclusao>({
    mutationFn: (senha) => excluirConta(cliente, senha),
    networkMode: 'always',
    retry: 0,
    gcTime: SEM_CACHE,
    onMutate: () => ({ geracao: sessao.geracao() }),
    onSuccess: async (_dados, _senha, contexto) => {
      // Outra sessão começou durante o pedido: não a derruba.
      if (contexto.geracao !== sessao.geracao()) {
        return;
      }
      await sessao.encerrarPorExclusao();
    },
  });
  useLimparDepoisDoSucesso(mutacao);
  return mutacao;
}

/** Resultado de `exportar(senha)` em `useExportarDados`. */
export type ResultadoDaExportacao =
  | { readonly tipo: 'compartilhado' }
  | { readonly tipo: 'indisponivel' }
  | { readonly tipo: 'erro'; readonly erro: Error }
  | { readonly tipo: 'descartada' };

const DESCARTADA: ResultadoDaExportacao = { tipo: 'descartada' };

function comoErro(erro: unknown): Error {
  return erro instanceof Error ? erro : new Error('falha desconhecida');
}

/**
 * `POST /contas/eu/exportacao` com a senha e entrega do JSON pela folha de
 * compartilhamento (CA19, D26). `exportar(senha)` nunca rejeita:
 *
 * - `compartilhado`: o arquivo foi gerado e a folha abriu e fechou (o
 *   cancelamento não é detectável).
 * - `indisponivel`: o aparelho não tem folha de compartilhamento, ou gravar o
 *   arquivo ou abrir a folha falhou (texto `compartilhamento_indisponivel`).
 * - `erro`: o pedido falhou; o erro vem cru (403 `senha_incorreta`, 429,
 *   `ErroDeRede`, 5xx) para a rota traduzir com `chaveDoErro(erro, 'nenhum')`.
 * - `descartada`: a sessão mudou durante o pedido (saída, expiração), e nada
 *   é compartilhado; ou já havia uma exportação em andamento (toque duplo).
 *
 * O JSON nunca entra no TanStack: a mutação só devolve o resultado acima, e
 * `exportar` faz `reset()` no fim (sucesso ou erro), o que tira a senha
 * (`variables`), o resultado e o erro do cache de mutações (CA24).
 * `exportando` vale `true` do pedido até a folha fechar.
 */
export function useExportarDados() {
  const cliente = useCliente();
  const { geracao } = useSessao();
  const emVoo = useRef(false);
  const geracaoDoPedido = useRef(0);
  const { mutateAsync, isPending, reset } = useMutation<
    ResultadoDoCompartilhamento | 'descartada',
    Error,
    string
  >({
    mutationFn: async (senha) => {
      const dados = await exportarDados(cliente, senha);
      if (geracaoDoPedido.current !== geracao()) {
        return 'descartada';
      }
      try {
        return await compartilharExportacao(dados);
      } catch {
        // O erro da biblioteca fica aqui, sem log (CA24).
        return 'indisponivel';
      }
    },
    networkMode: 'always',
    retry: 0,
    gcTime: SEM_CACHE,
  });

  const exportar = useCallback(
    async (senha: string): Promise<ResultadoDaExportacao> => {
      if (emVoo.current) {
        return DESCARTADA;
      }
      emVoo.current = true;
      const geracaoAntes = geracao();
      geracaoDoPedido.current = geracaoAntes;
      try {
        const tipo = await mutateAsync(senha);
        return tipo === 'descartada' || geracaoAntes !== geracao()
          ? DESCARTADA
          : { tipo };
      } catch (erro) {
        return geracaoAntes === geracao()
          ? { tipo: 'erro', erro: comoErro(erro) }
          : DESCARTADA;
      } finally {
        emVoo.current = false;
        reset();
      }
    },
    [geracao, mutateAsync, reset],
  );

  return { exportar, exportando: isPending };
}
