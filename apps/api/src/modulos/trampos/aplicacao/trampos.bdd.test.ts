import { beforeEach, describe, expect, it } from 'vitest';
import {
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import { RepositorioDeTramposEmMemoria } from '../adaptadores/memoria/repositorio-memoria.js';
import { VerificadorDePerfilEmMemoria } from '../adaptadores/memoria/verificador-perfil-memoria.js';
import type { RepositorioDeTrampos } from '../dominio/portas.js';
import type { EntradaDeTrampo } from '../dominio/trampo.js';
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
    buscarPorId: (id) => repositorio.buscarPorId(id),
    listarDoAutor: (a) => repositorio.listarDoAutor(a),
    buscar: (f) => repositorio.buscar(f),
    existeCandidaturaEntre: (a, b) => repositorio.existeCandidaturaEntre(a, b),
    listarCandidaturasDoFreelancer: (f) =>
      repositorio.listarCandidaturasDoFreelancer(f),
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
    const detalhe = await casos.obterTrampo(resultado.id);
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
    expect((await casos.obterTrampo(id)).titulo).toBe('Pinta');
  });

  it('CA4 — Dado um autor, quando lista os seus trampos, então vê o publicado', async () => {
    const id = await publicar();
    await publicar({}, ANA);
    expect(
      (await casos.listarMeusTrampos(EMPREGADOR)).map((t) => t.id),
    ).toEqual([id]);
  });

  it('CA4 — Dado um id inexistente, quando busca o detalhe, então recebe não encontrado', async () => {
    expect(await rejeicao(casos.obterTrampo('nao-existe'))).toBeInstanceOf(
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

    expect((await casos.obterTrampo(id)).status).toBe('em_andamento');
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
    expect((await casos.obterTrampo(id)).status).toBe('aberto');
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

    expect((await casos.obterTrampo(id)).status).toBe('em_andamento');
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
