// Etapa 17 da L4 (CA56): existe uma só faixa "sem conexão", desenhada na raiz
// (`NavegacaoRaiz`), com e sem sessão. Nenhuma tela desenha a sua. Ela some
// quando a rede volta e não se repete ao trocar de tela. Rotas reais (nenhum
// stub das telas que antes desenhavam a faixa) com o fake de `fetch`.
import { onlineManager } from '@tanstack/react-query';
import { router, Slot } from 'expo-router';
import { act, screen } from 'expo-router/testing-library';
import { AccessibilityInfo, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { NavegacaoRaiz } from '../../app/_layout';
import { useMargensSeguras } from '../../componentes/utilitarios';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { criarArmazenamentoDoModoEmMemoria } from '../../estado/modo';
import { Provedores } from '../../estado/provedores';
import { espaco } from '../../tema/tokens';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso } from '../fetch-falso';
import { ROTAS_REAIS, vigiarConsole } from '../qa/apoio-qa';
import { renderRouter } from '../render-router';
import { criarQueryClientDeTeste, URL_BASE_DE_TESTE } from '../renderizar';
import {
  type MapaDeRotas,
  ROTAS_PUBLICAS,
  renderizarRotas,
  TOKEN_DE_TESTE,
} from './apoio';

declare const __dirname: string;

// A barra de status vira um marcador com o estilo pedido (o nativo não roda).
jest.mock('expo-status-bar', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ...jest.requireActual('expo-status-bar'),
    StatusBar: ({ style }: { style?: string }) =>
      React.createElement(Text, { testID: 'barra-de-status' }, style),
  };
});

vigiarConsole();

const FAIXA = textos.gerais.semConexaoFaixa;
const DE_VOLTA = textos.gerais.conexaoDeVolta;

const faixas = () => screen.queryAllByText(FAIXA);

/** A `View` da faixa (papel `alert`, sem `accessible`: o `getByRole` não a acha). */
function aFaixa() {
  let no = screen.getByText(FAIXA).parent;
  while (no && no.props.accessibilityRole !== 'alert') no = no.parent;
  if (!no) throw new Error('A faixa não tem o papel alert');
  return no;
}

async function ficarOffline() {
  await act(async () => onlineManager.setOnline(false));
}
async function ficarOnline() {
  await act(async () => onlineManager.setOnline(true));
}
async function navegar(rota: string) {
  await act(async () => router.push(rota as never));
}

let anuncios: jest.SpyInstance;

beforeEach(() => {
  anuncios = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
});

afterEach(async () => {
  await ficarOnline();
  anuncios.mockRestore();
});

function abrirComSessao(url: string) {
  return renderizarRotas(ROTAS_REAIS, {
    initialUrl: url,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
    fetch: criarFetchFalso().responder('GET /categorias', {
      corpo: [{ id: 'reformas', rotulo: 'Reformas e reparos' }],
    }),
  });
}

describe('faixa na raiz: uma só, com e sem sessão (CA56)', () => {
  it('com sessão: uma faixa em cada tela, de qualquer base (Buscar, Formulário, Rolável)', async () => {
    // `/buscar` é a aba Buscar do contratante, que busca serviços (CA84).
    await abrirComSessao('/buscar');
    await screen.findByLabelText(textos.buscarFreelancers.campo);
    expect(faixas()).toHaveLength(0);

    await ficarOffline();
    expect(await screen.findByText(FAIXA)).toBeOnTheScreen();
    expect(faixas()).toHaveLength(1);

    // `Formulario` (base.tsx) e `Rolavel` (base.tsx): a faixa continua uma só.
    await navegar('/perfil/editar');
    expect(faixas()).toHaveLength(1);
    await navegar('/meus-anuncios');
    expect(faixas()).toHaveLength(1);
    await navegar('/perfil/conta');
    expect(faixas()).toHaveLength(1);
  });

  it('sem sessão: uma faixa em Entrar e no Cadastro', async () => {
    await renderizarRotas(ROTAS_REAIS, { initialUrl: '/entrar' });
    await screen.findByLabelText(textos.entrar.senha);
    expect(faixas()).toHaveLength(0);

    await ficarOffline();
    expect(await screen.findByText(FAIXA)).toBeOnTheScreen();
    expect(faixas()).toHaveLength(1);

    await navegar('/cadastro');
    expect(await screen.findByLabelText(textos.cadastro.senha)).toBeTruthy();
    expect(faixas()).toHaveLength(1);
  });

  it('a pessoa que já abre o app sem rede vê a faixa depois da sessão carregar', async () => {
    onlineManager.setOnline(false);
    await renderizarRotas(ROTAS_REAIS, { initialUrl: '/entrar' });
    expect(await screen.findByText(FAIXA)).toBeOnTheScreen();
    expect(faixas()).toHaveLength(1);
  });
});

describe('faixa na raiz: some e não se repete (CA56)', () => {
  it('some quando a rede volta, em qualquer tela', async () => {
    await abrirComSessao('/buscar');
    await screen.findByLabelText(textos.buscarFreelancers.campo);
    await ficarOffline();
    await navegar('/perfil/editar');
    expect(faixas()).toHaveLength(1);

    await ficarOnline();
    expect(faixas()).toHaveLength(0);

    // Cai de novo: aparece uma vez, de novo.
    await ficarOffline();
    expect(faixas()).toHaveLength(1);
  });

  it('anuncia uma vez ao cair e uma vez ao voltar, não a cada tela', async () => {
    await abrirComSessao('/buscar');
    await screen.findByLabelText(textos.buscarFreelancers.campo);
    expect(anuncios).not.toHaveBeenCalled();

    await ficarOffline();
    expect(anuncios).toHaveBeenCalledTimes(1);
    expect(anuncios).toHaveBeenLastCalledWith(FAIXA);

    await navegar('/perfil/editar');
    await navegar('/meus-anuncios');
    await navegar('/perfil/conta');
    expect(anuncios).toHaveBeenCalledTimes(1);

    await ficarOnline();
    expect(anuncios).toHaveBeenCalledTimes(2);
    expect(anuncios).toHaveBeenLastCalledWith(DE_VOLTA);

    await navegar('/buscar');
    expect(anuncios).toHaveBeenCalledTimes(2);
  });

  it('com rede o tempo todo, nada é anunciado nem desenhado', async () => {
    await abrirComSessao('/buscar');
    await screen.findByLabelText(textos.buscarFreelancers.campo);
    await navegar('/perfil/editar');
    await navegar('/meus-anuncios');
    expect(faixas()).toHaveLength(0);
    expect(anuncios).not.toHaveBeenCalled();
  });
});

describe('faixa na raiz: margem de topo das telas', () => {
  const MARGEM = 40;

  function Sonda() {
    return <Text testID="topo">{String(useMargensSeguras().top)}</Text>;
  }

  async function abrirComMargem() {
    const armazenamento = criarArmazenamentoEmMemoria(TOKEN_DE_TESTE);
    const armazenamentoDoModo = criarArmazenamentoDoModoEmMemoria();
    const fetch = criarFetchFalso();
    const queryClient = criarQueryClientDeTeste();
    function Raiz() {
      return (
        <SafeAreaInsetsContext.Provider
          value={{ top: MARGEM, bottom: 0, left: 0, right: 0 }}
        >
          <Provedores
            armazenamento={armazenamento}
            armazenamentoDoModo={armazenamentoDoModo}
            queryClient={queryClient}
            fetch={fetch.fetch}
            urlBase={URL_BASE_DE_TESTE}
          >
            <NavegacaoRaiz />
          </Provedores>
        </SafeAreaInsetsContext.Provider>
      );
    }
    const rotas: MapaDeRotas = {
      _layout: Raiz,
      ...ROTAS_PUBLICAS,
      '(app)/_layout': () => <Slot />,
      '(app)/index': Sonda,
    };
    await renderRouter(rotas, { initialUrl: '/' });
  }

  it('a faixa ocupa a margem de cima e as telas recebem top 0 enquanto ela aparece', async () => {
    await abrirComMargem();
    expect(await screen.findByTestId('topo')).toHaveTextContent(String(MARGEM));

    await ficarOffline();
    expect(await screen.findByText(FAIXA)).toBeOnTheScreen();
    expect(screen.getByTestId('topo')).toHaveTextContent('0');
    expect(aFaixa()).toHaveStyle({
      paddingTop: MARGEM + espaco[2],
    });

    await ficarOnline();
    expect(screen.getByTestId('topo')).toHaveTextContent(String(MARGEM));
    expect(faixas()).toHaveLength(0);
  });

  it('a barra de status fica com ícones claros só enquanto a faixa escura aparece', async () => {
    await abrirComMargem();
    expect(await screen.findByTestId('barra-de-status')).toHaveTextContent(
      'auto',
    );

    await ficarOffline();
    expect(screen.getByTestId('barra-de-status')).toHaveTextContent('light');

    await ficarOnline();
    expect(screen.getByTestId('barra-de-status')).toHaveTextContent('auto');
  });
});

describe('faixa na raiz: nenhuma tela a desenha (CA56)', () => {
  const fs = require('node:fs') as {
    readdirSync(
      caminho: string,
      opcoes: { withFileTypes: true },
    ): { name: string; isDirectory(): boolean }[];
    readFileSync(caminho: string, codificacao: 'utf8'): string;
  };

  function arquivosDe(pasta: string): string[] {
    return fs
      .readdirSync(pasta, { withFileTypes: true })
      .flatMap((e) =>
        e.isDirectory()
          ? arquivosDe(`${pasta}/${e.name}`)
          : [`${pasta}/${e.name}`],
      )
      .filter((c) => /\.tsx?$/.test(c) && !/\.test\.tsx?$/.test(c));
  }

  it('só o NavegacaoRaiz usa o componente, nas rotas, telas e contêineres', () => {
    const src = `${__dirname}/../..`;
    const usos = [
      ...arquivosDe(`${src}/app`),
      ...arquivosDe(`${src}/telas`),
    ].filter((c) => fs.readFileSync(c, 'utf8').includes('FaixaSemConexao'));
    expect(usos.map((c) => c.slice(src.length + 1))).toEqual([
      'app/_layout.tsx',
    ]);
  });

  it('telas com semConexao desabilitam ações e mostram o motivo, sem faixa própria', async () => {
    await abrirComSessao('/perfil/conta');
    await screen.findByText(textos.contaEPrivacidade.titulo);
    await ficarOffline();
    expect(await screen.findByText(FAIXA)).toBeOnTheScreen();
    // Uma faixa (a da raiz) e o motivo da própria tela, que são coisas distintas.
    expect(faixas()).toHaveLength(1);
    expect(
      screen.getAllByText(textos.contaEPrivacidade.semConexaoMotivo),
    ).not.toHaveLength(0);
  });
});
