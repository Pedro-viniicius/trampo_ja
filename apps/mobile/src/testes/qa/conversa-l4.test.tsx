// QA da L4 (CA59, D48): uma mensagem gravada depois de outra mais nova aparece
// no ciclo seguinte do polling, na posição da API e sem duplicata. Pelas rotas
// reais, com o servidor em memória de `apoio-conversas-2c` (a ordem do array
// `mundo.mensagens` é a ordem da API).

import { fireEvent, screen } from 'expo-router/testing-library';
import { INTERVALO_DO_POLLING_MS } from '../../estado/consultas/conversas';
import {
  AUTOR,
  avancar,
  botaoEnviar,
  CONVERSA,
  criarFetchDoMundo,
  criarMundo,
  dadosDaLista,
  escrever,
  FREELA,
  GETS_DAS_MENSAGENS,
  type MensagemDoServidor,
  type Mundo,
  restaurarConexao,
  textoDe,
} from './apoio-conversas-2c';
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

afterEach(async () => {
  await restaurarConexao();
});

/**
 * Grava no servidor uma mensagem que o relógio dela põe ANTES de `antesDe`
 * (como a corrida de duas gravações simultâneas: o `enviada_em` sai do relógio
 * do caso de uso, antes do insert), na posição certa da ordem da API.
 */
function gravarAtrasada(
  mundo: Mundo,
  antesDe: string,
  autorId: string,
  texto: string,
): MensagemDoServidor {
  const indice = mundo.mensagens.findIndex((m) => m.id === antesDe);
  const vizinha = mundo.mensagens[indice];
  if (vizinha === undefined) throw new Error('mensagem de referência ausente');
  const nova: MensagemDoServidor = {
    id: `m${mundo.proximoId}`,
    conversaId: CONVERSA,
    autorId,
    texto,
    // 20 s antes da vizinha: dentro da janela de 60 s.
    enviadaEm: new Date(Date.parse(vizinha.enviadaEm) - 20_000).toISOString(),
  };
  mundo.proximoId += 1;
  mundo.mensagens.splice(indice, 0, nova);
  return nova;
}

const ordemNaTela = () => dadosDaLista().map((item) => item.texto);

async function abrirConversa(mundo: Mundo) {
  const fetch = criarFetchDoMundo(mundo);
  await abrirApp(`/conversas/${CONVERSA}`, { fetch, token: FREELA.token });
  await screen.findByLabelText(new RegExp(`${textoDe(1)}$`));
  return fetch;
}

function mundoCom(n: number): Mundo {
  return criarMundo({
    mensagens: Array.from({ length: n }, (_, i) => ({
      autor: i % 2 === 0 ? AUTOR : FREELA,
      texto: textoDe(i + 1),
    })),
  });
}

describe('mensagem gravada depois de outra mais nova (CA59, R2)', () => {
  it('entra na posição da API no ciclo seguinte, sem duplicata e sem sumir com as outras', async () => {
    const mundo = mundoCom(3);
    await abrirConversa(mundo);
    expect(ordemNaTela()).toEqual([textoDe(1), textoDe(2), textoDe(3)]);

    // Chega depois, mas o relógio dela é anterior ao da 3.
    const m3 = mundo.mensagens[2]?.id as string;
    gravarAtrasada(mundo, m3, AUTOR.id, textoDe('atrasada'));
    await avancar(INTERVALO_DO_POLLING_MS);

    expect(ordemNaTela()).toEqual([
      textoDe(1),
      textoDe(2),
      textoDe('atrasada'),
      textoDe(3),
    ]);

    // Ciclos seguintes sem novidade não mudam nada nem repetem nada.
    await avancar(INTERVALO_DO_POLLING_MS * 3);
    expect(ordemNaTela()).toEqual([
      textoDe(1),
      textoDe(2),
      textoDe('atrasada'),
      textoDe(3),
    ]);
  });

  it('a atrasada e uma mensagem nova no mesmo ciclo: cada uma uma vez, na ordem da API', async () => {
    const mundo = mundoCom(3);
    await abrirConversa(mundo);

    gravarAtrasada(
      mundo,
      mundo.mensagens[2]?.id as string,
      AUTOR.id,
      textoDe('atrasada'),
    );
    mundo.gravarMensagem(AUTOR.id, textoDe('nova'));
    await avancar(INTERVALO_DO_POLLING_MS);

    expect(ordemNaTela()).toEqual([
      textoDe(1),
      textoDe(2),
      textoDe('atrasada'),
      textoDe(3),
      textoDe('nova'),
    ]);
  });

  it('a minha enviada e a do outro gravada antes dela: a minha aparece uma vez só e a pendente some', async () => {
    const mundo = mundoCom(3);
    const fetch = await abrirConversa(mundo);

    await escrever(textoDe('minha'));
    await fireEvent.press(botaoEnviar());
    await avancar(100);
    // O servidor guardou a minha no fim; a do outro entra antes dela.
    const minha = mundo.mensagens.at(-1) as MensagemDoServidor;
    expect(minha.texto).toBe(textoDe('minha'));
    gravarAtrasada(mundo, minha.id, AUTOR.id, textoDe('do-outro'));
    await avancar(INTERVALO_DO_POLLING_MS);

    const itens = dadosDaLista();
    expect(itens.map((i) => i.texto)).toEqual([
      textoDe(1),
      textoDe(2),
      textoDe(3),
      textoDe('do-outro'),
      textoDe('minha'),
    ]);
    expect(
      mundo.mensagens.filter((m) => m.texto === textoDe('minha')),
    ).toHaveLength(1);
    expect(fetch.requisicoes.filter((r) => r.metodo === 'POST')).toHaveLength(
      1,
    );
  });

  it('com menos de 50 mensagens na janela, cada ciclo continua sendo um GET só', async () => {
    const mundo = mundoCom(6);
    const fetch = await abrirConversa(mundo);
    fetch.limparRequisicoes();

    await avancar(INTERVALO_DO_POLLING_MS * 4);

    const gets = GETS_DAS_MENSAGENS(fetch);
    expect(gets.length).toBeGreaterThanOrEqual(3);
    expect(gets.length).toBeLessThanOrEqual(5);
  });
});
