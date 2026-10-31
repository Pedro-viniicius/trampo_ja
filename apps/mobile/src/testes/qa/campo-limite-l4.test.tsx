// QA da L4 (CA55): o campo com limite por ponto de código, em estados que o
// teste do componente não alcança (valor trocado por fora, rotas reais).
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  fireEvent as dispararNaRota,
  screen as telaDaRota,
  waitFor,
} from 'expo-router/testing-library';
import { useState } from 'react';
import { CampoDeTexto } from '../../componentes';
import { textos } from '../../textos/pt-BR';
import { BIA, criarServidorL2, novoTrampo } from './apoio-anuncios-l2';
import {
  AUTOR,
  avancar,
  botaoEnviar,
  CONVERSA,
  campo,
  criarFetchDoMundo,
  criarMundo,
  escrever,
  FREELA,
  POSTS_DAS_MENSAGENS,
  textoDe,
} from './apoio-conversas-2c';
import {
  abrirApp,
  fakeComCategorias,
  PERFIL_COMPLETO,
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

const EMOJI = '\u{1F600}';

describe('CampoDeTexto com limite: valor trocado por fora (CA55)', () => {
  function ComBotaoDeLimpar({ limite }: { limite: number }) {
    const [valor, setValor] = useState('');
    return (
      <>
        <CampoDeTexto
          rotulo="Título"
          valor={valor}
          limite={limite}
          onChangeText={setValor}
        />
        <CampoDeTexto
          rotulo="Limpar"
          valor=""
          onChangeText={() => setValor('')}
        />
      </>
    );
  }

  it('o aviso de corte some quando o formulário limpa o campo por fora', async () => {
    await render(<ComBotaoDeLimpar limite={3} />);
    await fireEvent.changeText(
      screen.getByLabelText('Título'),
      EMOJI.repeat(9),
    );
    expect(screen.getByLabelText('Título').props.value).toBe(EMOJI.repeat(3));
    expect(
      screen.getAllByText(textos.gerais.contadorCortado(3)).length,
    ).toBeGreaterThan(0);
    // O formulário zera o valor (envio, "limpar filtros"): o campo está vazio.
    await fireEvent.changeText(screen.getByLabelText('Limpar'), 'x');
    expect(screen.getByLabelText('Título').props.value).toBe('');
    expect(screen.queryByText(textos.gerais.contadorCortado(3))).toBeNull();
    expect(screen.queryByText(textos.gerais.contadorLimite(3))).toBeNull();
  });

  it('texto livre com limite não repassa maxLength (UTF-16) ao TextInput', async () => {
    await render(
      <CampoDeTexto
        rotulo="Título"
        valor=""
        limite={80}
        onChangeText={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Título').props.maxLength).toBeUndefined();
  });
});

/** Cada campo de texto livre com limite (CA55), na tela real que o desenha. */
const CAMPOS: ReadonlyArray<{
  nome: string;
  url: string;
  rotulo: string;
  limite: number;
}> = [
  {
    nome: 'título do trampo',
    url: '/trampos/novo',
    rotulo: textos.formularioDeAnuncio.titulo,
    limite: 80,
  },
  {
    nome: 'descrição do trampo',
    url: '/trampos/novo',
    rotulo: textos.formularioDeAnuncio.descricao,
    limite: 2000,
  },
  {
    nome: 'cidade do trampo',
    url: '/trampos/novo',
    rotulo: textos.formularioDeAnuncio.cidade,
    limite: 80,
  },
  {
    nome: 'nome do perfil',
    url: '/perfil/editar',
    rotulo: textos.editarPerfil.nome,
    limite: 80,
  },
  {
    nome: 'cidade do perfil',
    url: '/perfil/editar',
    rotulo: textos.editarPerfil.cidade,
    limite: 80,
  },
  {
    nome: 'sobre você',
    url: '/perfil/editar',
    rotulo: textos.editarPerfil.descricao,
    limite: 300,
  },
  {
    nome: 'habilidade',
    url: '/perfil/editar',
    rotulo: textos.editarPerfil.adicionarHabilidade,
    limite: 30,
  },
  {
    nome: 'texto da busca',
    url: '/buscar',
    rotulo: textos.buscar.campo,
    limite: 100,
  },
];

describe('limite por ponto de código em cada campo das telas reais (CA55)', () => {
  it.each(CAMPOS)(
    '$nome: colar emoji além de $limite corta em $limite pontos, sem maxLength do TextInput',
    async ({ url, rotulo, limite }) => {
      const fetch = fakeComCategorias()
        .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
        .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } });
      await abrirApp(url, { fetch });
      const campo = await telaDaRota.findByLabelText(rotulo);
      expect(campo.props.maxLength).toBeUndefined();

      await dispararNaRota.changeText(campo, EMOJI.repeat(limite + 30));
      await waitFor(() =>
        expect(telaDaRota.getByLabelText(rotulo).props.value).toBe(
          EMOJI.repeat(limite),
        ),
      );
      expect(
        telaDaRota.getAllByText(textos.gerais.contadorCortado(limite)).length,
      ).toBeGreaterThan(0);
    },
  );

  it.each(CAMPOS)(
    '$nome: exatamente $limite emoji cabem inteiros e só avisam o limite',
    async ({ url, rotulo, limite }) => {
      const fetch = fakeComCategorias()
        .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
        .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } });
      await abrirApp(url, { fetch });
      const campo = await telaDaRota.findByLabelText(rotulo);

      await dispararNaRota.changeText(campo, EMOJI.repeat(limite));
      await waitFor(() =>
        expect(telaDaRota.getByLabelText(rotulo).props.value).toBe(
          EMOJI.repeat(limite),
        ),
      );
      expect(
        telaDaRota.queryByText(textos.gerais.contadorCortado(limite)),
      ).toBeNull();
      expect(
        telaDaRota.getAllByText(textos.gerais.contadorLimite(limite)).length,
      ).toBeGreaterThan(0);
    },
  );
});

describe('Busca: "Limpar filtros" depois de um texto cortado (CA55)', () => {
  it('o aviso de corte não fica no campo que a limpeza esvaziou', async () => {
    const fetch = fakeComCategorias().responder('GET /busca', {
      corpo: { itens: [], proximoCursor: null },
    });
    await abrirApp('/buscar', { fetch });
    const campo = await telaDaRota.findByLabelText(textos.buscar.campo);
    await dispararNaRota.changeText(campo, EMOJI.repeat(130));
    expect(
      telaDaRota.getAllByText(textos.gerais.contadorCortado(100)).length,
    ).toBeGreaterThan(0);

    await dispararNaRota.press(
      await telaDaRota.findByRole('button', {
        name: textos.buscar.limparFiltros,
      }),
    );
    await waitFor(() =>
      expect(telaDaRota.getByLabelText(textos.buscar.campo).props.value).toBe(
        '',
      ),
    );
    expect(
      telaDaRota.queryByText(textos.gerais.contadorCortado(100)),
    ).toBeNull();
  });
});

describe('mensagem da candidatura e da conversa (CA55)', () => {
  it('candidatura: colar emoji além de 2000 corta em 2000 pontos e avisa', async () => {
    const servidor = criarServidorL2({
      trampos: [novoTrampo('t9', 'Pintar a casa do vizinho', { autorId: BIA })],
    });
    await abrirApp('/trampos/t9', { fetch: servidor.fetch });
    await dispararNaRota.press(
      await telaDaRota.findByRole('button', {
        name: textos.detalheTrampo.candidatar,
      }),
    );
    const campo = await telaDaRota.findByLabelText(textos.candidatar.mensagem);
    expect(campo.props.maxLength).toBeUndefined();

    await dispararNaRota.changeText(campo, EMOJI.repeat(2030));
    await waitFor(() =>
      expect(
        telaDaRota.getByLabelText(textos.candidatar.mensagem).props.value,
      ).toBe(EMOJI.repeat(2000)),
    );
    expect(
      telaDaRota.getAllByText(textos.gerais.contadorCortado(2000)).length,
    ).toBeGreaterThan(0);
  });

  it('conversa: colar emoji além de 2000 corta em 2000 pontos, o envio leva os 2000 e o campo esvazia sem aviso velho', async () => {
    const mundo = criarMundo({
      mensagens: [{ autor: AUTOR, texto: textoDe(1) }],
    });
    const fetch = criarFetchDoMundo(mundo);
    await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
    await telaDaRota.findByLabelText(new RegExp(`${textoDe(1)}$`));

    await escrever(EMOJI.repeat(2030));
    expect(campo().props.value).toBe(EMOJI.repeat(2000));
    expect(campo().props.maxLength).toBeUndefined();
    expect(
      telaDaRota.getAllByText(textos.gerais.contadorCortado(2000)).length,
    ).toBeGreaterThan(0);

    await dispararNaRota.press(botaoEnviar());
    await avancar(100);

    const [post] = POSTS_DAS_MENSAGENS(fetch);
    expect(post?.corpo).toEqual({ texto: EMOJI.repeat(2000) });
    expect(campo().props.value).toBe('');
    expect(
      telaDaRota.queryByText(textos.gerais.contadorCortado(2000)),
    ).toBeNull();
    expect(
      telaDaRota.queryByText(textos.gerais.contadorLimite(2000)),
    ).toBeNull();
  });
});
