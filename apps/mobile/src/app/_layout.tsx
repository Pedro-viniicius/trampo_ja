import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { opcoesDoCabecalho } from '../componentes/navegacao';
import { criarArmazenamentoSeguro } from '../estado/armazenamento-token';
import {
  criarQueryClient,
  ligarGerenciadores,
} from '../estado/cliente-de-consultas';
import { Provedores } from '../estado/provedores';
import { useSessao } from '../estado/sessao';

// A splash fica até a sessão saber se há token (ver `NavegacaoRaiz`). Chamada
// fora do componente, como pede o expo-splash-screen; falhar só a esconde antes.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Pilha raiz, por status da sessão: `(publico)` sem sessão e `(app)` com
 * sessão (`Stack.Protected`). Enquanto a sessão carrega, não desenha nada e a
 * splash continua. Exportada à parte para os testes de rota a montarem sobre
 * provedores com fakes.
 */
export function NavegacaoRaiz() {
  const { status } = useSessao();
  const router = useRouter();
  // Sem sessão, uma rota de `(app)` leva à Entrada (a âncora de `(publico)`);
  // se já houve sessão neste uso do app (401 ou sair), leva ao login, onde
  // aparece o aviso de sessão expirada (CA14). O `Stack.Protected` do SDK 57
  // não tem `redirectTo`: o destino do login é navegado aqui, por cima da
  // Entrada, para o "Voltar" do login continuar levando a ela.
  const [houveSessao, setHouveSessao] = useState(false);

  useEffect(() => {
    if (status === 'autenticado') {
      setHouveSessao(true);
    }
    if (status !== 'carregando') {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [status]);

  const aoPerderASessao = status === 'anonimo' && houveSessao;
  useEffect(() => {
    if (aoPerderASessao) {
      router.navigate('/entrar');
    }
  }, [aoPerderASessao, router]);

  if (status === 'carregando') {
    return null;
  }
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: opcoesDoCabecalho.contentStyle,
      }}
    >
      <Stack.Protected guard={status === 'anonimo'}>
        <Stack.Screen name="(publico)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'autenticado'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

/** Raiz do app: dependências reais (keychain, `QueryClient` e rede). */
export default function LayoutRaiz() {
  const [dependencias] = useState(() => ({
    armazenamento: criarArmazenamentoSeguro(),
    queryClient: criarQueryClient(),
  }));

  // `onlineManager` (expo-network) e `focusManager` (AppState), uma vez.
  useEffect(() => ligarGerenciadores(), []);

  return (
    <Provedores
      armazenamento={dependencias.armazenamento}
      queryClient={dependencias.queryClient}
    >
      <NavegacaoRaiz />
    </Provedores>
  );
}
