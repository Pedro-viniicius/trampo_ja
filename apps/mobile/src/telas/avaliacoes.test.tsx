// Etapa 10 da V2b (plano visual-v2): telas de avaliação, nota nos cartões e
// perfis e equipe favorita (CA96 a CA98), só pela tela, com props.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { textos } from '../textos/pt-BR';
import type {
  AvaliacaoParaExibir,
  Estado,
  ItemParaExibir,
  MeuAnuncioParaExibir,
  MinhaCandidaturaParaExibir,
  PropsDaAvaliar,
} from './index';
import {
  Avaliar,
  Buscar,
  CandidaturasRecebidas,
  DetalheDoTrampo,
  destaquesDoPapel,
  InicioDoContratante,
  LIMITE_DO_COMENTARIO,
  ListaDeAvaliacoes,
  MeusAnuncios,
  MinhasCandidaturas,
  Perfil,
  PerfilDaEmpresa,
} from './index';

const noop = () => undefined;
const ok = <T,>(dados: T): Estado<T> => ({ situacao: 'ok', dados });

// ---------------------------------------------------------------- CA96

function avaliar(extra: Partial<PropsDaAvaliar> = {}): PropsDaAvaliar {
  return {
    papel: 'freela',
    alvo: ok({
      nome: 'João Pereira',
      titulo: 'Pintar a sala',
      dataFormatada: '10/11/2026',
    }),
    nota: 0,
    destaques: [],
    comentario: '',
    onMudarNota: noop,
    onAlternarDestaque: noop,
    onMudarComentario: noop,
    onMudarFavoritar: noop,
    onEnviar: noop,
    onVoltar: noop,
    ...extra,
  };
}

describe('CA96: Avaliar', () => {
  it('as estrelas são um radiogroup com 5 opções e a escolhida marcada', async () => {
    const mudar = jest.fn();
    await render(<Avaliar {...avaliar({ nota: 4, onMudarNota: mudar })} />);
    expect(
      screen.getByLabelText(textos.avaliar.notaRotulo).props.accessibilityRole,
    ).toBe('radiogroup');
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '4 estrelas' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '3 estrelas' })).not.toBeChecked();
    expect(screen.getByText('Muito bom')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: '1 estrela' }));
    expect(mudar).toHaveBeenCalledWith(1);
  });

  it('variante freela: título, destaques do freela, comentário e interruptor Favoritar', async () => {
    const destaque = jest.fn();
    const favoritar = jest.fn();
    await render(
      <Avaliar
        {...avaliar({
          destaques: ['pontual'],
          onAlternarDestaque: destaque,
          onMudarFavoritar: favoritar,
        })}
      />,
    );
    expect(screen.getByText(textos.avaliar.titulo)).toBeOnTheScreen();
    expect(screen.getByText('João Pereira')).toBeOnTheScreen();
    expect(screen.getByText('Pintar a sala · 10/11/2026')).toBeOnTheScreen();
    for (const rotulo of Object.values(textos.avaliar.destaquesFreela)) {
      expect(screen.getByText(rotulo)).toBeOnTheScreen();
    }
    expect(
      screen.queryByText(textos.avaliar.destaquesContratante.pagamento_em_dia),
    ).toBeNull();
    await fireEvent.press(screen.getByText('Educado'));
    expect(destaque).toHaveBeenCalledWith('educado');
    await fireEvent.press(
      screen.getByRole('switch', { name: textos.avaliar.favoritar }),
    );
    expect(favoritar).toHaveBeenCalledWith(true);
  });

  it('variante contratante: título e destaques próprios, sem interruptor Favoritar', async () => {
    await render(<Avaliar {...avaliar({ papel: 'contratante', nota: 5 })} />);
    expect(
      screen.getAllByText(textos.avaliar.tituloContratante).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Pagamento em dia')).toBeOnTheScreen();
    expect(screen.getByText('Instruções claras')).toBeOnTheScreen();
    expect(screen.queryByText('Proativo')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('sem onMudarFavoritar, o interruptor não aparece nem para o freela', async () => {
    await render(<Avaliar {...avaliar({ onMudarFavoritar: undefined })} />);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('as listas de destaques são as fechadas da API, na mesma ordem', () => {
    expect(destaquesDoPapel('freela')).toEqual([
      'pontual',
      'organizado',
      'rapido',
      'educado',
      'proativo',
    ]);
    expect(destaquesDoPapel('contratante')).toEqual([
      'pagamento_em_dia',
      'ambiente_organizado',
      'instrucoes_claras',
      'respeitoso',
      'pontual',
    ]);
  });

  it('comentário com contador e limite de 500', async () => {
    const mudar = jest.fn();
    await render(
      <Avaliar
        {...avaliar({ comentario: 'Ótimo trabalho', onMudarComentario: mudar })}
      />,
    );
    expect(LIMITE_DO_COMENTARIO).toBe(500);
    const campo = screen.getByLabelText(textos.avaliar.comentario);
    expect(campo.props.multiline).toBe(true);
    expect(
      screen.getByText(textos.gerais.contador(14, LIMITE_DO_COMENTARIO)),
    ).toBeOnTheScreen();
    await fireEvent.changeText(campo, 'Novo texto');
    expect(mudar).toHaveBeenCalledWith('Novo texto');
  });

  it('sem nota, Enviar fica desabilitado e diz o motivo em texto', async () => {
    const enviar = jest.fn();
    await render(<Avaliar {...avaliar({ onEnviar: enviar })} />);
    const botao = screen.getByRole('button', { name: textos.avaliar.enviar });
    expect(botao).toBeDisabled();
    expect(screen.getByText(textos.avaliar.escolhaNota)).toBeOnTheScreen();
    await fireEvent.press(botao);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('com nota, Enviar manda um só pedido mesmo com dois toques seguidos', async () => {
    const enviar = jest.fn();
    await render(<Avaliar {...avaliar({ nota: 5, onEnviar: enviar })} />);
    const botao = screen.getByRole('button', { name: textos.avaliar.enviar });
    expect(botao).toBeEnabled();
    await fireEvent.press(botao);
    await fireEvent.press(botao);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('enviando: botão em "Enviando…" e sem novo pedido; falha libera de novo', async () => {
    const enviar = jest.fn();
    const { rerender } = await render(
      <Avaliar {...avaliar({ nota: 5, enviando: true, onEnviar: enviar })} />,
    );
    expect(screen.getByText(textos.avaliar.enviando)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliar.enviando }),
    );
    expect(enviar).not.toHaveBeenCalled();

    await rerender(
      <Avaliar
        {...avaliar({
          nota: 5,
          enviando: false,
          erro: textos.erros.sem_conexao,
          onEnviar: enviar,
        })}
      />,
    );
    expect(screen.getByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliar.enviar }),
    );
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('sem conexão: Enviar desabilitado com o motivo', async () => {
    await render(<Avaliar {...avaliar({ nota: 3, semConexao: true })} />);
    expect(
      screen.getByRole('button', { name: textos.avaliar.enviar }),
    ).toBeDisabled();
    expect(screen.getByText(textos.avaliar.semConexaoMotivo)).toBeOnTheScreen();
  });

  it('409 avaliacao_ja_feita: mostra "Você já avaliou este trampo" no lugar do formulário', async () => {
    const voltar = jest.fn();
    await render(
      <Avaliar {...avaliar({ nota: 5, jaAvaliado: true, onVoltar: voltar })} />,
    );
    expect(screen.getByText('Você já avaliou este trampo')).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.avaliar.notaRotulo)).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.avaliar.enviar }),
    ).toBeNull();
    expect(
      screen.getAllByRole('button', { name: textos.gerais.voltar }).length,
    ).toBeGreaterThan(0);
  });

  it('semProfissional: mostra "encerrado sem profissional contratado" no lugar do formulário, com Voltar', async () => {
    const voltar = jest.fn();
    await render(
      <Avaliar
        {...avaliar({
          alvo: { situacao: 'vazio' },
          semProfissional: true,
          onVoltar: voltar,
        })}
      />,
    );
    expect(screen.getByText(textos.avaliar.semProfissional)).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.nao_encontrado)).toBeNull();
    expect(screen.queryByLabelText(textos.avaliar.notaRotulo)).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.avaliar.enviar }),
    ).toBeNull();
    const [botaoVoltar] = screen.getAllByRole('button', {
      name: textos.gerais.voltar,
    });
    if (botaoVoltar === undefined) throw new Error('sem botão Voltar');
    await fireEvent.press(botaoVoltar);
    expect(voltar).toHaveBeenCalledTimes(1);
  });

  it('alvo carregando, com erro e não encontrado', async () => {
    const tentar = jest.fn();
    const { rerender } = await render(
      <Avaliar {...avaliar({ alvo: { situacao: 'carregando' } })} />,
    );
    await rerender(
      <Avaliar
        {...avaliar({
          alvo: {
            situacao: 'erro',
            mensagem: textos.erros.sem_conexao,
            onTentarDeNovo: tentar,
          },
        })}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(tentar).toHaveBeenCalled();
    await rerender(<Avaliar {...avaliar({ alvo: { situacao: 'vazio' } })} />);
    expect(screen.getByText(textos.erros.nao_encontrado)).toBeOnTheScreen();
  });

  it('nome indisponível usa "Perfil indisponível"', async () => {
    await render(
      <Avaliar
        {...avaliar({
          alvo: ok({
            nome: null,
            titulo: 'Pintar',
            dataFormatada: '01/11/2026',
          }),
        })}
      />,
    );
    expect(
      screen.getByText(textos.conversas.perfilIndisponivel),
    ).toBeOnTheScreen();
  });
});

describe('CA96: "Avaliar" nas listas', () => {
  function candidatura(
    id: string,
    extra: Partial<MinhaCandidaturaParaExibir>,
  ): MinhaCandidaturaParaExibir {
    return {
      id,
      trampoId: `t-${id}`,
      tituloDoTrampo: `Trampo ${id}`,
      valorPropostoFormatado: 'R$ 100,00',
      dataFormatada: '10/11/2026',
      status: 'aceita',
      statusDoTrampo: 'encerrado',
      autor: 'Bar do Zé',
      ...extra,
    };
  }

  it('Meus trampos › Encerrados: "Avaliar" enquanto não avaliou e "Avaliado com N ★" depois', async () => {
    const avaliarItem = jest.fn();
    const pendente = candidatura('a', { notaDada: null });
    await render(
      <MinhasCandidaturas
        lista={ok([pendente, candidatura('b', { notaDada: 4 })])}
        segmentada
        segmentoInicial="encerrados"
        onAbrirTrampo={noop}
        onBuscarTrampos={noop}
        onAvaliar={avaliarItem}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.avaliar.avaliarDe('Trampo a'),
      }),
    );
    expect(avaliarItem).toHaveBeenCalledWith(pendente);
    expect(
      screen.getByText('Avaliado com 4 ★', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(textos.avaliar.avaliadoComFalado(4)),
    ).toBeOnTheScreen();
    expect(screen.getAllByText(textos.avaliar.avaliar)).toHaveLength(1);
  });

  it('Meus trampos: sem notaDada (não dá para avaliar), recusada e fora de Encerrados não mostram', async () => {
    await render(
      <MinhasCandidaturas
        lista={ok([
          candidatura('a', {}),
          candidatura('b', { status: 'recusada', notaDada: null }),
          candidatura('c', {
            statusDoTrampo: 'em_andamento',
            notaDada: null,
          }),
        ])}
        segmentada
        segmentoInicial="encerrados"
        onAbrirTrampo={noop}
        onBuscarTrampos={noop}
        onAvaliar={noop}
      />,
    );
    expect(screen.queryByText(textos.avaliar.avaliar)).toBeNull();
    expect(screen.queryByText(/Avaliado com/)).toBeNull();
  });

  it('Meus trampos › Confirmados nunca mostra "Avaliar"', async () => {
    await render(
      <MinhasCandidaturas
        lista={ok([
          candidatura('c', { statusDoTrampo: 'em_andamento', notaDada: null }),
        ])}
        segmentada
        segmentoInicial="confirmados"
        onAbrirTrampo={noop}
        onBuscarTrampos={noop}
        onAvaliar={noop}
      />,
    );
    expect(screen.queryByText(textos.avaliar.avaliar)).toBeNull();
  });

  function demanda(
    id: string,
    status: MeuAnuncioParaExibir['status'],
    extra: Partial<MeuAnuncioParaExibir> = {},
  ): MeuAnuncioParaExibir {
    return {
      tipo: 'trampo',
      id,
      titulo: `Demanda ${id}`,
      categoria: 'Eventos',
      cidade: 'Lavras',
      valorFormatado: 'R$ 100,00',
      dataFormatada: '10/11/2026',
      status,
      interessados: 0,
      ...extra,
    };
  }

  it('Demandas › Encerradas: "Avaliar profissional" e depois "Avaliado com N ★"', async () => {
    const avaliarItem = jest.fn();
    const pendente = demanda('a', 'encerrado', { notaDada: null });
    await render(
      <MeusAnuncios
        tipo="trampo"
        segmentada
        abaInicial="encerrado"
        lista={ok([pendente, demanda('b', 'encerrado', { notaDada: 5 })])}
        onAbrirItem={noop}
        onPublicar={noop}
        onAvaliar={avaliarItem}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.avaliar.avaliarDe('Demanda a'),
      }),
    );
    expect(avaliarItem).toHaveBeenCalledWith(pendente);
    expect(
      screen.getByLabelText(textos.avaliar.avaliadoComFalado(5)),
    ).toBeOnTheScreen();
  });

  it('Demandas › Abertas nunca mostra "Avaliar profissional"', async () => {
    await render(
      <MeusAnuncios
        tipo="trampo"
        segmentada
        lista={ok([demanda('a', 'aberto', { notaDada: null })])}
        onAbrirItem={noop}
        onPublicar={noop}
        onAvaliar={noop}
      />,
    );
    expect(screen.queryByText(textos.avaliar.avaliarProfissional)).toBeNull();
  });
});

// ---------------------------------------------------------------- CA97

const NOTA = { media: 4.9, total: 8 };

const PERFIL = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: 'Garçonete há 5 anos.',
  habilidades: ['Atendimento'],
};

describe('CA97: nota nos perfis, no detalhe, nos candidatos e na Busca', () => {
  it('Perfil: nota (média e total) e link para as avaliações; sem avaliações, nada', async () => {
    const ver = jest.fn();
    const { rerender } = await render(
      <Perfil
        proprio={false}
        estado={ok(PERFIL)}
        nota={NOTA}
        onVerAvaliacoes={ver}
      />,
    );
    expect(screen.getByText('4,9 (8 avaliações)')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Nota 4,9 de 5, 8 avaliações recebidas'),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avaliacoes.recebidasTitulo }),
    );
    expect(ver).toHaveBeenCalled();

    await rerender(
      <Perfil
        proprio={false}
        estado={ok(PERFIL)}
        nota={{ media: 0, total: 0 }}
        onVerAvaliacoes={ver}
      />,
    );
    expect(screen.queryByText(/avaliaç/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.avaliacoes.recebidasTitulo }),
    ).toBeNull();
  });

  it('Perfil da empresa: nota e a linha "Avaliações recebidas"', async () => {
    const ver = jest.fn();
    await render(
      <PerfilDaEmpresa
        estado={ok(PERFIL)}
        nota={{ media: 5, total: 1 }}
        onTrocarModo={noop}
        onEditar={noop}
        onContaEPrivacidade={noop}
        onSair={noop}
        onVerAvaliacoes={ver}
      />,
    );
    expect(screen.getByText('5,0 (1 avaliação)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(textos.avaliacoes.recebidasTitulo));
    expect(ver).toHaveBeenCalled();
  });

  it('Perfil da empresa sem as props novas continua igual', async () => {
    await render(
      <PerfilDaEmpresa
        estado={ok(PERFIL)}
        onTrocarModo={noop}
        onEditar={noop}
        onContaEPrivacidade={noop}
        onSair={noop}
      />,
    );
    expect(screen.queryByText(textos.avaliacoes.recebidasTitulo)).toBeNull();
  });

  it('Detalhe do trampo: nota do autor no cartão do autor', async () => {
    await render(
      <DetalheDoTrampo
        estado={ok({
          titulo: 'Pintar a sala',
          descricao: 'Pintura de uma sala.',
          categoria: 'Reformas e reparos',
          cidade: 'Lavras',
          valorFormatado: 'R$ 300,00',
          prazoFormatado: null,
          status: 'aberto',
        })}
        autor={ok({
          contaId: 'a1',
          nome: 'Maria Souza',
          cidade: 'Lavras',
          descricao: null,
          habilidades: [],
        })}
        notaDoAutor={NOTA}
        onVoltar={noop}
        onAbrirAutor={noop}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Maria Souza.*Nota 4,9 de 5/ }),
    ).toBeOnTheScreen();
  });

  it('Candidatos: nota no cartão de quem tem avaliações', async () => {
    await render(
      <CandidaturasRecebidas
        trampo={ok({ titulo: 'Pintar a sala', status: 'aberto' })}
        lista={ok([
          {
            id: 'c1',
            contaId: 'p1',
            nome: 'João',
            nota: NOTA,
            valorPropostoFormatado: 'R$ 100,00',
            mensagem: 'Posso.',
            dataFormatada: '10/11/2026',
            status: 'pendente' as const,
            podeAceitar: true,
          },
          {
            id: 'c2',
            contaId: 'p2',
            nome: 'Maria',
            nota: { media: 0, total: 0 },
            valorPropostoFormatado: 'R$ 90,00',
            mensagem: 'Posso também.',
            dataFormatada: '10/11/2026',
            status: 'pendente' as const,
            podeAceitar: true,
          },
        ])}
        aceitando={null}
        toast={null}
        onAceitar={noop}
        onAbrirPerfil={noop}
        onFecharToast={noop}
        onVoltar={noop}
      />,
    );
    expect(screen.getAllByText('4,9 (8 avaliações)')).toHaveLength(1);
  });

  it('Busca: nota no cartão de freelancer e no cartão de anúncio com autor', async () => {
    const servico: ItemParaExibir = {
      tipo: 'servico',
      id: 's1',
      titulo: 'Garçom para eventos',
      categoria: 'Eventos',
      cidade: 'Lavras',
      valorFormatado: 'R$ 80,00',
      dataFormatada: '10/11/2026',
      autor: 'João Pereira',
      nota: NOTA,
    };
    await render(
      <Buscar
        texto=""
        categoria={null}
        cidade={null}
        categorias={[]}
        tipo="servicos"
        estado={ok([servico])}
        temMais={false}
        onMudarTexto={noop}
        onMudarCategoria={noop}
        onMudarCidade={noop}
        onEnviar={noop}
        onCarregarMais={noop}
        onLimparFiltros={noop}
        onAbrirItem={noop}
      />,
    );
    expect(screen.getByText('4,9 (8 avaliações)')).toBeOnTheScreen();
  });
});

describe('Lista de avaliações', () => {
  const avaliacoes: AvaliacaoParaExibir[] = [
    {
      id: 'v1',
      autor: 'Bar do Zé',
      nota: 5,
      papelDoAvaliado: 'freela',
      destaques: ['pontual', 'educado', 'desconhecido'],
      comentario: 'Muito bom.',
      dataFormatada: '10/11/2026',
    },
    {
      id: 'v2',
      autor: null,
      nota: 3,
      papelDoAvaliado: 'contratante',
      destaques: ['pagamento_em_dia'],
      comentario: null,
      dataFormatada: '01/11/2026',
    },
  ];

  it('mostra resumo, autor, destaques e comentário; código desconhecido não vaza', async () => {
    await render(
      <ListaDeAvaliacoes
        resumo={NOTA}
        lista={ok(avaliacoes)}
        onVoltar={noop}
      />,
    );
    expect(screen.getByText('4,9 (8 avaliações)')).toBeOnTheScreen();
    expect(screen.getByText('Bar do Zé')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Destaques: Pontual, Educado'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Destaques: Pagamento em dia'),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText('desconhecido', { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.getByText('Muito bom.')).toBeOnTheScreen();
    expect(
      screen.getByText(textos.conversas.perfilIndisponivel),
    ).toBeOnTheScreen();
  });

  it('vazio, carregando, erro e carregar mais', async () => {
    const mais = jest.fn();
    const tentar = jest.fn();
    const { rerender } = await render(
      <ListaDeAvaliacoes lista={{ situacao: 'vazio' }} onVoltar={noop} />,
    );
    expect(screen.getByText(textos.avaliacoes.semAvaliacoes)).toBeOnTheScreen();
    await rerender(
      <ListaDeAvaliacoes
        lista={{ situacao: 'erro', mensagem: 'Falhou', onTentarDeNovo: tentar }}
        onVoltar={noop}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(tentar).toHaveBeenCalled();
    await rerender(
      <ListaDeAvaliacoes
        lista={ok(avaliacoes)}
        carregarMais={{ carregando: false, onCarregarMais: mais }}
        onVoltar={noop}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.carregarMais }),
    );
    expect(mais).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- CA98

describe('CA98: equipe favorita', () => {
  const equipe = [
    { contaId: 'f1', nome: 'João Pereira', servico: 'Garçom', nota: NOTA },
    { contaId: 'f2', nome: 'Maria Souza', servico: null, nota: null },
  ];
  const demandas = ok([] as never[]);

  it('só aparece com favoritos; Ver perfil e Recontratar são callbacks', async () => {
    const ver = jest.fn();
    const recontratar = jest.fn();
    await render(
      <InicioDoContratante
        demandas={demandas}
        equipe={ok(equipe)}
        onNovaDemanda={noop}
        onVerDemandas={noop}
        onVerCandidatos={noop}
        onVerPerfilDaEquipe={ver}
        onRecontratar={recontratar}
      />,
    );
    expect(screen.getByText(textos.inicioContratante.equipe)).toBeOnTheScreen();
    expect(screen.getByText('João Pereira')).toBeOnTheScreen();
    expect(screen.getByText('Garçom')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nota 4,9 de 5')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Ver perfil Maria Souza' }),
    );
    expect(ver).toHaveBeenCalledWith('f2');
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.inicioContratante.recontratarCom('João Pereira'),
      }),
    );
    expect(recontratar).toHaveBeenCalledWith('f1');
  });

  it('sem favoritos (ou sem a prop, carregando ou erro), a seção some', async () => {
    const { rerender } = await render(
      <InicioDoContratante
        demandas={demandas}
        equipe={ok([])}
        onNovaDemanda={noop}
        onVerDemandas={noop}
        onVerCandidatos={noop}
      />,
    );
    expect(screen.queryByText(textos.inicioContratante.equipe)).toBeNull();
    for (const estado of [
      undefined,
      { situacao: 'carregando' } as const,
      { situacao: 'vazio' } as const,
    ]) {
      await rerender(
        <InicioDoContratante
          demandas={demandas}
          equipe={estado}
          onNovaDemanda={noop}
          onVerDemandas={noop}
          onVerCandidatos={noop}
        />,
      );
      expect(screen.queryByText(textos.inicioContratante.equipe)).toBeNull();
    }
  });

  it('sem os callbacks, os botões não aparecem', async () => {
    await render(
      <InicioDoContratante
        demandas={demandas}
        equipe={ok(equipe)}
        onNovaDemanda={noop}
        onVerDemandas={noop}
        onVerCandidatos={noop}
      />,
    );
    expect(screen.queryByText(textos.inicioContratante.recontratar)).toBeNull();
    expect(screen.queryByText(textos.inicioContratante.verPerfil)).toBeNull();
  });

  it('perfil público: favoritar e desfavoritar; só no perfil de outra pessoa', async () => {
    const alternar = jest.fn();
    const { rerender } = await render(
      <Perfil
        proprio={false}
        estado={ok(PERFIL)}
        favorito={{ ativo: false, onAlternar: alternar }}
      />,
    );
    const interruptor = screen.getByRole('switch', {
      name: textos.favoritos.favoritar('Ana Lima'),
    });
    expect(interruptor).not.toBeChecked();
    await fireEvent.press(interruptor);
    expect(alternar).toHaveBeenLastCalledWith(true);

    await rerender(
      <Perfil
        proprio={false}
        estado={ok(PERFIL)}
        favorito={{ ativo: true, onAlternar: alternar }}
      />,
    );
    expect(screen.getByText(textos.favoritos.favoritado)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('switch', {
        name: textos.favoritos.favoritar('Ana Lima'),
      }),
    );
    expect(alternar).toHaveBeenLastCalledWith(false);

    await rerender(
      <Perfil
        proprio
        estado={ok(PERFIL)}
        favorito={{ ativo: true, onAlternar: alternar }}
      />,
    );
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('salvando bloqueia novo toque; erro aparece em texto', async () => {
    const alternar = jest.fn();
    await render(
      <Perfil
        proprio={false}
        estado={ok(PERFIL)}
        favorito={{
          ativo: false,
          salvando: true,
          erro: textos.favoritos.erro,
          onAlternar: alternar,
        }}
      />,
    );
    expect(screen.getByText(textos.favoritos.erro)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('switch'));
    expect(alternar).not.toHaveBeenCalled();
  });
});
