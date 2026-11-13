import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import { RepositorioDeTramposEmMemoria } from '../adaptadores/memoria/repositorio-memoria.js';
import { VerificadorDePerfilEmMemoria } from '../adaptadores/memoria/verificador-perfil-memoria.js';
import type {
  GravacaoSobTrava,
  RepositorioDeTrampos,
} from '../dominio/portas.js';
import { type EntradaDeTrampo, Trampo } from '../dominio/trampo.js';
import {
  type CasosDeUsoDeTrampos,
  criarCasosDeUsoDeTrampos,
  TENTATIVAS_DE_GRAVACAO,
} from './casos-de-uso.js';

const EMPREGADOR = 'conta-empregador';
const ANA = 'conta-ana';
const BRUNO = 'conta-bruno';
const CARLA = 'conta-carla';
const SEM_PERFIL = 'conta-sem-perfil';

const trampoValido: EntradaDeTrampo = {
  titulo: 'Pintar a sala',
  descricao: 'Pintura de uma sala de 20 m², tinta inclusa.',
  categoria: 'reformas',
  cidade: 'São Paulo',
  valorCentavos: 50000,
};
const proposta = {
  mensagem: 'Posso fazer na semana que vem.',
  valorPropostoCentavos: 45000,
};

let repositorio: RepositorioDeTramposEmMemoria;
let verificador: VerificadorDePerfilEmMemoria;
let relogio: RelogioFixo;
let casos: CasosDeUsoDeTrampos;

beforeEach(() => {
  repositorio = new RepositorioDeTramposEmMemoria();
  verificador = new VerificadorDePerfilEmMemoria([
    EMPREGADOR,
    ANA,
    BRUNO,
    CARLA,
  ]);
  relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
  casos = criarCasosDeUsoDeTrampos({
    repositorio,
    verificadorDePerfil: verificador,
    relogio,
  });
});

async function publicar(
  dados: Partial<EntradaDeTrampo> = {},
  autor = EMPREGADOR,
) {
  return (await casos.publicarTrampo(autor, { ...trampoValido, ...dados })).id;
}

/** O repositório em memória como objeto simples, para trocar um método. */
function repositorioComoObjeto(): RepositorioDeTrampos {
  return {
    salvar: (t) => repositorio.salvar(t),
    alterarSobTrava: (id, decidir) => repositorio.alterarSobTrava(id, decidir),
    buscarPorId: (id) => repositorio.buscarPorId(id),
    trampoDaCandidatura: (id) => repositorio.trampoDaCandidatura(id),
    listarDoAutor: (a, p) => repositorio.listarDoAutor(a, p),
    buscar: (f) => repositorio.buscar(f),
    existeCandidaturaEntre: (a, b) => repositorio.existeCandidaturaEntre(a, b),
    vinculoParaAvaliacao: (t, c) => repositorio.vinculoParaAvaliacao(t, c),
    listarCandidaturasDoFreelancer: (f) =>
      repositorio.listarCandidaturasDoFreelancer(f),
  };
}

type Desfecho = { ok: true } | { ok: false; erro: unknown };

/**
 * Casos de uso cuja trava do trampo (`alterarSobTrava`) tem escritas
 * concorrentes: `antes` grava por inteiro logo antes da trava (a ação do autor
 * a vê); `durante` é disparada com a trava tomada e só lê o trampo depois que
 * a ação do autor grava. `desfechoDeDurante` diz como ela terminou.
 */
function casosComConcorrencia(
  antes: () => Promise<unknown>,
  durante: () => Promise<unknown>,
) {
  let concorrente: Promise<Desfecho> | undefined;
  const casosDaCorrida = criarCasosDeUsoDeTrampos({
    repositorio: {
      ...repositorioComoObjeto(),
      alterarSobTrava: async (id, decidir) => {
        await antes();
        return repositorio.alterarSobTrava(id, (trampo) => {
          concorrente = durante().then(
            () => ({ ok: true as const }),
            (erro: unknown) => ({ ok: false as const, erro }),
          );
          return decidir(trampo);
        });
      },
    },
    verificadorDePerfil: verificador,
    relogio,
  });
  return {
    casos: casosDaCorrida,
    desfechoDeDurante: async () => {
      if (!concorrente) {
        throw new Error('a escrita concorrente não foi disparada');
      }
      return concorrente;
    },
  };
}

async function rejeicao(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava uma rejeição');
}

describe('CA4 — publicar trampo', () => {
  it('CA4 — Dado um usuário autenticado, quando publica um trampo válido, então o trampo fica aberto e aparece na busca', async () => {
    const resultado = await casos.publicarTrampo(EMPREGADOR, trampoValido);

    expect(resultado.status).toBe('aberto');
    const detalhe = await casos.obterTrampo(resultado.id, ANA);
    expect(detalhe).toMatchObject({
      autorId: EMPREGADOR,
      titulo: 'Pintar a sala',
      status: 'aberto',
      valorCentavos: 50000,
    });
    const achados = await casos.buscarTrampos({});
    expect(achados.map((t) => t.id)).toEqual([resultado.id]);
  });

  it('CA4 — Dado o limite de 5 caracteres no título e 1 centavo, quando publica, então o trampo é aceito', async () => {
    const id = await publicar({ titulo: 'Pinta', valorCentavos: 1 });
    expect((await casos.obterTrampo(id, ANA)).titulo).toBe('Pinta');
  });

  it('CA4 — Dado um autor, quando lista os seus trampos, então vê o publicado', async () => {
    const id = await publicar();
    await publicar({}, ANA);
    expect(
      (await casos.listarMeusTrampos(EMPREGADOR)).map((t) => t.id),
    ).toEqual([id]);
  });

  it('CA4 — Dado um id inexistente, quando busca o detalhe, então recebe não encontrado', async () => {
    expect(await rejeicao(casos.obterTrampo('nao-existe', ANA))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
  });
});

describe('CA5 — publicação inválida', () => {
  const casosInvalidos: [string, Partial<EntradaDeTrampo>, string, string][] = [
    ['falta o título', { titulo: undefined }, 'titulo', 'obrigatorio'],
    ['o título tem 4 caracteres', { titulo: 'abcd' }, 'titulo', 'tamanho'],
    [
      'o título passa de 80 caracteres',
      { titulo: 'a'.repeat(81) },
      'titulo',
      'tamanho',
    ],
    ['falta a categoria', { categoria: undefined }, 'categoria', 'obrigatorio'],
    ['a categoria não existe', { categoria: 'magia' }, 'categoria', 'invalido'],
    ['falta a cidade', { cidade: undefined }, 'cidade', 'obrigatorio'],
    ['o valor é zero', { valorCentavos: 0 }, 'valorCentavos', 'invalido'],
    [
      'o valor é negativo',
      { valorCentavos: -100 },
      'valorCentavos',
      'invalido',
    ],
  ];

  for (const [quando, alteracao, campo, motivo] of casosInvalidos) {
    it(`CA5 — Dado um trampo, quando ${quando}, então a publicação é recusada apontando ${campo}`, async () => {
      const erro = await rejeicao(
        casos.publicarTrampo(EMPREGADOR, { ...trampoValido, ...alteracao }),
      );

      expect(erro).toBeInstanceOf(ErroDeValidacao);
      expect((erro as ErroDeValidacao).campos).toEqual([{ campo, motivo }]);
      expect(await casos.buscarTrampos({})).toEqual([]);
    });
  }

  it('CA5 — Dado vários campos inválidos, quando publica, então todos são apontados de uma vez', async () => {
    const erro = await rejeicao(
      casos.publicarTrampo(EMPREGADOR, {
        ...trampoValido,
        titulo: '',
        cidade: '',
        valorCentavos: 0,
      }),
    );
    expect((erro as ErroDeValidacao).campos.map((c) => c.campo)).toEqual([
      'titulo',
      'cidade',
      'valorCentavos',
    ]);
  });
});

describe('D9 — perfil completo', () => {
  it('D9 — Dado um usuário sem perfil completo, quando publica um trampo, então recebe perfil_incompleto e nada é salvo', async () => {
    const erro = await rejeicao(casos.publicarTrampo(SEM_PERFIL, trampoValido));

    expect(erro).toEqual(new ErroDeRegra('perfil_incompleto'));
    expect(await casos.listarMeusTrampos(SEM_PERFIL)).toEqual([]);
  });

  it('D9 — Dado um usuário sem perfil, quando publica dados inválidos, então a recusa é perfil_incompleto (a porta vem antes)', async () => {
    const erro = await rejeicao(casos.publicarTrampo(SEM_PERFIL, {}));
    expect(erro).toEqual(new ErroDeRegra('perfil_incompleto'));
  });

  it('D9 — Dado um freelancer sem perfil completo, quando se candidata, então recebe perfil_incompleto', async () => {
    const id = await publicar();

    const erro = await rejeicao(casos.candidatar(SEM_PERFIL, id, proposta));

    expect(erro).toEqual(new ErroDeRegra('perfil_incompleto'));
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toEqual([]);
  });

  it('D9 — Dado um freelancer sem perfil, quando se candidata a um trampo inexistente, então recebe perfil_incompleto antes do não encontrado', async () => {
    const erro = await rejeicao(
      casos.candidatar(SEM_PERFIL, 'nao-existe', proposta),
    );
    expect(erro).toEqual(new ErroDeRegra('perfil_incompleto'));
  });

  it('D9 — Dado que o usuário completa o perfil, quando publica, então a publicação passa', async () => {
    verificador.completar(SEM_PERFIL);
    const resultado = await casos.publicarTrampo(SEM_PERFIL, trampoValido);
    expect(resultado.status).toBe('aberto');
  });
});

describe('CA8 — candidatura', () => {
  it('CA8 — Dado um trampo aberto, quando um freelancer envia mensagem e valor, então a candidatura fica pendente e o empregador a vê', async () => {
    const id = await publicar();

    const resultado = await casos.candidatar(ANA, id, {
      mensagem: '  Tenho experiência.  ',
      valorPropostoCentavos: 45000,
    });

    expect(resultado.status).toBe('pendente');
    const lista = await casos.listarCandidaturas(EMPREGADOR, id);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      id: resultado.id,
      freelancerId: ANA,
      mensagem: 'Tenho experiência.',
      valorPropostoCentavos: 45000,
      status: 'pendente',
    });
  });

  it('CA8 — Dado mensagem vazia ou valor zero, quando se candidata, então recebe erro de validação apontando os campos', async () => {
    const id = await publicar();

    const erro = await rejeicao(
      casos.candidatar(ANA, id, { mensagem: '', valorPropostoCentavos: 0 }),
    );

    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'mensagem', motivo: 'obrigatorio' },
      { campo: 'valorPropostoCentavos', motivo: 'invalido' },
    ]);
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toEqual([]);
  });

  it('CA8 — Dado um trampo inexistente, quando alguém se candidata, então recebe não encontrado', async () => {
    expect(
      await rejeicao(casos.candidatar(ANA, 'nao-existe', proposta)),
    ).toBeInstanceOf(ErroNaoEncontrado);
  });

  it('CA8 — Dado quem não é o autor, quando tenta listar as candidaturas, então recebe não encontrado', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);

    expect(await rejeicao(casos.listarCandidaturas(ANA, id))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect(await rejeicao(casos.listarCandidaturas(BRUNO, id))).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect(
      await rejeicao(casos.listarCandidaturas(EMPREGADOR, 'nao-existe')),
    ).toBeInstanceOf(ErroNaoEncontrado);
  });
});

describe('CA8 — minhas candidaturas', () => {
  it('CA8 — Dado um freelancer com candidaturas em trampos diferentes, quando lista as suas, então vê só as dele, com o trampo e o status, mais recentes primeiro', async () => {
    const primeiro = await publicar();
    const segundo = await publicar({ titulo: 'Montar armário' });
    const antiga = await casos.candidatar(ANA, primeiro, proposta);
    relogio.avancar(60_000);
    const recente = await casos.candidatar(ANA, segundo, {
      mensagem: 'Monto amanhã.',
      valorPropostoCentavos: 30000,
    });
    await casos.candidatar(BRUNO, primeiro, proposta);

    const minhas = await casos.listarMinhasCandidaturas(ANA);

    expect(minhas).toEqual([
      {
        id: recente.id,
        trampoId: segundo,
        freelancerId: ANA,
        mensagem: 'Monto amanhã.',
        valorPropostoCentavos: 30000,
        status: 'pendente',
        criadaEm: new Date('2026-10-20T12:01:00.000Z'),
      },
      {
        id: antiga.id,
        trampoId: primeiro,
        freelancerId: ANA,
        mensagem: proposta.mensagem,
        valorPropostoCentavos: proposta.valorPropostoCentavos,
        status: 'pendente',
        criadaEm: new Date('2026-10-20T12:00:00.000Z'),
      },
    ]);
  });

  it('CA8 — Dado um aceite, quando os freelancers listam as suas candidaturas, então veem aceita e recusada', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);

    expect(
      (await casos.listarMinhasCandidaturas(ANA)).map((c) => c.status),
    ).toEqual(['aceita']);
    expect(
      (await casos.listarMinhasCandidaturas(BRUNO)).map((c) => c.status),
    ).toEqual(['recusada']);
  });

  it('CA8 — Dado um usuário sem candidaturas, quando lista as suas, então recebe lista vazia', async () => {
    await publicar();
    expect(await casos.listarMinhasCandidaturas(CARLA)).toEqual([]);
    expect(await casos.listarMinhasCandidaturas(EMPREGADOR)).toEqual([]);
  });
});

describe('CA9 — candidatura recusada pela regra', () => {
  it('CA9 — Dado um trampo, quando o próprio autor tenta se candidatar, então a candidatura é recusada', async () => {
    const id = await publicar();

    const erro = await rejeicao(casos.candidatar(EMPREGADOR, id, proposta));

    expect(erro).toEqual(new ErroDeRegra('autor_nao_pode_candidatar'));
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toEqual([]);
  });

  it('CA9 — Dado um freelancer que já se candidatou, quando tenta de novo, então a candidatura é recusada', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);

    const erro = await rejeicao(casos.candidatar(ANA, id, proposta));

    expect(erro).toEqual(new ErroDeRegra('candidatura_duplicada'));
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toHaveLength(1);
  });

  it('CA9 — Dado um freelancer recusado após o aceite de outro, quando tenta se candidatar de novo, então recebe candidatura_duplicada', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);

    const erro = await rejeicao(casos.candidatar(BRUNO, id, proposta));

    expect(erro).toEqual(new ErroDeRegra('candidatura_duplicada'));
  });
});

describe('CA10 — aceitar candidatura', () => {
  it('CA10 — Dado um trampo com candidaturas pendentes, quando o empregador aceita uma, então o trampo fica em andamento, a escolhida aceita e as demais recusadas', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const bruno = await casos.candidatar(BRUNO, id, proposta);
    const carla = await casos.candidatar(CARLA, id, proposta);

    await casos.aceitarCandidatura(EMPREGADOR, id, bruno.id);

    expect((await casos.obterTrampo(id, ANA)).status).toBe('em_andamento');
    const lista = await casos.listarCandidaturas(EMPREGADOR, id);
    const statusPorId = Object.fromEntries(lista.map((c) => [c.id, c.status]));
    expect(statusPorId).toEqual({
      [ana.id]: 'recusada',
      [bruno.id]: 'aceita',
      [carla.id]: 'recusada',
    });
  });

  it('CA10 — Dado quem não é o autor, quando tenta aceitar, então recebe não encontrado e nada muda', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);

    expect(
      await rejeicao(casos.aceitarCandidatura(ANA, id, ana.id)),
    ).toBeInstanceOf(ErroNaoEncontrado);
    expect((await casos.obterTrampo(id, ANA)).status).toBe('aberto');
  });

  it('CA10 — Dado uma candidatura inexistente, quando o autor tenta aceitar, então recebe não encontrado', async () => {
    const id = await publicar();
    expect(
      await rejeicao(casos.aceitarCandidatura(EMPREGADOR, id, 'nao-existe')),
    ).toBeInstanceOf(ErroNaoEncontrado);
  });

  it('CA10 — Dado um trampo já em andamento, quando o autor tenta aceitar outra candidatura, então é recusado com trampo_nao_aberto', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const bruno = await casos.candidatar(BRUNO, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);

    const erro = await rejeicao(
      casos.aceitarCandidatura(EMPREGADOR, id, bruno.id),
    );

    expect(erro).toEqual(new ErroDeRegra('trampo_nao_aberto'));
  });

  it('CA10 — Dado dois aceites concorrentes sobre o mesmo agregado, quando ambos tentam gravar, então só um vence e o outro, ao reler, recebe trampo_nao_aberto', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const bruno = await casos.candidatar(BRUNO, id, proposta);

    const resultados = await Promise.allSettled([
      casos.aceitarCandidatura(EMPREGADOR, id, ana.id),
      casos.aceitarCandidatura(EMPREGADOR, id, bruno.id),
    ]);

    const rejeitados = resultados.filter((r) => r.status === 'rejected');
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejeitados).toHaveLength(1);
    expect((rejeitados[0] as PromiseRejectedResult).reason).toEqual(
      new ErroDeRegra('trampo_nao_aberto'),
    );
    const lista = await casos.listarCandidaturas(EMPREGADOR, id);
    expect(lista.filter((c) => c.status === 'aceita')).toHaveLength(1);
  });

  it('CA10 — Dado duas leituras do mesmo trampo, quando as duas aceitam e gravam em sequência, então a segunda recebe conflito_de_versao', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const bruno = await casos.candidatar(BRUNO, id, proposta);
    const primeira = await repositorio.buscarPorId(id);
    const segunda = await repositorio.buscarPorId(id);
    primeira?.aceitar(ana.id, EMPREGADOR);
    segunda?.aceitar(bruno.id, EMPREGADOR);

    await repositorio.salvar(primeira as NonNullable<typeof primeira>);
    const erro = await rejeicao(
      repositorio.salvar(segunda as NonNullable<typeof segunda>),
    );

    expect(erro).toEqual(new ErroDeRegra('conflito_de_versao'));
  });

  it('CA9 — Dado duas candidaturas concorrentes do mesmo freelancer, quando ambas gravam, então a segunda, ao reler, recebe candidatura_duplicada', async () => {
    const id = await publicar();
    const resultados = await Promise.allSettled([
      casos.candidatar(ANA, id, proposta),
      casos.candidatar(ANA, id, proposta),
    ]);

    const rejeitados = resultados.filter((r) => r.status === 'rejected');
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejeitados).toHaveLength(1);
    expect((rejeitados[0] as PromiseRejectedResult).reason).toEqual(
      new ErroDeRegra('candidatura_duplicada'),
    );
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toHaveLength(1);
  });

  it('CA8 — Dado candidaturas concorrentes de freelancers distintos, quando todas gravam, então cada uma é gravada', async () => {
    const id = await publicar();
    const resultados = await Promise.allSettled([
      casos.candidatar(ANA, id, proposta),
      casos.candidatar(BRUNO, id, proposta),
      casos.candidatar(CARLA, id, proposta),
    ]);

    expect(resultados.map((r) => r.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toHaveLength(3);
  });

  it('CA10 — Dado uma candidatura gravada entre a leitura e a gravação do aceite, quando o aceite perde a trava, então relê, aceita e recusa a recém-chegada', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    let intrometeu = false;
    const casosComCorrida = criarCasosDeUsoDeTrampos({
      repositorio: {
        ...repositorioComoObjeto(),
        salvar: async (trampo) => {
          if (!intrometeu) {
            intrometeu = true;
            await casos.candidatar(BRUNO, id, proposta);
          }
          return repositorio.salvar(trampo);
        },
      },
      verificadorDePerfil: verificador,
      relogio,
    });

    await casosComCorrida.aceitarCandidatura(EMPREGADOR, id, ana.id);

    expect((await casos.obterTrampo(id, ANA)).status).toBe('em_andamento');
    const lista = await casos.listarCandidaturas(EMPREGADOR, id);
    expect(
      Object.fromEntries(lista.map((c) => [c.freelancerId, c.status])),
    ).toEqual({ [ANA]: 'aceita', [BRUNO]: 'recusada' });
  });

  it('CA10 — Dado uma gravação que perde a trava sempre, quando aceita, então desiste depois do teto de tentativas com conflito_de_versao', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    let gravacoes = 0;
    const casosQuePerdem = criarCasosDeUsoDeTrampos({
      repositorio: {
        ...repositorioComoObjeto(),
        salvar: async () => {
          gravacoes += 1;
          throw new ErroDeRegra('conflito_de_versao');
        },
      },
      verificadorDePerfil: verificador,
      relogio,
    });

    const erro = await rejeicao(
      casosQuePerdem.aceitarCandidatura(EMPREGADOR, id, ana.id),
    );

    expect(erro).toEqual(new ErroDeRegra('conflito_de_versao'));
    expect(gravacoes).toBe(TENTATIVAS_DE_GRAVACAO);
  });

  it('CA28 — Dado uma candidatura que perde a trava em todas as tentativas e, na última, para a exclusão do trampo, então recebe não encontrado, não conflito', async () => {
    const id = await publicar();
    let gravacoes = 0;
    const casosQuePerdem = criarCasosDeUsoDeTrampos({
      repositorio: {
        ...repositorioComoObjeto(),
        salvar: async () => {
          gravacoes += 1;
          if (gravacoes === TENTATIVAS_DE_GRAVACAO) {
            await casos.excluirTrampo(EMPREGADOR, id);
          }
          throw new ErroDeRegra('conflito_de_versao');
        },
      },
      verificadorDePerfil: verificador,
      relogio,
    });

    const erro = await rejeicao(casosQuePerdem.candidatar(ANA, id, proposta));

    expect(erro).toBeInstanceOf(ErroNaoEncontrado);
    expect(gravacoes).toBe(TENTATIVAS_DE_GRAVACAO);
  });

  it('CA10 — Dado ids em maiúsculas, quando o autor aceita, então acha o trampo e a candidatura', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);

    await casos.aceitarCandidatura(
      EMPREGADOR,
      id.toUpperCase(),
      ana.id.toUpperCase(),
    );

    const lista = await casos.listarCandidaturas(EMPREGADOR, id);
    expect(lista[0]?.status).toBe('aceita');
  });
});

describe('CA11 — trampo que não está aberto', () => {
  it('CA11 — Dado um trampo em andamento, quando outro freelancer tenta se candidatar, então a candidatura é recusada', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);

    const erro = await rejeicao(casos.candidatar(CARLA, id, proposta));

    expect(erro).toEqual(new ErroDeRegra('trampo_nao_aberto'));
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toHaveLength(1);
  });
});

describe('busca de trampos (CA4 e CA7)', () => {
  it('CA7 — Dado um título acentuado, quando busca em minúsculas sem acento ou em maiúsculas, então encontra o trampo', async () => {
    const id = await publicar({
      titulo: 'Instalação elétrica',
      descricao: 'Trocar a fiação da COZINHA',
    });
    await publicar({ titulo: 'Aula de violão', descricao: 'Iniciante' });

    for (const texto of [
      'instalacao',
      'INSTALAÇÃO ELÉTRICA',
      'cozinha',
      '  fiacao  ',
    ]) {
      expect((await casos.buscarTrampos({ texto })).map((t) => t.id)).toEqual([
        id,
      ]);
    }
  });

  it('CA7 — Dado trampos de categorias e cidades diferentes, quando busca com mais de um filtro, então só aparecem os que atendem a todos', async () => {
    const certo = await publicar({
      categoria: 'ti',
      cidade: 'Belo Horizonte',
      titulo: 'Site para loja',
    });
    await publicar({
      categoria: 'design',
      cidade: 'Belo Horizonte',
      titulo: 'Site para padaria',
    });
    await publicar({
      categoria: 'ti',
      cidade: 'Curitiba',
      titulo: 'Site para clínica',
    });

    const achados = await casos.buscarTrampos({
      texto: 'site',
      categoria: 'ti',
      cidade: 'BELO horizonte',
    });

    expect(achados.map((t) => t.id)).toEqual([certo]);
    expect(await casos.buscarTrampos({ categoria: 'ti' })).toHaveLength(2);
    expect(await casos.buscarTrampos({ cidade: 'São Paulo' })).toEqual([]);
  });

  it('CA7 — Dado vários trampos, quando busca, então os mais recentes vêm primeiro e o cursor pagina sem repetir', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await publicar({ titulo: `Trampo número ${i}` }));
      relogio.avancar(1000);
    }
    // Dois no mesmo instante: o desempate é o id decrescente.
    const empate1 = await publicar({ titulo: 'Empate um' });
    const empate2 = await publicar({ titulo: 'Empate dois' });
    const [maior, menor] = [empate1, empate2].sort().reverse() as [
      string,
      string,
    ];

    const primeira = await casos.buscarTrampos({ limite: 3 });
    expect(primeira.map((t) => t.id)).toEqual([maior, menor, ids[4]]);

    const ultimo = primeira[2] as (typeof primeira)[number];
    const segunda = await casos.buscarTrampos({
      limite: 3,
      antesDe: { criadoEm: ultimo.criadoEm, id: ultimo.id },
    });
    expect(segunda.map((t) => t.id)).toEqual([ids[3], ids[2], ids[1]]);
  });

  it('CA7 — Dado nenhum limite, quando busca, então devolve no máximo 20 itens', async () => {
    for (let i = 0; i < 25; i++) {
      await publicar({ titulo: `Trampo número ${i}` });
      relogio.avancar(1000);
    }
    expect(await casos.buscarTrampos({})).toHaveLength(20);
  });

  it('CA7 — Dado um trampo em andamento, quando busca, então ele não aparece', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);

    expect(await casos.buscarTrampos({})).toEqual([]);
  });

  it('CA7 — Dado filtros inválidos, quando busca, então recebe erro de validação apontando os campos', async () => {
    const erro = await rejeicao(
      casos.buscarTrampos({
        texto: 'a'.repeat(101),
        categoria: 'magia',
        limite: 0,
      }),
    );
    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'texto', motivo: 'tamanho' },
      { campo: 'categoria', motivo: 'invalido' },
      { campo: 'limite', motivo: 'invalido' },
    ]);
  });

  it('CA7 — Dado texto ou cidade com caractere nulo, quando busca, então recebe invalido no campo (o Postgres recusaria o parâmetro)', async () => {
    const erro = await rejeicao(
      casos.buscarTrampos({ texto: 'pin\u0000tura', cidade: 'Lav\u0000ras' }),
    );
    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'texto', motivo: 'invalido' },
      { campo: 'cidade', motivo: 'invalido' },
    ]);
  });

  it('CA7 — Dado texto com espaços repetidos, quando busca, então o tamanho é medido depois de normalizar', async () => {
    await publicar();
    expect(
      await casos.buscarTrampos({ texto: `a${' '.repeat(150)}b` }),
    ).toEqual([]);
  });

  it('CA7 — Dado filtros só com espaços, quando busca, então são ignorados', async () => {
    await publicar();
    expect(
      await casos.buscarTrampos({ texto: '   ', cidade: ' ' }),
    ).toHaveLength(1);
  });
});

describe('existeVinculoEntre (contrato com conversas)', () => {
  it('Dado uma candidatura, quando consulta nos dois sentidos, então há vínculo', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);

    expect(await casos.existeVinculoEntre(EMPREGADOR, ANA)).toBe(true);
    expect(await casos.existeVinculoEntre(ANA, EMPREGADOR)).toBe(true);
  });

  it('Dado uma candidatura recusada, quando consulta, então o vínculo continua', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);

    expect(await casos.existeVinculoEntre(EMPREGADOR, BRUNO)).toBe(true);
  });

  it('Dado dois candidatos do mesmo trampo, quando consulta entre eles, então não há vínculo', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);

    expect(await casos.existeVinculoEntre(ANA, BRUNO)).toBe(false);
  });

  it('Dado um trampo sem candidatura ou contas sem relação, quando consulta, então não há vínculo', async () => {
    await publicar();
    expect(await casos.existeVinculoEntre(EMPREGADOR, ANA)).toBe(false);
    expect(await casos.existeVinculoEntre(ANA, ANA)).toBe(false);
    expect(await casos.existeVinculoEntre(ANA, 'desconhecida')).toBe(false);
  });
});

describe('vinculoParaAvaliacao (contrato com avaliacoes, CA87)', () => {
  /** Trampo com ANA aceita e BRUNO recusado (em andamento). */
  async function emAndamento(): Promise<string> {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);
    return id;
  }

  const vinculo = (trampoId: string, contaId: string) =>
    repositorio.vinculoParaAvaliacao(trampoId, contaId);

  it('CA87 — Dado um trampo encerrado com candidatura aceita, quando as partes consultam, então o autor avalia o freela e o freela avalia o autor', async () => {
    const id = await emAndamento();
    await casos.encerrarTrampo(EMPREGADOR, id);

    expect(await vinculo(id, EMPREGADOR)).toEqual({
      avaliadoId: ANA,
      papelDoAvaliado: 'freela',
    });
    expect(await vinculo(id, ANA)).toEqual({
      avaliadoId: EMPREGADOR,
      papelDoAvaliado: 'contratante',
    });
  });

  it('CA87 — Dado um trampo encerrado, quando consulta o candidato recusado ou um terceiro, então não há vínculo', async () => {
    const id = await emAndamento();
    await casos.encerrarTrampo(EMPREGADOR, id);

    expect(await vinculo(id, BRUNO)).toBeNull();
    expect(await vinculo(id, CARLA)).toBeNull();
  });

  it('CA87 — Dado um trampo em andamento, quando as partes consultam, então recebem nao_encerrado; recusado e terceiro, nada', async () => {
    const id = await emAndamento();

    expect(await vinculo(id, EMPREGADOR)).toBe('nao_encerrado');
    expect(await vinculo(id, ANA)).toBe('nao_encerrado');
    expect(await vinculo(id, BRUNO)).toBeNull();
    expect(await vinculo(id, CARLA)).toBeNull();
  });

  it('CA87 — Dado um trampo aberto, quando o autor consulta, então recebe nao_encerrado; o candidato pendente e o terceiro, nada', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);

    expect(await vinculo(id, EMPREGADOR)).toBe('nao_encerrado');
    expect(await vinculo(id, ANA)).toBeNull();
    expect(await vinculo(id, CARLA)).toBeNull();
  });

  it('CA87 — Dado um trampo encerrado sem candidatura aceita, quando consulta, então ninguém tem a quem avaliar', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);
    await casos.encerrarTrampo(EMPREGADOR, id);

    expect(await vinculo(id, EMPREGADOR)).toBeNull();
    expect(await vinculo(id, ANA)).toBeNull();
  });

  it('CA87 — Dado um trampo inexistente, excluído ou com a candidatura retirada, quando consulta, então não há vínculo', async () => {
    expect(await vinculo('nao-existe', EMPREGADOR)).toBeNull();

    const excluido = await publicar();
    await casos.excluirTrampo(EMPREGADOR, excluido);
    expect(await vinculo(excluido, EMPREGADOR)).toBeNull();

    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.retirarCandidatura(ANA, ana.id);
    expect(await vinculo(id, ANA)).toBeNull();
  });

  it('CA87 — Dado um terceiro, quando consulta em cada estado do trampo, então a resposta é sempre a mesma do trampo inexistente (sem oráculo)', async () => {
    const aberto = await publicar();
    const andamento = await emAndamento();
    const encerrado = await emAndamento();
    await casos.encerrarTrampo(EMPREGADOR, encerrado);
    const encerradoSemAceita = await publicar();
    await casos.encerrarTrampo(EMPREGADOR, encerradoSemAceita);

    const respostas = await Promise.all(
      [aberto, andamento, encerrado, encerradoSemAceita, 'nao-existe'].map(
        (id) => vinculo(id, CARLA),
      ),
    );

    expect(respostas).toEqual([null, null, null, null, null]);
  });

  it('Dado duas candidaturas aceitas no mesmo trampo (estado que a regra não produz), quando consulta, então ninguém avalia', async () => {
    const id = await emAndamento();
    await casos.encerrarTrampo(EMPREGADOR, id);
    const lido = await repositorio.buscarPorId(id);
    if (!lido) {
      throw new Error('trampo não encontrado no teste');
    }
    const dados = lido.dados();
    await repositorio.salvar(
      Trampo.reconstituir({
        ...dados,
        versao: dados.versao + 1,
        candidaturas: dados.candidaturas.map((c) => ({
          ...c,
          status: 'aceita' as const,
        })),
      }),
    );

    expect(await vinculo(id, EMPREGADOR)).toBeNull();
    expect(await vinculo(id, ANA)).toBeNull();
    expect(await vinculo(id, BRUNO)).toBeNull();
  });
});

const edicao = {
  titulo: 'Trocar o piso',
  descricao: 'Piso da cozinha, 12 m².',
  categoria: 'reformas',
  cidade: 'Belo Horizonte',
  valorCentavos: 90000,
  prazo: '2026-12-01',
};

/** Código do erro de regra (ou o próprio erro, se não for de regra). */
async function codigo(promessa: Promise<unknown>): Promise<unknown> {
  const erro = await rejeicao(promessa);
  return erro instanceof ErroDeRegra ? erro.codigo : erro;
}

describe('CA25 — editar trampo', () => {
  it('CA25 — Dado o autor com a versão lida, quando edita, então os campos mudam, a busca acha o texto novo e criadoEm e a posição na busca não mudam', async () => {
    const id = await publicar();
    relogio.avancar(60_000);
    const depois = await publicar({ titulo: 'Outro trampo' }, ANA);
    const { versao } = await casos.obterTrampo(id, EMPREGADOR);

    relogio.avancar(60_000);
    await casos.editarTrampo(EMPREGADOR, id, { ...edicao, versao });

    const detalhe = await casos.obterTrampo(id, EMPREGADOR);
    expect(detalhe).toMatchObject({
      ...edicao,
      autorId: EMPREGADOR,
      status: 'aberto',
      criadoEm: new Date('2026-10-20T12:00:00.000Z'),
      versao: 2,
      candidaturasRecebidas: 0,
    });
    expect(
      (await casos.buscarTrampos({ texto: 'cozinha' })).map((t) => t.id),
    ).toEqual([id]);
    expect(
      (await casos.buscarTrampos({ texto: 'pintar' })).map((t) => t.id),
    ).toEqual([]);
    expect(
      (await casos.buscarTrampos({ cidade: 'belo horizonte' })).map(
        (t) => t.id,
      ),
    ).toEqual([id]);
    expect((await casos.buscarTrampos({})).map((t) => t.id)).toEqual([
      depois,
      id,
    ]);
  });

  it('CA25 — Dado um prazo ausente na edição, quando o autor edita, então o trampo fica sem prazo', async () => {
    const id = await publicar({ prazo: '2026-12-31' });
    const { prazo: _prazo, ...semPrazo } = edicao;

    await casos.editarTrampo(EMPREGADOR, id, { ...semPrazo, versao: 1 });

    expect((await casos.obterTrampo(id, EMPREGADOR)).prazo).toBeNull();
  });

  it('CA25 — Dado um terceiro ou o candidato, quando tenta editar, então recebe não encontrado e nada muda', async () => {
    const id = await publicar();
    const outro = await publicar({}, ANA);
    await casos.candidatar(BRUNO, outro, proposta);
    const antes = await casos.obterTrampo(id, EMPREGADOR);

    for (const quem of [ANA, CARLA]) {
      expect(
        await rejeicao(casos.editarTrampo(quem, id, { ...edicao, versao: 1 })),
      ).toBeInstanceOf(ErroNaoEncontrado);
    }
    expect(
      await rejeicao(
        casos.editarTrampo(BRUNO, outro, { ...edicao, versao: 2 }),
      ),
    ).toBeInstanceOf(ErroNaoEncontrado);
    expect(await casos.obterTrampo(id, EMPREGADOR)).toEqual(antes);
  });

  it('CA25 — Dado um trampo inexistente ou id fora do formato, quando edita, então recebe não encontrado', async () => {
    for (const id of ['nao-existe', '00000000-0000-4000-8000-000000000000']) {
      expect(
        await rejeicao(
          casos.editarTrampo(EMPREGADOR, id, { ...edicao, versao: 1 }),
        ),
      ).toBeInstanceOf(ErroNaoEncontrado);
    }
  });

  it('CA25 — Dado um trampo com candidatura, em andamento ou encerrado, quando o autor edita, então recebe trampo_nao_editavel e nada muda', async () => {
    const comCandidatura = await publicar();
    await casos.candidatar(ANA, comCandidatura, proposta);
    const emAndamento = await publicar();
    const ana = await casos.candidatar(ANA, emAndamento, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, emAndamento, ana.id);
    const encerrado = await publicar();
    await casos.encerrarTrampo(EMPREGADOR, encerrado);

    for (const id of [comCandidatura, emAndamento, encerrado]) {
      const antes = await casos.obterTrampo(id, EMPREGADOR);
      expect(
        await codigo(
          casos.editarTrampo(EMPREGADOR, id, {
            ...edicao,
            versao: antes.versao,
          }),
        ),
      ).toBe('trampo_nao_editavel');
      expect(await casos.obterTrampo(id, EMPREGADOR)).toEqual(antes);
    }
  });

  it('CA25 — Dado uma versão velha, quando o autor edita, então recebe conflito_de_versao e nada muda', async () => {
    const id = await publicar();
    await casos.editarTrampo(EMPREGADOR, id, { ...edicao, versao: 1 });
    const antes = await casos.obterTrampo(id, EMPREGADOR);

    expect(
      await codigo(
        casos.editarTrampo(EMPREGADOR, id, { ...trampoValido, versao: 1 }),
      ),
    ).toBe('conflito_de_versao');
    expect(await casos.obterTrampo(id, EMPREGADOR)).toEqual(antes);
  });

  it('CA25 — ordem: versão ausente ou inválida (400) antes do 404; 404 antes da regra; regra antes da versão; versão antes dos campos', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);
    const semCandidatura = await publicar();

    for (const versao of [undefined, null]) {
      expect(
        await rejeicao(casos.editarTrampo(CARLA, 'nao-existe', { versao })),
      ).toEqual(ErroDeValidacao.doCampo('versao', 'obrigatorio'));
    }
    for (const versao of [0, -1, 1.5, '1']) {
      expect(
        await rejeicao(casos.editarTrampo(CARLA, 'nao-existe', { versao })),
      ).toEqual(ErroDeValidacao.doCampo('versao', 'invalido'));
    }
    expect(
      await rejeicao(casos.editarTrampo(CARLA, id, { versao: 99 })),
    ).toBeInstanceOf(ErroNaoEncontrado);
    expect(
      await codigo(casos.editarTrampo(EMPREGADOR, id, { versao: 99 })),
    ).toBe('trampo_nao_editavel');
    expect(
      await codigo(
        casos.editarTrampo(EMPREGADOR, semCandidatura, { versao: 99 }),
      ),
    ).toBe('conflito_de_versao');
    const erro = await rejeicao(
      casos.editarTrampo(EMPREGADOR, semCandidatura, {
        titulo: 'abc',
        versao: 1,
      }),
    );
    expect(erro).toBeInstanceOf(ErroDeValidacao);
    expect((erro as ErroDeValidacao).campos).toContainEqual({
      campo: 'titulo',
      motivo: 'tamanho',
    });
  });

  it('CA25 — Dado campos inválidos (CA5), quando o autor edita, então todos são apontados e nada muda', async () => {
    const id = await publicar();
    const antes = await casos.obterTrampo(id, EMPREGADOR);

    const erro = await rejeicao(
      casos.editarTrampo(EMPREGADOR, id, {
        titulo: 'abc',
        descricao: '',
        categoria: 'magia',
        cidade: null,
        valorCentavos: 0,
        prazo: '2026-02-30',
        versao: 1,
      }),
    );

    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'titulo', motivo: 'tamanho' },
      { campo: 'descricao', motivo: 'obrigatorio' },
      { campo: 'categoria', motivo: 'invalido' },
      { campo: 'cidade', motivo: 'obrigatorio' },
      { campo: 'valorCentavos', motivo: 'invalido' },
      { campo: 'prazo', motivo: 'invalido' },
    ]);
    expect(await casos.obterTrampo(id, EMPREGADOR)).toEqual(antes);
  });

  it('CA25 — Dado uma candidatura gravada entre a leitura e a gravação da edição, quando a edição perde a trava, então relê e recebe trampo_nao_editavel', async () => {
    const id = await publicar();
    let intrometeu = false;
    const casosComCorrida = criarCasosDeUsoDeTrampos({
      repositorio: {
        ...repositorioComoObjeto(),
        salvar: async (trampo) => {
          if (!intrometeu) {
            intrometeu = true;
            await casos.candidatar(ANA, id, proposta);
          }
          return repositorio.salvar(trampo);
        },
      },
      verificadorDePerfil: verificador,
      relogio,
    });

    expect(
      await codigo(
        casosComCorrida.editarTrampo(EMPREGADOR, id, { ...edicao, versao: 1 }),
      ),
    ).toBe('trampo_nao_editavel');
    expect((await casos.obterTrampo(id, EMPREGADOR)).titulo).toBe(
      trampoValido.titulo,
    );
  });

  it('CA25 — Dado duas edições com a mesma versão (dois aparelhos), quando gravam, então uma vence e a outra recebe conflito_de_versao', async () => {
    const id = await publicar();

    const resultados = await Promise.allSettled([
      casos.editarTrampo(EMPREGADOR, id, { ...edicao, versao: 1 }),
      casos.editarTrampo(EMPREGADOR, id, {
        ...edicao,
        titulo: 'Outro título',
        versao: 1,
      }),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const perdedor = resultados.find((r) => r.status === 'rejected');
    expect((perdedor as PromiseRejectedResult).reason).toEqual(
      new ErroDeRegra('conflito_de_versao'),
    );
    expect((await casos.obterTrampo(id, EMPREGADOR)).versao).toBe(2);
  });

  it('CA25 — Dado o trampo excluído entre a leitura e a gravação da edição, quando a edição perde a trava, então recebe não encontrado', async () => {
    const id = await publicar();
    const casosComCorrida = criarCasosDeUsoDeTrampos({
      repositorio: {
        ...repositorioComoObjeto(),
        salvar: async (trampo) => {
          await casos.excluirTrampo(EMPREGADOR, id);
          return repositorio.salvar(trampo);
        },
      },
      verificadorDePerfil: verificador,
      relogio,
    });

    expect(
      await rejeicao(
        casosComCorrida.editarTrampo(EMPREGADOR, id, { ...edicao, versao: 1 }),
      ),
    ).toBeInstanceOf(ErroNaoEncontrado);
  });
});

describe('CA27 — encerrar trampo', () => {
  it('CA27 — Dado um trampo aberto com pendentes, quando o autor encerra, então fica encerrado, as pendentes viram recusadas e ele sai da busca', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);

    await casos.encerrarTrampo(EMPREGADOR, id);

    expect((await casos.obterTrampo(id, CARLA)).status).toBe('encerrado');
    expect(
      (await casos.listarCandidaturas(EMPREGADOR, id)).map((c) => c.status),
    ).toEqual(['recusada', 'recusada']);
    expect(
      (await casos.listarMinhasCandidaturas(ANA)).map((c) => c.status),
    ).toEqual(['recusada']);
    expect(await casos.buscarTrampos({})).toEqual([]);
    // Continua em Meus anúncios (D34) e o vínculo das conversas fica.
    expect(
      (await casos.listarMeusTrampos(EMPREGADOR)).map((t) => t.status),
    ).toEqual(['encerrado']);
    expect(await casos.existeVinculoEntre(EMPREGADOR, ANA)).toBe(true);
  });

  it('CA27 — Dado um trampo encerrado, quando um freelancer se candidata ou o autor aceita, então recebe trampo_nao_aberto', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.encerrarTrampo(EMPREGADOR, id);

    expect(await codigo(casos.candidatar(CARLA, id, proposta))).toBe(
      'trampo_nao_aberto',
    );
    expect(await codigo(casos.aceitarCandidatura(EMPREGADOR, id, ana.id))).toBe(
      'trampo_nao_aberto',
    );
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toHaveLength(1);
  });

  it('CA27 e D25 — Dado um trampo em andamento, quando o autor encerra, então fica encerrado e a aceita continua aceita', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);

    await casos.encerrarTrampo(EMPREGADOR, id);

    expect((await casos.obterTrampo(id, EMPREGADOR)).status).toBe('encerrado');
    const lista = await casos.listarCandidaturas(EMPREGADOR, id);
    expect(
      Object.fromEntries(lista.map((c) => [c.freelancerId, c.status])),
    ).toEqual({ [ANA]: 'aceita', [BRUNO]: 'recusada' });
  });

  it('CA27 — Dado um trampo já encerrado, quando o autor encerra de novo, então resolve sem gravar nada', async () => {
    const id = await publicar();
    await casos.encerrarTrampo(EMPREGADOR, id);
    const antes = await casos.obterTrampo(id, EMPREGADOR);
    let gravacoes = 0;
    const decisoes: GravacaoSobTrava[] = [];
    const casosContando = criarCasosDeUsoDeTrampos({
      repositorio: {
        ...repositorioComoObjeto(),
        salvar: async (trampo) => {
          gravacoes += 1;
          return repositorio.salvar(trampo);
        },
        alterarSobTrava: (trampoId, decidir) =>
          repositorio.alterarSobTrava(trampoId, (trampo) => {
            const decisao = decidir(trampo);
            decisoes.push(decisao);
            return decisao;
          }),
      },
      verificadorDePerfil: verificador,
      relogio,
    });

    await casosContando.encerrarTrampo(EMPREGADOR, id);

    expect(gravacoes).toBe(0);
    expect(decisoes).toEqual(['nada']);
    expect(await casos.obterTrampo(id, EMPREGADOR)).toEqual(antes);
  });

  it('CA27 — Dado um terceiro ou o candidato, quando tenta encerrar, então recebe não encontrado e nada muda', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);

    for (const quem of [ANA, CARLA]) {
      expect(await rejeicao(casos.encerrarTrampo(quem, id))).toBeInstanceOf(
        ErroNaoEncontrado,
      );
    }
    expect(
      await rejeicao(casos.encerrarTrampo(EMPREGADOR, 'nao-existe')),
    ).toBeInstanceOf(ErroNaoEncontrado);
    expect((await casos.obterTrampo(id, EMPREGADOR)).status).toBe('aberto');
    expect((await casos.listarCandidaturas(EMPREGADOR, id))[0]?.status).toBe(
      'pendente',
    );
  });

  it('CA27 — Dado uma candidatura gravada logo antes da trava e outra que chega com a trava tomada, quando o autor encerra, então a primeira é recusada junto e a segunda recebe trampo_nao_aberto', async () => {
    const id = await publicar();
    const corrida = casosComConcorrencia(
      () => casos.candidatar(ANA, id, proposta),
      () => casos.candidatar(BRUNO, id, proposta),
    );

    await corrida.casos.encerrarTrampo(EMPREGADOR, id);

    const durante = await corrida.desfechoDeDurante();
    expect(durante.ok === false && durante.erro).toEqual(
      new ErroDeRegra('trampo_nao_aberto'),
    );
    expect(
      (await casos.listarCandidaturas(EMPREGADOR, id)).map((c) => [
        c.freelancerId,
        c.status,
      ]),
    ).toEqual([[ANA, 'recusada']]);
  });
});

describe('CA28 — excluir trampo', () => {
  it('CA28 — Dado um trampo aberto com candidaturas, quando o autor exclui, então o trampo e as candidaturas somem e o detalhe dá não encontrado', async () => {
    const id = await publicar();
    const outro = await publicar({ titulo: 'Outro trampo' });
    await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(ANA, outro, proposta);

    await casos.excluirTrampo(EMPREGADOR, id);

    for (const quem of [EMPREGADOR, ANA, CARLA]) {
      expect(await rejeicao(casos.obterTrampo(id, quem))).toBeInstanceOf(
        ErroNaoEncontrado,
      );
    }
    expect(
      (await casos.listarMinhasCandidaturas(ANA)).map((c) => c.trampoId),
    ).toEqual([outro]);
    expect(
      (await casos.listarMeusTrampos(EMPREGADOR)).map((t) => t.id),
    ).toEqual([outro]);
    expect((await casos.buscarTrampos({})).map((t) => t.id)).toEqual([outro]);
    expect(
      await rejeicao(casos.candidatar(BRUNO, id, proposta)),
    ).toBeInstanceOf(ErroNaoEncontrado);
  });

  it('CA28 — Dado um trampo em andamento ou encerrado, quando o autor exclui, então recebe trampo_nao_aberto e nada muda', async () => {
    const emAndamento = await publicar();
    const ana = await casos.candidatar(ANA, emAndamento, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, emAndamento, ana.id);
    const encerrado = await publicar();
    await casos.encerrarTrampo(EMPREGADOR, encerrado);

    for (const id of [emAndamento, encerrado]) {
      const antes = await casos.obterTrampo(id, EMPREGADOR);
      expect(await codigo(casos.excluirTrampo(EMPREGADOR, id))).toBe(
        'trampo_nao_aberto',
      );
      expect(await casos.obterTrampo(id, EMPREGADOR)).toEqual(antes);
    }
  });

  it('CA28 — Dado um terceiro ou o candidato, quando tenta excluir, então recebe não encontrado e nada muda', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);

    for (const quem of [ANA, CARLA]) {
      expect(await rejeicao(casos.excluirTrampo(quem, id))).toBeInstanceOf(
        ErroNaoEncontrado,
      );
    }
    expect(
      await rejeicao(casos.excluirTrampo(EMPREGADOR, 'nao-existe')),
    ).toBeInstanceOf(ErroNaoEncontrado);
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toHaveLength(1);
  });

  it('CA28 — Dado uma candidatura gravada logo antes da trava e outra que chega com a trava tomada, quando o autor exclui, então a primeira é apagada junto e a segunda recebe não encontrado', async () => {
    const id = await publicar();
    let candidaturaId = '';
    const corrida = casosComConcorrencia(
      async () => {
        candidaturaId = (await casos.candidatar(ANA, id, proposta)).id;
      },
      () => casos.candidatar(BRUNO, id, proposta),
    );

    await corrida.casos.excluirTrampo(EMPREGADOR, id);

    expect(candidaturaId).not.toBe('');
    const durante = await corrida.desfechoDeDurante();
    expect(durante.ok === false && durante.erro).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect(await repositorio.buscarPorId(id)).toBeNull();
    expect(await casos.listarMinhasCandidaturas(ANA)).toEqual([]);
    expect(await casos.listarMinhasCandidaturas(BRUNO)).toEqual([]);
  });

  it('CA28 — Dado um aceite gravado logo antes da trava, quando o autor exclui, então recebe trampo_nao_aberto e o trampo fica', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const corrida = casosComConcorrencia(
      () => casos.aceitarCandidatura(EMPREGADOR, id, ana.id),
      async () => undefined,
    );

    expect(await codigo(corrida.casos.excluirTrampo(EMPREGADOR, id))).toBe(
      'trampo_nao_aberto',
    );
    expect((await casos.obterTrampo(id, EMPREGADOR)).status).toBe(
      'em_andamento',
    );
  });

  it('CA28 — Dado um aceite que chega com a trava da exclusão tomada, então o aceite recebe não encontrado e o trampo some', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const corrida = casosComConcorrencia(
      async () => undefined,
      () => casos.aceitarCandidatura(EMPREGADOR, id, ana.id),
    );

    await corrida.casos.excluirTrampo(EMPREGADOR, id);

    const durante = await corrida.desfechoDeDurante();
    expect(durante.ok === false && durante.erro).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect(await repositorio.buscarPorId(id)).toBeNull();
  });

  it('CA28 — Dado duas exclusões ao mesmo tempo (toque duplo), quando gravam, então uma apaga e a outra, ao reler, recebe não encontrado', async () => {
    const id = await publicar();

    const resultados = await Promise.allSettled([
      casos.excluirTrampo(EMPREGADOR, id),
      casos.excluirTrampo(EMPREGADOR, id),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const perdedor = resultados.find((r) => r.status === 'rejected');
    expect((perdedor as PromiseRejectedResult).reason).toBeInstanceOf(
      ErroNaoEncontrado,
    );
  });
});

describe('S1 (D33) e CA65 (D49) — ações sob a trava do trampo durante uma rajada de candidaturas', () => {
  /**
   * Casos de uso em que cada leitura do trampo, e também a entrada na trava,
   * é seguida de uma candidatura nova gravada por inteiro: quem relê e grava
   * com trava otimista perderia todas as rodadas. `leituras` conta as
   * leituras fora da trava (`buscarPorId`).
   */
  function casosSobRajada() {
    const freelancers = Array.from(
      { length: TENTATIVAS_DE_GRAVACAO * 3 },
      (_, i) => `conta-rajada-${i}`,
    );
    const casosDaRajada = criarCasosDeUsoDeTrampos({
      repositorio,
      verificadorDePerfil: new VerificadorDePerfilEmMemoria(freelancers),
      relogio,
    });
    let gravadas = 0;
    let leituras = 0;
    async function proximaCandidatura(trampoId: string): Promise<void> {
      const freelancer = freelancers[gravadas];
      if (freelancer !== undefined) {
        gravadas += 1;
        await casosDaRajada.candidatar(freelancer, trampoId, proposta);
      }
    }
    const casosDoAutor = criarCasosDeUsoDeTrampos({
      repositorio: {
        ...repositorioComoObjeto(),
        buscarPorId: async (trampoId) => {
          leituras += 1;
          const lido = await repositorio.buscarPorId(trampoId);
          if (lido) {
            await proximaCandidatura(trampoId);
          }
          return lido;
        },
        alterarSobTrava: async (trampoId, decidir) => {
          await proximaCandidatura(trampoId);
          return repositorio.alterarSobTrava(trampoId, decidir);
        },
      },
      verificadorDePerfil: verificador,
      relogio,
    });
    return {
      casos: casosDoAutor,
      gravadas: () => gravadas,
      leituras: () => leituras,
    };
  }

  it('S1 — Dado candidaturas chegando sem parar, quando o autor encerra, então termina sem conflito_de_versao e nenhuma fica pendente', async () => {
    const id = await publicar();
    const rajada = casosSobRajada();

    await rajada.casos.encerrarTrampo(EMPREGADOR, id);

    expect(rajada.gravadas()).toBeGreaterThan(0);
    expect((await casos.obterTrampo(id, EMPREGADOR)).status).toBe('encerrado');
    const lista = await casos.listarCandidaturas(EMPREGADOR, id);
    expect(lista).toHaveLength(rajada.gravadas());
    expect(lista.every((c) => c.status === 'recusada')).toBe(true);
  });

  it('S1 — Dado candidaturas chegando sem parar, quando o autor exclui, então termina sem conflito_de_versao e nenhuma sobra', async () => {
    const id = await publicar();
    const rajada = casosSobRajada();

    await rajada.casos.excluirTrampo(EMPREGADOR, id);

    expect(rajada.gravadas()).toBeGreaterThan(0);
    expect(await repositorio.buscarPorId(id)).toBeNull();
    expect(await casos.listarMinhasCandidaturas('conta-rajada-0')).toEqual([]);
  });

  it('CA65 — Dado candidaturas chegando sem parar, quando o freelancer retira a sua, então termina sem conflito_de_versao, sem reler o trampo, e a retirada não volta', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const rajada = casosSobRajada();

    await rajada.casos.retirarCandidatura(ANA, ana.id);

    expect(rajada.leituras()).toBe(0);
    expect(rajada.gravadas()).toBeGreaterThan(0);
    expect(await casos.listarMinhasCandidaturas(ANA)).toEqual([]);
    const lista = await casos.listarCandidaturas(EMPREGADOR, id);
    expect(lista).toHaveLength(rajada.gravadas());
    expect(lista.every((c) => c.status === 'pendente')).toBe(true);
    expect(lista.map((c) => c.freelancerId)).not.toContain(ANA);
  });
});

describe('CA29 — retirar candidatura', () => {
  it('CA29 — Dado uma candidatura pendente, quando o freelancer retira, então ela some e ele pode se candidatar de novo', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);

    await casos.retirarCandidatura(ANA, ana.id);

    expect(await casos.listarMinhasCandidaturas(ANA)).toEqual([]);
    expect(
      (await casos.listarCandidaturas(EMPREGADOR, id)).map(
        (c) => c.freelancerId,
      ),
    ).toEqual([BRUNO]);
    const deNovo = await casos.candidatar(ANA, id, proposta);
    expect(deNovo.id).not.toBe(ana.id);
    expect(
      (await casos.listarMinhasCandidaturas(ANA)).map((c) => c.id),
    ).toEqual([deNovo.id]);
  });

  it('CA29 — Dado uma candidatura aceita ou recusada, quando o freelancer retira, então recebe candidatura_nao_pendente e nada muda', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const bruno = await casos.candidatar(BRUNO, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);
    const antes = await casos.listarCandidaturas(EMPREGADOR, id);

    expect(await codigo(casos.retirarCandidatura(ANA, ana.id))).toBe(
      'candidatura_nao_pendente',
    );
    expect(await codigo(casos.retirarCandidatura(BRUNO, bruno.id))).toBe(
      'candidatura_nao_pendente',
    );
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toEqual(antes);
  });

  it('CA29 — Dado a candidatura de outra conta, quando o autor do trampo ou um terceiro tenta retirar, então recebe não encontrado (mesmo se ela não estiver pendente)', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const outro = await publicar();
    const anaNoOutro = await casos.candidatar(ANA, outro, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, outro, anaNoOutro.id);

    for (const quem of [EMPREGADOR, CARLA]) {
      expect(
        await rejeicao(casos.retirarCandidatura(quem, ana.id)),
      ).toBeInstanceOf(ErroNaoEncontrado);
      expect(
        await rejeicao(casos.retirarCandidatura(quem, anaNoOutro.id)),
      ).toBeInstanceOf(ErroNaoEncontrado);
    }
    expect(
      await rejeicao(casos.retirarCandidatura(ANA, 'nao-existe')),
    ).toBeInstanceOf(ErroNaoEncontrado);
    expect(await casos.listarMinhasCandidaturas(ANA)).toHaveLength(2);
  });

  it('CA29 — Dado o id em maiúsculas, quando o freelancer retira, então acha a candidatura', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);

    await casos.retirarCandidatura(ANA, ana.id.toUpperCase());

    expect(await casos.listarMinhasCandidaturas(ANA)).toEqual([]);
  });

  it('CA29 e CA65 — Dado um aceite gravado logo antes da trava da retirada, quando o freelancer retira, então recebe candidatura_nao_pendente e a aceita fica', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const corrida = casosComConcorrencia(
      () => casos.aceitarCandidatura(EMPREGADOR, id, ana.id),
      async () => undefined,
    );

    expect(await codigo(corrida.casos.retirarCandidatura(ANA, ana.id))).toBe(
      'candidatura_nao_pendente',
    );
    expect((await casos.listarCandidaturas(EMPREGADOR, id))[0]?.status).toBe(
      'aceita',
    );
    expect((await casos.obterTrampo(id, EMPREGADOR)).status).toBe(
      'em_andamento',
    );
  });

  it('CA29 e CA65 — Dado um aceite que chega com a trava da retirada tomada, quando a retirada grava, então o aceite recebe não encontrado e a candidatura não volta', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const corrida = casosComConcorrencia(
      async () => undefined,
      () => casos.aceitarCandidatura(EMPREGADOR, id, ana.id),
    );

    await corrida.casos.retirarCandidatura(ANA, ana.id);

    const durante = await corrida.desfechoDeDurante();
    expect(durante.ok === false && durante.erro).toBeInstanceOf(
      ErroNaoEncontrado,
    );
    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toEqual([]);
    expect((await casos.obterTrampo(id, EMPREGADOR)).status).toBe('aberto');
  });

  it('CA29 e CA65 — Dado o trampo excluído depois de achar a candidatura e antes da trava, quando o freelancer retira, então recebe não encontrado', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const corrida = casosComConcorrencia(
      () => casos.excluirTrampo(EMPREGADOR, id),
      async () => undefined,
    );

    expect(
      await rejeicao(corrida.casos.retirarCandidatura(ANA, ana.id)),
    ).toBeInstanceOf(ErroNaoEncontrado);
    expect(await repositorio.buscarPorId(id)).toBeNull();
    expect(await casos.listarMinhasCandidaturas(ANA)).toEqual([]);
  });

  it('CA29 — Dado uma retirada gravada entre a leitura e o aceite de outra candidatura, quando o aceite perde a trava, então relê e a retirada não volta', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    const bruno = await casos.candidatar(BRUNO, id, proposta);
    let intrometeu = false;
    const casosComCorrida = criarCasosDeUsoDeTrampos({
      repositorio: {
        ...repositorioComoObjeto(),
        salvar: async (trampo) => {
          if (!intrometeu) {
            intrometeu = true;
            await casos.retirarCandidatura(BRUNO, bruno.id);
          }
          return repositorio.salvar(trampo);
        },
      },
      verificadorDePerfil: verificador,
      relogio,
    });

    await casosComCorrida.aceitarCandidatura(EMPREGADOR, id, ana.id);

    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toEqual([
      expect.objectContaining({ freelancerId: ANA, status: 'aceita' }),
    ]);
    expect(await casos.listarMinhasCandidaturas(BRUNO)).toEqual([]);
  });
});

describe('CA31 — visão do autor', () => {
  it('CA31 — Dado o autor, quando lê o detalhe ou Meus anúncios, então vê versao e candidaturasRecebidas; terceiro e candidato veem o corpo de antes', async () => {
    const id = await publicar();
    await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);

    const doAutor = await casos.obterTrampo(id, EMPREGADOR);
    expect(doAutor).toMatchObject({ versao: 3, candidaturasRecebidas: 2 });
    expect((await casos.listarMeusTrampos(EMPREGADOR))[0]).toEqual(doAutor);

    for (const quem of [ANA, CARLA]) {
      const visao = await casos.obterTrampo(id, quem);
      expect(visao).not.toHaveProperty('versao');
      expect(visao).not.toHaveProperty('candidaturasRecebidas');
      const { versao: _v, candidaturasRecebidas: _c, ...resumo } = doAutor;
      expect(visao).toEqual(resumo);
    }
  });

  it('CA31 — Dado candidaturas em vários estados, quando o autor lista os seus, então a contagem soma todas', async () => {
    const id = await publicar();
    const ana = await casos.candidatar(ANA, id, proposta);
    await casos.candidatar(BRUNO, id, proposta);
    await casos.aceitarCandidatura(EMPREGADOR, id, ana.id);
    relogio.avancar(1000);
    const vazio = await publicar();

    expect(
      (await casos.listarMeusTrampos(EMPREGADOR)).map((t) => [
        t.id,
        t.candidaturasRecebidas,
        t.versao,
      ]),
    ).toEqual([
      [vazio, 0, 1],
      [id, 2, 4],
    ]);
  });
});

describe('CA66 — Meus trampos paginados (D47)', () => {
  type EntradaDaPagina = Parameters<
    CasosDeUsoDeTrampos['listarMeusTrampos']
  >[1];

  /** Segue o cursor do último item até a página que vem com menos de 20. */
  async function todasAsPaginas(autor: string): Promise<string[][]> {
    const paginas: string[][] = [];
    let entrada: EntradaDaPagina = {};
    for (let volta = 0; volta < 10; volta += 1) {
      const pagina = await casos.listarMeusTrampos(autor, entrada);
      paginas.push(pagina.map((t) => t.id));
      const ultimo = pagina.at(-1);
      if (pagina.length < 20 || ultimo === undefined) {
        return paginas;
      }
      entrada = {
        antesDeCriadoEm: ultimo.criadoEm.toISOString(),
        antesDeId: ultimo.id,
      };
    }
    throw new Error('paginação sem fim');
  }

  /** Um por milissegundo: o primeiro publicado é o mais antigo. */
  async function publicarVarios(quantos: number, autor = EMPREGADOR) {
    const ids: string[] = [];
    for (let i = 0; i < quantos; i += 1) {
      relogio.avancar(1);
      ids.push(await publicar({}, autor));
    }
    return ids;
  }

  it('CA66 — Dado 45 trampos, parte no mesmo milissegundo, quando o autor pagina sem limite, então vê 20, 20 e 5, mais recentes primeiro, sem repetir nem pular', async () => {
    for (let i = 0; i < 45; i += 1) {
      if (i < 10) {
        relogio.avancar(1);
      }
      await publicar();
      await publicar({}, ANA);
    }
    const todos = (
      await repositorio.listarDoAutor(EMPREGADOR, { limite: 100 })
    ).map((t) => t.id);

    const paginas = await todasAsPaginas(EMPREGADOR);

    expect(paginas.map((p) => p.length)).toEqual([20, 20, 5]);
    expect(paginas.flat()).toEqual(todos);
    expect(new Set(paginas.flat()).size).toBe(45);
  });

  it('CA66 — Dado o cursor de um trampo da página anterior, quando pede a próxima, então vêm só os estritamente mais antigos, na visão do autor', async () => {
    const antigo = await publicar();
    relogio.avancar(1000);
    const recente = await publicar();
    await casos.candidatar(ANA, antigo, proposta);
    const doCursor = await casos.obterTrampo(recente, EMPREGADOR);

    const pagina = await casos.listarMeusTrampos(EMPREGADOR, {
      antesDeCriadoEm: doCursor.criadoEm.toISOString(),
      antesDeId: recente,
    });

    expect(pagina).toEqual([await casos.obterTrampo(antigo, EMPREGADOR)]);
    expect(pagina[0]).toMatchObject({ versao: 2, candidaturasRecebidas: 1 });
  });

  it('CA66 — Dado limite 1 ou 50, quando lista, então traz no máximo esse número', async () => {
    await publicarVarios(55);

    expect(
      await casos.listarMeusTrampos(EMPREGADOR, { limite: 1 }),
    ).toHaveLength(1);
    expect(
      await casos.listarMeusTrampos(EMPREGADOR, { limite: 50 }),
    ).toHaveLength(50);
    expect(await casos.listarMeusTrampos(EMPREGADOR)).toHaveLength(20);
    expect(
      await casos.listarMeusTrampos(EMPREGADOR, { limite: null }),
    ).toHaveLength(20);
  });

  it('CA66 — Dado um limite fora de 1 a 50 ou não inteiro, quando lista, então recebe dados_invalidos no limite, sem ler', async () => {
    let leituras = 0;
    const casosContados = criarCasosDeUsoDeTrampos({
      repositorio: {
        ...repositorioComoObjeto(),
        listarDoAutor: async (autor, pagina) => {
          leituras += 1;
          return repositorio.listarDoAutor(autor, pagina);
        },
      },
      verificadorDePerfil: verificador,
      relogio,
    });

    for (const limite of [0, 51, -1, 1.5, Number.NaN, '20', true]) {
      expect(
        await rejeicao(casosContados.listarMeusTrampos(EMPREGADOR, { limite })),
        String(limite),
      ).toEqual(ErroDeValidacao.doCampo('limite', 'invalido'));
    }
    expect(leituras).toBe(0);
  });

  it('CA66 — Dado o cursor pela metade, quando lista, então o campo que falta é obrigatório', async () => {
    const id = await publicar();

    expect(
      await rejeicao(
        casos.listarMeusTrampos(EMPREGADOR, {
          antesDeCriadoEm: '2026-10-20T12:00:00.000Z',
        }),
      ),
    ).toEqual(ErroDeValidacao.doCampo('antesDeId', 'obrigatorio'));
    expect(
      await rejeicao(casos.listarMeusTrampos(EMPREGADOR, { antesDeId: id })),
    ).toEqual(ErroDeValidacao.doCampo('antesDeCriadoEm', 'obrigatorio'));
  });

  it('CA66 — Dado um antesDeCriadoEm fora do ISO em UTC da API ou da faixa, quando lista, então é inválido e o erro não traz o valor', async () => {
    const id = await publicar();

    for (const antesDeCriadoEm of [
      '',
      'ontem',
      '2026-10-20',
      '2026-10-20T12:00:00Z',
      '2026-10-20T09:00:00.000-03:00',
      '2026-13-01T00:00:00.000Z',
      '1969-12-31T23:59:59.999Z',
      '+010000-01-01T00:00:00.000Z',
      1_760_000_000_000,
    ]) {
      const erro = await rejeicao(
        casos.listarMeusTrampos(EMPREGADOR, { antesDeCriadoEm, antesDeId: id }),
      );
      expect(erro, String(antesDeCriadoEm)).toEqual(
        ErroDeValidacao.doCampo('antesDeCriadoEm', 'invalido'),
      );
      if (antesDeCriadoEm !== '') {
        expect((erro as Error).message).not.toContain(String(antesDeCriadoEm));
      }
    }
  });

  it('CA66 — Dado um antesDeId fora do formato uuid, quando lista, então é inválido e o erro não traz o valor', async () => {
    for (const antesDeId of [
      '',
      'abc',
      'meus',
      `${randomUUID()}0`,
      ` ${randomUUID()}`,
      42,
    ]) {
      const erro = await rejeicao(
        casos.listarMeusTrampos(EMPREGADOR, {
          antesDeCriadoEm: '2026-10-20T12:00:00.000Z',
          antesDeId,
        }),
      );
      expect(erro, String(antesDeId)).toEqual(
        ErroDeValidacao.doCampo('antesDeId', 'invalido'),
      );
      if (antesDeId !== '') {
        expect((erro as Error).message).not.toContain(String(antesDeId));
      }
    }
  });

  it('CA66 — Dado o limite e os dois campos do cursor inválidos, quando lista, então os três vêm no erro', async () => {
    expect(
      await rejeicao(
        casos.listarMeusTrampos(EMPREGADOR, {
          limite: 0,
          antesDeCriadoEm: 'x',
          antesDeId: 'y',
        }),
      ),
    ).toEqual(
      new ErroDeValidacao([
        { campo: 'limite', motivo: 'invalido' },
        { campo: 'antesDeCriadoEm', motivo: 'invalido' },
        { campo: 'antesDeId', motivo: 'invalido' },
      ]),
    );
  });

  it('CA66 — Dado o id do cursor em maiúsculas, quando lista, então compara como o id em minúsculas', async () => {
    // Todos no mesmo milissegundo: só o id decide. Com o cursor "FFFF…"
    // tratado como "ffff…", todos vêm antes dele; sem normalizar, os que
    // começam com letra (minúscula > maiúscula) sumiriam.
    const ids = await Promise.all(Array.from({ length: 20 }, () => publicar()));

    const pagina = await casos.listarMeusTrampos(EMPREGADOR, {
      limite: 50,
      antesDeCriadoEm: '2026-10-20T12:00:00.000Z',
      antesDeId: 'FFFFFFFF-FFFF-4FFF-BFFF-FFFFFFFFFFFF',
    });

    expect(pagina.map((t) => t.id).sort()).toEqual([...ids].sort());
  });

  it('CA66 — Dado o cursor tirado de um trampo de outra conta, quando lista, então só vêm os do autor da sessão', async () => {
    const antigo = await publicar();
    relogio.avancar(1000);
    const doOutro = await publicar({}, ANA);
    relogio.avancar(1000);
    await publicar();
    const cursor = await casos.obterTrampo(doOutro, EMPREGADOR);

    const pagina = await casos.listarMeusTrampos(EMPREGADOR, {
      antesDeCriadoEm: cursor.criadoEm.toISOString(),
      antesDeId: doOutro,
    });

    expect(pagina.map((t) => [t.id, t.autorId])).toEqual([
      [antigo, EMPREGADOR],
    ]);
    expect(await casos.listarMeusTrampos(ANA)).toEqual([
      expect.objectContaining({ id: doOutro, autorId: ANA }),
    ]);
  });

  it('CA66 e D46 — Dado um trampo fora da primeira página, quando o autor abre o detalhe, então recebe a visão do autor; o terceiro, não', async () => {
    const [maisAntigo] = await publicarVarios(21);
    if (maisAntigo === undefined) {
      throw new Error('esperava 21 trampos');
    }
    expect(
      (await casos.listarMeusTrampos(EMPREGADOR)).map((t) => t.id),
    ).not.toContain(maisAntigo);

    expect(await casos.obterTrampo(maisAntigo, EMPREGADOR)).toMatchObject({
      id: maisAntigo,
      versao: 1,
      candidaturasRecebidas: 0,
    });
    expect(await casos.obterTrampo(maisAntigo, ANA)).not.toHaveProperty(
      'versao',
    );
  });
});

describe('repositório em memória', () => {
  it('guarda cópias: mudar o agregado lido não altera o guardado sem salvar', async () => {
    const id = await publicar();
    const lido = await repositorio.buscarPorId(id);
    lido?.candidatar(ANA, proposta, relogio);

    expect(await casos.listarCandidaturas(EMPREGADOR, id)).toEqual([]);
  });

  it('recusa gravar trampo novo com versão diferente de 1', async () => {
    const id = await publicar();
    const lido = await repositorio.buscarPorId(id);
    lido?.candidatar(ANA, proposta, relogio);
    const outroRepositorio = new RepositorioDeTramposEmMemoria();

    expect(
      await rejeicao(outroRepositorio.salvar(lido as NonNullable<typeof lido>)),
    ).toEqual(new ErroDeRegra('conflito_de_versao'));
  });
});
