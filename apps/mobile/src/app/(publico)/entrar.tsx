import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useConexao } from '../../estado/conexao';
import { useEntrar } from '../../estado/consultas/conta';
import { useFormularioDeAcesso } from '../../estado/formulario-de-acesso';
import { useSessao } from '../../estado/sessao';
import { Entrar } from '../../telas';
import { type ChaveDeErro, textos } from '../../textos/pt-BR';

const erro = (chave: ChaveDeErro | undefined) =>
  chave === undefined ? undefined : textos.erros[chave];

export default function RotaEntrar() {
  const router = useRouter();
  const { online } = useConexao();
  const { consumirRetorno } = useSessao();
  const formulario = useFormularioDeAcesso('entrar', useEntrar());
  const { mostrarAviso } = formulario;
  const rotaDeRetorno = useRef<string | undefined>(undefined);
  const retornoLido = useRef(false);

  // Sessão expirada (CA14): mostra o aviso e guarda para onde voltar. Num
  // efeito, e uma vez só, porque ler o retorno o apaga da sessão.
  useEffect(() => {
    if (retornoLido.current) {
      return;
    }
    retornoLido.current = true;
    const { rota, aviso } = consumirRetorno();
    rotaDeRetorno.current = rota;
    if (aviso !== undefined) {
      mostrarAviso(aviso);
    }
  }, [consumirRetorno, mostrarAviso]);

  return (
    <Entrar
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
      onEntrar={() =>
        formulario.enviar(() => {
          // Sem rota de retorno, o guarda da raiz leva ao Início.
          const rota = rotaDeRetorno.current;
          if (rota !== undefined) {
            router.replace(rota as Href);
          }
        })
      }
      onIrParaCadastro={() => router.replace('/cadastro')}
      onVoltar={() =>
        router.canGoBack() ? router.back() : router.replace('/entrada')
      }
    />
  );
}
