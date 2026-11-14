import { Tabs, usePathname } from 'expo-router';
import { useEffect } from 'react';
import {
  opcoesDaAba,
  opcoesDaBarraDeAbasCom,
  opcoesDoCabecalho,
} from '../../../componentes/navegacao';
import { useMargensSeguras } from '../../../componentes/utilitarios';
import { type Modo, useModo } from '../../../estado/modo';
import { textos } from '../../../textos/pt-BR';

/**
 * Abas exclusivas de um modo, pelo caminho (ADR-010). Abrir uma delas no
 * outro modo (link, notificação, URL digitada) troca o modo: o link vence
 * (CA77). Início, Conversas e Perfil existem nos dois modos e nunca trocam.
 */
const MODO_DA_ABA: Readonly<Record<string, Modo>> = {
  '/meus-trampos': 'freela',
  '/demandas': 'contratante',
  '/buscar': 'contratante',
};

/** Esconde a aba da barra sem tirar a rota (`href: null`, do expo-router). */
const ESCONDIDA = { href: null } as const;

/**
 * Abas por modo (CA76), numa `Tabs` só (ADR-010):
 * - freela: Início, Meus trampos, Conversas e Perfil;
 * - contratante: Início, Demandas, Buscar, Mensagens e Perfil.
 * As seis rotas ficam sempre declaradas, e as do outro modo saem da barra
 * com `href: null`. Assim as URLs não mudam com o modo. "Mensagens" é a aba
 * `conversas` com o rótulo do contratante.
 */
export default function LayoutDasAbas() {
  const { modo, definirModo } = useModo();
  const margens = useMargensSeguras();
  const pathname = usePathname();
  const modoDaAba = MODO_DA_ABA[pathname];

  // O link vence: a aba exclusiva focada traz o seu modo. Rota de pilha
  // (detalhe, conversa) tem outro caminho e nunca troca o modo.
  useEffect(() => {
    if (modoDaAba !== undefined && modoDaAba !== modo) {
      void definirModo(modoDaAba);
    }
  }, [modoDaAba, modo, definirModo]);

  // A barra já sai no modo da aba focada, antes de o efeito gravar o modo:
  // no SDK 58, a `Tabs` troca a aba focada escondida (`href: null`) pela
  // inicial, e a aba que o link abriu se perderia.
  const contratante = (modoDaAba ?? modo) === 'contratante';
  const soDoFreela = contratante ? ESCONDIDA : undefined;
  const soDoContratante = contratante ? undefined : ESCONDIDA;

  return (
    <Tabs
      screenOptions={{
        ...opcoesDaBarraDeAbasCom(margens),
        // Fundo de cada aba: o token `fundo`, não o cinza padrão (CA16).
        sceneStyle: opcoesDoCabecalho.contentStyle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={opcoesDaAba('inicio', textos.abas.inicio)}
      />
      <Tabs.Screen
        name="meus-trampos"
        options={{
          ...opcoesDaAba('meus-trampos', textos.abas.meusTrampos),
          ...soDoFreela,
        }}
      />
      <Tabs.Screen
        name="demandas"
        options={{
          ...opcoesDaAba('demandas', textos.abas.demandas),
          ...soDoContratante,
        }}
      />
      <Tabs.Screen
        name="buscar"
        options={{
          ...opcoesDaAba('buscar', textos.abas.buscar),
          ...soDoContratante,
        }}
      />
      <Tabs.Screen
        name="conversas"
        options={
          contratante
            ? opcoesDaAba('mensagens', textos.abas.mensagens)
            : opcoesDaAba('conversas', textos.abas.conversas)
        }
      />
      <Tabs.Screen
        name="perfil"
        options={opcoesDaAba('perfil', textos.abas.perfil)}
      />
    </Tabs>
  );
}
