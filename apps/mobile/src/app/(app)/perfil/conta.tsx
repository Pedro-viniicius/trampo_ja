import { useRouter } from 'expo-router';
import { useConexao } from '../../../estado/conexao';
import { useSair } from '../../../estado/consultas/conta';
import { useNavegarUmaVez } from '../../../estado/navegar-uma-vez';
import { ContaEPrivacidade } from '../../../telas';

/**
 * Conta e privacidade (CA17, CA19, CA21): atalhos para exportar e excluir a
 * conta, os documentos legais (rotas da raiz, sem rede) e "Sair". A tela já
 * confirma a saída; sem conexão, exportar e excluir ficam desabilitados.
 */
export default function RotaDeContaEPrivacidade() {
  const router = useRouter();
  const { online } = useConexao();
  const sair = useSair();
  // Toque duplo no link não empilha dois documentos (Q3).
  const abrirDocumento = useNavegarUmaVez();

  return (
    <ContaEPrivacidade
      semConexao={!online}
      onExportar={() => router.push('/perfil/exportar')}
      onExcluir={() => router.push('/perfil/excluir')}
      onPolitica={() => abrirDocumento('/politica-de-privacidade')}
      onTermos={() => abrirDocumento('/termos-de-uso')}
      onSair={() => sair.mutate()}
      onVoltar={() =>
        router.canGoBack() ? router.back() : router.replace('/perfil')
      }
    />
  );
}
