import { useRouter } from 'expo-router';
import { useSessao } from '../estado/sessao';
import { DocumentoLegal } from '../telas';
import { politicaDePrivacidade } from '../textos/legal';

/**
 * Documento legal empacotado no app (sem rede). Fica na raiz, fora dos
 * `Stack.Protected`, para abrir com e sem sessão.
 */
export default function RotaDaPoliticaDePrivacidade() {
  const router = useRouter();
  const { status } = useSessao();
  return (
    <DocumentoLegal
      documento={politicaDePrivacidade}
      onVoltar={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          // Aberto direto (link ou URL): volta ao começo da área atual.
          router.replace(status === 'autenticado' ? '/' : '/entrada');
        }
      }}
    />
  );
}
