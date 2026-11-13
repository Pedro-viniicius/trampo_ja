import { fireEvent, render, screen } from '@testing-library/react-native';
import { textos } from '../textos/pt-BR';
import { Conversa } from './Conversa';
import { ListaDeConversas } from './ListaDeConversas';
import { RodapeDoServico } from './RodapeDoServico';
import type {
  ConversaParaExibir,
  MensagemParaExibir,
  PropsDaConversa,
} from './tipos';

const noop = () => undefined;
const ok = <T,>(dados: T) => ({ situacao: 'ok', dados }) as const;

function conversa(extra: Partial<ConversaParaExibir> = {}): ConversaParaExibir {
  return {
    id: 'c1',
    nome: 'Pessoa X',
    previa: 'previa-sentinela',
    horaFormatada: '10:30',
    ...extra,
  };
}

function mensagem(extra: Partial<MensagemParaExibir> = {}): MensagemParaExibir {
  return {
    chave: 'm1',
    minha: false,
    texto: 'texto-sentinela',
    horaFormatada: '10:30',
    situacao: 'enviada',
    ...extra,
  };
}

function props(extra: Partial<PropsDaConversa> = {}): PropsDaConversa {
  return {
    titulo: 'Pessoa X',
    mensagens: ok([mensagem()]),
    indisponivel: false,
    rascunho: '',
    podeEnviar: false,
    onMudarRascunho: noop,
    onEnviar: noop,
    onTentarDeNovo: noop,
    onVoltar: noop,
    ...extra,
  };
}

describe('ListaDeConversas', () => {
  it('mostra nome, prévia e hora; toque abre a conversa', async () => {
    const onAbrir = jest.fn();
    await render(
      <ListaDeConversas lista={ok([conversa()])} onAbrir={onAbrir} />,
    );
    expect(screen.getByText('Pessoa X')).toBeOnTheScreen();
    expect(screen.getByText('previa-sentinela')).toBeOnTheScreen();
    expect(screen.getByText('10:30')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.conversas.linhaDaLista(
          'Pessoa X',
          'previa-sentinela',
          '10:30',
        ),
      }),
    );
    expect(onAbrir).toHaveBeenCalledWith('c1');
  });

  it('perfil indisponível e sem mensagens', async () => {
    await render(
      <ListaDeConversas
        lista={ok([conversa({ nome: null, previa: null })])}
        onAbrir={noop}
      />,
    );
    expect(
      screen.getByText(textos.conversas.perfilIndisponivel),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.conversas.previaVazia)).toBeOnTheScreen();
  });

  it('vazio, carregando e erro', async () => {
    const onTentarDeNovo = jest.fn();
    const { rerender } = await render(
      <ListaDeConversas lista={{ situacao: 'vazio' }} onAbrir={noop} />,
    );
    expect(screen.getByText(textos.conversas.vazio)).toBeOnTheScreen();
    expect(screen.getByText(textos.conversas.vazioTexto)).toBeOnTheScreen();
    await rerender(
      <ListaDeConversas lista={{ situacao: 'carregando' }} onAbrir={noop} />,
    );
    expect(screen.getByLabelText(textos.gerais.carregando)).toBeOnTheScreen();
    await rerender(
      <ListaDeConversas
        lista={{ situacao: 'erro', mensagem: 'erro-sentinela', onTentarDeNovo }}
        onAbrir={noop}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
  });
});

describe('Conversa', () => {
  it('mostra o aviso do envio acima do campo; sem a prop, não mostra', async () => {
    const aviso = textos.erros.muitas_tentativas_acao;
    const { rerender } = await render(<Conversa {...props()} />);
    expect(screen.queryByText(aviso)).not.toBeOnTheScreen();
    await rerender(<Conversa {...props({ avisoDoEnvio: aviso })} />);
    expect(screen.getByText(aviso)).toBeOnTheScreen();
    expect(screen.getByLabelText(textos.conversas.campo)).toBeOnTheScreen();
  });

  it('mostra o título, a mensagem e o campo', async () => {
    await render(<Conversa {...props()} />);
    expect(screen.getByText('Pessoa X')).toBeOnTheScreen();
    expect(screen.getByText('texto-sentinela')).toBeOnTheScreen();
    expect(screen.getByLabelText(textos.conversas.campo)).toBeOnTheScreen();
  });

  it('corta em pontos de código (emoji conta 1) e diz que cortou', async () => {
    const onMudarRascunho = jest.fn();
    const { rerender } = await render(
      <Conversa {...props({ limite: 5, rascunho: '', onMudarRascunho })} />,
    );
    const campo = screen.getByLabelText(textos.conversas.campo);
    // 5 emojis (10 unidades UTF-16) cabem no limite de 5: nada é cortado.
    await fireEvent.changeText(campo, '😀😀😀😀😀');
    expect(onMudarRascunho).toHaveBeenLastCalledWith('😀😀😀😀😀');
    // 7 pontos de código: corta em 5, nunca antes.
    await fireEvent.changeText(campo, '😀😀😀😀😀😀😀');
    expect(onMudarRascunho).toHaveBeenLastCalledWith('😀😀😀😀😀');
    // O contêiner devolve o texto cortado; a tela diz que cortou.
    await rerender(
      <Conversa
        {...props({ limite: 5, rascunho: '😀😀😀😀😀', onMudarRascunho })}
      />,
    );
    expect(
      screen.getAllByText(textos.gerais.contadorCortado(5)).length,
    ).toBeGreaterThan(0);
  });

  it('"Enviar" só habilita com podeEnviar e chama onEnviar', async () => {
    const onEnviar = jest.fn();
    const { rerender } = await render(<Conversa {...props({ onEnviar })} />);
    const botao = () =>
      screen.getByRole('button', { name: textos.conversas.enviar });
    expect(botao()).toBeDisabled();
    await rerender(<Conversa {...props({ onEnviar, podeEnviar: true })} />);
    await fireEvent.press(botao());
    expect(onEnviar).toHaveBeenCalledTimes(1);
  });

  it('digitar chama onMudarRascunho', async () => {
    const onMudarRascunho = jest.fn();
    await render(<Conversa {...props({ onMudarRascunho })} />);
    await fireEvent.changeText(
      screen.getByLabelText(textos.conversas.campo),
      'rascunho-sentinela',
    );
    expect(onMudarRascunho).toHaveBeenCalledWith('rascunho-sentinela');
  });

  it('pendente mostra "Enviando" e falha chama onTentarDeNovo(chave)', async () => {
    const onTentarDeNovo = jest.fn();
    await render(
      <Conversa
        {...props({
          onTentarDeNovo,
          mensagens: ok([
            mensagem({ chave: 'local-1', minha: true, situacao: 'enviando' }),
            mensagem({
              chave: 'local-2',
              minha: true,
              texto: 'outro-sentinela',
              situacao: 'falhou',
            }),
          ]),
        })}
      />,
    );
    expect(screen.getByText(textos.conversas.rotuloEnviando)).toBeOnTheScreen();
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: /outro-sentinela/ }),
    );
    expect(onTentarDeNovo).toHaveBeenCalledWith('local-2');
  });

  it('vazio mostra a sugestão para começar', async () => {
    await render(<Conversa {...props({ mensagens: { situacao: 'vazio' } })} />);
    expect(screen.getByText(textos.conversas.semMensagens)).toBeOnTheScreen();
  });

  it('sem conexão e atualização falhando mostram os avisos', async () => {
    await render(
      <Conversa
        {...props({
          semConexao: true,
          atualizacaoFalhando: true,
          rascunho: 'r',
        })}
      />,
    );
    expect(
      screen.getByText(textos.conversas.semConexaoNoCampo),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.conversas.atualizacaoFalhando),
    ).toBeOnTheScreen();
    expect(screen.getByDisplayValue('r')).toBeOnTheScreen();
  });

  it('sem conexão não desenha a faixa (é da raiz, CA56)', async () => {
    await render(<Conversa {...props({ semConexao: true })} />);
    expect(screen.queryByText(textos.gerais.semConexaoFaixa)).toBeNull();
    expect(
      screen.getByText(textos.conversas.semConexaoNoCampo),
    ).toBeOnTheScreen();
  });

  it('nomeDoOutro null rotula a bolha como "Outra pessoa"; sem a prop usa o título', async () => {
    await render(<Conversa {...props({ nomeDoOutro: null })} />);
    expect(screen.getByLabelText(/^Outra pessoa, 10:30/)).toBeOnTheScreen();
    await render(<Conversa {...props()} />);
    expect(screen.getByLabelText(/^Pessoa X, 10:30/)).toBeOnTheScreen();
  });

  it('limite vem da prop e o contador só aparece perto dele', async () => {
    await render(<Conversa {...props({ limite: 1000, rascunho: 'abc' })} />);
    expect(screen.queryByText(textos.gerais.contador(3, 1000))).toBeNull();
    await render(
      <Conversa {...props({ limite: 1000, rascunho: 'a'.repeat(800) })} />,
    );
    expect(
      screen.getByText(textos.gerais.contador(800, 1000)),
    ).toBeOnTheScreen();
    await render(
      <Conversa {...props({ limite: 1000, rascunho: 'a'.repeat(1000) })} />,
    );
    expect(
      screen.getAllByText(textos.gerais.contadorLimite(1000)).length,
    ).toBeGreaterThan(0);
  });

  it('chegada de mensagem do outro anuncia a novidade sem repetir o conteúdo', async () => {
    const { rerender, unmount } = await render(<Conversa {...props()} />);
    expect(
      screen.queryByText(textos.conversas.novaMensagemDe('Pessoa X')),
    ).toBeNull();
    await rerender(
      <Conversa
        {...props({
          mensagens: ok([mensagem(), mensagem({ chave: 'm2' })]),
        })}
      />,
    );
    expect(
      screen.getByText(textos.conversas.novaMensagemDe('Pessoa X')),
    ).toBeOnTheScreen();
    // Terceira mensagem do mesmo remetente: o texto é igual, mas o anúncio
    // precisa continuar na tela (remontado por chave) para ser lido de novo.
    await rerender(
      <Conversa
        {...props({
          mensagens: ok([
            mensagem(),
            mensagem({ chave: 'm2' }),
            mensagem({ chave: 'm3' }),
          ]),
        })}
      />,
    );
    expect(
      screen.getByText(textos.conversas.novaMensagemDe('Pessoa X')),
    ).toBeOnTheScreen();
    // A `VirtualizedList` agenda um lote de células num timer que, sob carga,
    // dispara depois do teste e fora do `act`. A desmontagem o cancela.
    await unmount();
  });

  it('indisponível: aviso com "Voltar" e sem campo', async () => {
    const onVoltar = jest.fn();
    await render(<Conversa {...props({ indisponivel: true, onVoltar })} />);
    expect(
      screen.getByText(textos.conversas.indisponivelTitulo),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(textos.conversas.campo)).toBeNull();
    const voltar = screen.getAllByRole('button', {
      name: textos.gerais.voltar,
    });
    await fireEvent.press(voltar[voltar.length - 1] as never);
    expect(onVoltar).toHaveBeenCalledTimes(1);
  });
});

describe('Conversa (quadro 09): separador, contexto, faixa e respostas rápidas', () => {
  /** Textos dos cabeçalhos da tela, na ordem (o nome e os separadores). */
  function cabecalhos(): string[] {
    return screen.getAllByRole('header').map((el) => String(el.props.children));
  }

  it('separador antes da primeira mensagem e a cada troca de dia', async () => {
    await render(
      <Conversa
        {...props({
          titulo: 'Pessoa X',
          mensagens: ok([
            mensagem({ chave: 'm1', diaFormatado: '19/10/2026' }),
            mensagem({ chave: 'm2', diaFormatado: textos.conversas.diaOntem }),
            mensagem({ chave: 'm3', diaFormatado: textos.conversas.diaOntem }),
            mensagem({
              chave: 'm4',
              minha: true,
              diaFormatado: textos.conversas.diaHoje,
            }),
            mensagem({ chave: 'm5', diaFormatado: textos.conversas.diaHoje }),
          ]),
        })}
      />,
    );
    expect(cabecalhos()).toEqual([
      'Pessoa X',
      '19/10/2026',
      textos.conversas.diaOntem,
      textos.conversas.diaHoje,
    ]);
  });

  it('sem o dia (campo ausente ou null), nenhum separador', async () => {
    await render(
      <Conversa
        {...props({
          mensagens: ok([
            mensagem({ chave: 'm1' }),
            mensagem({ chave: 'm2', diaFormatado: null }),
          ]),
        })}
      />,
    );
    expect(cabecalhos()).toEqual(['Pessoa X']);
  });

  it('contexto no cabeçalho só com a prop', async () => {
    const { rerender } = await render(
      <Conversa {...props({ contexto: 'titulo-sentinela' })} />,
    );
    expect(
      screen.getByText(textos.conversas.contexto('titulo-sentinela')),
    ).toBeOnTheScreen();
    await rerender(<Conversa {...props()} />);
    expect(
      screen.queryByText(textos.conversas.contexto('titulo-sentinela')),
    ).toBeNull();
  });

  it('faixa: título, selo da candidatura e valor; o toque abre o trampo', async () => {
    const onAbrir = jest.fn();
    await render(
      <Conversa
        {...props({
          faixa: {
            titulo: 'titulo-sentinela',
            statusDaCandidatura: 'aceita',
            valorFormatado: 'R$ 120,00',
            onAbrir,
          },
        })}
      />,
    );
    expect(screen.getByText('titulo-sentinela')).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
    expect(screen.getByText('R$ 120,00')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.conversas.abrirTrampoDaFaixa(
          'titulo-sentinela',
          textos.selos.aceita,
          'R$ 120,00',
        ),
      }),
    );
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it('sem faixa, nenhum botão de abrir o trampo', async () => {
    await render(<Conversa {...props()} />);
    expect(
      screen.queryByRole('button', { name: /^Abrir o trampo/ }),
    ).toBeNull();
  });

  it('respostas rápidas só preenchem o campo, nunca enviam', async () => {
    const onMudarRascunho = jest.fn();
    const onEnviar = jest.fn();
    await render(
      <Conversa
        {...props({
          comRespostasRapidas: true,
          rascunho: 'rascunho-sentinela',
          podeEnviar: true,
          onMudarRascunho,
          onEnviar,
        })}
      />,
    );
    for (const resposta of textos.conversas.respostasRapidas) {
      expect(screen.getByText(resposta)).toBeOnTheScreen();
    }
    const [primeira] = textos.conversas.respostasRapidas;
    await fireEvent.press(screen.getByText(primeira as string));
    // R7: com rascunho, a resposta vai ao fim, com um espaço; nada é apagado.
    expect(onMudarRascunho).toHaveBeenLastCalledWith(
      `rascunho-sentinela ${primeira}`,
    );
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('R7: com o campo vazio, a resposta rápida o preenche', async () => {
    const onMudarRascunho = jest.fn();
    await render(
      <Conversa
        {...props({
          comRespostasRapidas: true,
          rascunho: '  ',
          onMudarRascunho,
        })}
      />,
    );
    const [primeira] = textos.conversas.respostasRapidas;
    await fireEvent.press(screen.getByText(primeira as string));
    expect(onMudarRascunho).toHaveBeenLastCalledWith(primeira);
  });

  it('D9: com faixa de contexto, o cabeçalho não repete "Sobre:"', async () => {
    await render(
      <Conversa
        {...props({
          contexto: 'Garçom',
          faixa: {
            titulo: 'Garçom',
            statusDaCandidatura: 'aceita',
            valorFormatado: 'R$ 120,00',
            onAbrir: jest.fn(),
          },
        })}
      />,
    );
    expect(screen.queryByText(textos.conversas.contexto('Garçom'))).toBeNull();
  });

  it('D10: o botão Enviar bloqueado dá o motivo como dica', async () => {
    await render(
      <Conversa
        {...props({ semConexao: true, podeEnviar: false, rascunho: 'oi' })}
      />,
    );
    expect(
      screen.getByRole('button', { name: textos.conversas.enviar }),
    ).toHaveProp('accessibilityHint', textos.conversas.semConexaoNoCampo);
  });

  it('sem comRespostasRapidas, nenhum chip', async () => {
    await render(<Conversa {...props()} />);
    for (const resposta of textos.conversas.respostasRapidas) {
      expect(screen.queryByText(resposta)).toBeNull();
    }
  });
});

describe('RodapeDoServico', () => {
  it('habilitado: chama onConversar', async () => {
    const onConversar = jest.fn();
    await render(
      <RodapeDoServico
        conversar={{ abrindo: false, motivo: null }}
        onConversar={onConversar}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.detalheServico.conversar }),
    );
    expect(onConversar).toHaveBeenCalledTimes(1);
  });

  it('abrindo: rótulo "Abrindo…" e desabilitado', async () => {
    await render(
      <RodapeDoServico
        conversar={{ abrindo: true, motivo: null }}
        onConversar={noop}
      />,
    );
    expect(
      screen.getByRole('button', { name: textos.conversas.abrindo }),
    ).toBeDisabled();
  });

  it('motivo: texto abaixo e botão desabilitado', async () => {
    await render(
      <RodapeDoServico
        conversar={{ abrindo: false, motivo: textos.detalheServico.semRelacao }}
        onConversar={noop}
      />,
    );
    expect(
      screen.getByText(textos.detalheServico.semRelacao),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.detalheServico.conversar }),
    ).toBeDisabled();
  });
});
