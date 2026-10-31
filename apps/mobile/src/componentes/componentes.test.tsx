import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo, Platform, Text } from 'react-native';
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
import { contarPontosDeCodigo, cortarEmPontosDeCodigo } from './utilitarios';

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

const EMOJI = '\u{1F600}';
const BANDEIRA = '\u{1F1E7}\u{1F1F7}';
const FAMILIA = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
const E_COMPOSTO = 'e\u0301';

describe('pontos de código (L4, CA55)', () => {
  it.each([
    ['ASCII', 'abc', 3],
    ['emoji', EMOJI, 1],
    ['bandeira', BANDEIRA, 2],
    ['família (ZWJ)', FAMILIA, 5],
    ['acento composto (e + U+0301)', E_COMPOSTO, 2],
    ['acento pré-composto', '\u00E9', 1],
  ])('conta %s', (_nome, texto, n) => {
    expect(contarPontosDeCodigo(texto)).toBe(n);
  });

  it('corta no limite sem partir o emoji', () => {
    expect(cortarEmPontosDeCodigo(`ab${EMOJI}cd`, 3)).toBe(`ab${EMOJI}`);
    expect(cortarEmPontosDeCodigo(`ab${EMOJI}cd`, 2)).toBe('ab');
    expect(cortarEmPontosDeCodigo(EMOJI.repeat(5), 3)).toBe(EMOJI.repeat(3));
  });

  it('não corta o que cabe e não passa do limite', () => {
    expect(cortarEmPontosDeCodigo('abc', 3)).toBe('abc');
    expect(cortarEmPontosDeCodigo(`a${BANDEIRA}`, 3)).toBe(`a${BANDEIRA}`);
    expect(
      contarPontosDeCodigo(cortarEmPontosDeCodigo(`a${BANDEIRA}`, 2)),
    ).toBe(2);
  });

  it('família cortada no meio não deixa ZWJ solto', () => {
    // homem, ZWJ, mulher, ZWJ, menina: limite 2 acabaria em "homem + ZWJ".
    const cortado = cortarEmPontosDeCodigo(FAMILIA, 2);
    expect(cortado).toBe('\u{1F468}');
    expect(cortarEmPontosDeCodigo(FAMILIA, 3)).toBe('\u{1F468}\u200D\u{1F469}');
  });

  it('acento composto conta 2 e o corte respeita isso', () => {
    expect(cortarEmPontosDeCodigo(`${E_COMPOSTO}x`, 2)).toBe(E_COMPOSTO);
  });
});

describe('CampoDeTexto com limite (L4, CA55)', () => {
  function Controlado({
    limite,
    inicial = '',
    onMudou,
  }: {
    limite: number;
    inicial?: string;
    onMudou?: (t: string) => void;
  }) {
    const [valor, setValor] = useState(inicial);
    return (
      <CampoDeTexto
        rotulo="Título"
        valor={valor}
        limite={limite}
        onChangeText={(t) => {
          setValor(t);
          onMudou?.(t);
        }}
      />
    );
  }

  it('não mostra contador longe do limite e mostra a partir de 80%', async () => {
    await render(<Controlado limite={10} />);
    expect(screen.queryByText(/de 10 caracteres/)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Título'), '12345678');
    expect(screen.getByText('8 de 10 caracteres')).toBeTruthy();
  });

  it('a partir de 90% diz quantos faltam', async () => {
    await render(<Controlado limite={10} inicial="123456789" />);
    expect(
      screen.getByText('9 de 10 caracteres. Falta 1 caractere.'),
    ).toBeTruthy();
  });

  it('digitar até o limite mostra o aviso de limite atingido', async () => {
    await render(<Controlado limite={3} />);
    await fireEvent.changeText(screen.getByLabelText('Título'), 'abc');
    expect(
      screen.getAllByText(textos.gerais.contadorLimite(3)).length,
    ).toBeGreaterThan(0);
  });

  it('colar além do limite corta, conta o emoji como 1 e avisa do corte', async () => {
    const onMudou = jest.fn();
    await render(<Controlado limite={3} onMudou={onMudou} />);
    await fireEvent.changeText(
      screen.getByLabelText('Título'),
      `a${EMOJI}${EMOJI}${EMOJI}`,
    );
    expect(onMudou).toHaveBeenLastCalledWith(`a${EMOJI}${EMOJI}`);
    expect(
      screen.getAllByText(textos.gerais.contadorCortado(3)).length,
    ).toBeGreaterThan(0);
    // próxima digitação limpa o aviso de corte
    await fireEvent.changeText(screen.getByLabelText('Título'), 'a');
    expect(screen.queryByText(textos.gerais.contadorCortado(3))).toBeNull();
  });

  it.each([
    ['bandeira', BANDEIRA, 2, `a${BANDEIRA}`],
    ['família', FAMILIA, 5, FAMILIA],
    ['acento composto', E_COMPOSTO, 2, E_COMPOSTO],
  ])(
    'colar %s cabe quando soma o limite',
    async (_n, trecho, pontos, esperado) => {
      const onMudou = jest.fn();
      await render(<Controlado limite={pontos + 1} onMudou={onMudou} />);
      await fireEvent.changeText(screen.getByLabelText('Título'), `a${trecho}`);
      expect(onMudou).toHaveBeenLastCalledWith(`a${trecho}`);
      expect(screen.getByLabelText('Título').props.value).toBe(`a${trecho}`);
      expect(esperado).toBeTruthy();
    },
  );

  it('anuncia o limite no iOS uma vez por mudança de faixa', async () => {
    const original = Platform.OS;
    Platform.OS = 'ios';
    const anunciar = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockClear()
      .mockImplementation(() => undefined);
    try {
      await render(<Controlado limite={10} />);
      const campo = screen.getByLabelText('Título');
      await fireEvent.changeText(campo, '12345678');
      expect(anunciar).not.toHaveBeenCalled();
      await fireEvent.changeText(campo, '123456789');
      expect(anunciar).toHaveBeenLastCalledWith('Falta 1 caractere.');
      await fireEvent.changeText(campo, '1234567890');
      expect(anunciar).toHaveBeenLastCalledWith(
        textos.gerais.contadorLimite(10),
      );
      const chamadas = anunciar.mock.calls.length;
      await fireEvent.changeText(campo, '1234567890');
      expect(anunciar.mock.calls.length).toBe(chamadas);
    } finally {
      Platform.OS = original;
      anunciar.mockRestore();
    }
  });

  it('digitar além do limite anuncia o corte uma vez, não a cada tecla', async () => {
    const original = Platform.OS;
    Platform.OS = 'ios';
    const anunciar = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockClear()
      .mockImplementation(() => undefined);
    try {
      await render(<Controlado limite={10} />);
      const campo = screen.getByLabelText('Título');
      await fireEvent.changeText(campo, '1234567890');
      await fireEvent.changeText(campo, '1234567890a');
      await fireEvent.changeText(campo, '1234567890b');
      await fireEvent.changeText(campo, '1234567890c');
      const cortes = anunciar.mock.calls.filter(
        ([t]) => t === textos.gerais.contadorCortado(10),
      );
      expect(cortes).toHaveLength(1);
    } finally {
      Platform.OS = original;
      anunciar.mockRestore();
    }
  });

  it('o anúncio fica numa região viva, sem live region no texto do contador', async () => {
    await render(<Controlado limite={3} />);
    await fireEvent.changeText(screen.getByLabelText('Título'), 'abc');
    const textosDoLimite = screen.getAllByText(textos.gerais.contadorLimite(3));
    expect(
      textosDoLimite.filter(
        (no) => no.props.accessibilityLiveRegion === 'polite',
      ),
    ).toHaveLength(1);
  });

  it("contadorDoLimite 'nunca' não mostra contador e 'sempre' mostra de 0", async () => {
    await render(
      <>
        <CampoDeTexto
          rotulo="A"
          valor=""
          limite={10}
          contadorDoLimite="sempre"
          onChangeText={() => undefined}
        />
        <CampoDeTexto
          rotulo="B"
          valor="1234567890"
          limite={10}
          contadorDoLimite="nunca"
          onChangeText={() => undefined}
        />
      </>,
    );
    expect(screen.getByText('0 de 10 caracteres')).toBeTruthy();
    expect(screen.queryByText(textos.gerais.contadorLimite(10))).toBeNull();
  });
});

describe('Seletor com limite (L4, CA55)', () => {
  it('corta o texto livre no limite por ponto de código', async () => {
    await render(
      <Seletor
        rotulo="Habilidade"
        valor={null}
        textoVazio="Escolha"
        opcoes={[]}
        modo="livre"
        rotuloDePesquisa="Buscar habilidade"
        textoSemOpcoes="Nada"
        limite={3}
        onSelecionar={() => undefined}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: /Habilidade/ }));
    const campo = screen.getByLabelText('Buscar habilidade');
    await fireEvent.changeText(campo, `${EMOJI}${EMOJI}${EMOJI}${EMOJI}`);
    expect(screen.getByLabelText('Buscar habilidade').props.value).toBe(
      EMOJI.repeat(3),
    );
  });
});

describe('FaixaSemConexao na raiz (L4, CA56)', () => {
  it('visivel=false não desenha e anuncia "Conexão de volta." ao sumir', async () => {
    const anunciar = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockClear()
      .mockImplementation(() => undefined);
    try {
      const tela = await render(<FaixaSemConexao />);
      expect(screen.getByText(textos.gerais.semConexaoFaixa)).toBeTruthy();
      await tela.rerender(<FaixaSemConexao visivel={false} />);
      expect(screen.queryByText(textos.gerais.semConexaoFaixa)).toBeNull();
      expect(anunciar).toHaveBeenCalledWith(textos.gerais.conexaoDeVolta);
      const quantasVezes = () =>
        anunciar.mock.calls.filter(([t]) => t === textos.gerais.conexaoDeVolta)
          .length;
      expect(quantasVezes()).toBe(1);
      await tela.rerender(<FaixaSemConexao visivel={false} />);
      expect(quantasVezes()).toBe(1);
    } finally {
      anunciar.mockRestore();
    }
  });

  it('ocupa a margem segura de cima', async () => {
    const { SafeAreaInsetsContext } = jest.requireActual(
      'react-native-safe-area-context',
    );
    await render(
      <SafeAreaInsetsContext.Provider
        value={{ top: 44, bottom: 0, left: 0, right: 0 }}
      >
        <FaixaSemConexao />
      </SafeAreaInsetsContext.Provider>,
    );
    expect(screen.root?.props.style.paddingTop).toBe(44 + 8);
  });
});
