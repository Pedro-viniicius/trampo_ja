import { describe, expect, it } from 'vitest';
import type { ContagemDeAvaliacoes } from './portas.js';
import { mediaComUmaCasa, resumirAvaliacoes } from './resumo.js';

describe('mediaComUmaCasa', () => {
  it.each([
    [0, 0, null],
    [5, 1, 5],
    [9, 2, 4.5],
    [17, 4, 4.3], // 4,25 sobe
    [13, 3, 4.3], // 4,333…
    [14, 3, 4.7], // 4,666…
    [1, 3, 0.3],
    [7, 20, 0.4], // 0,35 sobe
  ])('soma %i em %i → %s', (soma, total, esperado) => {
    expect(mediaComUmaCasa(soma, total)).toBe(esperado);
  });
});

describe('resumirAvaliacoes', () => {
  const contagens: ContagemDeAvaliacoes[] = [
    {
      contaId: 'a',
      papel: 'freela',
      total: 4,
      somaDasNotas: 17,
      destaques: [
        { codigo: 'rapido', quantidade: 1 },
        { codigo: 'educado', quantidade: 3 },
        { codigo: 'pontual', quantidade: 2 },
        { codigo: 'organizado', quantidade: 2 },
        // Código de outro papel e contagem zero não entram.
        { codigo: 'pagamento_em_dia', quantidade: 9 },
        { codigo: 'proativo', quantidade: 0 },
      ],
    },
    {
      contaId: 'a',
      papel: 'contratante',
      total: 1,
      somaDasNotas: 2,
      destaques: [],
    },
    // Conta que não foi pedida é ignorada.
    { contaId: 'z', papel: 'freela', total: 1, somaDasNotas: 5, destaques: [] },
  ];

  it('um resumo por conta pedida, na ordem pedida, por papel', () => {
    expect(resumirAvaliacoes(['b', 'a'], contagens)).toEqual([
      {
        contaId: 'b',
        comoFreela: { media: null, total: 0, destaques: [] },
        comoContratante: { media: null, total: 0, destaques: [] },
      },
      {
        contaId: 'a',
        // No empate (pontual e organizado, 2 cada), vale a ordem da lista.
        comoFreela: {
          media: 4.3,
          total: 4,
          destaques: ['educado', 'pontual', 'organizado'],
        },
        comoContratante: { media: 2, total: 1, destaques: [] },
      },
    ]);
  });
});
