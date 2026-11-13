// Etapa 5 da V2a (plano visual-v2): telas novas e props novas (CA78 a CA84),
// só pela tela, com props. A ligação nas rotas fica nas etapas 6 e 7.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CATEGORIAS_DAS_DICAS, DICAS, encontrarDica } from '../textos/dicas';
import { textos } from '../textos/pt-BR';
import type {
  DemandaParaExibir,
  Estado,
  ItemParaExibir,
  MeuAnuncioParaExibir,
  MinhaCandidaturaParaExibir,
  PropsDaBusca,
  PropsDeCadastro,
} from './index';
import {
  Buscar,
  Cadastro,
  CandidaturaEnviada,
  Dicas,
  InicioDoContratante,
  LeituraDeDica,
  MAXIMO_DE_DEMANDAS_NO_INICIO,
  MeusAnuncios,
  MinhasCandidaturas,
  Perfil,
  PerfilDaEmpresa,
  segmentoDaCandidatura,
} from './index';

const noop = () => undefined;
const ok = <T,>(dados: T): Estado<T> => ({ situacao: 'ok', dados });

/** Textos que o V2 não pode mostrar (CA83/CA85): sem dado na API. */
const PROIBIDOS = /ganho|extrato|faturamento|CNPJ|verificad|R\$ \d+ recebidos/i;

function textosNaTela(): string {
  return JSON.stringify(screen.toJSON());
}

// ---------------------------------------------------------------- CA78

function candidatura(
  id: string,
  status: MinhaCandidaturaParaExibir['status'],
  statusDoTrampo?: MinhaCandidaturaParaExibir['statusDoTrampo'],
): MinhaCandidaturaParaExibir {
  return {
    id,
    trampoId: `t-${id}`,
    tituloDoTrampo: `Trampo ${id}`,
    valorPropostoFormatado: 'R$ 100,00',
    dataFormatada: '10/11/2026',
    status,
    statusDoTrampo,
    autor: 'Bar do Zé',
    prazoFormatado: '20/11/2026',
    podeRetirar: status === 'pendente',
  };
}

const CANDIDATURAS = [
  candidatura('pendente', 'pendente', 'aberto'),
  candidatura('aceitaAndamento', 'aceita', 'em_andamento'),
  candidatura('aceitaEncerrado', 'aceita', 'encerrado'),
  candidatura('recusada', 'recusada', 'aberto'),
  candidatura('recusadaEncerrado', 'recusada', 'encerrado'),
];

describe('CA78: Meus trampos em segmentos', () => {
  it('cada candidatura cai em exatamente um segmento', () => {
    expect(CANDIDATURAS.map((c) => [c.id, segmentoDaCandidatura(c)])).toEqual([
      ['pendente', 'analise'],
      ['aceitaAndamento', 'confirmados'],
      ['aceitaEncerrado', 'encerrados'],
      ['recusada', 'encerrados'],
      ['recusadaEncerrado', 'encerrados'],
    ]);
    // Sem o status do trampo, a aceita fica em Confirmados (nunca some).
    expect(segmentoDaCandidatura({ status: 'aceita' })).toBe('confirmados');
  });

  async function renderizar(
    props: Partial<Parameters<typeof MinhasCandidaturas>[0]> = {},
  ) {
    await render(
      <MinhasCandidaturas
        segmentada
        lista={ok(CANDIDATURAS)}
        onAbrirTrampo={noop}
        onBuscarTrampos={noop}
        {...props}
      />,
    );
  }

  it('mostra título grande, sem voltar, e filtra pela aba escolhida', async () => {
    await renderizar();
    expect(screen.getByText(textos.meusTrampos.titulo)).toBeOnTheScreen();
    expect(screen.getByText(textos.meusTrampos.subtitulo)).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.gerais.voltar }),
    ).toBeNull();

    // Em análise (padrão): só a pendente.
    expect(screen.getByText('Trampo pendente')).toBeOnTheScreen();
    expect(screen.queryByText('Trampo aceitaAndamento')).toBeNull();

    await fireEvent.press(
      screen.getByRole('tab', {
        name: `${textos.meusTrampos.abaConfirmados}, 1`,
      }),
    );
    expect(screen.getByText('Trampo aceitaAndamento')).toBeOnTheScreen();
    expect(screen.queryByText('Trampo pendente')).toBeNull();

    await fireEvent.press(
      screen.getByRole('tab', { name: textos.meusTrampos.abaEncerrados }),
    );
    for (const id of ['aceitaEncerrado', 'recusada', 'recusadaEncerrado']) {
      expect(screen.getByText(`Trampo ${id}`)).toBeOnTheScreen();
    }
    expect(screen.queryByText('Trampo aceitaAndamento')).toBeNull();
  });

  it('mostra o autor e abre o trampo ao tocar no cartão', async () => {
    const abrir = jest.fn();
    await renderizar({ onAbrirTrampo: abrir });
    expect(
      screen.getByText(textos.meusTrampos.publicadoPor('Bar do Zé')),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Trampo pendente'));
    expect(abrir).toHaveBeenCalledWith('t-pendente');
  });

  it('"Mensagem" só na confirmada; "Retirar" só na pendente, com diálogo', async () => {
    const mensagem = jest.fn();
    const retirar = jest.fn();
    await renderizar({ onMensagem: mensagem, onRetirar: retirar });
    expect(screen.queryByRole('button', { name: /Mensagem para/ })).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidatura.retirarDe('Trampo pendente'),
      }),
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.candidatura.retirar }),
    );
    expect(retirar).toHaveBeenCalledWith('pendente');

    await fireEvent.press(
      screen.getByRole('tab', {
        name: `${textos.meusTrampos.abaConfirmados}, 1`,
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.meusTrampos.mensagemPara('Bar do Zé'),
      }),
    );
    expect(mensagem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aceitaAndamento' }),
    );
  });

  it('cada aba tem o próprio vazio', async () => {
    const buscar = jest.fn();
    await renderizar({ lista: ok([]), onBuscarTrampos: buscar });
    expect(screen.getByText(textos.meusTrampos.vazioAnalise)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.meusTrampos.verTrampos }),
    );
    expect(buscar).toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole('tab', {
        name: `${textos.meusTrampos.abaConfirmados}, 0`,
      }),
    );
    expect(
      screen.getByText(textos.meusTrampos.vazioConfirmados),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('tab', { name: textos.meusTrampos.abaEncerrados }),
    );
    expect(
      screen.getByText(textos.meusTrampos.vazioEncerrados),
    ).toBeOnTheScreen();
  });

  it('carregando e erro', async () => {
    await renderizar({ lista: { situacao: 'carregando' } });
    expect(screen.getByLabelText(textos.gerais.carregando)).toBeOnTheScreen();
    const tentar = jest.fn();
    await renderizar({
      lista: {
        situacao: 'erro',
        mensagem: textos.erros.erro_servidor,
        onTentarDeNovo: tentar,
      },
    });
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(tentar).toHaveBeenCalled();
  });

  it('sem `segmentada`, a lista continua única (rotas atuais)', async () => {
    await render(
      <MinhasCandidaturas
        lista={ok(CANDIDATURAS)}
        onAbrirTrampo={noop}
        onBuscarTrampos={noop}
        onVoltar={noop}
      />,
    );
    expect(screen.queryByRole('tab')).toBeNull();
    expect(
      screen.getByText(textos.minhasCandidaturas.titulo),
    ).toBeOnTheScreen();
    for (const c of CANDIDATURAS) {
      expect(screen.getByText(`Trampo ${c.id}`)).toBeOnTheScreen();
    }
  });
});

// ---------------------------------------------------------------- CA79

function demanda(
  id: string,
  status: MeuAnuncioParaExibir['status'],
): MeuAnuncioParaExibir {
  return {
    tipo: 'trampo',
    id,
    titulo: `Demanda ${id}`,
    categoria: 'Eventos',
    cidade: 'Lavras',
    valorFormatado: 'R$ 150,00',
    dataFormatada: '10/11/2026',
    status,
    interessados: 2,
  };
}

describe('CA79: Demandas com abas', () => {
  const lista = ok([
    demanda('a1', 'aberto'),
    demanda('a2', 'aberto'),
    demanda('e1', 'em_andamento'),
  ]);

  async function renderizar(
    props: Partial<Parameters<typeof MeusAnuncios>[0]> = {},
  ) {
    await render(
      <MeusAnuncios
        tipo="trampo"
        segmentada
        lista={lista}
        onAbrirItem={noop}
        onPublicar={noop}
        {...props}
      />,
    );
  }

  it('filtra as páginas carregadas pelo status de cada aba', async () => {
    await renderizar();
    expect(screen.getByText(textos.demandas.titulo)).toBeOnTheScreen();
    expect(screen.getByText('Demanda a1')).toBeOnTheScreen();
    expect(screen.getByText('Demanda a2')).toBeOnTheScreen();
    expect(screen.queryByText('Demanda e1')).toBeNull();
    expect(
      screen.getAllByText(textos.inicioContratante.interessados(2)),
    ).toHaveLength(2);

    await fireEvent.press(
      screen.getByRole('tab', { name: textos.demandas.abaAndamento }),
    );
    expect(screen.getByText('Demanda e1')).toBeOnTheScreen();
    expect(screen.queryByText('Demanda a1')).toBeNull();

    await fireEvent.press(
      screen.getByRole('tab', { name: textos.demandas.abaEncerradas }),
    );
    expect(screen.getByText(textos.demandas.vazioEncerradas)).toBeOnTheScreen();
  });

  it('"Carregar mais" fica visível em toda aba enquanto houver página', async () => {
    const carregar = jest.fn();
    await renderizar({
      carregarMais: { carregando: false, onCarregarMais: carregar },
    });
    for (const aba of [
      textos.demandas.abaAbertas,
      textos.demandas.abaAndamento,
      textos.demandas.abaEncerradas,
    ]) {
      await fireEvent.press(screen.getByRole('tab', { name: aba }));
      await fireEvent.press(
        screen.getByRole('button', { name: textos.gerais.carregarMais }),
      );
    }
    expect(carregar).toHaveBeenCalledTimes(3);
  });

  it('o "+" do topo chama `onPublicar` (abre /trampos/novo)', async () => {
    const publicar = jest.fn();
    await renderizar({ onPublicar: publicar });
    await fireEvent.press(
      screen.getByRole('button', { name: textos.demandas.nova }),
    );
    expect(publicar).toHaveBeenCalledTimes(1);
  });

  it('serviços (Meus serviços) continuam sem abas, mesmo com `segmentada`', async () => {
    await renderizar({
      tipo: 'servico',
      lista: ok([{ ...demanda('s1', 'ativo'), tipo: 'servico' }]),
      onVoltar: noop,
    });
    expect(screen.queryByRole('tab')).toBeNull();
    expect(
      screen.getByText(textos.meusAnuncios.tituloServicos),
    ).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------- CA80

describe('CA80: Candidatura enviada', () => {
  it('mostra título, autor, prazo, valor e os passos; as ações navegam', async () => {
    const verMeus = jest.fn();
    const buscarMais = jest.fn();
    const voltar = jest.fn();
    await render(
      <CandidaturaEnviada
        resumo={{
          titulo: 'Atendente de balcão',
          autor: 'Pizzaria BiLo',
          prazoFormatado: '20/11/2026',
          valorFormatado: 'R$ 120,00',
        }}
        onVerMeusTrampos={verMeus}
        onBuscarMais={buscarMais}
        onVoltar={voltar}
      />,
    );
    expect(
      screen.getByRole('header', { name: textos.candidaturaEnviada.titulo }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.candidaturaEnviada.texto('Pizzaria BiLo')),
    ).toBeOnTheScreen();
    expect(screen.getByText('Atendente de balcão')).toBeOnTheScreen();
    expect(screen.getByText(/20\/11\/2026/)).toBeOnTheScreen();
    expect(screen.getByText('R$ 120,00')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        textos.candidaturaEnviada.passo(
          2,
          textos.candidaturaEnviada.passos.emAnalise,
        ),
      ),
    ).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturaEnviada.verMeusTrampos,
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidaturaEnviada.buscarMais,
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    expect(verMeus).toHaveBeenCalledTimes(1);
    expect(buscarMais).toHaveBeenCalledTimes(1);
    expect(voltar).toHaveBeenCalledTimes(1);
  });

  it('sem dados no cache, mostra só o título e os passos', async () => {
    await render(
      <CandidaturaEnviada
        resumo={null}
        onVerMeusTrampos={noop}
        onBuscarMais={noop}
      />,
    );
    expect(
      screen.getByText(textos.candidaturaEnviada.titulo),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.candidaturaEnviada.textoSemAutor),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        textos.candidaturaEnviada.passo(
          2,
          textos.candidaturaEnviada.passos.emAnalise,
        ),
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/R\$/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.gerais.voltar }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------- CA81

describe('CA81: Dicas & minicursos, sem rede', () => {
  const fetchOriginal = globalThis.fetch;
  const fetchEspiao = jest.fn();
  beforeEach(() => {
    fetchEspiao.mockReset();
    globalThis.fetch = fetchEspiao as unknown as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = fetchOriginal;
  });

  it('o conteúdo é local e coerente: ids únicos, categorias válidas, todas com conteúdo', () => {
    const ids = DICAS.map((dica) => dica.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const dica of DICAS) {
      expect(Object.keys(textos.dicas.categoria)).toContain(dica.categoria);
      expect(dica.paragrafos.length).toBeGreaterThan(0);
      expect(dica.lembrar.length).toBeGreaterThan(0);
      expect(dica.minutos).toBeGreaterThan(0);
      expect(encontrarDica(dica.id)).toBe(dica);
    }
    for (const categoria of CATEGORIAS_DAS_DICAS) {
      expect(DICAS.some((dica) => dica.categoria === categoria)).toBe(true);
    }
    expect(encontrarDica('nao-existe')).toBeNull();
    expect(JSON.stringify(DICAS)).not.toMatch(PROIBIDOS);
  });

  it('lista, filtra por categoria e abre a leitura, com zero requisições', async () => {
    const abrir = jest.fn();
    await render(<Dicas onAbrir={abrir} onVoltar={noop} />);
    expect(
      screen.getByText(textos.dicas.conteudos(DICAS.length)),
    ).toBeOnTheScreen();
    for (const dica of DICAS) {
      expect(screen.getByText(dica.titulo)).toBeOnTheScreen();
    }

    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.dicas.categoria.seguranca,
      }),
    );
    const daCategoria = DICAS.filter((d) => d.categoria === 'seguranca');
    expect(
      screen.getByText(textos.dicas.conteudos(daCategoria.length)),
    ).toBeOnTheScreen();
    const fora = DICAS.find((d) => d.categoria !== 'seguranca');
    expect(screen.queryByText(fora?.titulo ?? '')).toBeNull();

    const primeira = daCategoria[0];
    await fireEvent.press(screen.getByText(primeira?.titulo ?? ''));
    expect(abrir).toHaveBeenCalledWith(primeira?.id);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.dicas.todos }),
    );
    expect(
      screen.getByText(textos.dicas.conteudos(DICAS.length)),
    ).toBeOnTheScreen();
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('categoria sem conteúdo mostra o vazio', async () => {
    const soUma = DICAS.filter((d) => d.categoria === 'eventos');
    await render(<Dicas conteudos={soUma} onAbrir={noop} onVoltar={noop} />);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.dicas.categoria.seguranca }),
    );
    expect(screen.getByText(textos.dicas.vazio)).toBeOnTheScreen();
    expect(screen.getByText(textos.dicas.conteudos(0))).toBeOnTheScreen();
  });

  it('"Explorar conteúdos" e voltar respondem', async () => {
    const voltar = jest.fn();
    await render(<Dicas onAbrir={noop} onVoltar={voltar} />);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.dicas.explorar }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    expect(voltar).toHaveBeenCalledTimes(1);
  });

  it('a leitura mostra tipo, tempo, parágrafos e "Para lembrar", sem rede', async () => {
    const dica = DICAS[0];
    if (!dica) throw new Error('Sem dicas.');
    const voltar = jest.fn();
    await render(<LeituraDeDica dica={dica} onVoltar={voltar} />);
    expect(screen.getByText(dica.titulo)).toBeOnTheScreen();
    expect(
      screen.getByText(textos.dicas.minutos(dica.minutos)),
    ).toBeOnTheScreen();
    for (const paragrafo of dica.paragrafos) {
      expect(screen.getByText(paragrafo)).toBeOnTheScreen();
    }
    expect(screen.getByText(textos.dicas.paraLembrar)).toBeOnTheScreen();
    for (const item of dica.lembrar) {
      expect(screen.getByText(item)).toBeOnTheScreen();
    }
    await fireEvent.press(
      screen.getByRole('button', { name: textos.dicas.voltar }),
    );
    expect(voltar).toHaveBeenCalledTimes(1);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('a leitura de um conteúdo que não existe mostra "não encontrado"', async () => {
    await render(<LeituraDeDica dica={null} onVoltar={noop} />);
    expect(screen.getByText(textos.erros.nao_encontrado)).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------- CA82

describe('CA82: Início do contratante', () => {
  const demandas: DemandaParaExibir[] = [1, 2, 3, 4, 5].map((n) => ({
    id: `d${n}`,
    titulo: `Garçom ${n}`,
    prazoFormatado: n === 1 ? null : '20/11/2026',
    interessados: n,
  }));

  async function renderizar(
    props: Partial<Parameters<typeof InicioDoContratante>[0]> = {},
  ) {
    await render(
      <InicioDoContratante
        nome="Hamburgueria Central"
        demandas={ok(demandas)}
        onNovaDemanda={noop}
        onVerDemandas={noop}
        onVerCandidatos={noop}
        {...props}
      />,
    );
  }

  it('o "+" do destaque publica uma nova demanda', async () => {
    const nova = jest.fn();
    await renderizar({ onNovaDemanda: nova });
    expect(screen.getByText('Hamburgueria Central')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.inicioContratante.novaDemanda,
      }),
    );
    expect(nova).toHaveBeenCalledTimes(1);
  });

  it('mostra até 3 demandas abertas, com interessados e "Ver candidatos"', async () => {
    const ver = jest.fn();
    const verDemandas = jest.fn();
    await renderizar({ onVerCandidatos: ver, onVerDemandas: verDemandas });
    expect(MAXIMO_DE_DEMANDAS_NO_INICIO).toBe(3);
    expect(screen.getByText('Garçom 3')).toBeOnTheScreen();
    expect(screen.queryByText('Garçom 4')).toBeNull();
    expect(
      screen.getByText(textos.inicioContratante.interessados(1)),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.inicioContratante.interessados(2)),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.detalheTrampo.semPrazo)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.demandas.verCandidatosDe('Garçom 2'),
      }),
    );
    expect(ver).toHaveBeenCalledWith('d2');
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.inicioContratante.verDemandas,
      }),
    );
    expect(verDemandas).toHaveBeenCalled();
    // Sem Aceitar nem Recusar no Início.
    expect(
      screen.queryByRole('button', { name: /Aceitar|Recusar/ }),
    ).toBeNull();
  });

  it('vazio, esqueleto e erro', async () => {
    const nova = jest.fn();
    await renderizar({ demandas: { situacao: 'vazio' }, onNovaDemanda: nova });
    expect(
      screen.getByText(textos.inicioContratante.semDemandas),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.demandas.publicar }),
    );
    expect(nova).toHaveBeenCalledTimes(1);

    await renderizar({ demandas: { situacao: 'carregando' } });
    expect(screen.getByLabelText(textos.gerais.carregando)).toBeOnTheScreen();

    const tentar = jest.fn();
    await renderizar({
      demandas: {
        situacao: 'erro',
        mensagem: textos.erros.erro_servidor,
        onTentarDeNovo: tentar,
      },
    });
    expect(screen.getByText(textos.erros.erro_servidor)).toBeOnTheScreen();
    // O destaque continua: o erro fica na seção.
    expect(
      screen.getByText(textos.inicioContratante.precisa),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );
    expect(tentar).toHaveBeenCalled();
  });

  it('sem nome, a saudação é "Olá!"', async () => {
    await renderizar({ nome: undefined });
    expect(screen.getByText(textos.inicio.saudacaoSemNome)).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------- CA83

const PERFIL = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: 'Garçonete há 5 anos.',
  habilidades: ['Atendimento'],
};

describe('CA83: Perfil do freela', () => {
  it('cartão de modo, números, Editar, Meus serviços, Dicas, Conta e Sair', async () => {
    const trocar = jest.fn();
    const dicas = jest.fn();
    await render(
      <Perfil
        proprio
        estado={ok(PERFIL)}
        contagens={{ enviadas: 4, confirmadas: 1 }}
        onTrocarModo={trocar}
        onDicas={dicas}
        onEditar={noop}
        onMeusServicos={noop}
        onContaEPrivacidade={noop}
        onSair={noop}
      />,
    );
    expect(
      screen.getByText(textos.perfil.candidaturasEnviadas(4)),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.perfil.confirmadas(1))).toBeOnTheScreen();
    for (const nome of [
      textos.perfil.editar,
      textos.perfil.meusServicos,
      textos.perfil.dicas,
      textos.perfil.contaEPrivacidade,
      textos.perfil.sair,
    ]) {
      expect(screen.getByRole('button', { name: nome })).toBeOnTheScreen();
    }
    await fireEvent.press(
      screen.getByRole('button', { name: textos.modo.trocarParaContratante }),
    );
    expect(trocar).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.dicas }),
    );
    expect(dicas).toHaveBeenCalledTimes(1);
    expect(textosNaTela()).not.toMatch(PROIBIDOS);
  });

  it('sem contagens, os números não aparecem; perfil de outra pessoa não tem cartão de modo', async () => {
    await render(
      <Perfil proprio={false} estado={ok(PERFIL)} onTrocarModo={noop} />,
    );
    expect(
      screen.queryByRole('button', {
        name: textos.modo.trocarParaContratante,
      }),
    ).toBeNull();
    expect(screen.queryByText(/candidaturas enviadas/)).toBeNull();
  });
});

describe('CA83: Perfil da empresa', () => {
  it('nome, cidade, sobre, cartão de modo, Editar, Conta e privacidade e Sair', async () => {
    const trocar = jest.fn();
    const editar = jest.fn();
    const conta = jest.fn();
    const sair = jest.fn();
    await render(
      <PerfilDaEmpresa
        estado={ok({ ...PERFIL, nome: 'Hamburgueria Central' })}
        onTrocarModo={trocar}
        onEditar={editar}
        onContaEPrivacidade={conta}
        onSair={sair}
      />,
    );
    expect(screen.getByText(textos.perfil.tituloEmpresa)).toBeOnTheScreen();
    expect(screen.getByText('Hamburgueria Central')).toBeOnTheScreen();
    expect(screen.getByText('Lavras')).toBeOnTheScreen();
    expect(screen.getByText(PERFIL.descricao)).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.modo.trocarParaFreela }),
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: `${textos.perfil.editar}. ${textos.perfil.infoEmpresaTexto}`,
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.contaEPrivacidade }),
    );
    expect(trocar).toHaveBeenCalledTimes(1);
    expect(editar).toHaveBeenCalledTimes(1);
    expect(conta).toHaveBeenCalledTimes(1);

    // Sair passa pelo diálogo.
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.sair }),
    );
    expect(sair).not.toHaveBeenCalled();
    expect(await screen.findByText(textos.perfil.sairTitulo)).toBeOnTheScreen();
    const confirmar = screen.getAllByRole('button', {
      name: textos.perfil.sairConfirmar,
    });
    await fireEvent.press(confirmar[confirmar.length - 1] as never);
    expect(sair).toHaveBeenCalledTimes(1);
    expect(textosNaTela()).not.toMatch(PROIBIDOS);
  });

  it('sem descrição, mostra "Sem descrição."', async () => {
    await render(
      <PerfilDaEmpresa
        estado={ok({ ...PERFIL, descricao: null })}
        onTrocarModo={noop}
        onEditar={noop}
        onContaEPrivacidade={noop}
        onSair={noop}
      />,
    );
    expect(screen.getByText(textos.perfil.semDescricao)).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------- CA84

describe('CA84: Buscar com tipo fixo', () => {
  const servico: ItemParaExibir = {
    tipo: 'servico',
    id: 's1',
    titulo: 'Garçom para eventos',
    categoria: 'Eventos',
    cidade: 'Lavras',
    valorFormatado: 'R$ 80,00',
    dataFormatada: '10/11/2026',
    autor: 'João Pereira',
  };
  const trampo: ItemParaExibir = {
    tipo: 'trampo',
    id: 't1',
    titulo: 'Pintar a sala',
    categoria: 'Reformas e reparos',
    cidade: 'Lavras',
    valorFormatado: 'R$ 300,00',
    dataFormatada: '10/11/2026',
  };

  function props(extra: Partial<PropsDaBusca>): PropsDaBusca {
    return {
      texto: '',
      categoria: null,
      cidade: null,
      categorias: [],
      estado: ok([servico]),
      temMais: false,
      onMudarTexto: noop,
      onMudarCategoria: noop,
      onMudarCidade: noop,
      onEnviar: noop,
      onCarregarMais: noop,
      onLimparFiltros: noop,
      onAbrirItem: noop,
      ...extra,
    };
  }

  it('contratante: "Buscar freelancers", só serviços, sem abas e sem voltar', async () => {
    const abrir = jest.fn();
    await render(
      <Buscar {...props({ tipo: 'servicos', onAbrirItem: abrir })} />,
    );
    expect(screen.getByText(textos.buscarFreelancers.titulo)).toBeOnTheScreen();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.gerais.voltar }),
    ).toBeNull();
    expect(
      screen.getByLabelText(textos.buscarFreelancers.campo),
    ).toBeOnTheScreen();
    // Com o autor, o item vira o cartão de freelancer.
    expect(screen.getByText('João Pereira')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('João Pereira'));
    expect(abrir).toHaveBeenCalledWith(servico);
  });

  it('freela: "Buscar trampos" com voltar, sem abas', async () => {
    const voltar = jest.fn();
    await render(
      <Buscar
        {...props({ tipo: 'trampos', estado: ok([trampo]), onVoltar: voltar })}
      />,
    );
    expect(screen.getByText(textos.buscar.tituloTrampos)).toBeOnTheScreen();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('Pintar a sala')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    expect(voltar).toHaveBeenCalledTimes(1);
  });

  it('sem `tipo`, as abas continuam (rotas atuais)', async () => {
    await render(<Buscar {...props({ aba: 'trampos', onTrocarAba: noop })} />);
    expect(
      screen.getByRole('tab', { name: textos.buscar.abaTrampos }),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.buscar.titulo)).toBeOnTheScreen();
  });
});

// ---------------------------------------------------- CA75 (lado da tela)

describe('Cadastro: escolha de objetivo (modo inicial)', () => {
  function props(extra: Partial<PropsDeCadastro>): PropsDeCadastro {
    return {
      email: 'ana@exemplo.com',
      senha: '12345678',
      erros: {},
      enviando: false,
      onMudarEmail: noop,
      onMudarSenha: noop,
      onCriarConta: noop,
      onIrParaEntrar: noop,
      onPolitica: noop,
      onTermos: noop,
      ...extra,
    };
  }

  it('"Criar conta" fica desabilitado, com o motivo em texto, até escolher', async () => {
    const escolher = jest.fn();
    const criar = jest.fn();
    await render(
      <Cadastro
        {...props({
          objetivo: null,
          onEscolherObjetivo: escolher,
          onCriarConta: criar,
        })}
      />,
    );
    expect(screen.getByText(textos.cadastro.objetivo)).toBeOnTheScreen();
    expect(screen.getByText(textos.cadastro.escolhaObjetivo)).toBeOnTheScreen();
    const botao = screen.getByRole('button', {
      name: textos.cadastro.criarConta,
    });
    expect(botao).toBeDisabled();
    await fireEvent.press(botao);
    expect(criar).not.toHaveBeenCalled();

    const contratar = screen.getByRole('radio', {
      name: textos.cadastro.querContratar,
    });
    expect(contratar.props.accessibilityState).toMatchObject({
      checked: false,
    });
    await fireEvent.press(contratar);
    expect(escolher).toHaveBeenCalledWith('contratante');
    await fireEvent.press(
      screen.getByRole('radio', { name: textos.cadastro.querTrampar }),
    );
    expect(escolher).toHaveBeenLastCalledWith('freela');
  });

  it('com o objetivo escolhido: marcado, dica visível e "Criar conta" habilitado', async () => {
    const criar = jest.fn();
    await render(
      <Cadastro
        {...props({
          objetivo: 'freela',
          onEscolherObjetivo: noop,
          onCriarConta: criar,
        })}
      />,
    );
    expect(
      screen.getByRole('radio', { name: textos.cadastro.querTrampar }).props
        .accessibilityState,
    ).toMatchObject({ checked: true });
    expect(screen.getByText(textos.cadastro.dicaTrampar)).toBeOnTheScreen();
    expect(screen.queryByText(textos.cadastro.escolhaObjetivo)).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.criarConta }),
    );
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it('sem `onEscolherObjetivo`, o cadastro fica como antes', async () => {
    const criar = jest.fn();
    await render(<Cadastro {...props({ onCriarConta: criar })} />);
    expect(screen.queryByRole('radio')).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.cadastro.criarConta }),
    );
    expect(criar).toHaveBeenCalledTimes(1);
  });
});
