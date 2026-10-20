import { describe, expect, it } from 'vitest';
import { ErroDeRegra } from '../../../compartilhado/dominio/erros.js';
import { Conversa } from './conversa.js';

const CONTEXTO = {
  id: 'conversa-1',
  agora: new Date('2026-10-20T12:00:00.000Z'),
};

function erroDe(acao: () => unknown): unknown {
  try {
    acao();
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava um erro');
}

describe('Conversa.criar', () => {
  it('guarda o par em ordem, seja qual for a ordem informada', () => {
    const ab = Conversa.criar('conta-a', 'conta-b', CONTEXTO);
    const ba = Conversa.criar('conta-b', 'conta-a', CONTEXTO);

    for (const conversa of [ab, ba]) {
      expect(conversa.dados()).toEqual({
        id: 'conversa-1',
        usuarioAId: 'conta-a',
        usuarioBId: 'conta-b',
        criadaEm: CONTEXTO.agora,
      });
    }
  });

  it('ordena por comparação de texto (uuid minúsculo segue a ordem do banco)', () => {
    const conversa = Conversa.criar(
      'f0000000-0000-4000-8000-000000000000',
      '10000000-0000-4000-8000-000000000000',
      CONTEXTO,
    );

    expect(conversa.usuarioAId).toBe('10000000-0000-4000-8000-000000000000');
    expect(conversa.usuarioBId).toBe('f0000000-0000-4000-8000-000000000000');
  });

  it('recusa conversa consigo mesmo com conversa_consigo_mesmo', () => {
    const erro = erroDe(() => Conversa.criar('conta-a', 'conta-a', CONTEXTO));

    expect(erro).toBeInstanceOf(ErroDeRegra);
    expect((erro as ErroDeRegra).codigo).toBe('conversa_consigo_mesmo');
    expect((erro as Error).message).not.toContain('conta-a');
  });

  it('não compartilha a data do contexto nem a devolvida', () => {
    const conversa = Conversa.criar('conta-a', 'conta-b', CONTEXTO);
    conversa.criadaEm.setFullYear(2000);
    conversa.dados().criadaEm.setFullYear(2000);

    expect(conversa.criadaEm).toEqual(CONTEXTO.agora);
    expect(conversa.criadaEm).not.toBe(CONTEXTO.agora);
  });
});

describe('Conversa — participantes', () => {
  const conversa = Conversa.criar('conta-b', 'conta-a', CONTEXTO);

  it('participa: verdadeiro só para os dois do par', () => {
    expect(conversa.participa('conta-a')).toBe(true);
    expect(conversa.participa('conta-b')).toBe(true);
    expect(conversa.participa('conta-c')).toBe(false);
    expect(conversa.participa('')).toBe(false);
  });

  it('outroParticipante devolve o outro lado, ou null para quem não participa', () => {
    expect(conversa.outroParticipante('conta-a')).toBe('conta-b');
    expect(conversa.outroParticipante('conta-b')).toBe('conta-a');
    expect(conversa.outroParticipante('conta-c')).toBeNull();
  });
});

describe('Conversa.reconstituir', () => {
  it('devolve a mesma conversa que foi guardada', () => {
    const original = Conversa.criar('conta-a', 'conta-b', CONTEXTO);
    const lida = Conversa.reconstituir(original.dados());

    expect(lida.dados()).toEqual(original.dados());
  });
});

describe('Conversa.ordenarPar', () => {
  it('menor primeiro e recusa o mesmo id dos dois lados', () => {
    expect(Conversa.ordenarPar('b', 'a')).toEqual(['a', 'b']);
    expect(Conversa.ordenarPar('a', 'b')).toEqual(['a', 'b']);
    expect(erroDe(() => Conversa.ordenarPar('a', 'a'))).toBeInstanceOf(
      ErroDeRegra,
    );
  });
});
