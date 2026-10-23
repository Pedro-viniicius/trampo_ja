import { fireEvent, render, screen } from '@testing-library/react-native';
import { textos } from '../textos/pt-BR';
import { FormularioDeAnuncio } from './FormularioDeAnuncio';
import type {
  EdicaoDeAnuncio,
  PropsDoFormularioDeAnuncio,
  ValoresDoAnuncio,
} from './tipos';

const t = textos.formularioDeAnuncio;
const a = textos.anuncio;
const valores: ValoresDoAnuncio = {
  titulo: 'Pintar sala',
  descricao: 'Pintura de uma sala de 20 m².',
  categoria: 'reformas',
  cidade: 'Lavras',
  valor: '300,00',
  prazo: '5',
};

function edicao(extra: Partial<EdicaoDeAnuncio> = {}): EdicaoDeAnuncio {
  return {
    situacao: 'pronta',
    naoEditavel: false,
    conflito: false,
    descartarVisivel: false,
    onTentarDeNovo: jest.fn(),
    onVerVersaoAtual: jest.fn(),
    onDispensarConflito: jest.fn(),
    onDescartar: jest.fn(),
    onContinuarEditando: jest.fn(),
    ...extra,
  };
}

function formulario(
  extra: Partial<PropsDoFormularioDeAnuncio> = {},
  ed: Partial<EdicaoDeAnuncio> = {},
): PropsDoFormularioDeAnuncio {
  return {
    tipo: 'trampo',
    valores,
    erros: {},
    categorias: [{ id: 'reformas', rotulo: 'Reformas e reparos' }],
    enviando: false,
    perfilIncompleto: null,
    publicado: false,
    edicao: edicao(ed),
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

describe('FormularioDeAnuncio em modo de edição', () => {
  it('abre preenchido, com título "Editar" e "Salvar alterações"', async () => {
    const props = formulario();
    await render(<FormularioDeAnuncio {...props} />);
    expect(screen.getByText(a.tituloEditarTrampo)).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Pintar sala')).toBeOnTheScreen();
    expect(screen.queryByText(t.avisoVisibilidade)).toBeNull();
    expect(screen.queryByText(t.publicarTrampo)).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: a.salvarAlteracoes }),
    );
    expect(props.onEnviar).toHaveBeenCalledTimes(1);
  });

  it('serviço: título "Editar serviço" e sem prazo', async () => {
    await render(<FormularioDeAnuncio {...formulario({ tipo: 'servico' })} />);
    expect(screen.getByText(a.tituloEditarServico)).toBeOnTheScreen();
    expect(screen.queryByLabelText(t.prazo)).toBeNull();
  });

  it('salvando: mostra "Salvando…" e não reenvia', async () => {
    const props = formulario({ enviando: true });
    await render(<FormularioDeAnuncio {...props} />);
    await fireEvent.press(screen.getByText(a.salvando));
    expect(props.onEnviar).not.toHaveBeenCalled();
  });

  it('sem conexão: explica o motivo e não envia', async () => {
    const props = formulario({ semConexao: true });
    await render(<FormularioDeAnuncio {...props} />);
    expect(screen.getByText(a.semConexaoParaSalvar)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(a.salvarAlteracoes));
    expect(props.onEnviar).not.toHaveBeenCalled();
  });

  it('erro de campo e erro geral mantêm o rascunho', async () => {
    await render(
      <FormularioDeAnuncio
        {...formulario({
          erros: { titulo: 'Título muito curto.', geral: 'Algo deu errado.' },
        })}
      />,
    );
    expect(screen.getByText('Título muito curto.')).toBeOnTheScreen();
    expect(screen.getByText('Algo deu errado.')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Pintar sala')).toBeOnTheScreen();
  });

  it('carregando: mostra o esqueleto e nenhum campo', async () => {
    await render(
      <FormularioDeAnuncio {...formulario({}, { situacao: 'carregando' })} />,
    );
    expect(screen.getByLabelText(textos.gerais.carregando)).toBeOnTheScreen();
    expect(screen.queryByLabelText(t.titulo)).toBeNull();
    expect(screen.queryByText(a.salvarAlteracoes)).toBeNull();
  });

  it('erro ao carregar: mostra "Tentar de novo"', async () => {
    const ed = edicao({ situacao: 'erro' });
    await render(<FormularioDeAnuncio {...formulario({ edicao: ed })} />);
    expect(screen.getByText(a.erroAoCarregar)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(textos.gerais.tentarDeNovo));
    expect(ed.onTentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it('não encontrado: mostra a mensagem e volta', async () => {
    const props = formulario({}, { situacao: 'nao_encontrado' });
    await render(<FormularioDeAnuncio {...props} />);
    expect(screen.getByText(textos.erros.nao_encontrado)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(textos.gerais.voltar));
    expect(props.onVoltar).toHaveBeenCalled();
  });

  it('conflito: aviso com "Ver versão atual" e "Cancelar"', async () => {
    const ed = edicao({ conflito: true });
    await render(<FormularioDeAnuncio {...formulario({ edicao: ed })} />);
    expect(screen.getByText(a.conflito)).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Pintar sala')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(a.verVersaoAtual));
    expect(ed.onVerVersaoAtual).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText(a.dispensarConflito));
    expect(ed.onDispensarConflito).toHaveBeenCalledTimes(1);
  });

  it('não editável: aviso, campos e botão desabilitados', async () => {
    const props = formulario({}, { naoEditavel: true });
    await render(<FormularioDeAnuncio {...props} />);
    expect(screen.getByText(a.naoEditavel)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.titulo).props.editable).toBe(false);
    expect(screen.getByLabelText(t.descricao).props.editable).toBe(false);
    expect(screen.getByLabelText(t.prazo).props.editable).toBe(false);
    await fireEvent.press(screen.getByText(a.salvarAlteracoes));
    expect(props.onEnviar).not.toHaveBeenCalled();
  });

  it('descarte: pergunta e chama "Descartar" e "Continuar editando"', async () => {
    const ed = edicao({ descartarVisivel: true });
    await render(<FormularioDeAnuncio {...formulario({ edicao: ed })} />);
    expect(screen.getByText(a.descartarTitulo)).toBeOnTheScreen();
    expect(screen.getByText(a.descartarTexto)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(a.descartar));
    expect(ed.onDescartar).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText(a.continuarEditando));
    expect(ed.onContinuarEditando).toHaveBeenCalledTimes(1);
  });

  it('descarte fechado: o diálogo não aparece', async () => {
    await render(<FormularioDeAnuncio {...formulario()} />);
    expect(screen.queryByText(a.descartarTitulo)).toBeNull();
  });
});
