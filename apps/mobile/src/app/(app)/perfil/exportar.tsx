import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useConexao } from '../../../estado/conexao';
import { useExportarDados } from '../../../estado/consultas/conta';
import { chaveDoErro } from '../../../estado/erros';
import { ExportarDados } from '../../../telas';
import { type ChaveDeErro, textos } from '../../../textos/pt-BR';

/** Erro da exportação já traduzido, com o lugar onde a tela o mostra. */
interface ErroDaExportacao {
  readonly texto: string;
  /** `true`: vai ao campo de senha (`erroDaSenha`); `false`: aviso geral. */
  readonly daSenha: boolean;
}

/** Senha incorreta vai ao campo; o resto é aviso geral. */
function erroDaExportacao(chave: ChaveDeErro): ErroDaExportacao {
  return { texto: textos.erros[chave], daSenha: chave === 'senha_incorreta' };
}

/**
 * Exportar os dados (CA19, D26). `exportar(senha)` pede o JSON e o entrega
 * pela folha de compartilhamento (`compartilharExportacao`); o JSON nunca
 * passa por esta tela. A senha fica só no estado local (CA24).
 *
 * `descartada` (a sessão mudou no meio, ou toque duplo) não muda nada: a raiz
 * já está levando ao login, ou a primeira exportação segue. Depois de
 * compartilhar, a senha sai do estado: gerar de novo pede a senha outra vez.
 */
export default function RotaDeExportarDados() {
  const router = useRouter();
  const { online } = useConexao();
  const { exportar, exportando } = useExportarDados();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<ErroDaExportacao | undefined>(undefined);
  const [gerado, setGerado] = useState(false);

  const aoMudarSenha = (texto: string) => {
    setSenha(texto);
    setErro(undefined);
  };

  const aoGerar = async () => {
    if (exportando || senha.length === 0 || !online) {
      return;
    }
    setErro(undefined);
    const resultado = await exportar(senha);
    switch (resultado.tipo) {
      case 'compartilhado':
        setGerado(true);
        // A senha não fica na memória da tela depois do uso (S7).
        setSenha('');
        return;
      case 'indisponivel':
        setGerado(false);
        setErro(erroDaExportacao('compartilhamento_indisponivel'));
        return;
      case 'erro':
        setGerado(false);
        setErro(
          erroDaExportacao(
            chaveDoErro(resultado.erro, 'nenhum').geral ?? 'erro_servidor',
          ),
        );
        return;
      case 'descartada':
        return;
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
    <ExportarDados
      situacao={exportando ? 'gerando' : gerado ? 'gerado' : 'inicial'}
      senha={senha}
      onMudarSenha={aoMudarSenha}
      semConexao={!online}
      {...(erro !== undefined &&
        (erro.daSenha ? { erroDaSenha: erro.texto } : { erro: erro.texto }))}
      onGerar={() => {
        void aoGerar();
      }}
      onVoltar={voltar}
    />
  );
}
