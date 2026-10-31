// QA da L4 (CA66, D47): Meus anúncios paginado, nas bordas que a primeira
// página cheia, o empate de `criadoEm` e a exclusão entre páginas criam. O
// servidor do teste pagina `GET /trampos/meus` como a API: `(criadoEm, id)`
// decrescente, cursor `antesDeCriadoEm` + `antesDeId`, `limite` máximo 50.
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { esquecerAvisoDeRetorno } from '../../estado/aviso-de-retorno';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso } from '../fetch-falso';
import { passar } from './apoio-anuncios-l2';
import {
  abrirApp,
  CATEGORIAS,
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

afterEach(() => {
  esquecerAvisoDeRetorno();
});

const a = textos.anuncio;
const dois = (n: number) => String(n).padStart(2, '0');
const tituloDe = (n: number) => `Trampo QA ${dois(n)}`;

interface TrampoDoServidor {
  id: string;
  autorId: string;
  titulo: string;
  descricao: string;
  categoria: string;
  cidade: string;
  valorCentavos: number;
  prazo: string | null;
  status: 'aberto';
  criadoEm: string;
  versao: number;
  candidaturasRecebidas: number;
}

/** O trampo `n` (maior = mais recente). Com `empate`, todos nascem no mesmo instante. */
function trampo(n: number, empate: boolean): TrampoDoServidor {
  return {
    id: `00000000-0000-4000-8000-0000000000${dois(n)}`,
    autorId: 'conta-ana',
    titulo: tituloDe(n),
    descricao: 'Duas demãos de tinta branca.',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 150000,
    prazo: null,
    status: 'aberto',
    criadoEm: empate
      ? '2026-09-10T12:00:00.000Z'
      : `2026-09-10T12:00:${dois(n % 60)}.000Z`,
    versao: 1,
    candidaturasRecebidas: 0,
  };
}

function criarServidor(total: number, empate = false) {
  const trampos = Array.from({ length: total }, (_, i) =>
    trampo(i + 1, empate),
  );
  const fetch = criarFetchFalso()
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /servicos/meus', { corpo: [] })
    .responder('GET /candidaturas/minhas', { corpo: [] })
    .responder('GET /conversas', { corpo: [] })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('GET /trampos/meus', (r) => {
      const { antesDeCriadoEm, antesDeId, limite } = r.query;
      const lista = [...trampos]
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
        .slice(0, Number(limite ?? 20));
      return { corpo: lista };
    });
  for (const t of trampos) {
    fetch.responder(`DELETE /trampos/${t.id}`, () => {
      trampos.splice(
        trampos.findIndex((x) => x.id === t.id),
        1,
      );
      return { status: 204 };
    });
  }
  return { fetch, trampos };
}

const titulosNaTela = () =>
  screen
    .queryAllByText(/^Trampo QA \d\d$/)
    .map((no) => String(no.props.children));

const botaoCarregarMais = () =>
  screen.queryByRole('button', { name: textos.gerais.carregarMais });

async function carregarTudo() {
  for (let i = 0; i < 5; i += 1) {
    const botao = botaoCarregarMais();
    if (botao === null) return;
    await fireEvent.press(botao);
    await passar(100);
  }
}

describe('Meus anúncios: bordas da paginação (CA66)', () => {
  it('com exatamente 20 trampos não há "Carregar mais" (o roteiro 6 diz: com 20 ou menos, o botão não aparece)', async () => {
    const { fetch } = criarServidor(20);
    await abrirApp('/meus-anuncios', { fetch });
    await screen.findByText(tituloDe(20));

    expect(titulosNaTela()).toHaveLength(20);
    expect(botaoCarregarMais()).toBeNull();
  });

  it('45 trampos no mesmo instante (empate de criadoEm): as três páginas trazem cada um uma vez', async () => {
    const { fetch } = criarServidor(45, true);
    await abrirApp('/meus-anuncios', { fetch });
    await screen.findAllByText(/^Trampo QA \d\d$/);
    await carregarTudo();

    const titulos = titulosNaTela();
    expect(titulos).toHaveLength(45);
    expect(new Set(titulos).size).toBe(45);
    expect(botaoCarregarMais()).toBeNull();
  });

  it('excluir um item da primeira página com as três carregadas: 44 itens, nenhum repetido, nenhum perdido', async () => {
    const { fetch, trampos } = criarServidor(45);
    await abrirApp('/meus-anuncios', { fetch });
    await screen.findByText(tituloDe(45));
    await carregarTudo();
    expect(titulosNaTela()).toHaveLength(45);

    await fireEvent.press(
      await screen.findByRole('button', { name: a.maisOpcoes(tituloDe(45)) }),
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: a.excluirTrampo }),
    );
    const confirmar = screen
      .getAllByRole('button', { name: a.excluirTrampo })
      .at(-1);
    if (confirmar === undefined) throw new Error('sem diálogo de exclusão');
    await fireEvent.press(confirmar);
    await passar(300);

    await waitFor(() => expect(titulosNaTela()).toHaveLength(44));
    const titulos = titulosNaTela();
    expect(new Set(titulos).size).toBe(44);
    expect(titulos).not.toContain(tituloDe(45));
    expect(titulos.sort()).toEqual(trampos.map((t) => t.titulo).sort());
  });
});
