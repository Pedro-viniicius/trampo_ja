import { screen } from 'expo-router/testing-library';
import Entrada from '../app/(publico)/entrada';
import { textos } from '../textos/pt-BR';
import { renderRouter } from './render-router';

describe('sanidade do app', () => {
  it('renderiza a entrada pela rota /entrada', async () => {
    await renderRouter(
      { '(publico)/entrada': Entrada },
      { initialUrl: '/entrada' },
    );

    expect(await screen.findByText(textos.entrada.frase)).toBeTruthy();
  });
});
