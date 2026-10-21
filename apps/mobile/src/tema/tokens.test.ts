import { cores } from './tokens';

function canal(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255)
  );
}

function contraste(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((maior ?? 0) + 0.05) / ((menor ?? 0) + 0.05);
}

describe('contraste dos tokens (WCAG AA)', () => {
  const texto: [string, string, string][] = [
    ['texto/fundo', cores.texto, cores.fundo],
    ['texto/superficie', cores.texto, cores.superficie],
    ['textoSecundario/fundo', cores.textoSecundario, cores.fundo],
    ['textoSecundario/superficie', cores.textoSecundario, cores.superficie],
    ['branco/primaria (botão)', cores.branco, cores.primaria],
    ['branco/primariaPressionada', cores.branco, cores.primariaPressionada],
    ['branco/acento', cores.branco, cores.acento],
    ['primaria/fundo (link)', cores.primaria, cores.fundo],
    ['primaria/superficie', cores.primaria, cores.superficie],
    ['erro/fundo', cores.erro, cores.fundo],
    ['sucesso/fundo', cores.sucesso, cores.fundo],
  ];
  it.each(texto)('%s >= 4,5:1', (_nome, a, b) => {
    expect(contraste(a, b)).toBeGreaterThanOrEqual(4.5);
  });

  const componentes: [string, string, string][] = [
    ['borda/fundo', cores.borda, cores.fundo],
    ['foco/fundo', cores.foco, cores.fundo],
    ['foco/superficie', cores.foco, cores.superficie],
  ];
  it.each(componentes)('%s >= 3:1', (_nome, a, b) => {
    expect(contraste(a, b)).toBeGreaterThanOrEqual(3);
  });

  it('cores do dono ficam como no protótipo e o gradiente usa as duas', () => {
    expect(cores.marcaAzul).toBe('#1A7FF6');
    expect(cores.marcaRoxo).toBe('#AF6FF1');
    expect(cores.gradiente).toEqual(['#1A7FF6', '#AF6FF1']);
  });

  it('branco sobre o gradiente passa 3:1 (só texto grande)', () => {
    for (const c of cores.gradiente) {
      expect(contraste(cores.branco, c)).toBeGreaterThanOrEqual(3);
    }
  });
});
