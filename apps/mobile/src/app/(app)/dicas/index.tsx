import { useRouter } from 'expo-router';
import { useNavegarUmaVez } from '../../../estado/navegar-uma-vez';
import { Dicas } from '../../../telas';

/**
 * Dicas & minicursos (CA81): conteúdo local (`textos/dicas.ts`), sem
 * requisição. A tela filtra por categoria; o toque abre a leitura.
 */
export default function RotaDasDicas() {
  const router = useRouter();
  // Toque duplo no cartão não empilha duas leituras.
  const abrirLeitura = useNavegarUmaVez();

  return (
    <Dicas
      onAbrir={(id) =>
        abrirLeitura({ pathname: '/dicas/[id]', params: { id } })
      }
      onVoltar={() =>
        router.canGoBack() ? router.back() : router.replace('/perfil')
      }
    />
  );
}
