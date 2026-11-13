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
      screenOptions={({ route }) => ({
        headerShown: false,
        contentStyle: opcoesDoCabecalho.contentStyle,
        ...(route.name === 'candidatura-enviada' && {
          presentation: 'fullScreenModal',
        }),
      })}
    />
  );
}
