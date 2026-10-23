import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useConexao } from '../../../estado/conexao';
import { useExcluirConta } from '../../../estado/consultas/conta';
import { chaveDoErro } from '../../../estado/erros';
import { ExcluirConta } from '../../../telas';
import { textos } from '../../../textos/pt-BR';

/** Erro da exclusão já traduzido, com o lugar onde a tela o mostra. */
interface ErroDaExclusao {
  readonly texto: string;
  /** `true`: vai ao campo de senha (`erroDaSenha`); `false`: aviso geral. */
  readonly daSenha: boolean;
}

/**
 * Traduz o erro da exclusão (`chaveDoErro(erro, 'nenhum')`). Senha incorreta
 * vai ao campo; o resto é aviso geral. Sem conexão e erro do servidor ganham a
 * versão que diz que a conta não foi excluída; 429 é o limite de ações.
 */
function erroDaExclusao(erro: unknown): ErroDaExclusao {
  const chave = chaveDoErro(erro, 'nenhum').geral ?? 'erro_servidor';
  switch (chave) {
    case 'senha_incorreta':
      return { texto: textos.erros.senha_incorreta, daSenha: true };
    case 'sem_conexao':
      return { texto: textos.excluirConta.semConexaoMotivo, daSenha: false };
    case 'erro_servidor':
      return { texto: textos.excluirConta.erroServidor, daSenha: false };
    default:
      return { texto: textos.erros[chave], daSenha: false };
  }
}

/**
 * Excluir a conta (CA17, D25). A senha fica só no estado desta tela (nada na
 * URL, `testID` ou `console`, CA24). A tela pede a confirmação no diálogo e
 * só então chama `onExcluir`.
 *
 * No sucesso, o `useExcluirConta` encerra a sessão sem `DELETE /sessoes`, e a
 * raiz leva ao login com "Sua conta foi excluída.". No erro, o texto é
 * guardado antes do `reset()`, que tira a senha de `variables` no cache de
 * mutações. O `useExcluirConta` não trava toque duplo: a trava é o `useRef`.
 */
export default function RotaDeExcluirConta() {
  const router = useRouter();
  const { online } = useConexao();
  const exclusao = useExcluirConta();
  const { mutateAsync, reset } = exclusao;
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<ErroDaExclusao | undefined>(undefined);
  const emVoo = useRef(false);

  const aoMudarSenha = (texto: string) => {
    setSenha(texto);
    setErro(undefined);
  };

  const aoExcluir = async () => {
    if (emVoo.current || senha.length === 0 || !online) {
      return;
    }
    emVoo.current = true;
    setErro(undefined);
    try {
      await mutateAsync(senha);
    } catch (falha) {
      setErro(erroDaExclusao(falha));
      reset();
    } finally {
      emVoo.current = false;
    }
  };

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/perfil/conta');
    }
  };

  return (
    <ExcluirConta
      senha={senha}
      onMudarSenha={aoMudarSenha}
      excluindo={exclusao.isPending}
      semConexao={!online}
      {...(erro !== undefined &&
        (erro.daSenha ? { erroDaSenha: erro.texto } : { erro: erro.texto }))}
      onExcluir={() => {
        void aoExcluir();
      }}
      onExportar={() => router.push('/perfil/exportar')}
      onCancelar={voltar}
    />
  );
}
