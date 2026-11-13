import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useConexao } from '../../estado/conexao';
import { useCadastrar } from '../../estado/consultas/conta';
import { useFormularioDeAcesso } from '../../estado/formulario-de-acesso';
import { type Modo, useModo } from '../../estado/modo';
import { useNavegarUmaVez } from '../../estado/navegar-uma-vez';
import { Cadastro } from '../../telas';
import { type ChaveDeErro, textos } from '../../textos/pt-BR';

const erro = (chave: ChaveDeErro | undefined) =>
  chave === undefined ? undefined : textos.erros[chave];

export default function RotaCadastro() {
  const router = useRouter();
  const { online } = useConexao();
  const formulario = useFormularioDeAcesso('cadastro', useCadastrar());
  // Toque duplo no link não empilha dois documentos (Q3).
  const abrirDocumento = useNavegarUmaVez();
  const { definirModo } = useModo();
  // CA75: o objetivo começa sem escolha ("Criar conta" espera por ela) e
  // grava o modo no aparelho na hora da escolha, sem API. Assim as abas já
  // abrem no modo certo quando a sessão começa.
  const [objetivo, setObjetivo] = useState<Modo | null>(null);

  return (
    <Cadastro
      objetivo={objetivo}
      onEscolherObjetivo={(modo) => {
        setObjetivo(modo);
        void definirModo(modo);
      }}
      email={formulario.email}
      senha={formulario.senha}
      erros={{
        email: erro(formulario.erros.email),
        senha: erro(formulario.erros.senha),
        geral: erro(formulario.erros.geral),
      }}
      enviando={formulario.enviando}
      semConexao={!online}
      onMudarEmail={formulario.mudarEmail}
      onMudarSenha={formulario.mudarSenha}
      onCriarConta={() =>
        // Conta nova não tem perfil: vai direto completá-lo (CA1).
        formulario.enviar(() => router.replace('/perfil/editar?completar=1'))
      }
      onIrParaEntrar={() => router.replace('/entrar')}
      // `push` mantém o Cadastro na pilha: ao voltar, o rascunho continua.
      onTermos={() => abrirDocumento('/termos-de-uso')}
      onPolitica={() => abrirDocumento('/politica-de-privacidade')}
      onVoltar={() =>
        router.canGoBack() ? router.back() : router.replace('/entrada')
      }
    />
  );
}
