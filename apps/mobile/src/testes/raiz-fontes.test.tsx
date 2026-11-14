// CA72: a splash fica até as fontes carregarem e, se a carga falhar, o app
// abre mesmo assim (nunca tela branca). `useFonts` é falso, nos três estados.
import { render, screen } from '@testing-library/react-native';
import { useFonts } from 'expo-font';
import LayoutRaiz from '../app/_layout';
import { FONTES } from '../tema/fontes';

jest.mock('expo-font', () => ({ useFonts: jest.fn() }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('expo-router', () => {
  const { Text: Marcador } = require('react-native');
  const Stack = () => <Marcador>app aberto</Marcador>;
  Stack.Protected = () => null;
  Stack.Screen = () => null;
  return {
    Stack,
    useRouter: () => ({ navigate: jest.fn() }),
    useSegments: () => [],
  };
});
jest.mock('../estado/armazenamento-token', () => ({
  criarArmazenamentoSeguro: () => ({}),
}));
jest.mock('../estado/cliente-de-consultas', () => ({
  criarQueryClient: () => ({}),
  ligarGerenciadores: () => () => undefined,
}));
jest.mock('../estado/exportacao', () => ({
  limparExportacoesAntigas: () => () => undefined,
}));
jest.mock('../estado/conexao', () => ({
  useConexao: () => ({ online: true }),
}));
jest.mock('../estado/sessao', () => ({
  useSessao: () => ({ status: 'anonimo' }),
}));
jest.mock('../estado/provedores', () => ({
  Provedores: ({ children }: { children: React.ReactNode }) => children,
}));

const useFontsFalso = useFonts as unknown as jest.Mock;

describe('LayoutRaiz e as fontes (CA72)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pede ao useFonts as fontes de FONTES', async () => {
    useFontsFalso.mockReturnValue([false, null]);

    await render(<LayoutRaiz />);

    expect(useFontsFalso).toHaveBeenCalledWith(FONTES);
  });

  it('carregando: não desenha nada (a splash continua)', async () => {
    useFontsFalso.mockReturnValue([false, null]);

    const { toJSON } = await render(<LayoutRaiz />);

    expect(toJSON()).toBeNull();
  });

  it('ok: abre o app', async () => {
    useFontsFalso.mockReturnValue([true, null]);

    await render(<LayoutRaiz />);

    expect(screen.getByText('app aberto')).toBeTruthy();
  });

  it('erro: abre o app mesmo assim, nunca em tela branca', async () => {
    useFontsFalso.mockReturnValue([false, new Error('falhou')]);

    await render(<LayoutRaiz />);

    expect(screen.getByText('app aberto')).toBeTruthy();
  });
});
