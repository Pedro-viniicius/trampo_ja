import { Stack } from 'expo-router';
import { opcoesDoCabecalho } from '../../componentes/navegacao';

/** A Entrada fica na base da pilha: "Voltar" de Entrar e Cadastro leva a ela. */
export const unstable_settings = { anchor: 'entrada' };

/**
 * Grupo público (sem sessão). As telas desenham o próprio cabeçalho; o fundo
 * por trás delas é o token `fundo` (CA16).
 */
export default function LayoutPublico() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: opcoesDoCabecalho.contentStyle,
      }}
    />
  );
}
