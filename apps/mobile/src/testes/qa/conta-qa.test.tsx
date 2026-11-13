import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { impressaoDaConta } from '../../estado/sessao';
import { textos } from '../../textos/pt-BR';
import type { criarFetchFalso } from '../fetch-falso';
import { renderizarRotas, TOKEN_DE_TESTE } from '../rotas/apoio';
import {
  abrirApp,
  fakeComCategorias,
  PERFIL_COMPLETO,
  ROTAS_REAIS,
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

const EMAIL = 'qa.teste@exemplo.com';
const SENHA = 'senha-qa-12345';
const TOKEN_NOVO = 'token-qa-recem-emitido';

vigiarConsole();

async function preencher(email: string, senha: string) {
  await fireEvent.changeText(screen.getByLabelText(textos.entrar.email), email);
  await fireEvent.changeText(screen.getByLabelText(textos.entrar.senha), senha);
}

const botaoCriarConta = () =>
  screen.getByRole('button', { name: textos.cadastro.criarConta });
const botaoEntrar = () =>
  screen.getByRole('button', { name: textos.entrar.entrar });

/** CA75: o Cadastro só envia depois da escolha do objetivo (aqui, freela). */
async function escolherObjetivo() {
  await fireEvent.press(
    screen.getByRole('radio', { name: textos.cadastro.querTrampar }),
  );
}

/** O diálogo repete o nome "Sair": o de confirmação é o último botão. */
async function confirmarSaida() {
  const botoes = screen.getAllByRole('button', {
    name: textos.perfil.sairConfirmar,
  });
  await fireEvent.press(botoes[botoes.length - 1] as (typeof botoes)[number]);
}

const pedidosA = (
  fetch: ReturnType<typeof criarFetchFalso>,
  metodo: string,
  caminho: string,
) =>
  fetch.requisicoes.filter((r) => r.metodo === metodo && r.caminho === caminho);

describe('Cadastro: validação local e envio (CA1, CA2)', () => {
  it('e-mail com espaços e maiúsculas passa na validação e vai aparado', async () => {
    const fetch = fakeComCategorias()
      .responder('POST /contas', { status: 201, corpo: { token: TOKEN_NOVO } })
      .responder('GET /perfis/eu', { status: 404 })
      .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } });
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher('  Qa.Teste@Exemplo.COM  ', SENHA);
    await fireEvent.press(botaoCriarConta());

    await waitFor(() =>
      expect(pedidosA(fetch, 'POST', '/contas')).toHaveLength(1),
    );
    const corpo = pedidosA(fetch, 'POST', '/contas')[0]?.corpo as {
      email: string;
    };
    // Aparado; a caixa é normalizada pela API (CA2 só pede validar o formato).
    expect(corpo.email.trim()).toBe(corpo.email);
    expect(corpo.email.toLowerCase()).toBe('qa.teste@exemplo.com');
  });

  it('senha de 8 emojis (8 pontos de código, 16 unidades) é aceita e enviada', async () => {
    const fetch = fakeComCategorias().responder('POST /contas', {
      status: 409,
      corpo: { erro: 'email_em_uso' },
    });
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    const oitoEmojis = '😀'.repeat(8);
    await escolherObjetivo();
    await preencher(EMAIL, oitoEmojis);
    await fireEvent.press(botaoCriarConta());

    expect(
      await screen.findByText(textos.erros.email_em_uso),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.senha_curta)).toBeNull();
    expect(pedidosA(fetch, 'POST', '/contas')[0]?.corpo).toEqual({
      email: EMAIL,
      senha: oitoEmojis,
    });
  });

  it('senha de 7 emojis (14 unidades) é recusada no aparelho, sem requisição', async () => {
    const fetch = fakeComCategorias();
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, '😀'.repeat(7));
    await fireEvent.press(botaoCriarConta());

    expect(await screen.findByText(textos.erros.senha_curta)).toBeOnTheScreen();
    expect(pedidosA(fetch, 'POST', '/contas')).toHaveLength(0);
  });

  // Desde a L4 (CA55, D45) o campo de senha corta em 128 pontos de código,
  // sem contador (`contadorDoLimite="nunca"`): a 129ª entrada não chega ao
  // estado, e o que vai à API são 128. A regra de domínio (recusar acima de
  // 128) segue provada em `estado/validacao.test.ts`.
  it('senha de 128 pontos de código é enviada; a 129ª é cortada no campo, sem contador, e vão 128', async () => {
    const fetch = fakeComCategorias().responder('POST /contas', {
      status: 409,
      corpo: { erro: 'email_em_uso' },
    });
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, 'ç'.repeat(129));
    expect(screen.getByLabelText(textos.entrar.senha).props.value).toBe(
      'ç'.repeat(128),
    );
    // Sem contador visível no campo de senha; só a região invisível que o
    // leitor de tela anuncia diz que o texto foi cortado.
    expect(screen.queryByText(textos.gerais.contador(128, 128))).toBeNull();
    expect(screen.queryByText(textos.gerais.contadorLimite(128))).toBeNull();
    await fireEvent.press(botaoCriarConta());
    expect(
      await screen.findByText(textos.erros.email_em_uso),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.senha_curta)).toBeNull();
    const envios = pedidosA(fetch, 'POST', '/contas');
    expect(envios).toHaveLength(1);
    expect(envios[0]?.corpo).toMatchObject({ senha: 'ç'.repeat(128) });
  });

  it('senha de exatamente 128 pontos de código vai inteira', async () => {
    const fetch = fakeComCategorias().responder('POST /contas', {
      status: 409,
      corpo: { erro: 'email_em_uso' },
    });
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, 'ç'.repeat(128));
    await fireEvent.press(botaoCriarConta());

    await screen.findByText(textos.erros.email_em_uso);
    expect(pedidosA(fetch, 'POST', '/contas')[0]?.corpo).toMatchObject({
      senha: 'ç'.repeat(128),
    });
  });

  it('senha só de espaços com 8 caracteres não é aparada: vai como digitada', async () => {
    const fetch = fakeComCategorias().responder('POST /contas', {
      status: 409,
      corpo: { erro: 'email_em_uso' },
    });
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, '  senha  ');
    await fireEvent.press(botaoCriarConta());

    await screen.findByText(textos.erros.email_em_uso);
    expect(pedidosA(fetch, 'POST', '/contas')[0]?.corpo).toEqual({
      email: EMAIL,
      senha: '  senha  ',
    });
  });

  it('e-mail de 255 caracteres é recusado no aparelho, sem requisição', async () => {
    const fetch = fakeComCategorias();
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(`${'a'.repeat(243)}@exemplo.com`, SENHA);
    await fireEvent.press(botaoCriarConta());

    expect(
      await screen.findByText(textos.erros.email_invalido),
    ).toBeOnTheScreen();
    expect(pedidosA(fetch, 'POST', '/contas')).toHaveLength(0);
  });

  it('400 da API no campo e-mail aparece no campo, não como erro genérico', async () => {
    const fetch = fakeComCategorias().responder('POST /contas', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'email', motivo: 'invalido' }],
      },
    });
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, SENHA);
    await fireEvent.press(botaoCriarConta());

    expect(
      await screen.findByText(textos.erros.email_invalido),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.erro_servidor)).toBeNull();
  });

  it('400 da API no campo senha aparece no campo senha', async () => {
    const fetch = fakeComCategorias().responder('POST /contas', {
      status: 400,
      corpo: {
        erro: 'dados_invalidos',
        campos: [{ campo: 'senha', motivo: 'tamanho' }],
      },
    });
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, SENHA);
    await fireEvent.press(botaoCriarConta());

    expect(await screen.findByText(textos.erros.senha_curta)).toBeOnTheScreen();
  });

  it('duplo toque em "Criar conta" manda uma requisição só', async () => {
    const fetch = fakeComCategorias().responder('POST /contas', {
      status: 201,
      corpo: { token: TOKEN_NOVO },
      demoraMs: 200,
    });
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, SENHA);
    const botao = botaoCriarConta();
    await fireEvent.press(botao);
    await fireEvent.press(botao);
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(pedidosA(fetch, 'POST', '/contas')).toHaveLength(1);
  });

  it('duplo toque em "Entrar" manda uma requisição só', async () => {
    const fetch = fakeComCategorias().responder('POST /sessoes', {
      corpo: { token: TOKEN_NOVO },
      demoraMs: 200,
    });
    await abrirApp('/entrar', { fetch, token: null });
    await screen.findByLabelText(textos.entrar.senha);

    await preencher(EMAIL, SENHA);
    const botao = botaoEntrar();
    await fireEvent.press(botao);
    await fireEvent.press(botao);
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(pedidosA(fetch, 'POST', '/sessoes')).toHaveLength(1);
  });

  it.each([
    ['500 interno', { status: 500, corpo: { erro: 'interno' } }],
    ['503 com corpo HTML', { status: 503, corpoBruto: '<html>erro</html>' }],
    ['200 com JSON quebrado', { corpoBruto: '{"token":' }],
  ])(
    '%s no cadastro mostra o erro genérico do servidor, sem texto cru e sem token',
    async (_nome, resposta) => {
      const fetch = fakeComCategorias().responder('POST /contas', resposta);
      const { armazenamento } = await abrirApp('/cadastro', {
        fetch,
        token: null,
      });
      await screen.findByText(textos.cadastro.privacidade);

      await escolherObjetivo();
      await preencher(EMAIL, SENHA);
      await fireEvent.press(botaoCriarConta());

      expect(
        await screen.findByText(textos.erros.erro_servidor),
      ).toBeOnTheScreen();
      expect(armazenamento.atual()).toBeNull();
      const visivel = textosDaArvore(screen.toJSON()).join('\n');
      expect(visivel).not.toMatch(/erro da API|interno|<html>/);
    },
  );

  it('429 no cadastro mostra "muitas tentativas" e a senha é limpa', async () => {
    const fetch = fakeComCategorias().responder('POST /contas', {
      status: 429,
      corpo: { erro: 'muitas_requisicoes' },
    });
    await abrirApp('/cadastro', { fetch, token: null });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, SENHA);
    await fireEvent.press(botaoCriarConta());

    expect(
      await screen.findByText(textos.erros.muitas_tentativas),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(textos.entrar.senha).props.value).toBe('');
  });

  it('depois de um erro, corrigir e reenviar funciona e o aviso antigo some', async () => {
    const fetch = fakeComCategorias()
      .responder('POST /contas', [
        { status: 409, corpo: { erro: 'email_em_uso' } },
        { status: 201, corpo: { token: TOKEN_NOVO } },
      ])
      .responder('GET /perfis/eu', { status: 404 })
      .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } });
    const { armazenamento, getPathname } = await abrirApp('/cadastro', {
      fetch,
      token: null,
    });
    await screen.findByText(textos.cadastro.privacidade);

    await escolherObjetivo();
    await preencher(EMAIL, SENHA);
    await fireEvent.press(botaoCriarConta());
    await screen.findByText(textos.erros.email_em_uso);

    await preencher('outro.qa@exemplo.com', SENHA);
    await fireEvent.press(botaoCriarConta());

    await waitFor(() => expect(getPathname()).toBe('/perfil/editar'));
    expect(armazenamento.atual()).toBe(TOKEN_NOVO);
    expect(screen.queryByText(textos.erros.email_em_uso)).toBeNull();
    expect(
      screen.getByText(textos.editarPerfil.tituloCompletar),
    ).toBeOnTheScreen();
  });
});

describe('Sessão no app completo (CA14)', () => {
  it('401 durante o PUT /perfis/eu leva ao login e, depois de entrar, volta a /perfil/editar', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('PUT /perfis/eu', {
        status: 401,
        corpo: { erro: 'sessao_invalida' },
      })
      .responder('POST /sessoes', { corpo: { token: TOKEN_NOVO } });
    // Sessão restaurada da mesma conta que entra de novo: a rota só volta
    // para ela (CA50).
    const { armazenamento, getPathname } = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/perfil/editar',
      fetch,
      armazenamento: criarArmazenamentoEmMemoria(
        TOKEN_DE_TESTE,
        impressaoDaConta(EMAIL),
      ),
    });

    await screen.findByDisplayValue('Maria Souza');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.editarPerfil.salvar }),
    );

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    expect(getPathname()).toBe('/entrar');
    expect(armazenamento.atual()).toBeNull();

    await preencher(EMAIL, SENHA);
    await fireEvent.press(botaoEntrar());

    await waitFor(() => expect(getPathname()).toBe('/perfil/editar'));
    expect(armazenamento.atual()).toBe(TOKEN_NOVO);
    expect(
      await screen.findByRole('button', { name: textos.editarPerfil.salvar }),
    ).toBeOnTheScreen();
  });

  it('depois do 401, quem entra com outra conta não vê dados da anterior', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', [
        { corpo: PERFIL_COMPLETO },
        { corpo: { ...PERFIL_COMPLETO, nome: 'João Pereira' } },
      ])
      .responder('GET /busca', [
        { status: 401, corpo: { erro: 'sessao_invalida' } },
        { corpo: { itens: [], proximoCursor: null } },
      ])
      .responder('POST /sessoes', { corpo: { token: TOKEN_NOVO } });
    const { queryClient } = await abrirApp('/', { fetch });

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Olá, Maria Souza')).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

    await preencher('joao@exemplo.com', SENHA);
    await fireEvent.press(botaoEntrar());

    expect(await screen.findByText('Olá, João Pereira')).toBeOnTheScreen();
    expect(screen.queryByText('Olá, Maria Souza')).toBeNull();
  });

  it('dois 401 simultâneos (Início dispara várias consultas) expiram a sessão uma vez só', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { status: 401, corpo: { erro: 'x' } })
      .responder('GET /busca', { status: 401, corpo: { erro: 'x' } })
      .responder('POST /sessoes', { corpo: { token: TOKEN_NOVO } });
    const { getPathname } = await abrirApp('/', { fetch });

    expect(
      await screen.findByText(textos.erros.sessao_expirada),
    ).toBeOnTheScreen();
    expect(getPathname()).toBe('/entrar');
    expect(screen.getAllByText(textos.erros.sessao_expirada)).toHaveLength(1);
  });

  it('o 401 do login (senha errada) não expira nem mostra "sessão expirada"', async () => {
    const fetch = fakeComCategorias().responder('POST /sessoes', {
      status: 401,
      corpo: { erro: 'credenciais_invalidas' },
    });
    await abrirApp('/entrar', { fetch, token: null });
    await screen.findByLabelText(textos.entrar.senha);

    await preencher(EMAIL, SENHA);
    await fireEvent.press(botaoEntrar());

    expect(
      await screen.findByText(textos.erros.credenciais_invalidas),
    ).toBeOnTheScreen();
    expect(screen.queryByText(textos.erros.sessao_expirada)).toBeNull();
  });

  it('sair com falha de rede deixa anônimo, apaga o token e o cache, sem aviso de sessão expirada', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('DELETE /sessoes', { falhaDeRede: true });
    const { armazenamento, queryClient, getPathname } = await abrirApp(
      '/perfil',
      {
        fetch,
      },
    );

    await screen.findByText('Maria Souza');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.sair }),
    );
    await confirmarSaida();

    await waitFor(() => expect(armazenamento.atual()).toBeNull());
    await waitFor(() => expect(getPathname()).not.toBe('/perfil'));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(screen.queryByText(textos.erros.sessao_expirada)).toBeNull();
    expect(screen.queryByText('Maria Souza')).toBeNull();
  });

  it('sair com 401 do servidor (sessão já revogada) também não mostra "sessão expirada"', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('DELETE /sessoes', { status: 401, corpo: { erro: 'x' } });
    const { armazenamento } = await abrirApp('/perfil', { fetch });

    await screen.findByText('Maria Souza');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.sair }),
    );
    await confirmarSaida();

    await waitFor(() => expect(armazenamento.atual()).toBeNull());
    expect(screen.queryByText(textos.erros.sessao_expirada)).toBeNull();
  });

  it('depois de sair, entrar de novo não volta à rota de antes nem mostra aviso', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
      .responder('DELETE /sessoes', { status: 204 })
      .responder('POST /sessoes', { corpo: { token: TOKEN_NOVO } });
    const { getPathname } = await abrirApp('/perfil', { fetch });

    await screen.findByText('Maria Souza');
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.sair }),
    );
    await confirmarSaida();
    await waitFor(() => expect(getPathname()).not.toBe('/perfil'));

    if (getPathname() !== '/entrar') {
      await fireEvent.press(
        await screen.findByRole('button', {
          name: textos.entrada.jaTenhoConta,
        }),
      );
    }
    await screen.findByLabelText(textos.entrar.senha);
    expect(screen.queryByText(textos.erros.sessao_expirada)).toBeNull();
    await preencher(EMAIL, SENHA);
    await fireEvent.press(botaoEntrar());

    expect(await screen.findByText('Olá, Maria Souza')).toBeOnTheScreen();
    expect(getPathname()).toBe('/');
  });
});

describe('Sessão: corridas e falhas locais (CA14, CA1)', () => {
  it('um 401 atrasado de requisição feita com o token antigo não derruba a sessão nova', async () => {
    const vazia = { corpo: { itens: [], proximoCursor: null } };
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', [
        { status: 401, corpo: { erro: 'sessao_invalida' } },
        { corpo: PERFIL_COMPLETO },
      ])
      .responder('GET /busca?tipo=servicos', vazia)
      .responder('GET /busca?tipo=trampos', [
        { status: 401, corpo: { erro: 'sessao_invalida' }, demoraMs: 5000 },
        vazia,
      ])
      .responder('POST /sessoes', { corpo: { token: TOKEN_NOVO } });
    const { armazenamento, getPathname } = await abrirApp('/', { fetch });

    // O primeiro 401 expira a sessão; a pessoa entra de novo em seguida.
    await screen.findByText(textos.erros.sessao_expirada);
    await preencher(EMAIL, SENHA);
    await fireEvent.press(botaoEntrar());
    await screen.findByText('Olá, Maria Souza');

    expect(armazenamento.atual()).toBe(TOKEN_NOVO);

    // Só agora chega o 401 da requisição antiga (enviada com o token velho).
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });

    expect(armazenamento.atual()).toBe(TOKEN_NOVO);
    expect(getPathname()).toBe('/');
    expect(screen.getByText('Olá, Maria Souza')).toBeOnTheScreen();
  });

  it('falha ao gravar o token no keychain não deixa entrar e mostra erro, sem vazar a senha', async () => {
    const armazenamento = criarArmazenamentoEmMemoria();
    jest
      .spyOn(armazenamento, 'gravar')
      .mockRejectedValue(new Error('keychain'));
    const fetch = fakeComCategorias().responder('POST /sessoes', {
      corpo: { token: TOKEN_NOVO },
    });
    const { getPathname } = await renderizarRotas(ROTAS_REAIS, {
      initialUrl: '/entrar',
      armazenamento,
      fetch,
    });
    await screen.findByLabelText(textos.entrar.senha);

    await preencher(EMAIL, SENHA);
    await fireEvent.press(botaoEntrar());

    expect(
      await screen.findByText(textos.erros.erro_servidor),
    ).toBeOnTheScreen();
    expect(getPathname()).toBe('/entrar');
    expect(armazenamento.atual()).toBeNull();
    expect(screen.getByLabelText(textos.entrar.senha).props.value).toBe('');
  });
});

describe('Offline (R1, R2)', () => {
  const semRede = async (corpo: () => Promise<void>) => {
    await act(async () => onlineManager.setOnline(false));
    try {
      await corpo();
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
  };

  it('R1: Início offline, sem o perfil carregado, não mostra "Complete seu perfil"', async () => {
    await semRede(async () => {
      const fetch = fakeComCategorias()
        .responder('GET /perfis/eu', { status: 404 })
        .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } });
      await abrirApp('/', { fetch });

      expect(
        await screen.findByText(textos.gerais.semConexaoFaixa),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/Complete seu perfil/)).toBeNull();
      expect(screen.queryByText(textos.inicio.vazio)).toBeNull();
    });
  });

  it('R2: sair offline deixa anônimo, apaga o token e o cache', async () => {
    const fetch = fakeComCategorias()
      .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
      .responder('DELETE /sessoes', { falhaDeRede: true });
    const { armazenamento, queryClient } = await abrirApp('/perfil', {
      fetch,
    });
    await screen.findByText('Maria Souza');

    await semRede(async () => {
      await fireEvent.press(
        screen.getByRole('button', { name: textos.perfil.sair }),
      );
      await confirmarSaida();

      await waitFor(() => expect(armazenamento.atual()).toBeNull());
      await waitFor(() =>
        expect(queryClient.getQueryCache().getAll()).toHaveLength(0),
      );
      expect(screen.queryByText('Maria Souza')).toBeNull();
    });
  });
});

describe('Deep link sem sessão (CA14, D8)', () => {
  it.each([
    '/trampos/t-1',
    '/servicos/s-1',
    '/perfis/c-1',
    '/perfil/editar',
    '/buscar',
    '/perfil',
  ])('%s anônimo cai na Entrada e não faz requisição de dados', async (url) => {
    const fetch = fakeComCategorias();
    const { getPathname } = await abrirApp(url, { fetch, token: null });

    expect(await screen.findByText(textos.entrada.frase)).toBeOnTheScreen();
    expect(getPathname()).toBe('/entrada');
    expect(fetch.requisicoes).toHaveLength(0);
  });
});
