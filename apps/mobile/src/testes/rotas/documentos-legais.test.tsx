import { act, fireEvent, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { criarArmazenamentoEmMemoria } from '../../estado/armazenamento-token';
import { type Sessao, useSessao } from '../../estado/sessao';
import { politicaDePrivacidade, termosDeUso } from '../../textos/legal';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso } from '../fetch-falso';
import { tocarNoMesmoTick } from '../qa/apoio-conversas-2c';
import { renderizarRotas, TOKEN_DE_TESTE } from './apoio';

const EMAIL = 'maria.silva@exemplo.com';
const SENHA = 'senha-secreta-123';

let sessaoVista: Sessao | undefined;

function StubInicio() {
  sessaoVista = useSessao();
  return <Text>stub: início</Text>;
}

const AREA_LOGADA = { '(app)/index': StubInicio };

const DOCUMENTOS = [
  {
    nome: 'termos de uso',
    caminho: '/termos-de-uso',
    link: textos.cadastro.aceiteTermos,
    documento: termosDeUso,
  },
  {
    nome: 'política de privacidade',
    caminho: '/politica-de-privacidade',
    link: textos.cadastro.aceitePolitica,
    documento: politicaDePrivacidade,
  },
] as const;

beforeEach(() => {
  sessaoVista = undefined;
});

/** O botão "Voltar" do rodapé do documento (o do cabeçalho vem antes). */
function voltarDoRodape() {
  const botoes = screen.getAllByRole('button', {
    name: textos.documentoLegal.voltar,
  });
  const ultimo = botoes.at(-1);
  if (ultimo === undefined) {
    throw new Error('botão Voltar não encontrado');
  }
  return ultimo;
}

describe.each(DOCUMENTOS)('$nome', ({ caminho, link, documento }) => {
  it('abre a partir da Entrada, sem rede, e Voltar leva à Entrada (CA21)', async () => {
    const { fetch } = await renderizarRotas({}, { initialUrl: '/entrada' });

    await fireEvent.press(await screen.findByRole('button', { name: link }));

    expect(
      await screen.findByText(documento.secoes[0]?.titulo ?? ''),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname(caminho);
    expect(
      screen.getByText(
        textos.documentoLegal.versao(
          documento.versao.split('-').reverse().join('/'),
        ),
      ),
    ).toBeOnTheScreen();

    await fireEvent.press(voltarDoRodape());

    expect(
      await screen.findByText(textos.entrada.criarConta),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/entrada');
    expect(fetch.requisicoes).toHaveLength(0);
  });

  it('abre a partir do Cadastro e, ao voltar, o rascunho continua (CA21, CA22)', async () => {
    const { fetch } = await renderizarRotas({}, { initialUrl: '/cadastro' });
    await fireEvent.changeText(
      await screen.findByLabelText(textos.cadastro.email),
      EMAIL,
    );
    await fireEvent.changeText(
      screen.getByLabelText(textos.cadastro.senha),
      SENHA,
    );

    await fireEvent.press(screen.getByRole('button', { name: link }));
    expect(
      await screen.findByText(documento.secoes[0]?.titulo ?? ''),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname(caminho);

    await fireEvent.press(voltarDoRodape());

    expect(await screen.findByLabelText(textos.cadastro.email)).toHaveProp(
      'value',
      EMAIL,
    );
    expect(screen.getByLabelText(textos.cadastro.senha)).toHaveProp(
      'value',
      SENHA,
    );
    expect(screen).toHavePathname('/cadastro');
    expect(fetch.requisicoes).toHaveLength(0);
  });

  it.each([
    ['/entrada', textos.entrada.criarConta],
    ['/cadastro', textos.cadastro.email],
  ])(
    'toque duplo no link em %s empilha um documento só; de volta, o link abre de novo (Q3)',
    async (origem, marcaDaOrigem) => {
      await renderizarRotas({}, { initialUrl: origem });

      await tocarNoMesmoTick(await screen.findByRole('button', { name: link }));
      expect(
        await screen.findByText(documento.secoes[0]?.titulo ?? ''),
      ).toBeOnTheScreen();
      expect(screen).toHavePathname(caminho);

      // Um "Voltar" basta: não havia uma segunda cópia na pilha.
      await fireEvent.press(voltarDoRodape());
      expect(
        await screen.findAllByText(new RegExp(`^${marcaDaOrigem}`)),
      ).not.toHaveLength(0);
      expect(screen).toHavePathname(origem);

      // A trava sai quando a origem recupera o foco.
      await fireEvent.press(screen.getByRole('button', { name: link }));
      expect(
        await screen.findByText(documento.secoes[0]?.titulo ?? ''),
      ).toBeOnTheScreen();
      expect(screen).toHavePathname(caminho);
    },
  );

  it('abre com sessão pela URL, sem rede, e Voltar leva ao início (CA21)', async () => {
    const { fetch } = await renderizarRotas(AREA_LOGADA, {
      initialUrl: caminho,
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
      fetch: criarFetchFalso(),
    });

    expect(
      await screen.findByText(documento.secoes[0]?.titulo ?? ''),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname(caminho);

    await fireEvent.press(voltarDoRodape());

    expect(await screen.findByText('stub: início')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
    expect(fetch.requisicoes).toHaveLength(0);
  });

  it('abre sem sessão pela URL e Voltar leva à Entrada, não ao início', async () => {
    await renderizarRotas(AREA_LOGADA, { initialUrl: caminho });

    expect(
      await screen.findByText(documento.secoes[0]?.titulo ?? ''),
    ).toBeOnTheScreen();

    await fireEvent.press(voltarDoRodape());

    expect(
      await screen.findByText(textos.entrada.criarConta),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/entrada');
  });
});

describe('Entrada e Cadastro oferecem os dois documentos', () => {
  it.each(['/entrada', '/cadastro'])('%s tem os dois links', async (url) => {
    await renderizarRotas({}, { initialUrl: url });

    expect(
      await screen.findByRole('button', { name: textos.cadastro.aceiteTermos }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: textos.cadastro.aceitePolitica }),
    ).toBeOnTheScreen();
  });
});

describe('aviso de conta excluída no login', () => {
  it('mostra "Sua conta foi excluída." (o login aceita qualquer aviso)', async () => {
    await renderizarRotas(AREA_LOGADA, {
      initialUrl: '/',
      armazenamento: criarArmazenamentoEmMemoria(TOKEN_DE_TESTE),
    });
    expect(await screen.findByText('stub: início')).toBeOnTheScreen();

    await act(async () => {
      await sessaoVista?.encerrarPorExclusao();
    });

    expect(
      await screen.findByText(textos.erros.conta_excluida),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname('/entrar');
  });
});
