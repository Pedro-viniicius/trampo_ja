import { fireEvent, render, screen } from '@testing-library/react-native';
import { LinhaDeConfiguracao } from '../componentes';
import { textos } from '../textos/pt-BR';
import {
  ContaEPrivacidade,
  DocumentoLegal,
  ExcluirConta,
  ExportarDados,
} from './index';

const noop = () => undefined;

function em<T>(lista: readonly T[], indice: number): T {
  const item = lista.at(indice);
  if (item === undefined) throw new Error('Elemento ausente na lista.');
  return item;
}

interface NoDaArvore {
  readonly props: { readonly accessibilityRole?: unknown };
  readonly parent: NoDaArvore | null;
}

/** Algum ancestral do elemento é um aviso de erro (`accessibilityRole="alert"`). */
function dentroDeAviso(elemento: NoDaArvore): boolean {
  for (let no = elemento.parent; no !== null; no = no.parent) {
    if (no.props.accessibilityRole === 'alert') return true;
  }
  return false;
}

/** O texto está no campo de senha (dica e mensagem), não num aviso geral. */
function erroNoCampo(rotulo: string, texto: string) {
  expect(screen.getByLabelText(rotulo)).toHaveProp('accessibilityHint', texto);
  expect(dentroDeAviso(screen.getByText(texto))).toBe(false);
}

/** O texto está num aviso geral, e o campo de senha fica sem erro. */
function erroEmAviso(rotulo: string, texto: string, ajuda: string) {
  expect(dentroDeAviso(screen.getByText(texto))).toBe(true);
  expect(screen.getByLabelText(rotulo)).toHaveProp('accessibilityHint', ajuda);
}

describe('LinhaDeConfiguracao', () => {
  it('é um botão com título e descrição e chama onPress', async () => {
    const onPress = jest.fn();
    await render(
      <LinhaDeConfiguracao
        titulo="Título"
        descricao="Descrição"
        icone="trash-outline"
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: /Título/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('desabilitada não chama onPress', async () => {
    const onPress = jest.fn();
    await render(
      <LinhaDeConfiguracao
        titulo="Título"
        icone="trash-outline"
        desabilitada
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Título' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ContaEPrivacidade', () => {
  const base = {
    onExportar: noop,
    onExcluir: noop,
    onPolitica: noop,
    onTermos: noop,
    onSair: noop,
  };

  it('chama cada ação', async () => {
    const onExportar = jest.fn();
    const onExcluir = jest.fn();
    const onPolitica = jest.fn();
    const onTermos = jest.fn();
    await render(
      <ContaEPrivacidade
        {...base}
        onExportar={onExportar}
        onExcluir={onExcluir}
        onPolitica={onPolitica}
        onTermos={onTermos}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: /Exportar/ }));
    await fireEvent.press(screen.getByRole('button', { name: /Excluir/ }));
    await fireEvent.press(
      screen.getByRole('button', { name: textos.contaEPrivacidade.politica }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.contaEPrivacidade.termos }),
    );
    expect(onExportar).toHaveBeenCalledTimes(1);
    expect(onExcluir).toHaveBeenCalledTimes(1);
    expect(onPolitica).toHaveBeenCalledTimes(1);
    expect(onTermos).toHaveBeenCalledTimes(1);
  });

  it('sair pede confirmação antes de chamar onSair', async () => {
    const onSair = jest.fn();
    await render(<ContaEPrivacidade {...base} onSair={onSair} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    expect(onSair).not.toHaveBeenCalled();
    await fireEvent.press(
      em(
        screen.getAllByRole('button', { name: textos.perfil.sairConfirmar }),
        -1,
      ),
    );
    expect(onSair).toHaveBeenCalledTimes(1);
  });

  it('com onVoltar: mostra o voltar e chama a prop', async () => {
    const onVoltar = jest.fn();
    await render(<ContaEPrivacidade {...base} onVoltar={onVoltar} />);
    await fireEvent.press(screen.getByRole('button', { name: /Voltar/ }));
    expect(onVoltar).toHaveBeenCalledTimes(1);
  });

  it('sem onVoltar: não mostra o voltar', async () => {
    await render(<ContaEPrivacidade {...base} />);
    expect(screen.queryByRole('button', { name: /Voltar/ })).toBeNull();
  });

  it('sem conexão: exportar e excluir desabilitados, com motivo', async () => {
    const onExcluir = jest.fn();
    await render(
      <ContaEPrivacidade {...base} onExcluir={onExcluir} semConexao />,
    );
    await fireEvent.press(screen.getByRole('button', { name: /Excluir/ }));
    expect(onExcluir).not.toHaveBeenCalled();
    expect(
      screen.getByText(textos.contaEPrivacidade.semConexaoMotivo),
    ).toBeOnTheScreen();
  });
});

describe('ExcluirConta', () => {
  const t = textos.excluirConta;
  const base = {
    senha: '',
    onMudarSenha: noop,
    excluindo: false,
    onExcluir: noop,
    onExportar: noop,
    onCancelar: noop,
  };

  it('mostra a explicação e o aviso', async () => {
    await render(<ExcluirConta {...base} />);
    expect(screen.getByText(t.alerta)).toBeOnTheScreen();
    for (const item of t.itens) {
      expect(screen.getByText(item)).toBeOnTheScreen();
    }
  });

  it('sem senha: botão desabilitado com motivo', async () => {
    const onExcluir = jest.fn();
    await render(<ExcluirConta {...base} onExcluir={onExcluir} />);
    expect(screen.getByText(t.motivoSenha)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t.excluir }));
    expect(screen.queryByText(t.dialogoTitulo)).not.toBeOnTheScreen();
    expect(onExcluir).not.toHaveBeenCalled();
  });

  it('sem conexão: botão desabilitado com motivo de conexão', async () => {
    await render(<ExcluirConta {...base} senha="segredo123" semConexao />);
    expect(screen.getByText(t.semConexaoMotivo)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t.excluir }));
    expect(screen.queryByText(t.dialogoTitulo)).not.toBeOnTheScreen();
  });

  it('com senha: abre o diálogo e só exclui ao confirmar', async () => {
    const onExcluir = jest.fn();
    await render(
      <ExcluirConta {...base} senha="segredo123" onExcluir={onExcluir} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: t.excluir }));
    expect(screen.getByText(t.dialogoTitulo)).toBeOnTheScreen();
    expect(onExcluir).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole('button', { name: t.dialogoConfirmar }),
    );
    expect(onExcluir).toHaveBeenCalledTimes(1);
  });

  it('cancelar no diálogo fecha sem excluir', async () => {
    const onExcluir = jest.fn();
    await render(
      <ExcluirConta {...base} senha="segredo123" onExcluir={onExcluir} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: t.excluir }));
    await fireEvent.press(
      em(screen.getAllByRole('button', { name: t.dialogoCancelar }), -1),
    );
    expect(screen.queryByText(t.dialogoTitulo)).not.toBeOnTheScreen();
    expect(onExcluir).not.toHaveBeenCalled();
  });

  it('excluindo: o diálogo mostra "Excluindo…" e o fim com erro o fecha', async () => {
    const tela = await render(<ExcluirConta {...base} senha="x1234567" />);
    await fireEvent.press(screen.getByRole('button', { name: t.excluir }));
    await tela.rerender(<ExcluirConta {...base} senha="x1234567" excluindo />);
    expect(screen.getByRole('button', { name: t.excluindo })).toBeOnTheScreen();
    await tela.rerender(
      <ExcluirConta
        {...base}
        senha="x1234567"
        erroDaSenha={textos.erros.senha_incorreta}
      />,
    );
    expect(screen.queryByText(t.dialogoTitulo)).not.toBeOnTheScreen();
    erroNoCampo(t.senha, textos.erros.senha_incorreta);
  });

  it('erroDaSenha fecha o diálogo aberto mesmo sem passar por "excluindo"', async () => {
    const tela = await render(<ExcluirConta {...base} senha="x1234567" />);
    await fireEvent.press(screen.getByRole('button', { name: t.excluir }));
    expect(screen.getByText(t.dialogoTitulo)).toBeOnTheScreen();
    await tela.rerender(
      <ExcluirConta
        {...base}
        senha="x1234567"
        erroDaSenha={textos.erros.senha_incorreta}
      />,
    );
    expect(screen.queryByText(t.dialogoTitulo)).not.toBeOnTheScreen();
  });

  it('erro geral aparece como aviso, sem ir ao campo', async () => {
    await render(<ExcluirConta {...base} erro={t.erroServidor} />);
    erroEmAviso(t.senha, t.erroServidor, t.ajudaSenha);
  });

  it('`erro` é sempre aviso geral, mesmo com o texto de senha incorreta', async () => {
    await render(
      <ExcluirConta {...base} erro={textos.erros.senha_incorreta} />,
    );
    erroEmAviso(t.senha, textos.erros.senha_incorreta, t.ajudaSenha);
  });

  it('link de exportar e cancelar chamam os callbacks', async () => {
    const onExportar = jest.fn();
    const onCancelar = jest.fn();
    await render(
      <ExcluirConta
        {...base}
        onExportar={onExportar}
        onCancelar={onCancelar}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: t.dicaLink }));
    await fireEvent.press(screen.getByRole('button', { name: t.cancelar }));
    expect(onExportar).toHaveBeenCalledTimes(1);
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});

describe('ExportarDados', () => {
  const t = textos.exportarDados;
  const base = {
    situacao: 'inicial' as const,
    senha: '',
    onMudarSenha: noop,
    onGerar: noop,
    onVoltar: noop,
  };

  it('sem senha: botão desabilitado com motivo', async () => {
    const onGerar = jest.fn();
    await render(<ExportarDados {...base} onGerar={onGerar} />);
    expect(screen.getByText(t.motivoSenha)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t.gerar }));
    expect(onGerar).not.toHaveBeenCalled();
  });

  it('com senha: gera', async () => {
    const onGerar = jest.fn();
    await render(
      <ExportarDados {...base} senha="abc12345" onGerar={onGerar} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: t.gerar }));
    expect(onGerar).toHaveBeenCalledTimes(1);
  });

  it('gerando: botão "Gerando arquivo…" não chama onGerar', async () => {
    const onGerar = jest.fn();
    await render(
      <ExportarDados
        {...base}
        senha="abc12345"
        situacao="gerando"
        onGerar={onGerar}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: t.gerando }));
    expect(onGerar).not.toHaveBeenCalled();
  });

  it('gerado: mostra o aviso e "Gerar de novo"', async () => {
    await render(
      <ExportarDados {...base} senha="abc12345" situacao="gerado" />,
    );
    expect(screen.getByText(t.gerado)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: t.gerarDeNovo }),
    ).toBeOnTheScreen();
  });

  it('erroDaSenha vai ao campo, não ao aviso', async () => {
    await render(
      <ExportarDados
        {...base}
        senha="abc12345"
        erroDaSenha={textos.erros.senha_incorreta}
      />,
    );
    erroNoCampo(t.senha, textos.erros.senha_incorreta);
  });

  it('`erro` é sempre aviso geral, mesmo com o texto de senha incorreta', async () => {
    await render(
      <ExportarDados
        {...base}
        senha="abc12345"
        erro={textos.erros.senha_incorreta}
      />,
    );
    erroEmAviso(t.senha, textos.erros.senha_incorreta, t.ajudaSenha);
  });

  it('erro e sem conexão', async () => {
    await render(
      <ExportarDados
        {...base}
        senha="abc12345"
        semConexao
        erro={textos.erros.compartilhamento_indisponivel}
      />,
    );
    expect(
      screen.getByText(textos.erros.compartilhamento_indisponivel),
    ).toBeOnTheScreen();
    expect(screen.getByText(t.semConexaoMotivo)).toBeOnTheScreen();
  });
});

describe('DocumentoLegal', () => {
  const documento = {
    titulo: 'Termos de uso',
    versao: '2026-10-20',
    rascunho: true,
    secoes: [
      { titulo: 'Quem somos', paragrafos: ['Primeiro.', 'Segundo.'] },
      { titulo: 'Seus direitos', paragrafos: ['Terceiro.'] },
    ],
  };

  it('mostra título, versão, rascunho e seções como cabeçalhos', async () => {
    await render(<DocumentoLegal documento={documento} onVoltar={noop} />);
    expect(screen.getByText('Versão de 20/10/2026')).toBeOnTheScreen();
    expect(screen.getByText(textos.documentoLegal.rascunho)).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Quem somos' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Seus direitos' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Segundo.')).toBeOnTheScreen();
  });

  it('sem rascunho: não mostra o aviso; voltar funciona', async () => {
    const onVoltar = jest.fn();
    await render(
      <DocumentoLegal
        documento={{ ...documento, rascunho: false }}
        onVoltar={onVoltar}
      />,
    );
    expect(
      screen.queryByText(textos.documentoLegal.rascunho),
    ).not.toBeOnTheScreen();
    await fireEvent.press(
      em(
        screen.getAllByRole('button', { name: textos.documentoLegal.voltar }),
        -1,
      ),
    );
    expect(onVoltar).toHaveBeenCalledTimes(1);
  });
});
