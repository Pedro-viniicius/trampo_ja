// QA da L4 (CA61, R8): a folha "Mais opções" depois do 409 `trampo_nao_aberto`,
// nos desfechos que a releitura pode trazer além do "em andamento": o anúncio
// sumiu (404) ou a releitura falhou. Rotas reais, servidor da L2.
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { esquecerAvisoDeRetorno } from '../../estado/aviso-de-retorno';
import { textos } from '../../textos/pt-BR';
import {
  botaoDoDialogo,
  criarServidorL2,
  novoTrampo,
  passar,
  requisicoesDe,
} from './apoio-anuncios-l2';
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
const TITULO = 'Pintar a sala';

/** O DELETE perde a corrida: o trampo já estava em andamento no servidor. */
function servidorQueMudaNoDelete() {
  const servidor = criarServidorL2({
    trampos: [novoTrampo('t1', TITULO)],
  });
  const t1 = servidor.trampos[0];
  if (t1 === undefined) throw new Error('trampo do teste sumiu');
  servidor.fetch.responder('DELETE /trampos/t1', () => {
    t1.status = 'em_andamento';
    t1.versao += 1;
    return { status: 409, corpo: { erro: 'trampo_nao_aberto' } };
  });
  return { servidor, t1 };
}

async function abrirFolhaEExcluir() {
  await fireEvent.press(
    await screen.findByRole('button', { name: a.maisOpcoes(TITULO) }),
  );
  await screen.findByText(a.folhaTitulo(TITULO));
  await fireEvent.press(screen.getByRole('button', { name: a.excluirTrampo }));
  await fireEvent.press(botaoDoDialogo(a.excluirTrampo));
}

describe('folha depois do 409 trampo_nao_aberto: desfechos da releitura (CA61)', () => {
  it('o anúncio foi excluído por outro aparelho no meio (404 na releitura): a folha fecha e avisa que já não existe', async () => {
    const { servidor, t1 } = servidorQueMudaNoDelete();
    await abrirApp('/trampos/t1', { fetch: servidor.fetch });
    // A releitura do detalhe já não o encontra.
    servidor.fetch.responder('DELETE /trampos/t1', () => {
      t1.status = 'em_andamento';
      servidor.trampos.splice(0, 1);
      return { status: 409, corpo: { erro: 'trampo_nao_aberto' } };
    });

    await abrirFolhaEExcluir();
    await passar(200);

    await waitFor(() =>
      expect(screen.queryByText(a.folhaTitulo(TITULO))).toBeNull(),
    );
    expect(await screen.findByText(a.jaNaoExiste)).toBeTruthy();
    expect(screen.queryByText(a.folhaAtualizada)).toBeNull();
  });

  it('a releitura falha (500): a folha não afirma ter atualizado as opções e nada é reenviado', async () => {
    const { servidor } = servidorQueMudaNoDelete();
    await abrirApp('/trampos/t1', { fetch: servidor.fetch });
    await screen.findByRole('button', { name: a.maisOpcoes(TITULO) });
    // Depois do 409 o detalhe não consegue reler o trampo.
    servidor.fetch.responder('GET /trampos/t1', [
      { status: 500, corpo: { erro: 'erro_interno' } },
    ]);

    await abrirFolhaEExcluir();
    await passar(500);

    // Afirmar "Atualizamos as opções" com o dado velho na tela engana: o
    // "Excluir" continuaria habilitado e o próximo toque repetiria o 409.
    expect(screen.queryByText(a.folhaAtualizada)).toBeNull();
    expect(requisicoesDe(servidor.fetch, 'DELETE', '/trampos/t1')).toHaveLength(
      1,
    );
  });
});
