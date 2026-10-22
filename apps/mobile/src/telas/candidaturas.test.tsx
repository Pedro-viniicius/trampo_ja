import { fireEvent, render, screen } from '@testing-library/react-native';
import { textos } from '../textos/pt-BR';
import { CandidaturasRecebidas } from './CandidaturasRecebidas';
import { MeusAnuncios } from './MeusAnuncios';
import { MinhasCandidaturas } from './MinhasCandidaturas';
import { RodapeDoTrampo } from './RodapeDoTrampo';
import type {
  CandidaturaParaExibir,
  FolhaDeCandidatura,
  MeuAnuncioParaExibir,
  MinhaCandidaturaParaExibir,
  SituacaoDoRodape,
} from './tipos';

const noop = () => undefined;
const ok = <T,>(dados: T) => ({ situacao: 'ok', dados }) as const;

function folha(extra: Partial<FolhaDeCandidatura> = {}): FolhaDeCandidatura {
  return {
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
    ...extra,
  };
}

function rodape(
  situacao: SituacaoDoRodape,
  extra: Partial<Parameters<typeof RodapeDoTrampo>[0]> = {},
) {
  return (
    <RodapeDoTrampo
      situacao={situacao}
      folha={folha()}
      onCandidatar={noop}
      onVerCandidaturas={noop}
      {...extra}
    />
  );
}

describe('RodapeDoTrampo', () => {
  it('carregando: esqueleto anunciado', async () => {
    await render(rodape({ tipo: 'carregando' }));
    expect(screen.getByLabelText(textos.gerais.carregando)).toBeOnTheScreen();
  });

  it('fechado: botão desabilitado e motivo', async () => {
    const onCandidatar = jest.fn();
    await render(rodape({ tipo: 'fechado' }, { onCandidatar }));
    expect(screen.getByText(textos.detalheTrampo.fechado)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.detalheTrampo.candidatar }),
    );
    expect(onCandidatar).not.toHaveBeenCalled();
  });

  it('candidatar: chama onCandidatar; sem conexão desabilita com motivo', async () => {
    const onCandidatar = jest.fn();
    const { rerender } = await render(
      rodape({ tipo: 'candidatar' }, { onCandidatar }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.detalheTrampo.candidatar }),
    );
    expect(onCandidatar).toHaveBeenCalledTimes(1);
    await rerender(
      rodape({ tipo: 'candidatar' }, { onCandidatar, semConexao: true }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.detalheTrampo.candidatar }),
    );
    expect(onCandidatar).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(textos.candidatar.semConexaoMotivo),
    ).toBeOnTheScreen();
  });

  it('autor: com e sem quantidade', async () => {
    const onVerCandidaturas = jest.fn();
    const { rerender } = await render(
      rodape({ tipo: 'autor', quantidade: 3 }, { onVerCandidaturas }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Ver candidaturas (3)' }),
    );
    expect(onVerCandidaturas).toHaveBeenCalledTimes(1);
    await rerender(rodape({ tipo: 'autor', quantidade: null }));
    expect(
      screen.getByRole('button', { name: 'Ver candidaturas' }),
    ).toBeOnTheScreen();
  });

  it('candidatado: selo por status e "Conversar" só se houver callback', async () => {
    const onConversar = jest.fn();
    const { rerender } = await render(
      rodape({ tipo: 'candidatado', status: 'pendente' }),
    );
    expect(
      screen.getByText(textos.detalheTrampo.jaCandidatou),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', {
        name: textos.candidaturasRecebidas.conversar,
      }),
    ).toBeNull();
    await rerender(
      rodape({ tipo: 'candidatado', status: 'aceita' }, { onConversar }),
    );
    expect(screen.getByText(textos.selos.aceita)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.conversar,
      }),
    );
    expect(onConversar).toHaveBeenCalledTimes(1);
  });

  it('candidatado: motivo do conversar desabilita o botão', async () => {
    await render(
      rodape(
        { tipo: 'candidatado', status: 'aceita' },
        {
          onConversar: jest.fn(),
          estadoDoConversar: { abrindo: false, motivo: 'motivo-sentinela' },
        },
      ),
    );
    expect(screen.getByText('motivo-sentinela')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.conversar,
      }),
    ).toBeDisabled();
  });

  describe('folha de candidatura', () => {
    it('fechada não mostra os campos', async () => {
      await render(rodape({ tipo: 'candidatar' }));
      expect(screen.queryByText(textos.candidatar.mensagem)).toBeNull();
    });

    it('aberta: avisa quem vê nome, mensagem e valor (LGPD)', async () => {
      await render(
        rodape({ tipo: 'candidatar' }, { folha: folha({ visivel: true }) }),
      );
      expect(
        screen.getByText(textos.candidatar.avisoVisibilidade),
      ).toBeOnTheScreen();
    });

    it('aberta: campos, contador, ajuda, enviar e fechar', async () => {
      const onEnviar = jest.fn();
      const onFechar = jest.fn();
      const onMudarMensagem = jest.fn();
      await render(
        rodape(
          { tipo: 'candidatar' },
          {
            folha: folha({
              visivel: true,
              mensagem: 'Olá',
              onEnviar,
              onFechar,
              onMudarMensagem,
            }),
          },
        ),
      );
      expect(screen.getByText('3 de 2000 caracteres')).toBeOnTheScreen();
      expect(screen.getByText(textos.gerais.ajudaValor)).toBeOnTheScreen();
      await fireEvent.changeText(
        screen.getByLabelText(textos.candidatar.mensagem),
        'Oi',
      );
      expect(onMudarMensagem).toHaveBeenCalledWith('Oi');
      await fireEvent.press(
        screen.getByRole('button', { name: textos.candidatar.enviar }),
      );
      await fireEvent.press(
        screen.getByRole('button', { name: textos.candidatar.fecharFolha }),
      );
      expect(onEnviar).toHaveBeenCalledTimes(1);
      expect(onFechar).toHaveBeenCalledTimes(1);
    });

    it('mostra erros por campo e geral', async () => {
      await render(
        rodape(
          { tipo: 'candidatar' },
          {
            folha: folha({
              visivel: true,
              erros: {
                mensagem: textos.erros.mensagem_obrigatoria,
                valor: textos.erros.valor_proposto_invalido,
                geral: textos.erros.erro_servidor,
              },
            }),
          },
        ),
      );
      expect(
        screen.getByText(textos.erros.mensagem_obrigatoria),
      ).toBeOnTheScreen();
      expect(
        screen.getByText(textos.erros.valor_proposto_invalido),
      ).toBeOnTheScreen();
      expect(screen.getByText(textos.erros.erro_servidor)).toBeOnTheScreen();
    });

    it('perfil incompleto: aviso D9 no lugar do botão', async () => {
      const onCompletarPerfil = jest.fn();
      await render(
        rodape(
          { tipo: 'candidatar' },
          {
            folha: folha({
              visivel: true,
              perfilIncompleto: { falta: ['cidade'] },
              onCompletarPerfil,
            }),
          },
        ),
      );
      expect(
        screen.getByText(textos.avisoPerfil.mensagem(['cidade'])),
      ).toBeOnTheScreen();
      expect(
        screen.queryByRole('button', { name: textos.candidatar.enviar }),
      ).toBeNull();
      await fireEvent.press(
        screen.getByRole('button', { name: textos.avisoPerfil.completar }),
      );
      expect(onCompletarPerfil).toHaveBeenCalledTimes(1);
    });

    it('enviando: mostra "Enviando…" e não dispara de novo', async () => {
      const onEnviar = jest.fn();
      await render(
        rodape(
          { tipo: 'candidatar' },
          { folha: folha({ visivel: true, enviando: true, onEnviar }) },
        ),
      );
      await fireEvent.press(
        screen.getByRole('button', { name: textos.candidatar.enviando }),
      );
      expect(onEnviar).not.toHaveBeenCalled();
    });
  });
});

const candidatura = (
  extra: Partial<CandidaturaParaExibir> = {},
): CandidaturaParaExibir => ({
  id: 'c1',
  contaId: 'a1',
  nome: 'Maria Souza',
  valorPropostoFormatado: 'R$ 150,00',
  mensagem: 'Posso começar amanhã.',
  dataFormatada: '20/10/2026',
  status: 'pendente',
  podeAceitar: true,
  ...extra,
});

function recebidas(
  extra: Partial<Parameters<typeof CandidaturasRecebidas>[0]> = {},
) {
  return (
    <CandidaturasRecebidas
      trampo={ok({ titulo: 'Pintar a sala', status: 'aberto' as const })}
      lista={ok([candidatura(), candidatura({ id: 'c2', nome: 'João' })])}
      aceitando={null}
      toast={null}
      onAceitar={noop}
      onAbrirPerfil={noop}
      onFecharToast={noop}
      onVoltar={noop}
      {...extra}
    />
  );
}

describe('CandidaturasRecebidas', () => {
  it('mostra título do trampo, selo e as candidaturas', async () => {
    await render(recebidas());
    expect(screen.getByText('Pintar a sala')).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.aberto)).toBeOnTheScreen();
    expect(screen.getByText('Maria Souza')).toBeOnTheScreen();
    expect(screen.getByText('João')).toBeOnTheScreen();
  });

  it('sem conexão: o motivo aparece abaixo do botão desabilitado de cada cartão', async () => {
    await render(recebidas({ semConexao: true }));
    expect(
      screen.getAllByText(textos.candidaturasRecebidas.semConexaoMotivo).length,
    ).toBeGreaterThan(0);
  });

  it('só chama onAceitar depois de confirmar', async () => {
    const onAceitar = jest.fn();
    await render(recebidas({ onAceitar }));
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.aceitarDe('Maria Souza'),
      }),
    );
    expect(screen.getByText('Aceitar Maria Souza?')).toBeOnTheScreen();
    expect(
      screen.getByText(textos.candidaturasRecebidas.confirmarTexto),
    ).toBeOnTheScreen();
    expect(onAceitar).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.confirmar,
      }),
    );
    expect(onAceitar).toHaveBeenCalledWith('c1');
  });

  it('cancelar não chama onAceitar', async () => {
    const onAceitar = jest.fn();
    await render(recebidas({ onAceitar }));
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.aceitarDe('Maria Souza'),
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.cancelar,
      }),
    );
    expect(onAceitar).not.toHaveBeenCalled();
  });

  it('aceitando desabilita os outros "Aceitar"', async () => {
    const onAceitar = jest.fn();
    await render(recebidas({ aceitando: 'c1', onAceitar }));
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.aceitarDe('João'),
      }),
    );
    expect(screen.queryByText('Aceitar Maria Souza?')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.aceitando,
      }),
    ).toBeOnTheScreen();
  });

  it('mostra o erro do aceite', async () => {
    await render(recebidas({ erroDoAceite: textos.erros.conflito_de_versao }));
    expect(screen.getByText(textos.erros.conflito_de_versao)).toBeOnTheScreen();
  });

  it('vazio', async () => {
    await render(recebidas({ lista: { situacao: 'vazio' } }));
    expect(
      screen.getByText(textos.candidaturasRecebidas.vazio),
    ).toBeOnTheScreen();
  });

  it('trampo em andamento mostra aviso', async () => {
    await render(
      recebidas({
        trampo: ok({
          titulo: 'Pintar a sala',
          status: 'em_andamento' as const,
        }),
      }),
    );
    expect(
      screen.getByText(textos.candidaturasRecebidas.trampoEmAndamento),
    ).toBeOnTheScreen();
  });

  it('ver perfil e conversar (em qualquer status, D23)', async () => {
    const onAbrirPerfil = jest.fn();
    const onConversar = jest.fn();
    await render(
      recebidas({
        lista: ok([candidatura({ status: 'pendente' })]),
        onAbrirPerfil,
        onConversar,
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
    expect(onAbrirPerfil).toHaveBeenCalledWith('a1');
    expect(onConversar).toHaveBeenCalledWith('a1');
  });

  it('conversar: motivo por candidatura desabilita só aquele botão', async () => {
    const onConversar = jest.fn();
    await render(
      recebidas({
        onConversar,
        motivoDaConversa: { 'conta-2': 'motivo-sentinela' },
        lista: ok([
          candidatura({ contaId: 'conta-1' }),
          candidatura({ id: 'c2', contaId: 'conta-2', nome: 'João' }),
        ]),
      }),
    );
    expect(screen.getByText('motivo-sentinela')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom('João'),
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom('Maria Souza'),
      }),
    ).toBeEnabled();
  });

  it('conversar: desabilita o de quem está abrindo e mostra o erro', async () => {
    const onConversar = jest.fn();
    await render(
      recebidas({
        onConversar,
        abrindoConversaCom: 'conta-2',
        erroDaConversa: 'erro-conversa-sentinela',
        lista: ok([
          candidatura({ contaId: 'conta-1' }),
          candidatura({ id: 'c2', contaId: 'conta-2', nome: 'João' }),
        ]),
      }),
    );
    expect(screen.getByText('erro-conversa-sentinela')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.conversas.abrindo }),
    ).toBeDisabled();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturasRecebidas.conversarCom('Maria Souza'),
      }),
    );
    expect(onConversar).toHaveBeenCalledWith('conta-1');
  });

  it('toast', async () => {
    await render(
      recebidas({ toast: textos.candidaturasRecebidas.aceitaToast }),
    );
    expect(
      screen.getByText(textos.candidaturasRecebidas.aceitaToast),
    ).toBeOnTheScreen();
  });
});

const minha = (
  extra: Partial<MinhaCandidaturaParaExibir> = {},
): MinhaCandidaturaParaExibir => ({
  id: 'm1',
  trampoId: 't1',
  tituloDoTrampo: 'Pintar a sala',
  valorPropostoFormatado: 'R$ 150,00',
  dataFormatada: '20/10/2026',
  status: 'recusada',
  ...extra,
});

describe('MinhasCandidaturas', () => {
  it('lista, selo e abre o trampo', async () => {
    const onAbrirTrampo = jest.fn();
    await render(
      <MinhasCandidaturas
        lista={ok([minha(), minha({ id: 'm2', tituloDoTrampo: null })])}
        onAbrirTrampo={onAbrirTrampo}
        onBuscarTrampos={noop}
        onVoltar={noop}
      />,
    );
    expect(screen.getByText('Pintar a sala')).toBeOnTheScreen();
    expect(
      screen.getByText(textos.minhasCandidaturas.trampoIndisponivel),
    ).toBeOnTheScreen();
    expect(screen.getAllByText(textos.selos.recusada)).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText(/^Pintar a sala/));
    expect(onAbrirTrampo).toHaveBeenCalledWith('t1');
  });

  it('vazio com "Buscar trampos"', async () => {
    const onBuscarTrampos = jest.fn();
    await render(
      <MinhasCandidaturas
        lista={{ situacao: 'vazio' }}
        onAbrirTrampo={noop}
        onBuscarTrampos={onBuscarTrampos}
        onVoltar={noop}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.minhasCandidaturas.buscarTrampos,
      }),
    );
    expect(onBuscarTrampos).toHaveBeenCalledTimes(1);
  });
});

const anuncio = (
  extra: Partial<MeuAnuncioParaExibir> = {},
): MeuAnuncioParaExibir => ({
  tipo: 'trampo',
  id: 't1',
  titulo: 'Pintar a sala',
  categoria: 'Reformas e reparos',
  cidade: 'Lavras',
  valorFormatado: 'R$ 1.234,56',
  dataFormatada: '20/10/2026',
  status: 'aberto',
  ...extra,
});

describe('MeusAnuncios', () => {
  it('trampos: título, selo de status e abre o item', async () => {
    const onAbrirItem = jest.fn();
    await render(
      <MeusAnuncios
        tipo="trampo"
        lista={ok([
          anuncio(),
          anuncio({ id: 't2', titulo: 'Capinar', status: 'em_andamento' }),
        ])}
        onAbrirItem={onAbrirItem}
        onPublicar={noop}
        onVoltar={noop}
      />,
    );
    expect(
      screen.getByText(textos.meusAnuncios.tituloTrampos),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.aberto)).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.emAndamento)).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(/Pintar a sala/));
    expect(onAbrirItem).toHaveBeenCalledTimes(1);
  });

  it('serviços: título e selo "Ativo"', async () => {
    await render(
      <MeusAnuncios
        tipo="servico"
        lista={ok([
          anuncio({ tipo: 'servico', status: 'ativo', cidade: null }),
        ])}
        onAbrirItem={noop}
        onPublicar={noop}
        onVoltar={noop}
      />,
    );
    expect(
      screen.getByText(textos.meusAnuncios.tituloServicos),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.selos.ativo)).toBeOnTheScreen();
  });

  it.each([
    [
      'trampo',
      textos.meusAnuncios.vazioTrampos,
      textos.meusAnuncios.publicarTrampo,
    ],
    [
      'servico',
      textos.meusAnuncios.vazioServicos,
      textos.meusAnuncios.ofertarServico,
    ],
  ] as const)('vazio de %s com ação', async (tipo, titulo, acao) => {
    const onPublicar = jest.fn();
    await render(
      <MeusAnuncios
        tipo={tipo}
        lista={{ situacao: 'vazio' }}
        onAbrirItem={noop}
        onPublicar={onPublicar}
        onVoltar={noop}
      />,
    );
    expect(screen.getByText(titulo)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: acao }));
    expect(onPublicar).toHaveBeenCalledTimes(1);
  });
});
