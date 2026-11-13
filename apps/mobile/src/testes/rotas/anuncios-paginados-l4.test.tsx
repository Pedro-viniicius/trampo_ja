// Etapa 15 da L4: o autor do trampo vem da visão do autor (D46), a folha
// "Mais opções" acompanha o anúncio atual (CA61, R8) e Meus anúncios (a aba
// Demandas desde a V2, CA79) carrega mais (CA66, D47). Rotas reais com o
// fake de `fetch`; o servidor do teste pagina `GET /trampos/meus` como a API.
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import RotaDasDemandas from '../../app/(app)/(abas)/demandas';
import RotaDoTrampo from '../../app/(app)/trampos/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { esquecerAvisoDeRetorno } from '../../estado/aviso-de-retorno';
import { chaves } from '../../estado/consultas/chaves';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { vigiarConsole } from '../qa/apoio-qa';
import { criarQueryClientDeTeste } from '../renderizar';
import { type MapaDeRotas, renderizarRotas, TOKEN_DE_TESTE } from './apoio';

const a = textos.anuncio;

// --- Dados ---

type Status = 'aberto' | 'em_andamento' | 'encerrado';

interface TrampoDoServidor {
  id: string;
  autorId: string;
  titulo: string;
  descricao: string;
  categoria: string;
  cidade: string;
  valorCentavos: number;
  prazo: string | null;
  status: Status;
  criadoEm: string;
  versao: number;
  candidaturasRecebidas: number;
}

const dois = (n: number) => String(n).padStart(2, '0');
const tituloDe = (n: number) => `Trampo ${dois(n)}`;
const idDe = (n: number) => `t-${dois(n)}`;

/** O trampo `n` da Ana: o de número maior é o mais recente. */
function trampo(n: number, status: Status = 'aberto'): TrampoDoServidor {
  return {
    id: idDe(n),
    autorId: 'conta-ana',
    titulo: tituloDe(n),
    descricao: 'Duas demãos de tinta branca.',
    categoria: 'pintura',
    cidade: 'Lavras',
    valorCentavos: 150000,
    prazo: null,
    status,
    criadoEm: `2026-09-${dois(n)}T12:00:00.000Z`,
    versao: 1,
    candidaturasRecebidas: 0,
  };
}

const CATEGORIAS = [{ id: 'pintura', rotulo: 'Pintura e reparos' }];

const PERFIL_COMPLETO = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

/** 25 trampos: a primeira página tem 20 (do 25 ao 06) e a segunda, 5 (do 05 ao 01). */
const TOTAL = 25;
const POR_PAGINA = 20;

interface Servidor {
  readonly fetch: FetchFalso;
  readonly trampos: TrampoDoServidor[];
}

/** Uma página como a API devolve: `(criadoEm, id)` decrescente, cursor `antesDe*`. */
function paginaDe(
  trampos: readonly TrampoDoServidor[],
  query: Readonly<Record<string, string>>,
): TrampoDoServidor[] {
  const limite = Number(query.limite ?? POR_PAGINA);
  const { antesDeCriadoEm, antesDeId } = query;
  return [...trampos]
    .sort((x, y) =>
      x.criadoEm === y.criadoEm
        ? y.id.localeCompare(x.id)
        : y.criadoEm.localeCompare(x.criadoEm),
    )
    .filter(
      (t) =>
        antesDeCriadoEm === undefined ||
        antesDeId === undefined ||
        t.criadoEm < antesDeCriadoEm ||
        (t.criadoEm === antesDeCriadoEm && t.id < antesDeId),
    )
    .slice(0, limite);
}

function criarServidor(): Servidor {
  const trampos = Array.from({ length: TOTAL }, (_, i) => trampo(i + 1));
  const fetch = criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /servicos/meus', { corpo: [] })
    .responder('GET /trampos/meus', (r) => ({
      corpo: paginaDe(trampos, r.query),
    }));
  for (const t of trampos) {
    fetch
      .responder(`GET /trampos/${t.id}`, () => {
        const achado = trampos.find((x) => x.id === t.id);
        return achado === undefined
          ? { status: 404, corpo: { erro: 'nao_encontrado' } }
          : { corpo: achado };
      })
      .responder(`GET /trampos/${t.id}/candidaturas`, { corpo: [] });
  }
  return { fetch, trampos };
}

function stub(texto: string) {
  return function Stub() {
    return <Text>{texto}</Text>;
  };
}

const ROTAS: MapaDeRotas = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/(abas)/index': stub('stub: início'),
  '(app)/(abas)/demandas': RotaDasDemandas,
  '(app)/trampos/[id]': RotaDoTrampo,
  '(app)/trampos/editar/[id]': stub('stub: editar trampo'),
  '(app)/candidaturas/[trampoId]': stub('stub: recebidas'),
  '(app)/perfis/[contaId]': stub('stub: perfil'),
};

async function abrir(url: string, servidor: Servidor = criarServidor()) {
  const rotas = await renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch: servidor.fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
  return { ...rotas, servidor };
}

// --- Apoio ---

function requisicoes(fetch: FetchFalso, metodo: string, caminho: string) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

const avancar = (ms = 50) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

const botaoMaisOpcoes = (titulo: string) =>
  screen.findByRole('button', { name: a.maisOpcoes(titulo) });

async function abrirFolha(titulo: string) {
  await fireEvent.press(await botaoMaisOpcoes(titulo));
  await screen.findByText(a.folhaTitulo(titulo));
}

const acao = (nome: string) => screen.getByRole('button', { name: nome });

/** O botão do diálogo repete o nome do botão da folha: é o último. */
function botaoDoDialogo(nome: string) {
  const ultimo = screen.getAllByRole('button', { name: nome }).at(-1);
  if (ultimo === undefined) throw new Error(`sem botão "${nome}"`);
  return ultimo;
}

const botaoCarregarMais = () =>
  screen.queryByRole('button', { name: textos.gerais.carregarMais });

vigiarConsole();

afterEach(() => {
  esquecerAvisoDeRetorno();
});

// --- CA66, D46: o autor vem do trampo, não da lista ---

describe('detalhe do trampo: o autor pela visão do autor (CA66, D46)', () => {
  it('o trampo que só estaria na página 2 mostra "Mais opções" ao autor, sem pedir a lista', async () => {
    const { servidor } = await abrir(`/trampos/${idDe(1)}`);

    expect(await botaoMaisOpcoes(tituloDe(1))).toBeOnTheScreen();
    await avancar();
    await avancar();
    expect(requisicoes(servidor.fetch, 'GET', '/trampos/meus')).toHaveLength(0);
    // O autor também vê o rodapé de autor, e nunca "Candidatar-se".
    expect(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.verCandidaturas(0),
      }),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: textos.detalheTrampo.candidatar }),
    ).toBeNull();
  });

  it('de Meus anúncios, depois de "Carregar mais": o trampo da página 2 abre com "Mais opções"', async () => {
    const { servidor } = await abrir('/demandas');
    await screen.findByText(tituloDe(TOTAL));
    expect(screen.queryByText(tituloDe(1))).toBeNull();
    await fireEvent.press(
      await screen.findByRole('button', { name: textos.gerais.carregarMais }),
    );
    await fireEvent.press(await screen.findByText(tituloDe(1)));

    expect(await botaoMaisOpcoes(tituloDe(1))).toBeOnTheScreen();
    // O detalhe não repete a lista: as duas páginas são da própria Meus anúncios.
    expect(requisicoes(servidor.fetch, 'GET', '/trampos/meus')).toHaveLength(2);
  });

  it('trampo de outra conta (sem `versao`) não mostra "Mais opções"', async () => {
    const servidor = criarServidor();
    const { versao: _v, candidaturasRecebidas: _c, ...deTerceiro } = trampo(7);
    servidor.fetch
      .responder('GET /trampos/t-07', {
        corpo: { ...deTerceiro, autorId: 'conta-bia' },
      })
      .responder('GET /perfis/conta-bia', {
        corpo: {
          contaId: 'conta-bia',
          nome: 'Bia Souza',
          cidade: 'Lavras',
          descricao: null,
          habilidades: ['pintura'],
        },
      })
      .responder('GET /candidaturas/minhas', { corpo: [] });
    await abrir('/trampos/t-07', servidor);

    expect(
      await screen.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Mais opções/ })).toBeNull();
  });
});

// --- CA61 (R8): a folha aberta mostra o anúncio atual ---

describe('folha "Mais opções" depois do 409 trampo_nao_aberto (CA61, R8)', () => {
  /** O DELETE perde a corrida: o trampo já estava em andamento no servidor. */
  function servidorQueMudaNoDelete(idDoTrampo: string, demoraDoGet = 0) {
    const servidor = criarServidor();
    const alvo = servidor.trampos.find((t) => t.id === idDoTrampo);
    if (alvo === undefined) throw new Error('trampo do teste sumiu');
    let mudou = false;
    servidor.fetch
      .responder(`DELETE /trampos/${idDoTrampo}`, () => {
        mudou = true;
        alvo.status = 'em_andamento';
        return { status: 409, corpo: { erro: 'trampo_nao_aberto' } };
      })
      .responder(`GET /trampos/${idDoTrampo}`, () => ({
        corpo: alvo,
        ...(mudou && demoraDoGet > 0 && { demoraMs: demoraDoGet }),
      }));
    return servidor;
  }

  async function excluirComConfirmacao() {
    await fireEvent.press(acao(a.excluirTrampo));
    await fireEvent.press(botaoDoDialogo(a.excluirTrampo));
  }

  it('no detalhe: a folha continua aberta com "Excluir" desabilitado e o motivo, sem fechar e reabrir', async () => {
    const servidor = servidorQueMudaNoDelete(idDe(TOTAL));
    await abrir(`/trampos/${idDe(TOTAL)}`, servidor);
    await abrirFolha(tituloDe(TOTAL));
    expect(acao(a.excluirTrampo)).toBeEnabled();
    expect(screen.queryByText(a.motivoExcluirNaoAberto)).toBeNull();

    await excluirComConfirmacao();

    expect(await screen.findByText(a.folhaAtualizada)).toBeOnTheScreen();
    await waitFor(() => expect(acao(a.excluirTrampo)).toBeDisabled());
    expect(screen.getByText(a.motivoExcluirNaoAberto)).toBeOnTheScreen();
    // A folha é a mesma: o título está lá e não houve reabertura.
    expect(screen.getByText(a.folhaTitulo(tituloDe(TOTAL)))).toBeOnTheScreen();
    expect(
      requisicoes(servidor.fetch, 'DELETE', `/trampos/${idDe(TOTAL)}`),
    ).toHaveLength(1);
    expect(
      requisicoes(servidor.fetch, 'GET', `/trampos/${idDe(TOTAL)}`),
    ).toHaveLength(2);
    // "Em andamento" também não deixa Editar: as ações seguem o dado novo.
    expect(acao(a.editar)).toBeDisabled();
    expect(screen.getByText(a.motivoEditarEmAndamento)).toBeOnTheScreen();
    expect(acao(a.encerrarTrampo)).toBeEnabled();
    expect(screen.queryByText(a.folhaAtualizando)).toBeNull();
  });

  it('enquanto o trampo é relido: "Atualizando as opções…" e as três ações desabilitadas', async () => {
    const servidor = servidorQueMudaNoDelete(idDe(TOTAL), 1000);
    await abrir(`/trampos/${idDe(TOTAL)}`, servidor);
    await abrirFolha(tituloDe(TOTAL));

    await excluirComConfirmacao();

    expect(await screen.findByText(a.folhaAtualizando)).toBeOnTheScreen();
    // Ainda não releu: o aviso é o do 409, sem "Atualizamos as opções" (Q3).
    expect(screen.queryByText(a.folhaAtualizada)).toBeNull();
    expect(screen.getByText(a.motivoExcluirNaoAberto)).toBeOnTheScreen();
    expect(acao(a.editar)).toBeDisabled();
    expect(acao(a.encerrarTrampo)).toBeDisabled();
    expect(acao(a.excluirTrampo)).toBeDisabled();

    await avancar(1100);
    await waitFor(() =>
      expect(screen.queryByText(a.folhaAtualizando)).toBeNull(),
    );
    expect(screen.getByText(a.folhaAtualizada)).toBeOnTheScreen();
    expect(screen.getByText(a.motivoExcluirNaoAberto)).toBeOnTheScreen();
    expect(acao(a.encerrarTrampo)).toBeEnabled();
  });

  it('em Meus anúncios: a folha aberta acompanha a lista relida', async () => {
    const servidor = servidorQueMudaNoDelete(idDe(TOTAL));
    await abrir('/demandas', servidor);
    await abrirFolha(tituloDe(TOTAL));
    expect(acao(a.excluirTrampo)).toBeEnabled();

    await excluirComConfirmacao();

    expect(await screen.findByText(a.folhaAtualizada)).toBeOnTheScreen();
    await waitFor(() => expect(acao(a.excluirTrampo)).toBeDisabled());
    expect(screen.getByText(a.motivoExcluirNaoAberto)).toBeOnTheScreen();
    expect(screen.getByText(a.folhaTitulo(tituloDe(TOTAL)))).toBeOnTheScreen();
    expect(
      requisicoes(servidor.fetch, 'DELETE', `/trampos/${idDe(TOTAL)}`),
    ).toHaveLength(1);
    expect(requisicoes(servidor.fetch, 'GET', '/trampos/meus')).toHaveLength(2);
    expect(acao(a.editar)).toBeDisabled();
    expect(screen.queryByText(a.folhaAtualizando)).toBeNull();
  });

  it('em Meus anúncios, enquanto a lista é relida: "Atualizando as opções…" e as ações desabilitadas', async () => {
    const servidor = criarServidor();
    let mudou = false;
    servidor.fetch
      .responder(`DELETE /trampos/${idDe(TOTAL)}`, () => {
        mudou = true;
        const alvo = servidor.trampos.find((t) => t.id === idDe(TOTAL));
        if (alvo !== undefined) alvo.status = 'em_andamento';
        return { status: 409, corpo: { erro: 'trampo_nao_aberto' } };
      })
      .responder('GET /trampos/meus', (r) => ({
        corpo: paginaDe(servidor.trampos, r.query),
        ...(mudou && { demoraMs: 1000 }),
      }));
    await abrir('/demandas', servidor);
    await abrirFolha(tituloDe(TOTAL));

    await excluirComConfirmacao();

    expect(await screen.findByText(a.folhaAtualizando)).toBeOnTheScreen();
    expect(acao(a.editar)).toBeDisabled();
    expect(acao(a.encerrarTrampo)).toBeDisabled();
    expect(acao(a.excluirTrampo)).toBeDisabled();

    await avancar(1100);
    await waitFor(() =>
      expect(screen.queryByText(a.folhaAtualizando)).toBeNull(),
    );
    expect(screen.getByText(a.motivoExcluirNaoAberto)).toBeOnTheScreen();
    expect(acao(a.encerrarTrampo)).toBeEnabled();
  });

  it('a folha já aberta segue o trampo relido por outro caminho, sem 409', async () => {
    const servidor = criarServidor();
    const alvo = servidor.trampos.find((t) => t.id === idDe(TOTAL));
    if (alvo === undefined) throw new Error('trampo do teste sumiu');
    const queryClient = criarQueryClientDeTeste();
    await renderizarRotas(ROTAS, {
      initialUrl: `/trampos/${idDe(TOTAL)}`,
      fetch: servidor.fetch,
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
      queryClient,
    });
    await abrirFolha(tituloDe(TOTAL));
    expect(acao(a.excluirTrampo)).toBeEnabled();
    expect(acao(a.encerrarTrampo)).toBeEnabled();

    // Outro aparelho encerra o trampo; o detalhe é relido por baixo da folha.
    alvo.status = 'encerrado';
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: chaves.trampo(alvo.id) });
    });

    await waitFor(() => expect(acao(a.excluirTrampo)).toBeDisabled());
    expect(screen.getByText(a.motivoExcluirNaoAberto)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: a.encerrarTrampo })).toBeNull();
    // Sem 409 não há aviso de "mudou enquanto você olhava".
    expect(screen.queryByText(a.folhaAtualizada)).toBeNull();
  });
});

// --- CA66, D47: "Carregar mais" em Meus anúncios ---

describe('Meus anúncios: "Carregar mais" (CA66, D47)', () => {
  it('a primeira página traz 20 e o botão; a segunda usa o cursor do último e some o botão', async () => {
    const servidor = criarServidor();
    // A segunda página demora um pouco: a tela chega a mostrar "Carregando…".
    servidor.fetch.responder('GET /trampos/meus', (r) => ({
      corpo: paginaDe(servidor.trampos, r.query),
      ...(r.query.antesDeId !== undefined && { demoraMs: 300 }),
    }));
    await abrir('/demandas', servidor);
    await screen.findByText(tituloDe(TOTAL));
    expect(
      screen.getByText(tituloDe(TOTAL - POR_PAGINA + 1)),
    ).toBeOnTheScreen();
    expect(screen.queryByText(tituloDe(5))).toBeNull();
    expect(botaoCarregarMais()).toBeOnTheScreen();
    const [primeira] = requisicoes(servidor.fetch, 'GET', '/trampos/meus');
    // Um a mais que a página: o excedente só diz que há mais (Q2).
    expect(primeira?.query).toEqual({ limite: String(POR_PAGINA + 1) });

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.carregarMais }),
    );

    expect(
      await screen.findByRole('button', { name: textos.gerais.carregando }),
    ).toBeDisabled();
    expect(screen.getByText(tituloDe(TOTAL))).toBeOnTheScreen();
    await avancar(400);

    expect(await screen.findByText(tituloDe(5))).toBeOnTheScreen();
    expect(screen.getByText(tituloDe(1))).toBeOnTheScreen();
    expect(screen.getByText(tituloDe(TOTAL))).toBeOnTheScreen();
    const segunda = requisicoes(servidor.fetch, 'GET', '/trampos/meus').at(-1);
    const ultimo = trampo(TOTAL - POR_PAGINA + 1);
    expect(segunda?.query).toEqual({
      limite: String(POR_PAGINA + 1),
      antesDeCriadoEm: ultimo.criadoEm,
      antesDeId: ultimo.id,
    });
    await waitFor(() => expect(botaoCarregarMais()).toBeNull());
    expect(requisicoes(servidor.fetch, 'GET', '/trampos/meus')).toHaveLength(2);
    // O leitor de tela ouve quantos vieram.
    expect(
      screen.getByText(
        textos.meusAnuncios.maisCarregados(TOTAL - POR_PAGINA, 'trampo'),
      ),
    ).toBeOnTheScreen();
  });

  it('lista curta (menos de 20): sem botão e uma requisição só', async () => {
    const servidor = criarServidor();
    servidor.trampos.splice(0, TOTAL - 3);
    const { servidor: s } = await abrir('/demandas', servidor);
    await screen.findByText(tituloDe(TOTAL));

    expect(botaoCarregarMais()).toBeNull();
    expect(requisicoes(s.fetch, 'GET', '/trampos/meus')).toHaveLength(1);
  });

  it('erro ao carregar mais: aviso com "Tentar de novo", a lista fica e o novo toque traz a página', async () => {
    const servidor = criarServidor();
    servidor.fetch.responder('GET /trampos/meus', (r) =>
      r.query.antesDeId !== undefined &&
      requisicoes(servidor.fetch, 'GET', '/trampos/meus').length <= 2
        ? { status: 500, corpo: { erro: 'interno' } }
        : { corpo: paginaDe(servidor.trampos, r.query) },
    );
    await abrir('/demandas', servidor);
    await screen.findByText(tituloDe(TOTAL));
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.carregarMais }),
    );

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    // A lista que já estava na tela continua, e o botão também.
    expect(screen.getByText(tituloDe(TOTAL))).toBeOnTheScreen();
    expect(botaoCarregarMais()).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );

    expect(await screen.findByText(tituloDe(1))).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.erro_servidor)).toBeNull();
    expect(botaoCarregarMais()).toBeNull();
  });

  it('sem conexão: o botão fica desabilitado e nenhuma página nova sai', async () => {
    const { servidor } = await abrir('/demandas');
    await screen.findByText(tituloDe(TOTAL));
    await act(async () => onlineManager.setOnline(false));

    try {
      const botao = await screen.findByRole('button', {
        name: textos.gerais.carregarMais,
      });
      expect(botao).toBeDisabled();
      expect(
        screen.getByText(textos.meusAnuncios.semConexaoParaCarregarMais),
      ).toBeOnTheScreen();
      await fireEvent.press(botao);
      await avancar();
      expect(requisicoes(servidor.fetch, 'GET', '/trampos/meus')).toHaveLength(
        1,
      );
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
  });
});
