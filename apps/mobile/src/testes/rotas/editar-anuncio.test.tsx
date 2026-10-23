// Rotas Editar trampo e Editar serviço (CA32, CA35), com o fake de `fetch`.
// O detalhe é um stub que consome o aviso de retorno, como o detalhe real
// fará na etapa 15: assim o teste prova que a edição deixa só a chave do
// aviso e volta.
import { onlineManager } from '@tanstack/react-query';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Pressable, Text } from 'react-native';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import RotaDeEditarServico from '../../app/(app)/servicos/editar/[id]';
import RotaDeEditarTrampo from '../../app/(app)/trampos/editar/[id]';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import {
  esquecerAvisoDeRetorno,
  useAvisoDeRetorno,
} from '../../estado/aviso-de-retorno';
import { chaves } from '../../estado/consultas/chaves';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { textosEPropriedades, vigiarConsole } from '../qa/apoio-qa';
import { renderizarRotas, TOKEN_DE_TESTE } from './apoio';

const t = textos.formularioDeAnuncio;
const a = textos.anuncio;

const CATEGORIAS = [
  { id: 'pintura', rotulo: 'Pintura e reparos' },
  { id: 'aulas', rotulo: 'Aulas e reforço' },
];

const PERFIL_COMPLETO = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

/** O trampo como o autor o lê (`versao` e contagem só vêm para ele). */
const TRAMPO = {
  id: 't1',
  autorId: 'conta-ana',
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'pintura',
  cidade: 'Lavras',
  valorCentavos: 150000,
  prazo: '2026-12-31',
  status: 'aberto',
  criadoEm: '2026-10-01T12:00:00.000Z',
  versao: 3,
  candidaturasRecebidas: 0,
};

const SERVICO = {
  id: 's1',
  autorId: 'conta-ana',
  titulo: 'Aulas de violão',
  descricao: 'Aulas para iniciantes, na sua casa.',
  categoria: 'aulas',
  cidade: null,
  precoBaseCentavos: 8000,
  status: 'ativo',
  criadoEm: '2026-10-01T12:00:00.000Z',
  versao: 7,
};

/** Visão de quem não é o autor: sem `versao` nem contagem. */
function semVisaoDoAutor<T extends { versao?: number }>(anuncio: T) {
  const {
    versao: _,
    candidaturasRecebidas: __,
    ...resto
  } = anuncio as T & {
    candidaturasRecebidas?: number;
  };
  return resto;
}

/**
 * Detalhe de teste: mostra o aviso de retorno quando volta a ter foco, com
 * um "Fechar" como o do toast.
 */
function stubDoDetalhe(tipo: string) {
  return function DetalheDeTeste() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { texto, limpar } = useAvisoDeRetorno(useIsFocused());
    return (
      <>
        <Text>{`detalhe ${tipo} ${id}: ${texto ?? 'sem aviso'}`}</Text>
        {texto === null ? null : (
          <Pressable accessibilityRole="button" onPress={limpar}>
            <Text>Fechar aviso</Text>
          </Pressable>
        )}
      </>
    );
  };
}

const ROTAS = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/trampos/[id]': stubDoDetalhe('trampo'),
  '(app)/trampos/editar/[id]': RotaDeEditarTrampo,
  '(app)/servicos/[id]': stubDoDetalhe('servico'),
  '(app)/servicos/editar/[id]': RotaDeEditarServico,
};

function criarFake(): FetchFalso {
  return criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /trampos/t1', { corpo: TRAMPO })
    .responder('PUT /trampos/t1', { status: 204 })
    .responder('GET /servicos/s1', { corpo: SERVICO })
    .responder('PUT /servicos/s1', { status: 204 });
}

async function abrir(url: string, fetch: FetchFalso = criarFake()) {
  return renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
}

/** Abre o detalhe e, por cima dele, a edição (como o "Editar" da folha). */
async function abrirPeloDetalhe(
  tipo: 'trampos' | 'servicos',
  id: string,
  fetch: FetchFalso = criarFake(),
) {
  const rotas = await abrir(`/${tipo}/${id}`, fetch);
  await screen.findByText(new RegExp(`^detalhe .* ${id}: sem aviso$`));
  await act(async () => {
    router.push(`/${tipo}/editar/${id}`);
  });
  await waitFor(() => expect(screen).toHavePathname(`/${tipo}/editar/${id}`));
  return rotas;
}

function requisicoes(fetch: FetchFalso, metodo: string, caminho: string) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

interface PropsDaTelaNativa {
  readonly preventNativeDismiss?: boolean;
  readonly onNativeDismissCancelled?: (evento: {
    nativeEvent: { dismissCount: number };
  }) => void;
}

interface NoDaArvore {
  readonly type?: unknown;
  readonly props?: Record<string, unknown>;
  readonly children?: readonly (NoDaArvore | string)[] | null;
}

/**
 * A tela nativa (`RNSScreen`) mais interna que contém o formulário de
 * edição: é nela que o native-stack liga `preventNativeDismiss`.
 */
function telaNativaDaEdicao(arvore: unknown): PropsDaTelaNativa {
  let achada: PropsDaTelaNativa | undefined;
  const contem = (no: unknown): boolean => {
    if (typeof no === 'string') return no === a.tituloEditarTrampo;
    if (Array.isArray(no)) return no.some(contem);
    if (typeof no !== 'object' || no === null) return false;
    return contem((no as NoDaArvore).children ?? []);
  };
  const visitar = (no: unknown) => {
    if (Array.isArray(no)) {
      for (const filho of no) visitar(filho);
      return;
    }
    if (typeof no !== 'object' || no === null) return;
    const { type, props, children } = no as NoDaArvore;
    if (type === 'RNSScreen' && contem(children ?? [])) {
      achada = props as PropsDaTelaNativa;
    }
    visitar(children ?? []);
  };
  visitar(arvore);
  if (achada === undefined) throw new Error('tela nativa da edição ausente');
  return achada;
}

const botaoSalvar = () =>
  screen.getByRole('button', { name: a.salvarAlteracoes });

async function digitar(rotulo: string, texto: string) {
  await fireEvent.changeText(screen.getByLabelText(rotulo), texto);
}

async function salvar() {
  await fireEvent.press(botaoSalvar());
}

const avancar = (ms = 50) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

vigiarConsole();

afterEach(() => {
  esquecerAvisoDeRetorno();
});

describe('Editar trampo (CA32)', () => {
  it('abre preenchido, com "Salvar alterações", e só pede o que precisa', async () => {
    const fetch = criarFake();
    await abrirPeloDetalhe('trampos', 't1', fetch);

    expect(await screen.findByDisplayValue('Pintar a sala')).toBeOnTheScreen();
    expect(screen.getByText(a.tituloEditarTrampo)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue('Pintar a sala');
    expect(screen.getByLabelText(t.descricao)).toHaveDisplayValue(
      'Duas demãos de tinta branca.',
    );
    expect(screen.getByLabelText(t.cidade)).toHaveDisplayValue('Lavras');
    expect(screen.getByLabelText(t.valor)).toHaveDisplayValue('1.500,00');
    expect(screen.getByLabelText(t.prazo)).toHaveDisplayValue('31/12/2026');
    expect(
      await screen.findByRole('button', {
        name: `${t.categoria}: Pintura e reparos`,
      }),
    ).toBeOnTheScreen();
    expect(botaoSalvar()).toBeEnabled();
    expect(screen.queryByText(t.avisoVisibilidade)).toBeNull();
    expect(screen.queryByText(a.naoEditavel)).toBeNull();

    // O detalhe é um stub: as leituras são todas da edição. O perfil e as
    // categorias vêm do formulário compartilhado com o publicar.
    expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(1);
    expect(requisicoes(fetch, 'GET', '/categorias')).toHaveLength(1);
    expect(requisicoes(fetch, 'GET', '/perfis/eu')).toHaveLength(1);
    expect(fetch.requisicoes).toHaveLength(3);
  });

  it('salva com a versao lida, volta ao detalhe e deixa "Alterações salvas."', async () => {
    const fetch = criarFake();
    await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');

    await digitar(t.titulo, '  Pintar a sala e o quarto  ');
    await digitar(t.prazo, '');
    await salvar();

    expect(
      await screen.findByText(`detalhe trampo t1: ${a.alteracoesSalvas}`),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/t1');
    expect(screen.queryByText(a.descartarTitulo)).toBeNull();

    const puts = requisicoes(fetch, 'PUT', '/trampos/t1');
    expect(puts).toHaveLength(1);
    // Prazo apagado não vai: a API entende como "sem prazo".
    expect(puts[0]?.corpo).toEqual({
      titulo: 'Pintar a sala e o quarto',
      descricao: 'Duas demãos de tinta branca.',
      categoria: 'pintura',
      cidade: 'Lavras',
      valorCentavos: 150000,
      versao: 3,
    });
    // O sucesso recarrega o detalhe antes de voltar.
    expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2);
  });

  it('o aviso aparece uma vez só: voltar ao detalhe de novo não o repete', async () => {
    await abrirPeloDetalhe('trampos', 't1');
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');
    await salvar();
    await screen.findByText(`detalhe trampo t1: ${a.alteracoesSalvas}`);
    await fireEvent.press(screen.getByRole('button', { name: 'Fechar aviso' }));
    await screen.findByText('detalhe trampo t1: sem aviso');

    await act(async () => {
      router.push('/trampos/editar/t1');
    });
    await screen.findByDisplayValue('Pintar a sala');
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

    // Sem alteração, sai sem perguntar e sem aviso novo.
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
    await avancar();
    expect(screen.getByText('detalhe trampo t1: sem aviso')).toBeOnTheScreen();
    expect(screen.queryByText(a.descartarTitulo)).toBeNull();
  });

  it('erro de campo (400) mostra o erro e mantém o rascunho', async () => {
    const fetch = criarFake().responder('PUT /trampos/t1', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'titulo', motivo: 'tamanho' }],
      },
    });
    await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');
    await digitar(t.descricao, 'Três demãos, com massa corrida.');

    await salvar();

    expect(
      await screen.findByText(textos.erros.titulo_tamanho),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/editar/t1');
    expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue(
      'Pintar a sala e o quarto',
    );
    expect(screen.getByLabelText(t.descricao)).toHaveDisplayValue(
      'Três demãos, com massa corrida.',
    );
    expect(botaoSalvar()).toBeEnabled();
  });

  it('429 mostra o limite de ações e mantém o rascunho; a nova tentativa salva', async () => {
    const fetch = criarFake().responder('PUT /trampos/t1', [
      { status: 429, corpo: { erro: 'muitas_tentativas' } },
      { status: 204 },
    ]);
    await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');

    await salvar();

    expect(
      await screen.findByText(textos.erros.muitas_tentativas_acao),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/editar/t1');
    expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue(
      'Pintar a sala e o quarto',
    );

    await salvar();
    await screen.findByText(`detalhe trampo t1: ${a.alteracoesSalvas}`);
    const puts = requisicoes(fetch, 'PUT', '/trampos/t1');
    expect(puts).toHaveLength(2);
    expect(puts[1]?.corpo).toEqual(puts[0]?.corpo);
  });

  it('falha de rede mostra "sem conexão" e mantém o rascunho', async () => {
    const fetch = criarFake().responder('PUT /trampos/t1', {
      falhaDeRede: true,
    });
    await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');

    await salvar();

    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/editar/t1');
    expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue(
      'Pintar a sala e o quarto',
    );
  });

  it('sem conexão, o botão fica desabilitado e o rascunho continua', async () => {
    const fetch = criarFake();
    await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');

    await act(async () => {
      onlineManager.setOnline(false);
    });
    try {
      expect(await screen.findByText(a.semConexaoParaSalvar)).toBeOnTheScreen();
      expect(botaoSalvar()).toBeDisabled();
      await salvar();
      expect(requisicoes(fetch, 'PUT', '/trampos/t1')).toHaveLength(0);
      expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue(
        'Pintar a sala e o quarto',
      );
    } finally {
      await act(async () => {
        onlineManager.setOnline(true);
      });
    }
    await salvar();
    await screen.findByText(`detalhe trampo t1: ${a.alteracoesSalvas}`);
  });

  it('409 de conflito: "Ver versão atual" traz a base nova, mantém o que a pessoa mexeu e salva com a versão nova', async () => {
    const versaoNova = {
      ...TRAMPO,
      descricao: 'Três demãos, mudado no outro aparelho.',
      valorCentavos: 180000,
      versao: 4,
    };
    const fetch = criarFake()
      .responder('GET /trampos/t1', [{ corpo: TRAMPO }, { corpo: versaoNova }])
      .responder('PUT /trampos/t1', [
        { status: 409, corpo: { erro: 'conflito_de_versao' } },
        { status: 204 },
      ]);
    await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');

    await salvar();

    expect(await screen.findByText(a.conflito)).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/editar/t1');
    expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue(
      'Pintar a sala e o quarto',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: a.verVersaoAtual }),
    );

    await waitFor(() => expect(screen.queryByText(a.conflito)).toBeNull());
    expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2);
    // O que a pessoa mexeu fica; o resto vem da versão atual.
    expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue(
      'Pintar a sala e o quarto',
    );
    expect(screen.getByLabelText(t.descricao)).toHaveDisplayValue(
      'Três demãos, mudado no outro aparelho.',
    );
    expect(screen.getByLabelText(t.valor)).toHaveDisplayValue('1.800,00');

    await salvar();
    await screen.findByText(`detalhe trampo t1: ${a.alteracoesSalvas}`);
    const puts = requisicoes(fetch, 'PUT', '/trampos/t1');
    expect(puts).toHaveLength(2);
    expect(puts[0]?.corpo).toMatchObject({ versao: 3 });
    expect(puts[1]?.corpo).toEqual({
      titulo: 'Pintar a sala e o quarto',
      descricao: 'Três demãos, mudado no outro aparelho.',
      categoria: 'pintura',
      cidade: 'Lavras',
      valorCentavos: 180000,
      prazo: '2026-12-31',
      versao: 4,
    });
  });

  it('409 de conflito com a recarga falhando mantém o aviso e o rascunho', async () => {
    const fetch = criarFake()
      .responder('GET /trampos/t1', [
        { corpo: TRAMPO },
        { status: 500, corpo: { erro: 'erro_interno' } },
      ])
      .responder('PUT /trampos/t1', {
        status: 409,
        corpo: { erro: 'conflito_de_versao' },
      });
    await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');
    await salvar();
    await screen.findByText(a.conflito);

    await fireEvent.press(
      screen.getByRole('button', { name: a.verVersaoAtual }),
    );
    await waitFor(() =>
      expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2),
    );
    await avancar();

    expect(screen.getByText(a.conflito)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue(
      'Pintar a sala e o quarto',
    );
    // "Cancelar" fecha o aviso sem recarregar.
    await fireEvent.press(
      screen.getByRole('button', { name: a.dispensarConflito }),
    );
    expect(screen.queryByText(a.conflito)).toBeNull();
    expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2);
  });

  it('409 trampo_nao_editavel mostra o aviso e desabilita os campos', async () => {
    const fetch = criarFake().responder('PUT /trampos/t1', {
      status: 409,
      corpo: { erro: 'trampo_nao_editavel' },
    });
    await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');

    await salvar();

    expect(await screen.findByText(a.naoEditavel)).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/editar/t1');
    expect(screen.getByLabelText(t.titulo).props.editable).toBe(false);
    expect(screen.getByLabelText(t.descricao).props.editable).toBe(false);
    expect(screen.getByLabelText(t.prazo).props.editable).toBe(false);
    expect(botaoSalvar()).toBeDisabled();
    await salvar();
    expect(requisicoes(fetch, 'PUT', '/trampos/t1')).toHaveLength(1);
  });

  it.each([
    [
      'com candidaturas',
      { candidaturasRecebidas: 2 },
      a.motivoEditarComCandidaturas,
    ],
    [
      'em andamento',
      { status: 'em_andamento', candidaturasRecebidas: 1 },
      a.motivoEditarEmAndamento,
    ],
    ['encerrado', { status: 'encerrado' }, a.motivoEditarEncerrado],
  ])(
    'trampo %s abre não editável, com o motivo específico e os campos desabilitados',
    async (_nome, mudanca, motivo) => {
      const fetch = criarFake().responder('GET /trampos/t1', {
        corpo: { ...TRAMPO, ...mudanca },
      });
      await abrirPeloDetalhe('trampos', 't1', fetch);

      expect(await screen.findByText(motivo)).toBeOnTheScreen();
      // O texto genérico é só para quando a base não diz o motivo.
      expect(screen.queryByText(a.naoEditavel)).toBeNull();
      expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue(
        'Pintar a sala',
      );
      expect(screen.getByLabelText(t.titulo).props.editable).toBe(false);
      expect(screen.getByLabelText(t.valor).props.editable).toBe(false);
      expect(botaoSalvar()).toBeDisabled();
      await salvar();
      expect(requisicoes(fetch, 'PUT', '/trampos/t1')).toHaveLength(0);
    },
  );

  it('trampo inexistente (404) mostra "não encontrado"', async () => {
    const fetch = criarFake().responder('GET /trampos/t1', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrirPeloDetalhe('trampos', 't1', fetch);

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(t.titulo)).toBeNull();
    expect(
      screen.queryByRole('button', { name: a.salvarAlteracoes }),
    ).toBeNull();
  });

  it('trampo de outra conta (sem versao) mostra "não encontrado" e não envia nada', async () => {
    const fetch = criarFake().responder('GET /trampos/t1', {
      corpo: semVisaoDoAutor(TRAMPO),
    });
    await abrirPeloDetalhe('trampos', 't1', fetch);

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(t.titulo)).toBeNull();
    expect(screen.queryByText('Pintar a sala')).toBeNull();
    expect(requisicoes(fetch, 'PUT', '/trampos/t1')).toHaveLength(0);
  });

  it('erro ao carregar mostra "Tentar de novo", que recarrega', async () => {
    const fetch = criarFake().responder('GET /trampos/t1', [
      { status: 500, corpo: { erro: 'erro_interno' } },
      { corpo: TRAMPO },
    ]);
    await abrirPeloDetalhe('trampos', 't1', fetch);

    expect(await screen.findByText(a.erroAoCarregar)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );

    expect(await screen.findByDisplayValue('Pintar a sala')).toBeOnTheScreen();
    expect(requisicoes(fetch, 'GET', '/trampos/t1')).toHaveLength(2);
  });
});

describe('a base da edição não muda por baixo (R1)', () => {
  it('trampo: a versão nova que a consulta recebe não entra no PUT; o 409 abre o aviso e "Ver versão atual" adota a nova', async () => {
    const maisNovo = {
      ...TRAMPO,
      versao: 4,
      descricao: 'Mudado em outro aparelho.',
    };
    const fetch = criarFake()
      .responder('GET /trampos/t1', [{ corpo: TRAMPO }, { corpo: maisNovo }])
      .responder('PUT /trampos/t1', [
        { status: 409, corpo: { erro: 'conflito_de_versao' } },
        { status: 204 },
      ]);
    const { queryClient } = await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');

    // Foco, reconexão ou `staleTime`: a consulta recebe a versão 4.
    await act(async () => {
      queryClient.setQueryData(chaves.trampo('t1'), maisNovo);
    });
    await avancar();
    expect(screen.getByLabelText(t.descricao)).toHaveDisplayValue(
      TRAMPO.descricao,
    );

    await salvar();
    expect(await screen.findByText(a.conflito)).toBeOnTheScreen();
    expect(requisicoes(fetch, 'PUT', '/trampos/t1')[0]?.corpo).toMatchObject({
      descricao: TRAMPO.descricao,
      versao: 3,
    });

    await fireEvent.press(
      screen.getByRole('button', { name: a.verVersaoAtual }),
    );
    await waitFor(() => expect(screen.queryByText(a.conflito)).toBeNull());
    expect(screen.getByLabelText(t.descricao)).toHaveDisplayValue(
      'Mudado em outro aparelho.',
    );
    await salvar();
    await screen.findByText(`detalhe trampo t1: ${a.alteracoesSalvas}`);
    expect(requisicoes(fetch, 'PUT', '/trampos/t1')[1]?.corpo).toMatchObject({
      titulo: 'Pintar a sala e o quarto',
      descricao: 'Mudado em outro aparelho.',
      versao: 4,
    });
  });

  it('serviço: a versão nova que a consulta recebe não entra no PUT', async () => {
    const fetch = criarFake().responder('PUT /servicos/s1', {
      status: 409,
      corpo: { erro: 'conflito_de_versao' },
    });
    const { queryClient } = await abrirPeloDetalhe('servicos', 's1', fetch);
    await screen.findByDisplayValue('Aulas de violão');
    await digitar(t.titulo, 'Aulas de violão e cavaquinho');

    await act(async () => {
      queryClient.setQueryData(chaves.servico('s1'), {
        ...SERVICO,
        versao: 8,
        descricao: 'Mudado em outro aparelho.',
      });
    });
    await avancar();
    expect(screen.getByLabelText(t.descricao)).toHaveDisplayValue(
      SERVICO.descricao,
    );

    await salvar();
    expect(await screen.findByText(a.conflito)).toBeOnTheScreen();
    expect(requisicoes(fetch, 'PUT', '/servicos/s1')[0]?.corpo).toMatchObject({
      versao: 7,
    });
  });
});

describe('Descartar alterações? (CA32)', () => {
  it('"Voltar" com alteração pergunta; "Continuar editando" fica e "Descartar" sai', async () => {
    const fetch = criarFake();
    await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

    expect(await screen.findByText(a.descartarTitulo)).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/editar/t1');
    await fireEvent.press(
      screen.getByRole('button', { name: a.continuarEditando }),
    );
    await waitFor(() =>
      expect(screen.queryByText(a.descartarTitulo)).toBeNull(),
    );
    expect(screen).toHavePathname('/trampos/editar/t1');
    expect(screen.getByLabelText(t.titulo)).toHaveDisplayValue(
      'Pintar a sala e o quarto',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: a.descartar }),
    );

    expect(
      await screen.findByText('detalhe trampo t1: sem aviso'),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/t1');
    expect(requisicoes(fetch, 'PUT', '/trampos/t1')).toHaveLength(0);
  });

  it('o voltar do sistema (ação de navegação) também pergunta', async () => {
    await abrirPeloDetalhe('trampos', 't1');
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.descricao, 'Três demãos, com massa corrida.');

    // `router.back()` despacha a mesma ação que o botão de voltar do
    // Android: quem a segura é o `beforeRemove`, não o botão da tela.
    await act(async () => {
      router.back();
    });

    expect(await screen.findByText(a.descartarTitulo)).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/editar/t1');
    await fireEvent.press(screen.getByRole('button', { name: a.descartar }));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
  });

  it('o gesto de voltar do iOS é segurado no nativo e também pergunta', async () => {
    const { toJSON } = await abrirPeloDetalhe('trampos', 't1');
    await screen.findByDisplayValue('Pintar a sala');
    expect(telaNativaDaEdicao(toJSON()).preventNativeDismiss).toBeFalsy();

    await digitar(t.titulo, 'Pintar a sala e o quarto');

    // Sem isto, o native-stack deixaria a tela sair no nativo e só depois
    // avisaria o JS, que não consegue mais segurar.
    const tela = telaNativaDaEdicao(toJSON());
    expect(tela.preventNativeDismiss).toBe(true);
    // O que o react-native-screens chama quando o gesto é cancelado.
    await act(async () => {
      tela.onNativeDismissCancelled?.({ nativeEvent: { dismissCount: 1 } });
    });

    expect(await screen.findByText(a.descartarTitulo)).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/editar/t1');
    await fireEvent.press(
      screen.getByRole('button', { name: a.continuarEditando }),
    );
    await digitar(t.titulo, 'Pintar a sala');
    expect(telaNativaDaEdicao(toJSON()).preventNativeDismiss).toBeFalsy();
  });

  it('sem alteração, ou depois de desfazer a alteração, sai sem perguntar', async () => {
    await abrirPeloDetalhe('trampos', 't1');
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');
    await digitar(t.titulo, 'Pintar a sala');

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

    await waitFor(() => expect(screen).toHavePathname('/trampos/t1'));
    expect(screen.queryByText(a.descartarTitulo)).toBeNull();
  });

  it('aberta direto pelo link, volta ao detalhe (e ainda pergunta antes)', async () => {
    await abrir('/trampos/editar/t1');
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: a.descartar }),
    );

    expect(
      await screen.findByText('detalhe trampo t1: sem aviso'),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/trampos/t1');
  });

  it('a sessão que expira ao salvar leva à entrada sem perguntar', async () => {
    const fetch = criarFake().responder('PUT /trampos/t1', {
      status: 401,
      corpo: { erro: 'nao_autenticado' },
    });
    await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, 'Pintar a sala e o quarto');

    await salvar();

    await waitFor(() => expect(screen).toHavePathname('/entrar'));
    expect(screen.queryByText(a.descartarTitulo)).toBeNull();
    expect(screen.queryByDisplayValue('Pintar a sala e o quarto')).toBeNull();
  });
});

describe('Editar serviço (CA32)', () => {
  it('abre preenchido, sem prazo e com a cidade vazia (D7)', async () => {
    const fetch = criarFake();
    await abrirPeloDetalhe('servicos', 's1', fetch);

    expect(
      await screen.findByDisplayValue('Aulas de violão'),
    ).toBeOnTheScreen();
    expect(screen.getByText(a.tituloEditarServico)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.precoBase)).toHaveDisplayValue('80,00');
    // Sem cidade no serviço, o campo não puxa a do perfil.
    expect(screen.getByLabelText(t.cidadeOpcional)).toHaveDisplayValue('');
    expect(screen.queryByLabelText(t.prazo)).toBeNull();
    expect(
      await screen.findByRole('button', {
        name: `${t.categoria}: Aulas e reforço`,
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(a.naoEditavel)).toBeNull();
    expect(botaoSalvar()).toBeEnabled();
    expect(requisicoes(fetch, 'GET', '/servicos/s1')).toHaveLength(1);
  });

  it('salva com a versao lida, volta ao detalhe e deixa "Alterações salvas."', async () => {
    const fetch = criarFake().responder('GET /servicos/s1', {
      corpo: { ...SERVICO, cidade: 'Lavras' },
    });
    await abrirPeloDetalhe('servicos', 's1', fetch);
    await screen.findByDisplayValue('Aulas de violão');

    await digitar(t.precoBase, '95');
    await digitar(t.cidadeOpcional, '  ');
    await salvar();

    expect(
      await screen.findByText(`detalhe servico s1: ${a.alteracoesSalvas}`),
    ).toBeOnTheScreen();
    const puts = requisicoes(fetch, 'PUT', '/servicos/s1');
    expect(puts).toHaveLength(1);
    // Cidade em branco não vai: o serviço fica sem cidade (D7).
    expect(puts[0]?.corpo).toEqual({
      titulo: 'Aulas de violão',
      descricao: 'Aulas para iniciantes, na sua casa.',
      categoria: 'aulas',
      precoBaseCentavos: 9500,
      versao: 7,
    });
  });

  it('409 de conflito e "Ver versão atual", como no trampo', async () => {
    const fetch = criarFake()
      .responder('GET /servicos/s1', [
        { corpo: SERVICO },
        { corpo: { ...SERVICO, titulo: 'Aulas de violão e canto', versao: 8 } },
      ])
      .responder('PUT /servicos/s1', [
        { status: 409, corpo: { erro: 'conflito_de_versao' } },
        { status: 204 },
      ]);
    await abrirPeloDetalhe('servicos', 's1', fetch);
    await screen.findByDisplayValue('Aulas de violão');
    await digitar(t.precoBase, '95');
    await salvar();
    await screen.findByText(a.conflito);

    await fireEvent.press(
      screen.getByRole('button', { name: a.verVersaoAtual }),
    );
    expect(
      await screen.findByDisplayValue('Aulas de violão e canto'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(t.precoBase)).toHaveDisplayValue('95');

    await salvar();
    await screen.findByText(`detalhe servico s1: ${a.alteracoesSalvas}`);
    expect(requisicoes(fetch, 'PUT', '/servicos/s1')[1]?.corpo).toMatchObject({
      titulo: 'Aulas de violão e canto',
      precoBaseCentavos: 9500,
      versao: 8,
    });
  });

  it('429 e erro de campo mantêm o rascunho', async () => {
    const fetch = criarFake().responder('PUT /servicos/s1', [
      { status: 429, corpo: { erro: 'muitas_tentativas' } },
      {
        status: 400,
        corpo: {
          erro: 'dados_invalidos',
          campos: [{ campo: 'precoBaseCentavos', motivo: 'invalido' }],
        },
      },
    ]);
    await abrirPeloDetalhe('servicos', 's1', fetch);
    await screen.findByDisplayValue('Aulas de violão');
    await digitar(t.descricao, 'Aulas para iniciantes e intermediários.');

    await salvar();
    await screen.findByText(textos.erros.muitas_tentativas_acao);
    await salvar();
    await waitFor(() =>
      expect(requisicoes(fetch, 'PUT', '/servicos/s1')).toHaveLength(2),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(textos.erros.muitas_tentativas_acao),
      ).toBeNull(),
    );

    expect(screen).toHavePathname('/servicos/editar/s1');
    expect(screen.getByLabelText(t.descricao)).toHaveDisplayValue(
      'Aulas para iniciantes e intermediários.',
    );
  });

  it.each([
    ['inexistente (404)', { status: 404, corpo: { erro: 'nao_encontrado' } }],
    ['de outra conta (sem versao)', { corpo: semVisaoDoAutor(SERVICO) }],
  ])('serviço %s mostra "não encontrado"', async (_nome, resposta) => {
    const fetch = criarFake().responder('GET /servicos/s1', resposta);
    await abrirPeloDetalhe('servicos', 's1', fetch);

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(t.titulo)).toBeNull();
    expect(screen.queryByText('Aulas de violão')).toBeNull();
  });

  it('voltar com alteração pergunta antes de sair', async () => {
    await abrirPeloDetalhe('servicos', 's1');
    await screen.findByDisplayValue('Aulas de violão');
    await digitar(t.titulo, 'Aulas de violão e canto');

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

    expect(await screen.findByText(a.descartarTitulo)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: a.descartar }));
    expect(
      await screen.findByText('detalhe servico s1: sem aviso'),
    ).toBeOnTheScreen();
  });
});

describe('o rascunho da edição não vaza (CA35)', () => {
  const SENTINELA = 'Sentinela Rascunho 7Q2X';

  it('não vai para a URL, para atributos da árvore, para o aviso de retorno nem fica no cache de mutações', async () => {
    const fetch = criarFake().responder('PUT /trampos/t1', [
      { status: 429, corpo: { erro: 'muitas_tentativas' } },
      { status: 204 },
    ]);
    const { queryClient, toJSON, getPathnameWithParams } =
      await abrirPeloDetalhe('trampos', 't1', fetch);
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, SENTINELA);
    await digitar(t.descricao, `${SENTINELA} na descrição.`);

    await salvar();
    await screen.findByText(textos.erros.muitas_tentativas_acao);

    const naUrl = (texto: string) =>
      [
        texto,
        encodeURIComponent(texto),
        encodeURIComponent(texto).replace(/%20/g, '+'),
      ].some((forma) => getPathnameWithParams().includes(forma));
    expect(naUrl(SENTINELA)).toBe(false);
    // Na árvore, só no `value` dos campos (é o que a pessoa vê).
    const fora = textosEPropriedades(toJSON()).filter(
      (texto) =>
        texto.includes(SENTINELA) &&
        texto !== SENTINELA &&
        texto !== `${SENTINELA} na descrição.`,
    );
    expect(fora).toEqual([]);

    await salvar();
    await screen.findByText(`detalhe trampo t1: ${a.alteracoesSalvas}`);
    expect(naUrl(SENTINELA)).toBe(false);
    // A rota saiu: a mutação (com o corpo do `PUT`) deixa o cache.
    await avancar();
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state),
      ),
    ).not.toContain(SENTINELA);
    expect(textosEPropriedades(toJSON()).join('\n')).not.toContain(SENTINELA);
  });

  it('descartar some com o rascunho', async () => {
    const { queryClient, toJSON } = await abrirPeloDetalhe('trampos', 't1');
    await screen.findByDisplayValue('Pintar a sala');
    await digitar(t.titulo, SENTINELA);

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: a.descartar }),
    );
    await screen.findByText('detalhe trampo t1: sem aviso');
    await avancar();

    expect(textosEPropriedades(toJSON()).join('\n')).not.toContain(SENTINELA);
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(SENTINELA);
  });
});
