// Etapa 16 da L4 (CA57): o formulário de Editar perfil só aparece depois da
// resposta de `GET /perfis/eu` (que pode ser o 404 do perfil novo). Antes
// aparece o carregando; com erro, o aviso com "Tentar de novo"; sem rede e sem
// dado, o erro de conexão (a consulta pausada não gira para sempre). Nada é
// salvo com campos vazios por falta de carga.
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import LayoutDaAreaAutenticada from '../../app/(app)/_layout';
import RotaDeEditarPerfil from '../../app/(app)/perfil/editar';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { vigiarConsole } from '../qa/apoio-qa';
import {
  type MapaDeRotas,
  type RotasRenderizadas,
  renderizarRotas,
  TOKEN_DE_TESTE,
} from './apoio';

const e = textos.editarPerfil;

const MEU_PERFIL = {
  nome: 'Ana Lima',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura', 'pedreiro'],
  completo: true,
};

const ERRO_INTERNO = { status: 500, corpo: { erro: 'erro_interno' } };

const ROTAS: MapaDeRotas = {
  '(app)/_layout': LayoutDaAreaAutenticada,
  '(app)/(abas)/index': () => <Text>stub: início</Text>,
  '(app)/perfil/editar': RotaDeEditarPerfil,
};

async function abrir(
  fetch: FetchFalso,
  url = '/perfil/editar',
): Promise<RotasRenderizadas> {
  return renderizarRotas(ROTAS, {
    initialUrl: url,
    fetch,
    armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
  });
}

const salvar = () =>
  screen.queryByRole('button', { name: textos.editarPerfil.salvar });
const tentarDeNovo = () =>
  screen.queryByRole('button', { name: textos.gerais.tentarDeNovo });
const requisicoesDe = (fetch: FetchFalso, metodo: string) =>
  fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === '/perfis/eu',
  );
const avancar = (ms = 50) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

/** Nenhum dos quatro campos nem o "Salvar" está na tela. */
function esperarSemFormulario() {
  expect(screen.queryByLabelText(e.nome)).toBeNull();
  expect(screen.queryByLabelText(e.cidade)).toBeNull();
  expect(screen.queryByLabelText(e.descricao)).toBeNull();
  expect(screen.queryByLabelText(e.adicionarHabilidade)).toBeNull();
  expect(salvar()).toBeNull();
}

vigiarConsole();

describe('perfil lento (CA57)', () => {
  it('mostra o carregando, sem campos nem "Salvar", e abre o formulário já preenchido', async () => {
    const fetch = criarFetchFalso().responder('GET /perfis/eu', {
      corpo: MEU_PERFIL,
      demoraMs: 3000,
    });
    await abrir(fetch);

    expect(await screen.findByLabelText(e.carregando)).toBeOnTheScreen();
    expect(
      screen.getByLabelText(e.carregando).props.accessibilityState,
    ).toEqual({ busy: true });
    esperarSemFormulario();
    expect(tentarDeNovo()).toBeNull();

    await avancar(3000);

    // Os campos nascem com o valor salvo: nunca vazios que se preenchem.
    expect(await screen.findByDisplayValue('Ana Lima')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Lavras')).toBeOnTheScreen();
    expect(screen.getByText('pintura')).toBeOnTheScreen();
    expect(salvar()).toBeOnTheScreen();
    expect(screen.queryByLabelText(e.carregando)).toBeNull();
    expect(requisicoesDe(fetch, 'PUT')).toHaveLength(0);
  });

  it('com o perfil ainda a caminho não há como salvar: nenhum PUT, nem com o formulário vazio', async () => {
    const fetch = criarFetchFalso().responder('GET /perfis/eu', {
      corpo: MEU_PERFIL,
      demoraMs: 3000,
    });
    await abrir(fetch);
    await screen.findByLabelText(e.carregando);

    await avancar(1000);

    expect(salvar()).toBeNull();
    expect(requisicoesDe(fetch, 'PUT')).toHaveLength(0);
  });

  it('em modo completar, "Agora não" continua como saída enquanto carrega', async () => {
    const fetch = criarFetchFalso().responder('GET /perfis/eu', {
      corpo: MEU_PERFIL,
      demoraMs: 3000,
    });
    await abrir(fetch, '/perfil/editar?completar=1');
    await screen.findByLabelText(e.carregando);

    expect(screen.getByRole('button', { name: e.agoraNao })).toBeOnTheScreen();
    expect(salvar()).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: e.agoraNao }));
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(requisicoesDe(fetch, 'PUT')).toHaveLength(0);
  });
});

describe('perfil novo: 404 não é erro (CA57)', () => {
  it('abre o formulário vazio, sem aviso de erro nem "Tentar de novo", e salva', async () => {
    const fetch = criarFetchFalso()
      .responder('GET /perfis/eu', { status: 404 })
      .responder('PUT /perfis/eu', { corpo: MEU_PERFIL });
    await abrir(fetch);

    expect(await screen.findByLabelText(e.nome)).toBeOnTheScreen();
    expect(screen.getByLabelText(e.nome).props.value).toBe('');
    expect(screen.getByLabelText(e.cidade).props.value).toBe('');
    expect(screen.queryByText(e.erroAoCarregar)).toBeNull();
    expect(screen.queryByText(e.semConexaoParaCarregar)).toBeNull();
    expect(tentarDeNovo()).toBeNull();
    expect(screen.queryByLabelText(e.carregando)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText(e.nome), 'Ana Lima');
    await fireEvent.changeText(screen.getByLabelText(e.cidade), 'Lavras');
    await fireEvent.changeText(
      screen.getByLabelText(e.adicionarHabilidade),
      'pintura',
    );
    await fireEvent.press(screen.getByRole('button', { name: e.adicionar }));
    await fireEvent.press(screen.getByRole('button', { name: e.salvar }));

    expect(await screen.findByText(e.sucesso)).toBeOnTheScreen();
    const puts = requisicoesDe(fetch, 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]?.corpo).toEqual({
      nome: 'Ana Lima',
      cidade: 'Lavras',
      habilidades: ['pintura'],
    });
  });
});

describe('erro ao carregar (CA57)', () => {
  it('mostra o aviso com "Tentar de novo", sem formulário, e o toque recarrega', async () => {
    const fetch = criarFetchFalso().responder('GET /perfis/eu', [
      ERRO_INTERNO,
      { corpo: MEU_PERFIL },
    ]);
    await abrir(fetch);

    expect(await screen.findByText(e.erroAoCarregar)).toBeOnTheScreen();
    expect(tentarDeNovo()).toBeOnTheScreen();
    expect(screen.queryByLabelText(e.carregando)).toBeNull();
    esperarSemFormulario();
    expect(requisicoesDe(fetch, 'GET')).toHaveLength(1);

    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.tentarDeNovo }),
    );

    expect(await screen.findByDisplayValue('Ana Lima')).toBeOnTheScreen();
    expect(requisicoesDe(fetch, 'GET')).toHaveLength(2);
    expect(screen.queryByText(e.erroAoCarregar)).toBeNull();
    expect(requisicoesDe(fetch, 'PUT')).toHaveLength(0);
  });

  it('o erro de carga não vira formulário vazio: nada é salvo e o PUT nunca sai', async () => {
    const fetch = criarFetchFalso().responder('GET /perfis/eu', ERRO_INTERNO);
    await abrir(fetch);

    await screen.findByText(e.erroAoCarregar);
    await avancar(100);

    expect(salvar()).toBeNull();
    expect(requisicoesDe(fetch, 'PUT')).toHaveLength(0);
  });

  it('erro de rede (fetch rejeita) também é erro de carga', async () => {
    const fetch = criarFetchFalso().responder('GET /perfis/eu', {
      falhaDeRede: true,
    });
    await abrir(fetch);

    expect(await screen.findByText(e.erroAoCarregar)).toBeOnTheScreen();
    expect(tentarDeNovo()).toBeOnTheScreen();
    esperarSemFormulario();
  });
});

describe('sem rede e sem dado (CA57)', () => {
  it('mostra o erro de conexão em vez de girar para sempre e abre o formulário ao voltar a rede', async () => {
    onlineManager.setOnline(false);
    try {
      const fetch = criarFetchFalso().responder('GET /perfis/eu', {
        corpo: MEU_PERFIL,
      });
      await abrir(fetch);

      expect(
        await screen.findByText(e.semConexaoParaCarregar),
      ).toBeOnTheScreen();
      expect(tentarDeNovo()).toBeOnTheScreen();
      expect(screen.queryByLabelText(e.carregando)).toBeNull();
      esperarSemFormulario();
      await avancar(100);
      // A consulta está pausada: nada foi pedido.
      expect(requisicoesDe(fetch, 'GET')).toHaveLength(0);

      await act(async () => onlineManager.setOnline(true));

      expect(await screen.findByDisplayValue('Ana Lima')).toBeOnTheScreen();
      expect(screen.queryByText(e.semConexaoParaCarregar)).toBeNull();
      expect(requisicoesDe(fetch, 'PUT')).toHaveLength(0);
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
  });
});
