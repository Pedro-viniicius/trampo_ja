import { render } from '@testing-library/react-native';
import { type ComponentRef, createRef } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { espaco } from '../tema/tokens';
import { FocarPrimeiroErro, Formulario, Rolavel } from './base';

function comMedida(
  ref: React.RefObject<ComponentRef<typeof TextInput> | null>,
  y: number,
) {
  const no = ref.current as unknown as {
    measureLayout: jest.Mock;
    focus: jest.Mock;
  };
  no.measureLayout = jest.fn((_rel, ok: (x: number, y: number) => void) =>
    ok(0, y),
  );
  no.focus = jest.fn();
  (no as unknown as { isFocused: () => boolean }).isFocused = () => false;
  return no;
}

describe('FocarPrimeiroErro (L4, CA62)', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['Formulario', Formulario],
    ['Rolavel', Rolavel],
  ] as const)(
    'dentro de %s foca o primeiro campo com erro e rola até ele',
    async (_n, Tela) => {
      const nome = createRef<ComponentRef<typeof TextInput>>();
      const email = createRef<ComponentRef<typeof TextInput>>();
      const rolagem = jest
        .spyOn(ScrollView.prototype as never, 'scrollTo' as never)
        .mockImplementation((() => undefined) as never);
      const interno = jest
        .spyOn(ScrollView.prototype as never, 'getInnerViewRef' as never)
        .mockReturnValue({} as never);

      function Conteudo({ erros }: { erros: [string?, string?] }) {
        return (
          <Tela titulo="Tela" rodape={<View />}>
            <TextInput ref={nome} accessibilityLabel="Nome" />
            <TextInput ref={email} accessibilityLabel="E-mail" />
            <FocarPrimeiroErro
              campos={[
                { ref: nome, erro: erros[0] },
                { ref: email, erro: erros[1] },
              ]}
            />
          </Tela>
        );
      }

      const tela = await render(<Conteudo erros={[undefined, undefined]} />);
      const campoNome = comMedida(nome, 300);
      const campoEmail = comMedida(email, 500);
      await tela.rerender(
        <Conteudo erros={[undefined, 'Informe o e-mail.']} />,
      );
      expect(campoEmail.focus).toHaveBeenCalledTimes(1);
      expect(campoNome.focus).not.toHaveBeenCalled();
      expect(rolagem).toHaveBeenCalledWith({
        y: 500 - espaco[6],
        animated: false,
      });

      await tela.rerender(
        <Conteudo erros={['Informe o nome.', 'Informe o e-mail.']} />,
      );
      expect(campoNome.focus).toHaveBeenCalledTimes(1);
      rolagem.mockRestore();
      interno.mockRestore();
    },
  );

  it('sem erro, não foca nem rola', async () => {
    const nome = createRef<ComponentRef<typeof TextInput>>();
    const rolagem = jest
      .spyOn(ScrollView.prototype as never, 'scrollTo' as never)
      .mockImplementation((() => undefined) as never);
    const tela = await render(
      <Formulario titulo="T" rodape={<View />}>
        <TextInput ref={nome} />
        <FocarPrimeiroErro campos={[{ ref: nome }]} />
      </Formulario>,
    );
    const campo = comMedida(nome, 100);
    await tela.rerender(
      <Formulario titulo="T" rodape={<View />}>
        <TextInput ref={nome} />
        <FocarPrimeiroErro campos={[{ ref: nome }]} tentativa={1} />
      </Formulario>,
    );
    expect(campo.focus).not.toHaveBeenCalled();
    expect(rolagem).not.toHaveBeenCalled();
    rolagem.mockRestore();
  });
});
