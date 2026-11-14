import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { FaixaSemConexao } from '../componentes/FaixaSemConexao';
import { opcoesDoCabecalho } from '../componentes/navegacao';
import { criarArmazenamentoSeguro } from '../estado/armazenamento-token';
import {
  criarQueryClient,
  ligarGerenciadores,
} from '../estado/cliente-de-consultas';
import { useConexao } from '../estado/conexao';
import { limparExportacoesAntigas } from '../estado/exportacao';
import { criarArmazenamentoDoModoSeguro } from '../estado/modo';
import { Provedores } from '../estado/provedores';
import { useSessao } from '../estado/sessao';
import { FONTES } from '../tema/fontes';

// A splash fica até a sessão saber se há token (ver `NavegacaoRaiz`). Chamada
// fora do componente, como pede o expo-splash-screen; falhar só a esconde antes.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Pilha raiz, por status da sessão: `(publico)` sem sessão e `(app)` com
 * sessão (`Stack.Protected`). Enquanto a sessão carrega, não desenha nada e a
 * splash continua. Acima da pilha fica a única faixa de "sem conexão" do app
 * (CA56), com e sem sessão. Exportada à parte para os testes de rota a montarem sobre
 * provedores com fakes.
 */
export function NavegacaoRaiz() {
  const { status } = useSessao();
  const router = useRouter();
  // Sem sessão, uma rota de `(app)` leva à Entrada (a âncora de `(publico)`);
  // se já houve sessão neste uso do app (401 ou sair), leva ao login, onde
  // aparece o aviso de sessão expirada (CA14). Quem leva é o `redirectTo` do
  // `Stack.Protected` (SDK 58): no 58, a tela protegida focada redireciona
  // sozinha e venceria um `navigate` feito aqui. O login entra por cima da
  // Entrada, e o "Voltar" do login leva a ela.
  const [houveSessao, setHouveSessao] = useState(false);
  // A faixa ocupa a margem segura de cima; enquanto aparece, as telas recebem
  // `top: 0` para o `Cabecalho` não somar a margem de novo.
  const { online } = useConexao();
  const semConexao = !online;
  const margens = useContext(SafeAreaInsetsContext);
  const margensDasTelas = useMemo(
    () => (semConexao && margens ? { ...margens, top: 0 } : margens),
    [semConexao, margens],
  );

  useEffect(() => {
    if (status === 'autenticado') {
      setHouveSessao(true);
    }
    if (status !== 'carregando') {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [status]);

  // Numa rota fora dos dois grupos (documentos legais), o `redirectTo` não
  // age: o login é navegado aqui. Dentro de `(app)`, quem leva é o
  // `redirectTo`; navegar também aqui disputaria com ele. Só na transição
  // para "sem sessão": o grupo é lido nesse momento (ref), e abrir um
  // documento depois, pela Entrada ou pelo Cadastro, não leva ao login.
  const grupo = useSegments()[0];
  const grupoRef = useRef(grupo);
  grupoRef.current = grupo;
  const aoPerderASessao = status === 'anonimo' && houveSessao;
  useEffect(() => {
    const atual = grupoRef.current;
    if (aoPerderASessao && atual !== '(app)' && atual !== '(publico)') {
      router.navigate('/entrar');
    }
  }, [aoPerderASessao, router]);

  if (status === 'carregando') {
    return null;
  }
  return (
    <View style={{ flex: 1 }}>
      {/* Sempre montada: o anúncio de "Conexão de volta." depende disso. */}
      <FaixaSemConexao visivel={semConexao} />
      {/* Ícones claros sobre a faixa escura; sem ela, o padrão do app. */}
      <StatusBar style={semConexao ? 'light' : 'auto'} />
      <View style={{ flex: 1 }}>
        <SafeAreaInsetsContext.Provider value={margensDasTelas}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: opcoesDoCabecalho.contentStyle,
            }}
          >
            <Stack.Protected guard={status === 'anonimo'}>
              <Stack.Screen name="(publico)" />
            </Stack.Protected>
            <Stack.Protected
              guard={status === 'autenticado'}
              redirectTo={houveSessao ? '/entrar' : '/entrada'}
            >
              <Stack.Screen name="(app)" />
            </Stack.Protected>
          </Stack>
        </SafeAreaInsetsContext.Provider>
      </View>
    </View>
  );
}

/** Raiz do app: dependências reais (keychain, `QueryClient` e rede). */
export default function LayoutRaiz() {
  const [dependencias] = useState(() => ({
    armazenamento: criarArmazenamentoSeguro(),
    armazenamentoDoModo: criarArmazenamentoDoModoSeguro(),
    queryClient: criarQueryClient(),
  }));

  // As fontes carregam em tempo de execução (ADR-009). Enquanto carregam, nada
  // é desenhado e a splash continua. Se falhar, o app abre com a fonte do
  // sistema: nunca fica em tela branca (CA72), e `hideAsync` roda na
  // `NavegacaoRaiz`, quando a sessão resolve.
  const [fontesCarregadas, erroDeFontes] = useFonts(FONTES);

  // `onlineManager` (expo-network) e `focusManager` (AppState), uma vez.
  useEffect(() => ligarGerenciadores(), []);
  // Exportação que sobrou no cache se o app morreu com a folha aberta (S4).
  useEffect(() => limparExportacoesAntigas(), []);

  if (!fontesCarregadas && !erroDeFontes) {
    return null;
  }

  return (
    <Provedores
      armazenamento={dependencias.armazenamento}
      armazenamentoDoModo={dependencias.armazenamentoDoModo}
      queryClient={dependencias.queryClient}
    >
      <NavegacaoRaiz />
    </Provedores>
  );
}
