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
  it('mostra o título, a mensagem e o campo com limite de 2000', async () => {
    await render(<Conversa {...props()} />);
    expect(screen.getByText('Pessoa X')).toBeOnTheScreen();
    expect(screen.getByText('texto-sentinela')).toBeOnTheScreen();
    expect(screen.getByLabelText(textos.conversas.campo).props.maxLength).toBe(
      2000,
    );
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

  it('sem conexão mostra a faixa abaixo do cabeçalho', async () => {
    await render(<Conversa {...props({ semConexao: true })} />);
    expect(screen.getByText(textos.gerais.semConexaoFaixa)).toBeOnTheScreen();
  });

  it('nomeDoOutro null rotula a bolha como "Outra pessoa"; sem a prop usa o título', async () => {
    await render(<Conversa {...props({ nomeDoOutro: null })} />);
    expect(screen.getByLabelText(/^Outra pessoa, 10:30/)).toBeOnTheScreen();
    await render(<Conversa {...props()} />);
    expect(screen.getByLabelText(/^Pessoa X, 10:30/)).toBeOnTheScreen();
  });

  it('limite vem da prop e o contador só aparece perto dele', async () => {
    await render(<Conversa {...props({ limite: 1000, rascunho: 'abc' })} />);
    expect(screen.getByLabelText(textos.conversas.campo).props.maxLength).toBe(
      1000,
    );
    expect(
      screen.queryByText(textos.formularioDeAnuncio.contador(3, 1000)),
    ).toBeNull();
    await render(
      <Conversa {...props({ limite: 1000, rascunho: 'a'.repeat(800) })} />,
    );
    expect(
      screen.getByText(textos.formularioDeAnuncio.contador(800, 1000)),
    ).toBeOnTheScreen();
  });

  it('chegada de mensagem do outro anuncia a novidade sem repetir o conteúdo', async () => {
    const { rerender } = await render(<Conversa {...props()} />);
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
