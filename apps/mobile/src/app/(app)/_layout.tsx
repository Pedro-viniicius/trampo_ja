import { Stack } from 'expo-router';
import { opcoesDoCabecalho } from '../../componentes/navegacao';

/**
 * Área autenticada: as telas desenham o próprio cabeçalho. O fundo por trás
 * delas é o token `fundo`, não o cinza padrão da biblioteca (CA16).
 */
export default function LayoutDaAreaAutenticada() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: opcoesDoCabecalho.contentStyle,
      }}
    />
  );
}
