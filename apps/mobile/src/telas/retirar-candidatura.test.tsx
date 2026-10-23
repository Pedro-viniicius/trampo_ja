import { fireEvent, render, screen } from '@testing-library/react-native';
import { textos } from '../textos/pt-BR';
import { MinhasCandidaturas } from './MinhasCandidaturas';
import { RodapeDoTrampo } from './RodapeDoTrampo';
import type {
  FolhaDeCandidatura,
  MinhaCandidaturaParaExibir,
  PropsDasMinhasCandidaturas,
} from './tipos';

const noop = () => undefined;

function item(
  extra: Partial<MinhaCandidaturaParaExibir> = {},
): MinhaCandidaturaParaExibir {
  return {
    id: 'c1',
    trampoId: 't1',
    tituloDoTrampo: 'Pintar muro',
    valorPropostoFormatado: 'R$ 100,00',
    dataFormatada: '10/10/2026',
    status: 'pendente',
    podeRetirar: true,
    ...extra,
  };
}

function lista(
  itens: MinhaCandidaturaParaExibir[],
  extra: Partial<PropsDasMinhasCandidaturas> = {},
) {
  return (
    <MinhasCandidaturas
      lista={{ situacao: 'ok', dados: itens }}
      onAbrirTrampo={noop}
      onBuscarTrampos={noop}
      onVoltar={noop}
      onRetirar={noop}
      {...extra}
    />
  );
}

const folha: FolhaDeCandidatura = {
  visivel: false,
  mensagem: '',
  valor: '',
  erros: {},
  enviando: false,
  perfilIncompleto: null,
  onMudarMensagem: noop,
  onMudarValor: noop,
  onSairDoValor: noop,
  onEnviar: noop,
  onFechar: noop,
  onCompletarPerfil: noop,
};

function rodape(
  status: 'pendente' | 'aceita' | 'recusada',
  retirar?: {
    retirando: boolean;
    motivo: string | null;
    onRetirar: () => void;
  },
) {
  return (
    <RodapeDoTrampo
      situacao={{ tipo: 'candidatado', status }}
      folha={folha}
      onCandidatar={noop}
      onVerCandidaturas={noop}
      retirar={retirar}
    />
  );
}

const botaoRetirar = () =>
  screen.getByRole('button', {
    name: textos.candidatura.retirarDe('Pintar muro'),
  });

describe('Minhas candidaturas: retirar', () => {
  it('sem as props novas, nada muda', async () => {
    await render(
      lista([item({ podeRetirar: undefined })], { onRetirar: undefined }),
    );
    expect(screen.queryByText(textos.candidatura.retirar)).toBeNull();
  });

  it('só a pendente mostra o botão', async () => {
    await render(
      lista([item(), item({ id: 'c2', status: 'aceita', podeRetirar: false })]),
    );
    expect(screen.getAllByText(textos.candidatura.retirar)).toHaveLength(1);
  });

  it('abre o diálogo e só retira ao confirmar', async () => {
    const onRetirar = jest.fn();
    await render(lista([item()], { onRetirar }));
    await fireEvent.press(botaoRetirar());
    expect(
      screen.getByText(textos.candidatura.retirarTitulo),
    ).toBeOnTheScreen();
    expect(onRetirar).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatura.retirar }),
    );
    expect(onRetirar).toHaveBeenCalledTimes(1);
    expect(onRetirar).toHaveBeenCalledWith('c1');
  });

  it('"Manter candidatura" fecha sem retirar', async () => {
    const onRetirar = jest.fn();
    await render(lista([item()], { onRetirar }));
    await fireEvent.press(botaoRetirar());
    await fireEvent.press(screen.getByText(textos.candidatura.manter));
    expect(onRetirar).not.toHaveBeenCalled();
  });

  it('retirando: mostra "Retirando…" e bloqueia as outras', async () => {
    await render(
      lista([item(), item({ id: 'c2', tituloDoTrampo: 'Outro' })], {
        retirando: 'c1',
      }),
    );
    expect(screen.getByText(textos.candidatura.retirando)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: textos.candidatura.retirarDe('Outro'),
      }),
    ).toBeDisabled();
  });

  it('mostra o aviso', async () => {
    await render(lista([item()], { aviso: textos.candidatura.respondida }));
    expect(screen.getByText(textos.candidatura.respondida)).toBeOnTheScreen();
  });

  it('mostra o toast e o fecha', async () => {
    const onFecharToast = jest.fn();
    await render(
      lista([item()], { toast: textos.candidatura.retirada, onFecharToast }),
    );
    expect(screen.getByText(textos.candidatura.retirada)).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(textos.gerais.toastFechar));
    expect(onFecharToast).toHaveBeenCalled();
  });

  it('sem conexão: desabilita e explica', async () => {
    await render(lista([item()], { semConexao: true }));
    expect(botaoRetirar()).toBeDisabled();
    expect(
      screen.getByText(textos.candidatura.semConexaoMotivo),
    ).toBeOnTheScreen();
  });
});

describe('Rodapé do trampo: retirar', () => {
  it('sem a prop, não mostra o botão', async () => {
    await render(rodape('pendente'));
    expect(screen.queryByText(textos.candidatura.retirar)).toBeNull();
  });

  it('candidatura respondida não mostra o botão', async () => {
    await render(
      rodape('aceita', { retirando: false, motivo: null, onRetirar: noop }),
    );
    expect(screen.queryByText(textos.candidatura.retirar)).toBeNull();
  });

  it('pendente: diálogo e confirmação chamam onRetirar uma vez', async () => {
    const onRetirar = jest.fn();
    await render(
      rodape('pendente', { retirando: false, motivo: null, onRetirar }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatura.retirar }),
    );
    expect(onRetirar).not.toHaveBeenCalled();
    expect(
      screen.getByText(textos.candidatura.retirarTitulo),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(textos.candidatura.manter));
    expect(onRetirar).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.candidatura.retirar }),
    );
    await fireEvent.press(
      screen
        .getAllByRole('button', { name: textos.candidatura.retirar })
        .at(-1) as never,
    );
    expect(onRetirar).toHaveBeenCalledTimes(1);
  });

  it('retirando: mostra "Retirando…"', async () => {
    await render(
      rodape('pendente', { retirando: true, motivo: null, onRetirar: noop }),
    );
    expect(screen.getByText(textos.candidatura.retirando)).toBeOnTheScreen();
  });

  it('com motivo: desabilita e mostra o texto', async () => {
    await render(
      rodape('pendente', {
        retirando: false,
        motivo: textos.candidatura.semConexaoMotivo,
        onRetirar: noop,
      }),
    );
    expect(
      screen.getByRole('button', { name: textos.candidatura.retirar }),
    ).toBeDisabled();
    expect(
      screen.getByText(textos.candidatura.semConexaoMotivo),
    ).toBeOnTheScreen();
  });
});
