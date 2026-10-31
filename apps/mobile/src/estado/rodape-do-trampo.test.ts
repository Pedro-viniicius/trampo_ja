import type { StatusDaCandidatura, StatusDoTrampo } from '../api/tipos';
import { textos } from '../textos/pt-BR';
import { CAMPOS_DO_PERFIL_NOVO } from './perfil-incompleto';
import { type EntradaDoRodape, situacaoDoRodape } from './rodape-do-trampo';

const ABERTO = { id: 't1', status: 'aberto' as StatusDoTrampo };
const EM_ANDAMENTO = { id: 't1', status: 'em_andamento' as StatusDoTrampo };
const ENCERRADO = { id: 't1', status: 'encerrado' as StatusDoTrampo };

const SEM_NADA = { dados: [] };
const CANDIDATURA = (trampoId: string, status: StatusDaCandidatura) => ({
  dados: [
    { trampoId: 'outro', status: 'recusada' as StatusDaCandidatura },
    { trampoId, status },
  ],
});

function entrada(parcial: Partial<EntradaDoRodape>): EntradaDoRodape {
  return {
    trampo: ABERTO,
    souAutor: false,
    minhasCandidaturas: SEM_NADA,
    recebidas: undefined,
    ...parcial,
  };
}

describe('situacaoDoRodape: carregando', () => {
  it.each([
    ['sem o trampo', { trampo: undefined }],
    ['sem minhasCandidaturas', { minhasCandidaturas: { dados: undefined } }],
    [
      'falhou=false não é falha',
      { minhasCandidaturas: { dados: undefined, falhou: false } },
    ],
  ])('%s', (_nome, parcial) => {
    expect(situacaoDoRodape(entrada(parcial))).toEqual({ tipo: 'carregando' });
  });

  it('sem o trampo, nem o papel de autor tira o carregando', () => {
    expect(
      situacaoDoRodape(entrada({ trampo: undefined, souAutor: true })),
    ).toEqual({ tipo: 'carregando' });
  });

  it('o autor não espera Minhas candidaturas (D46)', () => {
    expect(
      situacaoDoRodape(
        entrada({
          souAutor: true,
          minhasCandidaturas: { dados: undefined },
        }),
      ),
    ).toEqual({ tipo: 'autor', quantidade: null });
  });
});

describe('situacaoDoRodape: ordem das situações', () => {
  it('candidatar: aberto, sem papel nas listas', () => {
    expect(situacaoDoRodape(entrada({}))).toEqual({ tipo: 'candidatar' });
  });

  it('fechado: em andamento e sem papel', () => {
    expect(situacaoDoRodape(entrada({ trampo: EM_ANDAMENTO }))).toEqual({
      tipo: 'fechado',
    });
  });

  it('fechado: encerrado e sem papel', () => {
    expect(situacaoDoRodape(entrada({ trampo: ENCERRADO }))).toEqual({
      tipo: 'fechado',
    });
  });

  it('encerrado: autor e candidatado vencem fechado', () => {
    expect(
      situacaoDoRodape(entrada({ trampo: ENCERRADO, souAutor: true })),
    ).toEqual({ tipo: 'autor', quantidade: null });
    expect(
      situacaoDoRodape(
        entrada({
          trampo: ENCERRADO,
          minhasCandidaturas: CANDIDATURA('t1', 'recusada'),
        }),
      ),
    ).toEqual({ tipo: 'candidatado', status: 'recusada' });
  });

  it('candidatado: devolve o status da minha candidatura', () => {
    for (const status of ['pendente', 'aceita', 'recusada'] as const) {
      expect(
        situacaoDoRodape(
          entrada({ minhasCandidaturas: CANDIDATURA('t1', status) }),
        ),
      ).toEqual({ tipo: 'candidatado', status });
    }
  });

  it('candidatado vence fechado', () => {
    expect(
      situacaoDoRodape(
        entrada({
          trampo: EM_ANDAMENTO,
          minhasCandidaturas: CANDIDATURA('t1', 'aceita'),
        }),
      ),
    ).toEqual({ tipo: 'candidatado', status: 'aceita' });
  });

  it('autor vence candidatado', () => {
    expect(
      situacaoDoRodape(
        entrada({
          souAutor: true,
          minhasCandidaturas: CANDIDATURA('t1', 'pendente'),
        }),
      ),
    ).toEqual({ tipo: 'autor', quantidade: null });
  });

  it('autor vence fechado', () => {
    expect(
      situacaoDoRodape(entrada({ trampo: EM_ANDAMENTO, souAutor: true })),
    ).toEqual({ tipo: 'autor', quantidade: null });
  });

  it('candidatura em outro trampo não conta', () => {
    expect(
      situacaoDoRodape(
        entrada({ minhasCandidaturas: CANDIDATURA('outro', 'pendente') }),
      ),
    ).toEqual({ tipo: 'candidatar' });
  });

  it('sem a visão do autor, não sou o autor: segue para candidatar', () => {
    expect(situacaoDoRodape(entrada({ souAutor: false }))).toEqual({
      tipo: 'candidatar',
    });
  });
});

describe('situacaoDoRodape: autor e a quantidade', () => {
  it.each([
    [undefined, null],
    [[], 0],
    [[{}], 1],
    [[{}, {}, {}], 3],
  ])('recebidas %j dá quantidade %j', (recebidas, quantidade) => {
    expect(situacaoDoRodape(entrada({ souAutor: true, recebidas }))).toEqual({
      tipo: 'autor',
      quantidade,
    });
  });

  it('recebidas só importam para o autor', () => {
    expect(situacaoDoRodape(entrada({ recebidas: [{}, {}] }))).toEqual({
      tipo: 'candidatar',
    });
  });
});

describe('situacaoDoRodape: lista que falhou conta como vazia', () => {
  it('minhasCandidaturas falhou: segue para candidatar (a API decide)', () => {
    expect(
      situacaoDoRodape(
        entrada({ minhasCandidaturas: { dados: undefined, falhou: true } }),
      ),
    ).toEqual({ tipo: 'candidatar' });
  });

  it('minhasCandidaturas falhou com o trampo fechado: fechado', () => {
    expect(
      situacaoDoRodape(
        entrada({
          trampo: EM_ANDAMENTO,
          minhasCandidaturas: { dados: undefined, falhou: true },
        }),
      ),
    ).toEqual({ tipo: 'fechado' });
  });

  it('a lista que falhou não esconde o autor', () => {
    expect(
      situacaoDoRodape(
        entrada({
          souAutor: true,
          minhasCandidaturas: { dados: undefined, falhou: true },
        }),
      ),
    ).toEqual({ tipo: 'autor', quantidade: null });
  });

  it('o trampo ainda sem dado continua carregando mesmo com a lista em erro', () => {
    expect(
      situacaoDoRodape(
        entrada({
          trampo: undefined,
          minhasCandidaturas: { dados: undefined, falhou: true },
        }),
      ),
    ).toEqual({ tipo: 'carregando' });
  });
});

describe('CAMPOS_DO_PERFIL_NOVO', () => {
  it('lista nome, cidade e habilidades nos rótulos do perfil', () => {
    expect(CAMPOS_DO_PERFIL_NOVO).toEqual([
      textos.perfil.camposNome,
      textos.perfil.camposCidade,
      textos.perfil.camposHabilidades,
    ]);
    expect(CAMPOS_DO_PERFIL_NOVO).toEqual(['nome', 'cidade', 'habilidades']);
  });

  it('é imutável', () => {
    expect(Object.isFrozen(CAMPOS_DO_PERFIL_NOVO)).toBe(true);
  });

  it('entra no aviso D9 como a spec escreve', () => {
    expect(textos.avisoPerfil.mensagem(CAMPOS_DO_PERFIL_NOVO)).toBe(
      'Complete seu perfil para publicar e se candidatar. Falta: nome, cidade e habilidades.',
    );
  });
});
