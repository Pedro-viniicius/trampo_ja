import { useRouter } from 'expo-router';
import { Entrada } from '../../telas';

export default function RotaDaEntrada() {
  const router = useRouter();
  return (
    <Entrada
      onCriarConta={() => router.push('/cadastro')}
      onJaTenhoConta={() => router.push('/entrar')}
    />
  );
}
