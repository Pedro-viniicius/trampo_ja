import { type UseMutationResult, useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ClienteHttp } from '../../api/cliente';
import { cadastrar, entrar } from '../../api/contas';
import type { Credenciais, Sessao } from '../../api/tipos';
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

function useMutacaoDeSessao(
  chamar: FuncaoDeSessao,
): UseMutationResult<void, Error, Credenciais> {
  const cliente = useCliente();
  const sessao = useSessao();
  const mutacao = useMutation<void, Error, Credenciais>({
    gcTime: SEM_CACHE,
    mutationFn: async (credenciais) => {
      const { token } = await chamar(cliente, credenciais);
      await sessao.entrar(token);
    },
  });
  // Limpa `variables` (as credenciais) depois do sucesso. Não é no `onSuccess`
  // do hook porque `reset()` ali descartaria o `onSuccess` do `mutate(...)`
  // que a rota passar. Este efeito roda depois de todos os callbacks.
  const { isSuccess, reset } = mutacao;
  useEffect(() => {
    if (isSuccess) {
      reset();
    }
  }, [isSuccess, reset]);
  return mutacao;
}

/**
 * Cria a conta (`POST /contas`) e, no sucesso, entrega o token à sessão
 * (CA1). O token não sai da mutação: `data` é sempre `undefined` (CA15). As
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
 * `DELETE /sessoes` e saída local (token e cache apagados). A sessão nunca
 * rejeita, então a mutação também não. Roda mesmo sem conexão
 * (`networkMode: 'always'`): o padrão do TanStack pausaria a mutação e a
 * pessoa não conseguiria sair offline; a falha do `DELETE` não impede a saída
 * local.
 */
export function useSair() {
  const sessao = useSessao();
  return useMutation<void, Error, void>({
    mutationFn: () => sessao.sair(),
    networkMode: 'always',
  });
}
