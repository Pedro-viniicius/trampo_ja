import { useLocalSearchParams, useRouter } from 'expo-router';
import { LeituraDeDica } from '../../../telas';
import { encontrarDica } from '../../../textos/dicas';

/**
 * Leitura de uma dica (CA81): conteúdo local, sem requisição. Id que não
 * existe mostra "não encontrado".
 */
export default function RotaDaLeituraDeDica() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const idDaDica = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const router = useRouter();

  return (
    <LeituraDeDica
      dica={encontrarDica(idDaDica)}
      onVoltar={() =>
        router.canGoBack() ? router.back() : router.replace('/dicas')
      }
    />
  );
}
