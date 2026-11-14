import { Stack } from 'expo-router';
import { opcoesDoCabecalho } from '../../componentes/navegacao';

/**
 * Área autenticada: as telas desenham o próprio cabeçalho. O fundo por trás
 * delas é o token `fundo`, não o cinza padrão da biblioteca (CA16).
 * Candidatura enviada cobre a tela inteira, sem a barra de abas (CA80). Vai
 * pelo nome da rota, não por um `Stack.Screen`: assim o layout não avisa no
 * console quando a rota não está no mapa de um teste.
 */
export default function LayoutDaAreaAutenticada() {
  return (
    <Stack
      screenOptions={({ route, navigation }) => ({
        headerShown: false,
        contentStyle: opcoesDoCabecalho.contentStyle,
        // Só por cima de outra tela: a primeira da pilha (link direto) já sai
        // como cartão, e o SDK 58 avisa no console se ela pedir modal.
        ...(route.name === 'candidatura-enviada' &&
          navigation.getState().routes[0]?.key !== route.key && {
            presentation: 'fullScreenModal',
          }),
      })}
    />
  );
}
