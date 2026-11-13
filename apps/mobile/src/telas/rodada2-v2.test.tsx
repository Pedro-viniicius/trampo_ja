// Rodada 2 da revisão da V2a (D3 a D8, D11, R2, R7): só pela tela, com props.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CartaoDeAnuncio } from '../componentes';
import { DICAS } from '../textos/dicas';
import { textos } from '../textos/pt-BR';
import type { Estado, MeuAnuncioParaExibir } from './index';
import { InicioDoContratante, LeituraDeDica, MeusAnuncios } from './index';

const noop = () => undefined;
const ok = <T,>(dados: T): Estado<T> => ({ situacao: 'ok', dados });

function demanda(
  id: string,
  status: MeuAnuncioParaExibir['status'],
  interessados: number,
  prazoFormatado?: string | null,
): MeuAnuncioParaExibir {
  return {
    tipo: 'trampo',
    id,
    titulo: `Demanda ${id}`,
    categoria: 'Eventos',
    cidade: 'Lavras',
    valorFormatado: 'R$ 150,00',
    dataFormatada: '10/11/2026',
    prazoFormatado,
    status,
    interessados,
  };
}

describe('D4/D64: cartão de demanda em Demandas', () => {
  async function renderizar(
    itens: MeuAnuncioParaExibir[],
    props: Partial<Parameters<typeof MeusAnuncios>[0]> = {},
  ) {
    await render(
      <MeusAnuncios
        tipo="trampo"
        segmentada
        lista={ok(itens)}
        onAbrirItem={noop}
        onPublicar={noop}
        {...props}
      />,
    );
  }

  it('mostra "Criada em", prazo e "Ver candidatos (n)" com interessados', async () => {
    const onVerCandidatos = jest.fn();
    const item = demanda('a1', 'aberto', 3, '25/11/2026');
    await renderizar([item], { onVerCandidatos });
    expect(
      screen.getByText(textos.demandas.criadaEm('10/11/2026')),
    ).toBeOnTheScreen();
    expect(screen.getByText('25/11/2026')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Ver candidatos de Demanda a1' }),
    );
    expect(onVerCandidatos).toHaveBeenCalledWith(item);
    expect(screen.getByText('Ver candidatos (3)')).toBeOnTheScreen();
  });

  it('sem prazo, diz "Sem prazo definido"', async () => {
    await renderizar([demanda('a1', 'aberto', 1, null)]);
    expect(screen.getByText(textos.detalheTrampo.semPrazo)).toBeOnTheScreen();
  });

  it('sem interessados, o botão é "Editar" (só com onEditar)', async () => {
    const onEditar = jest.fn();
    const item = demanda('a1', 'aberto', 0, null);
    await renderizar([item], { onEditar });
    await fireEvent.press(
      screen.getByRole('button', { name: 'Editar Demanda a1' }),
    );
    expect(onEditar).toHaveBeenCalledWith(item);
    expect(screen.queryByText(/Ver candidatos/)).toBeNull();
  });

  it('sem os callbacks novos, não há botão e o cartão ainda abre o detalhe', async () => {
    const onAbrirItem = jest.fn();
    const item = demanda('a1', 'aberto', 2, null);
    await renderizar([item], { onAbrirItem });
    expect(screen.queryByText(/Ver candidatos/)).toBeNull();
    await fireEvent.press(screen.getByText('Demanda a1'));
    expect(onAbrirItem).toHaveBeenCalledWith(item);
  });

  it('em andamento, o botão de apoio leva aos candidatos', async () => {
    const onVerCandidatos = jest.fn();
    await renderizar([demanda('e1', 'em_andamento', 1, null)], {
      onVerCandidatos,
      abaInicial: 'em_andamento',
    });
    await fireEvent.press(screen.getByText('Ver candidatos (1)'));
    expect(onVerCandidatos).toHaveBeenCalledTimes(1);
  });

  it('Meus serviços (sem abas) segue com o cartão de anúncio', async () => {
    await render(
      <MeusAnuncios
        tipo="servico"
        lista={ok([{ ...demanda('s1', 'ativo', 0), tipo: 'servico' }])}
        onAbrirItem={noop}
        onPublicar={noop}
      />,
    );
    expect(screen.queryByText(/Criada em/)).toBeNull();
  });
});

describe('D5: o ícone de calendário mostra só o prazo', () => {
  const base = {
    titulo: 'Pintar a sala',
    categoria: 'Reformas',
    cidade: 'Lavras',
    valorFormatado: 'R$ 100,00',
    dataFormatada: '10/11/2026 09:00',
    onPress: noop,
  };

  it('trampo com prazo: prazo à parte e data com "Publicado em" no rótulo', async () => {
    await render(
      <CartaoDeAnuncio tipo="trampo" prazoFormatado="25/11/2026" {...base} />,
    );
    expect(screen.getByText('25/11/2026')).toBeOnTheScreen();
    expect(screen.getByText('10/11/2026 09:00')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /Publicado em 10\/11\/2026 09:00/ }),
    ).toBeOnTheScreen();
  });

  it('trampo sem prazo: "Sem prazo definido"', async () => {
    await render(
      <CartaoDeAnuncio tipo="trampo" prazoFormatado={null} {...base} />,
    );
    expect(screen.getByText(textos.detalheTrampo.semPrazo)).toBeOnTheScreen();
  });

  it('prazo desconhecido (undefined): sem linha de prazo nem no rótulo', async () => {
    await render(<CartaoDeAnuncio tipo="trampo" {...base} />);
    expect(screen.queryByText(textos.detalheTrampo.semPrazo)).toBeNull();
    expect(
      screen.getByRole('button', { name: /Publicado em 10\/11\/2026 09:00/ }),
    ).not.toHaveAccessibleName(/prazo/i);
  });

  it('serviço não tem linha de prazo', async () => {
    await render(<CartaoDeAnuncio tipo="servico" {...base} />);
    expect(screen.queryByText(textos.detalheTrampo.semPrazo)).toBeNull();
  });
});

describe('R2: dois vazios no Início do contratante', () => {
  const vazio = { situacao: 'vazio' } as const;
  const props = {
    nome: 'Bar',
    onNovaDemanda: noop,
    onVerDemandas: noop,
    onVerCandidatos: noop,
  };

  it('nunca publicou: "Você ainda não publicou demandas" e "Publicar demanda"', async () => {
    await render(<InicioDoContratante {...props} demandas={vazio} />);
    expect(
      screen.getByText(textos.inicioContratante.semDemandas),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.demandas.publicar }),
    ).toBeOnTheScreen();
  });

  it('tem demandas, nenhuma aberta: "Nenhuma demanda aberta"', async () => {
    await render(
      <InicioDoContratante {...props} demandas={vazio} temDemandas />,
    );
    expect(screen.getByText(textos.demandas.vazioAbertas)).toBeOnTheScreen();
    expect(screen.queryByText(textos.inicioContratante.semDemandas)).toBeNull();
  });
});

describe('D8: leitura da dica', () => {
  it('o título completo vai no corpo, como título; o cabeçalho é curto', async () => {
    const dica = DICAS[0];
    if (!dica) throw new Error('Sem dicas.');
    await render(<LeituraDeDica dica={dica} onVoltar={noop} />);
    expect(screen.getByText(textos.dicas.titulo)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: dica.titulo })).toBeOnTheScreen();
  });
});

describe('D7: textos do contratante dizem "demanda"', () => {
  it('nenhum texto exclusivo do autor fala em trampo', () => {
    const a = textos.anuncio;
    for (const t of [
      a.excluirTrampo,
      a.excluirTrampoTitulo,
      a.trampoExcluido,
      a.trampoEncerrado,
      a.motivoEditarComCandidaturas,
      a.motivoEditarEmAndamento,
      a.motivoEditarEncerrado,
      a.motivoExcluirNaoAberto,
      a.encerrarTrampo,
      a.encerrarTitulo,
    ]) {
      expect(t).toMatch(/demanda/i);
      expect(t).not.toMatch(/trampo/i);
    }
    expect(
      textos.conversas.abrirTrampoDaFaixa('X', 'Aceita', 'R$ 1,00'),
    ).not.toMatch(/trampo/i);
  });
});

describe('D63: "+" em Meus serviços', () => {
  const servico: MeuAnuncioParaExibir = {
    tipo: 'servico',
    id: 's1',
    titulo: 'Faço bolos',
    categoria: 'Culinária',
    cidade: 'Lavras',
    valorFormatado: 'R$ 50,00',
    dataFormatada: '10/11/2026',
    status: 'ativo',
  };
  it.each([
    ['com itens', [servico]],
    ['sem itens', []],
  ])('aparece %s e chama o callback', async (_nome, itens) => {
    const onPublicar = jest.fn();
    await render(
      <MeusAnuncios
        tipo="servico"
        lista={itens.length ? ok(itens) : { situacao: 'vazio' }}
        onAbrirItem={noop}
        onPublicar={onPublicar}
        onVoltar={noop}
      />,
    );
    const botoes = screen.getAllByRole('button', {
      name: textos.meusAnuncios.ofertarServico,
    });
    await fireEvent.press(botoes[0] as (typeof botoes)[number]);
    expect(onPublicar).toHaveBeenCalledTimes(1);
  });
});
