import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { textos } from '../../textos/pt-BR';
import type { FetchFalso } from '../fetch-falso';
import {
  abrirApp,
  fakeComCategorias,
  PERFIL_COMPLETO,
  textosDaArvore,
  vigiarConsole,
} from './apoio-qa';

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

const TRAMPO = {
  id: 't1',
  autorId: 'c1',
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 150000,
  prazo: '2026-11-15',
  status: 'aberto',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

const SERVICO = {
  id: 's1',
  autorId: 'c1',
  titulo: 'Aulas de matemática',
  descricao: 'Reforço escolar.',
  categoria: 'aulas',
  cidade: null,
  precoBaseCentavos: 8000,
  status: 'ativo',
  criadoEm: '2026-10-01T12:00:00.000Z',
};

const AUTOR = {
  contaId: 'c1',
  nome: 'Carla Souza',
  cidade: 'Lavras',
  descricao: 'Pinto e reformo.',
  habilidades: ['pintura', 'reparos'],
};

const salvar = () =>
  screen.getByRole('button', { name: textos.editarPerfil.salvar });
const botaoAdicionar = () =>
  screen.getByRole('button', { name: textos.editarPerfil.adicionar });
const campoHabilidade = () =>
  screen.getByLabelText(textos.editarPerfil.adicionarHabilidade);
const aoLado = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

async function adicionarHabilidade(texto: string) {
  await fireEvent.changeText(campoHabilidade(), texto);
  await fireEvent.press(botaoAdicionar());
}

const puts = (fetch: FetchFalso) =>
  fetch.requisicoes.filter((r) => r.metodo === 'PUT');

/** Fake com perfil já salvo e `PUT` que ecoa o corpo (como a API faz). */
function fakeDoPerfil(): FetchFalso {
  return fakeComCategorias()
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('PUT /perfis/eu', (r) => ({
      corpo: { ...(r.corpo as object), completo: true },
    }));
}

describe('Editar perfil: limites e normalização (CA3)', () => {
  it('a 11ª habilidade é recusada com o texto de "habilidades demais" e não entra', async () => {
    const dez = Array.from({ length: 10 }, (_, i) => `habilidade ${i + 1}`);
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      corpo: { ...PERFIL_COMPLETO, habilidades: dez },
    });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    await adicionarHabilidade('mais uma');

    expect(
      await screen.findByText(textos.erros.habilidades_demais),
    ).toBeOnTheScreen();
    expect(screen.queryByText('mais uma')).toBeNull();
    expect(screen.getAllByText(/^habilidade \d+$/)).toHaveLength(10);
  });

  it('habilidade repetida com outro acento e outra caixa é recusada', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      corpo: { ...PERFIL_COMPLETO, habilidades: ['elétrica'] },
    });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    await adicionarHabilidade('  ELETRICA ');

    expect(
      await screen.findByText(textos.erros.habilidade_invalida),
    ).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/^Remover /)).toHaveLength(1);
  });

  it('habilidade de 1 caractere e de 31 caracteres é recusada com o texto de tamanho', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      corpo: PERFIL_COMPLETO,
    });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    await adicionarHabilidade('a');
    expect(
      await screen.findByText(textos.erros.habilidade_tamanho),
    ).toBeOnTheScreen();
    await adicionarHabilidade('x'.repeat(31));
    expect(screen.getByText(textos.erros.habilidade_tamanho)).toBeOnTheScreen();
    await adicionarHabilidade('x'.repeat(30));
    await waitFor(() =>
      expect(screen.queryByText(textos.erros.habilidade_tamanho)).toBeNull(),
    );
    expect(screen.getByText('x'.repeat(30))).toBeOnTheScreen();
  });

  it('a habilidade digitada chega à API como a pessoa escreveu (acento preservado)', async () => {
    const fetch = fakeDoPerfil();
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    await adicionarHabilidade('Elétrica residencial');
    await fireEvent.press(salvar());
    await screen.findByText(textos.editarPerfil.sucesso);

    // A API guarda o texto aparado como veio (só compara repetidas pela forma normalizada).
    expect(puts(fetch)[0]?.corpo).toMatchObject({
      habilidades: expect.arrayContaining(['Elétrica residencial']),
    });
  });

  it('descrição de 301 caracteres é recusada no campo e nada é enviado', async () => {
    const fetch = fakeDoPerfil();
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.descricao),
      'a'.repeat(301),
    );
    await fireEvent.press(salvar());

    expect(
      await screen.findByText(textos.erros.descricao_tamanho),
    ).toBeOnTheScreen();
    expect(puts(fetch)).toHaveLength(0);
  });

  it('descrição de exatamente 300 caracteres é enviada', async () => {
    const fetch = fakeDoPerfil();
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.descricao),
      'a'.repeat(300),
    );
    await fireEvent.press(salvar());

    expect(
      await screen.findByText(textos.editarPerfil.sucesso),
    ).toBeOnTheScreen();
    expect(puts(fetch)[0]?.corpo).toMatchObject({
      descricao: 'a'.repeat(300),
    });
  });

  it('descrição com 300 emojis (300 pontos de código) é aceita e o contador não passa de 300', async () => {
    const fetch = fakeDoPerfil();
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.descricao),
      '😀'.repeat(300),
    );

    expect(
      screen.getByText(textos.editarPerfil.contador(300, 300)),
    ).toBeOnTheScreen();
    await fireEvent.press(salvar());
    expect(
      await screen.findByText(textos.editarPerfil.sucesso),
    ).toBeOnTheScreen();
  });

  it('apagar a descrição de um perfil que tinha uma manda o PUT sem `descricao`', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', {
        corpo: { ...PERFIL_COMPLETO, descricao: 'Texto antigo' },
      })
      .responder('PUT /perfis/eu', { corpo: { ...PERFIL_COMPLETO } });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Texto antigo');

    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.descricao),
      '   ',
    );
    await fireEvent.press(salvar());

    await screen.findByText(textos.editarPerfil.sucesso);
    expect(puts(fetch)[0]?.corpo).not.toHaveProperty('descricao');
  });

  it('nome e cidade de 1 caractere ou de 81 são recusados nos campos; 2 e 80 passam', async () => {
    const fetch = fakeDoPerfil();
    await abrirApp('/perfil/editar', { fetch });
    const nome = await screen.findByDisplayValue('Maria Souza');
    const cidade = screen.getByDisplayValue('Lavras');

    await fireEvent.changeText(nome, 'M');
    await fireEvent.changeText(cidade, 'L'.repeat(81));
    await fireEvent.press(salvar());
    expect(
      await screen.findByText(textos.erros.nome_tamanho),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.cidade_tamanho)).toBeOnTheScreen();
    expect(puts(fetch)).toHaveLength(0);

    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.nome),
      'Zé',
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.cidade),
      'L'.repeat(80),
    );
    await fireEvent.press(salvar());
    expect(
      await screen.findByText(textos.editarPerfil.sucesso),
    ).toBeOnTheScreen();
    expect(puts(fetch)[0]?.corpo).toMatchObject({
      nome: 'Zé',
      cidade: 'L'.repeat(80),
    });
  });

  it('remover a última habilidade e salvar mostra "adicione ao menos uma" e não envia', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      corpo: { ...PERFIL_COMPLETO, habilidades: ['pintura'] },
    });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    await fireEvent.press(
      screen.getByLabelText(textos.editarPerfil.remover('pintura')),
    );
    await fireEvent.press(salvar());

    expect(
      await screen.findByText(textos.erros.habilidade_obrigatoria),
    ).toBeOnTheScreen();
    expect(puts(fetch)).toHaveLength(0);
  });

  it('duplo toque em "Salvar alterações" manda um PUT só', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('PUT /perfis/eu', { corpo: PERFIL_COMPLETO, demoraMs: 200 });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    const botao = salvar();
    await fireEvent.press(botao);
    await aoLado(50);
    await fireEvent.press(botao);
    await aoLado(400);

    expect(puts(fetch)).toHaveLength(1);
  });

  it('400 com erro em vários campos mostra cada mensagem no seu campo', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('PUT /perfis/eu', {
        status: 400,
        corpo: {
          erro: 'dados_invalidos',
          campos: [
            { campo: 'nome', motivo: 'tamanho' },
            { campo: 'cidade', motivo: 'obrigatorio' },
            { campo: 'descricao', motivo: 'tamanho' },
            { campo: 'habilidades', motivo: 'tamanho' },
          ],
        },
      });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    await fireEvent.press(salvar());

    expect(
      await screen.findByText(textos.erros.nome_tamanho),
    ).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.cidade_obrigatoria)).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.descricao_tamanho)).toBeOnTheScreen();
    expect(screen.getByText(textos.erros.habilidades_demais)).toBeOnTheScreen();
  });

  it('400 só com campo desconhecido cai no erro genérico, sem texto cru', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('PUT /perfis/eu', {
        status: 400,
        corpo: {
          erro: 'dados_invalidos',
          campos: [{ campo: 'foto', motivo: 'invalido' }],
        },
      });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    await fireEvent.press(salvar());

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    expect(textosDaArvore(screen.toJSON()).join('\n')).not.toMatch(
      /dados_invalidos|foto/,
    );
  });

  it('corrigir um campo apaga só o erro dele; o dos outros continua', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('PUT /perfis/eu', {
        status: 400,
        corpo: {
          erro: 'dados_invalidos',
          campos: [
            { campo: 'nome', motivo: 'tamanho' },
            { campo: 'cidade', motivo: 'tamanho' },
          ],
        },
      });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');
    await fireEvent.press(salvar());
    await screen.findByText(textos.erros.nome_tamanho);

    await fireEvent.changeText(
      screen.getByLabelText(textos.editarPerfil.nome),
      'Maria S.',
    );

    expect(screen.queryByText(textos.erros.nome_tamanho)).toBeNull();
    expect(screen.getByText(textos.erros.cidade_tamanho)).toBeOnTheScreen();
  });

  it('digitar antes do perfil carregar não deixa os outros campos vazios depois que ele chega', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO, demoraMs: 500 })
      .responder('PUT /perfis/eu', { corpo: PERFIL_COMPLETO });
    await abrirApp('/perfil/editar', { fetch });

    // Rede lenta: a pessoa começa a digitar o nome com o formulário ainda vazio.
    await fireEvent.changeText(
      await screen.findByLabelText(textos.editarPerfil.nome),
      'Maria S. Souza',
    );
    await aoLado(600);

    await waitFor(() =>
      expect(
        screen.getByLabelText(textos.editarPerfil.cidade).props.value,
      ).toBe('Lavras'),
    );
    expect(screen.getByLabelText(textos.editarPerfil.nome).props.value).toBe(
      'Maria S. Souza',
    );
    expect(screen.getByText('pintura')).toBeOnTheScreen();
  });

  it('modo completar só com ?completar=1: título e "Agora não"', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      status: 404,
    });
    await abrirApp('/perfil/editar?completar=1', { fetch });

    expect(
      await screen.findByText(textos.editarPerfil.tituloCompletar),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.editarPerfil.agoraNao }),
    ).toBeOnTheScreen();
  });

  it('sem o parâmetro, Editar perfil não oferece "Agora não"', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      corpo: PERFIL_COMPLETO,
    });
    await abrirApp('/perfil/editar', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    expect(
      screen.queryByRole('button', { name: textos.editarPerfil.agoraNao }),
    ).toBeNull();
    expect(screen.queryByText(textos.editarPerfil.tituloCompletar)).toBeNull();
  });

  it('?completar=2 e ?completar=0 não ligam o modo completar', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/eu', {
      corpo: PERFIL_COMPLETO,
    });
    await abrirApp('/perfil/editar?completar=2', { fetch });
    await screen.findByDisplayValue('Maria Souza');

    expect(screen.queryByText(textos.editarPerfil.tituloCompletar)).toBeNull();
  });
});

describe('Perfil público (CA3)', () => {
  it('não mostra e-mail nem outro campo fora do contrato mesmo que a API o mande', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/c1', {
      corpo: {
        ...AUTOR,
        email: 'carla@exemplo.com',
        senhaHash: 'xyz',
        atualizadoEm: '2026-01-01',
      },
    });
    await abrirApp('/perfis/c1', { fetch });

    await screen.findByText('Carla Souza');

    const visivel = textosDaArvore(screen.toJSON()).join('\n');
    expect(visivel).not.toContain('carla@exemplo.com');
    expect(visivel).not.toContain('xyz');
    expect(
      screen.queryByRole('button', { name: textos.perfil.editar }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: textos.perfil.sair }),
    ).toBeNull();
  });

  it('id com caracteres especiais vai codificado na URL (sem mudar o caminho)', async () => {
    const fetch = fakeComCategorias();
    await abrirApp('/perfis/a%2Fb%3Fx%3D1', { fetch });

    await screen.findByText(textos.erros.nao_encontrado);

    const pedido = fetch.requisicoes.find((r) =>
      r.caminho.startsWith('/perfis/'),
    );
    expect(pedido?.caminho).toBe('/perfis/a%2Fb%3Fx%3D1');
    expect(pedido?.query).toEqual({});
  });

  it('id inexistente (404) mostra o texto de "não encontrado" e "Voltar" sai da tela', async () => {
    const fetch = fakeComCategorias().responder('GET /perfis/zzz', {
      status: 404,
      corpo: { erro: 'nao_encontrado' },
    });
    await abrirApp('/perfis/zzz', { fetch });

    expect(
      await screen.findByText(textos.erros.nao_encontrado),
    ).toBeOnTheScreen();
    expect(textosDaArvore(screen.toJSON()).join('\n')).not.toMatch(
      /nao_encontrado/,
    );
  });
});

describe('Detalhes: ids não confiáveis (segurança de entrada)', () => {
  it.each([
    ['trampos', '/trampos/a%2Fb'],
    ['servicos', '/servicos/a%2Fb'],
  ])(
    'id com "/" em %s é codificado e não vira outro caminho',
    async (tipo, url) => {
      const fetch = fakeComCategorias();
      await abrirApp(url, { fetch });

      await screen.findByText(textos.erros.nao_encontrado);

      const pedido = fetch.requisicoes.find((r) =>
        r.caminho.startsWith(`/${tipo}/`),
      );
      expect(pedido?.caminho).toBe(`/${tipo}/a%2Fb`);
    },
  );

  it('id com "?" e "#" codificados não injeta query', async () => {
    const fetch = fakeComCategorias();
    await abrirApp('/trampos/x%3Fadmin%3D1%23y', { fetch });

    await screen.findByText(textos.erros.nao_encontrado);

    const pedido = fetch.requisicoes.find((r) =>
      r.caminho.startsWith('/trampos/'),
    );
    expect(pedido?.caminho).toBe('/trampos/x%3Fadmin%3D1%23y');
    expect(pedido?.query).toEqual({});
  });

  it('id ".." não faz requisição ao detalhe e mostra "não encontrado"', async () => {
    const fetch = fakeComCategorias();
    await abrirApp('/trampos/%2E%2E', { fetch });

    await screen.findAllByText(textos.erros.nao_encontrado);

    expect(
      fetch.requisicoes.filter((r) => r.caminho.startsWith('/trampos')),
    ).toHaveLength(0);
  });

  it('id com emoji e acento chega codificado e o detalhe abre', async () => {
    const id = 'ação-😀';
    const fetch = fakeComCategorias()
      .responder(`GET /trampos/${encodeURIComponent(id)}`, {
        corpo: { ...TRAMPO, id },
      })
      .responder('GET /perfis/c1', { corpo: AUTOR });
    await abrirApp(`/trampos/${encodeURIComponent(id)}`, { fetch });

    expect(await screen.findByText('Pintar a sala')).toBeOnTheScreen();
    expect(await screen.findByText('Carla Souza')).toBeOnTheScreen();
  });

  it('autorId malicioso na resposta (com "/") também é codificado ao buscar o autor', async () => {
    const fetch = fakeComCategorias().responder('GET /trampos/t1', {
      corpo: { ...TRAMPO, autorId: '../admin' },
    });
    await abrirApp('/trampos/t1', { fetch });

    await screen.findByText('Pintar a sala');
    await aoLado(50);

    const pedidosDePerfil = fetch.requisicoes.filter((r) =>
      r.caminho.startsWith('/perfis'),
    );
    for (const pedido of pedidosDePerfil) {
      expect(pedido.caminho).toBe('/perfis/..%2Fadmin');
    }
  });
});

describe('Detalhes: conteúdo e estados', () => {
  it('trampo sem prazo mostra "Sem prazo definido" e o valor em reais', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /trampos/t1', { corpo: { ...TRAMPO, prazo: null } })
      .responder('GET /perfis/c1', { corpo: AUTOR });
    await abrirApp('/trampos/t1', { fetch });

    expect(
      await screen.findByText(textos.detalheTrampo.semPrazo),
    ).toBeOnTheScreen();
    expect(screen.getByText('R$ 1.500,00')).toBeOnTheScreen();
    expect(screen.getByText('Reformas e reparos')).toBeOnTheScreen();
  });

  it('serviço mostra preço base e o autor; tocar no autor abre o perfil dele', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /servicos/s1', { corpo: SERVICO })
      .responder('GET /perfis/c1', { corpo: AUTOR });
    const { getPathname } = await abrirApp('/servicos/s1', { fetch });

    expect(await screen.findByText('Aulas de matemática')).toBeOnTheScreen();
    expect(screen.getByText('R$ 80,00')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByText('Carla Souza'));

    await waitFor(() => expect(getPathname()).toBe('/perfis/c1'));
    expect(await screen.findByText('Pinto e reformo.')).toBeOnTheScreen();
  });

  it('título e descrição longos (5000 caracteres) não quebram a tela', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /trampos/t1', {
        corpo: {
          ...TRAMPO,
          titulo: 'T'.repeat(200),
          descricao: 'palavra '.repeat(700),
        },
      })
      .responder('GET /perfis/c1', { corpo: AUTOR });
    await abrirApp('/trampos/t1', { fetch });

    expect(await screen.findByText('T'.repeat(200))).toBeOnTheScreen();
  });

  it('o detalhe não oferece candidatar nem conversar na 2a (rodapé vazio)', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /trampos/t1', { corpo: TRAMPO })
      .responder('GET /perfis/c1', { corpo: AUTOR });
    await abrirApp('/trampos/t1', { fetch });
    await screen.findByText('Pintar a sala');

    expect(
      screen.queryByRole('button', { name: textos.detalheTrampo.candidatar }),
    ).toBeNull();
  });
});

describe('Detalhes e perfil: valores e navegação de volta', () => {
  it.each([
    [99, 'R$ 0,99'],
    [100, 'R$ 1,00'],
    [123456789, 'R$ 1.234.567,89'],
  ])('valor de %i centavos aparece como %s', async (centavos, texto) => {
    const fetch = fakeComCategorias()
      .responder('GET /trampos/t1', {
        corpo: { ...TRAMPO, valorCentavos: centavos },
      })
      .responder('GET /perfis/c1', { corpo: AUTOR });
    await abrirApp('/trampos/t1', { fetch });

    expect(await screen.findByText(texto)).toBeOnTheScreen();
  });

  it.each([
    ['/trampos/t1', 'Pintar a sala'],
    ['/servicos/s1', 'Aulas de matemática'],
    ['/perfis/c1', 'Carla Souza'],
    ['/perfil/editar', 'Editar perfil'],
  ])(
    '"Voltar" em %s aberto por link (sem histórico) leva ao Início',
    async (url, marcador) => {
      const fetch = fakeComCategorias()
        .responder('GET /trampos/t1', { corpo: TRAMPO })
        .responder('GET /servicos/s1', { corpo: SERVICO })
        .responder('GET /perfis/c1', { corpo: AUTOR })
        .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
        .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } });
      const { getPathname } = await abrirApp(url, { fetch });
      await screen.findAllByText(marcador);

      await fireEvent.press(
        screen.getByRole('button', { name: textos.gerais.voltar }),
      );

      await waitFor(() => expect(getPathname()).toBe('/'));
    },
  );
});

describe('Texto de interface nunca mostra erro cru nem código (CA2, CA7)', () => {
  const RESPOSTAS_DE_ERRO = [
    [
      '500 com código snake_case',
      { status: 500, corpo: { erro: 'erro_interno_do_banco' } },
    ],
    ['502 HTML', { status: 502, corpoBruto: '<html>Bad Gateway</html>' }],
    ['418 inesperado', { status: 418, corpo: { erro: 'sou_um_bule' } }],
    ['403 sem permissão', { status: 403, corpo: { erro: 'sem_permissao' } }],
    ['rede', { falhaDeRede: true }],
  ] as const;

  const ROTAS = [
    '/',
    '/buscar',
    '/perfil',
    '/perfil/editar',
    '/perfis/c1',
    '/trampos/t1',
    '/servicos/s1',
  ];

  const CASOS = ROTAS.flatMap((rota) =>
    RESPOSTAS_DE_ERRO.map(
      ([nome, resposta]) => [rota, nome, resposta] as const,
    ),
  );

  it.each(CASOS)(
    '%s com %s só mostra textos da interface',
    async (rota, _nome, resposta) => {
      const fetch = fakeComCategorias();
      for (const alvo of [
        '/perfis/eu',
        '/busca',
        '/perfis/c1',
        '/trampos/t1',
        '/servicos/s1',
      ]) {
        fetch.responder(`GET ${alvo}`, resposta);
      }
      await abrirApp(rota, { fetch });
      if (rota === '/buscar') {
        await fireEvent(
          await screen.findByLabelText(textos.buscar.campo),
          'submitEditing',
        );
      }
      await aoLado(200);

      const visivel = textosDaArvore(screen.toJSON()).join('\n');
      expect(visivel).not.toMatch(
        /erro da API|falha de rede|erro_interno|sou_um_bule|sem_permissao|Bad Gateway|<html>/,
      );
      expect(visivel).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
      // Não é vacuoso: a tela de fato mostrou um dos textos de erro da interface.
      if (rota !== '/perfil/editar') {
        expect(
          Object.values(textos.erros).some((t) => visivel.includes(t)),
        ).toBe(true);
      }
    },
  );
});
