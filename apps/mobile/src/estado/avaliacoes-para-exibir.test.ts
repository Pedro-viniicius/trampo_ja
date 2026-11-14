import { ErroDaApi, ErroDeRede } from '../api/erros';
import type { ResumoDeAvaliacoes } from '../api/tipos';
import { textos } from '../textos/pt-BR';
import {
  notaDada,
  notaDoResumo,
  papelDaUrl,
  textoDoErroDoFavorito,
} from './avaliacoes-para-exibir';

const RESUMO: ResumoDeAvaliacoes = {
  contaId: 'c1',
  comoFreela: { media: 4.5, total: 8, destaques: ['pontual'] },
  comoContratante: { media: null, total: 0, destaques: [] },
};

describe('notaDoResumo', () => {
  it('devolve a média e o total do papel pedido', () => {
    expect(notaDoResumo(RESUMO, 'freela')).toEqual({ media: 4.5, total: 8 });
  });

  it('papel sem avaliações não tem nota', () => {
    expect(notaDoResumo(RESUMO, 'contratante')).toBeNull();
  });

  it('sem resumo não tem nota', () => {
    expect(notaDoResumo(undefined, 'freela')).toBeNull();
  });
});

describe('papelDaUrl', () => {
  it('só "contratante" vale contratante', () => {
    expect(papelDaUrl('contratante')).toBe('contratante');
    expect(papelDaUrl('freela')).toBe('freela');
  });

  it.each([[undefined], [''], ['outro'], [['contratante', 'freela']]])(
    'ausente, repetido ou desconhecido (%j) vale freela',
    (valor) => {
      expect(papelDaUrl(valor)).toBe('freela');
    },
  );
});

describe('textoDoErroDoFavorito', () => {
  it.each([
    [
      new ErroDaApi(409, 'limite_de_favoritos'),
      textos.erros.limite_de_favoritos,
    ],
    [new ErroDaApi(409, 'favorito_invalido'), textos.erros.favorito_invalido],
    [new ErroDeRede('falha'), textos.erros.sem_conexao],
    [new ErroDaApi(429, 'limite'), textos.erros.muitas_tentativas_acao],
    [new ErroDaApi(404, 'nao_encontrado'), textos.favoritos.semVinculo],
  ])('erro com texto próprio (%#)', (erro, texto) => {
    expect(textoDoErroDoFavorito(erro)).toBe(texto);
  });

  it.each([[new ErroDaApi(500, 'erro')], [new Error('detalhe da requisição')]])(
    'o resto vira o texto geral (%#)',
    (erro) => {
      expect(textoDoErroDoFavorito(erro)).toBe(textos.favoritos.erro);
    },
  );
});

describe('notaDada', () => {
  const FEITA = { trampoId: 't1', nota: 4, criadaEm: '2026-11-01T10:00:00Z' };

  it('trampo que não dá para avaliar não mostra nada', () => {
    expect(notaDada(false, undefined, true)).toBeUndefined();
    expect(notaDada(false, FEITA, true)).toBeUndefined();
  });

  it('avaliável e já avaliado: a nota dada, mesmo com a consulta incompleta', () => {
    expect(notaDada(true, FEITA, true)).toBe(4);
    expect(notaDada(true, FEITA, false)).toBe(4);
  });

  it('avaliável e sem avaliação: pode avaliar só quando a consulta cobre a lista', () => {
    expect(notaDada(true, undefined, true)).toBeNull();
    expect(notaDada(true, undefined, false)).toBeUndefined();
  });
});
