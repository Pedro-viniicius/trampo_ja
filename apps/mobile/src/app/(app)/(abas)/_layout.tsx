import { Tabs } from 'expo-router';
import {
  opcoesDaAba,
  opcoesDaBarraDeAbas,
  opcoesDoCabecalho,
} from '../../../componentes/navegacao';
import { textos } from '../../../textos/pt-BR';

/** Fundo de cada aba: o token `fundo`, não o cinza padrão da biblioteca (CA16). */
const opcoesDasAbas = {
  ...opcoesDaBarraDeAbas,
  sceneStyle: opcoesDoCabecalho.contentStyle,
};

/** Abas da 2a: Início, Buscar e Perfil. */
export default function LayoutDasAbas() {
  return (
    <Tabs screenOptions={opcoesDasAbas}>
      <Tabs.Screen
        name="index"
        options={opcoesDaAba('inicio', textos.abas.inicio)}
      />
      <Tabs.Screen
        name="buscar"
        options={opcoesDaAba('buscar', textos.abas.buscar)}
      />
      <Tabs.Screen
        name="perfil"
        options={opcoesDaAba('perfil', textos.abas.perfil)}
      />
    </Tabs>
  );
}
