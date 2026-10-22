import { fireEvent, render, screen } from '@testing-library/react-native';
import { textos } from '../textos/pt-BR';
import { BolhaDeMensagem } from './BolhaDeMensagem';

const TEXTO = 'texto-sentinela';

describe('BolhaDeMensagem', () => {
  it('enviada: mostra texto e hora, com rótulo de quem escreveu', async () => {
    await render(
      <BolhaDeMensagem
        minha={false}
        texto={TEXTO}
        horaFormatada="10:30"
        situacao="enviada"
        nome="Pessoa X"
      />,
    );
    expect(screen.getByText(TEXTO)).toBeOnTheScreen();
    expect(screen.getByText('10:30')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        `${textos.conversas.deNome('Pessoa X', '10:30')}. ${TEXTO}`,
      ),
    ).toBeOnTheScreen();
  });

  it('minha: rótulo "Você"', async () => {
    await render(
      <BolhaDeMensagem
        minha
        texto={TEXTO}
        horaFormatada="10:30"
        situacao="enviada"
      />,
    );
    expect(
      screen.getByLabelText(`${textos.conversas.minha('10:30')}. ${TEXTO}`),
    ).toBeOnTheScreen();
  });

  it('enviando: mostra "Enviando" e não é tocável', async () => {
    await render(
      <BolhaDeMensagem
        minha
        texto={TEXTO}
        horaFormatada={null}
        situacao="enviando"
        onTentarDeNovo={jest.fn()}
      />,
    );
    expect(screen.getByText(textos.conversas.rotuloEnviando)).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('falhou: texto de falha e toque chama onTentarDeNovo', async () => {
    const onTentarDeNovo = jest.fn();
    await render(
      <BolhaDeMensagem
        minha
        texto={TEXTO}
        horaFormatada={null}
        situacao="falhou"
        onTentarDeNovo={onTentarDeNovo}
      />,
    );
    expect(screen.getByText(textos.conversas.naoEnviada)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button'));
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
  });
});
