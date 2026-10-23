// QA da L2 (CA32 a CA35) com rotas reais e um servidor em memória que aplica as
// regras da API: a versão sobe a cada escrita, então o app que mandar a
// versão velha leva 409. O fake estático dos testes de rota da L2 nunca sobe
// a versão e não pega isso.
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { esquecerAvisoDeRetorno } from '../../estado/aviso-de-retorno';
import { textos } from '../../textos/pt-BR';
import {
  botaoDoDialogo,
  botaoSalvar,
  criarServidorL2,
  EU,
  novaCandidatura,
  novoTrampo,
  passar,
  requisicoesDe,
} from './apoio-anuncios-l2';
import { tocarNoMesmoTick } from './apoio-conversas-2c';
import { abrirApp, vigiarConsole } from './apoio-qa';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 99,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

vigiarConsole();

afterEach(() => {
  esquecerAvisoDeRetorno();
});

const a = textos.anuncio;
const f = textos.formularioDeAnuncio;

/**
 * Abre "Mais opções" do anúncio. O botão do detalhe leva o título que a folha
 * guardou na última abertura (ver Q2), então aqui o nome é casado só pelo
 * começo; a folha, que sempre abre com o título atual, é conferida pelo texto.
 */
async function abrirFolha(titulo: string) {
  // Dá tempo de o detalhe receber a recarga que o salvamento pediu.
  await passar();
  await fireEvent.press(
    await screen.findByRole('button', { name: /^Mais opções de / }),
  );
  await screen.findByText(a.folhaTitulo(titulo));
}

async function editarPelaFolha(titulo: string) {
  await abrirFolha(titulo);
  await fireEvent.press(screen.getByRole('button', { name: a.editar }));
  await screen.findByDisplayValue(titulo);
}

async function digitar(rotulo: string, texto: string) {
  await fireEvent.changeText(screen.getByLabelText(rotulo), texto);
}

describe('CA32 — a versão que o app manda acompanha o servidor', () => {
  it('editar duas vezes seguidas: o segundo PUT leva a versão nova e o campo abre com o texto salvo', async () => {
    const servidor = criarServidorL2();
    await abrirApp('/trampos/t1', { fetch: servidor.fetch });

    await editarPelaFolha('Pintar a sala');
    await digitar(f.titulo, 'Pintar a sala e o quarto');
    await fireEvent.press(botaoSalvar());
    expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/t1');
    expect(
      await screen.findByText('Pintar a sala e o quarto'),
    ).toBeOnTheScreen();

    await editarPelaFolha('Pintar a sala e o quarto');
    await digitar(f.descricao, 'Três demãos, com massa corrida.');
    await fireEvent.press(botaoSalvar());
    expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();

    expect(servidor.puts.map((p) => p.corpo.versao)).toEqual([1, 2]);
    expect(screen.queryByText(a.conflito)).toBeNull();
    expect(servidor.trampos[0]).toMatchObject({
      titulo: 'Pintar a sala e o quarto',
      descricao: 'Três demãos, com massa corrida.',
      versao: 3,
    });
  });

  it('salvar sem mexer em nada manda os mesmos valores (valor, prazo e cidade viajam sem perda)', async () => {
    const servidor = criarServidorL2({
      trampos: [
        novoTrampo('t1', 'Pintar a sala', {
          valorCentavos: 123456,
          prazo: '2027-03-05',
          cidade: 'Perdões',
        }),
      ],
    });
    await abrirApp('/trampos/editar/t1', { fetch: servidor.fetch });
    await screen.findByDisplayValue('Pintar a sala');
    expect(screen.getByLabelText(f.valor)).toHaveDisplayValue('1.234,56');
    expect(screen.getByLabelText(f.prazo)).toHaveDisplayValue('05/03/2027');

    await fireEvent.press(botaoSalvar());
    await waitFor(() => expect(servidor.puts).toHaveLength(1));

    expect(servidor.puts[0]?.corpo).toEqual({
      titulo: 'Pintar a sala',
      descricao: 'Duas demãos de tinta branca.',
      categoria: 'reformas',
      cidade: 'Perdões',
      valorCentavos: 123456,
      prazo: '2027-03-05',
      versao: 1,
    });
  });

  it('apagar o prazo manda o PUT sem prazo e, na edição seguinte, o campo abre vazio', async () => {
    const servidor = criarServidorL2();
    await abrirApp('/trampos/t1', { fetch: servidor.fetch });
    await editarPelaFolha('Pintar a sala');
    await digitar(f.prazo, '');
    await fireEvent.press(botaoSalvar());
    await screen.findByText(a.alteracoesSalvas);

    expect(servidor.puts[0]?.corpo).not.toHaveProperty('prazo');
    expect(servidor.trampos[0]?.prazo).toBeNull();

    await editarPelaFolha('Pintar a sala');
    expect(screen.getByLabelText(f.prazo)).toHaveDisplayValue('');
  });

  it('conflito: outro aparelho altera o trampo; "Ver versão atual" traz o texto novo dos campos não mexidos, mantém o que foi mexido e salva com a versão nova', async () => {
    const servidor = criarServidorL2();
    await abrirApp('/trampos/t1', { fetch: servidor.fetch });
    await editarPelaFolha('Pintar a sala');
    await digitar(f.descricao, 'Descrição que eu escrevi aqui.');

    servidor.editarPorFora('t1', 'Título trocado no outro aparelho');
    await fireEvent.press(botaoSalvar());

    expect(await screen.findByText(a.conflito)).toBeOnTheScreen();
    expect(servidor.puts).toHaveLength(1);
    await fireEvent.press(
      screen.getByRole('button', { name: a.verVersaoAtual }),
    );
    await waitFor(() => expect(screen.queryByText(a.conflito)).toBeNull());
    expect(screen.getByLabelText(f.titulo)).toHaveDisplayValue(
      'Título trocado no outro aparelho',
    );
    expect(screen.getByLabelText(f.descricao)).toHaveDisplayValue(
      'Descrição que eu escrevi aqui.',
    );

    await fireEvent.press(botaoSalvar());
    expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();
    expect(servidor.puts.map((p) => p.corpo.versao)).toEqual([1, 2]);
    expect(servidor.trampos[0]).toMatchObject({
      titulo: 'Título trocado no outro aparelho',
      descricao: 'Descrição que eu escrevi aqui.',
    });
  });

  it('conflito e, antes de "Ver versão atual", chega candidatura: a base nova desabilita o Salvar com o motivo das candidaturas e guarda o rascunho', async () => {
    const servidor = criarServidorL2();
    await abrirApp('/trampos/editar/t1', { fetch: servidor.fetch });
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(f.descricao, 'Rascunho que fica na tela.');

    servidor.editarPorFora('t1', 'Título trocado no outro aparelho');
    await fireEvent.press(botaoSalvar());
    expect(await screen.findByText(a.conflito)).toBeOnTheScreen();

    servidor.chegarCandidatura('t1', 'conta-bia');
    await fireEvent.press(
      screen.getByRole('button', { name: a.verVersaoAtual }),
    );
    expect(
      await screen.findByText(a.motivoEditarComCandidaturas),
    ).toBeOnTheScreen();
    expect(botaoSalvar()).toBeDisabled();
    expect(screen.getByLabelText(f.descricao)).toHaveDisplayValue(
      'Rascunho que fica na tela.',
    );
    expect(servidor.puts).toHaveLength(1);
  });

  it('chegou candidatura durante a edição: o 409 trampo_nao_editavel mostra o aviso e desabilita o Salvar, sem perder o rascunho', async () => {
    const servidor = criarServidorL2();
    await abrirApp('/trampos/editar/t1', { fetch: servidor.fetch });
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(f.titulo, 'Título que não vai ser salvo');

    servidor.chegarCandidatura('t1', 'conta-bia');
    await fireEvent.press(botaoSalvar());

    expect(await screen.findByText(a.naoEditavel)).toBeOnTheScreen();
    expect(screen.getByLabelText(f.titulo)).toHaveDisplayValue(
      'Título que não vai ser salvo',
    );
    expect(botaoSalvar()).toBeDisabled();
    expect(servidor.puts).toHaveLength(1);
    expect(screen.queryByText(a.conflito)).toBeNull();
    expect(servidor.trampos[0]?.titulo).toBe('Pintar a sala');
  });

  it('trampo encerrado e trampo com candidatura abrem a edição já desabilitada, sem nenhum PUT', async () => {
    const servidor = criarServidorL2({
      trampos: [
        novoTrampo('t1', 'Pintar a sala', { status: 'encerrado' }),
        novoTrampo('t2', 'Trocar o telhado'),
        novoTrampo('t3', 'Montar estante', { status: 'em_andamento' }),
      ],
      candidaturas: [novaCandidatura('k1', 't2', 'conta-bia')],
    });
    await abrirApp('/trampos/editar/t1', { fetch: servidor.fetch });
    await screen.findByDisplayValue('Pintar a sala');
    expect(screen.getByText(a.motivoEditarEncerrado)).toBeOnTheScreen();
    expect(botaoSalvar()).toBeDisabled();

    await act(async () => router.replace('/trampos/editar/t2'));
    await screen.findByDisplayValue('Trocar o telhado');
    expect(screen.getByText(a.motivoEditarComCandidaturas)).toBeOnTheScreen();
    expect(botaoSalvar()).toBeDisabled();

    await act(async () => router.replace('/trampos/editar/t3'));
    await screen.findByDisplayValue('Montar estante');
    expect(screen.getByText(a.motivoEditarEmAndamento)).toBeOnTheScreen();
    expect(servidor.puts).toHaveLength(0);
  });

  it('toque duplo em "Salvar alterações" no mesmo quadro manda um PUT só', async () => {
    const servidor = criarServidorL2();
    servidor.demoraDoPut = 500;
    await abrirApp('/trampos/editar/t1', { fetch: servidor.fetch });
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(f.titulo, 'Pintar a sala e o quarto');

    await tocarNoMesmoTick(botaoSalvar());
    await passar(700);

    expect(requisicoesDe(servidor.fetch, 'PUT', '/trampos/t1')).toHaveLength(1);
    expect(servidor.trampos[0]?.versao).toBe(2);
    expect(screen.queryByText(a.conflito)).toBeNull();
  });

  it('serviço: duas edições seguidas usam a versão do servidor, sem cidade (D7)', async () => {
    const servidor = criarServidorL2({
      trampos: [],
      servicos: [
        {
          id: 's1',
          autorId: EU,
          titulo: 'Aulas de violão',
          descricao: 'Aulas para iniciantes, na sua casa.',
          categoria: 'aulas',
          cidade: null,
          precoBaseCentavos: 8000,
          status: 'ativo',
          criadoEm: '2026-10-01T12:00:00.000Z',
          versao: 4,
        },
      ],
    });
    await abrirApp('/servicos/s1', { fetch: servidor.fetch });
    await editarPelaFolha('Aulas de violão');
    await digitar(f.titulo, 'Aulas de violão e cavaquinho');
    await fireEvent.press(botaoSalvar());
    await screen.findByText(a.alteracoesSalvas);

    await editarPelaFolha('Aulas de violão e cavaquinho');
    await digitar(f.descricao, 'Aulas para todas as idades.');
    await fireEvent.press(botaoSalvar());
    await screen.findByText(a.alteracoesSalvas);

    expect(servidor.puts.map((p) => p.corpo.versao)).toEqual([4, 5]);
    expect(servidor.puts[1]?.corpo).not.toHaveProperty('cidade');
    expect(servidor.servicos[0]).toMatchObject({
      titulo: 'Aulas de violão e cavaquinho',
      descricao: 'Aulas para todas as idades.',
      versao: 6,
    });
  });
});

describe('CA32 — "Descartar alterações?"', () => {
  it('"Continuar editando" mantém o rascunho e, ao salvar depois, sai sem perguntar de novo', async () => {
    const servidor = criarServidorL2();
    await abrirApp('/trampos/t1', { fetch: servidor.fetch });
    await editarPelaFolha('Pintar a sala');
    await digitar(f.titulo, 'Pintar a sala e o quarto');

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(await screen.findByText(a.descartarTitulo)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: a.continuarEditando }),
    );
    expect(screen.getByLabelText(f.titulo)).toHaveDisplayValue(
      'Pintar a sala e o quarto',
    );

    await fireEvent.press(botaoSalvar());
    expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();
    expect(screen.queryByText(a.descartarTitulo)).toBeNull();
    expect(screen).toHavePathname('/trampos/t1');
  });

  it('"Descartar": volta ao detalhe sem aviso de salvo e sem PUT; a edição seguinte abre com o texto original', async () => {
    const servidor = criarServidorL2();
    await abrirApp('/trampos/t1', { fetch: servidor.fetch });
    await editarPelaFolha('Pintar a sala');
    await digitar(f.titulo, 'Rascunho que será descartado');

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: a.descartar }),
    );

    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
    expect(screen.queryByText(a.alteracoesSalvas)).toBeNull();
    expect(servidor.puts).toHaveLength(0);
    await editarPelaFolha('Pintar a sala');
    expect(
      screen.queryByDisplayValue('Rascunho que será descartado'),
    ).toBeNull();
  });

  it('erro de campo do servidor (400) não zera o rascunho e voltar ainda pergunta', async () => {
    const servidor = criarServidorL2();
    servidor.fetch.responder('PUT /trampos/t1', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'titulo', motivo: 'tamanho' }],
      },
    });
    await abrirApp('/trampos/editar/t1', { fetch: servidor.fetch });
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(f.titulo, 'Rascunho recusado pelo servidor');
    await fireEvent.press(botaoSalvar());
    await passar();
    expect(screen.getByLabelText(f.titulo)).toHaveDisplayValue(
      'Rascunho recusado pelo servidor',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(await screen.findByText(a.descartarTitulo)).toBeOnTheScreen();
  });

  it('com o PUT em andamento, "Voltar" não oferece "Descartar" (o servidor grava mesmo assim, contra o que o diálogo promete)', async () => {
    const servidor = criarServidorL2();
    servidor.demoraDoPut = 2000;
    await abrirApp('/trampos/t1', { fetch: servidor.fetch });
    await editarPelaFolha('Pintar a sala');
    await digitar(f.titulo, 'Pintar a sala e o quarto');
    await fireEvent.press(botaoSalvar());
    await passar(100);
    expect(screen.getByRole('button', { name: a.salvando })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await passar(100);
    const perguntou = screen.queryByText(a.descartarTitulo) !== null;
    if (perguntou) {
      await fireEvent.press(screen.getByRole('button', { name: a.descartar }));
    }
    await passar(2500);

    const gravou = servidor.trampos[0]?.titulo === 'Pintar a sala e o quarto';
    // "Descartar alterações?" seguido de alteração gravada é contraditório.
    expect({ perguntou, gravou }).not.toEqual({
      perguntou: true,
      gravou: true,
    });
    // Sem diálogo, a rota volta sozinha no sucesso, com o aviso de salvo.
    expect(perguntou).toBe(false);
    expect(gravou).toBe(true);
    expect(await screen.findByText(a.alteracoesSalvas)).toBeOnTheScreen();
  });
});

describe('CA33 — encerrar mantém as candidaturas recebidas coerentes', () => {
  it('depois de encerrar, "Candidaturas recebidas" mostra as pendentes como recusadas e sem "Aceitar"', async () => {
    const servidor = criarServidorL2({
      candidaturas: [
        novaCandidatura('k1', 't1', 'conta-bia'),
        novaCandidatura('k2', 't1', 'conta-caio'),
      ],
    });
    await abrirApp('/meus-anuncios', { fetch: servidor.fetch });
    await screen.findByRole('button', { name: a.maisOpcoes('Pintar a sala') });
    await act(async () => router.push('/candidaturas/t1'));
    await screen.findAllByText(/Nome de conta-bia/);
    expect(
      screen.getAllByRole('button', { name: /^Aceitar candidatura/ }),
    ).toHaveLength(2);
    await act(async () => router.back());

    await abrirFolha('Pintar a sala');
    await fireEvent.press(
      screen.getByRole('button', { name: a.encerrarTrampo }),
    );
    await fireEvent.press(botaoDoDialogo(a.encerrarConfirmar));
    expect(await screen.findByText(a.trampoEncerrado)).toBeOnTheScreen();

    await act(async () => router.push('/candidaturas/t1'));
    await screen.findAllByText(/Nome de conta-bia/);
    await passar();
    expect(
      screen.queryAllByRole('button', { name: /^Aceitar candidatura/ }),
    ).toHaveLength(0);
    expect(servidor.candidaturas.map((c) => c.status)).toEqual([
      'recusada',
      'recusada',
    ]);
  });
});

describe('CA33 — o botão "Mais opções" do detalhe', () => {
  it('trampo: depois de editar o título, o botão e a folha falam do título novo', async () => {
    const servidor = criarServidorL2();
    await abrirApp('/trampos/t1', { fetch: servidor.fetch });
    await editarPelaFolha('Pintar a sala');
    await digitar(f.titulo, 'Pintar a sala e o quarto');
    await fireEvent.press(botaoSalvar());
    await screen.findByText(a.alteracoesSalvas);
    await passar();

    expect(
      screen.getByRole('button', {
        name: a.maisOpcoes('Pintar a sala e o quarto'),
      }),
    ).toBeOnTheScreen();
  });

  it('serviço: depois de editar o título, o botão fala do título novo', async () => {
    const servidor = criarServidorL2({
      trampos: [],
      servicos: [
        {
          id: 's1',
          autorId: EU,
          titulo: 'Aulas de violão',
          descricao: 'Aulas para iniciantes, na sua casa.',
          categoria: 'aulas',
          cidade: null,
          precoBaseCentavos: 8000,
          status: 'ativo',
          criadoEm: '2026-10-01T12:00:00.000Z',
          versao: 1,
        },
      ],
    });
    await abrirApp('/servicos/s1', { fetch: servidor.fetch });
    await editarPelaFolha('Aulas de violão');
    await digitar(f.titulo, 'Aulas de violão e cavaquinho');
    await fireEvent.press(botaoSalvar());
    await screen.findByText(a.alteracoesSalvas);
    await passar();

    expect(
      screen.getByRole('button', {
        name: a.maisOpcoes('Aulas de violão e cavaquinho'),
      }),
    ).toBeOnTheScreen();
  });
});

describe('CA35 — o rascunho da edição, com rotas reais', () => {
  const SENTINELA = 'SentinelaRascunhoL2-9Z3K';

  it('atravessa 409 de conflito, "Ver versão atual" e o sucesso sem sobrar em cache de mutações, chaves de consulta, URL ou console', async () => {
    const servidor = criarServidorL2();
    const { queryClient, getPathnameWithParams } = await abrirApp(
      '/trampos/t1',
      {
        fetch: servidor.fetch,
      },
    );
    await editarPelaFolha('Pintar a sala');
    await digitar(f.titulo, `${SENTINELA} titulo`);
    await digitar(f.descricao, `${SENTINELA} descricao`);

    servidor.editarPorFora('t1', 'Outro aparelho mexeu');
    await fireEvent.press(botaoSalvar());
    await screen.findByText(a.conflito);
    await fireEvent.press(
      screen.getByRole('button', { name: a.verVersaoAtual }),
    );
    await waitFor(() => expect(screen.queryByText(a.conflito)).toBeNull());
    await fireEvent.press(botaoSalvar());
    await screen.findByText(a.alteracoesSalvas);
    await passar(100);

    expect(getPathnameWithParams()).not.toContain(SENTINELA);
    const chaves = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(chaves.join('\n')).not.toContain(SENTINELA);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
    expect(servidor.trampos[0]?.titulo).toBe(`${SENTINELA} titulo`);
  });

  it('o rascunho descartado não deixa texto em nenhuma consulta do cache, nem no estado que a próxima edição lê', async () => {
    const servidor = criarServidorL2();
    const { queryClient } = await abrirApp('/trampos/t1', {
      fetch: servidor.fetch,
    });
    await editarPelaFolha('Pintar a sala');
    await digitar(f.titulo, `${SENTINELA} descartado`);
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: a.descartar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
    await passar(100);

    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => [q.queryKey, q.state.data]),
      ),
    ).not.toContain(SENTINELA);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
    await editarPelaFolha('Pintar a sala');
    expect(screen.queryByDisplayValue(new RegExp(SENTINELA))).toBeNull();
  });
});

describe('texto da interface depois da L2', () => {
  it('o aviso do formulário de publicar não diz mais que título, descrição e cidade "não podem ser editados depois"', async () => {
    const servidor = criarServidorL2();
    await abrirApp('/trampos/novo', { fetch: servidor.fetch });
    await screen.findByLabelText(f.titulo);
    expect(screen.queryByText(/não podem ser editados/)).toBeNull();
    expect(f.avisoVisibilidade).not.toMatch(/não podem ser editados/);
  });
});
