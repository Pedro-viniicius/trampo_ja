import { fireEvent, render, screen } from '@testing-library/react-native';
import { textos } from '../textos/pt-BR';
import { DetalheDoServico } from './DetalheDoServico';
import { DetalheDoTrampo } from './DetalheDoTrampo';
import { MeusAnuncios } from './MeusAnuncios';
import type { MeuAnuncioParaExibir, PropsDaFolhaDeAcoes } from './tipos';

const noop = () => undefined;
const ok = <T,>(dados: T) => ({ situacao: 'ok', dados }) as const;

const item: MeuAnuncioParaExibir = {
  tipo: 'trampo',
  id: 't1',
  titulo: 'Pintar a sala',
  categoria: 'Reformas e reparos',
  cidade: 'Lavras',
  valorFormatado: 'R$ 300,00',
  dataFormatada: '20/10/2026',
  status: 'aberto',
};

function folha(extra: Partial<PropsDaFolhaDeAcoes> = {}): PropsDaFolhaDeAcoes {
  return {
    visivel: true,
    titulo: 'Pintar a sala',
    tipo: 'trampo',
    editar: { disponivel: true },
    encerrar: { disponivel: true },
    excluir: { disponivel: true },
    efeitoDoEncerrar: 'Efeito de encerrar.',
    efeitoDoExcluir: 'Efeito de excluir.',
    processando: null,
    onEditar: noop,
    onEncerrar: noop,
    onExcluir: noop,
    onFechar: noop,
    ...extra,
  };
}

function telaDeAnuncios(
  f: PropsDaFolhaDeAcoes | undefined,
  extra: Partial<Parameters<typeof MeusAnuncios>[0]> = {},
) {
  return (
    <MeusAnuncios
      tipo="trampo"
      lista={ok([item])}
      onAbrirItem={noop}
      onPublicar={noop}
      onVoltar={noop}
      folha={f}
      onMaisOpcoes={noop}
      {...extra}
    />
  );
}

describe('folha "Mais opções" do anúncio', () => {
  it('Meus anúncios mostra o botão de 44x44 e o chama com o item', async () => {
    const abrir = jest.fn();
    await render(telaDeAnuncios(undefined, { onMaisOpcoes: abrir }));
    const botao = screen.getByLabelText(textos.anuncio.maisOpcoes(item.titulo));
    expect(botao).toHaveStyle({ width: 44, height: 44 });
    await fireEvent.press(botao);
    expect(abrir).toHaveBeenCalledWith(item);
  });

  it('oculta "Encerrar" quando a ação não existe', async () => {
    await render(telaDeAnuncios(folha({ encerrar: undefined })));
    expect(screen.getByText(textos.anuncio.editar)).toBeOnTheScreen();
    expect(screen.queryByText(textos.anuncio.encerrarTrampo)).toBeNull();
  });

  it('mostra a ação desabilitada com o motivo', async () => {
    const editar = jest.fn();
    await render(
      telaDeAnuncios(
        folha({
          editar: {
            disponivel: false,
            motivo: textos.anuncio.motivoEditarComCandidaturas,
          },
          onEditar: editar,
        }),
      ),
    );
    expect(
      screen.getByText(textos.anuncio.motivoEditarComCandidaturas),
    ).toBeOnTheScreen();
    const botao = screen.getByRole('button', { name: textos.anuncio.editar });
    expect(botao).toBeDisabled();
    await fireEvent.press(botao);
    expect(editar).not.toHaveBeenCalled();
  });

  it('Editar chama onEditar direto', async () => {
    const editar = jest.fn();
    await render(telaDeAnuncios(folha({ onEditar: editar })));
    await fireEvent.press(screen.getByText(textos.anuncio.editar));
    expect(editar).toHaveBeenCalledTimes(1);
  });

  it('Excluir pede confirmação e só chama onExcluir depois dela', async () => {
    const excluir = jest.fn();
    await render(telaDeAnuncios(folha({ onExcluir: excluir })));
    await fireEvent.press(screen.getByText(textos.anuncio.excluirTrampo));
    expect(excluir).not.toHaveBeenCalled();
    expect(
      screen.getByText(textos.anuncio.excluirTrampoTitulo),
    ).toBeOnTheScreen();
    expect(screen.getByText('Efeito de excluir.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(textos.anuncio.excluirTrampo));
    expect(excluir).toHaveBeenCalledTimes(1);
  });

  it('Cancelar fecha o diálogo sem chamar a ação', async () => {
    const excluir = jest.fn();
    await render(telaDeAnuncios(folha({ onExcluir: excluir })));
    await fireEvent.press(screen.getByText(textos.anuncio.excluirTrampo));
    await fireEvent.press(screen.getByText(textos.anuncio.cancelar));
    expect(excluir).not.toHaveBeenCalled();
    expect(screen.queryByText(textos.anuncio.excluirTrampoTitulo)).toBeNull();
    expect(screen.getByText(textos.anuncio.editar)).toBeOnTheScreen();
  });

  it('Encerrar pede confirmação e mostra "Encerrando…"', async () => {
    const encerrar = jest.fn();
    const { rerender } = await render(
      telaDeAnuncios(folha({ onEncerrar: encerrar })),
    );
    await fireEvent.press(screen.getByText(textos.anuncio.encerrarTrampo));
    expect(encerrar).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(textos.anuncio.encerrarConfirmar));
    expect(encerrar).toHaveBeenCalledTimes(1);
    await rerender(
      telaDeAnuncios(folha({ onEncerrar: encerrar, processando: 'encerrar' })),
    );
    expect(screen.getByText(textos.anuncio.encerrando)).toBeOnTheScreen();
  });

  it('mostra "Excluindo…" enquanto exclui', async () => {
    const { rerender } = await render(telaDeAnuncios(folha()));
    await fireEvent.press(screen.getByText(textos.anuncio.excluirTrampo));
    await fireEvent.press(screen.getByText(textos.anuncio.excluirTrampo));
    await rerender(telaDeAnuncios(folha({ processando: 'excluir' })));
    expect(screen.getByText(textos.anuncio.excluindo)).toBeOnTheScreen();
  });

  it('mostra o erro na folha depois que o processamento termina', async () => {
    const { rerender } = await render(telaDeAnuncios(folha()));
    await fireEvent.press(screen.getByText(textos.anuncio.excluirTrampo));
    await fireEvent.press(screen.getByText(textos.anuncio.excluirTrampo));
    await rerender(telaDeAnuncios(folha({ processando: 'excluir' })));
    await rerender(
      telaDeAnuncios(folha({ erro: textos.anuncio.erroAoExcluir })),
    );
    expect(screen.getByText(textos.anuncio.erroAoExcluir)).toBeOnTheScreen();
    expect(screen.queryByText(textos.anuncio.excluindo)).toBeNull();
  });

  it('serviço usa os textos de serviço', async () => {
    await render(
      telaDeAnuncios(folha({ tipo: 'servico', encerrar: undefined })),
    );
    await fireEvent.press(screen.getByText(textos.anuncio.excluirServico));
    expect(
      screen.getByText(textos.anuncio.excluirServicoTitulo),
    ).toBeOnTheScreen();
  });

  it('mostra o toast e o fecha', async () => {
    const fechar = jest.fn();
    await render(
      telaDeAnuncios(undefined, {
        toast: textos.anuncio.trampoExcluido,
        onFecharToast: fechar,
      }),
    );
    expect(screen.getByText(textos.anuncio.trampoExcluido)).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(textos.gerais.toastFechar));
    expect(fechar).toHaveBeenCalled();
  });

  it('o detalhe do trampo tem o botão no cabeçalho para o autor', async () => {
    const abrir = jest.fn();
    await render(
      <DetalheDoTrampo
        estado={ok({
          titulo: 'Pintar a sala',
          descricao: 'Duas demãos.',
          categoria: 'Reformas e reparos',
          cidade: 'Lavras',
          valorFormatado: 'R$ 300,00',
          prazoFormatado: null,
          status: 'aberto',
        })}
        autor={{ situacao: 'carregando' }}
        folha={folha({ visivel: false })}
        onMaisOpcoes={abrir}
        onVoltar={noop}
        onAbrirAutor={noop}
      />,
    );
    await fireEvent.press(
      screen.getByLabelText(textos.anuncio.maisOpcoes('Pintar a sala')),
    );
    expect(abrir).toHaveBeenCalled();
  });

  it('o detalhe não mostra o botão para quem não é o autor', async () => {
    await render(
      <DetalheDoServico
        estado={ok({
          titulo: 'Aulas de violão',
          descricao: 'Iniciantes.',
          categoria: 'Aulas',
          cidade: 'Lavras',
          precoBaseFormatado: 'R$ 80,00',
        })}
        autor={{ situacao: 'carregando' }}
        onVoltar={noop}
        onAbrirAutor={noop}
      />,
    );
    expect(screen.queryByLabelText(/Mais opções/)).toBeNull();
  });
});
