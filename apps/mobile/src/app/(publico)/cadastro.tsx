import { useRouter } from 'expo-router';
import { useConexao } from '../../estado/conexao';
import { useCadastrar } from '../../estado/consultas/conta';
import { useFormularioDeAcesso } from '../../estado/formulario-de-acesso';
import { Cadastro } from '../../telas';
import { type ChaveDeErro, textos } from '../../textos/pt-BR';

const erro = (chave: ChaveDeErro | undefined) =>
  chave === undefined ? undefined : textos.erros[chave];

export default function RotaCadastro() {
  const router = useRouter();
  const { online } = useConexao();
  const formulario = useFormularioDeAcesso('cadastro', useCadastrar());

  return (
    <Cadastro
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
      onVoltar={() =>
        router.canGoBack() ? router.back() : router.replace('/entrada')
      }
    />
  );
}
