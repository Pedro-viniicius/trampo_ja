import { describe, expect, it } from 'vitest';
import {
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import { type EntradaDeTrampo, lerCamposDoTrampo, Trampo } from './trampo.js';

const relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
const AUTOR = 'autor-1';

const entradaValida: EntradaDeTrampo = {
  titulo: 'Pintar a sala',
  descricao: 'Pintura de uma sala de 20 m².',
  categoria: 'reformas',
  cidade: 'São Paulo',
  valorCentavos: 50000,
};

function candidatura(mensagem = 'Posso fazer', valorPropostoCentavos = 40000) {
  return { mensagem, valorPropostoCentavos };
}

function erroDeValidacao(entrada: EntradaDeTrampo): ErroDeValidacao {
  try {
    Trampo.criar(AUTOR, entrada, relogio);
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      return erro;
    }
    throw erro;
  }
  throw new Error('não lançou');
}

describe('Trampo.criar', () => {
  it('cria aberto, versão 1, com campos normalizados', () => {
    const trampo = Trampo.criar(
      AUTOR,
      { ...entradaValida, titulo: '  Pintar a sala  ', prazo: '2026-12-31' },
      relogio,
    );
    expect(trampo.dados()).toMatchObject({
      autorId: AUTOR,
      titulo: 'Pintar a sala',
      categoria: 'reformas',
      cidade: 'São Paulo',
      cidadeNormalizada: 'sao paulo',
      textoBusca: 'pintar a sala pintura de uma sala de 20 m².',
      valorCentavos: 50000,
      prazo: '2026-12-31',
      status: 'aberto',
      versao: 1,
      candidaturas: [],
    });
    expect(trampo.dados().criadoEm.toISOString()).toBe(
      '2026-10-20T12:00:00.000Z',
    );
  });

  it('o prazo é opcional', () => {
    expect(
      Trampo.criar(AUTOR, entradaValida, relogio).dados().prazo,
    ).toBeNull();
  });

  it('aceita o limite de 5 e de 80 caracteres no título', () => {
    expect(() =>
      Trampo.criar(AUTOR, { ...entradaValida, titulo: 'abcde' }, relogio),
    ).not.toThrow();
    expect(() =>
      Trampo.criar(
        AUTOR,
        { ...entradaValida, titulo: 'a'.repeat(80) },
        relogio,
      ),
    ).not.toThrow();
  });

  it('aponta cada campo inválido com o motivo certo, num único erro', () => {
    const erro = erroDeValidacao({
      titulo: 'abcd',
      descricao: undefined,
      categoria: 'inexistente',
      cidade: 'A',
      valorCentavos: 0,
      prazo: '2026-02-30',
    });
    expect(erro.campos).toEqual([
      { campo: 'titulo', motivo: 'tamanho' },
      { campo: 'descricao', motivo: 'obrigatorio' },
      { campo: 'categoria', motivo: 'invalido' },
      { campo: 'cidade', motivo: 'tamanho' },
      { campo: 'valorCentavos', motivo: 'invalido' },
      { campo: 'prazo', motivo: 'invalido' },
    ]);
  });

  it('título acima de 80 e descrição acima de 2000 são tamanho', () => {
    expect(
      erroDeValidacao({
        ...entradaValida,
        titulo: 'a'.repeat(81),
        descricao: 'a'.repeat(2001),
      }).campos,
    ).toEqual([
      { campo: 'titulo', motivo: 'tamanho' },
      { campo: 'descricao', motivo: 'tamanho' },
    ]);
  });

  it('entrada vazia aponta todos os obrigatórios', () => {
    expect(erroDeValidacao({}).campos.map((c) => c.campo)).toEqual([
      'titulo',
      'descricao',
      'categoria',
      'cidade',
      'valorCentavos',
    ]);
  });

  it('recusa valor negativo, decimal e texto', () => {
    for (const valorCentavos of [-1, 10.5, '500']) {
      expect(
        erroDeValidacao({ ...entradaValida, valorCentavos }).campos,
      ).toEqual([{ campo: 'valorCentavos', motivo: 'invalido' }]);
    }
  });

  it('recusa caractere nulo em título, descrição e cidade com invalido', () => {
    expect(
      erroDeValidacao({
        ...entradaValida,
        titulo: 'Pintar\u0000a sala',
        descricao: 'texto\u0000',
        cidade: 'São\u0000Paulo',
      }).campos,
    ).toEqual([
      { campo: 'titulo', motivo: 'invalido' },
      { campo: 'descricao', motivo: 'invalido' },
      { campo: 'cidade', motivo: 'invalido' },
    ]);
  });

  it('aceita prazo entre os anos 1900 e 9999 e recusa fora disso (o Postgres não guarda o ano 0000)', () => {
    for (const prazo of ['1900-01-01', '9999-12-31', '2026-02-28']) {
      expect(
        Trampo.criar(AUTOR, { ...entradaValida, prazo }, relogio).dados().prazo,
      ).toBe(prazo);
    }
    for (const prazo of ['0000-01-01', '0001-01-01', '1899-12-31']) {
      expect(erroDeValidacao({ ...entradaValida, prazo }).campos).toEqual([
        { campo: 'prazo', motivo: 'invalido' },
      ]);
    }
  });

  it('o erro não carrega o valor informado', () => {
    const erro = erroDeValidacao({
      ...entradaValida,
      titulo: 'x',
      cidade: 'segredo-da-cidade',
      valorCentavos: -987654,
    });
    const texto = JSON.stringify(erro.campos) + erro.message;
    expect(texto).not.toContain('987654');
    expect(texto).not.toContain('segredo');
  });
});

describe('Trampo.candidatar', () => {
  it('adiciona candidatura pendente e sobe a versão', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const c = trampo.candidatar('f1', candidatura(), relogio);
    expect(c.status).toBe('pendente');
    expect(trampo.candidaturas).toHaveLength(1);
    expect(trampo.versao).toBe(2);
    expect(trampo.status).toBe('aberto');
  });

  it('valida os campos antes das regras', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    expect(() =>
      trampo.candidatar(
        AUTOR,
        { mensagem: '', valorPropostoCentavos: 1 },
        relogio,
      ),
    ).toThrow(ErroDeValidacao);
    expect(trampo.versao).toBe(1);
  });

  it('recusa o próprio autor', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    expect(() => trampo.candidatar(AUTOR, candidatura(), relogio)).toThrow(
      expect.objectContaining({ codigo: 'autor_nao_pode_candidatar' }),
    );
    expect(trampo.versao).toBe(1);
  });

  it('recusa o mesmo freelancer duas vezes, em qualquer estado', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    trampo.candidatar('f1', candidatura(), relogio);
    expect(() => trampo.candidatar('f1', candidatura(), relogio)).toThrow(
      expect.objectContaining({ codigo: 'candidatura_duplicada' }),
    );
    expect(trampo.candidaturas).toHaveLength(1);
  });

  it('recusa quando o trampo não está aberto', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const c = trampo.candidatar('f1', candidatura(), relogio);
    trampo.aceitar(c.id, AUTOR);
    expect(() => trampo.candidatar('f2', candidatura(), relogio)).toThrow(
      expect.objectContaining({ codigo: 'trampo_nao_aberto' }),
    );
  });

  it('quem foi recusado depois do aceite recebe candidatura_duplicada', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const c1 = trampo.candidatar('f1', candidatura(), relogio);
    trampo.candidatar('f2', candidatura(), relogio);
    trampo.aceitar(c1.id, AUTOR);
    expect(() => trampo.candidatar('f2', candidatura(), relogio)).toThrow(
      expect.objectContaining({ codigo: 'candidatura_duplicada' }),
    );
  });
});

describe('Trampo.aceitar', () => {
  function trampoComTresCandidaturas() {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const ids = ['f1', 'f2', 'f3'].map(
      (f) => trampo.candidatar(f, candidatura(), relogio).id,
    );
    return { trampo, ids };
  }

  it('aceita a escolhida, recusa as demais e passa a em andamento', () => {
    const { trampo, ids } = trampoComTresCandidaturas();
    trampo.aceitar(ids[1] as string, AUTOR);
    expect(trampo.status).toBe('em_andamento');
    expect(trampo.candidaturas.map((c) => c.status)).toEqual([
      'recusada',
      'aceita',
      'recusada',
    ]);
    expect(trampo.versao).toBe(5);
  });

  it('quem não é o autor recebe ErroNaoEncontrado e nada muda', () => {
    const { trampo, ids } = trampoComTresCandidaturas();
    expect(() => trampo.aceitar(ids[0] as string, 'f1')).toThrow(
      ErroNaoEncontrado,
    );
    expect(trampo.status).toBe('aberto');
    expect(trampo.versao).toBe(4);
  });

  it('candidatura inexistente é ErroNaoEncontrado', () => {
    const { trampo } = trampoComTresCandidaturas();
    expect(() => trampo.aceitar('nao-existe', AUTOR)).toThrow(
      ErroNaoEncontrado,
    );
  });

  it('recusa aceitar de novo, com trampo_nao_aberto', () => {
    const { trampo, ids } = trampoComTresCandidaturas();
    trampo.aceitar(ids[0] as string, AUTOR);
    expect(() => trampo.aceitar(ids[1] as string, AUTOR)).toThrow(
      expect.objectContaining({ codigo: 'trampo_nao_aberto' }),
    );
  });

  it('recusa candidatura que não está pendente', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const c = trampo.candidatar('f1', candidatura(), relogio);
    // Reconstitui um agregado aberto com a candidatura já recusada.
    const dados = trampo.dados();
    const reaberto = Trampo.reconstituir({
      ...dados,
      candidaturas: dados.candidaturas.map((x) => ({
        ...x,
        status: 'recusada' as const,
      })),
    });
    expect(() => reaberto.aceitar(c.id, AUTOR)).toThrow(
      expect.objectContaining({ codigo: 'candidatura_nao_pendente' }),
    );
    expect(() => reaberto.aceitar(c.id, AUTOR)).toThrow(ErroDeRegra);
  });
});

describe('isolamento do agregado', () => {
  it('dados() e candidaturas devolvem cópias', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    trampo.candidatar('f1', candidatura(), relogio);
    trampo.dados().criadoEm.setUTCFullYear(2000);
    trampo.candidaturas[0]?.criadaEm.setUTCFullYear(2000);
    expect(trampo.dados().criadoEm.getUTCFullYear()).toBe(2026);
    expect(trampo.candidaturas[0]?.criadaEm.getUTCFullYear()).toBe(2026);
  });

  it('resumo não expõe candidaturas nem versão', () => {
    const resumo = Trampo.criar(AUTOR, entradaValida, relogio).resumo();
    expect(resumo).not.toHaveProperty('candidaturas');
    expect(resumo).not.toHaveProperty('versao');
    expect(resumo.status).toBe('aberto');
  });
});

/** Reconstitui o trampo como se lido do banco (base das alterações). */
function lido(trampo: Trampo): Trampo {
  return Trampo.reconstituir(trampo.dados());
}

function codigoDe(acao: () => unknown): string | undefined {
  try {
    acao();
  } catch (erro) {
    return (erro as { codigo?: string }).codigo;
  }
  return undefined;
}

describe('lerCamposDoTrampo', () => {
  it('devolve só os seis campos, aparados, e prazo ausente vira null', () => {
    expect(
      lerCamposDoTrampo({
        ...entradaValida,
        titulo: '  Pintar a sala ',
        versao: 3,
        autorId: 'outro',
      } as EntradaDeTrampo),
    ).toEqual({
      titulo: 'Pintar a sala',
      descricao: entradaValida.descricao,
      categoria: 'reformas',
      cidade: 'São Paulo',
      valorCentavos: 50000,
      prazo: null,
    });
  });

  it('aponta todos os campos inválidos num único erro, sem o valor', () => {
    expect(() =>
      lerCamposDoTrampo({ titulo: 'SEGREDO', valorCentavos: 0 }),
    ).toThrow(
      expect.objectContaining({
        campos: [
          { campo: 'descricao', motivo: 'obrigatorio' },
          { campo: 'categoria', motivo: 'obrigatorio' },
          { campo: 'cidade', motivo: 'obrigatorio' },
          { campo: 'valorCentavos', motivo: 'invalido' },
        ],
      }),
    );
  });
});

describe('Trampo.editar (CA25)', () => {
  const novaEntrada: EntradaDeTrampo = {
    titulo: 'Trocar o piso',
    descricao: 'Piso da COZINHA, 12 m².',
    categoria: 'reformas',
    cidade: 'Belo Horizonte',
    valorCentavos: 90000,
    prazo: '2026-12-01',
  };

  it('substitui os campos, recalcula a busca, sobe a versão e mantém id, autor e criadoEm', () => {
    const trampo = lido(Trampo.criar(AUTOR, entradaValida, relogio));
    const antes = trampo.dados();

    trampo.editar(AUTOR, 1, novaEntrada);

    expect(trampo.dados()).toEqual({
      ...antes,
      titulo: 'Trocar o piso',
      descricao: 'Piso da COZINHA, 12 m².',
      categoria: 'reformas',
      cidade: 'Belo Horizonte',
      cidadeNormalizada: 'belo horizonte',
      textoBusca: 'trocar o piso piso da cozinha, 12 m².',
      valorCentavos: 90000,
      prazo: '2026-12-01',
      versao: 2,
    });
  });

  it('prazo ausente ou null remove o prazo', () => {
    for (const prazo of [undefined, null]) {
      const trampo = lido(
        Trampo.criar(AUTOR, { ...entradaValida, prazo: '2026-12-31' }, relogio),
      );
      trampo.editar(AUTOR, 1, { ...novaEntrada, prazo });
      expect(trampo.dados().prazo).toBeNull();
    }
  });

  it('ordem: outra conta (404) antes da regra, regra antes da versão, versão antes dos campos', () => {
    const comCandidatura = lido(Trampo.criar(AUTOR, entradaValida, relogio));
    comCandidatura.candidatar('f1', candidatura(), relogio);
    const aberto = lido(Trampo.criar(AUTOR, entradaValida, relogio));

    expect(() => comCandidatura.editar('f1', 99, {})).toThrow(
      ErroNaoEncontrado,
    );
    expect(codigoDe(() => comCandidatura.editar(AUTOR, 99, {}))).toBe(
      'trampo_nao_editavel',
    );
    expect(codigoDe(() => aberto.editar(AUTOR, 2, {}))).toBe(
      'conflito_de_versao',
    );
    expect(() => aberto.editar(AUTOR, 1, {})).toThrow(ErroDeValidacao);
    expect(aberto.versao).toBe(1);
  });

  it('em andamento ou encerrado não é editável', () => {
    const emAndamento = Trampo.criar(AUTOR, entradaValida, relogio);
    const c = emAndamento.candidatar('f1', candidatura(), relogio);
    emAndamento.aceitar(c.id, AUTOR);
    const encerrado = Trampo.criar(AUTOR, entradaValida, relogio);
    encerrado.encerrar(AUTOR);

    for (const trampo of [emAndamento, encerrado]) {
      expect(
        codigoDe(() => trampo.editar(AUTOR, trampo.versao, novaEntrada)),
      ).toBe('trampo_nao_editavel');
    }
  });

  it('campos inválidos não mudam nada', () => {
    const trampo = lido(Trampo.criar(AUTOR, entradaValida, relogio));
    const antes = trampo.dados();
    expect(() =>
      trampo.editar(AUTOR, 1, { ...novaEntrada, titulo: 'abc' }),
    ).toThrow(ErroDeValidacao);
    expect(trampo.dados()).toEqual(antes);
  });
});

describe('Trampo.encerrar (CA27)', () => {
  it('aberto: recusa as pendentes, passa a encerrado, sobe a versão e devolve true', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    trampo.candidatar('f1', candidatura(), relogio);
    trampo.candidatar('f2', candidatura(), relogio);

    expect(trampo.encerrar(AUTOR)).toBe(true);

    expect(trampo.status).toBe('encerrado');
    expect(trampo.versao).toBe(4);
    expect(trampo.candidaturas.map((c) => c.status)).toEqual([
      'recusada',
      'recusada',
    ]);
  });

  it('em andamento: a aceita fica aceita', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const c1 = trampo.candidatar('f1', candidatura(), relogio);
    trampo.candidatar('f2', candidatura(), relogio);
    trampo.aceitar(c1.id, AUTOR);

    expect(trampo.encerrar(AUTOR)).toBe(true);
    expect(trampo.candidaturas.map((c) => c.status)).toEqual([
      'aceita',
      'recusada',
    ]);
  });

  it('já encerrado: devolve false e não muda nada (D34)', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    trampo.encerrar(AUTOR);
    const antes = trampo.dados();

    expect(trampo.encerrar(AUTOR)).toBe(false);
    expect(trampo.dados()).toEqual(antes);
  });

  it('quem não é o autor recebe ErroNaoEncontrado e nada muda', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    expect(() => trampo.encerrar('f1')).toThrow(ErroNaoEncontrado);
    expect(trampo.status).toBe('aberto');
  });

  it('encerrado recusa candidatura e aceite com trampo_nao_aberto', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const c = trampo.candidatar('f1', candidatura(), relogio);
    trampo.encerrar(AUTOR);

    expect(
      codigoDe(() => trampo.candidatar('f2', candidatura(), relogio)),
    ).toBe('trampo_nao_aberto');
    expect(codigoDe(() => trampo.aceitar(c.id, AUTOR))).toBe(
      'trampo_nao_aberto',
    );
  });
});

describe('Trampo.conferirExclusao (CA28)', () => {
  it('só o autor e só trampo aberto', () => {
    const aberto = Trampo.criar(AUTOR, entradaValida, relogio);
    aberto.candidatar('f1', candidatura(), relogio);
    expect(() => aberto.conferirExclusao(AUTOR)).not.toThrow();
    expect(() => aberto.conferirExclusao('f1')).toThrow(ErroNaoEncontrado);

    const encerrado = Trampo.criar(AUTOR, entradaValida, relogio);
    encerrado.encerrar(AUTOR);
    const emAndamento = Trampo.criar(AUTOR, entradaValida, relogio);
    emAndamento.aceitar(
      emAndamento.candidatar('f1', candidatura(), relogio).id,
      AUTOR,
    );
    for (const trampo of [encerrado, emAndamento]) {
      const versao = trampo.versao;
      expect(codigoDe(() => trampo.conferirExclusao(AUTOR))).toBe(
        'trampo_nao_aberto',
      );
      expect(trampo.versao).toBe(versao);
    }
  });
});

describe('Trampo.retirar (CA29)', () => {
  it('tira a candidatura pendente do próprio freelancer e sobe a versão', () => {
    const trampo = lido(Trampo.criar(AUTOR, entradaValida, relogio));
    const c1 = trampo.candidatar('f1', candidatura(), relogio);
    const c2 = trampo.candidatar('f2', candidatura(), relogio);
    const relido = lido(trampo);

    relido.retirar(c1.id, 'f1');

    expect(relido.candidaturas.map((c) => c.id)).toEqual([c2.id]);
    expect(relido.versao).toBe(4);
    // Retirada, pode se candidatar de novo.
    expect(() => relido.candidatar('f1', candidatura(), relogio)).not.toThrow();
  });

  it('de outra conta ou inexistente: ErroNaoEncontrado, antes do status', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const c1 = trampo.candidatar('f1', candidatura(), relogio);
    trampo.aceitar(c1.id, AUTOR);

    expect(() => trampo.retirar(c1.id, 'f2')).toThrow(ErroNaoEncontrado);
    expect(() => trampo.retirar(c1.id, AUTOR)).toThrow(ErroNaoEncontrado);
    expect(() => trampo.retirar('nao-existe', 'f1')).toThrow(ErroNaoEncontrado);
  });

  it('aceita ou recusada: candidatura_nao_pendente e nada muda', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const c1 = trampo.candidatar('f1', candidatura(), relogio);
    const c2 = trampo.candidatar('f2', candidatura(), relogio);
    trampo.aceitar(c1.id, AUTOR);
    const antes = trampo.dados();

    expect(codigoDe(() => trampo.retirar(c1.id, 'f1'))).toBe(
      'candidatura_nao_pendente',
    );
    expect(codigoDe(() => trampo.retirar(c2.id, 'f2'))).toBe(
      'candidatura_nao_pendente',
    );
    expect(trampo.dados()).toEqual(antes);
  });
});

describe('alteracoesDasCandidaturas (ADR-006)', () => {
  it('recém-lido: nada inserido nem removido, mesmo depois de mudar status', () => {
    const base = Trampo.criar(AUTOR, entradaValida, relogio);
    const c1 = base.candidatar('f1', candidatura(), relogio);
    base.candidatar('f2', candidatura(), relogio);
    const trampo = lido(base);

    expect(trampo.alteracoesDasCandidaturas()).toEqual({
      inseridas: [],
      removidas: [],
    });
    trampo.aceitar(c1.id, AUTOR);
    expect(trampo.alteracoesDasCandidaturas()).toEqual({
      inseridas: [],
      removidas: [],
    });
  });

  it('candidatar insere só a nova; retirar remove só a retirada', () => {
    const base = Trampo.criar(AUTOR, entradaValida, relogio);
    const c1 = base.candidatar('f1', candidatura(), relogio);
    const trampo = lido(base);

    const nova = trampo.candidatar('f2', candidatura(), relogio);
    expect(trampo.alteracoesDasCandidaturas()).toEqual({
      inseridas: [nova],
      removidas: [],
    });

    const outra = lido(base);
    outra.retirar(c1.id, 'f1');
    expect(outra.alteracoesDasCandidaturas()).toEqual({
      inseridas: [],
      removidas: [c1.id],
    });
  });

  it('trampo novo: as candidaturas criadas antes da primeira gravação são inseridas', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const c1 = trampo.candidatar('f1', candidatura(), relogio);
    expect(trampo.alteracoesDasCandidaturas()).toEqual({
      inseridas: [c1],
      removidas: [],
    });
  });
});

describe('resumoDoAutor (D33)', () => {
  it('traz a versão e a contagem de candidaturas em qualquer estado', () => {
    const trampo = Trampo.criar(AUTOR, entradaValida, relogio);
    const c1 = trampo.candidatar('f1', candidatura(), relogio);
    trampo.candidatar('f2', candidatura(), relogio);
    trampo.aceitar(c1.id, AUTOR);

    expect(trampo.resumoDoAutor()).toEqual({
      ...trampo.resumo(),
      versao: 4,
      candidaturasRecebidas: 2,
    });
  });
});
