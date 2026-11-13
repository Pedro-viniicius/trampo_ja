import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text, TextInput } from 'react-native';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import LayoutDasAbas from '../../app/(app)/(abas)/_layout';
import RotaDePublicar from '../../app/(app)/publicar';
import RotaDeOfertarServico from '../../app/(app)/servicos/novo';
import RotaDePublicarTrampo from '../../app/(app)/trampos/novo';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import {
  useMeusServicos,
  useMeusTrampos,
} from '../../estado/consultas/anuncios';
import { useBusca } from '../../estado/consultas/busca';
import { chaves } from '../../estado/consultas/chaves';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { abasDeStub, renderizarRotas, TOKEN_DE_TESTE } from './apoio';

const t = textos.formularioDeAnuncio;

const CATEGORIAS = [
  { id: 'pintura', rotulo: 'Pintura e reparos' },
  { id: 'limpeza', rotulo: 'Limpeza' },
];

const PERFIL_COMPLETO = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

const BUSCA_VAZIA = { corpo: { itens: [], proximoCursor: null } };

function stub(nome: string) {
  return function Stub() {
    return <Text>{nome}</Text>;
  };
}

/**
 * Observa a busca, Meus trampos e Meus serviços durante o teste: consulta
 * observada é consulta recarregada quando a mutação a invalida (CA4).
 */
function SondaDeCaches() {
  const busca = useBusca({ tipo: 'trampos' });
  const { trampos } = useMeusTrampos();
  const { servicos } = useMeusServicos();
  return (
    <Text testID="sonda">
      {`busca=${busca.itens.length} meus=${trampos?.length ?? '-'} servicos=${servicos?.length ?? '-'}`}
    </Text>
  );
}

function LayoutComSonda() {
  return (
    <>
      <SondaDeCaches />
      <LayoutDaAreaAutenticada />
    </>
  );
}

const ROTAS = {
  '(app)/_layout': LayoutComSonda,
  '(app)/(abas)/_layout': LayoutDasAbas,
  ...abasDeStub(),
  '(app)/(abas)/index': stub('stub: início'),
  '(app)/(abas)/buscar': stub('stub: buscar'),
  '(app)/(abas)/conversas': stub('stub: conversas'),
  '(app)/(abas)/perfil': stub('stub: perfil'),
  '(app)/publicar': RotaDePublicar,
  '(app)/perfil/editar': stub('stub: editar perfil'),
  '(app)/trampos/novo': RotaDePublicarTrampo,
  '(app)/trampos/[id]': stub('stub: detalhe do trampo'),
  '(app)/servicos/novo': RotaDeOfertarServico,
  '(app)/servicos/[id]': stub('stub: detalhe do serviço'),
};

function criarFake(): FetchFalso {
  return criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /busca', BUSCA_VAZIA)
    .responder('GET /trampos/meus', { corpo: [] })
    .responder('GET /servicos/meus', { corpo: [] });
}

async function abrir(url: string, fetch: FetchFalso = criarFake()) {
  const resultado = await renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
  return { ...resultado, fetch };
}

function contar(fetch: FetchFalso, metodo: string, caminho: string): number {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  ).length;
}

function posts(fetch: FetchFalso, caminho: string) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === 'POST' && r.caminho === caminho,
  );
}

const avancar = (ms = 50) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

async function digitar(rotulo: string, texto: string) {
  await fireEvent.changeText(screen.getByLabelText(rotulo), texto);
}

async function escolherCategoria(rotulo: string) {
  await fireEvent.press(
    screen.getByRole('button', {
      name: `${t.categoria}: ${t.escolherCategoria}`,
    }),
  );
  await fireEvent.press(await screen.findByRole('button', { name: rotulo }));
}

/** Preenche o trampo válido; a cidade já vem do perfil. */
async function preencherTrampo(sobrescrever: { titulo?: string } = {}) {
  await screen.findByDisplayValue('Lavras');
  await digitar(t.titulo, sobrescrever.titulo ?? 'Pintar a sala');
  await digitar(t.descricao, 'Duas demãos de tinta branca.');
  await escolherCategoria('Pintura e reparos');
  await digitar(t.valor, '1.500,00');
  await digitar(t.prazo, '31/12/2026');
}

const botaoPublicarTrampo = () =>
  screen.getByRole('button', { name: t.publicarTrampo });
const botaoOfertarServico = () =>
  screen.getByRole('button', { name: t.ofertarServico });

async function esperarSonda(texto: string) {
  await waitFor(() =>
    expect(screen.getByTestId('sonda')).toHaveTextContent(new RegExp(texto)),
  );
}

describe('Publicar deixou de ser aba (CA76, CA77)', () => {
  it('a barra não tem Publicar, e /publicar abre o formulário de trampo', async () => {
    await abrir('/');
    await screen.findByText('stub: início');

    const nomes: string[] = [
      textos.abas.inicio,
      textos.abas.meusTrampos,
      textos.abas.conversas,
      textos.abas.perfil,
    ];
    const naBarra = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string)
      .filter((nome) => [...nomes, textos.abas.publicar].includes(nome));
    expect(naBarra).toEqual(nomes);

    await act(async () => router.push('/publicar'));
    await waitFor(() => expect(screen).toHavePathname('/trampos/novo'));
    expect(await screen.findByLabelText(t.prazo)).toBeOnTheScreen();
    expect(screen.queryByText(textos.escolhaDePublicacao.pergunta)).toBeNull();
    expect(screen.queryByText('stub: detalhe do trampo')).toBeNull();
  });

  it('o link /publicar aberto de fora também leva ao formulário de trampo', async () => {
    await abrir('/publicar');

    await waitFor(() => expect(screen).toHavePathname('/trampos/novo'));
    expect(await screen.findByLabelText(t.prazo)).toBeOnTheScreen();
    expect(screen.queryByLabelText(t.precoBase)).toBeNull();
  });

  it('/trampos/novo e /servicos/novo ganham de /trampos/[id] e /servicos/[id]', async () => {
    await abrir('/servicos/novo');
    expect(await screen.findByLabelText(t.precoBase)).toBeOnTheScreen();
    expect(screen.queryByText('stub: detalhe do serviço')).toBeNull();
  });
});

describe('publicar trampo (CA4)', () => {
  it('envia só as chaves certas, confirma, atualiza a busca e Meus trampos e "Ver trampo" navega', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 201,
      corpo: { id: 't-novo', status: 'aberto' },
    });
    await abrir('/trampos/novo', fetch);
    await esperarSonda('busca=0 meus=0');
    expect(contar(fetch, 'GET', '/busca')).toBe(1);
    expect(contar(fetch, 'GET', '/trampos/meus')).toBe(1);

    await preencherTrampo();
    // Depois da publicação a lista já tem o trampo novo.
    fetch.responder('GET /trampos/meus', {
      corpo: [{ id: 't-novo' }],
    });
    fetch.responder('GET /busca', {
      corpo: {
        itens: [
          {
            tipo: 'trampo',
            id: 't-novo',
            autorId: 'c1',
            titulo: 'Pintar a sala',
            categoria: 'pintura',
            cidade: 'Lavras',
            criadoEm: '2026-10-21T12:00:00.000Z',
            valorCentavos: 150000,
          },
        ],
        proximoCursor: null,
      },
    });
    await fireEvent.press(botaoPublicarTrampo());

    expect(await screen.findByText(t.publicadoTrampo)).toBeOnTheScreen();
    const enviados = posts(fetch, '/trampos');
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.corpo).toEqual({
      titulo: 'Pintar a sala',
      descricao: 'Duas demãos de tinta branca.',
      categoria: 'pintura',
      cidade: 'Lavras',
      valorCentavos: 150000,
      prazo: '2026-12-31',
    });
    expect(enviados[0]?.cabecalhos.authorization).toBe(
      `Bearer ${TOKEN_DE_TESTE}`,
    );

    // A confirmação só aparece depois das listas recarregadas.
    expect(contar(fetch, 'GET', '/busca')).toBe(2);
    expect(contar(fetch, 'GET', '/trampos/meus')).toBe(2);
    await esperarSonda('busca=1 meus=1');

    await fireEvent.press(screen.getByRole('button', { name: t.verTrampo }));
    await waitFor(() => expect(screen).toHavePathname('/trampos/t-novo'));
    expect(
      await screen.findByText('stub: detalhe do trampo'),
    ).toBeOnTheScreen();
  });

  it('sem prazo, a chave `prazo` não vai no corpo', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 201,
      corpo: { id: 't1', status: 'aberto' },
    });
    await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await digitar(t.prazo, '');
    await fireEvent.press(botaoPublicarTrampo());
    await screen.findByText(t.publicadoTrampo);
    expect(posts(fetch, '/trampos')[0]?.corpo).not.toHaveProperty('prazo');
  });

  it('o prazo ganha as barras enquanto a pessoa digita (D3)', async () => {
    await abrir('/trampos/novo');
    await screen.findByDisplayValue('Lavras');
    const prazo = () => screen.getByLabelText(t.prazo).props.value;

    await digitar(t.prazo, '3');
    expect(prazo()).toBe('3');
    await digitar(t.prazo, '311');
    expect(prazo()).toBe('31/1');
    await digitar(t.prazo, '31/122');
    expect(prazo()).toBe('31/12/2');
    await digitar(t.prazo, '31/12/20261');
    expect(prazo()).toBe('31/12/2026');
    // Apagar a barra apaga junto o que vinha antes dela.
    await digitar(t.prazo, '31/');
    expect(prazo()).toBe('31');
    await digitar(t.prazo, 'abc');
    expect(prazo()).toBe('');
  });

  it('o prazo mascarado vai como ISO', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 201,
      corpo: { id: 't1', status: 'aberto' },
    });
    await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await digitar(t.prazo, '01022027');
    await fireEvent.press(botaoPublicarTrampo());
    await screen.findByText(t.publicadoTrampo);
    expect(posts(fetch, '/trampos')[0]?.corpo).toHaveProperty(
      'prazo',
      '2027-02-01',
    );
  });

  it('reformata o valor e o prazo ao sair do campo', async () => {
    await abrir('/trampos/novo');
    await screen.findByDisplayValue('Lavras');

    await digitar(t.valor, '1500');
    await fireEvent(screen.getByLabelText(t.valor), 'blur');
    expect(screen.getByLabelText(t.valor).props.value).toBe('1.500,00');

    await digitar(t.prazo, '31122026');
    await fireEvent(screen.getByLabelText(t.prazo), 'blur');
    expect(screen.getByLabelText(t.prazo).props.value).toBe('31/12/2026');
  });

  it('valor inválido ao sair do campo mostra o erro e não reformata', async () => {
    await abrir('/trampos/novo');
    await screen.findByDisplayValue('Lavras');

    await digitar(t.valor, '0');
    await fireEvent(screen.getByLabelText(t.valor), 'blur');
    expect(
      await screen.findByText(textos.erros.valor_invalido),
    ).toBeOnTheScreen();

    await digitar(t.prazo, '31/02/2026');
    await fireEvent(screen.getByLabelText(t.prazo), 'blur');
    expect(
      await screen.findByText(textos.erros.prazo_invalido),
    ).toBeOnTheScreen();
  });

  it('"Publicar outro" limpa o formulário e devolve a cidade do perfil', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 201,
      corpo: { id: 't1', status: 'aberto' },
    });
    await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await digitar(t.cidade, 'Perdões');
    await fireEvent.press(botaoPublicarTrampo());
    await screen.findByText(t.publicadoTrampo);

    await fireEvent.press(
      screen.getByRole('button', { name: t.publicarOutro }),
    );

    expect(await screen.findByLabelText(t.titulo)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.titulo).props.value).toBe('');
    expect(screen.getByLabelText(t.descricao).props.value).toBe('');
    expect(screen.getByLabelText(t.valor).props.value).toBe('');
    expect(screen.getByLabelText(t.prazo).props.value).toBe('');
    expect(screen.getByLabelText(t.cidade).props.value).toBe('Lavras');
    expect(
      screen.getByRole('button', {
        name: `${t.categoria}: ${t.escolherCategoria}`,
      }),
    ).toBeOnTheScreen();
  });
});

describe('validação (CA5)', () => {
  it('título de 4 caracteres não envia, mostra o erro e leva o foco ao título', async () => {
    const fetch = criarFake();
    await abrir('/trampos/novo', fetch);
    await preencherTrampo({ titulo: 'Pint' });
    const foco = jest.spyOn(TextInput.prototype, 'focus');
    foco.mockClear();

    await fireEvent.press(botaoPublicarTrampo());

    expect(
      await screen.findByText(textos.erros.titulo_tamanho),
    ).toBeOnTheScreen();
    expect(posts(fetch, '/trampos')).toHaveLength(0);
    expect(foco).toHaveBeenCalled();
    expect(foco.mock.contexts[0]).toHaveProperty(
      'props.accessibilityLabel',
      t.titulo,
    );
    foco.mockRestore();
  });

  it('o segundo envio recusado com o mesmo erro leva o foco ao título de novo (D2)', async () => {
    const fetch = criarFake();
    await abrir('/trampos/novo', fetch);
    await preencherTrampo({ titulo: 'Pint' });
    await fireEvent.press(botaoPublicarTrampo());
    await screen.findByText(textos.erros.titulo_tamanho);
    const foco = jest.spyOn(TextInput.prototype, 'focus');
    foco.mockClear();

    await fireEvent.press(botaoPublicarTrampo());
    await avancar();

    expect(foco).toHaveBeenCalledTimes(1);
    expect(foco.mock.contexts[0]).toHaveProperty(
      'props.accessibilityLabel',
      t.titulo,
    );
    expect(posts(fetch, '/trampos')).toHaveLength(0);
    foco.mockRestore();
  });

  it('o 400 da API repetido leva o foco ao campo de novo (D2)', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'titulo', motivo: 'tamanho' }],
      },
    });
    await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await fireEvent.press(botaoPublicarTrampo());
    await screen.findByText(textos.erros.titulo_tamanho);
    const foco = jest.spyOn(TextInput.prototype, 'focus');
    foco.mockClear();

    // A pessoa não mexe no título e tenta de novo: a API recusa igual.
    await fireEvent.press(botaoPublicarTrampo());
    await waitFor(() => expect(posts(fetch, '/trampos')).toHaveLength(2));
    await waitFor(() => expect(foco).toHaveBeenCalledTimes(1));
    expect(foco.mock.contexts[0]).toHaveProperty(
      'props.accessibilityLabel',
      t.titulo,
    );
    foco.mockRestore();
  });

  it('título curto mostra o erro ao sair do campo', async () => {
    await abrir('/trampos/novo');
    await screen.findByDisplayValue('Lavras');
    await digitar(t.titulo, 'Pint');
    await fireEvent(screen.getByLabelText(t.titulo), 'blur');
    expect(
      await screen.findByText(textos.erros.titulo_tamanho),
    ).toBeOnTheScreen();
  });

  it('formulário vazio aponta todos os campos obrigatórios e não envia', async () => {
    const fetch = criarFake();
    await abrir('/trampos/novo', fetch);
    await screen.findByDisplayValue('Lavras');
    await digitar(t.cidade, '');

    await fireEvent.press(botaoPublicarTrampo());

    expect(
      await screen.findByText(textos.erros.titulo_tamanho),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.erros.descricao_trampo_obrigatoria),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.erros.categoria_obrigatoria),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(textos.erros.cidade_anuncio_obrigatoria),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.valor_invalido)).toBeOnTheScreen();
    expect(posts(fetch, '/trampos')).toHaveLength(0);
  });

  it('o erro do campo some quando a pessoa volta a digitar nele', async () => {
    await abrir('/trampos/novo');
    await preencherTrampo({ titulo: 'Pint' });
    await fireEvent.press(botaoPublicarTrampo());
    await screen.findByText(textos.erros.titulo_tamanho);

    await digitar(t.titulo, 'Pintar');

    expect(screen.queryByText(textos.erros.titulo_tamanho)).toBeNull();
  });

  it('400 da API com `campos` mostra o erro em cada campo e mantém o rascunho', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [
          { campo: 'titulo', motivo: 'tamanho' },
          { campo: 'valorCentavos', motivo: 'invalido' },
          { campo: 'prazo', motivo: 'invalido' },
        ],
      },
    });
    await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await fireEvent.press(botaoPublicarTrampo());

    expect(
      await screen.findByText(textos.erros.titulo_tamanho),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.valor_invalido)).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.prazo_invalido)).toBeOnTheScreen();
    expect(screen.queryByText(t.publicadoTrampo)).toBeNull();
    expect(screen.getByLabelText(t.titulo).props.value).toBe('Pintar a sala');
    // De novo disponível: nada ficou preso em "Enviando…".
    expect(botaoPublicarTrampo()).toBeOnTheScreen();
  });

  it('falha do servidor mostra o erro geral traduzido, sem o texto do servidor', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 500,
      corpo: { erro: 'interno', mensagem: 'segredo-do-servidor' },
    });
    await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await fireEvent.press(botaoPublicarTrampo());

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/segredo-do-servidor/)).toBeNull();
  });
});

describe('ofertar serviço (CA6)', () => {
  async function preencherServico() {
    await screen.findByDisplayValue('Lavras');
    await digitar(t.titulo, 'Faço limpeza pós-obra');
    await digitar(t.descricao, 'Equipe própria.');
    await escolherCategoria('Limpeza');
    await digitar(t.precoBase, '80');
  }

  it('com a cidade do perfil, envia o corpo certo e invalida Meus serviços e a busca', async () => {
    const fetch = criarFake().responder('POST /servicos', {
      status: 201,
      corpo: { id: 's-novo', status: 'ativo' },
    });
    await abrir('/servicos/novo', fetch);
    await esperarSonda('servicos=0');
    await preencherServico();
    fetch.responder('GET /servicos/meus', { corpo: [{ id: 's-novo' }] });
    await fireEvent.press(botaoOfertarServico());

    expect(await screen.findByText(t.publicadoServico)).toBeOnTheScreen();
    expect(posts(fetch, '/servicos')[0]?.corpo).toEqual({
      titulo: 'Faço limpeza pós-obra',
      descricao: 'Equipe própria.',
      categoria: 'limpeza',
      cidade: 'Lavras',
      precoBaseCentavos: 8000,
    });
    expect(contar(fetch, 'GET', '/busca')).toBe(2);
    await esperarSonda('servicos=1');

    await fireEvent.press(screen.getByRole('button', { name: t.verServico }));
    await waitFor(() => expect(screen).toHavePathname('/servicos/s-novo'));
  });

  it('com a cidade apagada, envia sem a chave `cidade`', async () => {
    const fetch = criarFake().responder('POST /servicos', {
      status: 201,
      corpo: { id: 's1', status: 'ativo' },
    });
    await abrir('/servicos/novo', fetch);
    await preencherServico();
    await digitar(t.cidadeOpcional, '');
    await fireEvent.press(botaoOfertarServico());

    expect(await screen.findByText(t.publicadoServico)).toBeOnTheScreen();
    const corpo = posts(fetch, '/servicos')[0]?.corpo;
    expect(corpo).not.toHaveProperty('cidade');
    expect(corpo).toEqual({
      titulo: 'Faço limpeza pós-obra',
      descricao: 'Equipe própria.',
      categoria: 'limpeza',
      precoBaseCentavos: 8000,
    });
  });

  it('400 com `precoBaseCentavos` aparece no campo de preço', async () => {
    const fetch = criarFake().responder('POST /servicos', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'precoBaseCentavos', motivo: 'invalido' }],
      },
    });
    await abrir('/servicos/novo', fetch);
    await preencherServico();
    await fireEvent.press(botaoOfertarServico());

    expect(
      await screen.findByText(textos.erros.valor_invalido),
    ).toBeOnTheScreen();
  });

  it('título curto e preço zero não enviam', async () => {
    const fetch = criarFake();
    await abrir('/servicos/novo', fetch);
    await preencherServico();
    await digitar(t.titulo, 'Fa');
    await digitar(t.precoBase, '0');
    await fireEvent.press(botaoOfertarServico());

    expect(
      await screen.findByText(textos.erros.titulo_tamanho),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.valor_invalido)).toBeOnTheScreen();
    expect(posts(fetch, '/servicos')).toHaveLength(0);
  });
});

describe('perfil incompleto (D9)', () => {
  it('sem perfil (404), mostra o aviso no lugar do botão e "Completar perfil" navega', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrir('/trampos/novo', fetch);

    expect(
      await screen.findByText(/Falta: nome, cidade e habilidades/),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: t.publicarTrampo })).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.avisoPerfil.completar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfil/editar'));
    // Sem `completar=1`: ao salvar, o Editar perfil volta ao formulário.
    expect(screen).toHaveSearchParams({});
  });

  it('"Agora não" volta à tela anterior', async () => {
    const fetch = criarFake().responder('GET /perfis/eu', { status: 404 });
    await abrir('/', fetch);
    await screen.findByText('stub: início');
    await act(async () => router.push('/trampos/novo'));
    await waitFor(() => expect(screen).toHavePathname('/trampos/novo'));
    await screen.findByText(/Falta: /);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.avisoPerfil.agoraNao }),
    );

    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(await screen.findByText('stub: início')).toBeOnTheScreen();
  });

  it('409 perfil_incompleto no trampo mostra o aviso e "Completar perfil" navega', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 409,
      corpo: { erro: 'perfil_incompleto' },
    });
    await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await fireEvent.press(botaoPublicarTrampo());

    expect(await screen.findByText(/Complete seu perfil/)).toBeOnTheScreen();
    // O rascunho continua na tela, e o botão de publicar dá lugar ao aviso.
    expect(screen.getByLabelText(t.titulo).props.value).toBe('Pintar a sala');
    expect(screen.queryByRole('button', { name: t.publicarTrampo })).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: textos.avisoPerfil.completar }),
    );
    await waitFor(() => expect(screen).toHavePathname('/perfil/editar'));
    // Sem `completar=1`: ao salvar, o Editar perfil volta ao formulário.
    expect(screen).toHaveSearchParams({});
  });

  it('409 antes de o perfil chegar: o aviso fica quando o perfil termina de carregar (Q3)', async () => {
    const fetch = criarFake()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO, demoraMs: 2000 })
      .responder('POST /servicos', {
        status: 409,
        corpo: { erro: 'perfil_incompleto' },
      });
    await abrir('/servicos/novo', fetch);
    await screen.findByLabelText(t.titulo);
    await digitar(t.titulo, 'Faço limpeza pós-obra');
    await digitar(t.descricao, 'Equipe própria.');
    await escolherCategoria('Limpeza');
    await digitar(t.precoBase, '80');
    await fireEvent.press(botaoOfertarServico());
    expect(
      await screen.findByText(textos.avisoPerfil.mensagem([])),
    ).toBeOnTheScreen();

    // O perfil chega depois do 409: não é mudança, o aviso fica.
    await avancar(2100);
    await screen.findByDisplayValue('Lavras');
    expect(screen.getByText(textos.avisoPerfil.mensagem([]))).toBeOnTheScreen();
    expect(screen.queryByText(/Falta:/)).toBeNull();
    expect(screen.queryByRole('button', { name: t.ofertarServico })).toBeNull();
  });

  it('409 com o perfil salvo: o aviso sai sem "Falta" e some quando o perfil muda', async () => {
    const fetch = criarFake().responder('POST /trampos', {
      status: 409,
      corpo: { erro: 'perfil_incompleto' },
    });
    const { queryClient } = await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await fireEvent.press(botaoPublicarTrampo());
    expect(
      await screen.findByText(textos.avisoPerfil.mensagem([])),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Falta:/)).toBeNull();

    // A mesma resposta de novo (outro objeto) não apaga o aviso.
    await act(async () => {
      queryClient.setQueryData(chaves.meuPerfil(), { ...PERFIL_COMPLETO });
    });
    expect(screen.getByText(textos.avisoPerfil.mensagem([]))).toBeOnTheScreen();

    await act(async () => {
      queryClient.setQueryData(chaves.meuPerfil(), {
        ...PERFIL_COMPLETO,
        habilidades: ['pintura', 'reboco'],
      });
    });
    expect(
      await screen.findByRole('button', { name: t.publicarTrampo }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.avisoPerfil.mensagem([]))).toBeNull();
  });

  it('409 perfil_incompleto no serviço mostra o aviso', async () => {
    const fetch = criarFake().responder('POST /servicos', {
      status: 409,
      corpo: { erro: 'perfil_incompleto' },
    });
    await abrir('/servicos/novo', fetch);
    await screen.findByDisplayValue('Lavras');
    await digitar(t.titulo, 'Faço limpeza pós-obra');
    await digitar(t.descricao, 'Equipe própria.');
    await escolherCategoria('Limpeza');
    await digitar(t.precoBase, '80');
    await fireEvent.press(botaoOfertarServico());

    expect(await screen.findByText(/Complete seu perfil/)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.avisoPerfil.completar }),
    ).toBeOnTheScreen();
  });
});

describe('sem conexão', () => {
  afterEach(async () => {
    await act(async () => onlineManager.setOnline(true));
  });

  it('o botão fica desabilitado com o motivo e nenhuma requisição de publicação sai', async () => {
    const fetch = criarFake();
    await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await act(async () => onlineManager.setOnline(false));

    expect(await screen.findByText(t.semConexaoMotivo)).toBeOnTheScreen();
    const botao = botaoPublicarTrampo();
    expect(botao).toBeDisabled();
    await fireEvent.press(botao);
    await act(async () => {
      jest.advanceTimersByTime(50);
    });

    expect(posts(fetch, '/trampos')).toHaveLength(0);
    // O rascunho continua na tela.
    expect(screen.getByLabelText(t.titulo).props.value).toBe('Pintar a sala');
  });

  it('a queda de rede no envio mostra "sem conexão" e mantém o rascunho', async () => {
    const fetch = criarFake().responder('POST /trampos', { falhaDeRede: true });
    await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await fireEvent.press(botaoPublicarTrampo());

    expect(await screen.findByText(textos.erros.sem_conexao)).toBeOnTheScreen();
    expect(screen.getByLabelText(t.titulo).props.value).toBe('Pintar a sala');
  });
});

describe('sessão expirada (CA14)', () => {
  it('401 ao publicar leva ao login e o rascunho não fica no app', async () => {
    const fetch = criarFake()
      .responder('POST /trampos', {
        status: 401,
        corpo: { erro: 'sessao_invalida' },
      })
      .responder('POST /sessoes', { corpo: { token: 'novo-token' } });
    const { armazenamento } = await abrir('/trampos/novo', fetch);
    await preencherTrampo();
    await fireEvent.press(botaoPublicarTrampo());

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    await waitFor(() => expect(screen).toHavePathname('/entrar'));
    expect(armazenamento.atual()).toBeNull();
    expect(screen.queryByText(t.publicadoTrampo)).toBeNull();
  });
});
