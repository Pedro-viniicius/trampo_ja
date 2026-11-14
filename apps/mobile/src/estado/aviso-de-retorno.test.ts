import { act, renderHook, waitFor } from '@testing-library/react-native';
import { criarProvedores } from '../testes/renderizar';
import { textos } from '../textos/pt-BR';
import { criarArmazenamentoEmMemoria } from './armazenamento-token';
import {
  avisarAoVoltar,
  esquecerAvisoDeRetorno,
  useAvisoDeRetorno,
  VALIDADE_DO_AVISO_MS,
} from './aviso-de-retorno';
import { useSessao } from './sessao';

const AGORA = 1_800_000_000_000;

/** Só o `Date.now()` anda; o relógio do aviso é ele. */
function irPara(ms: number) {
  jest.setSystemTime(AGORA + ms);
}

beforeEach(() => {
  jest.useFakeTimers({ now: AGORA });
  esquecerAvisoDeRetorno();
});

afterEach(() => {
  jest.useRealTimers();
  esquecerAvisoDeRetorno();
});

async function montar(ativa = true) {
  const { wrapper } = criarProvedores({
    armazenamento: criarArmazenamentoEmMemoria('token'),
  });
  const resultado = await renderHook(
    (props: { ativa: boolean }) => ({
      sessao: useSessao(),
      aviso: useAvisoDeRetorno(props.ativa),
    }),
    { wrapper, initialProps: { ativa } },
  );
  await waitFor(() =>
    expect(resultado.result.current.sessao.status).toBe('autenticado'),
  );
  return resultado;
}

type Montado = Awaited<ReturnType<typeof montar>>;

function avisar(montado: Montado, geracao?: number) {
  avisarAoVoltar(
    'alteracoes_salvas',
    geracao ?? montado.result.current.sessao.geracao(),
  );
}

describe('useAvisoDeRetorno', () => {
  it('sem aviso pendente, não há texto', async () => {
    const montado = await montar();
    expect(montado.result.current.aviso.texto).toBeNull();
  });

  it('entrega o texto da chave quando a tela fica ativa', async () => {
    const montado = await montar(false);
    avisar(montado);
    expect(montado.result.current.aviso.texto).toBeNull();

    await montado.rerender({ ativa: true });
    expect(montado.result.current.aviso.texto).toBe(
      textos.anuncio.alteracoesSalvas,
    );
    expect(textos.anuncio.alteracoesSalvas).toBe('Alterações salvas.');
  });

  it('entrega o aviso que chega com a tela já ativa', async () => {
    const montado = await montar(true);
    await act(async () => {
      avisar(montado);
    });
    expect(montado.result.current.aviso.texto).toBe(
      textos.anuncio.alteracoesSalvas,
    );
  });

  it.each([
    ['trampo_excluido', textos.anuncio.trampoExcluido, 'Demanda excluída.'],
    ['servico_excluido', textos.anuncio.servicoExcluido, 'Serviço excluído.'],
    [
      'ja_nao_existe',
      textos.anuncio.jaNaoExiste,
      'Este anúncio já não existe.',
    ],
    ['avaliacao_enviada', textos.avaliar.enviada, 'Avaliação enviada.'],
    [
      'avaliacao_enviada_sem_favorito',
      textos.avaliar.enviadaSemFavorito,
      'Avaliação enviada, mas não foi possível favoritar. Você pode favoritar no perfil.',
    ],
  ] as const)(
    'a chave %s entrega o texto da exclusão',
    async (chave, texto, esperado) => {
      const montado = await montar(false);
      avisarAoVoltar(chave, montado.result.current.sessao.geracao());
      await montado.rerender({ ativa: true });
      expect(montado.result.current.aviso.texto).toBe(texto);
      expect(texto).toBe(esperado);
    },
  );

  it('`limpar` esconde o aviso, e ele não volta', async () => {
    const montado = await montar();
    await act(async () => {
      avisar(montado);
    });
    await act(async () => {
      montado.result.current.aviso.limpar();
    });
    expect(montado.result.current.aviso.texto).toBeNull();

    await montado.rerender({ ativa: false });
    await montado.rerender({ ativa: true });
    expect(montado.result.current.aviso.texto).toBeNull();
  });

  it('cada aviso é entregue uma vez só', async () => {
    const primeiro = await montar(false);
    avisar(primeiro);
    await primeiro.rerender({ ativa: true });
    expect(primeiro.result.current.aviso.texto).not.toBeNull();
    await primeiro.unmount();

    const segundo = await montar(true);
    expect(segundo.result.current.aviso.texto).toBeNull();
  });

  it('tela inativa não consome o aviso', async () => {
    const { wrapper } = criarProvedores({
      armazenamento: criarArmazenamentoEmMemoria('token'),
    });
    const montado = await renderHook(
      (props: { ativa: boolean }) => ({
        sessao: useSessao(),
        inativa: useAvisoDeRetorno(false),
        aviso: useAvisoDeRetorno(props.ativa),
      }),
      { wrapper, initialProps: { ativa: false } },
    );
    await waitFor(() =>
      expect(montado.result.current.sessao.status).toBe('autenticado'),
    );
    await act(async () => {
      avisarAoVoltar(
        'alteracoes_salvas',
        montado.result.current.sessao.geracao(),
      );
    });
    expect(montado.result.current.inativa.texto).toBeNull();

    await montado.rerender({ ativa: true });
    expect(montado.result.current.aviso.texto).toBe(
      textos.anuncio.alteracoesSalvas,
    );
  });

  describe('validade', () => {
    it('vale até o último instante antes de 10 s', async () => {
      const montado = await montar(false);
      avisar(montado);
      irPara(VALIDADE_DO_AVISO_MS - 1);
      await montado.rerender({ ativa: true });
      expect(montado.result.current.aviso.texto).toBe(
        textos.anuncio.alteracoesSalvas,
      );
    });

    it('expira em 10 s e não aparece depois', async () => {
      expect(VALIDADE_DO_AVISO_MS).toBe(10_000);
      const montado = await montar(false);
      avisar(montado);
      irPara(VALIDADE_DO_AVISO_MS);
      await montado.rerender({ ativa: true });
      expect(montado.result.current.aviso.texto).toBeNull();

      // Também não reaparece se o relógio voltasse ou a tela alternasse.
      irPara(0);
      await montado.rerender({ ativa: false });
      await montado.rerender({ ativa: true });
      expect(montado.result.current.aviso.texto).toBeNull();
    });

    it('um aviso novo recomeça a contagem', async () => {
      const montado = await montar(false);
      avisar(montado);
      irPara(9_000);
      avisar(montado);
      irPara(18_000);
      await montado.rerender({ ativa: true });
      expect(montado.result.current.aviso.texto).toBe(
        textos.anuncio.alteracoesSalvas,
      );
    });
  });

  describe('geração da sessão', () => {
    it('aviso de outra geração não é entregue nem fica guardado', async () => {
      const montado = await montar(false);
      const geracao = montado.result.current.sessao.geracao();
      avisar(montado, geracao - 1);
      await montado.rerender({ ativa: true });
      expect(montado.result.current.aviso.texto).toBeNull();

      // Foi descartado: não reaparece quando a geração "alcança" o número.
      await montado.rerender({ ativa: false });
      avisar(montado, geracao + 5);
      await montado.rerender({ ativa: true });
      expect(montado.result.current.aviso.texto).toBeNull();
    });

    it('não atravessa a troca de sessão entre o aviso e a tela', async () => {
      const montado = await montar(false);
      avisar(montado);
      await act(async () => {
        await montado.result.current.sessao.sair();
      });
      await act(async () => {
        await montado.result.current.sessao.entrar('token-da-outra-conta');
      });
      await montado.rerender({ ativa: true });
      expect(montado.result.current.aviso.texto).toBeNull();
    });

    it('some se a sessão muda com o aviso na tela', async () => {
      const montado = await montar(true);
      await act(async () => {
        avisar(montado);
      });
      expect(montado.result.current.aviso.texto).not.toBeNull();

      await act(async () => {
        await montado.result.current.sessao.sair();
      });
      await act(async () => {
        await montado.result.current.sessao.entrar('token-da-outra-conta');
      });
      expect(montado.result.current.aviso.texto).toBeNull();
    });
  });
});
