import {
  notifyManager,
  onlineManager,
  useMutation,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ErroDaApi, ErroDeRede } from '../api/erros';
import type { ValoresDoAnuncio } from '../telas/tipos';
import { criarFetchFalso } from '../testes/fetch-falso';
import { criarProvedores } from '../testes/renderizar';
import { textos } from '../textos/pt-BR';
import { criarArmazenamentoEmMemoria } from './armazenamento-token';
import type { ContextoDaMutacao } from './consultas/anuncios';
import {
  type BaseDaEdicao,
  type ConfiguracaoDoAnuncio,
  useFormularioDeAnuncio,
} from './formulario-de-anuncio';
import { validarTrampo } from './validacao';

const SENTINELA = 'SENTINELA-DO-RASCUNHO-7c1d';

const VALORES: ValoresDoAnuncio = {
  titulo: 'Pintar a sala',
  descricao: 'Duas demãos de tinta branca.',
  categoria: 'pintura',
  cidade: 'Lavras',
  valor: '150,00',
  prazo: '',
};

function base(parcial: Partial<BaseDaEdicao> = {}): BaseDaEdicao {
  return { valores: VALORES, versao: 3, editavel: true, ...parcial };
}

interface Entrada {
  readonly titulo: string;
  readonly cidade: string;
  readonly versao: number | null;
}

type Opcoes = Partial<
  Pick<
    ConfiguracaoDoAnuncio<unknown, Entrada>,
    'inicial' | 'carregamento' | 'recarregar'
  >
>;

const salvar = jest.fn<Promise<unknown>, [Entrada]>();

function useFormularioDeTeste(opcoes: Opcoes) {
  const mutacao = useMutation<unknown, Error, Entrada, ContextoDaMutacao>({
    mutationFn: (entrada) => salvar(entrada),
    onMutate: () => ({ geracao: 0 }),
    networkMode: 'always',
    retry: 0,
    gcTime: 0,
  });
  return useFormularioDeAnuncio<unknown, Entrada>({
    tipo: 'trampo',
    validar: validarTrampo,
    montarEntrada: (valores, versao) => ({
      titulo: valores.titulo,
      cidade: valores.cidade,
      versao,
    }),
    mutacao,
    ...opcoes,
  });
}

async function montar(opcoes: Opcoes, semPerfil = false) {
  const fetch = criarFetchFalso()
    .responder('GET /categorias', {
      corpo: [{ id: 'pintura', rotulo: 'Pintura' }],
    })
    .responder(
      'GET /perfis/eu',
      semPerfil
        ? { status: 404 }
        : {
            corpo: {
              nome: 'Ana',
              cidade: 'Perfilândia',
              descricao: null,
              habilidades: ['pintura'],
              completo: true,
            },
          },
    );
  const { wrapper } = criarProvedores({
    armazenamento: criarArmazenamentoEmMemoria('token'),
    fetch,
  });
  const resultado = await renderHook(useFormularioDeTeste, {
    wrapper,
    initialProps: opcoes,
  });
  return resultado;
}

type Montado = Awaited<ReturnType<typeof montar>>;

async function digitar(
  montado: Montado,
  campo: 'titulo' | 'descricao' | 'cidade',
  texto: string,
) {
  await act(async () => {
    montado.result.current.props.onMudar(campo, texto);
  });
}

async function enviar(montado: Montado) {
  await act(async () => {
    montado.result.current.props.onEnviar();
  });
}

function edicao(montado: Montado) {
  const { edicao: e } = montado.result.current.props;
  if (e === undefined) throw new Error('sem modo editar');
  return e;
}

beforeEach(() => {
  // O TanStack avisa os componentes num `setTimeout(0)`; numa microtarefa o
  // aviso sai dentro do `act` do teste.
  notifyManager.setScheduler((avisar) => {
    void Promise.resolve().then(avisar);
  });
  salvar.mockReset().mockResolvedValue(undefined);
  onlineManager.setOnline(true);
});

afterEach(async () => {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
  notifyManager.setScheduler((avisar) => setTimeout(avisar, 0));
  onlineManager.setOnline(true);
});

describe('modo editar: a base', () => {
  it('abre preenchido com a base de `inicial`, sem alteração', async () => {
    const montado = await montar({ inicial: base() });
    const { props, alterado, salvo } = montado.result.current;
    expect(props.valores).toEqual(VALORES);
    expect(edicao(montado)).toMatchObject({
      situacao: 'pronta',
      naoEditavel: false,
      conflito: false,
      descartarVisivel: false,
    });
    expect(props.perfilIncompleto).toBeNull();
    expect(props.publicado).toBe(false);
    expect(alterado).toBe(false);
    expect(salvo).toBe(false);
  });

  it('a cidade do perfil não entra no lugar da cidade do anúncio', async () => {
    const montado = await montar({
      inicial: base({ valores: { ...VALORES, cidade: '' } }),
    });
    await waitFor(() =>
      expect(montado.result.current.props.categorias).toHaveLength(1),
    );
    expect(montado.result.current.props.valores.cidade).toBe('');
  });

  it('sem `inicial` (modo publicar) não há `edicao` e a cidade vem do perfil', async () => {
    const montado = await montar({});
    await waitFor(() =>
      expect(montado.result.current.props.valores.cidade).toBe('Perfilândia'),
    );
    expect(montado.result.current.props.edicao).toBeUndefined();
  });

  it('`alterado` só fica verdadeiro depois de mexer e volta ao desfazer', async () => {
    const montado = await montar({ inicial: base() });
    expect(montado.result.current.alterado).toBe(false);

    await digitar(montado, 'titulo', 'Pintar a cozinha');
    expect(montado.result.current.alterado).toBe(true);
    expect(montado.result.current.props.valores.titulo).toBe(
      'Pintar a cozinha',
    );

    await digitar(montado, 'titulo', VALORES.titulo);
    expect(montado.result.current.alterado).toBe(false);
  });

  it.each([
    ['carregando', undefined],
    ['erro', 'erro'],
    ['nao_encontrado', 'nao_encontrado'],
  ] as const)(
    'com `inicial` nulo a situação é %s',
    async (situacao, carregamento) => {
      const montado = await montar({
        inicial: null,
        ...(carregamento !== undefined && { carregamento }),
      });
      expect(edicao(montado).situacao).toBe(situacao);
      await enviar(montado);
      expect(salvar).not.toHaveBeenCalled();
    },
  );

  it('"Tentar de novo" chama `recarregar`', async () => {
    const recarregar = jest.fn().mockResolvedValue(undefined);
    const montado = await montar({
      inicial: null,
      carregamento: 'erro',
      recarregar,
    });
    await act(async () => {
      edicao(montado).onTentarDeNovo();
    });
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it('a base que chega depois passa a valer', async () => {
    const montado = await montar({ inicial: null });
    await montado.rerender({ inicial: base() });
    expect(edicao(montado).situacao).toBe('pronta');
    expect(montado.result.current.props.valores).toEqual(VALORES);
  });
});

describe('modo editar: base congelada (R1)', () => {
  it('a `inicial` que muda por baixo (foco, reconexão) não troca a base nem a versão do PUT', async () => {
    const montado = await montar({ inicial: base({ versao: 1 }) });
    await digitar(montado, 'titulo', SENTINELA);

    await montado.rerender({
      inicial: base({
        versao: 2,
        valores: { ...VALORES, descricao: 'Mudou em outro aparelho' },
      }),
    });
    expect(montado.result.current.props.valores.descricao).toBe(
      VALORES.descricao,
    );
    expect(montado.result.current.props.valores.titulo).toBe(SENTINELA);

    await enviar(montado);
    await waitFor(() => expect(montado.result.current.salvo).toBe(true));
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar.mock.calls[0]?.[0]).toMatchObject({ versao: 1 });
  });

  it('a `inicial` que vira `null` ou não editável depois também não mexe na base', async () => {
    const montado = await montar({ inicial: base({ versao: 1 }) });
    await montado.rerender({ inicial: base({ editavel: false, versao: 2 }) });
    expect(edicao(montado).naoEditavel).toBe(false);
    await montado.rerender({ inicial: null });
    expect(edicao(montado).situacao).toBe('pronta');
    expect(montado.result.current.props.valores).toEqual(VALORES);
  });

  it('a base que `recarregar` devolve passa a valer, e a viva que chega depois não', async () => {
    const nova = base({
      versao: 5,
      valores: { ...VALORES, descricao: 'Base recarregada' },
    });
    const recarregar = jest.fn().mockResolvedValue(nova);
    const montado = await montar({
      inicial: base({ versao: 1 }),
      recarregar,
    });
    await act(async () => {
      edicao(montado).onVerVersaoAtual();
    });
    await waitFor(() =>
      expect(montado.result.current.props.valores.descricao).toBe(
        'Base recarregada',
      ),
    );

    await montado.rerender({
      recarregar,
      inicial: base({ versao: 9 }),
    });
    expect(montado.result.current.props.valores.descricao).toBe(
      'Base recarregada',
    );
    await enviar(montado);
    await waitFor(() => expect(montado.result.current.salvo).toBe(true));
    expect(salvar.mock.calls[0]?.[0]).toMatchObject({ versao: 5 });
  });

  it('o 409 depois de a base viva mudar abre o aviso (e o PUT saiu com a versão lida)', async () => {
    salvar.mockRejectedValueOnce(new ErroDaApi(409, 'conflito_de_versao'));
    const montado = await montar({ inicial: base({ versao: 1 }) });
    await digitar(montado, 'titulo', SENTINELA);
    await montado.rerender({ inicial: base({ versao: 2 }) });
    await enviar(montado);
    await waitFor(() => expect(edicao(montado).conflito).toBe(true));
    expect(salvar.mock.calls[0]?.[0]).toMatchObject({ versao: 1 });
  });

  it('o motivo da base não editável chega à tela', async () => {
    const montado = await montar({
      inicial: base({
        editavel: false,
        motivoNaoEditavel: textos.anuncio.motivoEditarEmAndamento,
      }),
    });
    expect(edicao(montado).naoEditavel).toBe(true);
    expect(edicao(montado).motivoNaoEditavel).toBe(
      textos.anuncio.motivoEditarEmAndamento,
    );
  });

  it('base editável que a API recusa (409) fica sem motivo específico', async () => {
    salvar.mockRejectedValue(new ErroDaApi(409, 'trampo_nao_editavel'));
    const montado = await montar({ inicial: base() });
    await enviar(montado);
    await waitFor(() => expect(edicao(montado).naoEditavel).toBe(true));
    expect(edicao(montado)).not.toHaveProperty('motivoNaoEditavel');
  });
});

describe('modo editar: salvar', () => {
  it('manda a versão da base e, no sucesso, marca `salvo`', async () => {
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'titulo', 'Pintar a cozinha');
    await enviar(montado);

    await waitFor(() => expect(montado.result.current.salvo).toBe(true));
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar).toHaveBeenCalledWith({
      titulo: 'Pintar a cozinha',
      cidade: 'Lavras',
      versao: 3,
    });
    // Salvo não é mais "alteração não salva": sair não pergunta.
    expect(montado.result.current.alterado).toBe(false);
    expect(montado.result.current.props.publicado).toBe(false);
    expect(montado.result.current.publicadoId).toBeNull();
  });

  it('erro de campo mantém o rascunho e aponta o campo', async () => {
    salvar.mockRejectedValue(
      new ErroDaApi(400, 'dados_invalidos', [
        { campo: 'titulo', motivo: 'tamanho' },
      ]),
    );
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'descricao', SENTINELA);
    await enviar(montado);

    await waitFor(() =>
      expect(montado.result.current.props.erros.titulo).toBe(
        textos.erros.titulo_tamanho,
      ),
    );
    expect(montado.result.current.props.valores.descricao).toBe(SENTINELA);
    expect(montado.result.current.alterado).toBe(true);
    expect(montado.result.current.salvo).toBe(false);
    expect(edicao(montado).conflito).toBe(false);
  });

  it('validação local recusa sem chamar a API e mantém o rascunho', async () => {
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'titulo', '');
    await enviar(montado);
    expect(salvar).not.toHaveBeenCalled();
    expect(montado.result.current.props.erros.titulo).toBe(
      textos.erros.titulo_tamanho,
    );
    expect(montado.result.current.props.tentativa).toBe(1);
  });

  it('429 mantém o rascunho e deixa tentar de novo', async () => {
    salvar.mockRejectedValueOnce(new ErroDaApi(429, 'muitas_requisicoes'));
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'descricao', SENTINELA);
    await enviar(montado);

    await waitFor(() =>
      expect(montado.result.current.props.erros.geral).toBe(
        textos.erros.muitas_tentativas_acao,
      ),
    );
    expect(montado.result.current.props.valores.descricao).toBe(SENTINELA);
    expect(montado.result.current.alterado).toBe(true);
    expect(edicao(montado).conflito).toBe(false);
    expect(edicao(montado).naoEditavel).toBe(false);

    await enviar(montado);
    await waitFor(() => expect(montado.result.current.salvo).toBe(true));
    expect(salvar).toHaveBeenCalledTimes(2);
    expect(salvar.mock.calls[1]?.[0].versao).toBe(3);
  });

  it('falha de rede mantém o rascunho', async () => {
    salvar.mockRejectedValue(new ErroDeRede('falha'));
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'descricao', SENTINELA);
    await enviar(montado);

    await waitFor(() =>
      expect(montado.result.current.props.erros.geral).toBe(
        textos.erros.sem_conexao,
      ),
    );
    expect(montado.result.current.props.valores.descricao).toBe(SENTINELA);
    expect(montado.result.current.salvo).toBe(false);
  });

  it('sem conexão não envia e mantém o rascunho', async () => {
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'descricao', SENTINELA);
    await act(async () => {
      onlineManager.setOnline(false);
    });
    expect(montado.result.current.props.semConexao).toBe(true);
    await enviar(montado);

    expect(salvar).not.toHaveBeenCalled();
    expect(montado.result.current.props.valores.descricao).toBe(SENTINELA);
    expect(montado.result.current.alterado).toBe(true);
  });

  it('toque duplo manda um `PUT` só', async () => {
    let concluir: () => void = () => undefined;
    salvar.mockImplementation(
      () =>
        new Promise<void>((resolver) => {
          concluir = resolver;
        }),
    );
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'titulo', 'Pintar a cozinha');
    await act(async () => {
      montado.result.current.props.onEnviar();
      montado.result.current.props.onEnviar();
    });
    expect(salvar).toHaveBeenCalledTimes(1);
    await act(async () => {
      concluir();
    });
    await waitFor(() => expect(montado.result.current.salvo).toBe(true));
  });

  it('depois de salvo, outro envio não manda nada', async () => {
    const montado = await montar({ inicial: base() });
    await enviar(montado);
    await waitFor(() => expect(montado.result.current.salvo).toBe(true));
    await enviar(montado);
    expect(salvar).toHaveBeenCalledTimes(1);
  });
});

describe('modo editar: conflito de versão (D37)', () => {
  async function comConflito(recarregar: () => Promise<BaseDaEdicao | null>) {
    salvar.mockRejectedValueOnce(new ErroDaApi(409, 'conflito_de_versao'));
    const montado = await montar({ inicial: base(), recarregar });
    await digitar(montado, 'titulo', SENTINELA);
    await enviar(montado);
    await waitFor(() => expect(edicao(montado).conflito).toBe(true));
    return montado;
  }

  it('abre o aviso, sem texto de erro geral, e mantém o rascunho', async () => {
    const montado = await comConflito(jest.fn());
    expect(montado.result.current.props.erros.geral).toBeUndefined();
    expect(montado.result.current.props.valores.titulo).toBe(SENTINELA);
    expect(montado.result.current.alterado).toBe(true);
    expect(montado.result.current.props.tentativa).toBe(1);
  });

  it('"Ver versão atual" recarrega, mantém o que foi mexido e usa a versão nova', async () => {
    // A rota recarregou: a base nova traz outra versão, outra descrição e
    // outro título (que a pessoa já tinha mexido).
    const recarregar = jest.fn().mockResolvedValue(
      base({
        versao: 4,
        valores: {
          ...VALORES,
          titulo: 'Título de quem editou antes',
          descricao: 'Descrição nova da base',
        },
      }),
    );
    const montado = await comConflito(recarregar);

    await act(async () => {
      edicao(montado).onVerVersaoAtual();
    });
    expect(recarregar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(edicao(montado).conflito).toBe(false));
    const { valores } = montado.result.current.props;
    expect(valores.titulo).toBe(SENTINELA);
    expect(valores.descricao).toBe('Descrição nova da base');
    expect(montado.result.current.alterado).toBe(true);

    await enviar(montado);
    await waitFor(() => expect(montado.result.current.salvo).toBe(true));
    expect(salvar).toHaveBeenCalledTimes(2);
    expect(salvar.mock.calls[1]?.[0]).toMatchObject({
      titulo: SENTINELA,
      versao: 4,
    });
  });

  it('se a recarga falha, o aviso continua e dá para tentar de novo', async () => {
    const recarregar = jest
      .fn()
      .mockRejectedValueOnce(new ErroDeRede('falha'))
      .mockResolvedValue(undefined);
    const montado = await comConflito(recarregar);

    await act(async () => {
      edicao(montado).onVerVersaoAtual();
    });
    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(edicao(montado).conflito).toBe(true);

    await act(async () => {
      edicao(montado).onVerVersaoAtual();
    });
    await waitFor(() => expect(edicao(montado).conflito).toBe(false));
    expect(recarregar).toHaveBeenCalledTimes(2);
  });

  it('"Cancelar" fecha o aviso sem recarregar', async () => {
    const recarregar = jest.fn();
    const montado = await comConflito(recarregar);
    await act(async () => {
      edicao(montado).onDispensarConflito();
    });
    expect(edicao(montado).conflito).toBe(false);
    expect(recarregar).not.toHaveBeenCalled();
    expect(montado.result.current.props.valores.titulo).toBe(SENTINELA);
  });

  it('novo envio fecha o aviso antigo', async () => {
    const montado = await comConflito(jest.fn());
    await enviar(montado);
    await waitFor(() => expect(montado.result.current.salvo).toBe(true));
    expect(edicao(montado).conflito).toBe(false);
  });
});

describe('modo editar: anúncio que não pode ser editado', () => {
  it('`trampo_nao_editavel` vira `naoEditavel`, sem erro geral', async () => {
    salvar.mockRejectedValue(new ErroDaApi(409, 'trampo_nao_editavel'));
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'titulo', SENTINELA);
    await enviar(montado);

    await waitFor(() => expect(edicao(montado).naoEditavel).toBe(true));
    expect(edicao(montado).conflito).toBe(false);
    expect(montado.result.current.props.erros.geral).toBeUndefined();
    expect(montado.result.current.props.valores.titulo).toBe(SENTINELA);

    await enviar(montado);
    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it('a base que já vem não editável desabilita sem chamar a API', async () => {
    const montado = await montar({ inicial: base({ editavel: false }) });
    expect(edicao(montado).naoEditavel).toBe(true);
    await enviar(montado);
    expect(salvar).not.toHaveBeenCalled();
  });

  it('sem perfil, o aviso D9 só aparece ao publicar, não ao editar', async () => {
    const editar = await montar({ inicial: base() }, true);
    const publicar = await montar({}, true);
    await waitFor(() =>
      expect(publicar.result.current.props.perfilIncompleto).not.toBeNull(),
    );
    expect(editar.result.current.props.perfilIncompleto).toBeNull();
  });

  it('outro 409 não vira aviso de edição', async () => {
    salvar.mockRejectedValue(new ErroDaApi(409, 'trampo_nao_aberto'));
    const montado = await montar({ inicial: base() });
    await enviar(montado);
    await waitFor(() =>
      expect(montado.result.current.props.erros.geral).toBe(
        textos.erros.trampo_nao_aberto,
      ),
    );
    expect(edicao(montado).naoEditavel).toBe(false);
    expect(edicao(montado).conflito).toBe(false);
    // O aviso D9 não existe ao editar.
    expect(montado.result.current.props.perfilIncompleto).toBeNull();
  });
});

describe('modo editar: sair com alterações', () => {
  it('com o PUT em andamento não pergunta nem libera a saída (Q4)', async () => {
    let concluir: () => void = () => undefined;
    salvar.mockReturnValueOnce(
      new Promise<void>((resolver) => {
        concluir = resolver;
      }),
    );
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'titulo', SENTINELA);
    await enviar(montado);
    expect(salvar).toHaveBeenCalledTimes(1);

    const continuar = jest.fn();
    let seguraSaida = false;
    await act(async () => {
      seguraSaida = montado.result.current.perguntarDescarte(continuar);
    });
    expect(seguraSaida).toBe(true);
    expect(edicao(montado).descartarVisivel).toBe(false);
    expect(continuar).not.toHaveBeenCalled();

    await act(async () => {
      concluir();
    });
    await waitFor(() => expect(montado.result.current.salvo).toBe(true));
  });

  it('se o PUT falha, a pergunta volta', async () => {
    salvar.mockRejectedValueOnce(new ErroDaApi(400, 'dados_invalidos'));
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'titulo', SENTINELA);
    await enviar(montado);
    await waitFor(() => expect(montado.result.current.props.tentativa).toBe(1));
    await waitFor(() =>
      expect(montado.result.current.props.enviando).toBe(false),
    );
    await act(async () => {
      montado.result.current.perguntarDescarte(jest.fn());
    });
    expect(edicao(montado).descartarVisivel).toBe(true);
  });

  it('sem alteração deixa sair e não pergunta', async () => {
    const montado = await montar({ inicial: base() });
    const continuar = jest.fn();
    let pergunta = true;
    await act(async () => {
      pergunta = montado.result.current.perguntarDescarte(continuar);
    });
    expect(pergunta).toBe(false);
    expect(edicao(montado).descartarVisivel).toBe(false);
    expect(continuar).not.toHaveBeenCalled();
  });

  it('com alteração pergunta; "Continuar editando" não sai', async () => {
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'titulo', SENTINELA);
    const continuar = jest.fn();
    let pergunta = false;
    await act(async () => {
      pergunta = montado.result.current.perguntarDescarte(continuar);
    });
    expect(pergunta).toBe(true);
    expect(edicao(montado).descartarVisivel).toBe(true);

    await act(async () => {
      edicao(montado).onContinuarEditando();
    });
    expect(edicao(montado).descartarVisivel).toBe(false);
    expect(continuar).not.toHaveBeenCalled();
    expect(montado.result.current.props.valores.titulo).toBe(SENTINELA);
  });

  it('"Descartar" continua a saída, e a saída seguinte já passa', async () => {
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'titulo', SENTINELA);
    let segunda = true;
    const continuar = jest.fn(() => {
      // O `beforeRemove` dispara de novo com a mesma ação.
      segunda = montado.result.current.perguntarDescarte(() => undefined);
    });
    await act(async () => {
      montado.result.current.perguntarDescarte(continuar);
    });
    await act(async () => {
      edicao(montado).onDescartar();
    });
    expect(continuar).toHaveBeenCalledTimes(1);
    expect(segunda).toBe(false);
    expect(edicao(montado).descartarVisivel).toBe(false);
  });

  it('depois de salvar não pergunta', async () => {
    const montado = await montar({ inicial: base() });
    await digitar(montado, 'titulo', 'Pintar a cozinha');
    await enviar(montado);
    await waitFor(() => expect(montado.result.current.salvo).toBe(true));
    let pergunta = true;
    await act(async () => {
      pergunta = montado.result.current.perguntarDescarte(jest.fn());
    });
    expect(pergunta).toBe(false);
  });

  it('no modo publicar nunca pergunta', async () => {
    const montado = await montar({});
    await digitar(montado, 'titulo', SENTINELA);
    let pergunta = true;
    await act(async () => {
      pergunta = montado.result.current.perguntarDescarte(jest.fn());
    });
    expect(pergunta).toBe(false);
  });
});

describe('modo publicar (sem mudança)', () => {
  it('publica, guarda o id e não manda versão', async () => {
    salvar.mockResolvedValue({ id: 't-novo' });
    const montado = await montar({});
    await waitFor(() =>
      expect(montado.result.current.props.valores.cidade).toBe('Perfilândia'),
    );
    await digitar(montado, 'titulo', 'Pintar a sala');
    await digitar(montado, 'descricao', 'Duas demãos.');
    await act(async () => {
      montado.result.current.props.onMudarCategoria('pintura');
      montado.result.current.props.onMudar('valor', '150,00');
    });
    await enviar(montado);

    await waitFor(() =>
      expect(montado.result.current.publicadoId).toBe('t-novo'),
    );
    expect(salvar).toHaveBeenCalledWith({
      titulo: 'Pintar a sala',
      cidade: 'Perfilândia',
      versao: null,
    });
    expect(montado.result.current.props.publicado).toBe(true);
    expect(montado.result.current.salvo).toBe(false);
    expect(montado.result.current.alterado).toBe(false);
  });
});
