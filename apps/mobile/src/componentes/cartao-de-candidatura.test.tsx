import { fireEvent, render, screen } from '@testing-library/react-native';
import { textos } from '../textos/pt-BR';
import { CartaoDeCandidatura, type PropsDoCartaoDeCandidatura } from './index';

function props(
  extra: Partial<PropsDoCartaoDeCandidatura> = {},
): PropsDoCartaoDeCandidatura {
  return {
    nome: 'Maria Souza',
    valorFormatado: 'R$ 150,00',
    mensagem: 'Posso começar amanhã.',
    dataFormatada: '20/10/2026',
    status: 'pendente',
    podeAceitar: true,
    onAceitar: jest.fn(),
    onVerPerfil: jest.fn(),
    ...extra,
  };
}

describe('CartaoDeCandidatura', () => {
  it('mostra nome, valor, mensagem e data', async () => {
    await render(<CartaoDeCandidatura {...props()} />);
    expect(screen.getByText('Maria Souza')).toBeOnTheScreen();
    expect(screen.getByText('R$ 150,00')).toBeOnTheScreen();
    expect(screen.getByText('Posso começar amanhã.')).toBeOnTheScreen();
    expect(screen.getByText('Enviada em 20/10/2026')).toBeOnTheScreen();
  });

  it('sem nome, mostra "Perfil indisponível"', async () => {
    await render(<CartaoDeCandidatura {...props({ nome: null })} />);
    expect(
      screen.getByText(textos.candidaturasRecebidas.perfilIndisponivel),
    ).toBeOnTheScreen();
  });

  it.each([
    ['pendente', textos.selos.pendente],
    ['aceita', textos.selos.aceita],
    ['recusada', textos.selos.recusada],
  ] as const)(
    'status %s aparece como selo com texto',
    async (status, texto) => {
      await render(<CartaoDeCandidatura {...props({ status })} />);
      expect(screen.getByText(texto)).toBeOnTheScreen();
      expect(
        screen.getByLabelText(textos.gerais.status(texto)),
      ).toBeOnTheScreen();
    },
  );

  it('os botões chamam os callbacks', async () => {
    const dados = props({ onConversar: jest.fn() });
    await render(<CartaoDeCandidatura {...dados} />);
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.aceitarDe('Maria Souza'),
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.verPerfil('Maria Souza'),
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom('Maria Souza'),
      }),
    );
    expect(dados.onAceitar).toHaveBeenCalledTimes(1);
    expect(dados.onVerPerfil).toHaveBeenCalledTimes(1);
    expect(dados.onConversar).toHaveBeenCalledTimes(1);
  });

  it('podeAceitar falso esconde "Aceitar" e sem onConversar não há "Conversar"', async () => {
    await render(<CartaoDeCandidatura {...props({ podeAceitar: false })} />);
    expect(
      screen.queryByRole('button', {
        name: textos.candidaturasRecebidas.aceitarDe('Maria Souza'),
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom('Maria Souza'),
      }),
    ).toBeNull();
  });

  it('motivo da conversa desabilita "Conversar" e mostra o texto', async () => {
    const dados = props({
      onConversar: jest.fn(),
      motivoDaConversa: 'motivo-sentinela',
    });
    await render(<CartaoDeCandidatura {...dados} />);
    expect(screen.getByText('motivo-sentinela')).toBeOnTheScreen();
    const botao = screen.getByRole('button', {
      name: textos.candidaturasRecebidas.conversarCom('Maria Souza'),
    });
    expect(botao).toBeDisabled();
    await fireEvent.press(botao);
    expect(dados.onConversar).not.toHaveBeenCalled();
  });

  it('sem motivo, "Conversar" fica habilitado e sem texto extra', async () => {
    await render(
      <CartaoDeCandidatura {...props({ onConversar: jest.fn() })} />,
    );
    expect(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom('Maria Souza'),
      }),
    ).toBeEnabled();
    expect(screen.queryByText('motivo-sentinela')).toBeNull();
  });
});
