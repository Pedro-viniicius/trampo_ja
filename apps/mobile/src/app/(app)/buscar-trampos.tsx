import { useRouter } from 'expo-router';
import { BuscaDeUmTipo } from './(abas)/buscar';

/**
 * Busca de trampos do freela (CA84), aberta pelo "Ver todos" e pelo
 * "Buscar" do Início: tela de pilha, com voltar, sobre as abas.
 */
export default function RotaDeBuscarTrampos() {
  const router = useRouter();
  return (
    <BuscaDeUmTipo
      tipo="trampos"
      onVoltar={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      }}
    />
  );
}
