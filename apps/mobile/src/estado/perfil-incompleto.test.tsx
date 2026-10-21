import { act, renderHook } from '@testing-library/react-native';
import type { MeuPerfil } from '../api/tipos';
import {
  assinaturaDoPerfil,
  avisoDePerfil,
  CAMPOS_DO_PERFIL_NOVO,
  faltaNoPerfil,
  type SituacaoDoMeuPerfil,
  useAvisoDePerfil,
} from './perfil-incompleto';

const PERFIL: MeuPerfil = {
  nome: 'Maria Souza',
  cidade: 'Lavras',
  descricao: null,
  habilidades: ['pintura'],
  completo: true,
};

const CARREGANDO: SituacaoDoMeuPerfil = { perfil: null, semPerfil: false };
const SEM_PERFIL: SituacaoDoMeuPerfil = { perfil: null, semPerfil: true };
const SALVO: SituacaoDoMeuPerfil = { perfil: PERFIL, semPerfil: false };

describe('faltaNoPerfil (D9)', () => {
  it('sem perfil (404) faltam todos os campos', () => {
    expect(faltaNoPerfil(SEM_PERFIL)).toBe(CAMPOS_DO_PERFIL_NOVO);
  });

  it('com perfil salvo ou ainda carregando, não inventa a lista', () => {
    expect(faltaNoPerfil(SALVO)).toEqual([]);
    expect(faltaNoPerfil(CARREGANDO)).toEqual([]);
  });
});

describe('assinaturaDoPerfil', () => {
  it('é igual para o mesmo conteúdo em outro objeto', () => {
    expect(
      assinaturaDoPerfil({
        perfil: { ...PERFIL, habilidades: ['pintura'] },
        semPerfil: false,
      }),
    ).toBe(assinaturaDoPerfil(SALVO));
  });

  it('muda quando um campo muda', () => {
    const base = assinaturaDoPerfil(SALVO);
    for (const mudanca of [
      { nome: 'Maria S.' },
      { cidade: 'Perdões' },
      { descricao: 'Pinto casas' },
      { habilidades: ['pintura', 'reboco'] },
      { completo: false },
    ]) {
      expect(
        assinaturaDoPerfil({
          perfil: { ...PERFIL, ...mudanca },
          semPerfil: false,
        }),
      ).not.toBe(base);
    }
  });

  it('é null sem resposta e diferente de qualquer perfil sem perfil (404)', () => {
    expect(assinaturaDoPerfil(CARREGANDO)).toBeNull();
    expect(assinaturaDoPerfil(SEM_PERFIL)).not.toBeNull();
    expect(assinaturaDoPerfil(SEM_PERFIL)).not.toBe(assinaturaDoPerfil(SALVO));
  });
});

describe('avisoDePerfil', () => {
  it('sem perfil (404): aviso com todos os campos, com ou sem recusa', () => {
    expect(avisoDePerfil(SEM_PERFIL, null)).toEqual({
      falta: CAMPOS_DO_PERFIL_NOVO,
    });
  });

  it('sem recusa e com perfil: sem aviso', () => {
    expect(avisoDePerfil(SALVO, null)).toBeNull();
    expect(avisoDePerfil(CARREGANDO, null)).toBeNull();
  });

  it('recusado com o perfil salvo: aviso sem a lista enquanto o perfil é o mesmo', () => {
    const recusa = { assinatura: assinaturaDoPerfil(SALVO) };
    expect(avisoDePerfil(SALVO, recusa)).toEqual({ falta: [] });
    expect(
      avisoDePerfil({ perfil: { ...PERFIL }, semPerfil: false }, recusa),
    ).toEqual({ falta: [] });
  });

  it('o aviso some quando o perfil muda de verdade', () => {
    const recusa = { assinatura: assinaturaDoPerfil(SALVO) };
    expect(
      avisoDePerfil(
        { perfil: { ...PERFIL, cidade: 'Perdões' }, semPerfil: false },
        recusa,
      ),
    ).toBeNull();
  });

  it('recusado antes de o perfil chegar: o aviso continua', () => {
    const recusa = { assinatura: null };
    expect(avisoDePerfil(CARREGANDO, recusa)).toEqual({ falta: [] });
    expect(avisoDePerfil(SALVO, recusa)).toEqual({ falta: [] });
  });
});

describe('useAvisoDePerfil', () => {
  async function montar(inicial: SituacaoDoMeuPerfil) {
    return renderHook(
      ({ situacao }: { situacao: SituacaoDoMeuPerfil }) =>
        useAvisoDePerfil(situacao),
      { initialProps: { situacao: inicial } },
    );
  }

  it('a recusa com o perfil carregado fica até o perfil mudar', async () => {
    const { result, rerender } = await montar(SALVO);
    expect(result.current.perfilIncompleto).toBeNull();

    await act(async () => result.current.recusar());
    expect(result.current.perfilIncompleto).toEqual({ falta: [] });

    // Mesma resposta de novo (outra referência): o aviso fica.
    await rerender({ situacao: { perfil: { ...PERFIL }, semPerfil: false } });
    expect(result.current.perfilIncompleto).toEqual({ falta: [] });

    await rerender({
      situacao: { perfil: { ...PERFIL, nome: 'Maria S.' }, semPerfil: false },
    });
    expect(result.current.perfilIncompleto).toBeNull();
  });

  it('o perfil que só termina de carregar depois do 409 não apaga o aviso', async () => {
    const { result, rerender } = await montar(CARREGANDO);

    await act(async () => result.current.recusar());
    expect(result.current.perfilIncompleto).toEqual({ falta: [] });

    await rerender({ situacao: SALVO });
    expect(result.current.perfilIncompleto).toEqual({ falta: [] });

    // Só a mudança depois disso apaga.
    await rerender({
      situacao: { perfil: { ...PERFIL, cidade: 'Perdões' }, semPerfil: false },
    });
    expect(result.current.perfilIncompleto).toBeNull();
  });

  it('recusado sem perfil (404): salvar o perfil apaga o aviso', async () => {
    const { result, rerender } = await montar(SEM_PERFIL);
    await act(async () => result.current.recusar());
    expect(result.current.perfilIncompleto).toEqual({
      falta: CAMPOS_DO_PERFIL_NOVO,
    });

    await rerender({ situacao: SALVO });
    expect(result.current.perfilIncompleto).toBeNull();
  });

  it('esquecer apaga a recusa', async () => {
    const { result } = await montar(SALVO);
    await act(async () => result.current.recusar());
    await act(async () => result.current.esquecer());
    expect(result.current.perfilIncompleto).toBeNull();
  });
});
