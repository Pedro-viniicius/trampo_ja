import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import LayoutDasAbas from '../../app/(app)/(abas)/_layout';
import BuscarRota from '../../app/(app)/(abas)/buscar';
import RotaDasConversas from '../../app/(app)/(abas)/conversas';
import RotaDasDemandas from '../../app/(app)/(abas)/demandas';
import InicioRota from '../../app/(app)/(abas)/index';
import RotaDeMeusTrampos from '../../app/(app)/(abas)/meus-trampos';
import RotaDoMeuPerfil from '../../app/(app)/(abas)/perfil';
import RotaDeBuscarTrampos from '../../app/(app)/buscar-trampos';
import RotaDaCandidaturaEnviada from '../../app/(app)/candidatura-enviada';
import RotaDeCandidaturaDoTrampo from '../../app/(app)/candidaturas/[trampoId]';
import RotaDeMinhasCandidaturas from '../../app/(app)/candidaturas/index';
import RotaDaConversa from '../../app/(app)/conversas/[id]';
import RotaDeMeusAnuncios from '../../app/(app)/meus-anuncios';
import RotaDeContaEPrivacidade from '../../app/(app)/perfil/conta';
import RotaDeEditarPerfil from '../../app/(app)/perfil/editar';
import RotaDeExcluirConta from '../../app/(app)/perfil/excluir';
import RotaDeExportarDados from '../../app/(app)/perfil/exportar';
import RotaDoPerfilPublico from '../../app/(app)/perfis/[contaId]';
import RotaDePublicar from '../../app/(app)/publicar';
import RotaDoServico from '../../app/(app)/servicos/[id]';
import RotaDeEditarServico from '../../app/(app)/servicos/editar/[id]';
import RotaDeNovoServico from '../../app/(app)/servicos/novo';
import RotaDoTrampo from '../../app/(app)/trampos/[id]';
import RotaDeEditarTrampo from '../../app/(app)/trampos/editar/[id]';
import RotaDeNovoTrampo from '../../app/(app)/trampos/novo';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import type { Modo } from '../../estado/modo';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import {
  type MapaDeRotas,
  type RotasRenderizadas,
  renderizarRotas,
  TOKEN_DE_TESTE,
} from '../rotas/apoio';

/** Todas as rotas reais da área autenticada (nenhum stub), mais as públicas do apoio. */
export const ROTAS_REAIS: MapaDeRotas = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/(abas)/_layout': LayoutDasAbas,
  '(app)/(abas)/index': InicioRota,
  '(app)/(abas)/buscar': BuscarRota,
  '(app)/(abas)/perfil': RotaDoMeuPerfil,
  '(app)/(abas)/meus-trampos': RotaDeMeusTrampos,
  '(app)/(abas)/demandas': RotaDasDemandas,
  '(app)/(abas)/conversas': RotaDasConversas,
  '(app)/publicar': RotaDePublicar,
  '(app)/buscar-trampos': RotaDeBuscarTrampos,
  '(app)/candidatura-enviada': RotaDaCandidaturaEnviada,
  '(app)/candidaturas/index': RotaDeMinhasCandidaturas,
  '(app)/candidaturas/[trampoId]': RotaDeCandidaturaDoTrampo,
  '(app)/conversas/[id]': RotaDaConversa,
  '(app)/servicos/novo': RotaDeNovoServico,
  '(app)/trampos/novo': RotaDeNovoTrampo,
  '(app)/meus-anuncios': RotaDeMeusAnuncios,
  '(app)/perfil/editar': RotaDeEditarPerfil,
  '(app)/perfil/conta': RotaDeContaEPrivacidade,
  '(app)/perfil/excluir': RotaDeExcluirConta,
  '(app)/perfil/exportar': RotaDeExportarDados,
  '(app)/perfis/[contaId]': RotaDoPerfilPublico,
  '(app)/servicos/[id]': RotaDoServico,
  '(app)/trampos/[id]': RotaDoTrampo,
  '(app)/trampos/editar/[id]': RotaDeEditarTrampo,
  '(app)/servicos/editar/[id]': RotaDeEditarServico,
};

export const CATEGORIAS = [
  { id: 'reformas', rotulo: 'Reformas e reparos' },
  { id: 'aulas', rotulo: 'Aulas e reforço' },
];

export const PERFIL_COMPLETO = {
  nome: 'Maria Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura', 'pedreiro'],
  completo: true,
};

/** Fake que já responde `GET /categorias`. */
export function fakeComCategorias(): FetchFalso {
  return criarFetchFalso().responder('GET /categorias', {
    corpo: CATEGORIAS,
  });
}

/**
 * App completo (raiz real + rotas reais) com o fake de `fetch`. Com `token`
 * `null` a sessão começa anônima. `modo` é o modo gravado no aparelho
 * (padrão: nada gravado, abre em freela).
 */
export async function abrirApp(
  url: string,
  {
    fetch = fakeComCategorias(),
    token = TOKEN_DE_TESTE,
    modo = null,
  }: { fetch?: FetchFalso; token?: string | null; modo?: Modo | null } = {},
): Promise<RotasRenderizadas> {
  return renderizarRotas(ROTAS_REAIS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(token ?? undefined),
    modo,
  });
}

/**
 * CA80: depois do 201 do `POST /trampos/:id/candidaturas`, o app abre a tela
 * Candidatura enviada no lugar do toast.
 */
export async function esperarCandidaturaEnviada(): Promise<void> {
  await waitFor(() => expect(screen).toHavePathname('/candidatura-enviada'));
  expect(
    await screen.findByText(textos.candidaturaEnviada.titulo),
  ).toBeOnTheScreen();
  // O toast antigo (texto que saiu de `pt-BR.ts`) não aparece mais.
  expect(
    screen.queryByText(
      'Candidatura enviada! Você pode acompanhar em Minhas candidaturas.',
    ),
  ).toBeNull();
}

/** "Voltar" na Candidatura enviada leva de volta ao detalhe do trampo. */
export async function voltarDaCandidaturaEnviada(
  detalhe: string,
): Promise<void> {
  await fireEvent.press(
    screen.getByRole('button', { name: textos.gerais.voltar }),
  );
  await waitFor(() => expect(screen).toHavePathname(detalhe));
}

interface NoDeTexto {
  readonly children?: readonly (NoDeTexto | string)[] | null;
}

/** Todos os textos visíveis da árvore renderizada, para varrer a tela inteira. */
export function textosDaArvore(arvore: unknown): string[] {
  const textos: string[] = [];
  const visitar = (no: unknown) => {
    if (typeof no === 'string') {
      textos.push(no);
      return;
    }
    if (Array.isArray(no)) {
      for (const filho of no) visitar(filho);
      return;
    }
    if (typeof no === 'object' && no !== null) {
      for (const filho of (no as NoDeTexto).children ?? []) visitar(filho);
    }
  };
  visitar(arvore);
  return textos;
}

const METODOS_DO_CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;

/**
 * Espiona `console` em cada teste do arquivo e, no fim, exige que nada tenha
 * sido escrito (nem aviso do React nem dado pessoal): o app não usa `console`
 * (CA15) e um aviso do React num fluxo comum indica bug.
 */
export function vigiarConsole(): void {
  let chamadas: string[] = [];
  beforeEach(() => {
    chamadas = [];
    for (const metodo of METODOS_DO_CONSOLE) {
      jest.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
        chamadas.push(`${metodo}: ${args.map(String).join(' ')}`.slice(0, 300));
      });
    }
  });
  afterEach(() => {
    const escrito = chamadas;
    jest.restoreAllMocks();
    expect(escrito).toEqual([]);
  });
}

/**
 * Textos visíveis mais todo valor de propriedade que seja texto (`value`,
 * `accessibilityLabel`, `testID`...), para provar que um segredo não aparece
 * em nenhum ponto da árvore, nem escondido num atributo.
 */
export function textosEPropriedades(arvore: unknown): string[] {
  const achados: string[] = [];
  const visitar = (no: unknown) => {
    if (typeof no === 'string') {
      achados.push(no);
      return;
    }
    if (Array.isArray(no)) {
      for (const filho of no) visitar(filho);
      return;
    }
    if (typeof no !== 'object' || no === null) return;
    const { props, children } = no as {
      props?: Record<string, unknown>;
      children?: unknown;
    };
    for (const valor of Object.values(props ?? {})) {
      if (typeof valor === 'string') achados.push(valor);
    }
    visitar(children ?? []);
  };
  visitar(arvore);
  return achados;
}
