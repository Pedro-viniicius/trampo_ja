import type { StatusDaCandidatura, StatusDoTrampo } from '../api/tipos';
import { textos } from '../textos/pt-BR';
import { CAMPOS_DO_PERFIL_NOVO } from './perfil-incompleto';
import { type EntradaDoRodape, situacaoDoRodape } from './rodape-do-trampo';

const ABERTO = { id: 't1', status: 'aberto' as StatusDoTrampo };
const EM_ANDAMENTO = { id: 't1', status: 'em_andamento' as StatusDoTrampo };

const SEM_NADA = { dados: [] };
const MEU_TRAMPO = { dados: [{ id: 'outro' }, { id: 't1' }] };
const CANDIDATURA = (trampoId: string, status: StatusDaCandidatura) => ({
  dados: [
    { trampoId: 'outro', status: 'recusada' as StatusDaCandidatura },
    { trampoId, status },
  ],
});

function entrada(parcial: Partial<EntradaDoRodape>): EntradaDoRodape {
  return {
    trampo: ABERTO,
    meusTrampos: SEM_NADA,
    minhasCandidaturas: SEM_NADA,
    recebidas: undefined,
    ...parcial,
  };
}

describe('situacaoDoRodape: carregando', () => {
  it.each([
    ['sem o trampo', { trampo: undefined }],
    ['sem meusTrampos', { meusTrampos: { dados: undefined } }],
    ['sem minhasCandidaturas', { minhasCandidaturas: { dados: undefined } }],
    [
      'sem as duas listas',
      {
        meusTrampos: { dados: undefined },
        minhasCandidaturas: { dados: undefined },
      },
    ],
    [
      'falta só uma lista, mesmo com a outra dizendo autor',
      { meusTrampos: MEU_TRAMPO, minhasCandidaturas: { dados: undefined } },
    ],
    [
      'falta só a outra lista, mesmo com candidatura',
      {
        meusTrampos: { dados: undefined },
        minhasCandidaturas: CANDIDATURA('t1', 'pendente'),
      },
    ],
    [
      'falhou=false não é falha',
      { meusTrampos: { dados: undefined, falhou: false } },
    ],
  ])('%s', (_nome, parcial) => {
    expect(situacaoDoRodape(entrada(parcial))).toEqual({ tipo: 'carregando' });
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
          meusTrampos: MEU_TRAMPO,
          minhasCandidaturas: CANDIDATURA('t1', 'pendente'),
        }),
      ),
    ).toEqual({ tipo: 'autor', quantidade: null });
  });

  it('autor vence fechado', () => {
    expect(
      situacaoDoRodape(
        entrada({ trampo: EM_ANDAMENTO, meusTrampos: MEU_TRAMPO }),
      ),
    ).toEqual({ tipo: 'autor', quantidade: null });
  });

  it('candidatura em outro trampo não conta', () => {
    expect(
      situacaoDoRodape(
        entrada({ minhasCandidaturas: CANDIDATURA('outro', 'pendente') }),
      ),
    ).toEqual({ tipo: 'candidatar' });
  });

  it('meu trampo é outro: não sou o autor deste', () => {
    expect(
      situacaoDoRodape(entrada({ meusTrampos: { dados: [{ id: 'outro' }] } })),
    ).toEqual({ tipo: 'candidatar' });
  });
});

describe('situacaoDoRodape: autor e a quantidade', () => {
  it.each([
    [undefined, null],
    [[], 0],
    [[{}], 1],
    [[{}, {}, {}], 3],
  ])('recebidas %j dá quantidade %j', (recebidas, quantidade) => {
    expect(
      situacaoDoRodape(entrada({ meusTrampos: MEU_TRAMPO, recebidas })),
    ).toEqual({ tipo: 'autor', quantidade });
  });

  it('recebidas só importam para o autor', () => {
    expect(situacaoDoRodape(entrada({ recebidas: [{}, {}] }))).toEqual({
      tipo: 'candidatar',
    });
  });
});

describe('situacaoDoRodape: lista que falhou conta como vazia', () => {
  it('meusTrampos falhou: segue para candidatado', () => {
    expect(
      situacaoDoRodape(
        entrada({
          meusTrampos: { dados: undefined, falhou: true },
          minhasCandidaturas: CANDIDATURA('t1', 'pendente'),
        }),
      ),
    ).toEqual({ tipo: 'candidatado', status: 'pendente' });
  });

  it('minhasCandidaturas falhou: segue para candidatar (a API decide)', () => {
    expect(
      situacaoDoRodape(
        entrada({ minhasCandidaturas: { dados: undefined, falhou: true } }),
      ),
    ).toEqual({ tipo: 'candidatar' });
  });

  it('as duas falharam com o trampo fechado: fechado', () => {
    expect(
      situacaoDoRodape(
        entrada({
          trampo: EM_ANDAMENTO,
          meusTrampos: { dados: undefined, falhou: true },
          minhasCandidaturas: { dados: undefined, falhou: true },
        }),
      ),
    ).toEqual({ tipo: 'fechado' });
  });

  it('a lista que falhou não esconde o autor que veio da outra', () => {
    expect(
      situacaoDoRodape(
        entrada({
          meusTrampos: MEU_TRAMPO,
          minhasCandidaturas: { dados: undefined, falhou: true },
        }),
      ),
    ).toEqual({ tipo: 'autor', quantidade: null });
  });

  it('o trampo ainda sem dado continua carregando mesmo com as listas em erro', () => {
    expect(
      situacaoDoRodape(
        entrada({
          trampo: undefined,
          meusTrampos: { dados: undefined, falhou: true },
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
