import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PerfilPublico } from '../api/tipos';
import { textos } from '../textos/pt-BR';
import type { Estado, ItemParaExibir, PropsDaBusca } from './index';
import {
  Buscar,
  Cadastro,
  DetalheDoServico,
  DetalheDoTrampo,
  EditarPerfil,
  Entrada,
  Entrar,
  Inicio,
  Perfil,
} from './index';

const noop = () => undefined;

function em<T>(lista: readonly T[], indice: number): T {
  const item = lista.at(indice);
  if (item === undefined) throw new Error('Elemento ausente na lista.');
  return item;
}

const trampo: ItemParaExibir = {
  tipo: 'trampo',
  id: 't1',
  titulo: 'Pintar a sala',
  categoria: 'Reformas e reparos',
  cidade: 'Lavras',
  valorFormatado: 'R$ 1.234,56',
  dataFormatada: '20/10/2026',
};
const servico: ItemParaExibir = {
  tipo: 'servico',
  id: 's1',
  titulo: 'Aulas de violão',
  categoria: 'Aulas e reforço',
  cidade: null,
  valorFormatado: 'R$ 50,00',
  dataFormatada: '19/10/2026',
};
const categorias = [
  { id: 'reformas', rotulo: 'Reformas e reparos' },
  { id: 'aulas', rotulo: 'Aulas e reforço' },
];
const autor: PerfilPublico = {
  contaId: 'a1',
  nome: 'Maria Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: [],
};
const carregando = { situacao: 'carregando' } as const;
const vazio = { situacao: 'vazio' } as const;
const ok = <T,>(dados: T): Estado<T> => ({ situacao: 'ok', dados });
const erro = (onTentarDeNovo: () => void): Estado<never> => ({
  situacao: 'erro',
  mensagem: textos.erros.erro_servidor,
  onTentarDeNovo,
});

describe('Entrada', () => {
  it('mostra a frase e chama os dois caminhos', async () => {
    const onCriarConta = jest.fn();
    const onJaTenhoConta = jest.fn();
    await render(
      <Entrada onCriarConta={onCriarConta} onJaTenhoConta={onJaTenhoConta} />,
    );
    expect(screen.getByText(textos.entrada.frase)).toBeOnTheScreen();
    expect(screen.getByLabelText(textos.entrada.logo)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Já tenho conta' }),
    );
    expect(onCriarConta).toHaveBeenCalledTimes(1);
    expect(onJaTenhoConta).toHaveBeenCalledTimes(1);
  });
});

describe('Entrar', () => {
  const base = {
    email: '',
    senha: '',
    erros: {},
    enviando: false,
    onMudarEmail: noop,
    onMudarSenha: noop,
    onEntrar: noop,
    onIrParaCadastro: noop,
  };

  it('chama os callbacks dos campos e do botão', async () => {
    const onMudarEmail = jest.fn();
    const onEntrar = jest.fn();
    const onIrParaCadastro = jest.fn();
    await render(
      <Entrar
        {...base}
        onMudarEmail={onMudarEmail}
        onEntrar={onEntrar}
        onIrParaCadastro={onIrParaCadastro}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'a@b.com');
    expect(onMudarEmail).toHaveBeenCalledWith('a@b.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(onEntrar).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    expect(onIrParaCadastro).toHaveBeenCalledTimes(1);
  });

  it('mostra erro por campo e erro geral', async () => {
    await render(
      <Entrar
        {...base}
        erros={{
          email: textos.erros.email_invalido,
          senha: textos.erros.senha_curta,
          geral: textos.erros.credenciais_invalidas,
        }}
      />,
    );
    expect(screen.getByText(textos.erros.email_invalido)).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.senha_curta)).toBeOnTheScreen();
    expect(
      screen.getByText(textos.erros.credenciais_invalidas),
    ).toBeOnTheScreen();
  });

  it('enviando: troca o texto e não dispara de novo', async () => {
    const onEntrar = jest.fn();
    await render(<Entrar {...base} enviando onEntrar={onEntrar} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Entrando…' }));
    expect(onEntrar).not.toHaveBeenCalled();
  });

  it('senha tem mostrar/ocultar', async () => {
    await render(<Entrar {...base} />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Mostrar senha' }),
    );
    expect(
      screen.getByRole('button', { name: 'Ocultar senha' }),
    ).toBeOnTheScreen();
  });
});

describe('Cadastro', () => {
  const base = {
    email: '',
    senha: '',
    erros: {},
    enviando: false,
    onMudarEmail: noop,
    onMudarSenha: noop,
    onCriarConta: noop,
    onIrParaEntrar: noop,
    onTermos: noop,
    onPolitica: noop,
  };

  it('mostra ajuda da senha, privacidade e chama criar conta', async () => {
    const onCriarConta = jest.fn();
    await render(<Cadastro {...base} onCriarConta={onCriarConta} />);
    expect(screen.getByText(textos.cadastro.ajudaSenha)).toBeOnTheScreen();
    expect(screen.getByText(textos.cadastro.privacidade)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    expect(onCriarConta).toHaveBeenCalledTimes(1);
  });

  it('erro substitui a ajuda e e-mail em uso aparece como erro geral', async () => {
    await render(
      <Cadastro
        {...base}
        erros={{
          senha: textos.erros.senha_curta,
          geral: textos.erros.email_em_uso,
        }}
      />,
    );
    expect(screen.getByText(textos.erros.senha_curta)).toBeOnTheScreen();
    expect(
      screen.queryByText(textos.cadastro.ajudaSenha),
    ).not.toBeOnTheScreen();
    expect(screen.getByText(textos.erros.email_em_uso)).toBeOnTheScreen();
  });

  it('enviando: texto "Criando conta…"', async () => {
    await render(<Cadastro {...base} enviando />);
    expect(
      screen.getByRole('button', { name: 'Criando conta…' }),
    ).toBeOnTheScreen();
  });
});

describe('Cadastro: aceite e privacidade (L1)', () => {
  const base = {
    email: '',
    senha: '',
    erros: {},
    enviando: false,
    onMudarEmail: noop,
    onMudarSenha: noop,
    onCriarConta: noop,
    onIrParaEntrar: noop,
    onTermos: noop,
    onPolitica: noop,
  };

  it('mostra o aceite com os dois links e o aviso de perfil público', async () => {
    const onTermos = jest.fn();
    const onPolitica = jest.fn();
    await render(
      <Cadastro {...base} onTermos={onTermos} onPolitica={onPolitica} />,
    );
    expect(screen.getByText(textos.cadastro.aceite)).toBeOnTheScreen();
    expect(screen.getByText(textos.cadastro.privacidade)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.aceiteTermos }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.aceitePolitica }),
    );
    expect(onTermos).toHaveBeenCalledTimes(1);
    expect(onPolitica).toHaveBeenCalledTimes(1);
  });
});

describe('Entrada: links legais (L1)', () => {
  it('mostra e aciona os links quando há callbacks', async () => {
    const onTermos = jest.fn();
    const onPolitica = jest.fn();
    await render(
      <Entrada
        onCriarConta={noop}
        onJaTenhoConta={noop}
        onTermos={onTermos}
        onPolitica={onPolitica}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.aceiteTermos }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.aceitePolitica }),
    );
    expect(onTermos).toHaveBeenCalledTimes(1);
    expect(onPolitica).toHaveBeenCalledTimes(1);
  });
});

describe('Inicio', () => {
  const base = {
    nome: 'Ana',
    perfilIncompleto: null,
    recentesTrampos: ok([trampo]),
    recentesServicos: ok([servico]),
    onBuscar: noop,
    onVerTodos: noop,
    onAbrirItem: noop,
    onCompletarPerfil: noop,
  };

  it('mostra saudação, cartões e abre o item', async () => {
    const onAbrirItem = jest.fn();
    await render(<Inicio {...base} onAbrirItem={onAbrirItem} />);
    expect(screen.getByText('Olá, Ana')).toBeOnTheScreen();
    expect(screen.getByText('Reformas e reparos · Lavras')).toBeOnTheScreen();
    expect(screen.getByText('R$ 1.234,56')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Pintar a sala'));
    expect(onAbrirItem).toHaveBeenCalledWith(trampo);
  });

  it('sem nome, saúda com "Olá!"', async () => {
    await render(<Inicio {...base} nome={undefined} />);
    expect(screen.getByText('Olá!')).toBeOnTheScreen();
  });

  it('"Ver todos" informa o tipo e "Buscar" chama o atalho', async () => {
    const onVerTodos = jest.fn();
    const onBuscar = jest.fn();
    await render(
      <Inicio {...base} onVerTodos={onVerTodos} onBuscar={onBuscar} />,
    );
    // D63: só a seção de trampos tem "Ver todos"; não há seção de serviços.
    const botoes = screen.getAllByRole('button', { name: 'Ver todos' });
    expect(botoes).toHaveLength(1);
    await fireEvent.press(em(botoes, 0));
    expect(onVerTodos).toHaveBeenCalledTimes(1);
    expect(onVerTodos).toHaveBeenCalledWith('trampo');
    expect(screen.queryByText(textos.inicio.servicos)).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.inicio.buscar }),
    );
    expect(onBuscar).toHaveBeenCalledTimes(1);
  });

  it('aviso de perfil incompleto com "Falta: …" e ação', async () => {
    const onCompletarPerfil = jest.fn();
    await render(
      <Inicio
        {...base}
        perfilIncompleto={{ falta: ['nome', 'cidade'] }}
        onCompletarPerfil={onCompletarPerfil}
      />,
    );
    expect(
      screen.getByText(textos.perfil.avisoIncompleto(['nome', 'cidade'])),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Complete seu perfil para publicar e se candidatar. Falta: nome e cidade.',
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Completar perfil' }),
    );
    expect(onCompletarPerfil).toHaveBeenCalledTimes(1);
  });

  it('carregando, vazio e erro por seção', async () => {
    const onTentarDeNovo = jest.fn();
    await render(<Inicio {...base} recentesTrampos={carregando} />);
    expect(screen.getByLabelText(textos.gerais.carregando)).toBeOnTheScreen();
    await screen.unmount();

    await render(<Inicio {...base} recentesTrampos={vazio} />);
    expect(screen.getByText(textos.inicio.vazio)).toBeOnTheScreen();
    await screen.unmount();

    await render(<Inicio {...base} recentesTrampos={erro(onTentarDeNovo)} />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Tentar de novo' }),
    );
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Aulas de violão')).toBeNull();
  });

  it('toast de retorno aparece e fecha pelo botão', async () => {
    const onFecharToast = jest.fn();
    await render(
      <Inicio
        {...base}
        toast="Trampo excluído."
        onFecharToast={onFecharToast}
      />,
    );
    expect(screen.getByText('Trampo excluído.')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.toastFechar }),
    );
    expect(onFecharToast).toHaveBeenCalledTimes(1);
  });

  it('D63: sem atalhos de publicar nem serviços, mesmo com os callbacks antigos', async () => {
    await render(
      <Inicio {...base} onPublicarTrampo={noop} onOfertarServico={noop} />,
    );
    expect(screen.queryByText(textos.inicio.publicarTrampo)).toBeNull();
    expect(screen.queryByText(textos.inicio.ofertarServico)).toBeNull();
  });

  it('F1: o título do destaque segue o resumo das candidaturas', async () => {
    const destaque = (
      candidaturas: {
        total: number;
        emAnalise: number;
      } | null,
    ) => (
      <Inicio
        {...base}
        onMinhasCandidaturas={noop}
        candidaturas={candidaturas}
      />
    );

    await render(destaque(null));
    expect(screen.getByText(textos.inicioFreela.acompanhe)).toBeOnTheScreen();
    await screen.unmount();

    await render(destaque({ total: 0, emAnalise: 0 }));
    expect(
      screen.getByText(textos.inicioFreela.semCandidaturas),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.meusTrampos.vazioAnalise)).toBeNull();
    await screen.unmount();

    await render(destaque({ total: 3, emAnalise: 0 }));
    expect(screen.getByText(textos.meusTrampos.vazioAnalise)).toBeOnTheScreen();
    expect(screen.queryByText(textos.inicioFreela.semCandidaturas)).toBeNull();
    await screen.unmount();

    await render(destaque({ total: 4, emAnalise: 2 }));
    expect(
      screen.getByText(textos.inicioFreela.emAnalise(2)),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.inicioFreela.semCandidaturas)).toBeNull();
    expect(screen.queryByText(textos.meusTrampos.vazioAnalise)).toBeNull();
  });
});

describe('Buscar', () => {
  const base: PropsDaBusca = {
    texto: '',
    categoria: null,
    cidade: null,
    categorias,
    aba: 'trampos',
    estado: { situacao: 'inicial' },
    temMais: false,
    onMudarTexto: noop,
    onMudarCategoria: noop,
    onMudarCidade: noop,
    onEnviar: noop,
    onCarregarMais: noop,
    onLimparFiltros: noop,
    onAbrirItem: noop,
    onTrocarAba: noop,
  };

  it('inicial: sugere categorias e escolher uma chama o filtro', async () => {
    const onMudarCategoria = jest.fn();
    await render(<Buscar {...base} onMudarCategoria={onMudarCategoria} />);
    expect(screen.getByText(textos.buscar.inicial)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Aulas e reforço' }),
    );
    expect(onMudarCategoria).toHaveBeenCalledWith('aulas');
  });

  it('erro ao carregar mais: mantém a lista e oferece tentar de novo', async () => {
    const onTentarCarregarMais = jest.fn();
    await render(
      <Buscar
        {...base}
        estado={ok([trampo])}
        temMais
        erroAoCarregarMais={textos.erros.sem_conexao}
        onTentarCarregarMais={onTentarCarregarMais}
      />,
    );
    expect(screen.getByText('Pintar a sala')).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(onTentarCarregarMais).toHaveBeenCalledTimes(1);
  });

  it('enviar pelo teclado e abas', async () => {
    const onEnviar = jest.fn();
    const onTrocarAba = jest.fn();
    await render(
      <Buscar {...base} onEnviar={onEnviar} onTrocarAba={onTrocarAba} />,
    );
    const campo = screen.getByLabelText(textos.buscar.campo);
    expect(campo.props.returnKeyType).toBe('search');
    await fireEvent(campo, 'submitEditing');
    expect(onEnviar).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('tab', { name: 'Trampos' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole('tab', { name: 'Serviços' }));
    expect(onTrocarAba).toHaveBeenCalledWith('servicos');
  });

  it('resultados: contagem com "+", abrir item e carregar mais', async () => {
    const onAbrirItem = jest.fn();
    const onCarregarMais = jest.fn();
    await render(
      <Buscar
        {...base}
        estado={ok([trampo])}
        temMais
        onAbrirItem={onAbrirItem}
        onCarregarMais={onCarregarMais}
      />,
    );
    expect(screen.getByText('1+ resultado')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Pintar a sala'));
    expect(onAbrirItem).toHaveBeenCalledWith(trampo);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Carregar mais' }),
    );
    expect(onCarregarMais).toHaveBeenCalledTimes(1);
  });

  it('sem "Carregar mais" quando não há mais páginas', async () => {
    await render(<Buscar {...base} estado={ok([trampo, servico])} />);
    expect(screen.getByText('2 resultados')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'Carregar mais' }),
    ).not.toBeOnTheScreen();
  });

  it('sem resultados: sugere limpar filtros', async () => {
    const onLimparFiltros = jest.fn();
    await render(
      <Buscar
        {...base}
        texto="xyz"
        estado={vazio}
        onLimparFiltros={onLimparFiltros}
      />,
    );
    expect(screen.getByText(textos.buscar.semResultados)).toBeOnTheScreen();
    const botoes = screen.getAllByRole('button', { name: 'Limpar filtros' });
    await fireEvent.press(em(botoes, 0));
    expect(onLimparFiltros).toHaveBeenCalledTimes(1);
  });

  it('carregando e erro com "Tentar de novo"', async () => {
    await render(<Buscar {...base} estado={carregando} />);
    expect(screen.getByLabelText(textos.gerais.carregando)).toBeOnTheScreen();
    await screen.unmount();
    const onTentarDeNovo = jest.fn();
    await render(<Buscar {...base} estado={erro(onTentarDeNovo)} />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Tentar de novo' }),
    );
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it('toast de retorno aparece e fecha pelo botão', async () => {
    const onFecharToast = jest.fn();
    await render(
      <Buscar
        {...base}
        toast="Este anúncio já não existe."
        onFecharToast={onFecharToast}
      />,
    );
    expect(screen.getByText('Este anúncio já não existe.')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.toastFechar }),
    );
    expect(onFecharToast).toHaveBeenCalledTimes(1);
  });

  it('corta o texto da busca em 100 pontos de código', async () => {
    const onMudarTexto = jest.fn();
    await render(<Buscar {...base} onMudarTexto={onMudarTexto} />);
    await fireEvent.changeText(
      screen.getByLabelText(textos.buscar.campo),
      '😀'.repeat(101),
    );
    expect(onMudarTexto).toHaveBeenLastCalledWith('😀'.repeat(100));
  });

  it('offline: não desenha a faixa (é da raiz, CA56)', async () => {
    await render(<Buscar {...base} semConexao />);
    expect(screen.queryByText(textos.gerais.semConexaoFaixa)).toBeNull();
  });
});

const trampoExibido = {
  titulo: 'Pintar a sala',
  descricao: 'Preciso pintar a sala de estar.',
  categoria: 'Reformas e reparos',
  cidade: 'Lavras',
  valorFormatado: 'R$ 1.234,56',
  prazoFormatado: null,
  status: 'aberto',
} as const;

describe('DetalheDoTrampo', () => {
  const base = {
    estado: ok(trampoExibido),
    autor: ok(autor),
    onVoltar: noop,
    onAbrirAutor: noop,
  };

  it('mostra os dados, o selo, o autor e abre o perfil', async () => {
    const onAbrirAutor = jest.fn();
    await render(<DetalheDoTrampo {...base} onAbrirAutor={onAbrirAutor} />);
    expect(screen.getByText('Pintar a sala')).toBeOnTheScreen();
    expect(screen.getByText('R$ 1.234,56')).toBeOnTheScreen();
    expect(screen.getByText(textos.detalheTrampo.semPrazo)).toBeOnTheScreen();
    expect(screen.getByLabelText('Status: Aberto')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Maria Souza'));
    expect(onAbrirAutor).toHaveBeenCalledWith('a1');
  });

  it('descrição longa mostra "Ler mais" e alterna; curta não mostra', async () => {
    await render(<DetalheDoTrampo {...base} />);
    expect(
      screen.queryByRole('button', { name: 'Ler mais' }),
    ).not.toBeOnTheScreen();
    await fireEvent(screen.getByText(trampoExibido.descricao), 'textLayout', {
      nativeEvent: { lines: [1, 2, 3, 4, 5].map(() => ({})) },
    });
    expect(
      screen.queryByRole('button', { name: 'Ler mais' }),
    ).not.toBeOnTheScreen();
    await screen.unmount();

    await render(<DetalheDoTrampo {...base} />);
    await fireEvent(screen.getByText(trampoExibido.descricao), 'textLayout', {
      nativeEvent: { lines: [1, 2, 3, 4, 5, 6].map(() => ({})) },
    });
    expect(screen.getByText(trampoExibido.descricao).props.numberOfLines).toBe(
      5,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Ler mais' }));
    expect(
      screen.getByText(trampoExibido.descricao).props.numberOfLines,
    ).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Ler menos' })).toBeOnTheScreen();
  });

  it('prazo formatado e selo "Em andamento"', async () => {
    await render(
      <DetalheDoTrampo
        {...base}
        estado={ok({
          ...trampoExibido,
          prazoFormatado: '30/10/2026',
          status: 'em_andamento',
        })}
      />,
    );
    expect(screen.getByText('30/10/2026')).toBeOnTheScreen();
    expect(screen.getByLabelText('Status: Em andamento')).toBeOnTheScreen();
  });

  it('renderiza o rodapé recebido', async () => {
    const { Text } = require('react-native');
    await render(
      <DetalheDoTrampo {...base} rodape={<Text>Slot da 2b</Text>} />,
    );
    expect(screen.getByText('Slot da 2b')).toBeOnTheScreen();
  });

  it('carregando, erro, vazio e voltar', async () => {
    const onVoltar = jest.fn();
    await render(
      <DetalheDoTrampo {...base} estado={carregando} onVoltar={onVoltar} />,
    );
    expect(screen.getByLabelText(textos.gerais.carregando)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(onVoltar).toHaveBeenCalledTimes(1);
    await screen.unmount();

    const onTentarDeNovo = jest.fn();
    await render(<DetalheDoTrampo {...base} estado={erro(onTentarDeNovo)} />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Tentar de novo' }),
    );
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
    await screen.unmount();

    await render(<DetalheDoTrampo {...base} estado={vazio} />);
    expect(screen.getByText(textos.erros.nao_encontrado)).toBeOnTheScreen();
  });

  it('autor com erro não derruba o detalhe e oferece tentar de novo', async () => {
    const onTentarDeNovo = jest.fn();
    await render(<DetalheDoTrampo {...base} autor={erro(onTentarDeNovo)} />);
    expect(screen.getByText('Pintar a sala')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Tentar de novo' }),
    );
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
  });
});

describe('DetalheDoServico', () => {
  const servicoExibido = {
    titulo: 'Aulas de violão',
    descricao: 'Aulas para iniciantes.',
    categoria: 'Aulas e reforço',
    cidade: null,
    precoBaseFormatado: 'R$ 50,00',
  };
  const base = {
    estado: ok(servicoExibido),
    autor: ok(autor),
    onVoltar: noop,
    onAbrirAutor: noop,
  };

  it('mostra preço base, omite a cidade ausente e abre o autor', async () => {
    const onAbrirAutor = jest.fn();
    await render(<DetalheDoServico {...base} onAbrirAutor={onAbrirAutor} />);
    expect(screen.getByText('R$ 50,00')).toBeOnTheScreen();
    expect(screen.queryByText(textos.buscar.cidade)).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Maria Souza'));
    expect(onAbrirAutor).toHaveBeenCalledWith('a1');
  });

  it('"Ler mais" com descrição longa', async () => {
    await render(<DetalheDoServico {...base} />);
    await fireEvent(screen.getByText(servicoExibido.descricao), 'textLayout', {
      nativeEvent: { lines: [1, 2, 3, 4, 5, 6, 7].map(() => ({})) },
    });
    expect(screen.getByRole('button', { name: 'Ler mais' })).toBeOnTheScreen();
  });

  it('carregando, erro e vazio', async () => {
    await render(<DetalheDoServico {...base} estado={carregando} />);
    expect(screen.getByLabelText(textos.gerais.carregando)).toBeOnTheScreen();
    await screen.unmount();
    const onTentarDeNovo = jest.fn();
    await render(<DetalheDoServico {...base} estado={erro(onTentarDeNovo)} />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Tentar de novo' }),
    );
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
    await screen.unmount();
    await render(<DetalheDoServico {...base} estado={vazio} />);
    expect(screen.getByText(textos.erros.nao_encontrado)).toBeOnTheScreen();
  });
});

describe('Perfil', () => {
  const dados = {
    nome: 'Ana Lima',
    cidade: 'Lavras',
    descricao: null,
    habilidades: ['Pintura', 'Elétrica'],
  };

  it('próprio: ações, aviso "Falta: …" e confirmação de saída', async () => {
    const onEditar = jest.fn();
    const onSair = jest.fn();
    await render(
      <Perfil
        proprio
        estado={ok(dados)}
        perfilIncompleto={{ falta: ['habilidades'] }}
        onEditar={onEditar}
        onSair={onSair}
      />,
    );
    expect(screen.getByText('Ana Lima')).toBeOnTheScreen();
    expect(screen.getByText(textos.perfil.semDescricao)).toBeOnTheScreen();
    expect(screen.getByText('Pintura')).toBeOnTheScreen();
    expect(screen.getByText(/Falta: habilidades/)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Editar perfil' }),
    );
    expect(onEditar).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    expect(onSair).not.toHaveBeenCalled();
    expect(screen.getByText(textos.perfil.sairTitulo)).toBeOnTheScreen();
    const botoesSair = screen.getAllByRole('button', { name: 'Sair' });
    await fireEvent.press(em(botoesSair, -1));
    expect(onSair).toHaveBeenCalledTimes(1);
  });

  it('próprio: linha "Conta e privacidade" só com o callback, e Sair continua', async () => {
    const onContaEPrivacidade = jest.fn();
    await render(
      <Perfil
        proprio
        estado={ok(dados)}
        perfilIncompleto={null}
        onSair={noop}
        onContaEPrivacidade={onContaEPrivacidade}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.contaEPrivacidade }),
    );
    expect(onContaEPrivacidade).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sair' })).toBeOnTheScreen();
  });

  it('de outra pessoa: sem ações de edição', async () => {
    const onVoltar = jest.fn();
    await render(
      <Perfil
        proprio={false}
        estado={ok({ ...dados, descricao: 'Pinto casas.' })}
        onVoltar={onVoltar}
        onEditar={noop}
        onSair={noop}
      />,
    );
    expect(screen.getByText('Pinto casas.')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'Editar perfil' }),
    ).not.toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'Sair' }),
    ).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(onVoltar).toHaveBeenCalledTimes(1);
  });

  it('carregando, erro e vazio', async () => {
    await render(<Perfil proprio estado={carregando} />);
    expect(screen.getByLabelText(textos.gerais.carregando)).toBeOnTheScreen();
    await screen.unmount();
    const onTentarDeNovo = jest.fn();
    await render(<Perfil proprio estado={erro(onTentarDeNovo)} />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Tentar de novo' }),
    );
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
    await screen.unmount();
    await render(<Perfil proprio={false} estado={vazio} />);
    expect(screen.getByText(textos.erros.nao_encontrado)).toBeOnTheScreen();
  });
});

describe('EditarPerfil', () => {
  it('avisa sobre visibilidade e conta o contador por pontos de código', async () => {
    await render(
      <EditarPerfil {...base} valores={{ ...valores, descricao: 'a😀b' }} />,
    );
    expect(
      screen.getByText(textos.editarPerfil.avisoVisibilidade),
    ).toBeOnTheScreen();
    expect(screen.getByText('3 de 300 caracteres')).toBeOnTheScreen();
  });

  const valores = {
    nome: 'Ana',
    cidade: 'Lavras',
    descricao: 'Oi',
    habilidades: ['Pintura'],
  };
  const base = {
    modoCompletar: false,
    valores,
    erros: {},
    salvando: false,
    onMudarNome: noop,
    onMudarCidade: noop,
    onMudarDescricao: noop,
    onAdicionarHabilidade: noop,
    onRemoverHabilidade: noop,
    onSalvar: noop,
  };

  it('salvar, contador de 300 e remover habilidade', async () => {
    const onSalvar = jest.fn();
    const onRemoverHabilidade = jest.fn();
    await render(
      <EditarPerfil
        {...base}
        onSalvar={onSalvar}
        onRemoverHabilidade={onRemoverHabilidade}
      />,
    );
    expect(screen.getByText('2 de 300 caracteres')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Remover Pintura' }),
    );
    expect(onRemoverHabilidade).toHaveBeenCalledWith('Pintura');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Salvar alterações' }),
    );
    expect(onSalvar).toHaveBeenCalledTimes(1);
  });

  it('adicionar habilidade: limpa o campo só quando a lista cresce', async () => {
    const onAdicionarHabilidade = jest.fn();
    const { rerender } = await render(
      <EditarPerfil {...base} onAdicionarHabilidade={onAdicionarHabilidade} />,
    );
    const botao = () => screen.getByRole('button', { name: 'Adicionar' });
    // Ativo mesmo vazio: o contêiner responde com `habilidade_obrigatoria`.
    expect(botao().props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(botao());
    expect(onAdicionarHabilidade).toHaveBeenLastCalledWith('');
    const campo = screen.getByLabelText(
      textos.editarPerfil.adicionarHabilidade,
    );
    await fireEvent.changeText(campo, '  Elétrica ');
    await fireEvent.press(botao());
    expect(onAdicionarHabilidade).toHaveBeenCalledWith('Elétrica');
    expect(
      screen.getByLabelText(textos.editarPerfil.adicionarHabilidade).props
        .value,
    ).toBe('  Elétrica ');

    await rerender(
      <EditarPerfil
        {...base}
        valores={{ ...valores, habilidades: ['Pintura', 'Elétrica'] }}
        onAdicionarHabilidade={onAdicionarHabilidade}
      />,
    );
    expect(
      screen.getByLabelText(textos.editarPerfil.adicionarHabilidade).props
        .value,
    ).toBe('');
  });

  it('erros por campo e erro geral', async () => {
    await render(
      <EditarPerfil
        {...base}
        erros={{
          nome: textos.erros.nome_obrigatorio,
          cidade: textos.erros.cidade_obrigatoria,
          descricao: textos.erros.descricao_tamanho,
          habilidades: textos.erros.habilidade_obrigatoria,
          geral: textos.erros.erro_servidor,
        }}
      />,
    );
    for (const mensagem of [
      textos.erros.nome_obrigatorio,
      textos.erros.cidade_obrigatoria,
      textos.erros.descricao_tamanho,
      textos.erros.habilidade_obrigatoria,
      textos.erros.erro_servidor,
    ]) {
      expect(screen.getByText(mensagem)).toBeOnTheScreen();
    }
  });

  it('salvando troca o texto e não dispara', async () => {
    const onSalvar = jest.fn();
    await render(<EditarPerfil {...base} salvando onSalvar={onSalvar} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Salvando…' }));
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('modo completar: introdução e "Agora não" (pular)', async () => {
    const onAgoraNao = jest.fn();
    await render(
      <EditarPerfil {...base} modoCompletar onAgoraNao={onAgoraNao} />,
    );
    expect(
      screen.getByText(textos.editarPerfil.introCompletar),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.agoraNao }),
    );
    expect(onAgoraNao).toHaveBeenCalledTimes(1);
  });

  it('modo normal não oferece pular', async () => {
    await render(<EditarPerfil {...base} onAgoraNao={noop} />);
    expect(
      screen.queryByRole('button', { name: textos.editarPerfil.agoraNao }),
    ).not.toBeOnTheScreen();
  });

  it('carregando: mostra o esqueleto, sem campos nem "Salvar"', async () => {
    await render(
      <EditarPerfil
        {...base}
        carregamento={{ situacao: 'carregando', onTentarDeNovo: noop }}
      />,
    );
    expect(
      screen.getByLabelText(textos.editarPerfil.carregando),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.editarPerfil.nome)).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.editarPerfil.salvar }),
    ).toBeNull();
  });

  it('erro: aviso com "Tentar de novo"; sem rede, o texto de conexão', async () => {
    const onTentarDeNovo = jest.fn();
    const { rerender } = await render(
      <EditarPerfil
        {...base}
        carregamento={{ situacao: 'erro', onTentarDeNovo }}
      />,
    );
    expect(
      screen.getByText(textos.editarPerfil.erroAoCarregar),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.editarPerfil.nome)).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
    await rerender(
      <EditarPerfil
        {...base}
        semConexao
        carregamento={{ situacao: 'erro', onTentarDeNovo }}
      />,
    );
    expect(
      screen.getByText(textos.editarPerfil.semConexaoParaCarregar),
    ).toBeOnTheScreen();
  });

  it('pronta: mostra o formulário', async () => {
    await render(
      <EditarPerfil
        {...base}
        carregamento={{ situacao: 'pronta', onTentarDeNovo: noop }}
      />,
    );
    expect(screen.getByLabelText(textos.editarPerfil.nome)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.editarPerfil.salvar }),
    ).toBeOnTheScreen();
  });

  it('sucesso mostra o toast com botão de fechar', async () => {
    const onFecharSucesso = jest.fn();
    await render(
      <EditarPerfil {...base} sucesso onFecharSucesso={onFecharSucesso} />,
    );
    expect(screen.getByText(textos.editarPerfil.sucesso)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
    expect(onFecharSucesso).toHaveBeenCalledTimes(1);
  });
});
