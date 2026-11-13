import { FONTES } from './fontes';

describe('FONTES (ADR-009)', () => {
  it('traz só os pesos da spec: Bricolage 600, 700 e 800; Figtree 400, 500, 600 e 700', () => {
    expect(Object.keys(FONTES).sort()).toEqual([
      'BricolageGrotesque_600SemiBold',
      'BricolageGrotesque_700Bold',
      'BricolageGrotesque_800ExtraBold',
      'Figtree_400Regular',
      'Figtree_500Medium',
      'Figtree_600SemiBold',
      'Figtree_700Bold',
    ]);
  });

  it('todo nome aponta para um arquivo de fonte (asset definido)', () => {
    for (const [nome, asset] of Object.entries(FONTES)) {
      expect([nome, asset !== undefined && asset !== null]).toEqual([
        nome,
        true,
      ]);
    }
  });
});
