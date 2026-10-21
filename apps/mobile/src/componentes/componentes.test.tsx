import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';
import { textos } from '../textos/pt-BR';
import {
  Avatar,
  Aviso,
  Botao,
  Cabecalho,
  CabecalhoGradiente,
  CampoDeTexto,
  CartaoDeAnuncio,
  Chip,
  DialogoDeConfirmacao,
  Esqueleto,
  EstadoVazio,
  FaixaSemConexao,
  FolhaInferior,
  Logo,
  opcoesDaAba,
  opcoesDaBarraDeAbas,
  opcoesDoCabecalho,
  Seletor,
  Selo,
  Toast,
} from './index';

// O mock de @expo/vector-icons está em src/testes/setup-jest.tsx (setupFiles do Jest).

describe('Botao', () => {
  it('chama onPress e tem papel de botão', async () => {
    const onPress = jest.fn();
    await render(<Botao texto="Salvar alterações" onPress={onPress} />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Salvar alterações' }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('carregando: troca o texto, fica desabilitado e não dispara onPress', async () => {
    const onPress = jest.fn();
    await render(
      <Botao
        texto="Entrar"
        textoCarregando="Entrando…"
        carregando
        onPress={onPress}
      />,
    );
    const botao = screen.getByRole('button', { name: 'Entrando…' });
    expect(botao.props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
    await fireEvent.press(botao);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('desabilitado não dispara onPress', async () => {
    const onPress = jest.fn();
    await render(
      <Botao
        texto="Enviar"
        desabilitado
        onPress={onPress}
        variante="destrutivo"
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('CampoDeTexto', () => {
  it('novaSenha e sobrescritas de autoComplete', async () => {
    await render(
      <>
        <CampoDeTexto
          rotulo="Senha"
          tipo="novaSenha"
          secureTextEntry
          valor=""
          onChangeText={() => undefined}
        />
        <CampoDeTexto
          rotulo="Nome"
          valor=""
          autoComplete="name"
          textContentType="name"
          onChangeText={() => undefined}
        />
      </>,
    );
    expect(screen.getByLabelText('Senha').props.autoComplete).toBe(
      'new-password',
    );
    expect(screen.getByLabelText('Senha').props.textContentType).toBe(
      'newPassword',
    );
    expect(screen.getByLabelText('Nome').props.autoComplete).toBe('name');
  });

  it('mostra rótulo, ajuda, contador e envia o texto digitado', async () => {
    const onChangeText = jest.fn();
    await render(
      <CampoDeTexto
        rotulo="Nome"
        valor=""
        onChangeText={onChangeText}
        ajuda="Como aparece no perfil"
        contador="0 de 80 caracteres"
      />,
    );
    expect(screen.getByText('Nome')).toBeTruthy();
    expect(screen.getByText('Como aparece no perfil')).toBeTruthy();
    expect(screen.getByText('0 de 80 caracteres')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Ana');
    expect(onChangeText).toHaveBeenCalledWith('Ana');
  });

  it('erro aparece em texto e substitui a ajuda', async () => {
    await render(
      <CampoDeTexto
        rotulo="E-mail"
        valor="x"
        onChangeText={() => undefined}
        ajuda="Ajuda"
        erro="Informe um e-mail válido, como nome@exemplo.com."
        tipo="email"
      />,
    );
    expect(
      screen.getByText('Informe um e-mail válido, como nome@exemplo.com.'),
    ).toBeTruthy();
    expect(screen.queryByText('Ajuda')).toBeNull();
    expect(screen.getByLabelText('E-mail').props.keyboardType).toBe(
      'email-address',
    );
  });

  it('mostrar/ocultar senha alterna secureTextEntry', async () => {
    await render(
      <CampoDeTexto
        rotulo="Senha"
        valor="segredo123"
        onChangeText={() => undefined}
        tipo="senha"
        secureTextEntry
      />,
    );
    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(true);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.mostrarSenha }),
    );
    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(false);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.entrar.ocultarSenha }),
    );
    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(true);
  });
});

describe('Seletor e FolhaInferior', () => {
  const opcoes = ['Design', 'Eventos', 'Tecnologia (TI)'];

  function Exemplo({ modo }: { modo?: 'lista' | 'livre' }) {
    const [valor, setValor] = useState<string | null>(null);
    return (
      <Seletor
        rotulo="Categoria"
        valor={valor}
        textoVazio="Escolha"
        opcoes={opcoes}
        modo={modo}
        textoTodas="Todas as categorias"
        rotuloDePesquisa="Pesquisar categoria"
        textoSemOpcoes="Nenhuma opção"
        onSelecionar={setValor}
      />
    );
  }

  it('abre a folha, filtra por busca e seleciona', async () => {
    await render(<Exemplo />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Categoria: Escolha' }),
    );
    expect(screen.getByText('Todas as categorias')).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText('Pesquisar categoria'),
      'evént',
    );
    expect(screen.queryByText('Design')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Eventos' }));
    expect(
      await screen.findByRole('button', { name: 'Categoria: Eventos' }),
    ).toBeTruthy();
  });

  it('modo livre aceita texto digitado pelo botão Aplicar', async () => {
    await render(<Exemplo modo="livre" />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Categoria: Escolha' }),
    );
    await fireEvent.changeText(
      screen.getByLabelText('Pesquisar categoria'),
      'Jardinagem',
    );
    expect(screen.getByText('Nenhuma opção')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.buscar.aplicar }),
    );
    expect(
      await screen.findByRole('button', { name: 'Categoria: Jardinagem' }),
    ).toBeTruthy();
  });

  it('a folha fecha por "Cancelar"', async () => {
    const onFechar = jest.fn();
    await render(
      <FolhaInferior visivel titulo="Título" onFechar={onFechar}>
        <Text>Conteúdo</Text>
      </FolhaInferior>,
    );
    expect(screen.getByText('Conteúdo')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.cancelar }),
    );
    expect(onFechar).toHaveBeenCalledTimes(1);
  });
});

describe('DialogoDeConfirmacao', () => {
  it('chama onConfirmar e onCancelar', async () => {
    const onConfirmar = jest.fn();
    const onCancelar = jest.fn();
    await render(
      <DialogoDeConfirmacao
        visivel
        titulo="Sair da conta?"
        textoConfirmar="Sair"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
        destrutivo
      />,
    );
    expect(screen.getByText('Sair da conta?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.cancelar }),
    );
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});

describe('Selo', () => {
  it.each([
    ['aberto', 'Aberto'],
    ['em_andamento', 'Em andamento'],
    ['pendente', 'Pendente'],
    ['aceita', 'Aceita'],
    ['recusada', 'Recusada'],
    ['neutro', 'Outro'],
  ] as const)(
    'variante %s mostra texto e rótulo de status',
    async (variante, texto) => {
      await render(<Selo variante={variante} texto={texto} />);
      expect(screen.getByText(texto)).toBeTruthy();
      expect(screen.getByLabelText(`Status: ${texto}`)).toBeTruthy();
    },
  );
});

describe('Chip', () => {
  it('filtro alterna e informa o estado selecionado', async () => {
    const onPress = jest.fn();
    await render(<Chip texto="Design" selecionado onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'Design' });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('removível tem botão de remover com rótulo', async () => {
    const onRemover = jest.fn();
    await render(<Chip texto="Pintura" onRemover={onRemover} />);
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.editarPerfil.remover('Pintura'),
      }),
    );
    expect(onRemover).toHaveBeenCalledTimes(1);
  });
});

describe('CartaoDeAnuncio', () => {
  const base = {
    titulo: 'Pintar apartamento de dois quartos com acabamento fino e rodapé',
    categoria: 'Reformas e reparos',
    valorFormatado: 'R$ 1.234,56',
    dataFormatada: '12 de out.',
  };

  it('mostra dados, limita o título a 2 linhas e abre ao tocar', async () => {
    const onPress = jest.fn();
    await render(
      <CartaoDeAnuncio
        tipo="trampo"
        cidade="Lavras"
        onPress={onPress}
        {...base}
      />,
    );
    expect(screen.getByText(base.titulo).props.numberOfLines).toBe(2);
    expect(screen.getByText('Reformas e reparos · Lavras')).toBeTruthy();
    expect(screen.getByText('R$ 1.234,56')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('sem cidade omite o separador; serviço mostra o tipo', async () => {
    await render(
      <CartaoDeAnuncio
        tipo="servico"
        cidade={null}
        onPress={() => undefined}
        {...base}
      />,
    );
    expect(screen.getByText('Reformas e reparos')).toBeTruthy();
    expect(screen.getByText(textos.detalheServico.titulo)).toBeTruthy();
  });
});

describe('Avatar', () => {
  it('mostra a inicial em maiúscula e fica oculto para leitor de tela', async () => {
    await render(<Avatar nome="  ana silva" />);
    expect(screen.getByText('A', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('A')).toBeNull();
  });
});

describe('Avisos e estados', () => {
  it('Aviso mostra o texto e a ação opcional', async () => {
    const onAcao = jest.fn();
    await render(
      <Aviso
        variante="erro"
        texto="Não foi possível carregar."
        textoAcao="Tentar de novo"
        onAcao={onAcao}
      />,
    );
    expect(screen.getByText('Não foi possível carregar.')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Tentar de novo' }),
    );
    expect(onAcao).toHaveBeenCalledTimes(1);
  });

  it.each(['sucesso', 'info'] as const)(
    'Aviso %s renderiza',
    async (variante) => {
      await render(<Aviso variante={variante} texto="Mensagem" />);
      expect(screen.getByText('Mensagem')).toBeTruthy();
    },
  );

  it('FaixaSemConexao usa o texto padrão', async () => {
    await render(<FaixaSemConexao />);
    expect(screen.getByText(textos.gerais.semConexaoFaixa)).toBeTruthy();
  });

  it('Esqueleto renderiza oculto para leitor de tela', async () => {
    await render(<Esqueleto altura={20} />);
    expect(screen.toJSON()).toBeTruthy();
    await act(async () => undefined);
  });

  it('EstadoVazio mostra título, texto e ação', async () => {
    const onAcao = jest.fn();
    await render(
      <EstadoVazio
        icone="albums-outline"
        titulo="Ainda não há anúncios"
        texto="Assim que alguém publicar, aparece aqui."
        textoAcao="Buscar trampos"
        onAcao={onAcao}
      />,
    );
    expect(screen.getByText('Ainda não há anúncios')).toBeTruthy();
    expect(
      screen.getByText('Assim que alguém publicar, aparece aqui.'),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Buscar trampos' }),
    );
    expect(onAcao).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  it('mostra a mensagem e fecha pelo botão', async () => {
    const onFechar = jest.fn();
    await render(
      <Toast
        visivel
        mensagem="Perfil atualizado."
        rotuloFechar="Fechar"
        onFechar={onFechar}
      />,
    );
    expect(screen.getByText('Perfil atualizado.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('não renderiza quando invisível e só fecha sozinho depois de 6 s', async () => {
    jest.useFakeTimers();
    try {
      const onFechar = jest.fn();
      await render(
        <Toast
          visivel
          mensagem="Oi"
          rotuloFechar="Fechar"
          duracaoMs={1000}
          onFechar={onFechar}
        />,
      );
      await act(async () => {
        jest.advanceTimersByTime(5900);
      });
      expect(onFechar).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(onFechar).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
    await render(
      <Toast
        visivel={false}
        mensagem="Invisível"
        rotuloFechar="Fechar"
        onFechar={() => undefined}
      />,
    );
    expect(screen.queryByText('Invisível')).toBeNull();
  });
});

describe('Cabeçalhos e logo', () => {
  it('Cabecalho tem título como cabeçalho e botão Voltar', async () => {
    const onVoltar = jest.fn();
    await render(<Cabecalho titulo="Detalhe" onVoltar={onVoltar} />);
    expect(screen.getByRole('header', { name: 'Detalhe' })).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    expect(onVoltar).toHaveBeenCalledTimes(1);
  });

  it('Cabecalho sem onVoltar não mostra o botão', async () => {
    await render(<Cabecalho titulo="Início" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Logo tem rótulo de imagem nos dois tamanhos', async () => {
    await render(<Logo tamanho="pequeno" />);
    expect(screen.getByLabelText(textos.entrada.logo)).toBeTruthy();
    await render(<Logo />);
    expect(
      screen.getAllByLabelText(textos.entrada.logo).length,
    ).toBeGreaterThan(0);
  });

  it('CabecalhoGradiente mostra o título e o conteúdo', async () => {
    await render(
      <CabecalhoGradiente titulo="Ache trampo. Ache quem faça.">
        <Logo />
      </CabecalhoGradiente>,
    );
    expect(screen.getByText('Ache trampo. Ache quem faça.')).toBeTruthy();
    expect(screen.getByLabelText(textos.entrada.logo)).toBeTruthy();
  });
});

describe('navegacao', () => {
  it('opções das abas com altura 56 e ícone por rota', () => {
    expect(opcoesDaBarraDeAbas.tabBarStyle.height).toBe(56);
    const opcoes = opcoesDaAba('buscar', 'Buscar');
    expect(opcoes.tabBarLabel).toBe('Buscar');
    expect(
      opcoes.tabBarIcon({ color: '#000', size: 24, focused: true }),
    ).toBeTruthy();
    expect(opcoesDoCabecalho.headerTitleStyle.fontSize).toBe(22);
  });
});
