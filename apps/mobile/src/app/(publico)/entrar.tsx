import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useConexao } from '../../estado/conexao';
import { useEntrar } from '../../estado/consultas/conta';
import { useFormularioDeAcesso } from '../../estado/formulario-de-acesso';
import {
  type RetornoDaSessao,
  rotaParaAConta,
  useSessao,
} from '../../estado/sessao';
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
  const retornoDaSessao = useRef<RetornoDaSessao>({});
  const retornoLido = useRef(false);

  // Sessão expirada (CA14): mostra o aviso e guarda para onde voltar (e de
  // que conta). Num efeito, e uma vez só, porque ler o retorno o apaga da
  // sessão.
  useEffect(() => {
    if (retornoLido.current) {
      return;
    }
    retornoLido.current = true;
    const { rota, conta, aviso } = consumirRetorno();
    retornoDaSessao.current = {
      ...(rota !== undefined && { rota }),
      ...(conta !== undefined && { conta }),
    };
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
      onEntrar={() => {
        // O mesmo e-mail que o `enviar` deste render manda à API.
        const { email } = formulario;
        formulario.enviar(() => {
          // A rota só vale para a mesma conta (CA50). Sem ela, o guarda da
          // raiz leva ao Início.
          const rota = rotaParaAConta(retornoDaSessao.current, email);
          if (rota !== undefined) {
            router.replace(rota as Href);
          }
        });
      }}
      onIrParaCadastro={() => router.replace('/cadastro')}
      onVoltar={() =>
        router.canGoBack() ? router.back() : router.replace('/entrada')
      }
    />
  );
}
