import { useRouter } from 'expo-router';
import { EscolhaDePublicacao } from '../../../telas';

/** Aba Publicar: a pessoa escolhe entre publicar um trampo e ofertar um serviço. */
export default function RotaDePublicar() {
  const router = useRouter();
  return (
    <EscolhaDePublicacao
      onPublicarTrampo={() => router.push('/trampos/novo')}
      onOfertarServico={() => router.push('/servicos/novo')}
    />
  );
}
