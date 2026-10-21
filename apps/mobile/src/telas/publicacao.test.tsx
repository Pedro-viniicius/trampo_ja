import { fireEvent, render, screen } from '@testing-library/react-native';
import { textos } from '../textos/pt-BR';
import { EscolhaDePublicacao } from './EscolhaDePublicacao';
import { FormularioDeAnuncio } from './FormularioDeAnuncio';
import type { PropsDoFormularioDeAnuncio, ValoresDoAnuncio } from './tipos';

const t = textos.formularioDeAnuncio;
const categorias = [
  { id: 'reformas', rotulo: 'Reformas e reparos' },
  { id: 'aulas', rotulo: 'Aulas e reforço' },
];
const valores: ValoresDoAnuncio = {
  titulo: '',
  descricao: '',
  categoria: null,
  cidade: '',
  valor: '',
  prazo: '',
};

function formulario(
  extra: Partial<PropsDoFormularioDeAnuncio> = {},
): PropsDoFormularioDeAnuncio {
  return {
    tipo: 'trampo',
    valores,
    erros: {},
    categorias,
    enviando: false,
    perfilIncompleto: null,
    publicado: false,
    onMudar: jest.fn(),
    onMudarCategoria: jest.fn(),
    onSairDoCampo: jest.fn(),
    onEnviar: jest.fn(),
    onCompletarPerfil: jest.fn(),
    onAgoraNao: jest.fn(),
    onVerPublicado: jest.fn(),
    onPublicarOutro: jest.fn(),
    onVoltar: jest.fn(),
    ...extra,
  };
}

describe('EscolhaDePublicacao', () => {
  it('mostra as duas opções e chama o callback de cada uma', async () => {
    const onPublicarTrampo = jest.fn();
    const onOfertarServico = jest.fn();
    await render(
      <EscolhaDePublicacao
        onPublicarTrampo={onPublicarTrampo}
        onOfertarServico={onOfertarServico}
      />,
    );
    expect(
      screen.getByText(textos.escolhaDePublicacao.pergunta),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.escolhaDePublicacao.trampoAjuda),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: `${textos.escolhaDePublicacao.trampo}. ${textos.escolhaDePublicacao.trampoAjuda}`,
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: `${textos.escolhaDePublicacao.servico}. ${textos.escolhaDePublicacao.servicoAjuda}`,
      }),
    );
    expect(onPublicarTrampo).toHaveBeenCalledTimes(1);
    expect(onOfertarServico).toHaveBeenCalledTimes(1);
  });
});

describe('FormularioDeAnuncio', () => {
  it('trampo: mostra valor, prazo e cidade obrigatória', async () => {
    await render(<FormularioDeAnuncio {...formulario()} />);
    expect(screen.getByLabelText(t.titulo)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.descricao)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.cidade)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.valor)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.prazo)).toBeOnTheScreen();
    expect(screen.getByText(t.contador(0, 80))).toBeOnTheScreen();
    expect(screen.getByText(t.contador(0, 2000))).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: t.publicarTrampo }),
    ).toBeOnTheScreen();
  });

  it('serviço: sem prazo, cidade opcional e preço base', async () => {
    await render(<FormularioDeAnuncio {...formulario({ tipo: 'servico' })} />);
    expect(screen.queryByLabelText(t.prazo)).toBeNull();
    expect(screen.getByLabelText(t.cidadeOpcional)).toBeOnTheScreen();
    expect(screen.getByText(t.ajudaCidadeServico)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.precoBase)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: t.ofertarServico }),
    ).toBeOnTheScreen();
  });

  it('digitar chama onMudar e sair de valor e prazo chama onSairDoCampo', async () => {
    const props = formulario();
    await render(<FormularioDeAnuncio {...props} />);
    await fireEvent.changeText(screen.getByLabelText(t.titulo), 'Pintar');
    expect(props.onMudar).toHaveBeenCalledWith('titulo', 'Pintar');
    await fireEvent(screen.getByLabelText(t.valor), 'blur');
    expect(props.onSairDoCampo).toHaveBeenCalledWith('valor');
    await fireEvent(screen.getByLabelText(t.prazo), 'blur');
    expect(props.onSairDoCampo).toHaveBeenCalledWith('prazo');
    await fireEvent(screen.getByLabelText(t.titulo), 'blur');
    expect(props.onSairDoCampo).toHaveBeenCalledWith('titulo');
    await fireEvent(screen.getByLabelText(t.descricao), 'blur');
    expect(props.onSairDoCampo).toHaveBeenCalledWith('descricao');
    await fireEvent(screen.getByLabelText(t.cidade), 'blur');
    expect(props.onSairDoCampo).toHaveBeenCalledWith('cidade');
  });

  it('avisa que título, descrição e cidade ficam visíveis a todos (LGPD)', async () => {
    await render(<FormularioDeAnuncio {...formulario()} />);
    expect(screen.getByText(t.avisoVisibilidade)).toBeOnTheScreen();
  });

  it('categoria pelo seletor chama onMudarCategoria', async () => {
    const props = formulario();
    await render(<FormularioDeAnuncio {...props} />);
    await fireEvent.press(
      screen.getByRole('button', {
        name: `${t.categoria}: ${t.escolherCategoria}`,
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Aulas e reforço' }),
    );
    expect(props.onMudarCategoria).toHaveBeenCalledWith('aulas');
  });

  it('mostra a categoria escolhida pelo rótulo', async () => {
    await render(
      <FormularioDeAnuncio
        {...formulario({ valores: { ...valores, categoria: 'reformas' } })}
      />,
    );
    expect(
      screen.getByRole('button', {
        name: `${t.categoria}: Reformas e reparos`,
      }),
    ).toBeOnTheScreen();
  });

  it('mostra erros por campo e o erro geral', async () => {
    await render(
      <FormularioDeAnuncio
        {...formulario({
          erros: {
            titulo: 'Informe o título.',
            categoria: 'Escolha uma categoria.',
            valor: 'Valor inválido.',
            geral: textos.erros.erro_servidor,
          },
        })}
      />,
    );
    expect(screen.getByText('Informe o título.')).toBeOnTheScreen();
    expect(screen.getByText('Escolha uma categoria.')).toBeOnTheScreen();
    expect(screen.getByText('Valor inválido.')).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.erro_servidor)).toBeOnTheScreen();
  });

  it('botão publica; enviando troca o texto e não envia de novo', async () => {
    const props = formulario();
    const { rerender } = await render(<FormularioDeAnuncio {...props} />);
    await fireEvent.press(
      screen.getByRole('button', { name: t.publicarTrampo }),
    );
    expect(props.onEnviar).toHaveBeenCalledTimes(1);
    await rerender(<FormularioDeAnuncio {...props} enviando />);
    expect(screen.getByText(t.enviando)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t.enviando }));
    expect(props.onEnviar).toHaveBeenCalledTimes(1);
  });

  it('sem conexão: botão desabilitado e motivo visível', async () => {
    const props = formulario({ semConexao: true });
    await render(<FormularioDeAnuncio {...props} />);
    expect(screen.getByText(t.semConexaoMotivo)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: t.publicarTrampo }),
    );
    expect(props.onEnviar).not.toHaveBeenCalled();
  });

  it('perfil incompleto: aviso com as duas ações no lugar do botão', async () => {
    const props = formulario({ perfilIncompleto: { falta: ['cidade'] } });
    await render(<FormularioDeAnuncio {...props} />);
    expect(
      screen.getByText(textos.avisoPerfil.mensagem(['cidade'])),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: t.publicarTrampo })).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avisoPerfil.completar }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.avisoPerfil.agoraNao }),
    );
    expect(props.onCompletarPerfil).toHaveBeenCalledTimes(1);
    expect(props.onAgoraNao).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['trampo', t.publicadoTrampo, t.verTrampo, t.publicarOutro],
    ['servico', t.publicadoServico, t.verServico, t.ofertarOutro],
  ] as const)(
    'publicado (%s): confirma e oferece duas ações',
    async (tipo, titulo, ver, outro) => {
      const props = formulario({ tipo, publicado: true });
      await render(<FormularioDeAnuncio {...props} />);
      expect(screen.getByText(titulo)).toBeOnTheScreen();
      expect(screen.queryByLabelText(t.titulo)).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: ver }));
      await fireEvent.press(screen.getByRole('button', { name: outro }));
      expect(props.onVerPublicado).toHaveBeenCalledTimes(1);
      expect(props.onPublicarOutro).toHaveBeenCalledTimes(1);
    },
  );
});
