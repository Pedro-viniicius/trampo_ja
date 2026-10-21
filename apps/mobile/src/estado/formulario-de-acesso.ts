import type { UseMutationResult } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { Credenciais } from '../api/tipos';
import type { ChaveDeErro } from '../textos/pt-BR';
import { chaveDoErro } from './erros';
import { validarEmail, validarSenha } from './validacao';

/** Erros do formulário como chaves de `textos.erros` (o contêiner traduz). */
export interface ErrosDoAcesso {
  readonly email?: ChaveDeErro;
  readonly senha?: ChaveDeErro;
  readonly geral?: ChaveDeErro;
}

export interface FormularioDeAcesso {
  readonly email: string;
  readonly senha: string;
  readonly erros: ErrosDoAcesso;
  readonly enviando: boolean;
  readonly mudarEmail: (texto: string) => void;
  readonly mudarSenha: (texto: string) => void;
  /** Mostra um aviso geral (ex.: `sessao_expirada` vindo da sessão). */
  readonly mostrarAviso: (chave: ChaveDeErro) => void;
  /**
   * Valida no aparelho e, se passar, envia. A senha sai do estado no envio,
   * dê certo ou não (CA15). `aoTerSucesso` só roda com a tela montada.
   */
  readonly enviar: (aoTerSucesso: () => void) => void;
}

/**
 * Estado e envio dos formulários Entrar e Cadastro (CA1, CA2, CA15). A senha
 * fica só neste estado local: não vai para contexto, cache, URL nem log. As
 * credenciais passam pela mutação, que é zerada ao terminar (no sucesso pelo
 * hook da mutação, no erro aqui).
 */
export function useFormularioDeAcesso(
  formulario: 'entrar' | 'cadastro',
  mutacao: UseMutationResult<void, Error, Credenciais>,
): FormularioDeAcesso {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState<ErrosDoAcesso>({});
  const { mutate, isPending, isError, reset } = mutacao;

  // Tira as credenciais (`variables`) da mutação que falhou. O erro já foi
  // traduzido no `onError`, que roda antes deste efeito.
  useEffect(() => {
    if (isError) {
      reset();
    }
  }, [isError, reset]);

  const mostrarAviso = useCallback((chave: ChaveDeErro) => {
    setErros({ geral: chave });
  }, []);

  const enviar = useCallback(
    (aoTerSucesso: () => void) => {
      if (isPending) {
        return;
      }
      const erroDoEmail = validarEmail(email);
      const erroDaSenha = validarSenha(senha);
      if (erroDoEmail !== null || erroDaSenha !== null) {
        setErros({
          ...(erroDoEmail !== null && { email: erroDoEmail }),
          ...(erroDaSenha !== null && { senha: erroDaSenha }),
        });
        return;
      }
      setErros({});
      setSenha('');
      mutate(
        { email: email.trim(), senha },
        {
          onSuccess: aoTerSucesso,
          onError: (erro) => {
            const { geral, campos } = chaveDoErro(erro, formulario);
            setErros({
              ...(geral !== undefined && { geral }),
              ...(campos.email !== undefined && { email: campos.email }),
              ...(campos.senha !== undefined && { senha: campos.senha }),
            });
          },
        },
      );
    },
    [email, formulario, isPending, mutate, senha],
  );

  return {
    email,
    senha,
    erros,
    enviando: isPending,
    mudarEmail: setEmail,
    mudarSenha: setSenha,
    mostrarAviso,
    enviar,
  };
}
