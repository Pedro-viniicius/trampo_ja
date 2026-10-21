import { screen } from 'expo-router/testing-library';
import { processColor } from 'react-native';
import { cores } from '../../tema/tokens';
import { textos } from '../../textos/pt-BR';
import {
  abrirApp,
  fakeComCategorias,
  PERFIL_COMPLETO,
  vigiarConsole,
} from './apoio-qa';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 99,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

vigiarConsole();

const { readdirSync, readFileSync, statSync } = require('node:fs') as {
  readdirSync: (pasta: string) => string[];
  readFileSync: (arquivo: string, codificacao: 'utf8') => string;
  statSync: (caminho: string) => { isDirectory: () => boolean };
};

const PROPRIEDADES_DE_COR = [
  'color',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'tintColor',
] as const;

/** Cores do tema e as transparências do mesmo tema (scrim do diálogo e da folha). */
const PALETA = new Set<string | number>([
  ...Object.values(cores).flat(),
  // O LinearGradient entrega as cores já processadas (número ARGB).
  ...Object.values(cores)
    .flat()
    .map((cor) => processColor(cor) as number),
  'transparent',
  'rgba(27, 31, 39, 0.5)',
]);

/** Cor padrão da borda de topo da barra de abas; o app a sobrepõe com `borderTopColor`. */
const BORDA_PADRAO_DAS_ABAS = 'rgb(216, 216, 216)';

interface No {
  readonly type?: string;
  readonly props?: Record<string, unknown>;
  readonly children?: readonly (No | string)[] | null;
}

function achatar(estilo: unknown): Record<string, unknown> {
  if (Array.isArray(estilo)) {
    return Object.assign({}, ...estilo.map(achatar));
  }
  return typeof estilo === 'object' && estilo !== null
    ? (estilo as Record<string, unknown>)
    : {};
}

/**
 * Toda cor de estilo (e `colors` de gradiente) da árvore renderizada.
 * `navegacao`: só os contêineres da biblioteca de navegação (`RNS*`); sem ele,
 * só o conteúdo das telas.
 */
function coresDaArvore(
  arvore: unknown,
  { navegacao = false }: { navegacao?: boolean } = {},
): Array<string | number> {
  const achadas: Array<string | number> = [];
  // O contêiner de cada cena das abas é um `View` filho direto de `RNSScreen`.
  const visitar = (no: unknown, paiEhNavegacao = false) => {
    if (Array.isArray(no)) {
      for (const filho of no) visitar(filho, paiEhNavegacao);
      return;
    }
    if (typeof no !== 'object' || no === null) return;
    const { type, props, children } = no as No;
    const ehNavegacao =
      paiEhNavegacao || (typeof type === 'string' && type.startsWith('RNS'));
    const estilo = achatar(props?.style);
    for (const nome of PROPRIEDADES_DE_COR) {
      const valor = estilo[nome];
      if (
        ehNavegacao === navegacao &&
        (typeof valor === 'string' || typeof valor === 'number') &&
        valor !== BORDA_PADRAO_DAS_ABAS
      ) {
        achadas.push(valor);
      }
    }
    if (!navegacao && Array.isArray(props?.colors)) {
      achadas.push(...(props.colors as string[]));
    }
    const souNavegacao = typeof type === 'string' && type.startsWith('RNS');
    for (const filho of children ?? []) visitar(filho, souNavegacao);
  };
  visitar(arvore);
  return achadas;
}

const TRAMPO = {
  id: 't1',
  autorId: 'c1',
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos.',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 150000,
  prazo: null,
  status: 'aberto',
  criadoEm: '2026-10-01T12:00:00.000Z',
};
const SERVICO = {
  id: 's1',
  autorId: 'c1',
  titulo: 'Aulas de matemática',
  descricao: 'Reforço.',
  categoria: 'aulas',
  cidade: null,
  precoBaseCentavos: 8000,
  status: 'ativo',
  criadoEm: '2026-10-01T12:00:00.000Z',
};
const AUTOR = {
  contaId: 'c1',
  nome: 'Carla Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
};

function fakeDasTelas() {
  return fakeComCategorias()
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /perfis/c1', { corpo: AUTOR })
    .responder('GET /trampos/t1', { corpo: TRAMPO })
    .responder('GET /servicos/s1', { corpo: SERVICO })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } });
}

const TELAS = [
  ['Entrada', '/entrada', null, textos.entrada.frase],
  ['Cadastro', '/cadastro', null, textos.cadastro.titulo],
  ['Entrar', '/entrar', null, textos.entrar.titulo],
  ['Início', '/', 'token', 'Olá, Maria Souza'],
  ['Buscar', '/buscar', 'token', textos.buscar.titulo],
  ['Detalhe do trampo', '/trampos/t1', 'token', 'Pintar a sala'],
  ['Detalhe do serviço', '/servicos/s1', 'token', 'Aulas de matemática'],
  ['Perfil', '/perfil', 'token', 'Maria Souza'],
  ['Perfil de outra pessoa', '/perfis/c1', 'token', 'Carla Souza'],
  ['Editar perfil', '/perfil/editar', 'token', textos.editarPerfil.titulo],
] as const;

describe('CA16: as telas usam só as cores da marca (tokens)', () => {
  it.each(TELAS)(
    '%s (%s) só usa cores dos tokens',
    async (_nome, url, sessao, marcador) => {
      await abrirApp(url, {
        fetch: fakeDasTelas(),
        token: sessao === null ? null : 'token-de-teste',
      });

      const achados = await screen.findAllByText(marcador);
      expect(achados.length).toBeGreaterThan(0);

      const foraDaPaleta = coresDaArvore(screen.toJSON()).filter(
        (cor) => !PALETA.has(cor),
      );
      expect(foraDaPaleta).toEqual([]);
    },
  );

  it('a Entrada mostra o gradiente azul → roxo da marca e a logo', async () => {
    await abrirApp('/entrada', { fetch: fakeDasTelas(), token: null });
    await screen.findByText(textos.entrada.frase);

    const usadas = coresDaArvore(screen.toJSON());
    expect(usadas).toEqual(
      expect.arrayContaining([
        processColor(cores.marcaAzul),
        processColor(cores.marcaRoxo),
      ]),
    );
    expect(screen.getByLabelText(textos.entrada.logo)).toBeOnTheScreen();
  });

  it.each([
    ['Entrada', '/entrada', textos.entrada.criarConta],
    ['Cadastro', '/cadastro', textos.cadastro.criarConta],
    ['Entrar', '/entrar', textos.entrar.entrar],
  ])(
    'o botão principal de %s usa a cor primária da marca',
    async (_n, url, rotulo) => {
      await abrirApp(url, { fetch: fakeDasTelas(), token: null });
      await screen.findByRole('button', { name: rotulo });

      expect(coresDaArvore(screen.toJSON())).toContain(cores.primaria);
    },
  );

  it.each(TELAS)(
    '%s tem um título (papel "header") para leitor de tela',
    async (_nome, url, sessao, marcador) => {
      await abrirApp(url, {
        fetch: fakeDasTelas(),
        token: sessao === null ? null : 'token-de-teste',
      });
      await screen.findAllByText(marcador);

      expect(screen.getAllByRole('header').length).toBeGreaterThan(0);
    },
  );
});

describe('CA16: contêineres da navegação', () => {
  it.each([
    ['Stack público', '/entrada', null],
    ['Stack e abas da área autenticada', '/', 'token-de-teste'],
  ])(
    '%s: o fundo por trás das telas é o token `fundo`, não o cinza padrão da biblioteca',
    async (_nome, url, token) => {
      await abrirApp(url, { fetch: fakeDasTelas(), token });
      await screen.findAllByRole('header');

      const foraDaPaleta = coresDaArvore(screen.toJSON(), {
        navegacao: true,
      }).filter((cor) => !PALETA.has(cor));
      expect(foraDaPaleta).toEqual([]);
    },
  );
});

describe('CA16 / D15: nenhuma cor escrita fora dos tokens no código das telas', () => {
  function arquivos(pasta: string): string[] {
    return readdirSync(pasta).flatMap((nome: string) => {
      const caminho = `${pasta}/${nome}`;
      if (statSync(caminho).isDirectory()) return arquivos(caminho);
      return /\.tsx?$/.test(nome) && !/\.test\./.test(nome) ? [caminho] : [];
    });
  }

  it('telas, componentes e rotas não têm cor hexadecimal literal', () => {
    // `src/` a partir deste arquivo (`src/testes/qa/marca-qa.test.tsx`).
    const raiz = (expect.getState().testPath ?? '').replace(
      /\/testes\/qa\/[^/]+$/,
      '',
    );
    expect(raiz).toMatch(/\/src$/);
    const comHex = ['telas', 'componentes', 'app'].flatMap((pasta) =>
      arquivos(`${raiz}/${pasta}`).filter((arquivo) =>
        /['"`]#[0-9a-fA-F]{3,8}['"`]/.test(readFileSync(arquivo, 'utf8')),
      ),
    );

    expect(comHex).toEqual([]);
  });
});
