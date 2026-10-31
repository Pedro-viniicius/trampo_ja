import type { PropsDaFolhaDeAcoes } from '../telas/tipos';
import { textos } from '../textos/pt-BR';
import { folhaDepoisDoConflito } from './folha-atualizada';

const SEM_ACAO = () => undefined;

function folha(erro?: string): PropsDaFolhaDeAcoes {
  return {
    visivel: true,
    titulo: 'Pintar a sala',
    tipo: 'trampo',
    editar: { disponivel: true },
    encerrar: { disponivel: true },
    excluir: { disponivel: true },
    efeitoDoEncerrar: '',
    efeitoDoExcluir: '',
    processando: null,
    ...(erro !== undefined && { erro }),
    onEditar: SEM_ACAO,
    onEncerrar: SEM_ACAO,
    onExcluir: SEM_ACAO,
    onFechar: SEM_ACAO,
  };
}

describe('folhaDepoisDoConflito (CA61, spec 3.4)', () => {
  const DO_409 = textos.anuncio.motivoExcluirNaoAberto;

  it('relendo: as ações ficam desabilitadas e o aviso segue o do 409, sem afirmar que atualizou', () => {
    const resultado = folhaDepoisDoConflito(folha(DO_409), 'relendo');

    expect(resultado.atualizando).toBe(true);
    expect(resultado.erro).toBe(DO_409);
    expect(resultado.visivel).toBe(true);
  });

  it('relido: o aviso diz que o anúncio mudou e as opções foram atualizadas', () => {
    const resultado = folhaDepoisDoConflito(folha(DO_409), 'relido');

    expect(resultado.erro).toBe(textos.anuncio.folhaAtualizada);
    expect(resultado.atualizando).toBeUndefined();
    expect(resultado.visivel).toBe(true);
  });

  it('falhou: a folha passa como veio, com o aviso do 409', () => {
    const original = folha(DO_409);

    expect(folhaDepoisDoConflito(original, 'falhou')).toBe(original);
  });

  it('sem conflito, a folha passa como veio, mesmo com o texto do 409 (o sinal é o conflito, não o texto)', () => {
    const comTexto = folha(DO_409);
    const semErro = folha();

    expect(folhaDepoisDoConflito(comTexto, null)).toBe(comTexto);
    expect(folhaDepoisDoConflito(semErro, null)).toBe(semErro);
  });
});
