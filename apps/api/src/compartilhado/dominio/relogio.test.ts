import { describe, expect, it } from 'vitest';
import { RelogioFixo, relogioDoSistema } from './relogio.js';

describe('relogioDoSistema', () => {
  it('devolve a hora atual', () => {
    const antes = Date.now();
    const agora = relogioDoSistema.agora().getTime();
    expect(agora).toBeGreaterThanOrEqual(antes);
    expect(agora).toBeLessThanOrEqual(Date.now());
  });
});

describe('RelogioFixo', () => {
  it('devolve sempre o instante fixado', () => {
    const relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
    expect(relogio.agora().toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(relogio.agora().toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('não deixa quem recebe a data mudar o relógio', () => {
    const relogio = new RelogioFixo(new Date('2026-10-20T12:00:00.000Z'));
    relogio.agora().setUTCFullYear(2000);
    expect(relogio.agora().toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('avança em milissegundos', () => {
    const relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
    relogio.avancar(30 * 24 * 60 * 60 * 1000);
    expect(relogio.agora().toISOString()).toBe('2026-11-19T12:00:00.000Z');
  });

  it('recusa instante inválido', () => {
    expect(() => new RelogioFixo('ontem')).toThrow(TypeError);
  });
});
