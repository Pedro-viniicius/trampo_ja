import { useRouter } from 'expo-router';
import { useNavegarUmaVez } from '../../estado/navegar-uma-vez';
import { Entrada } from '../../telas';

export default function RotaDaEntrada() {
  const router = useRouter();
  // Toque duplo no link não empilha dois documentos (Q3).
  const abrirDocumento = useNavegarUmaVez();
  return (
    <Entrada
      onCriarConta={() => router.push('/cadastro')}
      onJaTenhoConta={() => router.push('/entrar')}
      onTermos={() => abrirDocumento('/termos-de-uso')}
      onPolitica={() => abrirDocumento('/politica-de-privacidade')}
    />
  );
}
